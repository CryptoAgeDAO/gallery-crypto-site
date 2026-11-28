// 展示ホール：ショールームの左の壁の開口から入る、美術館のような白い別棟。
// 最初のショールームのローライダーとカスタムBMXに、オリジナルのヨット（デイクルーザー）を加えて展示する。
// どれも売り物ではない見本の展示。実在のブランドのロゴや車名・艇名は使わない。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type ExhibitKind = 'car' | 'bike' | 'yacht';
// ホールの範囲（x は左へ）。扉は本館の左の壁（x = -8.2）の z = DOOR_Z
export const HALL = { xIn: -8.2, xOut: -28.2, z0: -10, z1: 10, h: 6.2 };
export const DOOR_Z = 2.5, DOOR_W = 2.8, DOOR_H = 3.4;
// 本館が広くなったので、ホール全体を左奥へずらして置く（扉は本館の左の壁 x = -12.2、z = DOOR_Z + HALL_DZ）
export const HALL_DX = -4, HALL_DZ = -12.5;
export const DOOR_WZ = DOOR_Z + HALL_DZ;
// 車と自転車は本館に出して、服と一緒に見せる（クロスDP）：車は左の棟のアウターの前、自転車は入口のトルソーの横。
// どれもホールの座標（本館の座標から HALL_DX・HALL_DZ を引いたもの）で持つ
const P = { car: { x: -8.6 - HALL_DX, z: -2.6 - HALL_DZ, ry: 1.27 }, bike: { x: 6.6 - HALL_DX, z: 11.4 - HALL_DZ }, yacht: { x: -22.4, z: 0.4, ry: -1.74 } };
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// それぞれの展示を見る立ち位置（スマホは縦長なので少し引く）
export function exhibitStop(k: ExhibitKind, mobile: boolean) {
  // 本館の車と自転車（本館の座標）。スマホは引いて全体を
  if (k === 'car') return mobile ? { pos: V(-4.0, 2.5, 6.0), look: V(-8.4, 0.8, -2.2) } : { pos: V(-4.2, 1.85, 2.4), look: V(-8.6, 0.85, -2.4) };
  if (k === 'bike') return mobile ? { pos: V(2.6, 1.75, 13.8), look: V(6.6, 0.75, 11.2) } : { pos: V(3.4, 1.55, 13.3), look: V(6.6, 0.75, 11.3) };
  const s = stopLocal(k, mobile), d = V(HALL_DX, 0, HALL_DZ);
  return { pos: s.pos.add(d), look: s.look.add(d) };
}
function stopLocal(k: ExhibitKind, mobile: boolean) {
  return mobile ? { pos: V(-12.6, 2.8, 6.4), look: V(-22.4, 1.3, 0.4) } : { pos: V(-14.6, 2.45, 5.6), look: V(-22.4, 1.25, 0.4) };
}

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = (a: number, b: number) => a + rnd() * (b - a);
const DISP = '"Anton", "Oswald", Impact, "Arial Narrow", sans-serif';
const UI = '"Helvetica Neue", Arial, sans-serif';
const SERIF = '"Times New Roman", Georgia, serif';

