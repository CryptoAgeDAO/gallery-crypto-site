'use client';
// 3Dの展示室（美術館のホワイトキューブ）。作品は「額装」「シャドーボックス（服）」「台座（立体）」「ガラスケース」で展示する。
// 歩き方：ドラッグで見回す・床をタップでそこへ歩く・WASD／矢印キー。作品をタップすると詳しく見られる。
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type Display = 'frame' | 'hang' | 'plinth' | 'case';
export type Shown = { id: string; title: string; sub: string; price: string; tex: string; sold?: boolean; local?: boolean; display: Display; size: number; glb?: string };
type Place = { x: number; z: number; ry: number; floor: boolean; view: { x: number; z: number; yaw: number } };

const W = 13, H = 5, EYE = 1.62;
const isWall = (d: Display) => d === 'frame' || d === 'hang';

// 配置：壁の作品は左右の壁に交互に、立体とケースは部屋の中央の列に
export function layout(items: Shown[]) {
  const wall = items.filter((i) => isWall(i.display)), flo = items.filter((i) => !isWall(i.display));
  const wW = (i: Shown) => (i.display === 'hang' ? i.size + 0.3 : i.size + 0.2) + 1.9;
  const sideLen = [0, 0];
  wall.forEach((it, k) => { sideLen[k % 2] += wW(it); });
  const L = Math.max(20, Math.max(...sideLen) + 7, flo.length * 5 + 9);
  const pl: Record<string, Place> = {};
  const cur = [L / 2 - 3, L / 2 - 3];
  wall.forEach((it, k) => {
    const s = k % 2, side = s === 0 ? -1 : 1, w = wW(it);
    const z = cur[s] - w / 2; cur[s] -= w;
    const x = side * (W / 2 - 0.03);
    pl[it.id] = { x, z, ry: side < 0 ? Math.PI / 2 : -Math.PI / 2, floor: false, view: { x: side * (W / 2 - 2.9 - Math.max(0, it.size - 1) * 0.8), z, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2 } };
  });
  flo.forEach((it, k) => {
    const z = L / 2 - 6 - k * 5;
    pl[it.id] = { x: 0, z, ry: 0, floor: true, view: { x: 0, z: z + 2.4, yaw: 0 } };
  });
  return { L, pl };
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
// 明るいオークの床（長い板）
function oak(g: CanvasRenderingContext2D) {
  g.fillStyle = '#cbb390'; g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 64) for (let y = -Math.random() * 512; y < 512; y += 512) {
    const l = rnd(62, 72);
    g.fillStyle = `hsl(${rnd(32, 38)},${rnd(30, 40)}%,${l}%)`; g.fillRect(x + 1, y + 1, 62, 510);
    g.globalAlpha = 0.07; for (let k = 0; k < 14; k++) { g.fillStyle = Math.random() > 0.5 ? '#6b4a2a' : '#fff'; g.fillRect(x + rnd(2, 60), y, 1, 512); } g.globalAlpha = 1;
  }
  g.strokeStyle = 'rgba(80,55,30,.35)'; for (let x = 0; x <= 512; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
}
function captionTex(title: string, sub: string, price: string, sold?: boolean) {
  return canvasTex(512, 340, (g) => {
    g.fillStyle = '#fbfaf7'; g.fillRect(0, 0, 512, 340);
    g.fillStyle = '#111'; g.textAlign = 'left';
    g.font = '600 44px "Archivo", "Helvetica Neue", Arial, sans-serif';
    const wrap = (t: string, y: number, max: number, lh: number) => { let line = '', yy = y; for (const ch of t.split(' ')) { const tr = line ? line + ' ' + ch : ch; if (g.measureText(tr).width > max && line) { g.fillText(line, 36, yy); line = ch; yy += lh; } else line = tr; } g.fillText(line, 36, yy); return yy; };
    let y = wrap(title, 78, 440, 50);
    g.font = '400 30px "Archivo", "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#555';
    y = wrap(sub, y + 50, 440, 38);
    g.fillStyle = '#111'; g.font = '500 32px "Archivo", "Helvetica Neue", Arial, sans-serif';
    g.fillText(sold ? 'Sold' : price, 36, Math.min(310, y + 60));
    if (sold) { g.fillStyle = '#c0392b'; g.beginPath(); g.arc(470, 300, 12, 0, 7); g.fill(); }
  });
}
function signTex(text: string, sub: string) {
  return canvasTex(2048, 512, (g) => {
    g.clearRect(0, 0, 2048, 512);
    g.fillStyle = '#1a1a1a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '500 150px "Archivo", "Helvetica Neue", Arial, sans-serif';
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '30px';
    g.fillText(text, 1024, 210);
    g.font = '400 52px "Archivo", "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#777';
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '14px';
    g.fillText(sub, 1024, 360);
  });
}

type Api = { go: (i: number) => void };

export default function Store3D({ items, onPick, apiRef }: { items: Shown[]; onPick: (id: string) => void; apiRef: React.MutableRefObject<Api | null> }) {
  const host = useRef<HTMLDivElement>(null);
  const cam0 = useRef<{ x: number; z: number; yaw: number; pitch: number } | null>(null);
  const key = items.map((i) => [i.id, i.tex.length, i.price, i.display, i.size, i.glb || ''].join(':')).join('|');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { el.innerHTML = '<p style="padding:20px">3D is not available in this browser.</p>'; return; }
    const mobile = matchMedia('(pointer: coarse)').matches;
    renderer.setPixelRatio(Math.min(mobile ? 1.5 : 2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f1ec);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
    const { L, pl } = layout(items);
    scene.fog = new THREE.Fog(0xf3f1ec, 14, L + 10);
    const cam = new THREE.PerspectiveCamera(mobile ? 70 : 60, 1, 0.05, 200);
    const st = cam0.current && Math.abs(cam0.current.z) < L / 2 ? cam0.current : { x: 0, z: L / 2 - 1.6, yaw: 0, pitch: -0.03 };
    const target = { x: st.x, z: st.z, yaw: st.yaw, pitch: st.pitch, walking: false };

    // 材質
    const plaster = new THREE.MeshStandardMaterial({ color: 0xf6f4ef, roughness: 0.95 });
    const white = new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.8 });
    const oakMat = new THREE.MeshStandardMaterial({ color: 0xc8ae86, roughness: 0.55 });
    const blackFrame = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.45 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.02, metalness: 0.1, envMapIntensity: 1.6, depthWrite: false });
    const felt = new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 1 });

    // 床・壁・天井・天窓
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, oak, [W / 3, L / 5]), roughness: 0.42, envMapIntensity: 0.6 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    for (const [x, z, ry, w] of [[-W / 2, 0, Math.PI / 2, L], [W / 2, 0, -Math.PI / 2, L], [0, -L / 2, 0, W], [0, L / 2, Math.PI, W]] as [number, number, number, number][]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, H), plaster); p.position.set(x, H / 2, z); p.rotation.y = ry; scene.add(p);
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.02), white); base.position.set(x, 0.05, z); base.rotation.y = ry; base.translateZ(0.01); scene.add(base);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L), white); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; scene.add(ceil);
    // 天窓（やわらかい光の帯）とライティングレール
    const sky = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let z = L / 2 - 4; z > -L / 2 + 2; z -= 6) { const s = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), sky); s.rotation.x = Math.PI / 2; s.position.set(0, H - 0.01, z); scene.add(s); }
    for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, L - 1), steel); r.position.set(sx * (W / 2 - 1.6), H - 0.4, 0); scene.add(r); }
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc4b2, 0.95));
    const sun = new THREE.DirectionalLight(0xfff8ee, 1.1); sun.position.set(2, 10, 4); scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    // 奥の壁の展覧会タイトル
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ map: signTex('GALLERY CRYPTO', 'ARCHIVE · ART · OBJECTS — TOKYO 2027'), transparent: true }));
    sign.position.set(0, 2.6, -L / 2 + 0.02); scene.add(sign);

    // ベンチ（オークの座面・黒い脚）—作品の列がない中央に
    const benches: number[] = [];
    for (let z = L / 2 - 8.5; z > -L / 2 + 4; z -= 10) if (!Object.values(pl).some((p) => p.floor && Math.abs(p.z - z) < 2.2)) benches.push(z);
    for (const z of benches) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.08, 1.9, 2, 0.02), oakMat); b.position.set(0, 0.45, z); scene.add(b);
      for (const dz of [-0.8, 0.8]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.41, 0.04), blackFrame); l.position.set(0, 0.205, z + dz); scene.add(l); }
    }

    const loader = new THREE.TextureLoader();
    const gltf = new GLTFLoader();
    const picks: THREE.Object3D[] = [];
    const spins: THREE.Object3D[] = [];
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff6e6, transparent: true, opacity: 0.022, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const poolTex = canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,240,215,.45)'); r.addColorStop(1, 'rgba(255,240,215,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const mark = (o: THREE.Object3D, id: string) => { o.userData.id = id; picks.push(o); };
    const caption = (it: Shown) => new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16), new THREE.MeshBasicMaterial({ map: captionTex(it.title, it.sub, it.price, it.sold) }));
    const withTex = (url: string, cb: (t: THREE.Texture, aspect: number) => void) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; const im = t.image as { width: number; height: number }; cb(t, im.height / im.width || 1); });
    // 額の縁（中心 0、幅 w・高さ h）
    const frameAround = (g: THREE.Group, w: number, h: number, th: number, mat: THREE.Material, depth = 0.05) => {
      for (const [x, y, fw, fh] of [[0, h / 2 + th / 2, w + th * 2, th], [0, -h / 2 - th / 2, w + th * 2, th], [-w / 2 - th / 2, 0, th, h], [w / 2 + th / 2, 0, th, h]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, depth), mat); b.position.set(x, y, depth / 2); g.add(b);
      }
    };
    // 壁の作品を照らす光（光源は使わず、光の筋で）
    const wallLight = (g: THREE.Group, w: number, top: number) => {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, Math.max(0.35, w * 0.45), 1.9, 24, 1, true), beamMat);
      beam.position.set(0, top + 0.4, 1.05); beam.rotation.x = -0.45; g.add(beam);
      const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 16), steel); spot.position.set(0, H - 0.5, 1.6); spot.rotation.x = 0.6; g.add(spot);
    };

    items.forEach((it) => {
      const p = pl[it.id];
      const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = p.ry;
      scene.add(g);
      if (it.display === 'frame') {
        // 額装：白いマット＋黒い細縁
        const w = it.size;
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xdddddd })); pic.position.set(0, 1.6, 0.06); g.add(pic); mark(pic, it.id);
        withTex(it.tex, (t, a) => {
          const h = w * a, m = Math.min(w, h) * 0.12;
          pic.scale.set(w, h, 1); (pic.material as THREE.MeshBasicMaterial).map = t; (pic.material as THREE.MeshBasicMaterial).color.set(0xffffff); (pic.material as THREE.MeshBasicMaterial).needsUpdate = true;
          const mat = new THREE.Mesh(new THREE.PlaneGeometry(w + m * 2, h + m * 2), white); mat.position.set(0, 1.6, 0.05); g.add(mat); mark(mat, it.id);
          const fg = new THREE.Group(); fg.position.set(0, 1.6, 0); frameAround(fg, w + m * 2, h + m * 2, 0.03, blackFrame, 0.07); g.add(fg);
          const cp = caption(it); cp.position.set(w / 2 + m + 0.35, 1.35, 0.01); g.add(cp); mark(cp, it.id);
          wallLight(g, w + m * 2, 1.6 + h / 2 + m);
        });
      } else if (it.display === 'hang') {
        // 服を作品のように：シャドーボックス（奥行きのある額）
        const w = it.size;
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true })); pic.position.set(0, 1.55, 0.08); g.add(pic); mark(pic, it.id);
        withTex(it.tex, (t, a) => {
          const h = w * a, pad = 0.14;
          pic.scale.set(w, h, 1); (pic.material as THREE.MeshBasicMaterial).map = t; (pic.material as THREE.MeshBasicMaterial).color.set(0xffffff); (pic.material as THREE.MeshBasicMaterial).needsUpdate = true;
          const back = new THREE.Mesh(new THREE.BoxGeometry(w + pad * 2, h + pad * 2, 0.02), felt); back.position.set(0, 1.55, 0.01); g.add(back); mark(back, it.id);
          const fg = new THREE.Group(); fg.position.set(0, 1.55, 0); frameAround(fg, w + pad * 2, h + pad * 2, 0.035, oakMat, 0.16); g.add(fg);
          const gl = new THREE.Mesh(new THREE.PlaneGeometry(w + pad * 2, h + pad * 2), glass); gl.position.set(0, 1.55, 0.16); g.add(gl);
          const cp = caption(it); cp.position.set(w / 2 + pad + 0.35, 1.35, 0.01); g.add(cp); mark(cp, it.id);
          wallLight(g, w + pad * 2, 1.55 + h / 2 + pad);
        });
      } else if (it.display === 'plinth') {
        // 台座：白い箱。上に立体（.glb）か、写真をアクリルブロックに
        const ph = 0.95, pw = 0.62 * Math.max(0.8, it.size);
        const base = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pw), white); base.position.y = ph / 2; g.add(base); mark(base, it.id);
        const cp = caption(it); cp.position.set(0, 0.62, pw / 2 + 0.002); g.add(cp); mark(cp, it.id);
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.006; g.add(pool);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.42, H - 1.6, 24, 1, true), beamMat); beam.position.y = ph + (H - 1.6) / 2 + 0.3; g.add(beam);
        const top = new THREE.Group(); top.position.y = ph; g.add(top); spins.push(top);
        const photo = () => withTex(it.tex, (t, a) => {
          const w = 0.55 * it.size, h = w * a;
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); m.position.y = h / 2 + 0.04; top.add(m); mark(m, it.id);
          const block = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.1), glass); block.position.y = h / 2 + 0.04; top.add(block);
        });
        if (it.glb) {
          gltf.load(it.glb, (r) => {
            const o = r.scene; const box = new THREE.Box3().setFromObject(o), s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
            const k = (0.6 * it.size) / Math.max(s.x, s.y, s.z, 1e-6);
            o.scale.setScalar(k); o.position.set(-c.x * k, -box.min.y * k, -c.z * k);
            o.traverse((m) => { if ((m as THREE.Mesh).isMesh) mark(m, it.id); });
            top.add(o);
          }, undefined, photo);
        } else photo();
      } else {
        // ガラスケース（帽子・小物）
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.95, 0.7), white); base.position.y = 0.475; g.add(base); mark(base, it.id);
        const gl = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.9, 0.68), glass); gl.position.y = 1.4; g.add(gl); mark(gl, it.id);
        const cp = caption(it); cp.position.set(0, 0.7, 0.352); g.add(cp); mark(cp, it.id);
        const top = new THREE.Group(); top.position.y = 0.97; g.add(top); spins.push(top);
        withTex(it.tex, (t, a) => {
          const w = 0.62, h = w * a;
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); m.position.y = h / 2 + 0.05; top.add(m); mark(m, it.id);
        });
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.006; g.add(pool);
      }
      if (it.local) { const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xd2452f })); tag.position.set(p.floor ? 0.4 : 0, p.floor ? 0.9 : 0.4, p.floor ? 0.36 : 0.01); g.add(tag); }
    });

    // ---- 操作 ----
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return; keys.add(e.key.toLowerCase()); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault(); target.walking = false; };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    const ray = new THREE.Raycaster();
    const ndc = (e: PointerEvent) => { const r = renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
    let down: { x: number; y: number; yaw: number; pitch: number; id: number } | null = null;
    let moved = false, hover: string | null = null;
    const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, yaw: target.yaw, pitch: target.pitch, id: e.pointerId }; moved = false; renderer.domElement.setPointerCapture(e.pointerId); };
    const pmv = (e: PointerEvent) => {
      if (down && down.id === e.pointerId) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (Math.hypot(dx, dy) > 6) moved = true;
        if (moved) { target.yaw = down.yaw + dx * 0.004; target.pitch = Math.max(-0.7, Math.min(0.6, down.pitch + dy * 0.003)); }
        return;
      }
      ray.setFromCamera(ndc(e), cam);
      const hit = ray.intersectObjects(picks, false)[0];
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
      hover = hit ? hit.object.userData.id : null;
    };
    const pu = (e: PointerEvent) => {
      if (!down) return;
      const wasMove = moved; down = null;
      if (wasMove) return;
      ray.setFromCamera(ndc(e), cam);
      const hit = ray.intersectObjects(picks, false)[0];
      if (hit && hit.distance < 10) { onPick(hit.object.userData.id); return; }
      const f = ray.intersectObject(floor, false)[0];
      if (f) { target.x = f.point.x; target.z = f.point.z; target.walking = true; }
    };
    renderer.domElement.addEventListener('pointerdown', pd);
    renderer.domElement.addEventListener('pointermove', pmv);
    renderer.domElement.addEventListener('pointerup', pu);
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';

    apiRef.current = {
      go: (i: number) => {
        const it = items[i]; if (!it) return; const v = pl[it.id].view;
        target.x = v.x; target.z = v.z; target.yaw = v.yaw; target.pitch = pl[it.id].floor ? -0.18 : -0.04; target.walking = true;
      },
    };

    const pos = new THREE.Vector3(st.x, EYE, st.z);
    let yaw = st.yaw, pitch = st.pitch;
    const floorPts = Object.values(pl).filter((p) => p.floor);
    const clampPos = () => {
      pos.x = Math.max(-W / 2 + 0.9, Math.min(W / 2 - 0.9, pos.x)); pos.z = Math.max(-L / 2 + 1, Math.min(L / 2 - 0.8, pos.z));
      for (const p of floorPts) { const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz); if (d < 1.0) { const k = 1.0 / (d || 1e-3); pos.x = p.x + dx * k; pos.z = p.z + (d ? dz * k : 1); } }
    };
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);
    let raf = 0, last = performance.now(), alive = true;
    const loop = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      let fwd = 0, side = 0, turn = 0;
      if (keys.has('w') || keys.has('arrowup')) fwd += 1;
      if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
      if (keys.has('a')) side -= 1;
      if (keys.has('d')) side += 1;
      if (keys.has('arrowleft') || keys.has('q')) turn += 1;
      if (keys.has('arrowright') || keys.has('e')) turn -= 1;
      target.yaw += turn * dt * 1.6;
      const sp = 2.4 * dt;
      if (fwd || side) {
        pos.x += (-Math.sin(yaw) * fwd + Math.cos(yaw) * side) * sp;
        pos.z += (-Math.cos(yaw) * fwd - Math.sin(yaw) * side) * sp;
      } else if (target.walking) {
        const dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz);
        if (d < 0.05) target.walking = false; else { const k = Math.min(1, (3 * dt) / d); pos.x += dx * k; pos.z += dz * k; }
      }
      clampPos();
      let dyaw = target.yaw - yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      yaw += dyaw * Math.min(1, dt * 7); pitch += (target.pitch - pitch) * Math.min(1, dt * 7);
      cam.position.set(pos.x, EYE, pos.z);
      cam.rotation.set(0, 0, 0); cam.rotateY(yaw); cam.rotateX(pitch);
      // 台座とケースの作品はゆっくり回る。指している作品は少し速く
      spins.forEach((s) => { const hv = s.parent && s.parent.children.some((c) => c.userData.id === hover); s.rotation.y += dt * (hv ? 0.9 : 0.25); });
      cam0.current = { x: pos.x, z: pos.z, yaw: target.yaw, pitch: target.pitch };
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      removeEventListener('keydown', kd); removeEventListener('keyup', ku);
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (mt) (Array.isArray(mt) ? mt : [mt]).forEach((x) => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); }); });
      renderer.dispose(); pm.dispose(); el.innerHTML = '';
      apiRef.current = null;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="sh-3d" ref={host} />;
}
