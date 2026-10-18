'use client';

import { useEffect, useRef, useState } from 'react';

// アーカイブが空のあいだに出す「Coming Soon」。サイバー系の HUD（照準・走査線・起動ログ）。
const LOG = [
  'GC-NET :: handshake ............ OK',
  'ARCHIVE NODE / TOKYO ........... ONLINE',
  'PROVENANCE LEDGER .............. STANDBY',
  'INDEXING FOUNDER PIECES ........ IN PROGRESS',
];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export default function Soon() {
  const ref = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [lines, setLines] = useState(0);
  const [pt, setPt] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let i = 0;
    const l = reduce
      ? (setLines(LOG.length), undefined)
      : setInterval(() => {
          i += 1;
          setLines(i);
          if (i >= LOG.length && l) clearInterval(l);
        }, 420);
    return () => {
      clearInterval(t);
      if (l) clearInterval(l);
    };
  }, []);

  const move = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPt({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };

  const jst = now ? new Date(now.getTime() + 9 * 3600_000) : null;
  const clock = jst ? `${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}` : '--:--:--';
  const date = jst ? `${jst.getUTCFullYear()}.${pad(jst.getUTCMonth() + 1)}.${pad(jst.getUTCDate())}` : '----.--.--';

  return (
    <div
      className="hud"
      ref={ref}
      onPointerMove={move}
      style={{ ['--px' as string]: pt.x, ['--py' as string]: pt.y }}
    >
      <span className="hud-c tl" />
      <span className="hud-c tr" />
      <span className="hud-c bl" />
      <span className="hud-c br" />
      <span className="hud-scan" aria-hidden />
      <span className="hud-cross" aria-hidden />

      <div className="hud-top">
        <span>GC-NET // SECTOR TOKYO</span>
        <span className="hud-live">
          <i /> LIVE {date} {clock} JST
        </span>
      </div>

      <div className="hud-body">
        <div className="hud-main">
          <pre className="hud-log" aria-hidden>
            {LOG.slice(0, lines).map((s) => (
              <span key={s}>&gt; {s}</span>
            ))}
            <span className="hud-cur">_</span>
          </pre>
          <p className="hud-k">Founder&apos;s Archive · Status</p>
          <p className="hud-t" data-text="COMING SOON">
            COMING SOON
          </p>
          <p className="hud-s">The first pieces are being indexed. Enter the free presale draw below.</p>
          <a className="hud-b" href="#presale">
            <span>Enter the draw</span>
            <b aria-hidden>→</b>
          </a>
        </div>

        <svg className="hud-ret" viewBox="0 0 200 200" aria-hidden>
          <g className="r1">
            <circle cx="100" cy="100" r="92" />
            {Array.from({ length: 72 }, (_, i) => (
              <line key={i} x1="100" y1="8" x2="100" y2={i % 6 ? 13 : 20} transform={`rotate(${i * 5} 100 100)`} />
            ))}
          </g>
          <g className="r2">
            <circle cx="100" cy="100" r="70" strokeDasharray="40 12 4 12" />
          </g>
          <g className="r3">
            <path d="M100 46 A54 54 0 0 1 154 100" />
            <path d="M100 154 A54 54 0 0 1 46 100" />
          </g>
          <circle cx="100" cy="100" r="3" className="dot" />
          <path d="M100 74v16M100 110v16M74 100h16M110 100h16" />
          <text x="100" y="214" textAnchor="middle">TARGET LOCK</text>
        </svg>
      </div>

      <dl className="hud-ft">
        <div>
          <dt>Lat / Lon</dt>
          <dd>35.6762N 139.6503E</dd>
        </div>
        <div>
          <dt>Pieces indexed</dt>
          <dd>000</dd>
        </div>
        <div>
          <dt>Signal</dt>
          <dd>ENCRYPTED</dd>
        </div>
        <div>
          <dt>Cursor</dt>
          <dd>
            X{pad(Math.round(pt.x * 999), 3)} Y{pad(Math.round(pt.y * 999), 3)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
