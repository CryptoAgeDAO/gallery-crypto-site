import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';
import Ticket from '@/components/Ticket';
import { db } from '@/lib/server';
import { EVENT_COLUMNS, type GcEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your ticket — Gallery Crypto', robots: { index: false, follow: false } };

// 自分のチケット（確認用リンク）。抽選後はここに結果が出る。
export default async function TicketPage({ params }: { params: { token: string } }) {
  const token = params.token;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !/^[0-9a-f-]{36}$/i.test(token))
    return (
      <MoShell title="Ticket not found">
        <p className="mo-lead">Check the link you saved when you got your ticket.</p>
      </MoShell>
    );
  const d = db();
  const { data: t } = await d.from('event_entries').select('event_id,ticket_no,name,result,position').eq('token', token).maybeSingle();
  const { data: ev } = t ? await d.from('events').select(EVENT_COLUMNS).eq('id', t.event_id).maybeSingle() : { data: null };
  if (!t || !ev)
    return (
      <MoShell title="Ticket not found">
        <p className="mo-lead">Check the link you saved when you got your ticket.</p>
      </MoShell>
    );
  const e = ev as GcEvent;
  const msg =
    e.status !== 'drawn'
      ? 'Keep this page. Come back after the draw to see your result.'
      : e.mode === 'order'
        ? 'The order has been drawn. Show this ticket at the door — you will be called by your number.'
        : t.result === 'win'
          ? 'You won! Show this ticket at the door.'
          : 'Thank you for entering. This one was not drawn — see you at the next event.';
  return (
    <MoShell title="Your ticket" kicker="Event ticket">
      <p className="mo-lead">{msg}</p>
      <Ticket ev={e} t={t} />
    </MoShell>
  );
}
