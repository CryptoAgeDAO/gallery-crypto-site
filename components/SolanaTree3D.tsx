'use client';

// Solana への刻印を 3D で：4つの記録 → 指紋 → 2つずつ合わせる → 1つのルート → Solana の台帳へ
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { canvasTex } from './nfcParts';

const PHASES = [
  { t: 0, title: '1 · Each record gets a fingerprint', body: 'Sourced, catalogued, fingerprinted, sealed — each record is turned into a 32-byte SHA-256 fingerprint.' },
  { t: 2.2, title: '2 · Pairs are combined', body: 'Two fingerprints are joined and fingerprinted again. Change any record and every fingerprint above it changes.' },
  { t: 4.2, title: '3 · One root is left', body: 'A single 32-byte root now stands for all four records — and nothing about them can be read from it.' },
  { t: 6.0, title: '4 · The root is written to Solana', body: 'Our issuer address writes the root into a Solana memo. The network stamps the time; nobody can change it afterwards.' },
  { t: 8.6, title: '5 · Anyone can check', body: 'Your browser recomputes the root from the passport and finds it on Solana. If the records changed, the roots would not match.' },
];
const END = 11.5;

function label(lines: [string, string], dark = false, w = 512, h = 200) {
  return canvasTex((c, W, H) => {
    c.fillStyle = dark ? '#111' : '#FAFAF8';
    c.fillRect(0, 0, W, H);
    c.fillStyle = dark ? '#FAFAF8' : '#111';
    c.font = '500 46px Georgia, serif';
    c.fillText(lines[0], 30, 82);
    c.fillStyle = dark ? '#D9D4CA' : '#6B6862';
    c.font = '500 30px monospace';
    c.fillText(lines[1], 30, 150);
  }, w, h);
}

