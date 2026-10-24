import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { EVENTS_SQL } from '@/lib/eventsSql';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 管理者だけが押せる「イベント機能の自動セットアップ」。Vercel の Supabase 連携が入れる POSTGRES_URL でデータベースに表を作る。
export async function POST(req: Request) {
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) return NextResponse.json({ error: 'no-db-url' }, { status: 501 });
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!jwt || !process.env.NEXT_PUBLIC_SUPABASE_URL || !key) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // ログイン中の本人として is_admin() を確認
  const as = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: ok } = await as.rpc('is_admin');
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const c = new Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    await c.query(EVENTS_SQL);
    await c.query("notify pgrst, 'reload schema'");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    await c.end().catch(() => {});
  }
}
