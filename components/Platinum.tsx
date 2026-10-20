'use client';

import { useEffect, useRef, useState } from 'react';
import { photoUrl } from '@/lib/supabase';
import { certNo, type Item, type Settings } from '@/lib/types';
import { onSfxChange, setSfx, sfx, sfxBoot, sfxEnabled } from '@/lib/sfx';

// トップのアーカイブ。1998年ごろのパソコン（灰色の立体ウィンドウ）風。
// 起動時：灰色の画面にニコッとしたTシャツ → 「Welcome to Gallery Crypto」と進行バー → 下に小さなアイコンが並んでいく → デスクトップ。
// 既存OSのロゴ・アイコン・書体は使わず、絵はすべてこのサイト用のドット絵。

const ICONS: Record<string, string[]> = {
  tee: [
    '....##....##....',
    '..##o####o.##...',
    '.#oooooooooo##..',
    '#ooooooooooooo#.',
    '#oo##oooooo##o#.',
    '.##.#oooooo#.##.',
    '....#oooooo#....',
    '....#o#oo#o#....',
    '....#oooooo#....',
    '....#o#oo#o#....',
    '....#oo##oo#....',
    '....#oooooo#....',
    '....#oooooo#....',
    '....#oooooo#....',
    '....########....',
    '................',
  ],
  folder: [
    '................',
    '.#####..........',
    '#ppppp#########.',
    '#pppppppppppppp#',
    '################',
    '#PPPPPPPPPPPPPP#',
    '#PPPPPPPPPPPPPP#',
    '#PPPPPPPPPPPPPP#',
    '#PPPPPPPPPPPPPP#',
    '#PPPPPPPPPPPPPP#',
    '#PPPPPPPPPPPPPP#',
    '################',
  ],
  disk: [
    '################',
    '#gggggggggggggg#',
    '#gggggggggggggg#',
    '#gggggggggggggg#',
    '#gggggggggggggg#',
    '################',
    '#GGGGGGGGGGGGGG#',
    '#GG#GGGGGGGGGGG#',
    '#GGGGGGGGG####G#',
    '################',
  ],
  note: [
    '.##########.....',
    '.#oooooooo##....',
    '.#o#####oo#o#...',
    '.#oooooooo####..',
    '.#o#######ooo#..',
    '.#ooooooooooo#..',
    '.#o######oooo#..',
    '.#ooooooooooo#..',
    '.#o########oo#..',
    '.#ooooooooooo#..',
    '.#o#####ooooo#..',
    '.#ooooooooooo#..',
    '.#############..',
  ],
  mail: [
    '################',
    '#yy#yyyyyyyy#yy#',
    '#yyy#yyyyyy#yyy#',
    '#yyyy#yyyy#yyyy#',
    '#yyyyy####yyyyy#',
    '#yyyyyyyyyyyyyy#',
    '#yyyyyyyyyyyyyy#',
    '################',
  ],
  star: [
    '.......#........',
    '......#y#.......',
    '......#y#.......',
    '.#####yyy#####..',
    '..#yyyyyyyyy#...',
    '...#yyyyyyy#....',
    '...#yyy#yyy#....',
    '..#yy#...#yy#...',
    '..##.......##...',
  ],
  lock: [
    '....######......',
    '...#......#.....',
    '...#......#.....',
    '..##########....',
    '..#gggggggg#....',
    '..#ggg##ggg#....',
    '..#ggg##ggg#....',
    '..#gggggggg#....',
    '..##########....',
  ],
};
const COLORS: Record<string, string> = { '#': '#000', o: '#fff', p: '#c9c3ff', P: '#9c94ec', g: '#c8c8c8', G: '#9a9a9a', y: '#ffe680' };

function Pix({ name, className, ghost }: { name: string; className?: string; ghost?: boolean }) {
  const rows = ICONS[name];
  return (
    <svg className={className} viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((r, y) =>
        [...r].map((ch, x) => {
          if (ch === '.') return null;
          if (ghost) {
            const out = (xx: number, yy: number) => (rows[yy]?.[xx] ?? '.') === '.';
            const edge = ch === '#' && (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1));
            return edge && (x + y) % 2 === 0 ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#555" /> : null;
          }
          return <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={COLORS[ch]} />;
        }),
      )}
    </svg>
  );
}

