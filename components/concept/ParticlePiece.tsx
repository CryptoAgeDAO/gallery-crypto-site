'use client';
// 購入まわりの画面で使う「光の粒でできた一着」。コンセプトページと同じ表現を、どの商品の絵・写真からでも作る。
// ・開くと散らばった粒が集まって服の形になり、reveal なら本物の絵（写真）が粒の中から浮かび上がる
// ・マウスや指を近づけると粒がよける
// ・mode="record" にすると、服がほどけて記録のブロックの鎖になる（購入完了の画面など）
import { isPhone } from '@/lib/device';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type Props = { src: string; photo?: boolean; reveal?: boolean; mode?: 'piece' | 'record'; className?: string; fit?: number };
const BLOCKS = 5;

// 絵（透明背景）なら不透明な所、写真なら四隅の色と違う所を「服」とみなして粒を拾う
export function sample(src: string, photo: boolean, n: number, boxW: number, boxH: number, thr = 52): Promise<{ pos: Float32Array; col: Float32Array; w: number; h: number; cut?: string } | null> {
  return new Promise((res) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const W = 260, H = Math.max(1, Math.round((W * im.naturalHeight) / im.naturalWidth));
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(im, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data;
        let br = 0, bg = 0, bb = 0;
        if (photo) { const cs = [0, W - 1, (H - 1) * W, H * W - 1]; cs.forEach((i) => { br += d[i * 4]; bg += d[i * 4 + 1]; bb += d[i * 4 + 2]; }); br /= 4; bg /= 4; bb /= 4; }
        const px: number[] = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const o = (y * W + x) * 4;
          if (photo ? d[o + 3] > 140 && Math.hypot(d[o] - br, d[o + 1] - bg, d[o + 2] - bb) > thr : d[o + 3] > 140) px.push(x, y);
        }
        if (px.length < 20) { res(null); return; }
        // 箱の中に収める（object-fit: contain と同じ計算）
        const k = Math.min(boxW / W, boxH / H), w = W * k, h = H * k;
        const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const q = Math.floor(Math.random() * (px.length / 2)) * 2;
          const x = px[q] + Math.random() - 0.5, y = px[q + 1] + Math.random() - 0.5, o = (Math.floor(y) * W + Math.floor(x)) * 4;
          const r = d[o] / 255, gg = d[o + 1] / 255, b = d[o + 2] / 255;
          pos[i * 3] = (x - W / 2) * k; pos[i * 3 + 1] = -(y - H / 2) * k; pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
          col[i * 3] = 0.2 + r * 1.05; col[i * 3 + 1] = 0.2 + gg * 1.05; col[i * 3 + 2] = 0.24 + b * 1.05;
        }
        // 写真は背景を抜いた切り抜きを作り、それを浮かび上がらせる（黒い画面に白い四角が出ないように）
        let cut: string | undefined;
        if (photo) {
          const CW = Math.min(1000, im.naturalWidth), CH = Math.round((CW * im.naturalHeight) / im.naturalWidth);
          const cc = document.createElement('canvas'); cc.width = CW; cc.height = CH;
          const cg = cc.getContext('2d', { willReadFrequently: true })!; cg.drawImage(im, 0, 0, CW, CH);
          const id = cg.getImageData(0, 0, CW, CH), q = id.data;
          for (let i = 0; i < q.length; i += 4) { const dd = Math.hypot(q[i] - br, q[i + 1] - bg, q[i + 2] - bb); q[i + 3] = Math.max(0, Math.min(255, (dd - 18) * 9)); }
          cg.putImageData(id, 0, 0); cut = cc.toDataURL('image/png');
        }
        res({ pos, col, w, h, cut });
      } catch { res(null); }
    };
    im.onerror = () => res(null);
    im.src = src;
  });
}

