'use client';
// 写真から3D（自作）：服の正面（と背面）の写真から、その場で立体のモデルをつくる。
// 背景を消した服の形をふくらませて厚みのある立体にし、表に正面、裏に背面の写真を貼る。
// 本物の3Dスキャン（全方向から撮る方式）ではなく、2枚の写真から形を推定する簡易方式。処理は端末内だけ。
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { autoBackground, flood, loadLayer, tidy, type Layer } from './GhostMannequin';
import { tt } from './Lang';

type Side = 'front' | 'back';
const GRID = 240; // 長い辺のマス数（細かさ）

function bbox(L: Layer) {
  let x0 = L.w, y0 = L.h, x1 = 0, y1 = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.mask[y * L.w + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < x0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// 服の外の画素を、服の平均色で埋めたテクスチャ（輪郭ににじむ背景色を防ぐ）
function texture(L: Layer): { tex: THREE.CanvasTexture; mean: THREE.Color } {
  const c = document.createElement('canvas');
  c.width = L.w; c.height = L.h;
  const x = c.getContext('2d')!;
  const src = L.data.data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < L.mask.length; i++) if (L.mask[i] > 127) { r += src[i * 4]; g += src[i * 4 + 1]; b += src[i * 4 + 2]; n++; }
  n = Math.max(1, n); r /= n; g /= n; b /= n;
  const out = x.createImageData(L.w, L.h);
  for (let i = 0; i < L.mask.length; i++) {
    const k = L.mask[i] > 127;
    out.data[i * 4] = k ? src[i * 4] : r;
    out.data[i * 4 + 1] = k ? src[i * 4 + 1] : g;
    out.data[i * 4 + 2] = k ? src[i * 4 + 2] : b;
    out.data[i * 4 + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.mimeType = 'image/jpeg';
  tex.anisotropy = 4;
  return { tex, mean: new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear() };
}

// 形をふくらませて、表と裏の面をもつ立体をつくる
function buildMesh(F: Layer, B: Layer | null, puff: number, heightM: number) {
  const fb = bbox(F);
  if (!fb) return null;
  const step = Math.max(fb.w, fb.h) / GRID;
  const nx = Math.ceil(fb.w / step) + 3, ny = Math.ceil(fb.h / step) + 3;
  const ox = fb.x0 - step, oy = fb.y0 - step;
  const inside = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const px = Math.round(ox + i * step), py = Math.round(oy + j * step);
      inside[j * nx + i] = px >= 0 && py >= 0 && px < F.w && py < F.h && F.mask[py * F.w + px] > 127 ? 1 : 0;
    }
  // 輪郭からの距離（2回の走査で近似）
  const INF = 1e9, d = new Float32Array(nx * ny);
  for (let k = 0; k < d.length; k++) d[k] = inside[k] ? INF : 0;
  const D1 = 1, D2 = Math.SQRT2;
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; if (!d[k]) continue; d[k] = Math.min(d[k], d[k - 1] + D1, d[k - nx] + D1, d[k - nx - 1] + D2, d[k - nx + 1] + D2); }
  for (let j = ny - 2; j > 0; j--) for (let i = nx - 2; i > 0; i--) { const k = j * nx + i; if (!d[k]) continue; d[k] = Math.min(d[k], d[k + 1] + D1, d[k + nx] + D1, d[k + nx + 1] + D2, d[k + nx - 1] + D2); }
  // 厚み：端は丸く、中は平らに近い（布の張り）
  const cap = GRID * 0.1;
  let hgt = new Float32Array(nx * ny);
  for (let k = 0; k < d.length; k++) { if (!inside[k]) continue; const t = Math.min(1, d[k] / cap); hgt[k] = Math.sqrt(1 - (1 - t) * (1 - t)); }
  for (let pass = 0; pass < 3; pass++) {
    const s = hgt.slice();
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; if (!inside[k]) continue; hgt[k] = (s[k] * 4 + s[k - 1] + s[k + 1] + s[k - nx] + s[k + nx]) / 8; }
  }
  // 輪郭の点は厚み0（表と裏が閉じる）
  const edge = (k: number) => !inside[k - 1] || !inside[k + 1] || !inside[k - nx] || !inside[k + nx];
  const unit = heightM / fb.h; // 画素 → メートル
  const thick = puff * fb.w * unit * 0.09;
  const bb = B ? bbox(B) : null;
  const pos: number[] = [], uv: number[] = [], idxF: number[] = [], idxB: number[] = [];
  const vf = new Int32Array(nx * ny).fill(-1), vb = new Int32Array(nx * ny).fill(-1);
  let n = 0;
  // 輪郭のギザギザをならす（輪郭上の点を、となりの輪郭点の平均へ寄せる）
  const PX = new Float32Array(nx * ny), PY = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { PX[j * nx + i] = ox + i * step; PY[j * nx + i] = oy + j * step; }
  const isEdge = new Uint8Array(nx * ny);
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; if (inside[k] && edge(k)) isEdge[k] = 1; }
  const nb = [-1, 1, -nx, nx, -nx - 1, -nx + 1, nx - 1, nx + 1];
  for (let it = 0; it < 6; it++) {
    const qx = PX.slice(), qy = PY.slice();
    for (let k = 0; k < isEdge.length; k++) {
      if (!isEdge[k]) continue;
      let sx = qx[k] * 2, sy = qy[k] * 2, c = 2;
      for (const o of nb) if (isEdge[k + o]) { sx += qx[k + o]; sy += qy[k + o]; c++; }
      PX[k] = sx / c; PY[k] = sy / c;
    }
  }
  for (let j = 1; j < ny - 1; j++)
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (!inside[k]) continue;
      const px = PX[k], py = PY[k];
      const X = (px - (fb.x0 + fb.w / 2)) * unit, Y = (fb.y0 + fb.h - py) * unit;
      const z = edge(k) ? 0 : hgt[k] * thick;
      pos.push(X, Y, z); uv.push(px / F.w, 1 - py / F.h); vf[k] = n++;
      // 背面：背面写真があれば左右反転して位置を合わせる。なければ正面の色だけ使う
      let bu = 0.5, bv = 0.5;
      if (B && bb) { const rx = (fb.x1 - px) / fb.w, ry = (py - fb.y0) / fb.h; bu = (bb.x0 + rx * bb.w) / B.w; bv = 1 - (bb.y0 + ry * bb.h) / B.h; }
      pos.push(X, Y, -z * 0.85); uv.push(bu, bv); vb[k] = n++;
    }
  for (let j = 1; j < ny - 2; j++)
    for (let i = 1; i < nx - 2; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;
      if (vf[a] < 0 || vf[b] < 0 || vf[c] < 0 || vf[e] < 0) continue;
      idxF.push(vf[a], vf[c], vf[b], vf[b], vf[c], vf[e]);
      idxB.push(vb[a], vb[b], vb[c], vb[b], vb[e], vb[c]);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([...idxF, ...idxB]);
  g.addGroup(0, idxF.length, 0);
  g.addGroup(idxF.length, idxB.length, 1);
  g.computeVertexNormals();
  return g;
}

