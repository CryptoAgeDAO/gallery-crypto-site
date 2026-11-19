'use client';
// 白い倉庫ギャラリーのような展示室（3D）：白い壁、むき出しの白い鉄骨と線状の照明、磨いたコンクリートの床、
// 大きな壁画・吊るされた木の彫刻・白い台。壁に光る丸いポイント。
// ポイント（または作品）を押すと作品に近づき、横から詳細が開く。部屋を移るときは大理石の板が横切る。
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type GPiece = { id: string; title: string; kind: 'garment' | 'cap' | 'art'; tex: string };
export type GRoom = { key: string; pieces: GPiece[] };
export type GalleryApi = { goRoom: (i: number) => void; focus: (id: string | null) => void };
export type GState = { room: number; focus: string | null; moving: boolean; ready: boolean; lost?: boolean };

// ひとつの大きな倉庫ギャラリー（横 24m × 奥行き 18m）。作品は壁ごとに「エリア」としてまとまる
const HX = 12, HZ = 9, CH = 5.6, EYE = 1.62;

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
const plaster = () => canvas(512, 512, (g, w, h) => {
  g.fillStyle = '#f1f0ec'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${R(0.01, 0.035)})`; g.fillRect(R(0, w), R(0, h), R(1, 3), R(1, 3)); }
});
const concrete = () => canvas(1024, 1024, (g, w, h) => {
  g.fillStyle = '#c9c8c4'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 160; k++) { const x = R(0, w), y = R(0, h), r = R(30, 200), cg = g.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, `rgba(${rnd() < 0.5 ? '255,255,255' : '120,118,112'},${R(0.04, 0.12)})`); cg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cg; g.fillRect(0, 0, w, h); }
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '60,60,60' : '255,255,255'},${R(0.03, 0.09)})`; g.fillRect(R(0, w), R(0, h), 1.4, 1.4); }
  g.fillStyle = 'rgba(90,90,88,.55)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
});
let BW = 2048; // スマホでは半分
const mural = () => canvas(BW, Math.round(BW * 0.56), (g, w, h) => {
  // 自前の抽象画：うねる色の帯・円・黒い線（どこかの作品の写しではない）
  g.fillStyle = '#f3efe6'; g.fillRect(0, 0, w, h);
  const cols = ['#c23b2a', '#2f4a8a', '#e1a43a', '#1f1f1f', '#6c8f5a', '#d77fa1', '#3c9fb0'];
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = cols[i % cols.length]; g.globalAlpha = R(0.75, 1); g.lineWidth = R(w * 0.006, w * 0.02); g.lineCap = 'round';
    let x = w * (0.18 + (i / 46) * 0.62) + R(-20, 20), y = h * R(0.12, 0.3); g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += R(-w * 0.03, w * 0.03); y += h * R(0.08, 0.13); g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#c23b2a'; g.beginPath(); g.arc(w * 0.66, h * 0.24, h * 0.12, 0, 7); g.fill();
  g.strokeStyle = '#1f1f1f'; g.lineWidth = w * 0.004; g.beginPath(); g.arc(w * 0.66, h * 0.24, h * 0.12, 0, 7); g.stroke();
  g.fillStyle = '#1f1f1f'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(R(w * 0.1, w * 0.9), R(h * 0.1, h * 0.9), R(6, 22), R(6, 22), R(0, 3), 0, 7); g.fill(); }
  // 外形をちぎった紙のようにぼかす
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.52); m.addColorStop(0, '#000'); m.addColorStop(0.85, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = m; g.fillRect(0, 0, w, h);
});
const woodSlats = () => canvas(1024, 256, (g, w, h) => {
  for (let i = 0; i < 32; i++) { const x = (i / 32) * w; g.fillStyle = `hsl(${R(28, 36)},${R(38, 50)}%,${R(58, 70)}%)`; g.fillRect(x, 0, w / 32, h); g.fillStyle = 'rgba(80,50,20,.35)'; g.fillRect(x, 0, 2, h); }
  for (let i = 0; i < 300; i++) { g.strokeStyle = `rgba(120,80,40,${R(0.05, 0.15)})`; g.beginPath(); const y = R(0, h); g.moveTo(R(0, w), y); g.lineTo(R(0, w), y + R(-4, 4)); g.stroke(); }
});
// 作品を掛ける壁：白に近い淡いグレー。上の線状照明でうっすら明るく、下ほど落ち着く
const bronzeWall = (xs: number[]) => canvas(BW, Math.round(BW * 0.4), (g, w, h) => {
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#fbfbf9'); bg.addColorStop(1, '#e6e5e1'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${R(0.008, 0.02)})`; g.fillRect(R(0, w), R(0, h), R(1, 3), R(1, 3)); }
  void xs;
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
  g.fillStyle = 'rgba(20,20,22,.10)'; g.beginPath(); g.arc(128, 128, 86, 0, 7); g.fill();
  g.strokeStyle = 'rgba(20,20,22,.9)'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 88, 0, 7); g.stroke();
  g.fillStyle = '#c9a46a'; g.beginPath(); g.arc(128, 128, 14, 0, 7); g.fill();
});
const shadowTex = () => canvas(128, 128, (g) => { const cg = g.createRadialGradient(64, 64, 0, 64, 64, 64); cg.addColorStop(0, 'rgba(0,0,0,.55)'); cg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cg; g.fillRect(0, 0, 128, 128); });
const leafTex = () => canvas(128, 256, (g) => {
  g.fillStyle = '#3d5a37'; g.beginPath(); g.moveTo(64, 250); g.bezierCurveTo(0, 170, 10, 60, 64, 4); g.bezierCurveTo(118, 60, 128, 170, 64, 250); g.fill();
  g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(64, 250); g.bezierCurveTo(30, 170, 36, 60, 64, 4); g.lineTo(64, 250); g.fill();
  g.strokeStyle = 'rgba(200,220,160,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 250); g.lineTo(64, 10); g.stroke();
});

