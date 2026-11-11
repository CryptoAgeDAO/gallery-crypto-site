// キャップを試着する人物モデル。体は MakeHuman の基本メッシュ（CC0）から作った /demo/avatar.glb
// （体型・腕を下ろしたポーズ・オーバーサイズのTシャツ・ワイドデニム・厚底スニーカーまで書き出し済み）。
// ここでは素材・目・胸のプリントを付け、キャップの単位（およそ 3 cm）に合わせて置く。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// glb は MakeHuman の単位（デシメートル）。頭頂がキャップの天井の少し下（y=3）、頭の中心が開きの中心に来るように置く
const S = 3.0;
const TOP = 10.1526, FLOOR_DM = -8.5917;
const OY = 2.2 - TOP * S, OZ = -0.51 * S; // 帽子の開きの高さで、頭の前後の中心（0.51 dm）を開きの中心に
export const FLOOR_Y = FLOOR_DM * S + OY;
const EYES = [
  { c: [0.31, 8.9989, 1.312], r: 0.169 },
  { c: [-0.31, 8.9989, 1.312], r: 0.169 },
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
  gi.addColorStop(0, '#3a3a22');
  gi.addColorStop(0.5, '#6a5a36');
  gi.addColorStop(1, '#2b2414');
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

// 髪の束（細い線が何本も並ぶ透明度の模様。先に行くほど細る）
function hairTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 512);
  for (let i = 0; i < 140; i++) {
    const x = 2 + Math.random() * 124;
    const end = 512 * (0.6 + Math.random() * 0.4);
    const gr = g.createLinearGradient(0, 0, 0, end);
    gr.addColorStop(0, `rgba(255,255,255,${0.8 + Math.random() * 0.2})`);
    gr.addColorStop(0.8, `rgba(255,255,255,${0.45 + Math.random() * 0.3})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr;
    g.lineWidth = 0.8 + Math.random() * 1.4;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + (Math.random() - 0.5) * 10, end * 0.4, x + (Math.random() - 0.5) * 14, end * 0.7, x + (Math.random() - 0.5) * 16, end);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  return t;
}

// 髪の色（根元は暗め、毛先は明るいブロンド）
function hairColor() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const l = g.createLinearGradient(0, 0, 0, 256);
  l.addColorStop(0, '#5a4128');
  l.addColorStop(0.35, '#a8834f');
  l.addColorStop(1, '#e2c890');
  g.fillStyle = l;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 肌の毛穴（細かいランダムの凹凸）
function poreBump() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.12})`;
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, 0.6 + Math.random() * 0.9, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(24, 24);
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
  const hairTex = hairTexture();
  const hairCol = hairColor();
  const pores = poreBump();
  let printTex = printTexture('', '', '#888');
  const mats = {
    skin: new THREE.MeshPhysicalMaterial({ vertexColors: true, bumpMap: pores, bumpScale: 0.35, roughness: 0.56, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color('#e9b8a0'), clearcoat: 0.08, clearcoatRoughness: 0.6 }),
    hair: new THREE.MeshPhysicalMaterial({ map: hairCol, alphaMap: hairTex, alphaTest: 0.25, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.48, sheen: 0.8, sheenRoughness: 0.35, sheenColor: new THREE.Color('#f2dcae') }),
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
      const g = new THREE.SphereGeometry(e.r * 0.95, 32, 24);
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
      hairTex.dispose();
      hairCol.dispose();
      pores.dispose();
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
