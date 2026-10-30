'use client';

// MA-1 フライトジャケットの 3D モックアップ。首の後ろの縫い目に NFC タグを縫い込み、その場で分解図を見せる。
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M, collar, cuffRib, hemRib, sleeve, sleeveFrameAt, torso, torsoFrame, yTop, zipPath } from './ma1Geometry';
import { canvasTex, makeInlay } from './nfcParts';
import { TAG_LAYERS } from '@/lib/nfcSteps';

export type JacketPiece = { cert: string; qr: string };
const COLOURS = [
  { k: 'Sage', shell: '#59614B', rib: '#4A5140' },
  { k: 'Black', shell: '#1A1A1A', rib: '#141414' },
  { k: 'Navy', shell: '#20283A', rib: '#1A2030' },
];
const LINING = '#D9692B';

type Api = {
  colour: (i: number) => void; spin: (v: boolean) => void; dark: (v: boolean) => void; hang: (v: boolean) => void;
  view: (k: 'front' | 'side' | 'back' | 'neck') => void; explode: (v: boolean) => void; see: (v: boolean) => void;
  select: (v: boolean) => void; setScale: (v: number) => void; reset: () => void; shot: () => string;
};

function tex(draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number, repeat?: [number, number], color = false) {
  const t = canvasTex(draw, w, h);
  if (!color) t.colorSpace = THREE.NoColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
// ナイロンツイルの細かな綾目
const twill = () => tex((c, w, h) => {
  const im = c.createImageData(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const v = 128 + 38 * Math.sin(((i + j) % 6) * (Math.PI / 3)) + (Math.random() - 0.5) * 22;
    const k = (j * w + i) * 4;
    im.data[k] = im.data[k + 1] = im.data[k + 2] = v; im.data[k + 3] = 255;
  }
  c.putImageData(im, 0, 0);
}, 256, 256, [26, 26]);
// リブ編みの縦の畝
const ribbing = () => tex((c, w, h) => {
  for (let i = 0; i < w; i++) { const v = 128 + 110 * Math.sin((i / w) * Math.PI * 2 * 8); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(i, 0, 1, h); }
}, 128, 8);
// 縫い目（点線）
const dashes = () => tex((c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(0, 0, w * 0.62, h); }, 32, 4);

function stitch(curve: THREE.Curve<THREE.Vector3>, color: string, dash: THREE.Texture) {
  const len = curve.getLength();
  const g = new THREE.TubeGeometry(curve, Math.max(20, Math.round(len * 40)), 0.009, 4, false);
  const a = dash.clone();
  a.repeat.set(len / 0.07, 1);
  a.needsUpdate = true;
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.8, alphaMap: a, alphaTest: 0.5 }));
}

