import { eventDate, type GcEvent } from '@/lib/types';

// 入場券のようなチケット。抽選前は「DRAW PENDING」、抽選後は当たり外れ、または入場順を表示する。
export type TicketInfo = { ticket_no: number | null; name?: string; result: 'win' | 'lose' | null; position: number | null };

export default function Ticket({ ev, t }: { ev: Pick<GcEvent, 'title' | 'starts_at' | 'venue' | 'mode' | 'status'>; t: TicketInfo }) {
  const no = String(t.ticket_no || 0).padStart(4, '0');
  const drawn = ev.status === 'drawn';
  let state: 'pending' | 'win' | 'lose' | 'order' = 'pending';
  if (drawn && ev.mode === 'lottery') state = t.result === 'win' ? 'win' : 'lose';
  if (drawn && ev.mode === 'order' && t.position) state = 'order';
  // チケット番号から作る飾りのバーコード（毎回同じ形）
  const bars = Array.from({ length: 34 }, (_, i) => 1 + ((((t.ticket_no || 1) * 31 + i * 17) ^ (i * 7)) % 3));
  return (
    <div className={`tk tk-${state}`} role="img" aria-label={`Ticket ${no} for ${ev.title}`}>
      <div className="tk-main">
        <p className="tk-top">Gallery Crypto presents</p>
        <p className="tk-title">{ev.title || 'Event'}</p>
        <p className="tk-meta">
          {eventDate(ev.starts_at)}
          {ev.venue && (
            <>
              <br />
              {ev.venue}
            </>
          )}
        </p>
        <p className="tk-admit">{state === 'lose' ? 'Not this time' : ev.mode === 'order' ? 'Admit one · in order' : 'Admit one'}</p>
        {t.name && <p className="tk-name">{t.name}</p>}
        {state === 'win' && <span className="tk-stamp win">Winner</span>}
        {state === 'lose' && <span className="tk-stamp lose">Sorry</span>}
        {state === 'pending' && <span className="tk-stamp pend">{ev.mode === 'order' ? 'Order drawn soon' : 'Draw pending'}</span>}
      </div>
      <div className="tk-stub">
        <p className="tk-lbl">{state === 'order' ? 'Your number' : 'Ticket no.'}</p>
        <p className="tk-no">{state === 'order' ? String(t.position).padStart(3, '0') : no}</p>
        {state === 'order' && <p className="tk-lbl">Ticket #{no}</p>}
        <span className="tk-bars" aria-hidden>
          {bars.map((w, i) => (
            <i key={i} style={{ width: w }} />
          ))}
        </span>
      </div>
    </div>
  );
}
