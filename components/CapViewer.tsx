'use client';

// キャップの 3D モックアップ（デモ6点）。後ろの内側に NFC タグを縫い込み、その場で分解図を見せる。
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { archBase, brim, crownAt, crownFrame, dims, panels, seamCurve, seams, strap, sweatband, type CapSpec } from './capGeometry';
import { capTextures, meshAlpha } from './capArt';
import { canvasTex, makeInlay } from './nfcParts';
import { TAG_LAYERS } from '@/lib/nfcSteps';

export type CapPiece = { n: number; band: string; title: string; year: string; cert: string; qr: string; cap: CapSpec };
type View = 'front' | 'side' | 'back' | 'inside';
type Api = {
  load: (p: CapPiece) => void; spin: (v: boolean) => void; dark: (v: boolean) => void; hang: (v: boolean) => void;
  view: (k: View) => void; explode: (v: boolean) => void; see: (v: boolean) => void;
  setScale: (v: number) => void; reset: () => void; shot: () => string;
};

const dashTex = () => {
  const t = canvasTex((c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(0, 0, w * 0.6, h); }, 32, 4);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
function stitch(curve: THREE.Curve<THREE.Vector3>, color: string, dash: THREE.Texture, r = 0.008) {
  const len = curve.getLength();
  const a = dash.clone();
  a.repeat.set(len / 0.075, 1);
  a.needsUpdate = true;
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, Math.round(len * 40)), r, 4, false), new THREE.MeshStandardMaterial({ color, roughness: 0.75, alphaMap: a, alphaTest: 0.5 }));
}
const smooth01 = (x: number, a: number, b: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

export default function CapViewer({ pieces, compact = false }: { pieces: CapPiece[]; compact?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const [cur, setCur] = useState(0);
  const [spin, setSpin] = useState(true);
  const [dark, setDark] = useState(false);
  const [hang, setHang] = useState(true);
  const [exploded, setExploded] = useState(false);
  const [see, setSee] = useState(false);
  const [sel, setSel] = useState(false);
  const [size, setSize] = useState(1);
  const [busy, setBusy] = useState(true);
  const ui = useRef({ setSpin, setSel, setSize, setBusy });
  ui.current = { setSpin, setSel, setSize, setBusy };

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * 1.25, 3));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    el.appendChild(renderer.domElement);
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const scene = new THREE.Scene();
    const bgLight = new THREE.Color('#EFEDE8'), bgDark = new THREE.Color('#131211');
    scene.background = bgLight;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.85;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
    const HOME_T = new THREE.Vector3(0, 1.0, 0.7);
    let homeD = 15.5;
    const homeP = () => new THREE.Vector3(homeD * 0.5, 1.0 + homeD * 0.32, homeD * 0.8);
    camera.position.copy(homeP());
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(HOME_T);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 2;
    controls.maxDistance = 34;
    controls.maxPolarAngle = 2.4;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.4;

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(6, 12, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 });
    key.shadow.radius = 8;
    key.shadow.bias = -0.0005;
    const rim = new THREE.DirectionalLight(0xfff1e2, 1.4);
    rim.position.set(-8, 6, -9);
    const fill = new THREE.DirectionalLight(0xe8eeff, 0.45);
    fill.position.set(-9, 2, 7);
    scene.add(key, rim, fill, new THREE.HemisphereLight(0xffffff, 0x7d776c, 0.35));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.2 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.9;
    floor.receiveShadow = true;
    scene.add(floor);

    const dash = dashTex();
    const cap = new THREE.Group();
    scene.add(cap);
    const tagG = new THREE.Group(); // 後ろの内側の NFC タグ
    const hangG = new THREE.Group(); // 下げ札
    let layers: THREE.Object3D[] = [];
    let faceMat: THREE.MeshStandardMaterial | null = null;
    let inlay: THREE.Group | null = null;
    let callouts: { sp: THREE.Sprite; line: THREE.Line }[] = [];
    let hangHome = { p: new THREE.Vector3(), r: new THREE.Euler() };
    const TW = 0.62, TH = 0.84;
    // 分解したときの並び（帽体の後ろ、開きから引き出して横一列。後ろから見て左から 01 表 → 02 アンテナ → 03 裏）
    let poses: { p0: THREE.Vector3; q0: THREE.Quaternion; p1: THREE.Vector3; q1: THREE.Quaternion }[] = [];

    const clear = () => {
      cap.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.MeshStandardMaterial[];
        mats.forEach((mm) => { mm.map?.dispose(); mm.bumpMap?.dispose(); mm.dispose(); });
      });
      cap.clear();
      tagG.clear();
      hangG.clear();
    };

    const load = (p: CapPiece) => {
      ui.current.setBusy(true);
      clear();
      const s = p.cap;
      const d = dims(s.style);
      const tex = capTextures(s, p.band, p.title, p.year, aniso);
      const fabricMat = (t: { map: THREE.Texture; bump: THREE.Texture }, color = '#ffffff') =>
        new THREE.MeshPhysicalMaterial({ map: t.map, color, roughness: s.fabric === 'canvas' ? 0.95 : 0.88, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(s.crown).lerp(new THREE.Color('#fff'), 0.35), bumpMap: t.bump, bumpScale: s.fabric === 'cord' ? 2.4 : 2.0 });
      const mFront = fabricMat(tex.front), mBack = fabricMat(tex.back), mSide = fabricMat(tex.plain);
      const inner = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.crown).multiplyScalar(0.7), roughness: 0.95, side: THREE.BackSide });
      let mMesh: THREE.MeshStandardMaterial | null = null;
      if (s.style === 'trucker') mMesh = new THREE.MeshStandardMaterial({ color: s.mesh || s.crown, roughness: 0.8, alphaMap: meshAlpha(), alphaTest: 0.5, side: THREE.DoubleSide });
      const threadCol = new THREE.Color(s.crown).multiplyScalar(0.62);

      panels(s.style).forEach((pn) => {
        const m = pn.zone === 'front' ? mFront : mMesh ? mMesh : pn.zone === 'back' ? mBack : mSide;
        const mesh = new THREE.Mesh(pn.geo, m);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        cap.add(mesh);
        if (m !== mMesh) cap.add(new THREE.Mesh(pn.geo, inner));
      });
      // 縫い目の両側のステッチ
      const sm = seams(s.style);
      // 前中心の縫い目は刺繍の下に隠れるので、ステッチは描かない
      sm.slice(0, -1).forEach((a) => { if (Math.abs(Math.sin(a / 2)) < 0.01) return; for (const off of [-0.035, 0.035]) cap.add(stitch(seamCurve(s.style, a, off), `#${threadCol.getHexString()}`, dash)); });
      // ふちの一周のステッチ
      cap.add(stitch(new THREE.CatmullRomCurve3(Array.from({ length: 121 }, (_, i) => {
        const th = (i / 120) * Math.PI * 2;
        const f = crownFrame(s.style, th, Math.max(0.06, archBase(s.style, th) + 0.04));
        return f.p.add(f.n.multiplyScalar(0.012));
      })), `#${threadCol.getHexString()}`, dash));

      // 天ボタン
      const top = crownAt(s.style, 0, 1, 0.5, false);
      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), mSide);
      btn.scale.set(1, 0.42, 1);
      btn.position.copy(top).add(new THREE.Vector3(0, 0.02, 0));
      btn.castShadow = true;
      cap.add(btn);
      // アイレット（刺繍の空気穴）
      if (s.style !== 'trucker') {
        for (let i = 0; i < sm.length - 1; i++) {
          const mid = (sm[i] + sm[i + 1]) / 2;
          if (s.style === 'five' && Math.cos(mid) > 0.5) continue;
          const f = crownFrame(s.style, mid, 0.7);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.026, 8, 24), new THREE.MeshStandardMaterial({ color: threadCol, roughness: 0.8 }));
          ring.position.copy(f.p).add(f.n.clone().multiplyScalar(0.03));
          ring.lookAt(f.p.clone().add(f.n));
          cap.add(ring);
          const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), new THREE.MeshBasicMaterial({ color: '#0d0d0c' }));
          hole.position.copy(f.p).add(f.n.clone().multiplyScalar(0.022));
          hole.lookAt(f.p.clone().add(f.n));
          cap.add(hole);
        }
      }
      // つば
      const b = brim(s.style);
      const mBrim = new THREE.MeshPhysicalMaterial({ color: s.brim, roughness: 0.88, sheen: 0.5, sheenColor: new THREE.Color(s.brim).lerp(new THREE.Color('#fff'), 0.3), bumpMap: tex.plain.bump, bumpScale: 0.8 });
      const mUnder = new THREE.MeshStandardMaterial({ color: s.under, roughness: 0.9 });
      for (const [g, m] of [[b.top, mBrim], [b.bottom, mUnder], [b.edge, mBrim]] as const) {
        const mesh = new THREE.Mesh(g, m);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        cap.add(mesh);
      }
      const brimThread = `#${new THREE.Color(s.brim).multiplyScalar(0.6).getHexString()}`;
      b.rows.forEach((r) => cap.add(stitch(r, brimThread, dash, 0.007)));
      // スベリ
      const sb = new THREE.Mesh(sweatband(s.style), new THREE.MeshStandardMaterial({ color: '#E8E1D2', roughness: 0.85, side: THREE.DoubleSide }));
      cap.add(sb);
      // ストラップ
      const st = strap(s.style);
      if (s.closure === 'snap') {
        cap.add(new THREE.Mesh(st.geo, new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.4, side: THREE.DoubleSide })));
        st.studs.forEach((q) => {
          const k = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16), new THREE.MeshStandardMaterial({ color: '#1d1d1d', roughness: 0.35 }));
          k.position.copy(q);
          k.lookAt(new THREE.Vector3(0, q.y, 0));
          k.rotateX(Math.PI / 2);
          cap.add(k);
        });
      } else {
        cap.add(new THREE.Mesh(st.geo, new THREE.MeshPhysicalMaterial({ color: s.crown, roughness: 0.9, side: THREE.DoubleSide, map: tex.plain.map })));
        const q = st.studs[5];
        const buckle = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.42, 0.05, 3, 0.02), new THREE.MeshStandardMaterial({ color: '#B9B5AC', metalness: 1, roughness: 0.3 }));
        buckle.position.copy(q);
        buckle.lookAt(new THREE.Vector3(0, q.y, 0));
        cap.add(buckle);
      }

      // ── 後ろの内側の NFC タグ（上辺だけ縫い目テープに縫い込む）
      // 後ろの開きのすぐ左、スベリの上端の縫い目に上辺を縫い込み、スベリの上に垂らす（内側を向く）
      const th0 = Math.PI - d.archW - 0.32;
      const rim = crownAt(s.style, th0, 0.12, 0.5, false);
      const out = new THREE.Vector3(Math.sin(th0) / d.rx, 0, Math.cos(th0) / d.rz).normalize();
      tagG.position.set(rim.x * 0.93, 0.92, rim.z * 0.93).add(out.clone().multiplyScalar(-0.05));
      tagG.lookAt(tagG.position.clone().sub(out));
      cap.add(tagG);
      tagG.updateMatrixWorld(true);
      faceMat = new THREE.MeshStandardMaterial({
        roughness: 0.9,
        transparent: true,
        map: canvasTex((c, w, h) => {
          c.fillStyle = s.crown; c.fillRect(0, 0, w, h);
          c.globalAlpha = 0.08; c.strokeStyle = '#000';
          for (let k = -h; k < w; k += 5) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke(); }
          c.globalAlpha = 1;
          c.fillStyle = s.thread; c.textAlign = 'center';
          c.font = '600 64px monospace'; c.fillText(p.cert.replace('GC-', ''), w / 2, h * 0.42);
          c.font = '500 25px monospace'; c.fillText('GALLERY CRYPTO', w / 2, h * 0.76); c.fillText('TOKYO', w / 2, h * 0.84);
          c.font = '500 20px monospace'; c.fillText('NFC ◉', w / 2, h * 0.94);
        }, 300, 400),
      });
      const face = new THREE.Mesh(new THREE.BoxGeometry(TW, TH, 0.014), faceMat);
      inlay = makeInlay(TW * 0.8, TH * 0.62, 1.2);
      const backing = new THREE.Mesh(new THREE.BoxGeometry(TW, TH, 0.01), new THREE.MeshStandardMaterial({ color: '#E6E1D6', roughness: 0.95 }));
      layers = [backing, inlay, face];
      layers.forEach((o) => { o.position.y = -TH / 2; tagG.add(o); });
      {
        const inv = tagG.quaternion.clone().invert();
        const faceBack = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        poses = layers.map((o, i) => {
          const w = new THREE.Vector3((1 - i) * 1.8, 1.35, -d.rz - 2.0);
          return { p0: new THREE.Vector3(0, -TH / 2, 0.007 * i), q0: new THREE.Quaternion(), p1: tagG.worldToLocal(w.clone()), q1: inv.clone().multiply(faceBack) };
        });
      }
      tagG.add(stitch(new THREE.CatmullRomCurve3([new THREE.Vector3(-TW / 2 - 0.08, -0.06, 0.015), new THREE.Vector3(TW / 2 + 0.08, -0.06, 0.015)]), s.thread, dash));
      callouts = TAG_LAYERS.map((l, i) => {
        const t = canvasTex((c, w, h) => {
          c.fillStyle = 'rgba(250,250,248,.96)'; c.fillRect(0, 0, w, h);
          c.strokeStyle = '#111'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, w - 3, h - 3);
          c.fillStyle = '#C47A45'; c.font = '500 28px monospace'; c.fillText(`0${i + 1}`, 26, 52);
          c.fillStyle = '#111'; c.font = '500 52px Georgia, serif'; c.fillText(l.title, 26, 122);
          c.fillStyle = '#6B6862'; c.font = '500 25px sans-serif';
          let line = '', y = 170;
          l.body.split(' ').forEach((wd) => { if (c.measureText(line + wd).width > w - 52) { c.fillText(line, 26, y); line = ''; y += 34; } line += wd + ' '; });
          c.fillText(line, 26, y);
        }, 640, 260);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, opacity: 0, toneMapped: false }));
        sp.renderOrder = 20;
        sp.scale.set(1.75, 0.71, 1);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#C47A45', depthTest: false, transparent: true, opacity: 0 }));
        line.renderOrder = 19;
        tagG.add(sp, line);
        return { sp, line };
      });

      // ── 下げ札（右の脇から）：本物の QR
      const tagMesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.71, 0.014), new THREE.MeshStandardMaterial({ color: '#B7B1A6', roughness: 0.9 }));
      tagMesh.position.set(0, -1.15, 0);
      tagMesh.castShadow = true;
      const im = new Image();
      im.onload = () => {
        const mt = tagMesh.material as THREE.MeshStandardMaterial;
        mt.map = canvasTex((c, w, h) => {
          c.fillStyle = '#B7B1A6'; c.fillRect(0, 0, w, h);
          c.fillStyle = '#F1EFEA'; c.beginPath(); c.arc(w / 2, 46, 16, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#8F887C'; c.textAlign = 'center'; c.font = '500 26px monospace'; c.fillText('GALLERY CRYPTO', w / 2, 120);
          c.fillStyle = '#fff'; c.fillRect(w / 2 - 150, 170, 300, 300);
          c.drawImage(im, w / 2 - 135, 185, 270, 270);
          c.fillStyle = '#33312E'; c.font = 'italic 54px Georgia, serif'; c.fillText(p.cert.replace('GC-', ''), w / 2, 570);
          c.font = '500 20px monospace'; c.fillText('SCAN TO VERIFY', w / 2, 640);
        }, 400, 720);
        mt.color.set('#ffffff');
        mt.needsUpdate = true;
      };
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(p.qr);
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 24), new THREE.MeshStandardMaterial({ color: '#E9E3D6', roughness: 1 }));
      loop.position.set(0, -0.12, 0);
      const str = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.26, 0), new THREE.Vector3(0.02, -0.33, 0.01), new THREE.Vector3(0, -0.3 - 0.0, 0)]);
      hangG.add(tagMesh, loop, new THREE.Mesh(new THREE.TubeGeometry(str, 8, 0.01, 4, false), loop.material));
      const hf = crownFrame(s.style, 1.75, 0.08);
      hangG.position.copy(hf.p).add(hf.n.clone().multiplyScalar(0.12)).add(new THREE.Vector3(0, -0.05, 0));
      hangG.rotation.set(0.05, Math.atan2(hf.n.x, hf.n.z) - 0.45, 0.04);
      hangG.scale.setScalar(1);
      hangHome = { p: hangG.position.clone(), r: hangG.rotation.clone() };
      cap.add(hangG);
      ui.current.setBusy(false);
    };

    // ── 下げ札の選択とドラッグ
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
      plane.setFromNormalAndCoplanarPoint(toCam, h.point.clone().add(toCam.clone().multiplyScalar(Math.max(0, 3.6 - depth))));
      drag = { off: hangG.getWorldPosition(new THREE.Vector3()).sub(h.point), id: e.pointerId };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        e.stopPropagation();
        toNdc(e);
        const pt = ray.ray.intersectPlane(plane, new THREE.Vector3());
        if (pt) hangG.position.copy(cap.worldToLocal(pt.add(drag.off)));
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
      homeD = w < 600 ? 19 : 15.5;
      if (first) camera.position.copy(homeP());
      first = false;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const tagWorld = () => tagG.getWorldPosition(new THREE.Vector3());
    const views: Record<View | 'explode', () => { t: THREE.Vector3; p: THREE.Vector3 }> = {
      front: () => ({ t: HOME_T.clone(), p: new THREE.Vector3(0, 1.0 + homeD * 0.22, homeD) }),
      side: () => ({ t: HOME_T.clone(), p: new THREE.Vector3(homeD, 1.0 + homeD * 0.18, 0.7) }),
      back: () => ({ t: HOME_T.clone(), p: new THREE.Vector3(0, 1.0 + homeD * 0.25, -homeD) }),
      // 内側を下からのぞく（つばの下、前から）
      inside: () => { const n = tagWorld(); return { t: n.clone().add(new THREE.Vector3(0, -0.3, 0)), p: new THREE.Vector3(n.x * -0.6, -3.2, 4.6) }; },
      explode: () => { const z = -dims(pieces[0].cap.style).rz - 2.0; return { t: new THREE.Vector3(0, 0.75, z + 0.6), p: new THREE.Vector3(-1.2, 2.4, z - 11.5) }; },
    };

    let explodeT = 0, explodeGoal = 0, seeT = 0, seeGoal = 0;
    let raf = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      const dt = Math.min(0.1, clock.getDelta());
      const ease = 1 - Math.exp(-dt * 4.5);
      if (fly) {
        controls.target.lerp(fly.t, ease);
        camera.position.lerp(fly.p, ease);
        if (camera.position.distanceTo(fly.p) < 0.01) fly = null;
      }
      explodeT += (explodeGoal - explodeT) * ease;
      seeT += (seeGoal - seeT) * ease;
      // 分解：帽体の下から前へ引き出して、裏地 → アンテナとチップ → 表の順に並べる（タグの向きの座標）
      const e = explodeT;
      // 引き出す途中は、いったん内側へ浮かせてから開きを通って後ろへ
      layers.forEach((o, i) => {
        const P = poses[i];
        if (!P) return;
        const lift = Math.sin(Math.min(1, e * 1.4) * Math.PI) * 0.6;
        o.position.copy(P.p0).lerp(P.p1, e).add(new THREE.Vector3(0, 0, lift));
        o.quaternion.copy(P.q0).slerp(P.q1, smooth01(e, 0.15, 0.9));
        o.scale.setScalar(1 + e * 1.15);
      });
      callouts.forEach((c, i) => {
        const o = layers[2 - i];
        const P = poses[2 - i];
        if (!o || !P) return;
        const sc = o.scale.x;
        const topW = tagG.localToWorld(o.position.clone()).add(new THREE.Vector3(0, -(TH / 2) * sc - 0.05, 0));
        const atW = topW.clone().add(new THREE.Vector3(0, -0.55, 0));
        const tip = tagG.worldToLocal(topW.clone());
        const at = tagG.worldToLocal(atW.clone());
        c.sp.position.copy(tagG.worldToLocal(atW.clone().add(new THREE.Vector3(0, -0.36, 0))));
        const op = smooth01(e, 0.55, 1);
        (c.sp.material as THREE.SpriteMaterial).opacity = op;
        const pos = c.line.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, tip.x, tip.y, tip.z);
        pos.setXYZ(1, at.x, at.y, at.z);
        pos.needsUpdate = true;
        (c.line.material as THREE.LineBasicMaterial).opacity = op;
      });
      if (faceMat) faceMat.opacity = 1 - 0.7 * seeT;
      if (inlay) inlay.visible = seeT > 0.02 || e > 0.02;
      if (box) box.update();
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    api.current = {
      load(p) { select(false); explodeGoal = 0; explodeT = 0; load(p); },
      spin(v) { controls.autoRotate = v; if (v) fly = null; },
      dark(v) { scene.background = v ? bgDark : bgLight; floor.material.opacity = v ? 0.5 : 0.2; },
      hang(v) { hangG.visible = v; if (!v) select(false); },
      view(k) { stop(); fly = views[k](); },
      explode(v) { stop(); explodeGoal = v ? 1 : 0; fly = v ? views.explode() : views.inside(); },
      see(v) { seeGoal = v ? 1 : 0; if (v) { stop(); fly = views.inside(); } },
      setScale(v) { hangG.scale.setScalar(v); },
      reset() {
        select(false);
        hangG.position.copy(hangHome.p); hangG.rotation.copy(hangHome.r); hangG.scale.setScalar(1); hangG.visible = true;
        explodeGoal = 0; seeGoal = 0;
        fly = { t: HOME_T.clone(), p: homeP() };
        controls.autoRotate = true;
        this.dark(false);
      },
      shot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    };
    api.current.load(pieces[0]);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove, { capture: true });
      el.removeEventListener('pointerup', onUp, { capture: true });
      el.removeEventListener('pointercancel', onUp, { capture: true });
      el.removeEventListener('wheel', onWheel, { capture: true });
      controls.dispose();
      clear();
      pmrem.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const p = pieces[cur];
  const pick = (i: number) => { setCur(i); setExploded(false); setSee(false); setSel(false); api.current?.load(pieces[i]); };
  const resetAll = () => {
    api.current?.reset();
    setSpin(true); setDark(false); setHang(true); setExploded(false); setSee(false); setSel(false); setSize(1);
  };
  const save = () => {
    const url = api.current?.shot();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `gallery-crypto-${p.cert.toLowerCase()}-cap.png`;
    a.click();
  };
  const styleName = { structured: 'Structured 6-panel', dad: 'Unstructured 6-panel', trucker: 'Trucker, foam and mesh', five: '5-panel' }[p.cap.style];

  // パスポートの中に置く小さな版：回す・タグを分解・内側・リセットだけ
  if (compact)
    return (
      <div className="tvc">
        <div className="tv-stage">
          <div ref={host} className="tv-canvas" role="img" aria-label={`3D model of this cap, with its NFC tag sewn inside the back. Drag to turn, scroll to zoom.`} />
          {busy && <p className="tv-busy">Loading the model…</p>}
          <p className="tv-hint">Drag to turn · scroll to zoom</p>
          <button className="tv-reset" onClick={resetAll}>Reset</button>
        </div>
        <div className="tvc-bar">
          <button className="mo-btn small" disabled={busy} onClick={() => { const v = !exploded; setExploded(v); setSpin(false); api.current?.explode(v); }}>{exploded ? 'Put the tag back' : 'Pull the NFC tag apart'}</button>
          <button className="mo-btn ghost small" disabled={busy} onClick={() => { setSpin(false); setSee(true); api.current?.see(true); }}>Find the tag inside</button>
          <button className="mo-btn ghost small" onClick={() => { const v = !spin; setSpin(v); api.current?.spin(v); }}>{spin ? 'Stop turning' : 'Turn 360°'}</button>
          <a className="mo-btn ghost small" href="/demo/3d">Full 3D view →</a>
        </div>
      </div>
    );

  return (
    <div className="tv">
      <div className="tv-stage">
        <div ref={host} className="tv-canvas" role="img" aria-label={`3D model of the ${p.band} ${p.title} cap, with an NFC tag sewn inside the back. Drag to turn, scroll to zoom.`} />
        {busy && <p className="tv-busy">Loading the model…</p>}
        <p className="tv-hint">{sel ? 'Hang tag — drag to move · scroll on it to resize' : 'Drag to turn · scroll to zoom · drag the hang tag to move it'}</p>
        <button className="tv-reset" onClick={resetAll}>Reset</button>
      </div>
      <div className="tv-side">
        <p className="mo-kicker">Demo piece · 3D</p>
        <h2 className="tv-name">{p.band}</h2>
        <p className="tv-sub">{p.title} · {p.year} · {styleName}</p>
        <div className="tv-picks" role="group" aria-label="Choose a piece">
          {pieces.map((x, i) => (
            <button key={x.n} aria-pressed={i === cur} onClick={() => pick(i)} style={{ background: x.cap.style === 'trucker' && x.cap.front ? `linear-gradient(90deg, ${x.cap.front} 50%, ${x.cap.mesh || x.cap.crown} 50%)` : x.cap.crown }} aria-label={`${x.band} ${x.title}`} />
          ))}
        </div>
        <div className="tv-views" role="group" aria-label="Viewpoint">
          {(['front', 'side', 'back', 'inside'] as const).map((k) => (
            <button key={k} onClick={() => { setSpin(false); api.current?.view(k); }}>{k}</button>
          ))}
        </div>
        <div className="tv-labels">
          <p className="tv-lt">NFC tag · inside the back</p>
          <div className="pp-row">
            <button className="mo-btn small" disabled={busy} onClick={() => { const v = !exploded; setExploded(v); setSpin(false); api.current?.explode(v); }}>{exploded ? 'Put the tag back' : 'Pull the tag apart'}</button>
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
          <button className="mo-btn small" onClick={save} disabled={busy}>Save image</button>
          <button className="mo-btn ghost small" onClick={resetAll}>Reset</button>
          <a className="mo-btn ghost small" href={`/passport/${p.cert}`}>Open its passport</a>
        </div>
        <p className="mo-links"><a href="/demo/nfc">How the NFC tag and the system work →</a></p>
        <p className="mo-fine">Bands and artwork are fictional, made for this demo. The hang-tag QR is real — scan it from the screen.</p>
      </div>
    </div>
  );
}
