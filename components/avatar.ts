// キャップを試着する人物モデル（オリジナルのゲーム風アバター）。単位はキャップと同じ（およそ 3 cm）。
// 帽子の開き（y=0）が額の高さに来るように、頭・首・Tシャツ・腕・デニム・スニーカーを組み立てる。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const FLOOR_Y = -53.8;

type Person = {
  group: THREE.Group;
  setPrint: (band: string, sub: string, accent: string) => void;
  tick: (t: number) => void;
  dispose: () => void;
};

function teeTexture(band: string, sub: string, accent: string) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#16151a';
  g.fillRect(0, 0, c.width, c.height);
  // 生地の細かいムラ
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  }
  // 胸のプリント（前の中心 = 横方向の真ん中）
  const cx = c.width / 2;
  const cy = c.height * 0.6;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#F2EEE6';
  const name = band.toUpperCase();
  let fs = 92;
  g.font = `900 ${fs}px Impact, "Arial Black", sans-serif`;
  while (g.measureText(name).width > 420 && fs > 40) {
    fs -= 4;
    g.font = `900 ${fs}px Impact, "Arial Black", sans-serif`;
  }
  g.fillText(name, cx, cy - 46);
  g.fillStyle = accent;
  g.fillRect(cx - 170, cy + 6, 340, 10);
  g.fillStyle = '#F2EEE6';
  g.font = `600 34px "Arial Narrow", Arial, sans-serif`;
  g.fillText(sub.toUpperCase(), cx, cy + 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildPerson(): Person {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const keep = <T extends THREE.BufferGeometry>(g: T) => (geos.push(g), g);
  const mat = <T extends THREE.Material>(m: T) => (mats.push(m), m);
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], s?: [number, number, number], r?: [number, number, number]) => {
    const mesh = new THREE.Mesh(keep(geo), m);
    mesh.position.set(...p);
    if (s) mesh.scale.set(...s);
    if (r) mesh.rotation.set(...r);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const skin = mat(new THREE.MeshPhysicalMaterial({ color: '#9C6648', roughness: 0.5, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffd7bf') }));
  const hair = mat(new THREE.MeshStandardMaterial({ color: '#17120F', roughness: 0.9 }));
  const denim = mat(new THREE.MeshPhysicalMaterial({ color: '#30496B', roughness: 0.92, sheen: 0.4, sheenColor: new THREE.Color('#7f9cc4') }));
  const shoe = mat(new THREE.MeshStandardMaterial({ color: '#F1EEE7', roughness: 0.6 }));
  const sole = mat(new THREE.MeshStandardMaterial({ color: '#C9C3B8', roughness: 0.8 }));
  const glass = mat(new THREE.MeshPhysicalMaterial({ color: '#0d0d10', roughness: 0.08, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }));
  const frame = mat(new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4 }));
  const gold = mat(new THREE.MeshStandardMaterial({ color: '#D9A93A', roughness: 0.25, metalness: 1 }));
  const dark = mat(new THREE.MeshStandardMaterial({ color: '#5A3426', roughness: 0.7 }));
  let teeMap = teeTexture('', '', '#FF3D7F');
  const tee = mat(new THREE.MeshPhysicalMaterial({ map: teeMap, roughness: 0.9, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color('#55525e') }));
  const teePlain = mat(new THREE.MeshPhysicalMaterial({ color: '#16151a', roughness: 0.9, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color('#55525e') }));

  // ── 頭（帽子の中に収まる大きさ）──
  const head = new THREE.Group();
  group.add(head);
  const HC = -0.8; // 頭の中心
  add(head, new THREE.SphereGeometry(1, 48, 32), skin, [0, HC, 0.05], [2.62, 3.6, 2.92]);
  // あご・頬
  add(head, new THREE.SphereGeometry(1, 32, 24), skin, [0, HC - 2.35, 0.75], [1.75, 1.45, 1.85]);
  // 髪（横と後ろ、帽子の下からのぞく部分）
  add(head, new THREE.SphereGeometry(1, 48, 32, Math.PI / 2 + 1.2, Math.PI * 2 - 2.4, 0, Math.PI * 0.6), hair, [0, HC + 0.05, 0.02], [2.7, 3.66, 3.0]);
  // 耳
  for (const sx of [-1, 1]) add(head, new THREE.SphereGeometry(1, 20, 16), skin, [sx * 2.58, HC - 0.55, -0.1], [0.32, 0.85, 0.6], [0, sx * 0.25, 0]);
  // 鼻・口
  add(head, new THREE.SphereGeometry(1, 20, 16), skin, [0, HC - 1.15, 2.95], [0.36, 0.62, 0.45]);
  add(head, new RoundedBoxGeometry(0.95, 0.12, 0.2, 2, 0.05), dark, [0, HC - 2.25, 2.62]);
  // サングラス
  for (const sx of [-1, 1]) {
    add(head, new RoundedBoxGeometry(1.2, 0.78, 0.16, 4, 0.12), glass, [sx * 0.72, HC - 0.25, 3.02], undefined, [0, sx * 0.22, 0]);
    add(head, new THREE.CylinderGeometry(0.05, 0.05, 2.7, 8), frame, [sx * 2.05, HC - 0.15, 1.5], undefined, [Math.PI / 2, 0, sx * 0.08]);
  }
  add(head, new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), frame, [0, HC - 0.12, 3.12], undefined, [0, 0, Math.PI / 2]);

  // ── 首から下（首を短く見せるため、全体を少し持ち上げる）──
  const low = new THREE.Group();
  low.position.y = 1.2;
  group.add(low);
  add(group, new THREE.CylinderGeometry(1.85, 2.05, 3.6, 32), skin, [0, -4.9, -0.1]);

  // ── 胴（Tシャツ）。前の中心にプリントが来るように、継ぎ目を後ろにする ──
  const body = new THREE.Group();
  low.add(body);
  const prof: [number, number][] = [
    [6.1, -24.5], [5.95, -22], [5.75, -19.5], [6.0, -17], [6.55, -14.5], [6.95, -12.2], [7.2, -10.4], [6.6, -8.9], [4.6, -7.6], [2.3, -6.9], [2.0, -6.6],
  ];
  const torsoGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 96, Math.PI, Math.PI * 2);
  const torso = add(body, torsoGeo, tee, [0, 0, 0], [1, 1, 0.62]);
  // すそと襟のリブ
  add(body, new THREE.TorusGeometry(6.1, 0.18, 8, 64), teePlain, [0, -24.45, 0], [1, 0.62, 1], [Math.PI / 2, 0, 0]);
  add(body, new THREE.TorusGeometry(2.05, 0.22, 8, 48), teePlain, [0, -6.7, -0.1], [1, 0.95, 1], [Math.PI / 2, 0, 0]);
  // 金のチェーン
  add(body, new THREE.TorusGeometry(2.25, 0.12, 8, 64), gold, [0, -7.7, 0.35], [1.05, 1, 1], [Math.PI / 2 - 0.55, 0, 0]);

  // ── 腕 ──
  const arms: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(sx * 6.25, -9.9, -0.2);
    sh.rotation.set(0.04, 0, sx * 0.13);
    body.add(sh);
    arms.push(sh);
    add(sh, new THREE.SphereGeometry(2.05, 24, 16), teePlain, [0, 0.1, 0], [1, 1, 0.95]);
    add(sh, new THREE.CylinderGeometry(2.0, 1.85, 5.6, 28, 1, true), teePlain, [0, -2.6, 0]);
    add(sh, new THREE.CapsuleGeometry(1.62, 8.0, 8, 20), skin, [0, -5.4, 0]);
    const el = new THREE.Group();
    el.position.set(0, -10.2, 0);
    el.rotation.set(-0.18, 0, -sx * 0.04);
    sh.add(el);
    add(el, new THREE.CapsuleGeometry(1.38, 7.2, 8, 20), skin, [0, -4.1, 0], [1, 1, 0.92]);
    // 手首と手
    add(el, new THREE.CapsuleGeometry(1.0, 2.1, 6, 16), skin, [0, -9.4, 0.1], [0.75, 1, 1.15]);
    if (sx > 0) add(el, new THREE.TorusGeometry(1.0, 0.16, 8, 32), gold, [0, -7.9, 0], [1, 1, 0.9], [Math.PI / 2, 0, 0]);
  }

  // ── 腰とデニム ──
  add(low, new THREE.SphereGeometry(1, 40, 24), denim, [0, -25.6, 0], [6.0, 3.2, 3.75]);
  add(low, new THREE.CylinderGeometry(6.0, 6.0, 0.9, 48, 1, true), mat(new THREE.MeshStandardMaterial({ color: '#2a1f18', roughness: 0.6 })), [0, -24.2, 0], [1, 1, 0.63]);
  add(low, new RoundedBoxGeometry(1.4, 0.9, 0.4, 2, 0.12), gold, [0, -24.25, 3.75]);
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 2.85, -27.2, 0);
    hip.rotation.set(0, 0, sx * 0.025);
    low.add(hip);
    add(hip, new THREE.CylinderGeometry(3.0, 2.25, 13, 32), denim, [0, -6.2, 0]);
    add(hip, new THREE.SphereGeometry(2.25, 24, 16), denim, [0, -12.7, 0.05]);
    add(hip, new THREE.CylinderGeometry(2.2, 2.3, 12.2, 32), denim, [0, -18.9, 0.05]);
    // スニーカー
    add(hip, new RoundedBoxGeometry(3.3, 2.0, 8.6, 4, 0.9), shoe, [0, -26.3, 1.55]);
    add(hip, new RoundedBoxGeometry(3.45, 0.7, 8.9, 3, 0.3), sole, [0, -27.45, 1.55]);
    add(hip, new RoundedBoxGeometry(0.2, 0.9, 3.8, 2, 0.08), mat(new THREE.MeshStandardMaterial({ color: '#FF3D7F', roughness: 0.5 })), [sx * 1.68, -26.2, 1.0]);
  }

  return {
    group,
    setPrint(band, sub, accent) {
      teeMap.dispose();
      teeMap = teeTexture(band, sub, accent);
      (tee as THREE.MeshPhysicalMaterial).map = teeMap;
      tee.needsUpdate = true;
    },
    // 呼吸と腕のわずかな揺れ（頭は帽子と一緒に固定）
    tick(t) {
      const b = Math.sin(t * 1.6);
      torso.scale.set(1 + b * 0.008, 1, 0.62 * (1 + b * 0.012));
      arms.forEach((a, i) => (a.rotation.x = 0.04 + Math.sin(t * 0.9 + i) * 0.02));
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      teeMap.dispose();
    },
  };
}

