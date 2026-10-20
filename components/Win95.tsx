'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { photoUrl } from '@/lib/supabase';
import { certNo, type Item, type Settings } from '@/lib/types';
import { onSfxChange, setSfx, sfx, sfxBoot, sfxEnabled } from '@/lib/sfx';

// トップのアーカイブ。1995年ごろのパソコン画面へのオマージュ。
// 起動：雲の空にロゴ（4色のTシャツ）が浮かび上がる → デスクトップ（青緑の背景・灰色の立体ウィンドウ・タスクバー・スタートメニュー）。
// 既存OSのロゴ・名前・アイコン・起動音は使わず、絵と音はすべてこのサイト用。

const TEE16 = [
  '....##....##....',
  '..##o####o.##...',
  '.#oooooooooo##..',
  '#ooooooooooooo#.',
  '#oo##oooooo##o#.',
  '.##.#oooooo#.##.',
  '....#oooooo#....',
  '....#oo##oo#....',
  '....#o##ooo#....',
  '....#oooooo#....',
  '....#oooooo#....',
  '....#oooooo#....',
  '....#oooooo#....',
  '....#oooooo#....',
  '....########....',
  '................',
];
const FOLDER = [
  '................',
  '.#####..........',
  '#yyyyy#########.',
  '#yyyyyyyyyyyyyy#',
  '################',
  '#YYYYYYYYYYYYYY#',
  '#YYYYYYYYYYYYYY#',
  '#YYYYYYYYYYYYYY#',
  '#YYYYYYYYYYYYYY#',
  '#YYYYYYYYYYYYYY#',
  '#YYYYYYYYYYYYYY#',
  '################',
];
const NOTE = [
  '.##########.....',
  '.#wwwwwwww##....',
  '.#w#####ww#w#...',
  '.#wwwwwwww####..',
  '.#w#######www#..',
  '.#wwwwwwwwwww#..',
  '.#w######wwww#..',
  '.#wwwwwwwwwww#..',
  '.#w########ww#..',
  '.#wwwwwwwwwww#..',
  '.#w#####wwwww#..',
  '.#wwwwwwwwwww#..',
  '.#############..',
];
const SPEAKER = ['......#..', '.....##..', '###.#.#.#', '#.##..#..', '#..#..#.#', '#.##..#..', '###.#.#.#', '.....##..', '......#..'];
const COLORS: Record<string, string> = { '#': '#000', o: '#fff', y: '#fff6a8', Y: '#e8c84a', w: '#fff', g: '#808080' };

function Pix({ rows, className, ghost }: { rows: string[]; className?: string; ghost?: boolean }) {
  return (
    <svg className={className} viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((r, y) =>
        [...r].map((ch, x) => {
          if (ch === '.') return null;
          if (ghost) {
            // 中身のない枠：外側の輪郭だけを1マスおきに
            const out = (xx: number, yy: number) => (rows[yy]?.[xx] ?? '.') === '.';
            const edge = ch === '#' && (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1));
            return edge && (x + y) % 2 === 0 ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#808080" /> : null;
          }
          return <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={COLORS[ch]} />;
        }),
      )}
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


