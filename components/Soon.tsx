'use client';

import { useEffect, useRef } from 'react';

// アーカイブが空のあいだに出す「Coming soon」。点で描いた T シャツを走査線がスキャンしていく。
// Tシャツの輪郭（100×100 の座標）
const TEE: [number, number][] = [
  [30, 8], [40, 5], [44, 9], [50, 11], [56, 9], [60, 5], [70, 8], [92, 22], [84, 38], [74, 32],
  [74, 95], [26, 95], [26, 32], [16, 38], [8, 22],
];

export default function Soon() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    const path = new Path2D();
    TEE.forEach(([a, b], i) => (i ? path.lineTo(a, b) : path.moveTo(a, b)));
    path.closePath();
    const probe = document.createElement('canvas').getContext('2d')!;
    const pts: [number, number, number][] = [];
    for (let y = 4; y <= 96; y += 1.6)
      for (let px = 6; px <= 94; px += 1.1) if (probe.isPointInPath(path, px, y)) pts.push([px - 50, y - 50, Math.random()]);

    let W = 0, H = 0, dpr = 1, raf = 0, visible = true;
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = c.clientWidth;
      H = c.clientHeight;
      c.width = W * dpr;
      c.height = H * dpr;
    };
    size();
    window.addEventListener('resize', size);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();

    const draw = (t: number) => {
      const s = reduce ? 20 : (t - t0) / 1000;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, W, H);
      const sc = Math.min(W * 0.9, H * 0.85) / 100, cx = W / 2, cy = H / 2 + 4;
      const a = reduce ? 0.35 : Math.sin(s * 0.35) * 0.9, ca = Math.cos(a), sa = Math.sin(a);
      const scanY = reduce ? 60 : ((s * 0.16) % 1.3) * 100 - 52;
      for (const [px, py, r] of pts) {
        const z = Math.sin(px / 14 + r * 0.3) * 6 * (1 - Math.abs(py) / 60);
        const X = px * ca + z * sa, Z = -px * sa + z * ca, k = 1 + Z / 180;
        const d = py - scanY, lit = d < 0, near = Math.abs(d) < 2.2;
        x.fillStyle = near ? '#ffb547' : lit ? `rgba(238,241,247,${0.35 + (0.55 * (Z + 40)) / 80})` : 'rgba(238,241,247,.07)';
        const sz = near ? 2 : lit ? 1.3 : 1;
        x.fillRect(cx + X * sc * k, cy + py * sc * k, sz, sz);
      }
      if (scanY < 50) {
        x.fillStyle = 'rgba(255,181,71,.12)';
        x.fillRect(0, cy + scanY * sc - 1, W, 2);
      }
      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };
    // 画面外では止めて電池を節約
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(draw);
    });
    io.observe(c);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', size);
    };
  }, []);

  return (
    <section className="dive">
      <canvas ref={ref} aria-hidden />
      <div className="dive-txt">
        <p className="dive-cap">Scanning piece 001 of the archive</p>
        <h2>
          Coming
          <br />
          soon
        </h2>
        <p className="dive-s">
          The founder&apos;s archive of American band tees is being photographed, piece by piece. The presale opens in 2027 as a free draw.
        </p>
        <a className="dive-b" href="#presale">
          Enter the draw
        </a>
      </div>
    </section>
  );
}
