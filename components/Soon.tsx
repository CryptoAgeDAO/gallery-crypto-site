'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { onSfxChange, setSfx, sfx, sfxBoot, sfxEnabled } from '@/lib/sfx';

// アーカイブが空のあいだに出す「Coming soon」。
// 2000年ごろのパソコン画面風：半透明のキャンディカラー、ピンストライプのウィンドウ、つやのあるジェルボタン、拡大するドック。
// 既存OSのロゴやアイコンは使わず、絵はすべてこのサイト用。
// 起動時だけ、ゲームのタイトル画面風のロゴ演出（ドット絵）。

const CANDY = ['#0aa4c4', '#ff8a1f', '#8e5bd6', '#7cc520', '#ff4d6d', '#2f6fe0'];
const TEE_PATH = 'M30 8 L40 5 Q50 15 60 5 L70 8 L93 23 L84 39 L74 33 L74 95 Q50 98 26 95 L26 33 L16 39 L7 23 Z';

// 半透明でつやのあるTシャツ
function CandyTee({ color, className, faint }: { color: string; className?: string; faint?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".9" />
          <stop offset=".18" stopColor={color} stopOpacity={faint ? 0.35 : 0.75} />
          <stop offset="1" stopColor={color} stopOpacity={faint ? 0.25 : 0.95} />
        </linearGradient>
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={TEE_PATH} fill={`url(#b${id})`} stroke={color} strokeOpacity={faint ? 0.45 : 0.9} strokeWidth="1.5" strokeDasharray={faint ? '3 3' : undefined} />
      {!faint && <path d="M33 13 L42 9 Q50 18 58 9 L67 13 L67 40 Q50 46 33 40 Z" fill={`url(#h${id})`} opacity=".7" />}
      {!faint && <path d="M47 38 l9 -1 l-6 11 l8 -1 l-15 20 l5 -14 l-7 1 Z" fill="#fff" opacity=".85" />}
    </svg>
  );
}

function Folder({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe3ff" />
          <stop offset="1" stopColor="#3d8fe0" />
        </linearGradient>
      </defs>
      <path d="M10 26 h28 l8 8 h44 v50 h-80 Z" fill="#2f74c4" />
      <path d="M8 38 h84 l-4 48 h-76 Z" fill={`url(#f${id})`} />
      <path d="M12 42 h76 v10 q-38 6 -76 0 Z" fill="#fff" opacity=".45" />
    </svg>
  );
}

function Note({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <path d="M22 8 h42 l18 18 v66 h-60 Z" fill="#fff" stroke="#9aa6b2" strokeWidth="2" />
      <path d="M64 8 v18 h18" fill="#e8edf2" stroke="#9aa6b2" strokeWidth="2" />
      {[38, 48, 58, 68, 78].map((y) => (
        <rect key={y} x="30" y={y} width={y === 78 ? 24 : 42} height="3" rx="1.5" fill="#7cc520" opacity=".8" />
      ))}
    </svg>
  );
}

function Mail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <rect x="10" y="24" width="80" height="54" rx="6" fill="#ffe7c2" stroke="#ff8a1f" strokeWidth="2" />
      <path d="M12 28 L50 56 L88 28" fill="none" stroke="#ff8a1f" strokeWidth="3" />
    </svg>
  );
}

function Camera({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <rect x="12" y="12" width="76" height="76" rx="20" fill="none" stroke="#ff4d6d" strokeWidth="8" />
      <circle cx="50" cy="50" r="17" fill="none" stroke="#8e5bd6" strokeWidth="8" />
      <circle cx="71" cy="29" r="5" fill="#ff8a1f" />
    </svg>
  );
}

// 32×32 の大きなTシャツ（黒い輪郭・白地・灰色の影・赤い稲妻）
const POLY: [number, number][] = [
  [30, 8], [40, 5], [44, 10], [50, 12], [56, 10], [60, 5], [70, 8], [93, 23], [84, 39], [74, 33],
  [74, 96], [26, 96], [26, 33], [16, 39], [7, 23],
];
const BOLT = ['....###.', '...###..', '..###...', '.######.', '...###..', '..###...', '.###....', '.##.....', '##......'];
function inside(x: number, y: number) {
  let c = false;
  for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
    const [xi, yi] = POLY[i], [xj, yj] = POLY[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function bigTee() {
  const N = 32;
  const inn = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && inside(((x + 0.5) * 100) / N, ((y + 0.5) * 100) / N);
  const out: [number, number, string][] = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!inn(x, y)) continue;
      const edge = !inn(x - 1, y) || !inn(x + 1, y) || !inn(x, y - 1) || !inn(x, y + 1);
      const by = y - 13, bx = x - 11;
      const bolt = by >= 0 && by < BOLT.length && bx >= 0 && bx < 8 && BOLT[by][bx] === '#';
      out.push([x, y, edge ? '#000' : bolt ? '#d40000' : x >= 21 ? '#c0c0c0' : '#fff']);
    }
  return out;
}

