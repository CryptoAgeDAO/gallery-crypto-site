import { NextResponse } from 'next/server';
import { db } from '@/lib/server';
import {
  anchorPending, anchorSoon, commitKey, commitRecord, ensureIssuer, isAdminRequest, issuerAddress, issuerBalance, issuerConfigured,
  issuerError, issuerPermanent, issuerSeedForChains, loadKeyring, prepareKey, prepareRecord,
} from '@/lib/passportServer';
import { getChains, setChains, xrplAddress, xrplBalance, type SolanaNet, type XrplNet } from '@/lib/chains';
import { runSetup } from '@/lib/setup';
import { dailySnapshot, dumpAll, logBackup, restoreAll, verifyBackup, type BackupData } from '@/lib/backup';
import { serverMac } from '@/lib/passportServer';
import { assertionOptions, listPasskeys, registerPasskey, registrationOptions, requireFace } from '@/lib/passkey';
import { canonical, sha256hex, hashEntry, validP256, verifyKeyring, type GcppEntry, type KeyEntry } from '@/lib/gcpp';
import type { Item } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function claims(req: Request): { aal?: string; email?: string } {
  try {
    const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').split('.')[1];
    return JSON.parse(Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return {};
  }
}
const jwtAal = (req: Request) => claims(req).aal || 'aal1';
const isHex = (s: unknown, n: number) => typeof s === 'string' && new RegExp(`^[0-9a-f]{${n}}$`).test(s);

// 管理者用。記録は2段階：prepare（サーバーが下書きを作る）→ 端末の鍵で署名 → commit（サーバーが全部確かめてから署名・保存）
export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!issuerConfigured()) return NextResponse.json({ error: 'issuer-not-configured' }, { status: 501 });
  await ensureIssuer();
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === 'info') {
      // 鍵がまだ保管されていなければ、その場で表を作り直して再挑戦（自動）
      let setup: string | undefined;
      const ver = await db().rpc('gc_schema_version');
      if (!issuerPermanent() || ver.error || Number(ver.data) < 5) {
        const r = await runSetup();
        setup = r.ok ? 'ran' : r.error;
        await new Promise((res) => setTimeout(res, 1200));
        await ensureIssuer();
      }
      let passkeys: { id: number; label: string; created_at: string; last_used_at: string | null; credential_id: string }[] = [];
      try { passkeys = (await listPasskeys()).map(({ id, label, created_at, last_used_at, credential_id }) => ({ id, label, created_at, last_used_at, credential_id })); } catch {}
      let ring = null;
      try {
        const list = await loadKeyring();
        const v = verifyKeyring(list, issuerAddress());
        ring = { list, ok: v.ok || !list.length, checks: v.checks };
      } catch {}
      const lastOf = async (kind: string) => (await db().from('passport_backups').select('created_at').eq('kind', kind).order('id', { ascending: false }).limit(1).maybeSingle()).data?.created_at || null;
      const pend = async (t: string) => (await db().from(t).select('id', { count: 'exact', head: true }).is('anchor_id', null)).count || 0;
      let backups = null;
      try {
        backups = { download: await lastOf('download'), snapshot: await lastOf('snapshot'), restore: await lastOf('restore'), pending: (await pend('passport_log')) + (await pend('passport_keys')) };
      } catch {}
      const chains = await getChains(true);
      return NextResponse.json({ issuer: issuerAddress(), permanent: issuerPermanent(), problem: issuerPermanent() ? '' : issuerError(), setup, chain: chains.solana, balance: await issuerBalance(chains.solana), ring, passkeys, backups });
    }
    if (body.action === 'anchor') return NextResponse.json(await anchorPending());
    // 刻印先のチェーン（Solana と XRPL）。残高と入金先のアドレスも返す
    if (body.action === 'chains') {
      const c = await getChains(true);
      const seed = issuerSeedForChains();
      const [sol, xr] = await Promise.all([issuerBalance(c.solana), xrplBalance(seed, c.xrpl === 'off' ? 'xrpl-testnet' : c.xrpl)]);
      const anchors = await db().from('passport_anchors').select('id', { count: 'exact', head: true });
      return NextResponse.json({ ...c, solanaAddress: issuerAddress(), xrplAddress: await xrplAddress(seed), solanaBalance: sol, xrplBalance: xr, anchors: anchors.count || 0 });
    }
    if (body.action === 'set-chains') {
      if (jwtAal(req) !== 'aal2') return NextResponse.json({ error: 'mfa-required' }, { status: 403 });
      const c = await setChains({ solana: body.solana as SolanaNet | undefined, xrpl: body.xrpl as XrplNet | undefined });
      return NextResponse.json(c);
    }

    // 署名（記録・鍵の操作）は、2段階認証を通ったログインのときだけ
    if (/^(prepare|commit|passkey|backup|restore|snapshot)/.test(String(body.action))) {
      if (jwtAal(req) !== 'aal2') return NextResponse.json({ error: 'mfa-required' }, { status: 403 });
    }

    // ── バックアップ・復元（顔認証を登録していれば顔認証も必要） ──
    if (body.action === 'backup-begin' || body.action === 'restore-begin') {
      const nonce = crypto.randomUUID();
      const exp = Date.now() + 5 * 60_000;
      const what = body.action === 'backup-begin' ? 'backup' : 'restore';
      const hash = sha256hex(`${what}|${nonce}|${exp}`);
      return NextResponse.json({ nonce, exp, token: serverMac(`${what}|${nonce}|${exp}`), face: await assertionOptions(req, hash) });
    }
    if (body.action === 'backup-get' || body.action === 'restore') {
      const what = body.action === 'backup-get' ? 'backup' : 'restore';
      if (serverMac(`${what}|${body.nonce}|${body.exp}`) !== body.token || Date.now() > Number(body.exp)) return NextResponse.json({ error: 'This request expired — try again' }, { status: 400 });
      if ((await listPasskeys()).length) await requireFace(req, sha256hex(`${what}|${body.nonce}|${body.exp}`), body.face);
      if (what === 'backup') return NextResponse.json(await dumpAll());
      const data = body.data as BackupData;
      const v = verifyBackup(data);
      if (body.dryRun) return NextResponse.json({ verify: v });
      const counts = await restoreAll(data);
      await logBackup('restore', sha256hex(canonical(data)), 0, JSON.stringify(counts));
      return NextResponse.json({ ok: true, counts, verify: v });
    }
    if (body.action === 'backup-logged') {
      if (!isHex(body.sha256, 64)) return NextResponse.json({ error: 'bad' }, { status: 400 });
      await logBackup('download', body.sha256, Number(body.bytes) || 0, 'encrypted');
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'snapshot-now') return NextResponse.json(await dailySnapshot());

    // ── 署名用の顔認証（パスキー）の登録 ──
    if (body.action === 'passkey-options') return NextResponse.json(await registrationOptions(req, claims(req).email || 'admin'));
    if (body.action === 'passkey-register') {
      await registerPasskey(req, body);
      return NextResponse.json({ ok: true });
    }

    // ── 鍵の台帳 ──
    if (body.action === 'prepare-key') {
      const kind = body.kind as KeyEntry['kind'];
      if (!['genesis', 'add', 'revoke'].includes(kind) || !validP256(String(body.key)) || !validP256(String(body.signer))) return NextResponse.json({ error: 'Bad key' }, { status: 400 });
      const entry = await prepareKey(kind, body.key, String(body.label || ''), body.signer);
      const hash = hashEntry(entry);
      return NextResponse.json({ entry, hash, face: await assertionOptions(req, hash) });
    }
    if (body.action === 'commit-key') {
      if (!isHex(body.cosig, 128)) return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
      await requireFace(req, hashEntry(body.entry), body.face);
      const s = await commitKey(body.entry as KeyEntry, body.cosig);
      const anchored = await anchorSoon();
      return NextResponse.json({ ok: true, entry: s, anchored: Boolean(anchored && 'anchor' in anchored && anchored.anchor) });
    }

    // ── 作品の記録 ──
    const { data: it } = await db().from('items').select('*').eq('id', String(body.item_id || '')).maybeSingle();
    if (!it) return NextResponse.json({ error: 'Piece not found' }, { status: 404 });
    const item = it as Item;
    if (body.action === 'prepare') {
      if (!['seal', 'event'].includes(body.kind) || !validP256(String(body.signer))) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
      const entry = await prepareRecord(item, body.kind, body.event || {}, body.signer);
      const hash = hashEntry(entry);
      return NextResponse.json({ entry, hash, face: await assertionOptions(req, hash) });
    }
    if (body.action === 'commit') {
      if (!isHex(body.cosig, 128)) return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
      await requireFace(req, hashEntry(body.entry), body.face);
      const s = await commitRecord(item, body.entry as GcppEntry, body.cosig);
      const anchored = await anchorSoon();
      return NextResponse.json({ ok: true, entry: s, anchored: Boolean(anchored && 'anchor' in anchored && anchored.anchor) });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    const err = e as Error & { missing?: string[] };
    if (err.missing) return NextResponse.json({ error: 'missing', missing: err.missing }, { status: 422 });
    const m = err.message || String(e);
    return NextResponse.json({ error: /relation|does not exist|schema cache/i.test(m) ? 'not-set-up' : m }, { status: 500 });
  }
}
