'use client';
// 3D 縫製ビュー：型紙をアバターのまわりに置き、縫い目を引き寄せて着せる様子をそのまま見せる。
// 生地の物性（伸び・曲げ・重さ・厚み）で落ち方が変わり、縫い上がったら「ひずみ」「当たり」を色で見られる。
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildSim, stepSim, seamGap, torso, TOTAL, strainMap, strainColor, fitColor, measureFit, FABRIC_PHYS, type Body, type Sim, type FabricPhys, type Fit } from './sew';
import type { PatternDoc } from './draft';
import { tt } from '../Lang';

export type UVMap = (pieceId: string, role: string, x: number, y: number) => [number, number] | null;
export type Skin = { tex: HTMLCanvasElement | null; back: HTMLCanvasElement | null; uv: UVMap | null; color: string };
export type MapMode = 'look' | 'strain' | 'fit';
export type SewStats = { gap: number; fit: Fit; lengthCm: number; heightM: number; strainMax: number };
export type SewApi = { shots: () => { front: string; back: string; heightM: number } | null; glb: () => void; restart: () => void };

function mannequin(B: Body) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc9c3b8, roughness: 0.8 });
  const tmax = B.tmax ?? 86;
  // 胴：楕円の輪を積む
  const rows: [number, number, number][] = [];
  for (let y = B.Y0 - tmax; y <= B.Y0 - 7; y += 1.5) { const e = torso(B, y); if (e) rows.push([y, e[0], e[1]]); }
  const seg = 48, pos: number[] = [], idx: number[] = [];
  rows.forEach(([y, a, b]) => { for (let i = 0; i < seg; i++) { const t = (i / seg) * Math.PI * 2; pos.push(a * Math.sin(t), y, b * Math.cos(t)); } });
  for (let r = 0; r < rows.length - 1; r++) for (let i = 0; i < seg; i++) { const a = r * seg + i, b = r * seg + ((i + 1) % seg), c = a + seg, d = b + seg; idx.push(a, c, b, b, c, d); }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setIndex(idx); tg.computeVertexNormals();
  g.add(new THREE.Mesh(tg, mat));
  const sh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), mat);
  sh.scale.set((B.sx ?? B.a * 1.16) - 0.6, 8, B.b * 0.98 - 0.6); sh.position.set(0, B.Y0 - 7, 0); g.add(sh);
  const nk = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.8, 18, 24), mat); nk.position.set(0, B.Y0 + 4, 0); g.add(nk);
  for (const a of B.arms) {
    const p0 = new THREE.Vector3(...a.p0), p1 = new THREE.Vector3(...a.p1);
    const L = p0.distanceTo(p1);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(a.r - 0.5, L, 6, 16), mat);
    m.position.copy(p0.clone().add(p1).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
    g.add(m);
  }
  // 頭と脚（形のめやす。服とはぶつからない）
  if (B.H) {
    const sc = B.H / 172;
    const hd = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat); hd.scale.set(8.2 * sc, 11 * sc, 9.4 * sc); hd.position.set(0, B.H - 11.5 * sc, 0); g.add(hd);
    const hipY = B.Y0 - tmax, e = torso(B, hipY + 0.5) || [B.a, B.b];
    for (const s of [1, -1]) {
      const r = e[0] * 0.48, L = hipY - r * 0.6;
      const lg = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.78, L - r, 6, 16), mat);
      lg.position.set(s * e[0] * 0.48, L / 2 + r * 0.3, 0); g.add(lg);
    }
  }
  return g;
}

type Props = { doc: PatternDoc; body: Body; skin: Skin; density?: number; fabric?: FabricPhys; map?: MapMode; showBody?: boolean; onStats?: (s: SewStats | null) => void; onProgress?: (p: number) => void; apiRef?: React.MutableRefObject<SewApi | null> };

