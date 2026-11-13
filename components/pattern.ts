// パターン（型紙）の自動生成：取り込んだ服のシルエットから寸法を推定し、型紙のパーツをつくる。
// さらに元の型紙から「変換パターン」（クロップド、オーバーサイズ、ベスト化 など）を自動でつくる。
// 寸法は写真からの推定なので、実物を測った値で上書きできる。単位は cm。
import type { Layer } from './GhostMannequin';

export type Measures = {
  length: number; chest: number; hem: number; shoulder: number; armhole: number;
  neckW: number; neckF: number; neckB: number;
  sleeve: number; bicep: number; cuff: number; hasSleeves: boolean;
};
type Pt = [number, number];

// ---- シルエットから寸法を測る ----
export function measure(F: Layer, lengthCm: number): Measures | null {
  let x0 = F.w, y0 = F.h, x1 = 0, y1 = 0;
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) if (F.mask[y * F.w + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0) return null;
  const M = (x: number, y: number) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < F.w && yi < F.h && F.mask[yi * F.w + xi] > 127; };
  const rows = 240, H = y1 - y0 + 1, step = H / rows;
  type Run = { a: number; b: number };
  const runs: Run[][] = [];
  for (let j = 0; j <= rows; j++) {
    const y = y0 + j * step, rs: Run[] = [];
    let s = -1;
    for (let x = x0; x <= x1 + 1; x++) { const m = M(x, y); if (m && s < 0) s = x; if (!m && s >= 0) { rs.push({ a: s, b: x - 1 }); s = -1; } }
    runs.push(rs);
  }
  const med = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };
  const low = runs.slice(Math.round(rows * 0.72), Math.round(rows * 0.95)).map((rs) => rs.reduce((m, r) => (r.b - r.a > m.b - m.a ? r : m), { a: 0, b: -1 })).filter((r) => r.b > r.a);
  const cx = med(low.map((r) => (r.a + r.b) / 2)) || (x0 + x1) / 2;
  const hw0 = med(low.map((r) => (r.b - r.a) / 2)) || (x1 - x0) / 4;
  const L = new Float32Array(rows + 1).fill(NaN), R = new Float32Array(rows + 1).fill(NaN);
  for (let j = 0; j <= rows; j++) { const near = runs[j].filter((r) => r.b >= cx - hw0 * 1.6 && r.a <= cx + hw0 * 1.6); if (near.length) { L[j] = Math.min(...near.map((r) => r.a)); R[j] = Math.max(...near.map((r) => r.b)); } }
  let top = 0; while (top < rows && isNaN(L[top])) top++;
  let bot = rows; while (bot > 0 && isNaN(L[bot])) bot--;
  let arm = -1;
  for (let j = Math.round(rows * 0.9); j > top + 2; j--) { const w = (k: number) => (R[k] - L[k]) / 2; if (w(j) > hw0 * 1.22 && w(j - 1) > hw0 * 1.22 && w(j - 2) > hw0 * 1.22) { arm = j; break; } }
  const k = lengthCm / ((bot - top) * step); // 1px あたり cm
  const width = (j: number) => ((R[j] - L[j]) || 0) * k;
  const hem = width(Math.max(top, bot - 2));
  const armRow = arm >= 0 ? arm + 2 : top + Math.round((bot - top) * 0.32);
  const chest = Math.max(hem * 0.9, width(Math.min(bot, armRow + 2)));
  // 首：上の方の行で、中心がまだ抜けている所が首の切れ込み
  let neckRow = top;
  while (neckRow < bot && !M(cx, y0 + neckRow * step)) neckRow++;
  let neckW = 0;
  {
    const j = Math.min(bot, top + 2), y = y0 + j * step;
    let l = cx, r = cx;
    while (l > x0 && !M(l, y)) l--;
    while (r < x1 && !M(r, y)) r++;
    neckW = (r - l) * k;
  }
  if (!(neckW > 8 && neckW < chest * 0.7)) neckW = Math.min(20, chest * 0.36);
  let neckF = (neckRow - top) * step * k;
  if (!(neckF > 3 && neckF < 18)) neckF = 9;
  // 袖：胴の外側の部分を主軸で測る
  const cap = arm >= 0 ? Math.max(hw0, ((R[arm + 2] - L[arm + 2]) / 2 || hw0) * 1.02) : Infinity;
  const pts: Pt[] = [];
  for (let j = top; j <= bot; j++) {
    const y = y0 + j * step;
    const l = j <= arm ? Math.max(L[j], cx - cap) : L[j], r = j <= arm ? Math.min(R[j], cx + cap) : R[j];
    for (const rr of runs[j]) for (let x = rr.a; x <= rr.b; x += step) if (x > r + step) pts.push([x, y]); else if (x < l - step) pts.push([2 * cx - x, y]); // 左袖も右側に重ねて測る
  }
  let sleeve = 0, bicep = 0, cuff = 0;
  const hasSleeves = pts.length > 60;
  if (hasSleeves) {
    // 肩先 S から一番遠い袖の点へ向かう向きを袖の向きとする（短い袖でも安定）
    const S: Pt = [cx + Math.min(cap, hw0 * 1.15), y0 + (top + Math.max(0, arm - top) * 0.12) * step];
    let far = pts[0], fd = 0;
    for (const p of pts) { const d = (p[0] - S[0]) ** 2 + (p[1] - S[1]) ** 2; if (d > fd) { fd = d; far = p; } }
    const len = Math.sqrt(fd) || 1;
    // 遠い点のまわり（袖口）の中心へ向け直す
    let fx = 0, fy = 0, fn = 0;
    for (const p of pts) if (Math.hypot(p[0] - far[0], p[1] - far[1]) < len * 0.35 && (p[0] - S[0]) * (far[0] - S[0]) + (p[1] - S[1]) * (far[1] - S[1]) > len * len * 0.8) { fx += p[0]; fy += p[1]; fn++; }
    const tip: Pt = fn ? [fx / fn, fy / fn] : far;
    let dx = tip[0] - S[0], dy = tip[1] - S[1];
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const nx = -dy, ny = dx;
    let tmax = 0;
    for (const p of pts) tmax = Math.max(tmax, (p[0] - S[0]) * dx + (p[1] - S[1]) * dy);
    const NB = 16, lo = new Array(NB).fill(Infinity), hi = new Array(NB).fill(-Infinity);
    for (const p of pts) {
      const t = (p[0] - S[0]) * dx + (p[1] - S[1]) * dy, sv = (p[0] - S[0]) * nx + (p[1] - S[1]) * ny;
      if (t < 0) continue;
      const b = Math.min(NB - 1, Math.floor((t / (tmax + 1e-6)) * NB));
      lo[b] = Math.min(lo[b], sv); hi[b] = Math.max(hi[b], sv);
    }
    const wAt = (b: number) => (hi[b] > lo[b] ? (hi[b] - lo[b]) * k : 0);
    let mxw = 0; for (let b = 0; b < NB - 2; b++) mxw = Math.max(mxw, wAt(b));
    bicep = mxw;
    cuff = wAt(NB - 2) || wAt(NB - 3) || bicep * 0.8;
    sleeve = tmax * k;
  }
  const armhole = arm >= 0 ? Math.max(16, (arm - top) * step * k) : Math.max(18, chest * 0.42);
  const shoulder = Math.min(chest * 0.98, Math.max(chest * 0.82, chest * 0.9));
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    length: r1(lengthCm), chest: r1(chest), hem: r1(hem), shoulder: r1(shoulder), armhole: r1(armhole),
    neckW: r1(neckW), neckF: r1(neckF), neckB: 2,
    sleeve: r1(sleeve), bicep: r1(Math.max(bicep, chest * 0.32)), cuff: r1(Math.max(cuff, chest * 0.24)), hasSleeves,
  };
}

