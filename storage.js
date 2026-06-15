// =============================================================
//  storage.js — 所有狀態都存喺 localStorage 一個 key 入面
//    state = {
//      meta: { streak, lastStudyDate, newToday, newTodayDate,
//              newPerDay, dayOffset, learnedCount },
//      cards: { "<wordId>": { box, due }, ... }
//    }
// =============================================================

const STORAGE_KEY = "duosbc_state_v1";

const DEFAULT_META = {
  streak: 0,
  lastStudyDate: null, // 'YYYY-MM-DD'
  newToday: 0,
  newTodayDate: null,  // newToday 係屬於邊一日
  newPerDay: 3,
  dayOffset: 0,        // debug 用：模擬快進幾多日
  learnedCount: 0,
  revealSecs: 15,      // 停留幾多秒可以揭曎答案
  lockSecs: 5,         // 答錯後鎖定幾多秒
  dailyBudget: 15,     // 每日總量上限（新字 + 複習）
  freezes: 0,          // 免死金牌數量
  earnedFreezeAt: 0,   // 已喺邊個 streak 數送過金牌
  comeback: null,      // 回歸減負日（'YYYY-MM-DD' or null）
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { meta: { ...DEFAULT_META }, cards: {}, todayPlan: null };
    const parsed = JSON.parse(raw);
    const cards = {};
    for (const id in (parsed.cards || {})) {
      const c = parsed.cards[id] || {};
      cards[id] = {
        box: c.box || 0,
        due: c.due,
        attempts: c.attempts || 0,
        correct: c.correct || 0,
        wrongStreak: c.wrongStreak || 0,
      };
    }
    const tp = parsed.todayPlan;
    const todayPlan = (tp && tp.date) ? {
      date: tp.date,
      newIds: tp.newIds || [],
      reviewIds: tp.reviewIds || [],
      doneNew: tp.doneNew || [],
      doneReview: tp.doneReview || [],
    } : null;
    return { meta: { ...DEFAULT_META, ...(parsed.meta || {}) }, cards, todayPlan, history: parsed.history || {} };
  } catch (e) {
    console.warn("loadState 失敗，用預設值", e);
    return { meta: { ...DEFAULT_META }, cards: {}, todayPlan: null, history: {} };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("saveState 失敗", e);
    alert("儲存失敗，你個瀏覽器可能唔夠位。");
  }
}

function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

if (typeof window !== "undefined") {
  window.DuoStorage = { loadState, saveState, resetState, DEFAULT_META };
}
