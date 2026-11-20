// Gallery Crypto のデモ（4本柱）：作品データと、イベント・抽選のしくみ。
// すべて見本（架空）。デモではこの端末のブラウザにだけ保存し、サーバーには送らない。

export type Pillar = 'rwa' | 'vintage' | 'art';
export type Project = {
  id: string;
  pillar: Pillar;
  code: string; // デジタル記録の番号
  title: string;
  sub: string;
  year: string;
  price: number | null; // 円。null は価格未定
  img?: string; // 写真（RWA の見本はキャップの写真）
  draw?: { kind: 'tee' | 'sweat' | 'jacket' | 'shirt' | 'denim'; color: string; accent: string; tour?: 'a' | 'b' | 'c' }; // 古着の見本は図で描く（tour：ツアーマーチの胸と背中のプリント）
  tour?: boolean; // Gallery Crypto オリジナルのツアーマーチ（見本）
  art?: { seed: number; palette: string[]; form: 'rings' | 'grid' | 'wave' }; // アートの見本は図で描く
  facts: [string, string][]; // 情報（英, 日 は UI 側で切り替えない固有値）
  story: [string, string];
  log: { at: string; what: [string, string] }[]; // 来歴（デジタル記録）
  passport?: string; // 公開パスポートのページ
};

const L = (at: string, en: string, ja: string) => ({ at, what: [en, ja] as [string, string] });

