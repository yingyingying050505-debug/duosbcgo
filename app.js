// =============================================================
//  app.js — DuoSbcGo 主邏輯
//  每日凍結計劃：新字 3 + 複習 ≤(budget-3)，弱字保證拉入複習。
//  做完即「今日完成」，鎖到聽日（真實日期過）。
// =============================================================

let state;     // { meta, cards, todayPlan, history }
let TODAY;     // 有效今日（計埋 debug 嘅 dayOffset）
let learnStartAt = 0, reviewStartAt = 0;  // 計時
let NO_WORDS = false;  // 高中班未加字時

const PALETTE = ["Noun", "Verb", "Adjective", "Adverb", "Preposition",
  "Conjunction", "Pronoun", "Auxiliary", "Article", "Numeral", "Interjection"];

// ---------- 工具 ----------
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function norm(s) { return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, ""); }
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function sameSet(a, b) { if (a.length !== b.length) return false; const s = new Set(b); return a.every((x) => s.has(x)); }
function persist() { DuoStorage.saveState(state); if (window.Sync) Sync.saveCloud(state); }
function posStr(w) { return (w.pos || []).join(" · "); }
function speak(text) {
  try {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    window.speechSynthesis.cancel();
    const u = new window.SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch (e) {}
}
function speakerBtn(text) {
  return `<button type="button" class="speaker" data-word="${esc(text)}" aria-label="發音">🔊</button>`;
}
function fb(fn) { try { if (window.FB && typeof window.FB[fn] === "function") window.FB[fn](); } catch (e) {} }
function enrichOf(w) { if (w && w.ex) return w; return (window.ENRICH && window.ENRICH[w.en]) || null; }

function effToday() {
  const off = state.meta.dayOffset || 0;
  return off ? DuoSRS.addDays(DuoSRS.realTodayStr(), off) : DuoSRS.realTodayStr();
}
function rollover() {
  if (state.meta.newTodayDate !== TODAY) { state.meta.newToday = 0; state.meta.newTodayDate = TODAY; }
}

// ---------- 卡片 / 統計 ----------
function isLearned(id) { return !!state.cards[id]; }
function allDue() {
  const arr = [];
  for (const id in state.cards) if (DuoSRS.isDue(state.cards[id], TODAY)) arr.push(Number(id));
  arr.sort((a, b) => DuoSRS.neediness(state.cards[b], TODAY) - DuoSRS.neediness(state.cards[a], TODAY) || a - b);
  return arr;
}
function weakIds() {
  const out = [];
  for (const id in state.cards) {
    const c = state.cards[id];
    if ((c.attempts || 0) >= 2 && DuoSRS.accuracy(c) < 0.7) out.push(Number(id));
  }
  out.sort((a, b) => {
    const ca = state.cards[a], cb = state.cards[b];
    return DuoSRS.accuracy(ca) - DuoSRS.accuracy(cb) || (cb.wrongStreak || 0) - (ca.wrongStreak || 0) || a - b;
  });
  return out;
}
function recordAnswer(card, correct) {
  const c = { ...card };
  c.attempts = (c.attempts || 0) + 1;
  if (correct) { c.correct = (c.correct || 0) + 1; c.wrongStreak = 0; }
  else { c.wrongStreak = (c.wrongStreak || 0) + 1; }
  return c;
}

// ---------- 凍結每日計劃 ----------
function nextNewIdsRaw(n) {
  const out = []; for (let i = 0; i < WORDS.length && out.length < n; i++) if (!isLearned(i)) out.push(i); return out;
}
function computePlan() {
  const newIds = (state.meta.comeback === TODAY) ? [] : nextNewIdsRaw(state.meta.newPerDay || 3);
  const reviewBudget = Math.max(0, (state.meta.dailyBudget || 15) - newIds.length);
  const due = allDue();                 // neediest 先
  const reviewIds = due.slice(0, reviewBudget);
  const inReview = new Set(reviewIds);
  const dueSet = new Set(due);
  // 補弱字：未到期但正確率低，拉入今日複習額度
  for (const id of weakIds()) {
    if (reviewIds.length >= reviewBudget) break;
    if (!dueSet.has(id) && !inReview.has(id)) { reviewIds.push(id); inReview.add(id); }
  }
  return { date: TODAY, newIds, reviewIds, doneNew: [], doneReview: [] };
}
function ensurePlan() {
  if (!state.todayPlan || state.todayPlan.date !== TODAY) { state.todayPlan = computePlan(); }
}
function refreshToday() {
  TODAY = effToday(); rollover();
  // 回歸大禮：斷 ≥3 日返嚟，當日淨係複習
  if (state.meta.lastStudyDate) {
    const gap = DuoSRS.daysBetween(state.meta.lastStudyDate, TODAY);
    if (gap >= 3 && state.meta.comeback !== TODAY) state.meta.comeback = TODAY;
  }
  if (state.meta.comeback && state.meta.comeback !== TODAY) state.meta.comeback = null;
  ensurePlan(); persist();
}

function planNewRemaining() {
  const p = state.todayPlan; if (!p) return [];
  return p.newIds.filter((id) => !p.doneNew.includes(id));
}
function planReviewRemaining() {
  const p = state.todayPlan; if (!p) return [];
  return p.reviewIds.filter((id) => !p.doneReview.includes(id));
}

// 每日歷史（完成 / 新字數 / 學習秒 / 複習秒 / 複習數）
function hist(date) {
  if (!state.history) state.history = {};
  return state.history[date] || (state.history[date] = { completed: false, newWords: 0, learnMs: 0, reviewMs: 0, reviews: 0 });
}
function maybeMarkCompleted() {
  if (planNewRemaining().length === 0 && planReviewRemaining().length === 0) { hist(TODAY).completed = true; persist(); }
}

// MC 選項
function posOptions(posArr) {
  const d = shuffle(PALETTE.filter((p) => !posArr.includes(p)));
  return shuffle(posArr.concat(d.slice(0, posArr.length === 1 ? 4 : 3)));
}
function meaningOptions(id, n = 3) {
  const correct = WORDS[id].zh; const idxs = [];
  for (let i = 0; i < WORDS.length; i++) if (i !== id) idxs.push(i);
  shuffle(idxs);
  const out = [];
  for (const k of idxs) { const z = WORDS[k].zh; if (z !== correct && !out.includes(z)) out.push(z); if (out.length >= n) break; }
  return out;
}

// ---------- 畫面切換 ----------
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo(0, 0);
}
function goHome() {
  refreshToday(); renderHome();
  document.getElementById("learn-content").innerHTML = "";
  document.getElementById("review-content").innerHTML = "";
  show("screen-home");
}

