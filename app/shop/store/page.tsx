import type { Metadata } from 'next';
import StoreFloor from "@/components/shop/StoreFloor";
import { supabase } from '@/lib/supabase';
import { PUBLIC_ITEM_COLUMNS, type Item } from '@/lib/types';
import type { ShopItem } from '@/components/shop/types';
import { toShop } from '@/components/shop/toShop';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: "The Store — Gallery Crypto",
  description: 'A bright virtual store: clothing on the wall rail, caps on oak shelves, art on the wall, and Try the Look.',
};

// サイトに登録・公開された商品を読む（管理画面で公開した瞬間に店に並ぶ）
export default async function ShopStore() {
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
  return <StoreFloor initial={items} />;
}
