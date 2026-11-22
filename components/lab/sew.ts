// 仮想縫製：型紙のパーツを三角形の布にして、ボディのまわりに置き、縫い合わせ（シーム）を引き寄せて着せる。
// 位置ベースの布シミュレーション（PBD）。単位は cm、y が上。
import Delaunator from 'delaunator';
import { plen, type PatternDoc, type PieceDef, type Pt, type Role } from './draft';

export type Body = {
  Y0: number; a: number; b: number; // 肩の高さ、胸の楕円の半径
  armDir: number; // 腕の角度（縦から、ラジアン）
  arms: { p0: [number, number, number]; p1: [number, number, number]; r: number }[];
  H?: number; // 身長（足もとが y=0）
  sx?: number; // 肩の丸みの横幅（半分）
  tmax?: number; // 肩から胴の下端まで
  prof?: [number, number, number][]; // 胴の断面：[肩からの距離, 横の半径, 前後の半径]
};

// ---- アバター（体の寸法 cm：胸囲・ウエスト・ヒップは一周の長さ）----
export type Avatar = { height: number; chest: number; waist: number; hip: number; shoulder: number; arm: number };
export const AVATARS: { key: string; en: string; ja: string; a: Avatar }[] = [
  { key: 'S', en: 'Men S', ja: 'メンズ S', a: { height: 165, chest: 86, waist: 72, hip: 89, shoulder: 42, arm: 55 } },
  { key: 'M', en: 'Men M', ja: 'メンズ M', a: { height: 172, chest: 92, waist: 78, hip: 94, shoulder: 44, arm: 58 } },
  { key: 'L', en: 'Men L', ja: 'メンズ L', a: { height: 178, chest: 98, waist: 84, hip: 98, shoulder: 46, arm: 60 } },
  { key: 'XL', en: 'Men XL', ja: 'メンズ XL', a: { height: 183, chest: 106, waist: 92, hip: 104, shoulder: 48, arm: 62 } },
  { key: 'W', en: 'Women M', ja: 'レディース M', a: { height: 160, chest: 83, waist: 64, hip: 90, shoulder: 38, arm: 53 } },
];
// 楕円の周（b = 0.7a）→ 横の半径
const radOf = (C: number) => C / (2 * Math.PI * 0.863);
export const ellipseC = (a: number, b: number) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
export function makeAvatar(v: Avatar): Body {
  const sc = v.height / 172, Y0 = v.height * 0.82;
  const ac = radOf(v.chest), aw = radOf(v.waist), ah = radOf(v.hip);
  const prof: [number, number, number][] = [
    [7, ac * 0.93, ac * 0.6], [16 * sc, ac * 0.99, ac * 0.68], [25 * sc, ac, ac * 0.7], [36 * sc, (ac + aw) / 2, ((ac + aw) / 2) * 0.7],
    [45 * sc, aw, aw * 0.72], [56 * sc, (aw + ah) / 2, ((aw + ah) / 2) * 0.72], [68 * sc, ah, ah * 0.74], [86 * sc, ah * 0.97, ah * 0.72],
  ];
  const sx = Math.max(ac * 1.02, v.shoulder / 2 - 1.2), ang = 0.62, len = v.arm * 0.95;
  const arms = [1, -1].map((s) => {
    const jx = s * Math.max(ac * 1.08, v.shoulder / 2 - 3.5);
    const p0: [number, number, number] = [jx, Y0 - 5, 0];
    const p1: [number, number, number] = [jx + s * Math.sin(ang) * len, Y0 - 5 - Math.cos(ang) * len, 0];
    return { p0, p1, r: 4.6 * Math.sqrt(sc * v.chest / 92) };
  });
  return { Y0, a: ac, b: ac * 0.7, armDir: ang, arms, H: v.height, sx, tmax: 86 * sc, prof };
}

