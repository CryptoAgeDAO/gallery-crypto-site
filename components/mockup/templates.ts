// モックアップのベースの形（テンプレート）。実物の平置きの形をもとに、曲線で描いた「いちばんきれいな基本形」。
// すべて cm。原点は肩の一番高いところ（HPS）の中央、y は下向き。寸法を変えると形がなめらかに追従する。
// handles：2Dの上で指でつまんで動かせる点。動かすと対応する寸法が変わる。
export type Pt = [number, number];
export type BaseKind = 'tee' | 'ls' | 'hoodie' | 'crew' | 'pants' | 'shorts';
export type M = Record<string, number>;
export type Field = { k: string; en: string; ja: string; min: number; max: number };
export type Handle = { key: string; at: Pt; label: [string, string]; apply: (m: M, p: Pt) => M };
export type Deco = { poly?: Pt[]; line?: Pt[]; fill?: string; stroke?: string; width?: number; dash?: number[]; rib?: { dir: Pt; gap: number } };
export type Shape = { outline: Pt[]; decos: Deco[]; handles: Handle[]; top: number };

const F = (k: string, en: string, ja: string, min: number, max: number): Field => ({ k, en, ja, min, max });
const TOP_FIELDS = [F('length', 'Length', '着丈', 40, 100), F('chest', 'Chest (flat)', '身幅', 36, 90), F('shoulder', 'Shoulder', '肩幅', 34, 80), F('sleeve', 'Sleeve', '袖丈', 8, 80), F('sleeveOpen', 'Sleeve opening', '袖口幅', 7, 30), F('hem', 'Hem (flat)', '裾幅', 36, 90), F('armhole', 'Armhole depth', '脇の深さ', 16, 36), F('neck', 'Neck width', '襟ぐり幅', 14, 28), F('neckDrop', 'Front neck drop', '前衿の深さ', 4, 16)];
const BOTTOM_FIELDS = [F('waist', 'Waist (flat)', 'ウエスト', 28, 60), F('hip', 'Hip (flat)', 'ヒップ', 40, 75), F('rise', 'Front rise', '股上', 20, 40), F('inseam', 'Inseam', '股下', 8, 95), F('thigh', 'Thigh (flat)', 'わたり幅', 24, 45), F('hemW', 'Leg opening', '裾幅', 14, 40)];
export const TEMPLATES: Record<BaseKind, { en: string; ja: string; fields: Field[]; def: M }> = {
  tee: { en: 'T-shirt', ja: 'Tシャツ', fields: TOP_FIELDS, def: { length: 72, chest: 56, shoulder: 50, sleeve: 22, sleeveOpen: 19, hem: 56, armhole: 23, neck: 19, neckDrop: 9 } },
  ls: { en: 'Longsleeve', ja: '長袖', fields: TOP_FIELDS, def: { length: 71, chest: 55, shoulder: 49, sleeve: 62, sleeveOpen: 10, hem: 55, armhole: 23, neck: 18, neckDrop: 9 } },
  hoodie: { en: 'Hoodie', ja: 'パーカー', fields: [...TOP_FIELDS, F('hood', 'Hood height', 'フードの高さ', 26, 42)], def: { length: 70, chest: 60, shoulder: 58, sleeve: 59, sleeveOpen: 11, hem: 52, armhole: 27, neck: 20, neckDrop: 8, hood: 34 } },
  crew: { en: 'Sweatshirt', ja: 'スウェット', fields: TOP_FIELDS, def: { length: 68, chest: 58, shoulder: 54, sleeve: 60, sleeveOpen: 11, hem: 50, armhole: 25, neck: 19, neckDrop: 8 } },
  pants: { en: 'Pants', ja: 'パンツ', fields: BOTTOM_FIELDS, def: { waist: 40, hip: 53, rise: 30, inseam: 80, thigh: 32, hemW: 21 } },
  shorts: { en: 'Shorts', ja: 'ショーツ', fields: BOTTOM_FIELDS, def: { waist: 41, hip: 55, rise: 30, inseam: 18, thigh: 32, hemW: 30 } },
};
// サイズ展開（Mを基準に1サイズあたりの差）
export const GRADE_STEP: M = { length: 2, chest: 2.5, shoulder: 2, sleeve: 1, sleeveOpen: 0.5, hem: 2.5, armhole: 1, neck: 0.5, neckDrop: 0.3, hood: 0.5, waist: 2.5, hip: 2.5, rise: 0.5, inseam: 0, thigh: 1, hemW: 0.5 };