// ---------- 主頁 ----------
function renderHome() {
  const newRem = planNewRemaining();
  const revRem = planReviewRemaining();
  const plan = state.todayPlan;
  const deferred = plan ? allDue().filter((id) => !plan.reviewIds.includes(id)).length : 0;
  document.getElementById("home-streak").textContent = "🔥 " + state.meta.streak + ((state.meta.freezes || 0) ? ` ❄️${state.meta.freezes}` : "");
  document.getElementById("home-date").textContent = "🗓  " + TODAY;
  document.getElementById("home-new-count").textContent = newRem.length;
  document.getElementById("home-due-count").textContent = revRem.length;
  document.getElementById("home-due-sub").textContent = deferred > 0 ? `仲有 ${deferred} 個順延聽日` : "間距複習，越記越牢";
  document.getElementById("home-learned").textContent = state.meta.learnedCount;
  document.getElementById("home-total").textContent = WORDS.length;
  document.getElementById("home-btn-learn").disabled = newRem.length === 0;
  document.getElementById("home-btn-review").disabled = revRem.length === 0;
  document.getElementById("home-done").hidden = !(newRem.length === 0 && revRem.length === 0);
  const cb = document.getElementById("home-comeback"); if (cb) cb.hidden = state.meta.comeback !== TODAY;
  document.getElementById("home-newperday").value = String(state.meta.newPerDay);
  document.getElementById("home-reveal").value = String(state.meta.revealSecs || 15);
  document.getElementById("home-lock").value = String(state.meta.lockSecs || 5);
  document.getElementById("home-cap").value = String(state.meta.dailyBudget || 15);
  const gs = gardenStats();
  const gsCount = document.getElementById("gs-count"); if (gsCount) gsCount.textContent = gs.learned + "/" + WORDS.length;
  const gsRow = document.getElementById("gs-row"); if (gsRow) gsRow.innerHTML = `<span>🌱${gs.sprout}</span><span>🌿${gs.grown}</span><span>🌳${gs.strong}</span><span>🌸${gs.bloom}</span>`;
}

function plantEmoji(box) { if (box >= 5) return "🌸"; if (box >= 3) return "🌳"; if (box >= 1) return "🌿"; return "🌱"; }
function gardenStats() {
  const s = { sprout: 0, grown: 0, strong: 0, bloom: 0, learned: 0 };
  for (const id in state.cards) { const b = state.cards[id].box || 0; s.learned++; if (b >= 5) s.bloom++; else if (b >= 3) s.strong++; else if (b >= 1) s.grown++; else s.sprout++; }
  return s;
}
function renderGarden() {
  const cells = WORDS.map((w, id) => {
    const c = state.cards[id];
    if (!c) return `<div class="gcell empty" title="${esc(w.en)}（未學）">·</div>`;
    return `<div class="gcell" title="${esc(w.en)}">${plantEmoji(c.box || 0)}</div>`;
  }).join("");
  document.getElementById("garden-content").innerHTML =
    headHtml("🌱 字花園") +
    `<div class="hint">每棵植物係一個字：🌱 初學 → 🌿 成長 → 🌳 茁壯 → 🌸 畢業（記得最牢）。</div>
     <div class="garden-grid">${cells}</div>`;
  document.getElementById("step-back").onclick = goHome;
  show("screen-garden");
}

