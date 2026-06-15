// =============================================================
//  feedback.js — 爽感層（音效 Web Audio 合成 + 震動）
//  唔 load 任何音檔；靜音記喺 localStorage。
// =============================================================

const FB = {
  ctx: null,
  get muted() { return localStorage.getItem("duosbc_muted") === "1"; },
  set muted(v) { localStorage.setItem("duosbc_muted", v ? "1" : "0"); },

  ac() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    } catch (e) { return null; }
  },
  tone(freq, start, dur, type, vol) {
    const ac = this.ac();
    if (!ac || this.muted) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    const t = ac.currentTime + (start || 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.14, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  vibrate(p) { try { if (navigator.vibrate && !this.muted) navigator.vibrate(p); } catch (e) {} },

  correct() {
    this.tone(523.25, 0, 0.11, "sine", 0.14);
    this.tone(659.25, 0.08, 0.11, "sine", 0.14);
    this.tone(783.99, 0.16, 0.16, "sine", 0.14);
    this.vibrate(15);
  },
  wrong() {
    this.tone(210, 0, 0.16, "sawtooth", 0.10);
    this.tone(170, 0.09, 0.18, "sawtooth", 0.10);
    this.vibrate([25, 45, 25]);
  },
  levelup() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * 0.09, 0.16, "triangle", 0.13));
    this.vibrate([0, 25, 20, 25, 20, 55]);
  },
  tap() { this.tone(420, 0, 0.05, "sine", 0.07); this.vibrate(8); },

  toggleMute() { this.muted = !this.muted; return this.muted; },
};

if (typeof window !== "undefined") window.FB = FB;
