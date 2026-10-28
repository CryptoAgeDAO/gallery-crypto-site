'use client';

// 3D モックアップ：平面の生地画像から、ふくらみのある立体の T シャツを作る（前身頃・後身頃・首ラベル・下げ札）。
// 回す・近づく・背景を変える・画像として保存ができる。
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type ViewerPiece = { n: number; band: string; title: string; year: string; cert: string; fabric: string; qr: string };

const W = 10, H = 11, SX = 160, SY = 176;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

// シルエットの内側ほど厚くなる「ふくらみ」の高さ（0〜1）を、縮小したアルファをぼかして作る
function bulgeField(img: HTMLImageElement): Float32Array {
  const c = document.createElement('canvas');
  c.width = SX + 1;
  c.height = SY + 1;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let a = new Float32Array(c.width * c.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
  const blur = (src: Float32Array, r: number) => {
    const w = c.width, h = c.height, tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, k = 0;
      for (let i = -r; i <= r; i++) { const xx = x + i; if (xx >= 0 && xx < w) { s += src[y * w + xx]; k++; } }
      tmp[y * w + x] = s / k;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, k = 0;
      for (let i = -r; i <= r; i++) { const yy = y + i; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; k++; } }
      out[y * w + x] = s / k;
    }
    return out;
  };
  a = blur(blur(a, 6), 6);
  return a;
}

function panel(field: Float32Array, side: 1 | -1, thick: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(W, H, SX, SY);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const ix = i % (SX + 1), iy = Math.floor(i / (SX + 1));
    const b = field[iy * (SX + 1) + ix];
    const h = Math.pow(Math.max(0, (b - 0.5) * 2), 0.55);
    const x = pos.getX(i), y = pos.getY(i);
    const wrinkle = (0.07 * Math.sin(x * 1.6 + y * 0.7) * Math.sin(y * 2.1 - x * 0.4) + 0.04 * Math.sin(x * 4.1 + y * 3.3)) * h;
    pos.setZ(i, side * (h * thick + wrinkle));
  }
  if (side === -1) {
    const idx = g.index!;
    for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i); idx.setX(i, idx.getX(i + 2)); idx.setX(i + 2, a); }
  }
  g.computeVertexNormals();
  return g;
}

function textTexture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 透明部分の色を生地の色で埋める（縁に白いにじみが出ないように）
function bleed(img: HTMLImageElement, fabric: string): HTMLCanvasElement {
  const w = img.naturalWidth, h = img.naturalHeight;
  const a = document.createElement('canvas'); a.width = w; a.height = h;
  const ca = a.getContext('2d')!; ca.fillStyle = fabric; ca.fillRect(0, 0, w, h); ca.drawImage(img, 0, 0);
  const b = document.createElement('canvas'); b.width = w; b.height = h;
  const cb = b.getContext('2d')!; cb.drawImage(img, 0, 0);
  const da = ca.getImageData(0, 0, w, h), db = cb.getImageData(0, 0, w, h);
  for (let i = 3; i < da.data.length; i += 4) da.data[i] = db.data[i];
  ca.putImageData(da, 0, 0);
  return a;
}

async function svgImage(svg: string): Promise<HTMLImageElement> {
  return loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
}

