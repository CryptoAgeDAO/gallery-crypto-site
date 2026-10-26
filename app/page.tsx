import Site from '@/components/Site';
import { supabase, configured } from '@/lib/supabase';
import { DEFAULT_SETTINGS, EVENT_COLUMNS, PUBLIC_ITEM_COLUMNS, type GcEvent, type Item, type Settings } from '@/lib/types';

// 管理画面での変更をすぐ反映するため、アクセスのたびに最新のデータを読む
export const dynamic = 'force-dynamic';

async function load(): Promise<{ settings: Settings; items: Item[]; events: GcEvent[]; sealed: number[] }> {
  const db = supabase();
  if (!db) return { settings: DEFAULT_SETTINGS, items: [], events: [], sealed: [] };
  const [s, i, e, p] = await Promise.all([
    db.from('settings').select('headline,lead,launch,instagram,email,sale_open,shipping_usd').eq('id', 1).maybeSingle(),
    db.from('items').select(PUBLIC_ITEM_COLUMNS).eq('published', true).order('serial', { ascending: false }),
    // 公開中のイベント（終わってから2日以上たったものは出さない）。テーブルがまだなければ空のまま
    db.from('events').select(EVENT_COLUMNS).eq('published', true).or(`starts_at.is.null,starts_at.gte.${new Date(Date.now() - 2 * 86400_000).toISOString()}`).order('starts_at', { ascending: true }).limit(6),
    // 確定済みの来歴パスポートがある作品（テーブルがまだなければ空）
    db.from('passport_log').select('cert').eq('kind', 'seal'),
  ]);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(s.data || {}) },
    items: ((i.data as unknown) as Item[]) || [],
    events: ((e.data as unknown) as GcEvent[]) || [],
    sealed: Array.from(new Set(((p.data as { cert: string }[]) || []).map((r) => parseInt(r.cert.replace(/\D/g, ''), 10)).filter(Boolean))),
  };
}

export default async function Page() {
  const { settings, items, events, sealed } = await load();
  return <Site settings={settings} items={items} events={events} sealed={sealed} configured={configured} />;
}