export default function ParticlePiece({ src, photo = false, reveal = false, mode = 'piece', className = '', fit = 0.82 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const modeR = useRef(mode); modeR.current = mode;
  const [shown, setShown] = useState(false); // 本物の絵を重ねるタイミング
  const [failed, setFailed] = useState(false);
  const [cut, setCut] = useState<string | null>(null);

  useEffect(() => {
    const el = host.current; if (!el) return;
    let alive = true;
    setShown(false); setFailed(false); setCut(null);
    const mobile = isPhone();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let r: THREE.WebGLRenderer;
    try { r = new THREE.WebGLRenderer({ antialias: false, alpha: true }); } catch { setFailed(true); return; }
    const N = mobile ? 6500 : 15000;
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); el.appendChild(r.domElement);
    const scene = new THREE.Scene();
    let W = el.clientWidth || 400, H = el.clientHeight || 400;
    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -2000, 2000); cam.position.z = 1000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seed = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uSize: { value: (mobile ? 2.1 : 1.8) * r.getPixelRatio() }, uMouse: { value: new THREE.Vector2(-9999, -9999) }, uTime: { value: 0 }, uFade: { value: 1 } },
      vertexShader: `attribute float seed; uniform float uSize; uniform vec2 uMouse; uniform float uTime; varying vec3 vC; varying float vA;
        void main(){ vec3 p = position; vec2 d = p.xy - uMouse; float L = length(d); p.xy += normalize(d + 1e-4) * smoothstep(90.0, 0.0, L) * 26.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); gl_PointSize = uSize * (0.7 + seed * 0.7); vC = color; vA = 0.75 + 0.25 * sin(uTime * 2.0 + seed * 40.0); }`,
      fragmentShader: `uniform float uFade; varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; float d = dot(p,p); if (d > 0.25) discard; float a = smoothstep(0.25, 0.0, d) * vA * uFade; gl_FragColor = vec4(vC * a, a); }`,
    });
    const pts = new THREE.Points(geo, mat); scene.add(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xc9a46a, transparent: true, opacity: 0 });
    const chain = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: BLOCKS }, () => new THREE.Vector3())), lineMat); scene.add(chain);

    const A = { cloud: new Float32Array(N * 3), piece: new Float32Array(N * 3), rec: new Float32Array(N * 3) };
    const C = { cloud: new Float32Array(N * 3), piece: new Float32Array(N * 3), rec: new Float32Array(N * 3) };
    const centers: THREE.Vector3[] = [];
    const build = () => {
      centers.length = 0;
      const span = Math.min(W * 0.78, 900), s = Math.min(W, H) * (mobile ? 0.07 : 0.06);
      for (let b = 0; b < BLOCKS; b++) centers.push(new THREE.Vector3((b / (BLOCKS - 1) - 0.5) * span, Math.sin(b * 1.3) * s * 0.6, 0));
      for (let i = 0; i < N; i++) {
        const th = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * Math.max(W, H) * 0.7;
        A.cloud.set([Math.cos(th) * rr, Math.sin(th) * rr * 0.75, 0], i * 3); C.cloud.set([0.3, 0.29, 0.27], i * 3);
        const b = i % BLOCKS, e = Math.floor(Math.random() * 12), t = Math.random() * 2 - 1, ax = e < 4 ? 0 : e < 8 ? 1 : 2, sg = [[-1, -1], [1, -1], [-1, 1], [1, 1]][e % 4];
        const v = [0, 0, 0]; v[ax] = t * s; v[(ax + 1) % 3] = sg[0] * s; v[(ax + 2) % 3] = sg[1] * s;
        const q = new THREE.Vector3(...v).applyEuler(new THREE.Euler(0.55, 0.7 + b * 0.2, 0)).add(centers[b]);
        A.rec.set([q.x, q.y, q.z], i * 3); C.rec.set(b === BLOCKS - 1 ? [1, 0.8, 0.48] : [0.85, 0.83, 0.8], i * 3);
        seed[i] = seed[i] || Math.random();
      }
    };
    build(); pos.set(A.cloud); col.set(C.cloud);
    let ready = 0, readyAt = 0;
    const load = () => sample(src, photo, N, W * fit, H * fit).then((s) => {
      if (!alive) return;
      if (!s) { setFailed(true); return; }
      A.piece.set(s.pos); C.piece.set(s.col); if (s.cut) setCut(s.cut); ready = 1; readyAt = performance.now();
    });
    load();

    const mouse = new THREE.Vector2(-9999, -9999), mT = new THREE.Vector2(-9999, -9999);
    const mv = (e: PointerEvent) => { const b = el.getBoundingClientRect(); mT.set(e.clientX - b.left - W / 2, -(e.clientY - b.top - H / 2)); };
    const lv = () => mT.set(-9999, -9999);
    el.addEventListener('pointermove', mv); el.addEventListener('pointerleave', lv);
    const size = () => {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h || (w === W && h === H)) return;
      W = w; H = h; r.setSize(W, H); cam.left = -W / 2; cam.right = W / 2; cam.top = H / 2; cam.bottom = -H / 2; cam.updateProjectionMatrix(); build(); load();
    };
    r.setSize(W, H);
    const ro = new ResizeObserver(size); ro.observe(el);

    let raf = 0, prev = performance.now(), a = 0, recW = 0, lastShown = false;
    const t0 = prev;
    const sm = (x: number) => x * x * (3 - 2 * x);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now; const time = (now - t0) / 1000;
      a += ((ready ? 1 : 0) - a) * (reduce ? 1 : Math.min(1, dt * 1.3));
      recW += ((modeR.current === 'record' && ready ? 1 : 0) - recW) * (reduce ? 1 : Math.min(1, dt * 1.1));
      const wa = sm(Math.min(1, a)), wr = sm(Math.min(1, recW)), wp = wa * (1 - wr), wc = 1 - wa;
      for (let i = 0; i < N * 3; i++) { pos[i] = A.cloud[i] * wc + A.piece[i] * wp + A.rec[i] * wa * wr; col[i] = C.cloud[i] * wc + C.piece[i] * wp + C.rec[i] * wa * wr; }
      if (!reduce) for (let i = 0; i < N; i++) { pos[i * 3] += Math.sin(time * 0.8 + seed[i] * 30) * 0.9; pos[i * 3 + 1] += Math.cos(time * 0.7 + seed[i] * 20) * 0.9; }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      pts.rotation.y = reduce ? 0 : Math.sin(time * 0.4) * 0.12 * wp + wr * Math.sin(time * 0.3) * 0.2;
      const lp = chain.geometry.attributes.position as THREE.BufferAttribute; centers.forEach((c, k) => lp.setXYZ(k, c.x, c.y, c.z)); lp.needsUpdate = true; chain.rotation.y = pts.rotation.y; lineMat.opacity = wr * 0.7;
      // 本物の絵が浮かんだら、粒は少し控えめに
      const show = reveal && ready === 1 && now - readyAt > (reduce ? 0 : 1400) && modeR.current !== 'record';
      if (show !== lastShown) { lastShown = show; setShown(show); }
      mat.uniforms.uFade.value += ((show ? 0.38 : 1) - mat.uniforms.uFade.value) * Math.min(1, dt * 2);
      mouse.lerp(mT, 0.15); mat.uniforms.uMouse.value.copy(mouse); mat.uniforms.uTime.value = time;
      r.render(scene, cam);
    };
    loop();
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerleave', lv); geo.dispose(); mat.dispose(); r.dispose(); r.domElement.remove(); };
  }, [src, photo, reveal, fit]);

  return (
    <div className={`pp ${className} ${shown ? 'shown' : ''} ${failed ? 'failed' : ''}`} ref={host}>
      {((reveal && (!photo || cut)) || failed) && (
        <span className="pp-img" style={{ inset: `${((1 - fit) / 2) * 100}%` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo && cut ? cut : src} alt="" draggable={false} />
        </span>
      )}
    </div>
  );
}