export default function PhotoTo3D({ onGlb }: { onGlb?: (file: File) => void }) {
  const [front, setFront] = useState<Layer | null>(null);
  const [back, setBack] = useState<Layer | null>(null);
  const [side, setSide] = useState<Side>('front');
  const [tol, setTol] = useState(9);
  const [puff, setPuff] = useState(1);
  const [heightCm, setHeightCm] = useState(72);
  const [ver, setVer] = useState(0);
  const [st, setSt] = useState('');
  const pv = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const three = useRef<{ r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; ctl: OrbitControls; mesh?: THREE.Mesh; raf: number } | null>(null);
  const layer = side === 'front' ? front : back;

  // 2D の確認画面（消えた部分は赤く）
  useEffect(() => {
    const c = pv.current;
    if (!c || !layer) return;
    c.width = layer.w; c.height = layer.h;
    const x = c.getContext('2d')!;
    const img = x.createImageData(layer.w, layer.h);
    const s = layer.data.data;
    for (let i = 0; i < layer.mask.length; i++) {
      const k = layer.mask[i] > 127;
      img.data[i * 4] = k ? s[i * 4] : s[i * 4] * 0.35 + 150;
      img.data[i * 4 + 1] = k ? s[i * 4 + 1] : s[i * 4 + 1] * 0.35;
      img.data[i * 4 + 2] = k ? s[i * 4 + 2] : s[i * 4 + 2] * 0.35;
      img.data[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }, [layer, ver]);

  // 3D 表示の準備
  useEffect(() => {
    const el = host.current;
    if (!el || three.current) return;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(r.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6));
    const k = new THREE.DirectionalLight(0xffffff, 2.2); k.position.set(1.2, 1.6, 2); scene.add(k);
    const k2 = new THREE.DirectionalLight(0xffffff, 1.0); k2.position.set(-1.5, 0.6, -2); scene.add(k2);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    cam.position.set(0, 0.36, 2.2);
    const ctl = new OrbitControls(cam, r.domElement);
    ctl.target.set(0, 0.36, 0); ctl.enableDamping = true; ctl.autoRotate = true; ctl.autoRotateSpeed = 1.6;
    const size = () => { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    size();
    const ro = new ResizeObserver(size); ro.observe(el);
    const loop = () => { ctl.update(); r.render(scene, cam); three.current!.raf = requestAnimationFrame(loop); };
    three.current = { r, scene, cam, ctl, raf: 0 };
    loop();
    return () => { cancelAnimationFrame(three.current?.raf || 0); ro.disconnect(); r.dispose(); el.removeChild(r.domElement); three.current = null; };
  }, [!!front]); // eslint-disable-line react-hooks/exhaustive-deps

  // 写真やマスクが変わるたびに、すぐ作り直す
  const rebuild = useCallback(() => {
    const T = three.current;
    if (!T || !front) return;
    const g = buildMesh(front, back, puff, heightCm / 100);
    if (!g) return;
    if (T.mesh) { T.scene.remove(T.mesh); T.mesh.geometry.dispose(); (T.mesh.material as THREE.Material[]).forEach((m) => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); }); }
    const tf = texture(front);
    const mf = new THREE.MeshStandardMaterial({ map: tf.tex, roughness: 0.9, side: THREE.FrontSide });
    let mb: THREE.MeshStandardMaterial;
    if (back) mb = new THREE.MeshStandardMaterial({ map: texture(back).tex, roughness: 0.9 });
    else mb = new THREE.MeshStandardMaterial({ color: tf.mean, roughness: 0.92 });
    const mesh = new THREE.Mesh(g, [mf, mb]);
    mesh.name = 'garment';
    T.scene.add(mesh);
    T.mesh = mesh;
    const h = heightCm / 100;
    T.ctl.target.set(0, h / 2, 0);
    if (!placed.current) { T.cam.position.set(0, h / 2, h * 2.9); placed.current = true; }
  }, [front, back, puff, heightCm, ver]);
  useEffect(() => { rebuild(); }, [rebuild]);

  const pickFile = async (file: File | undefined, s: Side) => {
    if (!file) return;
    setSt(tt('Reading…', '読み込み中…'));
    try {
      const L = await loadLayer(file);
      autoBackground(L, tol);
      if (s === 'front') setFront(L); else setBack(L);
      setSide(s);
      setSt('');
    } catch (e) { setSt((e as Error).message); }
  };

  const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const L = layer, c = pv.current;
    if (!L || !c) return;
    const r = c.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * L.w), y = Math.round(((e.clientY - r.top) / r.height) * L.h);
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return;
    const i = y * L.w + x, d = L.data.data;
    // 消えている所をタップしたら戻す、残っている所なら消す
    const restore = L.mask[i] < 128;
    const hit = flood(L, [i], [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], tol);
    for (let k = 0; k < hit.length; k++) if (hit[k]) L.mask[k] = restore ? 255 : 0;
    tidy(L.mask, L.w, L.h);
    setVer((v) => v + 1);
  };

  const exportGlb = async () => {
    const T = three.current;
    if (!T?.mesh) return null;
    const ex = new GLTFExporter();
    const res = await ex.parseAsync(T.mesh, { binary: true, maxTextureSize: 2048 });
    return new File([res as ArrayBuffer], 'photo-3d.glb', { type: 'model/gltf-binary' });
  };

  return (
    <div className="p3">
      <p className="note">{tt(
        'Lay the piece flat (or use the ghost mannequin photo) on a plain background and shoot it straight from the front, then the back. It turns into 3D straight away. This estimates the shape from two photos — it is not a full 3D scan.',
        '無地の背景に服を平らに置いて（またはゴーストマネキンの写真で）、真上から正面、次に背面を撮ります。その場で3Dになります。2枚の写真から形を推定する方式で、全方向から撮る本格的な3Dスキャンではありません。',
      )}</p>
      <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <label className="btn primary" style={{ cursor: 'pointer' }}>
          {tt('Front photo', '正面の写真')}
          <input type="file" accept="image/*" hidden onChange={(e) => { pickFile(e.target.files?.[0], 'front'); e.target.value = ''; }} />
        </label>
        <label className="btn" style={{ cursor: front ? 'pointer' : 'not-allowed', opacity: front ? 1 : 0.5 }}>
          {tt('Back photo (optional)', '背面の写真（なくても可）')}
          <input type="file" accept="image/*" hidden disabled={!front} onChange={(e) => { pickFile(e.target.files?.[0], 'back'); e.target.value = ''; }} />
        </label>
      </div>
      {st && <p className="status">{st}</p>}
      {front && (
        <div className="p3-work">
          <div className="p3-2d">
            {back && (
              <div className="gm-row">
                <button type="button" className={`btn${side === 'front' ? ' primary' : ''}`} onClick={() => setSide('front')}>{tt('Front', '正面')}</button>
                <button type="button" className={`btn${side === 'back' ? ' primary' : ''}`} onClick={() => setSide('back')}>{tt('Back', '背面')}</button>
              </div>
            )}
            <canvas ref={pv} className="p3-pv" onPointerDown={tap} />
            <p className="note">{tt('Red = removed. Tap a part to remove it; tap a red part to bring it back.', '赤い所が消えた部分です。タップで消し、赤い所をタップすると戻ります。')}</p>
            <label className="gm-sl">{tt('Tolerance', '色の幅')} <input type="range" min={2} max={45} value={tol} onChange={(e) => setTol(+e.target.value)} /> <b>{tol}</b></label>
            <div className="gm-row">
              <button type="button" className="btn" onClick={() => { if (layer) { autoBackground(layer, tol); setVer((v) => v + 1); } }}>{tt('Redo background', '背景を消し直す')}</button>
            </div>
          </div>
          <div className="p3-3d">
            <div className="p3-view" ref={host} />
            <label className="gm-sl">{tt('Thickness', '厚み')} <input type="range" min={0.2} max={2.5} step={0.05} value={puff} onChange={(e) => setPuff(+e.target.value)} /> <b>{puff.toFixed(1)}</b></label>
            <label className="gm-sl">{tt('Length (cm)', '着丈（cm）')} <input type="range" min={20} max={130} value={heightCm} onChange={(e) => setHeightCm(+e.target.value)} /> <b>{heightCm}</b></label>
            <div className="gm-row">
              <button type="button" className="btn" onClick={async () => { const f = await exportGlb(); if (!f) return; const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }}>{tt('Download .glb', '.glb をダウンロード')}</button>
              {onGlb && <button type="button" className="btn primary" onClick={async () => { const f = await exportGlb(); if (f) onGlb(f); }}>{tt('Use as this piece’s 3D', 'この作品の3Dにする')}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