// ---- 変換パターン ----
export type Variant = 'original' | 'crop' | 'oversize' | 'boxy' | 'vest' | 'long';
export const VARIANTS: { k: Variant; en: string; ja: string; desc: [string, string] }[] = [
  { k: 'original', en: 'Original', ja: '原型', desc: ['As measured from the photo', '写真から測ったそのまま'] },
  { k: 'crop', en: 'Cropped', ja: 'クロップド', desc: ['Length −20%, slightly wider', '着丈を2割短く、少し広く'] },
  { k: 'oversize', en: 'Oversized', ja: 'オーバーサイズ', desc: ['Wider body, dropped shoulder, deeper armhole', '身幅を広く、肩を落とし、袖ぐりを深く'] },
  { k: 'boxy', en: 'Boxy', ja: 'ボクシー', desc: ['Straight side seam, hem = chest', '脇をまっすぐ、裾幅＝身幅'] },
  { k: 'vest', en: 'Sleeveless / vest', ja: 'ノースリーブ化', desc: ['No sleeves, deeper armhole', '袖をなくし、袖ぐりを深く'] },
  { k: 'long', en: 'Long sleeve', ja: '長袖化', desc: ['Sleeves to the wrist with a rib cuff', '袖を手首まで伸ばし、袖口にリブ'] },
];
export function transform(m: Measures, v: Variant): Measures {
  const o = { ...m };
  if (v === 'crop') { o.length = m.length * 0.8; o.chest = m.chest * 1.04; o.hem = o.chest; }
  if (v === 'oversize') { o.chest = m.chest * 1.14; o.hem = m.hem * 1.14; o.shoulder = m.shoulder * 1.22; o.armhole = m.armhole + 3; o.length = m.length + 3; o.bicep = m.bicep * 1.12; o.sleeve = Math.max(m.sleeve - 2, m.sleeve * 0.95); }
  if (v === 'boxy') { o.hem = m.chest; o.length = m.length * 0.92; o.shoulder = m.shoulder * 1.08; }
  if (v === 'vest') { o.hasSleeves = false; o.armhole = m.armhole + 4; o.shoulder = m.shoulder * 0.86; }
  if (v === 'long') { o.hasSleeves = true; o.sleeve = Math.max(58, m.sleeve); o.cuff = Math.min(m.cuff, m.bicep * 0.6); }
  return o;
}