export default function SewView({ doc, body, skin, density = 2.5, fabric = FABRIC_PHYS[0], map = 'look', showBody = true, onStats, onProgress, apiRef }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ restart: () => void; garment: THREE.Group; man: THREE.Group; floor: THREE.Object3D; renderer: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; sim: () => Sim | null; paint: () => void } | null>(null);
  const skinR = useRef(skin); skinR.current = skin;
  const mapR = useRef(map); mapR.current = map;
  const statsR = useRef(onStats); statsR.current = onStats;
  const progR = useRef(onProgress); progR.current = onProgress;
  const [prog, setProg] = useState(0);
  const [gap, setGap] = useState<number | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true }); } catch { setErr(tt('3D is not available in this browser.', 'このブラウザでは3Dを表示できません。')); return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const bg = new THREE.Color(0xeeece7); scene.background = bg;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.7;
    const cam = new THREE.PerspectiveCamera(30, 1, 1, 3000);
    const midY = body.Y0 - 30;
    cam.position.set(70, midY + 20, 230);
    const ctl = new OrbitControls(cam, renderer.domElement);
    ctl.target.set(0, midY, 0); ctl.enableDamping = true; ctl.minDistance = 40; ctl.maxDistance = 600;
    const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(80, 260, 180); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xfff4e6, 0.45); fill.position.set(-160, 120, -80); scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 0.55));
    const floorY = body.H ? 0 : body.Y0 - 100;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(110, 64), new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; scene.add(floor);
    const grid = new THREE.PolarGridHelper(100, 8, 10, 64, 0xc9c3b8, 0xd3cec5); grid.position.y = floorY + 0.05; floor.add(grid); grid.rotation.x = Math.PI / 2;
    const man = mannequin(body); scene.add(man);
    const garment = new THREE.Group(); scene.add(garment);

    let S: Sim | null = null;
    let meshes: { g: THREE.BufferGeometry; off: number; n: number; m: THREE.MeshStandardMaterial; id: string; role: string; uv2d: Float32Array }[] = [];
    let tex: THREE.CanvasTexture | null = null, texB: THREE.CanvasTexture | null = null;
    // 見た目：生地の絵を貼る／ひずみ・当たりの色
    const paint = () => {
      const sk = skinR.current, mode = mapR.current;
      tex?.dispose(); if (texB && texB !== tex) texB.dispose(); tex = texB = null;
      if (sk.tex) { tex = new THREE.CanvasTexture(sk.tex); texB = sk.back && sk.back !== sk.tex ? new THREE.CanvasTexture(sk.back) : tex; for (const t of [tex, texB]) { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; } }
      const strain = S && mode === 'strain' ? strainMap(S) : null;
      for (const M of meshes) {
        const uv = M.g.attributes.uv as THREE.BufferAttribute, U = uv.array as Float32Array;
        if (sk.uv && tex) for (let i = 0; i < M.n; i++) { const q = sk.uv(M.id, M.role, M.uv2d[i * 2], M.uv2d[i * 2 + 1]); U[i * 2] = q ? q[0] : 0; U[i * 2 + 1] = q ? q[1] : 0; }
        else for (let i = 0; i < M.n; i++) { U[i * 2] = M.uv2d[i * 2] / 20; U[i * 2 + 1] = M.uv2d[i * 2 + 1] / 20; }
        uv.needsUpdate = true;
        if (mode !== 'look' && S) {
          const col = new Float32Array(M.n * 3);
          for (let i = 0; i < M.n; i++) { const c = mode === 'strain' ? strainColor(strain![M.off + i]) : fitColor(S.contact[M.off + i] * 2.2); col.set(c, i * 3); }
          M.g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          M.m.map = null; M.m.vertexColors = true; M.m.color.set(0xffffff);
        } else {
          M.m.vertexColors = false; M.m.map = sk.uv && tex ? (M.role === 'back' ? texB : tex) : null; M.m.color.set(M.m.map ? 0xffffff : new THREE.Color(sk.color));
        }
        M.m.needsUpdate = true;
      }
    };
    const restart = () => {
      garment.clear(); meshes.forEach((M) => { M.g.dispose(); M.m.dispose(); });
      try { S = buildSim(doc, body, density, fabric); } catch (e) { setErr(String((e as Error).message || e)); return; }
      const rough = fabric.key === 'nylon' || fabric.key === 'silk' ? 0.5 : fabric.key === 'denim' ? 0.95 : 0.9;
      meshes = S.pieces.map((p) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(S!.pos.slice(p.off * 3, (p.off + p.n) * 3), 3));
        g.setIndex(new THREE.BufferAttribute(p.tris, 1));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.n * 2), 2));
        g.computeVertexNormals();
        const m = new THREE.MeshStandardMaterial({ roughness: rough, metalness: 0, side: THREE.DoubleSide, sheen: 0 } as THREE.MeshStandardMaterialParameters);
        const mesh = new THREE.Mesh(g, m); mesh.name = p.id; garment.add(mesh);
        return { g, off: p.off, n: p.n, m, id: p.id, role: p.role, uv2d: p.uv2d };
      });
      paint();
      setProg(0); setGap(null); statsR.current?.(null); progR.current?.(0);
    };
    restart();
    api.current = { restart, garment, man, floor, renderer, scene, cam, sim: () => S, paint };

    let raf = 0, alive = true;
    const resize = () => { const w = el.clientWidth, h = Math.max(360, Math.min(720, w * 1.1)); renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);
    const fine = density < 2.2;
    const loop = () => {
      if (!alive) return;
      if (S && S.step < TOTAL) {
        stepSim(S, fine ? 4 : 6, fine ? 22 : 18);
        for (const m of meshes) { (m.g.attributes.position.array as Float32Array).set(S.pos.subarray(m.off * 3, (m.off + m.n) * 3)); m.g.attributes.position.needsUpdate = true; m.g.computeVertexNormals(); }
        const p = Math.min(1, S.step / TOTAL); setProg(p); progR.current?.(p);
        if (S.step >= TOTAL) {
          const gp = seamGap(S); setGap(gp);
          const st = Array.from(strainMap(S)).sort((x, y) => x - y), mx = st[Math.floor(st.length * 0.98)] || 0; // 縁の数点に引っぱられないよう、上位2%を除いた最大
          statsR.current?.({ gap: gp, strainMax: mx, ...measureFit(S) });
          if (mapR.current !== 'look') paint();
        }
      }
      ctl.update();
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); ctl.dispose(); tex?.dispose(); renderer.dispose(); pm.dispose(); el.innerHTML = ''; api.current = null; };
  }, [doc, body, density, fabric]);

  useEffect(() => { api.current?.paint(); }, [skin, map]);
  useEffect(() => { if (api.current) api.current.man.visible = showBody; }, [showBody]);

  // 外から使う操作（保存・書き出し）
  if (apiRef) apiRef.current = {
    restart: () => api.current?.restart(),
    glb: () => {
      const a = api.current; if (!a) return;
      new GLTFExporter().parse(a.garment, (r) => {
        const blob = new Blob([r as ArrayBuffer], { type: 'model/gltf-binary' });
        const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'gallery-crypto-garment.glb'; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 1500);
      }, () => setErr(tt('Export failed.', '書き出しに失敗しました。')), { binary: true });
    },
    // 正面・背中の写真（背景は透明）：店・レール・ショールームに並べる絵
    shots: () => {
      const a = api.current; if (!a) return null;
      const { renderer, scene, garment, man, floor } = a;
      const box = new THREE.Box3().setFromObject(garment); if (box.isEmpty()) return null;
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const H = 900, W = Math.round(H * Math.min(1.6, Math.max(0.6, size.x / size.y)));
      const oc = new THREE.OrthographicCamera(-size.x / 2 * 1.04, size.x / 2 * 1.04, size.y / 2 * 1.04, -size.y / 2 * 1.04, 1, 2000);
      const prevBg = scene.background, prevMan = man.visible, prevSize = renderer.getSize(new THREE.Vector2()), prevPR = renderer.getPixelRatio();
      scene.background = null; man.visible = false; floor.visible = false; renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0x000000, 0);
      const shot = (z: number) => { oc.position.set(c.x, c.y, c.z + z); oc.lookAt(c); oc.updateProjectionMatrix(); renderer.render(scene, oc); return renderer.domElement.toDataURL('image/png'); };
      const prevMap = mapR.current; if (prevMap !== 'look') { mapR.current = 'look'; a.paint(); } // 保存する絵は、色のマップではなく服の見た目で
      const front = shot(500), back = shot(-500);
      if (prevMap !== 'look') { mapR.current = prevMap; a.paint(); }
      scene.background = prevBg; man.visible = prevMan; floor.visible = true; renderer.setPixelRatio(prevPR); renderer.setSize(prevSize.x, prevSize.y);
      return { front, back, heightM: Math.round(size.y) / 100 };
    },
  };

  return (
    <div className="lab-sew">
      <div className="lab-3d" ref={host} />
      <div className="lab-bar">
        <div className="lab-prog"><i style={{ width: `${Math.round(prog * 100)}%` }} /></div>
        <span className="lab-note">{prog < 1 ? tt('Sewing…', '縫製中…') + ` ${Math.round(prog * 100)}%` : gap !== null ? tt(`Sewn. Largest seam gap ${gap.toFixed(1)} cm`, `縫製完了。縫い目の最大のずれ ${gap.toFixed(1)}cm`) : ''}</span>
      </div>
      {map === 'strain' && <div className="lab-legend"><span>{tt('Loose', 'ゆるい')}</span><i className="st" /><span>{tt('+10% stretched', '+10% 伸び')}</span></div>}
      {map === 'fit' && <div className="lab-legend"><span>{tt('Free', '当たらない')}</span><i className="ft" /><span>{tt('Tight on the body', '体に強く当たる')}</span></div>}
      <p className="lab-note">{tt('Drag to turn, pinch or scroll to zoom.', 'ドラッグで回転、ピンチ／スクロールで拡大。')}</p>
      {err && <p className="err">{err}</p>}
    </div>
  );
}