export default function SolanaTree3D() {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ play: () => void; reset: () => void } | null>(null);
  const [phase, setPhase] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const ui = useRef({ setPhase, setPlaying });
  ui.current = { setPhase, setPlaying };

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * 1.25, 3));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#EFEDE8');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.8;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    const HOME_P = new THREE.Vector3(3.2, 7.0, 22), HOME_T = new THREE.Vector3(2.8, 3.0, 0);
    camera.position.copy(HOME_P);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(HOME_T);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 8;
    controls.maxDistance = 45;
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(6, 14, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -14, right: 18, top: 12, bottom: -6 });
    key.shadow.radius = 6;
    scene.add(key, new THREE.HemisphereLight(0xffffff, 0x7d776c, 0.5));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.15 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.75;
    floor.receiveShadow = true;
    scene.add(floor);

    const CU = new THREE.Color('#C47A45');
    const box = (w: number, h: number, d: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.08), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    const faceMat = (tex: THREE.Texture, base: string) => [
      new THREE.MeshStandardMaterial({ color: base, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: base, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: base, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: base, roughness: 0.6 }),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), new THREE.MeshStandardMaterial({ color: base, roughness: 0.6 }),
    ];
    const plate = (tex: THREE.Texture, w: number, h: number, base: string) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), faceMat(tex, base));
      m.castShadow = true;
      return m;
    };

    // 記録（下段）
    const names = ['Sourced', 'Catalogued', 'Fingerprinted', 'Sealed'];
    const fps = ['a1f4…09', '9c02…e1', '47de…5a', 'e8b3…c7'];
    const leaves = names.map((n, i) => {
      const m = plate(label([`Record ${i + 1}`, `${n}`]), 2.6, 1.0, '#FAFAF8');
      m.position.set(-4.5 + i * 3, 0, 0);
      scene.add(m);
      const fp = plate(label(['fingerprint', fps[i]], false, 512, 200), 2.0, 0.78, '#FAFAF8');
      fp.position.set(m.position.x, 1.35, 0);
      fp.scale.setScalar(0.001);
      scene.add(fp);
      return { m, fp };
    });
    // 合わせた指紋（中段）とルート（上段）
    const mids = [0, 1].map((i) => {
      const m = plate(label([i ? 'combine 3 + 4' : 'combine 1 + 2', i ? '71c8…2d' : '0b6e…f3']), 2.6, 0.95, '#FAFAF8');
      m.position.set(-3 + i * 6, 3.5, 0);
      m.scale.setScalar(0.001);
      scene.add(m);
      return m;
    });
    const root = plate(label(['Root', '5f2e9a…c41b'], true), 3.0, 1.05, '#111');
    root.position.set(0, 6.1, 0);
    root.scale.setScalar(0.001);
    scene.add(root);
    // 線
    const lineMat = new THREE.LineBasicMaterial({ color: '#B9B4AB' });
    const seg = (a: THREE.Vector3, b: THREE.Vector3) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMat.clone()); scene.add(l); return l; };
    const links = [
      ...leaves.map((l, i) => seg(l.fp.position.clone().add(new THREE.Vector3(0, 0.4, 0)), mids[i < 2 ? 0 : 1].position.clone().add(new THREE.Vector3(0, -0.48, 0)))),
      ...mids.map((m) => seg(m.position.clone().add(new THREE.Vector3(0, 0.48, 0)), root.position.clone().add(new THREE.Vector3(0, -0.53, 0)))),
    ];
    links.forEach((l) => { (l.material as THREE.LineBasicMaterial).transparent = true; (l.material as THREE.LineBasicMaterial).opacity = 0; });
    // Solana の台帳（右に流れていくブロックの列）
    const ledger = new THREE.Group();
    ledger.position.set(9.5, 6.1, -2);
    scene.add(ledger);
    const slotMat = new THREE.MeshStandardMaterial({ color: '#2B2A28', roughness: 0.45, metalness: 0.2 });
    const slots = Array.from({ length: 9 }, (_, i) => {
      const s = box(1.1, 1.1, 1.1, slotMat);
      s.position.set(-4 + i * 1.5, 0, 0);
      ledger.add(s);
      return s;
    });
    const memo = box(1.1, 1.1, 1.1, new THREE.MeshStandardMaterial({ color: CU, roughness: 0.35, metalness: 0.4, emissive: CU, emissiveIntensity: 0 }));
    memo.visible = false;
    ledger.add(memo);
    const ledgerLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: label(['Solana', 'public ledger · slots →']), transparent: true, toneMapped: false }));
    ledgerLabel.scale.set(3.2, 1.25, 1);
    ledgerLabel.position.set(0, 1.6, 0);
    ledger.add(ledgerLabel);
    const stamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: label(['Written · 03:00 JST', 'memo GCPP/2 root:5f2e…'], true, 640, 200), transparent: true, opacity: 0, toneMapped: false }));
    stamp.scale.set(3.6, 1.12, 1);
    ledger.add(stamp);
    const flyer = root.clone();
    flyer.visible = false;
    scene.add(flyer);
    // 検証のスマホ
    const phone = box(1.3, 2.5, 0.16, new THREE.MeshStandardMaterial({ color: '#1C1C1C', roughness: 0.35 }));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.3), new THREE.MeshBasicMaterial({ map: canvasTex((c, w, h) => {
      c.fillStyle = '#FAFAF8'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#111'; c.fillRect(30, 120, w - 60, 90);
      c.fillStyle = '#FAFAF8'; c.font = '700 34px sans-serif'; c.textAlign = 'center'; c.fillText('ROOT MATCHES', w / 2, 178);
      c.fillStyle = '#2E7D3A'; c.font = '700 120px sans-serif'; c.fillText('✓', w / 2, 400);
      c.fillStyle = '#6B6862'; c.font = '500 26px monospace'; c.fillText('5f2e9a…c41b', w / 2, 480); c.fillText('found on Solana', w / 2, 520);
    }, 360, 720), toneMapped: false }));
    scr.position.z = 0.085;
    phone.add(scr);
    phone.position.set(8.8, 2.4, 2.5);
    phone.rotation.y = -0.35;
    phone.scale.setScalar(0.001);
    scene.add(phone);
    // 流れる光の粒
    const dotMat = new THREE.MeshBasicMaterial({ color: CU });
    const dots = Array.from({ length: 6 }, () => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), dotMat); d.visible = false; scene.add(d); return d; });

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let t0 = -1, shown = -1;
    const clock = new THREE.Clock();
    const ease = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
    const grow = (o: THREE.Object3D, x: number) => o.scale.setScalar(Math.max(0.001, ease(x)));
    let raf = 0;
    // 時刻 tt の場面を描く（tt < 0 は最初の状態）
    const pose = (tt: number) => {
      leaves.forEach((l, i) => grow(l.fp, (tt - 0.4 - i * 0.35) / 0.6));
      links.slice(0, 4).forEach((l) => { (l.material as THREE.LineBasicMaterial).opacity = ease((tt - 2.0) / 0.5); });
      mids.forEach((m, i) => grow(m, (tt - 2.9 - i * 0.3) / 0.6));
      links.slice(4).forEach((l) => { (l.material as THREE.LineBasicMaterial).opacity = ease((tt - 4.0) / 0.5); });
      grow(root, (tt - 4.6) / 0.7);
      // 粒：指紋 → 中段、中段 → ルート
      dots.forEach((d, i) => {
        const a = i < 4 ? leaves[i].fp.position : mids[i - 4].position;
        const b = i < 4 ? mids[i < 2 ? 0 : 1].position : root.position;
        const k = i < 4 ? (tt - 2.2) / 0.8 : (tt - 4.1) / 0.7;
        d.visible = k > 0 && k < 1;
        d.position.copy(a).lerp(b, ease(k));
      });
      // ルートの写しが台帳へ飛ぶ
      const fk = (tt - 6.2) / 1.3;
      flyer.visible = fk > 0 && fk < 1;
      if (flyer.visible) {
        const dest = ledger.position.clone().add(new THREE.Vector3(0, 0, 0));
        flyer.position.copy(root.position).lerp(dest, ease(fk)).add(new THREE.Vector3(0, Math.sin(ease(fk) * Math.PI) * 1.4, 0));
        flyer.scale.setScalar(1 - 0.55 * ease(fk));
      }
      memo.visible = tt > 7.45;
      (memo.material as THREE.MeshStandardMaterial).emissiveIntensity = memo.visible ? 0.25 + 0.25 * Math.sin(tt * 4) : 0;
      (stamp.material as THREE.SpriteMaterial).opacity = ease((tt - 7.6) / 0.5);
      stamp.position.set(0, -1.6, 0.8);
      grow(phone, (tt - 8.8) / 0.7);
    };
    const tick = () => {
      const dt = Math.min(0.1, clock.getDelta());
      const now = clock.elapsedTime;
      // 台帳はいつも少しずつ流れている
      slots.forEach((s) => { s.position.x -= dt * 0.45; if (s.position.x < -4.6) s.position.x += 13.5; });
      if (t0 >= 0) {
        const tt = now - t0;
        pose(tt);
        let ph = 0;
        PHASES.forEach((p, i) => { if (tt >= p.t) ph = i; });
        if (ph !== shown) { shown = ph; ui.current.setPhase(ph); }
        if (tt > END) { t0 = -1; ui.current.setPlaying(false); }
      }
      memo.position.set(0, 0, 0);
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    pose(-1);
    tick();

    api.current = {
      play() { pose(-1); t0 = clock.elapsedTime; shown = -1; ui.current.setPlaying(true); },
      reset() { t0 = -1; shown = -1; pose(-1); ui.current.setPhase(-1); ui.current.setPlaying(false); camera.position.copy(HOME_P); controls.target.copy(HOME_T); },
    };
    // 画面に入ったら一度だけ自動で再生
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { api.current?.play(); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
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
  }, []);

  const p = PHASES[Math.max(0, phase)];
  return (
    <div className="st3">
      <div className="st3-stage">
        <div ref={host} className="tv-canvas" role="img" aria-label="3D animation: four records become fingerprints, are combined into one root, and the root is written to the Solana ledger, where anyone can check it." />
        <button className="tv-reset" onClick={() => api.current?.reset()}>Reset</button>
      </div>
      <div className="st3-side">
        <ol className="st3-steps">
          {PHASES.map((x, i) => (
            <li key={x.title} className={i === phase ? 'on' : i < phase ? 'done' : ''}>{x.title}</li>
          ))}
        </ol>
        <p className="st3-body">{phase < 0 ? 'Press play to watch four records become one entry on Solana.' : p.body}</p>
        <div className="pp-row">
          <button className="mo-btn small" onClick={() => api.current?.play()} disabled={playing}>{playing ? 'Playing…' : phase >= 0 ? 'Play again' : 'Play'}</button>
        </div>
      </div>
    </div>
  );
}
