'use client';
// 3D店舗：暗い木の床と壁、銀の金具、尖ったアーチの窓、ろうそく色の灯り。商品はガラスケースに並ぶ。
// 歩き方：ドラッグで見回す・床をタップでそこへ歩く・WASD／矢印キー。商品をタップすると詳しく見られる。
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type Shown = { id: string; title: string; price: string; tex: string; sold?: boolean; local?: boolean };
export type Slot = { x: number; z: number; yaw: number; side: number };

const W = 12, H = 4.4, EYE = 1.62;
export function layout(n: number) {
  const rows = Math.max(1, Math.ceil(n / 2));
  const L = Math.max(18, rows * 3.1 + 10);
  const slots: Slot[] = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1, row = Math.floor(i / 2);
    slots.push({ x: side * 4.75, z: L / 2 - 5 - row * 3.1, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, side });
  }
  return { L, slots };
}

// ---- 手描きのテクスチャ ----
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rep?: [number, number]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function herringbone(g: CanvasRenderingContext2D) {
  g.fillStyle = '#1c120c'; g.fillRect(0, 0, 512, 512);
  const pw = 32, pl = 128;
  for (let y = -pl; y < 512 + pl; y += pw) for (let x = -pl; x < 512 + pl; x += pw * 2) {
    for (const flip of [0, 1]) {
      g.save(); g.translate(x + flip * pw, y + (flip ? 0 : 0)); g.rotate(flip ? -Math.PI / 4 : Math.PI / 4);
      const l = 26 + rnd(-6, 6);
      g.fillStyle = `hsl(${rnd(20, 28)},${rnd(35, 50)}%,${l / 3}%)`; g.fillRect(0, 0, pl, pw - 2);
      g.globalAlpha = 0.12; for (let k = 0; k < 6; k++) { g.fillStyle = Math.random() > 0.5 ? '#000' : '#5a3a22'; g.fillRect(0, rnd(0, pw), pl, 1); } g.globalAlpha = 1;
      g.restore();
    }
  }
}
function paneling(g: CanvasRenderingContext2D) {
  g.fillStyle = '#120c09'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2; i++) {
    const x = 24 + i * 256;
    const gr = g.createLinearGradient(x, 0, x + 208, 0); gr.addColorStop(0, '#22160f'); gr.addColorStop(0.5, '#2c1d13'); gr.addColorStop(1, '#1b110b');
    g.fillStyle = gr; g.fillRect(x, 40, 208, 432);
    g.strokeStyle = '#0a0604'; g.lineWidth = 6; g.strokeRect(x, 40, 208, 432);
    g.strokeStyle = 'rgba(200,200,210,.35)'; g.lineWidth = 1.5; g.strokeRect(x + 10, 50, 188, 412);
    g.fillStyle = '#c9ccd2'; for (const [px, py] of [[x + 10, 50], [x + 198, 50], [x + 10, 462], [x + 198, 462]]) { g.beginPath(); g.arc(px, py, 4, 0, 7); g.fill(); }
  }
}
function leather(g: CanvasRenderingContext2D) {
  g.fillStyle = '#0d0b0b'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? '40,34,32' : '0,0,0'},.35)`; g.fillRect(rnd(0, 256), rnd(0, 256), 1.5, 1.5); }
}
function runner(g: CanvasRenderingContext2D) {
  g.fillStyle = '#1a0708'; g.fillRect(0, 0, 256, 1024);
  g.strokeStyle = '#3d1416'; g.lineWidth = 10; g.strokeRect(12, 0, 232, 1024);
  g.strokeStyle = '#8f8d92'; g.lineWidth = 2; g.strokeRect(26, 0, 204, 1024);
  for (let y = 64; y < 1024; y += 128) { g.save(); g.translate(128, y); g.rotate(Math.PI / 4); g.strokeStyle = '#5a1d1f'; g.lineWidth = 4; g.strokeRect(-26, -26, 52, 52); g.restore(); }
}
function signTex(text: string, sub: string) {
  return canvasTex(2048, 512, (g) => {
    g.clearRect(0, 0, 2048, 512);
    const gr = g.createLinearGradient(0, 120, 0, 360); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#a9adb5'); gr.addColorStop(0.55, '#e9ebef'); gr.addColorStop(1, '#7c8089');
    g.font = '600 170px "Cormorant Garamond", Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
    g.fillStyle = gr; (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '28px'; g.fillText(text, 1024, 230);
    g.shadowBlur = 0; g.font = '400 54px "Cormorant Garamond", Georgia, serif'; g.fillStyle = '#b9bcc4'; (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '18px'; g.fillText(sub, 1024, 390);
    g.strokeStyle = '#9da1a9'; g.lineWidth = 3; g.beginPath(); g.moveTo(560, 330); g.lineTo(1488, 330); g.stroke();
    for (const x of [540, 1508]) { g.save(); g.translate(x, 330); g.rotate(Math.PI / 4); g.fillStyle = '#d9dce2'; g.fillRect(-9, -9, 18, 18); g.restore(); }
  });
}
function labelTex(title: string, price: string, sold?: boolean) {
  return canvasTex(768, 160, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#d9dce1'); gr.addColorStop(0.5, '#9a9ea7'); gr.addColorStop(1, '#c8cbd1');
    g.fillStyle = gr; g.fillRect(0, 0, 768, 160);
    g.strokeStyle = '#4a4d54'; g.lineWidth = 4; g.strokeRect(8, 8, 752, 144);
    g.fillStyle = '#16171a'; g.textAlign = 'center';
    g.font = '600 50px "Cormorant Garamond", Georgia, serif'; g.fillText(title.length > 26 ? title.slice(0, 25) + '…' : title, 384, 70);
    g.font = '400 36px "Cormorant Garamond", Georgia, serif'; g.fillText(sold ? 'SOLD' : price, 384, 124);
  });
}

// 尖ったアーチの形
function archShape(w: number, h: number) {
  const s = new THREE.Shape(), r = w / 2, sh = h - w * 0.9;
  s.moveTo(-r, 0); s.lineTo(-r, sh); s.quadraticCurveTo(-r, h - w * 0.25, 0, h); s.quadraticCurveTo(r, h - w * 0.25, r, sh); s.lineTo(r, 0); s.lineTo(-r, 0);
  return s;
}

type Api = { go: (i: number) => void };

export default function Store3D({ items, onPick, apiRef, onReady }: { items: Shown[]; onPick: (id: string) => void; apiRef: React.MutableRefObject<Api | null>; onReady?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const cam0 = useRef<{ x: number; z: number; yaw: number; pitch: number } | null>(null);
  const key = items.map((i) => i.id + i.tex.length + i.price).join('|');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { el.innerHTML = '<p style="color:#ccc;padding:20px">3D is not available in this browser.</p>'; return; }
    const mobile = matchMedia('(pointer: coarse)').matches;
    renderer.setPixelRatio(Math.min(mobile ? 1.5 : 2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070504);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.35;
    const { L, slots } = layout(items.length);
    scene.fog = new THREE.Fog(0x070504, 9, L + 4);
    const cam = new THREE.PerspectiveCamera(mobile ? 70 : 62, 1, 0.05, 200);
    const st = cam0.current || { x: 0, z: L / 2 - 1.6, yaw: 0, pitch: -0.04 };
    const target = { x: st.x, z: st.z, yaw: st.yaw, pitch: st.pitch, walking: false };

    // 材質
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe2e7, metalness: 1, roughness: 0.18, envMapIntensity: 1.6 });
    const walnut = new THREE.MeshStandardMaterial({ color: 0x2a1a11, roughness: 0.55, metalness: 0.05 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.7 });
    const leatherMat = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, leather, [3, 1]), roughness: 0.42, metalness: 0.05 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfd2ff, transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0.2, envMapIntensity: 2, depthWrite: false });

    // 床・壁・天井
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, herringbone, [W / 2.4, L / 2.4]), roughness: 0.38, metalness: 0.08, envMapIntensity: 0.8 }));
    floor.rotation.x = -Math.PI / 2; floor.name = 'floor'; scene.add(floor);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.8, L - 4), new THREE.MeshStandardMaterial({ map: canvasTex(256, 1024, runner, [1, Math.max(1, (L - 4) / 7)]), roughness: 0.95 }));
    rug.rotation.x = -Math.PI / 2; rug.position.y = 0.006; rug.name = 'floor'; scene.add(rug);
    const wallMat = new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, paneling, [L / 2.2, 1]), roughness: 0.6 });
    const wallMatS = new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, paneling, [W / 2.2, 1]), roughness: 0.6 });
    const walls: [number, number, number, number, number, THREE.Material][] = [
      [-W / 2, H / 2, 0, Math.PI / 2, L, wallMat], [W / 2, H / 2, 0, -Math.PI / 2, L, wallMat],
      [0, H / 2, -L / 2, 0, W, wallMatS], [0, H / 2, L / 2, Math.PI, W, wallMatS],
    ];
    for (const [x, y, z, ry, w, m] of walls) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, H), m); p.position.set(x, y, z); p.rotation.y = ry; scene.add(p); }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L), black); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; scene.add(ceil);
    for (let z = L / 2 - 1.5; z > -L / 2; z -= 3) { const b = new THREE.Mesh(new THREE.BoxGeometry(W, 0.22, 0.26), walnut); b.position.set(0, H - 0.11, z); scene.add(b); }
    // 腰の高さの銀の見切り
    for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, L), chrome); r.position.set(sx * (W / 2 - 0.02), 1.0, 0); scene.add(r); const r2 = r.clone(); r2.position.y = 2.15; scene.add(r2); }

    // 尖ったアーチの窓（向こうから琥珀色の光）
    const winGeo = new THREE.ShapeGeometry(archShape(0.95, 1.7));
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffb46b, transparent: true, opacity: 0.85 });
    const addWindow = (x: number, z: number, ry: number) => {
      const g = new THREE.Group(); g.position.set(x, 2.35, z); g.rotation.y = ry;
      const m = new THREE.Mesh(winGeo, winMat); g.add(m);
      const pts = archShape(0.95, 1.7).getPoints(24).map((p) => new THREE.Vector3(p.x, p.y, 0.01));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1a120c })));
      const mul = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.7, 0.02), black); mul.position.y = 0.85; g.add(mul);
      for (const yy of [0.5, 1.0]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.025, 0.02), black); tr.position.y = yy; g.add(tr); }
      scene.add(g);
    };
    for (let z = L / 2 - 3.5; z > -L / 2 + 2; z -= 3.1) { addWindow(-W / 2 + 0.01, z, Math.PI / 2); addWindow(W / 2 - 0.01, z, -Math.PI / 2); }

    // 奥の壁の看板・入口側の看板
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshStandardMaterial({ map: signTex('GALLERY CRYPTO', 'TOKYO · ARCHIVE · MMXXVII'), transparent: true, metalness: 0.6, roughness: 0.3 }));
    sign.position.set(0, 2.9, -L / 2 + 0.02); scene.add(sign);
    const back = new THREE.Mesh(new THREE.ShapeGeometry(archShape(2.4, 2.4)), new THREE.MeshBasicMaterial({ color: 0x2b1408 }));
    back.position.set(0, 0, -L / 2 + 0.015); scene.add(back);
    const bl = new THREE.PointLight(0xffa860, 6, 6, 2); bl.position.set(0, 1.2, -L / 2 + 0.6); scene.add(bl);

    // シャンデリア（銀の輪＋灯り）
    let nl = 0;
    for (let z = L / 2 - 4; z > -L / 2 + 2; z -= 6) {
      const g = new THREE.Group(); g.position.set(0, H - 0.9, z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 8, 48), chrome); ring.rotation.x = Math.PI / 2; g.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 8, 32), chrome); ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.25; g.add(ring2);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9), chrome); rod.position.y = 0.45; g.add(rod);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd39a })); f.position.set(Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55); g.add(f); }
      if (nl++ < 4) { const pl = new THREE.PointLight(0xffc38a, 12, 10, 1.4); pl.position.y = -0.1; g.add(pl); }
      scene.add(g);
    }
    scene.add(new THREE.HemisphereLight(0xffe0c0, 0x140c08, 0.35));

    // 革のベンチ（銀の脚）
    for (let z = L / 2 - 7; z > -L / 2 + 4; z -= 6) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.16, 2.0, 3, 0.06), leatherMat); b.position.set(0, 0.46, z); scene.add(b);
      for (const [dx, dz] of [[-0.24, -0.85], [0.24, -0.85], [-0.24, 0.85], [0.24, 0.85]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.38), chrome); l.position.set(dx, 0.19, z + dz); scene.add(l); }
      for (let k = 0; k < 9; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), chrome); s.position.set(0.312, 0.46, z - 0.9 + k * 0.225); scene.add(s); const s2 = s.clone(); s2.position.x = -0.312; scene.add(s2); }
    }

    // ガラスケースと商品
    const loader = new THREE.TextureLoader();
    const picks: THREE.Object3D[] = [];
    const floats: THREE.Mesh[] = [];
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const poolMat = new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,225,180,.55)'); r.addColorStop(1, 'rgba(255,225,180,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    items.forEach((it, i) => {
      const s = slots[i];
      const g = new THREE.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = s.yaw; g.userData.id = it.id;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.95, 0.72), walnut); plinth.position.y = 0.475; g.add(plinth);
      for (const y of [0.02, 0.95]) { const t = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.035, 0.76), chrome); t.position.y = y; g.add(t); }
      const gl = new THREE.Mesh(new THREE.BoxGeometry(1.08, 1.0, 0.7), glass); gl.position.y = 1.47; gl.userData.id = it.id; g.add(gl); picks.push(gl);
      for (const [x, z] of [[-0.54, -0.35], [0.54, -0.35], [-0.54, 0.35], [0.54, 0.35]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.022, 1.0, 0.022), chrome); p.position.set(x, 1.47, z); g.add(p); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.03, 0.74), chrome); top.position.y = 1.985; g.add(top);
      // 写真（両面）
      const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.76), new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide }));
      ph.position.set(0, 1.46, 0); ph.userData.id = it.id; g.add(ph); picks.push(ph); floats.push(ph);
      loader.load(it.tex, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; (ph.material as THREE.MeshBasicMaterial).map = t; (ph.material as THREE.MeshBasicMaterial).color.set(0xe8e2d8); (ph.material as THREE.MeshBasicMaterial).needsUpdate = true; renderer.render(scene, cam); });
      // 小さな台座
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 32), chrome); ped.position.y = 0.995; g.add(ped);
      // 銀のプレート
      const lb = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.13), new THREE.MeshStandardMaterial({ map: labelTex(it.title, it.price, it.sold), metalness: 0.7, roughness: 0.3 }));
      lb.position.set(0, 0.74, 0.362); lb.userData.id = it.id; g.add(lb); picks.push(lb);
      if (it.local) { const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.06), new THREE.MeshBasicMaterial({ color: 0xd2452f })); tag.position.set(0, 0.62, 0.362); g.add(tag); }
      // 上からの光（光源は増やさず、光の筋と床の明かりで表す＝スマホでも軽い）
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.62, 2.3, 24, 1, true), beamMat); beam.position.set(0, 3.0, 0.1); g.add(beam);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.12, 16), chrome); lamp.position.set(0, H - 0.3, 0.1); g.add(lamp);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.008, 0.9); g.add(pool);
      scene.add(g);
    });

    // ---- 操作 ----
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return; keys.add(e.key.toLowerCase()); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault(); target.walking = false; };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    const ray = new THREE.Raycaster();
    const ndc = (e: PointerEvent) => { const r = renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
    let down: { x: number; y: number; yaw: number; pitch: number; id: number } | null = null;
    let moved = false;
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
      if (hit && hit.distance < 9) { onPick(hit.object.userData.id); return; }
      const f = ray.intersectObjects([floor, rug], false)[0];
      if (f) { target.x = f.point.x; target.z = f.point.z; target.walking = true; }
    };
    renderer.domElement.addEventListener('pointerdown', pd);
    renderer.domElement.addEventListener('pointermove', pmv);
    renderer.domElement.addEventListener('pointerup', pu);
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';
    let hover: string | null = null;

    apiRef.current = {
      go: (i: number) => {
        const s = slots[i]; if (!s) return;
        target.x = s.side * 2.4; target.z = s.z; target.yaw = s.side < 0 ? Math.PI / 2 : -Math.PI / 2; target.pitch = -0.08; target.walking = true;
      },
    };

    const pos = new THREE.Vector3(st.x, EYE, st.z);
    let yaw = st.yaw, pitch = st.pitch;
    const clampPos = () => { pos.x = Math.max(-3.7, Math.min(3.7, pos.x)); pos.z = Math.max(-L / 2 + 1.2, Math.min(L / 2 - 0.8, pos.z)); };
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);
    let raf = 0, last = performance.now(), t0 = last, alive = true;
    const loop = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // キー操作
      let fwd = 0, side = 0, turn = 0;
      if (keys.has('w') || keys.has('arrowup')) fwd += 1;
      if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
      if (keys.has('a')) side -= 1;
      if (keys.has('d')) side += 1;
      if (keys.has('arrowleft') || keys.has('q')) turn += 1;
      if (keys.has('arrowright') || keys.has('e')) turn -= 1;
      target.yaw += turn * dt * 1.6;
      const sp = 2.6 * dt;
      if (fwd || side) {
        pos.x += (-Math.sin(yaw) * fwd + Math.cos(yaw) * side) * sp;
        pos.z += (-Math.cos(yaw) * fwd - Math.sin(yaw) * side) * sp;
      } else if (target.walking) {
        const dx = target.x - pos.x, dz = target.z - pos.z, d = Math.hypot(dx, dz);
        if (d < 0.05) target.walking = false; else { const k = Math.min(1, (3.2 * dt) / d); pos.x += dx * Math.min(1, k * 1.0); pos.z += dz * Math.min(1, k * 1.0); }
      }
      clampPos();
      // 見回しはなめらかに
      let dyaw = target.yaw - yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      yaw += dyaw * Math.min(1, dt * 8); pitch += (target.pitch - pitch) * Math.min(1, dt * 8);
      const bob = target.walking || fwd || side ? Math.sin(now / 160) * 0.012 : 0;
      cam.position.set(pos.x, EYE + bob, pos.z);
      cam.rotation.set(0, 0, 0); cam.rotateY(yaw); cam.rotateX(pitch);
      // 商品がゆっくり回る、指した商品は少し大きく
      const tt = (now - t0) / 1000;
      floats.forEach((f, k) => { f.rotation.y = Math.sin(tt * 0.6 + k) * 0.35; const s = f.userData.id === hover ? 1.06 : 1; f.scale.setScalar(f.scale.x + (s - f.scale.x) * 0.2); f.position.y = 1.46 + Math.sin(tt * 1.2 + k) * 0.015; });
      cam0.current = { x: pos.x, z: pos.z, yaw: target.yaw, pitch: target.pitch };
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    onReady?.();
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      removeEventListener('keydown', kd); removeEventListener('keyup', ku);
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (mt) (Array.isArray(mt) ? mt : [mt]).forEach((x) => { const mm = x as THREE.MeshStandardMaterial; mm.map?.dispose(); x.dispose(); }); });
      renderer.dispose(); pm.dispose(); el.innerHTML = '';
      apiRef.current = null;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="sh-3d" ref={host} />;
}
