'use client';
// レールの服を WebGL で描く：一着ずつ細かい網目の布にして、ハンガーの肩から下が遅れて揺れ、
// 裾がはためき、胴に膨らみとドレープのしわが出る。光は布の傾きから計算するので、横向きは陰に、正面は明るくなる。
// 位置・向き・揺れは RailShop の動き（バネ）をそのまま受け取る。押した判定は今までどおり DOM のボタンが受け持つ。
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type GLPiece = { src: string; kind: string; photo: boolean };
export type GLState = { x: number; ty: number; z: number; r: number; sc: number; sw: number; av: number; k: number };
type Layout = { top: number; img: { x: number; y: number; w: number; h: number }; hook: { x: number; y: number; w: number; h: number } | null };

const VS = `
uniform float uTime, uPhase, uBend, uK, uRigid, uW, uH;
varying vec2 vUv; varying vec3 vPos;
void main(){
  vUv = uv;
  vec3 p = position;
  float t = clamp(0.5 - p.y, 0.0, 1.0);       // 0=肩 1=裾
  float u = uv.x;
  if (uRigid < 0.5) {
    float fl = 1.0 - uK * 0.6;
    p.x += uBend * t * t * (uH / uW) * 0.10;                                        // 揺れに遅れて下が残る
    p.z += sin(u * 3.14159) * uW * (0.05 + 0.04 * t);                         // 胴の膨らみ
    p.z += sin(u * 18.85 + t * 2.4 + uPhase) * uW * 0.010 * (0.3 + t);        // 縦のドレープ
    p.z += sin(uTime * 2.3 + t * 5.0 + uPhase) * t * t * uH * 0.020 * fl;    // 裾のはためき
    p.x += sin(uTime * 1.7 + t * 3.0 + uPhase * 1.3) * t * t * 0.012 * fl;
    p.y += (1.0 - cos(u * 6.2832)) * t * 0.006;                          // 裾が少し波打つ
  }
  vec4 w = modelMatrix * vec4(p, 1.0);
  vPos = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FS = `