// ---------- 學生月曆 helper ----------
function scDateStr(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function scMonthCells(y, m) {
  const first = new Date(y, m, 1); const dim = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(scDateStr(new Date(y, m, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ---------- 全班排行榜（按 連續打卡 → 完成日數）----------
async function showLeaderboard() {
  const el = document.getElementById("leaderboard-content");
  el.innerHTML = headHtml("🏆 全班排行榜") + `<div class="hint">載入中…</div>`;
  show("screen-leaderboard");
  document.getElementById("step-back").onclick = goHome;
  if (!window.db || !Sync.classId) {
    el.innerHTML = headHtml("🏆 全班排行榜") + `<div class="empty"><div class="emoji">📡</div>需要連線顯示排行榜，請接駁網絡再開。</div>`;
    return;
  }
  try {
    const snap = await window.db.collection("students").where("classId", "==", Sync.classId).get();
    const rows = [];
    snap.forEach((d) => {
      const s = d.data(); let completed = 0;
      for (const dt in (s.history || {})) if (s.history[dt].completed) completed++;
      rows.push({ name: s.name || "?", streak: s.streak || 0, completed, me: d.id === Sync.studentId });
    });
    rows.sort((a, b) => (b.streak - a.streak) || (b.completed - a.completed));
    if (!rows.length) {
      el.innerHTML = headHtml("🏆 全班排行榜") + `<div class="empty"><div class="emoji">👀</div>同班同學仲未有數據。</div>`;
      return;
    }
    const myRank = rows.findIndex((r) => r.me) + 1;
    let html = rows.slice(0, 5).map((r, i) => lbRow(i + 1, r)).join("");
    if (myRank > 5) html += `<div class="lb-gap">…</div>` + lbRow(myRank, rows[myRank - 1]);
    el.innerHTML = headHtml("🏆 全班排行榜") +
      `<div class="hint">按 🔥連續打卡 → ✅完成日數 排。你排第 <b>${myRank}</b> / ${rows.length}。</div>` +
      `<div class="lb-list">${html}</div>`;
  } catch (e) {
    el.innerHTML = headHtml("🏆 全班排行榜") + `<div class="empty"><div class="emoji">📡</div>讀取失敗，請再試。</div>`;
  }
}
function lbRow(rank, r) {
  const medal = rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : "#" + rank;
  return `<div class="lb-row${r.me ? " me" : ""}"><span class="lb-rank">${medal}</span><span class="lb-name">${esc(r.name)}${r.me ? "（你）" : ""}</span><span class="lb-streak">🔥${r.streak}</span><span class="lb-done">✅${r.completed}</span></div>`;
}

// ---------- 學生自己嘅日曆 ----------
function showStuCalendar() {
  const el = document.getElementById("stucal-content");
  const todayStr = scDateStr(new Date());
  const st = { y: new Date().getFullYear(), m: new Date().getMonth() };
  show("screen-stucal");
  function render() {
    const cells = scMonthCells(st.y, st.m);
    let mDone = 0, mPartial = 0;
    const grid = cells.map((c) => {
      if (!c) return `<div class="cal-cell blank"></div>`;
      const h = (state.history || {})[c];
      let mark = "·", cls = "absent";
      if (c > todayStr) { mark = ""; cls = "future"; }
      else if (h) { mark = h.completed ? "✓" : "△"; cls = h.completed ? "done" : "partial"; if (h.completed) mDone++; else mPartial++; }
      return `<div class="cal-cell ${cls}"><span class="cal-d">${Number(c.slice(8))}</span><span class="cal-m">${mark}</span></div>`;
    }).join("");
    const totDone = Object.values(state.history || {}).filter((h) => h.completed).length;
    el.innerHTML = headHtml("📅 我嘅日曆") +
      `<div class="cal-nav"><button class="ttiny" data-nav="prev">‹</button><span class="cal-label">${st.y}年 ${st.m + 1}月</span><button class="ttiny" data-nav="next">›</button><button class="ttiny" data-nav="today" style="margin-left:8px">今</button></div>` +
      `<div class="cal-grid"><div class="cal-hd">一</div><div class="cal-hd">二</div><div class="cal-hd">三</div><div class="cal-hd">四</div><div class="cal-hd">五</div><div class="cal-hd">六</div><div class="cal-hd">日</div>${grid}</div>` +
      `<div class="cal-stats">本月：完成 ${mDone} 日 · 做過未完 ${mPartial} 日<br>累計完成 ${totDone} 日　·　🔥 ${state.meta.streak || 0}<br><span class="thint">✓ 完成 · △ 做過未完 · · 冇做。每日打卡，唔好斷！</span></div>`;
    document.getElementById("step-back").onclick = goHome;
    el.querySelectorAll("[data-nav]").forEach((b) => b.onclick = () => {
      const d = b.dataset.nav;
      if (d === "prev") st.m--; if (d === "next") st.m++;
      if (d === "today") { st.y = new Date().getFullYear(); st.m = new Date().getMonth(); }
      if (st.m < 0) { st.m = 11; st.y--; } if (st.m > 11) { st.m = 0; st.y++; }
      render();
    });
  }
  render();
}

function headHtml(title) {
  return `<div class="screen-head"><button class="back" id="step-back">‹</button><div class="screen-title">${esc(title)}</div></div>`;
}
function pillbarHtml(idx, total, extra) {
  return `<div class="pillbar"><span>第 ${idx + 1} / ${total} 步</span><span class="sep">·</span>${extra}</div>`;
}

// ============================================================
//  逐步流程引擎
// ============================================================
function runSteps(container, steps, opts) {
  let i = 0;
  const stats = { total: steps.length, mcTotal: 0, mcCorrect: 0, typeTotal: 0, typeFirstTry: 0 };
  function advance(result) {
    const step = steps[i];
    if (step.kind === "type") { stats.typeTotal++; if (result.firstTryCorrect) stats.typeFirstTry++; }
    else { stats.mcTotal++; if (result.correct) stats.mcCorrect++; }
    if (opts.onStepResult) opts.onStepResult(step, result);
    persist();
    i++; next();
  }
  function next() {
    if (i >= steps.length) { opts.onDone(stats); return; }
    const step = steps[i];
    const onBack = () => { if (opts.onAbort) opts.onAbort(); else goHome(); };
    if (step.kind === "pos") renderPosStep(container, step, advance, onBack, i, steps.length, opts.title);
    else if (step.kind === "meaning") renderMeaningStep(container, step, advance, onBack, i, steps.length, opts.title);
    else renderTypeStep(container, step, advance, onBack, i, steps.length, opts.title);
  }
  next();
}

// ---------- 選詞性（多選） ----------
function renderPosStep(container, step, advance, onBack, idx, total, title) {
  const w = WORDS[step.id]; const correct = w.pos.slice(); const opts = posOptions(correct);
  const selected = new Set(); let done = false; let lastCorrect = false;
  container.innerHTML = headHtml(title) + pillbarHtml(idx, total, `<span>選詞性</span>`) +
    `<div class="mc"><div class="mc-prompt">選出呢個字嘅詞性（可多選）</div>
       <div class="mc-en">${esc(w.en)} ${speakerBtn(w.en)}</div>
       <div class="chips" id="mc-chips">${opts.map((p) => `<button class="chip" data-p="${esc(p)}">${esc(p)}</button>`).join("")}</div>
       <div id="mc-feedback"></div>
       <div class="quiz-actions"><button class="btn btn-primary" id="mc-confirm" disabled style="width:100%">確認</button></div></div>`;
  show(container.closest(".screen").id);
  document.getElementById("step-back").onclick = onBack;
  const confirmBtn = container.querySelector("#mc-confirm");
  container.querySelectorAll(".chip").forEach((c) => {
    c.onclick = () => {
      if (done) return; const p = c.dataset.p;
      if (selected.has(p)) { selected.delete(p); c.classList.remove("selected"); }
      else { selected.add(p); c.classList.add("selected"); }
      confirmBtn.disabled = selected.size === 0;
      fb("tap");
    };
  });
  confirmBtn.onclick = () => {
    if (done) { advance({ correct: lastCorrect }); return; }
    done = true; lastCorrect = sameSet([...selected], correct);
    fb(lastCorrect ? "correct" : "wrong");
    container.querySelectorAll(".chip").forEach((c) => {
      c.disabled = true; const p = c.dataset.p;
      if (correct.includes(p)) c.classList.add("correct"); else if (selected.has(p)) c.classList.add("wrong");
    });
    container.querySelector("#mc-feedback").innerHTML = lastCorrect
      ? `<div class="mc-feedback ok">✅ 正確</div>` : `<div class="mc-feedback bad">❌ 正確答案：${esc(correct.join(" · "))}</div>`;
    confirmBtn.textContent = idx === total - 1 ? "完成 ✅" : "繼續 ›";
  };
}

// ---------- 選中文意思（單選） ----------
function renderMeaningStep(container, step, advance, onBack, idx, total, title) {
  const w = WORDS[step.id];
  const opts = shuffle([w.zh].concat(meaningOptions(step.id, 3)));
  let picked = null, done = false, lastCorrect = false;
  container.innerHTML = headHtml(title) + pillbarHtml(idx, total, `<span>選意思</span>`) +
    `<div class="mc"><div class="mc-prompt">選出呢個字嘅意思</div>
       <div class="mc-en">${esc(w.en)} ${speakerBtn(w.en)}</div>
       <div class="mc-options">${opts.map((z) => `<button class="mc-opt" data-z="${esc(z)}">${esc(z)}</button>`).join("")}</div>
       <div id="mc-feedback"></div>
       <div class="quiz-actions"><button class="btn btn-primary" id="mc-confirm" disabled style="width:100%">確認</button></div></div>`;
  show(container.closest(".screen").id);
  document.getElementById("step-back").onclick = onBack;
  const confirmBtn = container.querySelector("#mc-confirm");
  container.querySelectorAll(".mc-opt").forEach((b) => {
    b.onclick = () => {
      if (done) return; picked = b.dataset.z;
      container.querySelectorAll(".mc-opt").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected"); confirmBtn.disabled = false;
      fb("tap");
    };
  });
  confirmBtn.onclick = () => {
    if (done) { advance({ correct: lastCorrect }); return; }
    done = true; lastCorrect = picked === w.zh;
    fb(lastCorrect ? "correct" : "wrong");
    container.querySelectorAll(".mc-opt").forEach((b) => {
      b.disabled = true;
      if (b.dataset.z === w.zh) b.classList.add("correct"); else if (b.dataset.z === picked) b.classList.add("wrong");
    });
    container.querySelector("#mc-feedback").innerHTML = lastCorrect
      ? `<div class="mc-feedback ok">✅ 正確</div>` : `<div class="mc-feedback bad">❌ 正確答案：${esc(w.zh)}</div>`;
    confirmBtn.textContent = idx === total - 1 ? "完成 ✅" : "繼續 ›";
  };
}

// ---------- 打字（揭曎 / 鎖定，秒數由設定控制） ----------
function renderTypeStep(container, step, advance, onBack, idx, total, title) {
  const w = WORDS[step.id];
  const e = enrichOf(w);
  const REVEAL = state.meta.revealSecs || 15;
  const LOCK = state.meta.lockSecs || 5;
  let firstTry = true, answered = false, timerR = null, timerL = null, secs = REVEAL;
  container.innerHTML = headHtml(title) + pillbarHtml(idx, total, `<span>打字 ✍️</span>`) +
    `<div class="quiz"><div class="quiz-prompt">打出對應嘅英文字</div>
       <div class="quiz-zh">${esc(w.zh)}</div>
       <div class="quiz-pos">${esc(posStr(w))}</div>
       <input type="text" id="q-input" autocomplete="off" autocorrect="off" autocapitalize="off"
         spellcheck="false" inputmode="text" onpaste="return false" oncopy="return false" oncontextmenu="return false" placeholder="喺度打…" />
       <div id="q-reveal"></div>
       <div class="quiz-actions">
         <button class="btn btn-skip" id="q-reveal-btn">揭曎答案</button>
         <button class="btn btn-primary" id="q-check">檢查</button>
       </div></div>`;
  show(container.closest(".screen").id);
  document.getElementById("step-back").onclick = () => { clearTimers(); onBack(); };
  const inp = container.querySelector("#q-input");
  const checkBtn = container.querySelector("#q-check");
  const revealBtn = container.querySelector("#q-reveal-btn");
  const revealDiv = container.querySelector("#q-reveal");
  inp.focus();
  setTimeout(() => { try { inp.scrollIntoView({ block: "center" }); } catch (e) {} }, 80);

  function clearTimers() { if (timerR) { clearInterval(timerR); timerR = null; } if (timerL) { clearInterval(timerL); timerL = null; } }
  function startRevealTimer() {
    secs = REVEAL; revealBtn.disabled = true; revealBtn.style.display = ""; revealBtn.textContent = "揭曎答案（" + secs + "s）";
    timerR = setInterval(() => {
      secs--;
      if (secs <= 0) { clearInterval(timerR); timerR = null; revealBtn.disabled = false; revealBtn.textContent = "揭曎答案"; }
      else revealBtn.textContent = "揭曎答案（" + secs + "s）";
    }, 1000);
  }
  function lockAndReveal() {
    if (answered) return; firstTry = false; clearTimers(); fb("wrong");
    inp.disabled = true; inp.value = ""; inp.classList.add("wrong-flash");
    revealDiv.innerHTML = `<div class="reveal bad"><div class="reveal-en">答案：${esc(w.en)} ${speakerBtn(w.en)}</div>
      <small>${esc(posStr(w))} · ${esc(w.zh)}</small>
      ${e && e.ex ? `<div class="reveal-ex">${esc(e.ex)}</div>` : ""}
      ${e && e.mn ? `<div class="reveal-mn">💡 ${esc(e.mn)}</div>` : ""}
      <div class="lock">慢慢睇… <b id="locksec">${LOCK}</b> 秒後可再作答</div></div>`;
    checkBtn.style.display = "none"; revealBtn.style.display = "none";
    let lock = LOCK; const span = container.querySelector("#locksec");
    timerL = setInterval(() => {
      lock--;
      if (lock <= 0) { clearInterval(timerL); timerL = null; endLock(); }
      else if (span) span.textContent = lock;
    }, 1000);
  }
  function endLock() {
    inp.disabled = false; inp.classList.remove("wrong-flash"); inp.value = "";
    revealDiv.innerHTML = ""; checkBtn.style.display = ""; checkBtn.textContent = "檢查";
    startRevealTimer(); inp.focus();
  }
  function correctResolve() {
    answered = true; clearTimers(); fb("correct"); inp.disabled = true; inp.classList.add("ok-flash");
    revealDiv.innerHTML = `<div class="reveal ok"><div class="reveal-en">答啱！${esc(w.en)} ${speakerBtn(w.en)}</div>
      <small>${esc(posStr(w))} · ${esc(w.zh)}</small>
      ${e && e.ex ? `<div class="reveal-ex">${esc(e.ex)}</div>` : ""}
      ${e && e.mn ? `<div class="reveal-mn">💡 ${esc(e.mn)}</div>` : ""}
    </div>`;
    revealBtn.style.display = "none";
    checkBtn.textContent = idx === total - 1 ? "完成 ✅" : "繼續 ›";
    checkBtn.onclick = () => advance({ firstTryCorrect: firstTry });
    inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); advance({ firstTryCorrect: firstTry }); } };
  }
  function check() { if (answered) return; if (norm(inp.value) === norm(w.en)) correctResolve(); else lockAndReveal(); }
  checkBtn.onclick = check;
  revealBtn.onclick = () => { if (!revealBtn.disabled) lockAndReveal(); };
  inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); if (!answered) check(); } };
  startRevealTimer();
}