export const PROJECTS: Project[] = [
  // ❶ RWA：ヴィンテージ＋コラボを、ブロックチェーンで来歴を証明する作品
  { id: 'r1', pillar: 'rwa', code: 'GC-DEMO-1', title: 'Night Static', sub: 'World Tour cap', year: '1991', price: null, img: '/demo/cap-1.jpg', passport: '/passport/GC-DEMO-1',
    facts: [['Made in', 'USA'], ['Condition', 'Excellent'], ['Tag', 'NFC (NTAG 424 DNA)'], ['Record', 'Signed + anchored on chain']],
    story: ['A one-of-one 1991 tour cap. Its whole history is signed and anchored on a public blockchain; the NFC tag inside cannot be copied.', '1991年の一点ものツアーキャップ。来歴はすべて署名され、公開ブロックチェーンに記録。内側のNFCタグは複製できません。'],
    log: [L('2026-03-02', 'Found through a dealer, Los Angeles', 'ロサンゼルスのディーラーから入手'), L('2026-04-10', 'Inspected and photographed', '検品・撮影'), L('2026-04-11', 'NFC tag sewn in, record signed', 'NFCタグを縫い付け、記録に署名'), L('2026-04-12', 'Fingerprint anchored on chain', '指紋をチェーンに記録')] },
  { id: 'r2', pillar: 'rwa', code: 'GC-DEMO-2', title: 'Velvet Ruin', sub: 'Cathedral Shows cap', year: '1989', price: null, img: '/demo/cap-2.jpg', passport: '/passport/GC-DEMO-2',
    facts: [['Made in', 'USA'], ['Condition', 'Very good'], ['Tag', 'NFC (NTAG 424 DNA)'], ['Record', 'Signed + anchored on chain']],
    story: ['Washed cotton, 1989. Ownership can be handed over with the record, so the next owner gets the same proof.', '1989年の洗いざらしのコットン。記録ごと持ち主を引き継げるので、次の持ち主も同じ証明を受け取れます。'],
    log: [L('2026-02-14', 'Found at an estate sale, Pasadena', 'パサデナのエステートセールで入手'), L('2026-04-10', 'Inspected and photographed', '検品・撮影'), L('2026-04-11', 'Record signed', '記録に署名')] },
  { id: 'r3', pillar: 'rwa', code: 'GC-COLLAB-01', title: 'Low Orbit × Gallery Crypto', sub: 'Collab cap — numbered edition of 30', year: '2027', price: 38000, img: '/demo/cap-3.jpg', passport: '/passport/GC-DEMO-3',
    facts: [['Edition', '30 pieces, numbered'], ['Made in', 'Japan'], ['Tag', 'NFC (NTAG 424 DNA)'], ['Sale', 'By lottery']],
    story: ['A collaboration product built on a vintage original. Each of the 30 pieces gets its own digital record from the first day.', 'ヴィンテージの原型をもとにしたコラボ商品。30点それぞれに、最初の日から専用のデジタル記録が付きます。'],
    log: [L('2026-10-01', 'Original archived as reference', '原型をアーカイブ'), L('2026-11-01', 'Sample approved', 'サンプル承認'), L('2027-01-15', 'Edition records issued (planned)', '全30点の記録を発行（予定）')] },
  { id: 'r4', pillar: 'rwa', code: 'GC-COLLAB-02', title: 'Paper Kings × Gallery Crypto', sub: 'Live in Tokyo — collab cap, edition of 50', year: '2027', price: 32000, img: '/demo/cap-6.jpg', passport: '/passport/GC-DEMO-6',
    facts: [['Edition', '50 pieces, numbered'], ['Made in', 'Japan'], ['Tag', 'NFC (NTAG 424 DNA)'], ['Sale', 'By lottery']],
    story: ['A Tokyo-only edition. Entry is by lottery; winners collect at the venue at their assigned time.', '東京限定のエディション。抽選で販売し、当選者は指定の時間に会場で受け取ります。'],
    log: [L('2026-10-20', 'Design fixed', 'デザイン確定'), L('2027-02-01', 'Edition records issued (planned)', '全50点の記録を発行（予定）')] },

  // ❷ 古着：ヴィンテージも普通の古着も。写真と情報をデジタル記録に紐付けて売る
  { id: 'v1', pillar: 'vintage', code: 'GC-V-0001', title: 'Faded band tee', sub: 'Single stitch · L', year: '1990s', price: 18000, draw: { kind: 'tee', color: '#2b2b2e', accent: '#c9b98f' },
    facts: [['Size', 'L — chest 54 / length 70 cm'], ['Condition', 'B — small hole at hem'], ['Material', 'Cotton 100%'], ['Grade', 'Vintage']],
    story: ['Soft, sun-faded black. Sold with its digital record: photos, measurements and condition notes stay attached to the piece.', '日に焼けた柔らかい黒。写真・採寸・状態のメモをデジタル記録として服に紐付けて販売します。'],
    log: [L('2026-09-03', 'Bought in, Tokyo', '東京で買い付け'), L('2026-09-05', 'Measured and photographed', '採寸・撮影'), L('2026-09-05', 'Record created', '記録を作成')] },
  { id: 'v2', pillar: 'vintage', code: 'GC-V-0002', title: 'Grey raglan sweatshirt', sub: 'Plain · M', year: '1980s', price: 14000, draw: { kind: 'sweat', color: '#a7a49c', accent: '#7d7a73' },
    facts: [['Size', 'M — chest 52 / length 64 cm'], ['Condition', 'A — light pilling'], ['Material', 'Cotton / poly'], ['Grade', 'Vintage']],
    story: ['An everyday classic. Good condition, priced simply.', '定番の一着。状態良好、シンプルな価格で。'],
    log: [L('2026-09-10', 'Bought in, Osaka', '大阪で買い付け'), L('2026-09-12', 'Washed, measured, photographed', '洗い・採寸・撮影')] },
  { id: 'v3', pillar: 'vintage', code: 'GC-V-0003', title: 'Indigo denim jacket', sub: 'Type III shape · 40', year: '1970s', price: 46000, draw: { kind: 'denim', color: '#33507a', accent: '#c58b3a' },
    facts: [['Size', '40 — chest 56 / length 60 cm'], ['Condition', 'A'], ['Material', 'Denim'], ['Grade', 'Vintage']],
    story: ['Even fade, original buttons. Lottery sale at the Tokyo pop-up.', 'きれいな色落ち、ボタンもオリジナル。東京ポップアップで抽選販売。'],
    log: [L('2026-08-21', 'Bought in, Los Angeles', 'ロサンゼルスで買い付け'), L('2026-09-01', 'Inspected', '検品')] },
  { id: 'v4', pillar: 'vintage', code: 'GC-U-0101', title: 'Check flannel shirt', sub: 'Used · M', year: '2000s', price: 4800, draw: { kind: 'shirt', color: '#8a2f2a', accent: '#1d1d1d' },
    facts: [['Size', 'M'], ['Condition', 'B'], ['Material', 'Cotton'], ['Grade', 'Used (regular)']],
    story: ['Regular used clothing gets the same simple record — photos and facts stay with it.', '普通の古着にも同じシンプルな記録を付けます。写真と情報が服から離れません。'],
    log: [L('2026-10-02', 'Bought in, Tokyo', '東京で買い付け'), L('2026-10-03', 'Photographed', '撮影')] },
  { id: 'v5', pillar: 'vintage', code: 'GC-U-0102', title: 'White pocket tee', sub: 'Used · S', year: '2010s', price: 2800, draw: { kind: 'tee', color: '#ecebe6', accent: '#bdb9af' },
    facts: [['Size', 'S'], ['Condition', 'A'], ['Material', 'Cotton'], ['Grade', 'Used (regular)']],
    story: ['Simple, clean, ready to wear.', 'シンプルで清潔、すぐに着られます。'],
    log: [L('2026-10-02', 'Bought in, Tokyo', '東京で買い付け')] },
  { id: 'v6', pillar: 'vintage', code: 'GC-U-0103', title: 'Navy zip sweat', sub: 'Used · L', year: '2000s', price: 5200, draw: { kind: 'jacket', color: '#1f2a44', accent: '#9aa3b5' },
    facts: [['Size', 'L'], ['Condition', 'B'], ['Material', 'Cotton / poly'], ['Grade', 'Used (regular)']],
    story: ['Everyday layer with its record attached.', '記録付きの普段使いの一枚。'],
    log: [L('2026-10-05', 'Bought in, Yokohama', '横浜で買い付け')] },

  // ツアーマーチ（Gallery Crypto オリジナルの見本）：背中のプリントは「その一着の来歴」をツアー日程のように並べたもの
  { id: 't1', pillar: 'vintage', tour: true, code: 'GC-T-001', title: 'On Record Tour tee', sub: 'Tour merch · black · L', year: '2027', price: 9800, draw: { kind: 'tee', color: '#151517', accent: '#c9a45c', tour: 'a' },
    facts: [['Size', 'L — chest 56 / length 72 cm'], ['Print', 'Front + back, water-based ink'], ['Material', 'Cotton 100%, heavyweight'], ['Grade', 'New — tour merch (sample)']],
    story: ['Tour merch, recorded. The back print reads like tour dates, but each stop is a moment in this shirt\'s own record.', '記録されたツアーマーチ。背中はツアー日程のように見えますが、並んでいるのはこの一着自身の来歴です。'],
    log: [L('2026-11-20', 'Design fixed (sample)', 'デザイン確定（見本）')] },
  { id: 't2', pillar: 'vintage', tour: true, code: 'GC-T-002', title: 'On Record Tour longsleeve', sub: 'Tour merch · white · M', year: '2027', price: 12800, draw: { kind: 'sweat', color: '#ecebe6', accent: '#8f1d22', tour: 'b' },
    facts: [['Size', 'M — chest 54 / length 70 cm'], ['Print', 'Chest, sleeve + back'], ['Material', 'Cotton 100%'], ['Grade', 'New — tour merch (sample)']],
    story: ['Long sleeve with the tour name running down the arm and the record on the back.', '袖にツアー名、背中に記録を刷った長袖。'],
    log: [L('2026-11-20', 'Design fixed (sample)', 'デザイン確定（見本）')] },
  { id: 't3', pillar: 'vintage', tour: true, code: 'GC-T-003', title: 'On Record Tour tee — washed', sub: 'Tour merch · washed brown · XL', year: '2027', price: 9800, draw: { kind: 'tee', color: '#5a4636', accent: '#e8dcc2', tour: 'c' },
    facts: [['Size', 'XL — chest 60 / length 75 cm'], ['Print', 'Front + back, cracked finish'], ['Material', 'Cotton 100%, garment-washed'], ['Grade', 'New — tour merch (sample)']],
    story: ['Garment-washed so it feels worn from day one. The print is cracked on purpose.', '最初から着込んだ風合いに洗い加工。プリントはわざとひび割れさせています。'],
    log: [L('2026-11-20', 'Design fixed (sample)', 'デザイン確定（見本）')] },

  // ❸ アート・ファッション以外のプロジェクト
  { id: 'a1', pillar: 'art', code: 'GC-A-001', title: 'Signal / Noise', sub: 'Print, edition of 20', year: '2027', price: 24000, art: { seed: 7, palette: ['#111', '#d2452f', '#f2efe8'], form: 'rings' },
    facts: [['Format', 'Giclée print, A2'], ['Edition', '20'], ['Record', 'Each print has its own record']],
    story: ['A sample art project. Each print is registered like a garment: one record per piece.', 'アートの見本。版画も服と同じく一点ずつ記録します。'],
    log: [L('2026-11-01', 'Artwork finalized', '作品確定')] },
  { id: 'a2', pillar: 'art', code: 'GC-A-002', title: 'Archive Sound', sub: 'Listening session + vinyl', year: '2027', price: 6000, art: { seed: 21, palette: ['#0e1a2b', '#e8c26a', '#f4f1ea'], form: 'wave' },
    facts: [['Format', 'Event + 12" record'], ['Seats', '40, by lottery']],
    story: ['A non-fashion project: a listening night built around the archive. Seats are drawn by lottery.', 'ファッション以外の企画：アーカイブを聴く夜。席は抽選です。'],
    log: [L('2026-11-05', 'Planned', '企画')] },
  { id: 'a3', pillar: 'art', code: 'GC-A-003', title: 'Grid Studies', sub: 'Small objects, 1 of 1', year: '2027', price: 15000, art: { seed: 3, palette: ['#2f6b4f', '#efe8d8', '#1b1b1b'], form: 'grid' },
    facts: [['Format', 'Ceramic tiles'], ['Edition', '1 of 1 each']],
    story: ['One-of-one objects, each with a record and a photo fingerprint.', '一点ものの小さなオブジェ。それぞれに記録と写真の指紋が付きます。'],
    log: [L('2026-11-08', 'Prototypes made', '試作')] },
];

