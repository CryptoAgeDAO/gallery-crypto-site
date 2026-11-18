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
  const cb = useRef({ onState, onPick }); cb.current = { onState, onPick };
  // 縦長の画面（iPhone を縦に持ったとき）は、作品を2列に組んで部屋全体が入るようにする
  const [tall, setTall] = useState(() => typeof window !== 'undefined' && innerHeight > innerWidth * 1.15);
  useEffect(() => { const f = () => setTall(innerHeight > innerWidth * 1.15); f(); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);

  useEffect(() => {
    const el = host.current!; seed = 7; let alive = true;
    BW = matchMedia('(max-width: 760px)').matches ? 1024 : 2048;
    const mobile = matchMedia('(max-width: 760px)').matches;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.4 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.88;
    el.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cb.current.onState({ room: 0, focus: null, moving: false, ready: true, lost: true } as GState); });
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe9e8e4); scene.add(new THREE.HemisphereLight(0xffffff, 0xa9a7a1, 0.85));
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.75;
    const camera = new THREE.PerspectiveCamera(tall ? 72 : mobile ? 62 : 50, 1, 0.05, 80); scene.add(camera);

    // 共通の素材
    const travC = plaster(), floorC = concrete();
    const travMat = (rx: number, ry: number) => new THREE.MeshStandardMaterial({ map: tex(travC, [rx * 2, ry * 2]), roughness: 0.92 });
    const floorMat = new THREE.MeshStandardMaterial({ map: tex(floorC, [RW / 6, 2]), roughness: 0.16, metalness: 0.0, envMapIntensity: 1.3, transparent: !mobile, opacity: mobile ? 1 : 0.86 });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.95 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.55, metalness: 0.1 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dbde, metalness: 1, roughness: 0.18 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.6 });
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const skyMat = new THREE.MeshBasicMaterial({ color: 0xeaf2ff });
    const woodMat = new THREE.MeshStandardMaterial({ map: tex(woodSlats(), [1, 1]), roughness: 0.6, side: THREE.DoubleSide });
    const muralMat = new THREE.MeshStandardMaterial({ map: tex(mural()), roughness: 0.95, transparent: true });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08a50, metalness: 0.9, roughness: 0.32 });
    const darkBronze = new THREE.MeshStandardMaterial({ color: 0x2c2620, metalness: 0.6, roughness: 0.45 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
    const coveMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const marbleTex = tex(marble());
    const marbleMat = new THREE.MeshStandardMaterial({ map: marbleTex, roughness: 0.42, metalness: 0.0 });
    const ringT = tex(ringTex()), shadowT = tex(shadowTex()), leafT = tex(leafTex());
    const leafMat = new THREE.MeshStandardMaterial({ map: leafT, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 });
    // 作品の絵・写真は、いったん小さめのキャンバスに描いてから使う（iPhone のメモリを使い切らないように）
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

    const hits: THREE.Object3D[] = []; // 押せるもの
    const rings: THREE.Sprite[] = [];
    const spots: { id: string; room: number; pos: THREE.Vector3; h: number }[] = [];

    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };

    rooms.forEach((room, ri) => {
      const g = new THREE.Group(); g.position.x = ri * RW; scene.add(g);
      const n = room.pieces.length;
      const cols = tall ? Math.min(2, n) : n, rows = Math.ceil(n / Math.max(1, cols));
      const fw = tall ? cols * 1.75 + 0.9 : Math.min(11, Math.max(5, n * 1.75 + 1.4)); // ブロンズの壁面の幅
      const xs = room.pieces.map((_, k) => (tall ? ((k % cols) - (cols - 1) / 2) * 1.75 : n === 1 ? 0 : -fw / 2 + 0.95 + (k * (fw - 1.9)) / (n - 1)));
      const rowH = 3.0 / rows; // 縦長のときの1段の高さ
      const rowY = (k: number) => 3.3 - rowH * (Math.floor(k / cols) + 0.5);
      // 床・天井・壁
      const CH = 5.2; // 天井の高さ
      if (!mobile) { const rf = new Reflector(new THREE.PlaneGeometry(RW, 12), { textureWidth: 1024, textureHeight: 1024, color: 0x9a9995 }); rf.rotation.x = -Math.PI / 2; rf.position.set(0, -0.002, -0.5); g.add(rf); }
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(RW, 12), floorMat); fl.rotation.x = -Math.PI / 2; fl.position.z = -0.5; g.add(fl);
      const ce = new THREE.Mesh(new THREE.PlaneGeometry(RW, 12), ceilMat); ce.rotation.x = Math.PI / 2; ce.position.set(0, CH, -0.5); g.add(ce);
      box(RW, CH, 0.2, travMat(3, 1), 0, CH / 2, WALL_Z - 0.1, g);
      box(RW, 0.14, 0.04, black, 0, 0.07, WALL_Z + 0.02, g); // 幅木
      // むき出しの白い鉄骨（奥から手前へ）と、その間の線状の照明・天窓
      for (let i = -3; i <= 3; i++) {
        const x = i * 2.3;
        box(0.12, 0.42, 12, steel, x, CH - 0.21, -0.5, g);
        for (let k = 0; k < 12; k++) { const d = box(0.05, 0.05, 0.62, steel, x, CH - 0.48, -6 + k + 0.5, g); d.rotation.x = k % 2 ? 0.7 : -0.7; }
        box(0.12, 0.05, 12, steel, x, CH - 0.7, -0.5, g);
        if (i < 3) box(0.05, 0.03, 10.5, stripMat, x + 1.15, CH - 0.26, -0.5, g);
      }
      for (const z of [-3.2, 0.6]) { const sk = new THREE.Mesh(new THREE.PlaneGeometry(RW - 2, 1.1), skyMat); sk.rotation.x = Math.PI / 2; sk.position.set(0, CH - 0.01, z); g.add(sk); }
      // 天井の隅のスピーカー
      for (const sx of [-RW / 2 + 0.7, RW / 2 - 0.7]) { const sp2 = box(0.42, 0.62, 0.38, black, sx, CH - 1.2, WALL_Z + 0.5, g); sp2.rotation.y = sx < 0 ? 0.5 : -0.5; }
      // 隣の部屋との壁（出入口つき）
      const side = (sx: number, door: boolean) => {
        if (!door) { box(0.2, CH, 12, travMat(2, 1), sx, CH / 2, -0.5, g); return; }
        box(0.2, CH, 2.8, travMat(0.6, 1), sx, CH / 2, -3.6, g);
        box(0.2, CH, 4.8, travMat(1, 1), sx, CH / 2, 2.6, g);
        box(0.2, CH - 3, 2.4, travMat(0.5, 0.2), sx, 3 + (CH - 3) / 2, -1, g);
      };
      if (ri === 0) side(-RW / 2, false);
      side(RW / 2, ri < rooms.length - 1);
      // ブロンズの壁面と、上の間接照明
      const fwm = new THREE.MeshStandardMaterial({ map: tex(bronzeWall(xs.map((x) => (x + fw / 2) / fw))), roughness: 0.6, metalness: 0.25 });
      box(fw, 3.4, 0.08, fwm, 0, 1.7, WALL_Z + 0.04, g);
      box(fw, 0.02, 0.04, coveMat, 0, 3.42, WALL_Z + 0.1, g);
      // 服を掛ける銀のバー
      if (!tall && room.pieces.some((q) => q.kind === 'garment')) { box(fw - 0.6, 0.035, 0.035, chrome, 0, 2.6, WALL_Z + 0.3, g); for (const bx of [-(fw - 0.6) / 2, (fw - 0.6) / 2]) box(0.03, 0.03, 0.3, chrome, bx, 2.6, WALL_Z + 0.16, g); }
      // 天井のダウンライト
      void lampMat;
      // 部屋の灯り
      const sp = new THREE.SpotLight(0xffffff, 40, 14, 0.95, 1, 1.6); sp.position.set(0, 4.6, -1.2); sp.target.position.set(0, 1.4, WALL_Z); g.add(sp, sp.target);
      const pl = new THREE.PointLight(0xffffff, 14, 16, 1.4); pl.position.set(0, 4.4, 1.5); g.add(pl);

      // 作品
      room.pieces.forEach((p, k) => {
        const x = xs[k];
        const baseH = p.kind === 'garment' ? 1.45 : p.kind === 'cap' ? 0.62 : 1.05;
        const maxH = tall ? Math.min(baseH, rowH * (p.kind === 'cap' ? 0.5 : p.kind === 'garment' ? 0.88 : 0.72)) : baseH;
        const cy = tall ? rowY(k) + 0.05 : p.kind === 'cap' ? 1.55 : 1.85;
        const maxW = tall ? 1.45 : Math.min(1.5, (fw - 1.2) / Math.max(1, n) + 0.15);
        const mat = new THREE.MeshStandardMaterial({ color: p.kind === 'art' ? 0xdcd6cc : 0xf2eee8, roughness: 0.9, transparent: true, alphaTest: 0.04 });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        plane.userData.id = p.id; hits.push(plane);
        const z = WALL_Z + (p.kind === 'art' ? 0.13 : 0.24);
        plane.position.set(x, cy, z); g.add(plane);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, depthWrite: false, opacity: 0.55 }));
        sh.position.set(x + 0.06, cy - 0.08, WALL_Z + 0.085); g.add(sh);
        let frame: THREE.Mesh | null = null;
        if (p.kind === 'art') frame = box(1, 1, 0.05, black, x, cy, WALL_Z + 0.1, g);
        void darkBronze; void brass;
        if (p.kind === 'cap') box(0.9, 0.04, 0.34, steel, x, cy - maxH * 0.53, WALL_Z + 0.25, g);
        if (p.kind === 'garment' && tall) { box(0.05, 0.05, 0.26, chrome, x, cy + maxH * 0.57, WALL_Z + 0.17, g); }
        const fit = (a: number) => {
          let w = maxH * a, h = maxH; if (w > maxW) { w = maxW; h = w / a; }
          plane.scale.set(w, h, 1); sh.scale.set(w * 1.25, h * 1.15, 1);
          if (frame) frame.scale.set(w + 0.12, h + 0.12, 1);
          if (p.kind === 'cap') plane.position.y = cy - maxH * 0.5 + h / 2;
          if (p.kind === 'garment') plane.position.y = cy + maxH * 0.55 - h / 2;
          sh.position.y = plane.position.y - 0.08;
        };
        fit(1);
        if (p.tex) loadTex(p.tex, (t, a) => { mat.map = t; mat.needsUpdate = true; fit(a); });
        // 壁の丸いポイント
        const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringT, transparent: true, depthWrite: false, opacity: 0.95 }));
        const rs = tall ? 0.26 : 0.34;
        if (tall) ring.position.set(x + 0.62, cy - maxH * 0.42, WALL_Z + 0.3); else ring.position.set(x, 0.62, WALL_Z + 0.2);
        ring.scale.setScalar(rs); ring.userData.id = p.id; ring.userData.base = rs; g.add(ring); hits.push(ring); rings.push(ring);
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
      const v = ri % 3;
      const bench = (bx: number, bz: number, w: number) => { box(w, 0.42, 0.62, travMat(0.4, 0.2), bx, 0.21, bz, g); const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.3, 1.1), new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, depthWrite: false, opacity: 0.45 })); sh.rotation.x = -Math.PI / 2; sh.position.set(bx, 0.004, bz); g.add(sh); };
      plant(v === 1 ? -fw / 2 - (tall ? 0.55 : 1.1) : fw / 2 + (tall ? 0.55 : 1.1), WALL_Z + 0.9, tall ? 0.8 : 1.1);
      void pouf; void marbleMat;
      if (v === 0) {
        // 大きな壁画（左の壁際）と白い台
        const mw = tall ? 2.2 : 3.8, m = new THREE.Mesh(new THREE.PlaneGeometry(mw, mw * 0.56), muralMat); m.position.set(-fw / 2 - mw / 2 - 0.15, 2.4, WALL_Z + 0.02); if (!tall) g.add(m);
        bench(tall ? -0.6 : -1.4, -2.3, 1.8); bench(tall ? 1.0 : 2.4, -1.4, 1.2);
      }
      if (v === 1) {
        // 天井から吊るした、木の板で組んだ舟形の彫刻
        const prof: THREE.Vector2[] = []; for (let k = 0; k <= 16; k++) { const a2 = (k / 16) * Math.PI / 2; prof.push(new THREE.Vector2(Math.sin(a2) * 1, -Math.cos(a2) * 1)); }
        const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), woodMat); hull.scale.set(tall ? 1.3 : 2.6, 0.55, tall ? 0.8 : 1.3); hull.position.set(tall ? 0.4 : 1.2, CH - 1.5, -1.6); g.add(hull);
        for (const cx2 of [-1, 1]) box(0.01, 1.5, 0.01, black, hull.position.x + cx2 * hull.scale.x * 0.6, CH - 0.75, -1.6, g);
        bench(-0.8, -2.0, 2.2);
      }
      if (v === 2) {
        // 記録のブロックを積んだ彫刻（白と銀）
        const sx2 = tall ? 1.1 : 2.8, sz2 = -2.2;
        [[0, 0.45, 0, 0.9, steel], [0.12, 1.25, 0.08, 0.7, chrome], [-0.05, 1.86, -0.04, 0.52, steel], [0.06, 2.3, 0.03, 0.36, black]].forEach(([dx, y, dz, s2, mm]) => { const c2 = box(s2 as number, s2 as number, s2 as number, mm as THREE.Material, sx2 + (dx as number), y as number, sz2 + (dz as number), g); c2.rotation.y = (y as number) * 0.6; });
        bench(-1.6, -1.8, 1.6);
      }
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
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.4, 0.995));
      composer.addPass(new OutputPass());
    }

    // ---- カメラ ----
    const st = { room: 0, focus: null as string | null, moving: false };
    const pos = new THREE.Vector3(0, 1.6, CAM_Z), look = new THREE.Vector3(0, 1.55, WALL_Z);
    const tPos = pos.clone(), tLook = look.clone();
    let yaw = 0, pitch = 0, vYaw = 0, vPitch = 0;
    let trans: { t0: number; from: THREE.Vector3; fromL: THREE.Vector3; dir: number } | null = null;
    const emit = () => cb.current.onState({ room: st.room, focus: st.focus, moving: !!trans, ready: true });
    let fitZ = CAM_Z;
    const baseView = (i: number) => { if (tall) { tPos.set(i * RW, 1.85, fitZ); tLook.set(i * RW, 0.62, WALL_Z); } else { tPos.set(i * RW, 1.6, CAM_Z); tLook.set(i * RW, 1.5, WALL_Z); } };
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
      // 縦長：一番広い壁面（＋植物）が横幅に収まる距離までカメラを下げる
      if (tall) {
        const half = Math.max(...rooms.map((r) => Math.min(2, r.pieces.length) * 1.75 + 0.9)) / 2 + 0.75;
        fitZ = Math.min(5.3, WALL_Z + half / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect));
        if (!st.focus && !trans) baseView(st.room);
      }
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
      alive = false;
      cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('pointermove', pmv); removeEventListener('pointerup', pu); removeEventListener('keydown', key);
      renderer.domElement.removeEventListener('pointerdown', pd);
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach((x) => x.dispose()); });
      pm.dispose(); composer?.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); apiRef.current = null;
    };
  }, [rooms, apiRef, tall]);

  return <div ref={host} className="gr-3d" />;
}