export default function JacketViewer({ piece }: { piece: JacketPiece }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const [colour, setColour] = useState(0);
  const [spin, setSpin] = useState(true);
  const [dark, setDark] = useState(false);
  const [hang, setHang] = useState(true);
  const [exploded, setExploded] = useState(false);
  const [see, setSee] = useState(false);
  const [sel, setSel] = useState(false);
  const [size, setSize] = useState(1);
  const ui = useRef({ setSpin, setSel, setSize });
  ui.current = { setSpin, setSel, setSize };

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * 1.25, 3));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const scene = new THREE.Scene();
    const bgLight = new THREE.Color('#EFEDE8'), bgDark = new THREE.Color('#131211');
    scene.background = bgLight;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.9;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
    const HOME_T = new THREE.Vector3(0, 0.1, 0);
    let homeZ = 27;
    camera.position.set(0, 1.2, homeZ);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(HOME_T);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 2.2;
    controls.maxDistance = 45;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 2.2;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.3;

    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(7, 11, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11 });
    key.shadow.radius = 7;
    key.shadow.bias = -0.0004;
    const rim = new THREE.DirectionalLight(0xfff1e2, 1.6);
    rim.position.set(-9, 6, -10);
    const fill = new THREE.DirectionalLight(0xe8eeff, 0.5);
    fill.position.set(-10, 2, 8);
    scene.add(key, rim, fill, new THREE.HemisphereLight(0xffffff, 0x80796e, 0.35));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.16 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = M.Y0 - M.RIB - 2.0;
    floor.receiveShadow = true;
    scene.add(floor);

    // ── 素材
    const tw = twill(), rb = ribbing(), dash = dashes();
    tw.anisotropy = rb.anisotropy = maxAniso;
    const shell = new THREE.MeshPhysicalMaterial({ color: COLOURS[0].shell, roughness: 0.56, sheen: 0.6, sheenRoughness: 0.45, clearcoat: 0.08, clearcoatRoughness: 0.6, bumpMap: tw, bumpScale: 0.25 });
    const lining = new THREE.MeshStandardMaterial({ color: LINING, roughness: 0.55, side: THREE.BackSide });
    const rib = new THREE.MeshPhysicalMaterial({ color: COLOURS[0].rib, roughness: 0.95, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color('#888'), bumpMap: rb, bumpScale: 1.6, side: THREE.DoubleSide });
    const metal = new THREE.MeshStandardMaterial({ color: '#B9B5AC', metalness: 1, roughness: 0.28 });
    const tape = new THREE.MeshStandardMaterial({ color: COLOURS[0].rib, roughness: 0.85 });
    const threadCol = () => new THREE.Color(COLOURS[cur].shell).multiplyScalar(0.7);
    let cur = 0;

    const jacket = new THREE.Group();
    scene.add(jacket);
    const add = (g: THREE.BufferGeometry, m: THREE.Material, inner?: THREE.Material) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      jacket.add(mesh);
      if (inner) jacket.add(new THREE.Mesh(g, inner));
      return mesh;
    };
    add(torso(1, false), shell, lining);
    add(torso(-1, true), shell, lining);
    add(sleeve(1, true), shell, lining);
    add(sleeve(-1, false), shell, lining);
    add(hemRib(), rib);
    add(collar(), rib);
    add(cuffRib(1, true), rib);
    add(cuffRib(-1, false), rib);

    // ファスナー：テープ・務歯・引き手
    const zp = zipPath();
    const zipLen = zp.getLength();
    {
      const N = Math.round(zipLen / 0.05);
      const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.03, 0.035), metal, N);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i = 0; i < N; i++) {
        const t = (i + 0.5) / N;
        const p = zp.getPointAt(t);
        const tg = zp.getTangentAt(t);
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg);
        m.compose(p.clone().add(new THREE.Vector3((i % 2 ? 1 : -1) * 0.018, 0, 0.012)), q, new THREE.Vector3(1, 1, 1));
        teeth.setMatrixAt(i, m);
      }
      teeth.castShadow = true;
      jacket.add(teeth);
      for (const sx of [-1, 1]) {
        const off = new THREE.CatmullRomCurve3(zp.getSpacedPoints(80).map((p) => p.clone().add(new THREE.Vector3(sx * 0.1, 0, -0.005))));
        jacket.add(new THREE.Mesh(new THREE.TubeGeometry(off, 160, 0.055, 4, false), tape));
        const st = new THREE.CatmullRomCurve3(zp.getSpacedPoints(80).map((p) => p.clone().add(new THREE.Vector3(sx * 0.2, 0, -0.012))));
        const s = stitch(st, '#000', dash);
        s.userData.thread = true;
        jacket.add(s);
      }
    }
    const pullTop = zp.getPointAt(0.985);
    const puller = new THREE.Group();
    {
      const slider = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.22, 0.08, 3, 0.03), metal);
      const tab = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.34, 0.03, 3, 0.012), metal);
      tab.position.set(0, -0.26, 0.05);
      tab.rotation.x = 0.25;
      puller.add(slider, tab);
      puller.position.copy(pullTop).add(new THREE.Vector3(0, -0.16, 0.05));
      puller.traverse((o) => { o.castShadow = true; });
      jacket.add(puller);
    }

    // 胴の斜めの雨蓋つきポケット（左右）
    for (const sx of [-1, 1]) {
      const f = torsoFrame(sx * 1.75, -1.25, 1);
      const g = new THREE.Group();
      const flap = new THREE.Mesh(new RoundedBoxGeometry(1.45, 0.5, 0.06, 4, 0.025), shell);
      flap.castShadow = true;
      const snap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 24), metal);
      snap.rotation.x = Math.PI / 2;
      snap.position.set(0, -0.08, 0.05);
      const welt = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.06, 0.03, 2, 0.01), tape);
      welt.position.set(0, -0.31, -0.01);
      g.add(flap, snap, welt);
      const st = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.66, -0.18, 0.033), new THREE.Vector3(0.66, -0.18, 0.033)]);
      const s = stitch(st, '#000', dash);
      s.userData.thread = true;
      g.add(s);
      g.position.copy(f.p).add(f.n.clone().multiplyScalar(0.03));
      g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.tx.clone().multiplyScalar(sx > 0 ? 1 : 1), f.ty, f.n));
      g.rotateZ(sx * -0.95);
      jacket.add(g);
    }

    // 左袖のユーティリティポケット（ファスナーとペン差し）
    {
      const f = sleeveFrameAt(1, 0.12, 0.3);
      const g = new THREE.Group();
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.9, 1.15, 0.1, 4, 0.04), shell);
      body.castShadow = true;
      const zip = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.05, 0.03, 2, 0.01), metal);
      zip.position.set(0, 0.38, 0.06);
      g.add(body, zip);
      for (const px of [-0.3, -0.12]) {
        const slot = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.62, 0.05, 3, 0.02), shell);
        slot.position.set(px, -0.12, 0.08);
        g.add(slot);
      }
      const up = f.tv.clone().negate();
      const x = new THREE.Vector3().crossVectors(up, f.n).normalize();
      g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, new THREE.Vector3().crossVectors(f.n, x), f.n));
      g.position.copy(f.p).add(f.n.clone().multiplyScalar(0.04));
      jacket.add(g);
    }

    // 首の後ろ：織りネーム＋NFC タグ（襟の縫い目に上辺だけ縫い込む）
    const neckY = yTop(0, false) - 0.04;
    const backZ = M.NCZ - M.NZ + 0.09;
    const neck = new THREE.Group();
    neck.position.set(0, neckY, backZ);
    neck.rotation.x = 0.08;
    jacket.add(neck);
    const TW = 0.36, TH = 0.5;
    const faceMat = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      transparent: true,
      map: canvasTex((c, w, h) => {
        c.fillStyle = '#2E2C2A'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(255,255,255,.04)';
        for (let y = 0; y < h; y += 3) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
        c.fillStyle = '#D9D4CA'; c.textAlign = 'center';
        c.font = '600 64px monospace'; c.fillText(piece.cert.replace('GC-', ''), w / 2, h * 0.42);
        c.font = '500 26px monospace'; c.fillText('GALLERY CRYPTO', w / 2, h * 0.78); c.fillText('TOKYO', w / 2, h * 0.86);
        c.font = '500 20px monospace'; c.fillText('NFC ◉', w / 2, h * 0.95);
      }, 288, 400),
    });
    const face = new THREE.Mesh(new THREE.BoxGeometry(TW, TH, 0.012), faceMat);
    const inlay = makeInlay(TW * 0.8, TH * 0.62, 0.6);
    const backing = new THREE.Mesh(new THREE.BoxGeometry(TW, TH, 0.01), new THREE.MeshStandardMaterial({ color: '#E6E1D6', roughness: 0.95 }));
    const layers = [backing, inlay, face];
    layers.forEach((o) => { o.position.y = -TH / 2; neck.add(o); });
    const seam = stitch(new THREE.CatmullRomCurve3([new THREE.Vector3(-TW / 2 - 0.05, -0.04, 0.012), new THREE.Vector3(TW / 2 + 0.05, -0.04, 0.012)]), '#D9D4CA', dash);
    neck.add(seam);
    // 分解図の説明（左から番号・名前・ひとこと）
    const callouts = TAG_LAYERS.map((l, i) => {
      const t = canvasTex((c, w, h) => {
        c.fillStyle = 'rgba(250,250,248,.95)'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#111'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, w - 3, h - 3);
        c.fillStyle = '#C47A45'; c.font = '500 28px monospace'; c.fillText(`0${i + 1}`, 26, 52);
        c.fillStyle = '#111'; c.font = '500 52px Georgia, serif'; c.fillText(l.title, 26, 122);
        c.fillStyle = '#6B6862'; c.font = '500 25px sans-serif';
        const words = l.body.split(' ');
        let line = '', y = 170;
        words.forEach((wd) => { if (c.measureText(line + wd).width > w - 52) { c.fillText(line, 26, y); line = ''; y += 34; } line += wd + ' '; });
        c.fillText(line, 26, y);
      }, 640, 260);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, opacity: 0, toneMapped: false }));
      sp.renderOrder = 20;
      sp.scale.set(0.95, 0.386, 1);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#C47A45', depthTest: false, transparent: true, opacity: 0 }));
      line.renderOrder = 19;
      neck.add(sp, line);
      return { sp, line };
    });
    let explodeT = 0, explodeGoal = 0, seeGoal = 0, seeT = 0;

    // 下げ札（ファスナーの引き手から）：動かせる・大きさを変えられる
    const hangG = new THREE.Group();
    {
      const tagMesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.12, 0.012), new THREE.MeshStandardMaterial({ color: '#B7B1A6', roughness: 0.9 }));
      const im = new Image();
      im.onload = () => {
        const t = canvasTex((c, w, h) => {
          c.fillStyle = '#B7B1A6'; c.fillRect(0, 0, w, h);
          c.fillStyle = '#F1EFEA'; c.beginPath(); c.arc(w / 2, 46, 16, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#8F887C'; c.textAlign = 'center'; c.font = '500 26px monospace'; c.fillText('GALLERY CRYPTO', w / 2, 120);
          c.fillStyle = '#fff'; c.fillRect(w / 2 - 150, 170, 300, 300);
          c.drawImage(im, w / 2 - 135, 185, 270, 270);
          c.fillStyle = '#33312E'; c.font = 'italic 54px Georgia, serif'; c.fillText(piece.cert.replace('GC-', ''), w / 2, 570);
          c.font = '500 20px monospace'; c.fillText('SCAN TO VERIFY', w / 2, 640);
        }, 400, 720);
        (tagMesh.material as THREE.MeshStandardMaterial).map = t;
        (tagMesh.material as THREE.MeshStandardMaterial).color.set('#ffffff');
        (tagMesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
      };
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(piece.qr);
      tagMesh.position.set(0, -0.86, 0);
      tagMesh.castShadow = true;
      const str = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.03, -0.15, 0.02), new THREE.Vector3(0, -0.31, 0)]);
      hangG.add(tagMesh, new THREE.Mesh(new THREE.TubeGeometry(str, 16, 0.012, 5, false), new THREE.MeshStandardMaterial({ color: '#E9E3D6', roughness: 1 })));
      hangG.position.copy(puller.position).add(new THREE.Vector3(0, -0.42, 0.1));
      hangG.rotation.set(0.12, 0.25, 0.04);
      jacket.add(hangG);
    }
    const hangHome = { p: hangG.position.clone(), r: hangG.rotation.clone() };

    // ── 選択とドラッグ（下げ札）
    let box: THREE.BoxHelper | null = null;
    let selected = false;
    const select = (on: boolean) => {
      selected = on;
      if (box) { scene.remove(box); box.dispose(); box = null; }
      if (on) { box = new THREE.BoxHelper(hangG, 0xc47a45); scene.add(box); }
      ui.current.setSel(on);
      ui.current.setSize(hangG.scale.x);
    };
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const toNdc = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };
    const hitHang = (e: { clientX: number; clientY: number }) => { if (!hangG.visible) return null; toNdc(e); return ray.intersectObject(hangG, true)[0] || null; };
    const plane = new THREE.Plane();
    let drag: { off: THREE.Vector3; id: number } | null = null;
    let fly: { t: THREE.Vector3; p: THREE.Vector3 } | null = null;
    const stop = () => { controls.autoRotate = false; ui.current.setSpin(false); };
    const onDown = (e: PointerEvent) => {
      const h = hitHang(e);
      if (!h) { if (e.isPrimary && selected) select(false); return; }
      e.stopPropagation(); e.preventDefault();
      stop(); select(true);
      const toCam = camera.getWorldDirection(new THREE.Vector3()).negate();
      const depth = h.point.clone().sub(controls.target).dot(toCam);
      plane.setFromNormalAndCoplanarPoint(toCam, h.point.clone().add(toCam.clone().multiplyScalar(Math.max(0, 1.9 - depth))));
      drag = { off: hangG.getWorldPosition(new THREE.Vector3()).sub(h.point), id: e.pointerId };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        e.stopPropagation();
        toNdc(e);
        const pt = ray.ray.intersectPlane(plane, new THREE.Vector3());
        if (pt) hangG.position.copy(jacket.worldToLocal(pt.add(drag.off)));
        return;
      }
      if (e.pointerType === 'mouse') el.style.cursor = hitHang(e) ? 'move' : '';
    };
    const onUp = (e: PointerEvent) => { if (drag && e.pointerId === drag.id) { e.stopPropagation(); drag = null; } };
    const onWheel = (e: WheelEvent) => {
      if (!selected || !hitHang(e)) return;
      e.stopPropagation(); e.preventDefault();
      const v = THREE.MathUtils.clamp(hangG.scale.x * Math.exp(-e.deltaY * 0.0015), 0.5, 4);
      hangG.scale.setScalar(v);
      ui.current.setSize(v);
    };
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove, { capture: true });
    el.addEventListener('pointerup', onUp, { capture: true });
    el.addEventListener('pointercancel', onUp, { capture: true });
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });

    let first = true;
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      homeZ = w < 600 ? 36 : 27;
      if (first) camera.position.z = homeZ;
      first = false;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const neckWorld = () => neck.getWorldPosition(new THREE.Vector3());
    const views = {
      front: () => ({ t: HOME_T.clone(), p: new THREE.Vector3(0, 1.2, homeZ) }),
      side: () => ({ t: HOME_T.clone(), p: new THREE.Vector3(homeZ, 1.2, 0) }),
      back: () => ({ t: HOME_T.clone(), p: new THREE.Vector3(0, 1.2, -homeZ) }),
      // 襟の中をのぞきこむ（前の上から）
      neck: () => { const n = neckWorld(); return { t: n.clone().add(new THREE.Vector3(0, -0.25, 0.5)), p: n.clone().add(new THREE.Vector3(0.5, 3.4, 2.6)) }; },
      explode: () => { const n = neckWorld(); return { t: n.clone().add(new THREE.Vector3(0.55, 1.05, 0.9)), p: n.clone().add(new THREE.Vector3(1.2, 2.0, 6.6)) }; },
    };

    let raf = 0;
    const clock = new THREE.Clock();
    const loop = () => {
      const dt = Math.min(0.1, clock.getDelta());
      const ease = 1 - Math.exp(-dt * 4.5);
      if (fly) {
        controls.target.lerp(fly.t, ease);
        camera.position.lerp(fly.p, ease);
        if (camera.position.distanceTo(fly.p) < 0.01) fly = null;
      }
      explodeT += (explodeGoal - explodeT) * ease;
      seeT += (seeGoal - seeT) * ease;
      // 分解：裏地 → アンテナとチップ → 表の織りネーム、の順に、襟の上へ引き出して並べる
      const e = explodeT;
      layers.forEach((o, i) => {
        o.position.set(e * (0.25 - (2 - i) * 0.52), -TH / 2 + e * (1.3 + (2 - i) * 0.1), 0.006 * i + e * (0.12 + i * 0.4));
        o.scale.setScalar(1 + e * 1.1);
        o.rotation.set(-e * 0.1, e * -0.2, 0);
      });
      callouts.forEach((c, i) => {
        const o = layers[2 - i];
        const s = o.scale.x;
        const tip = o.position.clone().add(new THREE.Vector3((TW / 2) * s * 0.9, (TH / 4) * s, 0));
        const at = new THREE.Vector3(0.8 + TW * s * 0.5, 1.85 - i * 0.56, o.position.z);
        c.sp.position.copy(at).add(new THREE.Vector3(0.48, 0, 0));
        (c.sp.material as THREE.SpriteMaterial).opacity = smooth01(e, 0.55, 1);
        const pos = c.line.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, tip.x, tip.y, tip.z);
        pos.setXYZ(1, at.x, at.y, at.z);
        pos.needsUpdate = true;
        (c.line.material as THREE.LineBasicMaterial).opacity = smooth01(e, 0.55, 1);
      });
      faceMat.opacity = 1 - 0.7 * Math.max(seeT, 0);
      inlay.visible = seeT > 0.02 || e > 0.02;
      if (box) box.update();
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    const smooth01 = (x: number, a: number, b: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    loop();

    const setColour = (i: number) => {
      cur = i;
      shell.color.set(COLOURS[i].shell);
      shell.sheenColor = new THREE.Color(COLOURS[i].shell).lerp(new THREE.Color('#ffffff'), 0.3);
      rib.color.set(COLOURS[i].rib);
      tape.color.set(COLOURS[i].rib);
      jacket.traverse((o) => { if (o.userData.thread) ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.copy(threadCol()); });
    };
    setColour(0);

    api.current = {
      colour: setColour,
      spin(v) { controls.autoRotate = v; if (v) fly = null; },
      dark(v) { scene.background = v ? bgDark : bgLight; floor.material.opacity = v ? 0.45 : 0.16; },
      hang(v) { hangG.visible = v; if (!v) select(false); },
      view(k) { stop(); fly = views[k](); },
      explode(v) { stop(); explodeGoal = v ? 1 : 0; fly = v ? views.explode() : views.neck(); },
      see(v) { seeGoal = v ? 1 : 0; if (v) { stop(); fly = views.neck(); } },
      select(v) { select(v); },
      setScale(v) { hangG.scale.setScalar(v); },
      reset() {
        select(false);
        hangG.position.copy(hangHome.p); hangG.rotation.copy(hangHome.r); hangG.scale.setScalar(1); hangG.visible = true;
        explodeGoal = 0; seeGoal = 0;
        fly = views.front();
        controls.autoRotate = true;
        this.dark(false);
        setColour(0);
      },
      shot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove, { capture: true });
      el.removeEventListener('pointerup', onUp, { capture: true });
      el.removeEventListener('pointercancel', onUp, { capture: true });
      el.removeEventListener('wheel', onWheel, { capture: true });
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.MeshStandardMaterial[];
        mats.forEach((mm) => { mm.map?.dispose(); mm.dispose(); });
      });
      pmrem.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetAll = () => {
    api.current?.reset();
    setColour(0); setSpin(true); setDark(false); setHang(true); setExploded(false); setSee(false); setSel(false); setSize(1);
  };
  const save = () => {
    const url = api.current?.shot();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `gallery-crypto-ma1-${COLOURS[colour].k.toLowerCase()}.png`;
    a.click();
  };

  return (
    <div className="tv">
      <div className="tv-stage">
        <div ref={host} className="tv-canvas" role="img" aria-label="3D model of an MA-1 flight jacket with an NFC tag sewn into the back neck. Drag to turn, scroll to zoom." />
        <p className="tv-hint">{sel ? 'Hang tag — drag to move · scroll on it to resize' : 'Drag to turn · scroll to zoom · drag the hang tag to move it'}</p>
        <button className="tv-reset" onClick={resetAll}>Reset</button>
      </div>
      <div className="tv-side">
        <p className="mo-kicker">Demo · 3D · MA-1</p>
        <h2 className="tv-name">Flight jacket</h2>
        <p className="tv-sub">Nylon shell · rib knit · NFC tag in the back neck</p>
        <div className="tv-picks" role="group" aria-label="Colour">
          {COLOURS.map((c, i) => (
            <button key={c.k} aria-pressed={i === colour} aria-label={c.k} style={{ background: c.shell }} onClick={() => { setColour(i); api.current?.colour(i); }} />
          ))}
        </div>
        <div className="tv-views" role="group" aria-label="Viewpoint">
          {(['front', 'side', 'back', 'neck'] as const).map((k) => (
            <button key={k} onClick={() => { setSpin(false); api.current?.view(k); }}>{k}</button>
          ))}
        </div>
        <div className="tv-labels">
          <p className="tv-lt">NFC tag · back neck</p>
          <div className="pp-row">
            <button className="mo-btn small" onClick={() => { const v = !exploded; setExploded(v); setSpin(false); api.current?.explode(v); }}>{exploded ? 'Put the tag back' : 'Pull the tag apart'}</button>
          </div>
          <label className="lb-check"><input type="checkbox" checked={see} onChange={(e) => { setSee(e.target.checked); if (e.target.checked) setSpin(false); api.current?.see(e.target.checked); }} />See the chip through the label</label>
        </div>
        <div className="tv-opts">
          <label className="lb-check"><input type="checkbox" checked={spin} onChange={(e) => { setSpin(e.target.checked); api.current?.spin(e.target.checked); }} />Turn 360°</label>
          <label className="lb-check"><input type="checkbox" checked={hang} onChange={(e) => { setHang(e.target.checked); api.current?.hang(e.target.checked); }} />Hang tag</label>
          <label className="lb-check"><input type="checkbox" checked={dark} onChange={(e) => { setDark(e.target.checked); api.current?.dark(e.target.checked); }} />Dark studio</label>
        </div>
        {sel && (
          <div className="tv-edit">
            <label className="tv-size">
              Hang tag size <span>{Math.round(size * 100)}%</span>
              <input type="range" min={0.5} max={4} step={0.05} value={size} onChange={(e) => { const v = Number(e.target.value); setSize(v); api.current?.setScale(v); }} />
            </label>
          </div>
        )}
        <div className="pp-row">
          <button className="mo-btn small" onClick={save}>Save image</button>
          <button className="mo-btn ghost small" onClick={resetAll}>Reset</button>
          <a className="mo-btn ghost small" href={`/passport/${piece.cert}`}>Open its passport</a>
        </div>
        <p className="mo-links"><a href="/demo/nfc">How the NFC tag and the system work →</a></p>
        <p className="mo-fine">A generic MA-1 pattern built for this demo. The hang-tag QR is real — scan it from the screen.</p>
      </div>
    </div>
  );
}
