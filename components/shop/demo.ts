// 商品がまだ公開されていないときに並べる見本（購入はできない）
import { PROJECTS } from '@/lib/hub';
import type { ShopItem } from './types';
import { cutout } from './pieceArt';
import { LINE } from '@/lib/catalog';

const yen = (n: number | null) => (n ? '¥' + n.toLocaleString('ja-JP') : 'Price on request');

export function demoItems(): ShopItem[] {
  return PROJECTS.map((p): ShopItem => ({
    id: 'demo-' + p.id, code: p.code, title: p.title, sub: `${p.sub} · ${p.year}`, price: yen(p.price), img: p.img, pid: p.id, back: p.draw?.tour ? cutout(p.id, 'back') : undefined, tour: p.tour,
    buy: 'demo', passport: p.passport, desc: p.story[0], facts: p.facts, zone: p.pillar,
    display: p.pillar === 'rwa' ? 'case' : p.pillar === 'vintage' ? 'hang' : p.id === 'a3' ? 'plinth' : 'frame',
    size: p.id === 'a1' ? 1.4 : p.id === 'a2' ? 1.1 : 1,
  })).concat(LINE.map((l): ShopItem => ({
    id: 'demo-' + l.id, code: l.code, title: l.title, sub: `${l.sub} · 2027`, price: yen(l.price), pid: l.id, back: l.draw ? cutout(l.id, 'back') : undefined,
    line: l.cat, acc: !l.draw, buy: 'demo' as const, desc: l.story, facts: l.facts, zone: 'vintage' as const, display: 'hang' as const,
  })));
}

// 入荷で選んだ写真を、軽い JPEG にしてこの端末に置く
export async function shrink(f: File): Promise<string> {
  const img = await createImageBitmap(f);
  const k = Math.min(1, 1100 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}
