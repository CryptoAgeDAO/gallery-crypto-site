import { photoUrl } from '@/lib/supabase';
import { backOf, frontOf } from '@/lib/photoRole';
import { certNo, usd, type Item } from '@/lib/types';
import type { ShopItem } from './types';

export function toShop(it: Item, saleOpen: boolean): ShopItem {
  return {
    id: it.id,
    code: certNo(it),
    title: it.band || 'Untitled',
    sub: [it.title, it.year, it.size && String(it.size).toUpperCase()].filter(Boolean).join(' · '),
    price: it.sold ? 'Sold' : it.price_usd ? usd(it.price_usd) : 'Release 2027',
    img: frontOf(it.photos || []) ? photoUrl(frontOf(it.photos)!) : undefined,
    back: backOf(it.photos || []) ? photoUrl(backOf(it.photos)!) : undefined,
    buy: it.sold ? 'sold' : saleOpen && it.price_usd ? 'stripe' : 'demo',
    passport: `/passport/${certNo(it)}`,
    desc: it.prov || it.cond || '',
    facts: [['Condition', it.cond], ['Made in', it.made_in], ['Tag', it.tag], ['Dealer', it.dealer]].filter((f) => f[1]) as [string, string][],
    zone: 'archive',
    display: 'hang',
    size: 1,
  };
}

