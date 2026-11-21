'use client';
// スマートスキャン：撮る → 360° → 立体（3D）→ 型紙（パターン）を、ひとつの流れで。
// ① カメラで服のまわりを回って撮る（または写真・動画を選ぶ）→ 24方向の画像をあつめる
// ② 360°で回して見る。正面と背面の向きを決める
// ③ 正面・背面の2枚から服の形をふくらませて立体にする（推定。測量のような精密な3Dスキャンではない）
// ④ 正面の形から目印（衿・肩・脇・裾・袖口）を見つけ、着丈の実寸で縮尺を合わせて型紙をつくる
// 画像はすべてこの端末の中だけで処理し、どこにも送らない。
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { type Layer } from './GhostMannequin';
import { segment } from './scanSegment';
import { buildGarment } from './garment3d';
import { autoLandmarks } from './lab/landmarks';
import { calibrate, docToSVG, draft, pxMeasures, specFrom, type Spec } from './lab/draft';
import { tt, useLang } from './Lang';

const N = 24; // 1周で集める方向の数
const MAXPX = 1100;
type Phase = 'start' | 'camera' | 'view';

const fit = (w: number, h: number) => { const k = Math.min(1, MAXPX / Math.max(w, h)); return [Math.round(w * k), Math.round(h * k)]; };
function grab(src: CanvasImageSource, w: number, h: number) {
  const [W, H] = fit(w, h); const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d')!.drawImage(src, 0, 0, W, H); return c;
}
function toLayer(c: HTMLCanvasElement): Layer {
  const d = document.createElement('canvas'); d.width = c.width; d.height = c.height;
  const x = d.getContext('2d', { willReadFrequently: true })!; x.drawImage(c, 0, 0);
  return { img: d, data: x.getImageData(0, 0, d.width, d.height), mask: new Uint8ClampedArray(d.width * d.height).fill(255), w: d.width, h: d.height };
}
const save = (name: string, data: Blob | string, type = 'application/octet-stream') => {
  const b = typeof data === 'string' ? new Blob([data], { type }) : data; const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
};
async function framesFromVideo(file: File): Promise<HTMLCanvasElement[]> {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(file);
  await new Promise<void>((r, j) => { v.onloadeddata = () => r(); v.onerror = () => j(new Error('video')); });
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < N; i++) {
    v.currentTime = Math.min(v.duration - 0.05, (v.duration * i) / N);
    await new Promise<void>((r) => { v.onseeked = () => r(); });
    out.push(grab(v, v.videoWidth, v.videoHeight));
  }
  URL.revokeObjectURL(v.src); return out;
}
async function framesFromImages(files: File[]): Promise<HTMLCanvasElement[]> {
  const out: HTMLCanvasElement[] = [];
  for (const f of files.slice(0, 48)) {
    const url = URL.createObjectURL(f); const im = new Image(); im.src = url;
    await im.decode().catch(() => null); if (im.naturalWidth) out.push(grab(im, im.naturalWidth, im.naturalHeight)); URL.revokeObjectURL(url);
  }
  return out;
}

// 切り抜きと目印の確認用（服以外は暗く、目印は点で）
function cutPreview(L: Layer, lm: NonNullable<ReturnType<typeof autoLandmarks>>) {
  const c = document.createElement('canvas'); c.width = L.w; c.height = L.h;
  const x = c.getContext('2d')!, d = x.createImageData(L.w, L.h), s = L.data.data;
  for (let i = 0; i < L.mask.length; i++) { const k = L.mask[i] > 127; for (let j = 0; j < 3; j++) d.data[i * 4 + j] = k ? s[i * 4 + j] : 24 + s[i * 4 + j] * 0.12; d.data[i * 4 + 3] = 255; }
  x.putImageData(d, 0, 0);
  const r = Math.max(L.w, L.h) * 0.012;
  x.fillStyle = '#7ee2a8'; x.strokeStyle = '#111'; x.lineWidth = r * 0.35;
  for (const k of ['NL', 'NR', 'CF', 'SL', 'SR', 'AL', 'AR', 'HL', 'HR', 'CO', 'CI'] as const) { const p = lm[k]; x.beginPath(); x.arc(p[0], p[1], r, 0, 7); x.fill(); x.stroke(); }
  return c.toDataURL('image/jpeg', 0.8);
}

