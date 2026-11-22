// 声の指示を、モックアップの操作に読み替える（日本語・英語）。
// 例：「パーカー」「着丈72センチ」「身幅を2センチ大きく」「袖丈マイナス3」「色を黒に」「デニム」「Lサイズ」
//     「背中」「文字 TOKYO を追加」「保存」
export type VoiceAction =
  | { t: 'kind'; v: string } | { t: 'set'; k: string; v: number } | { t: 'add'; k: string; v: number } | { t: 'color'; v: string; name: string }
  | { t: 'fabric'; v: string } | { t: 'size'; v: string } | { t: 'side'; v: 'front' | 'back' } | { t: 'text'; v: string } | { t: 'save' } | { t: 'undo' };

const KINDS: [RegExp, string][] = [[/(ロンT|ロンティー|長袖|ロングスリーブ|long ?sleeve)/i, 'ls'], [/(パーカー|フーディ|フーディー|フード付き|hoodie)/i, 'hoodie'], [/(スウェット|トレーナー|クルーネック|sweat ?shirt|crew)/i, 'crew'], [/(ショーツ|短パン|ハーフパンツ|shorts)/i, 'shorts'], [/(パンツ|ズボン|ジーンズ|デニムパンツ|pants|trousers)/i, 'pants'], [/(Tシャツ|ティーシャツ|半袖|t-?shirt|tee)/i, 'tee']];
const FIELDS: [RegExp, string][] = [
  [/(袖口|cuff|sleeve opening)/i, 'sleeveOpen'], [/(袖丈|袖の長さ|袖|sleeve)/i, 'sleeve'], [/(身幅|胸囲|バスト|chest)/i, 'chest'], [/(肩幅|肩|shoulder)/i, 'shoulder'],
  [/(股下|inseam)/i, 'inseam'], [/(股上|rise)/i, 'rise'], [/(わたり|渡り|腿|もも|thigh)/i, 'thigh'], [/(ウエスト|胴回り|waist)/i, 'waist'], [/(ヒップ|お尻|hip)/i, 'hip'],
  [/(裾幅|すそ幅|裾|hem)/i, 'hem'], [/(脇|アームホール|armhole)/i, 'armhole'], [/(前衿|衿の深さ|えりの深さ|ネックの深さ|neck drop)/i, 'neckDrop'], [/(襟ぐり|衿ぐり|えりぐり|ネック|首回り|neck)/i, 'neck'], [/(フード|hood)/i, 'hood'],
  [/(着丈|身丈|丈|length)/i, 'length'],
];
const COLORS: [RegExp, string, string][] = [[/(黒|ブラック|black)/i, '#141416', '黒'], [/(白|ホワイト|white)/i, '#f4f3ef', '白'], [/(生成り|きなり|エクリュ|オフホワイト|ecru|cream)/i, '#e8e3d6', '生成り'], [/(グレー|灰色|グレイ|gr[ae]y)/i, '#8f8c86', 'グレー'],
  [/(ネイビー|紺|navy)/i, '#1d2740', 'ネイビー'], [/(青|ブルー|blue)/i, '#2e3f66', 'ブルー'], [/(オリーブ|カーキ|olive|khaki)/i, '#4b5236', 'オリーブ'], [/(ワイン|バーガンディ|burgundy)/i, '#5b1a22', 'ワイン'], [/(赤|レッド|red)/i, '#9b2226', 'レッド'],
  [/(茶|ブラウン|brown)/i, '#6a5442', 'ブラウン'], [/(ベージュ|サンド|beige|sand)/i, '#c8b896', 'ベージュ'], [/(ピンク|pink)/i, '#d7a2a8', 'ピンク'], [/(緑|グリーン|green)/i, '#2f5a3c', 'グリーン'], [/(黄色|イエロー|yellow)/i, '#d8b13a', 'イエロー']];
const FABRICS: [RegExp, string][] = [[/(ジャージ|天竺|jersey)/i, 'jersey'], [/(フリース|裏起毛|fleece)/i, 'fleece'], [/(デニム|denim)/i, 'denim'], [/(キャンバス|帆布|ツイル|canvas|twill)/i, 'canvas'], [/(ナイロン|nylon)/i, 'nylon'], [/(コーデュロイ|コール天|corduroy)/i, 'corduroy']];

// 漢数字・全角数字も数に
const KAN: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function num(s: string): number | null {
  const z = s.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/点/g, '.');
  const m = z.match(/(\d+(?:\.\d+)?)/); if (m) return parseFloat(m[1]);
  const k = z.match(/[一二三四五六七八九十百〇零]+/); if (!k) return null;
  let v = 0, cur = 0; for (const c of k[0]) { if (c === '百') { v += (cur || 1) * 100; cur = 0; } else if (c === '十') { v += (cur || 1) * 10; cur = 0; } else cur = KAN[c] ?? 0; }
  return v + cur;
}

export function parseVoice(raw: string): VoiceAction[] {
  const s = raw.replace(/\s+/g, ' ').trim(), out: VoiceAction[] = [];
  if (/(元に戻|取り消|やり直|undo)/i.test(s)) return [{ t: 'undo' }];
  if (/(保存|店に並べ|セーブ|save)/i.test(s)) out.push({ t: 'save' });
  const txt = s.match(/(?:文字|テキスト|プリント|text)[「『 ]*([^」』]+?)[」』 ]*(?:を)?(?:追加|入れ|入れて|のせ|乗せ|add|$)/i);
  if (txt && txt[1] && !/^(を|の)$/.test(txt[1])) { out.push({ t: 'text', v: txt[1].trim() }); return out; }
  if (/(背中|後ろ|バック|back)/i.test(s) && !/(フード|hood)/i.test(s)) out.push({ t: 'side', v: 'back' });
  else if (/(正面|前|フロント|front)/i.test(s) && !/(前衿)/.test(s)) out.push({ t: 'side', v: 'front' });
  for (const [re, v] of KINDS) if (re.test(s)) { out.push({ t: 'kind', v }); break; }
  const sz = s.match(/(XXL|XL|XS|S|M|L)\s*(?:サイズ|size)/i) || s.match(/(?:サイズ|size)\s*(XXL|XL|XS|S|M|L)\b/i) || s.match(/^(XXL|XL|XS|S|M|L)$/i); if (sz) out.push({ t: 'size', v: sz[1].toUpperCase() });
  for (const [re, v, name] of COLORS) if (re.test(s) && /(色|カラー|colou?r|に|へ|$)/i.test(s)) { out.push({ t: 'color', v, name }); break; }
  for (const [re, v] of FABRICS) if (re.test(s) && !(v === 'denim' && /パンツ/.test(s))) { out.push({ t: 'fabric', v }); break; }
  // 寸法：「着丈72」「身幅を2センチ大きく」「袖丈マイナス3」
  for (const [re, k] of FIELDS) {
    if (!re.test(s)) continue;
    const n = num(s.replace(/(XS|XL|S|M|L)サイズ/gi, '')); if (n == null) continue;
    const plus = /(プラス|大きく|長く|広く|足して|増や|\+|more|longer|wider|bigger)/i.test(s), minus = /(マイナス|小さく|短く|狭く|引いて|減ら|-|less|shorter|narrower|smaller)/i.test(s);
    out.push(plus || minus ? { t: 'add', k, v: minus ? -n : n } : { t: 'set', k, v: n });
    break;
  }
  return out;
}
