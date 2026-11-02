import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';
import Ticket from '@/components/Ticket';
import { db } from '@/lib/server';
import { EVENT_COLUMNS, type GcEvent } from '@/lib/types';
import { getT } from '@/lib/lang';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your ticket — Gallery Crypto', robots: { index: false, follow: false } };

// 自分のチケット（確認用リンク）。抽選後はここに結果が出る。
export default async function TicketPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const tr = getT();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !/^[0-9a-f-]{36}$/i.test(token))
    return (
      <MoShell title={tr('Ticket not found', 'チケットが見つかりません')}>
        <p className="mo-lead">{tr('Check the link you saved when you got your ticket.', 'チケットを受け取ったときに保存したリンクをご確認ください。')}</p>
      </MoShell>
    );
  const d = db();
  const { data: t } = await d.from('event_entries').select('event_id,ticket_no,name,result,position').eq('token', token).maybeSingle();
  const { data: ev } = t ? await d.from('events').select(EVENT_COLUMNS).eq('id', t.event_id).maybeSingle() : { data: null };
  if (!t || !ev)
    return (
      <MoShell title={tr('Ticket not found', 'チケットが見つかりません')}>
        <p className="mo-lead">{tr('Check the link you saved when you got your ticket.', 'チケットを受け取ったときに保存したリンクをご確認ください。')}</p>
      </MoShell>
    );
  const e = ev as GcEvent;
  const msg =
    e.status !== 'drawn'
      ? tr('Keep this page. Come back after the draw to see your result.', 'このページを保存してください。抽選後に結果をご確認いただけます。')
      : e.mode === 'order'
        ? tr('The order has been drawn. Show this ticket at the door — you will be called by your number.', '入場順の抽選が終わりました。入口でこのチケットを見せてください。番号順にお呼びします。')
        : t.result === 'win'
          ? tr('You won! Show this ticket at the door.', '当選です！入口でこのチケットを見せてください。')
          : tr('Thank you for entering. This one was not drawn — see you at the next event.', 'ご応募ありがとうございました。今回は落選となりました。次のイベントでお会いしましょう。');
  return (
    <MoShell title={tr('Your ticket', 'あなたのチケット')} kicker={tr('Event ticket', 'イベントチケット')}>
      <p className="mo-lead">{msg}</p>
      <Ticket ev={e} t={t} />
    </MoShell>
  );
}
