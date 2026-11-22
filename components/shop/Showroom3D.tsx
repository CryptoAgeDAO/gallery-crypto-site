'use client';
// ショールーム（シンプル版）：白い壁・明るいコンクリートの床の、ギャラリーのような一部屋。
// 売り場ごとに陳列（DP）を変えて、商品を立体（3D）で見せる。
//   入口：トルソー（回転台）  左の壁：二段のフェイスアウト  中央：たたみのテーブル  右奥：パンツのラック
//   奥の壁：ヴィンテージ・ツアーのレール  右の壁：帽子の棚  右手前：小物のガラスケース  アート：額装
// 服は写真（見本は絵）から、スマートスキャンと同じしくみで立体にする。押すと近づいて詳細が出る。
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildPillow as buildGarment } from '../pillow3d';
import { layerOf, bboxOf } from './garmentLayer';
import { isPhone } from '@/lib/device';
import { loadImage } from '@/lib/imgQueue';
import type { GalleryApi, GState } from './Gallery3D';

export type DP = 'forms' | 'wall' | 'table' | 'rack' | 'back' | 'caps' | 'case' | 'art';
export type SPiece = { id: string; title: string; code?: string; kind: 'garment' | 'cap' | 'art'; tex: string; back?: string; heightM?: number };
export type SRoom = { key: string; dp: DP; pieces: SPiece[] };

