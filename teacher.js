// =============================================================
//  teacher.js — 老師後台（多班：初中 / 高中）
//  設定 → 入密碼 → 揀班 → 總覽 / 管理名單 / 字表(高中)
// =============================================================

const tapp = document.getElementById("tapp");
let MAIN = null;       // app/main {password, classes:[{id,name,level}]}
let CLASS_DOC = null;  // classes/{curId} {name,level,roster,words}
let curId = null;
let unsubscribe = null;
let tab = "overview";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtMs(ms) { ms = ms || 0; const s = Math.round(ms / 1000); if (s < 60) return s + "s"; return Math.round(s / 60) + "m"; }
function relTime(iso) {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "啱啱"; if (m < 60) return m + " 分鐘前";
  const h = Math.round(m / 60); if (h < 24) return h + " 小時前";
  return Math.round(h / 24) + " 日前";
}
function autoCode() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)]; return s;
}
function dateStr(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function lastNDays(n) { const out = []; const t = new Date(); for (let i = n - 1; i >= 0; i--) { const d = new Date(t); d.setDate(d.getDate() - i); out.push(dateStr(d)); } return out; }
function monthCells(y, m) { const first = new Date(y, m, 1); const dim = new Date(y, m + 1, 0).getDate(); const lead = (first.getDay() + 6) % 7; const cells = []; for (let i = 0; i < lead; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(dateStr(new Date(y, m, d))); while (cells.length % 7 !== 0) cells.push(null); return cells; }
function statsOf(cards) { let att = 0, cor = 0; for (const id in cards) { att += cards[id].attempts || 0; cor += cards[id].correct || 0; } return { att, cor, acc: att ? Math.round((cor / att) * 100) + "%" : "—" }; }
function totalTime(history, key) { let t = 0; for (const d in history) t += (history[d][key] || 0); return t; }
function wrongList(cards) { const out = []; for (const id in cards) { const c = cards[id]; const w = (c.attempts || 0) - (c.correct || 0); if (w > 0) out.push({ id, wrong: w, attempts: c.attempts || 0 }); } out.sort((a, b) => b.wrong - a.wrong); return out; }

async function run() {
  if (!window.db) { tapp.innerHTML = `<div class="tbox"><div class="join-emoji">📡</div><p>連唔到 Firebase，請檢查網絡再開。</p></div>`; return; }
  try { const snap = await window.db.collection("app").doc("main").get(); MAIN = snap.exists ? snap.data() : null; } catch (e) { MAIN = null; }
  // 舊單班格式 → 自動遷移成多班（舊名單搬去初中）
  if (MAIN && !Array.isArray(MAIN.classes)) {
    try {
      const oldRoster = MAIN.roster || [];
      MAIN = { password: MAIN.password, createdAt: MAIN.createdAt || new Date().toISOString(), classes: [{ id: "c_junior", name: "初中", level: "junior" }, { id: "c_senior", name: "高中", level: "senior" }] };
      await window.db.collection("app").doc("main").set(MAIN);
      await window.db.collection("classes").doc("c_junior").set({ name: "初中", level: "junior", roster: oldRoster, words: [] });
      await window.db.collection("classes").doc("c_senior").set({ name: "高中", level: "senior", roster: [], words: [] });
    } catch (e) {}
  }
  if (!MAIN) setupForm(); else login();
}

function setupForm() {
  tapp.innerHTML = `
    <div class="tbox">
      <div class="join-emoji">🧑‍🏫</div>
      <div class="join-title">初次設定</div>
      <div class="join-sub">設定後台密碼。系統會自動開好「初中」同「高中」兩個班。</div>
      <input type="password" id="su-pw" placeholder="後台密碼" autocomplete="off" />
      <button class="btn btn-primary" id="su-btn" style="width:100%;margin-top:8px">建立</button>
      <div class="terr" id="su-err"></div>
    </div>`;
  document.getElementById("su-btn").onclick = async () => {
    const pw = document.getElementById("su-pw").value.trim();
    if (!pw) { document.getElementById("su-err").textContent = "要設密碼"; return; }
    try {
      MAIN = { password: pw, createdAt: new Date().toISOString(), classes: [
        { id: "c_junior", name: "初中", level: "junior" },
        { id: "c_senior", name: "高中", level: "senior" },
      ] };
      await window.db.collection("app").doc("main").set(MAIN);
      await window.db.collection("classes").doc("c_junior").set({ name: "初中", level: "junior", roster: [], words: [] });
      await window.db.collection("classes").doc("c_senior").set({ name: "高中", level: "senior", roster: [], words: [] });
      mainView();
    } catch (e) { document.getElementById("su-err").textContent = "儲存失敗，可能未連線。"; }
  };
}

function login() {
  tapp.innerHTML = `
    <div class="tbox">
      <div class="join-emoji">🔒</div>
      <div class="join-title">老師後台</div>
      <div class="join-sub">初中 + 高中</div>
      <input type="password" id="li-pw" placeholder="後台密碼" autocomplete="off" />
      <button class="btn btn-primary" id="li-btn" style="width:100%;margin-top:8px">進入</button>
      <div class="terr" id="li-err"></div>
    </div>`;
  document.getElementById("li-btn").onclick = () => {
    if (document.getElementById("li-pw").value === MAIN.password) mainView();
    else document.getElementById("li-err").textContent = "密碼錯";
  };
}

function mainView() {
  if (unsubscribe) { try { unsubscribe(); } catch (e) {} unsubscribe = null; }
  curId = MAIN.classes[0].id;
  tapp.innerHTML = `
    <h1>📊 老師後台</h1>
    <div class="ctabs" id="class-tabs">${MAIN.classes.map((c) => `<button class="ctab" data-cid="${c.id}">${esc(c.name)}</button>`).join("")}</div>
    <div class="ttabs">
      <button class="ttab active" data-tab="overview">📊 總覽</button>
      <button class="ttab" data-tab="roster">📝 管理名單</button>
      <button class="ttab" data-tab="words" id="tab-words">📖 字表</button>
    </div>
    <div id="t-content"></div>`;
  tapp.querySelectorAll(".ctab").forEach((b) => b.onclick = () => selectClass(b.dataset.cid));
  tapp.querySelectorAll(".ttab").forEach((b) => b.onclick = () => { tab = b.dataset.tab; syncTTabs(); renderTab(); });
  selectClass(curId);
}
function syncTTabs() {
  tapp.querySelectorAll(".ttab").forEach((x) => x.classList.toggle("active", x.dataset.tab === tab));
  const cls = MAIN.classes.find((c) => c.id === curId);
  const tw = document.getElementById("tab-words"); if (tw) tw.style.display = (cls && cls.level === "senior") ? "" : "none";
  if (tab === "words" && (!cls || cls.level !== "senior")) { tab = "overview"; }
  tapp.querySelectorAll(".ttab").forEach((x) => x.classList.toggle("active", x.dataset.tab === tab));
}

async function selectClass(cid) {
  curId = cid;
  tapp.querySelectorAll(".ctab").forEach((b) => b.classList.toggle("active", b.dataset.cid === cid));
  try { const s = await window.db.collection("classes").doc(cid).get(); CLASS_DOC = s.exists ? s.data() : { roster: [], words: [] }; }
  catch (e) { CLASS_DOC = { roster: [], words: [] }; }
  syncTTabs();
  renderTab();
}
function renderTab() { if (tab === "overview") renderOverview(); else if (tab === "roster") renderRoster(); else renderWords(); }

// ---------- 總覽（篩選當前班） ----------
function renderOverview() {
  const c = document.getElementById("t-content");
  c.innerHTML = `<div id="t-table">載入中…</div>`;
  if (unsubscribe) { try { unsubscribe(); } catch (e) {} }
  unsubscribe = window.db.collection("students").where("classId", "==", curId)
    .onSnapshot((snap) => {
      const students = []; snap.forEach((d) => students.push(d.data()));
      students.sort((a, b) => (b.learnedCount || 0) - (a.learnedCount || 0));
      drawTable(students);
    }, () => { document.getElementById("t-table").innerHTML = "<p>讀取失敗，檢查網絡。</p>"; });
}

function drawTable(students) {
  const el = document.getElementById("t-table");
  if (!students.length) { el.innerHTML = `<p>呢個班未有學生。去「管理名單」加學生，學生用專屬碼加入就會出現。</p>`; return; }
  const rows = students.map((s, i) => {
    const cards = s.cards || {};
    const st = statsOf(cards);
    const wk = lastNDays(7).map((d) => { const h = (s.history || {})[d]; return h ? (h.completed ? "✓" : "△") : "·"; }).join("");
    const wrongN = wrongList(cards).length;
    return `<tr>
      <td class="name">${esc(s.name)}<br><small style="font-weight:400;color:var(--muted)">${relTime(s.lastActive)}</small></td>
      <td>🔥${s.streak || 0}</td><td>${fmtMs(totalTime(s.history, "learnMs"))}</td><td>${fmtMs(totalTime(s.history, "reviewMs"))}</td>
      <td>${st.acc}</td><td class="cal7">${wk}</td>
      <td class="rowbtn"><button class="ttiny" data-w="${i}" title="錯字簿">📖</button> <button class="ttiny" data-c="${i}" title="日曆">📅</button></td>
    </tr>`;
  }).join("");
  el.innerHTML = `<div class="tscroll"><table class="ttable">
    <thead><tr><th>名字</th><th>🔥</th><th>學習</th><th>複習</th><th>正確率</th><th>近7日</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="thint">共 ${students.length} 個學生 · 實時更新（✓完成 △做過 ·冇做）</div></div>`;
  el.querySelectorAll("[data-w]").forEach((b) => b.onclick = () => openWrongWords(students[Number(b.dataset.w)]));
  el.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => openCalendar(students[Number(b.dataset.c)]));
}

// ---------- 日曆（月份分頁） ----------
function openCalendar(s) {
  const todayStr = dateStr(new Date());
  const st = { y: new Date().getFullYear(), m: new Date().getMonth() };
  const overlay = document.createElement("div"); overlay.id = "cal-modal"; document.body.appendChild(overlay);
  const close = () => overlay.remove();
  function render() {
    const cells = monthCells(st.y, st.m);
    let mL = 0, mR = 0, mD = 0;
    const grid = cells.map((c) => {
      if (!c) return `<div class="cal-cell blank"></div>`;
      const h = (s.history || {})[c];
      let mark = "·", cls = "absent";
      if (c > todayStr) { mark = ""; cls = "future"; }
      else if (h) { mark = h.completed ? "✓" : "△"; cls = h.completed ? "done" : "partial"; mL += h.learnMs || 0; mR += h.reviewMs || 0; if (h.completed) mD++; }
      const t = h ? fmtMs((h.learnMs || 0) + (h.reviewMs || 0)) : "";
      return `<div class="cal-cell ${cls}" title="${c}${t ? "  " + t : ""}"><span class="cal-d">${Number(c.slice(8))}</span><span class="cal-m">${mark}</span></div>`;
    }).join("");
    overlay.innerHTML = `<div class="cal-card">
      <div class="cal-head"><b>${esc(s.name)}</b><button class="cal-x">×</button></div>
      <div class="cal-nav"><button class="ttiny" data-nav="yy">«</button><button class="ttiny" data-nav="prev">‹</button><span class="cal-label">${st.y}年 ${st.m + 1}月</span><button class="ttiny" data-nav="next">›</button><button class="ttiny" data-nav="nn">»</button><button class="ttiny" data-nav="today" style="margin-left:8px">今</button></div>
      <div class="cal-grid"><div class="cal-hd">一</div><div class="cal-hd">二</div><div class="cal-hd">三</div><div class="cal-hd">四</div><div class="cal-hd">五</div><div class="cal-hd">六</div><div class="cal-hd">日</div>${grid}</div>
      <div class="cal-stats">本月：學 ${fmtMs(mL)} · 複習 ${fmtMs(mR)} · 完成 ${mD} 日<br>總計：學 ${fmtMs(totalTime(s.history, "learnMs"))} · 複習 ${fmtMs(totalTime(s.history, "reviewMs"))}　·　🔥${s.streak || 0}　·　已學 ${Object.keys(s.cards || {}).length}</div>
      <button class="btn btn-ghost" id="cal-wrong" style="width:100%;margin-top:8px">📖 錯字簿（${wrongList(s.cards || {}).length} 個錯字）</button></div>`;
    overlay.querySelector(".cal-x").onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    overlay.querySelectorAll("[data-nav]").forEach((b) => b.onclick = () => { const d = b.dataset.nav; if (d === "prev") st.m--; if (d === "next") st.m++; if (d === "yy") st.y--; if (d === "nn") st.y++; if (d === "today") { st.y = new Date().getFullYear(); st.m = new Date().getMonth(); } if (st.m < 0) { st.m = 11; st.y--; } if (st.m > 11) { st.m = 0; st.y++; } render(); });
    overlay.querySelector("#cal-wrong").onclick = () => openWrongWords(s);
  }
  render();
}
function openWrongWords(s) {
  const cls = MAIN && MAIN.classes ? MAIN.classes.find((c) => c.id === s.classId) : null;
  const wl = (cls && cls.level === "senior" && window.WORDS_SENIOR) ? WORDS_SENIOR : WORDS;
  const list = wrongList(s.cards || {});
  const items = list.length ? list.map((w) => `<li><b>${esc(wl[w.id] ? wl[w.id].en : "?")}</b> — 錯 <b style="color:var(--bad)">${w.wrong}</b> 次（共試 ${w.attempts}）</li>`).join("") : '<li style="color:var(--muted)">未有錯字 🎉</li>';
  const overlay = document.createElement("div"); overlay.id = "wrong-modal";
  overlay.innerHTML = `<div class="cal-card"><div class="cal-head"><b>📖 ${esc(s.name)} 嘅錯字簿</b><button class="cal-x">×</button></div><div class="thint" style="margin-bottom:8px">共 ${list.length} 個錯過嘅字</div><ul class="wrong-list">${items}</ul></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".cal-x").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

// ---------- 管理名單（當前班） ----------
function renderRoster() {
  const roster = (CLASS_DOC.roster || []).slice();
  const rows = roster.map((r, i) => `<tr>
    <td><input class="rname" data-i="${i}" value="${esc(r.name)}" /></td>
    <td><input class="rcode" data-i="${i}" value="${esc(r.code)}" placeholder="自動" style="width:80px;text-transform:uppercase" /></td>
    <td>${r.studentId ? "✅ 已加入" : "—"}</td>
    <td>${r.studentId ? `<button class="ttiny treset" data-i="${i}" title="解綁">↺</button>` : ""}<button class="ttiny tdel" data-i="${i}" title="刪除">🗑</button></td>
  </tr>`).join("");
  document.getElementById("t-content").innerHTML = `
    <div class="roster-add"><input type="text" id="ra-name" placeholder="學生名字（可貼多個，每行一個）" style="flex:1" /><button class="btn btn-primary" id="ra-btn" style="white-space:nowrap">加入</button></div>
    <div class="thint">碼留空會自動生成；可改成姓名縮寫。學生用呢個碼加入呢個班。</div>
    <div class="tscroll"><table class="ttable"><thead><tr><th>名字</th><th>專屬碼</th><th>狀態</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="color:var(--muted)">未有學生，加啲先。</td></tr>'}</tbody></table></div>`;
  document.getElementById("ra-btn").onclick = onRosterAdd;
  document.querySelectorAll(".rname").forEach((inp) => inp.onblur = (e) => updateRosterField(Number(e.target.dataset.i), "name", e.target.value));
  document.querySelectorAll(".rcode").forEach((inp) => inp.onblur = (e) => updateRosterField(Number(e.target.dataset.i), "code", e.target.value.trim().toUpperCase()));
  document.querySelectorAll(".treset").forEach((b) => b.onclick = () => resetRoster(Number(b.dataset.i)));
  document.querySelectorAll(".tdel").forEach((b) => b.onclick = () => delRoster(Number(b.dataset.i)));
}
async function saveClass() { try { await window.db.collection("classes").doc(curId).set({ roster: CLASS_DOC.roster || [], words: CLASS_DOC.words || [] }, { merge: true }); } catch (e) { alert("儲存失敗，檢查網絡"); } }
function onRosterAdd() {
  const raw = document.getElementById("ra-name").value.trim(); if (!raw) return;
  const names = raw.split(/[\n,、]+/).map((x) => x.trim()).filter(Boolean);
  if (!CLASS_DOC.roster) CLASS_DOC.roster = [];
  names.forEach((nm) => CLASS_DOC.roster.push({ id: "r_" + Math.random().toString(36).slice(2, 8), name: nm, code: autoCode(), studentId: null }));
  document.getElementById("ra-name").value = ""; saveClass(); renderRoster();
}
function updateRosterField(i, field, val) {
  if (!CLASS_DOC.roster || !CLASS_DOC.roster[i]) return;
  if (field === "name" && !val.trim()) return;
  CLASS_DOC.roster[i][field] = field === "code" ? (val || autoCode()) : val; saveClass();
}
function resetRoster(i) { if (!confirm("解綁呢個碼？")) return; CLASS_DOC.roster[i].studentId = null; saveClass(); renderRoster(); }
function delRoster(i) { if (!confirm("刪除「" + CLASS_DOC.roster[i].name + "」？")) return; CLASS_DOC.roster.splice(i, 1); saveClass(); renderRoster(); }

// ---------- 字表（高中） ----------
function renderWords() {
  const words = CLASS_DOC.words || [];
  document.getElementById("t-content").innerHTML = `
    <div class="thint">高中字表（${words.length} 個字）。一行一個，格式：<b>英文 | 詞性 | 中文</b></div>
    <textarea id="wa-text" rows="6" placeholder="analyse | Verb | 分析&#10;concept | Noun | 概念&#10;derive | Verb | 衍生" style="width:100%;font-family:inherit;font-size:14px;padding:10px;border:2px solid var(--line);border-radius:12px;resize:vertical"></textarea>
    <button class="btn btn-primary" id="wa-btn" style="width:100%;margin-top:8px">加入字表</button>
    <div style="margin-top:14px">${words.length ? words.map((w) => `<span class="wchip">${esc(w.en)}</span>`).join("") : '<div class="thint">未有字。整好之後，高中學生重新開 apps 就會自動載入。</div>'}</div>`;
  document.getElementById("wa-btn").onclick = onWordsAdd;
}
function onWordsAdd() {
  const raw = document.getElementById("wa-text").value.trim(); if (!raw) return;
  if (!CLASS_DOC.words) CLASS_DOC.words = [];
  for (const ln of raw.split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
    const p = ln.split(/[|｜]/).map((s) => s.trim());
    if (p[0]) CLASS_DOC.words.push({ en: p[0], pos: p[1] ? p[1].split(/[\/,、]/).map((s) => s.trim()).filter(Boolean) : ["Verb"], zh: p[2] || "" });
  }
  saveClass(); renderWords();
}

run();
