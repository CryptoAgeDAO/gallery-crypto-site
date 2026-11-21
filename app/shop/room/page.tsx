import type { Metadata } from 'next';
import GalleryClient from '@/components/shop/GalleryClient';
import { supabase } from '@/lib/supabase';
import { PUBLIC_ITEM_COLUMNS, type Item } from '@/lib/types';
import type { ShopItem } from '@/components/shop/types';
import { toShop } from '@/components/shop/toShop';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'The Showroom — Gallery Crypto',
  description: 'A simple white showroom in 3D: pieces on turning forms, a face-out tops wall, folded tees on an oak table, a pants rack, a headwear wall and a glass case of small things.',
};

// 公開中の商品を読み、ショールームの壁とテーブルに並べる
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
  return <GalleryClient initial={items} />;
}