const W = 8, D = 10, H = 4.6; // 半幅・半奥行・天井
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, rep?: [number, number]) {
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
    const mobile = isPhone();
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

    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe9e7e2);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
    const camera = new THREE.PerspectiveCamera(mobile ? 62 : 50, 1, 0.05, 80);

    // ---- 材質 ----
    const wallM = new THREE.MeshStandardMaterial({ color: 0xf3f2ee, roughness: 0.95 });
    const floorT = canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = '#cfccc5'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26000; i++) { const v = 170 + Math.random() * 60; g.fillStyle = `rgba(${v},${v - 2},${v - 6},${Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      for (let i = 0; i < 14; i++) { const gr = g.createRadialGradient(Math.random() * w, Math.random() * h, 0, Math.random() * w, Math.random() * h, 260); gr.addColorStop(0, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
      g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2; for (let x = 0; x <= w; x += w / 2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += h / 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    }, [W / 2, D / 2]);
    const floorM = new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.38, metalness: 0.02 });
    const white = new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.5 });
    const black = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.45 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe8eaec, metalness: 1, roughness: 0.14 });
    const oak = new THREE.MeshStandardMaterial({ color: 0xc9a77c, roughness: 0.6 });
    // ハンガー：黒一色のシンプルなもの（つや消しの黒＋いぶし銀の金具）
    const hSilver = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.22, metalness: 1 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.03, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    const shadowT = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = scene) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = !mobile; b.receiveShadow = !mobile; p.add(b); return b; };
    const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, p: THREE.Object3D = scene) => { const l = a.distanceTo(b); const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 12), m); c.position.copy(a).lerp(b, 0.5); c.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); c.castShadow = !mobile; p.add(c); return c; };
    const softShadow = (x: number, z: number, w: number, d: number, o = 0.5, p: THREE.Object3D = scene) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, opacity: o, depthWrite: false })); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.004, z); p.add(s); };

    // ---- 部屋：床・壁・天井・入口のガラス ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2), floorM); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    box(0.2, H, D * 2, wallM, -W - 0.1, H / 2, 0); box(0.2, H, D * 2, wallM, W + 0.1, H / 2, 0); box(W * 2, H, 0.2, wallM, 0, H / 2, -D - 0.1);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2), new THREE.MeshStandardMaterial({ color: 0xf6f5f2, roughness: 1 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; scene.add(ceil);
    // 天井の細長い照明
    const lightM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const x of [-4, 0, 4]) for (let z = -8; z <= 8; z += 4) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 2.6), lightM); l.rotation.x = Math.PI / 2; l.position.set(x, H - 0.01, z); scene.add(l); }
    // 幅木
    for (const s of [-1, 1]) box(0.02, 0.08, D * 2, black, s * (W - 0.01), 0.04, 0);
    box(W * 2, 0.08, 0.02, black, 0, 0.04, -D + 0.01);
    // 入口：ガラスと黒い枠
    { const z = D; for (let x = -W; x <= W + 0.01; x += 2) box(0.06, H, 0.08, black, x, H / 2, z); box(W * 2, 0.08, 0.08, black, 0, H - 0.04, z); box(W * 2, 0.08, 0.08, black, 0, 0.04, z);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, H), glass); gl.position.set(0, H / 2, z); scene.add(gl); }
    // 奥の壁の文字
    { const t = canvasTex(2048, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#141414'; g.font = `400 ${h * 0.62}px "Times New Roman", Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${h * 0.18}px`; g.fillText('GALLERY CRYPTO', w / 2, h / 2); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true })); m.position.set(0, 3.7, -D + 0.02); scene.add(m); }

    // ---- 光 ----
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d3ca, 1.35));
    const sun = new THREE.DirectionalLight(0xfff6ea, 1.3); sun.position.set(-4, 9, 6); sun.target.position.set(0, 0, -1); scene.add(sun, sun.target);
    if (!mobile) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -W - 1, right: W + 1, top: D + 1, bottom: -D - 1, near: 1, far: 30 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 5; sun.shadow.camera.updateProjectionMatrix(); }
    const fill = new THREE.DirectionalLight(0xe6eeff, 0.45); fill.position.set(5, 4, -6); scene.add(fill);

    // ---- 商品を置く ----
    const hits: THREE.Object3D[] = [];
    const spots = new Map<string, { look: THREE.Vector3; pos: THREE.Vector3; room: number }>();
    const stops: { pos: THREE.Vector3; look: THREE.Vector3 }[] = [];
    const spinners: THREE.Object3D[] = [];
    const swayers: { o: THREE.Object3D; ph: number }[] = [];
    const queue: (() => Promise<void>)[] = [];
    let built3D = 0; const MAX3D = mobile ? 4 : 40;

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
        const m = new THREE.Mesh(extrude(s2, 0.03, 0.009), hCloth); m.position.set(0, top, -0.022); m.castShadow = !mobile; hg.add(m); // 服の後ろ寄りに（首元の山だけがのぞく）
      }
      return hg;
    };
    const garment = (parent: THREE.Object3D, p: SPiece, h0: number, ri: number, face: THREE.Vector3, dist: number, hanger = true, clip = false) => {
      // 採寸した服は、その実物の高さで（パンツが床に着かないよう上限あり）
      const h = p.heightM ? Math.min(1.25, Math.max(0.2, p.heightM)) : h0;
      const g0 = new THREE.Group(); parent.add(g0);
      const drop = hanger ? 0.1 : 0; // レールから服の上端まで
      const g = new THREE.Group(); g.position.y = -drop + (clip ? 0.035 : 0); g0.add(g); // パンツは布の帯に腰をかける
      if (hanger) g0.add(hangerOf(clip ? Math.min(0.4, h * 0.36) : Math.max(0.34, Math.min(0.46, h * 0.56)), clip, drop));
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
        } catch { /* 無視 */ }
      });
      const look = new THREE.Vector3(); g.updateWorldMatrix(true, false);
      queue.push(async () => {
        if (!alive || built3D >= MAX3D) return;
        const F = await layerOf(p.tex); if (!F || !alive) return;
        const B = p.back ? await layerOf(p.back) : null; if (!bboxOf(F)) return;
        const r = buildGarment(F, B, h, 1, mobile ? 512 : 1024); if (!r || !alive) return;
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

    rooms.forEach((room, ri) => {
      const ps = room.pieces, n = ps.length;
      switch (room.dp) {
        case 'forms': { // 入口：白い回転台の上のトルソー（服を着せて、ゆっくり回る）
          const sp = mobile ? 1.8 : 2.6, xs = n === 1 ? [0] : ps.map((_, k) => -sp + (2 * sp * k) / Math.max(1, n - 1));
          ps.forEach((p, k) => {
            const x = xs[k], z = 5.2 - Math.abs(x) * 0.25;
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.3, 48), white); base.position.set(x, 0.15, z); base.castShadow = base.receiveShadow = !mobile; scene.add(base); softShadow(x, z, 1.8, 1.8, 0.45);
            const turn = new THREE.Group(); turn.position.set(x, 0.3, z); scene.add(turn); spinners.push(turn);
            rod(V(0, 0, 0), V(0, 1.3, 0), 0.02, chrome, turn);
            // 肩の形の細いバー（服の中に隠れる）
            rod(V(-0.18, 1.5, 0), V(0.18, 1.5, 0), 0.015, chrome, turn);
            const g = garment(turn, p, 0.82, ri, V(0, 0, 1), 2.4, false); g.position.y = 1.52;
            spots.get(p.id)!.look.set(x, 1.1, z); spots.get(p.id)!.pos.set(x, 1.4, z + 2.3);
          });
          stops[ri] = mobile ? { pos: V(0, 1.75, 9.8), look: V(0, 1.05, 4.6) } : { pos: V(0, 1.6, 9.4), look: V(0, 1.15, 4.6) };
          break;
        }
        case 'wall': { // 左の壁：上下二段のフェイスアウト（白い棚板の上に、たたんだ在庫）
          const g0 = new THREE.Group(); g0.position.set(-W, 0, -2.5); g0.rotation.y = Math.PI / 2; scene.add(g0);
          const per = Math.ceil(n / 2), span = Math.min(12, per * 0.95 + 0.6);
          for (const y of [2.75, 1.55]) { rod(V(-span / 2, y, 0.42), V(span / 2, y, 0.42), 0.016, chrome, g0); for (const ex of [-span / 2, span / 2]) rod(V(ex, y, 0.02), V(ex, y, 0.42), 0.012, chrome, g0); }
          box(span, 0.03, 0.42, white, 0, 3.75, 0.21, g0); box(span, 0.03, 0.42, white, 0, 0.42, 0.21, g0);
          ps.forEach((p, k) => {
            const row = k < per ? 0 : 1, kk = row ? k - per : k, cnt = row ? n - per : per;
            const x = -span / 2 + 0.6 + (kk * (span - 1.2)) / Math.max(1, cnt - 1);
            const arm = new THREE.Group(); arm.position.set(cnt === 1 ? 0 : x, row ? 1.55 : 2.75, 0.42); g0.add(arm);
            garment(arm, p, 0.78, ri, V(1, 0, 0), 2.6);
          });
          for (let x = -span / 2 + 0.4; x < span / 2 - 0.3; x += 0.55) box(0.36, 0.12, 0.3, new THREE.MeshStandardMaterial({ color: [0x1a1a1c, 0xe5e0d3, 0x4b5236, 0x1d2740][Math.floor(x * 7 + 40) % 4], roughness: 0.95 }), x, 3.82, 0.2, g0);
          stops[ri] = { pos: V(-3.2, 1.75, -2.5), look: V(-W, 2.0, -2.5) };
          break;
        }
        case 'table': { // 中央：オークの長いテーブルに、たたんだ服の山（いちばん上に柄が見える）
          const L = Math.max(3, Math.min(5.6, n * 0.62 + 0.6));
          box(L, 0.05, 1.3, oak, 0, 0.88, -1, scene); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.06, 0.86, 0.06, black, sx * (L / 2 - 0.15), 0.43, -1 + sz * 0.55);
          softShadow(0, -1, L + 1.2, 2.6, 0.4);
          // 低い台（ライザー）を2つ
          box(0.7, 0.18, 0.5, white, -L / 2 + 0.6, 0.995, -1.25); box(0.7, 0.18, 0.5, white, L / 2 - 0.6, 0.995, -1.25);
          ps.forEach((p, k) => {
            const col = k % Math.ceil(n / 2), row = Math.floor(k / Math.ceil(n / 2)), cols = Math.ceil(n / 2);
            const x = -L / 2 + 0.45 + (col * (L - 0.9)) / Math.max(1, cols - 1), z = -1 + (row ? 0.32 : -0.28);
            const onRiser = (col === 0 || col === cols - 1) && row === 0;
            const st = new THREE.Group(); st.position.set(x, onRiser ? 1.085 : 0.905, z); scene.add(st);
            loadTex(p.tex).then((t) => {
              if (!t || !alive) return;
              // たたんだ形：胸のあたりを切り出した絵を、上の面に。側面は同じ絵を伸ばして生地の色に
              const top = t.clone(); top.repeat.set(0.42, 0.36); top.offset.set(0.29, 0.38); top.needsUpdate = true;
              const side = t.clone(); side.repeat.set(0.02, 0.02); side.offset.set(0.4, 0.14); side.needsUpdate = true;
              const sm = new THREE.MeshStandardMaterial({ map: side, roughness: 0.95 }), tm = new THREE.MeshStandardMaterial({ map: top, roughness: 0.9 });
              const cntS = 3 + (k % 3);
              for (let i = 0; i < cntS; i++) {
                const f = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.055, 0.4), i === cntS - 1 ? [sm, sm, tm, sm, sm, sm] : sm);
                f.position.set((Math.random() - 0.5) * 0.015, 0.03 + i * 0.056, (Math.random() - 0.5) * 0.015); f.rotation.y = (Math.random() - 0.5) * 0.05; f.castShadow = f.receiveShadow = !mobile; f.userData.id = p.id; st.add(f); hits.push(f);
              }
            });
            const look = st.position.clone().setY(st.position.y + 0.15);
            spots.set(p.id, { look, pos: look.clone().add(V(0, 0.95, 1.05)), room: ri });
          });
          stops[ri] = { pos: V(0, 2.35, 2.6), look: V(0, 0.85, -1) };
          break;
        }
        case 'rack': { // 右奥：自立式のクロームのラックに、パンツを吊るす
          const L = Math.max(2.4, Math.min(5, n * 0.62 + 0.8)), cx = 3.9, cz = -5.6;
          const g0 = new THREE.Group(); g0.position.set(cx, 0, cz); scene.add(g0);
          for (const ex of [-L / 2, L / 2]) { rod(V(ex, 0.05, 0), V(ex, 1.85, 0), 0.02, chrome, g0); rod(V(ex, 0.05, -0.3), V(ex, 0.05, 0.3), 0.02, chrome, g0); }
          rod(V(-L / 2, 1.85, 0), V(L / 2, 1.85, 0), 0.016, chrome, g0);
          softShadow(cx, cz, L + 0.8, 1.6, 0.4);
          ps.forEach((p, k) => {
            const x = -L / 2 + 0.45 + (k * (L - 0.9)) / Math.max(1, n - 1);
            const a = new THREE.Group(); a.position.set(n === 1 ? 0 : x, 1.83, 0.02); g0.add(a); swayers.push({ o: a, ph: k });
            garment(a, p, 1.05, ri, V(0, 0, 1), 2.6, true, true);
          });
          stops[ri] = { pos: V(cx - 0.4, 1.6, cz + 4.4), look: V(cx, 1.1, cz) };
          break;
        }
        case 'back': { // 奥の壁：長いレール（ヴィンテージ・ツアーマーチ）
          const span = Math.min(13, Math.max(4, n * 1.0 + 0.8));
          const g0 = new THREE.Group(); g0.position.set(0, 0, -D); scene.add(g0);
          rod(V(-span / 2, 2.25, 0.4), V(span / 2, 2.25, 0.4), 0.016, chrome, g0);
          for (const ex of [-span / 2, 0, span / 2]) rod(V(ex, 2.25, 0.02), V(ex, 2.25, 0.4), 0.012, chrome, g0);
          ps.forEach((p, k) => {
            const x = -span / 2 + 0.6 + (k * (span - 1.2)) / Math.max(1, n - 1);
            const a = new THREE.Group(); a.position.set(n === 1 ? 0 : x, 2.25, 0.4); g0.add(a); swayers.push({ o: a, ph: k * 1.3 });
            garment(a, p, 0.82, ri, V(0, 0, 1), 2.4);
          });
          stops[ri] = { pos: V(0, 1.7, -4.2), look: V(0, 1.7, -D) };
          break;
        }
        case 'caps': { // 右の壁：白い小さな棚を格子に並べて、帽子を一つずつ
          const g0 = new THREE.Group(); g0.position.set(W, 0, 3.2); g0.rotation.y = -Math.PI / 2; scene.add(g0);
          const cols = Math.min(5, Math.max(2, Math.ceil(n / 2))), rows = Math.ceil(n / cols);
          ps.forEach((p, k) => {
            const c = k % cols, r = Math.floor(k / cols);
            const x = (c - (cols - 1) / 2) * 0.72, y = 2.4 - r * 0.62;
            box(0.5, 0.025, 0.3, white, x, y, 0.15, g0);
            const holder = new THREE.Group(); holder.position.set(x, y + 0.012, 0.16); g0.add(holder);
            flatPiece(holder, p, 0.42, ri, V(-1, 0, 0), 1.6, 0.15);
          });
          void rows;
          stops[ri] = { pos: V(W - 3.6, 1.75, 3.2), look: V(W, 1.95, 3.2) };
          break;
        }
        case 'case': { // 右手前：ガラスのショーケースに小物（3段）
          const cx = 4.4, cz = 6.2;
          box(1.9, 0.9, 0.8, white, cx, 0.45, cz); softShadow(cx, cz, 2.8, 1.8, 0.45);
          const gl = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.75, 0.76), glass); gl.position.set(cx, 1.28, cz); scene.add(gl);
          // ガラスの縁だけクローム
          for (const [a, b] of [[V(cx - 0.93, 1.655, cz - 0.38), V(cx + 0.93, 1.655, cz - 0.38)], [V(cx - 0.93, 1.655, cz + 0.38), V(cx + 0.93, 1.655, cz + 0.38)], [V(cx - 0.93, 1.655, cz - 0.38), V(cx - 0.93, 1.655, cz + 0.38)], [V(cx + 0.93, 1.655, cz - 0.38), V(cx + 0.93, 1.655, cz + 0.38)]] as [THREE.Vector3, THREE.Vector3][]) rod(a, b, 0.008, chrome);
          box(1.8, 0.012, 0.7, glass, cx, 1.18, cz);
          ps.forEach((p, k) => {
            const tier = k < Math.ceil(n / 2) ? 0 : 1, kk = tier ? k - Math.ceil(n / 2) : k, cnt = tier ? n - Math.ceil(n / 2) : Math.ceil(n / 2);
            const x = cx - 0.7 + (kk * 1.4) / Math.max(1, cnt - 1);
            const h0 = new THREE.Group(); h0.position.set(cnt === 1 ? cx : x, tier ? 1.19 : 0.905, cz); scene.add(h0);
            flatPiece(h0, p, 0.28, ri, V(0, 0, 1), 1.2, 0.9);
          });
          stops[ri] = { pos: V(cx - 0.2, 1.85, cz + 2.0), look: V(cx, 0.95, cz) };
          break;
        }
        case 'art': { // アート：左手前の壁に額装
          const g0 = new THREE.Group(); g0.position.set(-W, 0, 6.4); g0.rotation.y = Math.PI / 2; scene.add(g0);
          ps.forEach((p, k) => {
            const x = (k - (n - 1) / 2) * 1.4;
            const fr = box(1.1, 1.1, 0.05, black, x, 1.75, 0.03, g0); void fr;
            const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), new THREE.MeshStandardMaterial({ roughness: 0.8 })); pic.position.set(x, 1.75, 0.062); pic.userData.id = p.id; g0.add(pic); hits.push(pic);
            loadTex(p.tex).then((t) => { if (t && alive) { (pic.material as THREE.MeshStandardMaterial).map = t; (pic.material as THREE.MeshStandardMaterial).needsUpdate = true; } });
            const look = new THREE.Vector3(); pic.getWorldPosition(look);
            spots.set(p.id, { look, pos: look.clone().add(V(2.2, -0.1, 0)), room: ri });
          });
          stops[ri] = { pos: V(-3.6, 1.7, 6.4), look: V(-W, 1.7, 6.4) };
          break;
        }
      }
    });

    // 立体化を順番に（画面を止めないよう、1着ずつ間をあけて）
    (async () => { await new Promise((r) => setTimeout(r, 400)); for (const job of queue) { if (!alive) return; await job(); await new Promise((r) => setTimeout(r, 30)); } })();

    // ---- カメラ：売り場から売り場へ移動。ドラッグで見回し、ホイール／ピンチで寄る ----
    let room = 0, focus: string | null = null;
    const cur = { pos: stops[0]?.pos.clone() || V(0, 1.6, 9), look: stops[0]?.look.clone() || V(0, 1.2, 0) };
    const goal = { pos: cur.pos.clone(), look: cur.look.clone() };
    let yaw = 0, pitch = 0, zoom = 1, moving = false;
    const emit = (ready = true) => cb.current.onState({ room, focus, moving, ready });
    const goRoom = (i: number) => { if (!stops[i]) return; room = i; focus = null; goal.pos.copy(stops[i].pos); goal.look.copy(stops[i].look); yaw = pitch = 0; zoom = 1; moving = true; emit(); };
    const doFocus = (id: string | null) => {
      if (!id) { focus = null; goRoom(room); return; }
      const s = spots.get(id); if (!s) return;
      room = s.room; focus = id; goal.pos.copy(s.pos); goal.look.copy(s.look); yaw = pitch = 0; zoom = 1; moving = true; emit();
    };
    apiRef.current = { goRoom, focus: doFocus };

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
    const pinch = new Map<number, { x: number; y: number }>(); let pd0 = 0, z0 = 1;
    const dom = renderer.domElement;
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', (e) => { pinch.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pinch.size === 2) { const [a, b] = [...pinch.values()]; pd0 = Math.hypot(a.x - b.x, a.y - b.y); z0 = zoom; drag = null; return; } drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false }; });
    dom.addEventListener('pointermove', (e) => {
      if (pinch.has(e.pointerId)) pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.size === 2) { const [a, b] = [...pinch.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); zoom = Math.max(0.45, Math.min(1.35, z0 * (pd0 / Math.max(1, d)))); return; }
      if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; yaw = Math.max(-1.1, Math.min(1.1, drag.yaw - dx * 0.004)); pitch = Math.max(-0.45, Math.min(0.45, drag.pitch - dy * 0.003)); }
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
    dom.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.45, Math.min(1.35, zoom * (1 + e.deltaY * 0.001))); }, { passive: false });
    const key = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName === 'INPUT') return; if (focus) return; if (e.key === 'ArrowRight') goRoom(Math.min(stops.length - 1, room + 1)); if (e.key === 'ArrowLeft') goRoom(Math.max(0, room - 1)); };
    addEventListener('keydown', key);

    const size = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size(); const ro = new ResizeObserver(size); ro.observe(el);

    let raf = 0, prev = performance.now(), first = true; const t0 = prev;
    const tmp = new THREE.Vector3(), dir = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.05, (now - prev) / 1000); prev = now; const t = (now - t0) / 1000;
      const k = 1 - Math.pow(0.0025, dt);
      cur.pos.lerp(goal.pos, k); cur.look.lerp(goal.look, k);
      if (moving && cur.pos.distanceTo(goal.pos) < 0.02) { moving = false; emit(); }
      // 見回し：注視点を、立ち位置を中心に回す。寄る：注視点へ近づく
      dir.copy(cur.look).sub(cur.pos); const dist = dir.length(); dir.normalize();
      dir.applyAxisAngle(V(0, 1, 0), yaw); const side = V(0, 1, 0).cross(dir).normalize(); dir.applyAxisAngle(side, -pitch);
      tmp.copy(cur.pos).addScaledVector(dir, dist * (1 - zoom));
      camera.position.copy(tmp); camera.lookAt(tmp.clone().addScaledVector(dir, Math.max(0.5, dist * zoom)));
      if (!reduce) { spinners.forEach((s, i) => { s.rotation.y = Math.sin(t * 0.35 + i * 1.3) * 0.9; }); swayers.forEach((s) => { s.o.rotation.z = Math.sin(t * 1.1 + s.ph) * 0.02; s.o.rotation.y = Math.sin(t * 0.6 + s.ph) * 0.08; }); }
      if (cb.current.paused && !moving && !first) return;
      renderer.render(scene, camera);
      if (first) { first = false; emit(true); const gl = renderer.getContext(); const e = gl.getError(); if (e) report('gl error ' + e); if (!renderer.info.render.calls) report('nothing drawn'); }
    };
    loop();

    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', key); apiRef.current = null;
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mm = m.material as THREE.Material | THREE.Material[]; (Array.isArray(mm) ? mm : [mm]).forEach((x) => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); }); } });
      pm.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [rooms]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="gr-3d" />;
}
