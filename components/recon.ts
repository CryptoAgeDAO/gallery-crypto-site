// 再構築デザイン（変換）：写真どおりの型紙に「操作」を重ねて、新しい服の型紙とプレビューをつくる。
// 操作：切り替え（パッチワーク）、左右で別の古着（ハーフ＆ハーフ）、ゴデ（三角の布で裾を広げる）、
// サイドパネルで身幅を広げる、裾や袖の継ぎ足し（レイヤード）、斜めカット、袖なし、フード、ポケット、拡大縮小、前後入れ替え。
// 生地 A＝取り込んだ服、生地 B＝組み合わせる別の古着。
import type { Piece } from './pattern';
import { plen, type Pt, type Traced } from './traced';

export type Op =
  | { t: 'scale'; chest?: number; length?: number }
  | { t: 'crop'; at: number; angle?: number }
  | { t: 'split'; piece: 'front' | 'back' | 'sleeve'; dir: 'h' | 'v' | 'd'; at: number; fabric?: 'A' | 'B' }
  | { t: 'half'; fabric?: 'A' | 'B' }
  | { t: 'widen'; cm: number; fabric?: 'A' | 'B' }
  | { t: 'godet'; count: number; h: number; w: number; fabric?: 'A' | 'B' }
  | { t: 'extend'; cm: number; fabric?: 'A' | 'B' }
  | { t: 'sleeveExtend'; cm: number; fabric?: 'A' | 'B' }
  | { t: 'sleeveless' }
  | { t: 'hood'; fabric?: 'A' | 'B' }
  | { t: 'pocket'; fabric?: 'A' | 'B' }
  | { t: 'swap' };
export type Design = { name: string; nameJa?: string; note?: string; ops: Op[] };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function clip(poly: Pt[], f: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b); if (fa >= 0) out.push(a); if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
  return out;
}
const area = (p: Pt[]) => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
const bbox = (p: Pt[]) => ({ x0: Math.min(...p.map((q) => q[0])), x1: Math.max(...p.map((q) => q[0])), y0: Math.min(...p.map((q) => q[1])), y1: Math.max(...p.map((q) => q[1])) });
// 半身 → 全身（中心の辺を除いて左右に開く）
const full = (half: Pt[]): Pt[] => { const r = half.slice(1); return [...r, ...r.slice(1).reverse().map((p) => [-p[0], p[1]] as Pt)]; };

type Part = { poly: Pt[]; fabric: 'A' | 'B'; fold: boolean };
function sa(poly: Pt[], fold: boolean, hemY: number, hemSA: number) {
  return poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; if (fold && Math.abs(a[0]) < 1e-6 && Math.abs(b[0]) < 1e-6) return 0; if (a[1] > hemY - 0.6 && b[1] > hemY - 0.6 && Math.abs(a[0] - b[0]) > 0.05) return hemSA; return 1; });
}
function rect(id: string, en: string, ja: string, cut: [string, string], w: number, h: number, fabric: 'A' | 'B' = 'A'): Piece {
  return { id, en, ja, cut, line: [[0, 0], [w, 0], [w, h], [0, h]], sa: [1, 1, 1, 1], grain: [[w * 0.15, h / 2], [w * 0.85, h / 2]], notches: [[w / 2, 0]], fabric };
}