// ---- 型紙のパーツ ----
export type Piece = { id: string; en: string; ja: string; cut: [string, string]; line: Pt[]; sa: number[]; fold?: [number, number]; grain: [Pt, Pt]; notches: Pt[]; fabric?: 'A' | 'B' };
const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 16): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; });
const plen = (a: Pt[]) => a.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) : 0), 0);

function body(m: Measures, back: boolean, rib: boolean) {
  const nw = m.neckW / 2, nd = back ? m.neckB : m.neckF, sw = m.shoulder / 2, sd = 3.5, cw = m.chest / 2, hw = m.hem / 2;
  const ad = m.armhole + sd * 0.4, L = m.length - (rib ? 0 : 0);
  const neck = bez([0, nd], [nw * 0.55, nd], [nw, nd * 0.45], [nw, 0], 12);
  const arm = bez([sw, sd], [sw - 0.8, sd + (ad - sd) * 0.45], [cw - (cw - sw) * 0.85 - 0.6, ad], [cw, ad], 16);
  const side = bez([cw, ad], [cw, ad + (L - ad) * 0.35], [hw, L - (L - ad) * 0.35], [hw, L], 10);
  // 線のつながり：裾の中心 → 中心（わ）→ 襟ぐり → 肩 → 袖ぐり → 脇 → 裾。sa[i] は line[i]→line[i+1] の辺の縫い代
  const line: Pt[] = [[0, L], ...neck, [sw, sd], ...arm.slice(1), ...side.slice(1)];
  const sa = line.map(() => 1);
  sa[0] = 0; // わ
  sa[line.length - 1] = rib ? 1 : 2.5; // 裾
  return { line, sa, armLen: plen(arm), neckLen: plen(neck), ad, sd, notch: back ? [arm[10], arm[12]] : [arm[8]] };
}

