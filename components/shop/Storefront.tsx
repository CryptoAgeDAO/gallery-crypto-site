'use client';
// ショップ（EC 店舗の形）：告知バー → ヘッダー（全画面メニュー・検索・カート）→ 大きなスライドショー → 新着 → カテゴリ別 → 特集 → ショールームへの入口 → お問い合わせ → フッター。
// 商品をタップすると商品ページ（全画面）、カートは右から出る引き出し。サイトで公開した商品は自動で並ぶ。
import { useEffect, useMemo, useRef, useState } from 'react';
import { LangToggle, useLang } from '../Lang';
import BuyButton from '../BuyButton';
import { PROJECTS, EVENTS0 } from '@/lib/hub';
import { supabase } from '@/lib/supabase';
import { PUBLIC_ITEM_COLUMNS, type Item } from '@/lib/types';
import { sfx } from '@/lib/sfx';
import type { ShopItem } from './types';
import { toShop } from './toShop';
import { demoItems } from './demo';
import { cutout } from './pieceArt';
import HangRail, { type RailItem } from './HangRail';
import { kindOf } from './pieceArt';
import { SERIES } from '@/lib/catalog';
import { useCart, AddToCart } from '../cart/Cart';
import { lineOf } from '../cart/lineOf';
import { withColors } from './withColors';

const LKEY = 'gc-shop-local';
type Cat = 'all' | 'new' | 's-paint' | 's-record' | 's-fade' | 's-thrash' | 's-objects' | 'line' | 'tour' | 'vintage' | 'used' | 'tops' | 'outer' | 'bottoms' | 'head' | 'acc' | 'caps' | 'art' | 'archive';
type P = ShopItem & { src: string; cat: Cat[]; n: number; yen: number; lottery?: string };
const CATS: { k: Cat; en: string; ja: string }[] = [
  { k: 'new', en: 'New arrivals', ja: '新着' },
  ...SERIES.map((x) => ({ k: `s-${x.key}` as Cat, en: x.name, ja: x.name })),
  { k: 'line', en: 'Sample line', ja: '見本ライン' },
  { k: 'tour', en: 'Tour merch', ja: 'ツアーマーチ' },
  { k: 'vintage', en: 'Vintage', ja: 'ヴィンテージ' },
  { k: 'used', en: 'Used', ja: '古着' },
  { k: 'tops', en: 'Tops', ja: 'トップス' },
  { k: 'outer', en: 'Outerwear', ja: 'アウター' },
  { k: 'bottoms', en: 'Pants & shorts', ja: 'パンツ・ショーツ' },
  { k: 'head', en: 'Headwear', ja: '帽子' },
  { k: 'acc', en: 'Accessories & stickers', ja: '小物・ステッカー' },
  { k: 'caps', en: 'Caps & collabs', ja: 'キャップ・コラボ' },
  { k: 'art', en: 'Art & objects', ja: 'アート・オブジェ' },
  { k: 'archive', en: 'Archive', ja: 'アーカイブ' },
];
const num = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;

function catsOf(i: ShopItem): Cat[] {
  const p = PROJECTS.find((x) => x.id === i.pid);
  const c: Cat[] = [];
  if (i.line) { c.push('line', i.line); if (i.series) c.push(`s-${i.series}` as Cat); return c; }
  if (i.zone === 'rwa') c.push('caps');
  if (i.zone === 'art') c.push('art');
  if (i.zone === 'archive') c.push('archive', 'tops');
  if (p?.code.startsWith('GC-V')) c.push('vintage');
  if (p?.code.startsWith('GC-U')) c.push('used');
  if (p?.tour) c.push('tour');
  if (p?.draw) c.push(p.draw.kind === 'jacket' || p.draw.kind === 'denim' ? 'outer' : 'tops');
  if (i.buy === 'local' && i.zone === 'vintage') c.push('used', 'tops');
  return c;
}

