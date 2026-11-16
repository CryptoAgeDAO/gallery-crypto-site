'use client';
// ショップ：服がレールに掛かっていて、横にスライドすると一着ずつ正面に回ってくる。正面の一着をタップすると購入画面。
// 「LINEUP」に切り替えると、作品が横一列に立ち、中央だけがくっきり見える並びになる。
// サイトで公開した商品は自動でレールに掛かる（20秒ごとに取り直し）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LangToggle, useLang } from '../Lang';
import { ProjectPic } from '../HubArt';
import BuyButton from '../BuyButton';
import { PROJECTS } from '@/lib/hub';
import { supabase } from '@/lib/supabase';
import { PUBLIC_ITEM_COLUMNS, type Item } from '@/lib/types';
import { sfx } from '@/lib/sfx';
import type { ShopItem } from './types';
import { toShop } from './toShop';
import { demoItems, shrink } from './ShopClient';

const LKEY = 'gc-shop-local', CKEY = 'gc-shop-cart';
type Kind = 'garment' | 'cap' | 'art';
type View = 'rail' | 'lineup';

// 見本の図を、背景なし（切り抜き）で
function cutout(pid: string) {
  const p = PROJECTS.find((x) => x.id === pid);
  if (!p) return '';
  let m = renderToStaticMarkup(<ProjectPic p={p} />).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="660" ');
  if (p.draw) m = m.replace(/<rect width="240" height="220" fill="[^"]+"(?:\/>|><\/rect>)/, '').replace(/<ellipse[^>]*(?:\/>|><\/ellipse>)/, '');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m);
}
const kindOf = (i: ShopItem): Kind => (i.zone === 'art' ? 'art' : i.zone === 'rwa' || /cap/i.test(i.sub) ? 'cap' : 'garment');

// 位置（小数）→ 見た目。d = その商品の位置 − いま正面の位置
function railStyle(d: number, w: number): React.CSSProperties {
  const a = Math.abs(d), s = Math.sign(d);
  const A = w * 0.62, B = Math.max(26, w * 0.13);
  const x = a < 1 ? d * A : s * (A + (a - 1) * B);
  const ry = -Math.max(-1, Math.min(1, d)) * 72;
  const z = -Math.min(a, 1) * 70 - Math.max(0, a - 1) * 4;
  // 3D の入れ子（preserve-3d）や filter は iPhone の Safari で消えることがあるので、要素ごとの perspective だけで回す
  return { transform: `translateX(${x}px) perspective(1400px) rotateY(${ry}deg) scale(${1 + z / 1400})`, zIndex: 1000 - Math.round(a * 10), opacity: a > 0.5 ? 1 - Math.min(0.25, (a - 0.5) * 0.04) : 1 };
}
function lineStyle(d: number, w: number): React.CSSProperties {
  const a = Math.min(Math.abs(d), 3);
  return { transform: `translateX(${d * w * 0.78}px) scale(${1 - a * 0.16})`, opacity: Math.max(0, 1 - a * 0.36), filter: a > 0.08 ? `blur(${a * 3.2}px)` : undefined, zIndex: 100 - Math.round(a * 10) };
}