export type Built = { pieces: Piece[]; front: Part[]; back: Part[]; sleeve: Part[]; hemY: number; scaleX: number; scaleY: number };
export function build(tr: Traced, d: Design): Built {
  let sx = 1, sy = 1;
  for (const o of d.ops) if (o.t === 'scale') { sx *= 1 + clamp(o.chest || 0, -0.4, 0.8); sy *= 1 + clamp(o.length || 0, -0.5, 0.8); }
  const S = (p: Pt): Pt => [p[0] * sx, p[1] * sy];
  let hemY = tr.hemY * sy;
  const swap = d.ops.some((o) => o.t === 'swap');
  let front: Part[] = [{ poly: (swap ? tr.back : tr.front).map(S), fabric: 'A', fold: true }];
  let back: Part[] = [{ poly: (swap ? tr.front : tr.back).map(S), fabric: 'A', fold: true }];
  const sleeveless = d.ops.some((o) => o.t === 'sleeveless') || !tr.sleeve;
  let sleeve: Part[] = sleeveless ? [] : [{ poly: tr.sleeve!.map((p) => [p[0] * sx, p[1] * sy] as Pt), fabric: 'A', fold: false }];
  const extra: Piece[] = [];
  const toFull = (ps: Part[]) => ps.map((p) => (p.fold ? { ...p, poly: full(p.poly), fold: false } : p));
  const cutBy = (ps: Part[], f: (p: Pt) => number, fab: 'A' | 'B') => ps.flatMap((p) => [{ ...p, poly: clip(p.poly, f) }, { ...p, poly: clip(p.poly, (q) => -f(q)), fabric: fab }]).filter((p) => p.poly.length >= 3 && area(p.poly) > 3);

  for (const o of d.ops) {
    if (o.t === 'crop') {
      const ang = ((o.angle || 0) * Math.PI) / 180;
      const c = hemY * clamp(o.at, 0.35, 1);
      if (Math.abs(ang) > 0.01) { front = toFull(front); back = toFull(back); }
      const f = (p: Pt) => c + Math.tan(ang) * p[0] - p[1];
      front = front.map((p) => ({ ...p, poly: clip(p.poly, f) })).filter((p) => p.poly.length >= 3);
      back = back.map((p) => ({ ...p, poly: clip(p.poly, (q) => c - Math.tan(ang) * q[0] - q[1]) })).filter((p) => p.poly.length >= 3);
      hemY = c + Math.abs(Math.tan(ang)) * tr.halfHem * sx;
    }
    if (o.t === 'half') { front = toFull(front); front = cutBy(front, (p) => p[0], o.fabric || 'B'); }
    if (o.t === 'split') {
      const ps = o.piece === 'front' ? front : o.piece === 'back' ? back : sleeve;
      if (!ps.length) continue;
      const all = ps.flatMap((p) => p.poly), bb = bbox(all), at = clamp(o.at, 0.1, 0.9);
      const f = o.dir === 'h' ? (p: Pt) => bb.y0 + (bb.y1 - bb.y0) * at - p[1]
        : o.dir === 'v' ? (p: Pt) => bb.x0 + (bb.x1 - bb.x0) * at - p[0]
        : (p: Pt) => (bb.y0 + (bb.y1 - bb.y0) * at + (p[0] - (bb.x0 + bb.x1) / 2) * 0.45) - p[1]; // 斜め
      const next = cutBy(ps, f, o.fabric || 'B');
      if (o.piece === 'front') front = next; else if (o.piece === 'back') back = next; else sleeve = next;
    }
    if (o.t === 'widen') {
      const h = hemY - tr.sideTop[1] * sy, w = clamp(o.cm, 2, 30);
      extra.push({ ...rect('side', 'Side panel', 'サイドパネル', ['Cut 2', '2枚'], w, h, o.fabric || 'B'), notches: [[w / 2, 0], [w / 2, h]] });
    }
    if (o.t === 'godet') {
      const n = clamp(Math.round(o.count), 1, 8), h = clamp(o.h, 6, 60), w = clamp(o.w, 4, 50);
      const line: Pt[] = [[w / 2, 0], [w, h], ...Array.from({ length: 9 }, (_, i) => [w - (w * (i + 1)) / 10, h + Math.sin(((i + 1) / 10) * Math.PI) * w * 0.08] as Pt), [0, h]];
      extra.push({ id: 'godet', en: 'Godet', ja: 'ゴデ（三角布）', cut: [`Cut ${n}`, `${n}枚`], line, sa: line.map(() => 1), grain: [[w / 2, h * 0.3], [w / 2, h * 0.9]], notches: [[w / 2, 0]], fabric: o.fabric || 'B' });
    }
    if (o.t === 'extend') {
      const h = clamp(o.cm, 3, 60), w = tr.halfHem * sx;
      extra.push({ id: 'ext', en: 'Hem extension', ja: '裾の継ぎ足し', cut: ['Cut 2 on fold (front & back)', '「わ」で2枚（前・後ろ）'], line: [[0, 0], [w, 0], [w * 1.04, h], [0, h]], sa: [1, 1, 2.5, 0], grain: [[w * 0.3, h * 0.2], [w * 0.3, h * 0.8]], notches: [], fabric: o.fabric || 'B' });
    }
    if (o.t === 'sleeveExtend' && !sleeveless) {
      const w = Math.max(6, tr.cuffHalf * sx) * 2, h = clamp(o.cm, 3, 50);
      extra.push({ id: 'sext', en: 'Sleeve extension', ja: '袖の継ぎ足し', cut: ['Cut 2', '2枚'], line: [[0, 0], [w, 0], [w * 0.92, h], [w * 0.08, h]], sa: [1, 1, 2.5, 1], grain: [[w / 2, h * 0.2], [w / 2, h * 0.8]], notches: [[w / 2, 0]], fabric: o.fabric || 'B' });
    }
    if (o.t === 'hood') {
      const base = (plen(tr.neckF) + plen(tr.neckB)) * sx, H = 34, D = Math.max(23, base * 0.95);
      const bz = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n: number) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0], u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]] as Pt; });
      const line: Pt[] = [[0, H], ...bz([0, H], [base * 0.4, H + 1.5], [base * 0.8, H], [base, H - 2], 10).slice(1), ...bz([base, H - 2], [D + 2, H * 0.55], [D + 1, 6], [D * 0.55, 0], 12).slice(1), ...bz([D * 0.55, 0], [D * 0.25, -0.5], [0, 2], [0, 6], 8).slice(1)];
      extra.push({ id: 'hood', en: 'Hood', ja: 'フード', cut: ['Cut 2 (mirror)', '左右対称で2枚'], line, sa: line.map(() => 1), grain: [[D * 0.4, 8], [D * 0.4, H - 6]], notches: [[base * 0.5, H + 1]], fabric: o.fabric || 'A' });
    }
    if (o.t === 'pocket') {
      const w = tr.halfChest * sx * 1.2, h = 20;
      const line: Pt[] = [[7, 0], [w - 7, 0], [w, h], [0, h]];
      extra.push({ id: 'pocket', en: 'Kangaroo pocket', ja: 'カンガルーポケット', cut: ['Cut 1', '1枚'], line, sa: line.map(() => 1), grain: [[w / 2, 3], [w / 2, h - 3]], notches: [], fabric: o.fabric || 'B' });
    }
  }
  if (sleeveless && tr.sleeve) extra.push(rect('bind', 'Armhole binding', '袖ぐりバイアス', ['Cut 2 (bias)', 'バイアスで2枚'], tr.armLen * 2 * 0.95, 3.2));
  const neckRound = (plen(tr.neckF) + plen(tr.neckB)) * 2 * sx;
  if (!d.ops.some((o) => o.t === 'hood')) extra.push(rect('neck', 'Neck rib', '衿ぐりリブ', ['Cut 1 (rib knit)', 'リブ地で1枚'], neckRound * 0.85, 5));

  const pieces: Piece[] = [];
  const add = (ps: Part[], id: string, en: string, ja: string, isSleeve: boolean) => ps.forEach((p, i) => {
    const onFold = p.fold && p.poly.some((q) => Math.abs(q[0]) < 1e-6);
    const bb = bbox(p.poly);
    const n = ps.length > 1 ? ` ${i + 1}` : '';
    const cut: [string, string] = isSleeve ? ['Cut 2 (mirror)', '左右対称で2枚'] : onFold ? ['Cut 1 on fold', '「わ」で1枚'] : p.fold ? ['Cut 2 (mirror)', '左右対称で2枚'] : ['Cut 1', '1枚'];
    const gx = (bb.x0 + bb.x1) / 2 - (onFold ? (bb.x1 - bb.x0) * 0.2 : 0);
    pieces.push({ id: id + i, en: en + n, ja: ja + n, cut, line: p.poly, sa: sa(p.poly, onFold, isSleeve ? bb.y1 : hemY, 2.5), grain: [[gx, bb.y0 + (bb.y1 - bb.y0) * 0.25], [gx, bb.y0 + (bb.y1 - bb.y0) * 0.75]], notches: [], fabric: p.fabric });
  });
  add(front, 'front', swap ? 'Front (from back)' : 'Front body', swap ? '前身頃（元の後ろ）' : '前身頃', false);
  add(back, 'back', swap ? 'Back (from front)' : 'Back body', swap ? '後身頃（元の前）' : '後身頃', false);
  add(sleeve, 'sleeve', 'Sleeve', '袖', true);
  pieces.push(...extra);
  return { pieces, front, back, sleeve, hemY, scaleX: sx, scaleY: sy };
}

