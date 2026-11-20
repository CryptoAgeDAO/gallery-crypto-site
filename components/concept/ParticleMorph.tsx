'use client';
// ホームの背景：画面全体に固定した光の粒。スクロールした章や指した柱に合わせて、
// 服 → キャップ → Tシャツ → アート → 抽選番号 …と形を変える（コンセプトページと同じ表現）。
import { isPhone } from '@/lib/device';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { sample } from './ParticlePiece';

import type { MorphTarget } from './morphText';
export type { MorphTarget };

export default function ParticleMorph({ targets, active, dim = false }: { targets: MorphTarget[]; active: number; dim?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const activeR = useRef(active); activeR.current = active;
  useEffect(() => {
    const el = host.current; if (!el || !targets.length) return;
    let alive = true;
    const mobile = isPhone();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let r: THREE.WebGLRenderer;
    try { r = new THREE.WebGLRenderer({ antialias: false, alpha: true }); } catch { return; }
    const N = mobile ? 6500 : 17000;
    r.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.6 : 2)); el.appendChild(r.domElement);
    const scene = new THREE.Scene();
    let W = innerWidth, H = innerHeight;
    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -3000, 3000); cam.position.z = 1000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) seed[i] = Math.random();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uSize: { value: (mobile ? 2.0 : 1.75) * r.getPixelRatio() }, uMouse: { value: new THREE.Vector2(-9999, -9999) }, uTime: { value: 0 } },
      vertexShader: `attribute float seed; uniform float uSize; uniform vec2 uMouse; uniform float uTime; varying vec3 vC; varying float vA;
        void main(){ vec3 p = position; vec2 d = p.xy - uMouse; float L = length(d); p.xy += normalize(d + 1e-4) * smoothstep(110.0, 0.0, L) * 34.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); gl_PointSize = uSize * (0.65 + seed * 0.8); vC = color; vA = 0.72 + 0.28 * sin(uTime * 2.0 + seed * 40.0); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; float d = dot(p,p); if (d > 0.25) discard; float a = smoothstep(0.25, 0.0, d) * vA; gl_FragColor = vec4(vC * a, a); }`,
    });
    const pts = new THREE.Points(geo, mat); scene.add(pts);

    // 形ごとの粒の位置と色。読み込めた順に埋まる
    const T: { pos: Float32Array; col: Float32Array }[] = targets.map(() => ({ pos: new Float32Array(N * 3), col: new Float32Array(N * 3) }));
    const okT = targets.map(() => false);
    const cloud = new Float32Array(N * 3), cloudC = new Float32Array(N * 3);
    const from = new Float32Array(N * 3), fromC = new Float32Array(N * 3);
    let cur = -1, t = 1;
    const box = () => (mobile ? { w: W * 0.78, h: H * 0.42, x: 0, y: H * 0.16 } : { w: W * 0.38, h: H * 0.7, x: W * 0.2, y: 0 });
    const loadAll = () => {
      for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * Math.max(W, H) * 0.65; cloud.set([Math.cos(a) * rr, Math.sin(a) * rr * 0.7, 0], i * 3); cloudC.set([0.28, 0.27, 0.26], i * 3); }
      const b = box();
      targets.forEach((tg, k) => {
        if (!tg.src) return;
        sample(tg.src, !!tg.photo, N, b.w, b.h, tg.thr).then((s) => {
          if (!alive || !s) return;
          for (let i = 0; i < N; i++) { s.pos[i * 3] += b.x; s.pos[i * 3 + 1] += b.y; }
          T[k].pos.set(s.pos); T[k].col.set(s.col); okT[k] = true;
        });
      });
    };
    pos.set(cloud); col.set(cloudC);
    const size = () => { W = innerWidth; H = innerHeight; r.setSize(W, H); cam.left = -W / 2; cam.right = W / 2; cam.top = H / 2; cam.bottom = -H / 2; cam.updateProjectionMatrix(); okT.fill(false); cur = -1; loadAll(); };
    size();
    let lastW = W; const onR = () => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; size(); } };
    addEventListener('resize', onR);
    const mouse = new THREE.Vector2(-9999, -9999), mT = new THREE.Vector2(-9999, -9999);
    const mv = (e: PointerEvent) => mT.set(e.clientX - W / 2, -(e.clientY - H / 2));
    addEventListener('pointermove', mv);

    let raf = 0, prev = performance.now(); const t0 = prev;
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now; const time = (now - t0) / 1000;
      // 次の形が読み込めていれば、今の位置から移り始める
      const want = activeR.current;
      if (want !== cur && okT[want]) { from.set(pos); fromC.set(col); cur = want; t = 0; }
      if (cur >= 0) {
        t = Math.min(1, t + dt / (reduce ? 0.01 : 1.5));
        const tg = T[cur];
        for (let i = 0; i < N; i++) {
          // 粒ごとに少しずつ遅れて動き出す（流れるように）
          const k = ease(Math.max(0, Math.min(1, t * 1.6 - seed[i] * 0.6)));
          const j = i * 3;
          pos[j] = from[j] + (tg.pos[j] - from[j]) * k; pos[j + 1] = from[j + 1] + (tg.pos[j + 1] - from[j + 1]) * k + Math.sin(k * Math.PI) * (seed[i] - 0.5) * 120; pos[j + 2] = 0;
          col[j] = fromC[j] + (tg.col[j] - fromC[j]) * k; col[j + 1] = fromC[j + 1] + (tg.col[j + 1] - fromC[j + 1]) * k; col[j + 2] = fromC[j + 2] + (tg.col[j + 2] - fromC[j + 2]) * k;
        }
      }
      if (!reduce) for (let i = 0; i < N; i++) { pos[i * 3] += Math.sin(time * 0.8 + seed[i] * 30) * 0.7; pos[i * 3 + 1] += Math.cos(time * 0.7 + seed[i] * 20) * 0.7; }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      pts.rotation.y = reduce ? 0 : Math.sin(time * 0.35) * 0.1;
      mouse.lerp(mT, 0.15); mat.uniforms.uMouse.value.copy(mouse); mat.uniforms.uTime.value = time;
      r.render(scene, cam);
    };
    loop();
    return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('resize', onR); removeEventListener('pointermove', mv); geo.dispose(); mat.dispose(); r.dispose(); r.domElement.remove(); };
  }, [targets]);
  return <div ref={host} className={`pm ${dim ? 'dim' : ''}`} aria-hidden />;
}
