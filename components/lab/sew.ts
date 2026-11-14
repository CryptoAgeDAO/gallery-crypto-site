// 仮想縫製：型紙のパーツを三角形の布にして、ボディのまわりに置き、縫い合わせ（シーム）を引き寄せて着せる。
// 位置ベースの布シミュレーション（PBD）。単位は cm、y が上。
import Delaunator from 'delaunator';
import { plen, type PatternDoc, type PieceDef, type Pt, type Role } from './draft';

export type Body = {
  Y0: number; a: number; b: number; // 肩の高さ、胸の楕円の半径
  armDir: number; // 腕の角度（縦から、ラジアン）
  arms: { p0: [number, number, number]; p1: [number, number, number]; r: number }[];
};

export type MeshPiece = {
  id: string; role: Role;
  off: number; n: number; // 全体の頂点配列での位置
  uv2d: Float32Array; // 型紙上の座標（cm）
  tris: Uint32Array;
  edgeIdx: Record<string, number[]>;
};

export type Sim = {
  pos: Float32Array; prev: Float32Array; inv: Float32Array;
  cons: Float32Array; // i, j, rest, stiff
  seams: Float32Array; // i, j, d0
  pieces: MeshPiece[];
  body: Body;
  step: number;
};

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function resample(pts: Pt[], n: number): Pt[] {
  const L = plen(pts);
  if (L < 1e-6) return Array.from({ length: n + 1 }, () => pts[0]);
  const out: Pt[] = [];
  let seg = 0, acc = 0;
  for (let k = 0; k <= n; k++) {
    const t = (L * k) / n;
    while (seg < pts.length - 2 && acc + dist(pts[seg], pts[seg + 1]) < t) { acc += dist(pts[seg], pts[seg + 1]); seg++; }
    const sl = dist(pts[seg], pts[seg + 1]) || 1, u = Math.min(1, Math.max(0, (t - acc) / sl));
    out.push([pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * u, pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * u]);
  }
  return out;
}

