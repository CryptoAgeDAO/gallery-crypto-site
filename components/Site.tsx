'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, photoUrl } from '@/lib/supabase';
import { ERA_LABEL, certNo, usd, type Item, type Settings } from '@/lib/types';
import BuyButton from '@/components/BuyButton';
import { CardBack, CardFront } from '@/components/Card';
import { MusicBar, PlayButton } from '@/components/Music';
import { flipFront, flipOver, startFlip, stopFlip, watchCards } from '@/lib/motion';
import { onSfxChange, setSfx, sfx, sfxDeal, sfxEnabled } from '@/lib/sfx';

type Props = { settings: Settings; items: Item[]; configured: boolean };
type Status = { kind: 'idle' | 'busy' | 'ok' | 'err'; text?: string };

const FILTERS: [string, string][] = [
  ['all', 'All'],
  ['80s', '80s'],
  ['90s', '90s'],
  ['00s', '2000s'],
];

// 管理者への通知（失敗しても画面には影響させない）
function notify(kind: 'entry' | 'message', email: string) {
  fetch('/api/notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, email: email.trim() }), keepalive: true }).catch(() => {});
}

async function enter(email: string, itemId: string | null): Promise<Status> {
  const db = supabase();
  if (!db) return { kind: 'err', text: 'Entries are not open yet.' };
  const { error } = await db.from('entries').insert({ email: email.trim().toLowerCase(), item_id: itemId });
  if (!error) {
    notify('entry', email);
    return { kind: 'ok', text: 'You are entered. Winners are drawn in January 2027 and contacted by email.' };
  }
  if (error.code === '23505') return { kind: 'ok', text: 'You have already entered with this email.' };
  return { kind: 'err', text: 'Your entry could not be saved. Please try again in a moment.' };
}

function Cert({ it }: { it: Item }) {
  const rows: [string, string][] = [
    ['No.', certNo(it)],
    ['Piece', [it.band, it.year].filter(Boolean).join(' · ') || '—'],
    ['Sourced from', it.dealer || "Founder's collection"],
    ['Network', 'Solana (test network)'],
    ['Issued', 'At purchase'],
  ];
  return (
    <div className="cert">
      <div className="cert-h">
        <span>Provenance certificate</span>
        <span className="tag">Preview</span>
      </div>
      <dl className="spec">
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DrawForm({ itemId }: { itemId: string | null }) {
  const [email, setEmail] = useState('');
  const [hp, setHp] = useState('');
  const [st, setSt] = useState<Status>({ kind: 'idle' });
  if (st.kind === 'ok') return <p className="status-ok">{st.text}</p>;
  return (
    <form
      style={{ display: 'grid', gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (hp) return;
        setSt({ kind: 'busy' });
        const r = await enter(email, itemId);
        if (r.kind === 'ok') sfx('coin');
        setSt(r);
      }}
    >
      <input className="hp" tabIndex={-1} aria-hidden="true" autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
      <input type="email" required autoComplete="email" placeholder="Email for the free draw" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
      <button className="btn primary pub full" type="submit" disabled={st.kind === 'busy'}>
        {st.kind === 'busy' ? 'Entering…' : 'Enter the draw — free'}
      </button>
      <p className="note-pub">
        Your email is used only for the draw. <a href="/privacy">Privacy</a>
      </p>
      {st.kind === 'err' && <p className="status-err">{st.text}</p>}
    </form>
  );
}

function Detail({ it, onClose, saleOpen }: { it: Item; onClose: () => void; saleOpen: boolean }) {
  const flipRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(0);
  const close = () => {
    sfx('close');
    onClose();
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  useEffect(() => {
    if (flipRef.current) startFlip(flipRef.current, setSide);
    sfx('open');
    return () => stopFlip();
  }, [it.id]);
  const rows: [string, string][] = (
    [
      ['Decade', ERA_LABEL[it.era] || ''],
      ['Year', it.year],
      ['Size', it.size ? it.size.toUpperCase() : ''],
      ['Tag', it.tag],
      ['Stitch', it.stitch ? 'Single stitch' : ''],
      ['Made in', it.made_in],
      ['Condition', it.cond],
    ] as [string, string][]
  ).filter((r) => r[1]);
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="panel detail" role="dialog" aria-modal="true" aria-label={it.band || 'Piece'}>
        <button className="x" onClick={close} aria-label="Close" autoFocus>
          ×
        </button>
        <div className="pv cardview">
          <div className="flip" id="flip" ref={flipRef}>
            <div className="flip-in">
              <div className="tc big side">
                <CardFront it={it} saleOpen={saleOpen} big />
              </div>
              <div className="tc big side backside">
                <CardBack it={it} />
              </div>
            </div>
          </div>
          <div className="pv-ctl">
            <button className="btn pub" onClick={flipOver}>
              {side ? 'Flip · Front' : 'Flip · Certificate'}
            </button>
            {it.photos.length > 1 &&
              it.photos.map((p) => (
                <button
                  key={p}
                  className="thumb"
                  aria-label="Show photo"
                  onClick={() => {
                    const m = document.getElementById('pv-main') as HTMLImageElement | null;
                    if (m) m.src = photoUrl(p);
                    flipFront();
                  }}
                >
                  <img src={photoUrl(p)} alt="" />
                </button>
              ))}
          </div>
          <span className="flip-hint">Drag the card to turn it</span>
        </div>
        <div className="info">
          <h2>{it.band || 'Untitled'}</h2>
          {it.title && <p className="sub">{it.title}</p>}
          {rows.length > 0 && (
            <dl className="spec">
              {rows.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {(it.audio_path || it.listen) && (
            <div className="snd">
              <span className="lb">Sound</span>
              <div className="row" style={{ justifyContent: 'flex-start' }}>
                {it.audio_path && <PlayButton it={it} />}
                {it.listen && (
                  <a className="btn pub" href={it.listen} target="_blank" rel="noopener noreferrer">
                    Listen ↗
                  </a>
                )}
              </div>
              {it.audio_path && it.audio_credit && (
                <p className="note-pub" style={{ marginTop: 6 }}>
                  {it.audio_credit}
                </p>
              )}
            </div>
          )}
          {it.prov && (
            <div className="prov">
              <span>Provenance</span>
              <p>{it.prov}</p>
            </div>
          )}
          <Cert it={it} />
          {it.sold ? (
            <p className="price">Sold</p>
          ) : saleOpen && it.price_usd ? (
            <>
              <p className="price">{usd(it.price_usd)}</p>
              <BuyButton itemId={it.id} />
            </>
          ) : (
            <>
              <p className="price">Price — announced in 2027</p>
              <DrawForm itemId={it.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SfxToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(sfxEnabled());
    return onSfxChange(setOn);
  }, []);
  return (
    <button className="sfx-t" aria-pressed={on} onClick={() => setSfx(!on)}>
      ♪ SFX {on ? 'On' : 'Off'}
    </button>
  );
}

function Contact({ email }: { email: string }) {
  const [f, setF] = useState({ name: '', email: '', body: '' });
  const [hp, setHp] = useState('');
  const [st, setSt] = useState<Status>({ kind: 'idle' });
  if (st.kind === 'ok') return <p className="status-ok">{st.text}</p>;
  return (
    <>
      <form
        className="pubform"
        onSubmit={async (e) => {
          e.preventDefault();
          if (hp) return;
          const db = supabase();
          if (!db) return setSt({ kind: 'err', text: 'The form is not open yet.' });
          setSt({ kind: 'busy' });
          const { error } = await db.from('messages').insert({ name: f.name.trim(), email: f.email.trim(), body: f.body.trim() });
          if (!error) notify('message', f.email);
          setSt(error ? { kind: 'err', text: 'Your message could not be sent. Please try again in a moment.' } : { kind: 'ok', text: 'Thank you. Your message has been sent.' });
        }}
      >
        <input className="hp" tabIndex={-1} aria-hidden="true" autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
        <label>
          Name
          <input type="text" required maxLength={200} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label>
          Email
          <input type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </label>
        <label className="wide">
          Message
          <textarea required maxLength={5000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </label>
        <label>
          <button className="btn primary pub" type="submit" disabled={st.kind === 'busy'}>
            {st.kind === 'busy' ? 'Sending…' : 'Send'}
          </button>
        </label>
      </form>
      {st.kind === 'err' && <p className="status-err">{st.text}</p>}
      {email && <p className="note-pub">Or write to {email}.</p>}
    </>
  );
}

export default function Site({ settings: s, items }: Props) {
  const [flt, setFlt] = useState('all');
  const [open, setOpen] = useState<Item | null>(null);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, '80s': 0, '90s': 0, '00s': 0 };
    items.forEach((it) => {
      if (c[it.era] != null) c[it.era]++;
    });
    return c;
  }, [items]);
  const shown = flt === 'all' ? items : items.filter((it) => it.era === flt);
  const sample = items.find((it) => it.band && it.photos.length) || items[0];
  const firstDeal = useRef(true);
  useEffect(() => {
    watchCards();
    if (firstDeal.current) firstDeal.current = false;
    else sfxDeal(shown.length);
  }, [flt, items]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="site">
      <header className="hd">
        <span className="wm">Gallery Crypto</span>
        <nav className="nav" aria-label="Sections">
          <a href="#archive">Archive</a>
          <a href="#presale">Presale</a>
          <a href="#provenance">Provenance</a>
          <a href="#contact">Contact</a>
          <SfxToggle />
          {s.instagram && (
            <a href={s.instagram} target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
          )}
        </nav>
      </header>

      <section className="intro">
        <h1>{s.headline}</h1>
        <p>{s.lead}</p>
        <p className="launch">{s.launch}</p>
      </section>

      <div id="archive">
        {items.length ? (
          <>
            <nav className="bar" aria-label="Filter by decade">
              <div className="filters">
                {FILTERS.map(([k, l]) => (
                  <button key={k} className="flt" aria-pressed={flt === k} onClick={() => setFlt(k)}>
                    {l}
                    <sup>{counts[k]}</sup>
                  </button>
                ))}
              </div>
              <span className="count">
                {shown.length} {shown.length === 1 ? 'piece' : 'pieces'}
              </span>
            </nav>
            <div className="grid tcg" key={flt}>
              {shown.map((it, i) => (
                <button
                  key={it.id}
                  className="tc"
                  style={{ ['--i' as string]: Math.min(i, 10) }}
                  aria-label={`${it.band || 'Untitled'} ${certNo(it)}`}
                  onClick={() => setOpen(it)}
                >
                  <CardFront it={it} saleOpen={s.sale_open} />
                </button>
              ))}
            </div>
            {!shown.length && <p className="empty">No pieces from this decade yet.</p>}
          </>
        ) : (
          <p className="empty">The archive is being prepared. Pieces will be added one by one until launch.</p>
        )}
      </div>

      <section className="block" id="presale">
        <h2>Presale 2027</h2>
        <p className="lead">The first release opens in January 2027 as a free draw, together with dealers in Los Angeles. No entry fee, no tokens to buy.</p>
        <ol className="steps">
          <li>
            <span>01</span>
            <b>Enter</b>
            <p>Enter for free with your email address.</p>
          </li>
          <li>
            <span>02</span>
            <b>Draw</b>
            <p>Winners are picked with verifiable randomness on Solana, and the result is published.</p>
          </li>
          <li>
            <span>03</span>
            <b>Purchase</b>
            <p>Winners buy at a fixed price by card or Apple Pay.</p>
          </li>
          <li>
            <span>04</span>
            <b>Certificate</b>
            <p>Each piece comes with a provenance certificate recording where it came from.</p>
          </li>
        </ol>
        <div style={{ maxWidth: 420 }}>
          <DrawForm itemId={null} />
        </div>
      </section>

      <section className="block" id="provenance">
        <h2>Provenance</h2>
        <p className="lead">
          Every piece carries a permanent record: where it was found, which dealer it came through, and who owns it now. Records are written on Solana first, with XRP Ledger support to follow.
        </p>
        {sample && (
          <div className="pair">
            <div className="tc">
              <CardFront it={sample} saleOpen={s.sale_open} />
            </div>
            <div className="tc">
              <CardBack it={sample} />
            </div>
          </div>
        )}
      </section>

      <section className="block" id="contact">
        <h2>Contact</h2>
        <Contact email={s.email} />
      </section>

      <footer className="ft">
        <span>© Gallery Crypto</span>
        <span className="contact">
          <a href="/privacy">Privacy</a>
          {s.sale_open && <a href="/legal">Legal notice</a>}
          {s.instagram && (
            <a href={s.instagram} target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
          )}
        </span>
      </footer>

      {open && <Detail it={open} saleOpen={s.sale_open} onClose={() => setOpen(null)} />}
      <MusicBar />
    </div>
  );
}