export default function Storefront({ initial, saleOpen }: { initial: ShopItem[]; saleOpen: boolean }) {
  const { t, lang } = useLang();
  const J = lang === 'ja';
  const [real, setReal] = useState<ShopItem[]>(initial);
  const [local, setLocal] = useState<ShopItem[]>([]);
  const cartC = useCart(); const cart = cartC.lines.map((l) => l.id);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [cat, setCat] = useState<Cat | null>(null); // カテゴリ一覧ページ
  const [sort, setSort] = useState<'new' | 'low' | 'high'>('new');
  const [sub, setSub] = useState<Cat | null>(null); // シリーズの中の種類（トップス・パンツ…）
  const [dense, setDense] = useState(false); // 一覧の列数（大きく／小さく）
  const [pid, setPid] = useState<string | null>(null); // 商品ページ
  const [slide, setSlide] = useState(0);
  const [play, setPlay] = useState(true);
  const [ann, setAnn] = useState(0);

  useEffect(() => { try { setLocal(JSON.parse(localStorage.getItem(LKEY) || '[]')); } catch { /* 無視 */ } }, []);
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
    const read = () => { const h = new URLSearchParams(location.hash.slice(1)); setCat((h.get('c') as Cat) || null); setPid(h.get('p')); setSub(null); if (!h.get('p')) scrollTo({ top: 0 }); };
    read(); addEventListener('hashchange', read); return () => removeEventListener('hashchange', read);
  }, []);
  const nav = (c: Cat | null, p: string | null = null) => { const q = new URLSearchParams(); if (c) q.set('c', c); if (p) q.set('p', p); location.hash = q.toString(); setMenu(false); setSearch(null); if (!p) scrollTo({ top: 0 }); };

  const all: P[] = useMemo(() => {
    const lot = new Map<string, string>(); EVENTS0.filter((e) => e.kind === 'sale').forEach((e) => e.items.forEach((i) => lot.set('demo-' + i.id, J ? e.title[1] : e.title[0])));
    return [...local, ...real, ...(real.length ? [] : demoItems())].map((i, n) => ({ ...i, src: i.img || (i.pid ? cutout(i.pid) : ''), cat: ['all' as Cat, ...catsOf(i), ...(n < 6 ? ['new' as Cat] : [])], n, yen: num(i.price), lottery: lot.get(i.id) })).filter((i) => i.src);
  }, [local, real, J]);
  const byCat = (c: Cat) => all.filter((i) => i.cat.includes(c));
  // 色違いは一覧では1枚のカードにまとめ、色の点で切り替える
  const one = (xs: P[]) => { const seen = new Set<string>(); return xs.filter((x) => !x.group || (seen.has(x.group) ? false : (seen.add(x.group), true))); };
  const [pick, setPick] = useState<Record<string, string>>({});
  const product = all.find((i) => i.id === pid) || null;
  const rail = (i: P): RailItem => ({ ...i, kind: kindOf(i) });
  const railAll = useMemo(() => all.filter((i) => kindOf(i) === 'garment').slice(0, 14).map(rail), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  // 商品ページのレール：開いた一着と同じカテゴリのもの
  const railFor = useMemo(() => {
    if (!product) return [];
    // 同じ種類（服なら服、キャップならキャップ）を同じレールに
    const kd = kindOf(product);
    const same = product.tour ? all.filter((x) => x.tour) : all.filter((x) => x.id === product.id || (kindOf(x) === kd && (cat && cat !== 'all' && cat !== 'new' ? x.cat.includes(cat) : true)));
    const list = (same.length > 2 ? same : all).slice(0, 12);
    if (!list.some((x) => x.id === product.id)) list.unshift(product);
    return withColors(list, all, product.id).map(rail);
  }, [product, all, cat]); // eslint-disable-line react-hooks/exhaustive-deps

  // 告知バーとスライドショーの自動送り
  const ANN = [t('Drop 01 — sales open 2027', 'DROP 01 — 販売開始は2027年'), t('Every piece comes with a digital record', 'すべての商品にデジタル記録付き'), t('Card & Apple Pay checkout', 'カード・Apple Pay で決済')];
  useEffect(() => { if (!play) return; const h = setInterval(() => setAnn((a) => (a + 1) % 3), 3800); return () => clearInterval(h); }, [play]);
  const hero = useMemo(() => {
    const pick = (id: string) => all.find((i) => i.id === id) || all[0];
    return [
      { it: pick('demo-t1'), k: t('Tour merch', 'ツアーマーチ'), h: t('The On Record Tour — the back print is the shirt\'s own record', 'On Record Tour — 背中のプリントは、その一着の来歴'), c: 'tour' as Cat, bg: '#0d0d0e' },
      { it: pick('demo-r3'), k: t('New collab', '新作コラボ'), h: t('Numbered caps, recorded on chain', '番号入りのキャップ、記録はチェーンに'), c: 'caps' as Cat, bg: '#111' },
      { it: pick('demo-v3'), k: t('Vintage', 'ヴィンテージ'), h: t('One-of-one pieces, each with its history', '一点もの。それぞれに来歴を'), c: 'vintage' as Cat, bg: '#2b3a52' },
      { it: pick('demo-a1'), k: t('Art & objects', 'アート・オブジェ'), h: t('Prints and objects, one record per piece', '版画とオブジェも一点ずつ記録'), c: 'art' as Cat, bg: '#d9d4c7' },
    ].filter((s) => s.it);
  }, [all, t]);
  useEffect(() => { if (!play || !hero.length) return; const h = setInterval(() => setSlide((s) => (s + 1) % hero.length), 5200); return () => clearInterval(h); }, [play, hero.length]);
  // 商品ページを開いている間は後ろをスクロールさせない
  useEffect(() => { document.body.style.overflow = product || menu ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [product, menu]);

  const add = (id: string) => { const p = all.find((x) => x.id === id); if (p) cartC.add(lineOf(p)); };
  const catName = (c: Cat) => { const x = CATS.find((y) => y.k === c); return x ? (J ? x.ja : x.en) : t('All', 'すべて'); };

  const Card = ({ p: p0 }: { p: P }) => { const p = (p0.group && pick[p0.group] && all.find((x) => x.id === pick[p0.group!])) || p0; return (
    <a className="sf-card" href={`#${cat ? `c=${cat}&` : ''}p=${encodeURIComponent(p.id)}`} onClick={() => sfx('open')}>
      <span className={`sf-cimg ${p.img ? 'photo' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.src} alt="" loading="lazy" />
        {/* 指すと背中に切り替わる */}
        {p.back && <img className="sf-cback" src={p.back} alt="" loading="lazy" />}
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
      {p.series && <span className="sf-cser" style={{ ['--sc' as string]: SERIES.find((x) => x.key === p.series)?.accent }}>{SERIES.find((x) => x.key === p.series)?.name}</span>}
      <b>{p.title}</b>
      {p.group && (() => { const sib = all.filter((x) => x.group === p.group); return sib.length > 1 ? (
        <span className="sf-cdots" aria-label={t(`${sib.length} colours`, `${sib.length}色`)}>
          {sib.map((x) => <i key={x.id} role="button" aria-current={x.id === p.id} title={x.color} style={{ background: x.hex }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPick((m) => ({ ...m, [p.group!]: x.id })); }} onMouseEnter={() => setPick((m) => ({ ...m, [p.group!]: x.id }))} />)}
          <small>{sib.length} {t('colours', '色')}</small>
        </span>
      ) : null; })()}
      <span className="sf-csub">{p.sub}</span>
      <span className="sf-cprice">{p.price}</span>
 
    </a>
  ); };
  const Row = ({ title, c, items }: { title: string; c: Cat; items: P[] }) => items.length ? (
    <section className="sf-sec">
      <div className="sf-h"><h2>{title}</h2><a href={`#c=${c}`}>{t('View all', 'すべて見る')} →</a></div>
      <div className="sf-row">{one(items).slice(0, 10).map((p) => <Card key={p.id} p={p} />)}</div>
    </section>
  ) : null;

  const list = cat ? one([...byCat(cat)].filter((i) => !sub || i.cat.includes(sub))).sort((a, b) => (sort === 'low' ? a.yen - b.yen : sort === 'high' ? b.yen - a.yen : a.n - b.n)) : [];
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
          <button className="sf-cartb" onClick={() => cartC.open()} aria-label={t('Cart', 'カート')}><svg viewBox="0 0 24 24"><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>{cart.length > 0 && <i>{cart.length}</i>}</button>
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

          {/* シリーズ：ブランドの中の5つの系統。大きな名前と、その代表の3点 */}
          <section className="sf-series">
            <div className="sf-h"><h2>{t('The series', 'シリーズ')}</h2><span className="sf-fine">{t('Five lines inside Gallery Crypto — samples', 'Gallery Crypto の中の5つの系統 — 見本')}</span></div>
            <div className="sf-sergrid">
              {SERIES.map((x) => {
                const its = byCat(`s-${x.key}` as Cat);
                return its.length ? (
                  <a key={x.key} href={`#c=s-${x.key}`} className={`sf-ser ${x.key}`} style={{ background: x.bg, color: x.fg, ['--sa' as string]: x.accent }} onClick={() => sfx('open')}>
                    <span className="sf-sern">{x.name.split(' ').map((w) => <b key={w}>{w}</b>)}</span>
                    <span className="sf-serimgs">{its.slice(0, 3).map((it, k) => (/* eslint-disable-next-line @next/next/no-img-element */ <img key={it.id} src={it.src} alt="" loading="lazy" style={{ ['--k' as string]: k }} />))}</span>
                    <span className="sf-sert"><em>{J ? x.ja : x.en}</em><i>{its.length} {t('pieces', '点')} →</i></span>
                  </a>
                ) : null;
              })}
            </div>
          </section>

          {/* 一本のレール：押すと商品ページ（同じレールで、その一着が真ん中に寄る） */}
          <section className="sf-sec">
            <div className="sf-h"><h2>{t('On the rail', 'レールに掛かっているもの')}</h2><a href="/shop/rail">{t('Open the rail', 'レールを開く')} →</a></div>
          </section>
          <div className="sf-railsec"><HangRail mode="section" items={railAll} focusId={null} onFocus={(id) => id && nav(cat, id)} /></div>

          <Row title={t('This just in', '新着')} c="new" items={byCat('new')} />
          {byCat('line').length > 0 && (
            <section className="sf-promo line">
              <span><em>{t('Sample line', '見本ライン')}</em><b>{t(`${byCat('line').length} original pieces — tees to stickers`, `オリジナル${byCat('line').length}点 — Tシャツからステッカーまで`)}</b><small>{t('Samples of the Gallery Crypto line. Not for sale — sales open in 2027.', 'Gallery Crypto のラインの見本です。購入はできません（販売は2027年から）。')}</small></span>
              <a href="#c=line">{t('See all', 'すべて見る')} →</a>
            </section>
          )}

          {/* 特集：ツアーマーチ（黒地・太い文字・暗いレール） */}
          {byCat('tour').length > 0 && (
            <section className="sf-tour">
              <div className="sf-tour-h">
                <em>{t('Tour merch — sample', 'ツアーマーチ — 見本')}</em>
                <h2>ON RECORD<br />TOUR</h2>
                <p>{t('Tour shirts, recorded. The back reads like tour dates, but every stop is a moment in that shirt\'s own history — found, measured, recorded, tagged, sold.', '記録されたツアーシャツ。背中はツアー日程のように見えますが、並ぶのはその一着自身の来歴──見つけた日、採寸、記録、タグ、そして次の持ち主へ。')}</p>
                <a href="#c=tour" className="sf-tour-cta">{t('Shop the tour', 'ツアーマーチを見る')} →</a>
              </div>
              <div className="sf-tour-rail"><HangRail dark mode="section" items={byCat('tour').map(rail)} focusId={null} onFocus={(id) => id && nav('tour', id)} /></div>
            </section>
          )}

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
          <Row title={t('Pants & shorts', 'パンツ・ショーツ')} c="bottoms" items={byCat('bottoms')} />

          {/* 抽選販売の告知 */}
          <section className="sf-promo">
            <span><em>{t('Lottery sale', '抽選販売')}</em><b>{t('Collab caps — enter the draw', 'コラボキャップ — 抽選に申し込む')}</b><small>{t('Fair draw you can verify. Numbers, times and venues are assigned automatically.', '確かめられる公平な抽選。番号・時間・会場は自動で割り振り。')}</small></span>
            <a href="/#events">{t('Enter', '申し込む')} →</a>
          </section>

          <Row title={t('Caps & collabs', 'キャップ・コラボ')} c="caps" items={byCat('caps')} />
          <Row title={t('Headwear', '帽子')} c="head" items={byCat('head')} />
          <Row title={t('Accessories & stickers', '小物・ステッカー')} c="acc" items={byCat('acc')} />
          <Row title={t('Art & objects', 'アート・オブジェ')} c="art" items={byCat('art')} />

          {/* 別の見せ方への入口 */}
          <section className="sf-sec">
            <div className="sf-h"><h2>{t('Visit the showroom', 'ショールームへ')}</h2></div>
            <div className="sf-ways">
              <a href="/shop/rail" className="sf-way rail"><b>{t('The rail', 'レール')}</b><span>{t('Pieces hang on a real rack and swing like cloth; hover to pull one out', 'ラックに掛かった服が布のように揺れる。指すと一着が手前に回る')}</span></a>
              <a href="/shop/room" className="sf-way room"><b>{t('The showroom', 'ショールーム')}</b><span>{t('A simple white showroom in 3D: forms, a face-out wall, a folded-tee table, a pants rack, caps and a glass case', 'シンプルな白い3Dのショールーム：トルソー、フェイスアウトの壁、たたみのテーブル、パンツのラック、帽子の棚、ショーケース')}</span></a>
            </div>
          </section>

          <section className="sf-help">
            <b>{t('Questions about a piece?', '商品についてのご質問')}</b>
            <span>{t('Condition, measurements, provenance — ask us anything.', '状態・サイズ・来歴など、お気軽にどうぞ。')}</span>
            <a href="mailto:garellycrypto@gmail.com">{t('Contact', 'お問い合わせ')} →</a>
          </section>
        </main>
      ) : (
        <main className={`sf-list ${dense ? 'dense' : ''} ${cat.startsWith('s-') ? 'has-band' : ''}`}>
          {cat.startsWith('s-') && (() => { const x = SERIES.find((y) => `s-${y.key}` === cat); return x ? (
            <section className={`sf-band ${x.key}`} style={{ background: x.bg, color: x.fg, ['--sa' as string]: x.accent }}>
              <span className="sf-bandn">{x.name}</span>
              <span className="sf-bandt">{J ? x.ja : x.en}</span>
              <span className="sf-bandimgs">{byCat(cat as Cat).slice(0, 5).map((it, k) => (/* eslint-disable-next-line @next/next/no-img-element */ <img key={it.id} src={it.src} alt="" style={{ ['--k' as string]: k }} />))}</span>
            </section>
          ) : null; })()}
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
          <div className="sf-bar">
            {/* シリーズ */}
            <div className="sf-chips ser">{SERIES.map((x) => <a key={x.key} href={`#c=s-${x.key}`} aria-current={cat === `s-${x.key}`} style={{ ['--sa' as string]: x.accent }}><i />{x.name}</a>)}</div>
            {/* 種類で絞る */}
            <div className="sf-chips">
              {(['tops', 'outer', 'bottoms', 'head', 'acc'] as Cat[]).filter((c) => byCat(cat).some((i) => i.cat.includes(c))).length > 1 && <>
                <button aria-pressed={!sub} onClick={() => setSub(null)}>{t('All', 'すべて')}</button>
                {(['tops', 'outer', 'bottoms', 'head', 'acc'] as Cat[]).filter((c) => byCat(cat).some((i) => i.cat.includes(c))).map((c) => <button key={c} aria-pressed={sub === c} onClick={() => setSub(c)}>{catName(c)}</button>)}
              </>}
              <span className="sf-dens"><button aria-pressed={!dense} onClick={() => setDense(false)} aria-label={t('Large', '大きく')}>▢</button><button aria-pressed={dense} onClick={() => setDense(true)} aria-label={t('Small', '小さく')}>▦</button></span>
            </div>
          </div>
          <div className="sf-chips more">{CATS.filter((c) => !c.k.startsWith('s-')).map((c) => <a key={c.k} href={`#c=${c.k}`} aria-current={cat === c.k}>{J ? c.ja : c.en}</a>)}</div>
          <div className="sf-grid big">{list.map((p) => <Card key={p.id} p={p} />)}</div>
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
        <div className="sf-pdp hrp" role="dialog" aria-modal="true" aria-label={product.title}>
          {/* 上：一本のレール。開いた一着が真ん中に寄り、ほかは左右でぼける。左右の矢印・スワイプで隣の服へ */}
          <div className="sf-pstage">
            <HangRail solid items={railFor} focusId={product.id} onFocus={(id) => nav(cat, id)} renderBuy={(it) => {
              const p = all.find((x) => x.id === it.id)!;
              return (
                <>
                  {p.buy === 'stripe' && <BuyButton itemId={p.id} />}
                  {p.buy === 'sold' && <span className="hr-btn off">{t('Sold', '売約済み')}</span>}
                  {p.buy !== 'sold' && <AddToCart line={lineOf(p)} />}
                  {p.lottery && <a className="hr-btn ghost" href="/#events">{t('Enter the lottery', '抽選に申し込む')}</a>}
                </>
              );
            }} />
          </div>
          {/* 下へ読み進めても、いつでもカートに入れられる帯 */}
          <div className="sf-pbar">
            <span className={`sf-pbimg ${product.img ? 'photo' : ''}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={product.src} alt="" /></span>
            <span className="sf-pbt"><b>{product.title}</b><em>{product.price}{product.color ? ` · ${product.color}` : ''}</em></span>
            {product.buy === 'stripe' && <BuyButton itemId={product.id} />}
            {product.buy !== 'sold' && <AddToCart line={lineOf(product)} />}
            <button className="sf-pbcart" onClick={() => cartC.open()} aria-label={t('Open cart', 'カートを開く')}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>{cart.length > 0 && <i>{cart.length}</i>}
            </button>
          </div>
          <div className="sf-pinfo">
            <span className="sf-pcode">{product.code}{product.buy === 'demo' ? ` · ${t('Sample', '見本')}` : ''} · {product.sub}</span>
            {(product.buy === 'demo' || product.buy === 'local') && <p className="sf-fine">{t('Sample — not for sale. Sales open in 2027 (card / Apple Pay).', '見本のため購入はできません。販売は2027年から（カード／Apple Pay）。')}</p>}
            <details open><summary>{t('Description', '説明')}</summary><p>{J && product.pid ? PROJECTS.find((x) => x.id === product.pid)?.story[1] : product.desc}</p></details>
            {product.facts.length > 0 && <details open><summary>{t('Details', '詳細')}</summary><dl>{product.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></details>}
            <details><summary>{t('Digital record', 'デジタル記録')}</summary><p>{t('Each piece has its own record — photos, history and ownership — that you can check on its passport page.', '一点ごとに、写真・来歴・持ち主の記録があり、パスポートのページで確かめられます。')}</p>{product.passport && <a className="sf-link" href={product.passport}>{t('Open the passport', 'パスポートを開く')} →</a>}</details>
            <details><summary>{t('Shipping & returns', '配送・返品')}</summary><p>{t('Shipping and return terms will be published before sales open in 2027.', '配送と返品の条件は、2027年の販売開始までに公開します。')}</p></details>
            <div className="sf-more"><b>{t('You may also like', 'こちらもおすすめ')}</b><div className="sf-row small">{all.filter((x) => x.id !== product.id && x.cat.some((c) => c !== 'all' && c !== 'new' && product.cat.includes(c))).slice(0, 6).map((p) => <Card key={p.id} p={p} />)}</div></div>
          </div>
        </div>
      )}

    </div>
  );
}
