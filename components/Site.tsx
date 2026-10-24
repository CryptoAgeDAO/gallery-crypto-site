'use client';

import { useEffect, useState } from 'react';
import { supabase, photoUrl } from '@/lib/supabase';
import { ERA_LABEL, certNo, usd, type GcEvent, type Item, type Settings } from '@/lib/types';
import Events from '@/components/Events';
import BuyButton from '@/components/BuyButton';
import { MusicBar, PlayButton } from '@/components/Music';
import { sfx } from '@/lib/sfx';

// 公開サイト全体を「1980〜90年代のスケートボード雑誌の巻末にあった、Tシャツの通信販売ページ」風に。
// 新聞紙のような生成り色の紙・黒インク・赤の差し色・網点の写真・切り取り線のついた申込券。

type Props = { settings: Settings; items: Item[]; events?: GcEvent[]; configured: boolean };
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
    return { kind: 'ok', text: 'You are entered. Winners are drawn in 2027 and contacted by email.' };
  }
  if (error.code === '23505') return { kind: 'ok', text: 'You have already entered with this email.' };
  return { kind: 'err', text: 'Your entry could not be saved. Please try again in a moment.' };
}

const TEE_PATH = 'M30 8 L40 5 Q50 15 60 5 L70 8 L93 23 L84 39 L74 33 L74 95 Q50 98 26 95 L26 33 L16 39 L7 23 Z';
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

// 写真がまだない商品の線画
function TeeArt({ n }: { n?: number }) {
  return (
    <svg className="mo-art" viewBox="0 0 100 100" aria-hidden>
      <path d={TEE_PATH} />
      <text x="50" y="58" textAnchor="middle">
        {n ? `#${String(n).padStart(3, '0')}` : '?'}
      </text>
    </svg>
  );
}

// 網点（ハーフトーン）風の写真
function Halftone({ src, alt }: { src: string; alt: string }) {
  return (
    <span className="mo-ht">
      <img src={src} alt={alt} loading="lazy" />
    </span>
  );
}

function Sizes({ size }: { size: string }) {
  const s = (size || '').toUpperCase();
  return (
    <span className="mo-sizes" aria-label={s ? `Size ${s}` : 'Size to be announced'}>
      {SIZES.map((z) => (
        <span key={z} className={z === s ? 'on' : ''}>
          {z}
        </span>
      ))}
    </span>
  );
}

