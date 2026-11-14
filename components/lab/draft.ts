// 型紙の設計図（cm）。写真の目印＋実寸から作り、点を指で動かして直せる。
// 各パーツは「辺」の並びで持ち、縫い合わせ（シーム）は辺どうしの対応で表す。3D の縫製はこの情報で組み立てる。
import type { Landmarks } from '../pattern';

export type Pt = [number, number];
export type Role = 'front' | 'back' | 'sleeveR' | 'sleeveL' | 'other';
export type Edge = { name: string; pts: Pt[] };
export type PieceDef = { id: string; name: string; role: Role; edges: Edge[] };
export type Seam = { a: [string, string]; b: [string, string]; rev: boolean };
export type PatternDoc = { kind: 'gallery-crypto-pattern'; version: 1; unit: 'cm'; pieces: PieceDef[]; seams: Seam[] };

// 寸法の仕様。すべて cm。半身の値（中心からの距離）
export type Spec = {
  neckW: number; // 衿ぐりの幅（半分）
  neckF: number; // 前衿の深さ
  neckB: number; // 後ろ衿の深さ
  shoulderX: number; // 肩先までの距離（半分）
  drop: number; // 肩の下がり
  chest: number; // 身幅の半分
  armY: number; // 肩の高さから脇の下まで
  hem: number; // 裾幅の半分
  length: number; // 着丈
  sleeve: number; // 袖丈（肩先から袖口）
  cuff: number; // 袖口幅（平置き）＝型紙の袖口の半分
  sleeves: boolean;
};

export type MeasureKey = 'length' | 'chest' | 'shoulder' | 'hem' | 'sleeve' | 'cuff';
export const MEASURES: { k: MeasureKey; en: string; ja: string; how: [string, string] }[] = [
  { k: 'length', en: 'Body length', ja: '着丈', how: ['Highest shoulder point to hem', '肩の一番高い所から裾まで'] },
  { k: 'chest', en: 'Chest width', ja: '身幅', how: ['Armpit to armpit', '脇の下から脇の下まで'] },
  { k: 'shoulder', en: 'Shoulder width', ja: '肩幅', how: ['Shoulder seam to shoulder seam', '肩先から肩先まで'] },
  { k: 'hem', en: 'Hem width', ja: '裾幅', how: ['Straight across the hem', '裾をまっすぐ'] },
  { k: 'sleeve', en: 'Sleeve length', ja: '袖丈', how: ['Shoulder seam to cuff', '肩先から袖口まで'] },
  { k: 'cuff', en: 'Cuff width', ja: '袖口幅', how: ['Across the cuff, flat', '袖口を平らにして'] },
];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// 写真の点から測った長さ（px）
export function pxMeasures(p: Landmarks): Record<MeasureKey, number> {
  const hps = (p.NL[1] + p.NR[1]) / 2, hemY = (p.HL[1] + p.HR[1]) / 2;
  const cuffR = mid(p.CO, p.CI);
  return {
    length: hemY - hps,
    chest: Math.abs(p.AR[0] - p.AL[0]),
    shoulder: dist(p.SL, p.SR),
    hem: Math.abs(p.HR[0] - p.HL[0]),
    sleeve: p.hasSleeves ? dist(p.SR, cuffR) : 0,
    cuff: p.hasSleeves ? dist(p.CO, p.CI) : 0,
  };
}

// 実寸から縮尺（1px あたり cm）を決める。入力された寸法ごとの比の中央値。写真のゆがみはズレとして返す
export function calibrate(px: Record<MeasureKey, number>, real: Partial<Record<MeasureKey, number>>, fallbackLen = 70) {
  const rs: number[] = [];
  for (const m of MEASURES) { const r = real[m.k]; if (r && r > 0 && px[m.k] > 4) rs.push(r / px[m.k]); }
  const s = [...rs].sort((a, b) => a - b);
  const k = s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : fallbackLen / Math.max(1, px.length);
  const dev: Partial<Record<MeasureKey, number>> = {};
  for (const m of MEASURES) { const r = real[m.k]; if (r && r > 0 && px[m.k] > 4) dev[m.k] = (px[m.k] * k - r); }
  return { k, n: rs.length, dev };
}

