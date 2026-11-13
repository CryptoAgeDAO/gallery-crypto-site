// 高度な型紙エンジン：服の「設計図（Spec）」から型紙のパーツを組み立てる。
// 袖の付け方（セットイン／ラグラン／ドロップショルダー／なし）、衿ぐり（クルー／V／モック／ボート）、
// フード、ポケット、裾の形（ストレート／カーブ／アシンメトリー／スリット）、リブ、切り替え（パッチワーク用の分割）に対応。
// AI（Gemini）は写真からこの Spec を予測し、変換案も Spec で返す。ここはそれを確実に型紙へ落とす部分。
import type { Measures, Piece } from './pattern';

type Pt = [number, number];
export type Spec = {
  name: string;
  nameJa?: string;
  note?: string;
  m: Measures;
  sleeve: 'setin' | 'raglan' | 'drop' | 'none';
  drop: number; // ドロップショルダーで肩を落とす量（cm）
  neck: 'crew' | 'v' | 'mock' | 'boat';
  hood: boolean;
  pocket: 'none' | 'kangaroo' | 'patch';
  hem: 'straight' | 'curved' | 'asym' | 'slits';
  hemAmount: number; // カーブの上がり量／アシンメトリーの差／スリットの長さ（cm）
  ribHem: boolean;
  ribCuff: boolean;
  splits: { piece: 'front' | 'back' | 'sleeve'; dir: 'h' | 'v'; at: number }[]; // 切り替え線（0〜1 の位置）
};

export function baseSpec(m: Measures): Spec {
  return { name: 'Original', nameJa: '原型', m, sleeve: m.hasSleeves ? 'setin' : 'none', drop: 0, neck: 'crew', hood: false, pocket: 'none', hem: 'straight', hemAmount: 0, ribHem: false, ribCuff: m.sleeve > 40, splits: [] };
}

const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 16): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; });
const plen = (a: Pt[]) => a.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) : 0), 0);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// 縫い代を辺の位置から決める：中心（x=0）は「わ」で0、裾は2.5（リブなら1）、ほかは1
function saFor(line: Pt[], hemY: (x: number) => number, hemSA: number, fold: boolean) {
  return line.map((a, i) => {
    const b = line[(i + 1) % line.length];
    if (fold && Math.abs(a[0]) < 1e-6 && Math.abs(b[0]) < 1e-6) return 0;
    const onHem = Math.abs(a[1] - hemY(a[0])) < 0.3 && Math.abs(b[1] - hemY(b[0])) < 0.3 && Math.abs(a[0] - b[0]) > 0.05;
    return onHem ? hemSA : 1;
  });
}

