'use client';

// 3D モックアップ：型紙から胴・袖・襟を筒として組み立てた、閉じた立体の T シャツ（首ラベル・下げ札・NFC ラベル付き）。
// 360° 回す・近づく・背景を変える・画像として保存ができる。
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type ViewerPiece = { n: number; band: string; title: string; year: string; cert: string; fabric: string; qr: string };

// 型紙（デモ画像と同じ形・単位は SVG の 1/100）。胴・袖・襟を本物の筒として組み立てる
const S = 0.01;
const wx = (sx: number) => (sx - 500) * S;
const wy = (sy: number) => (550 - sy) * S;
const A = 2.55; // 胴の半幅
const B = 1.2; // 胴の半厚
const NECK = 1.9; // 襟ぐりの半幅
const PN = 3.4; // 断面の角ばり
const yHem = (x: number) => wy(1030 + 12 * Math.max(0, 1 - (x / A) ** 2));
const yTop = (x: number, front: boolean) => {
  const d = Math.abs(x);
  if (d < NECK) return wy(70 + (front ? 88 : 24) * (1 - (d / NECK) ** 2));
  return wy(70 + ((d - NECK) / S) * (120 / 405));
};
const zTopFrac = (x: number) => 0.55 * Math.sqrt(Math.max(0, 1 - (x / NECK) ** 2));
const smooth = (a: number, b: number, t: number) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
const wrinkle = (x: number, y: number, z: number) => 0.035 * Math.sin(x * 1.7 + y * 0.9 + z) * Math.sin(y * 2.3 - x * 0.5) + 0.018 * Math.sin(x * 4.3 + y * 3.1);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

function planarUV(g: THREE.BufferGeometry) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / 9 + 0.5; uv[i * 2 + 1] = pos.getY(i) / 9.9 + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function grid(nu: number, nv: number, at: (u: number, v: number) => [number, number, number], flip: boolean) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array((nu + 1) * (nv + 1) * 3);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) p.set(at(i / nu, j / nv), (j * (nu + 1) + i) * 3);
  const idx: number[] = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setIndex(idx);
  planarUV(g);
  g.computeVertexNormals();
  return g;
}

// 胴（前・後ろ）。肩で前後が閉じ、襟ぐりと裾は開いている
function torso(front: boolean) {
  const sz = front ? 1 : -1;
  return grid(140, 150, (u, v) => {
    const phi = u * Math.PI;
    const c = Math.cos(phi), s = Math.sin(phi);
    const flare = 1 + 0.035 * (1 - v) ** 2;
    const x = A * flare * (1 - 0.05 * smooth(0.8, 1, v)) * spow(c, 2 / PN);
    const y0 = yHem(x), y1 = yTop(x, front);
    const y = y0 + (y1 - y0) * v;
    const top = smooth(0.74, 1, v);
    const zf = (1 - top) + top * zTopFrac(x) / 1.0;
    const belly = 1 - 0.06 * Math.sin(v * Math.PI);
    let z = sz * B * belly * zf * Math.pow(s, 2 / PN);
    const w = wrinkle(x, y, 0) * (0.4 + 0.6 * (1 - top));
    const nx = c, nz = sz * s;
    return [x + w * nx * 0.5, y, (z += w * nz)];
  }, !front);
}

