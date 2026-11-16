'use client';
// 展示室とショップ：サイトに公開した作品・商品が、そのまま3Dの展示室に並ぶ。
// 「展示を編集」で、額装・服の額・台座・ケースの切り替え、大きさ、並び順、非表示を決められる。
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
import type { Display, Scene, Shown, StoreApi } from './Store3D';

const Store3D = dynamic(() => import('./Store3D'), { ssr: false });
const LKEY = 'gc-shop-local', CKEY = 'gc-shop-cart', XKEY = 'gc-shop-curate';
const yen = (n: number | null) => (n ? '¥' + n.toLocaleString('ja-JP') : 'Price on request');
type Cfg = { display?: Display; size?: number; hidden?: boolean };
type Sort = 'arrival' | 'random' | 'custom';
type Curate = { order: string[]; cfg: Record<string, Cfg>; sort?: Sort; seed?: number };

const DISPLAYS: { k: Display; en: string; ja: string }[] = [
  { k: 'hang', en: 'Rack (garments)', ja: 'ラック（服）' },
  { k: 'case', en: 'Shelf (caps, small pieces)', ja: '棚（帽子・小物）' },
  { k: 'plinth', en: 'Shelf (objects, 3D)', ja: '棚（立体・3Dモデル）' },
  { k: 'frame', en: 'Wall (art, framed)', ja: '壁（アート・額装）' },
];