function inside(poly: Pt[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segDist(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

// 布の目の細かさ h（cm）
export function meshPattern(doc: PatternDoc, h: number) {
  const segs: Record<string, number> = {};
  const key = (p: string, e: string) => `${p}/${e}`;
  const find = (p: string, e: string) => doc.pieces.find((q) => q.id === p)?.edges.find((x) => x.name === e);
  for (const pc of doc.pieces) for (const e of pc.edges) segs[key(pc.id, e.name)] = Math.max(1, Math.round(plen(e.pts) / h));
  for (let it = 0; it < 3; it++) for (const s of doc.seams) {
    const A = key(...s.a), B = key(...s.b);
    if (!(A in segs) || !(B in segs)) continue;
    const m = Math.max(segs[A], segs[B]);
    segs[A] = segs[B] = m;
  }
  const out: { pc: PieceDef; pts: Pt[]; tris: number[]; edgeIdx: Record<string, number[]> }[] = [];
  for (const pc of doc.pieces) {
    const bnd: Pt[] = [];
    const edgeIdx: Record<string, number[]> = {};
    pc.edges.forEach((e, j) => {
      const r = resample(e.pts, segs[key(pc.id, e.name)]);
      const idx: number[] = [];
      r.forEach((p, i) => {
        if (i === 0 && j > 0) { idx.push(bnd.length - 1); return; }
        if (i === r.length - 1 && j === pc.edges.length - 1 && dist(p, bnd[0]) < h * 0.3) { idx.push(0); return; }
        bnd.push(p); idx.push(bnd.length - 1);
      });
      edgeIdx[e.name] = idx;
    });
    const poly = bnd;
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pts: Pt[] = poly.slice();
    const rh = h * 0.866;
    for (let r = 0, y = y0 + rh / 2; y < y1; y += rh, r++) for (let x = x0 + (r % 2 ? h / 2 : 0); x < x1; x += h) {
      if (!inside(poly, x, y)) continue;
      let md = Infinity;
      for (let i = 0; i < poly.length && md > h * 0.55; i++) md = Math.min(md, segDist([x, y], poly[i], poly[(i + 1) % poly.length]));
      if (md > h * 0.55) pts.push([x, y]);
    }
    const D = new Delaunator(pts.flat());
    const tris: number[] = [];
    for (let t = 0; t < D.triangles.length; t += 3) {
      const a = D.triangles[t], b = D.triangles[t + 1], c = D.triangles[t + 2];
      const cx = (pts[a][0] + pts[b][0] + pts[c][0]) / 3, cy = (pts[a][1] + pts[b][1] + pts[c][1]) / 3;
      if (!inside(poly, cx, cy)) continue;
      // 境界の点だけでできた細長い三角形（衿ぐりのくぼみをまたぐ等）を除く
      const ab = dist(pts[a], pts[b]), bc = dist(pts[b], pts[c]), ca = dist(pts[c], pts[a]);
      if (Math.max(ab, bc, ca) > h * 2.6) continue;
      tris.push(a, b, c);
    }
    out.push({ pc, pts, tris, edgeIdx });
  }
  return out;
}

export function makeBody(chestHalf: number, shoulderX: number): Body {
  const Cb = Math.max(72, Math.min(116, chestHalf * 4 - 16));
  const a = Cb / (2 * Math.PI * 0.863), b = a * 0.7;
  const Y0 = 145, ang = 0.62;
  const arms = [1, -1].map((s) => {
    const jx = s * Math.min(Math.max(a * 1.12, shoulderX * 0.8), a * 1.35);
    const p0: [number, number, number] = [jx, Y0 - 5, 0];
    const p1: [number, number, number] = [jx + s * Math.sin(ang) * 58, Y0 - 5 - Math.cos(ang) * 58, 0];
    return { p0, p1, r: 5 };
  });
  return { Y0, a, b, armDir: ang, arms };
}

// 胴の断面（高さ y の楕円の半径）
export function torso(B: Body, y: number): [number, number] | null {
  const t = B.Y0 - y;
  if (t < 7 || t > 86) return null;
  const k = t < 25 ? 0.96 + (t - 7) * 0.0022 : t < 45 ? 1 - ((t - 25) / 20) * 0.12 : 0.88 + Math.min(1, (t - 45) / 25) * 0.14;
  return [B.a * k, B.b * k * (t < 25 ? 0.96 : 1)];
}

function collide(B: Body, p: Float32Array, i: number, m = 0.6) {
  let x = p[i], y = p[i + 1], z = p[i + 2];
  // 胴
  const e = torso(B, y);
  if (e) {
    const A = e[0] + m, C = e[1] + m, q = Math.hypot(x / A, z / C);
    if (q < 1) { const s = q < 1e-4 ? 1 : 1 / q; x *= s; z *= s; if (q < 1e-4) z = C; }
  }
  // 肩（楕円体）
  {
    const cx = 0, cy = B.Y0 - 7, rx = B.a * 1.16 + m, ry = 8 + m, rz = B.b * 0.98 + m;
    const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = z / rz, q = Math.hypot(dx, dy, dz);
    if (q < 1 && y > cy - 2) { const s = 1 / Math.max(q, 1e-4); x = cx + dx * s * rx; y = cy + dy * s * ry; z = dz * s * rz; }
  }
  // 首
  {
    const r = 6 + m;
    if (y > B.Y0 - 6 && y < B.Y0 + 16) { const d = Math.hypot(x, z); if (d < r) { const s = d < 1e-4 ? 0 : r / d; x = d < 1e-4 ? 0 : x * s; z = d < 1e-4 ? r : z * s; } }
  }
  // 腕（カプセル）
  for (const a of B.arms) {
    const [ax, ay, az] = a.p0, bx = a.p1[0] - ax, by = a.p1[1] - ay, bz = a.p1[2] - az;
    const l = bx * bx + by * by + bz * bz;
    const t = Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l));
    const cx = ax + bx * t, cy = ay + by * t, cz = az + bz * t;
    const dx = x - cx, dy = y - cy, dz = z - cz, d = Math.hypot(dx, dy, dz), r = a.r + m;
    if (d < r && d > 1e-4) { const s = r / d; x = cx + dx * s; y = cy + dy * s; z = cz + dz * s; }
  }
  const moved = x !== p[i] || y !== p[i + 1] || z !== p[i + 2];
  p[i] = x; p[i + 1] = y; p[i + 2] = z;
  return moved;
}

// 型紙上の点 (x, y) を、縫う前の 3D の位置に置く
function placer(pc: PieceDef, pts: Pt[], B: Body, idx: number) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const half = Math.max(...xs.map(Math.abs)) || 20;
  const top = Math.min(...ys);
  const Rx = B.a + 3.5, Rz = B.b + 3.5;
  const role = pc.role;
  if (role === 'front' || role === 'back') {
    const sgn = role === 'front' ? 1 : -1;
    return ([x, y]: Pt): [number, number, number] => {
      const th = Math.max(-1.75, Math.min(1.75, (x / half) * (Math.PI / 2) * 0.98));
      const yy = y - top;
      const f = Math.max(0, Math.min(1, yy / 14));
      return [Rx * Math.sin(th), B.Y0 + 1.5 - yy, sgn * Rz * Math.cos(th) * (0.55 + 0.45 * f) + sgn * 1.5];
    };
  }
  if (role === 'sleeveR' || role === 'sleeveL') {
    const s = role === 'sleeveR' ? 1 : -1;
    const arm = B.arms[s > 0 ? 0 : 1];
    const ang = B.armDir;
    const d = [s * Math.sin(ang), -Math.cos(ang), 0], n1 = [s * Math.cos(ang), Math.sin(ang), 0];
    const r = Math.max(arm.r + 1.5, half / Math.PI);
    const O = [arm.p0[0] + n1[0] * 0.5, arm.p0[1] + n1[1] * 0.5 + 1, 0];
    return ([x, y]: Pt): [number, number, number] => {
      const ph = (x / half) * Math.PI;
      const t = y - top;
      const c = Math.cos(ph), sn = Math.sin(ph);
      return [O[0] + d[0] * t + r * c * n1[0], O[1] + d[1] * t + r * c * n1[1], r * sn];
    };
  }
  // その他：前に並べて吊るす
  return ([x, y]: Pt): [number, number, number] => [x + (idx % 3 - 1) * 30, B.Y0 - y + 10, Rz + 12 + Math.floor(idx / 3) * 6];
}

