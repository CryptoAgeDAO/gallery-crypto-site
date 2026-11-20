'use client';
// ショップ（EC 店舗の形）：告知バー → ヘッダー（全画面メニュー・検索・カート）→ 大きなスライドショー → 新着 → カテゴリ別 → 特集 → ショールームへの入口 → お問い合わせ → フッター。
// 商品をタップすると商品ページ（全画面）、カートは右から出る引き出し。サイトで公開した商品は自動で並ぶ。
import { useEffect, useMemo, useRef, useState } from 'react';
import { LangToggle, useLang } from '../Lang';
import dynamic from 'next/dynamic';
import BuyButton from '../BuyButton';
import { PROJECTS, EVENTS0 } from '@/lib/hub';
import { supabase } from '@/lib/supabase';
import { PUBLIC_ITEM_COLUMNS, type Item } from '@/lib/types';
import { sfx } from '@/lib/sfx';
import type { ShopItem } from './types';
import { toShop } from './toShop';
import { demoItems } from './demo';
import { cutout } from './pieceArt';
const ParticlePiece = dynamic(() => import('../concept/ParticlePiece'), { ssr: false });

const LKEY = 'gc-shop-local', CKEY = 'gc-shop-cart';
type Cat = 'all' | 'new' | 'vintage' | 'used' | 'tops' | 'outer' | 'caps' | 'art' | 'archive';
type P = ShopItem & { src: string; cat: Cat[]; n: number; yen: number; lottery?: string };
const CATS: { k: Cat; en: string; ja: string }[] = [
  { k: 'new', en: 'New arrivals', ja: '新着' },
  { k: 'vintage', en: 'Vintage', ja: 'ヴィンテージ' },
  { k: 'used', en: 'Used', ja: '古着' },
  { k: 'tops', en: 'Tops', ja: 'トップス' },
  { k: 'outer', en: 'Outerwear', ja: 'アウター' },
  { k: 'caps', en: 'Caps & collabs', ja: 'キャップ・コラボ' },
  { k: 'art', en: 'Art & objects', ja: 'アート・オブジェ' },
  { k: 'archive', en: 'Archive', ja: 'アーカイブ' },
];
const num = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;

function catsOf(i: ShopItem): Cat[] {
  const p = PROJECTS.find((x) => x.id === i.pid);
  const c: Cat[] = [];
  if (i.zone === 'rwa') c.push('caps');
  if (i.zone === 'art') c.push('art');
  if (i.zone === 'archive') c.push('archive', 'tops');
  if (p?.code.startsWith('GC-V')) c.push('vintage');
  if (p?.code.startsWith('GC-U')) c.push('used');
  if (p?.draw) c.push(p.draw.kind === 'jacket' || p.draw.kind === 'denim' ? 'outer' : 'tops');
  if (i.buy === 'local' && i.zone === 'vintage') c.push('used', 'tops');
  return c;
}

