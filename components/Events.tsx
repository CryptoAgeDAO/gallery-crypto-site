'use client';

import { useState } from 'react';
import Ticket from '@/components/Ticket';
import { eventDate, type GcEvent } from '@/lib/types';
import { sfx } from '@/lib/sfx';
import { useLang } from './Lang';

// 公開サイトの「EVENTS」欄。イベントごとにチケットを申し込める（抽選の当たり外れ、または入場順の抽選）。
function GetTicket({ ev }: { ev: GcEvent }) {
  const { t } = useLang();
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
          <b>{t('Save your ticket link', 'チケットのリンクを保存してください')}</b>{t(' — it is the only way to see your result:', '。結果を見る方法はこのリンクだけです：')}
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
            {copied ? t('Copied', 'コピーしました') : t('Copy link', 'リンクをコピー')}
          </button>
        </div>
      </div>
    );
  }
  if (ev.status !== 'open')
    return <p className="mo-fine">{ev.status === 'drawn' ? t('The draw is done. Ticket holders: check your ticket link for the result.', '抽選は終わりました。チケットをお持ちの方は、チケットのリンクで結果をご確認ください。') : t('Tickets are closed.', 'チケットの受付は終了しました。')}</p>;
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
          if (!r.ok) setErr(j.error || t('Your ticket could not be issued.', 'チケットを発行できませんでした。'));
          else {
            sfx('coin');
            setGot(j);
            fetch('/api/notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'event', email }), keepalive: true }).catch(() => {});
          }
        } catch {
          setErr(t('Your ticket could not be issued. Please try again in a moment.', 'チケットを発行できませんでした。少し時間をおいて、もう一度お試しください。'));
        }
        setBusy(false);
      }}
    >
      <input className="hp" tabIndex={-1} aria-hidden="true" autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
      <label className="mo-line">
        <span>{t('Name', 'お名前')}</span>
        <input type="text" maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('optional', '任意')} />
      </label>
      <label className="mo-line">
        <span>{t('Email', 'メール')}</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="mo-btn" type="submit" disabled={busy}>
        {busy ? t('Printing…', '発行中…') : t('Get a free ticket', '無料チケットを受け取る')}
      </button>
      <p className="mo-fine">{t('One ticket per email. Your email is used only for this event.', 'チケットはメールアドレス1つにつき1枚です。メールアドレスはこのイベントのためだけに使います。')} <a href="/privacy">{t('Privacy', 'プライバシー')}</a></p>
      {err && <p className="mo-err">{err}</p>}
    </form>
  );
}

export default function Events({ events }: { events: GcEvent[] }) {
  const { t, lang } = useLang();
  if (!events.length) return null;
  return (
    <section className="mo-sec ev" id="events" aria-label="Events">
      <h2 className="mo-sh">
        {t('Events', 'イベント')}<span>{t('Free tickets', '無料チケット')} · {t(events.length === 1 ? '1 event' : `${events.length} events`, `${events.length}件`)}</span>
      </h2>
      <div className="ev-list">
        {events.map((ev) => (
          <article key={ev.id} className="ev-item">
            <div className="ev-head">
              <span className={`ev-mode ${ev.mode}`}>{ev.mode === 'lottery' ? t(`Lottery · ${ev.capacity} winners`, `抽選 · 当選${ev.capacity}名`) : t('Entry order by draw', '入場順を抽選')}</span>
              <span className={`ev-st ${ev.status}`}>{ev.status === 'open' ? t('Tickets open', '受付中') : ev.status === 'closed' ? t('Closed', '受付終了') : t('Drawn', '抽選済み')}</span>
            </div>
            <h3 className="ev-title">{ev.title}</h3>
            <p className="ev-when">
              {eventDate(ev.starts_at, lang)}
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
