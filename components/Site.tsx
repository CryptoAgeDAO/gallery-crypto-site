'use client';

import { useEffect, useState } from 'react';
import { supabase, photoUrl } from '@/lib/supabase';
import { ERA_LABEL, certNo, usd, type GcEvent, type Item, type Settings } from '@/lib/types';
import Events from '@/components/Events';
import BuyButton from '@/components/BuyButton';
import { MusicBar, PlayButton } from '@/components/Music';
import { sfx } from '@/lib/sfx';

// 公開サイト：白と黒だけ、装飾なし。論文のように番号つきの節で並べる（匿名性・静けさ・読みやすさ）。

type Props = { settings: Settings; items: Item[]; events?: GcEvent[]; sealed?: number[]; demo?: boolean; configured: boolean };
type Status = { kind: 'idle' | 'busy' | 'ok' | 'err'; text?: string };

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
    return { kind: 'ok', text: 'You are entered. Winners are drawn at the 2027 release (date TBA) and contacted by email.' };
  }
  if (error.code === '23505') return { kind: 'ok', text: 'You have already entered with this email.' };
  return { kind: 'err', text: 'Your entry could not be saved. Please try again in a moment.' };
}

// 写真のない作品は、番号だけの無地の枠
function Photo({ src, alt, n }: { src?: string; alt: string; n: string }) {
  return <span className="mo-ph">{src ? <img src={src} alt={alt} loading="lazy" /> : <span className="mo-blank">{n}</span>}</span>;
}

function DrawForm({ itemId, label = 'Enter the free draw' }: { itemId: string | null; label?: string }) {
  const [email, setEmail] = useState('');
  const [hp, setHp] = useState('');
  const [st, setSt] = useState<Status>({ kind: 'idle' });
  if (st.kind === 'ok') return <p className="mo-ok">{st.text}</p>;
  return (
    <form
      className="mo-form"
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
      <label className="mo-line">
        <span>Email</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="mo-btn" type="submit" disabled={st.kind === 'busy'}>
        {st.kind === 'busy' ? 'Sending…' : label}
      </button>
      <p className="mo-fine">
        No purchase necessary. Your email is used only for the draw. <a href="/privacy">Privacy</a>
      </p>
      {st.kind === 'err' && <p className="mo-err">{st.text}</p>}
    </form>
  );
}

