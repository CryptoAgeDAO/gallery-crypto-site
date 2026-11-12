'use client';
// トップ画像（デモ）：宇宙を背にしたフードの人物。星のまたたき・流れ星・漂う粒子・目の光・ゆっくりした浮遊。
// 画像はすべてオリジナル（人体は CC0 の MakeHuman から作成、背景は手描きの生成）。
import { useEffect, useRef } from 'react';

export default function SpaceHero() {
  const root = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = root.current;
    const c = cv.current;
    if (!el || !c) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let w = 0, h = 0, dpr = 1, raf = 0, last = performance.now();
    type Star = { x: number; y: number; r: number; p: number; s: number };
    type Dust = { x: number; y: number; vx: number; vy: number; r: number; a: number };
    let stars: Star[] = [];
    let dust: Dust[] = [];
    let shoot: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
    let nextShoot = 2500 + Math.random() * 4000;
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth; h = el.clientHeight;
      c.width = w * dpr; c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / 5200);
      stars = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() < 0.08 ? 1.4 : 0.4 + Math.random() * 0.7, p: Math.random() * 6.28, s: 0.6 + Math.random() * 2 }));
      dust = Array.from({ length: Math.round(n / 9) }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 4, vy: -3 - Math.random() * 8, r: 0.6 + Math.random() * 1.6, a: 0.1 + Math.random() * 0.35 }));
    };
    const draw = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const k = still ? 0.8 : 0.55 + 0.45 * Math.sin(s.p + (t / 1000) * s.s);
        ctx.globalAlpha = k;
        ctx.fillStyle = '#dfe9ff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.fill();
      }
      ctx.fillStyle = '#9fe8ff';
      for (const d of dust) {
        if (!still) {
          d.x += d.vx * dt; d.y += d.vy * dt;
          if (d.y < -4) { d.y = h + 4; d.x = Math.random() * w; }
        }
        ctx.globalAlpha = d.a;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.28); ctx.fill();
      }
      if (!still) {
        nextShoot -= dt * 1000;
        if (!shoot && nextShoot <= 0) {
          shoot = { x: Math.random() * w * 0.6, y: Math.random() * h * 0.35, vx: 520 + Math.random() * 260, vy: 140 + Math.random() * 120, life: 1 };
          nextShoot = 6000 + Math.random() * 7000;
        }
        if (shoot) {
          shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; shoot.life -= dt * 1.1;
          const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 0.22, shoot.y - shoot.vy * 0.22);
          g.addColorStop(0, 'rgba(220,240,255,.9)'); g.addColorStop(1, 'rgba(220,240,255,0)');
          ctx.globalAlpha = Math.max(0, shoot.life);
          ctx.strokeStyle = g; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(shoot.x, shoot.y); ctx.lineTo(shoot.x - shoot.vx * 0.22, shoot.y - shoot.vy * 0.22); ctx.stroke();
          if (shoot.life <= 0) shoot = null;
        }
      }
      ctx.globalAlpha = 1;
      if (!still) raf = requestAnimationFrame(draw);
    };
    size();
    if (still) draw(performance.now());
    else raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(() => { size(); if (still) draw(performance.now()); });
    ro.observe(el);

    // マウス／傾きで少しだけ視差
    const move = (x: number, y: number) => {
      el.style.setProperty('--mx', x.toFixed(3));
      el.style.setProperty('--my', y.toFixed(3));
    };
    const onMove = (e: PointerEvent) => move(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
    if (!still) window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <div className="sh" ref={root} aria-hidden>
      <div className="sh-l sh-bg" />
      <canvas className="sh-cv" ref={cv} />
      <div className="sh-fig">
        <div className="sh-l sh-figure" />
        <div className="sh-l sh-glow" />
      </div>
    </div>
  );
}