// 直線で多角形を切る（Sutherland–Hodgman：片側だけ残す）
function clip(poly: Pt[], keep: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = keep(a), fb = keep(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

type Body = { line: Pt[]; armLen: number; neckLen: number; raglan?: { len: number; neckPart: number }; hemY: (x: number) => number; L: number; notch: Pt[] };

function bodyPiece(s: Spec, back: boolean): Body {
  const m = s.m;
  const nwBase = m.neckW / 2;
  const nw = s.neck === 'boat' ? nwBase * 1.45 : s.neck === 'mock' ? nwBase * 0.85 : nwBase;
  const nd = back ? (s.neck === 'boat' ? 1 : m.neckB) : s.neck === 'v' ? Math.max(12, m.neckF * 2) : s.neck === 'boat' ? 3 : s.neck === 'mock' ? m.neckF * 0.6 : m.neckF;
  const sd = 3.5;
  const drop = s.sleeve === 'drop' ? Math.max(4, s.drop || 8) : 0;
  const sw = m.shoulder / 2 + drop;
  const cw = m.chest / 2, hw = m.hem / 2, L = m.length;
  const ad = m.armhole + sd * 0.4 + (s.sleeve === 'drop' ? drop * 0.35 : 0) + (s.sleeve === 'none' ? 3 : 0);
  // 裾の線（カーブなら脇が上がる）
  const curve = s.hem === 'curved' ? clamp(s.hemAmount || 6, 1, 20) : 0;
  const hemY = (x: number) => L - curve * Math.pow(clamp(Math.abs(x) / Math.max(1, hw), 0, 1), 2);
  const neck: Pt[] = s.neck === 'v' && !back ? [[0, nd], [nw, 0]] : bez([0, nd], [nw * 0.55, nd], [nw, nd * 0.45], [nw, 0], 12);
  const hemPts: Pt[] = [];
  for (let i = 8; i >= 0; i--) { const x = (hw * i) / 8; hemPts.push([x, hemY(x)]); }
  const sideEnd: Pt = [hw, hemY(hw)];
  if (s.sleeve === 'raglan') {
    // ラグラン：襟ぐりの途中から脇の下へ斜めに切り替える。肩は袖側に入る
    const ki = Math.round(neck.length * 0.45);
    const R = neck[ki];
    const rag = bez(R, [R[0] + (cw - R[0]) * 0.35, R[1] + ad * 0.25], [cw - 1.5, ad * 0.75], [cw, ad], 16);
    const side = bez([cw, ad], [cw, ad + (L - ad) * 0.35], [hw, sideEnd[1] - (L - ad) * 0.35], sideEnd, 10);
    const line: Pt[] = [[0, hemY(0)], ...neck.slice(0, ki + 1), ...rag.slice(1), ...side.slice(1), ...hemPts.slice(1, -1)];
    return { line, armLen: plen(rag), neckLen: plen(neck.slice(0, ki + 1)), raglan: { len: plen(rag), neckPart: plen(neck.slice(ki)) }, hemY, L, notch: [rag[8]] };
  }
  const arm = s.sleeve === 'drop'
    ? bez([sw, sd + drop * 0.12], [sw - 0.3, sd + (ad - sd) * 0.5], [cw + 0.2, ad - 2], [cw, ad], 14)
    : bez([sw, sd], [sw - 0.8, sd + (ad - sd) * 0.45], [cw - (cw - sw) * 0.85 - 0.6, ad], [cw, ad], 16);
  const shoulderPt: Pt = s.sleeve === 'drop' ? [sw, sd + drop * 0.12] : [sw, sd];
  const side = bez([cw, ad], [cw, ad + (L - ad) * 0.35], [hw, sideEnd[1] - (L - ad) * 0.35], sideEnd, 10);
  const line: Pt[] = [[0, hemY(0)], ...neck, shoulderPt, ...arm.slice(1), ...side.slice(1), ...hemPts.slice(1, -1)];
  return { line, armLen: plen(arm), neckLen: plen(neck), hemY, L, notch: back ? [arm[10], arm[12]] : [arm[8]] };
}

// 半身（わ）を左右に開いて全身にする（アシンメトリー用）
function mirrorFull(half: Pt[]): Pt[] {
  // half = [裾の中心, 衿ぐりの中心, …襟ぐり…肩…袖ぐり…脇…裾（中心の手前まで）]
  const right = half.slice(1);
  const left = right.slice(1).reverse().map((p) => [-p[0], p[1]] as Pt);
  return [...right, ...left];
}

function rect(id: string, en: string, ja: string, cut: [string, string], w: number, h: number): Piece {
  return { id, en, ja, cut, line: [[0, 0], [w, 0], [w, h], [0, h]], sa: [1, 1, 1, 1], grain: [[w * 0.15, h / 2], [w * 0.85, h / 2]], notches: [[w / 2, 0]] };
}

export function specPieces(s: Spec): Piece[] {
  const out: Piece[] = [];
  const m = s.m;
  const F = bodyPiece(s, false), B = bodyPiece(s, true);
  const hemSA = s.ribHem ? 1 : 2.5;
  const mk = (id: string, en: string, ja: string, b: Body, front: boolean): Piece[] => {
    let line = b.line, fold = true;
    if (s.hem === 'asym' && front) {
      // アシンメトリー：左右で着丈を変える（全身で裁つ）
      const d = clamp(s.hemAmount || 8, 2, 30);
      line = mirrorFull(line).map((p) => (p[1] > b.L - 15 ? [p[0], p[1] + d * clamp((-p[0] / (m.hem / 2) + 1) / 2, 0, 1) * ((p[1] - (b.L - 15)) / 15)] as Pt : p));
      fold = false;
    }
    const hemY = fold ? b.hemY : (x: number) => b.hemY(x) + (s.hem === 'asym' ? clamp(s.hemAmount || 8, 2, 30) * clamp((-x / (m.hem / 2) + 1) / 2, 0, 1) : 0);
    // 切り替え（分割）
    let parts: Pt[][] = [line];
    const sp = s.splits.filter((q) => q.piece === (front ? 'front' : 'back'));
    // 切り替え位置は元のパーツ全体に対する割合（何本引いても位置がずれない）
    const X0 = Math.min(...line.map((p) => p[0])), X1 = Math.max(...line.map((p) => p[0])), Y0 = Math.min(...line.map((p) => p[1])), Y1 = Math.max(...line.map((p) => p[1]));
    const area = (poly: Pt[]) => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    for (const q of sp) {
      const next: Pt[][] = [];
      const c = q.dir === 'h' ? Y0 + (Y1 - Y0) * clamp(q.at, 0.1, 0.9) : X0 + (X1 - X0) * clamp(q.at, 0.1, 0.9);
      for (const poly of parts) {
        if (q.dir === 'h') next.push(clip(poly, (p) => c - p[1]), clip(poly, (p) => p[1] - c));
        else next.push(clip(poly, (p) => c - p[0]), clip(poly, (p) => p[0] - c));
      }
      parts = next.filter((p) => p.length >= 3 && area(p) > 4);
    }
    return parts.map((poly, i) => {
      const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
      const onFold = fold && poly.some((p) => Math.abs(p[0]) < 1e-6);
      const sa = saFor(poly, hemY, hemSA, onFold);
      const gx = (Math.min(...xs) + Math.max(...xs)) / 2 - (onFold ? (Math.max(...xs) - Math.min(...xs)) * 0.2 : 0);
      const n = parts.length > 1 ? ` ${i + 1}` : '';
      const cut: [string, string] = onFold ? ['Cut 1 on fold', '「わ」で1枚'] : fold ? ['Cut 2 (mirror)', '左右対称で2枚'] : ['Cut 1', '1枚'];
      return { id: id + i, en: en + n, ja: ja + n, cut, line: poly, sa, grain: [[gx, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.25], [gx, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.75]] as [Pt, Pt], notches: b.notch.filter((p) => poly.length && p[1] >= Math.min(...ys) && p[1] <= Math.max(...ys)) };
    });
  };
  out.push(...mk('front', 'Front body', '前身頃', F, true));
  out.push(...mk('back', 'Back body', '後身頃', B, false));

  // 袖
  if (s.sleeve !== 'none') {
    const AH = (F.armLen + B.armLen) / 2;
    const bw = m.bicep * (s.sleeve === 'drop' ? 0.92 : 1), cw = m.cuff, SL = Math.max(8, m.sleeve - (s.sleeve === 'drop' ? s.drop || 8 : 0));
    let line: Pt[];
    let capH = 0;
    if (s.sleeve === 'raglan' && F.raglan && B.raglan) {
      // ラグラン袖：上辺は襟ぐりの一部、斜めの辺はラグラン線と同じ長さ
      const top = (F.raglan.neckPart + B.raglan.neckPart) / 2;
      const rl = (F.raglan.len + B.raglan.len) / 2;
      const dy = Math.sqrt(Math.max(4, rl * rl - (bw - top) ** 2));
      capH = dy;
      line = [[-top, 0], [top, 0], ...bez([top, 0], [top + (bw - top) * 0.3, dy * 0.4], [bw - 0.5, dy * 0.8], [bw, dy], 10).slice(1), [cw, dy + SL], [-cw, dy + SL], ...bez([-bw, dy], [-bw + 0.5, dy * 0.8], [-top - (bw - top) * 0.3, dy * 0.4], [-top, 0], 10).slice(0, -1)];
    } else {
      const flat = s.sleeve === 'drop' ? 0.55 : 1;
      const capCurve = (h: number) => bez([0, 0], [bw * 0.18, 0], [bw * 0.38, h * 0.7], [bw, h], 18);
      let lo = 1, hi = 25;
      for (let i = 0; i < 30; i++) { const h = (lo + hi) / 2; if (plen(capCurve(h)) > AH + 0.8) hi = h; else lo = h; }
      capH = ((lo + hi) / 2) * flat;
      const cap = capCurve(capH);
      line = [...[...cap].reverse().map((p) => [-p[0], p[1]] as Pt), ...cap.slice(1), [cw, SL], [-cw, SL]];
    }
    const sa = line.map(() => 1);
    const cuffIdx = line.findIndex((p) => p[0] === cw && p[1] > capH);
    if (cuffIdx >= 0) sa[cuffIdx] = s.ribCuff ? 1 : 2.5;
    let parts: Pt[][] = [line];
    for (const q of s.splits.filter((x) => x.piece === 'sleeve')) {
      const next: Pt[][] = [];
      for (const poly of parts) { const ys = poly.map((p) => p[1]); const c = Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * clamp(q.at, 0.1, 0.9); next.push(clip(poly, (p) => c - p[1]), clip(poly, (p) => p[1] - c)); }
      parts = next.filter((p) => p.length >= 3);
    }
    parts.forEach((poly, i) => {
      const ys = poly.map((p) => p[1]);
      const psa = parts.length > 1 ? poly.map((a, k) => { const b = poly[(k + 1) % poly.length]; return Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[1] - Math.max(...ys)) < 1e-6 && !s.ribCuff && Math.max(...ys) >= Math.max(...line.map((p) => p[1])) - 1e-6 ? 2.5 : 1; }) : sa;
      out.push({ id: 'sleeve' + i, en: s.sleeve === 'raglan' ? 'Raglan sleeve' : 'Sleeve', ja: (s.sleeve === 'raglan' ? 'ラグラン袖' : '袖') + (parts.length > 1 ? ` ${i + 1}` : ''), cut: ['Cut 2 (mirror)', '左右対称で2枚'], line: poly, sa: psa, grain: [[0, Math.min(...ys) + 2], [0, Math.max(...ys) - 2]], notches: i === 0 ? [[0, 0]] : [] });
    });
    if (s.ribCuff) out.push(rect('cuff', 'Cuff rib', '袖口リブ', ['Cut 2', '2枚'], cw * 2 * 0.82, 14));
  } else {
    out.push(rect('bind', 'Armhole binding', '袖ぐりバイアス', ['Cut 2 (bias)', 'バイアスで2枚'], (F.armLen + B.armLen) * 0.95, 3.2));
  }

  // 衿・フード
  const neckRound = (F.neckLen + B.neckLen) * 2 + (F.raglan && B.raglan ? (F.raglan.neckPart + B.raglan.neckPart) * 2 : 0);
  if (s.hood) {
    // フード：首まわりの半分を下辺にした左右2枚
    const base = neckRound / 2, H = 34, D = Math.max(23, base * 0.95);
    const line: Pt[] = [[0, H], ...bez([0, H], [base * 0.4, H + 1.5], [base * 0.8, H], [base, H - 2], 10).slice(1), ...bez([base, H - 2], [D + 2, H * 0.55], [D + 1, 6], [D * 0.55, 0], 12).slice(1), ...bez([D * 0.55, 0], [D * 0.25, -0.5], [0, 2], [0, 6], 8).slice(1)];
    out.push({ id: 'hood', en: 'Hood', ja: 'フード', cut: ['Cut 2 (mirror)', '左右対称で2枚'], line, sa: line.map(() => 1), grain: [[D * 0.4, 8], [D * 0.4, H - 6]], notches: [[base * 0.5, H + 1]] });
  } else {
    const ribH = s.neck === 'mock' ? 12 : 5;
    out.push(rect('neck', s.neck === 'mock' ? 'Mock neck' : 'Neck rib', s.neck === 'mock' ? 'モックネック' : '衿ぐりリブ', ['Cut 1 (rib knit)', 'リブ地で1枚'], neckRound * 0.85, ribH));
  }
  if (s.ribHem) out.push(rect('hem', 'Hem rib', '裾リブ', ['Cut 1 (rib knit)', 'リブ地で1枚'], m.hem * 2 * 0.86, 14));
  if (s.pocket === 'kangaroo') {
    const w = m.chest * 0.6, h = 20;
    const line: Pt[] = [[7, 0], [w - 7, 0], [w, h], [0, h]]; // 斜めの辺が手を入れる口
    out.push({ id: 'pocket', en: 'Kangaroo pocket', ja: 'カンガルーポケット', cut: ['Cut 1', '1枚'], line, sa: line.map(() => 1), grain: [[w / 2, 3], [w / 2, h - 3]], notches: [] });
  } else if (s.pocket === 'patch') out.push(rect('pocket', 'Patch pocket', 'パッチポケット', ['Cut 1', '1枚'], 13, 15));
  return out;
}

// AI の返答（JSON）を安全に Spec にする
export function specFromAI(raw: unknown, m: Measures): Spec | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (typeof v === 'string' && (ok as readonly string[]).includes(v) ? (v as T) : d);
  const num = (v: unknown, d: number, a: number, b: number) => (typeof v === 'number' && isFinite(v) ? clamp(v, a, b) : d);
  const mm = (r.measures || {}) as Record<string, unknown>;
  const scale = (k: keyof Measures, a: number, b: number) => (typeof mm[k] === 'number' ? clamp(mm[k] as number, a, b) : (m[k] as number));
  const nm: Measures = {
    ...m,
    length: scale('length', 20, 140), chest: scale('chest', 20, 90), hem: scale('hem', 20, 100), shoulder: scale('shoulder', 20, 80),
    armhole: scale('armhole', 12, 40), neckW: scale('neckW', 8, 40), neckF: scale('neckF', 2, 30), neckB: scale('neckB', 1, 8),
    sleeve: scale('sleeve', 0, 90), bicep: scale('bicep', 8, 40), cuff: scale('cuff', 5, 30),
  };
  const sleeve = pick(r.sleeve, ['setin', 'raglan', 'drop', 'none'] as const, m.hasSleeves ? 'setin' : 'none');
  nm.hasSleeves = sleeve !== 'none';
  const splits = Array.isArray(r.splits) ? (r.splits as Record<string, unknown>[]).slice(0, 6).map((q) => ({ piece: pick(q.piece, ['front', 'back', 'sleeve'] as const, 'front'), dir: pick(q.dir, ['h', 'v'] as const, 'h'), at: num(q.at, 0.5, 0.1, 0.9) })) : [];
  return {
    name: typeof r.name === 'string' ? r.name.slice(0, 60) : 'AI variation',
    nameJa: typeof r.nameJa === 'string' ? r.nameJa.slice(0, 40) : undefined,
    note: typeof r.note === 'string' ? r.note.slice(0, 400) : undefined,
    m: nm, sleeve,
    drop: num(r.drop, 8, 0, 20),
    neck: pick(r.neck, ['crew', 'v', 'mock', 'boat'] as const, 'crew'),
    hood: r.hood === true,
    pocket: pick(r.pocket, ['none', 'kangaroo', 'patch'] as const, 'none'),
    hem: pick(r.hem, ['straight', 'curved', 'asym', 'slits'] as const, 'straight'),
    hemAmount: num(r.hemAmount, 6, 0, 30),
    ribHem: r.ribHem === true, ribCuff: r.ribCuff === true,
    splits,
  };
}