export function demoItems(): ShopItem[] {
  return PROJECTS.map((p) => ({
    id: 'demo-' + p.id, code: p.code, title: p.title, sub: `${p.sub} · ${p.year}`, price: yen(p.price), img: p.img, pid: p.id,
    buy: 'demo', passport: p.passport, desc: p.story[0], facts: p.facts, zone: p.pillar,
    display: p.pillar === 'rwa' ? 'case' : p.pillar === 'vintage' ? 'hang' : p.id === 'a3' ? 'plinth' : 'frame',
    size: p.id === 'a1' ? 1.4 : p.id === 'a2' ? 1.1 : 1,
  }));
}
export function svgUrl(pid: string) {
  const p = PROJECTS.find((x) => x.id === pid);
  if (!p) return '';
  const m = renderToStaticMarkup(<ProjectPic p={p} />).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="660" ');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m);
}
export async function shrink(f: File): Promise<string> {
  const img = await createImageBitmap(f);
  const k = Math.min(1, 1100 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}
// 立体（.glb）はこの端末の IndexedDB に保存
const idb = () => new Promise<IDBDatabase>((ok, ng) => { const r = indexedDB.open('gc-shop', 1); r.onupgradeneeded = () => r.result.createObjectStore('glb'); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
async function glbPut(key: string, b: Blob) { const d = await idb(); await new Promise((ok, ng) => { const t = d.transaction('glb', 'readwrite'); t.objectStore('glb').put(b, key); t.oncomplete = ok; t.onerror = ng; }); }
async function glbGet(key: string): Promise<Blob | null> { try { const d = await idb(); return await new Promise((ok) => { const r = d.transaction('glb').objectStore('glb').get(key); r.onsuccess = () => ok((r.result as Blob) || null); r.onerror = () => ok(null); }); } catch { return null; } }

export default function ShopClient({ initial, saleOpen }: { initial: ShopItem[]; saleOpen: boolean }) {
  const { t, lang } = useLang();
  const [real, setReal] = useState<ShopItem[]>(initial);
  const [local, setLocal] = useState<ShopItem[]>([]);
  const [cart, setCart] = useState<string[]>([]);
  const [cur8, setCur8] = useState<Curate>({ order: [], cfg: {} });
  const [glbs, setGlbs] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [panel, setPanel] = useState<'' | 'cart' | 'list' | 'place' | 'curate'>('');
  const [entered, setEntered] = useState(false);
  const [cur, setCur] = useState(-1);
  const api = useRef<StoreApi | null>(null);
  const [scene, setScene] = useState<{ i: number; s: Scene } | null>(null);

  useEffect(() => {
    try {
      setLocal(JSON.parse(localStorage.getItem(LKEY) || '[]'));
      setCart(JSON.parse(localStorage.getItem(CKEY) || '[]'));
      setCur8(JSON.parse(localStorage.getItem(XKEY) || '{"order":[],"cfg":{}}'));
    } catch { /* 無視 */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(LKEY, JSON.stringify(local)); } catch { /* 容量 */ } }, [local]);
  useEffect(() => { try { localStorage.setItem(CKEY, JSON.stringify(cart)); } catch { /* 無視 */ } }, [cart]);
  useEffect(() => { try { localStorage.setItem(XKEY, JSON.stringify(cur8)); } catch { /* 無視 */ } }, [cur8]);
  // この端末に保存した立体を読み込む
  useEffect(() => {
    local.forEach(async (i) => { if (i.glbKey && !glbs[i.id]) { const b = await glbGet(i.glbKey); if (b) setGlbs((g) => ({ ...g, [i.id]: URL.createObjectURL(b) })); } });
  }, [local]); // eslint-disable-line react-hooks/exhaustive-deps
  // 管理画面で公開した作品・商品を20秒ごとに取り直す（公開するとすぐ展示室に並ぶ）
  useEffect(() => {
    const db = supabase();
    if (!db) return;
    const h = setInterval(async () => {
      const { data } = await db.from('items').select(PUBLIC_ITEM_COLUMNS).eq('published', true).order('serial', { ascending: false }).limit(60);
      if (data) setReal(((data as unknown) as Item[]).map((it) => toShop(it, saleOpen)));
    }, 20000);
    return () => clearInterval(h);
  }, [saleOpen]);

  const base = useMemo(() => [...local, ...real, ...(real.length ? [] : demoItems())], [local, real]);
  const ordered = useMemo(() => {
    // 入荷順（新しいものから）／ランダム／手動
    const sort = cur8.sort || 'arrival';
    const h = (id: string) => { let x = (cur8.seed || 1) ^ 0x9e3779b9; for (let i = 0; i < id.length; i++) x = Math.imul(x ^ id.charCodeAt(i), 0x85ebca6b); return (x >>> 0) / 4294967296; };
    const ix = (id: string) => { if (sort === 'random') return h(id); const k = sort === 'custom' ? cur8.order.indexOf(id) : -1; return k < 0 ? 1e6 + base.findIndex((b) => b.id === id) : k; };
    return [...base].sort((a, b) => ix(a.id) - ix(b.id)).map((i) => ({ ...i, display: cur8.cfg[i.id]?.display || i.display || 'frame', size: cur8.cfg[i.id]?.size || i.size || 1, hidden: !!cur8.cfg[i.id]?.hidden }));
  }, [base, cur8]);
  const all = ordered.filter((i) => !i.hidden);
  const newest = useMemo(() => new Set(base.filter((b) => b.buy !== 'demo').slice(0, 3).map((b) => b.id)), [base]);
  const shown: Shown[] = useMemo(() => all.map((i) => ({ id: i.id, title: i.title, sub: i.sub, price: i.price, tex: i.img || (i.pid ? svgUrl(i.pid) : ''), sold: i.buy === 'sold', local: i.buy === 'local', isNew: newest.has(i.id), display: i.display as Display, size: i.size as number, glb: glbs[i.id] })).filter((s) => s.tex), [all, glbs, newest]);
  const item = all.find((i) => i.id === sel) || null;
  const go = (d: number) => { setSel(null); if (scene) api.current?.go(scene.i + d, d); sfx('tick'); };
  const goItem = (id: string) => { setSel(null); api.current?.goItem(id); };
  const inCart = base.filter((i) => cart.includes(i.id));
  const setCfg = (id: string, c: Cfg) => setCur8((x) => ({ ...x, cfg: { ...x.cfg, [id]: { ...x.cfg[id], ...c } } }));
  const move = (id: string, d: number) => setCur8((x) => { const ids = ordered.map((o) => o.id); const k = ids.indexOf(id), j = k + d; if (j < 0 || j >= ids.length) return x; [ids[k], ids[j]] = [ids[j], ids[k]]; return { ...x, order: ids, sort: 'custom' }; });

  return (
    <div className="sh store" translate="no">
      <Store3D items={shown} onPick={(id) => { sfx('open'); setSel(id); setCur(shown.findIndex((s) => s.id === id)); }} apiRef={api} onScene={(i, s) => setScene({ i, s })} />

      <header className="sh-top">
        <a className="sh-back" href="/">← {t('Site', 'サイト')}</a>
        <b className="sh-name">GALLERY CRYPTO <span>{t('Store', 'ストア')}</span></b>
        <span className="sh-tools">
          <button onClick={() => setPanel(panel === 'list' ? '' : 'list')}>{t('Works', '作品')} {shown.length}</button>
          <button onClick={() => { setSel(null); setPanel(panel === 'curate' ? '' : 'curate'); }}>{t('Arrange', '陳列を編集')}</button>
          <button onClick={() => setPanel(panel === 'place' ? '' : 'place')}>{t('New arrival', '入荷する')}</button>
          <button className="sh-cartb" onClick={() => setPanel(panel === 'cart' ? '' : 'cart')}>{t('Cart', 'カート')} <i>{cart.length}</i></button>
          <LangToggle />
        </span>
      </header>

      <nav className="sh-guide" aria-label={t('Walk between works', '作品のあいだを歩く')}>
        <button onClick={() => go(-1)} aria-label={t('Previous work', '前の作品')}>‹</button>
        <span>{scene ? `${lang === 'ja' ? scene.s.label[1] : scene.s.label[0]} · ${scene.i + 1}/${api.current?.scenes.length || 1}` : '…'}</span>
        <button onClick={() => go(1)} aria-label={t('Next work', '次の作品')}>›</button>
      </nav>
      <p className="sh-keys">{t('Swipe sideways (or ← →) to move through the store · tap a piece to see it', '横にスワイプ（または ← →）で店内を移動・商品をタップで詳しく')}</p>

      {!entered && (
        <div className="sh-door">
          <div className="sh-door-in">
            <p className="sh-k">{t('Store', 'ストア')}</p>
            <h1>GALLERY CRYPTO</h1>
            <p>{t('A store with racks on every wall. Everything that arrives on the site is put on display automatically, in order. Swipe to move through the store, tap a piece to see it.', '壁一面のラックと棚。サイトに入荷した商品は、入荷順に自動で陳列されます。横にスワイプで店内を移動、商品をタップで詳しく。')}</p>
            <button className="sh-enter" onClick={() => { setEntered(true); sfx('drop'); }}>{t('Enter', '入る')}</button>
            {!real.length && <p className="sh-fine">{t('No pieces are published yet, so fictional samples are on display. Nothing is for sale until 2027.', 'まだ公開中の作品がないため、架空の見本を展示しています。販売は2027年からです。')}</p>}
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
          {item.buy === 'local' && <button className="sh-mini" onClick={() => { setLocal((l) => l.filter((x) => x.id !== item.id)); setSel(null); }}>{t('Remove from the exhibition', '展示から外す')}</button>}
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
          {inCart.filter((i) => i.buy === 'stripe').map((i) => <BuyButton key={i.id} itemId={i.id} label={t(`Buy ${i.title}`, `${i.title} を購入`)} />)}
          {inCart.some((i) => i.buy !== 'stripe') && <p className="sh-fine">{t('Samples and works placed on this device cannot be bought. Sales open in 2027; real pieces use secure card / Apple Pay checkout.', '見本とこの端末で置いた作品は購入できません。販売は2027年から、本番の作品はカード／Apple Pay の安全な決済で購入できます。')}</p>}
        </aside>
      )}

      {panel === 'list' && (
        <aside className="sh-drawer">
          <b>{t('In the exhibition', '展示中の作品')}</b>
          {shown.map((s, i) => <button key={s.id} className="sh-row" onClick={() => { setCur(i); goItem(s.id); setPanel(''); }}><span>{s.title}</span><small>{s.price}</small></button>)}
        </aside>
      )}

      {panel === 'curate' && (
        <aside className="sh-drawer wide">
          <b>{t('Arrange the store', '陳列を編集')}</b>
          <p className="sh-fine">{t('Pieces are displayed automatically, rack by rack, in the order they arrive. Change the order, where each piece goes, or its size — the store rearranges at once.', '商品は入荷（アップロード）した順に、ラックから自動で陳列されます。並べ方・置き場所・大きさを変えると、すぐに陳列し直します。')}</p>
          <div className="sh-sort">
            {([['arrival', t('Arrival order (newest first)', '入荷順（新しい順）')], ['random', t('Random', 'ランダム')], ['custom', t('Manual', '手動')]] as [Sort, string][]).map(([k, l]) => <button key={k} className="sh-mini" aria-pressed={(cur8.sort || 'arrival') === k} onClick={() => setCur8((x) => ({ ...x, sort: k, seed: k === 'random' ? Math.floor(Math.random() * 1e9) : x.seed }))}>{l}</button>)}
          </div>
          {ordered.map((i, k) => (
            <div key={i.id} className={`sh-cur ${i.hidden ? 'off' : ''}`}>
              <span className="sh-cur-n">{k + 1}</span>
              <span className="sh-cur-t">{i.title}<small>{i.sub}</small></span>
              <select value={i.display} onChange={(e) => setCfg(i.id, { display: e.target.value as Display })}>
                {DISPLAYS.map((d) => <option key={d.k} value={d.k}>{lang === 'ja' ? d.ja : d.en}</option>)}
              </select>
              <label className="sh-cur-s">{t('Size', '大きさ')} <input type="range" min={0.6} max={2.4} step={0.1} value={i.size} onChange={(e) => setCfg(i.id, { size: +e.target.value })} /> <em>{Math.round((i.size as number) * 100)}cm</em></label>
              <span className="sh-cur-b">
                <button className="sh-mini" onClick={() => move(i.id, -1)} aria-label="up">↑</button>
                <button className="sh-mini" onClick={() => move(i.id, 1)} aria-label="down">↓</button>
                <button className="sh-mini" aria-pressed={!i.hidden} onClick={() => setCfg(i.id, { hidden: !i.hidden })}>{i.hidden ? t('Hidden', '非表示') : t('Shown', '展示中')}</button>
                {!i.hidden && <button className="sh-mini" onClick={() => goItem(i.id)}>{t('Go', '見に行く')}</button>}
              </span>
            </div>
          ))}
          <button className="sh-mini" onClick={() => setCur8({ order: [], cfg: {}, sort: 'arrival' })}>{t('Reset the layout', '展示を最初に戻す')}</button>
          <p className="sh-fine">{t('The layout is saved on this device for now.', '展示の設定は、いまはこの端末に保存されます。')}</p>
        </aside>
      )}

      {panel === 'place' && <Place onAdd={async (it, glb) => { if (glb && it.glbKey) { await glbPut(it.glbKey, glb); setGlbs((g) => ({ ...g, [it.id]: URL.createObjectURL(glb) })); } setLocal((l) => [it, ...l]); setPanel(''); setTimeout(() => api.current?.goItem(it.id), 700); }} />}
    </div>
  );
}

// 作品を置く：写真（と、立体なら .glb）を入れると、その場で展示室に並ぶ（この端末だけ。本番は管理画面で公開）
function Place({ onAdd }: { onAdd: (i: ShopItem, glb?: Blob) => void }) {
  const { t, lang } = useLang();
  const [img, setImg] = useState('');
  const [glb, setGlb] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [price, setPrice] = useState('');
  const [display, setDisplay] = useState<Display>('hang');
  const [size, setSize] = useState(1.2);
  const [err, setErr] = useState('');
  return (
    <aside className="sh-drawer">
      <b>{t('New arrival — display it now', '入荷：すぐに陳列する')}</b>
      <select value={display} onChange={(e) => setDisplay(e.target.value as Display)}>{DISPLAYS.map((d) => <option key={d.k} value={d.k}>{lang === 'ja' ? d.ja : d.en}</option>)}</select>
      <label className="sh-file">
        <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setImg(await shrink(f)); setErr(''); } catch { setErr(t('Could not read this image.', 'この画像は読めませんでした。')); } }} />
        {img ? <img src={img} alt="" /> : <span>{t('Choose a photo of the work', '作品の写真を選ぶ')}</span>}
      </label>
      {display === 'plinth' && (
        <label className="sh-glb">
          <input type="file" accept=".glb,model/gltf-binary" onChange={(e) => { const f = e.target.files?.[0] || null; if (f && f.size > 40e6) { setErr(t('The 3D file is too large (max 40 MB).', '3Dファイルが大きすぎます（40MBまで）。')); return; } setGlb(f); }} />
          {glb ? `✓ ${glb.name}` : t('3D model (.glb, optional) — e.g. from a scanning app', '立体の3Dモデル（.glb・任意）— スキャンアプリなどで作成')}
        </label>
      )}
      <input type="text" placeholder={t('Title', '作品名')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input type="text" placeholder={t('Artist · year · medium', '作家・年・技法')} value={artist} onChange={(e) => setArtist(e.target.value)} />
      <input type="text" inputMode="numeric" placeholder={t('Price (yen, optional)', '価格（円・任意）')} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))} />
      <label className="sh-cur-s">{t('Size', '大きさ')} <input type="range" min={0.6} max={2.4} step={0.1} value={size} onChange={(e) => setSize(+e.target.value)} /> <em>{Math.round(size * 100)}cm</em></label>
      <button className="sh-btn" disabled={!img || !title.trim()} onClick={() => { const id = 'local-' + Date.now(); onAdd({ id, code: 'PREVIEW', title: title.trim(), sub: artist.trim() || t('Placed on this device', 'この端末で配置'), price: price ? '¥' + Number(price).toLocaleString('ja-JP') : t('Price on request', '価格はお問い合わせ'), img, buy: 'local', desc: '', facts: [], zone: 'archive', display, size, glbKey: glb ? id : undefined }, glb || undefined); }}>{t('Display it', '陳列する')}</button>
      <p className="sh-fine">{t('Preview on this device only. Works you publish in the admin appear in everyone’s exhibition automatically.', 'この端末だけのプレビューです。管理画面で公開した作品は、全員の展示室に自動で並びます。')}</p>
      {err && <p className="sh-err">{err}</p>}
    </aside>
  );
}
