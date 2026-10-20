// パソコンの操作音のような、本物らしい効果音（ブラウザで合成。音源ファイルは使わない）。
// 最初のタップのあとから鳴る（ブラウザの決まり）。ON/OFF は localStorage に保存。
export type Sfx = 'tick' | 'select' | 'open' | 'flip' | 'close' | 'coin' | 'deal' | 'fanfare' | 'shade' | 'menu' | 'drop' | 'alert';

let AC: AudioContext | null = null;
let on = true;
let lastTick = 0;
const listeners = new Set<(v: boolean) => void>();

if (typeof window !== 'undefined') {
  try {
    on = localStorage.getItem('gc-sfx') !== 'off';
  } catch {}
  document.addEventListener('pointerdown', () => on && ctx(), true);
}

function ctx(): AudioContext | null {
  if (!AC) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    try {
      AC = new C();
    } catch {
      return null;
    }
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}

export const sfxEnabled = () => on;
export function onSfxChange(fn: (v: boolean) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function setSfx(v: boolean) {
  on = v;
  try {
    localStorage.setItem('gc-sfx', v ? 'on' : 'off');
  } catch {}
  if (v) {
    ctx();
    setTimeout(() => sfx('select'), 30);
  }
  listeners.forEach((f) => f(v));
}

let bus: GainNode | null = null;
let room: ConvolverNode | null = null;
// 小さな部屋の残響（ノイズを減衰させて作る）。音を少し空間になじませる
function out(): AudioNode {
  const a = AC!;
  if (bus) return bus;
  bus = a.createGain();
  bus.gain.value = 1;
  room = a.createConvolver();
  const len = Math.floor(a.sampleRate * 0.6);
  const ir = a.createBuffer(2, len, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
  }
  room.buffer = ir;
  const wet = a.createGain();
  wet.gain.value = 0.18;
  bus.connect(a.destination);
  bus.connect(room);
  room.connect(wet);
  wet.connect(a.destination);
  return bus;
}

function tone(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number, att = 0.002) {
  const a = AC!;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(out());
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

// フィルターを通したノイズ。f0→f1 に周波数を動かすと「シュッ」という音になる
function noise(t0: number, dur: number, vol: number, f0 = 2200, f1 = 0, q = 0.9, type: BiquadFilterType = 'bandpass', att = 0.001) {
  const a = AC!;
  const b = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const n = a.createBufferSource();
  const g = a.createGain();
  const f = a.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  n.buffer = b;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  n.connect(f);
  f.connect(g);
  g.connect(out());
  n.start(t0);
  n.stop(t0 + dur + 0.02);
}

// マウスやキーの「カチッ」
function click(t: number, v: number, pitch = 1) {
  noise(t, 0.012, v, 3800 * pitch, 0, 1.2, 'highpass');
  tone('sine', 2100 * pitch, 900 * pitch, t, 0.018, v * 0.35);
  tone('sine', 180, 90, t, 0.02, v * 0.25);
}

export function sfx(name: Sfx) {
  if (!on || !AC || AC.state !== 'running') return;
  const t = AC.currentTime + 0.005;
  const V = 0.22;
  switch (name) {
    case 'tick':
      if (t - lastTick < 0.05) return;
      lastTick = t;
      click(t, V * 0.55);
      break;
    case 'select':
      // ボタンを押して離す
      click(t, V * 0.6, 0.9);
      click(t + 0.07, V * 0.45, 1.1);
      break;
    case 'menu':
      click(t, V * 0.4, 1.2);
      noise(t, 0.05, V * 0.12, 6000, 0, 0.7, 'highpass');
      break;
    case 'open':
      // ウィンドウが開く「ファッ」
      noise(t, 0.26, V * 0.5, 350, 2600, 1.4, 'bandpass', 0.06);
      tone('sine', 520, 780, t + 0.02, 0.2, V * 0.08, 0.05);
      break;
    case 'close':
      noise(t, 0.2, V * 0.45, 2600, 380, 1.4, 'bandpass', 0.02);
      click(t + 0.17, V * 0.3, 0.8);
      break;
    case 'shade':
      // 窓を巻き上げる「シュッ」
      noise(t, 0.09, V * 0.5, 1200, 5200, 2, 'bandpass', 0.005);
      noise(t + 0.08, 0.06, V * 0.3, 5200, 2400, 2, 'bandpass', 0.003);
      break;
    case 'flip':
      // 紙のカードをめくる
      noise(t, 0.14, V * 0.55, 900, 4200, 0.8, 'bandpass', 0.01);
      tone('sine', 140, 70, t + 0.1, 0.07, V * 0.35);
      break;
    case 'deal':
      noise(t, 0.09, V * 0.35, 2500, 1200, 0.7, 'bandpass', 0.008);
      break;
    case 'drop':
      tone('sine', 220, 110, t, 0.09, V * 0.4);
      noise(t, 0.05, V * 0.25, 800, 0, 1, 'lowpass');
      break;
    case 'coin':
    case 'alert': {
      // ガラスのような「チーン」
      const f = name === 'coin' ? 1318.5 : 987.8;
      [1, 2.76, 5.4].forEach((m, i) => tone('sine', f * m, 0, t, i ? 0.5 / i : 1.1, V * (i ? 0.08 / i : 0.22), 0.003));
      if (name === 'coin') [1, 2.76].forEach((m, i) => tone('sine', 1760 * m, 0, t + 0.09, i ? 0.4 : 1.0, V * (i ? 0.05 : 0.16), 0.003));
      break;
    }
    case 'fanfare': {
      // やわらかい和音のアルペジオ
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        tone('triangle', f, 0, t + i * 0.08, 1.2, V * 0.14, 0.01);
        tone('sine', f * 2, 0, t + i * 0.08, 0.6, V * 0.05, 0.005);
      });
      break;
    }
  }
}