function DrawForm({ itemId, label = 'Enter the free draw' }: { itemId: string | null; label?: string }) {
  const [email, setEmail] = useState('');
  const [hp, setHp] = useState('');
  const [st, setSt] = useState<Status>({ kind: 'idle' });
  if (st.kind === 'ok') return <p className="mo-ok">✓ {st.text}</p>;
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

function Detail({ it, onClose, saleOpen }: { it: Item; onClose: () => void; saleOpen: boolean }) {
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
          {it.photos.length ? <Halftone src={photoUrl(it.photos[shot] || it.photos[0])} alt={`${it.band} ${it.title}`.trim()} /> : <TeeArt n={it.serial} />}
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
          <p className="mo-no">Item {certNo(it)}</p>
          <h2 className="mo-dh">{it.band || 'Untitled'}</h2>
          {it.title && <p className="mo-dsub">{it.title}</p>}
          <Sizes size={it.size} />
          <dl className="mo-specs">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {it.prov && <p className="mo-prov">“{it.prov}”</p>}
          {(it.audio_path || it.listen) && (
            <div className="mo-snd">
              {it.audio_path && <PlayButton it={it} />}
              {it.listen && (
                <a className="mo-btn ghost" href={it.listen} target="_blank" rel="noopener noreferrer">
                  Listen ↗
                </a>
              )}
              {it.audio_path && it.audio_credit && <p className="mo-fine">{it.audio_credit}</p>}
            </div>
          )}
          <div className="mo-coupon small">
            <p className="mo-cut" aria-hidden>
              ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - -
            </p>
            {it.sold ? (
              <p className="mo-price">Sold</p>
            ) : saleOpen && it.price_usd ? (
              <>
                <p className="mo-price">{usd(it.price_usd)}</p>
                <BuyButton itemId={it.id} />
              </>
            ) : (
              <>
                <p className="mo-price">
                  Price <span>announced 2027</span>
                </p>
                <DrawForm itemId={it.id} label="Enter the draw for this tee" />
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
  if (st.kind === 'ok') return <p className="mo-ok">✓ {st.text}</p>;
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
        {st.kind === 'busy' ? 'Sending…' : 'Send letter'}
      </button>
      {st.kind === 'err' && <p className="mo-err">{st.text}</p>}
      {email && <p className="mo-fine">Or write to {email}.</p>}
    </form>
  );
}

export default function Site({ settings: s, items, events = [] }: Props) {
  const [open, setOpen] = useState<Item | null>(null);
  // 商品がまだ少ないあいだは「COMING SOON」の枠で埋めて、誌面の升目を保つ
  const slots = Math.max(6, Math.ceil(items.length / 3) * 3);

  return (
    <div className="mo">
      <div className="mo-page">
        <header className="mo-mast">
          <div className="mo-top">
            <span>Vol. 1 · Tokyo, Japan</span>
            <nav aria-label="Sections">
              <a href="#archive">Catalog</a>
              {events.length > 0 && <a href="#events">★ Events</a>}
              <a href="#presale">Order form</a>
              <a href="#provenance">Guarantee</a>
              <a href="#contact">Write us</a>
              {s.instagram && (
                <a href={s.instagram} target="_blank" rel="noopener noreferrer">
                  Instagram
                </a>
              )}
            </nav>
          </div>
          <h1 className="mo-logo">
            Gallery Crypto <em>Mail Order</em>
          </h1>
          <p className="mo-strap">{s.headline} · American band tees from the &apos;80s to the 2000s</p>
        </header>
        <div className="mo-ribbon" aria-hidden>
          <span>
            {Array.from({ length: 3 }, () => '★ Free draw ★ 1 of 1 ★ Authentic ★ \'80s–\'00s ★ Presale 2027 ★ Tokyo ').join('')}
          </span>
        </div>

        <section className="mo-hero">
          <div className="mo-hero-l">
            <p className="mo-kicker">Official · One-of-a-kind · Authenticated</p>
            <h2 className="mo-big">
              Vintage
              <br />
              band tees
            </h2>
            <p className="mo-lead">{s.lead}</p>
          </div>
          <div className="mo-burst" aria-hidden>
            <span>
              Free
              <br />
              draw!
              <small>{s.launch}</small>
            </span>
          </div>
        </section>

        <section className="mo-cat" id="archive" aria-label="Catalog">
          <div className="mo-bar">
            <h2>The catalog</h2>
            <span>{items.length ? `${items.length} ${items.length === 1 ? 'piece' : 'pieces'} in stock` : 'New pieces being photographed'}</span>
          </div>
          <div className="mo-grid">
            {Array.from({ length: slots }, (_, i) => {
              const it = items[i];
              if (!it)
                return (
                  <div key={`s${i}`} className="mo-item soon">
                    <TeeArt n={i + 1} />
                    <p className="mo-ino">#{String(i + 1).padStart(3, '0')}</p>
                    <p className="mo-iname">Coming soon</p>
                    <p className="mo-idesc">Photo &amp; details on the way.</p>
                    <a className="mo-btn small" href="#presale">
                      Get on the list
                    </a>
                  </div>
                );
              return (
                <button key={it.id} className="mo-item" onClick={() => (sfx('open'), setOpen(it))}>
                  {it.photos[0] ? <Halftone src={photoUrl(it.photos[0])} alt={`${it.band} ${it.title}`.trim()} /> : <TeeArt n={it.serial} />}
                  {it.sold ? <span className="mo-stamp">Sold</span> : <span className="mo-sticker">1 of 1</span>}
                  <p className="mo-ino">#{certNo(it)}</p>
                  <p className="mo-iname">{it.band || 'Untitled'}</p>
                  <p className="mo-idesc">{[it.title, it.year].filter(Boolean).join(' · ') || 'Vintage band tee'}</p>
                  <Sizes size={it.size} />
                  <p className="mo-iprice">{it.sold ? 'Sold out' : s.sale_open && it.price_usd ? usd(it.price_usd) : 'Price 2027'}</p>
                  <span className="mo-btn small">Order info</span>
                </button>
              );
            })}
          </div>
        </section>

        <Events events={events} />

        <section className="mo-coupon" id="presale" aria-label="Order form">
          <p className="mo-cut" aria-hidden>
            ✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
          </p>
          <div className="mo-cbox">
            <div className="mo-cl">
              <h2>Order form</h2>
              <span className="mo-burst2" aria-hidden>
                Send no
                <br />
                money!
              </span>
              <p className="mo-ctag">Presale 2027 — free draw</p>
              <ol className="mo-steps">
                <li>
                  <b>1.</b> Fill in your email below.
                </li>
                <li>
                  <b>2.</b> Winners are drawn in 2027 with verifiable randomness on Solana.
                </li>
                <li>
                  <b>3.</b> Winners buy at a fixed price by card or Apple Pay.
                </li>
                <li>
                  <b>4.</b> Every tee ships with a provenance certificate.
                </li>
              </ol>
              <p className="mo-fine">Together with dealers in Los Angeles. No entry fee, no tokens to buy.</p>
            </div>
            <div className="mo-cr">
              <DrawForm itemId={null} />
            </div>
          </div>
        </section>

        <section className="mo-row">
          <div className="mo-box" id="provenance">
            <h2>Our guarantee</h2>
            <p>
              Every piece carries a permanent record: where it was found, which dealer it came through, and who owns it now. Records are written on Solana first, with XRP Ledger support to follow.
            </p>
            <p className="mo-seal" aria-hidden>
              100%
              <br />
              <small>Authentic</small>
            </p>
          </div>
          <div className="mo-box" id="contact">
            <h2>Write to us</h2>
            <p className="mo-addr">
              Gallery Crypto
              <br />
              Tokyo, Japan
            </p>
            <Contact email={s.email} />
          </div>
        </section>

        <footer className="mo-foot">
          <span>© Gallery Crypto. All pieces are one of a kind — when it&apos;s gone, it&apos;s gone.</span>
          <span>
            <a href="/privacy">Privacy</a>
            {s.sale_open && <a href="/legal">Legal notice</a>}
            {s.instagram && (
              <a href={s.instagram} target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
            )}
          </span>
        </footer>
      </div>

      {open && <Detail it={open} saleOpen={s.sale_open} onClose={() => setOpen(null)} />}
      <MusicBar />
    </div>
  );
}