export default function RailShop({ initial, saleOpen }: { initial: ShopItem[]; saleOpen: boolean }) {
  const { t, lang } = useLang();
  const [real, setReal] = useState<ShopItem[]>(initial);
  const [local, setLocal] = useState<ShopItem[]>([]);
  const [cart, setCart] = useState<string[]>([]);
  const [view, setView] = useState<View>('rail');
  const [pos, setPos] = useState(0); // 表示中の位置（なめらかに動く）
  const tgt = useRef(0); // 目標の位置
  const posR = useRef(0);
  const [open, setOpen] = useState<string | null>(null);
  const [panel, setPanel] = useState<'' | 'cart' | 'add'>('');
  const [w, setW] = useState(420);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => { try { setLocal(JSON.parse(localStorage.getItem(LKEY) || '[]')); setCart(JSON.parse(localStorage.getItem(CKEY) || '[]')); } catch { /* 無視 */ } }, []);
  useEffect(() => { try { localStorage.setItem(LKEY, JSON.stringify(local)); } catch { /* 容量 */ } }, [local]);
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

  const all = useMemo(() => [...local, ...real, ...(real.length ? [] : demoItems())].map((i) => ({ ...i, src: i.img || (i.pid ? cutout(i.pid) : ''), kind: kindOf(i) })).filter((i) => i.src), [local, real]);
  const n = all.length;
  const idx = Math.max(0, Math.min(n - 1, Math.round(pos)));
  const cur = all[idx];
  const item = all.find((i) => i.id === open) || null;

  // 大きさ（1着の幅）
  useEffect(() => {
    const r = () => setW(Math.max(220, Math.min(520, (stage.current?.clientWidth || 800) * (innerWidth < 720 ? 0.62 : 0.3))));
    r(); addEventListener('resize', r); return () => removeEventListener('resize', r);
  }, []);
  // なめらかに目標へ
  useEffect(() => {
    let raf = 0;
    const tick = () => { const p = posR.current, g = tgt.current; const nx = Math.abs(g - p) < 0.001 ? g : p + (g - p) * 0.14; if (nx !== p) { posR.current = nx; setPos(nx); } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);
  const go = (k: number) => { const v = Math.max(0, Math.min(n - 1, k)); if (Math.round(tgt.current) !== v) sfx('tick'); tgt.current = v; };
  useEffect(() => { if (tgt.current > n - 1) go(n - 1); }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  // キー
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return;
      if (e.key === 'ArrowRight') go(Math.round(tgt.current) + 1);
      if (e.key === 'ArrowLeft') go(Math.round(tgt.current) - 1);
      if (e.key === 'Enter' && !open && all[Math.round(tgt.current)]) setOpen(all[Math.round(tgt.current)].id);
      if (e.key === 'Escape') { setOpen(null); setPanel(''); }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  // スライド（ドラッグ・スワイプ・ホイール）
  const drag = useRef<{ x: number; p: number; moved: boolean } | null>(null);
  const dragged = useRef(false); // スライドした直後のタップは「選ぶ」にしない
  const wheelT = useRef<number | undefined>(undefined);
  const onWheel = (e: React.WheelEvent) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    tgt.current = Math.max(-0.3, Math.min(n - 0.7, tgt.current + d * 0.006));
    clearTimeout(wheelT.current); wheelT.current = window.setTimeout(() => go(Math.round(tgt.current)), 140);
  };

  const add = (id: string) => { setCart((c) => (c.includes(id) ? c : [...c, id])); sfx('coin'); };
  const inCart = all.filter((i) => cart.includes(i.id));
  const pad2 = (v: number) => String(v).padStart(2, '0');
  const story = (i: (typeof all)[number]) => (lang === 'ja' && i.pid ? PROJECTS.find((p) => p.id === i.pid)?.story[1] : i.desc);

  return (
    <div className={`rs ${view}`} translate="no">
      <header className="rs-top">
        <div className="rs-row1">
          <a href="/">[ {t('About', 'サイト')} ]</a>
          <a href="/shop" className="rs-logo">GALLERY CRYPTO</a>
          <span className="rs-r">
            <a href="/shop/room">[ 3D ROOM ]</a>
            <button onClick={() => setPanel(panel === 'add' ? '' : 'add')}>[ {t('Add piece', '入荷')} ]</button>
            <button onClick={() => setPanel(panel === 'cart' ? '' : 'cart')}>[ CART {pad2(cart.length)} ]</button>
          </span>
        </div>
        <div className="rs-row2">
          <span>{t('Only at Gallery Crypto', 'GALLERY CRYPTO 限定')}</span>
          <span>DROP 01 — {pad2(n)} PIECES</span>
          <span className="rs-views">
            <button aria-pressed={view === 'rail'} onClick={() => setView('rail')}>RAIL</button>
            <button aria-pressed={view === 'lineup'} onClick={() => setView('lineup')}>LINEUP</button>
          </span>
          <span className="rs-hide-s">{t('One of one / recorded', '一点もの / 記録付き')}</span>
          <span className="rs-hide-s"><LangToggle /></span>
          <span>EST. 2027</span>
        </div>
      </header>

      <main
        className="rs-stage" ref={stage}
        onWheel={onWheel}
        onPointerDown={(e) => { drag.current = { x: e.clientX, p: tgt.current, moved: false }; }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 5) d.moved = true; if (d.moved) tgt.current = Math.max(-0.4, Math.min(n - 0.6, d.p - dx / (view === 'rail' ? w * 0.45 : w * 0.7))); }}
        onPointerUp={() => { const d = drag.current; drag.current = null; if (d?.moved) { dragged.current = true; setTimeout(() => { dragged.current = false; }, 60); go(Math.round(tgt.current)); } }}
        onPointerLeave={() => { if (drag.current?.moved) go(Math.round(tgt.current)); drag.current = null; }}
        style={{ ['--w' as string]: `${w}px` }}
      >
        {view === 'rail' && <div className="rs-rail" aria-hidden><i /><b /><b /></div>}
        <div className="rs-track">
          {all.map((it, i) => {
            const d = i - pos;
            if (Math.abs(d) > (view === 'rail' ? 14 : 4)) return null;
            const front = i === idx;
            return (
              <button
                key={it.id}
                className={`rs-piece ${it.kind} ${it.img ? 'photo' : 'cut'} ${front ? 'front' : ''}`}
                style={view === 'rail' ? railStyle(d, w) : lineStyle(d, w)}
                onClick={() => { if (dragged.current) return; if (front) { sfx('open'); setOpen(it.id); } else go(i); }}
                aria-label={front ? t(`${it.title}, open`, `${it.title} を開く`) : it.title}
              >
                {view === 'rail' && (it.kind === 'garment' && !it.img ? (
                  <svg className="rs-hanger" viewBox="0 0 200 70" aria-hidden><path d="M100 4 c-9 0 -11 13 -2 16 l2 1 v6 M100 27 L12 62 Q6 66 14 66 H186 Q194 66 188 62 Z" fill="none" stroke="#2b2b2b" strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round" /></svg>
                ) : (
                  <svg className="rs-hook" viewBox="0 0 40 70" aria-hidden><path d="M20 2 c-8 0 -9 11 -1 13 v22" fill="none" stroke="#2b2b2b" strokeWidth="3" strokeLinecap="round" /><path d={it.kind === 'art' ? 'M20 37 L2 66 M20 37 L38 66' : 'M20 37 v20'} stroke="#2b2b2b" strokeWidth="1.6" /></svg>
                ))}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.src} alt="" draggable={false} className={view === 'rail' && (it.kind === 'art' || it.img) ? (it.img ? 'card' : 'framed') : ''} />
              </button>
            );
          })}
        </div>

        {view === 'lineup' && cur && (
          <aside className="rs-side" key={cur.id}>
            <span className="rs-mono">{pad2(idx + 1)} / {pad2(n)}</span>
            <h2>{cur.title}</h2>
            <span className="rs-mono">{cur.code}</span>
            <dl>{cur.facts.slice(0, 4).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            <b className="rs-price">{cur.price}</b>
            <button className="rs-btn" onClick={() => setOpen(cur.id)}>[ {t('View', '詳しく見る')} ]</button>
          </aside>
        )}
      </main>

      {cur && (
        <div className="rs-cap" key={cur.id + view}>
          <span className="rs-mono">{pad2(idx + 1)} / {pad2(n)} · {cur.code}</span>
          <b>{cur.title.toUpperCase()} — {cur.sub.toUpperCase()}</b>
          <span className="rs-mono">{cur.price}</span>
          <span className="rs-ctl">
            <button onClick={() => go(idx - 1)} aria-label={t('Previous', '前へ')}>←</button>
            <button className="rs-open" onClick={() => { sfx('open'); setOpen(cur.id); }}>[ {t('Select', '選ぶ')} ]</button>
            <button onClick={() => go(idx + 1)} aria-label={t('Next', '次へ')}>→</button>
          </span>
        </div>
      )}

      <footer className="rs-foot">
        <div className="rs-big" aria-hidden>GALLERY CRYPTO</div>
        <div className="rs-ticker" aria-hidden>
          <div>{Array.from({ length: 2 }, (_, k) => <span key={k}>{['ONE OF ONE', 'RECORDED ON CHAIN', 'NFC TAGGED', 'DROP 01 — ' + pad2(n) + ' PIECES', 'NO RESTOCKS', 'ARCHIVE · ART · OBJECTS', 'TOKYO', 'SALES OPEN 2027'].map((s) => <i key={s}>{s}</i>)}</span>)}</div>
        </div>
        <p className="rs-hint">{t('Slide to browse · tap the piece in front to buy', 'スライドで選ぶ · 正面の商品をタップで購入画面へ')}</p>
      </footer>

      {/* 購入画面（詳細） */}
      {item && (
        <div className="rs-over" onClick={() => setOpen(null)}>
          <section className="rs-detail" role="dialog" aria-modal="true" aria-label={item.title} onClick={(e) => e.stopPropagation()}>
            <div className="rs-dpic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.src} alt="" />
              <span className="rs-mono">{item.code}{item.buy === 'demo' ? ' · SAMPLE' : ''}{item.buy === 'local' ? ' · PREVIEW' : ''}</span>
            </div>
            <div className="rs-dinfo">
              <button className="rs-x" onClick={() => setOpen(null)} aria-label={t('Close', '閉じる')}>[ ×  ]</button>
              <span className="rs-mono">{pad2(all.indexOf(item) + 1)} / {pad2(n)}</span>
              <h2>{item.title}</h2>
              <p className="rs-sub">{item.sub}</p>
              <b className="rs-price">{item.price}</b>
              {story(item) && <p className="rs-desc">{story(item)}</p>}
              {item.facts.length > 0 && <dl>{item.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
              <div className="rs-buy">
                {item.buy === 'stripe' && <BuyButton itemId={item.id} />}
                {item.buy === 'sold' && <span className="rs-mono">SOLD</span>}
                {(item.buy === 'demo' || item.buy === 'local') && (
                  <>
                    <button className="rs-btn solid" onClick={() => add(item.id)}>{cart.includes(item.id) ? t('In cart ✓', 'カートに入っています ✓') : t('Add to cart', 'カートに入れる')}</button>
                    <p className="rs-fine">{t('Sample — not for sale. Sales open in 2027 (card / Apple Pay).', '見本のため購入はできません。販売は2027年から（カード／Apple Pay）。')}</p>
                  </>
                )}
                {item.passport && <a className="rs-link" href={item.passport}>[ {t('Digital record', 'デジタル記録')} → ]</a>}
              </div>
              <div className="rs-dnav">
                <button onClick={() => { const k = all.indexOf(item) - 1; if (k >= 0) { setOpen(all[k].id); go(k); } }}>← {t('Prev', '前')}</button>
                <button onClick={() => { const k = all.indexOf(item) + 1; if (k < n) { setOpen(all[k].id); go(k); } }}>{t('Next', '次')} →</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {panel === 'cart' && (
        <aside className="rs-drawer">
          <b>CART {pad2(cart.length)}</b>
          {!inCart.length && <p className="rs-fine">{t('Your cart is empty.', 'カートは空です。')}</p>}
          {inCart.map((i) => (
            <div key={i.id} className="rs-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.src} alt="" />
              <span>{i.title}<small>{i.price}</small></span>
              <button onClick={() => setCart((c) => c.filter((x) => x !== i.id))} aria-label={t('Remove', '外す')}>×</button>
            </div>
          ))}
          {inCart.filter((i) => i.buy === 'stripe').map((i) => <BuyButton key={i.id} itemId={i.id} label={t(`Buy ${i.title}`, `${i.title} を購入`)} />)}
          {inCart.some((i) => i.buy !== 'stripe') && <p className="rs-fine">{t('Samples and previews cannot be bought. Sales open in 2027.', '見本とプレビューの商品は購入できません。販売は2027年からです。')}</p>}
        </aside>
      )}
      {panel === 'add' && <AddPiece onAdd={(it) => { setLocal((l) => [it, ...l]); setPanel(''); tgt.current = 0; }} />}
    </div>
  );
}

// 写真を入れると、その場でレールに掛かる（この端末だけ。本番は管理画面で公開）
function AddPiece({ onAdd }: { onAdd: (i: ShopItem) => void }) {
  const { t } = useLang();
  const [img, setImg] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [zone, setZone] = useState<ShopItem['zone']>('vintage');
  return (
    <aside className="rs-drawer">
      <b>{t('ADD A PIECE', '入荷する')}</b>
      <label className="rs-file">
        <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImg(await shrink(f)); }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {img ? <img src={img} alt="" /> : <span>{t('Choose a photo (plain light background works best)', '写真を選ぶ（明るい無地の背景がおすすめ）')}</span>}
      </label>
      <input type="text" placeholder={t('Name', '商品名')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input type="text" inputMode="numeric" placeholder={t('Price (yen)', '価格（円）')} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} />
      <span className="rs-seg">
        {([['vintage', t('Garment', '服')], ['rwa', t('Cap / small', '帽子・小物')], ['art', t('Art', 'アート')]] as const).map(([z, l]) => <button key={z} aria-pressed={zone === z} onClick={() => setZone(z)}>{l}</button>)}
      </span>
      <button className="rs-btn solid" disabled={!img || !title.trim()} onClick={() => onAdd({ id: 'local-' + Date.now(), code: 'PREVIEW', title: title.trim(), sub: t('New arrival', '新入荷'), price: price ? '¥' + Number(price).toLocaleString('ja-JP') : 'Price on request', img, buy: 'local', desc: '', facts: [], zone })}>{t('Hang it on the rail', 'レールに掛ける')}</button>
      <p className="rs-fine">{t('Preview on this device only. Pieces published in the admin appear for everyone automatically.', 'この端末だけのプレビューです。管理画面で公開した商品は、全員のショップに自動で並びます。')}</p>
    </aside>
  );
}