export default function Gallery3D({ rooms, apiRef, onState, onPick }: { rooms: GRoom[]; apiRef: React.MutableRefObject<GalleryApi | null>; onState: (s: GState) => void; onPick: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  const cb = useRef({ onState, onPick }); cb.current = { onState, onPick };
  const [coarse] = useState(() => typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    const el = host.current!; seed = 7; let alive = true;
    const mobile = matchMedia('(max-width: 760px)').matches;
    BW = mobile ? 1024 : 2048;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.4 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.88;
    el.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cb.current.onState({ room: 0, focus: null, moving: false, ready: true, lost: true }); });
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe9e8e4);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa9a7a1, 0.85));
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.75;
    const camera = new THREE.PerspectiveCamera(mobile ? 70 : 58, 1, 0.05, 120); camera.rotation.order = 'YXZ'; scene.add(camera);

    // ---- 素材 ----
    const plasterC = plaster(), floorC = concrete();
    const wallMat = (rx: number, ry: number) => new THREE.MeshStandardMaterial({ map: tex(plasterC, [rx, ry]), roughness: 0.92 });
    const floorMat = new THREE.MeshStandardMaterial({ map: tex(floorC, [HX / 3, HZ / 3]), roughness: 0.16, envMapIntensity: 1.3, transparent: !mobile, opacity: mobile ? 1 : 0.86 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.95 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.55, metalness: 0.1 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dbde, metalness: 1, roughness: 0.18 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.6 });
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const skyMat = new THREE.MeshBasicMaterial({ color: 0xeaf2ff });
    const woodMat = new THREE.MeshStandardMaterial({ map: tex(woodSlats(), [1, 1]), roughness: 0.6, side: THREE.DoubleSide });
    const muralMat = new THREE.MeshStandardMaterial({ map: tex(mural()), roughness: 0.95, transparent: true });
    const panelMat = new THREE.MeshStandardMaterial({ map: tex(bronzeWall([])), roughness: 0.8 });
    const ringT = tex(ringTex()), shadowT = tex(shadowTex()), leafT = tex(leafTex());
    const leafMat = new THREE.MeshStandardMaterial({ map: leafT, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 });
    const TEXMAX = mobile ? 512 : 1024;
    const loadTex = (url: string, done: (t: THREE.Texture, aspect: number) => void) => {
      const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
      im.onload = () => {
        if (!alive) return;
        const w = im.naturalWidth || 720, h = im.naturalHeight || 660, k = Math.min(1, TEXMAX / Math.max(w, h));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        try { c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height); } catch { return; }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = mobile ? 2 : 8; done(t, w / h);
      };
      im.src = url;
    };
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
    const floorShadow = (x: number, z: number, w: number, d: number, o = 0.5) => { const sh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, depthWrite: false, opacity: o })); sh.rotation.x = -Math.PI / 2; sh.position.set(x, 0.004, z); scene.add(sh); };
    const obstacles: { x: number; z: number; r: number }[] = [];

    // ---- 建物：床・天井・壁・鉄骨・天窓 ----
    if (!mobile) { const rf = new Reflector(new THREE.PlaneGeometry(HX * 2, HZ * 2), { textureWidth: 1024, textureHeight: 1024, color: 0x9a9995 }); rf.rotation.x = -Math.PI / 2; rf.position.y = -0.002; scene.add(rf); }
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), floorMat); fl.rotation.x = -Math.PI / 2; fl.userData.floor = true; scene.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2), ceilMat); ce.rotation.x = Math.PI / 2; ce.position.y = CH; scene.add(ce);
    box(HX * 2, CH, 0.2, wallMat(8, 2), 0, CH / 2, -HZ - 0.1, scene);
    box(HX * 2, CH, 0.2, wallMat(8, 2), 0, CH / 2, HZ + 0.1, scene);
    box(0.2, CH, HZ * 2, wallMat(6, 2), -HX - 0.1, CH / 2, 0, scene);
    box(0.2, CH, HZ * 2, wallMat(6, 2), HX + 0.1, CH / 2, 0, scene);
    box(HX * 2, 0.14, 0.04, black, 0, 0.07, -HZ + 0.02, scene); box(HX * 2, 0.14, 0.04, black, 0, 0.07, HZ - 0.02, scene);
    box(0.04, 0.14, HZ * 2, black, -HX + 0.02, 0.07, 0, scene); box(0.04, 0.14, HZ * 2, black, HX - 0.02, 0.07, 0, scene);
    for (let i = -4; i <= 4; i++) {
      const x = i * 2.6;
      box(0.12, 0.42, HZ * 2, steel, x, CH - 0.21, 0, scene);
      if (!mobile) for (let k = 0; k < 18; k++) { const d = box(0.05, 0.05, 0.62, steel, x, CH - 0.48, -HZ + k + 0.5, scene); d.rotation.x = k % 2 ? 0.7 : -0.7; }
      box(0.12, 0.05, HZ * 2, steel, x, CH - 0.7, 0, scene);
      if (i < 4) box(0.05, 0.03, HZ * 2 - 1.5, stripMat, x + 1.3, CH - 0.26, 0, scene);
    }
    for (const z of [-5.5, -1.5, 2.5, 6.5]) { const sk = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 - 2, 1.1), skyMat); sk.rotation.x = Math.PI / 2; sk.position.set(0, CH - 0.01, z); scene.add(sk); }
    for (const [sx, sz] of [[-HX + 0.7, -HZ + 0.7], [HX - 0.7, -HZ + 0.7], [-HX + 0.7, HZ - 0.7], [HX - 0.7, HZ - 0.7]]) { const sp2 = box(0.42, 0.62, 0.38, black, sx, CH - 1.3, sz, scene); sp2.lookAt(0, CH - 1.3, 0); }
    for (const [x, z] of [[-6, -2], [6, 3], [0, -6]]) { const pl = new THREE.PointLight(0xffffff, 16, 18, 1.4); pl.position.set(x, CH - 1, z); scene.add(pl); }

    // ---- 作品の壁（エリア）：奥・左・右・手前の壁に順に置く ----
    const WALLS = [
      { pos: new THREE.Vector3(0, 0, -HZ), ry: 0 },
      { pos: new THREE.Vector3(-HX, 0, 0), ry: Math.PI / 2 },
      { pos: new THREE.Vector3(HX, 0, 0), ry: -Math.PI / 2 },
      { pos: new THREE.Vector3(0, 0, HZ), ry: Math.PI },
    ];
    const hits: THREE.Object3D[] = [];
    const rings: THREE.Sprite[] = [];
    const spots: { id: string; room: number; pos: THREE.Vector3; normal: THREE.Vector3; h: number }[] = [];
    const zones: { center: THREE.Vector3; normal: THREE.Vector3 }[] = [];
    rooms.forEach((room, ri) => {
      const W = WALLS[ri % WALLS.length];
      const g = new THREE.Group(); g.position.copy(W.pos); g.rotation.y = W.ry; scene.add(g);
      const normal = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), W.ry);
      zones.push({ center: W.pos.clone().setY(1.6), normal });
      const n = room.pieces.length;
      const fw = Math.min(ri === 0 ? 14 : 12, Math.max(5, n * 1.9 + 1.4));
      const xs = room.pieces.map((_, k) => (n === 1 ? 0 : -fw / 2 + 0.95 + (k * (fw - 1.9)) / (n - 1)));
      box(fw, 3.5, 0.08, panelMat, 0, 1.85, 0.06, g);
      box(fw, 0.02, 0.04, stripMat, 0, 3.62, 0.12, g);
      if (room.pieces.some((q) => q.kind === 'garment')) { box(fw - 0.6, 0.035, 0.035, chrome, 0, 2.75, 0.34, g); for (const bx of [-(fw - 0.6) / 2, (fw - 0.6) / 2]) box(0.03, 0.03, 0.3, chrome, bx, 2.75, 0.2, g); }
      room.pieces.forEach((p, k) => {
        const x = xs[k];
        const maxH = p.kind === 'garment' ? 1.5 : p.kind === 'cap' ? 0.62 : 1.1;
        const cy = p.kind === 'cap' ? 1.6 : 1.95;
        const maxW = Math.min(1.6, (fw - 1.2) / Math.max(1, n) + 0.2);
        const mat = new THREE.MeshStandardMaterial({ color: p.kind === 'art' ? 0xdcd6cc : 0xf2eee8, roughness: 0.9, transparent: true, alphaTest: 0.04 });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); plane.userData.id = p.id; hits.push(plane);
        const z = p.kind === 'art' ? 0.17 : 0.28;
        plane.position.set(x, cy, z); g.add(plane);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, depthWrite: false, opacity: 0.45 }));
        sh.position.set(x + 0.06, cy - 0.08, 0.11); g.add(sh);
        let frame: THREE.Mesh | null = null;
        if (p.kind === 'art') frame = box(1, 1, 0.05, black, x, cy, 0.14, g);
        if (p.kind === 'cap') box(0.9, 0.04, 0.34, steel, x, cy - maxH * 0.53, 0.29, g);
        const fit = (a: number) => {
          let w = maxH * a, h = maxH; if (w > maxW) { w = maxW; h = w / a; }
          plane.scale.set(w, h, 1); sh.scale.set(w * 1.25, h * 1.15, 1);
          if (frame) frame.scale.set(w + 0.12, h + 0.12, 1);
          if (p.kind === 'cap') plane.position.y = cy - maxH * 0.5 + h / 2;
          if (p.kind === 'garment') plane.position.y = 2.75 - 0.02 - h / 2;
          sh.position.y = plane.position.y - 0.08;
        };
        fit(1);
        if (p.tex) loadTex(p.tex, (t, a) => { mat.map = t; mat.needsUpdate = true; fit(a); });
        const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringT, transparent: true, depthWrite: false, opacity: 0.95 }));
        ring.position.set(x, 0.7, 0.3); ring.scale.setScalar(0.34); ring.userData.id = p.id; ring.userData.base = 0.34; g.add(ring); hits.push(ring); rings.push(ring);
        const wp = new THREE.Vector3(x, cy, z); g.updateMatrixWorld(true); g.localToWorld(wp);
        spots.push({ id: p.id, room: ri, pos: wp, normal, h: maxH });
      });
    });

    // ---- 家具・彫刻・壁画 ----
    const bench = (bx: number, bz: number, w: number, ry = 0) => { const b = box(w, 0.42, 0.62, wallMat(0.4, 0.2), bx, 0.21, bz, scene); b.rotation.y = ry; floorShadow(bx, bz, w * 1.3, 1.2, 0.45); obstacles.push({ x: bx, z: bz, r: w / 2 + 0.35 }); };
    const plant = (px: number, pz: number, sc: number) => {
      const pg = new THREE.Group(); pg.position.set(px, 0, pz); pg.scale.setScalar(sc); scene.add(pg);
      box(0.5, 0.62, 0.5, wallMat(0.2, 0.2), 0, 0.31, 0, pg);
      for (let i = 0; i < 16; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.8), leafMat); const a = (i / 16) * Math.PI * 2 + R(-0.2, 0.2); l.position.set(Math.cos(a) * 0.12, 0.62 + R(0.35, 1.05), Math.sin(a) * 0.12); l.rotation.set(R(-0.5, 0.5), a, Math.cos(a) * R(0.4, 0.9)); pg.add(l); }
      floorShadow(px, pz, 1.1 * sc, 1.1 * sc, 0.7); obstacles.push({ x: px, z: pz, r: 0.6 * sc });
    };
    // 手前の壁いっぱいの壁画（振り返ると見える）
    const mw = 9, mur = new THREE.Mesh(new THREE.PlaneGeometry(mw, mw * 0.56), muralMat); mur.position.set(-3.5, 2.7, HZ - 0.03); mur.rotation.y = Math.PI; scene.add(mur);
    // 中央に吊るした木の舟形
    const prof: THREE.Vector2[] = []; for (let k = 0; k <= 16; k++) { const a2 = (k / 16) * Math.PI / 2; prof.push(new THREE.Vector2(Math.sin(a2), -Math.cos(a2))); }
    const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), woodMat); hull.scale.set(2.8, 0.6, 1.4); hull.position.set(-5.5, CH - 1.6, 3.2); scene.add(hull);
    for (const cx2 of [-1, 1]) box(0.01, 1.3, 0.01, black, hull.position.x + cx2 * 1.7, CH - 0.65, 3.2, scene);
    // 記録のブロックを積んだ彫刻
    const sx2 = 5.2, sz2 = 1.8;
    ([[0, 0.45, 0, 0.9, steel], [0.12, 1.25, 0.08, 0.7, chrome], [-0.05, 1.86, -0.04, 0.52, steel], [0.06, 2.3, 0.03, 0.36, black]] as [number, number, number, number, THREE.Material][]).forEach(([dx, y, dz, s2, mm]) => { const c2 = box(s2, s2, s2, mm, sx2 + dx, y, sz2 + dz, scene); c2.rotation.y = y * 0.6; });
    floorShadow(sx2, sz2, 2, 2, 0.6); obstacles.push({ x: sx2, z: sz2, r: 0.9 });
    bench(-2.5, -2.5, 2.4); bench(2.5, -2.5, 2.4); bench(-5.5, 3.2, 2.2); bench(1.0, 5.2, 2.0);
    plant(-HX + 1, -HZ + 1, 1.1); plant(HX - 1, -HZ + 1, 1.1); plant(HX - 1, HZ - 1, 1.0); plant(-HX + 1, HZ - 1.2, 0.9);

    // 光る作品はブルームで少しにじませる（PC）
    let composer: EffectComposer | null = null;
    if (!mobile) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.4, 0.995));
      composer.addPass(new OutputPass());
    }

    // ---- 歩く：位置と向き。目標があればそこへ歩いて向く ----
    const pos = new THREE.Vector3(0, EYE, 5.5);
    let yaw = 0, pitch = -0.04; // yaw=0 で奥（-z）を向く
    let goal: { p: THREE.Vector3; yaw: number; pitch: number } | null = null;
    const st = { room: 0, focus: null as string | null, moving: false };
    const emit = () => cb.current.onState({ room: st.room, focus: st.focus, moving: !!goal, ready: true });
    const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
    const viewZone = (i: number) => { const z = zones[i]; if (!z) return; const p = z.center.clone().addScaledVector(z.normal, mobile ? 12.5 : 7.5); p.y = EYE; goal = { p, yaw: yawTo(p, z.center), pitch: -0.02 }; };
    const goRoom = (i: number) => { i = Math.max(0, Math.min(zones.length - 1, i)); st.focus = null; st.room = i; viewZone(i); emit(); };
    const focus = (id: string | null) => {
      if (!id) { st.focus = null; emit(); const z = zones[st.room]; if (z) { const p = pos.clone(); const back = z.center.clone().addScaledVector(z.normal, 4.5); goal = { p: new THREE.Vector3(p.x, EYE, p.z).lerp(back.setY(EYE), 0.6), yaw, pitch: -0.03 }; } return; }
      const s = spots.find((x) => x.id === id); if (!s) return;
      const d = mobile ? 3.0 : 2.6;
      const p = s.pos.clone().addScaledVector(s.normal, d); p.y = EYE;
      // PC は右に詳細が出るので、作品が左寄りに見えるよう少し右に立つ
      if (!mobile) p.add(new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), s.normal).multiplyScalar(-0.7));
      const look = s.pos.clone(); if (mobile) look.y -= 0.6;
      goal = { p, yaw: yawTo(p, look), pitch: Math.atan2(look.y - EYE, Math.hypot(look.x - p.x, look.z - p.z)) };
      st.focus = id; st.room = s.room; emit();
    };
    apiRef.current = { goRoom, focus };
    camera.position.copy(pos);

    // ---- 操作 ----
    const keys = new Set<string>();
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down: { x: number; y: number; t: number } | null = null, last = { x: 0, y: 0 }, moved = 0, hover: string | null = null;
    const cast = (cx: number, cy: number): { id?: string; floor?: THREE.Vector3 } | null => {
      const r = renderer.domElement.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const h = ray.intersectObjects(hits, false)[0]; if (h) return { id: h.object.userData.id as string };
      const f = ray.intersectObject(fl, false)[0]; if (f) return { floor: f.point };
      return null;
    };
    const pd = (e: PointerEvent) => { if (e.target !== renderer.domElement) return; down = { x: e.clientX, y: e.clientY, t: performance.now() }; last = { x: e.clientX, y: e.clientY }; moved = 0; };
    const pmv = (e: PointerEvent) => {
      if (down) {
        const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 6) { yaw += dx * 0.0042; pitch = Math.max(-0.7, Math.min(0.6, pitch + dy * 0.003)); if (goal) goal = null; }
      } else if (e.pointerType === 'mouse' && e.target === renderer.domElement) {
        const h = cast(e.clientX, e.clientY); const id = h?.id ?? null;
        if (id !== hover) hover = id;
        renderer.domElement.style.cursor = id ? 'pointer' : h?.floor ? 'crosshair' : 'grab';
      }
    };
    const pu = (e: PointerEvent) => {
      if (!down) return;
      if (moved < 8) {
        const h = cast(e.clientX, e.clientY);
        if (h?.id) cb.current.onPick(h.id);
        else if (h?.floor) {
          // 床を押すと、そこまで歩く（向きはそのまま、少し進行方向へ）
          const p = h.floor.clone(); p.x = Math.max(-HX + 0.8, Math.min(HX - 0.8, p.x)); p.z = Math.max(-HZ + 0.8, Math.min(HZ - 0.8, p.z)); p.y = EYE;
          goal = { p, yaw: yawTo(pos, p), pitch: -0.04 }; if (st.focus) { st.focus = null; } emit();
        }
      }
      down = null;
    };
    const kd = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === 'INPUT') return; keys.add(e.key.toLowerCase()); if (e.key === 'Escape') focus(null); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault(); };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    renderer.domElement.style.cursor = 'grab'; renderer.domElement.style.touchAction = 'none';
    addEventListener('pointerdown', pd); addEventListener('pointermove', pmv); addEventListener('pointerup', pu); addEventListener('keydown', kd); addEventListener('keyup', ku);
    // スマホの左下のスティック
    const joy = { x: 0, y: 0, id: -1, cx: 0, cy: 0 };
    const sEl = stick.current;
    const js = (e: PointerEvent) => { if (!sEl) return; e.stopPropagation(); joy.id = e.pointerId; const r = sEl.getBoundingClientRect(); joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2; sEl.setPointerCapture(e.pointerId); jm(e); };
    const jm = (e: PointerEvent) => { if (e.pointerId !== joy.id || !sEl) return; const dx = e.clientX - joy.cx, dy = e.clientY - joy.cy, L = Math.min(1, Math.hypot(dx, dy) / 46), a = Math.atan2(dy, dx); joy.x = Math.cos(a) * L; joy.y = Math.sin(a) * L; (sEl.firstElementChild as HTMLElement).style.transform = `translate(${joy.x * 34}px, ${joy.y * 34}px)`; if (L > 0.1) { goal = null; if (st.focus) { st.focus = null; emit(); } } };
    const je = (e: PointerEvent) => { if (e.pointerId !== joy.id || !sEl) return; joy.id = -1; joy.x = joy.y = 0; (sEl.firstElementChild as HTMLElement).style.transform = ''; };
    sEl?.addEventListener('pointerdown', js); sEl?.addEventListener('pointermove', jm); sEl?.addEventListener('pointerup', je); sEl?.addEventListener('pointercancel', je);

    const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); composer?.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size(); addEventListener('resize', size);

    // ---- 毎フレーム ----
    let raf = 0, prev = performance.now(), first = true, zoneT = 0;
    const fwd = new THREE.Vector3(), right = new THREE.Vector3();
    const angDiff = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      // 歩く入力（キーボード・スティック）
      let mx = 0, mz = 0;
      if (keys.has('w') || keys.has('arrowup')) mz += 1;
      if (keys.has('s') || keys.has('arrowdown')) mz -= 1;
      if (keys.has('a')) mx -= 1;
      if (keys.has('d')) mx += 1;
      if (keys.has('arrowleft')) yaw += dt * 1.6;
      if (keys.has('arrowright')) yaw -= dt * 1.6;
      mx += joy.x; mz += -joy.y;
      if (mx || mz) { goal = null; if (st.focus) { st.focus = null; emit(); } }
      fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const sp = (keys.has('shift') ? 5.2 : 3.0) * dt;
      pos.addScaledVector(fwd, mz * sp).addScaledVector(right, mx * sp);
      if (goal) {
        const k = 1 - Math.pow(0.02, dt);
        pos.lerp(goal.p, k); yaw += angDiff(yaw, goal.yaw) * k; pitch += (goal.pitch - pitch) * k;
        if (pos.distanceTo(goal.p) < 0.02 && Math.abs(angDiff(yaw, goal.yaw)) < 0.003) { goal = null; emit(); }
      }
      // 壁と家具にぶつからない
      pos.x = Math.max(-HX + 0.7, Math.min(HX - 0.7, pos.x)); pos.z = Math.max(-HZ + 0.7, Math.min(HZ - 0.7, pos.z));
      for (const o of obstacles) { const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz); if (d < o.r && d > 1e-4) { pos.x = o.x + (dx / d) * o.r; pos.z = o.z + (dz / d) * o.r; } }
      // 歩くと視線がわずかに上下する
      const walking = mx || mz || goal ? 1 : 0;
      const bob = reduce ? 0 : Math.sin(now / 160) * 0.012 * walking;
      camera.position.set(pos.x, EYE + bob, pos.z);
      camera.rotation.set(pitch, yaw, 0);
      // いま見ている作品の壁（エリア）を判定して知らせる
      if (!st.focus && (zoneT += dt) > 0.25) {
        zoneT = 0; let best = st.room, bs = -1e9;
        zones.forEach((z, i) => { const to = z.center.clone().sub(pos); const d = to.length(); to.normalize(); const sc = to.dot(fwd) * 2 - d * 0.08; if (sc > bs) { bs = sc; best = i; } });
        if (best !== st.room) { st.room = best; emit(); }
      }
      rings.forEach((r, i) => { const on = r.userData.id === hover || r.userData.id === st.focus; const s = r.userData.base * (on ? 1.25 : 1 + Math.sin(now / 700 + i) * 0.06); r.scale.setScalar(r.scale.x + (s - r.scale.x) * 0.2); (r.material as THREE.SpriteMaterial).opacity = st.focus && !on ? 0.35 : 0.95; });
      if (composer) composer.render(); else renderer.render(scene, camera);
      if (first) { first = false; emit(); }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('pointerdown', pd); removeEventListener('pointermove', pmv); removeEventListener('pointerup', pu); removeEventListener('keydown', kd); removeEventListener('keyup', ku);
      sEl?.removeEventListener('pointerdown', js); sEl?.removeEventListener('pointermove', jm); sEl?.removeEventListener('pointerup', je); sEl?.removeEventListener('pointercancel', je);
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach((x) => x.dispose()); });
      pm.dispose(); composer?.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); apiRef.current = null;
    };
  }, [rooms, apiRef]);

  return (
    <div className="gr-3d" ref={host}>
      {coarse && <div className="gr-stick" ref={stick} aria-label="move"><i /></div>}
    </div>
  );
}
