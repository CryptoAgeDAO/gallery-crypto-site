// Gallery Crypto の見本ライン（約100点）。服・パンツ・帽子・小物・ステッカー。
// すべてオリジナルのデザインで、見本（購入不可・販売は2027年から）。商品の種類の幅はブランドのショップを参考に、図柄・名前は独自。
import type { Project } from './hub';
import type { Acc, AccKind } from '@/components/shop/accArt';

type GK = NonNullable<Project['draw']>['kind'];
type PR = NonNullable<NonNullable<Project['draw']>['print']>;
export type LineCat = 'tops' | 'outer' | 'bottoms' | 'head' | 'acc';
export type LineItem = {
  id: string; code: string; title: string; sub: string; price: number; cat: LineCat;
  draw?: NonNullable<Project['draw']>; acc?: Acc; facts: [string, string][]; story: string;
};

// 色の組み合わせ（地の色・差し色）
const PAL: [string, string, string][] = [
  ['Black', '#141416', '#c9a45c'], ['Bone', '#e8e3d6', '#141414'], ['Washed black', '#2a2a2d', '#e8e3d6'], ['Oxblood', '#5b1a22', '#e8dcc2'],
  ['Navy', '#1d2740', '#d9c8a0'], ['Army', '#4b5236', '#efe7d2'], ['Heather grey', '#9d9a94', '#1a1a1a'], ['Cream', '#efe8d6', '#8f1d22'],
  ['Brown', '#5a4636', '#e8dcc2'], ['Slate blue', '#4e6583', '#f1ece2'], ['Pink', '#d7a2a8', '#1a1a1a'], ['Indigo', '#2e3f66', '#b88d45'],
  ['Sand', '#c8b896', '#2a2a2a'], ['Forest', '#24402f', '#e2b13c'], ['White', '#f4f3ef', '#c23b2a'], ['Charcoal', '#3a3a3e', '#d23a2a'],
];
const SIZES = ['S', 'M', 'L', 'XL'];

type Spec = { kind: GK; n: number; cat: LineCat; names: string[]; price: [number, number]; prints: PR[]; material: string; code: string };
const GARMENTS: Spec[] = [
  { kind: 'tee', n: 16, cat: 'tops', code: 'TS', names: ['Record Tee', 'Paint Drop Tee', 'Verified Tee', 'One of One Tee', 'Hourglass Tee', 'Studio Tee', 'Chain Tee', 'Archive Tee'], price: [9800, 14800], prints: ['word', 'splat', 'stamp', 'back', 'emblem', 'chest', 'splat', 'word'], material: 'Cotton 100%, 240 gsm' },
  { kind: 'tank', n: 4, cat: 'tops', code: 'TK', names: ['Studio Tank', 'Paint Tank'], price: [8800, 11800], prints: ['chest', 'splat'], material: 'Cotton 100%, rib' },
  { kind: 'ls', n: 6, cat: 'tops', code: 'LS', names: ['Record Longsleeve', 'Paint Longsleeve', 'Verified Longsleeve'], price: [13800, 16800], prints: ['word', 'splat', 'stamp'], material: 'Cotton 100%, 220 gsm' },
  { kind: 'hoodie', n: 10, cat: 'tops', code: 'HD', names: ['Record Hoodie', 'Paint Hoodie', 'Emblem Hoodie', 'Studio Hoodie', 'One of One Hoodie'], price: [22800, 29800], prints: ['word', 'splat', 'emblem', 'chest', 'back'], material: 'Cotton 100%, 14 oz fleece' },
  { kind: 'sweat', n: 6, cat: 'tops', code: 'CR', names: ['Studio Crew', 'Paint Crew', 'Record Crew'], price: [19800, 24800], prints: ['chest', 'splat', 'word'], material: 'Cotton 100%, 12 oz fleece' },
  { kind: 'shirt', n: 4, cat: 'tops', code: 'SH', names: ['Flannel Shirt', 'Studio Shirt'], price: [24800, 32800], prints: ['chest', 'splat'], material: 'Cotton flannel' },
  { kind: 'jacket', n: 6, cat: 'outer', code: 'JK', names: ['Work Jacket', 'Painter Jacket', 'Coach Jacket'], price: [48800, 78800], prints: ['back', 'splat', 'chest'], material: 'Cotton canvas' },
  { kind: 'vest', n: 2, cat: 'outer', code: 'VS', names: ['Work Vest'], price: [38800, 44800], prints: ['splat', 'chest'], material: 'Cotton duck' },
  { kind: 'pants', n: 8, cat: 'bottoms', code: 'FL', names: ['Painted Flare', 'Record Flare', 'Studio Flare', 'Side Line Flare'], price: [36800, 52800], prints: ['splat', 'chest', 'splat', 'side'], material: 'Denim 13.5 oz' },
  { kind: 'sweatpants', n: 6, cat: 'bottoms', code: 'SP', names: ['Studio Sweatpant', 'Side Line Sweatpant', 'Paint Sweatpant'], price: [19800, 25800], prints: ['chest', 'side', 'splat'], material: 'Cotton 100%, fleece' },
  { kind: 'shorts', n: 6, cat: 'bottoms', code: 'SR', names: ['Painted Short', 'Side Line Short', 'Studio Short'], price: [16800, 22800], prints: ['splat', 'side', 'chest'], material: 'Denim / fleece' },
];
type ASpec = { kind: AccKind; n: number; cat: LineCat; names: string[]; price: [number, number]; material: string; code: string };
const ACCS: ASpec[] = [
  { kind: 'cap', n: 6, cat: 'head', code: 'CP', names: ['Script Cap', 'GC Cap', 'One/One Cap'], price: [7800, 9800], material: 'Cotton twill, embroidered' },
  { kind: 'beanie', n: 4, cat: 'head', code: 'BN', names: ['Rib Beanie', 'Pom Beanie'], price: [6800, 7800], material: 'Acrylic rib knit' },
  { kind: 'socks', n: 3, cat: 'acc', code: 'SK', names: ['Stripe Socks'], price: [2800, 3200], material: 'Cotton blend' },
  { kind: 'shades', n: 2, cat: 'acc', code: 'SG', names: ['Studio Shades'], price: [24800, 28800], material: 'Acetate, UV400' },
  { kind: 'sticker', n: 4, cat: 'acc', code: 'ST', names: ['Wordmark Sticker', 'Hourglass Sticker', 'On Record Sticker', 'Verified Sticker'], price: [600, 900], material: 'Vinyl, weatherproof' },
  { kind: 'keychain', n: 2, cat: 'acc', code: 'KC', names: ['Record Tag Keychain', 'GC Keychain'], price: [3800, 4800], material: 'Acrylic + steel ring' },
  { kind: 'tote', n: 2, cat: 'acc', code: 'TT', names: ['Wordmark Tote', 'Script Tote'], price: [4800, 5800], material: 'Cotton canvas 12 oz' },
  { kind: 'pin', n: 1, cat: 'acc', code: 'PN', names: ['Hourglass Pin'], price: [1800, 1800], material: 'Enamel, gold plate' },
  { kind: 'patch', n: 1, cat: 'acc', code: 'PT', names: ['On Record Patch'], price: [1500, 1500], material: 'Embroidered, iron-on' },
  { kind: 'bandana', n: 1, cat: 'acc', code: 'BD', names: ['Studio Bandana'], price: [3800, 3800], material: 'Cotton 100%' },
];
const STORY: Record<LineCat, [string, string]> = {
  tops: ['From the Gallery Crypto sample line. Original graphics, printed and finished by hand.', 'Gallery Crypto の見本ライン。オリジナルの図柄を、手作業で刷って仕上げます。'],
  outer: ['Workwear cut with our own paint and print. One run, numbered.', 'ワークウェアの形に、独自のペイントとプリント。少量生産・ナンバー入り。'],
  bottoms: ['Hand-painted and printed bottoms — no two splatters are the same.', '手でペイントして刷るパンツ。飛び散りは一本ずつ違います。'],
  head: ['Headwear with embroidered marks from the line.', 'ライン共通の刺繍を入れた帽子。'],
  acc: ['Small things from the studio — stickers, keychains, totes and more.', 'スタジオの小物。ステッカー、キーホルダー、トートなど。'],
};