uniform sampler2D uMap; uniform float uRigid;
varying vec2 vUv; varying vec3 vPos;
void main(){
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.45) discard;
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(vec3(-0.45, 0.55, 0.75));
  float d = abs(dot(n, L));
  float shade = 0.5 + 0.62 * d;
  float spec = pow(max(0.0, dot(reflect(-L, n), vec3(0.0, 0.0, 1.0))), 18.0) * 0.08 * (1.0 - uRigid);
  gl_FragColor = vec4(c.rgb * shade + spec, 1.0);
  #include <colorspace_fragment>
}`;

function toCanvas(src: string, kind: string, photo: boolean, max: number): Promise<HTMLCanvasElement | null> {
  return new Promise((res) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => {
      const a = (im.naturalWidth || 720) / (im.naturalHeight || 660);
      const c = document.createElement('canvas');
      if (photo) {
        // 写真は白い台紙（上の余白が広い）に貼った札として描く
        c.width = Math.round(max * 0.75); c.height = max; const g = c.getContext('2d')!;
        g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, c.width, c.height);
        const pw = c.width - 32, ph = c.height - 32 - 52, k = Math.max(pw / im.naturalWidth, ph / im.naturalHeight);
        g.save(); g.beginPath(); g.rect(16, 68, pw, ph); g.clip(); g.drawImage(im, 16 + (pw - im.naturalWidth * k) / 2, 68 + (ph - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k); g.restore();
        g.strokeStyle = 'rgba(0,0,0,.12)'; g.strokeRect(0.5, 0.5, c.width - 1, c.height - 1);
      } else if (kind === 'art') {
        c.width = max; c.height = Math.round(max / a); const g = c.getContext('2d')!;
        g.fillStyle = '#161616'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fbfaf6'; g.fillRect(20, 20, c.width - 40, c.height - 40);
        g.drawImage(im, 40, 40, c.width - 80, c.height - 80);
      } else { c.width = max; c.height = Math.round(max / a); c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height); }
      res(c);
    };
    im.onerror = () => res(null);
    im.src = src;
  });
}

export default function RailGL({ pieces, hookSrc, hangerSrc, state, els, stageRef, onReady }: {
  pieces: GLPiece[]; hookSrc: string; hangerSrc: string;
  state: React.MutableRefObject<GLState[]>;
  els: React.MutableRefObject<{ p: HTMLElement | null }[]>;
  stageRef: React.RefObject<HTMLElement>;
  onReady: (ok: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current, stage = stageRef.current; if (!el || !stage) return;
    let alive = true;
    const mobile = matchMedia('(max-width: 760px)').matches;
    let r: THREE.WebGLRenderer;
    try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch { onReady(false); return; }
    r.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.6 : 2)); r.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(r.domElement);
    r.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onReady(false); });
    const scene = new THREE.Scene();
    const D = 1600; // CSS の perspective と同じ距離
    const cam = new THREE.PerspectiveCamera(30, 1, 10, 6000); cam.position.set(0, 0, D);
    const MAX = mobile ? 512 : 1024;
    const groups: { g: THREE.Group; swing: THREE.Group; cloth: THREE.Mesh | null; hook: THREE.Mesh | null; u: Record<string, THREE.IUniform>; lay: Layout | null }[] = [];
    const mkMat = (rigid: boolean) => new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: false, side: THREE.DoubleSide,
      uniforms: { uMap: { value: null }, uTime: { value: 0 }, uPhase: { value: Math.random() * 6 }, uBend: { value: 0 }, uK: { value: 0 }, uRigid: { value: rigid ? 1 : 0 }, uW: { value: 1 }, uH: { value: 1 } },
    });
    let hookTex: THREE.Texture | null = null, hangerTex: THREE.Texture | null = null;
    const ldr = (src: string, kind = 'hook') => toCanvas(src, kind, false, 256).then((c) => { if (!c) return null; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; });
    Promise.all([ldr(hookSrc), ldr(hangerSrc)]).then(([a, b]) => { hookTex = a; hangerTex = b; groups.forEach((G, i) => { if (G.hook) (G.hook.material as THREE.ShaderMaterial).uniforms.uMap.value = pieces[i].kind === 'garment' && !pieces[i].photo ? hangerTex : hookTex; }); });
    let loaded = 0;
    pieces.forEach((p, i) => {
      const g = new THREE.Group(), swing = new THREE.Group(); g.add(swing); scene.add(g);
      const rigid = p.photo || p.kind !== 'garment';
      const geo = new THREE.PlaneGeometry(1, 1, rigid ? 1 : 22, rigid ? 1 : 30);
      const m = mkMat(rigid); const cloth = new THREE.Mesh(geo, m); swing.add(cloth);
      const hm = mkMat(true); const hook = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), hm); hook.position.z = 2; swing.add(hook);
      groups.push({ g, swing, cloth, hook, u: m.uniforms, lay: null });
      toCanvas(p.src, p.kind, p.photo, MAX).then((c) => {
        if (!alive || !c) return; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = r.capabilities.getMaxAnisotropy(); m.uniforms.uMap.value = t;
        if (++loaded === pieces.length) onReady(true);
      });
    });

    // DOM の並び（変形前）から、服とハンガーの位置・大きさを測る
    const measure = () => {
      const sr = stage.getBoundingClientRect();
      const W = sr.width, H = sr.height; r.setSize(W, H); cam.aspect = W / H; cam.fov = (2 * Math.atan(H / 2 / D) * 180) / Math.PI; cam.updateProjectionMatrix();
      groups.forEach((G, i) => {
        const pe = els.current[i]?.p; if (!pe) return;
        const track = pe.offsetParent as HTMLElement | null; if (!track) return;
        const off = (e: HTMLElement | null) => { let x = 0, y = 0; let n: HTMLElement | null = e; while (n && n !== pe) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; } return { x, y }; };
        const img = pe.querySelector<HTMLElement>('.rs-body img'), hk = pe.querySelector<HTMLElement>('.rs-hanger, .rs-hook');
        if (!img) return;
        const io = off(img), pw = pe.offsetWidth;
        // 変形の原点は服の上端中央（transform-origin: 50% 0）
        const lay: Layout = { top: track.offsetTop + pe.offsetTop, img: { x: io.x + img.offsetWidth / 2 - pw / 2, y: io.y + img.offsetHeight / 2, w: img.offsetWidth, h: img.offsetHeight }, hook: null };
        if (hk) { const ho = off(hk); lay.hook = { x: ho.x + hk.offsetWidth / 2 - pw / 2, y: ho.y + hk.offsetHeight / 2, w: hk.offsetWidth, h: hk.offsetHeight }; }
        G.lay = lay;
        const c = G.cloth!; c.scale.set(lay.img.w, lay.img.h, 1); c.position.set(lay.img.x, -lay.img.y, 0); G.u.uW.value = lay.img.w; G.u.uH.value = lay.img.h;
        if (G.hook && lay.hook) { G.hook.scale.set(lay.hook.w, lay.hook.h, 1); G.hook.position.set(lay.hook.x, -lay.hook.y, 2); }
        G.g.position.y = H / 2 - lay.top;
      });
    };
    measure();
    const ro = new ResizeObserver(() => measure()); ro.observe(stage);
    const t0 = performance.now(); let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const time = (performance.now() - t0) / 1000;
      const S = state.current;
      groups.forEach((G, i) => {
        const s = S[i]; if (!s || !G.lay) { G.g.visible = false; return; } G.g.visible = true;
        G.g.position.x = s.x; G.g.position.z = s.z; G.g.position.y = stage.clientHeight / 2 - G.lay.top - s.ty;
        G.g.rotation.y = (-s.r * Math.PI) / 180; G.g.scale.setScalar(s.sc);
        G.swing.rotation.z = (-s.sw * Math.PI) / 180;
        G.u.uTime.value = time; G.u.uBend.value = Math.max(-1, Math.min(1, -s.av * 0.6)); G.u.uK.value = s.k;
        (G.hook?.material as THREE.ShaderMaterial | undefined)?.uniforms && ((G.hook!.material as THREE.ShaderMaterial).uniforms.uTime.value = time);
      });
      r.render(scene, cam);
    };
    loop();
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); (m.material as THREE.Material | undefined)?.dispose?.(); }); r.dispose(); r.domElement.remove(); };
  }, [pieces, hookSrc, hangerSrc, state, els, stageRef, onReady]);
  return <div ref={host} className="rs-gl" aria-hidden />;
}
