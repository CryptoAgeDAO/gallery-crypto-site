'use client';
// 白い売り場に、一本のハンガーレール。服は肩を寄せて掛かっていて、指すと少し持ち上がって揺れる。
// 押すと、その一着がレールの真ん中に寄って大きくなり、ほかの服は左右によけてぼける（商品ページ）。
// 名前・価格・前／寄り（ディテール）・サイズ・購入ボタン・記録へのリンクがその下に出る。
// ショップのトップ・商品ページ・レールのページ・ショールームで共通に使う。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Rail3DState } from './Rail3D';
import { useLang } from '../Lang';
import { sfx } from '@/lib/sfx';
import BuyButton from '../BuyButton';
import { HANGER_URL } from './garmentArt';
import { AddToCart, QuickAdd } from '../cart/Cart';
import { lineOf } from '../cart/lineOf';

export type RailItem = {
  id: string; code: string; title: string; sub: string; price: string;
  src: string; back?: string; img?: string; facts: [string, string][];
  buy: 'stripe' | 'demo' | 'sold' | 'local'; passport?: string; kind?: 'garment' | 'cap' | 'art'; line?: string;
  group?: string; color?: string; hex?: string;
};

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const Rail3D = dynamic(() => import('./Rail3D'), { ssr: false });

// 背景つきの絵（キャップ・アートの見本）は、四隅の色を抜いて切り抜きにする
const keyed = new Map<string, Promise<string>>();
function keyOut(src: string): Promise<string> {
  let p = keyed.get(src);
  if (!p) {
    p = new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        try {
          const k = Math.min(1, 700 / Math.max(im.naturalWidth || 700, im.naturalHeight || 700));
          const c = document.createElement('canvas'); c.width = Math.round((im.naturalWidth || 700) * k); c.height = Math.round((im.naturalHeight || 700) * k);
          const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(im, 0, 0, c.width, c.height);
          const d = g.getImageData(0, 0, c.width, c.height), q = d.data, W2 = c.width, H2 = c.height;
          let r = 0, gg = 0, b = 0; for (const i of [0, W2 - 1, (H2 - 1) * W2, H2 * W2 - 1]) { r += q[i * 4] / 4; gg += q[i * 4 + 1] / 4; b += q[i * 4 + 2] / 4; }
          // 外周から背景色に近い画素だけをたどって抜く（中の白い部分は残す）
          const far = (i: number) => Math.hypot(q[i * 4] - r, q[i * 4 + 1] - gg, q[i * 4 + 2] - b);
          const seen = new Uint8Array(W2 * H2), st: number[] = [];
          for (let x = 0; x < W2; x++) st.push(x, (H2 - 1) * W2 + x); for (let y = 0; y < H2; y++) st.push(y * W2, y * W2 + W2 - 1);
          while (st.length) { const i = st.pop()!; if (seen[i]) continue; seen[i] = 1; const f = far(i); if (f > 46) continue; q[i * 4 + 3] = Math.max(0, Math.min(255, (f - 22) * 10)); const x = i % W2; if (x > 0) st.push(i - 1); if (x < W2 - 1) st.push(i + 1); if (i >= W2) st.push(i - W2); if (i < (H2 - 1) * W2) st.push(i + W2); }
          g.putImageData(d, 0, 0); res(c.toDataURL('image/png'));
        } catch { res(src); }
      };
      im.onerror = () => res(src); im.src = src;
    });
    keyed.set(src, p);
  }
  return p;
}
function Pic({ it, onAsp, back = false, hide = false }: { it: RailItem; onAsp: (r: number) => void; back?: boolean; hide?: boolean }) {
  const cut = (it.kind || 'garment') !== 'garment' && !it.img;
  const want = back && it.back ? it.back : it.src;
  const [src, setSrc] = useState(cut ? '' : want);
  useEffect(() => { if (!cut) { setSrc(want); return; } let on = true; keyOut(want).then((u) => on && setSrc(u)); return () => { on = false; }; }, [want, cut]);
  if (!src) return <span className="hr-ph" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={it.title} draggable={false} className={`${it.img ? 'photo' : ''} ${hide ? 'ghost' : ''}`} onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth) onAsp(im.naturalHeight / im.naturalWidth); }} />;
}