// 袖：付け根は胴の脇に沿った縦の輪、袖口へ向かって斜め下に細くなる楕円の筒
const ARM = { x: 2.5, y: 3.5, r: 1.12, rz: 0.45 };
const CUFF = { len: 2.05, ang: -0.62, r: 0.86, rz: 0.62 };
function sleeve(side: 1 | -1) {
  const r0 = new THREE.Vector2(side * ARM.x, ARM.y);
  const ax = new THREE.Vector2(side * Math.cos(CUFF.ang), Math.sin(CUFF.ang));
  const r1 = r0.clone().add(ax.clone().multiplyScalar(CUFF.len));
  let perp = new THREE.Vector2(-ax.y, ax.x);
  if (perp.y < 0) perp = perp.negate();
  const g = grid(96, 48, (u, v) => {
    const phi = u * Math.PI * 2;
    const e = smooth(0, 0.55, v);
    const dir = new THREE.Vector2(0, 1).lerp(perp, e).normalize();
    const ctr = r0.clone().lerp(r1, v);
    const rin = ARM.r + (CUFF.r - ARM.r) * smooth(0, 1, v);
    const rz = ARM.rz + (0.84 - ARM.rz) * Math.sin(Math.min(1, v * 1.6) * Math.PI / 2) * (1 - v) + CUFF.rz * v * 0.9;
    const c = Math.cos(phi), s = Math.sin(phi);
    const w = 0.02 * Math.sin(phi * 3 + v * 6) * v;
    // 上側は少し丸く、下（脇）はすっきり
    const lift = c > 0 ? 1 : 0.92;
    return [ctr.x + dir.x * (rin + w) * c * lift, ctr.y + dir.y * (rin + w) * c * lift, (rz + w) * s];
  }, side === 1);
  // 袖は無地：生地画像の柄のない裾まわりを貼る
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.3 + 0.4 * ((i % 97) / 96), 0.1 + 0.05 * (Math.floor(i / 97) / 48));
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
function bleed(img: HTMLImageElement, fabric: string, plainTop = false): HTMLCanvasElement {
  const w = img.naturalWidth, h = img.naturalHeight;
  const b = document.createElement('canvas'); b.width = w; b.height = h;
  const cb = b.getContext('2d')!; cb.drawImage(img, 0, 0);
  // 柄のない裾まわりの実際の色（生地の粒感込み）で、型紙の外側を埋める
  const x0 = Math.round(w * 0.35), y0 = Math.round(h * 0.84);
  const d = cb.getImageData(x0, y0, Math.round(w * 0.3), Math.round(h * 0.06)).data;
  let r = 0, g = 0, bl = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; }
  const a = document.createElement('canvas'); a.width = w; a.height = h;
  const ca = a.getContext('2d')!;
  ca.fillStyle = n ? `rgb(${r / n | 0},${g / n | 0},${bl / n | 0})` : fabric;
  ca.fillRect(0, 0, w, h);
  ca.drawImage(img, 0, 0);
  // 後ろ身頃は襟ぐりの影線を消す（立体の襟が代わりに付く）
  if (plainTop) ca.fillRect(0, 0, w, Math.round(h * 0.2));
  return a;
}

async function svgImage(svg: string): Promise<HTMLImageElement> {
  return loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
}