// ---- 曲線の道具 ----
const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 14): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]] as Pt; });
const quad = (p0: Pt, c: Pt, p1: Pt, n = 10): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]] as Pt; });
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const mir = (a: Pt[]): Pt[] => a.map(([x, y]) => [-x, y] as Pt).reverse();
const mx = (a: Pt[]): Pt[] => a.map(([x, y]) => [-x, y] as Pt);
const join = (...parts: Pt[][]): Pt[] => { const o: Pt[] = []; for (const p of parts) for (const q of p) { const l = o[o.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.05) o.push(q); } return o; };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r1 = (v: number) => Math.round(v * 2) / 2;
const SHADE = 'rgba(0,0,0,.10)', DARK = 'rgba(0,0,0,.32)', SEAM = 'rgba(0,0,0,.30)', LIGHT = 'rgba(255,255,255,.10)';

// ---- トップス ----
function top(kind: BaseKind, m: M, side: 'front' | 'back'): Shape {
  const sweat = kind === 'hoodie' || kind === 'crew', long = kind !== 'tee';
  const L = m.length, C = m.chest, S = Math.max(m.shoulder, m.neck + 8), Sl = m.sleeve, So = m.sleeveOpen, Hm = m.hem, N = m.neck;
  const A = Math.max(m.armhole, 12), drop = sweat ? 6 : 4.5;
  const ND = side === 'front' ? m.neckDrop : 2.3;
  const a = (long ? 57 : 17) * Math.PI / 180, b = a + (long ? 5 : 9) * Math.PI / 180;
  const NS: Pt = [N / 2, 0], SP: Pt = [S / 2, drop];
  const u: Pt = [Math.cos(a), Math.sin(a)];
  const cT = add(SP, u, Sl), cB = add(cT, [-Math.sin(b), Math.cos(b)], So);
  const UA: Pt = [C / 2, A];
  const ribH = sweat ? 6.5 : 0, cuffH = long ? (sweat ? 6.5 : 5.5) : 0;
  const HC: Pt = [Hm / 2, L];
  // 右半分の外形（衿の横 → 肩 → 袖 → 袖口 → 袖下 → 脇 → 裾）
  const shoulder = quad(NS, [lerp(NS, SP, 0.5)[0], lerp(NS, SP, 0.5)[1] - 0.6], SP, 6);
  const sleeveTop = quad(SP, add(lerp(SP, cT, 0.45), [-Math.sin(a), Math.cos(a)], -1.1), cT, 10);
  const cuffEdge: Pt[] = [cT, cB];
  const armpitIn = add(UA, [0, 0]);
  const under = bez(cB, lerp(cB, armpitIn, 0.5), add(armpitIn, [1.8, -0.2]), add(armpitIn, [0, 1.2]), 12);
  const ribTop: Pt = [sweat ? Hm / 2 + 1.6 : HC[0], L - ribH];
  const sideSeam = sweat
    ? bez(add(armpitIn, [0, 1.2]), [C / 2 + 0.6, A + (L - ribH - A) * 0.4], [ribTop[0] + 0.8, L - ribH - 6], ribTop, 14)
    : bez(add(armpitIn, [0, 1.2]), [C / 2 - 0.2, A + (L - A) * 0.35], [HC[0] + 0.3, L - 12], [HC[0], L - 0.8], 14);
  const hemR: Pt[] = sweat ? [ribTop, [Hm / 2, L - ribH + 0.6], [Hm / 2 - 0.4, L]] : quad([HC[0], L - 0.8], [HC[0] - 0.2, L], [HC[0] - 1.2, L], 4);
  const right = join(shoulder, sleeveTop, cuffEdge, under, sideSeam, hemR);
  // 衿ぐり（右の衿の横から中心まで）
  const neckR = bez(NS, [N / 2 - 0.2, ND * 0.55], [N * 0.22, ND], [0, ND], 12);
  // 外形の上は後ろ衿（浅い）。正面では前衿の内側に、後ろ身頃の裏が見える
  const backR = bez(NS, [N / 2 - 0.3, 1.3], [N * 0.22, 2.3], [0, 2.3], 10);
  const full = join(backR.slice().reverse(), right, [[0, L + (sweat ? 0 : 0.15)]], mir(right), mx(backR));
  const decos: Deco[] = [];
  const both = (d: Deco) => { decos.push(d); const mm = (p?: Pt[]) => p && p.map(([x, y]) => [-x, y] as Pt); decos.push({ ...d, poly: mm(d.poly), line: mm(d.line), rib: d.rib ? { dir: [-d.rib.dir[0], d.rib.dir[1]], gap: d.rib.gap } : undefined }); };
  if (side === 'front') decos.push({ poly: join(backR.slice().reverse(), neckR, mx(neckR).reverse(), mx(backR)), fill: 'rgba(0,0,0,.4)' });
  // 衿のリブ（フード以外）
  if (kind !== 'hoodie') {
    const w = sweat ? 2.6 : 2;
    const outer = bez([N / 2 + w * 0.9, -0.2], [N / 2 + w * 0.7, ND * 0.6 + w], [N * 0.22, ND + w], [0, ND + w], 12);
    const bandPoly = join(outer, mx(outer).reverse(), mx(neckR), neckR.slice().reverse());
    decos.push({ poly: bandPoly, fill: SHADE, rib: { dir: [0, 1], gap: 0.45 } });
    both({ line: outer, stroke: SEAM, width: 0.12, dash: [0.35, 0.25] });
    if (side === 'back') decos.push({ poly: [[-3, ND + w + 0.6], [3, ND + w + 0.6], [3, ND + w + 3.2], [-3, ND + w + 3.2]], fill: 'rgba(255,255,255,.55)' });
  }
  // 肩・袖つけの縫い目
  both({ line: shoulder, stroke: SEAM, width: 0.1, dash: [0.35, 0.25] });
  const armSeam = bez(SP, add(SP, [-0.6, (A - drop) * 0.4]), add(UA, [-1.6, -3]), add(UA, [0, 1.2]), 12);
  both({ line: armSeam, stroke: SEAM, width: 0.12 });
  // 袖口：Tシャツは折り返しのステッチ、長袖はリブ
  const cuffIn = (d: number): Pt[] => { const k = Math.min(0.95, d / Math.max(1, Sl)); return [lerp(cT, SP, k), lerp(cB, add(UA, [0, 1.2]), Math.min(0.95, d / Math.max(1, Math.hypot(cB[0] - UA[0], cB[1] - UA[1]))))]; };
  if (cuffH) { const ci = cuffIn(cuffH); both({ poly: [cT, cB, ci[1], ci[0]], fill: SHADE, rib: { dir: [Math.cos(a), Math.sin(a)], gap: 0.45 } }); both({ line: ci, stroke: SEAM, width: 0.12 }); }
  else { both({ line: cuffIn(2.2), stroke: SEAM, width: 0.1, dash: [0.35, 0.25] }); both({ line: cuffIn(2.7), stroke: SEAM, width: 0.1, dash: [0.35, 0.25] }); }
  // 裾：Tシャツは二本ステッチ、スウェットはリブ
  if (sweat) { decos.push({ poly: [[-ribTop[0], L - ribH], [ribTop[0], L - ribH], [Hm / 2, L - ribH + 0.6], [Hm / 2 - 0.4, L], [-Hm / 2 + 0.4, L], [-Hm / 2, L - ribH + 0.6]], fill: SHADE, rib: { dir: [0, 1], gap: 0.45 } }); decos.push({ line: [[-ribTop[0], L - ribH], [ribTop[0], L - ribH]], stroke: SEAM, width: 0.14 }); }
  else for (const d of [2.2, 2.7]) decos.push({ line: [[-HC[0] + 0.3, L - d], [HC[0] - 0.3, L - d]], stroke: SEAM, width: 0.1, dash: [0.35, 0.25] });
  // 脇のしわ（やわらかい影）
  both({ line: bez(add(UA, [-0.5, 3]), add(UA, [-3, 8]), add(UA, [-4, 14]), add(UA, [-5, 20]), 8), stroke: 'rgba(0,0,0,.06)', width: 1.6 });

  let topY = 0;
  // パーカー：フード・カンガルーポケット・ひも
  if (kind === 'hoodie') {
    const H = m.hood;
    if (side === 'front') {
      // フードの外側（首の後ろに立ち上がって見える）
      const hoodR = bez([N / 2 + 2.5, 2], [N / 2 + 13, -H * 0.18], [N / 2 + 10, -H * 0.8], [0, -H * 0.72], 16);
      const hood = join(hoodR, mir(hoodR).slice(1));
      // 顔の開き（裏が見える）とその縁
      const openR = bez([N / 2 - 0.5, 0.5], [N / 2 + 5, -H * 0.2], [N / 2 + 3.5, -H * 0.58], [0, -H * 0.58], 14);
      const open = join(openR, mir(openR).slice(1), [[-1, ND - 1], [0, ND + 0.3], [1, ND - 1]]);
      decos.push({ poly: hood, fill: '__base__' }, { poly: hood, fill: 'rgba(0,0,0,.06)' }, { poly: open, fill: 'rgba(0,0,0,.42)' });
      both({ line: openR, stroke: LIGHT, width: 1.6 });
      both({ line: [[N / 2 - 0.5, 0.5], [1, ND - 1]], stroke: 'rgba(0,0,0,.25)', width: 0.2 });
      decos.push({ line: [[0, -H * 0.72 + 0.4], [0, -H * 0.58]], stroke: SEAM, width: 0.12 });
      // ひも
      for (const s of [1, -1]) {
        decos.push({ poly: Array.from({ length: 12 }, (_, i) => [s * 3 + 0.45 * Math.cos((i / 12) * Math.PI * 2), ND - 2 + 0.45 * Math.sin((i / 12) * Math.PI * 2)] as Pt), fill: 'rgba(0,0,0,.45)' });
        decos.push({ line: bez([s * 3, ND - 2], [s * 3.3, ND + 4], [s * 2.6, ND + 10], [s * 3.4, ND + 17], 10), stroke: 'rgba(255,255,255,.75)', width: 0.7 });
        decos.push({ line: [[s * 3.4, ND + 17], [s * 3.5, ND + 20]], stroke: 'rgba(0,0,0,.55)', width: 0.9 });
      }
      // カンガルーポケット
      const pt = L - ribH - 23, pb = L - ribH - 0.5, wt = C * 0.3, wb = C * 0.36;
      const pocket: Pt[] = join([[-wt, pt], [wt, pt]], bez([wt, pt], [wt + 1.5, pt + 6], [wb - 3, pb - 10], [wb, pb], 10), [[-wb, pb]], bez([-wb, pb], [-wb + 3, pb - 10], [-wt - 1.5, pt + 6], [-wt, pt], 10));
      decos.push({ poly: pocket, fill: 'rgba(0,0,0,.05)' }, { line: [...pocket, pocket[0]], stroke: SEAM, width: 0.12, dash: [0.35, 0.25] });
      both({ line: bez([wt, pt], [wt + 1.5, pt + 6], [wb - 3, pb - 10], [wb, pb], 10), stroke: 'rgba(0,0,0,.35)', width: 0.45 });
      topY = -H * 0.8;
    } else {
      // 背中：フードが背中に寝ている
      const hb = bez([N / 2 + 2.5, 0.5], [N / 2 + 10, 8], [N / 2 + 4, H * 0.75], [0, H * 0.82], 16);
      const hp = join(hb, mir(hb).slice(1));
      decos.push({ poly: hp.map(([x, y]) => [x + 0.3, y + 0.8] as Pt), fill: 'rgba(0,0,0,.18)' }, { poly: hp, fill: '__base__' }, { poly: hp, fill: 'rgba(255,255,255,.04)' });
      decos.push({ line: [[0, 0.5], [0, H * 0.82]], stroke: SEAM, width: 0.14 });
      both({ line: hb, stroke: 'rgba(0,0,0,.2)', width: 0.25 });
    }
  }

  const handles: Handle[] = [
    { key: 'hem', at: sweat ? [Hm / 2 - 0.4, L] : [HC[0] - 0.6, L], label: ['Hem · length', '裾幅・着丈'], apply: (m, [x, y]) => ({ ...m, hem: r1(clamp(Math.abs(x) * 2, 30, 100)), length: r1(clamp(y, 35, 110)) }) },
    { key: 'ua', at: UA, label: ['Chest · armhole', '身幅・脇の深さ'], apply: (m, [x, y]) => ({ ...m, chest: r1(clamp(Math.abs(x) * 2, 30, 100)), armhole: r1(clamp(y, 12, 40)) }) },
    { key: 'sp', at: SP, label: ['Shoulder', '肩幅'], apply: (m, [x]) => ({ ...m, shoulder: r1(clamp(Math.abs(x) * 2, m.neck + 8, 90)) }) },
    { key: 'cuffT', at: cT, label: ['Sleeve length', '袖丈'], apply: (m, p) => { const q: Pt = [Math.abs(p[0]), p[1]]; return { ...m, sleeve: r1(clamp((q[0] - SP[0]) * u[0] + (q[1] - SP[1]) * u[1], 6, 90)) }; } },
    { key: 'cuffB', at: cB, label: ['Sleeve opening', '袖口幅'], apply: (m, p) => ({ ...m, sleeveOpen: r1(clamp(Math.hypot(Math.abs(p[0]) - cT[0], p[1] - cT[1]), 6, 32)) }) },
    { key: 'ns', at: NS, label: ['Neck width', '襟ぐり幅'], apply: (m, [x]) => ({ ...m, neck: r1(clamp(Math.abs(x) * 2, 12, 30)) }) },
  ];
  if (side === 'front') handles.push({ key: 'nd', at: [0, ND], label: ['Neck drop', '前衿の深さ'], apply: (m, [, y]) => ({ ...m, neckDrop: r1(clamp(y, 3, 18)) }) });
  if (kind === 'hoodie' && side === 'front') handles.push({ key: 'hood', at: [0, -m.hood * 0.72], label: ['Hood height', 'フードの高さ'], apply: (m, [, y]) => ({ ...m, hood: r1(clamp(-y / 0.72, 22, 46)) }) });
  return { outline: full, decos, handles, top: topY };
}

