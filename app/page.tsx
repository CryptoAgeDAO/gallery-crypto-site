import Site from '@/components/Site';
import { supabase, configured } from '@/lib/supabase';
import { DEFAULT_SETTINGS, PUBLIC_ITEM_COLUMNS, type Item, type Settings } from '@/lib/types';

// 管理画面での変更をすぐ反映するため、アクセスのたびに最新のデータを読む
export const dynamic = 'force-dynamic';

async function load(): Promise<{ settings: Settings; items: Item[] }> {
  const db = supabase();
  if (!db) return { settings: DEFAULT_SETTINGS, items: [] };
  const [s, i] = await Promise.all([
    db.from('settings').select('headline,lead,launch,instagram,email,sale_open,shipping_usd').eq('id', 1).maybeSingle(),
    db.from('items').select(PUBLIC_ITEM_COLUMNS).eq('published', true).order('serial', { ascending: false }),
  ]);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(s.data || {}) },
    items: ((i.data as unknown) as Item[]) || [],
  };
}

export default async function Page() {
  const { settings, items } = await load();
  return <Site settings={settings} items={items} configured={configured} />;
}
