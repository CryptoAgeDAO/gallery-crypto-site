import type { Metadata } from 'next';
import JourneyClient from '@/components/shop/JourneyClient';
import { supabase } from '@/lib/supabase';
import { PUBLIC_ITEM_COLUMNS, type Item } from '@/lib/types';
import type { ShopItem } from '@/components/shop/types';
import { toShop } from '@/components/shop/toShop';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'The Walk — Gallery Crypto',
  description: 'A game-like 3D showroom: walk from the store through a city and a forest to a summit, and see every look in 360°.',
};

// 公開中の商品を読み、旅の道に一着ずつ立たせる
export default async function ShopRoom() {
  const db = supabase();
  let items: ShopItem[] = [];
  if (db) {
    const [s, i] = await Promise.all([
      db.from('settings').select('sale_open').eq('id', 1).maybeSingle(),
      db.from('items').select(PUBLIC_ITEM_COLUMNS).eq('published', true).order('serial', { ascending: false }).limit(40),
    ]);
    items = (((i.data as unknown) as Item[]) || []).map((it) => toShop(it, Boolean(s.data?.sale_open)));
  }
  return <JourneyClient initial={items} />;
}