// ---- イベント・抽選 ----
export type Loc = { code: string; name: string; address: string; start: string; capacity: number; note: string };
export type Status = 'entered' | 'win' | 'wait' | 'declined' | 'checked';
export type Entrant = { id: string; name: string; email: string; loc: string; item: string; at: string; status: Status; k?: number; no?: string; slot?: string; w?: number };
export type GcEv = {
  id: string; title: string; pillar: Pillar; kind: 'sale' | 'entry'; // sale=抽選販売（作品ごと）/ entry=入場抽選
  date: string; entryEnd: string; desc: string;
  items: { id: string; stock: number }[];
  locs: Loc[]; slotMin: number; perSlot: number;
  state: 'open' | 'closed' | 'drawn';
  seed: string; seedHash: string; orderHash?: string; drawIds?: string[];
  entrants: Entrant[];
};

const NAMES = ['Aoi', 'Ren', 'Mio', 'Kai', 'Yui', 'Sora', 'Hana', 'Riku', 'Emi', 'Taro', 'Nao', 'Ken', 'Saki', 'Jun', 'Rio', 'Mei', 'Leo', 'Ami', 'Yuto', 'Rina'];
const SUR = ['S.', 'T.', 'K.', 'M.', 'Y.', 'N.', 'H.', 'O.', 'I.', 'F.'];
export const rid = (p = 'R') => p + '-' + Array.from(crypto.getRandomValues(new Uint8Array(3))).map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('') + Array.from(crypto.getRandomValues(new Uint8Array(1))).map((b) => '23456789'[b % 8]).join('');