// ---- ボトムス ----
function bottom(kind: BaseKind, m: M, side: 'front' | 'back'): Shape {
  const W = m.waist, Hp = m.hip, R = m.rise, I = m.inseam, T = Math.max(m.thigh, Hp / 2 - 1), Hw = m.hemW;
  const short = kind === 'shorts', wb = 4;
  const hemY = R + I, cx = T * 0.52 + 0.6;
  const outerCrotch = Math.max(Hp / 2 + 0.3, T + 0.8);
  const kneeY = R + I * 0.45, kneeW = short ? Hw : (T * 0.78 + Hw) / 2;
  const oc = outerCrotch;
  const hipCurve = bez([W / 2, 0], [W / 2 + 1.6, R * 0.3], [Math.min(Hp / 2, oc) + 0.2, R * 0.5], [Hp / 2 + (oc - Hp / 2) * 0.5, R * 0.78], 12);
  const rightOuter = join(
    hipCurve,
    bez(hipCurve[hipCurve.length - 1], [oc - 0.6, R + 0.5], [oc, R + 2], [oc - 0.1, R + 4], 6),
    short ? bez([oc - 0.1, R + 4], [oc - 0.2, R + I * 0.5], [cx + Hw / 2 + 0.2, hemY - 3], [cx + Hw / 2, hemY], 8)
      : bez([oc - 0.1, R + 4], [cx + kneeW / 2 + 1.5, kneeY - 10], [cx + kneeW / 2, kneeY], [cx + kneeW / 2 - 0.4, kneeY + 6], 10),
    short ? [] : bez([cx + kneeW / 2 - 0.4, kneeY + 6], [cx + Hw / 2 + 0.4, hemY - 18], [cx + Hw / 2, hemY - 6], [cx + Hw / 2, hemY], 10),
  );
  const hipAt = hipCurve.reduce((best, p) => (Math.abs(p[1] - R * 0.6) < Math.abs(best[1] - R * 0.6) ? p : best), hipCurve[0]);
  const rightInner = join(
    [[cx - Hw / 2, hemY]],
    short ? bez([cx - Hw / 2, hemY], [cx - Hw / 2 + 0.2, R + I * 0.5], [1.5, R + 4], [0.9, R + 1.2], 8)
      : join(bez([cx - Hw / 2, hemY], [cx - Hw / 2, hemY - 8], [cx - kneeW / 2 + 0.3, kneeY + 10], [cx - kneeW / 2, kneeY], 10), bez([cx - kneeW / 2, kneeY], [cx - kneeW / 2 - 0.6, kneeY - 12], [1.6, R + 6], [0.9, R + 1.2], 10)),
    quad([0.9, R + 1.2], [0.5, R], [0, R - 0.4], 4),
  );
  const right = join(rightOuter, [[cx + Hw / 2, hemY]], rightInner);
  // 外形：ウエスト左 → 左脚 → 股 → 右脚 → ウエスト右
  const leftHalf = mir(right); // 股 → … → ウエスト左（逆順）
  const outline = join(right, leftHalf);
  const decos: Deco[] = [];
  const both = (d: Deco) => { decos.push(d); const mm = (p?: Pt[]) => p && p.map(([x, y]) => [-x, y] as Pt); decos.push({ ...d, poly: mm(d.poly), line: mm(d.line) }); };
  // ウエストバンド・ベルトループ・ボタン
  decos.push({ poly: [[-W / 2, 0], [W / 2, 0], [W / 2 + 0.3, wb], [-W / 2 - 0.3, wb]], fill: SHADE });
  decos.push({ line: [[-W / 2 - 0.3, wb], [W / 2 + 0.3, wb]], stroke: SEAM, width: 0.12 });
  for (const x of [W * 0.12, W * 0.3, W * 0.47]) both({ poly: [[x - 0.6, -0.3], [x + 0.6, -0.3], [x + 0.6, wb + 0.8], [x - 0.6, wb + 0.8]], fill: 'rgba(0,0,0,.14)' });
  // 脇の縫い目・裾のステッチ
  both({ line: rightOuter.slice(10), stroke: SEAM, width: 0.1, dash: [0.35, 0.25] });
  both({ line: [[cx - Hw / 2 + 0.2, hemY - 2.4], [cx + Hw / 2 - 0.2, hemY - 2.4]], stroke: SEAM, width: 0.12, dash: [0.35, 0.25] });
  if (!short) both({ line: bez([cx, R + 6], [cx + 0.3, kneeY], [cx, hemY - 20], [cx, hemY - 3], 8), stroke: 'rgba(0,0,0,.07)', width: 0.9 }); // 折り目
  if (side === 'front') {
    decos.push({ poly: Array.from({ length: 14 }, (_, i) => [0.75 * Math.cos((i / 14) * Math.PI * 2), wb / 2 + 0.75 * Math.sin((i / 14) * Math.PI * 2)] as Pt), fill: 'rgba(0,0,0,.45)' });
    decos.push({ line: join([[-3.4, wb]], bez([-3.4, wb], [-3.4, R * 0.62], [-2.6, R * 0.72], [0, R * 0.74], 8)), stroke: SEAM, width: 0.12, dash: [0.35, 0.25] }); // 前立て
    decos.push({ line: [[0, wb], [0, R - 0.6]], stroke: 'rgba(0,0,0,.25)', width: 0.12 });
    both({ line: bez([W / 2 - 9, wb], [W / 2 - 7.5, 10], [W / 2 - 1.5, 13], [Hp / 2, R * 0.6 - 2], 10), stroke: 'rgba(0,0,0,.35)', width: 0.3 }); // 前ポケット
  } else {
    both({ line: [[0, wb + 6], [W / 2 + 0.4, wb + 1.5]], stroke: SEAM, width: 0.14 }); // ヨーク
    for (const s of [1, -1]) { const x0 = s * (W * 0.12), x1 = s * (W * 0.4), y0 = wb + 6.5; decos.push({ poly: [[x0, y0 + 0.6], [x1, y0 - 0.6], [x1 - s * 0.5, y0 + 13], [(x0 + x1) / 2, y0 + 15], [x0 + s * 0.5, y0 + 13.6]], fill: 'rgba(0,0,0,.06)' }); }
    decos.push({ line: [[0, wb + 6], [0, R - 0.6]], stroke: SEAM, width: 0.12 });
    decos.push({ poly: [[-2.5, 0.6], [2.5, 0.6], [2.5, wb - 0.6], [-2.5, wb - 0.6]], fill: 'rgba(255,255,255,.5)' });
  }
  const handles: Handle[] = [
    { key: 'waist', at: [W / 2, 0], label: ['Waist', 'ウエスト'], apply: (m, [x]) => ({ ...m, waist: r1(clamp(Math.abs(x) * 2, 24, 70)) }) },
    { key: 'hip', at: hipAt, label: ['Hip', 'ヒップ'], apply: (m, [x]) => ({ ...m, hip: r1(clamp(Math.abs(x) * 2, 36, 80)) }) },
    { key: 'rise', at: [0, R - 0.4], label: ['Rise', '股上'], apply: (m, [, y]) => ({ ...m, rise: r1(clamp(y, 18, 44)) }) },
    { key: 'thigh', at: [oc, R + 2], label: ['Thigh', 'わたり幅'], apply: (m, [x]) => ({ ...m, thigh: r1(clamp(Math.abs(x) - 0.8, 20, 48)) }) },
    { key: 'hemO', at: [cx + Hw / 2, hemY], label: ['Inseam · leg opening', '股下・裾幅'], apply: (m, [x, y]) => ({ ...m, inseam: r1(clamp(y - m.rise, 5, 100)), hemW: r1(clamp((Math.abs(x) - cx) * 2, 12, 44)) }) },
  ];
  return { outline, decos, handles, top: 0 };
}

export function shapeOf(kind: BaseKind, m: M, side: 'front' | 'back'): Shape {
  return kind === 'pants' || kind === 'shorts' ? bottom(kind, m, side) : top(kind, m, side);
}