// 目印＋実寸 → 仕様。実寸が入っていれば必ずそれを使う
export function specFrom(p: Landmarks, k: number, real: Partial<Record<MeasureKey, number>>): Spec {
  const hps = (p.NL[1] + p.NR[1]) / 2;
  const avg = (a: number, b: number) => (a + b) / 2;
  const px = pxMeasures(p);
  const use = (key: MeasureKey) => (real[key] && real[key]! > 0 ? real[key]! : px[key] * k);
  const sY = avg(p.SL[1], p.SR[1]), aY = avg(p.AL[1], p.AR[1]);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const chest = use('chest') / 2;
  return {
    neckW: r1(Math.max(5, (Math.abs(p.NR[0] - p.NL[0]) / 2) * k)),
    neckF: r1(Math.max(4, (p.CF[1] - hps) * k)),
    neckB: 2,
    shoulderX: r1(Math.min(use('shoulder') / 2, chest * 1.3)),
    drop: r1(Math.max(1, (sY - hps) * k)),
    chest: r1(chest),
    armY: r1(Math.max(12, (aY - hps) * k)),
    hem: r1(use('hem') / 2),
    length: r1(use('length')),
    sleeve: r1(p.hasSleeves ? use('sleeve') : 0),
    cuff: r1(p.hasSleeves ? use('cuff') : 0),
    sleeves: p.hasSleeves,
  };
}

// 写真なし：実寸だけから（入っていない所は標準的なTシャツの値）
export function specFromMeasures(real: Partial<Record<MeasureKey, number>>): Spec {
  const v = (k: MeasureKey, d: number) => (real[k] && real[k]! > 0 ? real[k]! : d);
  const chest = v('chest', 52), sleeve = v('sleeve', 21);
  return { neckW: 9, neckF: 9, neckB: 2, shoulderX: v('shoulder', chest * 0.88) / 2, drop: 4, chest: chest / 2, armY: Math.max(16, chest * 0.43), hem: v('hem', chest) / 2, length: v('length', 70), sleeve, cuff: v('cuff', chest * 0.32), sleeves: sleeve > 0 };
}

const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 12): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; });
export const plen = (a: Pt[]) => a.reduce((s, p, i) => (i ? s + dist(p, a[i - 1]) : 0), 0);
const mirror = (a: Pt[]) => a.map(([x, y]) => [-x, y] as Pt).reverse();

function body(s: Spec, back: boolean): Edge[] {
  const nd = back ? s.neckB : s.neckF;
  const NS: Pt = [s.neckW, 0], SP: Pt = [s.shoulderX, s.drop], AP: Pt = [s.chest, s.armY], HS: Pt = [s.hem, s.length];
  const neckR = bez([0, nd], [s.neckW * 0.6, nd], [s.neckW, nd * 0.5], NS, 10);
  const neck = [...mirror(neckR).slice(0, -1), ...neckR];
  const shoulderR: Pt[] = [NS, SP];
  // 袖ぐり：肩先から少し内側に入りながら脇の下へ
  const inward = Math.min(3, Math.max(0.5, s.shoulderX - s.chest + 2.5));
  const armholeR = bez(SP, [SP[0] - inward * 0.3, SP[1] + (AP[1] - SP[1]) * 0.45], [AP[0] - inward, AP[1] - 1], AP, 12);
  const sideR: Pt[] = [AP, HS];
  const hem: Pt[] = [HS, [0, s.length], [-HS[0], HS[1]]];
  return [
    { name: 'neck', pts: neck },
    { name: 'shoulderR', pts: shoulderR },
    { name: 'armholeR', pts: armholeR },
    { name: 'sideR', pts: sideR },
    { name: 'hem', pts: hem },
    { name: 'sideL', pts: mirror(sideR) },
    { name: 'armholeL', pts: mirror(armholeR) },
    { name: 'shoulderL', pts: mirror(shoulderR) },
  ];
}

// 袖山の曲線の長さが袖ぐりと合うように、袖幅を決める
function sleeve(s: Spec, armhole: number): { edges: Edge[]; bw: number; ch: number } {
  const ch = Math.max(4, Math.min(16, (s.armY - s.drop) * 0.5));
  const cap = (bw: number) => bez([0, 0], [bw * 0.35, 0], [bw * 0.65, ch], [bw, ch], 12);
  let lo = 4, hi = 60;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (plen(cap(m)) < armhole + 0.5) lo = m; else hi = m; }
  const bw = (lo + hi) / 2;
  const capF = cap(bw);
  const cw = Math.min(bw, Math.max(4, s.cuff || bw * 0.8));
  const L = Math.max(ch + 3, s.sleeve);
  return {
    bw, ch,
    edges: [
      { name: 'capB', pts: mirror(capF) },
      { name: 'capF', pts: capF },
      { name: 'underF', pts: [[bw, ch], [cw, L]] },
      { name: 'cuff', pts: [[cw, L], [-cw, L]] },
      { name: 'underB', pts: [[-cw, L], [-bw, ch]] },
    ],
  };
}

