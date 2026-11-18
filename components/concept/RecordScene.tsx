'use client';
// コンセプトページの3D：一着の服が、光の粒でできている。
// スクロールに合わせて 粒の雲 → 服（実物）→ 記録のブロックの鎖（ハッシュ）→ 来歴のらせん → 服 と姿を変える。
// 粒は服の絵から拾った色と位置を持つ。マウスや指を近づけると粒がよける。
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type SceneApi = { blocks: () => { x: number; y: number; v: number }[] };

const BLOCKS = 7;
const N_DESK = 14000, N_MOB = 7000;

function sampleGarment(src: string, n: number): Promise<{ pos: Float32Array; col: Float32Array }> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const W = 300, H = Math.round((W * im.naturalHeight) / im.naturalWidth);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(im, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      const px: number[] = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 140) px.push(x, y);
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      const S = 3.4 / W;
      for (let i = 0; i < n; i++) {
        const k = (Math.floor(Math.random() * (px.length / 2))) * 2;
        const x = px[k] + Math.random() - 0.5, y = px[k + 1] + Math.random() - 0.5;
        const o = (Math.floor(y) * W + Math.floor(x)) * 4;
        const r = d[o] / 255, gg = d[o + 1] / 255, b = d[o + 2] / 255, l = 0.3 * r + 0.59 * gg + 0.11 * b;
        pos[i * 3] = (x - W / 2) * S; pos[i * 3 + 1] = -(y - H / 2) * S; pos[i * 3 + 2] = (l - 0.5) * 0.18 + (Math.random() - 0.5) * 0.04;
        // 暗い布も見えるよう、少し持ち上げる
        col[i * 3] = 0.2 + r * 1.1; col[i * 3 + 1] = 0.2 + gg * 1.1; col[i * 3 + 2] = 0.24 + b * 1.1;
      }
      res({ pos, col });
    };
    im.src = src;
  });
}