function Detail({ it, onClose, saleOpen, sealed, demo }: { it: Item; onClose: () => void; saleOpen: boolean; sealed: boolean; demo?: boolean }) {
  const [shot, setShot] = useState(0);
  const close = () => {
    sfx('close');
    onClose();
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  useEffect(() => setShot(0), [it.id]);
  const rows: [string, string][] = (
    [
      ['Item no.', certNo(it)],
      ['Decade', ERA_LABEL[it.era] || ''],
      ['Year', it.year],
      ['Size', it.size ? it.size.toUpperCase() : ''],
      ['Tag', it.tag],
      ['Stitch', it.stitch ? 'Single stitch' : ''],
      ['Made in', it.made_in],
      ['Condition', it.cond],
      ['Sourced from', it.dealer || "Founder's collection"],
    ] as [string, string][]
  ).filter((r) => r[1]);
  return (
    <div className="modal mo-modal" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="mo-sheet" role="dialog" aria-modal="true" aria-label={it.band || 'Piece'}>
        <button className="mo-x" onClick={close} aria-label="Close" autoFocus>
          ×
        </button>
        <div className="mo-dpic">
          <Photo src={it.photos.length ? photoUrl(it.photos[shot] || it.photos[0]) : undefined} alt={`${it.band} ${it.title}`.trim()} n={certNo(it)} />
          {it.photos.length > 1 && (
            <div className="mo-thumbs">
              {it.photos.map((p, i) => (
                <button key={p} aria-label={`Photo ${i + 1}`} aria-pressed={i === shot} onClick={() => setShot(i)}>
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mo-dinfo">
          <p className="mo-no">{demo ? 'Demo piece' : certNo(it)} · 1 of 1</p>
          <h2 className="mo-dh">{it.band || 'Untitled'}</h2>
          {it.title && <p className="mo-dsub">{it.title}</p>}
          <dl className="mo-specs">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {it.prov && <p className="mo-prov">{it.prov}</p>}
          {sealed && (
            <a className="mo-btn ghost small" href={demo ? `/passport/GC-DEMO-${it.serial - 9000}` : `/passport/${certNo(it)}`}>
              Provenance passport →
            </a>
          )}
          {(it.audio_path || it.listen) && (
            <div className="mo-snd">
              {it.audio_path && <PlayButton it={it} />}
              {it.listen && (
                <a className="mo-btn ghost small" href={it.listen} target="_blank" rel="noopener noreferrer">
                  Listen ↗
                </a>
              )}
              {it.audio_path && it.audio_credit && <p className="mo-fine">{it.audio_credit}</p>}
            </div>
          )}
          <div className="mo-buy">
            {demo ? (
              <>
                <p className="mo-price">Sample for the demonstration</p>
                <a className="mo-btn" href="/demo">Experience the demo →</a>
              </>
            ) : it.sold ? (
              <p className="mo-price">Sold</p>
            ) : saleOpen && it.price_usd ? (
              <>
                <p className="mo-price">{usd(it.price_usd)}</p>
                <BuyButton itemId={it.id} />
              </>
            ) : (
              <>
                <p className="mo-price">Release 2027 · date TBA</p>
                <DrawForm itemId={it.id} label="Enter the draw for this piece" />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Contact({ email }: { email: string }) {
  const [f, setF] = useState({ name: '', email: '', body: '' });
  const [hp, setHp] = useState('');
  const [st, setSt] = useState<Status>({ kind: 'idle' });
  if (st.kind === 'ok') return <p className="mo-ok">{st.text}</p>;
  return (
    <form
      className="mo-form"
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
      <label className="mo-line">
        <span>Name</span>
        <input type="text" required maxLength={200} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <label className="mo-line">
        <span>Email</span>
        <input type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </label>
      <label className="mo-line tall">
        <span>Message</span>
        <textarea required maxLength={5000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      </label>
      <button className="mo-btn" type="submit" disabled={st.kind === 'busy'}>
        {st.kind === 'busy' ? 'Sending…' : 'Send'}
      </button>
      {st.kind === 'err' && <p className="mo-err">{st.text}</p>}
      {email && <p className="mo-fine">Or write to {email}.</p>}
    </form>
  );
}

export default function Site({ settings: s, items, events = [], sealed = [], demo = false }: Props) {
  const [open, setOpen] = useState<Item | null>(null);
  // 作品が少ないあいだは、番号だけの空き枠で列をそろえる
  const slots = Math.max(items.length, 3);
  const heroItem = items.find((i) => i.photos[0]);
  const hero = demo ? '/demo/hero.jpg' : heroItem ? photoUrl(heroItem.photos[0]) : '';

  return (
    <div className="mo">
      <div className="mo-page">
        <header className="mo-mast">
          <nav className="mo-nav l" aria-label="Collection">
            <a href="#archive">Archive</a>
            {events.length > 0 && <a href="#events">Events</a>}
            <a href="#draw">Draw</a>
          </nav>
          <a className="mo-logo" href="/">Gallery Crypto</a>
          <nav className="mo-nav r" aria-label="House">
            <a href="/proof">Provenance</a>
            <a href="/demo">Demo</a>
            <a href="#contact">Contact</a>
            {s.instagram && (
              <a href={s.instagram} target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
            )}
          </nav>
        </header>
      </div>

      <section className={`mo-hero${hero ? ' img' : ''}`} style={hero ? { backgroundImage: `url(${hero})` } : undefined}>
        <div className="mo-hero-in">
          <p className="mo-kicker">{s.launch}</p>
          <h1>{s.headline}</h1>
          <a className="mo-heroa" href="#archive">Explore the archive</a>
          {demo && <a className="mo-herob" href="/demo">Or try the provenance demo</a>}
        </div>
      </section>

      <div className="mo-page">
        <p className="mo-intro">{s.lead}</p>

        <section className="mo-sec" id="archive" aria-label="Archive">
          <h2 className="mo-sh">
            The Archive<span>{demo ? 'Demo — sample pieces, fictional bands' : items.length ? `${items.length} ${items.length === 1 ? 'piece' : 'pieces'}` : 'In preparation'}</span>
          </h2>
          <div className="mo-grid">
            {Array.from({ length: slots }, (_, i) => {
              const it = items[i];
              if (!it)
                return (
                  <div key={`s${i}`} className="mo-item soon">
                    <Photo alt="" n={`GC-${String(i + 1).padStart(4, '0')}`} />
                    <p className="mo-ino"><span>GC-{String(i + 1).padStart(4, '0')}</span></p>
                    <p className="mo-idesc">In preparation</p>
                  </div>
                );
              return (
                <button key={it.id} className="mo-item" onClick={() => (sfx('open'), setOpen(it))} aria-label={`${it.band} ${it.title}`}>
                  <Photo src={it.photos[0] ? photoUrl(it.photos[0]) : undefined} alt={`${it.band} ${it.title}`.trim()} n={certNo(it)} />
                  <p className="mo-ino">
                    <span>{demo ? 'Demo' : certNo(it)}</span>
                    <span>{it.sold ? 'Sold' : '1 of 1'}</span>
                  </p>
                  <p className="mo-iname">{it.band || 'Untitled'}</p>
                  <p className="mo-idesc">{[it.title, it.year, it.size && it.size.toUpperCase()].filter(Boolean).join(' · ') || 'Vintage band tee'}</p>
                  {s.sale_open && it.price_usd && !it.sold && <p className="mo-idesc">{usd(it.price_usd)}</p>}
                </button>
              );
            })}
          </div>
        </section>

        <Events events={events} />

        <section className="mo-sec" id="draw" aria-label="Draw">
          <h2 className="mo-sh">
            The Draw<span>Free · no purchase necessary</span>
          </h2>
          <div className="mo-two">
            <ol className="mo-steps">
              <li>Leave your email.</li>
              <li>Winners are drawn at the 2027 release (date to be announced) with verifiable randomness.</li>
              <li>Winners buy at a fixed price by card or Apple Pay.</li>
              <li>Every piece ships with its provenance passport.</li>
            </ol>
            <DrawForm itemId={null} />
          </div>
        </section>

        <section className="mo-sec" id="provenance" aria-label="Provenance">
          <h2 className="mo-sh">Provenance</h2>
          <div className="mo-two">
            <p className="mo-lead">
              Every piece carries a permanent record: where it was found, which dealer it came through, and what happened to it since. Each record is signed twice, follows the EU Digital Product Passport, and can be checked by anyone — even without a blockchain, even offline.
            </p>
            <p className="mo-links">
              <a href="/proof">See the proof →</a>
              <a href="/verify">Verify a piece →</a>
              <a href="/spec">Read the specification →</a>
            </p>
          </div>
        </section>

        <section className="mo-sec" id="contact" aria-label="Contact">
          <h2 className="mo-sh">Contact</h2>
          <div className="mo-two">
            <p className="mo-lead">Gallery Crypto, Tokyo.</p>
            <Contact email={s.email} />
          </div>
        </section>

        <footer className="mo-foot">
          <span>© Gallery Crypto · Tokyo · Each piece is one of a kind.</span>
          <span>
            <a href="/privacy">Privacy</a>
            {s.sale_open && <a href="/legal">Legal notice</a>}
            <a href="/spec">Specification</a>
          </span>
        </footer>
      </div>

      {open && <Detail it={open} demo={demo} saleOpen={s.sale_open} sealed={demo || sealed.includes(open.serial)} onClose={() => setOpen(null)} />}
      <MusicBar />
    </div>
  );
}