// オマージュのロゴ：4色に分かれた、はためくTシャツ＋後ろに流れる小さな四角
export function TeeFlag({ className }: { className?: string }) {
  const panels = [
    { c: '#e8261c', d: 'M30 8 L40 5 Q45 12 50 13 L50 50 L26 50 L26 33 L16 39 L7 23 Z' },
    { c: '#3ba12f', d: 'M50 13 Q55 12 60 5 L70 8 L93 23 L84 39 L74 33 L74 50 L50 50 Z' },
    { c: '#1d6fe0', d: 'M26 52 L50 52 L50 95 Q38 96 26 95 Z' },
    { c: '#f6c21c', d: 'M50 52 L74 52 L74 95 Q62 96 50 95 Z' },
  ];
  const trail: [number, number, number, string][] = [
    [-2, 18, 6, '#e8261c'], [-14, 22, 4, '#e8261c'], [-23, 25, 3, '#e8261c'],
    [-4, 44, 6, '#3ba12f'], [-15, 46, 4, '#3ba12f'],
    [-2, 66, 6, '#1d6fe0'], [-13, 68, 4, '#1d6fe0'], [-22, 70, 3, '#1d6fe0'],
    [-4, 86, 6, '#f6c21c'], [-15, 87, 4, '#f6c21c'],
  ];
  return (
    <svg className={className} viewBox="-30 0 130 100" aria-hidden>
      <g className="w9-flag">
        {panels.map((p) => (
          <path key={p.c} d={p.d} fill={p.c} stroke="#000" strokeWidth="1.2" strokeLinejoin="round" />
        ))}
      </g>
      {trail.map(([x, y, s, c], i) => (
        <rect key={i} x={x} y={y} width={s} height={s} fill={c} className="w9-trail" style={{ animationDelay: `${i * 0.05}s` }} />
      ))}
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

export default function Win95({ items, s, onOpen }: { items: Item[]; s: Settings; onOpen: (it: Item) => void }) {
  const desk = useRef<HTMLDivElement>(null);
  const drags = { archive: useDrag(desk), soon: useDrag(desk) };
  const [front, setFront] = useState<Win>(items.length ? 'archive' : 'soon');
  const [hidden, setHidden] = useState<Record<Win, boolean>>({ archive: false, soon: !!items.length });
  const [menu, setMenu] = useState(false);
  const [clock, setClock] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const tee = useMemo(bigTee, []);

  // 起動画面：同じタブでは1回だけ。タップで飛ばすと起動音（ブラウザは最初のタップまで音を出せない）
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
    if (seen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return off;
    setBoot('boot');
    const t1 = setTimeout(() => setBoot((b) => (b === 'boot' ? 'fade' : b)), 5400);
    const t2 = setTimeout(() => setBoot('done'), 5900);
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
    setTimeout(() => setBoot('done'), 450);
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
  const toggle = (w: Win) => {
    if (hidden[w]) {
      sfx('open');
      setHidden((h) => ({ ...h, [w]: false }));
      setFront(w);
    } else if (front === w) {
      sfx('shade');
      setHidden((h) => ({ ...h, [w]: true }));
    } else {
      sfx('tick');
      setFront(w);
    }
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
  const n = items.length;

  const frame = (w: Win, title: string, icon: string[], body: React.ReactNode, cls: string) => {
    const d = drags[w];
    return (
      <div
        ref={d.el}
        className={`w9-win ${cls}${front === w ? ' front' : ''}`}
        hidden={hidden[w]}
        style={{ transform: `translate(${d.pos.x}px, ${d.pos.y}px)` }}
        onPointerDown={() => setFront(w)}
      >
        <div className={`w9-title${front === w ? '' : ' idle'}`} {...d.handlers}>
          <Pix rows={icon} className="w9-ti" />
          <span>{title}</span>
          <button className="w9-tb" aria-label="Minimize" onClick={() => (sfx('shade'), setHidden((h) => ({ ...h, [w]: true })))}>
            <i className="min" />
          </button>
          <button className="w9-tb" aria-label="Maximize" tabIndex={-1}>
            <i className="max" />
          </button>
          <button className="w9-tb x" aria-label="Close" onClick={() => hide(w)}>
            <i className="cls" />
          </button>
        </div>
        {body}
      </div>
    );
  };

  return (
    <section
      className="w9"
      id="archive"
      aria-label="Archive"
      onPointerDown={(e) => {
        const el = e.target as HTMLElement;
        if (!el.closest('.w9-snd')) chime();
        if (!el.closest('.w9-start,.w9-menu')) setMenu(false);
      }}
    >
      <div className="w9-desk" ref={desk}>
        {boot !== 'done' && (
          <button className={`w9-boot${boot === 'fade' ? ' out' : ''}`} onClick={startUp} aria-label="Start">
            <span className="w9-clouds" aria-hidden />
            <span className="w9-bootlogo">
              <TeeFlag className="w9-bflag" />
              <span className="w9-bword">
                <small>Founder&apos;s Archive</small>
                <b>
                  Gallery Crypto<sup>27</sup>
                </b>
              </span>
            </span>
            <span className="w9-bbar" aria-hidden />
          </button>
        )}

        <div className="w9-icons">
          <button className="w9-icon" onClick={() => toggle('archive')}>
            <Pix rows={FOLDER} />
            <span>Founder&apos;s Archive</span>
          </button>
          <a className="w9-icon" href="#presale" onClick={() => sfx('open')}>
            <Pix rows={NOTE} />
            <span>Presale 2027.txt</span>
          </a>
          <button className="w9-icon" onClick={() => toggle('soon')}>
            <Pix rows={TEE16} />
            <span>Read Me</span>
          </button>
          {s.instagram && (
            <a className="w9-icon" href={s.instagram} target="_blank" rel="noopener noreferrer">
              <Pix rows={TEE16} />
              <span>Instagram</span>
            </a>
          )}
        </div>

        {frame(
          'archive',
          "Founder's Archive",
          FOLDER,
          <>
            <div className="w9-menubar">
              <span><u>F</u>ile</span>
              <span><u>E</u>dit</span>
              <span><u>V</u>iew</span>
              <span><u>H</u>elp</span>
            </div>
            <ul className="w9-files w9-inset">
              {n
                ? items.map((it) => (
                    <li key={it.id}>
                      <button className={`w9-file${sel === it.id ? ' on' : ''}`} onClick={() => pick(it)} onDoubleClick={() => onOpen(it)} aria-label={`${it.band || 'Untitled'} ${certNo(it)}`}>
                        {it.photos?.[0] ? <img src={photoUrl(it.photos[0])} alt="" loading="lazy" /> : <Pix rows={TEE16} />}
                        <span>{it.band || certNo(it)}</span>
                      </button>
                    </li>
                  ))
                : Array.from({ length: 12 }, (_, i) => (
                    <li key={i} aria-hidden>
                      <span className="w9-file ghost">
                        <Pix rows={TEE16} ghost />
                        <span>No.{String(i + 1).padStart(3, '0')}</span>
                      </span>
                    </li>
                  ))}
            </ul>
            <div className="w9-status">
              <span className="w9-inset">{n} object(s)</span>
              <span className="w9-inset">{n ? 'Double-click a piece to open it' : 'Being photographed'}</span>
            </div>
          </>,
          'w9-a',
        )}

        {frame(
          'soon',
          'Read Me',
          TEE16,
          <div className="w9-dlg">
            <div className="w9-dlg-main">
              <svg className="w9-tee" viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden>
                {tee.map(([x, y, c]) => (
                  <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={c} />
                ))}
              </svg>
              <div className="w9-copy">
                <h2>Coming soon.</h2>
                <p>American band tees from the &apos;80s to the 2000s, collected one by one. The first pieces are being photographed now.</p>
                <p className="w9-small">Preparing the archive…</p>
                <div className="w9-progress w9-inset" aria-hidden>
                  <i />
                </div>
              </div>
            </div>
            <div className="w9-btns">
              <a className="w9-btn def" href="#presale" onClick={() => sfx('coin')}>
                Enter the draw
              </a>
              <button className="w9-btn" onClick={() => hide('soon')}>
                Later
              </button>
            </div>
          </div>,
          'w9-b',
        )}
      </div>

      {menu && (
        <div className="w9-menu" role="menu">
          <div className="w9-side">
            <b>Gallery</b> Crypto
          </div>
          <ul>
            <li>
              <button role="menuitem" onClick={() => (setMenu(false), toggle('archive'))}>
                <Pix rows={FOLDER} /> Founder&apos;s Archive
              </button>
            </li>
            <li>
              <button role="menuitem" onClick={() => (setMenu(false), hidden.soon ? toggle('soon') : setFront('soon'))}>
                <Pix rows={TEE16} /> Read Me
              </button>
            </li>
            <li>
              <a role="menuitem" href="#presale" onClick={() => (setMenu(false), sfx('select'))}>
                <Pix rows={NOTE} /> Enter the draw
              </a>
            </li>
            <li>
              <a role="menuitem" href="#provenance" onClick={() => (setMenu(false), sfx('select'))}>
                <Pix rows={NOTE} /> Provenance
              </a>
            </li>
            {s.instagram && (
              <li>
                <a role="menuitem" href={s.instagram} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)}>
                  <Pix rows={TEE16} /> Instagram
                </a>
              </li>
            )}
            <li className="sep" />
            <li>
              <a role="menuitem" href="#contact" onClick={() => (setMenu(false), sfx('select'))}>
                <Pix rows={NOTE} /> Contact…
              </a>
            </li>
          </ul>
        </div>
      )}

      <div className="w9-task">
        <button className={`w9-start${menu ? ' on' : ''}`} onClick={() => (sfx('menu'), setMenu((m) => !m))} aria-expanded={menu}>
          <TeeFlag className="w9-sflag" />
          <b>Start</b>
        </button>
        <div className="w9-tasks">
          <button className={`w9-tk${!hidden.archive && front === 'archive' ? ' on' : ''}`} onClick={() => toggle('archive')}>
            <Pix rows={FOLDER} />
            <span>Founder&apos;s Archive</span>
          </button>
          <button className={`w9-tk${!hidden.soon && front === 'soon' ? ' on' : ''}`} onClick={() => toggle('soon')}>
            <Pix rows={TEE16} />
            <span>Read Me</span>
          </button>
        </div>
        <div className="w9-tray w9-inset">
          <button
            className="w9-snd"
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
            <Pix rows={SPEAKER} />
            {!sound && <i />}
          </button>
          {clock}
        </div>
      </div>
    </section>
  );
}
