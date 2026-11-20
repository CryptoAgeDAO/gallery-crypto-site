// 商品がまだ公開されていないときに並べる見本（購入はできない）
import { PROJECTS } from '@/lib/hub';
import type { ShopItem } from './types';

const yen = (n: number | null) => (n ? '¥' + n.toLocaleString('ja-JP') : 'Price on request');

export function demoItems(): ShopItem[] {
  return PROJECTS.map((p) => ({
    id: 'demo-' + p.id, code: p.code, title: p.title, sub: `${p.sub} · ${p.year}`, price: yen(p.price), img: p.img, pid: p.id,
    buy: 'demo', passport: p.passport, desc: p.story[0], facts: p.facts, zone: p.pillar,
    display: p.pillar === 'rwa' ? 'case' : p.pillar === 'vintage' ? 'hang' : p.id === 'a3' ? 'plinth' : 'frame',
    size: p.id === 'a1' ? 1.4 : p.id === 'a2' ? 1.1 : 1,
  }));
}