export default function SmartScan() {
  const { lang } = useLang();
  const [phase, setPhase] = useState<Phase>('start');
  const [frames, setFrames] = useState<HTMLCanvasElement[]>([]);
  const [at, setAt] = useState(0); // 360° で見ている画像
  const [front, setFront] = useState(0);
  const [back, setBack] = useState<number | null>(null);
  const [len, setLen] = useState(70); // 着丈（cm）
  const [tol, setTol] = useState(9);
  const [depth, setDepth] = useState(1);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [got, setGot] = useState<boolean[]>(Array(N).fill(false));
  const [made, setMade0] = useState<{ L: Layer; B: Layer | null; spec: Spec; svg: string; doc: ReturnType<typeof draft>; cut: string } | null>(null);
  const setMade: typeof setMade0 = (v) => { setHung(''); setMade0(v); };
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const shot = useRef<(HTMLCanvasElement | null)[]>([]);
  const spin = useRef<HTMLCanvasElement>(null);
  const view3d = useRef<HTMLDivElement>(null);
  const three = useRef<{ group: THREE.Object3D | null; dispose: () => void } | null>(null);

  // ---- カメラでスキャン ----
  const startCamera = async () => {
    setMsg('');
    try {
      // iPhone は向きのセンサーに許可が必要
      const DO = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
      if (DO?.requestPermission) await DO.requestPermission().catch(() => 'denied');
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
      stream.current = s; shot.current = Array(N).fill(null); setGot(Array(N).fill(false)); setPhase('camera');
      setTimeout(() => { if (video.current) { video.current.srcObject = s; video.current.play().catch(() => null); } }, 30);
    } catch { setMsg(tt('The camera could not be opened. You can choose photos or a video instead.', 'カメラを開けませんでした。写真や動画を選んで取り込むこともできます。')); }
  };
  const stopCamera = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  const capture = (k: number) => {
    const v = video.current; if (!v || !v.videoWidth || shot.current[k]) return;
    shot.current[k] = grab(v, v.videoWidth, v.videoHeight);
    setGot((g) => { const n = [...g]; n[k] = true; return n; });
    try { navigator.vibrate?.(8); } catch { /* 無視 */ }
  };
  // 向きのセンサーがあれば 15° ごとに自動で1枚。なければ一定間隔で1枚ずつ
  useEffect(() => {
    if (phase !== 'camera') return;
    let a0: number | null = null, last = performance.now(), sensor = false, next = 0;
    const onO = (e: DeviceOrientationEvent) => {
      if (e.alpha == null) return; sensor = true;
      if (a0 == null) a0 = e.alpha;
      const d = ((a0 - e.alpha) % 360 + 360) % 360;
      capture(Math.min(N - 1, Math.floor(d / (360 / N))));
    };
    addEventListener('deviceorientation', onO);
    const id = setInterval(() => {
      if (sensor) return;
      if (performance.now() - last > 650 && next < N) { capture(next); next++; last = performance.now(); }
    }, 120);
    return () => { removeEventListener('deviceorientation', onO); clearInterval(id); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const finishCamera = () => {
    const fs = shot.current.filter(Boolean) as HTMLCanvasElement[];
    stopCamera();
    if (fs.length < 2) { setPhase('start'); setMsg(tt('Too few shots. Walk slowly around the piece.', '撮れた枚数が少なすぎます。服のまわりをゆっくり回ってください。')); return; }
    useFrames(fs);
  };
  useEffect(() => () => stopCamera(), []);

  const useFrames = (fs: HTMLCanvasElement[]) => {
    setFrames(fs); setAt(0); setFront(0); setBack(fs.length > 3 ? Math.round(fs.length / 2) : fs.length > 1 ? 1 : null); setMade(null); setPhase('view');
  };
  const pickFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(tt('Reading…', '読み込み中…')); setMsg('');
    try {
      const files = Array.from(list);
      const vid = files.find((f) => f.type.startsWith('video/'));
      const fs = vid ? await framesFromVideo(vid) : await framesFromImages(files.filter((f) => f.type.startsWith('image/')));
      if (!fs.length) throw new Error('none');
      useFrames(fs);
    } catch { setMsg(tt('Could not read these files.', 'このファイルは読み込めませんでした。')); }
    setBusy('');
  };

  // ---- 360° の表示（ドラッグで回す） ----
  useEffect(() => {
    const c = spin.current, f = frames[at]; if (!c || !f) return;
    c.width = f.width; c.height = f.height; c.getContext('2d')!.drawImage(f, 0, 0);
  }, [frames, at, phase]);
  const drag = useRef<{ x: number; a: number } | null>(null);
  const onSpin = {
    onPointerDown: (e: React.PointerEvent) => { drag.current = { x: e.clientX, a: at }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => { const d = drag.current; if (!d || !frames.length) return; const k = Math.round((e.clientX - d.x) / 14); setAt(((d.a - k) % frames.length + frames.length) % frames.length); },
    onPointerUp: () => { drag.current = null; },
  };

  // ---- 立体と型紙をつくる ----
  const make = async () => {
    if (!frames[front]) return;
    setBusy(tt('Cutting out the piece, inflating it into 3D and drafting the pattern…', '服を切り抜き、立体にふくらませ、型紙をおこしています…')); setMsg('');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const L = toLayer(frames[front]); segment(L, tol);
      const B = back != null && frames[back] ? toLayer(frames[back]) : null; if (B) segment(B, tol);
      const lm = autoLandmarks(L);
      if (!lm) throw new Error(tt('The outline of the piece could not be found. Shoot it in front of a plain wall or floor.', '服の輪郭が見つかりませんでした。無地の壁や床の前で撮ってください。'));
      const px = pxMeasures(lm), cal = calibrate(px, { length: len }), spec = specFrom(lm, cal.k, { length: len });
      const doc = draft(spec);
      setMade({ L, B, spec, svg: docToSVG(doc, 1), doc, cut: cutPreview(L, lm) });
    } catch (e) { setMsg(String((e as Error).message)); }
    setBusy('');
  };

  // 3D の表示
  useEffect(() => {
    const el = view3d.current; if (!el || !made) return;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(r.domElement);
    const sc = new THREE.Scene(); const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    sc.add(new THREE.HemisphereLight(0xffffff, 0xbbb6ad, 0.8)); const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(1, 2, 2); sc.add(dl);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
    const oc = new OrbitControls(cam, r.domElement); oc.enableDamping = true; oc.autoRotate = true; oc.autoRotateSpeed = 1.6;
    const g = buildGarment(made.L, made.B, len / 100, depth);
    const group = g?.group || null;
    if (group) {
      // 裏地（内側）は暗すぎると袖が黒く見えるので、生地の明るさに寄せる
      group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && !Array.isArray(m) && m.side === THREE.BackSide) m.color.setHex(0xb3aea6); });
      sc.add(group);
      const bx = new THREE.Box3().setFromObject(group), c = bx.getCenter(new THREE.Vector3()), s = bx.getSize(new THREE.Vector3());
      oc.target.copy(c); cam.position.set(c.x, c.y + s.y * 0.05, c.z + Math.max(s.x, s.y) * 2.1);
      const sh = new THREE.Mesh(new THREE.CircleGeometry(Math.max(s.x, s.z) * 0.7, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 }));
      sh.rotation.x = -Math.PI / 2; sh.position.set(c.x, bx.min.y - 0.02, c.z); sc.add(sh);
    }
    const size = () => { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    size(); addEventListener('resize', size);
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); oc.update(); r.render(sc, cam); }; loop();
    three.current = { group, dispose: () => { cancelAnimationFrame(raf); removeEventListener('resize', size); oc.dispose(); pm.dispose(); r.dispose(); el.removeChild(r.domElement); } };
    return () => { three.current?.dispose(); three.current = null; };
  }, [made, depth]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportGLB = async () => {
    const g = three.current?.group; if (!g) return;
    const out = g.clone(); out.getObjectByName('lining')?.removeFromParent();
    out.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !Array.isArray(m.material)) { m.material = (m.material as THREE.Material).clone(); m.material.side = THREE.DoubleSide; } });
    const res = await new GLTFExporter().parseAsync(out, { binary: true, maxTextureSize: 2048 });
    save('gallery-crypto-scan.glb', new Blob([res as ArrayBuffer], { type: 'model/gltf-binary' }));
  };

  // スキャンした服をレールに掛ける：切り抜いた正面・背面をこの端末に保存し、レールのページで立体にして見せる
  const toPng = (L: Layer) => {
    const k = Math.min(1, 640 / Math.max(L.w, L.h)), c = document.createElement('canvas'); c.width = Math.round(L.w * k); c.height = Math.round(L.h * k);
    const t = document.createElement('canvas'); t.width = L.w; t.height = L.h; const tx = t.getContext('2d')!, d = tx.createImageData(L.w, L.h);
    for (let i = 0; i < L.mask.length; i++) { d.data[i * 4] = L.data.data[i * 4]; d.data[i * 4 + 1] = L.data.data[i * 4 + 1]; d.data[i * 4 + 2] = L.data.data[i * 4 + 2]; d.data[i * 4 + 3] = L.mask[i]; }
    tx.putImageData(d, 0, 0); c.getContext('2d')!.drawImage(t, 0, 0, c.width, c.height); return c.toDataURL('image/png');
  };
  const [hung, setHung] = useState('');
  const hang = () => {
    if (!made) return;
    try {
      const id = 'scan-' + Date.now().toString(36), n2 = (JSON.parse(localStorage.getItem('gc-shop-local') || '[]') as { id: string }[]);
      const sp = made.spec;
      const item = { id, code: 'SCAN-' + id.slice(-4).toUpperCase(), title: tt('Scanned piece', 'スキャンした服'), sub: tt('Smart scan · on this device', 'スマートスキャン · この端末'), price: '—', img: toPng(made.L), back: made.B ? toPng(made.B) : undefined, buy: 'local', desc: '',
        facts: [['Size', `${tt('Length', '着丈')} ${Math.round(sp.length)} / ${tt('Chest', '身幅')} ${Math.round(sp.chest * 2)} cm`], [tt('Shoulder', '肩幅'), `${Math.round(sp.shoulderX * 2)} cm`], [tt('Sleeve', '袖丈'), `${Math.round(sp.sleeve)} cm`]], zone: 'vintage' };
      // この端末の保存容量に収まるよう、スキャンは新しい6着まで
      const rest = n2.filter((x) => !String(x.id).startsWith('scan-')).concat(n2.filter((x) => String(x.id).startsWith('scan-')).slice(0, 5));
      localStorage.setItem('gc-shop-local', JSON.stringify([item, ...rest]));
      setHung(id);
    } catch { setMsg(tt('Could not save on this device (storage is full).', 'この端末に保存できませんでした（保存領域がいっぱいです）。')); }
  };

  const spec = made?.spec;
  const rows = useMemo(() => spec ? [
    [tt('Body length', '着丈'), spec.length], [tt('Chest width', '身幅'), spec.chest * 2], [tt('Shoulder width', '肩幅'), spec.shoulderX * 2],
    [tt('Hem width', '裾幅'), spec.hem * 2], [tt('Sleeve length', '袖丈'), spec.sleeve], [tt('Cuff width', '袖口幅'), spec.cuff],
  ] as [string, number][] : [], [spec, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = got.filter(Boolean).length;

  return (
    <div className="ss" translate="no">
      <section className="ss-hero">
        <p className="ss-kick">{tt('Smart scan · beta', 'スマートスキャン · 試作')}</p>
        <h2>{tt('Scan a piece. Get it in 3D and as a pattern.', '撮るだけで、立体と型紙に。')}</h2>
        <p className="ss-lead">{tt('Walk around the garment with your phone. Gallery Crypto turns the shots into a 360° view, an estimated 3D model and a real-size pattern — all on this device.', 'スマホで服のまわりを一周撮るだけ。360°ビュー、推定の3Dモデル、実寸の型紙まで、この端末の中だけでつくります。')}</p>
        <div className="ss-stats">
          <span><b>{N}</b>{tt('angles per scan', '方向を自動で撮影')}</span>
          <span><b>0</b>{tt('images uploaded', '枚もどこにも送らない')}</span>
          <span><b>cm</b>{tt('real-size pattern', '実寸の型紙で書き出し')}</span>
        </div>
      </section>

      <ol className="ss-steps">
        {[[tt('Scan', 'スキャン'), tt('Camera, photos or a video', 'カメラ・写真・動画')], [tt('360° view', '360°ビュー'), tt('Set front and back', '正面と背面を決める')], [tt('3D', '立体化'), tt('Inflate the outline', '形をふくらませる')], [tt('Pattern', '型紙化'), tt('Draft from landmarks', '目印から型紙を起こす')]].map(([a, b], i) => (
          <li key={a} className={(i === 0 && phase !== 'start') || (i === 1 && phase === 'view') || (i >= 2 && made) ? 'on' : ''}><em>0{i + 1}</em><b>{a}</b><span>{b}</span></li>
        ))}
      </ol>

      {phase === 'start' && (
        <section className="ss-card ss-pick">
          <button className="ss-btn" onClick={startCamera}>{tt('Scan with the camera', 'カメラでスキャン')}</button>
          <label className="ss-btn ghost">{tt('Choose photos or a video', '写真・動画を選ぶ')}<input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => pickFiles(e.target.files)} /></label>
          <ul className="ss-tips">
            <li>{tt('Hang or lay the piece in front of a plain wall or floor.', '服は無地の壁の前に掛けるか、無地の床に置きます。')}</li>
            <li>{tt('Walk slowly once around it, keeping the whole piece in frame.', '服全体が画面に入る距離で、ゆっくり一周します。')}</li>
            <li>{tt('A video of one slow turn works too (24 frames are picked from it).', 'ゆっくり一周した動画でもOK（24コマを自動で取り出します）。')}</li>
          </ul>
        </section>
      )}

      {phase === 'camera' && (
        <section className="ss-card ss-cam">
          <div className="ss-live">
            <video ref={video} playsInline muted />
            <svg className="ss-ring" viewBox="-60 -60 120 120" aria-hidden>
              {Array.from({ length: N }, (_, k) => { const a0 = (k / N) * Math.PI * 2 - Math.PI / 2, a1 = ((k + 0.82) / N) * Math.PI * 2 - Math.PI / 2; return <path key={k} d={`M${Math.cos(a0) * 52} ${Math.sin(a0) * 52} A52 52 0 0 1 ${Math.cos(a1) * 52} ${Math.sin(a1) * 52}`} className={got[k] ? 'on' : ''} />; })}
            </svg>
            <p className="ss-count"><b>{done}</b> / {N}</p>
          </div>
          <p className="ss-note">{tt('Keep the piece in the middle and walk around it. Each segment fills as an angle is captured.', '服を真ん中に入れたまま、まわりを歩いてください。撮れた方向の目盛りが埋まっていきます。')}</p>
          <div className="ss-row">
            <button className="ss-btn" onClick={finishCamera}>{done >= N ? tt('Done — next', '撮影完了 → 次へ') : tt('Finish here', 'ここで終える')}</button>
            <button className="ss-btn ghost" onClick={() => { const k = got.findIndex((g) => !g); if (k >= 0) capture(k); }}>{tt('Take one now', '今の向きで1枚')}</button>
            <button className="ss-link" onClick={() => { stopCamera(); setPhase('start'); }}>{tt('Cancel', 'やめる')}</button>
          </div>
        </section>
      )}

      {phase === 'view' && (
        <section className="ss-work">
          <div className="ss-card">
            <h3>{tt('360° view', '360°ビュー')}</h3>
            <div className="ss-spin" {...onSpin}><canvas ref={spin} /><span>{at + 1} / {frames.length} · {tt('drag to turn', 'ドラッグで回す')}</span>{at === front && <em>{tt('Front', '正面')}</em>}{at === back && <em>{tt('Back', '背面')}</em>}</div>
            <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={at} onChange={(e) => setAt(+e.target.value)} aria-label={tt('Angle', '向き')} />
            <div className="ss-row">
              <button className="ss-chip" aria-pressed={at === front} onClick={() => { setFront(at); setMade(null); }}>{tt('Use as front', 'この向きを正面に')}</button>
              <button className="ss-chip" aria-pressed={at === back} onClick={() => { setBack(at); setMade(null); }}>{tt('Use as back', 'この向きを背面に')}</button>
              <button className="ss-chip" onClick={() => { setBack(null); setMade(null); }}>{tt('No back', '背面なし')}</button>
            </div>
            <div className="ss-fields">
              <label>{tt('Real body length (cm)', '着丈の実寸（cm）')}<input type="number" min={20} max={150} value={len} onChange={(e) => { setLen(Math.max(20, Math.min(150, +e.target.value || 70))); setMade(null); }} /></label>
              <label>{tt('Background cut', '背景の切り抜き')}<input type="range" min={3} max={24} value={tol} onChange={(e) => { setTol(+e.target.value); setMade(null); }} /></label>
            </div>
            {made && (
              <figure className="ss-cut">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={made.cut} alt="" />
                <figcaption>{tt('Cut-out and landmarks used for the pattern. If the outline is wrong, move “Background cut” and make again.', '型紙に使った切り抜きと目印です。輪郭がずれていたら「背景の切り抜き」を動かして、もう一度つくってください。')}</figcaption>
              </figure>
            )}
            <button className="ss-btn" onClick={make} disabled={!!busy}>{made ? tt('Make again', 'もう一度つくる') : tt('Make 3D and pattern', '立体と型紙をつくる')}</button>
            <button className="ss-link" onClick={() => { setFrames([]); setMade(null); setPhase('start'); }}>{tt('Start a new scan', '新しくスキャンする')}</button>
          </div>

          {made && (
            <>
              <div className="ss-card">
                <h3>{tt('3D (estimated)', '立体（推定）')}</h3>
                <div className="ss-3d" ref={view3d} />
                <label className="ss-fields one">{tt('Thickness', '厚み')}<input type="range" min={0.4} max={2} step={0.1} value={depth} onChange={(e) => setDepth(+e.target.value)} /></label>
                <div className="ss-row">
                  <button className="ss-btn" onClick={exportGLB}>{tt('Download 3D (GLB)', '3Dを保存（GLB）')}</button>
                  {hung
                    ? <a className="ss-btn" href={`/shop/rail#p=${hung}`}>{tt('See it on the rail →', 'レールで見る →')}</a>
                    : <button className="ss-btn ghost" onClick={hang}>{tt('Hang it on the rail', 'レールに掛ける')}</button>}
                </div>
                <p className="ss-fine">{tt('Shaped from the front and back shots, not measured like a laser scan. Good for previews and the showroom.', '正面と背面の2枚から形を推定したものです。レーザー測量のような精密なスキャンではありません。プレビューやショールーム向けです。')}</p>
              </div>
              <div className="ss-card">
                <h3>{tt('Pattern (real size)', '型紙（実寸）')}</h3>
                <div className="ss-svg" dangerouslySetInnerHTML={{ __html: made.svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%"') }} />
                <dl className="ss-meas">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{Math.round(v * 10) / 10} cm</dd></div>)}</dl>
                <div className="ss-row">
                  <button className="ss-btn" onClick={() => save('gallery-crypto-pattern.svg', made.svg, 'image/svg+xml')}>{tt('Download pattern (SVG, 1:1)', '型紙を保存（SVG・原寸）')}</button>
                  <button className="ss-btn ghost" onClick={() => save('gallery-crypto-pattern.json', JSON.stringify({ spec: made.spec }), 'application/json')}>{tt('Pattern data (for Pattern lab)', '型紙データ（パターンラボ用）')}</button>
                </div>
                <p className="ss-fine">{tt('Seam allowance 1 cm (dashed). Open the data in the Pattern tab to adjust points and sew it in 3D.', '点線は縫い代1cm。型紙データは「パターン」タブで読み込むと、点を動かして調整し、3Dで縫って確かめられます。')}</p>
              </div>
            </>
          )}
        </section>
      )}

      {busy && <p className="ss-busy">{busy}</p>}
      {msg && <p className="ss-msg">{msg}</p>}
    </div>
  );
}