// AI に渡す JSON の形（Gemini の responseSchema）
const MEAS = { type: 'OBJECT', properties: Object.fromEntries(['length', 'chest', 'hem', 'shoulder', 'armhole', 'neckW', 'neckF', 'neckB', 'sleeve', 'bicep', 'cuff'].map((k) => [k, { type: 'NUMBER' }])) };
export const SPEC_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' }, nameJa: { type: 'STRING' }, note: { type: 'STRING' },
    measures: MEAS,
    sleeve: { type: 'STRING', enum: ['setin', 'raglan', 'drop', 'none'] },
    drop: { type: 'NUMBER' },
    neck: { type: 'STRING', enum: ['crew', 'v', 'mock', 'boat'] },
    hood: { type: 'BOOLEAN' },
    pocket: { type: 'STRING', enum: ['none', 'kangaroo', 'patch'] },
    hem: { type: 'STRING', enum: ['straight', 'curved', 'asym', 'slits'] },
    hemAmount: { type: 'NUMBER' },
    ribHem: { type: 'BOOLEAN' }, ribCuff: { type: 'BOOLEAN' },
    splits: { type: 'ARRAY', items: { type: 'OBJECT', properties: { piece: { type: 'STRING', enum: ['front', 'back', 'sleeve'] }, dir: { type: 'STRING', enum: ['h', 'v'] }, at: { type: 'NUMBER' } }, required: ['piece', 'dir', 'at'] } },
  },
  required: ['name', 'measures', 'sleeve', 'neck', 'hood', 'pocket', 'hem', 'ribHem', 'ribCuff', 'splits'],
};

// 写真に重ねて確かめる用：前身頃の出来上がり線（半身、cm）
export function frontOutline(s: Spec): Pt[] { return bodyPiece(s, false).line; }