// ---- 生地の物性（CLO などの「生地プロパティ」を簡単にしたもの）----
export type FabricPhys = { key: string; en: string; ja: string; gsm: number; stretch: number; compress: number; bend: number; thick: number; friction: number; limit: number }; // limit：伸びの上限（0.05＝5%）
export const FABRIC_PHYS: FabricPhys[] = [
  { key: 'jersey', en: 'Cotton jersey', ja: '綿ジャージー', gsm: 180, stretch: 0.93, compress: 0.22, bend: 0.12, thick: 0.08, friction: 0.35, limit: 0.06 },
  { key: 'rib', en: 'Rib knit', ja: 'リブ', gsm: 230, stretch: 0.84, compress: 0.25, bend: 0.1, thick: 0.1, friction: 0.4, limit: 0.12 },
  { key: 'fleece', en: 'Fleece', ja: 'フリース', gsm: 330, stretch: 0.95, compress: 0.3, bend: 0.34, thick: 0.25, friction: 0.45, limit: 0.05 },
  { key: 'denim', en: 'Denim 12oz', ja: 'デニム 12oz', gsm: 400, stretch: 1, compress: 0.45, bend: 0.62, thick: 0.12, friction: 0.4, limit: 0.015 },
  { key: 'canvas', en: 'Canvas / twill', ja: 'キャンバス・ツイル', gsm: 300, stretch: 1, compress: 0.4, bend: 0.5, thick: 0.1, friction: 0.35, limit: 0.02 },
  { key: 'nylon', en: 'Nylon', ja: 'ナイロン', gsm: 80, stretch: 1, compress: 0.15, bend: 0.06, thick: 0.04, friction: 0.15, limit: 0.02 },
  { key: 'silk', en: 'Silk', ja: 'シルク', gsm: 60, stretch: 0.97, compress: 0.1, bend: 0.02, thick: 0.03, friction: 0.12, limit: 0.03 },
];
export const fabricOf = (k: string) => FABRIC_PHYS.find((f) => f.key === k) || FABRIC_PHYS[0];

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
  fab: FabricPhys;
  contact: Float32Array; // ボディに当たっている強さ（フィットマップ用）
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
  if (B.prof) {
    const P = B.prof;
    if (t < P[0][0] || t > P[P.length - 1][0]) return null;
    let k = 1; while (k < P.length - 1 && P[k][0] < t) k++;
    const [t0, a0, b0] = P[k - 1], [t1, a1, b1] = P[k], u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1))), e = u * u * (3 - 2 * u);
    return [a0 + (a1 - a0) * e, b0 + (b1 - b0) * e];
  }
  if (t < 7 || t > 86) return null;
  const k = t < 25 ? 0.96 + (t - 7) * 0.0022 : t < 45 ? 1 - ((t - 25) / 20) * 0.12 : 0.88 + Math.min(1, (t - 45) / 25) * 0.14;
  return [B.a * k, B.b * k * (t < 25 ? 0.96 : 1)];
}

