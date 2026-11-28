'use client';
// ショールーム：海に面したガラスのパビリオン（LA・サンタモニカの浜辺のイメージ）。
// 奥と右奥は床から天井までのガラスで、外はウッドデッキ・砂浜・海・桟橋の観覧車・ヤシの木。軽さのため一部屋だけ。
// 商品は種類ごとに場所を分けて陳列（DP）し、服は写真（見本は絵）から立体にする。押すと近づいて詳細が出る。
// 中央の光る台には、スマートスキャンで彫り出した立体（この端末に保存した .glb）をそのまま並べる。
// 車・自転車・ヨット・サーフボードは見本の展示（売り物ではない）。実在のブランドのロゴは使わない。
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildPillow as buildGarment } from '../pillow3d';
import { layerOf, bboxOf } from './garmentLayer';
import { isPhone } from '@/lib/device';
import { loadImage } from '@/lib/imgQueue';
import { getModel } from '@/lib/modelStore';
import type { GalleryApi, GState } from './Gallery3D';
import { buildHall } from './exhibits';

export type DP = 'forms' | 'scan' | 'wall' | 'outer' | 'table' | 'rack' | 'back' | 'caps' | 'case' | 'art' | 'car' | 'bike' | 'yacht';
export type SPiece = { id: string; title: string; code?: string; kind: 'garment' | 'cap' | 'art'; tex: string; back?: string; heightM?: number; glbKey?: string };
export type SRoom = { key: string; dp: DP; pieces: SPiece[] };