type Win = 'archive' | 'soon';

function useDrag(desk: React.RefObject<HTMLDivElement>) {
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const st = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      st.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = st.current, d = desk.current?.getBoundingClientRect(), w = el.current;
      if (!s || !d || !w) return;
      const l = w.offsetLeft, t = w.offsetTop;
      setPos({
        x: Math.min(d.width - l - 80, Math.max(-l - w.offsetWidth + 80, s.ox + e.clientX - s.sx)),
        y: Math.min(d.height - t - 30, Math.max(-t, s.oy + e.clientY - s.sy)),
      });
    },
    onPointerUp: () => (st.current = null),
    onPointerCancel: () => (st.current = null),
  };
  return { el, pos, handlers };
}

export default function Soon({ instagram }: { instagram?: string | null }) {
  const desk = useRef<HTMLDivElement>(null);
  const drags = { archive: useDrag(desk), soon: useDrag(desk) };
  const [front, setFront] = useState<Win>('soon');
  const [hidden, setHidden] = useState<Record<Win, boolean>>({ archive: false, soon: false });
  const [clock, setClock] = useState('');
  const [candy, setCandy] = useState(0);
  const tee = useMemo(bigTee, []);

  // 起動画面：同じタブでは1回だけ。タップすると起動音が鳴る（ブラウザは最初のタップまで音を出せない）
  const [boot, setBoot] = useState<'boot' | 'fade' | 'done'>('done');
  const chimed = useRef(false);
  const [sound, setSound] = useState(true);
  useEffect(() => {
    setSound(sfxEnabled());
    const off = onSfxChange(setSound);
    let seen = false;
    try {
      seen = sessionStorage.getItem('gc-boot') === '1';
      sessionStorage.setItem('gc-boot', '1');
    } catch {}
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (seen || reduce) return off;
    setBoot('boot');
    const t1 = setTimeout(() => setBoot((b) => (b === 'boot' ? 'fade' : b)), 5600);
    const t2 = setTimeout(() => setBoot('done'), 6000);
    return () => {
      off();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  const chime = () => {
    if (chimed.current) return;
    chimed.current = true;
    sfxBoot();
  };
  const startUp = () => {
    chime();
    setBoot('fade');
    setTimeout(() => setBoot('done'), 400);
  };

  useEffect(() => {
    const tick = () => {
      const d = new Date(Date.now() + 9 * 3600_000);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const h = d.getUTCHours();
      setClock(`${days[d.getUTCDay()]} ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`);
    };
    tick();
    const t = setInterval(tick, 15_000);
    // 大きなTシャツの色を、キャンディカラーで順番に変える
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const c = reduce ? 0 : window.setInterval(() => setCandy((i) => (i + 1) % CANDY.length), 2600);
    return () => {
      clearInterval(t);
      if (c) clearInterval(c);
    };
  }, []);

  const hide = (w: Win) => {
    sfx('close');
    setHidden((h) => ({ ...h, [w]: true }));
  };
  const open = (w: Win) => {
    sfx('select');
    setHidden((h) => ({ ...h, [w]: false }));
    setFront(w);
  };

  const frame = (w: Win, title: string, body: React.ReactNode, cls: string) => {
    const d = drags[w];
    return (
      <div
        ref={d.el}
        className={`aq-win ${cls}${front === w ? ' front' : ''}`}
        hidden={hidden[w]}
        style={{ transform: `translate(${d.pos.x}px, ${d.pos.y}px)` }}
        onPointerDown={() => setFront(w)}
      >
        <div className="aq-title" {...d.handlers}>
          <span className="aq-dots">
            <button className="aq-dot c1" aria-label="Close" onClick={() => hide(w)} />
            <button className="aq-dot c2" aria-label="Minimize" onClick={() => hide(w)} />
            <button className="aq-dot c3" aria-label="Zoom" tabIndex={-1} />
          </span>
          <span className="aq-tt">{title}</span>
        </div>
        {body}
      </div>
    );
  };

  const dock: { key: string; label: string; icon: React.ReactNode; on?: boolean; act?: () => void; href?: string; ext?: boolean }[] = [
    { key: 'archive', label: "Founder's Archive", icon: <Folder />, on: !hidden.archive, act: () => open('archive') },
    { key: 'soon', label: 'Coming soon', icon: <CandyTee color={CANDY[0]} />, on: !hidden.soon, act: () => open('soon') },
    { key: 'draw', label: 'Enter the draw', icon: <Note />, href: '#presale' },
    ...(instagram ? [{ key: 'ig', label: 'Instagram', icon: <Camera />, href: instagram, ext: true }] : []),
    { key: 'mail', label: 'Contact', icon: <Mail />, href: '#contact' },
  ];

  return (
    <section className="w9 aq" aria-label="Coming soon" onPointerDown={(e) => !(e.target as HTMLElement).closest('.aq-snd') && chime()}>
      <div className="aq-menu">
        <CandyTee color={CANDY[candy]} className="aq-logo" />
        <b>Gallery Crypto</b>
        <span>Archive</span>
        <span className="aq-hide">Draw</span>
        <span className="aq-hide">Help</span>
        <span className="aq-right">
          <button
            className="aq-snd"
            aria-label={sound ? 'Sound on' : 'Sound off'}
            aria-pressed={sound}
            onClick={() => {
              const v = !sound;
              setSfx(v);
              if (v) {
                chimed.current = true;
                setTimeout(() => sfxBoot(), 120);
              }
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden>
              <path d="M3 8h3l5-4v12l-5-4H3Z" fill="currentColor" />
              {sound ? <path d="M14 6q3 4 0 8M16 4q5 6 0 12" fill="none" stroke="currentColor" strokeWidth="1.6" /> : <path d="M14 7l5 6M19 7l-5 6" stroke="currentColor" strokeWidth="1.6" />}
            </svg>
          </button>
          <span className="aq-clock">{clock}</span>
        </span>
      </div>

      <div className="aq-desk w9-desk" ref={desk}>
        {boot !== 'done' && (
          <button className={`w9-boot${boot === 'fade' ? ' out' : ''}`} onClick={startUp} aria-label="Start">
            {/* 1) Tシャツが浮かぶ → 2) ロゴが左右から飛び込んで光る → 3) PUSH START */}
            <svg className="w9-boot-tee" viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden>
              {tee.map(([x, y, c]) => (
                <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={c} />
              ))}
            </svg>
            <span className="w9-logo" aria-label="Gallery Crypto">
              <span className="l1" data-t="GALLERY">GALLERY</span>
              <span className="l2" data-t="CRYPTO">CRYPTO</span>
            </span>
            <span className="w9-boot-sub">Founder&apos;s Archive · Presale 2027</span>
            <span className="w9-boot-tap">Push start</span>
            <span className="w9-flash" aria-hidden />
          </button>
        )}

        {frame(
          'archive',
          "Founder's Archive",
          <>
            <div className="aq-bar">
              <span>0 pieces</span>
              <span>Being photographed</span>
            </div>
            <ul className="aq-files" aria-hidden>
              {Array.from({ length: 12 }, (_, i) => (
                <li key={i}>
                  <CandyTee color={CANDY[i % CANDY.length]} faint />
                  <span>No.{String(i + 1).padStart(3, '0')}</span>
                </li>
              ))}
            </ul>
          </>,
          'aq-a',
        )}

        {frame(
          'soon',
          'Coming soon',
          <div className="aq-dlg">
            <div className="aq-stage">
              <CandyTee color={CANDY[candy]} className="aq-tee" />
              <span className="aq-shadow" />
            </div>
            <div className="aq-copy">
              <h2>Coming soon.</h2>
              <p>American band tees from the &apos;80s to the 2000s, collected one by one. The first pieces are being photographed now.</p>
              <p className="aq-small">Preparing the archive…</p>
              <div className="aq-progress" aria-hidden>
                <i />
              </div>
              <div className="aq-btns">
                <button className="aq-gel ghost" onClick={() => hide('soon')}>
                  Later
                </button>
                <a className="aq-gel" href="#presale" onClick={() => sfx('coin')}>
                  Enter the draw
                </a>
              </div>
            </div>
          </div>,
          'aq-b',
        )}

        <nav className="aq-dock" aria-label="Dock">
          <ul>
            {dock.map((d) => (
              <li key={d.key}>
                {d.href ? (
                  <a href={d.href} target={d.ext ? '_blank' : undefined} rel={d.ext ? 'noopener noreferrer' : undefined} onClick={() => sfx('select')} aria-label={d.label}>
                    {d.icon}
                    <span className="aq-tip">{d.label}</span>
                  </a>
                ) : (
                  <button onClick={d.act} aria-label={d.label}>
                    {d.icon}
                    <span className="aq-tip">{d.label}</span>
                  </button>
                )}
                {d.on && <i className="aq-run" />}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
