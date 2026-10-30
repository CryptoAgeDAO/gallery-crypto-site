'use client';

// NFC タグの中身（分解図）と、タップから証明・刻印・オフライン確認までの流れを 3D で見せる
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { canvasTex, makeInlay, makePhone, makeRings, COPPER } from './nfcParts';
import { NFC_STEPS, TAG_LAYERS } from '@/lib/nfcSteps';

type Mode = 'tag' | 'system';
type Api = { mode: (m: Mode) => void; explode: (v: boolean) => void; step: (k: string | null) => void; reset: () => void };

const POS: Record<string, [number, number, number]> = {
  piece: [-8.6, 0, 0], tap: [-4.3, 0, 0], chip: [0, 0, 0], record: [4.3, 0, 0], anchor: [8.6, 0, 0], offline: [-1.4, -5.2, 1.2],
};
const EDGES: [string, string, boolean][] = [
  ['piece', 'tap', false], ['tap', 'chip', false], ['chip', 'record', false], ['record', 'anchor', false], ['piece', 'offline', true], ['offline', 'record', true],
];

function labelSprite(n: string, title: string, sub: string) {
  const tex = canvasTex((c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(250,250,248,.92)';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#111'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, w - 3, h - 3);
    c.fillStyle = '#6B6862'; c.font = '500 30px monospace'; c.fillText(n, 30, 56);
    c.fillStyle = '#111'; c.font = '500 62px Georgia, serif'; c.fillText(title, 30, 132);
    c.fillStyle = '#6B6862'; c.font = '500 28px sans-serif'; c.fillText(sub, 30, 190);
  }, 720, 230);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(3.6, 1.15, 1);
  sp.renderOrder = 10;
  return sp;
}