export function draft(s: Spec): PatternDoc {
  const F = body(s, false), B = body(s, true);
  const pieces: PieceDef[] = [
    { id: 'front', name: '前身頃 Front', role: 'front', edges: F },
    { id: 'back', name: '後身頃 Back', role: 'back', edges: B },
  ];
  const seams: Seam[] = [
    { a: ['front', 'shoulderR'], b: ['back', 'shoulderR'], rev: false },
    { a: ['front', 'shoulderL'], b: ['back', 'shoulderL'], rev: false },
    { a: ['front', 'sideR'], b: ['back', 'sideR'], rev: false },
    { a: ['front', 'sideL'], b: ['back', 'sideL'], rev: false },
  ];
  if (s.sleeves && s.sleeve > 4) {
    const ah = plen(F[2].pts);
    const R = sleeve(s, ah), Lf = sleeve(s, ah);
    pieces.push({ id: 'sleeveR', name: '右袖 Sleeve R', role: 'sleeveR', edges: R.edges }, { id: 'sleeveL', name: '左袖 Sleeve L', role: 'sleeveL', edges: Lf.edges });
    seams.push(
      { a: ['sleeveR', 'capF'], b: ['front', 'armholeR'], rev: false },
      { a: ['sleeveR', 'capB'], b: ['back', 'armholeR'], rev: true },
      { a: ['sleeveL', 'capF'], b: ['front', 'armholeL'], rev: true },
      { a: ['sleeveL', 'capB'], b: ['back', 'armholeL'], rev: false },
      { a: ['sleeveR', 'underF'], b: ['sleeveR', 'underB'], rev: true },
      { a: ['sleeveL', 'underF'], b: ['sleeveL', 'underB'], rev: true },
    );
  }
  return { kind: 'gallery-crypto-pattern', version: 1, unit: 'cm', pieces, seams };
}

// 型紙の上で動かせる点 → 仕様の値
export type Handle = { piece: string; key: string; at: Pt; label: [string, string] };
export function handles(s: Spec): Handle[] {
  const h: Handle[] = [
    { piece: 'front', key: 'NS', at: [s.neckW, 0], label: ['Neck width', '衿ぐり幅'] },
    { piece: 'front', key: 'NF', at: [0, s.neckF], label: ['Front neck depth', '前衿の深さ'] },
    { piece: 'back', key: 'NB', at: [0, s.neckB], label: ['Back neck depth', '後ろ衿の深さ'] },
    { piece: 'front', key: 'SP', at: [s.shoulderX, s.drop], label: ['Shoulder', '肩先'] },
    { piece: 'front', key: 'AP', at: [s.chest, s.armY], label: ['Armpit / chest', '脇・身幅'] },
    { piece: 'front', key: 'HS', at: [s.hem, s.length], label: ['Hem / length', '裾・着丈'] },
  ];
  if (s.sleeves && s.sleeve > 4) h.push({ piece: 'sleeveR', key: 'CU', at: [s.cuff, s.sleeve], label: ['Cuff / sleeve length', '袖口・袖丈'] });
  return h;
}
export function moveHandle(s: Spec, key: string, p: Pt): Spec {
  const r = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, v)) * 10) / 10;
  const n = { ...s };
  if (key === 'NS') n.neckW = r(p[0], 3, s.shoulderX - 2);
  if (key === 'NF') n.neckF = r(p[1], 1, s.armY - 2);
  if (key === 'NB') n.neckB = r(p[1], 0.5, 12);
  if (key === 'SP') { n.shoulderX = r(p[0], s.neckW + 2, 60); n.drop = r(p[1], 0, s.armY - 4); }
  if (key === 'AP') { n.chest = r(p[0], 10, 90); n.armY = r(p[1], s.drop + 4, s.length - 5); }
  if (key === 'HS') { n.hem = r(p[0], 8, 100); n.length = r(p[1], s.armY + 5, 160); }
  if (key === 'CU') { n.cuff = r(p[0], 3, 40); n.sleeve = r(p[1], 5, 95); }
  return n;
}

// ---- 型紙データの書き出し・取り込み ----
export function outline(pc: PieceDef): Pt[] {
  const o: Pt[] = [];
  for (const e of pc.edges) for (let i = 0; i < e.pts.length; i++) { if (i === 0 && o.length) continue; o.push(e.pts[i]); }
  if (o.length > 2 && dist(o[0], o[o.length - 1]) < 0.01) o.pop();
  return o;
}