export function buildSim(doc: PatternDoc, B: Body, h: number): Sim {
  const ms = meshPattern(doc, h);
  const N = ms.reduce((s, m) => s + m.pts.length, 0);
  const pos = new Float32Array(N * 3), prev = new Float32Array(N * 3), inv = new Float32Array(N).fill(1);
  const cons: number[] = [];
  const pieces: MeshPiece[] = [];
  let off = 0;
  ms.forEach((m, pi) => {
    const pl = placer(m.pc, m.pts, B, pi);
    m.pts.forEach((p, i) => { const q = pl(p); pos.set(q, (off + i) * 3); });
    const uv2d = new Float32Array(m.pts.flat());
    // 伸び（三角形の辺）と曲げ（隣り合う三角形の向かいの点）
    const seen = new Map<string, number>();
    const T = m.tris;
    const opp = new Map<string, number[]>();
    for (let t = 0; t < T.length; t += 3) for (let k = 0; k < 3; k++) {
      const a = T[t + k], b = T[t + (k + 1) % 3], c = T[t + (k + 2) % 3];
      const kk = a < b ? `${a},${b}` : `${b},${a}`;
      if (!seen.has(kk)) { seen.set(kk, 1); cons.push(off + a, off + b, dist(m.pts[a], m.pts[b]), 1); }
      (opp.get(kk) || opp.set(kk, []).get(kk)!).push(c);
    }
    for (const o of Array.from(opp.values())) if (o.length === 2) cons.push(off + o[0], off + o[1], dist(m.pts[o[0]], m.pts[o[1]]), 0.3);
    const edgeIdx: Record<string, number[]> = {};
    for (const k in m.edgeIdx) edgeIdx[k] = m.edgeIdx[k].map((i) => off + i);
    pieces.push({ id: m.pc.id, role: m.pc.role, off, n: m.pts.length, uv2d, tris: new Uint32Array(T), edgeIdx });
    off += m.pts.length;
  });
  const seams: number[] = [];
  for (const s of doc.seams) {
    const A = pieces.find((p) => p.id === s.a[0])?.edgeIdx[s.a[1]], Bi = pieces.find((p) => p.id === s.b[0])?.edgeIdx[s.b[1]];
    if (!A || !Bi || A.length !== Bi.length) continue;
    const b = s.rev ? [...Bi].reverse() : Bi;
    for (let i = 0; i < A.length; i++) {
      if (A[i] === b[i]) continue;
      const d0 = Math.hypot(pos[A[i] * 3] - pos[b[i] * 3], pos[A[i] * 3 + 1] - pos[b[i] * 3 + 1], pos[A[i] * 3 + 2] - pos[b[i] * 3 + 2]);
      seams.push(A[i], b[i], d0);
    }
  }
  for (let i = 0; i < N; i++) collide(B, pos, i * 3, 1.2);
  prev.set(pos);
  return { pos, prev, inv, cons: new Float32Array(cons), seams: new Float32Array(seams), pieces, body: B, step: 0 };
}

