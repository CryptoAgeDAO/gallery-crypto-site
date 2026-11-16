'use client';
// 実店舗のような3Dショップ。両側の壁一面にラックと棚。入荷（アップロード）した順に、服は切り抜いた「グラフィック」でハンガーに掛かり、
// 小物は棚に、アートは奥の壁に並ぶ。操作はストリートビューのように「場面」から「場面」へ：横にスワイプ（またはボタン）で、
// 横にすべりながらフェードして次の場所へ。作品をタップすると詳しく見られる。
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type Display = 'frame' | 'hang' | 'plinth' | 'case';
export type Shown = { id: string; title: string; sub: string; price: string; tex: string; sold?: boolean; local?: boolean; isNew?: boolean; display: Display; size: number; glb?: string };
export type Scene = { label: [string, string]; x: number; z: number; yaw: number; ids: string[] };
export type StoreApi = { go: (i: number, dir?: number) => void; goItem: (id: string) => void; scenes: Scene[] };

const W = 7.2, H = 3.4, EYE = 1.58, BAY = 4.2, RAIL = 1.86, PER_RAIL = 6, PER_SHELF = 5;

// 場面と陳列の場所を決める
export function plan(items: Shown[]) {
  const hang = items.filter((i) => i.display === 'hang');
  const small = items.filter((i) => i.display === 'case' || i.display === 'plinth');
  const art = items.filter((i) => i.display === 'frame');
  const backArt = art.slice(0, 3), extraArt = art.slice(3);
  const bays = Math.max(2, Math.ceil(hang.length / PER_RAIL), Math.ceil(small.length / PER_SHELF), Math.ceil(extraArt.length / 2));
  const L = 5 + Math.ceil(bays / 2) * BAY + 3;
  const z0 = L / 2 - 4;
  const bayOf = (k: number) => ({ side: k % 2 === 0 ? -1 : 1, z: z0 - Math.floor(k / 2) * BAY });
  const spots: Record<string, { kind: 'rail' | 'shelf' | 'wall' | 'back'; bay: number; x: number; y: number; z: number; ry: number }> = {};
  // 入荷順に、区画ごとへ均等に（左の壁1 → 右の壁1 → 左の壁2 …）
  const perR = Math.max(1, Math.ceil(hang.length / bays)), perS = Math.max(1, Math.ceil(small.length / bays));
  hang.forEach((it, i) => {
    const k = Math.floor(i / perR), j = i % perR, n = Math.min(perR, hang.length - k * perR), b = bayOf(k);
    const gap = Math.min(0.68, (BAY - 0.9) / Math.max(1, n - 1));
    spots[it.id] = { kind: 'rail', bay: k, x: b.side * (W / 2 - 0.42), y: RAIL, z: b.z + ((n - 1) / 2 - j) * gap, ry: b.side < 0 ? Math.PI / 2 : -Math.PI / 2 };
  });
  small.forEach((it, i) => {
    const k = Math.floor(i / perS), j = i % perS, n = Math.min(perS, small.length - k * perS), b = bayOf(k);
    const gap = Math.min(0.9, (BAY - 1.2) / Math.max(1, n - 1));
    spots[it.id] = { kind: 'shelf', bay: k, x: b.side * (W / 2 - 0.2), y: 2.42, z: b.z + ((n - 1) / 2 - j) * gap, ry: b.side < 0 ? Math.PI / 2 : -Math.PI / 2 };
  });
  // ラックの服が少ない区画の壁には、アートを掛ける
  extraArt.forEach((it, i) => {
    const k = bays - 1 - Math.floor(i / 2), b = bayOf(k);
    spots[it.id] = { kind: 'wall', bay: k, x: b.side * (W / 2 - 0.02), y: 1.45, z: b.z + (i % 2 ? -0.9 : 0.9), ry: b.side < 0 ? Math.PI / 2 : -Math.PI / 2 };
  });
  backArt.forEach((it, i) => {
    const n = backArt.length;
    spots[it.id] = { kind: 'back', bay: -1, x: (i - (n - 1) / 2) * 2.0, y: 1.55, z: -L / 2 + 0.02, ry: 0 };
  });
  const scenes: Scene[] = [{ label: ['Entrance', '入口'], x: 0, z: L / 2 - 0.8, yaw: 0, ids: [] }];
  for (let k = 0; k < bays; k++) {
    const b = bayOf(k);
    scenes.push({ label: [`${b.side < 0 ? 'Left' : 'Right'} wall ${Math.floor(k / 2) + 1}`, `${b.side < 0 ? '左' : '右'}の壁 ${Math.floor(k / 2) + 1}`], x: -b.side * 0.45, z: b.z, yaw: b.side < 0 ? Math.PI / 2 : -Math.PI / 2, ids: items.filter((i) => spots[i.id]?.bay === k).map((i) => i.id) });
  }
  scenes.push({ label: ['Back wall', '奥の壁'], x: 0, z: -L / 2 + 5, yaw: 0, ids: backArt.map((i) => i.id) });
  return { L, bays, spots, scenes, bayOf };
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rep?: [number, number]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function planks(g: CanvasRenderingContext2D) {
  g.fillStyle = '#b89a74'; g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 85) for (let y = -rnd(0, 400); y < 512; y += 400) {
    g.fillStyle = `hsl(${rnd(28, 34)},${rnd(28, 36)}%,${rnd(50, 60)}%)`; g.fillRect(x + 1, y + 1, 83, 398);
    g.globalAlpha = 0.08; for (let k = 0; k < 16; k++) { g.fillStyle = Math.random() > 0.5 ? '#4a2e14' : '#fff'; g.fillRect(x + rnd(2, 82), y, 1, 400); } g.globalAlpha = 1;
  }
}
function concrete(g: CanvasRenderingContext2D) {
  g.fillStyle = '#e7e4de'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '120,115,105'},${rnd(0.03, 0.08)})`; g.fillRect(rnd(0, 512), rnd(0, 512), rnd(1, 3), rnd(1, 3)); }
}
function tagTex(title: string, price: string, isNew?: boolean, sold?: boolean) {
  return canvasTex(256, 140, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 140);
    g.fillStyle = '#111'; g.font = '600 26px "Archivo","Helvetica Neue",Arial,sans-serif';
    g.fillText(title.length > 16 ? title.slice(0, 15) + '…' : title, 16, 46);
    g.font = '400 24px "Archivo","Helvetica Neue",Arial,sans-serif'; g.fillStyle = sold ? '#c0392b' : '#333'; g.fillText(sold ? 'SOLD' : price, 16, 86);
    if (isNew) { g.fillStyle = '#d2452f'; g.fillRect(16, 104, 66, 24); g.fillStyle = '#fff'; g.font = '700 16px Arial'; g.fillText('NEW', 30, 122); }
  });
}
function signTex() {
  return canvasTex(2048, 360, (g) => {
    g.fillStyle = '#151515'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 140px "Archivo","Helvetica Neue",Arial,sans-serif';
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '34px';
    g.fillText('GALLERY CRYPTO', 1024, 160);
    g.font = '400 46px "Archivo","Helvetica Neue",Arial,sans-serif'; g.fillStyle = '#777';
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '16px';
    g.fillText('ARCHIVE · VINTAGE · ART — TOKYO', 1024, 290);
  });
}

// 写真の背景（四隅の色に近い部分）を抜いて、グラフィックのように切り抜く
async function cutout(url: string): Promise<{ tex: THREE.Texture; aspect: number }> {
  const img = await new Promise<HTMLImageElement>((ok, ng) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = ng; i.src = url; });
  const k = Math.min(1, 720 / Math.max(img.naturalWidth || 720, img.naturalHeight || 660));
  const w = Math.max(8, Math.round((img.naturalWidth || 720) * k)), h = Math.max(8, Math.round((img.naturalHeight || 660) * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; g.drawImage(img, 0, 0, w, h);
  try {
    const d = g.getImageData(0, 0, w, h), px = d.data;
    const corner = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]].map(([x, y]) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]]; });
    const bg = [0, 1, 2].map((c2) => corner.reduce((s, v) => s + v[c2], 0) / 4);
    const near = (i: number) => Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) < 54;
    const seen = new Uint8Array(w * h), st: number[] = [];
    for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
    while (st.length) { const p = st.pop()!; if (seen[p]) continue; seen[p] = 1; if (!near(p * 4)) continue; px[p * 4 + 3] = 0; const x = p % w, y = (p / w) | 0; if (x > 0) st.push(p - 1); if (x < w - 1) st.push(p + 1); if (y > 0) st.push(p - w); if (y < h - 1) st.push(p + w); }
    // 縁をやわらかく、余白を詰める
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (px[i + 3] > 0) { const e = (x > 0 && px[i - 1] === 0) || (x < w - 1 && px[i + 7] === 0) || (y > 0 && px[i - w * 4 + 3] === 0) || (y < h - 1 && px[i + w * 4 + 3] === 0); if (e) px[i + 3] = 150; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    g.putImageData(d, 0, 0);
    if (x1 > x0 && y1 > y0 && (x1 - x0) * (y1 - y0) > w * h * 0.08) {
      const c2 = document.createElement('canvas'); c2.width = x1 - x0 + 1; c2.height = y1 - y0 + 1;
      c2.getContext('2d')!.drawImage(c, x0, y0, c2.width, c2.height, 0, 0, c2.width, c2.height);
      const t = new THREE.CanvasTexture(c2); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      return { tex: t, aspect: c2.height / c2.width };
    }
  } catch { /* 別のサイトの画像で読めないときは、そのまま */ }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: h / w };
}

export default function Store3D({ items, onPick, apiRef, onScene }: { items: Shown[]; onPick: (id: string) => void; apiRef: React.MutableRefObject<StoreApi | null>; onScene: (i: number, s: Scene) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const fade = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  const key = items.map((i) => [i.id, i.tex.length, i.price, i.display, i.size, i.glb || '', i.isNew ? 1 : 0].join(':')).join('|');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { el.innerHTML = '<p style="padding:20px">3D is not available in this browser.</p>'; return; }
    const mobile = matchMedia('(pointer: coarse)').matches;
    renderer.setPixelRatio(Math.min(mobile ? 1.5 : 2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeebe5);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.5;
    const P = plan(items);
    const { L, bays, spots, scenes, bayOf } = P;
    const cam = new THREE.PerspectiveCamera(mobile ? 66 : 56, 1, 0.05, 100);

    const chrome = new THREE.MeshStandardMaterial({ color: 0xe6e8ec, metalness: 1, roughness: 0.15 });
    const oak = new THREE.MeshStandardMaterial({ color: 0xc4a47c, roughness: 0.55 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf7f6f2, roughness: 0.85 });
    const black = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.5 });

    // 床・壁・天井
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, planks, [W / 3.2, L / 3.2]), roughness: 0.45 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const wallM = new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, concrete, [L / 4, 1]), roughness: 0.95 });
    const wallS = new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, concrete, [W / 4, 1]), roughness: 0.95 });
    for (const [x, z, ry, w, m] of [[-W / 2, 0, Math.PI / 2, L, wallM], [W / 2, 0, -Math.PI / 2, L, wallM], [0, -L / 2, 0, W, wallS], [0, L / 2, Math.PI, W, wallS]] as [number, number, number, number, THREE.Material][]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, H), m); p.position.set(x, H / 2, z); p.rotation.y = ry; scene.add(p);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L), white); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; scene.add(ceil);
    for (let z = L / 2 - 1.5; z > -L / 2 + 1; z -= 2.1) { const lt = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 0.18), new THREE.MeshBasicMaterial({ color: 0xffffff })); lt.position.set(0, H - 0.02, z); scene.add(lt); }
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcab89c, 1.05));
    const sun = new THREE.DirectionalLight(0xfff6ea, 0.9); sun.position.set(1, 6, 3); scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.81), new THREE.MeshBasicMaterial({ map: signTex(), transparent: true }));
    sign.position.set(0, 2.75, -L / 2 + 0.02); scene.add(sign);
    // 中央の平台（什器）
    for (let z = L / 2 - 4; z > -L / 2 + 4.5; z -= BAY * 1.5) {
      const tb = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.72, 1.8), oak); tb.position.set(0, 0.36, z); scene.add(tb);
      for (let k = 0; k < 3; k++) { const fold = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06 + k * 0.01, 0.42), new THREE.MeshStandardMaterial({ color: [0x2b2b2e, 0xa7a49c, 0x33507a][k], roughness: 0.9 })); fold.position.set(0, 0.75, z - 0.55 + k * 0.55); scene.add(fold); }
    }

    // 壁一面のラック・棚（区画ごと）
    for (let k = 0; k < bays; k++) {
      const b = bayOf(k), x = b.side * (W / 2 - 0.42);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, BAY - 0.3, 12), chrome); rail.rotation.x = Math.PI / 2; rail.position.set(x, RAIL, b.z); scene.add(rail);
      for (const dz of [-(BAY - 0.3) / 2, (BAY - 0.3) / 2]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), chrome); arm.rotation.z = Math.PI / 2; arm.position.set(b.side * (W / 2 - 0.21), RAIL, b.z + dz); scene.add(arm); }
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.035, BAY - 0.3), oak); shelf.position.set(b.side * (W / 2 - 0.18), 2.4, b.z); scene.add(shelf);
      for (const dz of [-(BAY - 0.6) / 2, 0, (BAY - 0.6) / 2]) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02), black); br.position.set(b.side * (W / 2 - 0.15), 2.37, b.z + dz); scene.add(br); }
      const kick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, BAY - 0.3), white); kick.position.set(b.side * (W / 2 - 0.03), 0.06, b.z); scene.add(kick);
    }

    // 陳列
    const picks: THREE.Object3D[] = [];
    const sway: { o: THREE.Object3D; ph: number }[] = [];
    const mark = (o: THREE.Object3D, id: string) => { o.userData.id = id; picks.push(o); };
    const gltf = new GLTFLoader();
    items.forEach((it, idx) => {
      const s = spots[it.id];
      if (!s) return;
      const g = new THREE.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = s.ry; scene.add(g);
      if (s.kind === 'rail') {
        // ハンガー＋切り抜いた服のグラフィック（正面向き）
        const hang = new THREE.Group(); hang.position.set(0, RAIL, 0.02); g.add(hang); sway.push({ o: hang, ph: idx * 0.7 });
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 16, Math.PI * 1.4), chrome); hook.position.set(0, 0.0, 0); hook.rotation.z = Math.PI * 0.8; hang.add(hook);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 6), black); bar.rotation.z = Math.PI / 2; bar.position.y = -0.09; hang.add(bar);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), chrome); neck.position.y = -0.055; hang.add(neck);
        cutout(it.tex).then(({ tex, aspect }) => {
          const w = 0.6 * Math.max(0.6, Math.min(1.6, it.size)), h = Math.min(1.5, w * aspect);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(h / aspect, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.9 }));
          m.position.y = -0.09 - h / 2 + 0.02; hang.add(m); mark(m, it.id);
          const tg = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.066), new THREE.MeshBasicMaterial({ map: tagTex(it.title, it.price, it.isNew, it.sold) }));
          tg.position.set(h / aspect / 2 - 0.04, -0.09 - h * 0.18, 0.015); tg.rotation.z = -0.12; hang.add(tg); mark(tg, it.id);
        }).catch(() => {});
      } else if (s.kind === 'shelf') {
        const pos = new THREE.Group(); pos.position.set(0, 2.42, 0.02); g.add(pos);
        const place = () => cutout(it.tex).then(({ tex, aspect }) => {
          const w = 0.46 * Math.max(0.6, Math.min(1.4, it.size)), h = Math.min(0.5, w * aspect);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(h / aspect, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.8 }));
          m.position.y = h / 2; pos.add(m); mark(m, it.id);
          const tg = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.066), new THREE.MeshBasicMaterial({ map: tagTex(it.title, it.price, it.isNew, it.sold) }));
          tg.position.set(0, -0.06, 0.2); pos.add(tg); mark(tg, it.id);
        }).catch(() => {});
        if (it.glb) gltf.load(it.glb, (r) => { const o = r.scene; const bx = new THREE.Box3().setFromObject(o), sz = bx.getSize(new THREE.Vector3()), c = bx.getCenter(new THREE.Vector3()); const k2 = 0.42 / Math.max(sz.x, sz.y, sz.z, 1e-6); o.scale.setScalar(k2); o.position.set(-c.x * k2, -bx.min.y * k2, -c.z * k2); o.traverse((m) => { if ((m as THREE.Mesh).isMesh) mark(m, it.id); }); pos.add(o); }, undefined, () => place());
        else place();
      } else {
        // アート：白いマットと黒い細縁
        cutout(it.tex).then(({ tex, aspect }) => {
          const w = Math.max(0.5, Math.min(1.8, it.size * (s.kind === 'back' ? 1.1 : 0.9))), h = w * aspect, m2 = Math.min(w, h) * 0.12;
          (tex as THREE.CanvasTexture).premultiplyAlpha = false;
          const mat = new THREE.Mesh(new THREE.PlaneGeometry(w + m2 * 2, h + m2 * 2), white); mat.position.set(0, s.y, 0.03); g.add(mat); mark(mat, it.id);
          const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); pic.position.set(0, s.y, 0.035); g.add(pic); mark(pic, it.id);
          for (const [x, y, fw, fh] of [[0, h / 2 + m2 + 0.015, w + m2 * 2 + 0.06, 0.03], [0, -h / 2 - m2 - 0.015, w + m2 * 2 + 0.06, 0.03], [-w / 2 - m2 - 0.015, 0, 0.03, h + m2 * 2], [w / 2 + m2 + 0.015, 0, 0.03, h + m2 * 2]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.05), black); f.position.set(x, s.y + y, 0.03); g.add(f); }
          const tg = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.088), new THREE.MeshBasicMaterial({ map: tagTex(it.title, it.price, it.isNew, it.sold) })); tg.position.set(w / 2 + m2 + 0.25, 1.3, 0.01); g.add(tg); mark(tg, it.id);
        }).catch(() => {});
      }
    });

    // ---- 場面の移動（フェード＋横すべり） ----
    const pose = { x: 0, z: 0, yaw: 0, px: 0, py: 0, t: 0 };
    let anim: { from: typeof pose; to: Scene; t0: number; dir: number; jumped: boolean } | null = null;
    let at = Math.min(last.current, scenes.length - 1);
    const setPose = (s: Scene) => { pose.x = s.x; pose.z = s.z; pose.yaw = s.yaw; };
    setPose(scenes[at]);
    const fadeEl = fade.current;
    const go = (i: number, dir = 1) => {
      const n = scenes.length; i = ((i % n) + n) % n;
      if (anim || i === at) return;
      anim = { from: { ...pose }, to: scenes[i], t0: performance.now(), dir, jumped: false };
      at = i; last.current = i; onScene(i, scenes[i]);
    };
    apiRef.current = {
      scenes,
      go,
      goItem: (id: string) => { const i = scenes.findIndex((s) => s.ids.includes(id)); if (i >= 0) go(i, i > at ? 1 : -1); },
    };
    onScene(at, scenes[at]);

    // ---- 操作：スワイプで場面移動、タップで作品、ポインターで少し見回す ----
    const ray = new THREE.Raycaster();
    const ndc = (x: number, y: number) => { const r = renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); };
    let down: { x: number; y: number; t: number } | null = null;
    const dom = renderer.domElement;
    dom.style.touchAction = 'none';
    const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    const pmv = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      if (down) { pose.px = Math.max(-1, Math.min(1, (e.clientX - down.x) / (r.width * 0.5))) * -0.12; return; }
      pose.px = (((e.clientX - r.left) / r.width) - 0.5) * -0.12; pose.py = (((e.clientY - r.top) / r.height) - 0.5) * -0.08;
      ray.setFromCamera(ndc(e.clientX, e.clientY), cam);
      dom.style.cursor = ray.intersectObjects(picks, false)[0] ? 'pointer' : 'ew-resize';
    };
    const pu = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y; down = null; pose.px = 0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { go(at + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); return; }
      if (Math.hypot(dx, dy) < 8) {
        ray.setFromCamera(ndc(e.clientX, e.clientY), cam);
        const hit = ray.intersectObjects(picks, false)[0];
        if (hit) { onPick(hit.object.userData.id); return; }
        // 床をタップ：画面の左右で前後の場面へ
        const r = dom.getBoundingClientRect();
        go(at + (e.clientX - r.left > r.width / 2 ? 1 : -1), e.clientX - r.left > r.width / 2 ? 1 : -1);
      }
    };
    const kd = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return; if (e.key === 'ArrowRight' || e.key === 'd') go(at + 1, 1); if (e.key === 'ArrowLeft' || e.key === 'a') go(at - 1, -1); };
    const wh = (e: WheelEvent) => { if (Math.abs(e.deltaX) > 30 || Math.abs(e.deltaY) > 60) { const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) > 0 ? 1 : -1; go(at + d, d); } };
    dom.addEventListener('pointerdown', pd); dom.addEventListener('pointermove', pmv); dom.addEventListener('pointerup', pu); dom.addEventListener('pointerleave', () => { down = null; pose.px = 0; pose.py = 0; });
    dom.addEventListener('wheel', wh, { passive: true });
    addEventListener('keydown', kd);

    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);
    let raf = 0, alive = true;
    const look = { x: 0, y: 0 };
    const loop = (now: number) => {
      if (!alive) return;
      let slide = 0;
      if (anim) {
        const T = 760, k = Math.min(1, (now - anim.t0) / T);
        // 前半：横にすべりながら白くフェードアウト → 場面を入れ替え → 後半：反対側からすべり込んでフェードイン
        const op = k < 0.5 ? k * 2 : (1 - k) * 2;
        if (fadeEl) fadeEl.style.opacity = String(Math.min(1, op * 1.1));
        if (k >= 0.5 && !anim.jumped) { setPose(anim.to); anim.jumped = true; }
        slide = (k < 0.5 ? k * 2 : -(1 - k) * 2) * 0.9 * anim.dir;
        if (k >= 1) { anim = null; if (fadeEl) fadeEl.style.opacity = '0'; }
      }
      look.x += (pose.px - look.x) * 0.08; look.y += (pose.py - look.y) * 0.08;
      const breathe = Math.sin(now / 1800) * 0.006;
      // 横すべり：向いている方向に対して右向きの軸で動かす
      const rx = Math.cos(pose.yaw), rz = -Math.sin(pose.yaw);
      cam.position.set(pose.x + rx * slide, EYE + breathe, pose.z + rz * slide);
      cam.rotation.set(0, 0, 0); cam.rotateY(pose.yaw + look.x); cam.rotateX(-0.05 + look.y);
      const tt = now / 1000;
      sway.forEach((s) => { s.o.rotation.z = Math.sin(tt * 0.9 + s.ph) * 0.012; });
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      removeEventListener('keydown', kd);
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (mt) (Array.isArray(mt) ? mt : [mt]).forEach((x) => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); }); });
      renderer.dispose(); pm.dispose(); dom.remove();
      apiRef.current = null;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="sh-3d" ref={host}><div className="sh-fade" ref={fade} /></div>;
}
