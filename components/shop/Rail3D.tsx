'use client';
// レールの服を立体で描く層。スマートスキャンと同じしくみ（正面・背面の写真から服の形をふくらませて立体にし、
// 写真をそのまま表と裏に貼る）で、一着ずつ3Dの服をつくる。柄・プリント・色は写真（スキャン）のまま。
// 位置と大きさは、下にある HTML のハンガー（.hr-pc）に毎フレーム合わせるので、揺れ・寄る・ぼけるの動きはそのまま。
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildGarment } from '../garment3d';
import { segment } from '../scanSegment';
import type { Layer } from '../GhostMannequin';
import { isPhone } from '@/lib/device';
import type { RailItem } from './HangRail';

export type Rail3DState = { k: number; view: 'front' | 'back' | 'detail'; spin: number; dragging: boolean };

const MAXPX = 640;
function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}
// 画像 → 服の切り抜き（透明のある絵はその透明を、写真は背景を抜く）
async function layerOf(src: string): Promise<Layer | null> {
  const im = await load(src); if (!im || !im.naturalWidth) return null;
  const k = Math.min(1, MAXPX / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.max(2, Math.round(im.naturalWidth * k)), h = Math.max(2, Math.round(im.naturalHeight * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(im, 0, 0, w, h);
  let data: ImageData; try { data = g.getImageData(0, 0, w, h); } catch { return null; }
  const L: Layer = { img: c, data, mask: new Uint8ClampedArray(w * h), w, h };
  const a = data.data, corners = [0, w - 1, (h - 1) * w, h * w - 1].reduce((s, i) => s + a[i * 4 + 3], 0) / 4;
  if (corners < 20) { for (let i = 0; i < w * h; i++) L.mask[i] = a[i * 4 + 3] > 110 ? 255 : 0; }
  else { L.mask.fill(255); segment(L, 9); }
  return L;
}
function bboxOf(L: Layer) {
  let x0 = L.w, y0 = L.h, x1 = 0, y1 = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.mask[y * L.w + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < x0 ? null : { fx: x0 / L.w, fy: y0 / L.h, fw: (x1 - x0 + 1) / L.w };
}

type Built = { id: string; pivot: THREE.Group; mats: THREE.Material[]; widthM: number; fx: number; fy: number; fw: number; yaw: number };

export default function Rail3D({ items, host, pcEls, sway, state, onReady }: {
  items: RailItem[];
  host: React.RefObject<HTMLDivElement>;
  pcEls: React.MutableRefObject<(HTMLDivElement | null)[]>;
  sway: React.MutableRefObject<{ a: number; v: number }[]>;
  state: React.MutableRefObject<Rail3DState>;
  onReady: (id: string, ok: boolean) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const itemsR = useRef(items); itemsR.current = items;
  const built = useRef<Map<string, Built>>(new Map());
  const api = useRef<{ add: (b: Built) => void } | null>(null);

  // 描画の準備（一度だけ）
  useEffect(() => {
    const el = wrap.current, hs = host.current; if (!el || !hs) return;
    const mobile = isPhone();
    let r: THREE.WebGLRenderer;
    try { r = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: mobile ? 'default' : 'high-performance' }); } catch { itemsR.current.forEach((i) => onReady(i.id, false)); return; }
    r.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2)); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(r.domElement);
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfcac2, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-0.6, 1, 1.4); scene.add(key);
    const rim = new THREE.DirectionalLight(0xfff1e0, 0.6); rim.position.set(1, 0.4, -0.6); scene.add(rim);
    let W = hs.clientWidth, H = hs.clientHeight;
    const cam = new THREE.OrthographicCamera(0, W, 0, -H, -4000, 4000);
    const size = () => { W = hs.clientWidth; H = hs.clientHeight; r.setSize(W, H); cam.right = W; cam.bottom = -H; cam.updateProjectionMatrix(); };
    size(); const ro = new ResizeObserver(size); ro.observe(hs);
    api.current = { add: (b) => scene.add(b.pivot) };

    let raf = 0, prev = performance.now(); const t0 = prev;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now; const t = (now - t0) / 1000;
      const hr = hs.getBoundingClientRect(), st = state.current;
      built.current.forEach((b) => { b.pivot.visible = false; });
      itemsR.current.forEach((it, i) => {
        const b = built.current.get(it.id), pc = pcEls.current[i]; if (!b) return;
        if (!pc) return;
        const rc = pc.getBoundingClientRect(), slot = pc.closest('.hr-slot') as HTMLElement | null;
        const focused = i === st.k;
        if (focused && st.view === 'detail') return;
        if (st.k >= 0 && !focused) return; // 一着を見ているあいだ、ほかの服は HTML の（ぼかした）絵で
        b.pivot.visible = rc.width > 2;
        // 画像の中の服の位置に合わせて置く（肩の線が HTML のハンガーの下に来る）
        const wpx = rc.width * b.fw, sc = wpx / b.widthM;
        const cx = rc.left - hr.left + rc.width * (b.fx + b.fw / 2), top = rc.top - hr.top + rc.height * b.fy - rc.width * 0.05;
        b.pivot.position.set(cx, -top, Number(slot?.style.zIndex || 100));
        b.pivot.scale.setScalar(sc);
        // 揺れ（HTML のばねと同じ値）と、向き：ふだんは少しだけ斜め、見ているときは指で回せる。背中を選ぶと裏返る
        const swing = ((sway.current[i]?.a || 0) + (reduce ? 0 : Math.sin(t * 0.9 + i * 1.7) * 0.35)) * Math.PI / 180;
        b.pivot.rotation.z = -swing;
        const idle = reduce ? 0 : Math.sin(t * 0.5 + i * 0.9) * 0.18;
        const want = focused ? (st.view === 'back' ? Math.PI : 0) + st.spin + (st.dragging ? 0 : Math.sin(t * 0.6) * 0.12) : -0.22 + idle;
        b.yaw += (want - b.yaw) * Math.min(1, dt * (st.dragging && focused ? 20 : 4));
        b.pivot.rotation.y = b.yaw;
        const op = slot ? Number(getComputedStyle(slot).opacity) : 1;
        b.mats.forEach((m) => { m.transparent = op < 0.98; m.opacity = op; m.depthWrite = op >= 0.98; });
      });
      r.render(scene, cam);
    };
    loop();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); built.current.forEach((b) => { b.pivot.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mm = m.material as THREE.MeshStandardMaterial; mm.map?.dispose(); mm.dispose(); } }); }); built.current.clear(); pm.dispose(); r.dispose(); r.domElement.remove(); api.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 服を一着ずつ立体にする（見えている順に、少しずつ）
  useEffect(() => {
    let alive = true;
    const mobile = isPhone();
    (async () => {
      for (const it of items) {
        if (!alive) return;
        if ((it.kind || 'garment') !== 'garment' || built.current.has(it.id) || !it.src) continue;
        await new Promise((r) => setTimeout(r, 16));
        try {
          const F = await layerOf(it.src); if (!F) { onReady(it.id, false); continue; }
          const B = it.back ? await layerOf(it.back) : null;
          const bb = bboxOf(F); if (!bb) { onReady(it.id, false); continue; }
          const g = buildGarment(F, B, 1, 1, mobile ? 512 : 1024); if (!g || !alive) { onReady(it.id, false); continue; }
          // 肩の上・横の中央を原点に
          const box = new THREE.Box3().setFromObject(g.group), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
          g.group.position.set(-c.x, -box.max.y, -c.z);
          const pivot = new THREE.Group(); pivot.add(g.group);
          const mats: THREE.Material[] = []; g.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && !Array.isArray(m)) { if (m.side === THREE.BackSide) m.color.setHex(0x8d877e); mats.push(m); } });
          const b: Built = { id: it.id, pivot, mats, widthM: s.x, fx: bb.fx, fy: bb.fy, fw: bb.fw, yaw: -0.22 };
          built.current.set(it.id, b); api.current?.add(b); onReady(it.id, true);
        } catch { onReady(it.id, false); }
      }
    })();
    return () => { alive = false; };
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={wrap} className="hr-3d" aria-hidden />;
}
