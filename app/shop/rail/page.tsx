import type { Metadata } from 'next';
import RailPage from '@/components/shop/RailPage';
import { supabase } from '@/lib/supabase';
import { PUBLIC_ITEM_COLUMNS, type Item } from '@/lib/types';
import type { ShopItem } from '@/components/shop/types';
import { toShop } from '@/components/shop/toShop';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: "The Rail — Gallery Crypto",
  description: 'Every piece hangs on one rail. Take one off to see it up close, with its size, price and record.',
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
  return <RailPage initial={items} saleOpen={saleOpen} />;
}