// ---- プレビュー：取り込んだ写真を切り貼りして、仕上がりの見本をつくる ----
export function preview(photo: HTMLCanvasElement, mask: Uint8ClampedArray, tr: Traced, d: Design, fabB: HTMLCanvasElement | null, out: HTMLCanvasElement) {
  const W = photo.width, H = photo.height;
  const { cx, top, k } = tr.px;
  const ppc = 1 / k; // 1cm あたりの画素
  const b = build(tr, d);
  // 生地A（服だけ）
  const A = document.createElement('canvas'); A.width = W; A.height = H;
  { const x = A.getContext('2d')!; x.drawImage(photo, 0, 0); const id = x.getImageData(0, 0, W, H); for (let i = 0; i < mask.length; i++) id.data[i * 4 + 3] = mask[i]; x.putImageData(id, 0, 0); }
  // 生地B（別の古着の写真、なければ斜線）
  const pat = document.createElement('canvas'); pat.width = pat.height = 64;
  { const x = pat.getContext('2d')!; if (fabB) { x.drawImage(fabB, fabB.width * 0.3, fabB.height * 0.35, fabB.width * 0.25, fabB.width * 0.25, 0, 0, 64, 64); } else { x.fillStyle = '#5b6f8f'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#7d93b6'; x.lineWidth = 10; for (let i = -64; i < 128; i += 22) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke(); } } }
  const pad = Math.round(Math.max(W, H) * 0.12);
  out.width = W + pad * 2; out.height = H + pad * 2;
  const x = out.getContext('2d')!;
  x.fillStyle = '#f3f2ef'; x.fillRect(0, 0, out.width, out.height);
  x.save(); x.translate(pad, pad);
  const P = (p: Pt, mirror = false): [number, number] => [cx + (mirror ? -p[0] : p[0]) * ppc, top + p[1] * ppc];
  // 拡大縮小と身幅の追加：左右半分をずらして描く
  const widen = d.ops.filter((o) => o.t === 'widen').reduce((s, o) => s + (o as { cm: number }).cm, 0) * ppc / 2;
  const scl = (cxv: number) => { x.translate(cxv, top); x.scale(b.scaleX, b.scaleY); x.translate(-cxv, -top); };
  const half = (side: -1 | 1) => { x.save(); x.beginPath(); if (side < 0) x.rect(-pad, -pad, cx + pad, H + pad * 2); else x.rect(cx, -pad, W + pad, H + pad * 2); x.clip(); scl(cx); x.drawImage(A, 0, 0); x.restore(); };
  const sleeveless = d.ops.some((o) => o.t === 'sleeveless');
  if (sleeveless) {
    // 袖を消す：胴の幅の外を描かない
    const capPx = tr.px.capPx;
    x.save(); x.beginPath(); x.rect(cx - capPx * b.scaleX, -pad, capPx * b.scaleX * 2, H + pad * 2); x.clip(); half(-1); half(1); x.restore();
  } else { half(-1); half(1); }
  const fillB = () => { x.fillStyle = x.createPattern(pat, 'repeat')!; };
  // 身幅の追加パネル
  if (widen > 0) { x.save(); fillB(); const y0 = tr.px.armPx, y1 = top + b.hemY * ppc; for (const s of [-1, 1]) { const ex = cx + s * (Math.max(tr.halfChest, tr.halfHem) * ppc * b.scaleX - 2); x.beginPath(); x.rect(s < 0 ? ex - widen : ex, y0, widen, y1 - y0); x.fill(); x.setLineDash([5, 4]); x.strokeStyle = 'rgba(20,20,20,.5)'; x.stroke(); } x.restore(); }
  // パーツの生地B部分を塗る（前身頃）
  const poly = (pts: Pt[], mirror: boolean) => { x.beginPath(); pts.forEach((p, i) => { const q = P(p, mirror); const xx = cx + (q[0] - cx) * b.scaleX; const yy = top + (q[1] - top) * b.scaleY; if (i) x.lineTo(xx, yy); else x.moveTo(xx, yy); }); x.closePath(); };
  for (const p of b.front) {
    const sides = p.fold ? [false, true] : [false];
    for (const m of sides) {
      poly(p.poly.map((q) => [q[0] / b.scaleX, q[1] / b.scaleY] as Pt), m);
      if (p.fabric === 'B') { x.save(); x.clip(); x.globalCompositeOperation = 'source-atop'; fillB(); x.fillRect(-pad, -pad, W + pad * 2, H + pad * 2); x.restore(); }
      x.save(); poly(p.poly.map((q) => [q[0] / b.scaleX, q[1] / b.scaleY] as Pt), m); x.setLineDash([6, 5]); x.strokeStyle = 'rgba(20,20,20,.55)'; x.lineWidth = 2; x.stroke(); x.restore();
    }
  }
  // 斜めカット・クロップ：裾より下を消す
  const crop = d.ops.find((o) => o.t === 'crop') as { at: number; angle?: number } | undefined;
  if (crop) {
    const ang = ((crop.angle || 0) * Math.PI) / 180, c = tr.hemY * b.scaleY * clamp(crop.at, 0.35, 1);
    x.save(); x.globalCompositeOperation = 'destination-out'; x.beginPath();
    const L = -pad - widen, R = W + pad + widen;
    const yAt = (xx: number) => top + (c + Math.tan(ang) * ((xx - cx) / ppc)) * ppc;
    x.moveTo(L, yAt(L)); x.lineTo(R, yAt(R)); x.lineTo(R, H + pad * 2); x.lineTo(L, H + pad * 2); x.closePath();
    x.fillStyle = '#000'; x.fill(); x.restore();
    x.save(); x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#f3f2ef'; x.fillRect(-pad, -pad, W + pad * 2, H + pad * 2); x.restore();
  }
  const hemPx = top + b.hemY * ppc;
  const hwPx = tr.halfHem * ppc * b.scaleX + widen;
  // 裾の継ぎ足し
  for (const o of d.ops) if (o.t === 'extend') { x.save(); fillB(); x.fillRect(cx - hwPx, hemPx - 2, hwPx * 2, o.cm * ppc); x.strokeStyle = 'rgba(20,20,20,.5)'; x.setLineDash([6, 5]); x.strokeRect(cx - hwPx, hemPx - 2, hwPx * 2, o.cm * ppc); x.restore(); }
  // ゴデ（裾から上へ三角に差し込む）
  for (const o of d.ops) if (o.t === 'godet') {
    const n = clamp(Math.round(o.count), 1, 8), h = o.h * ppc, w = o.w * ppc;
    const xs = n === 1 ? [cx] : Array.from({ length: n }, (_, i) => cx - hwPx + (hwPx * 2 * (i + 0.5)) / n);
    x.save(); fillB();
    for (const gx of xs) { x.beginPath(); x.moveTo(gx, hemPx - h); x.lineTo(gx + w / 2, hemPx + w * 0.06); x.lineTo(gx - w / 2, hemPx + w * 0.06); x.closePath(); x.fill(); x.setLineDash([5, 4]); x.strokeStyle = 'rgba(20,20,20,.5)'; x.stroke(); }
    x.restore();
  }
  // 袖の継ぎ足し（袖口の先に帯）
  if (!sleeveless) for (const o of d.ops) if (o.t === 'sleeveExtend') {
    const len = tr.px.tmax * 0.97, [dx, dy] = tr.px.dir, S = tr.px.S;
    for (const s of [1, -1]) {
      const ex = cx + (S[0] - cx + dx * len) * s * b.scaleX, ey = top + (S[1] - top + dy * len) * b.scaleY;
      x.save(); x.translate(ex, ey); x.rotate(Math.atan2(dy, dx * s)); fillB();
      const wv = tr.cuffHalf * ppc * 0.5; x.fillRect(0, -wv, o.cm * ppc, wv * 2); x.setLineDash([5, 4]); x.strokeStyle = 'rgba(20,20,20,.5)'; x.strokeRect(0, -wv, o.cm * ppc, wv * 2); x.restore();
    }
  }
  // フード・ポケット
  for (const o of d.ops) {
    if (o.t === 'hood') { const r = tr.halfChest * ppc * 0.55; x.save(); if (o.fabric === 'B') fillB(); else x.fillStyle = '#cfc8bb'; x.beginPath(); x.ellipse(cx, top - r * 0.55, r * 0.9, r * 1.05, 0, Math.PI * 0.95, Math.PI * 2.05); x.closePath(); x.fill(); x.fillStyle = 'rgba(0,0,0,.55)'; x.beginPath(); x.ellipse(cx, top - r * 0.35, r * 0.52, r * 0.7, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
    if (o.t === 'pocket') { const w = tr.halfChest * ppc * 1.2, h = 20 * ppc, y0 = hemPx - h - 8 * ppc; x.save(); fillB(); x.beginPath(); x.moveTo(cx - w / 2 + 4 * ppc, y0); x.lineTo(cx + w / 2 - 4 * ppc, y0); x.lineTo(cx + w / 2, y0 + h); x.lineTo(cx - w / 2, y0 + h); x.closePath(); x.fill(); x.setLineDash([5, 4]); x.strokeStyle = 'rgba(20,20,20,.5)'; x.stroke(); x.restore(); }
  }
  x.restore();
}

// ---- 組み込みの再構築デザイン ----
export const BUILTIN: Design[] = [
  { name: 'Original', nameJa: '原型（写真どおり）', ops: [] },
  { name: 'Deconstructed patchwork', nameJa: '解体パッチワーク', note: '前身頃を斜めと縦で切り替え、袖も途中で切り替えて、別の古着（生地B）とつなぐ。', ops: [{ t: 'split', piece: 'front', dir: 'd', at: 0.4, fabric: 'B' }, { t: 'split', piece: 'front', dir: 'v', at: 0.55, fabric: 'A' }, { t: 'split', piece: 'back', dir: 'h', at: 0.62, fabric: 'B' }, { t: 'split', piece: 'sleeve', dir: 'h', at: 0.55, fabric: 'B' }] },
  { name: 'Half & half', nameJa: 'ハーフ＆ハーフ', note: '前身頃を中心で左右に分け、片側を別の古着に置き換える。', ops: [{ t: 'half', fabric: 'B' }, { t: 'split', piece: 'sleeve', dir: 'h', at: 0.5, fabric: 'A' }] },
  { name: 'Godet flare', nameJa: 'ゴデで裾を広げる', note: '裾に三角布を4枚差し込み、Aラインに広げる。', ops: [{ t: 'godet', count: 4, h: 26, w: 18, fabric: 'B' }] },
  { name: 'Side-panel oversize', nameJa: 'サイドパネルでオーバーサイズ', note: '脇に別布のパネルを足して身幅を片側10cmずつ広げ、着丈も伸ばす。', ops: [{ t: 'widen', cm: 10, fabric: 'B' }, { t: 'scale', length: 0.06 }] },
  { name: 'Layered extension', nameJa: 'レイヤード継ぎ足し', note: '裾と袖口に別の古着を継ぎ足して、重ね着したような長さに。', ops: [{ t: 'extend', cm: 16, fabric: 'B' }, { t: 'sleeveExtend', cm: 32, fabric: 'B' }] },
  { name: 'Asymmetric raw cut', nameJa: '斜めカット（アシメ）', note: '裾を斜めに切り落とし、切りっぱなしで仕上げる。', ops: [{ t: 'crop', at: 0.86, angle: 14 }] },
  { name: 'Hoodie rebuild', nameJa: 'フーディ再構築', note: 'フードとカンガルーポケットを別の古着から足してパーカーに。', ops: [{ t: 'hood', fabric: 'B' }, { t: 'pocket', fabric: 'B' }, { t: 'extend', cm: 7, fabric: 'A' }] },
  { name: 'Back-to-front sleeveless', nameJa: '前後逆ノースリーブ', note: '後ろ身頃を前に使い、袖を外してノースリーブに。', ops: [{ t: 'swap' }, { t: 'sleeveless' }, { t: 'crop', at: 0.9 }] },
];

// AI（Gemini）に返してもらう形
export const DESIGN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' }, nameJa: { type: 'STRING' }, note: { type: 'STRING' },
    ops: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      t: { type: 'STRING', enum: ['scale', 'crop', 'split', 'half', 'widen', 'godet', 'extend', 'sleeveExtend', 'sleeveless', 'hood', 'pocket', 'swap'] },
      chest: { type: 'NUMBER' }, length: { type: 'NUMBER' }, at: { type: 'NUMBER' }, angle: { type: 'NUMBER' },
      piece: { type: 'STRING', enum: ['front', 'back', 'sleeve'] }, dir: { type: 'STRING', enum: ['h', 'v', 'd'] },
      fabric: { type: 'STRING', enum: ['A', 'B'] }, cm: { type: 'NUMBER' }, count: { type: 'NUMBER' }, h: { type: 'NUMBER' }, w: { type: 'NUMBER' },
    }, required: ['t'] } },
  },
  required: ['name', 'nameJa', 'note', 'ops'],
};
export function designFromAI(r: unknown): Design | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as { name?: unknown; nameJa?: unknown; note?: unknown; ops?: unknown };
  if (!Array.isArray(o.ops)) return null;
  const n = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
  const ops: Op[] = [];
  for (const q of o.ops.slice(0, 12) as Record<string, unknown>[]) {
    const fab = q.fabric === 'A' ? 'A' : 'B';
    switch (q.t) {
      case 'scale': ops.push({ t: 'scale', chest: n(q.chest, 0), length: n(q.length, 0) }); break;
      case 'crop': ops.push({ t: 'crop', at: n(q.at, 0.85), angle: n(q.angle, 0) }); break;
      case 'split': ops.push({ t: 'split', piece: q.piece === 'back' || q.piece === 'sleeve' ? q.piece : 'front', dir: q.dir === 'v' || q.dir === 'd' ? q.dir : 'h', at: n(q.at, 0.5), fabric: fab }); break;
      case 'half': ops.push({ t: 'half', fabric: fab }); break;
      case 'widen': ops.push({ t: 'widen', cm: n(q.cm, 8), fabric: fab }); break;
      case 'godet': ops.push({ t: 'godet', count: n(q.count, 4), h: n(q.h, 24), w: n(q.w, 16), fabric: fab }); break;
      case 'extend': ops.push({ t: 'extend', cm: n(q.cm, 12), fabric: fab }); break;
      case 'sleeveExtend': ops.push({ t: 'sleeveExtend', cm: n(q.cm, 20), fabric: fab }); break;
      case 'sleeveless': ops.push({ t: 'sleeveless' }); break;
      case 'hood': ops.push({ t: 'hood', fabric: fab }); break;
      case 'pocket': ops.push({ t: 'pocket', fabric: fab }); break;
      case 'swap': ops.push({ t: 'swap' }); break;
    }
  }
  return { name: String(o.name || 'AI design').slice(0, 60), nameJa: typeof o.nameJa === 'string' ? o.nameJa.slice(0, 40) : undefined, note: typeof o.note === 'string' ? o.note.slice(0, 400) : undefined, ops };
}
