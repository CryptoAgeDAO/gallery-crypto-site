'use client';

import { useEffect, useRef, useState } from 'react';
import { sfx } from '@/lib/sfx';

// アーカイブが空のあいだに出す「Coming soon」。
// 1980年代の白黒パソコンのデスクトップ風。ウィンドウはタイトルバーをつかんで動かせる。

// 16×16 のドット絵（稲妻プリントのバンドT）。# = 黒
const TEE = [
  '....##....##....',
  '..###.####.###..',
  '.##..........##.',
  '##............##',
  '#..##......##..#',
  '.##.#......#.##.',
  '....#...##.#....',
  '....#..##..#....',
  '....#.####.#....',
  '....#..##..#....',
  '....#.##...#....',
  '....#......#....',
  '....#......#....',
  '....#......#....',
  '....#......#....',
  '....########....',
];
const FOLDER = [
  '................',
  '.#####..........',
  '#.....#########.',
  '#..............#',
  '################',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '#..............#',
  '################',
];

function Pix({ rows, className }: { rows: string[]; className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((r, y) =>
        [...r].map((ch, x) =>
          ch === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#000" /> : null,
        ),
      )}
    </svg>
  );
}

export default function Soon() {
  const desk = useRef<HTMLDivElement>(null);
  const win = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [clock, setClock] = useState('');
  const [sel, setSel] = useState(false);

  useEffect(() => {
    const tick = () => {
      const d = new Date(Date.now() + 9 * 3600_000);
      setClock(`${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag || !desk.current || !win.current) return;
    const d = desk.current.getBoundingClientRect();
    const w = win.current;
    // 元の位置からどれだけ動かせるか（デスクトップの外に出さない）
    const left0 = w.offsetLeft, top0 = w.offsetTop;
    const nx = Math.min(d.width - left0 - 60, Math.max(-left0 - w.offsetWidth + 60, drag.ox + e.clientX - drag.sx));
    const ny = Math.min(d.height - top0 - 24, Math.max(-top0 + 22, drag.oy + e.clientY - drag.sy));
    setPos({ x: nx, y: ny });
  };
  const up = () => setDrag(null);

  return (
    <section className="mac" aria-label="Coming soon">
      <div className="mac-menu">
        <span className="mac-logo" aria-hidden>
          <Pix rows={TEE} />
        </span>
        <b>Archive</b>
        <span>Draw</span>
        <span className="mac-hide">About</span>
        <span className="mac-clock">{clock}</span>
      </div>

      <div className="mac-desk" ref={desk}>
        <a
          className={`mac-icon${sel ? ' on' : ''}`}
          href="#presale"
          onPointerDown={() => setSel(true)}
          onBlur={() => setSel(false)}
          onClick={() => sfx('select')}
        >
          <Pix rows={FOLDER} />
          <span>Presale 2027</span>
        </a>

        <div className="mac-zoom" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </div>

        <div
          className={`mac-win${drag ? ' drag' : ''}`}
          ref={win}
          style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        >
          <div className="mac-title" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <span className="mac-close" aria-hidden />
            <span className="mac-name">Founder&apos;s Archive</span>
          </div>
          <div className="mac-bar">
            <span>0 pieces</span>
            <span>Presale 2027</span>
            <span className="mac-hide">Tokyo</span>
          </div>
          <div className="mac-body">
            <Pix rows={TEE} className="mac-tee" />
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