export function sampleEntrants(ev: GcEv, n: number): Entrant[] {
  const out: Entrant[] = [];
  for (let i = 0; i < n; i++) {
    const r = crypto.getRandomValues(new Uint32Array(4));
    const nm = `${NAMES[r[0] % NAMES.length]} ${SUR[r[1] % SUR.length]}`;
    out.push({ id: rid(), name: nm + ' *', email: `sample${(r[2] % 900) + 100}@example.com`, loc: ev.locs[r[3] % ev.locs.length].code, item: ev.kind === 'sale' ? ev.items[r[2] % ev.items.length].id : '', at: new Date(Date.now() - (r[1] % 86400) * 1000).toISOString(), status: 'entered' });
  }
  return out;
}

export async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const newSeed = () => Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');

// 抽選の順番：種（seed）と受付番号から決まる。種を公開すれば誰でも同じ順番を再計算できる
export async function drawOrder(seed: string, ids: string[]) {
  const h = await Promise.all(ids.map(async (id) => [id, await sha256(seed + ':' + id)] as const));
  return h.sort((a, b) => (a[1] < b[1] ? -1 : 1)).map((x) => x[0]);
}

const pad = (n: number, w = 3) => String(n).padStart(w, '0');
export function slotOf(ev: GcEv, loc: Loc, k: number) {
  const [h, m] = loc.start.split(':').map(Number);
  const t = h * 60 + m + Math.floor((k - 1) / Math.max(1, ev.perSlot)) * ev.slotMin;
  return `${pad(Math.floor(t / 60) % 24, 2)}:${pad(t % 60, 2)}`;
}

