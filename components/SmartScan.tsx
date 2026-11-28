'use client';
// スマートスキャン：撮る → 360° → 立体（3D）→ 型紙（パターン）を、ひとつの流れで。
// ① カメラで服のまわりを回って撮る（または写真・動画を選ぶ）→ 24方向の画像をあつめる
// ② 360°で回して見る。正面と背面の向きを決める
// ③ 3Dキャプチャ：一周ぶんの写真（向き＋AIで切り抜いた形）から立体を彫り出し、写真を投影して色を貼る
// ④ 正面の形から目印（衿・肩・脇・裾・袖口）を見つけ、着丈の実寸で縮尺を合わせて型紙をつくる
// 画像はすべてこの端末の中だけで処理し、どこにも送らない。
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { type Layer } from './GhostMannequin';
import dynamic from 'next/dynamic';
import { matte } from '@/lib/scan/matte';
import { carve, surface, hullMesh, exportable, type View } from '@/lib/scan/hull';
import { putModel, delModel } from '@/lib/modelStore';
import type { Shot } from './scan/Capture';
import { isPhone } from '@/lib/device';
import { unlockSpeech } from '@/lib/voice';
const Capture = dynamic(() => import('./scan/Capture'), { ssr: false });
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
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [masks, setMasks] = useState<(Uint8ClampedArray | null)[]>([]);
  const [phis, setPhis] = useState<number[]>([]);
  const [sensor, setSensor] = useState(false);
  const [flip, setFlip] = useState(false);
  const [made, setMade0] = useState<{ L: Layer; B: Layer | null; spec: Spec; svg: string; doc: ReturnType<typeof draft>; cut: string; hull: ReturnType<typeof hullMesh> | null; views: number; ai: boolean } | null>(null);
  const setMade: typeof setMade0 = (v) => { setHung(''); setMade0(v); };
  const spin = useRef<HTMLCanvasElement>(null);
  const view3d = useRef<HTMLDivElement>(null);
  const three = useRef<{ group: THREE.Object3D | null; dispose: () => void } | null>(null);

  // ---- カメラで3Dキャプチャ ----
  const startCamera = async () => {
    setMsg('');
    // iPhone は向き・動きのセンサーに許可が必要（ボタンを押したときにだけ聞ける）
    const DO = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    const DM = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    if (DO?.requestPermission) await DO.requestPermission().catch(() => 'denied');
    if (DM?.requestPermission) await DM.requestPermission().catch(() => 'denied');
    unlockSpeech(); // iPhone：ボタンを押したこの時に、読み上げを使えるようにしておく
    setPhase('camera');
  };
  const onCaptured = (list: Shot[], sens: boolean) => {
    useFrames(list.map((x) => x.img), list.map((x) => x.mask), list.map((x) => x.phi ?? 0), sens);
  };

  const useFrames = (fs: HTMLCanvasElement[], ms?: (Uint8ClampedArray | null)[], ph?: number[], sens = false) => {
    // 向きが分からないとき（写真・動画）は、一周を等分
    const p = ph && ph.length === fs.length ? ph : fs.map((_, i) => -(i / fs.length) * Math.PI * 2);
    let bk: number | null = fs.length > 1 ? 1 : null, bd = 9;
    if (fs.length > 3) p.forEach((v, i) => { const d = Math.abs(Math.abs(Math.atan2(Math.sin(v - p[0]), Math.cos(v - p[0]))) - Math.PI); if (d < bd) { bd = d; bk = i; } });
    setFrames(fs); setMasks(ms || fs.map(() => null)); setPhis(p); setSensor(sens); setFlip(false);
    setAt(0); setFront(0); setBack(bk); setMade(null); setPhase('view');
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
    setMsg('');
    try {
      // 1) まだ切り抜いていない写真をAIで切り抜く
      const ms = masks.slice(); let ai = true;
      for (let i = 0; i < frames.length; i++) {
        if (ms[i]) continue;
        setBusy(tt(`Cutting out the piece with AI… ${i + 1} / ${frames.length}`, `AIで服を切り抜いています… ${i + 1} / ${frames.length}`));
        await new Promise((r) => setTimeout(r, 0));
        const r = await matte(frames[i], tol); ms[i] = r.mask; ai = ai && r.ai;
      }
      setMasks(ms);
      // 2) 一周の写真から立体を彫り出す（正面を0°に）
      setBusy(tt('Carving the 3D shape from every angle…', 'すべての向きから、立体を彫り出しています…'));
      await new Promise((r) => setTimeout(r, 30));
      const sg = flip ? -1 : 1, p0 = phis[front] || 0;
      const views: View[] = frames.map((f, i) => ({ img: f, mask: ms[i]!, w: f.width, h: f.height, phi: sg * ((phis[i] || 0) - p0) }));
      const h = frames.length >= 3 ? carve(views, isPhone() ? 72 : 108) : null;
      const hull = h ? hullMesh(h, surface(h, 4), isPhone() ? 768 : 1280) : null;
      // 3) 正面の形から目印を見つけ、着丈の実寸で縮尺を合わせて型紙に
      setBusy(tt('Drafting the pattern…', '型紙をおこしています…'));
      const L = toLayer(frames[front]); L.mask = ms[front]!;
      const B = back != null && frames[back] ? toLayer(frames[back]) : null; if (B) B.mask = ms[back!]!;
      const lm = autoLandmarks(L);
      if (!lm) throw new Error(tt('The outline of the piece could not be found. Keep the whole piece in frame against a plain background.', '服の輪郭が見つかりませんでした。服全体が画面に入るように、なるべく無地の背景で撮ってください。'));
      const px = pxMeasures(lm), cal = calibrate(px, { length: len }), spec = specFrom(lm, cal.k, { length: len });
      const doc = draft(spec);
      setMade({ L, B, spec, svg: docToSVG(doc, 1), doc, cut: cutPreview(L, lm), hull, views: frames.length, ai });
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
    // 彫り出した立体（服の高さ＝着丈の実寸）
    const group = made.hull ? new THREE.Group() : null;
    if (group && made.hull) {
      made.hull.mesh.scale.setScalar(len / 100); group.add(made.hull.mesh);
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
  }, [made, len]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportGLB = async () => {
    const g = three.current?.group; if (!g) return;
    const src = g.getObjectByName('scan') as THREE.Mesh | undefined; if (!src) return;
    const out = exportable(src); // 書き出しは頂点の色で（どのソフトでも開ける）
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
  // モックアップへ：切り抜いた正面・背面と測った寸法を渡す
  const toMock = () => {
    if (!made) return;
    try { localStorage.setItem('gc-mock-src', JSON.stringify({ front: toPng(made.L), back: made.B ? toPng(made.B) : undefined, length: Math.round(made.spec.length * 2) / 2, chest: Math.round(made.spec.chest * 4) / 2 })); location.hash = 'mock'; dispatchEvent(new HashChangeEvent('hashchange')); }
    catch { setMsg(tt('Could not hand over to the mockup (storage is full).', 'モックアップに渡せませんでした（保存領域がいっぱいです）。')); }
  };
  // スキャンした服を店に並べる：切り抜いた正面・背面（レール用）と、彫り出した立体（.glb、ショールームのスキャンの台用）をこの端末に保存
  const hang = async () => {
    if (!made) return;
    let glbKey: string | undefined;
    const id0 = 'scan-' + Date.now().toString(36);
    try {
      const src = three.current?.group?.getObjectByName('scan') as THREE.Mesh | undefined;
      if (src) { const res = await new GLTFExporter().parseAsync(exportable(src), { binary: true, maxTextureSize: 1024 }); await putModel(id0, res as ArrayBuffer); glbKey = id0; }
    } catch { /* 立体が保存できなくても、絵だけで並べる */ }
    try {
      const id = id0, n2 = (JSON.parse(localStorage.getItem('gc-shop-local') || '[]') as { id: string }[]);
      const sp = made.spec;
      const item = { id, code: 'SCAN-' + id.slice(-4).toUpperCase(), title: tt('Scanned piece', 'スキャンした服'), sub: tt('Smart scan · on this device', 'スマートスキャン · この端末'), price: '—', img: toPng(made.L), back: made.B ? toPng(made.B) : undefined, buy: 'local', desc: '',
        facts: [['Size', `${tt('Length', '着丈')} ${Math.round(sp.length)} / ${tt('Chest', '身幅')} ${Math.round(sp.chest * 2)} cm`], [tt('Shoulder', '肩幅'), `${Math.round(sp.shoulderX * 2)} cm`], [tt('Sleeve', '袖丈'), `${Math.round(sp.sleeve)} cm`]], zone: 'vintage', heightM: Math.round(sp.length + 3) / 100, glbKey };
      // この端末の保存容量に収まるよう、スキャンは新しい6着まで
      const old = n2.filter((x) => String(x.id).startsWith('scan-')), rest = n2.filter((x) => !String(x.id).startsWith('scan-')).concat(old.slice(0, 5));
      for (const x of old.slice(5)) delModel(x.id).catch(() => undefined); // 古いスキャンの立体も消す
      localStorage.setItem('gc-shop-local', JSON.stringify([item, ...rest]));
      setHung(id);
    } catch { setMsg(tt('Could not save on this device (storage is full).', 'この端末に保存できませんでした（保存領域がいっぱいです）。')); }
  };

  const spec = made?.spec;
  const rows = useMemo(() => spec ? [
    [tt('Body length', '着丈'), spec.length], [tt('Chest width', '身幅'), spec.chest * 2], [tt('Shoulder width', '肩幅'), spec.shoulderX * 2],
    [tt('Hem width', '裾幅'), spec.hem * 2], [tt('Sleeve length', '袖丈'), spec.sleeve], [tt('Cuff width', '袖口幅'), spec.cuff],
  ] as [string, number][] : [], [spec, lang]); // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div className="ss" translate="no">
      <section className="ss-hero">
        <p className="ss-kick">{tt('Smart scan · beta', 'スマートスキャン · 試作')}</p>
        <h2>{tt('Scan a piece. Get it in 3D and as a pattern.', '撮るだけで、立体と型紙に。')}</h2>
        <p className="ss-lead">{tt('Walk once around the hanging garment with your phone. AI picks out the garment in every shot, the phone’s motion sensor records each angle, and the 3D shape is carved from all of them — with a real-size pattern. All on this device.', 'ハンガーに吊るした服のまわりを、スマホで一周するだけ。AIが一枚ごとに服を見分け、スマホの向きのセンサーが角度を記録し、すべての向きから立体を彫り出します。実寸の型紙まで、この端末の中だけで。')}</p>
        <div className="ss-stats">
          <span><b>36</b>{tt('angles, captured automatically', '方向を自動で撮影')}</span>
          <span><b>0</b>{tt('images uploaded', '枚もどこにも送らない')}</span>
          <span><b>cm</b>{tt('real-size pattern', '実寸の型紙で書き出し')}</span>
        </div>
      </section>

      <ol className="ss-steps">
        {[[tt('Scan', 'スキャン'), tt('Camera, photos or a video', 'カメラ・写真・動画')], [tt('360° view', '360°ビュー'), tt('Set front and back', '正面と背面を決める')], [tt('3D', '立体化'), tt('Carve from every angle', '全方向から彫り出す')], [tt('Pattern', '型紙化'), tt('Draft from landmarks', '目印から型紙を起こす')]].map(([a, b], i) => (
          <li key={a} className={(i === 0 && phase !== 'start') || (i === 1 && phase === 'view') || (i >= 2 && made) ? 'on' : ''}><em>0{i + 1}</em><b>{a}</b><span>{b}</span></li>
        ))}
      </ol>

      {phase === 'start' && (
        <section className="ss-card ss-pick">
          <button className="ss-btn" onClick={startCamera}>{tt('Scan with the camera', 'カメラでスキャン')}</button>
          <label className="ss-btn ghost">{tt('Choose photos or a video', '写真・動画を選ぶ')}<input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => pickFiles(e.target.files)} /></label>
          <ul className="ss-tips">
            <li>{tt('Hang the piece on a hanger (door frame, hook, rail) or put it on a torso, so you can walk all the way round it.', '服はハンガーで（ドア枠・フック・ラックに）吊るすか、トルソーに着せて、まわりを一周できるようにします。')}</li>
            <li>{tt('Walk slowly once around it, keeping the whole piece in frame.', '服全体が画面に入る距離で、ゆっくり一周します。')}</li>
            <li>{tt('A video of one slow, even lap works too (24 frames are picked from it). Laying a piece flat gives only the outline, not 3D.', '一定の速さでゆっくり一周した動画でもOK（24コマを取り出します）。平置きの写真では輪郭だけで、立体にはなりません。')}</li>
          </ul>
        </section>
      )}

      {phase === 'camera' && <Capture onDone={onCaptured} onCancel={() => setPhase('start')} />}

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
              {!sensor && <button className="ss-chip" aria-pressed={flip} onClick={() => { setFlip((f) => !f); setMade(null); }}>{tt('I walked the other way round', '回った向きが逆')}</button>}
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
                <h3>{tt('3D capture', '3Dキャプチャ')}</h3>
                <div className="ss-3d" ref={view3d} />
                <p className="ss-fine">{made.hull ? tt(`Carved from ${made.views} shots${made.ai ? ' · AI cut-out' : ''}${sensor ? ' · angles from the motion sensor' : ' · angles assumed evenly spaced'}.`, `${made.views}枚から彫り出し${made.ai ? '・AI切り抜き' : ''}${sensor ? '・角度はセンサーから' : '・角度は等間隔とみなしています'}。`) : tt('Need at least 3 shots for 3D.', '3Dには3枚以上が必要です。')}</p>
                <div className="ss-row">
                  <button className="ss-btn" onClick={exportGLB}>{tt('Download 3D (GLB)', '3Dを保存（GLB）')}</button>
                  {hung
                    ? <><a className="ss-btn" href={`/shop/room#p=${hung}`}>{tt('See it in the showroom →', 'ショールームで見る →')}</a><a className="ss-btn ghost" href={`/shop/rail#p=${hung}`}>{tt('On the rail →', 'レールで見る →')}</a></>
                    : <button className="ss-btn ghost" onClick={hang}>{tt('Display in the showroom', 'ショールームに並べる')}</button>}
                  <button className="ss-btn ghost" onClick={toMock}>{tt('Edit as mockup →', 'モックアップで編集 →')}</button>
                </div>
                <p className="ss-fine">{tt('Built from the outline seen from every angle (a visual hull), so deep folds and the inside are smoothed over. Size comes from the real length you entered. Not a laser-measured scan.', 'すべての向きから見た輪郭で形をつくる方式（ビジュアルハル）のため、深いくぼみや内側はなめらかに埋まります。大きさは入力した着丈の実寸で合わせます。レーザー測量のスキャンではありません。')}</p>
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
