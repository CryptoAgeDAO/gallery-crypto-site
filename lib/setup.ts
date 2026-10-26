// サーバー専用：データベースの表を作る（何度実行しても大丈夫）。Vercel の Supabase 連携が入れる POSTGRES_URL を使う。
import 'server-only';
import { Client } from 'pg';
import { EVENTS_SQL } from './eventsSql';
import { PASSPORT_SQL } from './passportSql';

export async function runSetup(): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) return { ok: false, error: 'no-db-url' };
  const c = new Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    await c.query(EVENTS_SQL);
    await c.query(PASSPORT_SQL);
    // サーバー（service role）が秘密の表を使えるように明示
    await c.query('grant select, insert on public.gc_secrets to service_role');
    await c.query("notify pgrst, 'reload schema'");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    await c.end().catch(() => {});
  }
}
