'use client';

import { useEffect, useState } from 'react';
import { supabase, photoUrl, modelUrl } from '@/lib/supabase';
import ModelViewerLazy from '@/components/ModelViewerLazy';
import { ERA_LABEL, certNo, usd, type GcEvent, type Item, type Settings } from '@/lib/types';
import Events from '@/components/Events';
import BuyButton from '@/components/BuyButton';
import { MusicBar, PlayButton } from '@/components/Music';
import { sfx } from '@/lib/sfx';
import { LangToggle, useLang } from '@/components/Lang';
import type { T } from '@/lib/i18n';
import GameHud, { hudBanner } from '@/components/GameHud';

// 公開サイト：白と黒だけ、装飾なし。論文のように番号つきの節で並べる（匿名性・静けさ・読みやすさ）。

type Props = { settings: Settings; items: Item[]; events?: GcEvent[]; sealed?: number[]; models?: Record<string, string>; demo?: boolean; configured: boolean };
type Status = { kind: 'idle' | 'busy' | 'ok' | 'err'; text?: string };

// 管理者への通知（失敗しても画面には影響させない）
function notify(kind: 'entry' | 'message', email: string) {
  fetch('/api/notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, email: email.trim() }), keepalive: true }).catch(() => {});
}

async function enter(email: string, itemId: string | null, t: T): Promise<Status> {
  const db = supabase();
  if (!db) return { kind: 'err', text: t('Entries are not open yet.', '応募はまだ受け付けていません。') };
  const { error } = await db.from('entries').insert({ email: email.trim().toLowerCase(), item_id: itemId });
  if (!error) {
    notify('entry', email);
    return { kind: 'ok', text: t('You are entered. Winners are drawn at the 2027 release (date TBA) and contacted by email.', '応募を受け付けました。当選者は2027年の発売時（日程は未定）に抽選し、メールでご連絡します。') };
  }
  if (error.code === '23505') return { kind: 'ok', text: t('You have already entered with this email.', 'このメールアドレスはすでに応募済みです。') };
  return { kind: 'err', text: t('Your entry could not be saved. Please try again in a moment.', '応募を保存できませんでした。少し時間をおいて、もう一度お試しください。') };
}

// 写真のない作品は、番号だけの無地の枠
function Photo({ src, alt, n }: { src?: string; alt: string; n: string }) {
  return <span className="mo-ph">{src ? <img src={src} alt={alt} loading="lazy" /> : <span className="mo-blank">{n}</span>}</span>;
}

function DrawForm({ itemId, label }: { itemId: string | null; label?: string }) {
  const { t } = useLang();
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
        const r = await enter(email, itemId, t);
        if (r.kind === 'ok') {
          sfx('coin');
          hudBanner(t('Entry confirmed', '応募完了'), t('You are in the 2027 draw', '2027年の抽選に参加しました'));
        }
        setSt(r);
      }}
    >
      <input className="hp" tabIndex={-1} aria-hidden="true" autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
      <label className="mo-line">
        <span>{t('Email', 'メール')}</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="mo-btn" type="submit" disabled={st.kind === 'busy'}>
        {st.kind === 'busy' ? t('Sending…', '送信中…') : label || t('Enter the free draw', '無料の抽選に応募する')}
      </button>
      <p className="mo-fine">
        {t('No purchase necessary. Your email is used only for the draw.', '購入は不要です。メールアドレスは抽選のためだけに使います。')} <a href="/privacy">{t('Privacy', 'プライバシー')}</a>
      </p>
      {st.kind === 'err' && <p className="mo-err">{st.text}</p>}
    </form>
  );
}