export function pieces(m: Measures, opt: { rib: boolean }): Piece[] {
  const out: Piece[] = [];
  const F = body(m, false, opt.rib), B = body(m, true, opt.rib);
  out.push({ id: 'front', en: 'Front body', ja: '前身頃', cut: ['Cut 1 on fold', '「わ」で1枚'], line: F.line, sa: F.sa, fold: [0, 1], grain: [[m.chest / 6, m.length * 0.3], [m.chest / 6, m.length * 0.8]], notches: F.notch as Pt[] });
  out.push({ id: 'back', en: 'Back body', ja: '後身頃', cut: ['Cut 1 on fold', '「わ」で1枚'], line: B.line, sa: B.sa, fold: [0, 1], grain: [[m.chest / 6, m.length * 0.3], [m.chest / 6, m.length * 0.8]], notches: B.notch as Pt[] });
  if (m.hasSleeves) {
    // 袖山の高さは、袖山の線の長さが袖ぐり（前＋後ろ）に合うように決める
    const AH = (F.armLen + B.armLen) / 2;
    const bw = m.bicep, cw = m.cuff, SL = Math.max(8, m.sleeve);
    let lo = 1, hi = 25, cap: Pt[] = [];
    const capCurve = (h: number) => bez([0, 0], [bw * 0.18, 0], [bw * 0.38, h * 0.7], [bw, h], 18);
    for (let i = 0; i < 30; i++) { const h = (lo + hi) / 2; cap = capCurve(h); if (plen(cap) > AH + 0.8) hi = h; else lo = h; }
    const h = (lo + hi) / 2;
    cap = capCurve(h);
    const right = cap.map((p) => [p[0], p[1]] as Pt);
    const left = [...cap].reverse().map((p) => [-p[0], p[1]] as Pt);
    const line: Pt[] = [...left, ...right.slice(1), [cw, SL], [-cw, SL]];
    const sa = line.map(() => 1);
    sa[line.length - 2] = opt.rib || SL > 40 ? 1 : 2.5; // 袖口
    out.push({ id: 'sleeve', en: 'Sleeve', ja: '袖', cut: ['Cut 2 (mirror)', '左右対称で2枚'], line, sa, grain: [[0, h + 2], [0, SL - 3]], notches: [[0, 0], right[9], [-right[11][0], right[11][1]]] });
    if (SL > 40) out.push(rect('cuff', 'Cuff rib', '袖口リブ', ['Cut 2', '2枚'], cw * 2 * 0.82, 14));
  }
  const neckRound = (F.neckLen + B.neckLen) * 2;
  out.push(rect('neck', 'Neck rib', '衿ぐりリブ', ['Cut 1 (rib knit)', 'リブ地で1枚'], neckRound * 0.85, 5));
  if (opt.rib) out.push(rect('hem', 'Hem rib', '裾リブ', ['Cut 1 (rib knit)', 'リブ地で1枚'], m.hem * 2 * 0.86, 14));
  if (!m.hasSleeves) {
    // ノースリーブは袖ぐりをバイアス布で始末
    out.push(rect('bind', 'Armhole binding', '袖ぐりバイアス', ['Cut 2 (bias)', 'バイアスで2枚'], (F.armLen + B.armLen) * 0.95, 3.2));
  }
  return out;
}
function rect(id: string, en: string, ja: string, cut: [string, string], w: number, h: number): Piece {
  return { id, en, ja, cut, line: [[0, 0], [w, 0], [w, h], [0, h]], sa: [1, 1, 1, 1], grain: [[w * 0.15, h / 2], [w * 0.85, h / 2]], notches: [[w / 2, 0]] };
}