export default function HangRail({ items, focusId, onFocus, mode = 'page', renderBuy, dark = false, solid = false }: {
  items: RailItem[];
  focusId: string | null;
  onFocus: (id: string | null) => void;
  mode?: 'page' | 'section';
  renderBuy?: (it: RailItem) => React.ReactNode;
  dark?: boolean;
  solid?: boolean; // 服を立体（3D）で描く（スマートスキャンと同じしくみ）
}) {
  const { t } = useLang();
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1200, h: 760 });
  const [shift, setShift] = useState(0);
  const [hov, setHov] = useState<number | null>(null);
  const [view, setView] = useState<'front' | 'back' | 'detail'>('front');
  const [asp, setAsp] = useState<Record<string, number>>({}); // 絵の縦横比（高さ／幅）
  const k = focusId ? items.findIndex((i) => i.id === focusId) : -1;
  const n = items.length;
  // 立体の層とやりとりする値
  const pcEls = useRef<(HTMLDivElement | null)[]>([]);
  const s3 = useRef<Rail3DState>({ k: -1, view: 'front', spin: 0, dragging: false });
  const [solidOk, setSolidOk] = useState<Record<string, boolean>>({});
  const onReady = useCallback((id: string, ok: boolean) => setSolidOk((o) => (o[id] === ok ? o : { ...o, [id]: ok })), []);

  useIso(() => {
    const el = host.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setView('front'); s3.current.spin = 0; }, [focusId]);
  s3.current.k = k; s3.current.view = view;

  // ---- 大きさと位置 ----
  const { w: W, h: H } = box;
  const phone = W < 700;
  const railY = mode === 'section' ? 46 : phone ? Math.max(84, H * 0.16) : Math.max(96, H * 0.15);
  // 一着の幅：並べたときにレールがちょうど埋まる大きさ（大きすぎず、小さすぎず）
  const G = phone ? Math.min(W * 0.52, mode === 'section' ? H * 0.55 : 230) : Math.max(120, Math.min(mode === 'section' ? H * 0.5 : H * 0.36, 300, (W - 140) / (Math.max(1, n - 1) * 0.62 + 1)));
  const fullGap = phone ? G * 0.5 : G * 0.62;
  // スマホは詰めすぎず、横にドラッグして送る
  const gap = n > 1 ? (phone ? fullGap : Math.max(G * 0.34, Math.min(fullGap, (W - G - 64) / (n - 1)))) : 0;
  const span = (n - 1) * gap;
  const maxShift = Math.max(0, (span - (W - G - 48)) / 2);
  // はじめはレールの左端から見せる
  const started = useRef(false);
  useEffect(() => { if (!started.current && maxShift > 0 && box.w !== 1200) { started.current = true; setShift(maxShift); } }, [maxShift, box.w]);
  const hOf = (i: number) => G * (asp[items[i]?.id] || 1.05) + G * 0.2; // ハンガー込みの高さ
  const focusH = mode === 'section' ? H * 0.6 : phone ? H * 0.42 : H * 0.56;
  const S = k >= 0 ? Math.min(2.6, Math.max(1.2, focusH / hOf(k))) : 1;
  const place = (i: number) => {
    if (k < 0) {
      const lift = hov === i ? -6 : 0;
      return { x: (i - (n - 1) / 2) * gap + shift, y: lift, s: hov === i ? 1.05 : 1, blur: 0, op: 1, z: hov === i ? 200 : 100 + i };
    }
    const d = i - k;
    if (!d) return { x: 0, y: 0, s: S, blur: 0, op: 1, z: 300 };
    const side = G * S * 0.5 + G * (phone ? 0.05 : 0.45) + (Math.abs(d) - 1) * gap * 0.62;
    return { x: Math.sign(d) * side, y: 0, s: 0.92, blur: phone ? 5 : 7, op: Math.max(0.12, 0.5 - (Math.abs(d) - 1) * 0.12), z: 150 - Math.abs(d) };
  };

  // ---- ゆれ（ハンガーごと、ばねで） ----
  const sw = useRef<{ a: number; v: number }[]>([]);
  const swEls = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    let raf = 0, prev = performance.now();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      for (let i = 0; i < swEls.current.length; i++) {
        const q = (sw.current[i] ||= { a: 0, v: 0 }); const e = swEls.current[i]; if (!e) continue;
        q.v += (-q.a * 26 - q.v * 2.6) * dt; q.a += q.v * dt;
        const idle = reduce ? 0 : Math.sin(now / 1000 * 0.9 + i * 1.7) * 0.35;
        e.style.transform = `rotate(${(q.a + idle).toFixed(3)}deg)`;
      }
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, []);
  const kick = (i: number, f: number) => { const q = (sw.current[i] ||= { a: 0, v: 0 }); q.v += f; };
  const kickAll = (f: number) => { for (let i = 0; i < n; i++) kick(i, f * (0.7 + ((i * 37) % 10) / 20)); };

  // ---- 操作 ----
  const step = useCallback((d: number) => { if (k < 0 || n < 2) return; const j = (k + d + n) % n; onFocus(items[j].id); kickAll(-d * 22); sfx('tick'); }, [k, n, items, onFocus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (k < 0) return;
      if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'Escape') onFocus(null);
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [k, step, onFocus]);
  // 横にドラッグ：一覧ではレールを送る、商品ページでは前後の服へ
  const drag = useRef<{ x: number; s: number; moved: boolean; spin: boolean; sp0: number } | null>(null);
  const down = (e: React.PointerEvent) => {
    // 立体の服を見ているときは、その服の上でドラッグすると回る（360°）
    const onCur = solid && k >= 0 && items[k] && solidOk[items[k].id] && !!(e.target as HTMLElement).closest('.hr-slot.on');
    drag.current = { x: e.clientX, s: shift, moved: false, spin: !!onCur, sp0: s3.current.spin };
    if (onCur) { s3.current.dragging = true; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 無視 */ } }
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return; const dx = e.clientX - d.x;
    if (Math.abs(dx) > 6) d.moved = true;
    if (d.spin) { s3.current.spin = d.sp0 + dx * 0.012; return; }
    if (k < 0 && d.moved && maxShift > 0) { const s = Math.max(-maxShift, Math.min(maxShift, d.s + dx)); kickAll((s - shift) * 0.6); setShift(s); }
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null; s3.current.dragging = false; if (!d) return;
    if (d.spin) return;
    if (k >= 0 && d.moved) { const dx = e.clientX - d.x; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); }
  };
  const wheel = (e: React.WheelEvent) => {
    if (k >= 0 || maxShift <= 0 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    const s = Math.max(-maxShift, Math.min(maxShift, shift - e.deltaX)); kickAll((s - shift) * 0.5); setShift(s);
  };
  const pick = (i: number) => { if (drag.current?.moved) return; kick(i, 40); sfx('open'); onFocus(items[i].id); };

  const cur = k >= 0 ? items[k] : null;
  const sizes = (it: RailItem) => { const v = it.facts.find((f) => /^size$/i.test(f[0]))?.[1]; return v ? [v.split(/\s*—\s*/)[0]] : ['ONE SIZE']; };
  const infoTop = railY + (cur ? hOf(k) * S : 0) + (phone ? 6 : 14);

  return (
    <div ref={host} className={`hr ${mode} ${dark ? 'dark' : ''} ${cur ? 'focus' : ''} ${solid ? 'solid' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; s3.current.dragging = false; }} onWheel={wheel} onScroll={(e) => { const el = e.currentTarget; if (el.scrollLeft || el.scrollTop) { el.scrollLeft = 0; el.scrollTop = 0; } }}>
      {/* レール（クロームの丸棒と、両端の支柱） */}
      <div className="hr-rail" style={{ top: railY - 3 }}><i /><i /></div>
      {solid && <Rail3D items={items} host={host} pcEls={pcEls} sway={sw} state={s3} onReady={onReady} />}
      {items.map((it, i) => {
        const p = place(i), kind = it.kind || 'garment';
        return (
          <div key={it.id} className={`hr-slot ${i === k ? 'on' : ''} ${kind}`}
            style={{ width: G, top: railY - G * 0.04, zIndex: p.z, transform: `translateX(calc(${p.x}px - 50%)) translateY(${p.y}px) scale(${p.s})`, filter: p.blur ? `blur(${p.blur}px)` : undefined, opacity: p.op }}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse' && k < 0) { setHov(i); kick(i, 30); } }}
            onPointerLeave={() => setHov((h) => (h === i ? null : h))}
            onClick={() => (i === k ? undefined : pick(i))}
            role="button" tabIndex={0} aria-label={it.title} onKeyDown={(e) => { if (e.key === 'Enter') pick(i); }}>
            <div className="hr-swing" ref={(e) => { swEls.current[i] = e; }}>
              {kind === 'garment'
                ? <img className="hr-hanger" src={HANGER_URL} alt="" draggable={false} /> // eslint-disable-line @next/next/no-img-element
                : <span className="hr-clip" />}
              <div className={`hr-pc ${i === k && view === 'detail' ? 'zoom' : ''}`} ref={(e) => { pcEls.current[i] = e; }}>
                <Pic it={it} hide={solid && !!solidOk[it.id] && (k < 0 || i === k) && !(i === k && view === 'detail')} back={i === k && view === 'back' && !(solid && solidOk[it.id])} onAsp={(r) => setAsp((a) => (a[it.id] === r ? a : { ...a, [it.id]: r }))} />
              </div>
              {/* 値札（紙のタグ） */}
              <span className="hr-tag"><b>{it.code}</b><em>{it.price}</em></span>
            </div>
            {/* レールに掛かったまま、その場でカートに */}
            {k < 0 && <QuickAdd line={lineOf(it)} className="hr-qa" />}
          </div>
        );
      })}

      {cur && mode === 'page' && (
        <div className="hr-info" style={{ top: infoTop }} key={cur.id} onPointerDown={(e) => e.stopPropagation()}>
          <h2>{cur.title}</h2>
          <span className="hr-price">{cur.price}{cur.buy === 'demo' || cur.buy === 'local' ? <em> · {t('Sample', '見本')}</em> : null}</span>
          <div className="hr-seg" role="tablist">
            <button aria-pressed={view === 'front'} onClick={() => setView('front')}>{t('Front', '正面')}</button>
            {cur.back && <button aria-pressed={view === 'back'} onClick={() => setView('back')}>{t('Back', '背中')}</button>}
            <button aria-pressed={view === 'detail'} onClick={() => setView('detail')}>{t('Detail', '寄り')}</button>
          </div>
          {/* 色展開：同じ型の色違い */}
          {(() => { const sib = cur.group ? items.filter((x) => x.group === cur.group) : []; return sib.length > 1 ? (
            <div className="gc-swatches" role="radiogroup" aria-label={t('Colour', 'カラー')}>
              {sib.map((x) => <button key={x.id} role="radio" aria-checked={x.id === cur.id} aria-current={x.id === cur.id} title={x.color} style={{ background: x.hex }} onClick={() => onFocus(x.id)} />)}
              <small>{cur.color} · {sib.length} {t('colours', '色')}</small>
            </div>
          ) : null; })()}
          <div className="hr-sizes">{sizes(cur).map((s) => <span key={s} className="on">{s}</span>)}<small>{cur.line ? t('Sample line', '見本ライン') : t('One of one', '一点もの')}</small></div>
          <div className="hr-buy">
            {renderBuy ? renderBuy(cur) : (
              <>
                {cur.buy === 'stripe' && <BuyButton itemId={cur.id} />}
                {cur.buy === 'sold' && <span className="hr-btn off">{t('Sold', '売約済み')}</span>}
                {cur.buy !== 'sold' && <AddToCart line={lineOf(cur)} />}
              </>
            )}
          </div>
          {solid && solidOk[cur.id] && view !== 'detail' && <small className="hr-spin">{t('3D from the photos — drag the piece to turn it', '写真から立体に — 服をドラッグで回せます')}</small>}
          {cur.passport && <a className="hr-rec" href={cur.passport}>{t('See its record', 'この一着の記録を見る')} →</a>}
        </div>
      )}

      {cur && (
        <>
          <button className="hr-x" onClick={() => onFocus(null)} aria-label={t('Back to the rail', 'レールに戻す')}>×</button>
          {n > 1 && <button className="hr-ar l" onClick={() => step(-1)} aria-label={t('Previous', '前へ')}>‹</button>}
          {n > 1 && <button className="hr-ar r" onClick={() => step(1)} aria-label={t('Next', '次へ')}>›</button>}
        </>
      )}
      {!cur && mode === 'page' && <p className="hr-hint">{phone ? t('Tap a piece to take it off the rail · swipe to slide the rail', '押すとレールから外して見る · 横にスワイプでレールを送る') : t('Hover to lift a piece · click to take it off the rail · drag to slide the rail', '指すと持ち上がる · 押すとレールから外して見る · 横にドラッグでレールを送る')}</p>}
    </div>
  );
}
