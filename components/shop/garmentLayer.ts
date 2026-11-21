// 画像（切り抜きの絵・写真）から、服の立体化に使う切り抜きをつくる（レールとショールームで共通）
import { segment } from '../scanSegment';
import type { Layer } from '../GhostMannequin';

import { isPhone } from '@/lib/device';
const MAXPX = typeof window !== 'undefined' && isPhone() ? 420 : 640;
function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}
// 画像 → 服の切り抜き（透明のある絵はその透明を、写真は背景を抜く）
export async function layerOf(src: string): Promise<Layer | null> {
  const im = await load(src); if (!im || !im.naturalWidth) return null;
  const k = Math.min(1, MAXPX / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.max(2, Math.round(im.naturalWidth * k)), h = Math.max(2, Math.round(im.naturalHeight * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(im, 0, 0, w, h);
  let data: ImageData; try { data = g.getImageData(0, 0, w, h); } catch { return null; }
  const L: Layer = { img: c, data, mask: new Uint8ClampedArray(w * h), w, h };
  const a = data.data, corners = [0, w - 1, (h - 1) * w, h * w - 1].reduce((s, i) => s + a[i * 4 + 3], 0) / 4;
  if (corners < 20) { for (let i = 0; i < w * h; i++) L.mask[i] = a[i * 4 + 3] > 110 ? 255 : 0; }
  else { L.mask.fill(255); segment(L, 9); }
  return L;
}
export function bboxOf(L: Layer) {
  let x0 = L.w, y0 = L.h, x1 = 0, y1 = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.mask[y * L.w + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < x0 ? null : { fx: x0 / L.w, fy: y0 / L.h, fw: (x1 - x0 + 1) / L.w };
}