export default function NfcSystem3D() {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const [mode, setMode] = useState<Mode>('tag');
  const [exploded, setExploded] = useState(true);
  const [step, setStep] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const ui = useRef({ setStep });
  ui.current = { setStep };

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * 1.25, 3));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#F1EFEA');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 60;
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(6, 10, 12);
    const rim = new THREE.DirectionalLight(0xfff4e6, 0.9);
    rim.position.set(-8, 6, -10);
    scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.5));

    // ── 1. タグの分解図
    const tagG = new THREE.Group();
    scene.add(tagG);
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 3.2, 0.06),
      new THREE.MeshStandardMaterial({
        roughness: 0.85,
        map: canvasTex((c, w, h) => {
          c.fillStyle = '#F4F1EA'; c.fillRect(0, 0, w, h);
          c.strokeStyle = 'rgba(0,0,0,.05)';
          for (let y = 0; y < h; y += 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
          c.fillStyle = '#2B2A28'; c.font = '600 54px monospace';
          c.fillText('GC', 52, 110); c.fillText('0007', 52, 180);
          c.font = '500 32px monospace';
          ['COTTON 100%', 'BODY USA', '1991', '', 'NFC ◉'].forEach((t, i) => c.fillText(t, 52, 290 + i * 54));
          c.setLineDash([14, 10]); c.strokeStyle = '#8F887C'; c.lineWidth = 3;
          c.beginPath(); c.moveTo(20, 30); c.lineTo(w - 20, 30); c.stroke();
        }, 440, 640),
      }),
    );
    const inlay = makeInlay(1.8, 2.2, 5);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 0.05), new THREE.MeshStandardMaterial({ color: '#E6E1D6', roughness: 0.95 }));
    tagG.add(face, inlay, back);
    const tagRings = makeRings(3, '#C47A45');
    tagRings.group.scale.setScalar(2.2);
    tagG.add(tagRings.group);
    const layerObjs = [face, inlay, back];
    const callouts = TAG_LAYERS.map((l, i) => {
      const sp = labelSprite(`0${i + 1}`, l.title, l.body.length > 44 ? l.body.slice(0, l.body.lastIndexOf(' ', 44)) + '…' : l.body);
      sp.scale.set(2.9, 0.93, 1);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#9A958C' }));
      tagG.add(sp, line);
      return { sp, line };
    });
    tagG.rotation.set(0.12, -0.85, 0);
    let explodeT = 1, explodeGoal = 1;

    // ── 2. 仕組み全体
    const sysG = new THREE.Group();
    scene.add(sysG);
    const nodes: Record<string, THREE.Group> = {};
    const sprites: Record<string, THREE.Sprite> = {};
    const v = (k: string) => new THREE.Vector3(...POS[k]);
    NFC_STEPS.forEach((s) => {
      const g = new THREE.Group();
      g.position.copy(v(s.k));
      g.userData.key = s.k;
      sysG.add(g);
      nodes[s.k] = g;
      const sp = labelSprite(String(s.n).padStart(2, '0') + (s.next ? '   NEXT · GCPP/3' : ''), s.title, s.short);
      sp.position.set(0, 2.75, 0);
      g.add(sp);
      sprites[s.k] = sp;
    });
    // 作品：生地＋NFC ラベル（中が透けて見える）
    {
      const g = nodes.piece;
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 0.12), new THREE.MeshStandardMaterial({ color: '#2B2A29', roughness: 0.95 }));
      const lab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.03), new THREE.MeshStandardMaterial({ color: '#F4F1EA', roughness: 0.8, transparent: true, opacity: 0.45 }));
      lab.position.set(0.55, -0.55, 0.08);
      const inl = makeInlay(0.7, 0.8, 2.5);
      inl.position.set(0.55, -0.75, 0.1);
      g.add(cloth, lab, inl);
      g.rotation.y = 0.35;
    }
    // スマホ
    const phoneA = makePhone();
    phoneA.group.rotation.y = 0.2;
    nodes.tap.add(phoneA.group);
    const tapRings = makeRings(3, '#C47A45');
    tapRings.group.position.set(-1.2, 0, 0);
    tapRings.group.rotation.y = Math.PI / 2;
    nodes.tap.add(tapRings.group);
    // チップの確認（サーバー）
    {
      const g = nodes.chip;
      for (let i = 0; i < 3; i++) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.42, 1.8), new THREE.MeshStandardMaterial({ color: '#DAD5CB', roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.8 }));
        slab.position.y = -0.6 + i * 0.55;
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: i === 1 ? '#C47A45' : '#111' }));
        led.position.set(0.95, slab.position.y, 0.91);
        g.add(slab, led);
      }
      const chip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.08), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.4 }));
      chip.position.set(0, 1.25, 0);
      const pins = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.04), COPPER());
      pins.position.set(0, 1.25, 0);
      g.add(chip, pins);
      g.rotation.y = -0.3;
    }
    // 記録：つながったブロックと2つの署名
    const recBlocks: THREE.Mesh[] = [];
    {
      const g = nodes.record;
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: i === 3 ? '#111' : '#FAFAF8', roughness: 0.5 }));
        b.position.set(-1.35 + i * 0.9, -0.9 + i * 0.35, 0);
        g.add(b);
        recBlocks.push(b);
        if (i) {
          const link = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), new THREE.MeshStandardMaterial({ color: '#9A958C' }));
          link.position.set(-1.35 + (i - 0.5) * 0.9, -0.9 + (i - 0.5) * 0.35, 0);
          link.rotation.z = Math.PI / 2 - Math.atan2(0.35, 0.9);
          g.add(link);
        }
      }
      const seal = (c: string, x: number, txt: string) => {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 40), [
          new THREE.MeshStandardMaterial({ color: c, metalness: 0.5, roughness: 0.4 }),
          new THREE.MeshStandardMaterial({ map: canvasTex((cx, w, h) => { cx.fillStyle = c; cx.fillRect(0, 0, w, h); cx.fillStyle = '#FAFAF8'; cx.font = '600 34px monospace'; cx.textAlign = 'center'; cx.fillText(txt, w / 2, h / 2 + 12); }, 256, 256), metalness: 0.3, roughness: 0.5 }),
          new THREE.MeshStandardMaterial({ color: c }),
        ]);
        d.rotation.x = Math.PI / 2;
        d.position.set(x, 0.85, 0.5);
        g.add(d);
      };
      seal('#111111', -0.55, 'Ed25519');
      seal('#C47A45', 0.45, 'P-256');
    }
    // Solana への刻印
    {
      const g = nodes.anchor;
      for (let i = 0; i < 3; i++) {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.26, 64), new THREE.MeshStandardMaterial({ color: i === 2 ? '#111' : '#2E2C2A', roughness: 0.35, metalness: 0.3 }));
        d.position.y = -0.7 + i * 0.4;
        g.add(d);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.03, 8, 80), COPPER());
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.23;
      g.add(ring);
      g.rotation.x = 0.25;
    }
    // オフライン：下げ札の QR とスマホ
    const phoneB = makePhone();
    phoneB.set('offline', 'GC-DEMO-1');
    phoneB.group.position.set(0.9, 0, 0);
    phoneB.group.rotation.y = -0.25;
    nodes.offline.add(phoneB.group);
    {
      const card = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.9, 0.03),
        new THREE.MeshStandardMaterial({
          map: canvasTex((c, w, h) => {
            c.fillStyle = '#B7B1A6'; c.fillRect(0, 0, w, h);
            c.fillStyle = '#fff'; c.fillRect(30, 90, w - 60, w - 60);
            c.fillStyle = '#111';
            for (let i = 0; i < 21; i++) for (let j = 0; j < 21; j++) if ((i * 7 + j * 13 + i * j) % 3 === 0 || (i < 7 && j < 7 && (i % 6 === 0 || j % 6 === 0 || (i > 1 && i < 5 && j > 1 && j < 5)))) c.fillRect(40 + i * 8.6, 100 + j * 8.6, 8.6, 8.6);
            c.font = '500 18px monospace'; c.textAlign = 'center'; c.fillText('SCAN TO VERIFY', w / 2, h - 50);
          }, 260, 450),
        }),
      );
      card.position.set(-1.0, -0.1, 0.1);
      card.rotation.set(0, 0.3, 0.06);
      nodes.offline.add(card);
    }
    // つなぐ線と、流れる光の粒
    const flows = EDGES.map(([a, b, dashed]) => {
      const pa = v(a), pb = v(b);
      const mid = pa.clone().lerp(pb, 0.5).add(new THREE.Vector3(0, dashed ? 0 : 0.9, dashed ? 0.8 : 0.6));
      const curve = new THREE.CatmullRomCurve3([pa.clone().add(new THREE.Vector3(0, dashed ? -1.2 : -1.6, 0)), mid, pb.clone().add(new THREE.Vector3(0, dashed ? -1.2 : -1.6, 0))]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, dashed ? 0.018 : 0.03, 6, false), new THREE.MeshBasicMaterial({ color: dashed ? '#B9B4AB' : '#6B6862' }));
      sysG.add(tube);
      const dots = [0, 1, 2].map(() => {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: '#C47A45' }));
        sysG.add(d);
        return d;
      });
      return { a, b, curve, dots };
    });
    sysG.visible = false;

    // ── カメラと操作
    let curMode: Mode = 'tag';
    let fly: { t: THREE.Vector3; p: THREE.Vector3 } | null = null;
    let active: string | null = null;
    const narrow = () => el.clientWidth < 640;
    const homeOf = (m: Mode) =>
      m === 'tag'
        ? { t: new THREE.Vector3(0.6, 0, 0), p: new THREE.Vector3(2.5, 2.4, narrow() ? 16 : 12.5) }
        : { t: new THREE.Vector3(0, -1.2, 0), p: new THREE.Vector3(0, 4, narrow() ? 46 : 30) };
    const goHome = (instant = false) => {
      const h = homeOf(curMode);
      if (instant) { controls.target.copy(h.t); camera.position.copy(h.p); fly = null; } else fly = h;
    };
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    goHome(true);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const focus = (k: string | null) => {
      active = k;
      Object.entries(sprites).forEach(([kk, sp]) => { (sp.material as THREE.SpriteMaterial).opacity = !k || kk === k ? 1 : 0.4; });
      if (!k) { goHome(); return; }
      const p = v(k);
      fly = { t: p.clone().add(new THREE.Vector3(0, 0.5, 0)), p: p.clone().add(new THREE.Vector3(1.5, 2.2, narrow() ? 15 : 11)) };
      controls.autoRotate = false;
    };

    // 図の中の箱をクリック → その段階へ
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downAt: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; controls.autoRotate = false; };
    const onUp = (e: PointerEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || curMode !== 'system') { downAt = null; return; }
      downAt = null;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const h = ray.intersectObjects(Object.values(nodes), true)[0];
      let o: THREE.Object3D | null = h?.object || null;
      while (o && !o.userData.key) o = o.parent;
      const k = (o?.userData.key as string) || null;
      ui.current.setStep(k);
      focus(k);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);

    let raf = 0;
    const clock = new THREE.Clock();
    const loop = () => {
      const dt = Math.min(0.1, clock.getDelta());
      const t = clock.elapsedTime;
      const ease = 1 - Math.exp(-dt * 5);
      if (fly) {
        controls.target.lerp(fly.t, ease);
        camera.position.lerp(fly.p, ease);
        if (camera.position.distanceTo(fly.p) < 0.02) fly = null;
      }
      if (curMode === 'tag') {
        explodeT += (explodeGoal - explodeT) * ease;
        const gap = 0.05 + explodeT * 1.7;
        face.position.z = gap;
        inlay.position.z = 0;
        back.position.z = -gap;
        layerObjs.forEach((o, i) => {
          const c = callouts[i];
          const y = 1.25 - i * 1.25;
          c.sp.position.set(3.1, y, o.position.z);
          const pos = c.line.geometry.attributes.position as THREE.BufferAttribute;
          pos.setXYZ(0, 1.12, y * 0.6, o.position.z);
          pos.setXYZ(1, 1.65, y, o.position.z);
          pos.needsUpdate = true;
          c.sp.visible = c.line.visible = explodeT > 0.5;
        });
        tagRings.tick(t, true);
        tagRings.group.position.z = -0.01;
        const glow = 0.25 + 0.25 * Math.sin(t * 3);
        ((inlay.userData.coil as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.setRGB(glow * 0.8, glow * 0.4, glow * 0.18);
      } else {
        flows.forEach((f, i) => {
          const hot = active && (f.a === active || f.b === active);
          f.dots.forEach((d, j) => {
            const k = (t * (hot ? 0.45 : 0.22) + j / 3 + i * 0.13) % 1;
            d.position.copy(f.curve.getPointAt(k));
            d.scale.setScalar(hot ? 1.4 : 1);
          });
        });
        phoneA.set(Math.floor(t / 2.5) % 3 === 0 ? 'idle' : Math.floor(t / 2.5) % 3 === 1 ? 'reading' : 'ok', 'GC-DEMO-1');
        tapRings.tick(t, true);
        recBlocks.forEach((b, i) => { b.position.y = -0.9 + i * 0.35 + 0.05 * Math.sin(t * 2 + i); });
        nodes.anchor.rotation.y = t * 0.3;
      }
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    api.current = {
      mode(m) {
        curMode = m;
        tagG.visible = m === 'tag';
        sysG.visible = m === 'system';
        active = null;
        Object.values(sprites).forEach((sp) => { (sp.material as THREE.SpriteMaterial).opacity = 1; });
        controls.autoRotate = m === 'tag';
        goHome();
      },
      explode(on) { explodeGoal = on ? 1 : 0; },
      step(k) { focus(k); },
      reset() {
        explodeGoal = 1;
        focus(null);
        controls.autoRotate = curMode === 'tag';
        goHome();
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
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

  // 自動で順番に見せる
  useEffect(() => {
    if (!playing) return;
    let i = 0;
    const go = () => {
      const k = NFC_STEPS[i % NFC_STEPS.length].k;
      setStep(k);
      api.current?.step(k);
      i++;
    };
    go();
    const id = setInterval(() => { if (i >= NFC_STEPS.length) { setPlaying(false); return; } go(); }, 3600);
    return () => clearInterval(id);
  }, [playing]);

  const pickMode = (m: Mode) => { setMode(m); setStep(null); setPlaying(false); api.current?.mode(m); };
  const reset = () => { setStep(null); setPlaying(false); setExploded(true); api.current?.reset(); };
  const s = NFC_STEPS.find((x) => x.k === step);

  return (
    <div className="tv ns">
      <div className="tv-stage">
        <div ref={host} className="tv-canvas" role="img" aria-label={mode === 'tag' ? 'Exploded 3D view of the NFC label: woven face, copper antenna with chip, sealed backing.' : '3D diagram of the NFC proof system, from the piece to the Solana anchor and the offline check.'} />
        <p className="tv-hint">{mode === 'system' ? 'Tap a step · drag to turn · scroll to zoom' : 'Drag to turn · scroll to zoom'}</p>
        <button className="tv-reset" onClick={reset}>Reset</button>
      </div>
      <div className="tv-side">
        <div className="tv-views" role="tablist" aria-label="View">
          <button role="tab" aria-pressed={mode === 'tag'} aria-selected={mode === 'tag'} onClick={() => pickMode('tag')}>Inside the tag</button>
          <button role="tab" aria-pressed={mode === 'system'} aria-selected={mode === 'system'} onClick={() => pickMode('system')}>The whole system</button>
        </div>
        {mode === 'tag' ? (
          <>
            <h2 className="tv-name">The NFC label</h2>
            <p className="tv-sub">Three layers, 36 × 50 mm, sewn into the back neck seam</p>
            <ol className="ns-list">
              {TAG_LAYERS.map((l, i) => (
                <li key={l.k}><b>{String(i + 1).padStart(2, '0')} {l.title}</b><span>{l.body}</span></li>
              ))}
            </ol>
            <label className="lb-check"><input type="checkbox" checked={exploded} onChange={(e) => { setExploded(e.target.checked); api.current?.explode(e.target.checked); }} />Pull the layers apart</label>
          </>
        ) : (
          <>
            <h2 className="tv-name">{s ? s.title : 'From tap to proof'}</h2>
            <p className="tv-sub">{s ? s.short : 'Six steps. Tap one, or play them in order.'}</p>
            <div className="ns-steps" role="group" aria-label="Steps">
              {NFC_STEPS.map((x) => (
                <button key={x.k} aria-pressed={step === x.k} onClick={() => { setPlaying(false); const k = step === x.k ? null : x.k; setStep(k); api.current?.step(k); }}>{x.n}</button>
              ))}
            </div>
            {s && (
              <div className="ns-detail">
                <p>{s.body}</p>
                <p className="pp-mono">{s.tech}</p>
                {s.next && <p className="mo-fine">Planned for GCPP/3. Today the tag opens the passport, and the two signatures do the proving.</p>}
              </div>
            )}
            <div className="pp-row">
              <button className="mo-btn small" onClick={() => setPlaying(true)} disabled={playing}>{playing ? 'Playing…' : 'Play the steps'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
