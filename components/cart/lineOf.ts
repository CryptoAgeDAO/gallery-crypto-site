// 商品 → カートの一行（名前・価格・絵・色・サイズ）
import type { CartLine } from './Cart';
type Src = { id: string; title: string; price: string; code?: string; buy: CartLine['buy']; facts?: [string, string][]; img?: string; src?: string; color?: string; hex?: string };
export function lineOf(i: Src): CartLine {
  const size = (i.facts?.find((f) => /^size$/i.test(f[0]))?.[1] || '').split(/\s*—\s*/)[0] || undefined;
  return { id: i.id, title: i.title, price: i.price, yen: Number(String(i.price).replace(/[^0-9]/g, '')) || 0, src: i.src || i.img || '', code: i.code, buy: i.buy, color: i.color, hex: i.hex, size, photo: !!i.img };
}
