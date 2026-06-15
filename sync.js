// =============================================================
//  sync.js — 雲端同步（Firestore），支援多班
//  學生用「專屬碼」加入 → 碼搜勻所有班嘅名單 → claim + 記低 classId。
// =============================================================

const Sync = {
  studentId: localStorage.getItem("duosbc_sid") || null,
  studentName: localStorage.getItem("duosbc_name") || null,
  classId: localStorage.getItem("duosbc_class") || null,
  _t: null,

  hasIdentity() { return !!this.studentId; },
  isOnline() { return !!window.db; },
  genId() { return "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); },

  async joinByCode(code) {
    code = String(code || "").trim().toLowerCase();
    if (!window.db) return { error: "需要網絡先可以第一次加入，請接駁網絡再試" };
    try {
      const mainSnap = await window.db.collection("app").doc("main").get();
      const main = mainSnap.exists ? mainSnap.data() : null;
      if (!main || !Array.isArray(main.classes) || !main.classes.length) return { error: "老師仲未設定班別，請通知老師" };
      let foundClass = null, foundEntry = null;
      for (const c of main.classes) {
        const cs = await window.db.collection("classes").doc(c.id).get();
        const cd = cs.exists ? cs.data() : null;
        if (!cd) continue;
        const entry = (cd.roster || []).find((r) => String(r.code || "").toLowerCase() === code);
        if (entry) { foundClass = { id: c.id, name: c.name, level: c.level, doc: cd }; foundEntry = entry; break; }
      }
      if (!foundEntry) return { error: "碼唔啳，問老師拎返你嘅專屬碼" };
      let sid = foundEntry.studentId || null;
      if (!sid) {
        sid = this.genId();
        foundEntry.studentId = sid;
        await window.db.collection("classes").doc(foundClass.id).set({ roster: foundClass.doc.roster }, { merge: true });
        const local = DuoStorage.loadState();
        await window.db.collection("students").doc(sid).set({
          name: foundEntry.name, classId: foundClass.id, className: foundClass.name, rosterId: foundEntry.id,
          createdAt: new Date().toISOString(), lastActive: new Date().toISOString(),
          streak: (local.meta && local.meta.streak) || 0, learnedCount: Object.keys(local.cards || {}).length,
          cards: local.cards || {}, todayPlan: local.todayPlan || null, meta: local.meta || {}, history: local.history || {},
        });
      }
      this.studentId = sid;
      this.studentName = foundEntry.name;
      this.classId = foundClass.id;
      localStorage.setItem("duosbc_sid", sid);
      localStorage.setItem("duosbc_name", foundEntry.name);
      localStorage.setItem("duosbc_class", foundClass.id);
      return { ok: true, name: foundEntry.name, classId: foundClass.id, className: foundClass.name };
    } catch (e) {
      return { error: "連線失敗，請再試一次" };
    }
  },

  async loadCloud() {
    if (!this.studentId || !window.db) return null;
    try {
      const snap = await window.db.collection("students").doc(this.studentId).get();
      return snap.exists ? snap.data() : null;
    } catch (e) { return null; }
  },

  async loadClass(classId) {
    if (!classId || !window.db) return null;
    try {
      const snap = await window.db.collection("classes").doc(classId).get();
      return snap.exists ? snap.data() : null;
    } catch (e) { return null; }
  },

  saveCloud(state) {
    if (!this.studentId || !window.db) return;
    if (this._t) clearTimeout(this._t);
    this._t = setTimeout(() => {
      const data = {
        name: this.studentName, classId: this.classId,
        lastActive: new Date().toISOString(),
        streak: (state.meta && state.meta.streak) || 0,
        learnedCount: Object.keys(state.cards || {}).length,
        cards: state.cards || {}, todayPlan: state.todayPlan || null,
        meta: state.meta || {}, history: state.history || {},
      };
      try { window.db.collection("students").doc(this.studentId).set(data, { merge: true }).catch(() => {}); }
      catch (e) {}
    }, 800);
  },

  signOut() {
    ["duosbc_sid", "duosbc_name", "duosbc_class"].forEach((k) => localStorage.removeItem(k));
    this.studentId = this.studentName = this.classId = null;
  },
};

if (typeof window !== "undefined") window.Sync = Sync;