// ---------- 學習（今日計劃嘅新字） ----------
function startLearn() {
  refreshToday();
  learnStartAt = Date.now();
  document.getElementById("review-content").innerHTML = "";
  const batch = planNewRemaining();
  if (!batch.length) return;
  const el = document.getElementById("learn-content");
  el.innerHTML = headHtml("學新字（" + batch.length + "）") +
    `<div class="hint">先睇清楚下面 ${batch.length} 個字（英文 · 詞性 · 中文），然後撳「開始練習」。撲 🔊 聽發音。</div>
     <div class="intro-list">${batch.map((id) => {
       const w = WORDS[id]; const e = enrichOf(w);
       return `<div class="intro-card">
         <div class="intro-en">${esc(w.en)} ${speakerBtn(w.en)}</div>
         <div class="intro-meta"><span class="intro-pos">${esc(posStr(w))}</span></div>
         <div class="intro-zh">${esc(w.zh)}</div>
         ${e && e.ex ? `<div class="intro-ex">${esc(e.ex)}</div><div class="intro-exzh">${esc(e.exZh || "")}</div>` : ""}
         ${e && e.mn ? `<div class="intro-mn">💡 ${esc(e.mn)}</div>` : ""}
       </div>`;
     }).join("")}</div>
     <div style="margin-top:18px"><button class="btn btn-primary" id="learn-start" style="width:100%">開始練習 ✍️</button></div>`;
  document.getElementById("step-back").onclick = goHome;
  show("screen-learn");
  document.getElementById("learn-start").onclick = () => beginLearnPractice(el, batch);
}

