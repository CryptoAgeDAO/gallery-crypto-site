import Site from '@/components/Site';
import { DEMO_ITEMS } from '@/lib/demoData';
import { supabase, configured } from '@/lib/supabase';
import { DEFAULT_SETTINGS, EVENT_COLUMNS, PUBLIC_ITEM_COLUMNS, type GcEvent, type Item, type Settings } from '@/lib/types';

// 管理画面での変更をすぐ反映するため、アクセスのたびに最新のデータを読む
export const dynamic = 'force-dynamic';

async function load(): Promise<{ settings: Settings; items: Item[]; events: GcEvent[]; sealed: number[]; models: Record<string, string> }> {
  const db = supabase();
  if (!db) return { settings: DEFAULT_SETTINGS, items: [], events: [], sealed: [], models: {} };
  const [s, i, e, p, m] = await Promise.all([
    db.from('settings').select('headline,lead,launch,instagram,email,sale_open,shipping_usd').eq('id', 1).maybeSingle(),
    db.from('items').select(PUBLIC_ITEM_COLUMNS).eq('published', true).order('serial', { ascending: false }),
    // 公開中のイベント（終わってから2日以上たったものは出さない）。テーブルがまだなければ空のまま
    db.from('events').select(EVENT_COLUMNS).eq('published', true).or(`starts_at.is.null,starts_at.gte.${new Date(Date.now() - 2 * 86400_000).toISOString()}`).order('starts_at', { ascending: true }).limit(6),
    // 確定済みの来歴パスポートがある作品（テーブルがまだなければ空）
    db.from('passport_log').select('cert').eq('kind', 'seal'),
    // 3Dモデル（CLO 3D の .glb）がある作品（テーブルがまだなければ空）
    db.from('item_models').select('item_id,path'),
  ]);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(s.data || {}) },
    items: ((i.data as unknown) as Item[]) || [],
    events: ((e.data as unknown) as GcEvent[]) || [],
    sealed: Array.from(new Set(((p.data as { cert: string }[]) || []).map((r) => parseInt(r.cert.replace(/\D/g, ''), 10)).filter(Boolean))),
    models: Object.fromEntries(((m.data as { item_id: string; path: string }[]) || []).map((r) => [r.item_id, r.path])),
  };
}

export default async function Page() {
  const { settings, items, events, sealed, models } = await load();
  // 作品がまだない間は、見本のデモ作品を並べて体験できるようにする
  const demo = items.length === 0;
  return <Site settings={settings} items={demo ? DEMO_ITEMS : items} demo={demo} events={events} sealed={sealed} models={demo ? {} : models} configured={configured} />;
}