const W = 12, D = 9, H = 5, STG = 0.3, DECK = 4; // 半幅・半奥行・天井・右の壁のステージの高さ・デッキの奥行き
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type Zone = 'in' | 'deck';
// スマホでは大きな絵（1024px 以上）を半分の大きさで描いて、メモリを軽くする
let SMALL_TEX = false;
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, rep?: [number, number]) {
  if (SMALL_TEX && Math.max(w, h) >= 1024) { w = Math.round(w / 2); h = Math.round(h / 2); }
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
// 絵を読み込んで貼る。スマホでは小さな画像に描き直してから使う（端末のメモリを節約）
const loadTex = async (src: string): Promise<THREE.Texture | null> => {
  const im = await loadImage(src); if (!im) return null;
  try {
    const max = isPhone() ? 256 : 768, k = Math.min(1, max / Math.max(im.naturalWidth || max, im.naturalHeight || max));
    const c = document.createElement('canvas'); c.width = Math.max(2, Math.round((im.naturalWidth || max) * k)); c.height = Math.max(2, Math.round((im.naturalHeight || max) * k));
    c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  } catch { return null; }
};

export default function Showroom3D({ rooms, apiRef, onState, onPick, paused = false }: {
  rooms: SRoom[]; apiRef: React.MutableRefObject<GalleryApi | null>; onState: (s: GState) => void; onPick: (id: string) => void; paused?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef({ onState, onPick, paused }); cb.current = { onState, onPick, paused };

  useEffect(() => {
    const el = host.current; if (!el) return;
    let alive = true;
    const mobile = isPhone(); SMALL_TEX = mobile;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: mobile ? 'default' : 'high-performance' }); }
    catch { cb.current.onState({ room: 0, focus: null, moving: false, ready: true, lost: true }); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.2 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (!mobile) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    el.appendChild(renderer.domElement);
    // 診断：シェーダーが端末で動かないときは、その内容を画面の診断欄へ（原因を確かめるため）
    const report = (m: string) => { try { dispatchEvent(new CustomEvent('gc-3d-error', { detail: m })); } catch { /* 無視 */ } };
    renderer.debug.onShaderError = (gl, prog, vs, fs) => { report('shader: ' + (gl.getProgramInfoLog(prog) || '') + ' ' + (gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || '')); };
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cb.current.onState({ room: 0, focus: null, moving: false, ready: true, lost: true }); });

    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfdcf2);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
    const camera = new THREE.PerspectiveCamera(mobile ? 70 : 50, 1, 0.05, 900); // スマホは画角を広げて、遠目に全体を

    // ---- 材質 ----
    const wallM = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.95 });
    // 床：艶のある冷たい灰色の石のタイル（1.2m 角）。光がにじんで映る
    const floorT = canvasTex(1024, 1024, (g, w, h) => {
      for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
        const v = 178 + Math.random() * 14; g.fillStyle = `rgb(${v - 4},${v},${v + 8})`; g.fillRect(tx * w / 2, ty * h / 2, w / 2, h / 2);
        for (let i = 0; i < 5; i++) { g.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.05})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const x = tx * w / 2 + Math.random() * w / 2, y = ty * h / 2; g.moveTo(x, y); g.bezierCurveTo(x + 60, y + 150, x - 40, y + 300, x + 30, y + h / 2); g.stroke(); }
      }
      for (let i = 0; i < 9000; i++) { const v = 170 + Math.random() * 70; g.fillStyle = `rgba(${v - 4},${v},${v + 8},${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = 'rgba(70,78,90,.5)'; for (const q of [0, w / 2]) { g.fillRect(q, 0, 2, h); g.fillRect(0, q, w, 2); } // 目地
    }, [W / 1.2, D / 1.2]);
    const floorM = new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.13, metalness: 0.05 });
    const white = new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.5 });
    const black = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.45 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe8eaec, metalness: 1, roughness: 0.14 });
    const topT = canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#3a3e45'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const v = 70 + Math.random() * 120; g.fillStyle = `rgba(${v},${v + 4},${v + 10},${0.25 + Math.random() * 0.5})`; const r = 1 + Math.random() * 3; g.fillRect(Math.random() * w, Math.random() * h, r, r); } });
    const topM = new THREE.MeshStandardMaterial({ map: topT, roughness: 0.18, metalness: 0.1 });
    const navyM = new THREE.MeshStandardMaterial({ color: 0x1a2232, roughness: 0.25, metalness: 0.2 });
    // ハンガー：黒一色のシンプルなもの（つや消しの黒＋いぶし銀の金具）
    const hSilver = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.22, metalness: 1 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.03, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    const shadowT = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = scene) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = !mobile; b.receiveShadow = !mobile; p.add(b); return b; };
    const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, p: THREE.Object3D = scene) => { const l = a.distanceTo(b); const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 12), m); c.position.copy(a).lerp(b, 0.5); c.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); c.castShadow = !mobile; p.add(c); return c; };
    const softShadow = (x: number, z: number, w: number, d: number, o = 0.5, p: THREE.Object3D = scene) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, opacity: o, depthWrite: false })); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.004, z); p.add(s); };

    // ---- 建物：海に面したガラスのパビリオン ----
    //   左の壁 x=-W（白）・入口の壁 z=+D（中央に入口）・右の壁 x=+W は手前半分だけ白、奥半分はガラス
    //   奥 z=-D は床から天井までのガラス（中央はデッキへの開口）。外はウッドデッキ → 砂浜 → 海
    const wheels: THREE.Object3D[] = [];
    const obs: { c?: [number, number, number]; b?: [number, number, number, number] }[] = [];
    const wallBox = (w: number, h: number, d: number, x: number, y: number, z: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallM); b.position.set(x, y, z); b.receiveShadow = !mobile; scene.add(b); return b; };
    const plane = (w: number, d: number, m: THREE.Material, x: number, y: number, z: number, down = false) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = down ? Math.PI / 2 : -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = !down && !mobile; scene.add(p); return p; };
    const glow = (c: number) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    plane(W * 2, D * 2, floorM, 0, 0, 0);
    wallBox(0.2, H, D * 2, -W - 0.1, H / 2, 0);
    wallBox(W - 1.6, H, 0.2, -(W + 1.6) / 2, H / 2, D + 0.1); wallBox(W - 1.6, H, 0.2, (W + 1.6) / 2, H / 2, D + 0.1); wallBox(3.2, H - 3.2, 0.2, 0, 3.2 + (H - 3.2) / 2, D + 0.1);
    { const d = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ color: 0xf2efe6, toneMapped: false })); d.position.set(0, 1.6, D + 0.2); d.rotation.y = Math.PI; scene.add(d); } // 入口の外の明るさ
    wallBox(0.2, H, D, W + 0.1, H / 2, D / 2);
    // ガラス：細い黒の縦枠を 2m ごとに。奥の中央は開いた引き戸（デッキへ出られる）
    const mull = (x: number, z: number) => box(0.06, H, 0.06, black, x, H / 2, z);
    for (let x = -W; x <= W + 0.01; x += 2) { if (Math.abs(x) < 2.1 && Math.abs(x) > 0.1) continue; mull(x, -D); }
    for (const [a, b] of [[-W, -2.05], [2.05, W]] as [number, number][]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(b - a, H), glass); g.position.set((a + b) / 2, H / 2, -D); scene.add(g); }
    { const g = new THREE.Mesh(new THREE.PlaneGeometry(4.1, H - 3.4), glass); g.position.set(0, 3.4 + (H - 3.4) / 2, -D); scene.add(g); box(4.1, 0.08, 0.1, black, 0, 3.4, -D); }
    for (let z = -D; z <= 0.01; z += 2) mull(W, z);
    { const g = new THREE.Mesh(new THREE.PlaneGeometry(D, H), glass); g.position.set(W, H / 2, -D / 2); g.rotation.y = Math.PI / 2; scene.add(g); }
    box(W * 2, 0.1, 0.12, black, 0, H - 0.05, -D); box(0.12, 0.1, D, black, W, H - 0.05, -D / 2);
    // 天井と、部屋を横切る幅広の光の帯。屋根はデッキの上まで張り出す
    const ceilM = new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 1 });
    plane(W * 2, D * 2, ceilM, 0, H, 0, true);
    for (let z = -D + 1.4; z < D - 0.6; z += 2.3) { plane(W * 2 - 1.2, 0.7, glow(0xf8fbff), 0, H - 0.012, z, true); for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 1.2, 0.12, 0.04), wallM); b.position.set(0, H - 0.06, z + s * 0.37); scene.add(b); } }
    { const r = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 1.2, 0.34, DECK + 0.6), white); r.position.set(0, H + 0.17, -D - (DECK + 0.6) / 2); scene.add(r);
      const u = plane(W * 2 + 1.2, DECK + 0.6, ceilM, 0, H - 0.005, -D - (DECK + 0.6) / 2, true); void u; }
    // 壁の足もとの光
    { const washT = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,246,232,1)'); gr.addColorStop(0.25, 'rgba(255,246,232,.45)'); gr.addColorStop(1, 'rgba(255,246,232,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      const washM = new THREE.MeshBasicMaterial({ map: washT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 });
      const w1 = new THREE.Mesh(new THREE.PlaneGeometry(D * 2, 0.8), washM); w1.position.set(-W + 0.012, 0.4, 0); w1.rotation.y = Math.PI / 2; scene.add(w1);
      for (const s of [-1, 1]) { const w2 = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.6, 0.8), washM); w2.position.set(s * (W + 1.6) / 2, 0.4, D - 0.012); w2.rotation.y = Math.PI; scene.add(w2); } }

    // ---- 外：ウッドデッキ・砂浜・海・空・山・桟橋と観覧車・ヤシの木・ライフガードの小屋 ----
    const deckT = canvasTex(512, 512, (g, w, h) => { const n = 12; for (let i = 0; i < n; i++) { const l = 52 + Math.random() * 8; g.fillStyle = `hsl(28,${30 + Math.random() * 8}%,${l}%)`; g.fillRect(0, (i * h) / n, w, h / n); g.fillStyle = 'rgba(60,40,25,.45)'; g.fillRect(0, (i * h) / n, w, 2); for (let q = 0; q < 14; q++) { g.strokeStyle = `rgba(80,55,35,${Math.random() * 0.12})`; g.beginPath(); const y = (i * h) / n + Math.random() * (h / n); g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 4); g.stroke(); } } }, [W / 1.5, DECK / 1.5]);
    plane(W * 2, DECK, new THREE.MeshStandardMaterial({ map: deckT, roughness: 0.7 }), 0, 0.004, -D - DECK / 2);
    box(W * 2, 0.55, 0.2, new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.8 }), 0, -0.27, -D - DECK);
    { const gl = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 1.0), glass); gl.position.set(0, 0.5, -D - DECK + 0.05); scene.add(gl); rod(V(-W, 1.02, -D - DECK + 0.05), V(W, 1.02, -D - DECK + 0.05), 0.022, chrome); for (let x = -W; x <= W + 0.01; x += 2) rod(V(x, 0, -D - DECK + 0.05), V(x, 1.02, -D - DECK + 0.05), 0.014, chrome); }
    const sandT = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#e6d5b3'; g.fillRect(0, 0, w, h); for (let i = 0; i < 16000; i++) { const v = Math.random(); g.fillStyle = v < 0.5 ? `rgba(255,248,232,${Math.random() * 0.35})` : `rgba(150,120,85,${Math.random() * 0.2})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, [60, 14]);
    const SAND_Y = -0.55, SEA_Z = -D - DECK - 44;
    { const s = new THREE.Mesh(new THREE.PlaneGeometry(900, 60), new THREE.MeshStandardMaterial({ map: sandT, roughness: 1 })); s.rotation.x = -Math.PI / 2; s.position.set(0, SAND_Y, SEA_Z + 30); scene.add(s);
      const s2 = new THREE.Mesh(new THREE.PlaneGeometry(900, 300), new THREE.MeshStandardMaterial({ color: 0xd9c8a6, roughness: 1 })); s2.rotation.x = -Math.PI / 2; s2.position.set(0, SAND_Y - 0.02, 150); scene.add(s2); }
    // 海：青の濃淡と白い波のすじ。ゆっくり流れる
    const seaT = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#2f7fb0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${Math.random() * 0.22})` : `rgba(10,60,110,${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 40, 1 + Math.random() * 2); } }, [70, 40]);
    const seaM = new THREE.MeshStandardMaterial({ map: seaT, roughness: 0.18, metalness: 0.2, color: 0xbfe0f2 });
    { const s = new THREE.Mesh(new THREE.PlaneGeometry(1600, 800), seaM); s.rotation.x = -Math.PI / 2; s.position.set(0, SAND_Y - 0.15, SEA_Z - 400); scene.add(s); }
    const foamT = canvasTex(512, 32, (g, w, h) => { for (let x = 0; x < w; x += 2) { const a = 0.35 + Math.random() * 0.55; g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(x, h * 0.2 + Math.random() * h * 0.3, 2, h * 0.3 + Math.random() * h * 0.3); } }, [40, 1]);
    const foams: THREE.Mesh[] = [];
    for (const [z, o] of [[SEA_Z + 1.5, 0.9], [SEA_Z - 6, 0.55], [SEA_Z - 14, 0.35]] as [number, number][]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(900, 2.2), new THREE.MeshBasicMaterial({ map: foamT, transparent: true, opacity: o, depthWrite: false })); f.rotation.x = -Math.PI / 2; f.position.set(0, SAND_Y - 0.1, z); f.userData.z0 = z; scene.add(f); foams.push(f); }
    // 空：上は青、水平線は白くかすむ
    { const t = canvasTex(16, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5aa2dd'); gr.addColorStop(0.42, '#a9d2f0'); gr.addColorStop(0.5, '#f3efe6'); gr.addColorStop(0.53, '#d9e6ee'); gr.addColorStop(1, '#d9e6ee'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, toneMapped: false })); scene.add(sky); }
    // 遠くの山なみ（左の水平線、かすんだ青）と、水平線の上の雲
    { const t = canvasTex(2048, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        // 尾根の線は中点をずらしていく方法で（自然なギザギザ）。奥の山ほど淡く
        const ridge = (n: number, rough: number) => { const r = new Array(n + 1).fill(0); r[0] = 0.5; r[n] = 0.3; for (let st = n; st > 1; st >>= 1) { for (let i = 0; i < n; i += st) { const m = i + st / 2; r[m] = (r[i] + r[i + st]) / 2 + (Math.random() - 0.5) * rough * (st / n); } } return r; };
        for (const [c, a, base] of [['rgba(130,158,180,', 0.5, 0.62], ['rgba(98,128,152,', 0.78, 0.82]] as [string, number, number][]) {
          const N = 256, r = ridge(N, 2.2); g.fillStyle = c + a + ')'; g.beginPath(); g.moveTo(0, h);
          for (let i = 0; i <= N; i++) { const u = i / N, env = Math.max(0, Math.min(1, (0.5 - u) / 0.14)); const y = h - env * h * base * Math.max(0.12, Math.min(1, r[i])); g.lineTo(u * w, y); }
          g.lineTo(w, h); g.fill();
        }
      });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(600, 600, 70, 64, 1, true, Math.PI * 0.5, Math.PI), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false })); m.position.y = 34 + SAND_Y - 0.2; scene.add(m); }
    // 桟橋と観覧車（左手の海に突き出す。右手の水平線は山なみ）
    { const px = -70, z0 = SEA_Z + 8, len = 170, pierM = new THREE.MeshStandardMaterial({ color: 0x9c8a74, roughness: 0.9 });
      const dk = new THREE.Mesh(new THREE.BoxGeometry(16, 0.8, len), pierM); dk.position.set(px, 5, z0 - len / 2); scene.add(dk);
      const piles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 6), pierM, Math.ceil(len / 6) * 3); let k = 0; const mtx = new THREE.Matrix4();
      for (let z = 0; z < len; z += 6) for (const dx of [-7, 0, 7]) { mtx.makeTranslation(px + dx, 2, z0 - z); piles.setMatrixAt(k++, mtx); } piles.count = k; scene.add(piles);
      for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(5 + (i % 2) * 3, 3 + (i % 3), 6), new THREE.MeshStandardMaterial({ color: [0xf2ede2, 0x6f9fc0, 0xe7c06a, 0xf2ede2, 0xc85d4a][i], roughness: 0.8 })); b.position.set(px + (i % 2 ? -4 : 4), 6.9, z0 - 20 - i * 14); scene.add(b); }
      const wc = V(px + 3, 20, z0 - 95), R = 13, wheel = new THREE.Group(); wheel.position.copy(wc); scene.add(wheel);
      const wm = new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.5 });
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.28, 6, 64), wm));
      const n = mobile ? 12 : 20;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; rod(V(0, 0, 0), V(Math.cos(a) * R, Math.sin(a) * R, 0), 0.08, wm, wheel); const car = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: [0xd84f3f, 0xf0c44a, 0x3f7fc8][i % 3], roughness: 0.6 })); car.position.set(Math.cos(a) * R, Math.sin(a) * R - 0.9, 0); wheel.add(car); }
      for (const s of [-1, 1]) rod(V(wc.x - 4, 5.4, wc.z + s * 1.5), wc.clone().setZ(wc.z + s * 0.4), 0.3, wm); rod(V(wc.x + 4, 5.4, wc.z), wc.clone(), 0.3, wm);
      wheels.push(wheel);
      // ジェットコースターの線（白い鉄骨）
      const pts: THREE.Vector3[] = []; for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push(V(px - 5 + Math.sin(u * Math.PI * 2) * 3, 7 + Math.abs(Math.sin(u * Math.PI * 3)) * 7, z0 - 115 - u * 30)); }
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.25, 6), wm)); }
    // ヤシの木（幹は少し曲がり、葉は垂れる）
    const palm = (x: number, z: number, h: number, lean: number, rot: number) => {
      const trunkM = new THREE.MeshStandardMaterial({ color: 0x8b7358, roughness: 0.95 }), leafM = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.8, side: THREE.DoubleSide });
      const pts: THREE.Vector3[] = []; for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(V(x + Math.sin(rot) * lean * u * u, SAND_Y + u * h, z + Math.cos(rot) * lean * u * u)); }
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.22, 6), trunkM));
      const top = pts[pts.length - 1], nl = mobile ? 7 : 10;
      for (let i = 0; i < nl; i++) {
        const a = (i / nl) * Math.PI * 2 + rot, L = 3.4 + (i % 3) * 0.5, g = new THREE.PlaneGeometry(L, 0.7, 6, 1), pa = g.attributes.position;
        for (let k = 0; k < pa.count; k++) { const u = (pa.getX(k) + L / 2) / L; pa.setY(k, pa.getY(k) * (1 - u * 0.85)); pa.setZ(k, -u * u * 1.6); }
        g.computeVertexNormals(); const lf = new THREE.Mesh(g, leafM); lf.position.copy(top); lf.rotation.set(-Math.PI / 2 + 0.25, 0, a); lf.translateX(L / 2); scene.add(lf);
      }
    };
    for (const [x, z, h, l, r] of [[-19, -18, 9, 1.2, 0.4], [-25, -24, 11, 1.8, -0.3], [16, -17, 10, 1.5, -0.6], [24, -27, 12, 2, 0.5], [-6, -36, 8, 1, 2.2], [34, -20, 9, 1.4, 1]] as [number, number, number, number, number][]) palm(x, z, h, l, r);
    // ライフガードの小屋（水色の小屋が脚の上に乗り、スロープがつく）
    { const lx = 12, lz = SEA_Z + 12, y0 = SAND_Y; const lb = new THREE.MeshStandardMaterial({ color: 0x9fd3e6, roughness: 0.6 }), wh = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.7 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) rod(V(lx + sx * 1.2, y0, lz + sz * 1.2), V(lx + sx * 1.2, y0 + 2.4, lz + sz * 1.2), 0.08, wh);
      box(3, 0.15, 3.2, wh, lx, y0 + 2.45, lz); box(2.6, 1.9, 2.4, lb, lx, y0 + 3.5, lz); box(3.0, 0.12, 2.8, wh, lx, y0 + 4.5, lz);
      const rp = box(1.1, 0.08, 4.6, wh, lx, y0 + 1.2, lz + 3.5); rp.rotation.x = 0.55;
      const t = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#e8524a'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `700 ${h * 0.6}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('23', w / 2, h / 2); });
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: t })); sg.position.set(lx, y0 + 4.1, lz + 1.21); scene.add(sg); }

    // サーフボード：左奥の壁に横向きに掛ける（オリジナルの柄）。店の右奥の角にも三枚立てる
    const board = (parent: THREE.Object3D, i: number) => {
      const t = canvasTex(128, 512, (g, w, h) => { const pal = [['#f4efe4', '#2f6fa8'], ['#e9b949', '#f4efe4'], ['#2f4a35', '#e9e2d0'], ['#d6604d', '#f4efe4'], ['#15171a', '#d8c9a8']][i % 5]; g.fillStyle = pal[0]; g.fillRect(0, 0, w, h); g.fillStyle = pal[1]; if (i % 3 === 0) g.fillRect(w * 0.45, 0, w * 0.1, h); else if (i % 3 === 1) { for (let y = h * 0.3; y < h * 0.7; y += 30) g.fillRect(0, y, w, 12); } else { g.beginPath(); g.arc(w / 2, h * 0.62, w * 0.3, 0, 7); g.fill(); } });
      const g = new THREE.SphereGeometry(0.5, 24, 10); g.scale(0.56, 2.1, 0.06);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, roughness: 0.25 })); m.castShadow = !mobile; parent.add(m); return m;
    };
    { const g0 = new THREE.Group(); g0.position.set(-W + 0.12, 0, -6.2); g0.rotation.y = Math.PI / 2; scene.add(g0);
      for (let i = 0; i < 4; i++) { const b = board(g0, i); b.rotation.z = Math.PI / 2; b.position.set(0, 1.3 + i * 0.75, 0.08); rod(V(-1.1, 1.3 + i * 0.75 - 0.08, 0), V(-1.1, 1.3 + i * 0.75 - 0.08, 0.16), 0.012, chrome, g0); rod(V(1.1, 1.3 + i * 0.75 - 0.08, 0), V(1.1, 1.3 + i * 0.75 - 0.08, 0.16), 0.012, chrome, g0); }
      for (let i = 0; i < 3; i++) { const b = board(scene, i + 4); b.position.set(W - 0.5 - i * 0.55, 1.05, -D + 0.55); b.rotation.set(-0.12, 0.25, 0.05); }
      obs.push({ b: [W - 2.0, W, -D, -D + 1.0] }); }

    // ---- 光：海側（奥）から差し込む昼の光 ----
    scene.add(new THREE.HemisphereLight(0xe4f1ff, 0xe8dcc4, 1.35));
    const sun = new THREE.DirectionalLight(0xfff4e2, 1.5); sun.position.set(-25, 30, -40); sun.target.position.set(0, 0, 2); scene.add(sun, sun.target);
    if (!mobile) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 120 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4; sun.shadow.camera.updateProjectionMatrix(); }
    const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(6, 6, 12); scene.add(fill);
    scene.fog = new THREE.Fog(0xdce9f2, 120, 650);
    // ---- 商品を置く ----
    const hits: THREE.Object3D[] = [];
    const spots = new Map<string, { look: THREE.Vector3; pos: THREE.Vector3; room: number }>();
    const stops: { pos: THREE.Vector3; look: THREE.Vector3 }[] = [];
    const spinners: THREE.Object3D[] = [], slowSpin: THREE.Object3D[] = [];
    const swayers: { o: THREE.Object3D; ph: number }[] = [];
    const queue: (() => Promise<void>)[] = [];
    let built3D = 0; const MAX3D = mobile ? 3 : 40;

    // 服：まず平らな絵を出し、順番に立体に置き換える。親の原点が肩の上の中央、高さ h（m）
    // ハンガー：服の中に腕が隠れ、首元から金具が出てレールに掛かる。パンツはクリップ式
    const tube = (pts: THREE.Vector3[], r: number, mat: THREE.Material, seg = 24) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 8, false), mat);
    // ハンガー：白い綿の布でくるんだもの（肩の広い型と、パンツ用のまっすぐな型）＋細い銀の金具
    const clothTex = canvasTex(256, 256, (g, W, H) => {
      g.fillStyle = '#f4f2ed'; g.fillRect(0, 0, W, H);
      let sd = 11; const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
      for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * H, l = 20 + r() * 70, a = (r() - 0.5) * 0.6; g.strokeStyle = r() < 0.5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.5)'; g.lineWidth = 1 + r() * 2.5; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 8, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.035})`; g.fillRect(r() * W, r() * H, 1, 1); }
    });
    clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping; clothTex.repeat.set(9, 9);
    const hCloth = new THREE.MeshStandardMaterial({ color: 0xffffff, map: clothTex, roughness: 0.96, metalness: 0 });
    const extrude = (sh: THREE.Shape, depth: number, bevel: number) => { const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 18 }); g.translate(0, 0, -depth / 2); return g; };
    const hangerOf = (w: number, clip: boolean, drop: number) => {
      const hg = new THREE.Group();
      const top = clip ? -drop + 0.03 : -drop + 0.014; // 金具の付け根
      // 金具：細い銀。付け根からまっすぐ上がり、レールの上を回って後ろへ
      const hook: THREE.Vector3[] = [V(0, top - 0.01, 0), V(0, -0.025, 0.004), V(0, 0.004, 0.022)];
      for (let t = 0; t <= 1.0001; t += 0.125) { const a = t * Math.PI * 1.15; hook.push(V(0, 0.02 + Math.sin(a) * 0.024, Math.cos(a) * 0.024)); }
      hg.add(tube(hook, 0.0034, hSilver, 40));
      if (clip) {
        // パンツ用：まっすぐな棒を白い布でくるんだ帯。腰の上にかかる
        const bw = Math.max(0.34, w * 1.08), bh = 0.06, sh = new THREE.Shape();
        sh.moveTo(-bw / 2, -bh / 2); sh.lineTo(bw / 2, -bh / 2); sh.lineTo(bw / 2, bh / 2); sh.lineTo(-bw / 2, bh / 2); sh.closePath();
        const m = new THREE.Mesh(extrude(sh, 0.01, 0.005), hCloth); m.position.set(0, top - bh / 2 - 0.004, 0.012); m.castShadow = !mobile; hg.add(m);
      } else {
        // 肩の広いハンガー：中央が山になり、肩先は幅広。布でくるんだ柔らかい角
        const hw = Math.min(0.47, w * 0.98) / 2, s2 = new THREE.Shape();
        s2.moveTo(0, 0);
        s2.quadraticCurveTo(0.03, 0, 0.05, -0.008); s2.quadraticCurveTo(hw * 0.55, -0.04, hw - 0.02, -0.074);
        s2.quadraticCurveTo(hw + 0.004, -0.08, hw, -0.1); s2.quadraticCurveTo(hw - 0.004, -0.114, hw - 0.022, -0.11);
        s2.quadraticCurveTo(hw * 0.55, -0.085, 0.05, -0.056); s2.quadraticCurveTo(0.02, -0.05, 0, -0.05);
        s2.quadraticCurveTo(-0.02, -0.05, -0.05, -0.056); s2.quadraticCurveTo(-hw * 0.55, -0.085, -hw + 0.022, -0.11);
        s2.quadraticCurveTo(-hw + 0.004, -0.114, -hw, -0.1); s2.quadraticCurveTo(-hw - 0.004, -0.08, -hw + 0.02, -0.074);
        s2.quadraticCurveTo(-hw * 0.55, -0.04, -0.05, -0.008); s2.quadraticCurveTo(-0.03, 0, 0, 0);
        const m = new THREE.Mesh(extrude(s2, 0.022, 0.006), hCloth); m.position.set(0, top, -0.032); m.castShadow = !mobile; hg.add(m); // 服の後ろ寄りに（首元の山だけがのぞく）
      }
      return hg;
    };
    const garment = (parent: THREE.Object3D, p: SPiece, h0: number, ri: number, face: THREE.Vector3, dist: number, hanger = true, clip = false) => {
      // 採寸した服は、その実物の高さで（パンツが床に着かないよう上限あり）
      const h = p.heightM ? Math.min(1.25, Math.max(0.2, p.heightM)) : h0;
      const g0 = new THREE.Group(); parent.add(g0);
      const drop = hanger ? 0.1 : 0; // レールから服の上端まで
      const g = new THREE.Group(); g.position.y = -drop + (clip ? 0.035 : 0); g0.add(g); // パンツは布の帯に腰をかける
      const hw0 = clip ? Math.min(0.4, h * 0.36) : Math.max(0.34, Math.min(0.46, h * 0.56));
      const hgr = hanger ? hangerOf(hw0, clip, drop) : null; if (hgr) g0.add(hgr);
      const flat = new THREE.Mesh(new THREE.PlaneGeometry(h * 1.09, h), new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.4, roughness: 0.9, side: THREE.DoubleSide }));
      flat.position.y = -h * 0.5 - h * 0.02; flat.userData.id = p.id; g.add(flat); hits.push(flat);
      loadTex(p.tex).then((t) => {
        if (!t || !alive) return; (flat.material as THREE.MeshStandardMaterial).map = t; (flat.material as THREE.MeshStandardMaterial).needsUpdate = true;
        // 絵の余白を除いて、服の上端がハンガーの位置に来るように板の大きさと位置を合わせる
        try {
          const im = t.image as HTMLImageElement | HTMLCanvasElement; const W = 80, H = Math.max(8, Math.round(80 * (im.height / im.width)));
          const c = document.createElement('canvas'); c.width = W; c.height = H; const cg = c.getContext('2d', { willReadFrequently: true })!; cg.drawImage(im, 0, 0, W, H);
          const d = cg.getImageData(0, 0, W, H).data; let y0 = H, y1 = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 100) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
          if (y1 > y0) { const f0 = y0 / H, f1 = (y1 + 1) / H, PH = h / (f1 - f0), PW = PH * (im.width / im.height); flat.geometry.dispose(); flat.geometry = new THREE.PlaneGeometry(PW, PH); flat.position.y = f0 * PH - PH / 2; }
          // ハンガーの幅を、服の肩幅に合わせる（タンクトップなど肩の細い服で、ハンガーがはみ出さないように）
          if (y1 > y0 && hgr && !clip) {
            const ry = Math.min(H - 1, Math.round(y0 + (y1 - y0) * 0.1)); let l = -1, r = -1; for (let x = 0; x < W; x++) if (d[(ry * W + x) * 4 + 3] > 100) { if (l < 0) l = x; r = x; }
            if (r > l) { const shoulderM = ((r - l + 1) / (y1 - y0 + 1)) * h; hgr.scale.x = Math.max(0.45, Math.min(1, (shoulderM * 0.92) / (hw0 * 0.88))); }
          }
        } catch { /* 無視 */ }
      });
      const look = new THREE.Vector3(); g.updateWorldMatrix(true, false);
      queue.push(async () => {
        if (!alive || built3D >= MAX3D) return;
        const F = await layerOf(p.tex); if (!F || !alive) return;
        const B = p.back ? await layerOf(p.back) : null; if (!bboxOf(F)) return;
        // 吊るした服の薄さで
        const r = buildGarment(F, B, h, 0.42, mobile ? 512 : 1024); if (!r || !alive) return;
        const bx = new THREE.Box3().setFromObject(r.group), c = bx.getCenter(new THREE.Vector3());
        r.group.position.set(-c.x, -bx.max.y, -c.z);
        r.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.userData.id = p.id; m.castShadow = !mobile; hits.push(m); const mm = m.material as THREE.MeshStandardMaterial; if (mm.side === THREE.BackSide) mm.color.setHex(0x8d877e); } });
        g.add(r.group); flat.visible = false; built3D++;
      });
      g.getWorldPosition(look); look.y -= h * 0.5;
      spots.set(p.id, { look: look.clone(), pos: look.clone().add(face.clone().multiplyScalar(dist)).setY(Math.max(1.3, look.y + 0.15)), room: ri });
      return g0;
    };
    // 平らな商品（帽子・小物・アート）：絵の板。少し傾けて影を落とす
    const flatPiece = (parent: THREE.Object3D, p: SPiece, w: number, ri: number, face: THREE.Vector3, dist: number, tilt = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.92), new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.35, roughness: 0.7 }));
      m.rotation.x = -tilt; m.position.y = w * 0.46 * Math.cos(tilt); m.userData.id = p.id; m.castShadow = !mobile; parent.add(m); hits.push(m);
      loadTex(p.tex).then((t) => { if (t && alive) { (m.material as THREE.MeshStandardMaterial).map = t; (m.material as THREE.MeshStandardMaterial).needsUpdate = true; } });
      const look = new THREE.Vector3(); m.getWorldPosition(look);
      spots.set(p.id, { look: look.clone(), pos: look.clone().add(face.clone().multiplyScalar(dist)).setY(Math.max(1.2, look.y + 0.35)), room: ri });
      return m;
    };

    // ---- 陳列の部品（どれも壁や台の「手前の面」が local +z、横が local x） ----
    const grp = (x: number, z: number, ry: number, y = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g); return g; };
    // 壁から生えるような、白い曲線の棚（端は壁へ溶けるように細くなる）
    const curvedShelf = (g0: THREE.Group, span: number, y: number, depth = 0.46, x0 = 0) => {
      const sh = new THREE.Shape(), N = 24; sh.moveTo(x0 - span / 2, 0);
      for (let i = 0; i <= N; i++) { const x = -span / 2 + (i / N) * span, q = (2 * x) / span; sh.lineTo(x0 + x, depth * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(q), 6)), 0.5)); }
      sh.lineTo(x0 + span / 2, 0); sh.lineTo(x0 - span / 2, 0);
      const sg = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 4 }), white);
      sg.rotation.x = Math.PI / 2; sg.position.set(0, y + 0.03, 0); sg.castShadow = !mobile; g0.add(sg);
    };
    // たたんだ服の山（飾り。押せない）。服の絵の胸のあたりを上面に
    const foldStack = (parent: THREE.Object3D, p: SPiece, x: number, y: number, z: number, cnt: number) => {
      loadTex(p.tex).then((t) => {
        if (!t || !alive) return;
        const top = t.clone(); top.repeat.set(0.42, 0.36); top.offset.set(0.29, 0.38); top.needsUpdate = true;
        const side = t.clone(); side.repeat.set(0.02, 0.02); side.offset.set(0.4, 0.14); side.needsUpdate = true;
        const sm = new THREE.MeshStandardMaterial({ map: side, roughness: 0.95 }), tm = new THREE.MeshStandardMaterial({ map: top, roughness: 0.9 });
        for (let i = 0; i < cnt; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.3), i === cnt - 1 ? [sm, sm, tm, sm, sm, sm] : sm); f.position.set(x, y + 0.025 + i * 0.051, z); parent.add(f); }
      });
    };
    // 斜めの陳列台：クロームの A 字の脚に、手前へ傾けた石の板。上に小物を平らに置く
    const tiltBoard = (x: number, z: number, ps: SPiece[], ri: number, Lb: number, ry = -Math.PI / 2) => {
      const g0 = grp(x, z, ry), beta = 0.42, face = V(Math.sin(ry), 0, Math.cos(ry)), alongX = Math.abs(face.z) > 0.5;
      for (const ex of [-Lb / 2 + 0.12, Lb / 2 - 0.12]) { rod(V(ex, 0, 0.42), V(ex, 0.9, -0.05), 0.016, chrome, g0); rod(V(ex, 0, -0.42), V(ex, 0.9, 0.05), 0.016, chrome, g0); rod(V(ex, 0.02, -0.45), V(ex, 0.02, 0.45), 0.014, chrome, g0); }
      const bd = new THREE.Group(); bd.position.set(0, 0.88, 0); bd.rotation.x = beta; g0.add(bd);
      const b = new THREE.Mesh(new THREE.BoxGeometry(Lb, 0.03, 0.8), topM); b.castShadow = !mobile; bd.add(b);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(Lb, 0.05, 0.015), chrome); lip.position.set(0, 0.03, 0.4); bd.add(lip);
      const cols = Math.max(1, Math.ceil(ps.length / 2));
      ps.forEach((p, k) => {
        const c = k % cols, r = Math.floor(k / cols);
        const h0 = new THREE.Group(); h0.position.set(cols === 1 ? 0 : -Lb / 2 + 0.25 + (c * (Lb - 0.5)) / (cols - 1), 0.02, r ? -0.17 : 0.2); bd.add(h0);
        flatPiece(h0, p, 0.3, ri, face, 1.3, Math.PI / 2);
      });
      if (alongX) { softShadow(x, z, Lb + 0.4, 1.2, 0.35); obs.push({ b: [x - Lb / 2, x + Lb / 2, z - 0.45, z + 0.45] }); } else { softShadow(x, z, 1.2, Lb + 0.4, 0.35); obs.push({ b: [x - 0.45, x + 0.45, z - Lb / 2, z + Lb / 2] }); }
    };
    // 壁の長いレール（一列）
    const railWall = (g0: THREE.Group, ps: SPiece[], span: number, ri: number, face: THREE.Vector3, h0: number, y = 2.25) => {
      const n = ps.length; if (!n) return;
      rod(V(-span / 2, y, 0.4), V(span / 2, y, 0.4), 0.016, chrome, g0);
      for (const ex of [-span / 2, 0, span / 2]) rod(V(ex, y, 0.02), V(ex, y, 0.4), 0.012, chrome, g0);
      ps.forEach((p, k) => {
        const x = n === 1 ? 0 : -span / 2 + 0.6 + (k * (span - 1.2)) / (n - 1);
        const a = new THREE.Group(); a.position.set(x, y, 0.4); g0.add(a); swayers.push({ o: a, ph: k * 1.3 });
        garment(a, p, h0, ri, face, 2.4);
      });
    };
    // 自立式のクロームのラック（パンツはクリップ式のハンガー）
    const rackFree = (g0: THREE.Group, ps: SPiece[], L: number, ri: number, face: THREE.Vector3) => {
      const n = ps.length; if (!n) return;
      for (const ex of [-L / 2, L / 2]) { rod(V(ex, 0.05, 0), V(ex, 1.85, 0), 0.02, chrome, g0); rod(V(ex, 0.05, -0.3), V(ex, 0.05, 0.3), 0.02, chrome, g0); }
      rod(V(-L / 2, 1.85, 0), V(L / 2, 1.85, 0), 0.016, chrome, g0);
      const c = new THREE.Vector3(); g0.getWorldPosition(c); softShadow(c.x, c.z, Math.abs(face.x) > 0.5 ? 1.6 : L + 0.8, Math.abs(face.x) > 0.5 ? L + 0.8 : 1.6, 0.4);
      ps.forEach((p, k) => {
        const x = n === 1 ? 0 : -L / 2 + 0.45 + (k * (L - 0.9)) / (n - 1);
        const a = new THREE.Group(); a.position.set(x, 1.83, 0.02); g0.add(a); swayers.push({ o: a, ph: k });
        garment(a, p, 1.05, ri, face, 2.6, true, true);
      });
    };
    const wpos = (o: THREE.Object3D) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v; };

    // ---- 売り場 ----
    const zoneOf: Zone[] = [];
    let wantObjects = false;
    const scanSlots: { g: THREE.Group; p: SPiece; ri: number }[] = [];
    const placard = (x: number, z: number, ry: number, title: string, line: string) => {
      const g = grp(x, z, ry); box(0.05, 0.95, 0.05, white, 0, 0.475, 0, g);
      const t = canvasTex(512, 320, (c, w, h) => { c.fillStyle = '#fbfaf7'; c.fillRect(0, 0, w, h); c.fillStyle = '#141414'; c.font = `400 ${h * 0.17}px "Times New Roman", Georgia, serif`; c.fillText(title, w * 0.08, h * 0.36); c.fillStyle = '#5a564f'; c.font = `400 ${h * 0.085}px Arial, sans-serif`; c.fillText(line, w * 0.08, h * 0.58); c.fillStyle = '#8a857b'; c.fillText('Sample display — not for sale', w * 0.08, h * 0.82); });
      const pl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.014), [white, white, white, white, new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }), white]); pl.position.set(0, 0.98, 0); pl.rotation.x = -0.7; g.add(pl);
      obs.push({ c: [x, z, 0.22] });
    };
    rooms.forEach((room, ri) => {
      const ps = room.pieces, n = ps.length;
      zoneOf[ri] = 'in';
      switch (room.dp) {
        case 'forms': { // 入口：下から光る白い台に、回転台とトルソー。正面のガラスの向こうに海
          const PZ = 5.6;
          { const pl = new THREE.Mesh(new RoundedBoxGeometry(6.4, 0.3, 2.6, 4, 0.12), white); pl.position.set(0, 0.17, PZ); pl.receiveShadow = !mobile; scene.add(pl);
            const gw = new THREE.Mesh(new RoundedBoxGeometry(6.46, 0.06, 2.66, 4, 0.03), glow(0xfff6e6)); gw.position.set(0, 0.03, PZ); scene.add(gw); obs.push({ b: [-3.2, 3.2, PZ - 1.3, PZ + 1.3] }); }
          const sp = mobile ? 1.5 : 2.2, xs = n === 1 ? [0] : ps.map((_, k) => -sp + (2 * sp * k) / Math.max(1, n - 1));
          ps.forEach((p, k) => {
            const x = xs[k], z = PZ - Math.abs(x) * 0.15;
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.14, 40), new THREE.MeshStandardMaterial({ color: 0xf6f7f9, roughness: 0.18 })); base.position.set(x, 0.39, z); scene.add(base);
            const turn = new THREE.Group(); turn.position.set(x, 0.46, z); scene.add(turn); spinners.push(turn);
            rod(V(0, 0, 0), V(0, 1.3, 0), 0.02, chrome, turn); rod(V(-0.18, 1.5, 0), V(0.18, 1.5, 0), 0.015, chrome, turn);
            const g = garment(turn, p, 0.82, ri, V(0, 0, 1), 2.4, false); g.position.y = 1.52;
            spots.get(p.id)!.look.set(x, 1.3, z); spots.get(p.id)!.pos.set(x, 1.6, z + 2.4);
          });
          stops[ri] = mobile ? { pos: V(0, 2.1, 8.4), look: V(0, 1.4, 1.0) } : { pos: V(0, 1.8, 8.3), look: V(0, 1.45, 2.0) };
          break;
        }
        case 'scan': { // 中央の島：スキャンした服を、彫り出した立体のまま光る丸い台に並べる
          const CX = 0, CZ = 0.6, R = 1.5;
          const isl = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.04, 0.36, 64), white); isl.position.set(CX, 0.18, CZ); isl.receiveShadow = !mobile; scene.add(isl);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.025, 8, 96), glow(0xeaf4ff)); ring.rotation.x = Math.PI / 2; ring.position.set(CX, 0.03, CZ); scene.add(ring);
          const top = new THREE.Mesh(new THREE.CircleGeometry(R - 0.12, 64), glow(0xf6faff)); top.rotation.x = -Math.PI / 2; top.position.set(CX, 0.362, CZ); scene.add(top);
          obs.push({ c: [CX, CZ, R + 0.05] }); softShadow(CX, CZ, 4.2, 4.2, 0.35);
          const turn = new THREE.Group(); turn.position.set(CX, 0.37, CZ); scene.add(turn); slowSpin.push(turn);
          const m = Math.min(n, 4);
          for (let k = 0; k < m; k++) {
            const a = (k / Math.max(1, m)) * Math.PI * 2, r = m === 1 ? 0 : 0.78;
            const g = new THREE.Group(); g.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); turn.add(g);
            scanSlots.push({ g, p: ps[k], ri });
            const look = V(CX + Math.sin(a) * r, 0.9, CZ + Math.cos(a) * r);
            spots.set(ps[k].id, { look, pos: V(CX, 1.5, CZ + 2.8), room: ri });
          }
          if (!m) { // まだスキャンがないときの案内（透明な板に文字）
            const t = canvasTex(1024, 384, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(20,20,20,.88)'; c.textAlign = 'center'; c.font = `400 ${h * 0.15}px "Times New Roman", Georgia, serif`; c.fillText('YOUR SCAN, IN 3D', w / 2, h * 0.36); c.font = `400 ${h * 0.085}px Arial, sans-serif`; c.fillText('Studio → Smart scan → “Display in the showroom”', w / 2, h * 0.58); c.fillText('スタジオでスキャンすると、ここに立体で並びます', w / 2, h * 0.76); });
            const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide })); pl.position.set(0, 0.75, 0); turn.add(pl);
            const ac = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 0.02), glass); ac.position.set(0, 0.75, -0.02); turn.add(ac);
          }
          stops[ri] = mobile ? { pos: V(0, 2.3, 5.2), look: V(0, 0.8, 0.6) } : { pos: V(0, 2.0, 4.4), look: V(0, 0.85, 0.6) };
          break;
        }
        case 'wall': { // 左の壁：長いクロームのレールに少しずつ重ねて掛け、上に白い曲線の棚を三段
          const g0 = grp(-W, 0.7, Math.PI / 2), span = 7.0, two = n > 8, rails = two ? [2.8, 1.72] : [2.0], per = Math.ceil(n / rails.length);
          rails.forEach((y, r) => {
            const row = ps.slice(r * per, (r + 1) * per); if (!row.length) return;
            rod(V(-span / 2, y, 0.4), V(span / 2, y, 0.4), 0.016, chrome, g0); for (const ex of [-span / 2, 0, span / 2]) rod(V(ex, y, 0.02), V(ex, y, 0.4), 0.012, chrome, g0);
            const sp = row.length === 1 ? 0 : (span - 1.2) / (row.length - 1);
            row.forEach((p, k) => { const a = new THREE.Group(); a.position.set(row.length === 1 ? 0 : -span / 2 + 0.6 + k * sp, y, 0.4); a.rotation.y = sp < 0.8 ? -0.42 : 0; g0.add(a); garment(a, p, 0.78, ri, V(1, 0, 0), 2.6); });
          });
          const sy = two ? [3.5, 3.95, 4.4] : [2.85, 3.3, 3.75], sw = [0.94, 0.74, 0.56], sx = [0, -0.8, 0.9];
          sy.forEach((y, t) => { const spn = span * sw[t]; curvedShelf(g0, spn, y, 0.46, sx[t]); const cnt = Math.max(1, Math.floor((spn - 1.4) / 0.6)); for (let i = 0; i < cnt; i++) { const p = ps[(i + t * 3) % n]; if (p) foldStack(g0, p, sx[t] - (cnt - 1) * 0.3 + i * 0.6, y + 0.05, 0.22, 2 + ((i + t) % 3)); } });
          stops[ri] = mobile ? { pos: V(-4.2, 2.3, 0.7), look: V(-W, 2.4, 0.7) } : { pos: V(-4.6, 2.2, 0.7), look: V(-W, 2.5, 0.7) };
          break;
        }
        case 'outer': { // 左の壁の手前：アウターを一列
          railWall(grp(-W, 6.4, Math.PI / 2), ps, Math.min(4.4, Math.max(2.4, n * 0.6 + 0.8)), ri, V(1, 0, 0), 0.92, 2.3);
          stops[ri] = mobile ? { pos: V(-5.4, 2.0, 6.4), look: V(-W, 1.8, 6.4) } : { pos: V(-6.6, 1.85, 6.4), look: V(-W, 1.8, 6.4) };
          break;
        }
        case 'rack': { // 中央左：両面のラック（前と後ろにパンツ）
          const a = ps.slice(0, Math.ceil(n / 2)), b = ps.slice(a.length);
          rackFree(grp(-5.6, 0.75, 0), a, 4.0, ri, V(0, 0, 1));
          if (b.length) rackFree(grp(-5.6, 0.45, Math.PI), b, 4.0, ri, V(0, 0, -1));
          obs.push({ b: [-7.7, -3.5, 0.0, 1.2] });
          stops[ri] = mobile ? { pos: V(-3.4, 2.1, 4.6), look: V(-5.6, 1.1, 0.6) } : { pos: V(-3.6, 1.85, 3.9), look: V(-5.6, 1.15, 0.6) };
          break;
        }
        case 'car': { // 左奥：ガラスの前にローライダー。窓の外は海
          wantObjects = true;
          stops[ri] = mobile ? { pos: V(0.4, 2.4, -0.4), look: V(-7.0, 0.8, -5.6) } : { pos: V(-0.8, 1.9, -1.4), look: V(-7.0, 0.85, -5.6) };
          break;
        }
        case 'bike': { // 右奥：回る台のカスタムBMX
          wantObjects = true;
          stops[ri] = mobile ? { pos: V(1.0, 1.9, -2.4), look: V(4.4, 0.75, -6.6) } : { pos: V(1.6, 1.6, -3.4), look: V(4.4, 0.75, -6.6) };
          break;
        }
        case 'yacht': { // 外：砂浜に上げたヨット。デッキから眺める
          wantObjects = true; zoneOf[ri] = 'deck';
          stops[ri] = mobile ? { pos: V(4.0, 2.6, -11.6), look: V(15, 1.0, -26) } : { pos: V(4.6, 2.3, -12.0), look: V(15, 1.1, -26) };
          break;
        }
        case 'table': { // 右奥のガラスぎわ：クロームの X 脚のテーブルを一列に、Tシャツを平置き
          const nt = n > 8 ? 3 : n > 3 ? 2 : 1, per = Math.ceil(n / nt), zs = [-1.4, -4.2, -7.0];
          for (let ti = 0; ti < nt; ti++) {
            const row = ps.slice(ti * per, (ti + 1) * per); if (!row.length) continue;
            const cols = Math.ceil(row.length / 2), L = Math.max(1.6, Math.min(2.4, cols * 0.5 + 0.5)), TX = 8.9, g0 = grp(TX, zs[ti], -Math.PI / 2);
            box(L, 0.05, 1.2, topM, 0, 0.86, 0, g0);
            for (const sx of [-1, 1]) { const ex = sx * (L / 2 - 0.2); rod(V(ex, 0, -0.55), V(ex, 0.84, 0.42), 0.02, chrome, g0); rod(V(ex, 0, 0.55), V(ex, 0.84, -0.42), 0.02, chrome, g0); rod(V(ex, 0.02, -0.57), V(ex, 0.02, 0.57), 0.018, chrome, g0); }
            rod(V(-L / 2 + 0.2, 0.42, 0), V(L / 2 - 0.2, 0.42, 0), 0.016, chrome, g0);
            softShadow(TX, zs[ti], 2.2, L + 0.8, 0.38); obs.push({ b: [TX - 0.6, TX + 0.6, zs[ti] - L / 2, zs[ti] + L / 2] });
            row.forEach((p, k) => {
              const col = k % cols, r = Math.floor(k / cols), x = cols === 1 ? 0 : -L / 2 + 0.38 + (col * (L - 0.76)) / (cols - 1), z = r ? 0.27 : -0.27;
              const stk = new THREE.Group(); stk.position.set(x, 0.885, z); g0.add(stk);
              loadTex(p.tex).then((t) => {
                if (!t || !alive) return;
                const tp = t.clone(); tp.repeat.set(0.42, 0.36); tp.offset.set(0.29, 0.38); tp.needsUpdate = true;
                const sd = t.clone(); sd.repeat.set(0.02, 0.02); sd.offset.set(0.4, 0.14); sd.needsUpdate = true;
                const sm = new THREE.MeshStandardMaterial({ map: sd, roughness: 0.95 }), tm = new THREE.MeshStandardMaterial({ map: tp, roughness: 0.9 });
                for (let i = 0; i < 2; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.42), i === 1 ? [sm, sm, tm, sm, sm, sm] : sm); f.position.set(0, 0.025 + i * 0.051, 0); f.castShadow = f.receiveShadow = !mobile; f.userData.id = p.id; stk.add(f); hits.push(f); }
              });
              const look = wpos(stk).setY(1.0);
              spots.set(p.id, { look, pos: look.clone().add(V(-1.0, 0.95, 0)), room: ri });
            });
          }
          stops[ri] = mobile ? { pos: V(5.0, 3.2, 1.8), look: V(8.9, 0.85, -4.2) } : { pos: V(5.4, 2.6, 1.2), look: V(8.9, 0.85, -4.2) };
          break;
        }
        case 'back': { // 右の壁：下から光る一段高いステージに、ヴィンテージとツアーマーチ
          const st = new THREE.Mesh(new RoundedBoxGeometry(1.5, STG, 7.4, 4, 0.12), white); st.position.set(W - 0.75, STG / 2, 4.3); st.receiveShadow = !mobile; scene.add(st);
          const gw = new THREE.Mesh(new RoundedBoxGeometry(1.56, 0.05, 7.46, 4, 0.02), glow(0xfff6e6)); gw.position.set(W - 0.75, 0.025, 4.3); scene.add(gw);
          obs.push({ b: [W - 1.55, W, 0.55, 8.05] });
          railWall(grp(W, 4.3, -Math.PI / 2, STG), ps, Math.min(7.0, Math.max(3, n * 0.95 + 0.8)), ri, V(-1, 0, 0), 0.82);
          stops[ri] = mobile ? { pos: V(5.4, 2.2, 4.3), look: V(W, 1.95, 4.3) } : { pos: V(6.4, 2.05, 4.3), look: V(W, 2.0, 4.3) };
          break;
        }
        case 'case': { // 入口の壁の右：紺のパネルの前に角の丸いガラスケース、手前に斜めの陳列台
          const inCase = ps.slice(0, Math.ceil(n / 2)), onBoard = ps.slice(inCase.length), nb = onBoard.length;
          if (nb) { const h = Math.ceil(nb / 2); tiltBoard(4.9, 6.4, onBoard.slice(0, h), ri, 1.15, Math.PI); if (nb > h) tiltBoard(7.5, 6.4, onBoard.slice(h), ri, 1.15, Math.PI); }
          const nc = inCase.length, per = Math.ceil(nc / 2), L = Math.max(1.9, per * 0.42 + 0.3), CXc = 6.2, CZc = 8.15, g0 = grp(CXc, CZc, Math.PI);
          const b0 = new THREE.Mesh(new RoundedBoxGeometry(L, 0.86, 0.8, 4, 0.16), white); b0.position.set(0, 0.47, 0); g0.add(b0);
          const gb = new THREE.Mesh(new RoundedBoxGeometry(L - 0.06, 0.05, 0.74, 3, 0.02), glow(0xfff6e6)); gb.position.set(0, 0.03, 0); g0.add(gb);
          const gl = new THREE.Mesh(new RoundedBoxGeometry(L - 0.04, 0.75, 0.76, 5, 0.2), glass); gl.position.set(0, 1.28, 0); g0.add(gl);
          box(L - 0.1, 0.012, 0.7, glass, 0, 1.18, 0, g0);
          for (let i = 0; i < 6; i++) box(1.08, 2.9, 0.06, navyM, 3.1 + i * 1.12, 2.0, D - 0.06);
          obs.push({ b: [CXc - L / 2, CXc + L / 2, CZc - 0.45, D] }); softShadow(CXc, CZc, L + 0.9, 1.8, 0.45);
          inCase.forEach((p, k) => {
            const tier = k < per ? 0 : 1, kk = tier ? k - per : k, cnt = tier ? nc - per : per;
            const x = cnt === 1 ? 0 : -L / 2 + 0.25 + (kk * (L - 0.5)) / (cnt - 1);
            const h0 = new THREE.Group(); h0.position.set(x, tier ? 1.19 : 0.905, 0); g0.add(h0);
            flatPiece(h0, p, 0.28, ri, V(0, 0, -1), 1.2, 0.9);
          });
          stops[ri] = mobile ? { pos: V(6.2, 2.5, 1.8), look: V(6.2, 0.95, 7.6) } : { pos: V(6.2, 2.1, 2.6), look: V(6.2, 0.95, 7.6) };
          break;
        }
        case 'caps': { // 入口の壁の左：光る箱の格子に、帽子をひとつずつ
          const g0 = grp(-7.0, D, Math.PI), cols = 7, rows = Math.max(3, Math.ceil(n / cols)), S = 0.62, P = 0.72, gm = glow(0xfff3e2);
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const x = (c - (cols - 1) / 2) * P, y = 3.2 - r * P;
            const bk = new THREE.Mesh(new THREE.PlaneGeometry(S, S), gm); bk.position.set(x, y, 0.012); g0.add(bk);
            box(S + 0.04, 0.03, 0.34, white, x, y - S / 2, 0.17, g0); box(S + 0.04, 0.03, 0.34, white, x, y + S / 2, 0.17, g0);
            box(0.03, S, 0.34, white, x - S / 2, y, 0.17, g0); box(0.03, S, 0.34, white, x + S / 2, y, 0.17, g0);
            const k = r * cols + c; if (k >= n) continue;
            const holder = new THREE.Group(); holder.position.set(x, y - S / 2 + 0.02, 0.18); g0.add(holder);
            flatPiece(holder, ps[k], 0.42, ri, V(0, 0, -1), 1.6, 0.15);
          }
          stops[ri] = mobile ? { pos: V(-7.0, 2.1, 3.4), look: V(-7.0, 2.2, D) } : { pos: V(-7.0, 1.95, 4.4), look: V(-7.0, 2.25, D) };
          break;
        }
        case 'art': { // 入口の上の壁に額装
          const g0 = grp(0, D, Math.PI);
          ps.slice(0, 3).forEach((p, k) => {
            const x = (k - (Math.min(n, 3) - 1) / 2) * 1.2;
            box(1.0, 1.0, 0.05, black, x, 4.0, 0.03, g0);
            const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), new THREE.MeshStandardMaterial({ roughness: 0.8 })); pic.position.set(x, 4.0, 0.062); pic.userData.id = p.id; g0.add(pic); hits.push(pic);
            loadTex(p.tex).then((t) => { if (t && alive) { (pic.material as THREE.MeshStandardMaterial).map = t; (pic.material as THREE.MeshStandardMaterial).needsUpdate = true; } });
            const look = wpos(pic); spots.set(p.id, { look, pos: look.clone().add(V(0, -1.6, -3.2)), room: ri });
          });
          stops[ri] = mobile ? { pos: V(0, 2.2, 3.4), look: V(0, 3.7, D) } : { pos: V(0, 2.3, 4.0), look: V(0, 3.6, D) };
          break;
        }
      }
    });
    // 車・自転車・ヨット（最初の画面が出てから）
    const CAR = { x: -7.0, z: -5.6, ry: -0.25 }, BIKE = { x: 4.4, z: -6.6 }, YACHT = { x: 15, z: -26, ry: -0.9 };
    let objTick: ((now: number) => void) | null = null;
    if (wantObjects) {
      { const ux = Math.cos(CAR.ry), uz = -Math.sin(CAR.ry); for (const o of [-2.3, 0, 2.3]) obs.push({ c: [CAR.x + ux * o, CAR.z + uz * o, 1.7] }); }
      obs.push({ c: [BIKE.x, BIKE.z, 1.3] });
      placard(-2.9, -3.0, 0.9, 'Candy Hardtop', 'Candy paint · lace · hydraulics'); placard(2.4, -5.2, -0.8, 'Custom BMX', 'Chrome frame · gold parts');
      setTimeout(() => { if (!alive) return; try { objTick = buildHall(scene, mobile, shadowT, 'beach', { car: CAR, bike: BIKE, yacht: { x: YACHT.x, z: YACHT.z, ry: YACHT.ry } }).tick; } catch (e) { report('objects: ' + String(e)); } }, 600);
    }
    // スキャンした立体を読み込む（この端末の IndexedDB から）。高さは測った着丈に合わせる
    if (scanSlots.length) {
      const loader = new GLTFLoader();
      for (const s of scanSlots) {
        const key = s.p.glbKey;
        if (!key) { const a = new THREE.Group(); a.position.set(0, 1.45, 0); s.g.add(a); rod(V(0, 0, 0), V(0, 1.45, 0), 0.015, chrome, s.g); garment(a, s.p, 0.8, s.ri, V(0, 0, 1), 2.4, false); continue; } // 立体がない古いスキャンは、絵から立体にして
        getModel(key).then((buf) => {
          if (!buf || !alive) return;
          loader.parse(buf, '', (gltf) => {
            if (!alive) return;
            const o = gltf.scene, bx = new THREE.Box3().setFromObject(o), sz = bx.getSize(new THREE.Vector3()), c = bx.getCenter(new THREE.Vector3());
            const k = (s.p.heightM || 0.75) / Math.max(0.01, sz.y); o.scale.setScalar(k); o.position.set(-c.x * k, -bx.min.y * k + 0.02, -c.z * k);
            o.traverse((m) => { const me = m as THREE.Mesh; if (me.isMesh) { me.userData.id = s.p.id; me.castShadow = !mobile; hits.push(me); const mm = me.material as THREE.MeshStandardMaterial; if (mm) { mm.roughness = 0.85; mm.metalness = 0; } } });
            s.g.add(o);
          }, () => undefined);
        }).catch(() => undefined);
      }
    }

    // 立体化を順番に（画面を止めないよう、1着ずつ間をあけて）
    (async () => { await new Promise((r) => setTimeout(r, 400)); for (const job of queue) { if (!alive) return; await job(); await new Promise((r) => setTimeout(r, 30)); } })();

    // ---- カメラ：売り場から売り場へ移動。ドラッグで見回し、ホイール／ピンチで寄る ----
    let room = 0, focus: string | null = null;
    const cur = { pos: stops[0]?.pos.clone() || V(0, 1.7, 8), look: stops[0]?.look.clone() || V(0, 1.4, 0) };
    const goal = { pos: cur.pos.clone(), look: cur.look.clone() };
    let yaw = 0, pitch = 0, zoom = 1, moving = false, walking = false;
    const emit = (ready = true) => cb.current.onState({ room, focus, moving, ready, walking });
    // 店の中とデッキのあいだは、奥のガラスの開口を通る
    let via: { pos: THREE.Vector3; look: THREE.Vector3 }[] = [], zoneNow: Zone = zoneOf[0] || 'in';
    const zoneAt = (p: THREE.Vector3): Zone => (p.z < -D ? 'deck' : 'in');
    const route = (pos: THREE.Vector3, look: THREE.Vector3, to: Zone) => {
      via = [];
      if (zoneNow !== to) {
        const s = zoneNow === 'in' ? 1 : -1, a = V(0, 1.7, -D + s * 1.2), b = V(0, 1.7, -D - s * 1.2), ahead = V(0, 1.6, -D - s * 6);
        goal.pos.copy(a); goal.look.copy(ahead); via = [{ pos: b, look: ahead }, { pos: pos.clone(), look: look.clone() }];
      } else { goal.pos.copy(pos); goal.look.copy(look); }
      zoneNow = to;
    };
    let stopWalkFn: () => void = () => undefined;
    const goRoom = (i: number) => { if (!stops[i]) return; stopWalkFn(); room = i; focus = null; route(stops[i].pos, stops[i].look, zoneOf[i] || 'in'); yaw = pitch = 0; zoom = 1; moving = true; emit(); };
    const doFocus = (id: string | null) => {
      if (!id) { focus = null; goRoom(room); return; }
      const s = spots.get(id); if (!s) return; stopWalkFn();
      room = s.room; focus = id; route(s.pos, s.look, zoneOf[s.room] || 'in'); yaw = pitch = 0; zoom = 1; moving = true; emit();
    };

    // ---- 歩く（ゲームのように自由に）：キーボード（WASD・矢印、Shift で走る）か、スマホは画面のスティック。ドラッグで見回す ----
    // 壁・ガラス・台にはぶつかる。奥のガラスの開口からデッキへ出られる。右の壁のステージに乗ると目線が上がる
    const EYE = 1.65, R0 = 0.32;
    const inR = (x: number, z: number, x0: number, x1: number, z0: number, z1: number) => x > x0 && x < x1 && z > z0 && z < z1;
    let hd = 0, pt = 0, stageY = 0;
    const me = V(0, 0, 7), keys = new Set<string>(), stick = { x: 0, y: 0 };
    const free = (x: number, z: number) => {
      const ok = inR(x, z, -W + 0.75, W - 0.45, -D + 0.4, D - 0.6) || inR(x, z, -W + 0.3, W - 0.3, -D - DECK + 0.35, -D - 0.35) || inR(x, z, -1.7, 1.7, -D - 0.6, -D + 0.6);
      if (!ok) return false;
      for (const o of obs) {
        if (o.c && Math.hypot(x - o.c[0], z - o.c[1]) < o.c[2] + R0) return false;
        if (o.b && x > o.b[0] - R0 && x < o.b[1] + R0 && z > o.b[2] - R0 && z < o.b[3] + R0) return false;
      }
      return true;
    };
    const startWalk = () => {
      if (walking) return;
      const p = camera.position, d = camera.getWorldDirection(new THREE.Vector3());
      me.set(p.x, 0, p.z); hd = Math.atan2(-d.x, -d.z); pt = Math.max(-0.5, Math.min(0.5, Math.asin(Math.max(-1, Math.min(1, d.y)))));
      if (!free(me.x, me.z)) { let done = false; for (let r = 0.3; r < 8 && !done; r += 0.3) for (let a = 0; a < 16 && !done; a++) { const x = me.x + Math.cos((a / 16) * Math.PI * 2) * r, z = me.z + Math.sin((a / 16) * Math.PI * 2) * r; if (free(x, z)) { me.x = x; me.z = z; done = true; } } }
      walking = true; focus = null; via = []; moving = false; yaw = pitch = 0; zoom = 1; emit();
    };
    const stopWalk = () => {
      if (!walking) return; walking = false; keys.clear(); stick.x = stick.y = 0;
      const d = camera.getWorldDirection(new THREE.Vector3());
      cur.pos.copy(camera.position); cur.look.copy(camera.position).addScaledVector(d, 3); goal.pos.copy(cur.pos); goal.look.copy(cur.look);
      zoneNow = zoneAt(cur.pos);
    };
    stopWalkFn = stopWalk;
    const stepWalk = (dt: number) => {
      let f = 0, s = 0, turn = 0;
      if (keys.has('w') || keys.has('arrowup')) f += 1; if (keys.has('s') || keys.has('arrowdown')) f -= 1;
      if (keys.has('a')) s -= 1; if (keys.has('d')) s += 1;
      if (keys.has('arrowleft') || keys.has('q')) turn += 1; if (keys.has('arrowright') || keys.has('e')) turn -= 1;
      f -= stick.y; s += stick.x; hd += turn * 1.9 * dt;
      const sp = keys.has('shift') ? 4.4 : 2.3, fx = -Math.sin(hd), fz = -Math.cos(hd), rx = Math.cos(hd), rz = -Math.sin(hd);
      let mx = fx * f + rx * s, mz = fz * f + rz * s; const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
      const nx = me.x + mx * sp * dt, nz = me.z + mz * sp * dt;
      if (free(nx, nz)) { me.x = nx; me.z = nz; } else if (free(nx, me.z)) me.x = nx; else if (free(me.x, nz)) me.z = nz;
    };
    const camWalk = () => {
      stageY += ((inR(me.x, me.z, W - 1.6, W, 0.5, 8.1) ? STG : 0) - stageY) * 0.2;
      const y = stageY + EYE;
      camera.position.set(me.x, y, me.z);
      camera.lookAt(me.x - Math.sin(hd) * Math.cos(pt), y + Math.sin(pt), me.z - Math.cos(hd) * Math.cos(pt));
    };
    apiRef.current = { goRoom, focus: doFocus, walk: (on: boolean) => { if (on) startWalk(); else { stopWalk(); goRoom(room); } }, stick: (x: number, y: number) => { stick.x = x; stick.y = y; if ((x || y) && !walking) startWalk(); } };

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let drag: { x: number; y: number; yaw: number; pitch: number; hd: number; pt: number; moved: boolean } | null = null;
    const pinch = new Map<number, { x: number; y: number }>(); let pd0 = 0, z0 = 1;
    const dom = renderer.domElement;
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', (e) => { pinch.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pinch.size === 2) { const [a, b] = [...pinch.values()]; pd0 = Math.hypot(a.x - b.x, a.y - b.y); z0 = zoom; drag = null; return; } drag = { x: e.clientX, y: e.clientY, yaw, pitch, hd, pt, moved: false }; });
    dom.addEventListener('pointermove', (e) => {
      if (pinch.has(e.pointerId)) pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.size === 2) { const [a, b] = [...pinch.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); zoom = Math.max(0.45, Math.min(1.35, z0 * (pd0 / Math.max(1, d)))); return; }
      if (drag && walking) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; hd = drag.hd - dx * 0.005; pt = Math.max(-0.6, Math.min(0.6, drag.pt - dy * 0.004)); }
      else if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; yaw = Math.max(-1.1, Math.min(1.1, drag.yaw - dx * 0.004)); pitch = Math.max(-0.45, Math.min(0.45, drag.pitch - dy * 0.003)); }
      else if (e.pointerType === 'mouse') { const r = dom.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); dom.style.cursor = ray.intersectObjects(hits, false).length ? 'pointer' : 'grab'; }
    });
    const up = (e: PointerEvent) => {
      pinch.delete(e.pointerId);
      const d = drag; drag = null; if (!d || d.moved) return;
      const r = dom.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
      const h = ray.intersectObjects(hits, false).find((x) => x.object.visible && x.object.userData.id && (x.object.parent?.visible ?? true));
      if (h) cb.current.onPick(h.object.userData.id);
    };
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', (e) => { pinch.delete(e.pointerId); drag = null; });
    dom.addEventListener('wheel', (e) => { e.preventDefault(); if (walking) return; zoom = Math.max(0.45, Math.min(1.35, zoom * (1 + e.deltaY * 0.001))); }, { passive: false });
    const MOVE = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'shift']);
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'escape' && walking) { stopWalk(); goRoom(room); return; }
      if (walking && (MOVE.has(k) || k === 'arrowleft' || k === 'arrowright')) { keys.add(k); e.preventDefault(); return; }
      if (focus) return;
      if (MOVE.has(k) && k !== 'shift') { startWalk(); keys.add(k); e.preventDefault(); return; }
      if (e.key === 'ArrowRight') goRoom(Math.min(stops.length - 1, room + 1)); if (e.key === 'ArrowLeft') goRoom(Math.max(0, room - 1));
    };
    const keyUp = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); };
    const blur = () => keys.clear();
    addEventListener('keydown', key); addEventListener('keyup', keyUp); addEventListener('blur', blur);

    const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size(); const ro = new ResizeObserver(size); ro.observe(el);

    let raf = 0, prev = performance.now(), first = true; const t0 = prev;
    const tmp = new THREE.Vector3(), dir = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now; const t = (now - t0) / 1000;
      const k = 1 - Math.pow(0.0025, dt);
      if (walking) { stepWalk(dt); camWalk(); } else {
      // 動きを減らす設定の端末では、移動せずに切り替える
      if (reduce) { while (via.length) { const n = via.shift()!; goal.pos.copy(n.pos); goal.look.copy(n.look); } cur.pos.copy(goal.pos); cur.look.copy(goal.look); }
      if (via.length && cur.pos.distanceTo(goal.pos) < 0.7) { const n = via.shift()!; goal.pos.copy(n.pos); goal.look.copy(n.look); }
      cur.pos.lerp(goal.pos, k); cur.look.lerp(goal.look, k);
      if (moving && !via.length && cur.pos.distanceTo(goal.pos) < 0.02) { moving = false; emit(); }
      // 見回し：注視点を、立ち位置を中心に回す。寄る：注視点へ近づく
      dir.copy(cur.look).sub(cur.pos); const dist = dir.length(); dir.normalize();
      dir.applyAxisAngle(V(0, 1, 0), yaw); const side = V(0, 1, 0).cross(dir).normalize(); dir.applyAxisAngle(side, -pitch);
      tmp.copy(cur.pos).addScaledVector(dir, dist * (1 - zoom));
      camera.position.copy(tmp); camera.lookAt(tmp.clone().addScaledVector(dir, Math.max(0.5, dist * zoom)));
      }
      if (!reduce) { spinners.forEach((s, i) => { s.rotation.y = Math.sin(t * 0.35 + i * 1.3) * 0.9; }); swayers.forEach((s) => { s.o.rotation.z = Math.sin(t * 1.1 + s.ph) * 0.02; s.o.rotation.y = Math.sin(t * 0.6 + s.ph) * 0.08; }); objTick?.(now); slowSpin.forEach((s) => { s.rotation.y = t * 0.25; }); wheels.forEach((w) => { w.rotation.z = t * 0.05; }); seaT.offset.y = (t * 0.004) % 1; foams.forEach((f, i) => { f.position.z = (f.userData.z0 as number) + Math.sin(t * 0.5 + i) * 1.2; (f.material as THREE.MeshBasicMaterial).opacity = (i ? 0.45 : 0.85) * (0.75 + 0.25 * Math.sin(t * 0.5 + i)); }); }
      if (cb.current.paused && !moving && !walking && !first) return;
      renderer.render(scene, camera);
      if (first) { first = false; emit(true); const gl = renderer.getContext(); const e = gl.getError(); if (e) report('gl error ' + e); if (!renderer.info.render.calls) report('nothing drawn'); }
    };
    loop();

    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', key); removeEventListener('keyup', keyUp); removeEventListener('blur', blur); apiRef.current = null;
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mm = m.material as THREE.Material | THREE.Material[]; (Array.isArray(mm) ? mm : [mm]).forEach((x) => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); }); } });
      pm.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [rooms]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="gr-3d" />;
}

