import { NextResponse } from 'next/server';
import { db } from '@/lib/server';
import {
  CHAIN, anchorPending, anchorSoon, commitKey, commitRecord, ensureIssuer, isAdminRequest, issuerAddress, issuerBalance, issuerConfigured,
  issuerError, issuerPermanent, loadKeyring, prepareKey, prepareRecord,
} from '@/lib/passportServer';
import { runSetup } from '@/lib/setup';
import { hashEntry, validP256, verifyKeyring, type GcppEntry, type KeyEntry } from '@/lib/gcpp';
import type { Item } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function jwtAal(req: Request): string {
  try {
    const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').split('.')[1];
    return JSON.parse(Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).aal || 'aal1';
  } catch {
    return 'aal1';
  }
}
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
      if (!issuerPermanent() || ver.error || Number(ver.data) < 2) {
        const r = await runSetup();
        setup = r.ok ? 'ran' : r.error;
        await new Promise((res) => setTimeout(res, 1200));
        await ensureIssuer();
      }
      let ring = null;
      try {
        const list = await loadKeyring();
        const v = verifyKeyring(list, issuerAddress());
        ring = { list, ok: v.ok || !list.length, checks: v.checks };
      } catch {}
      return NextResponse.json({ issuer: issuerAddress(), permanent: issuerPermanent(), problem: issuerPermanent() ? '' : issuerError(), setup, chain: CHAIN, balance: await issuerBalance(), ring });
    }
    if (body.action === 'anchor') return NextResponse.json(await anchorPending());

    // 署名（記録・鍵の操作）は、2段階認証を通ったログインのときだけ
    if (String(body.action).startsWith('prepare') || String(body.action).startsWith('commit')) {
      if (jwtAal(req) !== 'aal2') return NextResponse.json({ error: 'mfa-required' }, { status: 403 });
    }

    // ── 鍵の台帳 ──
    if (body.action === 'prepare-key') {
      const kind = body.kind as KeyEntry['kind'];
      if (!['genesis', 'add', 'revoke'].includes(kind) || !validP256(String(body.key)) || !validP256(String(body.signer))) return NextResponse.json({ error: 'Bad key' }, { status: 400 });
      const entry = await prepareKey(kind, body.key, String(body.label || ''), body.signer);
      return NextResponse.json({ entry, hash: hashEntry(entry) });
    }
    if (body.action === 'commit-key') {
      if (!isHex(body.cosig, 128)) return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
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
      return NextResponse.json({ entry, hash: hashEntry(entry) });
    }
    if (body.action === 'commit') {
      if (!isHex(body.cosig, 128)) return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
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
