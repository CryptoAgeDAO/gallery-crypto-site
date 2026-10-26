import { NextResponse } from 'next/server';
import { db } from '@/lib/server';
import { anchorPending, appendEntry, CHAIN, ensureIssuer, isAdminRequest, issuerAddress, issuerBalance, issuerConfigured, issuerPermanent } from '@/lib/passportServer';
import { DPP_VERSION, EVENT_TYPES, cleanDpp, completeness, mergeDpp, prefill, type Dpp } from '@/lib/dpp';
import { certNo, type Item } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

// 管理者用：記録の確定（署名）、出来事の追記、Solana への刻印、発行者情報
export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!issuerConfigured()) return NextResponse.json({ error: 'issuer-not-configured' }, { status: 501 });
  await ensureIssuer();
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === 'info') {
      return NextResponse.json({ issuer: issuerAddress(), permanent: issuerPermanent(), chain: CHAIN, balance: await issuerBalance() });
    }
    if (body.action === 'anchor') {
      const r = await anchorPending();
      return NextResponse.json(r);
    }
    const { data: it } = await db().from('items').select('*').eq('id', String(body.item_id || '')).maybeSingle();
    if (!it) return NextResponse.json({ error: 'Piece not found' }, { status: 404 });
    const item = it as Item;
    const cert = certNo(item);

    if (body.action === 'seal') {
      const { data: p } = await db().from('passports').select('dpp').eq('item_id', item.id).maybeSingle();
      const d = cleanDpp(mergeDpp(prefill(item), (p?.dpp as Dpp) || null));
      const c = completeness(d);
      if (c.missing.length) return NextResponse.json({ error: 'missing', missing: c.missing }, { status: 422 });
      const { count } = await db().from('passport_log').select('id', { count: 'exact', head: true }).eq('item_id', item.id).eq('kind', 'seal');
      const s = await appendEntry(item.id, cert, 'seal', { schema: DPP_VERSION, version: (count || 0) + 1, dpp: d });
      return NextResponse.json({ ok: true, entry: s });
    }

    if (body.action === 'event') {
      const ev = body.event || {};
      const type = clip(ev.type, 30);
      if (!EVENT_TYPES.some((t) => t.key === type)) return NextResponse.json({ error: 'Choose what happened' }, { status: 400 });
      const data: Record<string, unknown> = { type, actor: clip(ev.actor, 120), place: clip(ev.place, 120), note: clip(ev.note, 1000) };
      if (ev.date) data.date = clip(ev.date, 10);
      const s = await appendEntry(item.id, cert, 'event', data);
      return NextResponse.json({ ok: true, entry: s });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    const m = (e as Error).message || String(e);
    return NextResponse.json({ error: /relation|does not exist|schema cache/i.test(m) ? 'not-set-up' : m }, { status: 500 });
  }
}
