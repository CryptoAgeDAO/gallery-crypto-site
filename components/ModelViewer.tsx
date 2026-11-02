'use client';
// 作品の3Dモデル（CLO 3D などから書き出した .glb）を、360度回して見るためのビューア
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useLang } from './Lang';

export type ModelInfo = { meshes: number; triangles: number; textures: number; size: [number, number, number] };

type Props = {
  src: string; // 公開URL、または blob: URL（アップロード前の確認）
  compact?: boolean;
  onInfo?: (i: ModelInfo) => void;
  onError?: (m: string) => void;
};

export default function ModelViewer({ src, compact, onInfo, onError }: Props) {
  const { t } = useLang();
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{ reset: () => void; spin: (v: boolean) => void; dark: (v: boolean) => void } | null>(null);
  const [pct, setPct] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  const [spin, setSpin] = useState(true);
  const [dark, setDark] = useState(false);
  const cb = useRef({ onInfo, onError });
  cb.current = { onInfo, onError };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setState('loading');
    setPct(0);
    let alive = true;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgLight = new THREE.Color('#EFEDE8');
    const bgDark = new THREE.Color('#131211');
    scene.background = bgLight;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.8;

    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;

    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    const rim = new THREE.DirectionalLight(0xfff1e2, 1.1);
    const fill = new THREE.DirectionalLight(0xe8eeff, 0.4);
    scene.add(key, rim, fill, new THREE.HemisphereLight(0xffffff, 0x7d776c, 0.3));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    let home = { pos: new THREE.Vector3(0, 1, 3), target: new THREE.Vector3() };
    const resize = () => {
      const w = el.clientWidth || 300;
      const h = el.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let model: THREE.Object3D | null = null;
    const loader = new GLTFLoader();
    loader.load(
      src,
      (gltf) => {
        if (!alive) return;
        model = gltf.scene;
        let meshes = 0, triangles = 0;
        const tex = new Set<THREE.Texture>();
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          meshes++;
          m.castShadow = true;
          m.receiveShadow = true;
          const g = m.geometry as THREE.BufferGeometry;
          triangles += g.index ? g.index.count / 3 : (g.attributes.position?.count || 0) / 3;
          const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
          mats.forEach((mm) => {
            // 服の布は裏も見えるように（CLO の書き出しは片面のことが多い）
            mm.side = THREE.DoubleSide;
            ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach((k) => {
              const tx = (mm as unknown as Record<string, THREE.Texture | null>)[k];
              if (tx) { tex.add(tx); tx.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
            });
          });
        });
        // 大きさと位置をそろえる（足元を床に、中心を原点に）
        const b = new THREE.Box3().setFromObject(model);
        const size = b.getSize(new THREE.Vector3());
        const center = b.getCenter(new THREE.Vector3());
        model.position.sub(new THREE.Vector3(center.x, b.min.y, center.z));
        scene.add(model);
        const r = Math.max(size.x, size.y, size.z) || 1;
        floor.scale.setScalar(r * 6);
        const target = new THREE.Vector3(0, size.y * 0.5, 0);
        // 縦・横どちらにも収まる距離（回したときに袖が切れないよう、幅は奥行きも含めた最大値で測る）
        const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
        const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
        const wide = Math.max(size.x, size.z);
        const dist = Math.max(size.y / 2 / Math.tan(vHalf), wide / 2 / Math.tan(hHalf)) * 1.3 + wide / 2;
        home = { pos: new THREE.Vector3(dist * 0.35, size.y * 0.6, dist), target };
        camera.near = r / 200;
        camera.far = r * 50;
        camera.updateProjectionMatrix();
        camera.position.copy(home.pos);
        controls.target.copy(target);
        controls.minDistance = r * 0.4;
        controls.maxDistance = r * 6;
        key.position.set(r * 1.5, r * 3, r * 2);
        Object.assign(key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: r * 0.1, far: r * 10 });
        key.shadow.camera.updateProjectionMatrix();
        rim.position.set(-r * 2, r * 1.5, -r * 2);
        fill.position.set(-r * 2, r * 0.5, r * 2);
        controls.update();
        setState('ready');
        cb.current.onInfo?.({ meshes, triangles: Math.round(triangles), textures: tex.size, size: [size.x, size.y, size.z] });
      },
      (e) => {
        if (e.total) setPct(Math.round((e.loaded / e.total) * 100));
      },
      (err) => {
        if (!alive) return;
        const m = (err as Error)?.message || String(err);
        setMsg(m);
        setState('error');
        cb.current.onError?.(m);
      },
    );

    // 触ったら自動回転を止める
    const stop = () => { controls.autoRotate = false; setSpin(false); };
    renderer.domElement.addEventListener('pointerdown', stop);

    api.current = {
      reset: () => { camera.position.copy(home.pos); controls.target.copy(home.target); controls.update(); },
      spin: (v) => { controls.autoRotate = v; },
      dark: (v) => { scene.background = v ? bgDark : bgLight; (floor.material as THREE.ShadowMaterial).opacity = v ? 0.45 : 0.18; },
    };

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', stop);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as THREE.MeshStandardMaterial[];
        mats.forEach((mm) => { mm.map?.dispose(); mm.normalMap?.dispose(); mm.roughnessMap?.dispose(); mm.dispose(); });
      });
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, [src]);

  return (
    <div className={'mv' + (compact ? ' mv-compact' : '') + (dark ? ' mv-dark' : '')}>
      <div className="mv-stage" ref={box} />
      {state === 'loading' && <p className="mv-busy">{t('Loading the 3D model…', '3Dモデルを読み込み中…')} {pct ? `${pct}%` : ''}</p>}
      {state === 'error' && (
        <p className="mv-busy">
          {t('Could not open this 3D file.', 'この3Dファイルを開けませんでした。')}
          <br />
          <small>{msg}</small>
        </p>
      )}
      {state === 'ready' && (
        <div className="mv-bar">
          <button type="button" aria-pressed={spin} onClick={() => { const v = !spin; setSpin(v); api.current?.spin(v); }}>
            {spin ? t('Pause', '停止') : t('Rotate', '回転')}
          </button>
          <button type="button" onClick={() => api.current?.reset()}>{t('Reset', 'リセット')}</button>
          <button type="button" aria-pressed={dark} onClick={() => { const v = !dark; setDark(v); api.current?.dark(v); }}>
            {dark ? t('Light', '明るく') : t('Studio', '暗く')}
          </button>
          <span className="mv-hint">{t('Drag to turn · pinch to zoom', 'ドラッグで回転・ピンチで拡大')}</span>
        </div>
      )}
    </div>
  );
}
