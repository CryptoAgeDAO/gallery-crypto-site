'use client';
// ショールーム：磨いたコンクリートの床と白い壁で仕切った、入り組んだ売り場。中央は天井 10m の吹き抜け。
// 商品は種類ごとに部屋を分け、部屋ごとに陳列（DP）を変えて立体（3D）で見せる（間取りは下の「建物」を参照）。
//   吹き抜け：スケートボウル・吊るした大きな服・壁画・スケートデッキの壁・らせん階段で中二階へ
//   L3（パンツ）の左の壁の開口の先：展示ホール（ローライダー・カスタムBMX・ヨット。見本の展示）
// 服は写真（見本は絵）から、スマートスキャンと同じしくみで立体にする。押すと近づいて詳細が出る。
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildPillow as buildGarment } from '../pillow3d';
import { layerOf, bboxOf } from './garmentLayer';
import { isPhone } from '@/lib/device';
import { loadImage } from '@/lib/imgQueue';
import type { GalleryApi, GState } from './Gallery3D';
import { buildHall, exhibitStop, DOOR_WZ, DOOR_W, DOOR_H, type ExhibitKind } from './exhibits';

export type DP = 'forms' | 'wall' | 'outer' | 'table' | 'rack' | 'back' | 'caps' | 'case' | 'art' | 'atrium' | 'car' | 'bike' | 'yacht';
export type SPiece = { id: string; title: string; code?: string; kind: 'garment' | 'cap' | 'art'; tex: string; back?: string; heightM?: number };
export type SRoom = { key: string; dp: DP; pieces: SPiece[] };