function Detail({ it, onClose, saleOpen, sealed, demo, model }: { it: Item; onClose: () => void; saleOpen: boolean; sealed: boolean; demo?: boolean; model?: string }) {
  const { t } = useLang();
  const [shot, setShot] = useState(0);
  // 3Dモデルがある作品は、最初から3Dで見せる
  const [view3d, setView3d] = useState(Boolean(model));
  const close = () => {
    sfx('close');
    onClose();
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  useEffect(() => { setShot(0); setView3d(Boolean(model)); }, [it.id, model]);
  const rows: [string, string][] = (
    [
      [t('Item no.', '作品番号'), certNo(it)],
      [t('Decade', '年代'), it.era === 'other' ? t('Other', 'その他') : ERA_LABEL[it.era] || ''],
      [t('Year', '年'), it.year],
      [t('Size', 'サイズ'), it.size ? it.size.toUpperCase() : ''],
      [t('Tag', 'タグ'), it.tag],
      [t('Stitch', '縫製'), it.stitch ? t('Single stitch', 'シングルステッチ') : ''],
      [t('Made in', '製造国'), it.made_in],
      [t('Condition', '状態'), it.cond],
      [t('Sourced from', '入手先'), it.dealer || t("Founder's collection", '創業者のコレクション')],
    ] as [string, string][]
  ).filter((r) => r[1]);
  return (
    <div className="modal mo-modal" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="mo-sheet" role="dialog" aria-modal="true" aria-label={it.band || 'Piece'}>
        <button className="mo-x" onClick={close} aria-label={t('Close', '閉じる')} autoFocus>
          ×
        </button>
        <div className="mo-dpic">
          {model && view3d ? (
            <div style={{ position: 'relative' }}>
              <ModelViewerLazy src={modelUrl(model)} />
              <span className="mv-badge">3D · 360°</span>
            </div>
          ) : (
            <Photo src={it.photos.length ? photoUrl(it.photos[shot] || it.photos[0]) : undefined} alt={`${it.band} ${it.title}`.trim()} n={certNo(it)} />
          )}
          {model && (
            <div className="mo-dview">
              <button type="button" aria-pressed={view3d} onClick={() => setView3d(true)}>{t('3D', '3D')}</button>
              <button type="button" aria-pressed={!view3d} onClick={() => setView3d(false)}>{t('Photos', '写真')}</button>
            </div>
          )}
          {!view3d && it.photos.length > 1 && (
            <div className="mo-thumbs">
              {it.photos.map((p, i) => (
                <button key={p} aria-label={`${t('Photo', '写真')} ${i + 1}`} aria-pressed={i === shot} onClick={() => setShot(i)}>
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mo-dinfo">
          <p className="gx-brief">{t('Briefing', 'ブリーフィング')}</p>
          <p className="mo-no">{demo ? t('Demo piece', 'デモ作品') : certNo(it)} · {t('1 of 1', '一点もの')}</p>
          <h2 className="mo-dh">{it.band || t('Untitled', '無題')}</h2>
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
              {t('Provenance passport →', '来歴パスポート →')}
            </a>
          )}
          {(it.audio_path || it.listen) && (
            <div className="mo-snd">
              {it.audio_path && <PlayButton it={it} />}
              {it.listen && (
                <a className="mo-btn ghost small" href={it.listen} target="_blank" rel="noopener noreferrer">
                  {t('Listen ↗', '試聴 ↗')}
                </a>
              )}
              {it.audio_path && it.audio_credit && <p className="mo-fine">{it.audio_credit}</p>}
            </div>
          )}
          <div className="mo-buy">
            {demo ? (
              <>
                <p className="mo-price">{t('Sample for the demonstration', 'デモ用の見本です')}</p>
                <a className="mo-btn" href="/demo">{t('Experience the demo →', 'デモを体験する →')}</a>
                <a className="mo-btn ghost small" href="/demo/3d">{t('View in 3D', '3Dで見る')}</a>
              </>
            ) : it.sold ? (
              <p className="mo-price">{t('Sold', '売約済み')}</p>
            ) : saleOpen && it.price_usd ? (
              <>
                <p className="mo-price">{usd(it.price_usd)}</p>
                <BuyButton itemId={it.id} />
              </>
            ) : (
              <>
                <p className="mo-price">{t('Release 2027 · date TBA', '2027年発売 · 日程未定')}</p>
                <DrawForm itemId={it.id} label={t('Enter the draw for this piece', 'この作品の抽選に応募する')} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Contact({ email }: { email: string }) {
  const { t } = useLang();
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
        if (!db) return setSt({ kind: 'err', text: t('The form is not open yet.', 'フォームはまだ受け付けていません。') });
        setSt({ kind: 'busy' });
        const { error } = await db.from('messages').insert({ name: f.name.trim(), email: f.email.trim(), body: f.body.trim() });
        if (!error) {
          notify('message', f.email);
          hudBanner(t('Message sent', '送信完了'), t('We will reply by email', 'メールでお返事します'));
        }
        setSt(error ? { kind: 'err', text: t('Your message could not be sent. Please try again in a moment.', '送信できませんでした。少し時間をおいて、もう一度お試しください。') } : { kind: 'ok', text: t('Thank you. Your message has been sent.', 'ありがとうございます。メッセージを送信しました。') });
      }}
    >
      <input className="hp" tabIndex={-1} aria-hidden="true" autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
      <label className="mo-line">
        <span>{t('Name', 'お名前')}</span>
        <input type="text" required maxLength={200} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <label className="mo-line">
        <span>{t('Email', 'メール')}</span>
        <input type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </label>
      <label className="mo-line tall">
        <span>{t('Message', 'メッセージ')}</span>
        <textarea required maxLength={5000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      </label>
      <button className="mo-btn" type="submit" disabled={st.kind === 'busy'}>
        {st.kind === 'busy' ? t('Sending…', '送信中…') : t('Send', '送信')}
      </button>
      {st.kind === 'err' && <p className="mo-err">{st.text}</p>}
      {email && <p className="mo-fine">{t(`Or write to ${email}.`, `または ${email} までご連絡ください。`)}</p>}
    </form>
  );
}

export default function Site({ settings: s, items, events = [], sealed = [], models = {}, demo = false }: Props) {
  const [open, setOpen] = useState<Item | null>(null);
  const { t, lang } = useLang();
  // 管理画面で変えていない（初期のままの）文言だけ日本語にする。変えた文言は入力したまま出す
  const def = (v: string, en: string, ja: string) => (lang === 'ja' && v === en ? ja : v);
  // 作品が少ないあいだは、番号だけの空き枠で列をそろえる
  const slots = Math.max(items.length, 3);
  const heroItem = items.find((i) => i.photos[0]);
  const hero = demo ? '/demo/hero.jpg' : heroItem ? photoUrl(heroItem.photos[0]) : '';

  return (
    <div className="mo gx">
      <GameHud
        sections={[
          { id: 'archive', label: t('Archive', 'アーカイブ'), goal: t('Pick a piece to open its briefing', '作品を選んでブリーフィングを開く') },
          ...(events.length ? [{ id: 'events', label: t('Events', 'イベント'), goal: t('Get a ticket for an event', 'イベントのチケットを取る') }] : []),
          { id: 'draw', label: t('Draw', '抽選'), goal: t('Enter the free draw', '無料の抽選に応募する') },
          { id: 'provenance', label: t('Provenance', '来歴'), goal: t('See how every piece is proven', '作品の証明のしくみを見る') },
          { id: 'contact', label: t('Contact', 'お問い合わせ'), goal: t('Send us a message', 'メッセージを送る') },
        ]}
        stats={[demo ? t('Demo', 'デモ') : t(`${items.length} pieces`, `${items.length}点`), s.sale_open ? t('Sale open', '販売中') : t('Draw open', '抽選受付中')]}
      />
      <div className="mo-page">
        <header className="mo-mast">
          <nav className="mo-nav l" aria-label="Collection">
            <a href="#archive">{t('Archive', 'アーカイブ')}</a>
            {events.length > 0 && <a href="#events">{t('Events', 'イベント')}</a>}
            <a href="#draw">{t('Draw', '抽選')}</a>
          </nav>
          <a className="mo-logo" href="/">Gallery Crypto</a>
          <nav className="mo-nav r" aria-label="House">
            <a href="/proof">{t('Provenance', '来歴')}</a>
            <a href="/demo">{t('Demo', 'デモ')}</a>
            <a href="#contact">{t('Contact', 'お問い合わせ')}</a>
            {s.instagram && (
              <a href={s.instagram} target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
            )}
            <LangToggle />
          </nav>
        </header>
      </div>

      <section className={`mo-hero${hero ? ' img' : ''}`} style={hero ? { backgroundImage: `url(${hero})` } : undefined}>
        <div className="mo-hero-in">
          <p className="mo-kicker">{def(s.launch, 'Release 2027 · Date TBA', '2027年発売 · 日程未定')}</p>
          <h1>{def(s.headline, "Founder's Archive", '創業者のアーカイブ')}</h1>
          <a className="mo-heroa" href="#archive"><kbd aria-hidden>E</kbd>{t('Explore the archive', 'アーカイブを見る')}</a>
          {demo && <a className="mo-herob" href="/demo">{t('Or try the provenance demo', '来歴のデモを試す')}</a>}
        </div>
      </section>

      <div className="mo-page">
        <p className="mo-intro">{def(s.lead, "A personal archive of American band tees from the '80s to the 2000s, collected over the years by the founder of Gallery Crypto. Every piece is recorded with its provenance, and the whole collection is released together in 2027 — date to be announced.", 'Gallery Crypto の創業者が長年かけて集めた、80年代から2000年代のアメリカのバンドTシャツの個人アーカイブです。一点ずつ来歴を記録し、2027年にまとめて発売します（日程は後日お知らせします）。')}</p>

        <section className="mo-sec" id="archive" aria-label="Archive">
          <h2 className="mo-sh">
            {t('The Archive', 'アーカイブ')}<span>{demo ? t('Demo — sample pieces, fictional bands', 'デモ — 見本の作品・架空のバンド') : items.length ? t(`${items.length} ${items.length === 1 ? 'piece' : 'pieces'}`, `${items.length}点`) : t('In preparation', '準備中')}</span>
          </h2>
          <div className="mo-grid">
            {Array.from({ length: slots }, (_, i) => {
              const it = items[i];
              if (!it)
                return (
                  <div key={`s${i}`} className="mo-item soon">
                    <Photo alt="" n={`GC-${String(i + 1).padStart(4, '0')}`} />
                    <p className="mo-ino"><span>GC-{String(i + 1).padStart(4, '0')}</span></p>
                    <p className="mo-idesc">{t('In preparation', '準備中')}</p>
                  </div>
                );
              return (
                <button key={it.id} className="mo-item" data-go={t('View', '見る')} onClick={() => (sfx('open'), setOpen(it))} aria-label={`${it.band} ${it.title}`}>
                  <Photo src={it.photos[0] ? photoUrl(it.photos[0]) : undefined} alt={`${it.band} ${it.title}`.trim()} n={certNo(it)} />
                  <p className="mo-ino">
                    <span>{demo ? t('Demo', 'デモ') : certNo(it)}</span>
                    <span>{it.sold ? t('Sold', '売約済み') : t('1 of 1', '一点もの')}</span>
                  </p>
                  <p className="mo-iname">{it.band || t('Untitled', '無題')}</p>
                  <p className="mo-idesc">{[it.title, it.year, it.size && it.size.toUpperCase()].filter(Boolean).join(' · ') || t('Vintage piece', 'ヴィンテージ')}</p>
                  {s.sale_open && it.price_usd && !it.sold && <p className="mo-idesc">{usd(it.price_usd)}</p>}
                </button>
              );
            })}
          </div>
        </section>

        <Events events={events} />

        <section className="mo-sec" id="draw" aria-label="Draw">
          <h2 className="mo-sh">
            {t('The Draw', '抽選')}<span>{t('Free · no purchase necessary', '無料 · 購入不要')}</span>
          </h2>
          <div className="mo-two">
            <ol className="mo-steps">
              <li>{t('Leave your email.', 'メールアドレスを登録します。')}</li>
              <li>{t('Winners are drawn at the 2027 release (date to be announced) with verifiable randomness.', '2027年の発売時（日程は後日お知らせ）に、誰でも確かめられる乱数で当選者を選びます。')}</li>
              <li>{t('Winners buy at a fixed price by card or Apple Pay.', '当選者は決まった価格で、カードまたは Apple Pay で購入できます。')}</li>
              <li>{t('Every piece ships with its provenance passport.', 'すべての作品に来歴パスポートが付きます。')}</li>
            </ol>
            <DrawForm itemId={null} />
          </div>
        </section>

        <section className="mo-sec" id="provenance" aria-label="Provenance">
          <h2 className="mo-sh">{t('Provenance', '来歴')}</h2>
          <div className="mo-two">
            <p className="mo-lead">
              {t('Every piece carries a permanent record: where it was found, which dealer it came through, and what happened to it since. Each record is signed twice, follows the EU Digital Product Passport, and can be checked by anyone — even without a blockchain, even offline.', 'すべての作品に、消えない記録が付きます。どこで見つかり、どのディーラーを経て、その後どうなったか。記録は二重に署名され、EUのデジタル製品パスポートに沿っていて、誰でも確かめられます。ブロックチェーンがなくても、オフラインでも。')}
            </p>
            <p className="mo-links">
              <a href="/proof">{t('See the proof →', '証明を見る →')}</a>
              <a href="/verify">{t('Verify a piece →', '作品を検証する →')}</a>
              <a href="/spec">{t('Read the specification →', '仕様書を読む →')}</a>
            </p>
          </div>
        </section>

        <section className="mo-sec" id="contact" aria-label="Contact">
          <h2 className="mo-sh">{t('Contact', 'お問い合わせ')}</h2>
          <div className="mo-two">
            <p className="mo-lead">{t('Gallery Crypto, Tokyo.', 'Gallery Crypto（東京）')}</p>
            <Contact email={s.email} />
          </div>
        </section>

        <footer className="mo-foot">
          <span>{t('© Gallery Crypto · Tokyo · Each piece is one of a kind.', '© Gallery Crypto · 東京 · すべて一点もの')}</span>
          <span>
            <a href="/privacy">{t('Privacy', 'プライバシー')}</a>
            {s.sale_open && <a href="/legal">{t('Legal notice', '特定商取引法に基づく表記')}</a>}
            <a href="/spec">{t('Specification', '仕様書')}</a>
          </span>
        </footer>
      </div>

      {open && <Detail it={open} demo={demo} saleOpen={s.sale_open} sealed={demo || sealed.includes(open.serial)} model={models[open.id]} onClose={() => setOpen(null)} />}
      <MusicBar />
    </div>
  );
}
