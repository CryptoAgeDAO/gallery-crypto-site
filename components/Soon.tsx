'use client';

import { useEffect, useRef } from 'react';

// アーカイブが空のあいだに出す「Coming soon」。
// 地球の縁の上に、点で描いたバンドTが浮かぶ「打ち上げ前」の画面。
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
    for (let y = 4; y <= 96; y += 1.5)
      for (let px = 6; px <= 94; px += 1.05) if (probe.isPointInPath(path, px, y)) pts.push([px - 50, y - 50, Math.random()]);
    const stars = Array.from({ length: 160 }, () => [Math.random(), Math.random() * 0.8, Math.random(), Math.random() * 6.28]);

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
      const s = reduce ? 8 : (t - t0) / 1000;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, W, H);

      // 星
      for (const [sx, sy, b, ph] of stars) {
        const a = 0.15 + 0.35 * b * (0.6 + 0.4 * Math.sin(s * (0.6 + b) + ph));
        x.fillStyle = `rgba(255,255,255,${a})`;
        x.fillRect(sx * W, sy * H, b > 0.85 ? 1.6 : 1, b > 0.85 ? 1.6 : 1);
      }

      // 地球の縁（大気の光）
      const R = Math.max(W * 1.6, H * 1.4);
      const ex = W / 2, ey = H * 0.94 + R;
      const glow = x.createRadialGradient(ex, ey, R - 2, ex, ey, R + H * 0.22);
      glow.addColorStop(0, 'rgba(90,160,255,.55)');
      glow.addColorStop(0.08, 'rgba(60,120,255,.18)');
      glow.addColorStop(1, 'rgba(20,40,120,0)');
      x.fillStyle = glow;
      x.beginPath();
      x.arc(ex, ey, R + H * 0.22, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#000';
      x.beginPath();
      x.arc(ex, ey, R, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = 'rgba(170,210,255,.9)';
      x.lineWidth = 1;
      x.beginPath();
      x.arc(ex, ey, R, Math.PI * 1.2, Math.PI * 1.8);
      x.stroke();

      // バンドT（ゆっくり回転しながら浮かぶ）
      const sc = Math.min(W * 0.62, H * 0.44) / 100;
      const cx = W / 2, cy = H * 0.36 + Math.sin(s * 0.8) * 6;
      const a = reduce ? 0.35 : s * 0.3, ca = Math.cos(a), sa = Math.sin(a);
      for (const [px, py, r] of pts) {
        const z = Math.sin(px / 14 + r * 0.3) * 6 * (1 - Math.abs(py) / 60);
        const X = px * ca + z * sa, Z = -px * sa + z * ca, k = 1 + Z / 200;
        const front = (Z + 50) / 100;
        x.fillStyle = `rgba(255,255,255,${0.12 + 0.7 * front})`;
        x.fillRect(cx + X * sc * k, cy + py * sc * k, 1.2, 1.2);
      }
      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };
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
    <section className="orbit">
      <canvas ref={ref} aria-hidden />
      <p className="orbit-top">Mission 01 · Founder&apos;s Archive</p>
      <div className="orbit-txt">
        <h2>Coming soon</h2>
        <p className="orbit-s">American band tees from the &apos;80s to the 2000s. Presale 2027.</p>
        <a className="orbit-b" href="#presale">
          Enter the draw
        </a>
      </div>
    </section>
  );
}
