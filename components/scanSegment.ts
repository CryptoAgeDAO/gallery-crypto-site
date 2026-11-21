// スマートスキャンと3Dレールで共通に使う、服の切り抜き
import { tidy, type Layer } from './GhostMannequin';

// 背景の切り抜き（スキャン向け）：四辺の色を背景とみなして外側から塗り広げるが、
// 輪郭（明るさの段差）は越えない。服と背景の色が近くても、服の内側まで食い込みにくい。
export function segment(L: Layer, tol: number) {
  const W = Math.min(420, L.w), k = W / L.w, H = Math.round(L.h * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.filter = 'blur(1px)'; g.drawImage(L.img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, n = W * H;
  const lum = new Float32Array(n); for (let i = 0; i < n; i++) lum[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
  const edge = new Float32Array(n);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = lum[i - W + 1] + 2 * lum[i + 1] + lum[i + W + 1] - lum[i - W - 1] - 2 * lum[i - 1] - lum[i + W - 1];
    const gy = lum[i + W - 1] + 2 * lum[i + W] + lum[i + W + 1] - lum[i - W - 1] - 2 * lum[i - W] - lum[i - W + 1];
    edge[i] = Math.hypot(gx, gy);
  }
  // 背景色：四辺の中央値
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const at = (i: number) => { rs.push(d[i * 4]); gs.push(d[i * 4 + 1]); bs.push(d[i * 4 + 2]); };
  for (let x = 0; x < W; x++) { at(x); at((H - 1) * W + x); } for (let y = 0; y < H; y++) { at(y * W); at(y * W + W - 1); }
  const md = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  const br = md(rs), bg = md(gs), bb = md(bs);
  const T = 10 + tol * 2.2, E = 26 + tol * 2.5;
  const bgm = new Uint8Array(n), st: number[] = [];
  const push = (i: number) => { if (bgm[i]) return; const dr = d[i * 4] - br, dg = d[i * 4 + 1] - bg, db = d[i * 4 + 2] - bb; if (Math.sqrt(dr * dr + dg * dg + db * db) < T && edge[i] < E) { bgm[i] = 1; st.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); } for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (st.length) { const i = st.pop()!, x = i % W; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < n - W) push(i + W); }
  // 一番大きな塊だけ残し、中の穴は埋める
  const lab = new Int32Array(n).fill(-1), sizes: number[] = []; let bestN = 0, id = 0;
  for (let s0 = 0; s0 < n; s0++) {
    if (bgm[s0] || lab[s0] >= 0) continue;
    let cnt = 0; const q = [s0]; lab[s0] = id;
    while (q.length) { const i = q.pop()!; cnt++; const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && !bgm[j] && lab[j] < 0) { lab[j] = id; q.push(j); } }
    sizes.push(cnt); if (cnt > bestN) bestN = cnt; id++;
  }
  // 縫い目などで切れた袖も拾う：大きめの塊はすべて残し、すき間を閉じる
  let keep: Uint8Array = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (lab[i] >= 0 && sizes[lab[i]] > bestN * 0.04) keep[i] = 1;
  const morph = (m: Uint8Array, grow: boolean) => { const o = new Uint8Array(n); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = grow ? 0 : 1; for (let dy = -2; dy <= 2 && (grow ? !v : v); dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; const b = yy >= 0 && yy < H && xx >= 0 && xx < W ? m[yy * W + xx] : 0; if (grow && b) { v = 1; break; } if (!grow && !b) { v = 0; break; } } o[y * W + x] = v; } return o; };
  keep = morph(morph(keep, true), false);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const og = out.getContext('2d')!, od = og.createImageData(W, H);
  for (let i = 0; i < n; i++) od.data[i * 4 + 3] = keep[i] ? 255 : 0;
  og.putImageData(od, 0, 0);
  const big = document.createElement('canvas'); big.width = L.w; big.height = L.h;
  const bgc = big.getContext('2d', { willReadFrequently: true })!; bgc.drawImage(out, 0, 0, L.w, L.h);
  const a = bgc.getImageData(0, 0, L.w, L.h).data;
  for (let i = 0; i < L.mask.length; i++) L.mask[i] = a[i * 4 + 3] > 127 ? 255 : 0;
  tidy(L.mask, L.w, L.h);
}

