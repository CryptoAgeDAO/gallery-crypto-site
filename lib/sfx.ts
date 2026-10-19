// 8ビット風の効果音（ブラウザで合成。音源ファイルは使わない）。
// 最初のタップのあとから鳴る（ブラウザの決まり）。ON/OFF は localStorage に保存。
export type Sfx = 'tick' | 'select' | 'open' | 'flip' | 'close' | 'coin' | 'deal' | 'fanfare';

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

function tone(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number) {
  const a = AC!;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise(t0: number, dur: number, vol: number) {
  const a = AC!;
  const b = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const n = a.createBufferSource();
  const g = a.createGain();
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 2200;
  n.buffer = b;
  g.gain.value = vol;
  n.connect(f);
  f.connect(g);
  g.connect(a.destination);
  n.start(t0);
}

export function sfx(name: Sfx) {
  if (!on || !AC || AC.state !== 'running') return;
  const t = AC.currentTime + 0.005;
  const V = 0.045;
  switch (name) {
    case 'tick':
      if (t - lastTick < 0.07) return;
      lastTick = t;
      tone('square', 1568, 0, t, 0.03, V * 0.5);
      break;
    case 'select':
      tone('square', 784, 0, t, 0.045, V);
      tone('square', 1175, 0, t + 0.045, 0.07, V);
      break;
    case 'open':
      [392, 523, 659, 784, 1047].forEach((f, i) => tone('square', f, 0, t + i * 0.045, 0.07, V));
      tone('triangle', 1047, 2093, t + 0.23, 0.22, V * 0.9);
      noise(t + 0.23, 0.12, V * 0.5);
      break;
    case 'flip':
      tone('square', 1100, 220, t, 0.11, V * 0.7);
      noise(t, 0.09, V * 0.7);
      break;
    case 'close':
      tone('square', 660, 330, t, 0.08, V * 0.6);
      break;
    case 'coin':
      tone('square', 1175, 0, t, 0.06, V);
      tone('square', 1760, 0, t + 0.06, 0.28, V);
      break;
    case 'deal':
      tone('triangle', 330, 990, t, 0.05, V * 0.55);
      break;
    case 'fanfare': {
      let x = t;
      ([[784, 0.09], [1047, 0.09], [1319, 0.09], [1568, 0.18], [1319, 0.09], [1568, 0.45]] as [number, number][]).forEach(([f, d]) => {
        tone('square', f, 0, x, d * 0.92, V);
        tone('triangle', f / 2, 0, x, d * 0.92, V * 0.9);
        x += d;
      });
      noise(x - 0.45, 0.3, V * 0.4);
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
  const out = a.createGain();
  out.gain.value = 0.9;
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const dl = a.createDelay(1);
  dl.delayTime.value = 0.27;
  const fb = a.createGain();
  fb.gain.value = 0.38;
  out.connect(lp);
  lp.connect(a.destination);
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
    g.connect(out);
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