// part：'objects' は本館に置く車と自転車だけ、'hall' はホールの建物とヨットだけ、'all' は全部
// 'beach' は海のショールーム用：車・自転車・ヨットだけ（ホールの建物・札・ホールの照明なし）。at で置き場所（本館の座標）を変えられる
type At = { car?: { x: number; z: number; ry: number }; bike?: { x: number; z: number }; yacht?: { x: number; z: number; ry: number } };
export function buildHall(scene0: THREE.Scene, mobile: boolean, shadowT: THREE.Texture, part: 'objects' | 'hall' | 'all' | 'beach' = 'all', at?: At) {
  if (at?.car) Object.assign(P.car, { x: at.car.x - HALL_DX, z: at.car.z - HALL_DZ, ry: at.car.ry });
  if (at?.bike) Object.assign(P.bike, { x: at.bike.x - HALL_DX, z: at.bike.z - HALL_DZ });
  if (at?.yacht) Object.assign(P.yacht, { x: at.yacht.x - HALL_DX, z: at.yacht.z - HALL_DZ, ry: at.yacht.ry });
  const HB = part === 'hall' || part === 'all', OB = part !== 'hall', YB = part !== 'objects', PL = part !== 'beach';
  const scene = new THREE.Group(); scene.position.set(HALL_DX, 0, HALL_DZ); scene0.add(scene);
  const SMALL = mobile;
  const canvas = (w: number, h: number, draw: Draw) => { if (SMALL && Math.max(w, h) >= 1024) { w = Math.round(w / 2); h = Math.round(h / 2); } const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h); return c; };
  const tex = (c: HTMLCanvasElement, rep?: [number, number]) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = SMALL ? 2 : 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; };
  const textTex = (w: number, h: number, draw: Draw) => tex(canvas(w, h, draw));
  const phys = (o: THREE.MeshPhysicalMaterialParameters) => {
    if (!mobile) return new THREE.MeshPhysicalMaterial(o);
    const { clearcoat, clearcoatRoughness, sheen, sheenColor, ...rest } = o; void clearcoat; void clearcoatRoughness; void sheen; void sheenColor;
    return new THREE.MeshStandardMaterial(rest as THREE.MeshStandardMaterialParameters);
  };
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent.add(b); return b; };
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, parent: THREE.Object3D, seg = 10) => {
    const d = b.clone().sub(a), L = d.length();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, seg), m);
    c.position.copy(a).addScaledVector(d, 0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); parent.add(c); return c;
  };
  const floorShadow = (x: number, z: number, w: number, d: number, o = 0.5) => { const sh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, depthWrite: false, opacity: o })); sh.rotation.x = -Math.PI / 2; sh.position.set(x, 0.006, z); scene.add(sh); };
  const CH = HALL.h;
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdadde1, metalness: 1, roughness: 0.14 });
  const black = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.55 });
  const plinthM = new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.55 });
  const ticks: ((now: number) => void)[] = [];

  if (HB) { // ホールの建物（スマホは、ホールへ行くときに初めて作る）
  // ---- 建物：白い壁・明るい床・天井の大きな光の天窓（ライトレイ）。本館より天井が高い ----
  const cx = (HALL.xIn + HALL.xOut) / 2, hw = (HALL.xIn - HALL.xOut) / 2, hd = (HALL.z1 - HALL.z0) / 2;
  const wallM = new THREE.MeshStandardMaterial({ color: 0xf7f6f2, roughness: 0.95 });
  const floorT = tex(canvas(1024, 1024, (g, w, h) => {
    g.fillStyle = '#d6d3cc'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18000; i++) { const v = 190 + rnd() * 50; g.fillStyle = `rgba(${v},${v - 2},${v - 6},${rnd() * 0.18})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    for (let i = 0; i < 10; i++) { const x = rnd() * w, y = rnd() * h; const gr = g.createRadialGradient(x, y, 0, x, y, 300); gr.addColorStop(0, 'rgba(255,255,255,.07)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  }), [hw / 2, hd / 2]);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hd * 2), new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.32, metalness: 0.02 })); fl.rotation.x = -Math.PI / 2; fl.position.set(cx, 0, 0); scene.add(fl);
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hd * 2), new THREE.MeshStandardMaterial({ color: 0xf6f5f2, roughness: 1 })); ce.rotation.x = Math.PI / 2; ce.position.set(cx, CH, 0); scene.add(ce);
  box(0.2, CH, hd * 2, wallM, HALL.xOut - 0.1, CH / 2, 0, scene);
  box(hw * 2 + 0.4, CH, 0.2, wallM, cx, CH / 2, HALL.z0 - 0.1, scene); box(hw * 2 + 0.4, CH, 0.2, wallM, cx, CH / 2, HALL.z1 + 0.1, scene);
  // 本館と接する壁（ホール側）：扉の上と、本館の天井より上
  const zA = DOOR_Z - DOOR_W / 2, zB = DOOR_Z + DOOR_W / 2;
  box(0.2, CH, zA - HALL.z0, wallM, HALL.xIn - 0.1, CH / 2, (zA + HALL.z0) / 2, scene);
  box(0.2, CH, HALL.z1 - zB, wallM, HALL.xIn - 0.1, CH / 2, (HALL.z1 + zB) / 2, scene);
  box(0.2, CH - DOOR_H, DOOR_W, wallM, HALL.xIn - 0.1, DOOR_H + (CH - DOOR_H) / 2, DOOR_Z, scene);
  // 幅木の代わりの細い影の目地
  const gapM = new THREE.MeshBasicMaterial({ color: 0x9c988f });
  box(0.01, 0.03, hd * 2, gapM, HALL.xOut + 0.005, 0.015, 0, scene); box(hw * 2, 0.03, 0.01, gapM, cx, 0.015, HALL.z0 + 0.005, scene); box(hw * 2, 0.03, 0.01, gapM, cx, 0.015, HALL.z1 - 0.005, scene);
  // 天窓：白く光る大きな面と細い枠
  const lay = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const [lx, lz] of [[-14, -4.5], [-14, 4.5], [-22, -4.5], [-22, 4.5]] as [number, number][]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 7.2), lay); p.rotation.x = Math.PI / 2; p.position.set(lx, CH - 0.02, lz); scene.add(p);
    for (let i = 1; i < 4; i++) box(0.03, 0.02, 7.2, new THREE.MeshBasicMaterial({ color: 0xe2e0da }), lx - 3.1 + i * 1.55, CH - 0.03, lz, scene);
  }
  // 奥の壁の題字
  { const t = textTex(2048, 256, (g, w, h) => { g.fillStyle = '#141414'; g.font = `400 ${h * 0.5}px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${h * 0.16}px`; g.fillText('THE COLLECTION', w / 2, h / 2); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.875), new THREE.MeshBasicMaterial({ map: t, transparent: true })); m.position.set(HALL.xOut + 0.02, 4.4, 0.4); m.rotation.y = Math.PI / 2; if (mobile) m.scale.setScalar(0.6); scene.add(m); }
  }
  // 展示札：白い細い台の上に、斜めの札（作品名・素材・見本の表示）
  const placard = (x: number, z: number, ry: number, title: string, lines: string[]) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    box(0.06, 0.95, 0.06, plinthM, 0, 0.475, 0, g); box(0.3, 0.02, 0.3, plinthM, 0, 0.01, 0, g);
    const t = textTex(640, 448, (c, w, h) => {
      c.fillStyle = '#fbfaf7'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#141414'; c.textAlign = 'left'; c.font = `400 ${h * 0.16}px ${SERIF}`; c.fillText(title, w * 0.08, h * 0.28);
      c.fillStyle = '#4a4741'; c.font = `400 ${h * 0.068}px ${UI}`; lines.forEach((l, i) => c.fillText(l, w * 0.08, h * (0.46 + i * 0.11)));
      c.fillStyle = '#8a857b'; c.font = `400 ${h * 0.06}px ${UI}`; c.fillText('Sample display — not for sale', w * 0.08, h * 0.88);
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.32, 0.016), [plinthM, plinthM, plinthM, plinthM, new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }), plinthM]);
    plate.position.set(0, 0.99, 0); plate.rotation.x = -0.7; g.add(plate);
  };
  // 光：パソコンは展示ごとにスポット、スマホは軽いポイントライト一つ
  const aim = (from: THREE.Vector3, to: THREE.Vector3, power: number) => {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 12), black); head.position.copy(from); scene.add(head);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
    rod(from, V(from.x, CH, from.z), 0.012, black, scene, 4);
    if (!mobile && power > 0) { const sp = new THREE.SpotLight(0xffffff, power, 14, 0.5, 0.7, 1.1); sp.position.copy(from); sp.target.position.copy(to); scene.add(sp, sp.target); }
  };
  if (HB) {
  aim(V(-17.2, CH - 0.5, 3.4), V(P.yacht.x, 1.2, P.yacht.z), 70);
  aim(V(-24.5, CH - 0.5, -3.6), V(P.yacht.x, 1.2, P.yacht.z), 0);
  if (mobile) { const pl = new THREE.PointLight(0xffffff, 42, 18, 1.1); pl.position.set(-15, CH - 1, 1); scene.add(pl); }
  // 本館からの明かりとは別に、ホールの奥から当たるやわらかい光
  const hf = new THREE.DirectionalLight(0xfff8ef, 0.55); hf.position.set(-6, 7, 6); hf.target.position.set(-20, 0, -2); scene.add(hf, hf.target);
  }

  if (OB && PL) placard(-1.6, 6.5, 1.2, 'Candy Hardtop', ['Candy paint · lace · gold leaf', 'Hydraulics · wire wheels']);
  if (OB && PL) placard(12.4, 25.4, -1.51, 'Custom BMX', ['Chrome frame · gold parts · 20 in']);
  if (HB) placard(-18.4, -3.4, 0.43, 'Nocturne', ['Day cruiser · 8.6 m', 'Midnight hull · teak · cream leather']);

  // ---- ローライダー（最初のショールームのもの）：キャンディ塗装・レース・金の線・油圧で前を持ち上げて弾む ----
  let carTick: ((now: number) => void) | null = null;
  if (OB) {
    const CX = P.car.x, CZ = P.car.z, L = 5.3, W = 1.94;
    const car = new THREE.Group(); car.position.set(CX, 0, CZ); car.rotation.y = P.car.ry; scene.add(car);
    const body = new THREE.Group(); car.add(body); // 油圧で傾く部分
    // ショーカーの塗装：キャンディの地にメタルフレーク、側面の下半分にレース柄、金のスカラップ（ピンストライプ）
    const paintC = canvas(2048, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8a1747'); gr.addColorStop(0.45, '#5c0b2e'); gr.addColorStop(1, '#2a0414'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < w * h / 90; i++) { g.fillStyle = `rgba(255,${180 + R(0, 75) | 0},${200 + R(0, 55) | 0},${R(0.05, 0.28)})`; g.fillRect(R(0, w), R(0, h), 1.2, 1.2); }
      // レース：側面の下（車体の高さ 0.32〜0.55m のあたり）に、透かしの花模様
      const y0 = h * (1 - 0.56 / 1.3), y1 = h * (1 - 0.33 / 1.3), cell = (y1 - y0) / 2;
      g.save(); g.beginPath(); g.rect(w * 0.05, y0, w * 0.9, y1 - y0); g.clip();
      g.strokeStyle = 'rgba(255,210,230,.34)'; g.lineWidth = 1.4;
      for (let x = w * 0.05; x < w * 0.95; x += cell) for (let y = y0; y < y1; y += cell) {
        const cx = x + cell / 2, cy = y + cell / 2;
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * cell * 0.2, cy + Math.sin(a) * cell * 0.2, cell * 0.2, cell * 0.08, a, 0, 7); g.stroke(); }
        g.beginPath(); g.arc(cx, cy, cell * 0.08, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, cell * 0.48, 0, 7); g.stroke();
      }
      g.restore();
      const fade = g.createLinearGradient(0, y0, 0, y1); fade.addColorStop(0, 'rgba(92,11,46,.6)'); fade.addColorStop(0.25, 'rgba(92,11,46,0)'); fade.addColorStop(0.75, 'rgba(42,4,20,0)'); fade.addColorStop(1, 'rgba(42,4,20,.6)'); g.fillStyle = fade; g.fillRect(0, y0, w, y1 - y0);
      // 金のスカラップ：前から後ろへ流れる、尖った炎のような線
      g.strokeStyle = '#e4c26a'; g.lineWidth = 3; g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 2;
      const sy = h * (1 - 0.66 / 1.3);
      for (const dir of [1]) { void dir; g.beginPath(); g.moveTo(w * 0.08, sy); for (let i = 0; i < 7; i++) { const x = w * (0.1 + i * 0.12); g.quadraticCurveTo(x + w * 0.03, sy - h * 0.09, x + w * 0.1, sy - h * 0.01); g.quadraticCurveTo(x + w * 0.05, sy + h * 0.03, x + w * 0.12, sy); } g.stroke(); }
      g.lineWidth = 1.2; g.beginPath(); g.moveTo(w * 0.08, sy + 8); g.lineTo(w * 0.92, sy + 8); g.stroke();
    });
    const paintT = tex(paintC); paintT.repeat.set(1 / L, 1 / 1.3); paintT.offset.set(0.5, 0);
    const paint = phys({ color: 0xd9c2ca, map: paintT, metalness: 0.55, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.4, sheenColor: new THREE.Color(0xff5a8a) });
    const glassM = phys({ color: 0x0d1014, metalness: 0.2, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.86 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 1, roughness: 0.25 });
    const glow = (c: number) => new THREE.MeshBasicMaterial({ color: c });
    const tireM0 = () => new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });
    // 横から見た車体の輪郭（長いボンネット・低い屋根・長いトランク。車輪の上はアーチで切り欠く）
    const RW = 0.43, FXw = 1.62, RXw = -1.58;
    const sh = new THREE.Shape();
    sh.moveTo(L / 2, 0.3);
    sh.lineTo(L / 2, 0.62); sh.quadraticCurveTo(L / 2 - 0.05, 0.72, L / 2 - 0.3, 0.74);
    sh.lineTo(0.95, 0.8); sh.lineTo(0.35, 1.22); sh.quadraticCurveTo(0.25, 1.27, 0.1, 1.27);
    sh.lineTo(-0.95, 1.27); sh.quadraticCurveTo(-1.08, 1.26, -1.15, 1.2); sh.lineTo(-1.62, 0.83);
    sh.lineTo(-L / 2 + 0.25, 0.79); sh.quadraticCurveTo(-L / 2, 0.76, -L / 2, 0.6); sh.lineTo(-L / 2, 0.3);
    sh.lineTo(RXw - RW - 0.06, 0.3); sh.absarc(RXw, 0.3, RW + 0.06, Math.PI, 0, true);
    sh.lineTo(FXw - RW - 0.06, 0.3); sh.absarc(FXw, 0.3, RW + 0.06, Math.PI, 0, true);
    sh.lineTo(L / 2, 0.3);
    const bg = new THREE.ExtrudeGeometry(sh, { depth: W - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 24 });
    bg.translate(0, 0, -(W - 0.12) / 2);
    const shell = new THREE.Mesh(bg, paint); body.add(shell);
    // 窓（左右・前・後ろ）
    const win = new THREE.Shape(); win.moveTo(0.88, 0.86); win.lineTo(0.33, 1.18); win.lineTo(-0.92, 1.18); win.lineTo(-1.45, 0.86); win.lineTo(0.88, 0.86);
    for (const sZ of [-1, 1]) { const wm = new THREE.Mesh(new THREE.ShapeGeometry(win), glassM); wm.position.z = sZ * (W / 2 + 0.005); if (sZ < 0) wm.rotation.y = Math.PI, wm.position.x = 0, wm.scale.x = -1; body.add(wm); }
    const ws = box(0.66, 0.012, W - 0.3, glassM, 0.64, 1.02, 0, body); ws.rotation.z = -0.62;
    const rw = box(0.6, 0.012, W - 0.3, glassM, -1.4, 1.03, 0, body); rw.rotation.z = 0.68;
    // B ピラーなしのハードトップ：窓の真ん中に細いクロームの縁
    for (const sZ of [-1, 1]) { rod(V(0.88, 0.86, sZ * (W / 2 + 0.012)), V(-1.45, 0.86, sZ * (W / 2 + 0.012)), 0.012, chrome, body, 6); rod(V(0.33, 1.19, sZ * (W / 2 + 0.012)), V(-0.92, 1.19, sZ * (W / 2 + 0.012)), 0.01, chrome, body, 6); }
    // クロームのバンパー・サイドモール・グリル・ライト
    for (const [bx, d] of [[L / 2 + 0.04, 1], [-L / 2 - 0.04, -1]] as [number, number][]) {
      const bump = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, W - 0.05, 6, 12), chrome); bump.rotation.x = Math.PI / 2; bump.position.set(bx, 0.36, 0); body.add(bump);
      for (const sZ of [-1, 1]) { const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), chrome); tip.position.set(bx - d * 0.08, 0.36, sZ * (W / 2 - 0.02)); body.add(tip); }
    }
    for (const sZ of [-1, 1]) rod(V(L / 2 - 0.15, 0.56, sZ * (W / 2 + 0.035)), V(-L / 2 + 0.15, 0.56, sZ * (W / 2 + 0.035)), 0.016, chrome, body, 6);
    // 金のピンストライプ（ボンネットとトランクの上を細く）
    for (const sZ of [-1, 1]) { const ps = new THREE.CatmullRomCurve3([V(L / 2 - 0.25, 0.745, sZ * 0.55), V(1.9, 0.765, sZ * 0.42), V(1.2, 0.79, sZ * 0.5)]); body.add(new THREE.Mesh(new THREE.TubeGeometry(ps, 24, 0.006, 5), gold)); const pt = new THREE.CatmullRomCurve3([V(-L / 2 + 0.25, 0.79, sZ * 0.55), V(-2.1, 0.81, sZ * 0.4), V(-1.7, 0.83, sZ * 0.5)]); body.add(new THREE.Mesh(new THREE.TubeGeometry(pt, 24, 0.006, 5), gold)); }
    const grille = new THREE.Group(); grille.position.set(L / 2 + 0.07, 0.52, 0); body.add(grille);
    box(0.03, 0.2, W - 0.55, chrome, 0, 0, 0, grille); for (let i = 0; i < 14; i++) box(0.035, 0.18, 0.012, black, 0.006, 0, -(W - 0.7) / 2 + i * ((W - 0.7) / 13), grille);
    for (const sZ of [-1, 1]) for (const dz of [0, 0.2]) { const hl = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), glow(0xfff6dd)); hl.position.set(L / 2 + 0.065, 0.62, sZ * (W / 2 - 0.2 - dz)); hl.rotation.y = Math.PI / 2; body.add(hl); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 24), chrome); rim.position.copy(hl.position); rim.rotation.y = Math.PI / 2; body.add(rim); }
    // 後ろ：左右に三つずつの丸いテールランプ（クロームの縁）
    for (const sZ of [-1, 1]) for (const dz of [0, 0.17, 0.34]) { const tl = new THREE.Mesh(new THREE.CircleGeometry(0.058, 18), glow(0xff2a2a)); tl.position.set(-L / 2 - 0.066, 0.6, sZ * (W / 2 - 0.16 - dz)); tl.rotation.y = -Math.PI / 2; body.add(tl); const tr = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.01, 6, 20), chrome); tr.position.copy(tl.position); tr.rotation.y = Math.PI / 2; body.add(tr); }
    // 後ろのフェンダーから外へ張り出すガルウィングのフィン（クロームの縁取り）
    for (const sZ of [-1, 1]) {
      // 薄い板を、外へ下がるように少し傾けて張り出す（上から見ると後ろへ広がる翼）
      const fm = box(1.05, 0.025, 0.22, paint, -L / 2 + 0.6, 0.805, sZ * (W / 2 - 0.02), body); fm.rotation.x = sZ * 0.28; fm.rotation.z = 0.05; fm.rotation.y = -sZ * 0.06;
      rod(V(-L / 2 + 0.07, 0.79, sZ * (W / 2 + 0.1)), V(-L / 2 + 1.12, 0.8, sZ * (W / 2 + 0.03)), 0.011, chrome, body, 5);
    }
    // コンチネンタルキット：後ろのバンパーの外に、クロームのカバーを付けたスペアタイヤ
    { const ck = new THREE.Group(); ck.position.set(-L / 2 - 0.2, 0.46, 0); ck.rotation.y = Math.PI / 2; body.add(ck);
      const t2 = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.075, 12, 36), tireM0()); ck.add(t2);
      const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 36), paint); cover.rotation.x = Math.PI / 2; ck.add(cover);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.018, 8, 36), chrome); ring2.position.z = -0.085; ck.add(ring2);
      const cap2 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 12), chrome); cap2.scale.z = 0.4; cap2.position.z = -0.09; ck.add(cap2);
      box(0.42, 0.06, 0.12, chrome, 0, -0.28, 0.02, ck); }
    // ボンネットの先のマスコット（クロームの小さな翼）
    { const orn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 4), chrome); orn.rotation.z = -Math.PI / 2 + 0.15; orn.position.set(L / 2 - 0.26, 0.79, 0); body.add(orn); }
    // 後輪のフェンダースカート（車体と同じ色で、クロームの縁）
    for (const sZ of [-1, 1]) {
      const sk = new THREE.Shape(); sk.moveTo(-RW - 0.06, 0); sk.absarc(0, 0, RW + 0.06, Math.PI, 0, true); sk.lineTo(-RW - 0.06, 0);
      const skm = new THREE.Mesh(new THREE.ShapeGeometry(sk, 24), paint); skm.position.set(RXw, 0.3, sZ * (W / 2 + 0.002)); if (sZ < 0) skm.rotation.y = Math.PI; body.add(skm);
      const skr = new THREE.Mesh(new THREE.TorusGeometry(RW + 0.06, 0.012, 6, 32, Math.PI), chrome); skr.position.copy(skm.position); skr.position.z += sZ * 0.004; body.add(skr);
      rod(V(RXw - RW - 0.06, 0.3, sZ * (W / 2 + 0.01)), V(RXw + RW + 0.06, 0.3, sZ * (W / 2 + 0.01)), 0.012, chrome, body, 5);
    }
    // 室内：白いタックロールのベンチシートとステアリング（窓越しに見える）
    const seatM = new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: 0.7 });
    box(0.5, 0.18, W - 0.35, seatM, 0.0, 0.62, 0, body); box(0.12, 0.38, W - 0.35, seatM, -0.22, 0.86, 0, body);
    box(0.5, 0.18, W - 0.35, seatM, -0.95, 0.62, 0, body); box(0.12, 0.38, W - 0.35, seatM, -1.17, 0.86, 0, body);
    const wheelS = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 8, 32), chrome); wheelS.position.set(0.5, 0.92, 0.38); wheelS.rotation.set(0, Math.PI / 2, 0.45); body.add(wheelS);
    // ワイヤーホイール＋ホワイトリボンのタイヤ（細く小径）
    const tireM = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 }), wwM = new THREE.MeshStandardMaterial({ color: 0xf3f1ea, roughness: 0.7 });
    const wheel = (wx: number, sZ: number) => {
      const w = new THREE.Group(); w.position.set(wx, RW, sZ * (W / 2 - 0.12)); car.add(w);
      const tire = new THREE.Mesh(new THREE.TorusGeometry(RW - 0.09, 0.09, 16, 48), tireM); w.add(tire);
      const ww = new THREE.Mesh(new THREE.TorusGeometry(RW - 0.1, 0.03, 8, 48), wwM); ww.position.z = sZ * 0.07; w.add(ww);
      const rimR = RW - 0.17; const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.02, 8, 48), chrome); rim.position.z = sZ * 0.05; w.add(rim);
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, 0.04, 40, 1, true), chrome); dish.rotation.x = Math.PI / 2; w.add(dish);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.14, 16), chrome); hub.rotation.x = Math.PI / 2; hub.position.z = sZ * 0.05; w.add(hub);
      const knock = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.06, 3), gold); knock.rotation.x = sZ * Math.PI / 2; knock.position.z = sZ * 0.13; w.add(knock);
      const nS = mobile ? 14 : 48;
      for (let i = 0; i < nS; i++) { const a2 = (i / nS) * Math.PI * 2, cross = (i % 2 ? 1 : -1) * 0.04; rod(V(Math.cos(a2) * 0.04, Math.sin(a2) * 0.04, sZ * (0.05 + cross)), V(Math.cos(a2 + 0.35) * rimR, Math.sin(a2 + 0.35) * rimR, sZ * 0.02), 0.0035, chrome, w, 3); }
      return w;
    };
    const wheels = [wheel(FXw, -1), wheel(FXw, 1), wheel(RXw, -1), wheel(RXw, 1)];
    body.position.y = 0.0;
    // 床：白い低い台と、影
    { const pl = new THREE.Mesh(new RoundedBoxGeometry(6.6, 0.16, 3.4, 3, 0.03), plinthM); pl.position.set(CX, 0.08, CZ); pl.rotation.y = P.car.ry; scene.add(pl); }
    car.position.y = 0.16;
    floorShadow(CX, CZ, 2.8, 5.8, 0.55); // 車は奥行き方向に置くので影も縦長
    // ショーの展示：車の下に斜めの鏡（クロームの足まわりが映る）、クロームの足まわり、ロープの柵、トロフィー、展示札
    const mirrorM = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 1, roughness: 0.03 });
    for (const [mx, mz, ry] of [[1.6, -0.55, 0.0], [1.6, 0.55, Math.PI], [-1.55, -0.55, 0.0], [-1.55, 0.55, Math.PI], [0.02, -0.6, 0.0], [0.02, 0.6, Math.PI]] as [number, number, number][]) {
      const mg = new THREE.Group(); mg.position.set(mx, 0.03, mz); mg.rotation.y = ry; car.add(mg);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75), mirrorM); m.rotation.x = -Math.PI / 2 + 0.5; m.position.y = 0.16; mg.add(m);
      box(1.14, 0.02, 0.78, black, 0, 0.15, 0.01, mg).rotation.x = 0.5;
    }
    const under = new THREE.Group(); under.position.y = 0.2; body.add(under);
    for (const sZ of [-1, 1]) rod(V(L / 2 - 0.4, 0, sZ * 0.42), V(-L / 2 + 0.4, 0.02, sZ * 0.42), 0.035, chrome, under, 8);
    for (const fx of [FXw, RXw]) { rod(V(fx, 0, -0.42), V(fx, 0, 0.42), 0.03, chrome, under, 8); for (const sZ of [-1, 1]) { rod(V(fx - 0.25, 0, sZ * 0.42), V(fx, 0.06, sZ * (W / 2 - 0.2)), 0.025, chrome, under, 6); const coil = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 18), gold); coil.rotation.x = Math.PI / 2; coil.position.set(fx, 0.08, sZ * 0.5); under.add(coil); const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 14), chrome); cyl.position.set(fx, 0.1, sZ * 0.5); under.add(cyl); } }
    const diff = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 12), chrome); diff.scale.set(1, 0.8, 1); diff.position.set(RXw, 0.05, 0); under.add(diff);
    rod(V(RXw, 0.05, 0), V(0.9, 0.05, 0), 0.04, chrome, under, 8);  }
  if (carTick) ticks.push(carTick);

  // ---- カスタムBMX（最初のショールームのもの）：クロームのフレーム・金のパーツ。鏡の回転台 ----
  let bmxTick: ((now: number) => void) | null = null;
  if (OB) {
    const BX = P.bike.x, BZ = P.bike.z;
    const gold2 = new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 1, roughness: 0.22 });
    const tireB = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const gum = new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.75 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.3, 0.22, 48), new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.6 })); base.position.set(BX, 0.11, BZ); scene.add(base);
    const mir = new THREE.Mesh(new THREE.CircleGeometry(1.18, 48), new THREE.MeshStandardMaterial({ color: 0xf2f1ed, metalness: 0.2, roughness: 0.08 })); mir.rotation.x = -Math.PI / 2; mir.position.set(BX, 0.222, BZ); scene.add(mir);
    floorShadow(BX, BZ, 3, 3, 0.45);
    const turn = new THREE.Group(); turn.position.set(BX, 0.23, BZ); scene.add(turn); // ゆっくり回る台
    const bike = new THREE.Group(); bike.position.y = 0.04; turn.add(bike);
    const WR = 0.25; // 20インチ
    const bwheel = (x: number) => {
      const w = new THREE.Group(); w.position.set(x, WR, 0); bike.add(w);
      w.add(new THREE.Mesh(new THREE.TorusGeometry(WR - 0.03, 0.03, 10, 40), tireB));
      const gw = new THREE.Mesh(new THREE.TorusGeometry(WR - 0.031, 0.012, 6, 40), gum); gw.position.z = 0.02; w.add(gw);
      const rimB = new THREE.Mesh(new THREE.TorusGeometry(WR - 0.06, 0.01, 6, 40), chrome); w.add(rimB);
      const nS2 = mobile ? 12 : 36; for (let i = 0; i < nS2; i++) { const a = (i / nS2) * Math.PI * 2; rod(V(0, 0, (i % 2 ? 1 : -1) * 0.025), V(Math.cos(a) * (WR - 0.06), Math.sin(a) * (WR - 0.06), 0), 0.0022, chrome, w, 3); }
      const hubB = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 12), gold2); hubB.rotation.x = Math.PI / 2; w.add(hubB);
      return w;
    };
    const wf = bwheel(0.52), wr = bwheel(-0.5);
    // フレーム（クロームの管）：ダウンチューブ・トップチューブ・シートチューブ・チェーンステー・シートステー・フォーク
    const BB = V(-0.04, 0.27, 0), ST = V(-0.18, 0.62, 0), HT = V(0.38, 0.62, 0), HB = V(0.42, 0.52, 0);
    for (const [a, b] of [[BB, HB], [ST, HT], [BB, ST]] as [THREE.Vector3, THREE.Vector3][]) rod(a, b, 0.019, chrome, bike, 10);
    for (const sZ of [-1, 1]) { rod(V(BB.x, BB.y, sZ * 0.03), V(-0.5, WR, sZ * 0.05), 0.012, chrome, bike, 8); rod(V(ST.x, ST.y - 0.04, sZ * 0.02), V(-0.5, WR, sZ * 0.05), 0.011, chrome, bike, 8); rod(V(HB.x + 0.01, HB.y, sZ * 0.03), V(0.52, WR, sZ * 0.05), 0.012, chrome, bike, 8); }
    rod(V(0.36, 0.5, 0), V(0.42, 0.7, 0), 0.022, gold2, bike, 10); // ヘッドチューブ
    // 背の高いハンドル（クロスバー付き）と金のグリップ
    rod(V(0.42, 0.7, 0), V(0.4, 0.78, 0), 0.012, chrome, bike, 6);
    for (const sZ of [-1, 1]) { rod(V(0.4, 0.78, 0), V(0.34, 1.02, sZ * 0.26), 0.011, chrome, bike, 6); const gp = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.1, 10), gold2); gp.rotation.x = Math.PI / 2; gp.position.set(0.34, 1.02, sZ * 0.31); bike.add(gp); }
    rod(V(0.37, 0.92, -0.18), V(0.37, 0.92, 0.18), 0.008, chrome, bike, 6);
    // サドル・シートポスト・クランク・チェーンリング（金）・ペダル
    rod(ST, V(-0.22, 0.74, 0), 0.012, chrome, bike, 6);
    const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 10), new THREE.MeshStandardMaterial({ color: 0x7a1030, roughness: 0.45 })); seat.rotation.z = Math.PI / 2 + 0.08; seat.scale.set(1, 1, 1.6); seat.position.set(-0.22, 0.78, 0); bike.add(seat);
    const ring3 = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 6, 30), gold2); ring3.position.set(BB.x, BB.y, 0.05); bike.add(ring3);
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.07, 5), gold2); star.position.set(BB.x, BB.y, 0.056); bike.add(star);
    for (const sZ of [-1, 1]) { const cr = rod(V(BB.x, BB.y, sZ * 0.06), V(BB.x + sZ * 0.12, BB.y - sZ * 0.1, sZ * 0.07), 0.01, chrome, bike, 6); void cr; box(0.08, 0.015, 0.06, gold2, BB.x + sZ * 0.12, BB.y - sZ * 0.1, sZ * 0.1, bike); }
    rod(V(BB.x, BB.y + 0.085, 0.05), V(-0.5, WR + 0.03, 0.05), 0.004, gold2, bike, 3); rod(V(BB.x, BB.y - 0.085, 0.05), V(-0.5, WR - 0.03, 0.05), 0.004, gold2, bike, 3);
    // ペグ
    for (const sZ of [-1, 1]) for (const px of [0.52, -0.5]) { const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 10), chrome); peg.rotation.x = Math.PI / 2; peg.position.set(px, WR, sZ * 0.1); bike.add(peg); }
    bike.rotation.y = 0.3;
    // 透明の台座スタンド（後輪を少し浮かせる）
    rod(V(-0.5, 0, 0), V(-0.5, WR - 0.02, 0), 0.01, new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }), bike, 6);
    bmxTick = (now: number) => { turn.rotation.y = (now / 1000) * 0.25; };  }
  if (bmxTick) ticks.push(bmxTick);

  // ---- ヨット（オリジナルのデイクルーザー「Nocturne」）：真夜中の紺の艇体・チークの甲板・クリームの革・湾曲した風防 ----
  if (YB) {
    const L = 8.6, B = 1.32, N = mobile ? 28 : 48, M = mobile ? 8 : 14;
    const yacht = new THREE.Group(); yacht.position.set(P.yacht.x, 0.5, P.yacht.z); yacht.rotation.y = P.yacht.ry; scene.add(yacht);
    // 船体の形：t は船尾 0 → 船首 1、s は竜骨 0 → 舷縁 1
    const hb = (t: number) => (t < 0.55 ? B * (0.9 + 0.1 * Math.sin((t / 0.55) * Math.PI / 2)) : B * Math.pow(Math.max(0.0001, Math.cos(((t - 0.55) / 0.45) * Math.PI / 2)), 0.75));
    const sheer = (t: number) => 1.22 + 0.42 * Math.pow(t, 2.2); // 船尾は低く、船首へ向けて反り上がる
    const keel = (t: number) => (t < 0.4 ? 0.2 : 0.2 + Math.pow((t - 0.4) / 0.6, 2.4) * (sheer(1) - 0.06 - 0.2)); // 船首は斜めに切れ上がる曲線
    const sec = (t: number, s: number) => { const w = hb(t), k = keel(t), top = sheer(t); const y = k + (top - k) * (s < 0.45 ? (s / 0.45) * 0.42 : 0.42 + ((s - 0.45) / 0.55) * 0.58); const ww = w * (s < 0.45 ? (s / 0.45) * 0.9 : 0.9 + 0.1 * Math.sin(((s - 0.45) / 0.55) * Math.PI / 2)); return [y, ww]; };
    const xs = (t: number) => -L / 2 + t * L;
    const YMAX = 1.8;
    // 船体の色：喫水線の下は炭色、金の細い線（ブーツストライプ）、上は艶のある真夜中の紺、舷縁に白い細線
    const hullT = tex(canvas(8, 512, (g, w, h) => {
      const band = (a: number, b: number, c: string) => { g.fillStyle = c; g.fillRect(0, h - b * h, w, (b - a) * h); };
      band(0, 0.34, '#1c1e21'); band(0.34, 0.37, '#c9a75c'); band(0.37, 1, '#0b1530');
    }));
    const hullM = phys({ map: hullT, metalness: 0.25, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide });
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (const side of [1, -1]) {
      const base = pos.length / 3;
      for (let i = 0; i <= N; i++) { const t = i / N; for (let j = 0; j <= M; j++) { const s = j / M; const [y, w] = sec(t, s); pos.push(xs(t), y, side * w); uv.push(t, y / YMAX); } }
      for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = base + i * (M + 1) + j, b = a + M + 1; if (side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1); }
    }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); hg.setIndex(idx); hg.computeVertexNormals();
    yacht.add(new THREE.Mesh(hg, hullM));
    // 船尾の板（トランサム）と艇名
    { const sh = new THREE.Shape(); for (let j = 0; j <= M; j++) { const [y, w] = sec(0, j / M); j ? sh.lineTo(w, y) : sh.moveTo(w, y); } for (let j = M; j >= 0; j--) { const [y, w] = sec(0, j / M); sh.lineTo(-w, y); }
      const tg = new THREE.ShapeGeometry(sh); const tuv = tg.attributes.position; const uvs: number[] = []; for (let i = 0; i < tuv.count; i++) uvs.push(0, tuv.getY(i) / YMAX); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const tr = new THREE.Mesh(tg, hullM); tr.rotation.y = -Math.PI / 2; tr.position.x = -L / 2; yacht.add(tr);
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.22), new THREE.MeshStandardMaterial({ transparent: true, metalness: 0.8, roughness: 0.3, map: textTex(768, 112, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#d9b968'; g.font = `400 ${h * 0.72}px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${h * 0.22}px`; g.fillText('NOCTURNE', w / 2, h / 2); }) }));
      nm.rotation.y = -Math.PI / 2; nm.position.set(-L / 2 - 0.006, 0.98, 0); yacht.add(nm); }
    // 甲板：チーク（板目と黒い目地）。少し反った面
    const teakT = tex(canvas(1024, 256, (g, w, h) => {
      g.fillStyle = '#a7764a'; g.fillRect(0, 0, w, h);
      const n = 16; for (let k = 0; k < n; k++) { const y = (k / n) * h; g.fillStyle = `hsl(${26 + R(-3, 3)},${42 + R(-6, 6)}%,${44 + R(-6, 5)}%)`; g.fillRect(0, y, w, h / n); for (let q = 0; q < 26; q++) { g.strokeStyle = `rgba(60,30,10,${R(0.05, 0.16)})`; g.lineWidth = R(0.5, 1.5); g.beginPath(); const yy = y + R(1, h / n - 1); g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + R(-2, 2), w * 0.6, yy + R(-2, 2), w, yy + R(-1, 1)); g.stroke(); } g.fillStyle = '#1b1612'; g.fillRect(0, y, w, 2); }
    }), [3, 1]);
    const teak = new THREE.MeshStandardMaterial({ map: teakT, roughness: 0.62 });
    { const K = 10, dp: number[] = [], du: number[] = [], di: number[] = [];
      for (let i = 0; i <= N; i++) { const t = i / N, w = hb(t), y0 = sheer(t); for (let k = 0; k <= K; k++) { const q = k / K * 2 - 1; dp.push(xs(t), y0 + 0.05 * (1 - q * q), q * w); du.push(t, (q * w + B) / (2 * B)); } }
      for (let i = 0; i < N; i++) for (let k = 0; k < K; k++) { const a = i * (K + 1) + k, b = a + K + 1; di.push(a, a + 1, b, b, a + 1, b + 1); }
      const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); dg.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2)); dg.setIndex(di); dg.computeVertexNormals();
      yacht.add(new THREE.Mesh(dg, teak)); }
    const deckY = (t: number, q = 0) => sheer(t) + 0.05 * (1 - q * q);
    // 舷縁のクロームの縁取りと、船首のレール
    for (const sZ of [-1, 1]) {
      const pts: THREE.Vector3[] = []; for (let i = 0; i <= 24; i++) { const t = i / 24 * 0.995; pts.push(V(xs(t), sheer(t) - 0.03, sZ * (hb(t) + 0.012))); }
      yacht.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.018, 6), chrome));
      const rl: THREE.Vector3[] = []; for (let i = 0; i <= 10; i++) { const t = 0.56 + (i / 10) * 0.42; rl.push(V(xs(t), deckY(t) + 0.32, sZ * hb(t) * 0.86)); }
      yacht.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rl), 40, 0.011, 6), chrome));
      for (let i = 0; i <= 4; i++) { const t = 0.58 + i * 0.09; rod(V(xs(t), deckY(t), sZ * hb(t) * 0.86), V(xs(t), deckY(t) + 0.32, sZ * hb(t) * 0.86), 0.009, chrome, yacht, 6); }
    }
    // 湾曲した風防（色付きのガラス）とクロームの枠
    { const tw = 0.56, ws: number[] = [], wi: number[] = [], K = 16, top: THREE.Vector3[] = [];
      for (let k = 0; k <= K; k++) { const q = k / K * 2 - 1, w = hb(tw) * 0.9, z = q * w, x = xs(tw) + 0.38 * (1 - q * q), y = deckY(tw, q * 0.9); ws.push(x, y, z, x - 0.3, y + 0.42, z * 0.94); top.push(V(x - 0.3, y + 0.42, z * 0.94)); }
      for (let k = 0; k < K; k++) { const a = k * 2; wi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(ws, 3)); wg.setIndex(wi); wg.computeVertexNormals();
      yacht.add(new THREE.Mesh(wg, phys({ color: 0x1a2430, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.55, side: THREE.DoubleSide, clearcoat: 1 })));
      yacht.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(top), 40, 0.014, 6), chrome)); }
    // 操縦席・後ろのベンチ・サンパッド（クリームの革）、木と銀のハンドル
    const leather = new THREE.MeshStandardMaterial({ color: 0xece3d0, roughness: 0.55 });
    const pad = (w: number, h: number, d: number, x: number, y: number, z: number) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.06, h / 2.2)), leather); m.position.set(x, y, z); yacht.add(m); return m; };
    const hY = deckY(0.47);
    for (const sZ of [-1, 1]) { pad(0.55, 0.16, 0.55, xs(0.47), hY + 0.32, sZ * 0.42); const bk = pad(0.12, 0.42, 0.55, xs(0.47) - 0.27, hY + 0.55, sZ * 0.42); bk.rotation.z = 0.12; box(0.08, 0.26, 0.08, chrome, xs(0.47), hY + 0.15, sZ * 0.42, yacht); }
    pad(0.55, 0.2, 2.0, xs(0.3), deckY(0.3) + 0.2, 0); const bb = pad(0.14, 0.42, 2.0, xs(0.3) - 0.3, deckY(0.3) + 0.4, 0); bb.rotation.z = 0.1;
    pad(1.35, 0.14, 2.1, xs(0.12), deckY(0.12) + 0.1, 0);
    { const fp = pad(1.4, 0.1, 1.3, xs(0.74), deckY(0.74) + 0.1, 0); fp.rotation.z = Math.atan2(deckY(0.8) - deckY(0.68), xs(0.8) - xs(0.68)); }
    { const cY = deckY(0.55), sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 32), teak); sw.position.set(xs(0.55) - 0.24, cY + 0.66, 0.42); sw.rotation.set(0, Math.PI / 2, 0.5); yacht.add(sw); rod(V(xs(0.55) - 0.24, cY + 0.66, 0.42), V(xs(0.55) - 0.05, cY + 0.45, 0.42), 0.02, chrome, yacht, 8);
      const con = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.46, 0.8, 3, 0.07), phys({ color: 0x0b1530, roughness: 0.2, clearcoat: 1 })); con.position.set(xs(0.55), cY + 0.2, 0.42); yacht.add(con); }
    // 後ろのステンレスのアーチ
    { const ta = 0.37, a: THREE.Vector3[] = []; for (let i = 0; i <= 12; i++) { const q = i / 12 * 2 - 1; a.push(V(xs(ta) - 0.25 * (1 - Math.abs(q)) - 0.05, deckY(ta) + 1.05 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(q), 6))) , q * hb(ta) * 0.92)); }
      yacht.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(a), 48, 0.035, 10), chrome)); }
    // 船尾のチークの泳ぎ台
    box(0.5, 0.06, hb(0) * 1.9, teak, -L / 2 - 0.25, 0.66, 0, yacht);
    // 水の下：二つのプロペラ（青銅）・軸・舵
    const bronze = new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 1, roughness: 0.3 });
    for (const sZ of [-1, 1]) {
      const z = sZ * 0.42, ph = V(xs(0.06), 0.05, z);
      rod(V(xs(0.32), 0.28, z), ph, 0.025, chrome, yacht, 8);
      const hub = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 12), bronze); hub.rotation.z = Math.PI / 2; hub.position.copy(ph); yacht.add(hub);
      for (let k = 0; k < 3; k++) { const bl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6), bronze); bl.scale.set(0.12, 1, 0.55); const a2 = (k / 3) * Math.PI * 2; bl.position.set(ph.x, ph.y + Math.cos(a2) * 0.13, z + Math.sin(a2) * 0.13); bl.rotation.x = -a2; bl.rotation.y = 0.5; yacht.add(bl); }
      box(0.3, 0.32, 0.02, chrome, xs(0.0) + 0.08, 0.05, z, yacht);
    }
    // 展示の台：白い低い台と、白い粉体塗装の船台（パッドで船体を支える）
    yacht.position.y = 0.52;
    const cradleM = new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 0.45 }), padM = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.9 });
    const stand = new THREE.Group(); stand.position.set(P.yacht.x, 0, P.yacht.z); stand.rotation.y = P.yacht.ry; scene.add(stand);
    { const pl = new THREE.Mesh(new RoundedBoxGeometry(L + 1.4, 0.16, 3.6, 3, 0.03), plinthM); pl.position.set(0, 0.08, 0); stand.add(pl); }
    for (const t of [0.22, 0.5, 0.72]) {
      const x = xs(t), k = keel(t) + 0.52;
      box(0.16, k - 0.16, 0.16, cradleM, x, 0.16 + (k - 0.16) / 2 - 0.01, 0, stand); box(0.26, 0.04, 0.3, padM, x, k - 0.02, 0, stand);
      box(0.12, 0.08, 2.6, cradleM, x, 0.2, 0, stand);
      for (const sZ of [-1, 1]) { const [y, w] = sec(t, 0.32); const pt = V(x, y + 0.52, sZ * (w + 0.03)); rod(V(x, 0.22, sZ * 1.2), pt, 0.035, cradleM, stand, 10); const pd = box(0.22, 0.03, 0.18, padM, pt.x, pt.y, pt.z, stand); pd.rotation.x = -sZ * 0.9; }
    }
    floorShadow(P.yacht.x, P.yacht.z, 4.2, 9.6, 0.5);
  }

  return { tick: (now: number) => { for (const f of ticks) f(now); } };
}