export default function Storefront({ initial, saleOpen }: { initial: ShopItem[]; saleOpen: boolean }) {
  const { t, lang } = useLang();
  const J = lang === 'ja';
  const [real, setReal] = useState<ShopItem[]>(initial);
  const [local, setLocal] = useState<ShopItem[]>([]);
  const [cart, setCart] = useState<string[]>([]);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cat, setCat] = useState<Cat | null>(null); // カテゴリ一覧ページ
  const [sort, setSort] = useState<'new' | 'low' | 'high'>('new');
  const [pid, setPid] = useState<string | null>(null); // 商品ページ
  const [slide, setSlide] = useState(0);
  const [play, setPlay] = useState(true);
  const [ann, setAnn] = useState(0);

  useEffect(() => { try { setLocal(JSON.parse(localStorage.getItem(LKEY) || '[]')); setCart(JSON.parse(localStorage.getItem(CKEY) || '[]')); } catch { /* 無視 */ } }, []);
  useEffect(() => { try { localStorage.setItem(CKEY, JSON.stringify(cart)); } catch { /* 無視 */ } }, [cart]);
  useEffect(() => {
    const db = supabase();
    if (!db) return;
    const h = setInterval(async () => {
      const { data } = await db.from('items').select(PUBLIC_ITEM_COLUMNS).eq('published', true).order('serial', { ascending: false }).limit(60);
      if (data) setReal(((data as unknown) as Item[]).map((it) => toShop(it, saleOpen)));
    }, 20000);
    return () => clearInterval(h);
  }, [saleOpen]);
  // URL の #c=… / #p=… で一覧・商品ページを開く（戻るボタンでも戻れる）
  useEffect(() => {
    const read = () => { const h = new URLSearchParams(location.hash.slice(1)); setCat((h.get('c') as Cat) || null); setPid(h.get('p')); };
    read(); addEventListener('hashchange', read); return () => removeEventListener('hashchange', read);
  }, []);
  const nav = (c: Cat | null, p: string | null = null) => { const q = new URLSearchParams(); if (c) q.set('c', c); if (p) q.set('p', p); location.hash = q.toString(); setMenu(false); setSearch(null); if (!p) scrollTo({ top: 0 }); };

  const all: P[] = useMemo(() => {
    const lot = new Map<string, string>(); EVENTS0.filter((e) => e.kind === 'sale').forEach((e) => e.items.forEach((i) => lot.set('demo-' + i.id, J ? e.title[1] : e.title[0])));
    return [...local, ...real, ...(real.length ? [] : demoItems())].map((i, n) => ({ ...i, src: i.img || (i.pid ? cutout(i.pid) : ''), cat: ['all' as Cat, ...catsOf(i), ...(n < 6 ? ['new' as Cat] : [])], n, yen: num(i.price), lottery: lot.get(i.id) })).filter((i) => i.src);
  }, [local, real, J]);
  const byCat = (c: Cat) => all.filter((i) => i.cat.includes(c));
  const product = all.find((i) => i.id === pid) || null;
  const inCart = all.filter((i) => cart.includes(i.id));

  // 告知バーとスライドショーの自動送り
  const ANN = [t('Drop 01 — sales open 2027', 'DROP 01 — 販売開始は2027年'), t('Every piece comes with a digital record', 'すべての商品にデジタル記録付き'), t('Card & Apple Pay checkout', 'カード・Apple Pay で決済')];
  useEffect(() => { if (!play) return; const h = setInterval(() => setAnn((a) => (a + 1) % 3), 3800); return () => clearInterval(h); }, [play]);
  const hero = useMemo(() => {
    const pick = (id: string) => all.find((i) => i.id === id) || all[0];
    return [
      { it: pick('demo-r3'), k: t('New collab', '新作コラボ'), h: t('Numbered caps, recorded on chain', '番号入りのキャップ、記録はチェーンに'), c: 'caps' as Cat, bg: '#111' },
      { it: pick('demo-v3'), k: t('Vintage', 'ヴィンテージ'), h: t('One-of-one pieces, each with its history', '一点もの。それぞれに来歴を'), c: 'vintage' as Cat, bg: '#2b3a52' },
      { it: pick('demo-a1'), k: t('Art & objects', 'アート・オブジェ'), h: t('Prints and objects, one record per piece', '版画とオブジェも一点ずつ記録'), c: 'art' as Cat, bg: '#d9d4c7' },
    ].filter((s) => s.it);
  }, [all, t]);
  useEffect(() => { if (!play || !hero.length) return; const h = setInterval(() => setSlide((s) => (s + 1) % hero.length), 5200); return () => clearInterval(h); }, [play, hero.length]);
  // 商品ページを開いている間は後ろをスクロールさせない
  useEffect(() => { document.body.style.overflow = product || menu || cartOpen ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [product, menu, cartOpen]);

  const add = (id: string) => { setCart((c) => (c.includes(id) ? c : [...c, id])); sfx('coin'); setCartOpen(true); };
  const catName = (c: Cat) => { const x = CATS.find((y) => y.k === c); return x ? (J ? x.ja : x.en) : t('All', 'すべて'); };

  const Card = ({ p }: { p: P }) => (
    <a className="sf-card" href={`#${cat ? `c=${cat}&` : ''}p=${encodeURIComponent(p.id)}`} onClick={() => sfx('open')}>
      <span className={`sf-cimg ${p.img ? 'photo' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.src} alt="" loading="lazy" />
        {p.buy === 'demo' && <em className="sf-tag">{t('Sample', '見本')}</em>}
        {p.lottery && <em className="sf-tag lot">{t('Lottery', '抽選')}</em>}
        {p.buy === 'sold' && <em className="sf-tag sold">{t('Sold', '売約済み')}</em>}
        {p.buy === 'demo' || p.buy === 'local' ? (
          <span className="sf-quick" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <small>{t('Quick add', 'クイック追加')}</small>
            {(() => { const sz = (p.facts.find((f) => f[0] === 'Size')?.[1] || '').split(/[\s—]/)[0]; return <button onClick={() => add(p.id)}>{cart.includes(p.id) ? '✓' : sz || 'ONE SIZE'}</button>; })()}
          </span>
        ) : <span className="sf-quick">{t('Quick view', 'くわしく見る')}</span>}
      </span>
      <b>{p.title}</b>
      <span className="sf-csub">{p.sub}</span>
      <span className="sf-cprice">{p.price}</span>
    </a>
  );
  const Row = ({ title, c, items }: { title: string; c: Cat; items: P[] }) => items.length ? (
    <section className="sf-sec">
      <div className="sf-h"><h2>{title}</h2><a href={`#c=${c}`}>{t('View all', 'すべて見る')} →</a></div>
      <div className="sf-row">{items.slice(0, 10).map((p) => <Card key={p.id} p={p} />)}</div>
    </section>
  ) : null;

  const list = cat ? [...byCat(cat)].sort((a, b) => (sort === 'low' ? a.yen - b.yen : sort === 'high' ? b.yen - a.yen : a.n - b.n)) : [];
  const found = search !== null && search.trim() ? all.filter((i) => (i.title + ' ' + i.sub + ' ' + i.code).toLowerCase().includes(search.trim().toLowerCase())) : [];

  return (
    <div className="sf kx" translate="no">
      <div className="sf-ann">
        <span key={ann}>{ANN[ann]}</span>
        <button onClick={() => setPlay((v) => !v)} aria-label={play ? t('Pause', '一時停止') : t('Play', '再生')}>{play ? '❚❚' : '▶'}</button>
      </div>
      <header className="sf-top">
        <button className="sf-ico" onClick={() => setMenu(true)} aria-label={t('Menu', 'メニュー')}><i /><i /><i /></button>
        <a className="sf-logo" href="/shop" onClick={() => nav(null)}>GALLERY CRYPTO</a>
        <span className="sf-tools">
          <button onClick={() => setSearch('')} aria-label={t('Search', '検索')}><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg></button>
          <button className="sf-cartb" onClick={() => setCartOpen(true)} aria-label={t('Cart', 'カート')}><svg viewBox="0 0 24 24"><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>{cart.length > 0 && <i>{cart.length}</i>}</button>
        </span>
        <nav className="sf-cats">{CATS.map((c) => <a key={c.k} href={`#c=${c.k}`} aria-current={cat === c.k}>{J ? c.ja : c.en}</a>)}<a href="/#events">{t('Lottery', '抽選')}</a></nav>
      </header>

      {!cat ? (
        <main>
          {/* スライドショー */}
          <section className="sf-hero">
            {hero.map((s, i) => (
              <a key={s.k} href={`#c=${s.c}`} className={`sf-slide ${i === slide ? 'on' : ''}`} style={{ background: s.bg, color: s.bg === '#d9d4c7' ? '#111' : '#fff' }} aria-hidden={i !== slide}>
                <span className="sf-stx"><em>{s.k}</em><b>{s.h}</b><span className="sf-cta">{t('Shop now', '見る')} →</span></span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.it.src} alt="" className={s.it.img ? 'photo' : ''} />
              </a>
            ))}
            <div className="sf-dots">{hero.map((s, i) => <button key={s.k} aria-label={s.k} aria-pressed={i === slide} onClick={() => setSlide(i)} />)}</div>
          </section>

          <Row title={t('This just in', '新着')} c="new" items={byCat('new')} />

          {/* 2枚並びのキャンペーン */}
          <section className="kx-split">
            {([['vintage', '#c9c3b6', t('Vintage', 'ヴィンテージ'), t('One of one, with its history', '一点もの、来歴とともに')], ['art', '#1d1d1d', t('Art & objects', 'アート・オブジェ'), t('One record per piece', '一点ずつ記録')]] as [Cat, string, string, string][]).map(([c, bg, h, sub]) => {
              const p = byCat(c)[0];
              return p ? (
                <a key={c} href={`#c=${c}`} className="kx-camp" style={{ background: bg, color: bg === '#1d1d1d' ? '#fff' : '#111' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt="" className={p.img ? 'photo' : ''} />
                  <span><b>{h}</b><small>{sub}</small><em>{t('Shop now', '見る')}</em></span>
                </a>
              ) : null;
            })}
          </section>

          {/* 特集のタイル */}
          <section className="sf-sec">
            <div className="sf-h"><h2>{t('Shop by category', 'カテゴリから探す')}</h2></div>
            <div className="sf-tiles">
              {(['vintage', 'used', 'caps', 'art'] as Cat[]).map((c) => {
                const p = byCat(c)[0];
                return p ? (
                  <a key={c} href={`#c=${c}`} className="sf-tile">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt="" className={p.img ? 'photo' : ''} />
                    <b>{catName(c)}</b><span>{byCat(c).length} {t('pieces', '点')}</span>
                  </a>
                ) : null;
              })}
            </div>
          </section>

          <Row title={t('Tops', 'トップス')} c="tops" items={byCat('tops')} />
          <Row title={t('Outerwear', 'アウター')} c="outer" items={byCat('outer')} />

          {/* 抽選販売の告知 */}
          <section className="sf-promo">
            <span><em>{t('Lottery sale', '抽選販売')}</em><b>{t('Collab caps — enter the draw', 'コラボキャップ — 抽選に申し込む')}</b><small>{t('Fair draw you can verify. Numbers, times and venues are assigned automatically.', '確かめられる公平な抽選。番号・時間・会場は自動で割り振り。')}</small></span>
            <a href="/#events">{t('Enter', '申し込む')} →</a>
          </section>

          <Row title={t('Caps & collabs', 'キャップ・コラボ')} c="caps" items={byCat('caps')} />
          <Row title={t('Art & objects', 'アート・オブジェ')} c="art" items={byCat('art')} />

          {/* 別の見せ方への入口 */}
          <section className="sf-sec">
            <div className="sf-h"><h2>{t('Visit the showroom', 'ショールームへ')}</h2></div>
            <div className="sf-ways">
              <a href="/shop/rail" className="sf-way rail"><b>{t('The rail', 'レール')}</b><span>{t('Pieces hang on a real rack and swing like cloth; hover to pull one out', 'ラックに掛かった服が布のように揺れる。指すと一着が手前に回る')}</span></a>
              <a href="/shop/room" className="sf-way room"><b>{t('The showroom', 'ショールーム')}</b><span>{t('Walk a raw pop-up store in 3D: framed pieces, a long table, a bike in the middle', '3Dのポップアップストアを歩く：額装の作品、長いテーブル、真ん中にバイク')}</span></a>
            </div>
          </section>

          <section className="sf-help">
            <b>{t('Questions about a piece?', '商品についてのご質問')}</b>
            <span>{t('Condition, measurements, provenance — ask us anything.', '状態・サイズ・来歴など、お気軽にどうぞ。')}</span>
            <a href="mailto:garellycrypto@gmail.com">{t('Contact', 'お問い合わせ')} →</a>
          </section>
        </main>
      ) : (
        <main className="sf-list">
          <div className="sf-crumb"><a href="#" onClick={(e) => { e.preventDefault(); nav(null); }}>{t('Shop', 'ショップ')}</a> / {catName(cat)}</div>
          <div className="sf-lh">
            <h1>{catName(cat)}</h1>
            <span>{list.length} {t('pieces', '点')}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t('Sort', '並び替え')}>
              <option value="new">{t('Newest', '新着順')}</option>
              <option value="low">{t('Price: low to high', '価格の安い順')}</option>
              <option value="high">{t('Price: high to low', '価格の高い順')}</option>
            </select>
          </div>
          <div className="sf-chips">{CATS.map((c) => <a key={c.k} href={`#c=${c.k}`} aria-current={cat === c.k}>{J ? c.ja : c.en}</a>)}</div>
          <div className="sf-grid">{list.map((p) => <Card key={p.id} p={p} />)}</div>
          {!list.length && <p className="sf-fine">{t('Nothing here yet.', 'まだありません。')}</p>}
        </main>
      )}

      <footer className="sf-foot">
        <div>
          <b>GALLERY CRYPTO</b>
          <span>{t('Tokyo · Launching 2027', '東京 · 2027年始動')}</span>
        </div>
        <div><b>{t('Shop', 'ショップ')}</b>{CATS.slice(0, 6).map((c) => <a key={c.k} href={`#c=${c.k}`}>{J ? c.ja : c.en}</a>)}</div>
        <div><b>{t('Help', 'ヘルプ')}</b><a href="mailto:garellycrypto@gmail.com">{t('Contact', 'お問い合わせ')}</a><a href="/privacy">{t('Privacy', 'プライバシー')}</a><a href="/legal">{t('Legal notice', '特定商取引法に基づく表記')}</a><a href="/verify">{t('Verify a piece', '商品の記録を確かめる')}</a></div>
        <div><b>{t('Payment', 'お支払い')}</b><span>{t('Card · Apple Pay', 'カード · Apple Pay')}</span><LangToggle /></div>
        <p className="sf-fine">{t('Demo. Samples are fictional and not for sale; sales open in 2027.', 'デモ版。見本は架空の商品で、購入はできません。販売は2027年から。')}</p>
      </footer>

      {/* 全画面メニュー */}
      {menu && (
        <div className="sf-menu" role="dialog" aria-modal="true">
          <button className="sf-x" onClick={() => setMenu(false)} aria-label={t('Close', '閉じる')}>×</button>
          <nav>
            {CATS.map((c, i) => <a key={c.k} href={`#c=${c.k}`} onClick={() => setMenu(false)} style={{ ['--i' as string]: i }}>{J ? c.ja : c.en}<small>{byCat(c.k).length}</small></a>)}
            <a href="/#events" style={{ ['--i' as string]: 8 }}>{t('Lottery & events', '抽選・イベント')}</a>
            <a href="/shop/rail" style={{ ['--i' as string]: 9 }}>{t('The rail', 'レール')}</a>
            <a href="/shop/room" style={{ ['--i' as string]: 9 }}>{t('The showroom', 'ショールーム')}</a>
            <a href="/" style={{ ['--i' as string]: 11 }}>{t('Gallery Crypto home', 'Gallery Crypto トップ')}</a>
          </nav>
        </div>
      )}

      {/* 検索 */}
      {search !== null && (
        <div className="sf-search" role="dialog" aria-modal="true">
          <div className="sf-sbar">
            <input autoFocus type="search" placeholder={t('Search pieces', '商品を検索')} value={search} onChange={(e) => setSearch(e.target.value)} />
            <button onClick={() => setSearch(null)} aria-label={t('Close', '閉じる')}>×</button>
          </div>
          <div className="sf-grid">{found.map((p) => <Card key={p.id} p={p} />)}</div>
          {search.trim() && !found.length && <p className="sf-fine">{t('No results.', '見つかりませんでした。')}</p>}
        </div>
      )}

      {/* 商品ページ */}
      {product && (
        <div className="sf-pdp cxp" role="dialog" aria-modal="true" aria-label={product.title}>
          <button className="sf-x" onClick={() => nav(cat)} aria-label={t('Close', '閉じる')}>×</button>
          <div className="sf-pimgs">
            {/* コンセプトページと同じ「光の粒」から、本物の絵（写真）が浮かび上がる */}
            <ParticlePiece key={product.id} src={product.src} photo={!!product.img} reveal className="sf-pmain" />
            <p className="sf-phint">{t('Move over the piece — the light parts around it.', '服の上を指やカーソルでなぞると、光の粒がよけます。')}</p>
          </div>
          <div className="sf-pinfo">
            <span className="sf-pcode">{product.code}{product.buy === 'demo' ? ` · ${t('Sample', '見本')}` : ''}</span>
            <h1>{product.title}</h1>
            <span className="sf-psub">{product.sub}</span>
            <b className="sf-pprice">{product.price}</b>
            <div className="sf-pbuy">
              {product.buy === 'stripe' && <BuyButton itemId={product.id} />}
              {product.buy === 'sold' && <span className="sf-fine">{t('Sold', '売約済み')}</span>}
              {(product.buy === 'demo' || product.buy === 'local') && <button className="sf-btn" onClick={() => add(product.id)}>{cart.includes(product.id) ? t('In your cart ✓', 'カートに入っています ✓') : t('Add to cart', 'カートに入れる')}</button>}
              {product.lottery && <a className="sf-btn ghost" href="/#events">{t('Enter the lottery', '抽選に申し込む')} — {product.lottery}</a>}
              {(product.buy === 'demo' || product.buy === 'local') && <p className="sf-fine">{t('Sample — not for sale. Sales open in 2027 (card / Apple Pay).', '見本のため購入はできません。販売は2027年から（カード／Apple Pay）。')}</p>}
            </div>
            <details open><summary>{t('Description', '説明')}</summary><p>{J && product.pid ? PROJECTS.find((x) => x.id === product.pid)?.story[1] : product.desc}</p></details>
            {product.facts.length > 0 && <details open><summary>{t('Details', '詳細')}</summary><dl>{product.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></details>}
            <details><summary>{t('Digital record', 'デジタル記録')}</summary><p>{t('Each piece has its own record — photos, history and ownership — that you can check on its passport page.', '一点ごとに、写真・来歴・持ち主の記録があり、パスポートのページで確かめられます。')}</p>{product.passport && <a className="sf-link" href={product.passport}>{t('Open the passport', 'パスポートを開く')} →</a>}</details>
            <details><summary>{t('Shipping & returns', '配送・返品')}</summary><p>{t('Shipping and return terms will be published before sales open in 2027.', '配送と返品の条件は、2027年の販売開始までに公開します。')}</p></details>
            <div className="sf-more"><b>{t('You may also like', 'こちらもおすすめ')}</b><div className="sf-row small">{all.filter((x) => x.id !== product.id && x.cat.some((c) => c !== 'all' && c !== 'new' && product.cat.includes(c))).slice(0, 6).map((p) => <Card key={p.id} p={p} />)}</div></div>
          </div>
        </div>
      )}

      {/* カート（右から） */}
      {cartOpen && <div className="sf-dim" onClick={() => setCartOpen(false)} />}
      <aside className={`sf-cart cxp ${cartOpen ? 'on' : ''}`} aria-hidden={!cartOpen}>
        <div className="sf-ch"><b>{t('Cart', 'カート')} ({cart.length})</b><button onClick={() => setCartOpen(false)} aria-label={t('Close', '閉じる')}>×</button></div>
        {!inCart.length && <p className="sf-fine">{t('Your cart is empty.', 'カートは空です。')}</p>}
        {inCart.map((p) => (
          <div key={p.id} className="sf-line">
            <span className={`sf-limg ${p.img ? 'photo' : ''}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={p.src} alt="" /></span>
            <span><b>{p.title}</b><small>{p.sub}</small><em>{p.price}</em></span>
            <button onClick={() => setCart((c) => c.filter((x) => x !== p.id))}>{t('Remove', '削除')}</button>
          </div>
        ))}
        {inCart.length > 0 && <div className="sf-sum"><span>{t('Subtotal', '小計')}</span><b>¥{inCart.reduce((a, p) => a + p.yen, 0).toLocaleString('ja-JP')}</b></div>}
        {inCart.filter((p) => p.buy === 'stripe').map((p) => <BuyButton key={p.id} itemId={p.id} label={t(`Checkout — ${p.title}`, `${p.title} を購入`)} />)}
        {inCart.some((p) => p.buy !== 'stripe') && <p className="sf-fine">{t('Samples cannot be bought. Checkout opens with sales in 2027.', '見本は購入できません。決済は2027年の販売開始とともに始まります。')}</p>}
      </aside>
    </div>
  );
}
