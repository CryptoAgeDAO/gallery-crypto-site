// 画像の読み込みを、同時に数枚ずつに絞る（スマホのメモリ対策）。同じ画像は一度だけ読み込んで使い回す。
// 布の陰影を描く SVG は、一枚ずつ描くのに大きな作業用のメモリを使うので、iPhone で一度に何十枚も描くとブラウザが落ちる。
import { isPhone } from './device';

const cache = new Map<string, Promise<HTMLImageElement | null>>();
let running = 0;
const waiting: (() => void)[] = [];
const limit = () => (isPhone() ? 2 : 6);
const next = () => { while (running < limit() && waiting.length) { running++; waiting.shift()!(); } };

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  let p = cache.get(src);
  if (p) return p;
  p = new Promise((res) => {
    waiting.push(() => {
      const im = new Image(); if (!src.startsWith('data:')) im.crossOrigin = 'anonymous';
      const done = (v: HTMLImageElement | null) => { running--; res(v); setTimeout(next, 0); };
      im.onload = () => { (im.decode ? im.decode().catch(() => undefined) : Promise.resolve()).then(() => done(im)); };
      im.onerror = () => done(null);
      im.src = src;
    });
    next();
  });
  cache.set(src, p);
  // 使い回しは最近の60枚まで
  if (cache.size > (isPhone() ? 16 : 60)) { const k = cache.keys().next().value; if (k !== undefined) cache.delete(k); }
  return p;
}
