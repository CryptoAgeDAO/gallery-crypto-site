// キャップを試着する人物モデル。体は MakeHuman の基本メッシュ（CC0）から作った /demo/avatar.glb
// （体型・腕を下ろしたポーズ・オーバーサイズのTシャツ・ワイドデニム・厚底スニーカーまで書き出し済み）。
// ここでは素材・目・胸のプリントを付け、キャップの単位（およそ 3 cm）に合わせて置く。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// glb は MakeHuman の単位（デシメートル）。頭頂がキャップの天井の少し下（y=3）、頭の中心が開きの中心に来るように置く
const S = 3.2;
const TOP = 10.1382, HEAD_Z = 1.1442, FLOOR_DM = -8.5917;
const OY = 3.2 - TOP * S, OZ = 0.1 - HEAD_Z * S;
export const FLOOR_Y = FLOOR_DM * S + OY;
const EYES = [
  { c: [0.31, 8.9966, 1.316], r: 0.169 },
  { c: [-0.31, 8.9966, 1.316], r: 0.169 },
];

type Person = {
  group: THREE.Group;
  setPrint: (band: string, sub: string, accent: string) => void;
  tick: (t: number) => void;
  dispose: () => void;
};

function printTexture(band: string, sub: string, accent: string) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(236,232,224,.92)';
  const name = band.toUpperCase();
  let fs = 150;
  g.font = `800 ${fs}px "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(name).width > 860 && fs > 50) {
    fs -= 6;
    g.font = `800 ${fs}px "Helvetica Neue", Arial, sans-serif`;
  }
  g.fillText(name, 512, 360);
  g.fillStyle = accent;
  g.fillRect(262, 470, 500, 12);
  g.fillStyle = 'rgba(236,232,224,.85)';
  g.font = `500 52px "Helvetica Neue", Arial, sans-serif`;
  g.fillText(sub.toUpperCase(), 512, 560);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function eyeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#e7e2da';
  x.fillRect(0, 0, 256, 256);
  const gi = x.createRadialGradient(128, 128, 8, 128, 128, 46);
  gi.addColorStop(0, '#2a1a10');
  gi.addColorStop(0.55, '#4f3420');
  gi.addColorStop(1, '#1a1009');
  x.fillStyle = gi;
  x.beginPath();
  x.arc(128, 128, 46, 0, 7);
  x.fill();
  x.fillStyle = '#050505';
  x.beginPath();
  x.arc(128, 128, 17, 0, 7);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 布の細かい凹凸（法線の代わりのバンプ）
function fabricBump() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const im = g.createImageData(256, 256);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = 120 + Math.random() * 30 + ((i / 4) % 2 ? 6 : -6);
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  return t;
}

export function buildPerson(): Person {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(S);
  inner.position.set(0, OY, OZ);
  group.add(inner);
  const bump = fabricBump();
  const eyeTex = eyeTexture();
  let printTex = printTexture('', '', '#888');
  const mats = {
    skin: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color('#e9b8a0'), clearcoat: 0.08, clearcoatRoughness: 0.6 }),
    lashes: new THREE.MeshStandardMaterial({ color: '#1a1410', side: THREE.DoubleSide, transparent: true, opacity: 0.75 }),
    tee: new THREE.MeshPhysicalMaterial({ color: '#141416', roughness: 0.92, sheen: 0.7, sheenRoughness: 0.45, sheenColor: new THREE.Color('#5c5c66'), bumpMap: bump, bumpScale: 0.6, side: THREE.DoubleSide }),
    pants: new THREE.MeshPhysicalMaterial({ color: '#56677c', roughness: 0.95, sheen: 0.5, sheenColor: new THREE.Color('#9fb3cc'), bumpMap: bump, bumpScale: 0.9, side: THREE.DoubleSide }),
    shoes: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide }),
    eye: new THREE.MeshPhysicalMaterial({ map: eyeTex, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    print: new THREE.MeshStandardMaterial({ map: printTex, transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  const extra: THREE.BufferGeometry[] = [];
  let teeGeo: THREE.BufferGeometry | null = null;
  let printMesh: THREE.Mesh | null = null;

  // 胸のプリント：Tシャツの前面の三角形だけを取り出し、正面から投影した UV を付ける
  const makePrint = () => {
    if (!teeGeo || printMesh) return;
    const p = teeGeo.attributes.position as THREE.BufferAttribute;
    const n = teeGeo.attributes.normal as THREE.BufferAttribute;
    const idx = teeGeo.index!;
    const X0 = -1.0, X1 = 1.0, Y0 = 4.7, Y1 = 6.9;
    const pos: number[] = [], uv: number[] = [];
    const a = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < idx.count; i += 3) {
      const ids = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
      let cy = 0, cx = 0, nz = 0;
      ids.forEach((k) => { cx += p.getX(k) / 3; cy += p.getY(k) / 3; nz += n.getZ(k) / 3; });
      if (nz < 0.3 || cx < X0 - 0.1 || cx > X1 + 0.1 || cy < Y0 - 0.1 || cy > Y1 + 0.1) continue;
      ids.forEach((k) => {
        a.fromBufferAttribute(p, k).add(nn.fromBufferAttribute(n, k).multiplyScalar(0.012));
        pos.push(a.x, a.y, a.z);
        uv.push((a.x - X0) / (X1 - X0), (a.y - Y0) / (Y1 - Y0));
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    extra.push(g);
    printMesh = new THREE.Mesh(g, mats.print);
    inner.add(printMesh);
  };

  new GLTFLoader().load('/demo/avatar.glb', (gl) => {
    gl.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const k = (m.name || m.parent?.name || '') as keyof typeof mats;
      if (mats[k]) m.material = mats[k];
      m.castShadow = true;
      m.receiveShadow = true;
      if (k === 'tee') teeGeo = m.geometry;
    });
    inner.add(gl.scene);
    for (const e of EYES) {
      const g = new THREE.SphereGeometry(e.r * 0.98, 32, 24);
      const uv = g.attributes.uv as THREE.BufferAttribute, p = g.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).normalize();
        uv.setXY(i, 0.5 + v.x * 0.5, 0.5 + v.y * 0.5);
      }
      extra.push(g);
      const mm = new THREE.Mesh(g, mats.eye);
      mm.position.set(e.c[0], e.c[1], e.c[2]);
      mm.rotation.x = 0.06;
      inner.add(mm);
    }
    makePrint();
  });

  return {
    group,
    setPrint(band, sub, accent) {
      printTex.dispose();
      printTex = printTexture(band, sub, accent);
      mats.print.map = printTex;
      mats.print.needsUpdate = true;
    },
    tick() {},
    dispose() {
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      extra.forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
      bump.dispose();
      eyeTex.dispose();
      printTex.dispose();
    },
  };
}

// グレーのスタジオ（霧のかかった、冷たい光の無地の背景）
export function duskBackground() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d')!;
  const v = g.createLinearGradient(0, 0, 0, c.height);
  v.addColorStop(0, '#8c8f93');
  v.addColorStop(0.55, '#b9bbbd');
  v.addColorStop(0.78, '#c9cacb');
  v.addColorStop(1, '#a9abad');
  g.fillStyle = v;
  g.fillRect(0, 0, c.width, c.height);
  const r = g.createRadialGradient(512, 560, 80, 512, 560, 720);
  r.addColorStop(0, 'rgba(255,255,255,.18)');
  r.addColorStop(1, 'rgba(40,42,46,.35)');
  g.fillStyle = r;
  g.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