// 起動音（オリジナルの和音。既存OSの起動音は使っていない）。
// ブラウザの決まりで、ユーザーが一度タップ・クリックしたあとでないと鳴らせない。
export async function sfxBoot() {
  if (!on || typeof window === 'undefined') return;
  const a = ctx();
  if (!a) return;
  if (a.state !== 'running') {
    try {
      await a.resume();
    } catch {
      return;
    }
  }
  const t = a.currentTime + 0.03;
  // 残響（ディレイ）
  const out_ = a.createGain();
  out_.gain.value = 0.9;
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const dl = a.createDelay(1);
  dl.delayTime.value = 0.27;
  const fb = a.createGain();
  fb.gain.value = 0.38;
  out_.connect(lp);
  lp.connect(out());
  lp.connect(dl);
  dl.connect(fb);
  fb.connect(dl);
  dl.connect(a.destination);
  const voice = (type: OscillatorType, f: number, t0: number, att: number, dur: number, vol: number, detune = 0) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(out_);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  };
  // ふくらむ和音（C・E・G・B・D）
  [130.81, 261.63, 329.63, 392, 493.88, 587.33].forEach((f, i) => {
    voice('sine', f, t, 0.9, 4.2, i ? 0.022 : 0.03);
    voice('triangle', f, t + 0.05, 1.1, 3.8, 0.008, 7);
  });
  // きらめく上昇音
  [783.99, 1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => {
    const t0 = t + 0.45 + i * 0.17;
    voice('sine', f, t0, 0.01, 1.6, 0.03);
    voice('sine', f * 2.01, t0, 0.01, 0.6, 0.006);
  });
  // 最後の着地音
  voice('sine', 1046.5, t + 1.45, 0.02, 2.4, 0.02);
  voice('sine', 523.25, t + 1.45, 0.05, 2.6, 0.02);
}

export function sfxDeal(n: number) {
  for (let i = 0; i < Math.min(n, 8); i++) setTimeout(() => sfx('deal'), i * 80);
}
