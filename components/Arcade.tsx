'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { photoUrl } from '@/lib/supabase';
import { ERA_LABEL, certNo, usd, type Item, type Settings } from '@/lib/types';
import { sfx } from '@/lib/sfx';

// トップの「タイトル画面」と、アーカイブの「キャラクター選択画面」。
// 1990年代の対戦格闘ゲーム風。ロゴ・キャラクター・書体は既存ゲームのものを使わず、このサイト用に作っている。
// 商品（Tシャツ）が「キャラクター」。空き枠は「？」の鍵つき枠で、これから登場することを表す。

const TEE_PATH = 'M30 8 L40 5 Q50 15 60 5 L70 8 L93 23 L84 39 L74 33 L74 95 Q50 98 26 95 L26 33 L16 39 L7 23 Z';
const FILTERS: [string, string][] = [
  ['all', 'All'],
  ['80s', '80s'],
  ['90s', '90s'],
  ['00s', '2000s'],
];

function Silhouette({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <path d={TEE_PATH} />
      <text x="50" y="66" textAnchor="middle">?</text>
    </svg>
  );
}

export function TitleScreen({ s }: { s: Settings }) {
  const start = () => {
    sfx('fanfare');
    document.getElementById('archive')?.scrollIntoView({ behavior: 'smooth' });
  };
  return (
    <section className="ac-title" aria-label={s.headline}>
      <div className="ac-sky" aria-hidden />
      <div className="ac-city" aria-hidden />
      <div className="ac-logo-wrap">
        <p className="ac-pre">Tokyo · Founder&apos;s Archive</p>
        <h1 className="ac-logo" aria-label="Gallery Crypto">
          <span data-t="GALLERY">GALLERY</span>
          <span data-t="CRYPTO">CRYPTO</span>
        </h1>
        <p className="ac-sub">{s.launch}</p>
        <button className="ac-start" onClick={start}>
          Press start
        </button>
      </div>
      <div className="ac-credit" aria-hidden>
        <span>© 2026 Gallery Crypto</span>
        <span>Free play</span>
      </div>
    </section>
  );
}

type Slot = { it: Item | null; n: number };

