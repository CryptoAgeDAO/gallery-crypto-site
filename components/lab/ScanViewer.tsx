'use client';
// 3Dスキャン（GLB / OBJ）を開いて、2点をタップして実寸を測る。スキャンアプリの書き出しは実寸（メートル）なので、そのまま採寸に使える。
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MEASURES, type MeasureKey } from './draft';
import { tt, useLang } from '../Lang';

type Unit = 'm' | 'cm' | 'mm';
const PER: Record<Unit, number> = { m: 100, cm: 1, mm: 0.1 };

export default function ScanViewer({ onUse }: { onUse: (k: MeasureKey, cm: number) => void }) {
  const { lang } = useLang();
  const host = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [unit, setUnit] = useState<Unit>('m');
  const [size, setSize] = useState<number[] | null>(null);
  const [pts, setPts] = useState<THREE.Vector3[]>([]);
  const [err, setErr] = useState('');
  const sceneRef = useRef<{ marks: THREE.Group } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || !file) return;
    let alive = true;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeeece7);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const cam = new THREE.PerspectiveCamera(35, 1, 0.001, 1000);
    const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true;
    const marks = new THREE.Group(); scene.add(marks);
    sceneRef.current = { marks };
    const model = new THREE.Group(); scene.add(model);
    const resize = () => { const w = el.clientWidth, h = Math.max(300, Math.min(560, w * 0.9)); renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);
    const url = URL.createObjectURL(file);
    const done = (obj: THREE.Object3D) => {
      if (!alive) return;
      model.add(obj);
      const box = new THREE.Box3().setFromObject(obj), s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const mx = Math.max(s.x, s.y, s.z);
      setSize([s.x, s.y, s.z]);
      setUnit(mx < 5 ? 'm' : mx < 500 ? 'cm' : 'mm');
      ctl.target.copy(c); cam.near = mx / 500; cam.far = mx * 50; cam.position.copy(c).add(new THREE.Vector3(0, mx * 0.3, mx * 1.6)); cam.updateProjectionMatrix();
      marks.userData.r = mx / 120;
      obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m.material as THREE.MeshStandardMaterial)?.map && file.name.toLowerCase().endsWith('.obj')) m.material = new THREE.MeshStandardMaterial({ color: 0xcfc8bb, roughness: 0.9, side: THREE.DoubleSide }); });
    };
    const fail = () => setErr(tt('Could not open this file. Use .glb / .gltf / .obj.', 'このファイルは開けませんでした。.glb / .gltf / .obj を使ってください。'));
    if (/\.obj$/i.test(file.name)) new OBJLoader().load(url, done, undefined, fail);
    else new GLTFLoader().load(url, (g) => done(g.scene), undefined, fail);
    // タップで点を置く（ドラッグで回したときは置かない）
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const r = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
      const hit = ray.intersectObject(model, true)[0];
      if (hit) setPts((p) => (p.length >= 2 ? [hit.point.clone()] : [...p, hit.point.clone()]));
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    let raf = 0;
    const loop = () => { if (!alive) return; ctl.update(); renderer.render(scene, cam); raf = requestAnimationFrame(loop); };
    loop();
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); URL.revokeObjectURL(url); renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp); ctl.dispose(); renderer.dispose(); pm.dispose(); el.innerHTML = ''; sceneRef.current = null; };
  }, [file]);

  // 置いた点と線を描く
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.marks.clear();
    const r = (s.marks.userData.r as number) || 0.005;
    for (const p of pts) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8), new THREE.MeshBasicMaterial({ color: 0xd2452f, depthTest: false })); m.position.copy(p); m.renderOrder = 9; s.marks.add(m); }
    if (pts.length === 2) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xd2452f, depthTest: false })); l.renderOrder = 9; s.marks.add(l); }
  }, [pts]);

  const cm = pts.length === 2 ? Math.round(pts[0].distanceTo(pts[1]) * PER[unit] * 10) / 10 : null;
  return (
    <div className="lab-scan">
      <label className="lab-drop">
        <input type="file" accept=".glb,.gltf,.obj,model/gltf-binary" onChange={(e) => { setPts([]); setErr(''); setFile(e.target.files?.[0] || null); }} />
        <b>{file ? file.name : tt('Open a 3D scan (.glb / .obj)', '3Dスキャンを開く（.glb / .obj）')}</b>
        <span>{tt('Lay the garment flat and scan it with a phone scanning app (e.g. Scaniverse, Polycam, RealityScan), then export GLB or OBJ.', '服を平置きにして、スマホのスキャンアプリ（Scaniverse・Polycam・RealityScan など）でスキャンし、GLB か OBJ で書き出したファイルを開きます。')}</span>
      </label>
      {file && <div className="lab-3d" ref={host} />}
      {size && (
        <div className="lab-row">
          <span className="lab-note">{tt('Units in the file', 'ファイルの単位')}</span>
          {(['m', 'cm', 'mm'] as Unit[]).map((u) => <button key={u} type="button" className="chip" aria-pressed={unit === u} onClick={() => setUnit(u)}>{u}</button>)}
          <span className="lab-note">{tt('Size', '大きさ')} {size.map((v) => (v * PER[unit]).toFixed(0)).join(' × ')} cm</span>
        </div>
      )}
      {file && <p className="lab-note">{pts.length === 0 ? tt('Tap two points on the scan to measure.', 'スキャンの上で2点をタップすると、その間の長さを測ります。') : pts.length === 1 ? tt('Now tap the second point.', 'もう1点をタップ。') : ''}</p>}
      {cm !== null && (
        <div className="lab-measure">
          <b>{cm} cm</b>
          <span className="lab-note">{tt('Use this as:', 'この長さを使う：')}</span>
          <div className="lab-row">{MEASURES.map((m) => <button key={m.k} type="button" className="chip" onClick={() => { onUse(m.k, cm); setPts([]); }}>{lang === 'ja' ? m.ja : m.en}</button>)}</div>
        </div>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