// 抽選する：当選・補欠を決め、会場ごとに整理番号と入場（受け取り）時間を自動で振る
export async function runDraw(ev: GcEv): Promise<GcEv> {
  const pool = ev.entrants.filter((e) => e.status !== 'declined');
  const order = await drawOrder(ev.seed, pool.map((e) => e.id));
  const byId = new Map<string, Entrant>(ev.entrants.map((e) => [e.id, { ...e, status: e.status === 'declined' ? 'declined' : 'entered', k: undefined, no: undefined, slot: undefined, w: undefined }]));
  const win = new Set<string>();
  if (ev.kind === 'sale') {
    for (const it of ev.items) { let c = 0; for (const id of order) { const e = byId.get(id)!; if (e.item === it.id && c < it.stock) { win.add(id); c++; } } }
  } else {
    for (const l of ev.locs) { let c = 0; for (const id of order) { const e = byId.get(id)!; if (e.loc === l.code && c < l.capacity) { win.add(id); c++; } } }
  }
  for (const l of ev.locs) {
    let k = 0, w = 0;
    for (const id of order) {
      const e = byId.get(id)!;
      if (e.loc !== l.code) continue;
      if (win.has(id)) { k++; e.status = 'win'; e.k = k; e.no = `${l.code}-${pad(k)}`; e.slot = slotOf(ev, l, k); }
      else { w++; e.status = 'wait'; e.w = w; }
    }
  }
  return { ...ev, state: 'drawn', drawIds: pool.map((e) => e.id), orderHash: await sha256(order.join(',')), entrants: ev.entrants.map((e) => byId.get(e.id)!) };
}

// 番号を振り直す（並べ替えたあと、会場ごとに 1 から詰めて時間も計算し直す）
export function renumber(ev: GcEv): GcEv {
  const es = ev.entrants.map((e) => ({ ...e }));
  for (const l of ev.locs) {
    const ws = es.filter((e) => e.loc === l.code && (e.status === 'win' || e.status === 'checked')).sort((a, b) => (a.k || 0) - (b.k || 0));
    ws.forEach((e, i) => { e.k = i + 1; e.no = `${l.code}-${pad(i + 1)}`; e.slot = slotOf(ev, l, i + 1); });
    es.filter((e) => e.loc === l.code && e.status === 'wait').sort((a, b) => (a.w || 0) - (b.w || 0)).forEach((e, i) => { e.w = i + 1; });
  }
  return { ...ev, entrants: es };
}

// 当選者の順番を1つ上下に入れ替える（番号と時間ごと入れ替え）
export function swap(ev: GcEv, id: string, dir: -1 | 1): GcEv {
  const e = ev.entrants.find((x) => x.id === id);
  if (!e || !e.k) return ev;
  const o = ev.entrants.find((x) => x.loc === e.loc && x.k === e.k! + dir && (x.status === 'win' || x.status === 'checked'));
  if (!o) return ev;
  return { ...ev, entrants: ev.entrants.map((x) => (x.id === e.id ? { ...x, k: o.k, no: o.no, slot: o.slot } : x.id === o.id ? { ...x, k: e.k, no: e.no, slot: e.slot } : x)) };
}

// 辞退 → 同じ会場（抽選販売なら同じ作品）の補欠の先頭を繰り上げ、同じ番号・時間を引き継ぐ
export function decline(ev: GcEv, id: string): GcEv {
  const e = ev.entrants.find((x) => x.id === id);
  if (!e) return ev;
  const next = ev.entrants.filter((x) => x.status === 'wait' && x.loc === e.loc && (ev.kind !== 'sale' || x.item === e.item)).sort((a, b) => (a.w || 0) - (b.w || 0))[0];
  return {
    ...ev,
    entrants: ev.entrants.map((x) => {
      if (x.id === e.id) return { ...x, status: 'declined', k: undefined, no: undefined, slot: undefined, w: undefined };
      if (next && x.id === next.id && e.k) return { ...x, status: 'win', k: e.k, no: e.no, slot: e.slot, w: undefined };
      return x;
    }),
  };
}

