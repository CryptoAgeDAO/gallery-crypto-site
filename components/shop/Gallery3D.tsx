'use client';
// 美術館のような展示室（3D）：トラバーチンの壁、ブロンズの壁面に天井からの光の筋、壁に光る丸いポイント。
// ポイント（または作品）を押すと作品に近づき、横から詳細が開く。部屋を移るときは大理石の板が横切る。
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type GPiece = { id: string; title: string; kind: 'garment' | 'cap' | 'art'; tex: string };
export type GRoom = { key: string; pieces: GPiece[] };
export type GalleryApi = { goRoom: (i: number) => void; focus: (id: string | null) => void };
export type GState = { room: number; focus: string | null; moving: boolean; ready: boolean };

const RW = 16; // 部屋の幅
const WALL_Z = -5;
const CAM_Z = 4.2;

// ---- 素材（キャンバスで描く） ----
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = (a: number, b: number) => a + rnd() * (b - a);
function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h); return c;
}
function tex(c: HTMLCanvasElement, rep?: [number, number]) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
const travertine = () => canvas(1024, 512, (g, w, h) => {
  g.fillStyle = '#d9ceb9'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { const y = R(0, h); g.fillStyle = `rgba(${rnd() < 0.5 ? '120,100,70' : '255,250,240'},${R(0.03, 0.09)})`; g.fillRect(0, y, w, R(1, 7)); }
  for (let i = 0; i < 520; i++) { g.fillStyle = `rgba(110,90,60,${R(0.08, 0.22)})`; g.beginPath(); g.ellipse(R(0, w), R(0, h), R(2, 12), R(0.6, 1.8), 0, 0, 7); g.fill(); }
});
const marble = () => canvas(768, 1152, (g, w, h) => {
  const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#efe8dc'); bg.addColorStop(1, '#e2d8c8'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  // 大きなにじみ（錆色・灰色）
  for (let i = 0; i < 9; i++) {
    const x = R(0, w), y = R(0, h), r = R(80, 260), cg = g.createRadialGradient(x, y, 0, x, y, r);
    const col = ['150,80,45', '120,110,100', '170,120,80', '90,70,60'][i % 4];
    cg.addColorStop(0, `rgba(${col},${R(0.25, 0.5)})`); cg.addColorStop(1, `rgba(${col},0)`); g.fillStyle = cg; g.fillRect(0, 0, w, h);
  }
  // 筋
  for (let i = 0; i < 26; i++) {
    let x = R(-100, w), y = R(-100, 0); g.beginPath(); g.moveTo(x, y);
    const a = R(0.9, 1.6);
    let px = x, py = y; while (y < h + 100) { const nx = x + Math.cos(a) * 60 + R(-26, 26), ny = y + Math.sin(a) * 60 + R(0, 24); g.quadraticCurveTo(px + R(-20, 20), (py + ny) / 2, nx, ny); px = x = nx; py = y = ny; }
    g.strokeStyle = `rgba(${rnd() < 0.5 ? '110,60,35' : '80,75,70'},${R(0.18, 0.6)})`; g.lineWidth = R(0.6, i < 6 ? 7 : 2.5); g.stroke();
  }
});
const bronzeWall = (xs: number[]) => canvas(2048, 820, (g, w, h) => {
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#5b5044'); bg.addColorStop(1, '#4a4037'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,240,220'},${R(0.01, 0.04)})`; g.fillRect(R(0, w), 0, R(1, 3), h); }
  // 天井の灯りが壁をなめる光の筋
  g.globalCompositeOperation = 'screen';
  for (const u of xs) {
    const x = u * w;
    g.save(); g.translate(x, 0); g.scale(1, 3.2);
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.075);
    cg.addColorStop(0, 'rgba(255,226,180,.85)'); cg.addColorStop(0.35, 'rgba(240,200,150,.35)'); cg.addColorStop(1, 'rgba(240,200,150,0)');
    g.fillStyle = cg; g.beginPath(); g.arc(0, 0, w * 0.075, 0, 7); g.fill(); g.restore();
  }
});
const floorTex = () => canvas(1024, 1024, (g, w, h) => {
  g.fillStyle = '#c4bcae'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    for (let k = 0; k < 40; k++) { const x = i * 512 + R(0, 512), y = j * 512 + R(0, 512), r = R(30, 140), cg = g.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, `rgba(${rnd() < 0.5 ? '255,255,250' : '170,160,145'},${R(0.05, 0.14)})`); cg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cg; g.fillRect(i * 512, j * 512, 512, 512); }
  }
  g.fillStyle = 'rgba(150,140,125,.7)'; g.fillRect(511, 0, 2, h); g.fillRect(0, 511, w, 2); g.fillRect(0, 0, 1, h); g.fillRect(0, 0, w, 1);
});
const ringTex = () => canvas(256, 256, (g) => {
  const cg = g.createRadialGradient(128, 128, 60, 128, 128, 128); cg.addColorStop(0, 'rgba(255,240,210,.0)'); cg.addColorStop(0.8, 'rgba(255,230,190,.35)'); cg.addColorStop(1, 'rgba(255,230,190,0)');
  g.fillStyle = cg; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(128, 128, 86, 0, 7); g.fill();
  g.strokeStyle = 'rgba(244,226,186,1)'; g.lineWidth = 7; g.beginPath(); g.arc(128, 128, 88, 0, 7); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 9, 0, 7); g.fill();
});
const shadowTex = () => canvas(128, 128, (g) => { const cg = g.createRadialGradient(64, 64, 0, 64, 64, 64); cg.addColorStop(0, 'rgba(0,0,0,.55)'); cg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cg; g.fillRect(0, 0, 128, 128); });
const leafTex = () => canvas(128, 256, (g) => {
  g.fillStyle = '#3d5a37'; g.beginPath(); g.moveTo(64, 250); g.bezierCurveTo(0, 170, 10, 60, 64, 4); g.bezierCurveTo(118, 60, 128, 170, 64, 250); g.fill();
  g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(64, 250); g.bezierCurveTo(30, 170, 36, 60, 64, 4); g.lineTo(64, 250); g.fill();
  g.strokeStyle = 'rgba(200,220,160,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 250); g.lineTo(64, 10); g.stroke();
});

