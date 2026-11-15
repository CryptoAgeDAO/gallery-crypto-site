'use client';
// デジタル店舗：サイトに公開された商品が、そのまま3Dの店に並ぶ。歩いて見て、カートに入れて購入へ。
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
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
import type { Shown } from './Store3D';

const Store3D = dynamic(() => import('./Store3D'), { ssr: false });
const LKEY = 'gc-shop-local', CKEY = 'gc-shop-cart';
const yen = (n: number | null) => (n ? '¥' + n.toLocaleString('ja-JP') : 'Price TBA');

function demoItems(): ShopItem[] {
  return PROJECTS.map((p) => ({
    id: 'demo-' + p.id, code: p.code, title: p.title, sub: `${p.sub} · ${p.year}`, price: yen(p.price), img: p.img, pid: p.id,
    buy: 'demo', passport: p.passport, desc: p.story[0], facts: p.facts, zone: p.pillar,
  }));
}
function svgUrl(pid: string) {
  const p = PROJECTS.find((x) => x.id === pid);
  if (!p) return '';
  const m = renderToStaticMarkup(<ProjectPic p={p} />).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="660" ');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m);
}
async function shrink(f: File): Promise<string> {
  const img = await createImageBitmap(f);
  const k = Math.min(1, 900 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

export default function ShopClient({ initial, saleOpen }: { initial: ShopItem[]; saleOpen: boolean }) {
  const { t, lang } = useLang();
  const [real, setReal] = useState<ShopItem[]>(initial);
  const [local, setLocal] = useState<ShopItem[]>([]);
  const [cart, setCart] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [panel, setPanel] = useState<'' | 'cart' | 'list' | 'place'>('');
  const [entered, setEntered] = useState(false);
  const [cur, setCur] = useState(-1);
  const api = useRef<{ go: (i: number) => void } | null>(null);

  // この端末で置いた商品・カート
  useEffect(() => {
    try { setLocal(JSON.parse(localStorage.getItem(LKEY) || '[]')); setCart(JSON.parse(localStorage.getItem(CKEY) || '[]')); } catch { /* 無視 */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(LKEY, JSON.stringify(local)); } catch { /* 容量オーバーなど */ } }, [local]);
  useEffect(() => { try { localStorage.setItem(CKEY, JSON.stringify(cart)); } catch { /* 無視 */ } }, [cart]);
  // 管理画面で公開された商品を20秒ごとに取り直す（公開するとすぐ店に並ぶ）
  useEffect(() => {
    const db = supabase();
    if (!db) return;
    const h = setInterval(async () => {
      const { data } = await db.from('items').select(PUBLIC_ITEM_COLUMNS).eq('published', true).order('serial', { ascending: false }).limit(60);
      if (data) setReal(((data as unknown) as Item[]).map((it) => toShop(it, saleOpen)));
    }, 20000);
    return () => clearInterval(h);
  }, [saleOpen]);

  const all = useMemo(() => [...local, ...real, ...(real.length ? [] : demoItems())], [local, real]);
  const shown: Shown[] = useMemo(() => all.map((i) => ({ id: i.id, title: i.title, price: i.price, tex: i.img || (i.pid ? svgUrl(i.pid) : ''), sold: i.buy === 'sold', local: i.buy === 'local' })).filter((s) => s.tex), [all]);
  const item = all.find((i) => i.id === sel) || null;
  const go = (d: number) => { const n = shown.length; if (!n) return; const i = (cur + d + n) % n; setCur(i); api.current?.go(i); sfx('tick'); };
  const inCart = all.filter((i) => cart.includes(i.id));

  return (
    <div className="sh store" translate="no">
      <Store3D items={shown} onPick={(id) => { sfx('open'); setSel(id); setCur(shown.findIndex((s) => s.id === id)); }} apiRef={api} />

      <header className="sh-top">
        <a className="sh-back" href="/">← {t('Site', 'サイト')}</a>
        <b className="sh-name">GALLERY CRYPTO <span>{t('STORE', 'ストア')}</span></b>
        <span className="sh-tools">
          <button onClick={() => setPanel(panel === 'list' ? '' : 'list')}>{t('Pieces', '商品')} {shown.length}</button>
          <button onClick={() => setPanel(panel === 'place' ? '' : 'place')}>{t('Place a piece', '商品を置く')}</button>
          <button className="sh-cartb" onClick={() => setPanel(panel === 'cart' ? '' : 'cart')}>{t('Cart', 'カート')} <i>{cart.length}</i></button>
          <LangToggle />
        </span>
      </header>

      <nav className="sh-guide" aria-label={t('Walk between pieces', '商品のあいだを歩く')}>
        <button onClick={() => go(-1)} aria-label={t('Previous piece', '前の商品')}>‹</button>
        <span>{cur >= 0 && shown[cur] ? shown[cur].title : t('Drag to look · tap the floor to walk · tap a piece', 'ドラッグで見回す・床をタップで歩く・商品をタップ')}</span>
        <button onClick={() => go(1)} aria-label={t('Next piece', '次の商品')}>›</button>
      </nav>
      <p className="sh-keys">{t('Keys: W A S D / arrows to walk, Q E to turn', 'キー：W A S D・矢印で歩く、Q E で向きを変える')}</p>

      {!entered && (
        <div className="sh-door">
          <div className="sh-door-in">
            <p className="sh-k">{t('Digital store', 'デジタル店舗')}</p>
            <h1>GALLERY CRYPTO</h1>
            <p>{t('Every piece published on the site is placed in the store the moment it goes live. Walk in, look closely, and buy.', 'サイトで公開した商品は、その瞬間にこの店に並びます。中を歩いて、近くで見て、購入へ。')}</p>
            <button className="sh-enter" onClick={() => { setEntered(true); sfx('drop'); }}>{t('Enter the store', '店に入る')}</button>
            {!real.length && <p className="sh-fine">{t('No pieces are published yet, so fictional samples are on display. Nothing is for sale until 2027.', 'まだ公開中の商品がないため、架空の見本を並べています。販売は2027年からです。')}</p>}
          </div>
        </div>
      )}

      {item && (
        <aside className="sh-panel" role="dialog" aria-label={item.title}>
          <button className="sh-x" onClick={() => setSel(null)} aria-label={t('Close', '閉じる')}>×</button>
          <div className="sh-pic">{item.img ? <img src={item.img} alt="" /> : item.pid ? <ProjectPic p={PROJECTS.find((p) => p.id === item.pid)!} /> : null}</div>
          <p className="sh-code">{item.code}{item.buy === 'demo' ? ` · ${t('Sample', '見本')}` : ''}{item.buy === 'local' ? ` · ${t('Placed on this device', 'この端末で配置')}` : ''}</p>
          <h2>{item.title}</h2>
          <p className="sh-sub">{item.sub}</p>
          <p className="sh-price">{item.price}</p>
          {item.desc && <p className="sh-desc">{lang === 'ja' && item.pid ? PROJECTS.find((p) => p.id === item.pid)?.story[1] : item.desc}</p>}
          {item.facts.length > 0 && <dl className="sh-facts">{item.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
          <div className="sh-act">
            {item.buy === 'stripe' && <BuyButton itemId={item.id} />}
            {item.buy === 'sold' && <p className="sh-fine">{t('Sold', '売約済み')}</p>}
            {(item.buy === 'demo' || item.buy === 'local') && (
              <button className="sh-btn" onClick={() => { setCart((c) => (c.includes(item.id) ? c : [...c, item.id])); sfx('coin'); setPanel('cart'); }}>{cart.includes(item.id) ? t('In your cart ✓', 'カートに入っています ✓') : t('Add to cart', 'カートに入れる')}</button>
            )}
            {item.passport && <a className="sh-link" href={item.passport}>{t('Digital record →', 'デジタル記録 →')}</a>}
          </div>
          {item.buy === 'local' && <button className="sh-mini" onClick={() => { setLocal((l) => l.filter((x) => x.id !== item.id)); setSel(null); }}>{t('Remove from display', 'ディスプレイから外す')}</button>}
        </aside>
      )}

      {panel === 'cart' && (
        <aside className="sh-drawer">
          <b>{t('Cart', 'カート')}</b>
          {!inCart.length && <p className="sh-fine">{t('Your cart is empty.', 'カートは空です。')}</p>}
          {inCart.map((i) => (
            <div key={i.id} className="sh-line">
              <span>{i.title}<small>{i.price}</small></span>
              <button className="sh-mini" onClick={() => setCart((c) => c.filter((x) => x !== i.id))}>×</button>
            </div>
          ))}
          {inCart.some((i) => i.buy === 'stripe') && inCart.filter((i) => i.buy === 'stripe').map((i) => <BuyButton key={i.id} itemId={i.id} label={t(`Buy ${i.title}`, `${i.title} を購入`)} />)}
          {inCart.some((i) => i.buy !== 'stripe') && <p className="sh-fine">{t('Samples and pieces placed on this device cannot be bought. Sales open in 2027; real pieces use secure card / Apple Pay checkout.', '見本とこの端末で置いた商品は購入できません。販売は2027年から、本番の商品はカード／Apple Pay の安全な決済で購入できます。')}</p>}
        </aside>
      )}

      {panel === 'list' && (
        <aside className="sh-drawer">
          <b>{t('In the store', '店内の商品')}</b>
          {shown.map((s, i) => <button key={s.id} className="sh-row" onClick={() => { setCur(i); api.current?.go(i); setPanel(''); }}><span>{s.title}</span><small>{s.price}</small></button>)}
        </aside>
      )}

      {panel === 'place' && <Place onAdd={(it) => { setLocal((l) => [it, ...l]); setPanel(''); setCur(0); setTimeout(() => api.current?.go(0), 400); }} />}
    </div>
  );
}

// 写真を入れると、その場でディスプレイに並ぶ（この端末だけ。本番は管理画面で公開）
function Place({ onAdd }: { onAdd: (i: ShopItem) => void }) {
  const { t } = useLang();
  const [img, setImg] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [err, setErr] = useState('');
  return (
    <aside className="sh-drawer">
      <b>{t('Place a piece on display', '商品をディスプレイに置く')}</b>
      <label className="sh-file">
        <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setImg(await shrink(f)); setErr(''); } catch { setErr(t('Could not read this image.', 'この画像は読めませんでした。')); } }} />
        {img ? <img src={img} alt="" /> : <span>{t('Choose a photo', '写真を選ぶ')}</span>}
      </label>
      <input type="text" placeholder={t('Name', '商品名')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input type="text" inputMode="numeric" placeholder={t('Price (yen)', '価格（円）')} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} />
      <button className="sh-btn" disabled={!img || !title.trim()} onClick={() => onAdd({ id: 'local-' + Date.now(), code: 'PREVIEW', title: title.trim(), sub: t('Placed on this device', 'この端末で配置'), price: price ? '¥' + Number(price).toLocaleString('ja-JP') : 'Price TBA', img, buy: 'local', desc: '', facts: [], zone: 'archive' })}>{t('Put it on display', 'ディスプレイに置く')}</button>
      <p className="sh-fine">{t('Preview on this device only. Pieces you publish in the admin appear in everyone’s store automatically.', 'この端末だけのプレビューです。管理画面で公開した商品は、全員の店に自動で並びます。')}</p>
      {err && <p className="sh-err">{err}</p>}
    </aside>
  );
}
