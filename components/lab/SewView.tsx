'use client';
// 3D 縫製ビュー：型紙をボディのまわりに置き、縫い目を引き寄せて着せる様子をそのまま見せる。
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildSim, stepSim, seamGap, torso, TOTAL, type Body, type Sim } from './sew';
import type { PatternDoc } from './draft';
import { tt } from '../Lang';

export type UVMap = (pieceId: string, role: string, x: number, y: number) => [number, number] | null;
export type Skin = { tex: HTMLCanvasElement | null; back: HTMLCanvasElement | null; uv: UVMap | null; color: string };

function mannequin(B: Body) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xb9b3a8, roughness: 0.85 });
  // 胴：楕円の輪を積む
  const rows: [number, number, number][] = [];
  for (let y = B.Y0 - 86; y <= B.Y0 - 7; y += 2) { const e = torso(B, y); if (e) rows.push([y, e[0], e[1]]); }
  const seg = 40, pos: number[] = [], idx: number[] = [];
  rows.forEach(([y, a, b]) => { for (let i = 0; i < seg; i++) { const t = (i / seg) * Math.PI * 2; pos.push(a * Math.sin(t), y, b * Math.cos(t)); } });
  for (let r = 0; r < rows.length - 1; r++) for (let i = 0; i < seg; i++) { const a = r * seg + i, b = r * seg + ((i + 1) % seg), c = a + seg, d = b + seg; idx.push(a, c, b, b, c, d); }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setIndex(idx); tg.computeVertexNormals();
  g.add(new THREE.Mesh(tg, mat));
  const sh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), mat);
  sh.scale.set(B.a * 1.16 - 0.6, 8, B.b * 0.98 - 0.6); sh.position.set(0, B.Y0 - 7, 0); g.add(sh);
  const nk = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.8, 20, 24), mat); nk.position.set(0, B.Y0 + 5, 0); g.add(nk);
  for (const a of B.arms) {
    const p0 = new THREE.Vector3(...a.p0), p1 = new THREE.Vector3(...a.p1);
    const L = p0.distanceTo(p1);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(a.r - 0.5, L, 6, 16), mat);
    m.position.copy(p0.clone().add(p1).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
    g.add(m);
  }
  return g;
}

export default function SewView({ doc, body, skin, density = 2.5 }: { doc: PatternDoc; body: Body; skin: Skin; density?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ restart: () => void; garment: THREE.Group; man: THREE.Group } | null>(null);
  const [prog, setProg] = useState(0);
  const [gap, setGap] = useState<number | null>(null);
  const [showBody, setShowBody] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); } catch { setErr(tt('3D is not available in this browser.', 'このブラウザでは3Dを表示できません。')); return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeece7);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const cam = new THREE.PerspectiveCamera(32, 1, 1, 2000);
    cam.position.set(60, 125, 190);
    const ctl = new OrbitControls(cam, renderer.domElement);
    ctl.target.set(0, 112, 0); ctl.enableDamping = true; ctl.minDistance = 40; ctl.maxDistance = 500;
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(80, 220, 160); scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 0.6));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(90, 48), new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = body.Y0 - 100; scene.add(floor);
    const man = mannequin(body); scene.add(man);
    const garment = new THREE.Group(); scene.add(garment);

    const texF = skin.tex ? new THREE.CanvasTexture(skin.tex) : null;
    const texB = skin.back ? new THREE.CanvasTexture(skin.back) : texF;
    for (const t of [texF, texB]) if (t) { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }

    let S: Sim | null = null;
    let meshes: { g: THREE.BufferGeometry; off: number; n: number }[] = [];
    const restart = () => {
      garment.clear();
      try { S = buildSim(doc, body, density); } catch (e) { setErr(String((e as Error).message || e)); return; }
      meshes = S.pieces.map((p) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(S!.pos.slice(p.off * 3, (p.off + p.n) * 3), 3));
        g.setIndex(new THREE.BufferAttribute(p.tris, 1));
        const uv = new Float32Array(p.n * 2);
        let tex: THREE.Texture | null = null;
        if (skin.uv && texF) {
          tex = p.role === 'back' ? texB : texF;
          for (let i = 0; i < p.n; i++) { const q = skin.uv(p.id, p.role, p.uv2d[i * 2], p.uv2d[i * 2 + 1]); uv[i * 2] = q ? q[0] : 0; uv[i * 2 + 1] = q ? q[1] : 0; }
        } else for (let i = 0; i < p.n; i++) { uv[i * 2] = p.uv2d[i * 2] / 20; uv[i * 2 + 1] = p.uv2d[i * 2 + 1] / 20; }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, color: tex ? 0xffffff : new THREE.Color(skin.color), roughness: 0.92, side: THREE.DoubleSide }));
        m.name = p.id;
        garment.add(m);
        return { g, off: p.off, n: p.n };
      });
      setProg(0); setGap(null);
    };
    restart();
    api.current = { restart, garment, man };

    let raf = 0, alive = true;
    const resize = () => { const w = el.clientWidth, h = Math.max(320, Math.min(640, w * 1.05)); renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);
    const loop = () => {
      if (!alive) return;
      if (S && S.step < TOTAL) {
        stepSim(S, 6);
        for (const m of meshes) { (m.g.attributes.position.array as Float32Array).set(S.pos.subarray(m.off * 3, (m.off + m.n) * 3)); m.g.attributes.position.needsUpdate = true; m.g.computeVertexNormals(); }
        setProg(Math.min(1, S.step / TOTAL));
        if (S.step >= TOTAL) setGap(seamGap(S));
      }
      ctl.update();
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); ctl.dispose(); renderer.dispose(); pm.dispose(); el.innerHTML = ''; api.current = null; };
  }, [doc, body, skin, density]);

  useEffect(() => { if (api.current) api.current.man.visible = showBody; }, [showBody]);

  const glb = () => {
    const a = api.current;
    if (!a) return;
    new GLTFExporter().parse(a.garment, (r) => {
      const blob = new Blob([r as ArrayBuffer], { type: 'model/gltf-binary' });
      const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'gallery-crypto-garment.glb'; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 1500);
    }, () => setErr(tt('Export failed.', '書き出しに失敗しました。')), { binary: true });
  };

  return (
    <div className="lab-sew">
      <div className="lab-3d" ref={host} />
      <div className="lab-bar">
        <div className="lab-prog"><i style={{ width: `${Math.round(prog * 100)}%` }} /></div>
        <span className="lab-note">{prog < 1 ? tt('Sewing…', '縫製中…') + ` ${Math.round(prog * 100)}%` : gap !== null ? tt(`Sewn. Largest seam gap ${gap.toFixed(1)} cm`, `縫製完了。縫い目の最大のずれ ${gap.toFixed(1)}cm`) : ''}</span>
      </div>
      <div className="lab-row">
        <button type="button" className="btn" onClick={() => api.current?.restart()}>{tt('Sew again', 'もう一度縫う')}</button>
        <button type="button" className="btn" aria-pressed={showBody} onClick={() => setShowBody((v) => !v)}>{showBody ? tt('Hide body', 'ボディを隠す') : tt('Show body', 'ボディを表示')}</button>
        <button type="button" className="btn primary" onClick={glb}>{tt('Download .glb', '.glb を保存')}</button>
      </div>
      <p className="lab-note">{tt('Drag to turn, pinch or scroll to zoom.', 'ドラッグで回転、ピンチ／スクロールで拡大。')}</p>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