export default function TeeViewer({ pieces }: { pieces: ViewerPiece[] }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ load: (p: ViewerPiece) => Promise<void>; setTags: (v: boolean) => void; setSpin: (v: boolean) => void; setDark: (v: boolean) => void; setBack: (v: boolean) => void; shot: () => string } | null>(null);
  const [backSide, setBackSide] = useState(false);
  const [cur, setCur] = useState(0);
  const [tags, setTags] = useState(true);
  const [spin, setSpin] = useState(true);
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const bgLight = new THREE.Color('#F1EFEA'), bgDark = new THREE.Color('#141312');
    scene.background = bgLight;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    camera.position.set(0, 0.6, 26);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = false;
    // 真横（布の内側が見える角度）までは回さない
    controls.minAzimuthAngle = -0.6;
    controls.maxAzimuthAngle = 0.6;
    controls.minPolarAngle = 0.9;
    controls.maxPolarAngle = 2.0;
    let sway = true, facing = 0;
    controls.minDistance = 9;
    controls.maxDistance = 40;
    controls.enablePan = false;
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(6, 10, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -10; key.shadow.camera.right = 10; key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
    key.shadow.radius = 6;
    scene.add(key, new THREE.AmbientLight(0xffffff, 0.25));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -6.6;
    floor.receiveShadow = true;
    scene.add(floor);
    const group = new THREE.Group();
    scene.add(group);
    const tagGroup = new THREE.Group();
    group.add(tagGroup);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = w < 600 ? 34 : 26;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    const clock = new THREE.Clock();
    const loop = () => {
      const t = clock.getElapsedTime();
      const target = facing + (sway ? 0.32 * Math.sin(t * 0.45) : 0);
      group.rotation.y += (target - group.rotation.y) * 0.06;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    const disposeGroup = (g: THREE.Object3D) => {
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.MeshStandardMaterial[];
        mats.forEach((mm) => { mm.map?.dispose(); mm.dispose(); });
      });
    };

    api.current = {
      async load(p) {
        setBusy(true);
        [...group.children].forEach((c) => { if (c !== tagGroup) { group.remove(c); disposeGroup(c); } });
        [...tagGroup.children].forEach((c) => { tagGroup.remove(c); disposeGroup(c); });
        const [fi, bi] = await Promise.all([loadImage(`/demo/3d/front-${p.n}.webp`), loadImage(`/demo/3d/back-${p.n}.webp`)]);
        const field = bulgeField(fi);
        const mk = (img: HTMLImageElement) => {
          const t = new THREE.Texture(bleed(img, p.fabric));
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          t.needsUpdate = true;
          return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, roughness: 0.95, metalness: 0, side: THREE.FrontSide });
        };
        const front = new THREE.Mesh(panel(field, 1, 0.75), mk(fi));
        const back = new THREE.Mesh(panel(field, -1, 0.75), mk(bi));
        [front, back].forEach((m) => { m.castShadow = true; m.receiveShadow = true; group.add(m); });
        // 内側（首や裾からのぞく布の裏）は少し暗く
        [front, back].forEach((m) => {
          const inner = (m.material as THREE.MeshStandardMaterial).clone();
          inner.side = THREE.BackSide;
          inner.color = new THREE.Color('#7a7672');
          group.add(new THREE.Mesh(m.geometry, inner));
        });

        // 首のラベル（その服の生地から切り出した、番号だけのラベル）
        const label = new THREE.Mesh(
          new THREE.BoxGeometry(0.62, 0.85, 0.03),
          new THREE.MeshStandardMaterial({
            roughness: 1,
            map: textTexture((c, w, h) => {
              c.fillStyle = '#2E2C2A'; c.fillRect(0, 0, w, h);
              c.fillStyle = '#D9D4CA'; c.textAlign = 'center';
              c.font = '600 44px monospace'; c.fillText(p.cert.replace('GC-', ''), w / 2, h * 0.42);
              c.font = '500 22px monospace'; c.fillText('GALLERY CRYPTO', w / 2, h * 0.78); c.fillText('TOKYO', w / 2, h * 0.88);
            }, 256, 352),
          }),
        );
        label.position.set(0, H / 2 - 1.05, -0.25);
        group.add(label);

        // 下げ札（灰色の厚紙・QR は本物：読み取るとこの作品のパスポートが開く）
        const qrImg = await svgImage(p.qr);
        const tagTex = textTexture((c, w, h) => {
          c.fillStyle = '#B7B1A6'; c.fillRect(0, 0, w, h);
          c.fillStyle = '#F1EFEA'; c.beginPath(); c.arc(w / 2, 46, 16, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#8F887C'; c.textAlign = 'center'; c.font = '500 26px monospace'; c.fillText('GALLERY CRYPTO', w / 2, 120);
          c.fillStyle = '#ffffff'; c.fillRect(w / 2 - 150, 170, 300, 300);
          c.drawImage(qrImg, w / 2 - 135, 185, 270, 270);
          c.fillStyle = '#33312E'; c.font = 'italic 54px Georgia, serif'; c.fillText(p.cert.replace('GC-', ''), w / 2, 570);
          c.font = '500 20px monospace'; c.fillText('SCAN TO VERIFY', w / 2, 640);
        }, 400, 720);
        const tag = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.52, 0.03), new THREE.MeshStandardMaterial({ map: tagTex, roughness: 0.9 }));
        tag.position.set(4.6, 1.2, 0.9);
        tag.rotation.set(0, -0.25, 0.08);
        tag.castShadow = true;
        tagGroup.add(tag);
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(3.55, 3.05, 0.3), new THREE.Vector3(4.2, 2.8, 0.75), new THREE.Vector3(4.55, 2.35, 0.9)]);
        tagGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.022, 6, false), new THREE.MeshStandardMaterial({ color: '#E9E3D6', roughness: 1 })));

        // 脇の記録ラベル（NFC 入り）
        const side = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 1.0, 0.02),
          new THREE.MeshStandardMaterial({
            roughness: 0.6,
            map: textTexture((c, w, h) => {
              c.fillStyle = '#F4F1EA'; c.fillRect(0, 0, w, h);
              c.fillStyle = '#2B2A28'; c.font = '500 18px monospace';
              ['GC', p.cert.replace('GC-', ''), '', 'COTTON 100%', 'BODY USA', p.year, '', 'NFC ◉'].forEach((s, i) => c.fillText(s, 18, 40 + i * 30));
            }, 200, 400),
          }),
        );
        side.position.set(-2.62, -3.6, 0.08);
        side.rotation.y = -0.1;
        tagGroup.add(side);
        setBusy(false);
      },
      setTags(v) { tagGroup.visible = v; },
      setSpin(v) { sway = v; },
      setBack(v) { facing = v ? Math.PI : 0; },
      setDark(v) { scene.background = v ? bgDark : bgLight; floor.material.opacity = v ? 0.4 : 0.18; },
      shot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    };
    api.current.load(pieces[0]);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposeGroup(scene);
      pmrem.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (i: number) => { setCur(i); api.current?.load(pieces[i]); };
  const save = () => {
    const url = api.current?.shot();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `gallery-crypto-${pieces[cur].cert.toLowerCase()}-3d.png`;
    a.click();
  };
  const p = pieces[cur];

  return (
    <div className="tv">
      <div className="tv-stage">
        <div ref={host} className="tv-canvas" aria-label={`3D model of ${p.band} ${p.title}. Drag to rotate, pinch or scroll to zoom.`} role="img" />
        {busy && <p className="tv-busy">Loading the model…</p>}
        <p className="tv-hint">Drag to turn · pinch or scroll to zoom</p>
      </div>
      <div className="tv-side">
        <p className="mo-kicker">Demo piece · 3D</p>
        <h2 className="tv-name">{p.band}</h2>
        <p className="tv-sub">{p.title} · {p.year}</p>
        <div className="tv-picks" role="group" aria-label="Choose a piece">
          {pieces.map((x, i) => (
            <button key={x.n} aria-pressed={i === cur} onClick={() => pick(i)} style={{ background: x.fabric }} aria-label={`${x.band} ${x.title}`} />
          ))}
        </div>
        <div className="tv-opts">
          <label className="lb-check"><input type="checkbox" checked={tags} onChange={(e) => { setTags(e.target.checked); api.current?.setTags(e.target.checked); }} />Tags and labels</label>
          <label className="lb-check"><input type="checkbox" checked={spin} onChange={(e) => { setSpin(e.target.checked); api.current?.setSpin(e.target.checked); }} />Sway slowly</label>
          <label className="lb-check"><input type="checkbox" checked={backSide} onChange={(e) => { setBackSide(e.target.checked); api.current?.setBack(e.target.checked); }} />Show the back</label>
          <label className="lb-check"><input type="checkbox" checked={dark} onChange={(e) => { setDark(e.target.checked); api.current?.setDark(e.target.checked); }} />Dark studio</label>
        </div>
        <div className="pp-row">
          <button className="mo-btn small" onClick={save} disabled={busy}>Save image</button>
          <a className="mo-btn ghost small" href={`/passport/${p.cert}`}>Open its passport</a>
        </div>
        <p className="mo-fine">The QR on the hang tag is real — scan it from the screen. Every finished piece will get its own 3D model from macro photogrammetry.</p>
      </div>
    </div>
  );
}