function beginLearnPractice(container, batch) {
  const steps = [];
  for (const id of batch) { steps.push({ kind: "pos", id }); steps.push({ kind: "meaning", id }); }
  for (const id of batch) steps.push({ kind: "type", id });
  runSteps(container, steps, {
    title: "練習新字",
    onDone: (stats) => {
      for (const id of batch) {
        state.cards[id] = DuoSRS.newCard(TODAY);
        if (!state.todayPlan.doneNew.includes(id)) state.todayPlan.doneNew.push(id);
      }
      state.meta.newToday = (state.meta.newToday || 0) + batch.length;
      state.meta.learnedCount = Object.keys(state.cards).length;
      hist(TODAY).learnMs += Date.now() - learnStartAt;
      hist(TODAY).newWords += batch.length;
      markStudied(); persist();
      maybeMarkCompleted();
      const revRem = planReviewRemaining().length;
      showDone({ emoji: "✨", title: "新字學完！", stats, next: revRem ? `仲有 ${revRem} 個複習未做。` : "聽日會再複習呢批字。" });
    },
  });
}

// ---------- 複習（今日計劃：到期字 + 弱字，已凍結） ----------
function startReview() {
  refreshToday();
  reviewStartAt = Date.now();
  document.getElementById("learn-content").innerHTML = "";
  const ids = planReviewRemaining();
  if (!ids.length) return;
  const el = document.getElementById("review-content");
  runSteps(el, ids.map((id) => ({ kind: "type", id })), {
    title: "今日複習",
    onStepResult: (step, result) => {
      if (step.kind === "type") {
        const c = recordAnswer(state.cards[step.id], result.firstTryCorrect);
        state.cards[step.id] = result.firstTryCorrect ? DuoSRS.scheduleCorrect(c, TODAY) : DuoSRS.scheduleWrong(c, TODAY);
        if (!state.todayPlan.doneReview.includes(step.id)) state.todayPlan.doneReview.push(step.id);
      }
    },
    onDone: (stats) => {
      hist(TODAY).reviewMs += Date.now() - reviewStartAt;
      hist(TODAY).reviews += ids.length;
      markStudied(); persist();
      maybeMarkCompleted();
      const newRem = planNewRemaining().length;
      showDone({ emoji: "🔁", title: "今日複習完成！", stats,
        next: newRem ? `仲有 ${newRem} 個新字未學。` : "今日全部搞定，聽日見！🎉" });
    },
  });
}

