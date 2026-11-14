// 写真の形どおりの型紙：切り抜いた服の輪郭をそのままなぞって、前身頃・後身頃・袖の型紙にする。
// 決まった型（ブロック）に当てはめるのではなく、裾の広がり、肩の傾き、衿ぐりの形、袖の細り方まで写真に合わせる。
import type { Layer } from './GhostMannequin';

export type Pt = [number, number];
export type Traced = {
  front: Pt[]; // 半身（x=0 が中心）。cm、y は肩の高さが 0、下向き
  back: Pt[];
  sleeve: Pt[] | null; // 全体（中心線 x=0）
  armLen: number;
  neckF: Pt[]; neckB: Pt[];
  hemY: number; sideTop: Pt; length: number; halfHem: number; halfChest: number;
  sleeveLen: number; cuffHalf: number;
  // 写真の座標との対応（プレビュー用）
  px: { cx: number; top: number; k: number; S: Pt; dir: Pt; armPx: number; capPx: number; tmax: number };
};

const smooth = (a: number[], r: number) => a.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - r); j <= Math.min(a.length - 1, i + r); j++) if (isFinite(a[j])) { s += a[j]; n++; } return n ? s / n : a[i]; });
const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 14): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; });
export const plen = (a: Pt[]) => a.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) : 0), 0);

export type Geo = { cx: number; top: number; bot: number; arm: number; capPx: number; k: number; M: (x: number, y: number) => boolean; L: (y: number) => number; R: (y: number) => number; x0: number; x1: number };
export function geo(F: Layer, lengthCm: number): Geo | null {
  let x0 = F.w, y0 = F.h, x1 = 0, y1 = 0;
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) if (F.mask[y * F.w + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0) return null;
  const M = (x: number, y: number) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < F.w && yi < F.h && F.mask[yi * F.w + xi] > 127; };
  const runsAt = (y: number) => { const rs: [number, number][] = []; let s = -1; for (let x = x0; x <= x1 + 1; x++) { const m = M(x, y); if (m && s < 0) s = x; if (!m && s >= 0) { rs.push([s, x - 1]); s = -1; } } return rs; };
  const med = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };
  const H = y1 - y0;
  const low: [number, number][] = [];
  for (let f = 0.72; f < 0.95; f += 0.01) { const rs = runsAt(y0 + H * f); const b = rs.reduce((m, r) => (r[1] - r[0] > m[1] - m[0] ? r : m), [0, -1] as [number, number]); if (b[1] > b[0]) low.push(b); }
  const cx = med(low.map((r) => (r[0] + r[1]) / 2)) || (x0 + x1) / 2;
  const hw0 = med(low.map((r) => (r[1] - r[0]) / 2)) || (x1 - x0) / 4;
  const ext = (y: number): [number, number] | null => { const near = runsAt(y).filter((r) => r[1] >= cx - hw0 * 1.6 && r[0] <= cx + hw0 * 1.6); return near.length ? [Math.min(...near.map((r) => r[0])), Math.max(...near.map((r) => r[1]))] : null; };
  let top = y0; while (top < y1 && !ext(top)) top++;
  let bot = y1; while (bot > top && !ext(bot)) bot--;
  // 脇の下：下から上に、幅が急に広がる所
  let arm = -1;
  for (let y = top + (bot - top) * 0.85; y > top + 4; y -= 1) {
    const w = (yy: number) => { const e = ext(yy); return e ? (e[1] - e[0]) / 2 : 0; };
    if (w(y) > hw0 * 1.22 && w(y - 2) > hw0 * 1.22 && w(y - 4) > hw0 * 1.22) { arm = y; break; }
  }
  const armY = arm >= 0 ? arm + 3 : top + (bot - top) * 0.32;
  const ea = ext(armY + 3);
  const capPx = ea ? Math.max(hw0, ((ea[1] - ea[0]) / 2) * 1.01) : hw0 * 1.05;
  const k = lengthCm / (bot - top);
  return { cx, top, bot, arm: armY, capPx, k, M, x0, x1, L: (y) => { const e = ext(y); return e ? e[0] : cx - hw0; }, R: (y) => { const e = ext(y); return e ? e[1] : cx + hw0; } };
}