function build(): LineItem[] {
  const out: LineItem[] = []; let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const round = (v: number) => Math.round(v / 100) * 100;
  for (const g of GARMENTS) for (let i = 0; i < g.n; i++) {
    const pal = PAL[(i * 5 + g.code.charCodeAt(0)) % PAL.length], name = g.names[i % g.names.length], pr = g.prints[i % g.prints.length];
    const size = SIZES[(i + g.n) % SIZES.length];
    out.push({
      id: `l-${g.code.toLowerCase()}${i + 1}`, code: `GC-${g.code}-${String(i + 1).padStart(3, '0')}`, title: `${name} — ${pal[0]}`, sub: `Sample line · ${pal[0].toLowerCase()} · ${size}`,
      price: round(g.price[0] + (g.price[1] - g.price[0]) * rnd()), cat: g.cat,
      draw: { kind: g.kind, color: pal[1], accent: pal[2], print: pr },
      facts: [['Size', size], ['Material', g.material], ['Print', pr === 'splat' ? 'Hand-painted splatter' : pr === 'side' ? 'Side print' : 'Screen print'], ['Grade', 'New — sample line']],
      story: STORY[g.cat][0],
    });
  }
  for (const a of ACCS) for (let i = 0; i < a.n; i++) {
    const pal = PAL[(i * 3 + a.code.charCodeAt(1)) % PAL.length], name = a.names[i % a.names.length];
    out.push({
      id: `l-${a.code.toLowerCase()}${i + 1}`, code: `GC-${a.code}-${String(i + 1).padStart(3, '0')}`, title: a.kind === 'sticker' ? name : `${name} — ${pal[0]}`, sub: `Sample line · ${a.kind}`,
      price: round(a.price[0] + (a.price[1] - a.price[0]) * rnd()), cat: a.cat,
      acc: { kind: a.kind, color: pal[1], accent: pal[2], v: i },
      facts: [['Size', a.kind === 'sticker' ? '10 cm' : 'One size'], ['Material', a.material], ['Grade', 'New — sample line']],
      story: STORY[a.cat][0],
    });
  }
  return out;
}
export const LINE: LineItem[] = build();
export const LINE_STORY_JA = Object.fromEntries(Object.entries(STORY).map(([k, v]) => [k, v[1]])) as Record<LineCat, string>;