// ---------- 完成頁 ----------
function showDone({ emoji, title, stats, next }) {
  fb("levelup");
  const typeLine = stats && stats.typeTotal ? `<div class="done-stat">打字一次答對 <b>${stats.typeFirstTry}</b> / ${stats.typeTotal}</div>` : "";
  const mcLine = stats && stats.mcTotal ? `<div class="done-stat">選擇題答對 <b>${stats.mcCorrect}</b> / ${stats.mcTotal}</div>` : "";
  document.getElementById("done-content").innerHTML =
    `<div class="screen-head"><button class="back" id="done-back">‹</button><div class="screen-title">完成</div></div>
     <div class="done-wrap"><div class="done-emoji">${emoji}</div><div class="done-title">${esc(title)}</div>
     ${mcLine}${typeLine}<div class="nextdue">${esc(next)}</div>
     <button class="btn btn-primary" id="done-home" style="margin-top:20px;width:100%">返主頁</button></div>`;
  document.getElementById("done-back").onclick = goHome;
  document.getElementById("done-home").onclick = goHome;
  show("screen-done");
}

// ---------- streak ----------
function markStudied() {
  if (state.meta.lastStudyDate === TODAY) return;
  const last = state.meta.lastStudyDate;
  if (!last) {
    state.meta.streak = 1;
  } else {
    const gap = DuoSRS.daysBetween(last, TODAY);
    if (gap === 1) state.meta.streak = (state.meta.streak || 0) + 1;
    else if (gap === 2 && (state.meta.freezes || 0) > 0) { state.meta.freezes -= 1; state.meta.streak = (state.meta.streak || 0) + 1; }
    else state.meta.streak = 1;
  }
  // 每 7 日送一張免死金牌（最多 3）
  if (state.meta.streak > 0 && state.meta.streak % 7 === 0 && state.meta.streak !== (state.meta.earnedFreezeAt || 0)) {
    state.meta.freezes = Math.min((state.meta.freezes || 0) + 1, 3);
    state.meta.earnedFreezeAt = state.meta.streak;
  }
  state.meta.lastStudyDate = TODAY;
}

