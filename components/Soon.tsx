'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx } from '@/lib/sfx';

// アーカイブが空のあいだに出す「Coming soon」。
// 1980年代の白黒パソコン風デスクトップ。2つのウィンドウはタイトルバーで動かせて、押した方が前に出る。

// 小さなTシャツ（16×16）。メニューバーと空き枠のアイコン用
const TEE16 = [
  '....##....##....',
  '..###.####.###..',
  '.##..........##.',
  '##............##',
  '#..##......##..#',
  '.##.#......#.##.',
  '....#......#....',
  '....#......#....',
  '....#......#....',
  '....#......#....',
  '....#......#....',
  '....#......#....',
  '....#......#....',
  '....#......#....',
  '....#......#....',
  '....########....',
];
const FOLDER = [
  '.#####..........',
  '#.....#########.',
  '#..............#',
  '################',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '################',
];
// 稲妻プリント（大きなTシャツの胸）
const BOLT = ['....###.', '...###..', '..###...', '.######.', '...###..', '..###...', '.###....', '.##.....', '##......'];

// 32×32 の大きなTシャツ：輪郭・右側の網かけの影・稲妻プリント
const POLY: [number, number][] = [
  [30, 8], [40, 5], [44, 10], [50, 12], [56, 10], [60, 5], [70, 8], [93, 23], [84, 39], [74, 33],
  [74, 96], [26, 96], [26, 33], [16, 39], [7, 23],
];
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
  const px: [number, number][] = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (!inn(x, y)) continue;
      const edge = !inn(x - 1, y) || !inn(x + 1, y) || !inn(x, y - 1) || !inn(x, y + 1);
      // 右側に網かけの影（奥ほど濃く）
      const shade = x >= 21 && x <= 23 && y >= 11 && (x + y) % 2 === 0;
      const by = y - 13, bx = x - 11;
      const bolt = by >= 0 && by < BOLT.length && bx >= 0 && bx < 8 && BOLT[by][bx] === '#';
      if (edge || shade || bolt) px.push([x, y]);
    }
  return px;
}

function Pix({ rows, ghost, className }: { rows: string[]; ghost?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((r, y) =>
        [...r].map((ch, x) => {
          if (ghost) {
            // 中身のない「これから入る」枠：輪郭を1マスおきに
            const on = ch === '#' && (x + y) % 2 === 0;
            return on ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null;
          }
          return ch === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null;
        }),
      )}
    </svg>
  );
}

type Pos = { x: number; y: number };

function useDrag(desk: React.RefObject<HTMLDivElement>) {
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos>({ x: 0, y: 0 });
  const st = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      st.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
      setDragging(true);
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
    onPointerUp: () => {
      st.current = null;
      setDragging(false);
    },
    onPointerCancel: () => {
      st.current = null;
      setDragging(false);
    },
  };
  return { el, pos, dragging, handlers };
}

export default function Soon() {
  const desk = useRef<HTMLDivElement>(null);
  const a = useDrag(desk);
  const b = useDrag(desk);
  const [front, setFront] = useState<'a' | 'b'>('b');
  const [clock, setClock] = useState('');
  const tee = useMemo(bigTee, []);

  useEffect(() => {
    const tick = () => {
      const d = new Date(Date.now() + 9 * 3600_000);
      setClock(`${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="mac" aria-label="Coming soon">
      <div className="mac-menu">
        <Pix rows={TEE16} className="mac-logo" />
        <b>Archive</b>
        <span>Draw</span>
        <span className="mac-hide">About</span>
        <span className="mac-clock">{clock}</span>
      </div>

      <div className="mac-desk" ref={desk}>
        <a className="mac-icon" href="#presale" onClick={() => sfx('select')}>
          <Pix rows={FOLDER} />
          <span>Presale 2027</span>
        </a>

        {/* 奥のウィンドウ：これから並ぶアーカイブの空き枠 */}
        <div
          ref={a.el}
          className={`mac-win mac-a${front === 'a' ? ' front' : ''}`}
          style={{ transform: `translate(${a.pos.x}px, ${a.pos.y}px)` }}
          onPointerDown={() => setFront('a')}
        >
          <div className={`mac-title${front === 'a' ? '' : ' idle'}`} {...a.handlers}>
            <span className="mac-close" aria-hidden />
            <span className="mac-name">Founder&apos;s Archive</span>
          </div>
          <div className="mac-bar">
            <span>0 pieces</span>
            <span>Tokyo</span>
          </div>
          <ul className="mac-slots" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <li key={i}>
                <Pix rows={TEE16} ghost />
                <span>No.{String(i + 1).padStart(3, '0')}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 手前のウィンドウ：ドットで描かれていくTシャツ */}
        <div
          ref={b.el}
          className={`mac-win mac-b${front === 'b' ? ' front' : ''}`}
          style={{ transform: `translate(${b.pos.x}px, ${b.pos.y}px)` }}
          onPointerDown={() => setFront('b')}
        >
          <div className={`mac-title${front === 'b' ? '' : ' idle'}`} {...b.handlers}>
            <span className="mac-close" aria-hidden />
            <span className="mac-name">Coming soon</span>
          </div>
          <div className="mac-body">
            <svg className="mac-tee" viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden>
              {tee.map(([x, y]) => (
                <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" style={{ animationDelay: `${0.5 + y * 0.045 + x * 0.004}s` }} />
              ))}
            </svg>
            <div className="mac-copy">
              <h2>Coming soon.</h2>
              <p>American band tees from the &apos;80s to the 2000s, collected one by one. The first pieces are being photographed now.</p>
              <a className="mac-btn" href="#presale" onClick={() => sfx('coin')}>
                Enter the draw
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
