// 目印の自動配置。基本は pattern.ts の detectLandmarks、袖口だけ「袖の上側の端」「下側の端」で取り直す。
import type { Layer } from '../GhostMannequin';
import { detectLandmarks, type Landmarks } from '../pattern';
import type { Pt } from './draft';

export function autoLandmarks(F: Layer): Landmarks | null {
  const lm = detectLandmarks(F);
  if (!lm) return null;
  const { w, h, mask } = F;
  // 右袖の画素：胴の右端（脇の下の x）より外、脇の下より少し下まで
  const xs = Math.round(Math.max(lm.AR[0], lm.SR[0]) + 3), yMax = lm.AR[1] + (lm.HR[1] - lm.AR[1]) * 0.08;
  const pts: Pt[] = [];
  const st = Math.max(1, Math.round(Math.max(w, h) / 500));
  for (let y = 0; y < Math.min(h, yMax); y += st) for (let x = xs; x < w; x += st) if (mask[y * w + x] > 127) pts.push([x, y]);
  if (pts.length < 60) { lm.hasSleeves = false; return lm; }
  // 袖の向き：肩先と脇の下の中点から、一番遠い袖の画素へ
  const mx = (lm.SR[0] + lm.AR[0]) / 2, my = (lm.SR[1] + lm.AR[1]) / 2;
  let far = pts[0], fd = 0;
  for (const p of pts) { const d = (p[0] - mx) ** 2 + (p[1] - my) ** 2; if (d > fd) { fd = d; far = p; } }
  const fl = Math.sqrt(fd) || 1;
  const ax = (far[0] - mx) / fl, ay = (far[1] - my) / fl;
  const nx = -ay, ny = ax; // 下側が +
  const s0 = (p: Pt) => (p[0] - mx) * nx + (p[1] - my) * ny;
  const pr = (p: Pt) => (p[0] - mx) * ax + (p[1] - my) * ay;
  let co: Pt | null = null, ci: Pt | null = null, bo = -Infinity, bi = -Infinity;
  for (const p of pts) { const v = pr(p); if (s0(p) < 0) { if (v > bo) { bo = v; co = p; } } else if (v > bi) { bi = v; ci = p; } }
  // 凸包の角（とがった頂点）を袖口の2つの角とみなす。まっすぐ裁った袖口に強い
  const hull = convexHull(pts);
  const size = Math.hypot(...hull.reduce((m, p) => [Math.max(m[0], Math.abs(p[0] - mx)), Math.max(m[1], Math.abs(p[1] - my))], [0, 0]));
  const simp = simplifyClosed(hull, size * 0.04);
  const cand = simp.map((p, i) => {
    const a = simp[(i - 1 + simp.length) % simp.length], b = simp[(i + 1) % simp.length];
    const v1 = [p[0] - a[0], p[1] - a[1]], v2 = [b[0] - p[0], b[1] - p[1]];
    const turn = Math.abs(Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]));
    return { p, turn };
  }).filter((c) => c.p[0] > xs + size * 0.12 && Math.hypot(c.p[0] - mx, c.p[1] - my) > fl * 0.4).sort((x, y) => y.turn - x.turn);
  if (cand.length >= 2 && cand[1].turn > 0.6) {
    const [u, v] = [cand[0].p, cand[1].p];
    [co, ci] = s0(u) < s0(v) ? [u, v] : [v, u];
  }
  if (!co || !ci) return lm;
  // 袖が胴に比べて短すぎる（肩の張り出しを拾った）ときは袖なし扱い
  const len = Math.hypot((co[0] + ci[0]) / 2 - lm.SR[0], (co[1] + ci[1]) / 2 - lm.SR[1]);
  if (len < Math.abs(lm.AR[0] - lm.AL[0]) * 0.12) { lm.hasSleeves = false; return lm; }
  lm.CO = co; lm.CI = ci; lm.hasSleeves = true;
  return lm;
}

function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function simplifyClosed(h: Pt[], tol: number): Pt[] {
  // 近すぎる頂点をまとめ、ほぼ一直線の頂点を外す
  let out = h.filter((p, i) => i === 0 || Math.hypot(p[0] - h[i - 1][0], p[1] - h[i - 1][1]) > tol * 0.5);
  for (let changed = true; changed && out.length > 3;) {
    changed = false;
    for (let i = 0; i < out.length && out.length > 3; i++) {
      const a = out[(i - 1 + out.length) % out.length], p = out[i], b = out[(i + 1) % out.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
      if (d < tol) { out = out.slice(0, i).concat(out.slice(i + 1)); changed = true; break; }
    }
  }
  return out;
}