export function SelectScreen({ items, s, onOpen }: { items: Item[]; s: Settings; onOpen: (it: Item) => void }) {
  const [flt, setFlt] = useState('all');
  const shown = flt === 'all' ? items : items.filter((it) => it.era === flt);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, '80s': 0, '90s': 0, '00s': 0 };
    items.forEach((it) => c[it.era] != null && c[it.era]++);
    return c;
  }, [items]);
  // 名簿：商品のあとに「？」の枠を足して、6の倍数（最低12枠）にそろえる
  const slots: Slot[] = useMemo(() => {
    const total = Math.max(12, Math.ceil((shown.length + 1) / 6) * 6);
    return Array.from({ length: total }, (_, i) => ({ it: shown[i] || null, n: i + 1 }));
  }, [shown]);
  const [cur, setCur] = useState(0);
  const sel = slots[Math.min(cur, slots.length - 1)];
  const gridRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(30);

  useEffect(() => setCur(0), [flt]);

  // 対戦ゲームの選択時間（見た目だけ。0になったら30に戻る）
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    let t: number | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (t) clearInterval(t);
      t = undefined;
      if (e.isIntersecting) t = window.setInterval(() => setTime((v) => (v <= 0 ? 30 : v - 1)), 1000);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      if (t) clearInterval(t);
    };
  }, []);

  const move = (i: number) => {
    if (i === cur) return;
    sfx('tick');
    setCur(i);
  };
  const choose = (sl: Slot) => {
    if (sl.it) {
      sfx('open');
      onOpen(sl.it);
    } else {
      sfx('select');
      document.getElementById('presale')?.scrollIntoView({ behavior: 'smooth' });
    }
  };
  const key = (e: React.KeyboardEvent) => {
    const cols = window.matchMedia('(min-width: 900px)').matches ? 6 : 4;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (d) {
      e.preventDefault();
      const n = Math.min(slots.length - 1, Math.max(0, cur + d));
      move(n);
      (gridRef.current?.children[n] as HTMLElement | undefined)?.focus();
    }
  };

  const it = sel?.it;
  const specs: [string, string][] = it
    ? ([
        ['Year', it.year],
        ['Era', ERA_LABEL[it.era] || ''],
        ['Size', it.size ? it.size.toUpperCase() : ''],
        ['Made in', it.made_in],
        ['Stitch', it.stitch ? 'Single' : ''],
        ['Tag', it.tag],
      ] as [string, string][]).filter((r) => r[1])
    : [];

  return (
    <section className="ac-sel" id="archive" aria-label="Archive">
      <div className="ac-hud">
        <span className="ac-1p">1P</span>
        <h2>Select your tee</h2>
        <span className="ac-time" aria-hidden>
          <i>Time</i>
          {String(time).padStart(2, '0')}
        </span>
      </div>

      {items.length > 0 && (
        <div className="ac-flt" role="tablist" aria-label="Filter by decade">
          {FILTERS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={flt === k} onClick={() => (sfx('select'), setFlt(k))}>
              {l}
              <sup>{counts[k]}</sup>
            </button>
          ))}
        </div>
      )}

      <div className="ac-stage">
        <div className="ac-fighter" key={`${flt}-${cur}`}>
          {it ? (
            it.photos?.[0] ? (
              <img src={photoUrl(it.photos[0])} alt={`${it.band} ${it.title}`.trim()} />
            ) : (
              <Silhouette className="ac-sil" />
            )
          ) : (
            <Silhouette className="ac-sil" />
          )}
          <span className="ac-floor" aria-hidden />
        </div>

        <div className="ac-info">
          <p className="ac-no">{it ? certNo(it) : `No.${String(sel?.n || 1).padStart(3, '0')}`}</p>
          <p className="ac-name" data-t={it ? it.band || 'Untitled' : 'Coming soon'}>
            {it ? it.band || 'Untitled' : 'Coming soon'}
          </p>
          <p className="ac-tl">{it ? it.title || 'Vintage band tee' : 'A new challenger arrives in 2027'}</p>
          {it ? (
            <dl className="ac-specs">
              {specs.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="ac-lock">This slot is still locked. The pieces are being photographed one by one — enter the free draw to be first in line.</p>
          )}
          <div className="ac-act">
            <button className="ac-go" onClick={() => sel && choose(sel)}>
              {it ? 'Select' : 'Enter the draw'}
            </button>
            {it && (it.sold ? <span className="ac-tag">Sold</span> : s.sale_open && it.price_usd ? <span className="ac-tag">{usd(it.price_usd)}</span> : null)}
          </div>
        </div>
      </div>

      <div className="ac-roster" ref={gridRef} role="listbox" aria-label="Pieces" onKeyDown={key}>
        {slots.map((sl, i) => (
          <button
            key={sl.it?.id || `lock-${i}`}
            role="option"
            aria-selected={i === cur}
            aria-label={sl.it ? `${sl.it.band || 'Untitled'} ${certNo(sl.it)}` : `Locked slot ${sl.n}`}
            className={`ac-slot${sl.it ? '' : ' lock'}${i === cur ? ' on' : ''}`}
            tabIndex={i === cur ? 0 : -1}
            onPointerEnter={(e) => e.pointerType === 'mouse' && move(i)}
            onFocus={() => move(i)}
            onClick={() => (i === cur ? choose(sl) : move(i))}
          >
            {sl.it?.photos?.[0] ? <img src={photoUrl(sl.it.photos[0])} alt="" loading="lazy" /> : <Silhouette className="ac-sil" />}
            {i === cur && <b className="ac-cur">1P</b>}
          </button>
        ))}
      </div>
      <p className="ac-help">
        <span className="ac-k">←→</span> Move <span className="ac-k">Tap</span> Select
      </p>
    </section>
  );
}