// 半身の輪郭（中心→衿ぐり→肩→袖ぐり→脇→裾→中心）
function halfBody(g: Geo, back: boolean, neckBackDepth = 2): { line: Pt[]; neck: Pt[]; arm: Pt[]; hemY: number; halfHem: number; halfChest: number; sideTop: Pt } {
  const { cx, top, bot, arm, capPx, k, M } = g;
  const N = 40;
  // 上の輪郭（列ごとの一番上）。左右の平均
  const topY: number[] = [];
  for (let i = 0; i <= N; i++) {
    const d = (capPx * i) / N;
    const col = (x: number) => { for (let y = top; y < arm; y++) if (M(x, y)) return y; return arm; };
    topY.push((col(cx + d) + col(cx - d)) / 2);
  }
  const ts = smooth(topY, 1);
  // 衿ぐり：中心がどこまで下がっているか
  let nd = ts[0] - top;
  let nwI = 0;
  for (let i = 0; i <= N; i++) if (ts[i] <= top + (ts[0] - top) * 0.15) { nwI = i; break; }
  if (nd * k < 2.5 || nwI === 0) { nd = 8 / k; nwI = Math.round(((9 / k) / capPx) * N); } // 衿が写っていないときは標準のクルー
  const nw = (capPx * nwI) / N;
  // 肩先：袖ぐりの始まり。上の輪郭の、身幅の約9割の位置
  const shI = Math.round(N * 0.86), sw = (capPx * shI) / N, sy = ts[shI];
  const depth = back ? neckBackDepth / k : nd;
  const neck = bez([0, depth], [nw * 0.55, depth], [nw, depth * 0.45], [nw, 0], 12).map((p) => [p[0], p[1] + (ts[nwI] - top)] as Pt);
  const shoulder: Pt[] = [];
  for (let i = nwI + 1; i <= shI; i++) shoulder.push([(capPx * i) / N, ts[i] - top]);
  const armPts = bez([sw, sy - top], [sw - capPx * 0.02, sy - top + (arm - sy) * 0.45], [capPx - capPx * 0.08, arm - top], [capPx, arm - top], 14);
  // 脇：脇の下から裾まで、輪郭の左右の平均
  const side: Pt[] = [];
  const steps = 30;
  const sw2: number[] = [];
  for (let i = 0; i <= steps; i++) { const y = arm + ((bot - 2 - arm) * i) / steps; sw2.push(Math.min(capPx * 1.25, ((g.R(y) - cx) + (cx - g.L(y))) / 2)); }
  const swS = smooth(sw2, 2);
  for (let i = 0; i <= steps; i++) side.push([swS[i], arm + ((bot - 2 - arm) * i) / steps - top]);
  // 裾：列ごとの一番下
  const hem: Pt[] = [];
  const hw = swS[steps];
  const bl: number[] = [];
  for (let i = 0; i <= 20; i++) {
    const d = (hw * (20 - i)) / 20;
    const col = (x: number) => { for (let y = bot; y > arm; y--) if (M(x, y)) return y; return bot; };
    bl.push((col(cx + d) + col(cx - d)) / 2 - top);
  }
  const blS = smooth(bl, 1);
  for (let i = 0; i <= 20; i++) hem.push([(hw * (20 - i)) / 20, blS[i]]);
  const line: Pt[] = [[0, hem[hem.length - 1][1]], ...neck, ...shoulder, ...armPts.slice(1), ...side.slice(1), ...hem.slice(1, -1)];
  const toCm = (p: Pt): Pt => [p[0] * k, p[1] * k];
  return { line: line.map(toCm), neck: neck.map(toCm), arm: armPts.map(toCm), hemY: (bot - top) * k, halfHem: hw * k, halfChest: capPx * k, sideTop: toCm([capPx, arm - top]) };
}