export const TOTAL = 540;
export function stepSim(S: Sim, steps: number, iters = 18) {
  const { pos, prev, cons, seams, body } = S;
  const N = pos.length / 3;
  for (let st = 0; st < steps; st++) {
    S.step++;
    const g = 981 * (1 / 60) ** 2 * (0.22 * Math.max(0, Math.min(1, (S.step - 60) / 120)) + 0.3 * Math.max(0, Math.min(1, (S.step - 240) / 120)));
    const damp = S.step < 200 ? 0.9 : 0.97;
    for (let i = 0; i < N * 3; i += 3) {
      const vx = (pos[i] - prev[i]) * damp, vy = (pos[i + 1] - prev[i + 1]) * damp, vz = (pos[i + 2] - prev[i + 2]) * damp;
      prev[i] = pos[i]; prev[i + 1] = pos[i + 1]; prev[i + 2] = pos[i + 2];
      pos[i] += vx; pos[i + 1] += vy - g; pos[i + 2] += vz;
    }
    const ramp = Math.max(0, 1 - S.step / 160);
    for (let it = 0; it < iters; it++) {
      for (let c = 0; c < cons.length; c += 4) {
        const a = cons[c] * 3, b = cons[c + 1] * 3, rest = cons[c + 2];
        let k = cons[c + 3];
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (d < rest) k *= 0.25; // 布は縮みには弱く、伸びには強い
        const f = ((d - rest) / d) * 0.5 * k;
        pos[a] += dx * f; pos[a + 1] += dy * f; pos[a + 2] += dz * f;
        pos[b] -= dx * f; pos[b + 1] -= dy * f; pos[b + 2] -= dz * f;
      }
      for (let c = 0; c < seams.length; c += 3) {
        const a = seams[c] * 3, b = seams[c + 1] * 3, target = seams[c + 2] * ramp;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d <= target || d < 1e-6) continue;
        const f = ((d - target) / d) * 0.5 * 0.8;
        pos[a] += dx * f; pos[a + 1] += dy * f; pos[a + 2] += dz * f;
        pos[b] -= dx * f; pos[b + 1] -= dy * f; pos[b + 2] -= dz * f;
      }
      if (it % 2 === 1 || it === iters - 1) for (let i = 0; i < N; i++) {
        if (collide(body, pos, i * 3)) { // 接触面の摩擦
          const j = i * 3;
          prev[j] += (pos[j] - prev[j]) * 0.3; prev[j + 1] += (pos[j + 1] - prev[j + 1]) * 0.3; prev[j + 2] += (pos[j + 2] - prev[j + 2]) * 0.3;
        }
      }
    }
  }
}

// 縫い目のずれ（cm）の最大値：きちんと縫えたかの目安
export function seamGap(S: Sim) {
  let m = 0;
  for (let c = 0; c < S.seams.length; c += 3) {
    const a = S.seams[c] * 3, b = S.seams[c + 1] * 3;
    m = Math.max(m, Math.hypot(S.pos[a] - S.pos[b], S.pos[a + 1] - S.pos[b + 1], S.pos[a + 2] - S.pos[b + 2]));
  }
  return m;
}
