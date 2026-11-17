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
import { HANGER_URL, realGarment } from './garmentArt';

const LKEY = 'gc-shop-local', CKEY = 'gc-shop-cart';
type Kind = 'garment' | 'cap' | 'art';
type View = 'rail' | 'lineup';

// 見本の図を、背景なし（切り抜き）で
export function cutout(pid: string) {
  const p = PROJECTS.find((x) => x.id === pid);
  if (!p) return '';
  // 服は布の陰影つきの絵に、それ以外は元の図
  const m = p.draw ? realGarment(p.draw, PROJECTS.indexOf(p) + 3) : renderToStaticMarkup(<ProjectPic p={p} />).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1320" ');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m);
}
export const kindOf = (i: ShopItem): Kind => (i.zone === 'art' ? 'art' : i.zone === 'rwa' || /cap/i.test(i.sub) ? 'cap' : 'garment');

// レール：全部が横向きで詰めて掛かり（陳列）、指した一着だけがレールから引き出されて正面を向く（フェイスアウト）
// e = その服 − 指している位置。正面に回るときは少し行き過ぎてから戻る
const backOut = (x: number) => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
function faceOut(i: number, h: number, on: number) { const e = i - h; return on * Math.max(0, 1 - Math.abs(e) * 1.6); }
// 古着屋のラックのように、肩を寄せて詰めて掛ける
export const railGap = (w: number) => Math.max(14, w * 0.085);
const jit = (i: number) => ((i * 7919) % 13) / 13 - 0.5; // 一着ずつ少しだけ向きがばらつく
function hoverStyle(i: number, c: number, h: number, on: number, w: number): React.CSSProperties {
  const gap = railGap(w), spread = w * 0.46 * on;
  const e = i - h, pop = faceOut(i, h, on), k = backOut(pop);
  const x = (i - c) * gap + Math.sign(e) * spread * Math.min(1, Math.abs(e) * 1.4);
  const side = i - c >= 0 ? -1 : 1; // 横向きのときは、真ん中のほうへ面を向ける
  const r = (80 + jit(i) * 9) * side * (1 - k);
  return { transform: `translateX(${x}px) translateY(${pop * 8 + jit(i + 3) * 3 * (1 - pop)}px) perspective(1600px) translateZ(${pop * 70}px) rotateY(${r}deg) scale(${0.8 + pop * 0.16})`, zIndex: 500 + Math.round(pop * 100) - Math.round(Math.abs(i - c)) };
}
// 文字がいったん崩れてから、正しい文字に落ち着く
function useScramble(text: string) {
  const [s, set] = useState(text);
  useEffect(() => {
    const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&<>/+';
    let f = 0;
    const id = setInterval(() => {
      f++; const r = f * 1.5;
      set(text.split('').map((c, i) => (c === ' ' || i < r ? c : ch[Math.floor(Math.random() * ch.length)])).join(''));
      if (r >= text.length) clearInterval(id);
    }, 26);
    return () => clearInterval(id);
  }, [text]);
  return s;
}
function Scr({ text, className }: { text: string; className?: string }) { return <span className={className}>{useScramble(text)}</span>; }
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
  const [frame, setFrame] = useState({ pos: 0, sway: 0, t: 0 }); // 位置・ゆれ・時間（毎フレーム）
  const pos = frame.pos;
  // 動き：自由にすべる（慣性）→ ゆっくり止まって一番近い一着に吸い付く。服は動きに合わせてハンガーごと揺れる
  const ph = useRef({ pos: 0, vel: 0, to: null as number | null, sway: 0, swayV: 0, drag: false, hist: [] as { t: number; p: number }[] });
  const tgt = { get current() { return ph.current.to ?? Math.round(ph.current.pos); } };
  const [open, setOpen] = useState<string | null>(null);
  const [hov, setHov] = useState<number | null>(null); // レールで指している一着
  const [focus, setFocus] = useState<number | null>(null); // 大きく見ている一着
  const hs = useRef({ h: 0, on: 0 }); // 指している位置（なめらか）
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
    const r = () => setW(Math.max(220, Math.min(520, (stage.current?.clientWidth || 800) * (innerWidth < 720 ? 0.66 : 0.36))));
    r(); addEventListener('resize', r); return () => removeEventListener('resize', r);
  }, []);
  const nRef = useRef(n); nRef.current = n;
  const hovR = useRef<number | null>(null); hovR.current = hov;
  // レールは最初、全体の真ん中を見せる
  const centered = useRef(false);
  useEffect(() => { if (!centered.current && n) { centered.current = true; ph.current.pos = ph.current.to = Math.floor((n - 1) / 2); } }, [n]);
  useEffect(() => {
    let raf = 0, last = performance.now(), lastIdx = 0;
    const tick = (now: number) => {
      const f = Math.min(3, (now - last) / 16.7); last = now;
      const s = ph.current, N = Math.max(1, nRef.current);
      const v0 = s.vel;
      if (!s.drag) {
        if (s.to !== null) { s.vel = (s.vel + (s.to - s.pos) * 0.055 * f) * Math.pow(0.8, f); if (Math.abs(s.to - s.pos) < 0.002 && Math.abs(s.vel) < 0.002) { s.pos = s.to; s.vel = 0; s.to = null; } }
        else {
          s.vel *= Math.pow(0.955, f); // すべりの摩擦
          if (s.pos < 0) s.vel += -s.pos * 0.12 * f; // 端のゴム
          if (s.pos > N - 1) s.vel += (N - 1 - s.pos) * 0.12 * f;
          if (Math.abs(s.vel) < 0.03) { const k = Math.round(Math.max(0, Math.min(N - 1, s.pos))); s.vel += (k - s.pos) * 0.03 * f; s.vel *= Math.pow(0.88, f); } // 近い一着に吸い付く
        }
        s.pos += s.vel * f;
      }
      // ゆれ：レールの加速度で服が振り子のように揺れる
      const acc = s.drag ? 0 : (s.vel - v0) / f;
      const dv = s.drag && s.hist.length > 1 ? (s.hist[s.hist.length - 1].p - s.hist[s.hist.length - 2].p) : 0;
      s.swayV += (-(acc + dv * 0.25) * 240 - s.sway * 0.07 - s.swayV * 0.09) * f;
      s.sway = Math.max(-16, Math.min(16, s.sway + s.swayV * f));
      const k = Math.round(Math.max(0, Math.min(N - 1, s.pos)));
      if (k !== lastIdx) { lastIdx = k; sfx('tick'); }
      const H = hs.current, tg = hovR.current;
      if (tg !== null) { H.h += (tg - H.h) * Math.min(1, 0.22 * f); H.on += (1 - H.on) * Math.min(1, 0.2 * f); } else H.on += (0 - H.on) * Math.min(1, 0.15 * f);
      setFrame({ pos: s.pos, sway: s.sway, t: now / 1000 });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, []);
  const go = (k: number) => { ph.current.to = Math.max(0, Math.min(n - 1, k)); };
  useEffect(() => { if (ph.current.pos > n - 1) go(n - 1); }, [n]); // eslint-disable-line react-hooks/exhaustive-deps
  // キー
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return;
      if (focus !== null) { if (e.key === 'ArrowRight') { const j = (focus + 1) % n; setFocus(j); setHov(j); } if (e.key === 'ArrowLeft') { const j = (focus - 1 + n) % n; setFocus(j); setHov(j); } if (e.key === 'Escape' && !open) setFocus(null); return; }
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
  const onWheel = (e: React.WheelEvent) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const s = ph.current; s.to = null; s.vel = Math.max(-0.6, Math.min(0.6, s.vel + d * 0.0011));
  };
  const scale = () => (view === 'rail' ? railGap(w) : w * 0.7);

  const add = (id: string) => { setCart((c) => (c.includes(id) ? c : [...c, id])); sfx('coin'); };
  const inCart = all.filter((i) => cart.includes(i.id));
  const pad2 = (v: number) => String(v).padStart(2, '0');
  const story = (i: (typeof all)[number]) => (lang === 'ja' && i.pid ? PROJECTS.find((p) => p.id === i.pid)?.story[1] : i.desc);

  return (
    <div className={`rs ${view} ${view === 'rail' && focus !== null ? 'focused' : ''}`} translate="no">
      <header className="rs-top">
        <div className="rs-row1">
          <a href="/shop">[ ← SHOP ]</a>
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
        onPointerDown={(e) => { const s = ph.current; drag.current = { x: e.clientX, p: s.pos, moved: false }; s.to = null; s.vel = 0; s.hist = [{ t: performance.now(), p: s.pos }]; }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return; const s = ph.current;
          const dx = e.clientX - d.x;
          if (!d.moved && Math.abs(dx) > 5) { d.moved = true; s.drag = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }
          if (!d.moved) return;
          let p = d.p - dx / scale();
          const N = n - 1; if (p < 0) p = p * 0.35; if (p > N) p = N + (p - N) * 0.35; // 端は重く
          s.pos = p; s.hist.push({ t: performance.now(), p }); if (s.hist.length > 8) s.hist.shift();
        }}
        onPointerUp={() => {
          const d = drag.current; drag.current = null; const s = ph.current;
          if (!d?.moved) return;
          // 指を離した速さのまま、すべり続ける
          const h = s.hist, a = h[0], b = h[h.length - 1], dt = Math.max(16, b.t - a.t);
          s.vel = Math.max(-0.9, Math.min(0.9, ((b.p - a.p) / dt) * 16.7)); s.drag = false;
          dragged.current = true; setTimeout(() => { dragged.current = false; }, 60);
        }}
        onPointerCancel={() => { drag.current = null; ph.current.drag = false; }}
        style={{ ['--w' as string]: `${w}px` }}
      >
        {view === 'rail' && (
          // 床置きのハンガーラック：上の棒・左右の支柱・床の脚とキャスター・床の影
          <div className="rs-rail" aria-hidden style={{ width: `min(94%, ${Math.round((n - 1) * railGap(w) + w * 1.5)}px)` }}><i /><b /><b /><u /><u /><em /></div>
        )}
        <div className="rs-track" onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHov(null); }}>
          {all.map((it, i) => {
            const d = i - pos;
            if (view === 'lineup' && Math.abs(d) > 4) return null;
            const front = i === idx;
            return (
              <button
                key={it.id}
                className={`rs-piece ${it.kind} ${it.img ? 'photo' : 'cut'} ${(view === 'rail' ? hov === i : front) ? 'front' : ''}`}
                style={view === 'rail' ? hoverStyle(i, pos, hs.current.h, hs.current.on, w) : lineStyle(d, w)}
                onPointerEnter={(e) => { if (view === 'rail' && e.pointerType === 'mouse') { if (hov !== i) sfx('tick'); setHov(i); } }}
                onClick={(ev) => {
                  if (dragged.current) return;
                  if (view === 'rail') {
                    if (matchMedia('(hover: hover)').matches) { sfx('open'); setFocus(i); return; }
                    // タッチ：服が重なっているので、触った横位置から一着を決める（1回目で飛び出し、2回目で大きく）
                    const r = stage.current!.getBoundingClientRect(), dx = ev.clientX - (r.left + r.width / 2);
                    const gap = railGap(w), H = hs.current, sp = w * 0.46 * H.on;
                    const xh = (H.h - pos) * gap;
                    let k = Math.abs(dx - xh) < w * 0.3 * H.on ? Math.round(H.h) : Math.round(pos + (dx - Math.sign(dx - xh) * sp) / gap);
                    k = Math.max(0, Math.min(n - 1, k));
                    if (hov === k && H.on > 0.6) { sfx('open'); setFocus(k); } else { sfx('tick'); setHov(k); }
                    return;
                  }
                  if (front) { sfx('open'); setOpen(it.id); } else go(i);
                }}
                aria-label={front ? t(`${it.title}, open`, `${it.title} を開く`) : it.title}
              >
                <span className="rs-swing" style={view === 'rail' ? { transform: `rotate(${(frame.sway * (0.75 + ((i * 0.37) % 1) * 0.5) + Math.sin(frame.t * 0.9 + i * 1.7) * 0.35 * (1 - Math.min(1, Math.abs(i - hs.current.h) / 3) * hs.current.on)).toFixed(2)}deg)` } : undefined}>
                  {view === 'rail' && (it.kind === 'garment' && !it.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="rs-hanger" src={HANGER_URL} alt="" draggable={false} />
                  ) : (
                    <svg className="rs-hook" viewBox="0 0 40 70" aria-hidden><defs><linearGradient id="rsm" x1="0" x2="1"><stop offset="0" stopColor="#6d6f73" /><stop offset=".45" stopColor="#f2f3f5" /><stop offset="1" stopColor="#7c7f84" /></linearGradient></defs><path d="M20 2 c-8 0 -9 11 -1 13 v22" fill="none" stroke="url(#rsm)" strokeWidth="3.4" strokeLinecap="round" /><path d={it.kind === 'art' ? 'M20 37 L2 66 M20 37 L38 66' : 'M20 37 v20'} stroke="#555" strokeWidth="1.2" /></svg>
                  ))}
                  <span className="rs-body">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.src} alt="" draggable={false} className={view === 'rail' && (it.kind === 'art' || it.img) ? (it.img ? 'card' : 'framed') : ''} />
                    {view === 'rail' && !it.img && it.kind !== 'art' && (
                      // 横を向いているあいだは陰になり、正面に回ると光が当たる
                      <i className="rs-shade" style={{ WebkitMaskImage: `url("${it.src}")`, maskImage: `url("${it.src}")`, opacity: (1 - faceOut(i, hs.current.h, hs.current.on)) * 0.9, background: `linear-gradient(90deg, rgba(0,0,0,${i - pos >= 0 ? 0.08 : 0.5}), rgba(0,0,0,${i - pos >= 0 ? 0.5 : 0.08}))` }} />
                    )}
                  </span>
                </span>
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

      {view === 'rail' && focus === null && (
        <div className="rs-cap rs-hcap">
          <span className="rs-mono">{hov !== null ? `${pad2(hov + 1)} / ${pad2(n)} · ${all[hov].code}` : `${n} ${t('PIECES', '点')}`}</span>
          <b><Scr text={hov !== null ? `${all[hov].title.toUpperCase()} — ${all[hov].sub.toUpperCase()}` : t('HOVER THE RAIL', 'レールに触れて選ぶ')} /></b>
          <span className="rs-mono">{hov !== null ? all[hov].price : t('Tap a piece to see it large', '服をタップすると大きく見られます')}</span>
        </div>
      )}
      {view === 'lineup' && cur && (
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

      {view === 'rail' && focus !== null && all[focus] && (() => {
        const f = all[focus];
        const step = (k: number) => { const j = (focus + k + n) % n; setFocus(j); setHov(j); sfx('tick'); };
        return (
          <section className="rs-focus" key={f.id}
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).dataset.x = String(e.clientX); }}
            onPointerUp={(e) => { const x0 = Number((e.currentTarget as HTMLElement).dataset.x || e.clientX), dx = e.clientX - x0; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); }}>
            <button className="rs-fclose" onClick={() => setFocus(null)}>[ {t('Close', '閉じる')} ]</button>
            <b className="rs-fnum" aria-hidden>{pad2(focus + 1)}</b>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={`rs-fimg ${f.img ? 'photo' : ''}`} src={f.src} alt="" draggable={false} />
            <div className="rs-finfo">
              <Scr className="rs-fname" text={f.title.toUpperCase()} />
              <span className="rs-mono">{f.sub} · {f.code}</span>
              <span className="rs-fbtns">
                {f.buy === 'stripe' ? <BuyButton itemId={f.id} label={`${t('Buy', '購入')} — ${f.price}`} /> : f.buy === 'sold' ? <span className="rs-pill off">SOLD</span> : <button className="rs-pill" onClick={() => add(f.id)}>{cart.includes(f.id) ? t('In cart ✓', 'カートに入っています ✓') : `${t('Add', 'カートに入れる')} — ${f.price}`}</button>}
                <button className="rs-pill ghost" onClick={() => setOpen(f.id)}>{t('Details', '詳細')}</button>
              </span>
            </div>
            <button className="rs-farrow l" onClick={() => step(-1)} aria-label={t('Previous', '前へ')}>‹</button>
            <button className="rs-farrow r" onClick={() => step(1)} aria-label={t('Next', '次へ')}>›</button>
          </section>
        );
      })()}

      <footer className="rs-foot">
        <div className="rs-big" aria-hidden>GALLERY CRYPTO</div>
        <div className="rs-ticker" aria-hidden>
          <div>{Array.from({ length: 2 }, (_, k) => <span key={k}>{['ONE OF ONE', 'RECORDED ON CHAIN', 'NFC TAGGED', 'DROP 01 — ' + pad2(n) + ' PIECES', 'NO RESTOCKS', 'ARCHIVE · ART · OBJECTS', 'TOKYO', 'SALES OPEN 2027'].map((s) => <i key={s}>{s}</i>)}</span>)}</div>
        </div>
        <p className="rs-hint">{view === 'rail' ? t('Hover the rail · click a piece to see it large · drag to pan', 'レールに触れて選ぶ · タップで大きく · ドラッグで横に送る') : t('Slide to browse · tap the piece in front to buy', 'スライドで選ぶ · 正面の商品をタップで購入画面へ')}</p>
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
      {panel === 'add' && <AddPiece onAdd={(it) => { setLocal((l) => [it, ...l]); setPanel(''); go(0); }} />}
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