const W = 12, D = 14, H = 4.6, AH = 10, MZ = 4.9; // 半幅・半奥行・売り場の天井・吹き抜けの天井・中二階の床
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
// 区画（カメラの通り道）。inn は部屋の中、out は親の区画側の、開口の前の点
type Zone = 'hub' | 'L1' | 'L2' | 'L3' | 'back' | 'R1' | 'R2' | 'R3' | 'mezz' | 'hall';
const ZP: Record<Zone, { parent: Zone | null; inn: THREE.Vector3; out: THREE.Vector3 }> = {
  hub: { parent: null, inn: V(0, 1.7, 0), out: V(0, 1.7, 0) },
  L1: { parent: 'hub', inn: V(-6.4, 1.7, 5), out: V(-3.6, 1.7, 5) },
  L2: { parent: 'hub', inn: V(-6.4, 1.7, -2.5), out: V(-3.6, 1.7, -2.5) },
  L3: { parent: 'L2', inn: V(-8.5, 1.7, -7.4), out: V(-8.5, 1.7, -4.6) },
  back: { parent: 'hub', inn: V(0, 1.7, -6.6), out: V(0, 1.7, -3.4) },
  R1: { parent: 'hub', inn: V(6.4, 1.7, 6), out: V(3.6, 1.7, 6) },
  R2: { parent: 'hub', inn: V(6.4, 1.7, 0), out: V(3.6, 1.7, 0) },
  R3: { parent: 'back', inn: V(6.4, 1.7, -9.5), out: V(3.6, 1.7, -9.5) },
  mezz: { parent: 'hub', inn: V(0, MZ + 1.75, -5.7), out: V(0, MZ + 1.75, -3.0) },
  hall: { parent: 'L3', inn: V(-13.6, 1.7, DOOR_WZ), out: V(-10.4, 1.7, DOOR_WZ) },
};

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

    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe8ecf2);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
    const camera = new THREE.PerspectiveCamera(mobile ? 70 : 50, 1, 0.05, 80); // スマホは画角を広げて、遠目に全体を

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
    const oak = new THREE.MeshStandardMaterial({ color: 0xc9a77c, roughness: 0.6 }); void oak;
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

    // ---- 建物：コンクリートの床・白い壁で仕切った売り場・中央の吹き抜け（天井 10m）・奥の中二階 ----
    // 平面（上から見て、+z が入口）：
    //   入口ホール x -12..12, z 9..14（トルソー）
    //   吹き抜け x -5..5, z -5..9（スケートボウル・吊るした大きな服・壁画・スケートデッキの壁・らせん階段）
    //   左：L1 トップス z 1..9 ／ L2 アウター z -6..1 ／ L3 パンツ z -14..-6（左の壁の開口の先が展示ホール）
    //   右：R1 帽子 z 3..9 ／ R2 小物 z -3..3 ／ R3 Tシャツ z -14..-3（奥の部屋から入る）
    //   奥：ヴィンテージ・ツアー x -5..5, z -14..-5（上は中二階のアート）
    const wallBox = (w: number, h: number, d: number, x: number, y: number, z: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallM); b.position.set(x, y, z); b.receiveShadow = !mobile; scene.add(b); return b; };
    const steel = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.4, metalness: 0.6 });
    type Op = [number, number, number]; // 開口：中心・幅・高さ
    // 軸に沿った壁。along 'x' は z = c の壁（x 方向に伸びる）、'z' は x = c の壁。開口には黒い鉄の枠
    const wallLine = (along: 'x' | 'z', c: number, a0: number, a1: number, h: number, ops: Op[] = [], y0 = 0) => {
      const seg = (s0: number, s1: number, yb: number, yt: number) => { if (s1 - s0 < 0.01 || yt - yb < 0.01) return; const L = s1 - s0, m = (s0 + s1) / 2, hh = yt - yb, yc = (yb + yt) / 2; if (along === 'x') wallBox(L, hh, 0.2, m, yc, c); else wallBox(0.2, hh, L, c, yc, m); };
      const frame = (s0: number, s1: number, oh: number) => {
        const P = (a: number, y: number) => (along === 'x' ? V(a, y, c) : V(c, y, a));
        for (const a of [s0, s1]) { const p = P(a, y0 + oh / 2); const b = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? 0.06 : 0.26, oh, along === 'x' ? 0.26 : 0.06), steel); b.position.copy(p); scene.add(b); }
        const t = P((s0 + s1) / 2, y0 + oh - 0.03); const b = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? s1 - s0 + 0.06 : 0.26, 0.06, along === 'x' ? 0.26 : s1 - s0 + 0.06), steel); b.position.copy(t); scene.add(b);
      };
      let s = a0;
      for (const [oc, ow, oh] of [...ops].sort((p, q) => p[0] - q[0])) { seg(s, oc - ow / 2, y0, y0 + h); seg(oc - ow / 2, oc + ow / 2, y0 + oh, y0 + h); frame(oc - ow / 2, oc + ow / 2, oh); s = oc + ow / 2; }
      seg(s, a1, y0, y0 + h);
    };
    const plane = (w: number, d: number, m: THREE.Material, x: number, y: number, z: number, down = false) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.x = down ? Math.PI / 2 : -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = !down; scene.add(p); return p; };
    const ceilM = new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 1 });
    // 床：磨いたコンクリート（4m ごとの目地）
    plane(W * 2, D * 2, floorM, 0, 0, 0);
    // 外壁と入口のガラス
    wallLine('z', -W - 0.1, -D, 9, H, [[DOOR_WZ, DOOR_W, DOOR_H]]); wallLine('z', W + 0.1, -D, 9, H);
    wallLine('z', -W - 0.1, 9, D, H); wallLine('z', W + 0.1, 9, D, H);
    wallLine('x', -D - 0.1, -W, -5, H); wallLine('x', -D - 0.1, 5, W, H); wallLine('x', -D - 0.1, -5, 5, AH);
    { const z = D; for (let x = -W; x <= W + 0.01; x += 2) box(0.06, H, 0.08, black, x, H / 2, z); box(W * 2, 0.08, 0.08, black, 0, H - 0.04, z); box(W * 2, 0.08, 0.08, black, 0, 0.04, z);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, H), glass); gl.position.set(0, H / 2, z); scene.add(gl); }
    // 仕切り：入口ホールと左右の棟（開口つき）
    // 入口ホールと左右の棟のあいだは仕切らない（見通しよく）
    // 吹き抜けの左右の壁（下は売り場への開口、上は 10m まで）
    // 吹き抜けの左右：下は柱だけで売り場とつながり、上（4.6m から 10m）は壁
    for (const sx of [-5, 5]) {
      wallLine('z', sx, -D, 9, AH - H, [], H);
      box(0.26, 0.14, 9 + D, steel, sx, H + 0.07, (9 - D) / 2);
      for (const z of [8.6, 2.7, -5, -12]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.38, H, 0.38), wallM); c.position.set(sx, H / 2, z); scene.add(c); }
    }
    // 吹き抜けの入口側の上の壁（入口ホールの天井から上）
    wallBox(10, AH - H, 0.2, 0, H + (AH - H) / 2, 9);
    // 左の棟の仕切り
    // 左右の棟の中も仕切らず、一続きの売り場に
    // 右の棟の仕切り
    // 天井：入口ホールと左右の棟は 4.6m、吹き抜けと中二階は 10m
    plane(W * 2, D - 9, ceilM, 0, H, (D + 9) / 2, true);
    plane(W - 5, 9 + D, ceilM, -(W + 5) / 2, H, (9 - D) / 2, true); plane(W - 5, 9 + D, ceilM, (W + 5) / 2, H, (9 - D) / 2, true);
    plane(10, 9 + D, ceilM, 0, AH, (9 - D) / 2, true);
    // 天窓（吹き抜けの上）と、売り場の長い蛍光灯
    const lightM = new THREE.MeshBasicMaterial({ color: 0xffffff }), mullM = new THREE.MeshBasicMaterial({ color: 0xdedcd6 });
    { const l = plane(8.4, 12.4, lightM, 0, AH - 0.01, 2, true); void l; for (let i = 1; i < 6; i++) plane(0.05, 12.4, mullM, -4.2 + i * 1.4, AH - 0.015, 2, true); for (let i = 1; i < 6; i++) plane(8.4, 0.05, mullM, 0, AH - 0.015, -4.2 + i * 2.07, true); }
    // 天井：部屋を横切る幅広の光の帯（両側に浅い折り上げ）。青白い光
    const coveM = new THREE.MeshBasicMaterial({ color: 0xf6f9ff, toneMapped: false });
    const coves = (x0: number, x1: number, z0: number, z1: number, step = 2.4) => {
      for (let z = z0 + step / 2; z < z1 - 0.3; z += step) {
        const L = x1 - x0 - 0.8, cx = (x0 + x1) / 2;
        plane(L, 0.75, coveM, cx, H - 0.012, z, true);
        for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(L, 0.14, 0.04), wallM); b.position.set(cx, H - 0.07, z + s * 0.4); scene.add(b); }
      }
    };
    coves(-W, W, 9, D, 1.65); coves(-W, -5, -D, 9); coves(5, W, -D, 9); coves(-5, 5, -D, -5);
    // 壁の足もとの光（床から上へにじむ）
    const washT = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(225,236,255,1)'); gr.addColorStop(0.25, 'rgba(225,236,255,.45)'); gr.addColorStop(1, 'rgba(225,236,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const washM = new THREE.MeshBasicMaterial({ map: washT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
    const lineM = new THREE.MeshBasicMaterial({ color: 0xeaf2ff, toneMapped: false });
    const wash = (along: 'x' | 'z', c: number, a0: number, a1: number, inward: number) => {
      const L = a1 - a0, m = (a0 + a1) / 2, w = new THREE.Mesh(new THREE.PlaneGeometry(L, 0.9), washM);
      if (along === 'x') { w.position.set(m, 0.45, c + inward * 0.012); if (inward < 0) w.rotation.y = Math.PI; } else { w.position.set(c + inward * 0.012, 0.45, m); w.rotation.y = inward > 0 ? Math.PI / 2 : -Math.PI / 2; }
      scene.add(w);
      const ln = new THREE.Mesh(along === 'x' ? new THREE.BoxGeometry(L, 0.025, 0.03) : new THREE.BoxGeometry(0.03, 0.025, L), lineM); ln.position.set(along === 'x' ? m : c + inward * 0.02, 0.012, along === 'x' ? c + inward * 0.02 : m); scene.add(ln);
    };
    wash('z', -W, -D, DOOR_WZ - DOOR_W / 2 - 0.1, 1); wash('z', -W, DOOR_WZ + DOOR_W / 2 + 0.1, D - 0.2, 1); wash('z', W, -D, D - 0.2, -1); wash('x', -D, -W, W, 1);
    // パンツの部屋：展示ホールへの開口の横に、青白く光る大きな面
    { const lp = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.3), new THREE.MeshBasicMaterial({ color: 0xdfeaff, toneMapped: false })); lp.position.set(-W + 0.015, 1.75, DOOR_WZ + 2.5); lp.rotation.y = Math.PI / 2; scene.add(lp); }
    // 中二階：奥の部屋の上。床・前の縁・ガラスの手すり
    { const sl = new THREE.Mesh(new THREE.BoxGeometry(10, MZ - H, 9), ceilM); sl.position.set(0, (H + MZ) / 2, -9.5); scene.add(sl);
      plane(10, 9, floorM, 0, MZ + 0.005, -9.5);
      box(10, 0.32, 0.06, new THREE.MeshBasicMaterial({ color: 0xf4f8ff, toneMapped: false }), 0, MZ - 0.14, -4.98); // 中二階の縁は光る白い帯
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.05), glass); gl.position.set(0, MZ + 0.55, -5.04); scene.add(gl);
      rod(V(-5, MZ + 1.08, -5.04), V(5, MZ + 1.08, -5.04), 0.025, chrome);
      for (let x = -4; x <= 4; x += 2) rod(V(x, MZ, -5.04), V(x, MZ + 1.08, -5.04), 0.012, chrome); }
    // 開口の上の案内（展示ホールへ）
    { const t = canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#141414'; g.font = `400 ${h * 0.5}px "Times New Roman", Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${h * 0.14}px`; g.fillText('THE COLLECTION', w / 2, h / 2); });
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshBasicMaterial({ map: t, transparent: true })); sg.position.set(-W + 0.01, DOOR_H + 0.35, DOOR_WZ); sg.rotation.y = Math.PI / 2; scene.add(sg); }
    // 奥の高い壁の文字（中二階の上）
    { const t = canvasTex(2048, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#141414'; g.font = `400 ${h * 0.62}px "Times New Roman", Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${h * 0.18}px`; g.fillText('GALLERY CRYPTO', w / 2, h / 2); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true })); m.position.set(0, 8.9, -D + 0.02); if (mobile) m.scale.setScalar(0.55); scene.add(m); } // スマホは縦長で文字が切れるので小さく

    // ---- 吹き抜けの大きなオブジェクト ----
    // スケートボウル：打ちっぱなしのコンクリート、縁は鉄のコーピング
    { const BX = 0, BZ = 2.6, prof: THREE.Vector2[] = [new THREE.Vector2(0, 0.1), new THREE.Vector2(2.2, 0.1)];
      for (let i = 1; i <= 14; i++) { const a = (i / 14) * Math.PI / 2; prof.push(new THREE.Vector2(2.2 + 1.1 * Math.sin(a), 1.2 - 1.1 * Math.cos(a))); }
      prof.push(new THREE.Vector2(3.3, 1.4), new THREE.Vector2(3.75, 1.4), new THREE.Vector2(3.75, 0));
      // ボウルの面：底は少し暗く、曲面は上へ明るく、縁と外壁は明るいコンクリート。タイヤの跡を少し
      const bT = canvasTex(512, 512, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8f8b84'); gr.addColorStop(0.08, '#96928a'); gr.addColorStop(0.5, '#aaa69e'); gr.addColorStop(0.82, '#c4c0b8'); gr.addColorStop(0.86, '#d2cec6'); gr.addColorStop(0.9, '#c9c5bd'); gr.addColorStop(1, '#bdb9b1');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,38,34'},${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
        for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(30,28,26,${0.05 + Math.random() * 0.08})`; g.lineWidth = 2 + Math.random() * 3; g.beginPath(); const x = Math.random() * w, y = h * (0.1 + Math.random() * 0.6); g.moveTo(x, y); g.quadraticCurveTo(x + (Math.random() - 0.5) * 120, y + 60, x + (Math.random() - 0.5) * 200, y + 120 + Math.random() * 80); g.stroke(); }
      });
      bT.wrapS = THREE.RepeatWrapping; bT.repeat.set(6, 1);
      const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, mobile ? 48 : 96), new THREE.MeshStandardMaterial({ map: bT, roughness: 0.75, side: THREE.DoubleSide })); bowl.position.set(BX, 0, BZ); bowl.receiveShadow = !mobile; bowl.castShadow = !mobile; scene.add(bowl);
      const cop = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.042, 10, mobile ? 64 : 128), chrome); cop.rotation.x = Math.PI / 2; cop.position.set(BX, 1.42, BZ); scene.add(cop);
      softShadow(BX, BZ, 9.5, 9.5, 0.35); }
    // らせん階段（吹き抜けの右奥の角から中二階へ）
    { const SX = 3.7, SZ = -3.7, n = 18, a0 = Math.PI * 0.62, da = (Math.PI * 2.02) / n;
      rod(V(SX, 0, SZ), V(SX, MZ + 1.1, SZ), 0.075, steel);
      const rail: THREE.Vector3[] = [];
      for (let i = 0; i < n; i++) { const a = a0 + i * da, y = ((i + 1) / n) * MZ; const t = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.045, 0.34), steel); t.position.set(SX + Math.cos(a) * 0.55, y, SZ - Math.sin(a) * 0.55); t.rotation.y = a; scene.add(t); rail.push(V(SX + Math.cos(a) * 1.03, y + 0.92, SZ - Math.sin(a) * 1.03)); if (i % 2 === 0) rod(V(SX + Math.cos(a) * 1.03, y, SZ - Math.sin(a) * 1.03), V(SX + Math.cos(a) * 1.03, y + 0.92, SZ - Math.sin(a) * 1.03), 0.01, steel); }
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 120, 0.022, 8), steel)); }
    // 壁画（吹き抜けの右の壁の上）：オリジナルの抽象画
    { const t = canvasTex(2048, 768, (g, w, h) => {
        g.fillStyle = '#efebe2'; g.fillRect(0, 0, w, h);
        let sd = 5; const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
        g.fillStyle = '#1f3a8a'; g.beginPath(); g.arc(w * 0.72, h * 0.42, h * 0.3, 0, 7); g.fill();
        g.fillStyle = '#c9a75c'; g.fillRect(w * 0.08, h * 0.58, w * 0.3, h * 0.08);
        g.strokeStyle = '#111'; g.lineCap = 'round';
        for (let i = 0; i < 7; i++) { g.lineWidth = 20 + r() * 50; g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.bezierCurveTo(x + (r() - 0.5) * 900, y + (r() - 0.5) * 500, x + (r() - 0.5) * 900, y + (r() - 0.5) * 500, x + (r() - 0.5) * 1200, y + (r() - 0.5) * 300); g.stroke(); }
        for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(17,17,17,.85)'; const x = r() * w, y = h * (0.2 + r() * 0.5); g.fillRect(x, y, 4 + r() * 6, 40 + r() * 160); }
        g.fillStyle = '#111'; g.font = `400 ${h * 0.05}px "Times New Roman", Georgia, serif`; (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${h * 0.02}px`; g.fillText('GALLERY CRYPTO — TOKYO', w * 0.05, h * 0.92);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 4.6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 })); m.position.set(4.89, 7.3, 2.0); m.rotation.y = -Math.PI / 2; scene.add(m); }
    // スケートデッキの壁（吹き抜けの左の壁の上）：オリジナルの柄を一列に
    { const n = mobile ? 10 : 14;
      for (let i = 0; i < n; i++) {
        const t = canvasTex(128, 512, (g, w, h) => {
          const pal = [['#141414', '#efebe2'], ['#efebe2', '#141414'], ['#1f3a8a', '#efebe2'], ['#c9a75c', '#141414'], ['#2f4a35', '#efebe2'], ['#6b1d22', '#efebe2']][i % 6];
          g.fillStyle = pal[0]; g.fillRect(0, 0, w, h); g.fillStyle = pal[1];
          const k = i % 5;
          if (k === 0) for (let y = 0; y < h; y += 48) g.fillRect(0, y, w, 18);
          else if (k === 1) for (let j = 0; j < 30; j++) { g.beginPath(); g.arc((j * 37) % w, (j * 71) % h, 6 + (j % 4) * 4, 0, 7); g.fill(); }
          else if (k === 2) { g.beginPath(); g.arc(w / 2, h / 2, w * 0.36, 0, 7); g.fill(); }
          else if (k === 3) { g.font = `700 ${w * 0.5}px "Times New Roman", serif`; g.textAlign = 'center'; g.save(); g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); g.fillText('GC', 0, w * 0.18); g.restore(); }
          else for (let y = -w; y < h; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w); g.lineTo(w, y + w + 16); g.lineTo(0, y + 16); g.fill(); }
        });
        const dk = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.82), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
        dk.position.set(-4.88, 5.9, -3.6 + (i * 11.8) / (n - 1)); dk.rotation.y = Math.PI / 2; scene.add(dk);
      } }

    // ---- 光 ----
    scene.add(new THREE.HemisphereLight(0xf3f7ff, 0xc4ccd8, 1.3));
    const sun = new THREE.DirectionalLight(0xf2f6ff, 1.2); sun.position.set(-5, 16, 7); sun.target.position.set(0, 0, -1); scene.add(sun, sun.target);
    if (!mobile) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -W - 1, right: W + 1, top: D + 1, bottom: -D - 1, near: 1, far: 40 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 5; sun.shadow.camera.updateProjectionMatrix(); }
    const fill = new THREE.DirectionalLight(0xe6eeff, 0.45); fill.position.set(5, 4, -6); scene.add(fill);

    // ---- 商品を置く ----
    const hits: THREE.Object3D[] = [];
    const spots = new Map<string, { look: THREE.Vector3; pos: THREE.Vector3; room: number }>();
    const stops: { pos: THREE.Vector3; look: THREE.Vector3 }[] = [];
    const spinners: THREE.Object3D[] = [];
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
    // 壁のフェイスアウト：点数が多いと三段（高い位置まで一列に並べる）。いちばん上の棚には、たたんだ在庫
    const faceWall = (g0: THREE.Group, ps: SPiece[], span: number, ri: number, face: THREE.Vector3) => {
      const n = ps.length; if (!n) return;
      const ys = n > 12 ? [3.5, 2.38, 1.26] : [2.75, 1.55], per = Math.ceil(n / ys.length), shelf = ys[0] + 0.85;
      ys.forEach((y, r) => { if (r * per >= n) return; rod(V(-span / 2, y, 0.42), V(span / 2, y, 0.42), 0.016, chrome, g0); for (const ex of [-span / 2, span / 2]) rod(V(ex, y, 0.02), V(ex, y, 0.42), 0.012, chrome, g0); });
      { // 壁から生えるような、白い曲線の棚
        const sh = new THREE.Shape(), N = 24; sh.moveTo(-span / 2, 0);
        for (let i = 0; i <= N; i++) { const x = -span / 2 + (i / N) * span, q = (2 * x) / span; sh.lineTo(x, 0.46 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(q), 6)), 0.5)); }
        sh.lineTo(span / 2, 0); sh.lineTo(-span / 2, 0);
        const sg = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 4 }), white);
        sg.rotation.x = Math.PI / 2; sg.position.set(0, shelf + 0.03, 0); sg.castShadow = !mobile; g0.add(sg);
      }
      for (let x = -span / 2 + 0.4; x < span / 2 - 0.3; x += 0.55) box(0.36, 0.12, 0.3, new THREE.MeshStandardMaterial({ color: [0x1a1a1c, 0xe5e0d3, 0x4b5236, 0x1d2740][Math.floor(x * 7 + 40) % 4], roughness: 0.95 }), x, shelf + 0.075, 0.2, g0);
      ps.forEach((p, k) => {
        const r = Math.floor(k / per), kk = k - r * per, cnt = Math.min(per, n - r * per);
        const x = cnt === 1 ? 0 : -span / 2 + 0.6 + (kk * (span - 1.2)) / (cnt - 1);
        const arm = new THREE.Group(); arm.position.set(x, ys[r], 0.42); g0.add(arm);
        garment(arm, p, 0.78, ri, face, 2.6);
      });
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

    // ぶつかるもの（床の上の円 c:[x,z,半径] と箱 b:[x0,x1,z0,z1]）。歩くときに使う
    const obs: { c?: [number, number, number]; b?: [number, number, number, number]; hall?: boolean }[] = [];
    let wantHall = false;
    const zoneOf: Zone[] = [];
    rooms.forEach((room, ri) => {
      const ps = room.pieces, n = ps.length;
      switch (room.dp) {
        case 'forms': { // 入口ホール：下から光る白い台の上に、回転台とトルソー（吹き抜けを背に）
          zoneOf[ri] = 'hub';
          { const pl = new THREE.Mesh(new RoundedBoxGeometry(9.6, 0.3, 3.0, 4, 0.12), white); pl.position.set(0, 0.17, 10.2); pl.receiveShadow = !mobile; scene.add(pl);
            const gw = new THREE.Mesh(new RoundedBoxGeometry(9.66, 0.06, 3.06, 4, 0.03), new THREE.MeshBasicMaterial({ color: 0xeef4ff, toneMapped: false })); gw.position.set(0, 0.03, 10.2); scene.add(gw);
            obs.push({ b: [-4.8, 4.8, 8.7, 11.7] }); }
          const sp = mobile ? 1.5 : 2.6, xs = n === 1 ? [0] : ps.map((_, k) => -sp + (2 * sp * k) / Math.max(1, n - 1));
          ps.forEach((p, k) => {
            const x = xs[k], z = 10.2 - Math.abs(x) * 0.25;
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.16, 48), new THREE.MeshStandardMaterial({ color: 0xf6f7f9, roughness: 0.18 })); base.position.set(x, 0.4, z); base.castShadow = base.receiveShadow = !mobile; scene.add(base);
            const turn = new THREE.Group(); turn.position.set(x, 0.48, z); scene.add(turn); spinners.push(turn);
            rod(V(0, 0, 0), V(0, 1.3, 0), 0.02, chrome, turn);
            rod(V(-0.18, 1.5, 0), V(0.18, 1.5, 0), 0.015, chrome, turn);
            const g = garment(turn, p, 0.82, ri, V(0, 0, 1), 2.4, false); g.position.y = 1.52;
            spots.get(p.id)!.look.set(x, 1.3, z); spots.get(p.id)!.pos.set(x, 1.6, z + 2.4);
          });
          stops[ri] = mobile ? { pos: V(0, 2.2, 13.9), look: V(0, 1.6, 8.0) } : { pos: V(0, 1.85, 13.6), look: V(0, 1.6, 8.6) };
          break;
        }
        case 'wall': { // L1 トップス：左の壁に高く（点数が多いと三段）
          zoneOf[ri] = 'L1';
          const per = Math.ceil(n / (n > 12 ? 3 : 2));
          faceWall(grp(-W, 4.9, Math.PI / 2), ps, Math.min(8.4, Math.max(3, per * 0.95 + 1.0)), ri, V(1, 0, 0));
          stops[ri] = mobile ? { pos: V(-4.6, 1.95, 4.9), look: V(-W, 1.95, 4.9) } : { pos: V(-4.4, 2.0, 4.9), look: V(-W, 2.2, 4.9) };
          break;
        }
        case 'outer': { // L2 アウター：左の壁に一列、少し高く。手前にローライダー（クロスDP）
          zoneOf[ri] = 'L2';
          railWall(grp(-W, -3.0, Math.PI / 2), ps, Math.min(5.6, Math.max(3, n * 0.8 + 0.8)), ri, V(1, 0, 0), 0.92, 2.75);
          // 車の後ろ寄りから斜めに見て、車越しにアウターが見えるように
          stops[ri] = mobile ? { pos: V(-4.0, 3.2, -9.4), look: V(-W, 1.9, -2.6) } : { pos: V(-3.8, 3.1, -8.8), look: V(-W, 1.9, -2.6) };
          break;
        }
        case 'rack': { // L3 パンツ：二台のラックを L 字に（左の壁の開口から展示ホールへ抜けられる）
          zoneOf[ri] = 'L3';
          const a = ps.slice(0, Math.ceil(n * 0.58)), b = ps.slice(a.length);
          rackFree(grp(-6.2, -10.1, -Math.PI / 2), a, 6.4, ri, V(-1, 0, 0)); obs.push({ b: [-6.6, -5.8, -13.3, -6.9] });
          if (b.length) { rackFree(grp(-9.3, -12.9, 0), b, 4.6, ri, V(0, 0, 1)); obs.push({ b: [-11.6, -7.0, -13.25, -12.55] }); }
          stops[ri] = mobile ? { pos: V(-10.4, 2.0, -6.9), look: V(-7.4, 1.0, -12.2) } : { pos: V(-10.6, 1.8, -7.0), look: V(-7.6, 1.05, -11.8) };
          break;
        }
        case 'back': { // 奥の部屋：ヴィンテージ・ツアーマーチの長いレール（上は中二階）
          zoneOf[ri] = 'back';
          railWall(grp(0, -D, 0), ps, Math.min(9.2, Math.max(4, n * 1.0 + 0.8)), ri, V(0, 0, 1), 0.82);
          stops[ri] = mobile ? { pos: V(0, 1.7, -7.4), look: V(0, 1.7, -D) } : { pos: V(0, 1.7, -8.6), look: V(0, 1.7, -D) };
          break;
        }
        case 'table': { // R3 Tシャツ：クロームの X 脚・石の天板の長いテーブルにたたんで（奥の部屋から入る）
          zoneOf[ri] = 'R3';
          const g0 = grp(9.0, -9.4, -Math.PI / 2), cols = Math.ceil(n / 2), L = Math.max(3, Math.min(6.4, cols * 0.7 + 0.6));
          // クロームの X 脚のテーブル。天板は艶のある濃い灰色の石
          box(L, 0.05, 1.3, topM, 0, 0.88, 0, g0);
          for (const sx of [-1, 1]) { const ex = sx * (L / 2 - 0.25); rod(V(ex, 0, -0.58), V(ex, 0.86, 0.46), 0.022, chrome, g0); rod(V(ex, 0, 0.58), V(ex, 0.86, -0.46), 0.022, chrome, g0); rod(V(ex, 0.02, -0.6), V(ex, 0.02, 0.6), 0.02, chrome, g0); }
          rod(V(-L / 2 + 0.25, 0.43, 0), V(L / 2 - 0.25, 0.43, 0), 0.018, chrome, g0);
          softShadow(9.0, -9.4, 2.6, L + 1.2, 0.4); obs.push({ b: [8.35, 9.65, -9.4 - L / 2, -9.4 + L / 2] });
          box(0.7, 0.18, 0.5, white, -L / 2 + 0.6, 0.995, -0.25, g0); box(0.7, 0.18, 0.5, white, L / 2 - 0.6, 0.995, -0.25, g0);
          ps.forEach((p, k) => {
            const col = k % cols, row = Math.floor(k / cols);
            const x = -L / 2 + 0.45 + (col * (L - 0.9)) / Math.max(1, cols - 1), z = row ? 0.32 : -0.28;
            const onRiser = (col === 0 || col === cols - 1) && row === 0;
            const st = new THREE.Group(); st.position.set(x, onRiser ? 1.085 : 0.905, z); g0.add(st);
            loadTex(p.tex).then((t) => {
              if (!t || !alive) return;
              const top = t.clone(); top.repeat.set(0.42, 0.36); top.offset.set(0.29, 0.38); top.needsUpdate = true;
              const side = t.clone(); side.repeat.set(0.02, 0.02); side.offset.set(0.4, 0.14); side.needsUpdate = true;
              const sm = new THREE.MeshStandardMaterial({ map: side, roughness: 0.95 }), tm = new THREE.MeshStandardMaterial({ map: top, roughness: 0.9 });
              const cntS = 3 + (k % 3);
              for (let i = 0; i < cntS; i++) {
                const f = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.055, 0.4), i === cntS - 1 ? [sm, sm, tm, sm, sm, sm] : sm);
                f.position.set((Math.random() - 0.5) * 0.015, 0.03 + i * 0.056, (Math.random() - 0.5) * 0.015); f.rotation.y = (Math.random() - 0.5) * 0.05; f.castShadow = f.receiveShadow = !mobile; f.userData.id = p.id; st.add(f); hits.push(f);
              }
            });
            const look = wpos(st).setY(st.position.y + 0.15);
            spots.set(p.id, { look, pos: look.clone().add(V(-1.05, 0.95, 0)), room: ri });
          });
          stops[ri] = mobile ? { pos: V(6.6, 3.0, -4.8), look: V(9.0, 0.85, -9.4) } : { pos: V(6.4, 2.6, -5.0), look: V(9.0, 0.85, -9.6) };
          break;
        }
        case 'case': { // R2 小物：長いガラスのショーケース（2段）
          zoneOf[ri] = 'R2';
          const per = Math.ceil(n / 2), L = Math.max(1.9, per * 0.42 + 0.3), g0 = grp(9.4, 0, -Math.PI / 2);
          // 角の丸いガラスのケース。台の下は光る。後ろの壁には紺のパネル
          { const b0 = new THREE.Mesh(new RoundedBoxGeometry(L, 0.86, 0.8, 4, 0.16), white); b0.position.set(0, 0.47, 0); g0.add(b0);
            const gb = new THREE.Mesh(new RoundedBoxGeometry(L - 0.06, 0.05, 0.74, 3, 0.02), new THREE.MeshBasicMaterial({ color: 0xeef4ff, toneMapped: false })); gb.position.set(0, 0.03, 0); g0.add(gb); }
          softShadow(9.4, 0, 1.8, L + 0.9, 0.45); obs.push({ b: [9.0, 9.8, -L / 2, L / 2] });
          const gl = new THREE.Mesh(new RoundedBoxGeometry(L - 0.04, 0.75, 0.76, 5, 0.2), glass); gl.position.set(0, 1.28, 0); g0.add(gl);
          for (let i = 0; i < 5; i++) box(0.06, 2.9, 1.08, navyM, W - 0.1, 2.0, -2.24 + i * 1.12);
          box(L - 0.1, 0.012, 0.7, glass, 0, 1.18, 0, g0);
          ps.forEach((p, k) => {
            const tier = k < per ? 0 : 1, kk = tier ? k - per : k, cnt = tier ? n - per : per;
            const x = cnt === 1 ? 0 : -L / 2 + 0.25 + (kk * (L - 0.5)) / (cnt - 1);
            const h0 = new THREE.Group(); h0.position.set(x, tier ? 1.19 : 0.905, 0); g0.add(h0);
            flatPiece(h0, p, 0.28, ri, V(-1, 0, 0), 1.2, 0.9);
          });
          stops[ri] = mobile ? { pos: V(6.0, 2.2, 0), look: V(9.4, 0.95, 0) } : { pos: V(6.6, 1.9, 0), look: V(9.4, 0.95, 0) };
          break;
        }
        case 'caps': { // R1 帽子：右の壁に白い小さな棚を格子に
          zoneOf[ri] = 'R1';
          // 光る箱の格子：一つの箱に一点ずつ。空いた箱も光らせて、壁一面のグリッドに
          const g0 = grp(W, 6, -Math.PI / 2), cols = Math.min(7, Math.max(4, Math.ceil(n / 3))), rows = Math.max(3, Math.ceil(n / cols)), S = 0.62, P = 0.72;
          const glowM = new THREE.MeshBasicMaterial({ color: 0xfff3e2, toneMapped: false });
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const x = (c - (cols - 1) / 2) * P, y = 3.1 - r * P;
            const bk = new THREE.Mesh(new THREE.PlaneGeometry(S, S), glowM); bk.position.set(x, y, 0.012); g0.add(bk);
            box(S + 0.04, 0.03, 0.34, white, x, y - S / 2, 0.17, g0); box(S + 0.04, 0.03, 0.34, white, x, y + S / 2, 0.17, g0);
            box(0.03, S, 0.34, white, x - S / 2, y, 0.17, g0); box(0.03, S, 0.34, white, x + S / 2, y, 0.17, g0);
            const k = r * cols + c; if (k >= n) continue;
            const holder = new THREE.Group(); holder.position.set(x, y - S / 2 + 0.02, 0.18); g0.add(holder);
            flatPiece(holder, ps[k], 0.42, ri, V(-1, 0, 0), 1.6, 0.15);
          }
          stops[ri] = mobile ? { pos: V(6.0, 1.8, 6), look: V(W, 2.0, 6) } : { pos: V(7.6, 1.75, 6), look: V(W, 2.0, 6) };
          break;
        }
        case 'art': { // 中二階：奥の高い壁に額装
          zoneOf[ri] = 'mezz';
          const g0 = grp(0, -D, 0, MZ);
          ps.forEach((p, k) => {
            const x = (k - (n - 1) / 2) * 1.6;
            box(1.1, 1.1, 0.05, black, x, 1.75, 0.03, g0);
            const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), new THREE.MeshStandardMaterial({ roughness: 0.8 })); pic.position.set(x, 1.75, 0.062); pic.userData.id = p.id; g0.add(pic); hits.push(pic);
            loadTex(p.tex).then((t) => { if (t && alive) { (pic.material as THREE.MeshStandardMaterial).map = t; (pic.material as THREE.MeshStandardMaterial).needsUpdate = true; } });
            const look = wpos(pic);
            spots.set(p.id, { look, pos: look.clone().add(V(0, -0.1, 2.2)), room: ri });
          });
          stops[ri] = mobile ? { pos: V(0, MZ + 1.7, -8.2), look: V(0, MZ + 1.7, -D) } : { pos: V(0, MZ + 1.7, -9.4), look: V(0, MZ + 1.7, -D) };
          break;
        }
        case 'atrium': { // 吹き抜け：中二階の手すりから見下ろす（ボウル・吊るした大きな服・壁画）
          zoneOf[ri] = 'mezz';
          stops[ri] = mobile ? { pos: V(0, MZ + 2.0, -6.4), look: V(0, 3.6, 5.5) } : { pos: V(0, MZ + 1.85, -5.9), look: V(0, 3.9, 5.5) };
          break;
        }
        case 'car': case 'bike': case 'yacht': { // 車は左の棟のアウターの前、自転車は入口。ヨットは展示ホール（L3 の左の壁の開口の先）
          zoneOf[ri] = room.dp === 'yacht' ? 'hall' : 'hub';
          stops[ri] = exhibitStop(room.dp as ExhibitKind, mobile); wantHall = true;
          break;
        }
      }
    });
    let hallTick: ((now: number) => void) | null = null;
    // 車と自転車は最初の画面が出てから。ホールの建物とヨットは、スマホではホールへ向かうときに初めて作る（軽くするため）
    const ticks: ((now: number) => void)[] = [];
    let hallBuilt = false;
    const makeHall = () => { if (hallBuilt || !alive) return; hallBuilt = true; try { ticks.push(buildHall(scene, mobile, shadowT, 'hall').tick); } catch (e) { report('hall: ' + String(e)); } };
    if (wantHall) setTimeout(() => { if (!alive) return; try { ticks.push(buildHall(scene, mobile, shadowT, 'objects').tick); } catch (e) { report('objects: ' + String(e)); } if (!mobile) makeHall(); }, 700);
    hallTick = (now) => { for (const f of ticks) f(now); };

    // 吹き抜けに吊るす大きな服（入口のトルソーの一着を、高さ 4.4m に）。最後に作る
    const giant = new THREE.Group(); giant.position.set(0, 0, 2.6); scene.add(giant);
    { const hero = rooms.find((r) => r.dp === 'forms')?.pieces[0] || rooms.find((r) => r.dp === 'wall')?.pieces[0];
      if (hero) queue.unshift(async () => { // いちばん先に作る
        if (!alive) return; const F = await layerOf(hero.tex); if (!F || !alive || !bboxOf(F)) return;
        const B = hero.back ? await layerOf(hero.back) : null;
        const r = buildGarment(F, B, 4.4, 0.42, mobile ? 512 : 1024); if (!r || !alive) return;
        const bx = new THREE.Box3().setFromObject(r.group), c = bx.getCenter(new THREE.Vector3());
        r.group.position.set(-c.x, 9.2 - bx.max.y, -c.z);
        r.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.userData.id = hero.id; m.castShadow = !mobile; hits.push(m); } });
        giant.add(r.group);
        const hw = (bx.max.x - bx.min.x) * 0.3; for (const s of [-1, 1]) rod(V(s * hw, 9.15, 0), V(s * hw, AH, 0), 0.006, steel, giant);
      }); }

    // 立体化を順番に（画面を止めないよう、1着ずつ間をあけて）
    (async () => { await new Promise((r) => setTimeout(r, 400)); for (const job of queue) { if (!alive) return; await job(); await new Promise((r) => setTimeout(r, 30)); } })();

    // ---- カメラ：売り場から売り場へ移動。ドラッグで見回し、ホイール／ピンチで寄る ----
    let room = 0, focus: string | null = null;
    const cur = { pos: stops[0]?.pos.clone() || V(0, 1.6, 9), look: stops[0]?.look.clone() || V(0, 1.2, 0) };
    const goal = { pos: cur.pos.clone(), look: cur.look.clone() };
    let yaw = 0, pitch = 0, zoom = 1, moving = false;
    let walking = false; // 歩いているあいだは、下の「歩く」の処理がカメラを動かす
    const emit = (ready = true) => cb.current.onState({ room, focus, moving, ready, walking });
    // 売り場から売り場へ：壁を抜けないよう、部屋の開口（と吹き抜け）を通って移動する
    type WP = { pos: THREE.Vector3; look: THREE.Vector3; zone: Zone };
    let via: WP[] = [], zoneNow: Zone = zoneOf[0] || 'hub', goalZone: Zone = zoneNow;
    const chain = (z: Zone) => { const c: Zone[] = [z]; while (ZP[c[c.length - 1]].parent) c.push(ZP[c[c.length - 1]].parent!); return c; };
    const route = (pos: THREE.Vector3, look: THREE.Vector3, to: Zone) => {
      if (to === 'hall' || to === 'L3') makeHall();
      const a = chain(zoneNow), b = chain(to), lca = a.find((z) => b.includes(z))!;
      const pts: { p: THREE.Vector3; zone: Zone }[] = [];
      for (const z of a) { if (z === lca) break; pts.push({ p: ZP[z].inn, zone: z }, { p: ZP[z].out, zone: ZP[z].parent! }); }
      for (const z of b.slice(0, b.indexOf(lca)).reverse()) pts.push({ p: ZP[z].out, zone: ZP[z].parent! }, { p: ZP[z].inn, zone: z });
      const wps: WP[] = pts.map((q, i) => {
        const nx = i + 1 < pts.length ? pts[i + 1].p : pos, d = nx.clone().sub(q.p).setY(0);
        const lk = d.lengthSq() > 0.04 ? q.p.clone().add(d.normalize().multiplyScalar(4)).setY(q.p.y - 0.1) : look.clone();
        return { pos: q.p.clone(), look: lk, zone: q.zone };
      });
      wps.push({ pos: pos.clone(), look: look.clone(), zone: to });
      const f = wps.shift()!; goal.pos.copy(f.pos); goal.look.copy(f.look); goalZone = f.zone; via = wps;
    };
    const goRoom = (i: number) => { if (!stops[i]) return; stopWalkRef(); room = i; focus = null; route(stops[i].pos, stops[i].look, zoneOf[i] || 'hub'); yaw = pitch = 0; zoom = 1; moving = true; emit(); };
    const doFocus = (id: string | null) => {
      if (!id) { focus = null; goRoom(room); return; }
      const s = spots.get(id); if (!s) return; stopWalkRef();
      room = s.room; focus = id; route(s.pos, s.look, zoneOf[s.room] || 'hub'); yaw = pitch = 0; zoom = 1; moving = true; emit();
    };
    let stopWalkFn: () => void = () => undefined; function stopWalkRef() { stopWalkFn(); }
    apiRef.current = { goRoom, focus: doFocus };

    // ---- 歩く（ゲームのように自由に）：キーボード（WASD・矢印、Shift で走る）か、スマホは画面のスティック。ドラッグで見回す ----
    // 壁・柱・ボウル・台にはぶつかる。らせん階段に入ると中二階へ上がり、中二階の階段口から下りる
    const STX = 3.7, STZ = -3.7, A0 = Math.PI * 0.62, ATOP = A0 + (17 * Math.PI * 2.02) / 18, EYE = 1.65, R0 = 0.32;
    obs.push({ c: [0, 2.6, 3.8] }, { c: [STX, STZ, 1.0] });
    for (const sx of [-5, 5]) for (const z of [8.6, 2.7, -5, -12]) obs.push({ c: [sx, z, 0.3] });
    { const ry = 1.27, ux = Math.cos(ry), uz = -Math.sin(ry); for (const o of [-2.3, 0, 2.3]) obs.push({ c: [-8.6 + ux * o, -2.6 + uz * o, 1.7] }); } // 車の台
    obs.push({ c: [6.6, 11.4, 1.3] }, { c: [-5.6, -6.0, 0.25] }, { c: [8.4, 12.9, 0.25] }); // 自転車の台と札
    { const ry = -1.74, ux = Math.cos(ry), uz = -Math.sin(ry), cx = -26.4, cz = -12.1; for (const o of [-4, -2, 0, 2, 4]) obs.push({ c: [cx + ux * o, cz + uz * o, 1.85], hall: true }); obs.push({ c: [-22.4, -15.9, 0.25], hall: true }); } // ヨットの船台
    const inR = (x: number, z: number, x0: number, x1: number, z0: number, z1: number) => x > x0 && x < x1 && z > z0 && z < z1;
    let level = 0, hd = 0, pt = 0, stairArm = true;
    let climb: { t: number; dur: number; up: boolean; from: THREE.Vector3; hd0: number } | null = null;
    const me = V(0, 0, 12), keys = new Set<string>(), stick = { x: 0, y: 0 };
    const free = (x: number, z: number) => {
      if (level === 1) return inR(x, z, -4.7, 4.7, -13.6, -5.35);
      const ok = inR(x, z, -W + 0.75, W - 0.75, -D + 0.75, D - 0.45)
        || (hallBuilt && inR(x, z, -31.7, -12.6, -22, -3))
        || inR(x, z, -13.0, -11.0, DOOR_WZ - DOOR_W / 2 + 0.35, DOOR_WZ + DOOR_W / 2 - 0.35);
      if (!ok) return false;
      for (const o of obs) {
        if (o.c && Math.hypot(x - o.c[0], z - o.c[1]) < o.c[2] + R0) return false;
        if (o.b && x > o.b[0] - R0 && x < o.b[1] + R0 && z > o.b[2] - R0 && z < o.b[3] + R0) return false;
      }
      return true;
    };
    const zoneAt = (p: THREE.Vector3): Zone => {
      if (p.y > MZ + 0.5 && inR(p.x, p.z, -5.2, 5.2, -14, -4.8)) return 'mezz';
      if (p.x < -W) return 'hall';
      if (p.x < -5) return p.z >= 1 ? 'L1' : p.z >= -6 ? 'L2' : 'L3';
      if (p.x > 5) return p.z >= 3 ? 'R1' : p.z >= -3 ? 'R2' : 'R3';
      return p.z < -5 ? 'back' : 'hub';
    };
    const startWalk = () => {
      if (walking) return;
      const p = camera.position, d = camera.getWorldDirection(new THREE.Vector3());
      level = p.y > MZ + 0.6 && inR(p.x, p.z, -5, 5, -14, -5) ? 1 : 0;
      me.set(p.x, 0, p.z); hd = Math.atan2(-d.x, -d.z); pt = Math.max(-0.5, Math.min(0.5, Math.asin(Math.max(-1, Math.min(1, d.y)))));
      if (!free(me.x, me.z)) { let done = false; for (let r = 0.3; r < 8 && !done; r += 0.3) for (let a = 0; a < 16 && !done; a++) { const x = me.x + Math.cos((a / 16) * Math.PI * 2) * r, z = me.z + Math.sin((a / 16) * Math.PI * 2) * r; if (free(x, z)) { me.x = x; me.z = z; done = true; } } }
      walking = true; focus = null; via = []; moving = false; yaw = pitch = 0; zoom = 1; emit();
    };
    const stopWalk = () => {
      if (!walking) return; walking = false; climb = null; keys.clear(); stick.x = stick.y = 0;
      const d = camera.getWorldDirection(new THREE.Vector3());
      cur.pos.copy(camera.position); cur.look.copy(camera.position).addScaledVector(d, 3); goal.pos.copy(cur.pos); goal.look.copy(cur.look);
      zoneNow = goalZone = zoneAt(cur.pos);
    };
    const stairPos = (a: number, r: number, y: number) => V(STX + Math.cos(a) * r, y, STZ - Math.sin(a) * r);
    const stepWalk = (dt: number) => {
      if (climb) { // らせん階段：ぐるりと回りながら上る／下りる
        climb.t = Math.min(1, climb.t + dt / climb.dur);
        const u = climb.t, e = u * u * (3 - 2 * u), s = climb.up ? e : 1 - e;
        const a = A0 + s * (ATOP - A0), p = stairPos(a, 0.55, s * MZ);
        const lead = Math.min(1, u / 0.15);
        const at = climb.up ? climb.from.clone().lerp(p, lead) : p;
        if (!climb.up && u > 0.85) at.lerp(V(STX - 0.6, 0, STZ - 1.6), (u - 0.85) / 0.15);
        me.set(at.x, at.y, at.z);
        hd = a + (climb.up ? 0 : Math.PI); pt = 0; // 進む向き（らせんの接線）を向く
        if (u >= 1) {
          if (climb.up) { level = 1; me.set(3.6, 0, -5.9); hd = Math.PI; } else { level = 0; me.set(STX - 0.6, 0, STZ - 1.6); hd = Math.PI; }
          climb = null; stairArm = false;
        }
        return;
      }
      let f = 0, s = 0, turn = 0;
      if (keys.has('w') || keys.has('arrowup')) f += 1; if (keys.has('s') || keys.has('arrowdown')) f -= 1;
      if (keys.has('a')) s -= 1; if (keys.has('d')) s += 1;
      if (keys.has('arrowleft') || keys.has('q')) turn += 1; if (keys.has('arrowright') || keys.has('e')) turn -= 1;
      f -= stick.y; s += stick.x;
      hd += turn * 1.9 * dt;
      const sp = keys.has('shift') ? 4.4 : 2.3;
      const fx = -Math.sin(hd), fz = -Math.cos(hd), rx = Math.cos(hd), rz = -Math.sin(hd);
      let mx = fx * f + rx * s, mz = fz * f + rz * s; const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
      const nx = me.x + mx * sp * dt, nz = me.z + mz * sp * dt;
      if (free(nx, nz)) { me.x = nx; me.z = nz; } else if (free(nx, me.z)) me.x = nx; else if (free(me.x, nz)) me.z = nz;
      if (me.x < -9) makeHall();
      // 階段
      const ds = Math.hypot(me.x - STX, me.z - STZ);
      if (level === 0) { if (ds > 1.75) stairArm = true; if (stairArm && ds < 1.0 + R0 + 0.12 && m > 0.1) climb = { t: 0, dur: 3.2, up: true, from: me.clone(), hd0: hd }; }
      else { if (me.z < -6.6 || me.x < 2.6) stairArm = true; if (stairArm && me.x > 2.9 && me.z > -5.75 && m > 0.1) climb = { t: 0, dur: 3.2, up: false, from: me.clone(), hd0: hd }; }
    };
    const camWalk = () => {
      const y = (climb ? me.y : level ? MZ : 0) + EYE;
      camera.position.set(me.x, y, me.z);
      camera.lookAt(me.x - Math.sin(hd) * Math.cos(pt), y + Math.sin(pt), me.z - Math.cos(hd) * Math.cos(pt));
    };

    stopWalkFn = stopWalk;
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
      if (reduce) { while (via.length) { const n = via.shift()!; goal.pos.copy(n.pos); goal.look.copy(n.look); goalZone = n.zone; } cur.pos.copy(goal.pos); cur.look.copy(goal.look); }
      if (via.length && cur.pos.distanceTo(goal.pos) < 0.7) { zoneNow = goalZone; const n = via.shift()!; goal.pos.copy(n.pos); goal.look.copy(n.look); goalZone = n.zone; }
      cur.pos.lerp(goal.pos, k); cur.look.lerp(goal.look, k);
      if (!via.length && cur.pos.distanceTo(goal.pos) < 0.7) zoneNow = goalZone;
      if (moving && !via.length && cur.pos.distanceTo(goal.pos) < 0.02) { moving = false; emit(); }
      // 見回し：注視点を、立ち位置を中心に回す。寄る：注視点へ近づく
      dir.copy(cur.look).sub(cur.pos); const dist = dir.length(); dir.normalize();
      dir.applyAxisAngle(V(0, 1, 0), yaw); const side = V(0, 1, 0).cross(dir).normalize(); dir.applyAxisAngle(side, -pitch);
      tmp.copy(cur.pos).addScaledVector(dir, dist * (1 - zoom));
      camera.position.copy(tmp); camera.lookAt(tmp.clone().addScaledVector(dir, Math.max(0.5, dist * zoom)));
      }
      if (!reduce) { spinners.forEach((s, i) => { s.rotation.y = Math.sin(t * 0.35 + i * 1.3) * 0.9; }); swayers.forEach((s) => { s.o.rotation.z = Math.sin(t * 1.1 + s.ph) * 0.02; s.o.rotation.y = Math.sin(t * 0.6 + s.ph) * 0.08; }); hallTick?.(now); giant.rotation.y = Math.sin(t * 0.12) * 0.5; }
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
