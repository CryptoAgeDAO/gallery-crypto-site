'use client';
// 売り場つきの仮想店舗：白い店内を、入口 → 服（壁のラック）→ キャップ（木の棚）→ アート（壁掛け）→ Try the Look と横に歩く。
// 下のタブで売り場を切り替えると、カメラが壁沿いに滑って移動する。商品を押すと右から詳細。
import { useEffect, useMemo, useState } from 'react';
import { LangToggle, useLang } from '../Lang';
import { sfx } from '@/lib/sfx';
import type { ShopItem } from './types';
import { demoItems } from './ShopClient';
import { cutout, kindOf } from './RailShop';
import { HANGER_URL } from './garmentArt';

const CKEY = 'gc-shop-cart';
type Sec = 'entry' | 'clothing' | 'caps' | 'art';
const SECS: { k: Sec; en: string; ja: string }[] = [
  { k: 'entry', en: 'Store', ja: '店内' },
  { k: 'clothing', en: 'Clothing', ja: '服' },
  { k: 'caps', en: 'Caps', ja: 'キャップ' },
  { k: 'art', en: 'Art', ja: 'アート' },
];

export default function StoreFloor({ initial }: { initial: ShopItem[] }) {
  const { t } = useLang();
  const [local, setLocal] = useState<ShopItem[]>([]);
  const [cart, setCart] = useState<string[]>([]);
  useEffect(() => { try { setLocal(JSON.parse(localStorage.getItem('gc-shop-local') || '[]')); setCart(JSON.parse(localStorage.getItem(CKEY) || '[]')); } catch { /* 無視 */ } }, []);
  useEffect(() => { try { localStorage.setItem(CKEY, JSON.stringify(cart)); } catch { /* 無視 */ } }, [cart]);
  const items = useMemo(() => [...local, ...initial, ...(initial.length ? [] : demoItems())].map((i) => ({ ...i, src: i.img || (i.pid ? cutout(i.pid) : ''), kind: kindOf(i) })).filter((i) => i.src), [local, initial]);
  const clothes = items.filter((i) => i.kind === 'garment' && !i.img).slice(0, 9);
  const caps = items.filter((i) => i.kind === 'cap').slice(0, 6);
  const art = items.filter((i) => i.kind === 'art' || (i.kind === 'garment' && i.img)).slice(0, 4);
  const [sec, setSec] = useState(0);
  const [moving, setMoving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const cur = items.find((i) => i.id === open) || null;
  const go = (k: number) => { k = Math.max(0, Math.min(SECS.length - 1, k)); if (k === sec) return; setSec(k); setMoving(true); setOpen(null); sfx('tick'); };
  useEffect(() => { if (!moving) return; const id = setTimeout(() => setMoving(false), 1100); return () => clearTimeout(id); }, [moving, sec]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(sec + 1); if (e.key === 'ArrowLeft') go(sec - 1); if (e.key === 'Escape') setOpen(null); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });
  // スワイプで売り場を移る
  const [sx, setSx] = useState<number | null>(null);
  const pick = (id: string) => { setOpen(id); sfx('open'); };
  const Tag = ({ i }: { i: (typeof items)[number] }) => <span className="sx-tag"><em>{i.code}</em><b>{i.price}</b></span>;

  return (
    <div className={`sx ${moving ? 'moving' : ''} ${cur ? 'has-panel' : ''}`} translate="no">
      <header className="sx-top">
        <a href="/shop">← {t('Shop', 'ショップ')}</a>
        <a className="sx-logo notranslate" href="/shop">GALLERY CRYPTO</a>
        <span className="sx-r"><a href="/shop/rail">{t('Rail', 'レール')}</a><a href="/shop">{t('Cart', 'カート')} ({cart.length})</a><LangToggle /></span>
      </header>

      <main className="sx-room" onPointerDown={(e) => setSx(e.clientX)} onPointerUp={(e) => { if (sx !== null && Math.abs(e.clientX - sx) > 70 && e.pointerType !== 'mouse') go(sec + (e.clientX < sx ? 1 : -1)); setSx(null); }}>
        <div className="sx-ceil" aria-hidden />
        <div className="sx-floor" aria-hidden />
        <div className="sx-strip" style={{ transform: `translateX(${-sec * 100}vw)` }}>
          {/* 入口 */}
          <section className="sx-sec entry">
            <div className="sx-wall-logo"><b>GALLERY CRYPTO</b><span>{t('Tokyo · one of one · recorded', '東京 · 一点もの · 記録付き')}</span></div>
            <div className="sx-counter" aria-hidden><i /></div>
            <div className="sx-plant" aria-hidden><i /><i /><i /><i /><i /><b /></div>
            <button className="sx-start" onClick={() => go(1)}>{t('Walk in', '店内へ')} →</button>
          </section>
          {/* 服：壁付けのラックに正面を向けて */}
          <section className="sx-sec clothing">
            <h2 className="sx-sign">{t('Clothing', '服')}<span>{String(clothes.length).padStart(2, '0')}</span></h2>
            <div className="sx-bar" aria-hidden><i /><b /><b /></div>
            <div className="sx-hang">
              {clothes.map((i, k) => (
                <button key={i.id} className="sx-g" style={{ ['--k' as string]: k }} onClick={() => pick(i.id)} aria-label={i.title}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="sx-hgr" src={HANGER_URL} alt="" draggable={false} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="sx-gi" src={i.src} alt="" draggable={false} />
                  <Tag i={i} />
                </button>
              ))}
            </div>
          </section>
          {/* キャップ：木の棚 */}
          <section className="sx-sec caps">
            <h2 className="sx-sign">{t('Caps', 'キャップ')}<span>{String(caps.length).padStart(2, '0')}</span></h2>
            <div className="sx-shelf" style={{ gridTemplateColumns: `repeat(${caps.length <= 4 ? 2 : 3}, 1fr)`, gridTemplateRows: `repeat(${Math.max(1, Math.ceil(caps.length / (caps.length <= 4 ? 2 : 3)))}, 1fr)`, aspectRatio: caps.length <= 4 ? '1 / 1' : '3 / 2', width: caps.length <= 4 ? 'min(42vw, 520px)' : undefined }}>
              {Array.from({ length: Math.max(2, Math.ceil(caps.length / (caps.length <= 4 ? 2 : 3)) * (caps.length <= 4 ? 2 : 3)) }, (_, k) => caps[k]).map((i, k) => (
                <div key={k} className="sx-cube">
                  {i && (
                    <button className="sx-c" onClick={() => pick(i.id)} aria-label={i.title}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={i.src} alt="" draggable={false} />
                      <Tag i={i} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
          {/* アート：壁掛けとスポット */}
          <section className="sx-sec art">
            <h2 className="sx-sign">{t('Art', 'アート')}<span>{String(art.length).padStart(2, '0')}</span></h2>
            <div className="sx-frames">
              {art.map((i, k) => (
                <button key={i.id} className="sx-f" style={{ ['--k' as string]: k }} onClick={() => pick(i.id)} aria-label={i.title}>
                  <i className="sx-spot" aria-hidden />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.src} alt="" draggable={false} />
                  <Tag i={i} />
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>

      <nav className="sx-tabs" aria-label={t('Sections', '売り場')}>
        {SECS.map((s, k) => <button key={s.k} aria-pressed={k === sec} onClick={() => go(k)}>{t(s.en, s.ja)}</button>)}
      </nav>

      <aside className={`sx-panel ${cur ? 'on' : ''}`} aria-hidden={!cur}>
        {cur && (
          <div key={cur.id}>
            <button className="sx-x" onClick={() => setOpen(null)} aria-label={t('Close', '閉じる')}>×</button>
            <div className="sx-pimg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cur.src} alt="" />
            </div>
            <em className="sx-code">{cur.code}{cur.buy === 'demo' ? ` · ${t('Sample', '見本')}` : ''}</em>
            <h3>{cur.title}</h3>
            <p className="sx-sub">{cur.sub}</p>
            <strong>{cur.price}</strong>
            <p className="sx-desc">{cur.desc}</p>
            {cur.facts.length > 0 && <dl>{cur.facts.slice(0, 5).map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>}
            <button className="sx-btn" disabled={cart.includes(cur.id)} onClick={() => { setCart((c) => (c.includes(cur.id) ? c : [...c, cur.id])); sfx('coin'); }}>{cart.includes(cur.id) ? t('In your cart', 'カートに入っています') : t('Add to cart', 'カートに入れる')}</button>
            <a className="sx-btn ghost" href={`/shop#p=${encodeURIComponent(cur.id)}`}>{t('View in the shop', 'ショップで見る')} →</a>
            {(cur.buy === 'demo' || cur.buy === 'local') && <p className="sx-fine">{t('Sample — not for sale. Sales open in 2027 (card / Apple Pay).', '見本のため購入はできません。販売は2027年から（カード／Apple Pay）。')}</p>}
          </div>
        )}
      </aside>
    </div>
  );
}
