import type { Metadata } from 'next';
import RailShop from '@/components/shop/RailShop';
import { supabase } from '@/lib/supabase';
import { PUBLIC_ITEM_COLUMNS, type Item } from '@/lib/types';
import type { ShopItem } from '@/components/shop/types';
import { toShop } from '@/components/shop/toShop';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: "The Rail — Gallery Crypto",
  description: 'Walk through the Gallery Crypto store in 3D. Every piece registered on the site is placed on display the moment it is published.',
};

// サイトに登録・公開された商品を読む（管理画面で公開した瞬間に店に並ぶ）
export default async function ShopRail() {
  const db = supabase();
  let items: ShopItem[] = [];
  let saleOpen = false;
  if (db) {
    const [s, i] = await Promise.all([
      db.from('settings').select('sale_open').eq('id', 1).maybeSingle(),
      db.from('items').select(PUBLIC_ITEM_COLUMNS).eq('published', true).order('serial', { ascending: false }).limit(60),
    ]);
    saleOpen = Boolean(s.data?.sale_open);
    items = (((i.data as unknown) as Item[]) || []).map((it) => toShop(it, saleOpen));
  }
  return <RailShop initial={items} saleOpen={saleOpen} />;
}