// 載入所屬班別嘅字表：初中用內建 words.js；高中用 Firestore 字表
async function applyClassWords(classId) {
  if (!classId) return;
  const cls = await Sync.loadClass(classId);
  if (cls && cls.level === "senior") {
    const sw = Array.isArray(cls.words) ? cls.words : [];
    if (sw.length) { WORDS = sw; window.WORDS = sw; }
    else if (window.WORDS_SENIOR && WORDS_SENIOR.length) { WORDS = WORDS_SENIOR; window.WORDS = WORDS_SENIOR; }
    else { NO_WORDS = true; }
  }
}

// ---------- 初始化 ----------
async function init() {
  state = DuoStorage.loadState();

  document.getElementById("home-btn-learn").onclick = startLearn;
  document.getElementById("home-btn-review").onclick = startReview;
  const gardenBtn = document.getElementById("home-garden"); if (gardenBtn) gardenBtn.onclick = renderGarden;
  const lbBtn = document.getElementById("home-lb"); if (lbBtn) lbBtn.onclick = showLeaderboard;
  const calBtn = document.getElementById("home-cal"); if (calBtn) calBtn.onclick = showStuCalendar;
  document.getElementById("home-newperday").onchange = (e) => { state.meta.newPerDay = Number(e.target.value); rebuildPlan(); };
  document.getElementById("home-reveal").onchange = (e) => { state.meta.revealSecs = Number(e.target.value); persist(); };
  document.getElementById("home-lock").onchange = (e) => { state.meta.lockSecs = Number(e.target.value); persist(); };
  document.getElementById("home-cap").onchange = (e) => { state.meta.dailyBudget = Number(e.target.value); rebuildPlan(); };
  document.getElementById("dbg-unlock").onclick = () => {
    const inp = document.getElementById("dbg-pw");
    if (inp.value === "1234") document.getElementById("dbg-btns").hidden = false;
    else { inp.value = ""; inp.placeholder = "密碼錯"; }
  };
  const resyncBtn = document.getElementById("home-resync");
  if (resyncBtn && window.Sync && Sync.hasIdentity()) resyncBtn.hidden = false;
  if (resyncBtn) resyncBtn.onclick = () => {
    if (!confirm("重新由雲端同步？會清除本地暫存（身份同雲端進度唔受影響）。")) return;
    localStorage.removeItem("duosbc_state_v1");
    location.reload();
  };
  const updateBtn = document.getElementById("home-update");
  if (updateBtn) updateBtn.onclick = async () => {
    if (navigator.serviceWorker) {
      try { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map((r) => r.unregister())); } catch (e) {}
    }
    location.reload();
  };
  document.getElementById("dbg-forward").onclick = () => { state.meta.dayOffset = (state.meta.dayOffset || 0) + 1; refreshToday(); renderHome(); };
  document.getElementById("dbg-reset").onclick = () => {
    if (confirm("確定重置全部進度？所有學習紀錄會冇咗。")) {
      DuoStorage.resetState(); state = DuoStorage.loadState();
      if (window.Sync) Sync.saveCloud(state);
      refreshToday(); renderHome(); show("screen-home");
    }
  };
  document.getElementById("join-btn").onclick = onJoin;
  const muteBtn = document.getElementById("mute-btn");
  const syncMute = () => { if (muteBtn) muteBtn.textContent = (window.FB && FB.muted) ? "🔇" : "🔊"; };
  syncMute();
  if (muteBtn) muteBtn.onclick = () => { if (window.FB) FB.toggleMute(); syncMute(); };
  document.addEventListener("click", (e) => { const b = e.target.closest(".speaker"); if (b) speak(b.dataset.word); });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  // 身份閘：有身份 → 載入（先本地後雲端）；冇身份 + Firebase 在線 → 加入畫面；冇 Firebase → 純本地
  if (window.Sync && Sync.hasIdentity()) {
    refreshToday(); renderHome(); show("screen-home");
    const cloud = await Sync.loadCloud();
    if (cloud && cloud.cards) {
      state = { meta: { ...DuoStorage.DEFAULT_META, ...(cloud.meta || {}) }, cards: cloud.cards, todayPlan: cloud.todayPlan || null, history: cloud.history || {} };
      DuoStorage.saveState(state);
    }
    await applyClassWords((cloud && cloud.classId) || Sync.classId);
    refreshToday(); renderHome();
    if (NO_WORDS) show("screen-nowords");
  } else if (window.Sync && Sync.isOnline()) {
    show("screen-join");
  } else {
    // Firebase load 唔到（極罕見，因為上網站本身就已經有網）→ 顯示需要網絡，唔入冇備份嘅本地模式
    show("screen-join");
    const err = document.getElementById("join-err");
    if (err) err.textContent = "需要網絡連線先可以使用，請接駁網絡後重新開啟。";
  }
}