export function trace(F: Layer, lengthCm: number, B?: Layer | null): Traced | null {
  const g = geo(F, lengthCm);
  if (!g) return null;
  const f = halfBody(g, false);
  let b = halfBody(g, true);
  if (B) { const gb = geo(B, lengthCm); if (gb) b = halfBody(gb, true); }
  // 袖：胴の外の部分を、肩先から袖口へ向かう軸で測る
  const { cx, top, bot, arm, capPx, k, M, x0, x1 } = g;
  const pts: Pt[] = [];
  for (let y = top; y <= bot; y += 2) for (let x = x0; x <= x1; x += 2) {
    if (!M(x, y)) continue;
    const lim = y <= arm ? capPx : Math.max(capPx, ((g.R(y) - g.L(y)) / 2));
    if (x > cx + lim + 2) pts.push([x, y]); else if (x < cx - lim - 2) pts.push([2 * cx - x, y]);
  }
  let sleeve: Pt[] | null = null, sleeveLen = 0, cuffHalf = 0, tmaxPx = 0;
  const S: Pt = [cx + capPx * 0.9, top + (arm - top) * 0.12];
  let dir: Pt = [1, 0.6];
  if (pts.length > 80) {
    let far = pts[0], fd = 0;
    for (const p of pts) { const d = (p[0] - S[0]) ** 2 + (p[1] - S[1]) ** 2; if (d > fd) { fd = d; far = p; } }
    const len = Math.sqrt(fd);
    let fx = 0, fy = 0, fn = 0;
    for (const p of pts) if (Math.hypot(p[0] - far[0], p[1] - far[1]) < len * 0.35) { fx += p[0]; fy += p[1]; fn++; }
    const tip: Pt = [fx / fn, fy / fn];
    const dl = Math.hypot(tip[0] - S[0], tip[1] - S[1]) || 1;
    dir = [(tip[0] - S[0]) / dl, (tip[1] - S[1]) / dl];
    const nx = -dir[1], ny = dir[0];
    let tmax = 0;
    for (const p of pts) tmax = Math.max(tmax, (p[0] - S[0]) * dir[0] + (p[1] - S[1]) * dir[1]);
    tmaxPx = tmax;
    const NB = 24, lo = new Array(NB).fill(Infinity), hi = new Array(NB).fill(-Infinity);
    for (const p of pts) { const t = (p[0] - S[0]) * dir[0] + (p[1] - S[1]) * dir[1]; if (t < 0) continue; const bI = Math.min(NB - 1, Math.floor((t / (tmax + 1e-6)) * NB)); const sv = (p[0] - S[0]) * nx + (p[1] - S[1]) * ny; lo[bI] = Math.min(lo[bI], sv); hi[bI] = Math.max(hi[bI], sv); }
    const w = Array.from({ length: NB }, (_, i) => (hi[i] > lo[i] ? (hi[i] - lo[i]) * k : NaN));
    const ws = smooth(w, 1);
    // 一番広い所を袖幅（袖山の下）とし、そこから袖口までの細り方を写真どおりに
    let bi = 0;
    for (let i = 0; i < NB - 2; i++) if ((ws[i] || 0) > (ws[bi] || 0)) bi = i;
    const bw = Math.max(ws[bi] || 0, f.halfChest * 0.55);
    const AH = (plen(f.arm) + plen(b.arm)) / 2;
    const capCurve = (h: number) => bez([0, 0], [bw * 0.18, 0], [bw * 0.38, h * 0.7], [bw, h], 16);
    let a = 1, z = 25;
    for (let i = 0; i < 30; i++) { const h = (a + z) / 2; if (plen(capCurve(h)) > AH + 0.8) z = h; else a = h; }
    const capH = (a + z) / 2;
    const cap = capCurve(capH);
    const rest = tmax * k - (bi / NB) * tmax * k;
    // 袖口：先の方の区間で一番広い幅（斜めに置かれた袖でも小さくなりすぎないように）
    let cuffW = 0;
    for (let i = Math.floor(NB * 0.65); i < NB; i++) if (isFinite(ws[i])) cuffW = Math.max(cuffW, ws[i]);
    cuffW = Math.min(bw, Math.max(cuffW, bw * 0.6));
    const right: Pt[] = [...cap];
    const n = 8;
    for (let i = 1; i <= n; i++) { const t = i / n; right.push([bw + (cuffW - bw) * t, capH + rest * t]); }
    sleeveLen = right[right.length - 1][1];
    cuffHalf = right[right.length - 1][0];
    sleeve = [...[...right].reverse().map((p) => [-p[0], p[1]] as Pt).slice(0, -1), ...right];
  }
  return {
    front: f.line, back: b.line, sleeve, armLen: (plen(f.arm) + plen(b.arm)) / 2, neckF: f.neck, neckB: b.neck,
    hemY: f.hemY, sideTop: f.sideTop, length: lengthCm, halfHem: f.halfHem, halfChest: f.halfChest, sleeveLen, cuffHalf,
    px: { cx, top, k, S, dir, armPx: arm, capPx, tmax: tmaxPx },
  };
}
