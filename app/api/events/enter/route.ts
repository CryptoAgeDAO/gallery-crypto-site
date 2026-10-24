import { NextResponse } from 'next/server';
import { db } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// イベントのチケット申し込み。受付中・公開中のイベントだけ受け付け、チケット番号と確認用リンクを返す。
export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ error: 'Tickets are not open yet.' }, { status: 503 });
  let b: { event_id?: string; email?: string; name?: string; hp?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }
  if (b.hp) return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  const email = String(b.email || '').trim().toLowerCase();
  const name = String(b.name || '').trim().slice(0, 120);
  const id = String(b.event_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !email.includes('@') || email.length > 254) return NextResponse.json({ error: 'Check your email address.' }, { status: 400 });

  const d = db();
  const { data: ev } = await d.from('events').select('id,status,published').eq('id', id).maybeSingle();
  if (!ev || !ev.published) return NextResponse.json({ error: 'This event was not found.' }, { status: 404 });
  if (ev.status !== 'open') return NextResponse.json({ error: 'Tickets for this event are closed.' }, { status: 409 });

  const { data, error } = await d.from('event_entries').insert({ event_id: id, email, name }).select('ticket_no,token').single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'This email already has a ticket for this event. Use the ticket link you saved.' }, { status: 409 });
    return NextResponse.json({ error: 'Your ticket could not be issued. Please try again in a moment.' }, { status: 500 });
  }
  return NextResponse.json({ ticket_no: data.ticket_no, token: data.token });
}