export default function RecordScene({ src, progress, apiRef }: { src: string; progress: React.MutableRefObject<number>; apiRef: React.MutableRefObject<SceneApi | null> }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current!; let alive = true;
    const mobile = matchMedia('(max-width: 760px)').matches;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const N = mobile ? N_MOB : N_DESK;
    const r = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); el.appendChild(r.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(mobile ? 52 : 38, 1, 0.1, 100); cam.position.set(0, 0, 8);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seed = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uSize: { value: (mobile ? 2.8 : 2.5) * r.getPixelRatio() }, uMouse: { value: new THREE.Vector2(9, 9) }, uTime: { value: 0 }, uAspect: { value: 1 } },
      vertexShader: `
        attribute float seed; uniform float uSize; uniform vec2 uMouse; uniform float uTime; uniform float uAspect; varying vec3 vC; varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vec4 cp = projectionMatrix * mv;
          vec2 ndc = cp.xy / cp.w; vec2 d = ndc - uMouse; d.x *= uAspect; float L = length(d);
          float push = smoothstep(0.32, 0.0, L) * 0.09;
          ndc += normalize(d + 1e-5) * push * vec2(1.0/uAspect, 1.0);
          cp.xy = ndc * cp.w;
          gl_Position = cp;
          float tw = 0.75 + 0.25 * sin(uTime * 2.0 + seed * 40.0);
          gl_PointSize = uSize * (8.0 / -mv.z) * (0.7 + seed * 0.6);
          vC = color; vA = tw;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main(){ vec2 p = gl_PointCoord - 0.5; float d = dot(p,p); if (d > 0.25) discard; float a = smoothstep(0.25, 0.0, d); gl_FragColor = vec4(vC * a * vA, a * vA); }`,
    });
    const pts = new THREE.Points(geo, mat); scene.add(pts);

    // 鎖をつなぐ線と、NFC の波紋
    const lineMat = new THREE.LineBasicMaterial({ color: 0xa8834a, transparent: true, opacity: 0 });
    const chainLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: BLOCKS }, () => new THREE.Vector3())), lineMat); scene.add(chainLine);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96), new THREE.MeshBasicMaterial({ color: 0xd9b87a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); scene.add(m); rings.push(m); }

    // 各段階の形
    const A = { cloud: new Float32Array(N * 3), cloth: new Float32Array(N * 3), chain: new Float32Array(N * 3), helix: new Float32Array(N * 3) };
    const C = { cloth: new Float32Array(N * 3), chain: new Float32Array(N * 3), helix: new Float32Array(N * 3), cloud: new Float32Array(N * 3) };
    const centers: THREE.Vector3[] = [];
    for (let b = 0; b < BLOCKS; b++) { const u = b / (BLOCKS - 1); centers.push(mobile ? new THREE.Vector3((u - 0.5) * 3.2, 1.75 + Math.sin(u * Math.PI * 1.2) * 0.35, -u * 2.0 + 0.4) : new THREE.Vector3((u - 0.5) * 6.4 + 2.1, Math.sin(u * Math.PI * 1.2) * 0.5 - 0.1, -u * 2.2 + 0.6)); }
    for (let i = 0; i < N; i++) {
      seed[i] = Math.random();
      // 雲：ゆるい球殻
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), rr = 2.2 + Math.pow(Math.random(), 0.5) * 2.6;
      A.cloud.set([Math.sin(ph) * Math.cos(th) * rr * 1.4, Math.cos(ph) * rr * 0.8, Math.sin(ph) * Math.sin(th) * rr - 1], i * 3);
      C.cloud.set([0.35, 0.33, 0.3], i * 3);
      // 鎖：立方体の辺の上に粒を置く（輪郭がくっきり見える）
      const b = i % BLOCKS, s = mobile ? 0.38 : 0.55, e = Math.floor(Math.random() * 12), t = Math.random() * 2 - 1;
      const ax = e < 4 ? 0 : e < 8 ? 1 : 2, sgn = [[-1, -1], [1, -1], [-1, 1], [1, 1]][e % 4];
      const v = [0, 0, 0]; v[ax] = t * s; v[(ax + 1) % 3] = sgn[0] * s; v[(ax + 2) % 3] = sgn[1] * s;
      const inner = Math.random() < 0.18; // 中に少し粒を散らす（データの中身）
      const q = new THREE.Vector3(...(inner ? [(Math.random() - 0.5) * s * 1.4, (Math.random() - 0.5) * s * 1.4, (Math.random() - 0.5) * s * 1.4] : v));
      q.applyEuler(new THREE.Euler(0.5, 0.6 + b * 0.25, 0)).add(centers[b]);
      A.chain.set([q.x, q.y, q.z], i * 3);
      const hi = b === 0;
      C.chain.set(inner ? [0.55, 0.45, 0.3] : hi ? [1, 0.82, 0.5] : [0.85, 0.83, 0.8], i * 3);
      // 来歴のらせん：時間が奥から手前へ流れる帯
      const u = Math.random(), a = u * Math.PI * 5, R = (mobile ? 0.9 : 1.15) + (Math.random() - 0.5) * 0.1;
      A.helix.set([Math.cos(a) * R, (u - 0.5) * (mobile ? 3 : 4.6) + (Math.random() - 0.5) * 0.16, Math.sin(a) * R - 0.6], i * 3);
      const warm = Math.abs(((u * 5) % 1) - 0.5) < 0.04; // 出来事の節目は真鍮色
      C.helix.set(warm ? [1, 0.8, 0.45] : [0.6, 0.62, 0.66], i * 3);
    }
    pos.set(A.cloud); col.set(C.cloud);
    let ready = false;
    sampleGarment(src, N).then(({ pos: p, col: c }) => { if (!alive) return; A.cloth.set(p); C.cloth.set(c); ready = true; });

    // 画面上のブロックの位置（DOM のラベル用）
    const tmp = new THREE.Vector3();
    let chainW = 0;
    apiRef.current = {
      blocks: () => centers.map((c) => { tmp.copy(c).applyMatrix4(pts.matrixWorld).project(cam); return { x: (tmp.x * 0.5 + 0.5) * el.clientWidth, y: (-tmp.y * 0.5 + 0.5) * el.clientHeight, v: chainW }; }),
    };

    const mouse = new THREE.Vector2(9, 9), mT = new THREE.Vector2(9, 9);
    const mv = (e: PointerEvent) => { mT.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); };
    const lv = () => mT.set(9, 9);
    addEventListener('pointermove', mv); document.addEventListener('pointerleave', lv);
    const size = () => { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); mat.uniforms.uAspect.value = w / h; };
    size(); addEventListener('resize', size);

    const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    let raf = 0, t0 = performance.now(), shown = 0, prev = t0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      const time = (now - t0) / 1000;
      // 読み込み直後：雲から服へ集まる
      shown += ((ready ? 1 : 0) - shown) * (reduce ? 1 : Math.min(1, dt * 1.1));
      const p = progress.current; // 0..5
      // 重み：服 / 鎖 / らせん / 雲
      const toChain = sm(2.05, 2.95, p) * (1 - sm(3.05, 3.95, p));
      const toHelix = sm(3.05, 3.95, p) * (1 - sm(4.05, 4.9, p));
      const toCloud = 1 - shown;
      const wCloth = Math.max(0, 1 - toChain - toHelix) * shown;
      const wChain = toChain * shown, wHelix = toHelix * shown;
      chainW = wChain;
      for (let i = 0; i < N * 3; i++) {
        // 粒ごとに少し遅れて移る（流れるように）
        pos[i] = A.cloud[i] * toCloud + A.cloth[i] * wCloth + A.chain[i] * wChain + A.helix[i] * wHelix;
        col[i] = C.cloud[i] * toCloud + C.cloth[i] * wCloth + C.chain[i] * wChain + C.helix[i] * wHelix;
      }
      // 漂い
      if (!reduce) for (let i = 0; i < N; i++) { const s = seed[i]; pos[i * 3] += Math.sin(time * 0.7 + s * 30) * 0.008; pos[i * 3 + 1] += Math.cos(time * 0.6 + s * 20) * 0.008; }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      // 姿勢：服はゆっくり振れ、2つ目の段では回る。らせんは回転
      const turn = sm(0.9, 2.0, p) * (1 - sm(2.05, 2.6, p));
      pts.rotation.y = (reduce ? 0 : Math.sin(time * 0.35) * 0.22) * wCloth + turn * Math.sin(time * 0.5) * 0.6 + wHelix * time * 0.25 + wChain * -0.18;
      pts.rotation.x = wChain * 0.08;
      pts.position.x = (mobile ? 0 : 2.3) * wCloth + (mobile ? 0 : 2.6) * wHelix;
      pts.position.y = (mobile ? 1.3 : 0) * wCloth + (mobile ? 0.9 : 0) * wHelix;
      pts.scale.setScalar(mobile ? 1 - 0.25 * wCloth * sm(0.6, 1.0, p) : 1);
      // NFC の波紋（2つ目の段）
      const sig = sm(1.3, 1.8, p) * (1 - sm(2.0, 2.4, p));
      rings.forEach((m, k) => { const u = ((time * 0.6 + k / 3) % 1); m.position.set(pts.position.x - 0.55, pts.position.y + 0.95, 0.4); m.scale.setScalar(0.1 + u * 1.6); (m.material as THREE.MeshBasicMaterial).opacity = sig * (1 - u) * 0.8; });
      // 鎖の線
      const lp = chainLine.geometry.attributes.position as THREE.BufferAttribute;
      centers.forEach((c, k) => { tmp.copy(c).applyEuler(pts.rotation).add(pts.position); lp.setXYZ(k, tmp.x, tmp.y, tmp.z); }); lp.needsUpdate = true;
      lineMat.opacity = wChain * 0.7;
      // マウス
      mouse.lerp(mT, 0.12); mat.uniforms.uMouse.value.copy(mouse); mat.uniforms.uTime.value = time;
      cam.position.z = 8; cam.lookAt(0, 0, 0);
      r.render(scene, cam);
    };
    loop();
    return () => { alive = false; cancelAnimationFrame(raf); removeEventListener('pointermove', mv); document.removeEventListener('pointerleave', lv); removeEventListener('resize', size); geo.dispose(); mat.dispose(); r.dispose(); el.removeChild(r.domElement); apiRef.current = null; };
  }, [src, progress, apiRef]);
  return <div ref={host} className="cx-3d" aria-hidden />;
}