// 起動画面の「ニコッとしたTシャツ」
function HappyTee({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden>
      <path d="M9 3h5v1h4V3h5v1h2v1h2v1h2v1h2v2h1v3h-1v1h-2v1h-2v-1h-1v17H8V13H7v1H5v-1H3v-1H2V9h1V7h2V6h2V5h2Z" fill="#000" />
      <path d="M10 4h3v1h6V4h3v1h2v1h2v1h2v1h1v1h1v2h-1v1h-2v-1h-2v-1h-1v19H10V10H9v1H7v1H5v-1H4V9h1V8h1V7h2V6h2Z" fill="#fff" />
      <rect x="12" y="14" width="2" height="2" fill="#000" />
      <rect x="18" y="14" width="2" height="2" fill="#000" />
      <path d="M12 19h1v1h6v-1h1v1h-1v1h-6v-1h-1Z" fill="#000" />
    </svg>
  );
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

const BOOT_ICONS = ['tee', 'folder', 'disk', 'note', 'star', 'mail', 'lock'];

export default function Platinum({ items, s, onOpen }: { items: Item[]; s: Settings; onOpen: (it: Item) => void }) {
  const desk = useRef<HTMLDivElement>(null);
  const drags = { archive: useDrag(desk), soon: useDrag(desk) };
  const [front, setFront] = useState<Win>(items.length ? 'archive' : 'soon');
  const [hidden, setHidden] = useState<Record<Win, boolean>>({ archive: false, soon: !!items.length });
  const [shade, setShade] = useState<Record<Win, boolean>>({ archive: false, soon: false });
  const [sel, setSel] = useState<string | null>(null);
  const [clock, setClock] = useState('');
  const [sound, setSound] = useState(true);

  // 起動画面：同じタブでは1回だけ。0=灰色＋Tシャツ、1=Welcome、2=終わり
  const [boot, setBoot] = useState(-1);
  const [loaded, setLoaded] = useState(0);
  const chimed = useRef(false);
  const chime = () => {
    if (chimed.current) return;
    chimed.current = true;
    sfxBoot();
  };
  useEffect(() => {
    setSound(sfxEnabled());
    const off = onSfxChange(setSound);
    let seen = false;
    try {
      seen = sessionStorage.getItem('gc-boot') === '1';
      sessionStorage.setItem('gc-boot', '1');
    } catch {}
    if (seen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return off;
    setBoot(0);
    const ts = [
      setTimeout(() => setBoot(1), 1600),
      ...BOOT_ICONS.map((_, i) => setTimeout(() => (setLoaded(i + 1), sfx('tick')), 2100 + i * 380)),
      setTimeout(() => setBoot(2), 2100 + BOOT_ICONS.length * 380 + 700),
    ];
    return () => {
      off();
      ts.forEach(clearTimeout);
    };
  }, []);
  const skip = () => {
    chime();
    setBoot(2);
  };

  useEffect(() => {
    const tick = () => {
      const d = new Date(Date.now() + 9 * 3600_000);
      const h = d.getUTCHours();
      setClock(`${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`);
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);

  const hide = (w: Win) => {
    sfx('close');
    setHidden((h) => ({ ...h, [w]: true }));
  };
  const open = (w: Win) => {
    sfx('open');
    setHidden((h) => ({ ...h, [w]: false }));
    setShade((h) => ({ ...h, [w]: false }));
    setFront(w);
  };
  const roll = (w: Win) => {
    sfx('flip');
    setShade((h) => ({ ...h, [w]: !h[w] }));
  };
  const pick = (it: Item) => {
    if (sel === it.id) {
      sfx('open');
      onOpen(it);
    } else {
      sfx('tick');
      setSel(it.id);
    }
  };

  const frame = (w: Win, title: string, body: React.ReactNode, cls: string) => {
    const d = drags[w];
    return (
      <div
        ref={d.el}
        className={`pt-win ${cls}${front === w ? ' front' : ''}${shade[w] ? ' shade' : ''}`}
        hidden={hidden[w]}
        style={{ transform: `translate(${d.pos.x}px, ${d.pos.y}px)` }}
        onPointerDown={() => setFront(w)}
      >
        <div className="pt-title" {...d.handlers} onDoubleClick={() => roll(w)}>
          <button className="pt-box" aria-label="Close" onClick={() => hide(w)} />
          <span className="pt-ridge" aria-hidden />
          <span className="pt-tt">{title}</span>
          <span className="pt-ridge" aria-hidden />
          <button className="pt-box zoom" aria-label="Zoom" tabIndex={-1} />
          <button className="pt-box shd" aria-label={shade[w] ? 'Expand' : 'Collapse'} onClick={() => roll(w)} />
        </div>
        <div className="pt-body">{body}</div>
      </div>
    );
  };

  const n = items.length;

  return (
    <section className="pt" id="archive" aria-label="Archive" onPointerDown={(e) => !(e.target as HTMLElement).closest('.pt-snd') && chime()}>
      <div className="pt-menu">
        <span className="pt-apple" aria-hidden>
          <Pix name="tee" />
        </span>
        <b>Archive</b>
        <span>Draw</span>
        <span className="pt-hide">View</span>
        <span className="pt-hide">Help</span>
        <span className="pt-right">
          <button
            className="pt-snd"
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
          <span>{clock}</span>
          <span className="pt-app">
            <Pix name="folder" /> <span className="pt-hide">Archive</span>
          </span>
        </span>
      </div>

      <div className="pt-desk" ref={desk}>
        {boot >= 0 && boot < 2 && (
          <button className="pt-boot" onClick={skip} aria-label="Start">
            {boot === 0 ? (
              <HappyTee className="pt-happy" />
            ) : (
              <span className="pt-welcome">
                <HappyTee className="pt-wt" />
                <span className="pt-wtxt">
                  Welcome to <b>Gallery Crypto</b>
                </span>
                <span className="pt-wsub">Founder&apos;s Archive</span>
                <span className="pt-wbar">
                  <i style={{ width: `${(loaded / BOOT_ICONS.length) * 100}%` }} />
                </span>
              </span>
            )}
            <span className="pt-ext" aria-hidden>
              {BOOT_ICONS.slice(0, loaded).map((k) => (
                <Pix key={k} name={k} />
              ))}
            </span>
          </button>
        )}

        <div className="pt-icons">
          <button className="pt-icon" onClick={() => open('archive')}>
            <Pix name="disk" />
            <span>Gallery HD</span>
          </button>
          <a className="pt-icon" href="#presale" onClick={() => sfx('select')}>
            <Pix name="note" />
            <span>Presale 2027</span>
          </a>
          <button className="pt-icon" onClick={() => open('soon')}>
            <Pix name="tee" />
            <span>Read Me</span>
          </button>
          {s.instagram && (
            <a className="pt-icon" href={s.instagram} target="_blank" rel="noopener noreferrer">
              <Pix name="star" />
              <span>Instagram</span>
            </a>
          )}
        </div>

        {frame(
          'archive',
          "Founder's Archive",
          <>
            <div className="pt-info">
              <span>{n ? `${n} ${n === 1 ? 'item' : 'items'}` : '0 items'}</span>
              <span>{n ? 'Double-click to open' : 'Being photographed'}</span>
            </div>
            <ul className="pt-files">
              {n
                ? items.map((it) => (
                    <li key={it.id}>
                      <button
                        className={`pt-file${sel === it.id ? ' on' : ''}`}
                        onClick={() => pick(it)}
                        onDoubleClick={() => onOpen(it)}
                        aria-label={`${it.band || 'Untitled'} ${certNo(it)}`}
                      >
                        {it.photos?.[0] ? <img src={photoUrl(it.photos[0])} alt="" loading="lazy" /> : <Pix name="tee" />}
                        <span>{it.band || certNo(it)}</span>
                      </button>
                    </li>
                  ))
                : Array.from({ length: 12 }, (_, i) => (
                    <li key={i} aria-hidden>
                      <span className="pt-file ghost">
                        <Pix name="tee" ghost />
                        <span>No.{String(i + 1).padStart(3, '0')}</span>
                      </span>
                    </li>
                  ))}
            </ul>
          </>,
          'pt-a',
        )}

        {frame(
          'soon',
          'Read Me',
          <div className="pt-dlg">
            <div className="pt-dlg-main">
              <HappyTee className="pt-dlg-icon" />
              <div className="pt-copy">
                <h2>Coming soon.</h2>
                <p>American band tees from the &apos;80s to the 2000s, collected one by one. The first pieces are being photographed now.</p>
                <p className="pt-small">Preparing the archive…</p>
                <div className="pt-prog" aria-hidden>
                  <i />
                </div>
              </div>
            </div>
            <div className="pt-btns">
              <button className="pt-btn" onClick={() => hide('soon')}>
                Later
              </button>
              <a className="pt-btn def" href="#presale" onClick={() => sfx('coin')}>
                Enter the draw
              </a>
            </div>
          </div>,
          'pt-b',
        )}
      </div>
    </section>
  );
}
