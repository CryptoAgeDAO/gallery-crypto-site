'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { photoUrl } from '@/lib/supabase';
import { ERA_LABEL, certNo, usd, type Item, type Settings } from '@/lib/types';
import { sfx } from '@/lib/sfx';

// 1980年代のアーケードゲーム風。トップは「タイトル画面」（コイン投入・PUSH START・遊び方のデモ）、
// アーカイブは「キャラクター選択画面」。ゲーム会社のロゴ・キャラクター・音は使わず、すべてこのサイト用。
// 隠しコマンド：↑↑↓↓←→←→BA（キーボード）。

const TEE_PATH = 'M30 8 L40 5 Q50 15 60 5 L70 8 L93 23 L84 39 L74 33 L74 95 Q50 98 26 95 L26 33 L16 39 L7 23 Z';
const FILTERS: [string, string][] = [
  ['all', 'All'],
  ['80s', '80s'],
  ['90s', '90s'],
  ['00s', '2000s'],
];
const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

function Silhouette({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <path d={TEE_PATH} />
      <text x="50" y="66" textAnchor="middle">?</text>
    </svg>
  );
}

// 隠しコマンドの入力を見張る
function useSecret(onHit: () => void) {
  useEffect(() => {
    let i = 0;
    const k = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      i = key === CODE[i] ? i + 1 : key === CODE[0] ? 1 : 0;
      if (i === CODE.length) {
        i = 0;
        onHit();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onHit]);
}

export function TitleScreen({ s, count }: { s: Settings; count: number }) {
  const [credit, setCredit] = useState(0);
  const [demo, setDemo] = useState(false);
  const [secret, setSecret] = useState(false);
  const [score, setScore] = useState(0);
  const idle = useRef(0);

  // 放っておくと「遊び方」のデモ画面と交互に切り替わる（アーケードのアトラクトモード）
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => {
      idle.current += 1;
      if (idle.current >= 7) {
        idle.current = 0;
        setDemo((d) => !d);
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const hit = useMemo(
    () => () => {
      sfx('a-power');
      setSecret(true);
      setScore((v) => v + 30000);
    },
    [],
  );
  useSecret(hit);

  const coin = () => {
    idle.current = 0;
    setDemo(false);
    sfx('a-coin');
    setCredit((c) => Math.min(9, c + 1));
    setScore((v) => v + 100);
  };
  const start = () => {
    idle.current = 0;
    if (!credit) return coin();
    setCredit((c) => c - 1);
    sfx('a-start');
    setTimeout(() => document.getElementById('archive')?.scrollIntoView({ behavior: 'smooth' }), 350);
  };

  return (
    <section className="ka-title" aria-label={s.headline} onPointerDown={() => (idle.current = 0)}>
      <div className="ka-stars" aria-hidden />
      <div className="ka-stars far" aria-hidden />
      <div className="ka-hud" aria-hidden>
        <span>
          <i>1UP</i>
          {String(score).padStart(6, '0')}
        </span>
        <span>
          <i>HI-SCORE</i>
          {String(Math.max(score, 27000)).padStart(6, '0')}
        </span>
        <span>
          <i>2UP</i>
          000000
        </span>
      </div>

      {!demo ? (
        <div className="ka-main" key="t">
          <h1 className="ka-logo" aria-label="Gallery Crypto">
            <span data-t="GALLERY">GALLERY</span>
            <span data-t="CRYPTO">CRYPTO</span>
          </h1>
          <p className="ka-sub">Founder&apos;s Archive</p>
          <button className="ka-push" onClick={start}>
            {credit ? 'Push start button' : 'Insert coin'}
          </button>
          {secret && <p className="ka-secret">★ Secret unlocked — you are first in line ★</p>}
          <p className="ka-copy">© 2026 Gallery Crypto · Tokyo</p>
        </div>
      ) : (
        <div className="ka-main ka-demo" key="d" onClick={() => setDemo(false)}>
          <p className="ka-h">How to play</p>
          <ol>
            <li>
              <b>1</b> Enter the free draw
            </li>
            <li>
              <b>2</b> Winners drawn in 2027
            </li>
            <li>
              <b>3</b> Buy your piece
            </li>
          </ol>
          <p className="ka-rank">
            {count ? `${count} ${count === 1 ? 'tee' : 'tees'} in the archive` : 'New tees arriving'} · {s.launch}
          </p>
        </div>
      )}

      <div className="ka-foot">
        <button className="ka-coin" onClick={coin}>
          Insert coin
        </button>
        <span className="ka-credit">Credit {String(credit).padStart(2, '0')}</span>
      </div>
      <div className="ka-crt" aria-hidden />
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

  // 選択時間（見た目だけ。0になったら30に戻る）
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
    sfx('a-move');
    setCur(i);
  };
  const choose = (sl: Slot) => {
    sfx('a-ok');
    if (sl.it) onOpen(sl.it);
    else document.getElementById('presale')?.scrollIntoView({ behavior: 'smooth' });
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
    <section className="ka-sel" id="archive" aria-label="Archive">
      <div className="ka-stars" aria-hidden />
      <div className="ka-selhud">
        <span className="ka-1p">1P</span>
        <h2>Select your tee</h2>
        <span className="ka-time" aria-hidden>
          <i>Time</i>
          {String(time).padStart(2, '0')}
        </span>
      </div>

      {items.length > 0 && (
        <div className="ka-flt" role="tablist" aria-label="Filter by decade">
          {FILTERS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={flt === k} onClick={() => (sfx('a-ok'), setFlt(k))}>
              {l}
              <sup>{counts[k]}</sup>
            </button>
          ))}
        </div>
      )}

      <div className="ka-stage">
        <div className="ka-fighter" key={`${flt}-${cur}`}>
          {it?.photos?.[0] ? <img src={photoUrl(it.photos[0])} alt={`${it.band} ${it.title}`.trim()} /> : <Silhouette className="ka-sil" />}
        </div>
        <div className="ka-info">
          <p className="ka-no">{it ? certNo(it) : `No.${String(sel?.n || 1).padStart(3, '0')}`}</p>
          <p className="ka-name">{it ? it.band || 'Untitled' : 'Coming soon'}</p>
          <p className="ka-tl">{it ? it.title || 'Vintage band tee' : 'A new challenger arrives in 2027'}</p>
          {it ? (
            <dl className="ka-specs">
              {specs.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="ka-lock">This slot is still locked. The pieces are being photographed one by one. Enter the free draw to be first in line.</p>
          )}
          <div className="ka-act">
            <button className="ka-go" onClick={() => sel && choose(sel)}>
              {it ? 'Select' : 'Enter the draw'}
            </button>
            {it && (it.sold ? <span className="ka-tag">Sold</span> : s.sale_open && it.price_usd ? <span className="ka-tag">{usd(it.price_usd)}</span> : null)}
          </div>
        </div>
      </div>

      <div className="ka-roster" ref={gridRef} role="listbox" aria-label="Pieces" onKeyDown={key}>
        {slots.map((sl, i) => (
          <button
            key={sl.it?.id || `lock-${i}`}
            role="option"
            aria-selected={i === cur}
            aria-label={sl.it ? `${sl.it.band || 'Untitled'} ${certNo(sl.it)}` : `Locked slot ${sl.n}`}
            className={`ka-slot${sl.it ? '' : ' lock'}${i === cur ? ' on' : ''}`}
            tabIndex={i === cur ? 0 : -1}
            onPointerEnter={(e) => e.pointerType === 'mouse' && move(i)}
            onFocus={() => move(i)}
            onClick={() => (i === cur ? choose(sl) : move(i))}
          >
            {sl.it?.photos?.[0] ? <img src={photoUrl(sl.it.photos[0])} alt="" loading="lazy" /> : <Silhouette className="ka-sil" />}
            {i === cur && <b className="ka-cur">1P</b>}
          </button>
        ))}
      </div>
      <p className="ka-help">Tap to move · tap again to select</p>
      <div className="ka-crt" aria-hidden />
    </section>
  );
}