function collide(B: Body, p: Float32Array, i: number, m = 0.6): number {
  const x0 = p[i], y0 = p[i + 1], z0 = p[i + 2];
  let x = x0, y = y0, z = z0;
  // 胴
  const e = torso(B, y);
  if (e) {
    const A = e[0] + m, C = e[1] + m, q = Math.hypot(x / A, z / C);
    if (q < 1) { const s = q < 1e-4 ? 1 : 1 / q; x *= s; z *= s; if (q < 1e-4) z = C; }
  }
  // 肩（楕円体）
  {
    const cx = 0, cy = B.Y0 - 7, rx = (B.sx ?? B.a * 1.16) + m, ry = 8 + m, rz = B.b * 0.98 + m;
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
  p[i] = x; p[i + 1] = y; p[i + 2] = z;
  return Math.hypot(x - x0, y - y0, z - z0);
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

export function buildSim(doc: PatternDoc, B: Body, h: number, fab: FabricPhys = FABRIC_PHYS[0]): Sim {
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
      if (!seen.has(kk)) { seen.set(kk, 1); cons.push(off + a, off + b, dist(m.pts[a], m.pts[b]), 1); } // 4番目：1＝伸び、0＝曲げ
      (opp.get(kk) || opp.set(kk, []).get(kk)!).push(c);
    }
    for (const o of Array.from(opp.values())) if (o.length === 2) cons.push(off + o[0], off + o[1], dist(m.pts[o[0]], m.pts[o[1]]), 0);
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
  for (let i = 0; i < N; i++) collide(B, pos, i * 3, 1.2 + fab.thick);
  prev.set(pos);
  return { pos, prev, inv, cons: new Float32Array(cons), seams: new Float32Array(seams), pieces, body: B, step: 0, fab, contact: new Float32Array(N) };
}

export const TOTAL = 540;
export function stepSim(S: Sim, steps: number, iters = 18) {
  const { pos, prev, cons, seams, body, fab, contact } = S;
  const N = pos.length / 3;
  // 生地：重いほど下に引かれ、軽いほど空気でふわりと止まる。厚いほどボディから離れる
  const gK = 0.8 + fab.gsm / 1000, margin = 0.5 + fab.thick, sK = fab.stretch, cK = fab.compress, bK = Math.max(0.01, fab.bend);
  for (let st = 0; st < steps; st++) {
    S.step++;
    const g = gK * 981 * (1 / 60) ** 2 * (0.22 * Math.max(0, Math.min(1, (S.step - 60) / 120)) + 0.3 * Math.max(0, Math.min(1, (S.step - 240) / 120)));
    const damp = S.step < 200 ? 0.9 : fab.gsm < 100 ? 0.95 : 0.97;
    for (let i = 0; i < N * 3; i += 3) {
      const vx = (pos[i] - prev[i]) * damp, vy = (pos[i + 1] - prev[i + 1]) * damp, vz = (pos[i + 2] - prev[i + 2]) * damp;
      prev[i] = pos[i]; prev[i + 1] = pos[i + 1]; prev[i + 2] = pos[i + 2];
      pos[i] += vx; pos[i + 1] += vy - g; pos[i + 2] += vz;
    }
    const ramp = Math.max(0, 1 - S.step / 160);
    for (let it = 0; it < iters; it++) {
      for (let c = 0; c < cons.length; c += 4) {
        const a = cons[c] * 3, b = cons[c + 1] * 3, rest = cons[c + 2];
        const stretchC = cons[c + 3] === 1;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        let k = stretchC ? sK : bK;
        if (d < rest) k *= stretchC ? cK : 1; // 布は縮みには弱く、伸びには強い（強さは生地による）
        const f = ((d - rest) / d) * 0.5 * k;
        pos[a] += dx * f; pos[a + 1] += dy * f; pos[a + 2] += dz * f;
        pos[b] -= dx * f; pos[b + 1] -= dy * f; pos[b + 2] -= dz * f;
      }
      // 伸びの上限（ストレインリミット）：生地が伸びきったら、それ以上は伸びない
      if (it >= iters - 4) for (let c = 0; c < cons.length; c += 4) {
        if (cons[c + 3] !== 1) continue;
        const a = cons[c] * 3, b = cons[c + 1] * 3, mx = cons[c + 2] * (1 + fab.limit);
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d <= mx) continue;
        const f = ((d - mx) / d) * 0.5;
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
        const mv = collide(body, pos, i * 3, margin);
        if (mv > 0) { // 接触面の摩擦
          const j = i * 3, fr = fab.friction;
          prev[j] += (pos[j] - prev[j]) * fr; prev[j + 1] += (pos[j + 1] - prev[j + 1]) * fr; prev[j + 2] += (pos[j + 2] - prev[j + 2]) * fr;
          if (it === iters - 1) contact[i] = contact[i] * 0.9 + Math.min(1, mv * 4 + 0.15) * 0.1;
        } else if (it === iters - 1) contact[i] *= 0.9;
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

// ---- 解析（CLO の「ひずみマップ」「フィットマップ」にあたるもの）----
// 頂点ごとの伸び（%）：まわりの布が型紙の長さよりどれだけ伸びているか
export function strainMap(S: Sim): Float32Array {
  const N = S.pos.length / 3, sum = new Float32Array(N), cnt = new Float32Array(N), p = S.pos, c = S.cons;
  for (let k = 0; k < c.length; k += 4) {
    if (c[k + 3] !== 1) continue;
    const a = c[k], b = c[k + 1], r = c[k + 2];
    const d = Math.hypot(p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]);
    const e = (d / (r || 1e-6) - 1) * 100;
    sum[a] += e; sum[b] += e; cnt[a]++; cnt[b]++;
  }
  for (let i = 0; i < N; i++) sum[i] = cnt[i] ? sum[i] / cnt[i] : 0;
  return sum;
}
// 色：伸び（%）→ 青（ゆるい）・緑（そのまま）・黄・赤（伸びている）
export function strainColor(e: number): [number, number, number] {
  const t = Math.max(-1, Math.min(1, e / 10));
  if (t < 0) return [0.2 + 0.3 * (1 + t), 0.55 + 0.2 * (1 + t), 0.95];
  if (t < 0.5) { const u = t / 0.5; return [0.5 + 0.5 * u, 0.75 + 0.15 * u, 0.95 - 0.75 * u]; }
  const u = (t - 0.5) / 0.5; return [1, 0.9 - 0.75 * u, 0.2 - 0.1 * u];
}
export function fitColor(v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, v));
  return t < 0.15 ? [0.93, 0.93, 0.9] : t < 0.5 ? [1, 0.85 - (t - 0.15) * 0.6, 0.3] : [0.92, 0.3 - (t - 0.5) * 0.4, 0.2];
}

// ゆとり：体のある高さで、服の周りの長さ − 体の周りの長さ
function hullLen(pts: [number, number][]) {
  if (pts.length < 3) return 0;
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const H = lo.slice(0, -1).concat(up.slice(0, -1));
  let L = 0; for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length]; L += Math.hypot(a[0] - b[0], a[1] - b[1]); }
  return L;
}
export type Fit = { label: [string, string]; body: number; garment: number; ease: number }[];
export function measureFit(S: Sim): { fit: Fit; lengthCm: number; heightM: number } {
  const B = S.body, sc = (B.H || 172) / 172, out: Fit = [];
  const torsoIdx: number[] = [];
  for (const pc of S.pieces) if (pc.role === 'front' || pc.role === 'back') for (let i = 0; i < pc.n; i++) torsoIdx.push(pc.off + i);
  let yMin = Infinity, yMax = -Infinity;
  for (const i of torsoIdx) { const y = S.pos[i * 3 + 1]; if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
  let gMin = Infinity, gMax = -Infinity;
  for (let i = 0; i < S.pos.length; i += 3) { const y = S.pos[i + 1]; if (y < gMin) gMin = y; if (y > gMax) gMax = y; }
  for (const [t, en, ja] of [[25 * sc, 'Chest', '胸囲'], [45 * sc, 'Waist', 'ウエスト'], [68 * sc, 'Hip', 'ヒップ']] as [number, string, string][]) {
    const y = B.Y0 - t; if (y < yMin + 1) continue;
    const e = torso(B, y); if (!e) continue;
    const ring: [number, number][] = [];
    for (const i of torsoIdx) if (Math.abs(S.pos[i * 3 + 1] - y) < 1.6) ring.push([S.pos[i * 3], S.pos[i * 3 + 2]]);
    if (ring.length < 8) continue;
    const g = hullLen(ring), b = ellipseC(e[0], e[1]);
    out.push({ label: [en, ja], body: Math.round(b), garment: Math.round(g), ease: Math.round(g - b) });
  }
  return { fit: out, lengthCm: Math.round((yMax - yMin) * 10) / 10, heightM: Math.round(gMax - gMin) / 100 };
}
