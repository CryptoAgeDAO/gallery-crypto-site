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

export function sfxDeal(n: number) {
  for (let i = 0; i < Math.min(n, 8); i++) setTimeout(() => sfx('deal'), i * 80);
}