export function docToSVG(doc: PatternDoc, sa = 1) {
  const gap = 6;
  let x = 0;
  const parts: string[] = [];
  let H = 0;
  for (const pc of doc.pieces) {
    const o = outline(pc);
    const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
    const x0 = Math.min(...xs) - sa, y0 = Math.min(...ys) - sa, w = Math.max(...xs) + sa - x0, h = Math.max(...ys) + sa - y0;
    const tx = x - x0, ty = gap - y0;
    const d = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${(p[0] + tx).toFixed(2)} ${(p[1] + ty).toFixed(2)}`).join(' ');
    parts.push(`<g><path d="${d(o)} Z" fill="none" stroke="#111" stroke-width="0.15"/>` +
      (sa > 0 ? `<path d="${d(grow(o, sa))} Z" fill="none" stroke="#111" stroke-width="0.08" stroke-dasharray="0.6 0.4"/>` : '') +
      `<text x="${(x + w / 2).toFixed(1)}" y="${(gap + h / 2).toFixed(1)}" font-size="${Math.max(1.6, Math.min(4, w / 10)).toFixed(1)}" text-anchor="middle" font-family="sans-serif">${pc.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></g>`);
    x += w + gap;
    H = Math.max(H, h + gap * 2);
  }
  const W = x + gap;
  parts.push(`<rect x="${gap}" y="${H - 7}" width="5" height="5" fill="none" stroke="#111" stroke-width="0.1"/><text x="${gap + 6}" y="${H - 3}" font-size="1.6" font-family="sans-serif">5cm / GALLERY CRYPTO / seam allowance ${sa}cm</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(W * 10).toFixed(0)}mm" height="${(H * 10).toFixed(0)}mm" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}"><rect width="100%" height="100%" fill="#fff"/>${parts.join('')}</svg>`;
}

// 縫い代（簡易オフセット：頂点の法線方向に押し出す）
export function grow(o: Pt[], d: number): Pt[] {
  let area = 0;
  for (let i = 0; i < o.length; i++) { const a = o[i], b = o[(i + 1) % o.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? -1 : 1;
  return o.map((p, i) => {
    const a = o[(i - 1 + o.length) % o.length], b = o[(i + 1) % o.length];
    const n1 = norm([p[1] - a[1], a[0] - p[0]]), n2 = norm([b[1] - p[1], p[0] - b[0]]);
    const n = norm([n1[0] + n2[0], n1[1] + n2[1]]);
    const c = Math.max(0.35, n[0] * n1[0] + n[1] * n1[1]);
    return [p[0] + (sgn * n[0] * d) / c, p[1] + (sgn * n[1] * d) / c] as Pt;
  });
}
const norm = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

// DXF（LWPOLYLINE / POLYLINE）を読む。角で辺に分ける。単位は mm とみなし cm にする（scale で変更可）
export function parseDXF(text: string, scale = 0.1): PieceDef[] {
  const lines = text.split(/\r?\n/).map((s) => s.trim());
  const polys: Pt[][] = [];
  let cur: Pt[] | null = null, x: number | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i], val = lines[i + 1];
    if (code === '0') {
      if (cur && (val !== 'VERTEX')) { if (cur.length > 2) polys.push(cur); cur = null; }
      if (val === 'LWPOLYLINE' || val === 'POLYLINE') cur = [];
    } else if (cur) {
      if (code === '10') x = parseFloat(val);
      else if (code === '20' && x !== null) { cur.push([x * scale, -parseFloat(val) * scale]); x = null; }
    }
  }
  if (cur && cur.length > 2) polys.push(cur);
  return polys.map((o, i) => piecesFromOutline(o, `p${i + 1}`, `Piece ${i + 1}`));
}

export function piecesFromOutline(o: Pt[], id: string, name: string): PieceDef {
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys);
  const cx = (x0 + x1) / 2;
  const pts = o.map(([x, y]) => [x - cx, y - y0] as Pt);
  // 角（曲がりが 35° 以上）で辺を切る
  const n = pts.length, corners: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], p = pts[i], b = pts[(i + 1) % n];
    const v1 = norm([p[0] - a[0], p[1] - a[1]]), v2 = norm([b[0] - p[0], b[1] - p[1]]);
    if (v1[0] * v2[0] + v1[1] * v2[1] < Math.cos((35 * Math.PI) / 180)) corners.push(i);
  }
  if (corners.length < 2) corners.splice(0, corners.length, 0, Math.floor(n / 2));
  const edges: Edge[] = corners.map((c, j) => {
    const e = corners[(j + 1) % corners.length];
    const seg: Pt[] = [];
    for (let i = c; ; i = (i + 1) % n) { seg.push(pts[i]); if (i === e && seg.length > 1) break; }
    return { name: `e${j + 1}`, pts: seg };
  });
  return { id, name, role: 'other', edges };
}

export function parseDoc(text: string): PatternDoc | null {
  try {
    const j = JSON.parse(text);
    if (j && Array.isArray(j.pieces)) return { kind: 'gallery-crypto-pattern', version: 1, unit: 'cm', pieces: j.pieces, seams: Array.isArray(j.seams) ? j.seams : [] };
  } catch { /* 下で null */ }
  return null;
}
