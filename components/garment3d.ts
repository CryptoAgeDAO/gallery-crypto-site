// 服の形の3D（自作）：写真のシルエットから「胴」と「袖」を見分け、
// 胴は楕円の筒、袖は袖の向きに沿った筒として立体にする。正面の写真を前側に、背面の写真を後ろ側に投影して貼る。
// 首まわりや裾は写真で抜けている所がそのまま穴になり、内側は暗い裏地として見える。
import * as THREE from 'three';
import type { Layer } from './GhostMannequin';

type Box = { x0: number; y0: number; x1: number; y1: number; w: number; h: number };
function bbox(L: Layer): Box | null {
  let x0 = L.w, y0 = L.h, x1 = 0, y1 = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.mask[y * L.w + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < x0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const med = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };

// 正面と背面を左右に並べた1枚のテクスチャ（透明＝穴）
function atlas(F: Layer, B: Layer | null) {
  const W = 2048, H = 2048;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const put = (L: Layer, dx: number) => {
    const t = document.createElement('canvas');
    t.width = L.w; t.height = L.h;
    const tx = t.getContext('2d')!;
    const d = tx.createImageData(L.w, L.h);
    for (let i = 0; i < L.mask.length; i++) { d.data[i * 4] = L.data.data[i * 4]; d.data[i * 4 + 1] = L.data.data[i * 4 + 1]; d.data[i * 4 + 2] = L.data.data[i * 4 + 2]; d.data[i * 4 + 3] = L.mask[i]; }
    tx.putImageData(d, 0, 0);
    x.drawImage(t, 0, 0, L.w, L.h, dx, 0, W / 2, H);
  };
  put(F, 0);
  if (B) put(B, W / 2);
  else {
    // 背面がないときは、正面の服の平均色で塗る（形は正面と同じ）
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < F.mask.length; i += 7) if (F.mask[i] > 127) { r += F.data.data[i * 4]; g += F.data.data[i * 4 + 1]; b += F.data.data[i * 4 + 2]; n++; }
    n = Math.max(1, n);
    const t = document.createElement('canvas'); t.width = F.w; t.height = F.h;
    const tx = t.getContext('2d')!;
    const d = tx.createImageData(F.w, F.h);
    for (let i = 0; i < F.mask.length; i++) { const k = i % F.w, j = (i / F.w) | 0; const m = F.mask[j * F.w + (F.w - 1 - k)]; d.data[i * 4] = r / n; d.data[i * 4 + 1] = g / n; d.data[i * 4 + 2] = b / n; d.data[i * 4 + 3] = m; }
    tx.putImageData(d, 0, 0);
    x.drawImage(t, 0, 0, F.w, F.h, W / 2, 0, W / 2, H);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData.mimeType = 'image/png';
  return tex;
}

export type GarmentInfo = { sleeves: number; armpit: boolean };

export function buildGarment(F: Layer, B: Layer | null, heightM: number, depth = 1): { group: THREE.Group; info: GarmentInfo } | null {
  const fb = bbox(F);
  if (!fb) return null;
  const bb = B ? bbox(B) : null;
  const unit = heightM / fb.h; // 画素 → メートル
  const toW = (px: number, py: number) => new THREE.Vector2((px - (fb.x0 + fb.w / 2)) * unit, (fb.y0 + fb.h - py) * unit);
  const toPx = (X: number, Y: number) => ({ px: X / unit + fb.x0 + fb.w / 2, py: fb.y0 + fb.h - Y / unit });
  // 投影：正面は写真の位置そのまま、背面は左右反転して背面写真の枠に合わせる
  const uvF = (X: number, Y: number) => { const { px, py } = toPx(X, Y); return [(px / F.w) * 0.5, 1 - py / F.h]; };
  const uvB = (X: number, Y: number) => {
    const { px, py } = toPx(X, Y);
    if (B && bb) { const rx = (fb.x1 - px) / fb.w, ry = (py - fb.y0) / fb.h; return [0.5 + ((bb.x0 + rx * bb.w) / B.w) * 0.5, 1 - (bb.y0 + ry * bb.h) / B.h]; }
    return [0.5 + ((F.w - 1 - px) / F.w) * 0.5, 1 - py / F.h];
  };

  // ---- シルエットの解析（行ごとの連続区間） ----
  const rows = 220;
  const step = fb.h / rows;
  const M = (x: number, y: number) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < F.w && yi < F.h && F.mask[yi * F.w + xi] > 127; };
  type Run = { a: number; b: number };
  const runs: Run[][] = [];
  for (let j = 0; j <= rows; j++) {
    const y = fb.y0 + j * step;
    const rs: Run[] = [];
    let s = -1;
    for (let x = fb.x0; x <= fb.x1 + 1; x++) { const m = M(x, y); if (m && s < 0) s = x; if (!m && s >= 0) { rs.push({ a: s, b: x - 1 }); s = -1; } }
    runs.push(rs);
  }
  // 胴の中心と幅：下の方（裾）の行から決める
  const low = runs.slice(Math.round(rows * 0.72), Math.round(rows * 0.95));
  const big = low.map((rs) => rs.reduce((m, r) => (r.b - r.a > m.b - m.a ? r : m), { a: 0, b: -1 })).filter((r) => r.b > r.a);
  const cx = med(big.map((r) => (r.a + r.b) / 2)) || fb.x0 + fb.w / 2;
  const hw0 = med(big.map((r) => (r.b - r.a) / 2)) || fb.w / 4;
  // 行ごとの胴の左右（首の切れ込みなど小さなすき間はつなぐ）
  const L = new Float32Array(rows + 1).fill(NaN), R = new Float32Array(rows + 1).fill(NaN);
  for (let j = 0; j <= rows; j++) {
    const near = runs[j].filter((r) => r.b >= cx - hw0 * 1.6 && r.a <= cx + hw0 * 1.6);
    if (!near.length) continue;
    L[j] = Math.min(...near.map((r) => r.a)); R[j] = Math.max(...near.map((r) => r.b));
  }
  // 脇の下：下から上へ見て、幅が急に広がる所
  let arm = -1;
  for (let j = Math.round(rows * 0.9); j > 2; j--) {
    if (isNaN(L[j])) continue;
    const hw = (R[j] - L[j]) / 2;
    if (hw > hw0 * 1.22 && (R[j - 1] - L[j - 1]) / 2 > hw0 * 1.22 && (R[j - 2] - L[j - 2]) / 2 > hw0 * 1.22) { arm = j; break; }
  }
  const capHW = arm >= 0 ? Math.max(hw0, ((R[arm + 2] - L[arm + 2]) / 2 || hw0) * 1.02) : Infinity;
  // 胴の上端（肩・首）
  let top = 0;
  while (top < rows && isNaN(L[top])) top++;
  let bot = rows;
  while (bot > 0 && isNaN(L[bot])) bot--;
  const torsoL = new Float32Array(rows + 1), torsoR = new Float32Array(rows + 1);
  for (let j = top; j <= bot; j++) {
    let l = isNaN(L[j]) ? cx - hw0 : L[j], r = isNaN(R[j]) ? cx + hw0 : R[j];
    if (j <= arm) { l = Math.max(l, cx - capHW); r = Math.min(r, cx + capHW); }
    torsoL[j] = l; torsoR[j] = r;
  }
  // 横方向の左右なめらかに
  for (let it = 0; it < 3; it++) for (let j = top + 1; j < bot; j++) { torsoL[j] = (torsoL[j - 1] + torsoL[j] * 2 + torsoL[j + 1]) / 4; torsoR[j] = (torsoR[j - 1] + torsoR[j] * 2 + torsoR[j + 1]) / 4; }

  // ---- 胴：楕円の筒（上はドームで閉じる。首の穴は写真の抜けで開く） ----
  const SEG = 48; // 半周の分割（前・後ろ それぞれ）
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const ring = (cxW: number, Y: number, a: number, b: number, clampY?: number) => {
    const base = pos.length / 3;
    for (let half = 0; half < 2; half++) {
      for (let s = 0; s <= SEG; s++) {
        const th = (half === 0 ? 0 : Math.PI) + (s / SEG) * Math.PI; // 0..π 前、π..2π 後ろ
        const X = cxW + a * Math.cos(th);
        const Z = b * Math.sin(th);
        pos.push(X, Y, Z);
        const Xs = cxW + a * 0.985 * Math.cos(th);
        const yy = clampY ?? Y;
        const t = half === 0 ? uvF(Xs, yy) : uvB(Xs, yy);
        uv.push(t[0], t[1]);
      }
    }
    return base;
  };
  const link = (r0: number, r1: number) => {
    for (let half = 0; half < 2; half++) {
      const o = half * (SEG + 1);
      for (let s = 0; s < SEG; s++) {
        const a = r0 + o + s, b = a + 1, c = r1 + o + s, d = c + 1;
        // 前側は +Z を向くように（外向き）
        idx.push(a, b, c, b, d, c);
      }
    }
  };
  const depthAt = (j: number) => { const t = (j - top) / Math.max(1, bot - top); return (0.5 + 0.12 * Math.sin(Math.min(1, t * 1.4) * Math.PI)) * depth; };
  let prev = -1;
  const tW = toW(0, fb.y0 + top * step).y;
  for (let j = top; j <= bot; j++) {
    const y = fb.y0 + j * step;
    const w = toW((torsoL[j] + torsoR[j]) / 2, y);
    const a = ((torsoR[j] - torsoL[j]) / 2) * unit;
    const r = ring(w.x, w.y, a, a * depthAt(j));
    if (prev >= 0) link(r, prev);
    prev = r;
  }
  // 肩のドーム：上端の行の模様を引き伸ばして、なで肩に閉じる（首の切れ込みは穴として残る）
  {
    const y = fb.y0 + top * step;
    const w = toW((torsoL[top] + torsoR[top]) / 2, y);
    const a0 = ((torsoR[top] - torsoL[top]) / 2) * unit;
    const b0 = a0 * depthAt(top);
    let p = prev;
    // prev は最後に作った裾の行なので、ドームは別に上から作る
    p = ring(w.x, tW, a0, b0);
    const stepsD = 5;
    let last = p;
    for (let k = 1; k <= stepsD; k++) {
      const f = k / stepsD;
      const r = ring(w.x, tW + a0 * 0.22 * Math.sin(f * Math.PI / 2), a0 * (1 - 0.55 * f), b0 * (1 - 0.85 * f), tW + 0.0001 - unit * 0.5);
      link(last, r);
      last = r;
    }
  }

  // ---- 袖：胴の外側に残った部分を、左右それぞれ筒にする ----
  let sleeves = 0;
  const sleevePts: { x: number; y: number }[][] = [[], []];
  for (let j = top; j <= bot; j++) {
    const y = fb.y0 + j * step;
    for (const r of runs[j]) for (let x = r.a; x <= r.b; x += step) {
      if (x < torsoL[j] - step) sleevePts[0].push({ x, y });
      else if (x > torsoR[j] + step) sleevePts[1].push({ x, y });
    }
  }
  for (let si = 0; si < 2; si++) {
    const P = sleevePts[si];
    if (P.length < 40) continue;
    sleeves++;
    // 主軸（PCA）
    let mx = 0, my = 0;
    for (const p of P) { mx += p.x; my += p.y; }
    mx /= P.length; my /= P.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of P) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let dx = Math.cos(ang), dy = Math.sin(ang);
    // 胴から外へ向かう向きにそろえる
    if ((si === 0 && dx > 0) || (si === 1 && dx < 0)) { dx = -dx; dy = -dy; }
    const nx = -dy, ny = dx;
    let tmin = Infinity, tmax = -Infinity;
    for (const p of P) { const t = (p.x - mx) * dx + (p.y - my) * dy; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
    const NB = 28;
    const lo = new Float32Array(NB).fill(Infinity), hi = new Float32Array(NB).fill(-Infinity);
    for (const p of P) {
      const t = (p.x - mx) * dx + (p.y - my) * dy, s = (p.x - mx) * nx + (p.y - my) * ny;
      const k = Math.min(NB - 1, Math.max(0, Math.floor(((t - tmin) / (tmax - tmin + 1e-6)) * NB)));
      if (s < lo[k]) lo[k] = s; if (s > hi[k]) hi[k] = s;
    }
    const cs: { t: number; c: number; r: number }[] = [];
    for (let k = 0; k < NB; k++) if (hi[k] > lo[k]) cs.push({ t: tmin + ((k + 0.5) / NB) * (tmax - tmin), c: (lo[k] + hi[k]) / 2, r: (hi[k] - lo[k]) / 2 });
    if (cs.length < 3) continue;
    for (let it = 0; it < 2; it++) for (let k = 1; k < cs.length - 1; k++) { cs[k].c = (cs[k - 1].c + cs[k].c * 2 + cs[k + 1].c) / 4; cs[k].r = (cs[k - 1].r + cs[k].r * 2 + cs[k + 1].r) / 4; }
    // 付け根を胴の中に少しもぐらせる
    const first = cs[0];
    cs.unshift({ t: first.t - first.r * 0.9, c: first.c, r: first.r * 0.95 });
    let last = -1;
    for (const q of cs) {
      const px = mx + dx * q.t + nx * q.c, py = my + dy * q.t + ny * q.c;
      const w = toW(px, py);
      const base = pos.length / 3;
      const rr = q.r * unit, rz = rr * 0.78 * depth;
      const ex = nx * unit, ey = -ny * unit; // 画面の y は下向きなので反転
      const len = Math.hypot(ex, ey) || 1;
      for (let half = 0; half < 2; half++)
        for (let s = 0; s <= SEG / 2; s++) {
          const th = (half === 0 ? 0 : Math.PI) + (s / (SEG / 2)) * Math.PI;
          const X = w.x + (ex / len) * rr * Math.cos(th), Y = w.y + (ey / len) * rr * Math.cos(th), Z = rz * Math.sin(th);
          pos.push(X, Y, Z);
          const Xs = w.x + (ex / len) * rr * 0.97 * Math.cos(th), Ys = w.y + (ey / len) * rr * 0.97 * Math.cos(th);
          const t = half === 0 ? uvF(Xs, Ys) : uvB(Xs, Ys);
          uv.push(t[0], t[1]);
        }
      if (last >= 0) {
        const n = SEG / 2;
        for (let half = 0; half < 2; half++) {
          const o = half * (n + 1);
          for (let s = 0; s < n; s++) {
            const a = last + o + s, b = a + 1, c = base + o + s, d = c + 1;
            idx.push(a, c, b, b, c, d);
          }
        }
      }
      last = base;
    }
  }

  // 三角形の向きを外向きにそろえる
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 床に立つように
  g.computeBoundingBox();
  const yMin = g.boundingBox!.min.y;
  g.translate(0, -yMin, 0);

  const tex = atlas(F, B);
  const outer = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.88, side: THREE.FrontSide }));
  outer.name = 'garment';
  const inner = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, color: 0x34302c, alphaTest: 0.5, roughness: 1, side: THREE.BackSide }));
  inner.name = 'lining';
  const group = new THREE.Group();
  group.add(outer, inner);
  return { group, info: { sleeves, armpit: arm >= 0 } };
}