async function onJoin() {
  const code = document.getElementById("join-code").value.trim();
  const err = document.getElementById("join-err");
  err.textContent = "";
  if (!code) { err.textContent = "請填專屬碼"; return; }
  const btn = document.getElementById("join-btn");
  btn.disabled = true; btn.textContent = "加入中…";
  const r = await Sync.joinByCode(code);
  btn.disabled = false; btn.textContent = "加入";
  if (r.error) { err.textContent = r.error; return; }
  state = DuoStorage.loadState();
  const cloud = await Sync.loadCloud();
  if (cloud && cloud.cards) {
    state = { meta: { ...DuoStorage.DEFAULT_META, ...(cloud.meta || {}) }, cards: cloud.cards, todayPlan: cloud.todayPlan || null, history: cloud.history || {} };
    DuoStorage.saveState(state);
  }
  await applyClassWords(r.classId);
  const nc = document.getElementById("nowords-class"); if (nc) nc.textContent = r.className || "高中";
  refreshToday(); renderHome();
  show(NO_WORDS ? "screen-nowords" : "screen-home");
}

// 改咗 newPerDay / dailyBudget 就重新計劃（如果今日仲未開始做）
function rebuildPlan() {
  const p = state.todayPlan;
  const untouched = p && p.doneNew.length === 0 && p.doneReview.length === 0;
  if (untouched) state.todayPlan = computePlan();
  persist(); renderHome();
}

init();
