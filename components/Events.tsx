'use client';

import { useState } from 'react';
import Ticket from '@/components/Ticket';
import { eventDate, type GcEvent } from '@/lib/types';
import { sfx } from '@/lib/sfx';

// 公開サイトの「EVENTS」欄。イベントごとにチケットを申し込める（抽選の当たり外れ、または入場順の抽選）。
function GetTicket({ ev }: { ev: GcEvent }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [hp, setHp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [got, setGot] = useState<{ ticket_no: number; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (got) {
    const link = `${location.origin}/ticket/${got.token}`;
    return (
      <div className="ev-got">
        <Ticket ev={ev} t={{ ticket_no: got.ticket_no, name, result: null, position: null }} />
        <p className="mo-fine">
          <b>Save your ticket link</b> — it is the only way to see your result:
        </p>
        <div className="ev-link">
          <a href={link}>{link}</a>
          <button
            type="button"
            className="mo-btn small"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {}
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      </div>
    );
  }
  if (ev.status !== 'open')
    return <p className="mo-fine">{ev.status === 'drawn' ? 'The draw is done. Ticket holders: check your ticket link for the result.' : 'Tickets are closed.'}</p>;
  return (
    <form
      className="mo-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (hp) return;
        setBusy(true);
        setErr('');
        try {
          const r = await fetch('/api/events/enter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event_id: ev.id, email, name, hp }) });
          const j = await r.json();
          if (!r.ok) setErr(j.error || 'Your ticket could not be issued.');
          else {
            sfx('coin');
            setGot(j);
            fetch('/api/notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'event', email }), keepalive: true }).catch(() => {});
          }
        } catch {
          setErr('Your ticket could not be issued. Please try again in a moment.');
        }
        setBusy(false);
      }}
    >
      <input className="hp" tabIndex={-1} aria-hidden="true" autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
      <label className="mo-line">
        <span>Name</span>
        <input type="text" maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="optional" />
      </label>
      <label className="mo-line">
        <span>Email</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="mo-btn" type="submit" disabled={busy}>
        {busy ? 'Printing…' : 'Get a free ticket'}
      </button>
      <p className="mo-fine">One ticket per email. Your email is used only for this event. <a href="/privacy">Privacy</a></p>
      {err && <p className="mo-err">{err}</p>}
    </form>
  );
}

export default function Events({ events }: { events: GcEvent[] }) {
  if (!events.length) return null;
  return (
    <section className="mo-sec ev" id="events" aria-label="Events">
      <h2 className="mo-sh">
        Events<span>Free tickets · {events.length === 1 ? '1 event' : `${events.length} events`}</span>
      </h2>
      <div className="ev-list">
        {events.map((ev) => (
          <article key={ev.id} className="ev-item">
            <div className="ev-head">
              <span className={`ev-mode ${ev.mode}`}>{ev.mode === 'lottery' ? `Lottery · ${ev.capacity} winners` : 'Entry order by draw'}</span>
              <span className={`ev-st ${ev.status}`}>{ev.status === 'open' ? 'Tickets open' : ev.status === 'closed' ? 'Closed' : 'Drawn'}</span>
            </div>
            <h3 className="ev-title">{ev.title}</h3>
            <p className="ev-when">
              {eventDate(ev.starts_at)}
              {ev.venue && <> · {ev.venue}</>}
            </p>
            {ev.description && <p className="ev-desc">{ev.description}</p>}
            <GetTicket ev={ev} />
          </article>
        ))}
      </div>
    </section>
  );
}
