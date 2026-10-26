// サーバー専用：バックアップ（全データの書き出し・毎日の自動スナップショット・復元）
import 'server-only';
import { Client } from 'pg';
import { db } from './server';
import { anchorPending, ensureIssuer, issuerAddress, loadKeyring, resetIssuerCache } from './passportServer';
import { canonical, sha256hex, verifyKeyring, verifyLog, type GcppEntry, type SignedEntry, type SignedKey } from './gcpp';

// 復元する順番（参照される側が先）
export const TABLES = [
  'settings', 'admins', 'items', 'entries', 'orders', 'messages', 'events', 'event_entries',
  'passports', 'passport_keys', 'passport_anchors', 'passport_log', 'passport_passkeys', 'passport_backups', 'gc_secrets',
] as const;

async function all(table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from(table).select('*').range(from, from + 999);
    if (error) {
      if (/relation|does not exist|schema cache/i.test(error.message)) return out;
      throw new Error(`${table}: ${error.message}`);
    }
    out.push(...((data as Record<string, unknown>[]) || []));
    if (!data || data.length < 1000) return out;
  }
}

export type BackupData = { format: 'gc-backup/1'; created_at: string; issuer: string; tables: Record<string, Record<string, unknown>[]> };

export async function dumpAll(): Promise<BackupData> {
  await ensureIssuer();
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) tables[t] = await all(t);
  return { format: 'gc-backup/1', created_at: new Date().toISOString(), issuer: issuerAddress(), tables };
}

export async function logBackup(kind: 'download' | 'snapshot' | 'restore', sha256: string, bytes: number, note = '') {
  await db().from('passport_backups').insert({ kind, sha256, bytes, note: note.slice(0, 200) });
}

// 署名つきの記録だけを毎日保存（公開情報のみ。秘密や個人情報は入れない）。中身が変わった日だけ Solana に刻む
export async function dailySnapshot() {
  await ensureIssuer();
  const keyring = await all('passport_keys');
  const logs = await all('passport_log');
  const anchors = await all('passport_anchors');
  const core = sha256hex(canonical({ keyring: keyring.map((k) => k.hash), logs: logs.map((l) => l.hash) }));
  const snap = { format: 'gc-snapshot/1', created_at: new Date().toISOString(), issuer: issuerAddress(), core, keyring, logs, anchors };
  const text = JSON.stringify(snap);
  const day = snap.created_at.slice(0, 10);
  const up = await db().storage.from('backups').upload(`snapshots/${day}.json`, new Blob([text], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
  if (up.error) throw new Error('snapshot upload: ' + up.error.message);
  const { data: last } = await db().from('passport_backups').select('note').eq('kind', 'snapshot').order('id', { ascending: false }).limit(1).maybeSingle();
  const changed = (last as { note?: string } | null)?.note !== core;
  await logBackup('snapshot', sha256hex(text), text.length, core);
  // 中身が変わった日は、スナップショットの指紋も Solana に刻む
  const anchored = await anchorPending(changed && (keyring.length || logs.length) ? [core] : []).catch((e) => ({ error: (e as Error).message }));
  return { day, bytes: text.length, core, changed, anchored };
}

// 復元前の検証：鍵の台帳と全作品の記録が、バックアップ内の発行者の鍵で正しく検証できるか
export function verifyBackup(b: BackupData) {
  const keyring = ((b.tables.passport_keys || []) as unknown as (SignedKey & { seq: number })[]).sort((x, y) => x.seq - y.seq);
  const kr = verifyKeyring(keyring, b.issuer);
  const logs = (b.tables.passport_log || []) as unknown as (SignedEntry & { item_id: string; seq: number })[];
  const byItem = new Map<string, (SignedEntry & { seq: number })[]>();
  logs.forEach((l) => byItem.set(l.item_id, [...(byItem.get(l.item_id) || []), l]));
  let bad = 0;
  byItem.forEach((list) => {
    const sorted = list.sort((x, y) => x.seq - y.seq).map((l) => ({ entry: l.entry as GcppEntry, hash: l.hash, sig: l.sig, cosig: l.cosig, issuer: l.issuer }));
    if (!verifyLog(sorted, b.issuer, kr.keys).ok) bad++;
  });
  return { keyringOk: keyring.length === 0 || kr.ok, pieces: byItem.size, badPieces: bad, ok: (keyring.length === 0 || kr.ok) && bad === 0 };
}

// 復元：足りない行だけを元の番号のまま入れる（既存の行は書き換えない）。記録の検証に通らないものは入れない
export async function restoreAll(b: BackupData): Promise<Record<string, number>> {
  if (b.format !== 'gc-backup/1' || !b.tables) throw new Error('Not a Gallery Crypto backup');
  const v = verifyBackup(b);
  if (!v.ok) throw new Error(`Backup does not verify (${v.badPieces} pieces broken) — not restored`);
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) throw new Error('This server has no direct database connection (POSTGRES_URL) — restore needs it');

  // 既存の記録がまだない新しいデータベースなら、サーバーの鍵もバックアップのものに戻す（記録の連続性を保つ）
  const [{ count: nLog }, { count: nKey }] = await Promise.all([
    db().from('passport_log').select('id', { count: 'exact', head: true }),
    db().from('passport_keys').select('id', { count: 'exact', head: true }),
  ]);
  const fresh = !nLog && !nKey;

  const c = new Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
  const counts: Record<string, number> = {};
  await c.connect();
  try {
    await c.query('begin');
    for (const t of TABLES) {
      const rows = b.tables[t] || [];
      if (!rows.length) continue;
      if (t === 'gc_secrets') {
        for (const r of rows) {
          if (fresh) await c.query('insert into public.gc_secrets (name, value) values ($1, $2) on conflict (name) do update set value = excluded.value', [r.name, r.value]);
          else await c.query('insert into public.gc_secrets (name, value) values ($1, $2) on conflict (name) do nothing', [r.name, r.value]);
        }
        counts[t] = rows.length;
        continue;
      }
      const res = await c.query(`insert into public.${t} overriding system value select * from json_populate_recordset(null::public.${t}, $1::json) on conflict do nothing`, [JSON.stringify(rows)]);
      counts[t] = res.rowCount || 0;
    }
    // 自動採番を最大値の続きにそろえる
    for (const [t, col] of [['items', 'serial'], ['passport_log', 'id'], ['passport_keys', 'id'], ['passport_anchors', 'id'], ['passport_passkeys', 'id'], ['passport_backups', 'id']]) {
      await c.query(`select setval(pg_get_serial_sequence('public.${t}', '${col}'), greatest(coalesce((select max(${col}) from public.${t}), 0), 1))`).catch(() => {});
    }
    await c.query('commit');
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    await c.end().catch(() => {});
  }
  resetIssuerCache();
  await ensureIssuer();
  if (issuerAddress() !== b.issuer) counts.warning_issuer_changed = 1;
  await loadKeyring().catch(() => []);
  return counts;
}