export default function TeeViewer({ pieces }: { pieces: ViewerPiece[] }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ load: (p: ViewerPiece) => Promise<void>; setTags: (v: boolean) => void; setSpin: (v: boolean) => void; setDark: (v: boolean) => void; view: (a: number) => void; shot: () => string } | null>(null);
  const [cur, setCur] = useState(0);
  const [tags, setTags] = useState(true);
  const [spin, setSpin] = useState(true);
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * 1.25, 3));
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
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
    controls.dampingFactor = 0.07;
    // 一周ぐるりと回せる。上からのぞく・下から見上げるのも少しだけ
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;
    controls.minPolarAngle = 0.55;
    controls.maxPolarAngle = 2.15;
    let goAz: number | null = null;
    controls.addEventListener('start', () => { goAz = null; });
    controls.minDistance = 9;
    controls.maxDistance = 40;
    controls.enablePan = false;
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(6, 10, 12);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -10; key.shadow.camera.right = 10; key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
    key.shadow.radius = 6;
    const rim = new THREE.DirectionalLight(0xfff4e6, 1.1);
    rim.position.set(-8, 7, -10);
    const fill = new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.45);
    scene.add(key, rim, fill);
    // ニットの細かな凹凸（布らしい手ざわり）
    const knit = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d')!;
      const im = x.createImageData(256, 256);
      for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
        const v = 128 + 60 * Math.sin((i % 8) * Math.PI / 4) * Math.cos((j % 6) * Math.PI / 3) + (Math.random() - 0.5) * 50;
        const k = (j * 256 + i) * 4;
        im.data[k] = im.data[k + 1] = im.data[k + 2] = v; im.data[k + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(40, 44);
      return t;
    })();
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
      void t;
      if (goAz !== null) {
        const cur = controls.getAzimuthalAngle();
        let d = goAz - cur;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < 0.002) goAz = null;
        else {
          const off = camera.position.clone().sub(controls.target);
          off.applyAxisAngle(new THREE.Vector3(0, 1, 0), d * 0.08);
          camera.position.copy(controls.target).add(off);
        }
      }
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
        const [fi, bi] = await Promise.all([loadImage(`/demo/3d/front-${p.n}-hd.webp`), loadImage(`/demo/3d/back-${p.n}.webp`)]);
        const fab = new THREE.Color(p.fabric);
        const sheen = fab.clone().lerp(new THREE.Color('#ffffff'), 0.18);
        const mk = (img: HTMLImageElement, plainTop = false) => {
          const t = new THREE.Texture(bleed(img, p.fabric, plainTop));
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = maxAniso;
          t.needsUpdate = true;
          return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.92, metalness: 0, sheen: 1, sheenRoughness: 0.55, sheenColor: sheen, bumpMap: knit, bumpScale: 0.35 });
        };
        const mFront = mk(fi), mBack = mk(bi, true);
        const parts = [
          new THREE.Mesh(torso(true), mFront),
          new THREE.Mesh(torso(false), mBack),
          new THREE.Mesh(sleeve(1), mFront),
          new THREE.Mesh(sleeve(-1), mFront),
        ];
        // 内側（襟・裾・袖口からのぞく布の裏）は暗く
        const inner = new THREE.MeshStandardMaterial({ color: fab.clone().multiplyScalar(0.45), roughness: 1, side: THREE.BackSide });
        parts.forEach((m) => {
          m.castShadow = true;
          m.receiveShadow = true;
          group.add(m, new THREE.Mesh(m.geometry, inner));
        });
        // 襟のリブ
        const rib = new THREE.CatmullRomCurve3(
          Array.from({ length: 49 }, (_, i) => {
            const a = (i / 48) * Math.PI * 2;
            const x = NECK * 0.985 * Math.cos(a);
            const front = Math.sin(a) > 0;
            return new THREE.Vector3(x, yTop(x, front) + 0.02, (front ? 1 : -1) * B * zTopFrac(x) * Math.abs(Math.sin(a)) ** 0.3);
          }),
          true,
        );
        const ribMesh = new THREE.Mesh(new THREE.TubeGeometry(rib, 160, 0.075, 10, true), new THREE.MeshPhysicalMaterial({ color: fab.clone().multiplyScalar(0.9), roughness: 0.95, sheen: 1, sheenColor: sheen }));
        ribMesh.castShadow = true;
        group.add(ribMesh);

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
        label.position.set(0, wy(24) - 0.55, -B * 0.55 + 0.12);
        label.rotation.x = -0.12;
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
        tag.position.set(3.95, -0.4, 0.5);
        tag.rotation.set(0, -0.35, 0.06);
        tag.castShadow = true;
        tagGroup.add(tag);
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(3.55, 1.72, 0.35), new THREE.Vector3(3.8, 1.3, 0.5), new THREE.Vector3(3.92, 0.78, 0.52)]);
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
        side.position.set(-2.82, -3.7, 0);
        tagGroup.add(side);
        setBusy(false);
      },
      setTags(v) { tagGroup.visible = v; },
      setSpin(v) { controls.autoRotate = v; },
      view(a) { controls.autoRotate = false; goAz = a; },
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
          <label className="lb-check"><input type="checkbox" checked={spin} onChange={(e) => { setSpin(e.target.checked); api.current?.setSpin(e.target.checked); }} />Turn 360°</label>
          <label className="lb-check"><input type="checkbox" checked={dark} onChange={(e) => { setDark(e.target.checked); api.current?.setDark(e.target.checked); }} />Dark studio</label>
        </div>
        <div className="tv-views" role="group" aria-label="Viewpoint">
          {([['Front', 0], ['Side', Math.PI / 2], ['Back', Math.PI], ['Other side', -Math.PI / 2]] as const).map(([l, a]) => (
            <button key={l} onClick={() => { setSpin(false); api.current?.view(a); }}>{l}</button>
          ))}
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