type Bi = [string, string];
type Ev0 = Omit<GcEv, 'seed' | 'seedHash' | 'entrants' | 'title' | 'desc' | 'locs'> & { title: Bi; desc: Bi; locs: (Omit<Loc, 'name' | 'address' | 'note'> & { name: Bi; address: Bi; note: Bi })[] };
export const EVENTS0: Ev0[] = [
  { id: 'e1', title: ['Tokyo Genesis — collab lottery sale', 'Tokyo Genesis — コラボ抽選販売'], pillar: 'rwa', kind: 'sale', date: '2027-02-13', entryEnd: '2027-02-06', desc: ['Lottery sale for the two collab caps. Winners pay at the venue and collect at their assigned time.', 'コラボキャップ2型の抽選販売。当選者は会場で支払い、指定の時間に受け取ります。'],
    items: [{ id: 'r3', stock: 10 }, { id: 'r4', stock: 12 }], slotMin: 15, perSlot: 5, state: 'open',
    locs: [{ code: 'A', name: ['Gallery Crypto Pop-up, Shibuya', 'Gallery Crypto ポップアップ 渋谷'], address: ['Shibuya, Tokyo (sample address)', '東京都渋谷区（見本の住所）'], start: '12:00', capacity: 0, note: ['Bring the ticket on your phone.', 'スマホのチケットをご提示ください。'] }, { code: 'B', name: ['Osaka pick-up point', '大阪 受け取り場所'], address: ['Kita-ku, Osaka (sample address)', '大阪市北区（見本の住所）'], start: '13:00', capacity: 0, note: ['Pick-up only.', '受け取りのみ。'] }] },
  { id: 'e2', title: ['Vintage pop-up — entry order lottery', 'ヴィンテージ ポップアップ — 入場抽選'], pillar: 'vintage', kind: 'entry', date: '2027-03-06', entryEnd: '2027-02-27', desc: ['Entry to the vintage pop-up is by lottery. Winners get an entry number and a time slot.', 'ヴィンテージのポップアップは抽選で入場。当選者には整理番号と入場時間を割り振ります。'],
    items: [{ id: 'v3', stock: 1 }], slotMin: 20, perSlot: 8, state: 'open',
    locs: [{ code: 'A', name: ['Harajuku pop-up space', '原宿 ポップアップスペース'], address: ['Jingumae, Shibuya, Tokyo (sample address)', '東京都渋谷区神宮前（見本の住所）'], start: '11:00', capacity: 24, note: ['Doors close 18:00.', '18:00 閉場。'] }] },
  { id: 'e3', title: ['Archive Sound — listening night', 'Archive Sound — リスニングナイト'], pillar: 'art', kind: 'entry', date: '2027-03-20', entryEnd: '2027-03-10', desc: ['Forty seats, drawn by lottery. Your number is your seat order.', '40席を抽選。番号順にご着席いただきます。'],
    items: [{ id: 'a2', stock: 1 }], slotMin: 10, perSlot: 20, state: 'open',
    locs: [{ code: 'S', name: ['Small hall, Shimokitazawa', '下北沢 小ホール'], address: ['Setagaya, Tokyo (sample address)', '東京都世田谷区（見本の住所）'], start: '18:30', capacity: 40, note: ['Seat numbers follow entry numbers.', '座席は整理番号順です。'] }] },
];

export async function freshEvents(lang: 'en' | 'ja' = 'en'): Promise<GcEv[]> {
  const j = lang === 'ja' ? 1 : 0;
  return Promise.all(EVENTS0.map(async (b) => {
    const seed = newSeed();
    const ev: GcEv = { ...b, title: b.title[j], desc: b.desc[j], locs: b.locs.map((l) => ({ ...l, name: l.name[j], address: l.address[j], note: l.note[j] })), items: b.items.map((i) => ({ ...i })), seed, seedHash: await sha256(seed), entrants: [] };
    ev.entrants = sampleEntrants(ev, b.kind === 'sale' ? 48 : b.id === 'e2' ? 60 : 70);
    return ev;
  }));
}

export function csv(ev: GcEv, title: (id: string) => string) {
  const rows = [['receipt', 'name', 'email', 'location', 'item', 'status', 'number', 'time', 'waitlist']];
  for (const e of ev.entrants) rows.push([e.id, e.name, e.email, e.loc, e.item ? title(e.item) : '', e.status, e.no || '', e.slot || '', e.w ? String(e.w) : '']);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}