// 夕暮れの街の背景（試着のときだけ）
export function duskBackground() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, '#140c26');
  sky.addColorStop(0.42, '#5b1f4d');
  sky.addColorStop(0.62, '#e2525e');
  sky.addColorStop(0.74, '#ffa760');
  sky.addColorStop(0.8, '#ffd08a');
  sky.addColorStop(0.81, '#2a1830');
  sky.addColorStop(1, '#120c18');
  g.fillStyle = sky;
  g.fillRect(0, 0, c.width, c.height);
  // 太陽
  const sun = g.createRadialGradient(640, 760, 10, 640, 760, 220);
  sun.addColorStop(0, 'rgba(255,240,200,.95)');
  sun.addColorStop(0.25, 'rgba(255,180,110,.55)');
  sun.addColorStop(1, 'rgba(255,120,90,0)');
  g.fillStyle = sun;
  g.fillRect(0, 400, 1024, 430);
  // ビルのシルエット
  let x = 0;
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  while (x < c.width) {
    const w = 30 + rnd() * 70;
    const h = 60 + rnd() * 230;
    g.fillStyle = '#24152f';
    g.fillRect(x, 830 - h, w, h);
    g.fillStyle = 'rgba(255,200,120,.55)';
    for (let wy = 830 - h + 10; wy < 820; wy += 14) for (let wx = x + 6; wx < x + w - 6; wx += 11) if (rnd() > 0.72) g.fillRect(wx, wy, 4, 6);
    x += w + 2;
  }
  // ヤシの木（2本）
  const palm = (px: number, ph: number) => {
    g.strokeStyle = '#1a0f22';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(px, 830);
    g.quadraticCurveTo(px + 30, 830 - ph / 2, px + 18, 830 - ph);
    g.stroke();
    g.lineWidth = 6;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      g.beginPath();
      g.moveTo(px + 18, 830 - ph);
      g.quadraticCurveTo(px + 18 + Math.cos(a) * 50, 830 - ph - 30, px + 18 + Math.cos(a) * 90, 830 - ph + 30 + Math.abs(Math.sin(a)) * 20);
      g.stroke();
    }
  };
  palm(120, 330);
  palm(880, 280);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
