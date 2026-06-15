// =============================================================
//  srs.js — Leitner 間距複習
//    box 由 0 開始，每答啱升一級，間距越來越長。
//    INTERVALS[box] = 下一次複習要隔幾多日。
// =============================================================

const INTERVALS = [1, 3, 7, 14, 30, 60]; // 日
const MAX_BOX = INTERVALS.length - 1;

// 將 Date 轉成 'YYYY-MM-DD'（本地時區）
function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 真實今日（唔計 dayOffset）
function realTodayStr() {
  return dateToStr(new Date());
}

// 加／減日數
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dateToStr(dt);
}

// 字與否到期（today 係「有效今日」）
function isDue(card, today) {
  return card && card.due && card.due <= today;
}

// 答啱：升一級，按新 box 嘅間距排下次（保留統計）
function scheduleCorrect(card, today) {
  const nb = Math.min(card.box + 1, MAX_BOX);
  return { ...card, box: nb, due: addDays(today, INTERVALS[nb]) };
}

// 答錯：打回 box 0，聽日再試（保留統計）
function scheduleWrong(card, today) {
  return { ...card, box: 0, due: addDays(today, INTERVALS[0]) };
}

// 啱啱學完一個新字：box 0，聽日第一次複習
function newCard(today) {
  return { box: 0, due: addDays(today, INTERVALS[0]), attempts: 0, correct: 0, wrongStreak: 0 };
}

// 呢個字嘅正確率（未答過當 0.5）
function accuracy(card) {
  const a = card.attempts || 0;
  return a ? (card.correct || 0) / a : 0.5;
}

// 「需要度」：越高越應該優先複習。
// = 過期日數 + (1 - 正確率)×3 + 連續錯×1.5
function neediness(card, today) {
  const overdue = Math.max(0, daysBetween(card.due, today));
  return overdue * 1.0 + (1 - accuracy(card)) * 3.0 + (card.wrongStreak || 0) * 1.5;
}

// 人類可讀嘅「下次幾耐」描述
function describeDue(due, today) {
  const diff = daysBetween(today, due);
  if (diff <= 0) return "今日到期";
  if (diff === 1) return "聽日";
  if (diff < 7) return `${diff} 日後`;
  if (diff < 30) return `${Math.round(diff / 7)} 個星期後`;
  return `${Math.round(diff / 30)} 個月後`;
}

function daysBetween(aStr, bStr) {
  const [ay, am, ad] = aStr.split("-").map(Number);
  const [by, bm, bd] = bStr.split("-").map(Number);
  const a = new Date(ay, am - 1, ad);
  const b = new Date(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

if (typeof window !== "undefined") {
  window.DuoSRS = {
    INTERVALS, MAX_BOX, dateToStr, realTodayStr, addDays,
    isDue, scheduleCorrect, scheduleWrong, newCard,
    describeDue, daysBetween, accuracy, neediness,
  };
}
