import { NextResponse } from 'next/server';
import { db } from '@/lib/server';
import { certNo } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 新しい抽選エントリー・問い合わせを、管理者（admins のメール）に知らせる。
// 送信には Resend（RESEND_API_KEY）を使う。キーがなければ何もしない。
// いたずら防止のため、直前2分以内に実際にデータベースへ保存された内容だけを通知する。

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

async function send(to: string[], subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to.length) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.NOTIFY_FROM || 'Gallery Crypto <onboarding@resend.dev>',
      to,
      subject,
      html,
    }),
  });
  if (!r.ok) console.error('notify', r.status, await r.text());
  return r.ok;
}

export async function POST(req: Request) {
  if (!process.env.RESEND_API_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ ok: true, skipped: true });
  let body: { kind?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const email = String(body.email || '').trim().toLowerCase();
  if (!email.includes('@') || email.length > 254) return NextResponse.json({ ok: false }, { status: 400 });

  const d = db();
  const since = new Date(Date.now() - 2 * 60_000).toISOString();
  const envTo = (process.env.NOTIFY_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean);
  const to = envTo.length ? envTo : ((await d.from('admins').select('email')).data || []).map((r: { email: string }) => r.email);
  const site = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '');

  if (body.kind === 'entry') {
    const { data } = await d.from('entries').select('id,email,item_id,created_at').ilike('email', email).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
    const e = data?.[0];
    if (!e) return NextResponse.json({ ok: true });
    let piece = 'General entry (any piece)';
    if (e.item_id) {
      const { data: it } = await d.from('items').select('serial,band,title').eq('id', e.item_id).maybeSingle();
      if (it) piece = `${certNo(it)} ${[it.band, it.title].filter(Boolean).join(' — ')}`;
    }
    const { count } = await d.from('entries').select('id', { count: 'exact', head: true });
    await send(
      to,
      `New draw entry — ${piece}`,
      `<p>New draw entry.</p><p><b>Email:</b> ${esc(e.email)}<br><b>Piece:</b> ${esc(piece)}<br><b>Total entries:</b> ${count ?? '-'}</p><p><a href="${site}/admin">Open admin</a></p>`,
    );
    return NextResponse.json({ ok: true });
  }

  if (body.kind === 'message') {
    const { data } = await d.from('messages').select('name,email,body,created_at').ilike('email', email).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
    const m = data?.[0];
    if (!m) return NextResponse.json({ ok: true });
    await send(
      to,
      `New message from ${m.name}`,
      `<p>New message from the site.</p><p><b>Name:</b> ${esc(m.name)}<br><b>Email:</b> ${esc(m.email)}</p><blockquote style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:12px">${esc(m.body)}</blockquote><p><a href="${site}/admin">Open admin</a></p>`,
    );
    return NextResponse.json({ ok: true });
  }

  if (body.kind === 'event') {
    const { data } = await d.from('event_entries').select('email,ticket_no,event_id,created_at').ilike('email', email).gte('created_at', since).order('created_at', { ascending: false }).limit(1);
    const t = data?.[0];
    if (!t) return NextResponse.json({ ok: true });
    const { data: ev } = await d.from('events').select('title').eq('id', t.event_id).maybeSingle();
    await send(
      to,
      `New ticket — ${ev?.title || 'Event'} #${t.ticket_no}`,
      `<p>New event ticket.</p><p><b>Event:</b> ${esc(ev?.title || '')}<br><b>Ticket:</b> #${t.ticket_no}<br><b>Email:</b> ${esc(t.email)}</p><p><a href="${site}/admin">Open admin</a></p>`,
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