// ---- 縫い代つきの外形（辺ごとに平行移動した線の交点） ----
export function offset(line: Pt[], sa: number[]): Pt[] {
  const n = line.length;
  // 向き（時計回りか）で外側の向きを決める
  let area = 0;
  for (let i = 0; i < n; i++) { const a = line[i], b = line[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? -1 : 1;
  const segs = line.map((a, i) => {
    const b = line[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = (sgn * dy) / l, ny = (-sgn * dx) / l, s = sa[i] ?? 1;
    return { a: [a[0] + nx * s, a[1] + ny * s] as Pt, b: [b[0] + nx * s, b[1] + ny * s] as Pt, d: [dx / l, dy / l] as Pt };
  });
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = segs[(i - 1 + n) % n], q = segs[i];
    const den = p.d[0] * q.d[1] - p.d[1] * q.d[0];
    if (Math.abs(den) < 1e-4) { out.push(q.a); continue; }
    const t = ((q.a[0] - p.a[0]) * q.d[1] - (q.a[1] - p.a[1]) * q.d[0]) / den;
    const x: Pt = [p.a[0] + p.d[0] * t, p.a[1] + p.d[1] * t];
    // とがりすぎる角は切り落とす
    if (Math.hypot(x[0] - q.a[0], x[1] - q.a[1]) > 4) { out.push(p.b, q.a); } else out.push(x);
  }
  return out;
}

// ---- 原寸の SVG（mm 単位）に並べる ----
export function layout(ps: Piece[], width = 150) {
  const gap = 4;
  let x = 2, y = 4, rowH = 0;
  const placed: { p: Piece; dx: number; dy: number; cut: Pt[]; bb: { x0: number; y0: number; x1: number; y1: number } }[] = [];
  for (const p of ps) {
    const cut = offset(p.line, p.sa);
    const xs = cut.map((q) => q[0]), ys = cut.map((q) => q[1]);
    const bb = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0;
    if (x + w > width && x > 2) { x = 2; y += rowH + gap; rowH = 0; }
    placed.push({ p, dx: x - bb.x0, dy: y - bb.y0, cut, bb });
    x += w + gap; rowH = Math.max(rowH, h);
  }
  return { placed, W: width + 2, H: y + rowH + 2 };
}

export function toSVG(ps: Piece[], lang: 'en' | 'ja', title: string, width = 150) {
  const { placed, W, H } = layout(ps, width);
  const mm = (v: number) => (v * 10).toFixed(1);
  const path = (pts: Pt[], dx: number, dy: number, close = true) => 'M' + pts.map((p) => `${mm(p[0] + dx)} ${mm(p[1] + dy)}`).join(' L') + (close ? ' Z' : '');
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${(W * 10).toFixed(0)}mm" height="${(H * 10).toFixed(0)}mm" viewBox="0 0 ${mm(W)} ${mm(H)}" font-family="Helvetica, Arial, sans-serif">`;
  s += `<defs><pattern id="fabB" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="24" height="24" fill="#eef3fb"/><line x1="0" y1="0" x2="0" y2="24" stroke="#9db4d8" stroke-width="5"/></pattern></defs><rect width="100%" height="100%" fill="#fff"/>`;
  // 原寸確認用の 5cm 四方
  s += `<g><rect x="${mm(W - 7)}" y="${mm(1)}" width="50" height="50" fill="none" stroke="#000" stroke-width="1"/><text x="${mm(W - 4.5)}" y="${mm(3.8)}" font-size="12" text-anchor="middle">5 cm</text></g>`;
  s += `<text x="${mm(2)}" y="${mm(2.2)}" font-size="34" font-weight="700">${title}</text>`;
  for (const { p, dx, dy, cut } of placed) {
    s += `<g>`;
    s += `<path d="${path(cut, dx, dy)}" fill="${p.fabric === 'B' ? 'url(#fabB)' : '#fbfaf7'}" stroke="#111" stroke-width="2.2"/>`;
    s += `<path d="${path(p.line, dx, dy)}" fill="none" stroke="#555" stroke-width="1.4" stroke-dasharray="10 6"/>`;
    // 縫い代0の辺＝「わ」（中心で折る）
    p.line.forEach((a, i) => {
      if ((p.sa[i] ?? 1) !== 0) return;
      const b = p.line[(i + 1) % p.line.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 3) return;
      s += `<line x1="${mm(a[0] + dx)}" y1="${mm(a[1] + dy)}" x2="${mm(b[0] + dx)}" y2="${mm(b[1] + dy)}" stroke="#c0392b" stroke-width="5"/><text transform="translate(${mm(a[0] + dx + 1.2)} ${mm((a[1] + b[1]) / 2 + dy)}) rotate(-90)" font-size="22" fill="#c0392b" text-anchor="middle">${lang === 'ja' ? 'わ（中心で折る）' : 'PLACE ON FOLD'}</text>`;
    });
    const [g0, g1] = p.grain;
    s += `<line x1="${mm(g0[0] + dx)}" y1="${mm(g0[1] + dy)}" x2="${mm(g1[0] + dx)}" y2="${mm(g1[1] + dy)}" stroke="#111" stroke-width="2"/>`;
    const ang = Math.atan2(g1[1] - g0[1], g1[0] - g0[0]);
    for (const [q, d] of [[g0, -1], [g1, 1]] as [Pt, number][]) { const a1 = ang + Math.PI - 0.4, a2 = ang + Math.PI + 0.4; const tip: Pt = [q[0] + dx, q[1] + dy]; const k = d; s += `<path d="M${mm(tip[0] + Math.cos(a1) * 1.2 * k)} ${mm(tip[1] + Math.sin(a1) * 1.2 * k)} L${mm(tip[0])} ${mm(tip[1])} L${mm(tip[0] + Math.cos(a2) * 1.2 * k)} ${mm(tip[1] + Math.sin(a2) * 1.2 * k)}" fill="none" stroke="#111" stroke-width="2"/>`; }
    for (const n of p.notches) s += `<circle cx="${mm(n[0] + dx)}" cy="${mm(n[1] + dy)}" r="4" fill="#111"/>`;
    const xs = p.line.map((q) => q[0]), ys = p.line.map((q) => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2 + dx, cy = (Math.min(...ys) + Math.max(...ys)) / 2 + dy;
    const pw = Math.max(...xs) - Math.min(...xs), ph = Math.max(...ys) - Math.min(...ys);
    const label = lang === 'ja' ? p.ja : p.en;
    const fs = Math.max(8, Math.min(40, pw * 2.2, ph * 3.2, (pw * 10 * 0.85) / Math.max(1, label.length * (lang === 'ja' ? 1 : 0.55))));
    const big = pw > 20;
    s += `<text x="${mm(cx + (big ? 2 : 0))}" y="${mm(cy)}" font-size="${fs.toFixed(0)}" font-weight="700" text-anchor="middle">${lang === 'ja' ? p.ja : p.en}</text>`;
    s += `<text x="${mm(cx + (big ? 2 : 0))}" y="${(cy * 10 + fs * 1.1).toFixed(1)}" font-size="${(fs * 0.62).toFixed(0)}" text-anchor="middle">${lang === 'ja' ? p.cut[1] : p.cut[0]}${p.fabric === 'B' ? (lang === 'ja' ? '・生地B' : ' · fabric B') : ''}</text>`;
    s += `</g>`;
  }
  s += `<text x="${mm(2)}" y="${mm(H - 0.6)}" font-size="20" fill="#555">${lang === 'ja' ? '実線＝裁断線（縫い代込み）　点線＝出来上がり線　●＝合印　斜線＝生地B（組み合わせる別の古着）　縫い代1cm（裾2.5cm）　写真からの推定です。仮縫いで確認してください。' : 'Solid = cutting line (with seam allowance) · Dashed = stitching line · ● = notch · 1 cm allowance (hem 2.5 cm) · Estimated from a photo — check with a toile.'}</text>`;
  s += `</svg>`;
  return { svg: s, W, H };
}

// ---- 目印（ランドマーク）方式：写真の上の点から寸法を直接はかる ----
// 自動で置いた点を、写真に合わせて指で動かせば、型紙の寸法は写真と必ず一致する。
export type LmKey = 'NL' | 'NR' | 'CF' | 'SL' | 'SR' | 'AL' | 'AR' | 'HL' | 'HR' | 'CO' | 'CI';
export type Landmarks = Record<LmKey, Pt> & { hasSleeves: boolean };
export const LM_LABEL: Record<LmKey, [string, string]> = {
  NL: ['Neck (left)', '首の付け根・左'], NR: ['Neck (right)', '首の付け根・右'], CF: ['Front neck', '前衿の一番下'],
  SL: ['Shoulder (left)', '肩先・左'], SR: ['Shoulder (right)', '肩先・右'], AL: ['Armpit (left)', '脇の下・左'], AR: ['Armpit (right)', '脇の下・右'],
  HL: ['Hem (left)', '裾・左'], HR: ['Hem (right)', '裾・右'], CO: ['Cuff (outer)', '袖口・外'], CI: ['Cuff (inner)', '袖口・内'],
};

export function detectLandmarks(F: Layer): Landmarks | null {
  let x0 = F.w, y0 = F.h, x1 = 0, y1 = 0;
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) if (F.mask[y * F.w + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0) return null;
  const M = (x: number, y: number) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < F.w && yi < F.h && F.mask[yi * F.w + xi] > 127; };
  const rows = 240, step = (y1 - y0 + 1) / rows;
  const Y = (j: number) => y0 + j * step;
  type Run = { a: number; b: number };
  const runs: Run[][] = [];
  for (let j = 0; j <= rows; j++) { const rs: Run[] = []; let s = -1; for (let x = x0; x <= x1 + 1; x++) { const m = M(x, Y(j)); if (m && s < 0) s = x; if (!m && s >= 0) { rs.push({ a: s, b: x - 1 }); s = -1; } } runs.push(rs); }
  const med = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };
  const low = runs.slice(Math.round(rows * 0.72), Math.round(rows * 0.95)).map((rs) => rs.reduce((m, r) => (r.b - r.a > m.b - m.a ? r : m), { a: 0, b: -1 })).filter((r) => r.b > r.a);
  const cx = med(low.map((r) => (r.a + r.b) / 2)) || (x0 + x1) / 2;
  const hw0 = med(low.map((r) => (r.b - r.a) / 2)) || (x1 - x0) / 4;
  const L = new Float32Array(rows + 1).fill(NaN), R = new Float32Array(rows + 1).fill(NaN);
  for (let j = 0; j <= rows; j++) { const near = runs[j].filter((r) => r.b >= cx - hw0 * 1.6 && r.a <= cx + hw0 * 1.6); if (near.length) { L[j] = Math.min(...near.map((r) => r.a)); R[j] = Math.max(...near.map((r) => r.b)); } }
  let top = 0; while (top < rows && isNaN(L[top])) top++;
  let bot = rows; while (bot > 0 && isNaN(L[bot])) bot--;
  let arm = -1;
  for (let j = Math.round(rows * 0.9); j > top + 2; j--) { const w = (k: number) => (R[k] - L[k]) / 2; if (w(j) > hw0 * 1.22 && w(j - 1) > hw0 * 1.22 && w(j - 2) > hw0 * 1.22) { arm = j; break; } }
  const armRow = arm >= 0 ? arm + 2 : top + Math.round((bot - top) * 0.3);
  const cap = arm >= 0 ? Math.max(hw0, ((R[armRow] - L[armRow]) / 2 || hw0)) : Math.min((R[armRow] - L[armRow]) / 2 || hw0, hw0 * 1.1);
  const topY = (x: number) => { for (let y = y0; y <= y1; y++) if (M(x, y)) return y; return y0; };
  // 首：中心の列で、上から見て最初に生地がある所が前衿の一番下
  let cfY = y0; while (cfY < y1 && !M(cx, cfY)) cfY++;
  let nl = cx, nr = cx;
  if (cfY > y0 + 2) { const yy = y0 + Math.min(4, (cfY - y0) / 3); while (nl > x0 && !M(nl, yy)) nl--; while (nr < x1 && !M(nr, yy)) nr++; }
  else { nl = cx - hw0 * 0.35; nr = cx + hw0 * 0.35; }
  const sx = Math.min(cap * 0.96, hw0 * 1.12);
  const lm = {
    NL: [nl, topY(nl)] as Pt, NR: [nr, topY(nr)] as Pt, CF: [cx, cfY] as Pt,
    SL: [cx - sx, topY(cx - sx)] as Pt, SR: [cx + sx, topY(cx + sx)] as Pt,
    AL: [cx - cap, Y(armRow)] as Pt, AR: [cx + cap, Y(armRow)] as Pt,
    HL: [L[bot - 1], Y(bot)] as Pt, HR: [R[bot - 1], Y(bot)] as Pt,
    CO: [cx + cap, Y(armRow)] as Pt, CI: [cx + cap, Y(armRow)] as Pt,
    hasSleeves: false,
  };
  // 右袖：胴の外側の点を集め、肩先から一番遠い所を袖口とする
  const pts: Pt[] = [];
  for (let j = top; j <= bot; j++) { const r = j <= arm ? Math.min(R[j], cx + cap) : R[j]; for (const rr of runs[j]) for (let x = rr.a; x <= rr.b; x += step) if (x > r + step) pts.push([x, Y(j)]); }
  if (pts.length > 40) {
    const S = lm.SR;
    let far = pts[0], fd = 0;
    for (const p of pts) { const d = (p[0] - S[0]) ** 2 + (p[1] - S[1]) ** 2; if (d > fd) { fd = d; far = p; } }
    const len = Math.sqrt(fd);
    const tipPts = pts.filter((p) => Math.hypot(p[0] - far[0], p[1] - far[1]) < len * 0.3 && (p[0] - S[0]) * (far[0] - S[0]) + (p[1] - S[1]) * (far[1] - S[1]) > len * len * 0.85);
    const dx = (far[0] - S[0]) / len, dy = (far[1] - S[1]) / len, nx = -dy, ny = dx;
    let lo = tipPts[0] || far, hi = lo, ls = Infinity, hs = -Infinity;
    for (const p of tipPts) { const s = (p[0] - S[0]) * nx + (p[1] - S[1]) * ny; if (s < ls) { ls = s; lo = p; } if (s > hs) { hs = s; hi = p; } }
    // 外（上側）と内（脇側）
    const [o, i] = lo[1] < hi[1] ? [lo, hi] : [hi, lo];
    lm.CO = o; lm.CI = i; lm.hasSleeves = true;
  }
  return lm as Landmarks;
}

// 点から寸法（cm）。k = 1px あたりの cm
export function measuresFromLandmarks(p: Landmarks, k: number): Measures {
  const d = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) * k;
  const hpsY = (p.NL[1] + p.NR[1]) / 2;
  const sY = (p.SL[1] + p.SR[1]) / 2, aY = (p.AL[1] + p.AR[1]) / 2, hY = (p.HL[1] + p.HR[1]) / 2;
  const cuffMid: Pt = [(p.CO[0] + p.CI[0]) / 2, (p.CO[1] + p.CI[1]) / 2];
  // 袖幅：脇の下から、肩先→袖口の線までの距離
  const ax = cuffMid[0] - p.SR[0], ay = cuffMid[1] - p.SR[1], al = Math.hypot(ax, ay) || 1;
  const bicep = (Math.abs((p.AR[0] - p.SR[0]) * ay - (p.AR[1] - p.SR[1]) * ax) / al) * k;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    length: r1((hY - hpsY) * k), chest: r1(Math.abs(p.AR[0] - p.AL[0]) * k), hem: r1(Math.abs(p.HR[0] - p.HL[0]) * k),
    shoulder: r1(d(p.SL, p.SR)), armhole: r1(Math.max(8, (aY - sY) * k)),
    neckW: r1(d(p.NL, p.NR)), neckF: r1(Math.max(1, (p.CF[1] - hpsY) * k)), neckB: 2,
    sleeve: p.hasSleeves ? r1(d(p.SR, cuffMid)) : 0, bicep: r1(bicep || 10), cuff: r1(d(p.CO, p.CI) || 8), hasSleeves: p.hasSleeves,
  };
}