export default function Gallery3D({ rooms, apiRef, onState, onPick }: { rooms: GRoom[]; apiRef: React.MutableRefObject<GalleryApi | null>; onState: (s: GState) => void; onPick: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef({ onState, onPick }); cb.current = { onState, onPick };

  useEffect(() => {
    const el = host.current!; seed = 7;
    const mobile = matchMedia('(max-width: 760px)').matches;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.6 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1a1714);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.38;
    const camera = new THREE.PerspectiveCamera(mobile ? 62 : 50, 1, 0.05, 80); scene.add(camera);

    // 共通の素材
    const travC = travertine(), floorC = floorTex();
    const travMat = (rx: number, ry: number) => new THREE.MeshStandardMaterial({ map: tex(travC, [rx, ry]), roughness: 0.85 });
    const floorMat = new THREE.MeshStandardMaterial({ map: tex(floorC, [RW / 4, 3]), roughness: 0.28, metalness: 0.05, envMapIntensity: 0.9 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xd9d3ca, roughness: 0.95 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a50, metalness: 0.9, roughness: 0.32 });
    const darkBronze = new THREE.MeshStandardMaterial({ color: 0x2c2620, metalness: 0.6, roughness: 0.45 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
    const coveMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const marbleTex = tex(marble());
    const marbleMat = new THREE.MeshStandardMaterial({ map: marbleTex, roughness: 0.42, metalness: 0.0 });
    const ringT = tex(ringTex()), shadowT = tex(shadowTex()), leafT = tex(leafTex());
    const leafMat = new THREE.MeshStandardMaterial({ map: leafT, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 });
    const loader = new THREE.TextureLoader();

    const hits: THREE.Object3D[] = []; // 押せるもの
    const rings: THREE.Sprite[] = [];
    const spots: { id: string; room: number; pos: THREE.Vector3; h: number }[] = [];

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };

    rooms.forEach((room, ri) => {
      const g = new THREE.Group(); g.position.x = ri * RW; scene.add(g);
      const n = room.pieces.length;
      const fw = Math.min(11, Math.max(5, n * 1.75 + 1.4)); // ブロンズの壁面の幅
      const xs = room.pieces.map((_, k) => (n === 1 ? 0 : -fw / 2 + 0.95 + (k * (fw - 1.9)) / (n - 1)));
      // 床・天井・壁
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(RW, 12), floorMat); fl.rotation.x = -Math.PI / 2; fl.position.z = -0.5; g.add(fl);
      const ce = new THREE.Mesh(new THREE.PlaneGeometry(RW, 12), ceilMat); ce.rotation.x = Math.PI / 2; ce.position.set(0, 3.8, -0.5); g.add(ce);
      box(RW, 3.8, 0.2, travMat(3, 1), 0, 1.9, WALL_Z - 0.1, g);
      // 隣の部屋との壁（出入口つき）
      const side = (sx: number, door: boolean) => {
        if (!door) { box(0.2, 3.8, 12, travMat(2, 1), sx, 1.9, -0.5, g); return; }
        box(0.2, 3.8, 2.8, travMat(0.6, 1), sx, 1.9, -3.6, g);
        box(0.2, 3.8, 4.8, travMat(1, 1), sx, 1.9, 2.6, g);
        box(0.2, 0.8, 2.4, travMat(0.5, 0.2), sx, 3.4, -1, g);
      };
      if (ri === 0) side(-RW / 2, false);
      side(RW / 2, ri < rooms.length - 1);
      // ブロンズの壁面と、上の間接照明
      const fwm = new THREE.MeshStandardMaterial({ map: tex(bronzeWall(xs.map((x) => (x + fw / 2) / fw))), roughness: 0.6, metalness: 0.25 });
      box(fw, 3.4, 0.08, fwm, 0, 1.7, WALL_Z + 0.04, g);
      box(fw, 0.02, 0.04, coveMat, 0, 3.42, WALL_Z + 0.1, g);
      // 天井のダウンライト
      xs.forEach((x) => { const d = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), lampMat); d.rotation.x = Math.PI / 2; d.position.set(x, 3.79, WALL_Z + 0.6); g.add(d); });
      for (let i = -2; i <= 2; i++) for (const z of [-1.6, 1.4]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), lampMat); d.rotation.x = Math.PI / 2; d.position.set(i * 3, 3.79, z); g.add(d); }
      // 部屋の灯り
      const sp = new THREE.SpotLight(0xffe6c4, 46, 12, 0.95, 1, 1.6); sp.position.set(0, 3.7, -1.2); sp.target.position.set(0, 1.4, WALL_Z); g.add(sp, sp.target);
      const pl = new THREE.PointLight(0xfff0dc, 9, 14, 1.6); pl.position.set(0, 3.2, 1.5); g.add(pl);

      // 作品
      room.pieces.forEach((p, k) => {
        const x = xs[k];
        const cy = p.kind === 'cap' ? 1.55 : 1.85;
        const maxH = p.kind === 'garment' ? 1.45 : p.kind === 'cap' ? 0.62 : 1.05;
        const maxW = Math.min(1.5, (fw - 1.2) / Math.max(1, n) + 0.15);
        const mat = new THREE.MeshStandardMaterial({ color: p.kind === 'art' ? 0xdcd6cc : 0xf2eee8, roughness: 0.9, transparent: true, alphaTest: 0.04 });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        plane.userData.id = p.id; hits.push(plane);
        const z = WALL_Z + (p.kind === 'art' ? 0.13 : 0.24);
        plane.position.set(x, cy, z); g.add(plane);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, depthWrite: false, opacity: 0.55 }));
        sh.position.set(x + 0.06, cy - 0.08, WALL_Z + 0.085); g.add(sh);
        let frame: THREE.Mesh | null = null;
        if (p.kind === 'art') frame = box(1, 1, 0.05, darkBronze, x, cy, WALL_Z + 0.1, g);
        if (p.kind === 'cap') box(0.9, 0.04, 0.34, travMat(0.3, 0.1), x, cy - 0.33, WALL_Z + 0.25, g);
        if (p.kind === 'garment') { box(0.05, 0.05, 0.26, brass, x, cy + 0.82, WALL_Z + 0.17, g); }
        const fit = (a: number) => {
          let w = maxH * a, h = maxH; if (w > maxW) { w = maxW; h = w / a; }
          plane.scale.set(w, h, 1); sh.scale.set(w * 1.25, h * 1.15, 1);
          if (frame) frame.scale.set(w + 0.12, h + 0.12, 1);
          if (p.kind === 'cap') plane.position.y = cy - 0.31 + h / 2;
          if (p.kind === 'garment') plane.position.y = cy + 0.8 - h / 2;
          sh.position.y = plane.position.y - 0.08;
        };
        fit(1);
        if (p.tex) loader.load(p.tex, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; mat.map = t; mat.needsUpdate = true; const im = t.image as { width: number; height: number }; if (im?.width) fit(im.width / im.height); });
        // 壁の丸いポイント
        const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringT, transparent: true, depthWrite: false, opacity: 0.95 }));
        ring.position.set(x, 0.62, WALL_Z + 0.2); ring.scale.setScalar(0.34); ring.userData.id = p.id; ring.userData.base = 0.34; g.add(ring); hits.push(ring); rings.push(ring);
        spots.push({ id: p.id, room: ri, pos: new THREE.Vector3(ri * RW + x, cy, z), h: maxH });
      });

      // 家具・植物（部屋ごとに少しずつ違う）
      const plant = (px: number, pz: number, s: number) => {
        const pg = new THREE.Group(); pg.position.set(px, 0, pz); pg.scale.setScalar(s); g.add(pg);
        box(0.5, 0.62, 0.5, travMat(0.2, 0.2), 0, 0.31, 0, pg);
        for (let i = 0; i < 16; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.8), leafMat); const a = (i / 16) * Math.PI * 2 + R(-0.2, 0.2); l.position.set(Math.cos(a) * 0.12, 0.62 + R(0.35, 1.05), Math.sin(a) * 0.12); l.rotation.set(R(-0.5, 0.5), a, Math.cos(a) * R(0.4, 0.9)); pg.add(l); }
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, depthWrite: false, opacity: 0.7 })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.005; pg.add(sh);
      };
      const pouf = (px: number, pz: number, c: number) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 20), new THREE.MeshStandardMaterial({ color: c, roughness: 1 })); m.scale.set(1, 0.55, 1); m.position.set(px, 0.18, pz); g.add(m);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, depthWrite: false, opacity: 0.6 })); sh.rotation.x = -Math.PI / 2; sh.position.set(px, 0.004, pz); g.add(sh);
      };
      const v = ri % 4;
      plant(v % 2 ? -fw / 2 - 1.1 : fw / 2 + 1.1, WALL_Z + 0.9, 1.1);
      if (v === 0) { box(2.6, 1.0, 0.7, marbleMat, -5.2, 0.5, 0.2, g); box(2.7, 0.04, 0.8, brass, -5.2, 1.02, 0.2, g); }
      if (v === 1) { pouf(-1.2, -0.6, 0xd9d2c6); pouf(-0.3, -0.2, 0xcfc6b8); pouf(0.9, -0.7, 0xe2dccf); }
      if (v === 2) { box(3.0, 0.42, 0.8, travMat(0.6, 0.2), 0, 0.21, -0.6, g); plant(-6, 1.5, 0.9); }
      if (v === 3) { box(0.7, 0.9, 0.7, marbleMat, -2.4, 0.45, -1.4, g); box(0.7, 0.6, 0.7, marbleMat, 2.6, 0.3, -0.8, g); pouf(0.2, 0.4, 0xd6cdbf); }
    });

    // 部屋を移るときに横切る大理石の板（カメラに付けて動かす）
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.06), marbleMat); camera.add(slab); slab.visible = false;
    const slab2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.06), new THREE.MeshStandardMaterial({ color: 0x4f453b, roughness: 0.5, metalness: 0.3 })); camera.add(slab2); slab2.visible = false;
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(0, 0, 1); camera.add(sun); sun.target.position.set(0, 0, -1); camera.add(sun.target); sun.intensity = 0;

    // 光る作品はブルームで少しにじませる（PC）
    let composer: EffectComposer | null = null;
    if (!mobile) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.55, 0.93));
      composer.addPass(new OutputPass());
    }

    // ---- カメラ ----
    const st = { room: 0, focus: null as string | null, moving: false };
    const pos = new THREE.Vector3(0, 1.6, CAM_Z), look = new THREE.Vector3(0, 1.55, WALL_Z);
    const tPos = pos.clone(), tLook = look.clone();
    let yaw = 0, pitch = 0, vYaw = 0, vPitch = 0;
    let trans: { t0: number; from: THREE.Vector3; fromL: THREE.Vector3; dir: number } | null = null;
    const emit = () => cb.current.onState({ room: st.room, focus: st.focus, moving: !!trans, ready: true });
    const baseView = (i: number) => { tPos.set(i * RW, 1.6, CAM_Z); tLook.set(i * RW, 1.5, WALL_Z); };
    const focusView = (id: string) => {
      const s = spots.find((x) => x.id === id); if (!s) return;
      const d = mobile ? 2.9 : 2.5, off = mobile ? 0 : 0.62;
      tPos.set(s.pos.x + off, s.pos.y + (mobile ? -0.55 : -0.05), s.pos.z + d);
      tLook.set(s.pos.x + off, s.pos.y + (mobile ? -0.55 : 0), s.pos.z);
    };
    const goRoom = (i: number) => {
      i = Math.max(0, Math.min(rooms.length - 1, i));
      if (i === st.room || trans) { if (i === st.room && st.focus) { st.focus = null; baseView(i); emit(); } return; }
      trans = { t0: performance.now(), from: pos.clone(), fromL: look.clone(), dir: i > st.room ? 1 : -1 };
      st.room = i; st.focus = null; baseView(i); yaw = pitch = 0; emit();
    };
    const focus = (id: string | null) => {
      if (trans) return;
      if (!id) { st.focus = null; baseView(st.room); emit(); return; }
      const s = spots.find((x) => x.id === id); if (!s) return;
      if (s.room !== st.room) { goRoom(s.room); setTimeout(() => { st.focus = id; focusView(id); emit(); }, 1500); return; }
      st.focus = id; focusView(id); yaw = pitch = 0; emit();
    };
    apiRef.current = { goRoom, focus };
    baseView(0); pos.copy(tPos); look.copy(tLook);

    // ---- 操作 ----
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down: { x: number; y: number; t: number } | null = null, last = { x: 0, y: 0 }, moved = 0, hover: string | null = null;
    const pick = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera); const h = ray.intersectObjects(hits, false)[0]; return (h?.object.userData.id as string) || null;
    };
    const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; last = { x: e.clientX, y: e.clientY }; moved = 0; };
    const pmv = (e: PointerEvent) => {
      if (down) {
        const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; moved += Math.abs(dx) + Math.abs(dy);
        vYaw = dx * 0.0022; vPitch = dy * 0.0016; yaw = Math.max(-0.45, Math.min(0.45, yaw + vYaw)); pitch = Math.max(-0.16, Math.min(0.16, pitch + vPitch));
      } else if (e.pointerType === 'mouse') {
        const id = pick(e.clientX, e.clientY); if (id !== hover) { hover = id; renderer.domElement.style.cursor = id ? 'pointer' : 'grab'; }
      }
    };
    const pu = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - down.x, quick = performance.now() - down.t < 380;
      if (moved < 8) { const id = pick(e.clientX, e.clientY); if (id) cb.current.onPick(id); }
      else if (e.pointerType !== 'mouse' && quick && Math.abs(dx) > 60 && !st.focus) { goRoom(st.room + (dx < 0 ? 1 : -1)); yaw = 0; }
      down = null;
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') goRoom(st.room + 1); if (e.key === 'ArrowLeft') goRoom(st.room - 1); if (e.key === 'Escape') focus(null); };
    renderer.domElement.style.cursor = 'grab'; renderer.domElement.style.touchAction = 'none';
    renderer.domElement.addEventListener('pointerdown', pd); addEventListener('pointermove', pmv); addEventListener('pointerup', pu); addEventListener('keydown', key);

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); composer?.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      // 板が画面いっぱいを覆う大きさ
      const vh = 2 * 0.9 * Math.tan((camera.fov * Math.PI) / 360), vw = vh * camera.aspect;
      slab.scale.set(vw * 1.05, vh * 1.3, 1); slab2.scale.set(vw * 0.5, vh * 1.3, 1); slab.userData.vw = vw;
    };
    size(); addEventListener('resize', size);

    // ---- 毎フレーム ----
    let raf = 0, prev = performance.now(), first = true;
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const tmp = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      if (trans) {
        const u = Math.min(1, (now - trans.t0) / (reduce ? 500 : 1500)), e = ease(u);
        pos.lerpVectors(trans.from, tPos, e); look.lerpVectors(trans.fromL, tLook, e);
        // 板：右から入って画面を覆い、左へ抜ける（戻るときは逆）
        const vw = slab.userData.vw as number, k = Math.min(1, Math.max(0, (u - 0.04) / 0.92));
        const sx = (1 - 2 * ease(k)) * vw * 1.08 * trans.dir;
        slab.visible = slab2.visible = !reduce; slab.position.set(sx, 0, -0.9); slab2.position.set(sx + trans.dir * vw * 0.82, 0, -0.88);
        sun.intensity = 0.9;
        if (u >= 1) { trans = null; slab.visible = slab2.visible = false; sun.intensity = 0; emit(); }
      } else {
        const k = 1 - Math.pow(0.0025, dt);
        pos.lerp(tPos, k); look.lerp(tLook, k);
        if (!down) { yaw *= 1 - Math.min(1, dt * (st.focus ? 3 : 0.6)); pitch *= 1 - Math.min(1, dt * 1.2); }
      }
      // ゆっくり漂う
      const drift = reduce ? 0 : 1;
      camera.position.set(pos.x + Math.sin(now / 5200) * 0.06 * drift, pos.y + Math.sin(now / 3900) * 0.025 * drift, pos.z);
      tmp.copy(look).sub(pos).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw); tmp.y -= pitch * 4; tmp.add(camera.position);
      camera.lookAt(tmp);
      // ポイントの呼吸
      rings.forEach((r, i) => { const on = r.userData.id === hover || r.userData.id === st.focus; const s = r.userData.base * (on ? 1.25 : 1 + Math.sin(now / 700 + i) * 0.06); r.scale.setScalar(r.scale.x + (s - r.scale.x) * 0.2); (r.material as THREE.SpriteMaterial).opacity = st.focus && !on ? 0.35 : 0.95; });
      if (composer) composer.render(); else renderer.render(scene, camera);
      if (first) { first = false; emit(); }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('pointermove', pmv); removeEventListener('pointerup', pu); removeEventListener('keydown', key);
      renderer.domElement.removeEventListener('pointerdown', pd);
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach((x) => x.dispose()); });
      pm.dispose(); composer?.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); apiRef.current = null;
    };
  }, [rooms, apiRef]);

  return <div ref={host} className="gr-3d" />;
}
