'use client';
// ゲームのように旅するショールーム：店 → 夕暮れの未来の街 → 霧の森 → 夜明けの山頂。
// 道に沿って進み、途中に立つマネキンが一着ずつ服を着ている。止まった服は360°回して見られる。
// 服は「布の絵」を厚みのある立体に押し出して着せる（彫刻のような服）。
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { BODY } from './garmentArt';

export type Look = { id: string; title: string; kind: 'garment' | 'cap' | 'art'; tex: string; shape?: keyof typeof BODY; color?: string };
export type JourneyApi = { move: (v: number) => void; goStation: (k: number) => void; view360: (on: boolean) => void; restart: () => void };
export type JState = { u: number; zone: number; station: number | null; end: boolean };

const ZONES = [
  { sky: 0x2a2c30, fog: 0x2a2c30, near: 8, far: 30, hemi: 1.5, sun: 0.9, sunCol: 0xffffff },
  { sky: 0x3b2a2c, fog: 0x6b4a3e, near: 8, far: 60, hemi: 0.6, sun: 0.9, sunCol: 0xff9a5a },
  { sky: 0x1b2420, fog: 0x2d3a33, near: 4, far: 30, hemi: 0.5, sun: 0.3, sunCol: 0xbfe6c8 },
  { sky: 0xbcc8d6, fog: 0xd8dde3, near: 18, far: 120, hemi: 1.1, sun: 1.6, sunCol: 0xffe2c0 },
];
export const ZONE_AT = [0, 0.2, 0.5, 0.8];

function cTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rep?: [number, number]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}
const R = (a: number, b: number) => a + Math.random() * (b - a);

// 押し出した服（厚みのある布の彫刻）
function garmentMesh(shape: keyof typeof BODY, texUrl: string, onReady: () => void) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${BODY[shape]}"/></svg>`;
  const shapes = new SVGLoader().parse(svg).paths[0].toShapes(true);
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: 16, bevelEnabled: true, bevelThickness: 7, bevelSize: 4, bevelSegments: 4, curveSegments: 10 });
  geo.translate(-120, -26, -8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide });
  new THREE.TextureLoader().load(texUrl, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    // 押し出しの UV は形の座標そのまま（0〜240, 0〜220）→ 画像の 0〜1 に合わせる
    t.repeat.set(1 / 240, -1 / 220); t.offset.set(0, 1);
    mat.map = t; mat.needsUpdate = true; onReady();
  });
  const m = new THREE.Mesh(geo, mat);
  const s = 0.0052; m.scale.set(s, -s, s);
  return m;
}

function mannequin(mat: THREE.Material) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), mat); head.scale.set(0.9, 1.15, 1); head.position.y = 1.66; g.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.12, 12), mat); neck.position.y = 1.52; g.add(neck);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 6, 16), mat); torso.scale.set(1.15, 1, 0.7); torso.position.y = 1.2; g.add(torso);
  const legs: THREE.Mesh[] = [];
  for (const x of [-0.085, 0.085]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.74, 6, 12), mat); l.position.set(x, 0.47, 0); l.geometry.translate(0, -0.0, 0); g.add(l); legs.push(l); }
  for (const x of [-0.24, 0.24]) { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.52, 6, 12), mat); a.position.set(x, 1.12, 0); a.rotation.z = x > 0 ? 0.12 : -0.12; g.add(a); }
  g.userData.legs = legs;
  return g;
}

export default function Journey3D({ looks, onState, onPick, apiRef }: { looks: Look[]; onState: (s: JState) => void; onPick: (id: string) => void; apiRef: React.MutableRefObject<JourneyApi | null> }) {
  const host = useRef<HTMLDivElement>(null);
  const key = looks.map((l) => l.id + l.tex.length).join('|');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { el.innerHTML = '<p style="color:#ccc;padding:20px">3D is not available in this browser.</p>'; return; }
    const mobile = matchMedia('(pointer: coarse)').matches;
    renderer.setPixelRatio(Math.min(mobile ? 1.5 : 2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(ZONES[0].sky);
    scene.fog = new THREE.Fog(ZONES[0].fog, 6, 26);
    const cam = new THREE.PerspectiveCamera(mobile ? 62 : 52, 1, 0.05, 400);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.9); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 0.5); sun.position.set(10, 20, 6); scene.add(sun);

    // ---- 道（ゆるいS字）----
    const N = Math.max(1, looks.length);
    const total = Math.max(110, N * 9 + 40);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) { const z = -(i / 24) * total; const u = i / 24; const amp = u <= ZONE_AT[1] ? 0 : Math.min(6, (u - ZONE_AT[1]) * 40); pts.push(new THREE.Vector3(Math.sin((u - ZONE_AT[1]) * Math.PI * 2.2) * amp, u > ZONE_AT[3] ? (u - ZONE_AT[3]) * 60 : 0, z)); }
    const path = new THREE.CatmullRomCurve3(pts);
    const L = path.getLength();
    const at = (u: number) => path.getPointAt(Math.max(0, Math.min(1, u)));
    const tan = (u: number) => path.getTangentAt(Math.max(0, Math.min(1, u)));
    const zoneOf = (u: number) => (u >= ZONE_AT[3] ? 3 : u >= ZONE_AT[2] ? 2 : u >= ZONE_AT[1] ? 1 : 0);

    // 道の帯
    const road: number[] = [], roadIdx: number[] = [];
    for (let i = 0; i <= 300; i++) {
      const u = i / 300, p = at(u), t = tan(u), side = new THREE.Vector3(-t.z, 0, t.x).normalize();
      const w = zoneOf(u) === 1 ? 4.2 : 1.6;
      road.push(p.x + side.x * w, p.y + 0.01, p.z + side.z * w, p.x - side.x * w, p.y + 0.01, p.z - side.z * w);
      if (i < 300) { const a = i * 2; roadIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(road, 3)); rg.setIndex(roadIdx); rg.computeVertexNormals();
    scene.add(new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.35, metalness: 0.25, side: THREE.DoubleSide })));

    // ---- ① 店（コンクリートと蛍光灯）----
    const z0 = 0, z1 = -ZONE_AT[1] * total;
    const store = new THREE.Group(); scene.add(store);
    const conc = new THREE.MeshStandardMaterial({ map: cTex(256, 256, (g) => { g.fillStyle = '#8d8b88'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${R(0.02, 0.07)})`; g.fillRect(R(0, 256), R(0, 256), R(1, 3), R(1, 3)); } }, [6, 6]), roughness: 0.9 });
    const sl = Math.abs(z1 - z0) + 4;
    const sf = new THREE.Mesh(new THREE.PlaneGeometry(10, sl), conc); sf.rotation.x = -Math.PI / 2; sf.position.set(0, 0, (z0 + z1) / 2); store.add(sf);
    for (const x of [-5, 5]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(sl, 4.2), conc); w.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; w.position.set(x, 2.1, (z0 + z1) / 2); store.add(w); }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, sl), new THREE.MeshStandardMaterial({ color: 0x1b1b1c })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 4.2, (z0 + z1) / 2); store.add(ceil);
    for (let z = z0 - 1; z > z1; z -= 3) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 2.2), new THREE.MeshBasicMaterial({ color: 0xf2f6ff })); f.position.set(0, 4.15, z); store.add(f); }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.2), conc); back.position.set(0, 2.1, z0 + 2); back.rotation.y = Math.PI; store.add(back);
    // 出口（光る扉）
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), new THREE.MeshBasicMaterial({ color: 0xffb27a })); door.position.set(0, 1.6, z1 - 1.9); store.add(door);
    for (const x of [-3.2, 3.2]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.2), conc); w.position.set(x, 2.1, z1 - 2); store.add(w); }

    // ---- ② 未来の街（ビル・ドローン・空飛ぶバス）----
    const winTex = cTex(128, 256, (g) => { g.fillStyle = '#16181d'; g.fillRect(0, 0, 128, 256); for (let y = 6; y < 256; y += 12) for (let x = 6; x < 128; x += 10) { const on = Math.random() > 0.62; g.fillStyle = on ? `hsl(${R(25, 45)},90%,${R(55, 75)}%)` : '#23262d'; g.fillRect(x, y, 6, 7); } });
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
    const bMat = new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.8 });
    const bGeo = new THREE.BoxGeometry(1, 1, 1);
    const nB = mobile ? 70 : 140;
    const bInst = new THREE.InstancedMesh(bGeo, bMat, nB);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let i = 0; i < nB; i++) {
      const u = R(ZONE_AT[1], ZONE_AT[2] + 0.02), p = at(u), t = tan(u), side = new THREE.Vector3(-t.z, 0, t.x).normalize(), s = Math.random() > 0.5 ? 1 : -1;
      const off = R(7, 22), h = R(8, 46), w = R(3, 7);
      v.set(p.x + side.x * off * s, h / 2, p.z + side.z * off * s); sc.set(w, h, R(3, 7)); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R(0, 0.3));
      bInst.setMatrixAt(i, m4.compose(v, q, sc));
    }
    scene.add(bInst);
    const drones: THREE.Object3D[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new THREE.Group();
      d.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.4 })));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b2f })); led.position.y = -0.06; d.add(led);
      const u = R(ZONE_AT[1], ZONE_AT[2]); const p = at(u);
      d.userData = { c: p.clone().add(new THREE.Vector3(R(-8, 8), R(5, 14), R(-6, 6))), r: R(2, 6), s: R(0.3, 0.8), ph: R(0, 6), led };
      scene.add(d); drones.push(d);
    }
    const bus = new THREE.Group();
    const busBody = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 1.8), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, metalness: 0.3, roughness: 0.5 })); bus.add(busBody);
    const busWin = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 1.82), new THREE.MeshBasicMaterial({ color: 0xffd08a })); busWin.position.y = 0.25; bus.add(busWin);
    const busZ = -((ZONE_AT[1] + ZONE_AT[2]) / 2) * total; scene.add(bus);
    const cityGround = new THREE.Mesh(new THREE.PlaneGeometry(90, (ZONE_AT[2] - ZONE_AT[1]) * total + 20), new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.6 }));
    cityGround.rotation.x = -Math.PI / 2; cityGround.position.set(0, -0.01, -((ZONE_AT[1] + ZONE_AT[2]) / 2) * total); scene.add(cityGround);
    for (let i = 0; i < 18; i++) { const u = ZONE_AT[1] + (i / 18) * (ZONE_AT[2] - ZONE_AT[1]); const p = at(u), t = tan(u), side = new THREE.Vector3(-t.z, 0, t.x).normalize(); for (const s of [-1, 1]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.5, 6), new THREE.MeshStandardMaterial({ color: 0x111111 })); pole.position.set(p.x + side.x * 5 * s, 2.25, p.z + side.z * 5 * s); scene.add(pole); const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: 0xffc58a })); lamp.position.set(pole.position.x - side.x * 0.3 * s, 4.5, pole.position.z); scene.add(lamp); } }

    // ---- ③ 霧の森 ----
    const nT = mobile ? 160 : 320;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 1, 6), new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 1 }), nT);
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ color: 0x1e3328, roughness: 1, flatShading: true }), nT);
    for (let i = 0; i < nT; i++) {
      const u = R(ZONE_AT[2] - 0.02, ZONE_AT[3] + 0.03), p = at(u), t = tan(u), side = new THREE.Vector3(-t.z, 0, t.x).normalize(), s = Math.random() > 0.5 ? 1 : -1, off = R(2.6, 26);
      const h = R(5, 13), x = p.x + side.x * off * s, z = p.z + side.z * off * s, y = Math.max(0, p.y);
      trunk.setMatrixAt(i, m4.compose(v.set(x, y + h * 0.2, z), q.identity(), sc.set(1, h * 0.4, 1)));
      crown.setMatrixAt(i, m4.compose(v.set(x, y + h * 0.62, z), q.identity(), sc.set(R(1.2, 2.2), h * 0.8, R(1.2, 2.2))));
    }
    scene.add(trunk, crown);
    const forestGround = new THREE.Mesh(new THREE.PlaneGeometry(80, (ZONE_AT[3] - ZONE_AT[2]) * total + 20), new THREE.MeshStandardMaterial({ color: 0x1d2a1f, roughness: 1 }));
    forestGround.rotation.x = -Math.PI / 2; forestGround.position.set(0, -0.02, -((ZONE_AT[2] + ZONE_AT[3]) / 2) * total); scene.add(forestGround);
    const ffN = 260, ff = new Float32Array(ffN * 3);
    for (let i = 0; i < ffN; i++) { const u = R(ZONE_AT[2], ZONE_AT[3]), p = at(u); ff.set([p.x + R(-10, 10), R(0.4, 3), p.z + R(-6, 6)], i * 3); }
    const ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute('position', new THREE.BufferAttribute(ff, 3));
    const flies = new THREE.Points(ffGeo, new THREE.PointsMaterial({ color: 0xd9ff9a, size: 0.09, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(flies);

    // ---- ④ 夜明けの山頂（雪・岩・朝日）----
    const snowGeo = new THREE.PlaneGeometry(120, (1 - ZONE_AT[3]) * total + 40, 60, 60);
    snowGeo.rotateX(-Math.PI / 2);
    const sp = snowGeo.attributes.position as THREE.BufferAttribute;
    const zc = -((ZONE_AT[3] + 1) / 2) * total;
    for (let i = 0; i < sp.count; i++) {
      const wz = sp.getZ(i) + zc; const u = Math.min(1, Math.max(ZONE_AT[3], -wz / total)); const p = at(u);
      const dx = Math.abs(sp.getX(i) - p.x);
      sp.setY(i, p.y - 0.15 + Math.max(0, dx - 3) * 0.35 + Math.sin(sp.getX(i) * 0.3) * Math.cos(wz * 0.2) * 0.8 * Math.min(1, dx / 8));
    }
    snowGeo.computeVertexNormals();
    const snow = new THREE.Mesh(snowGeo, new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.95 })); snow.position.z = zc; scene.add(snow);
    for (let i = 0; i < 30; i++) { const u = R(ZONE_AT[3], 1), p = at(u); const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(R(0.4, 1.6), 0), new THREE.MeshStandardMaterial({ color: 0x5b5f66, flatShading: true, roughness: 1 })); const ox = R(4, 14) * (Math.random() > 0.5 ? 1 : -1); rk.position.set(p.x + ox, p.y - 0.15 + (Math.abs(ox) - 3) * 0.35 + R(-0.3, 0.2), p.z + R(-1, 1)); scene.add(rk); }
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ color: 0xffd6a0, fog: false }));
    const endP = at(1); sunDisc.position.set(endP.x, endP.y + 6, endP.z - 120); scene.add(sunDisc);

    // ---- 服を着たマネキン（道の脇に一体ずつ）----
    const stone = new THREE.MeshStandardMaterial({ color: 0xbdb8b0, roughness: 0.95 });
    const stations: { u: number; g: THREE.Group; id: string }[] = [];
    const picks: THREE.Object3D[] = [];
    const loader = new THREE.TextureLoader();
    looks.forEach((lk, i) => {
      const u = N === 1 ? 0.4 : 0.05 + (i / (N - 1)) * 0.88;
      const p = at(u), t = tan(u), side = new THREE.Vector3(-t.z, 0, t.x).normalize(), s = i % 2 ? 1 : -1;
      const g = new THREE.Group();
      g.position.copy(p).add(side.clone().multiplyScalar(2.1 * s)); g.position.y = p.y;
      g.lookAt(p.x, g.position.y, p.z); g.rotateY(-s * 0.35);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.12, 40), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.3 })); base.position.y = 0.06; g.add(base);
      const fig = new THREE.Group(); fig.position.y = 0.12; g.add(fig);
      fig.add(mannequin(stone));
      if (lk.kind === 'garment' && lk.shape) {
        const gm = garmentMesh(lk.shape, lk.tex, () => {}); gm.position.set(0, 1.47, 0.02); fig.add(gm); gm.userData.id = lk.id; picks.push(gm);
      } else {
        const w = lk.kind === 'art' ? 0.9 : 0.5;
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, w), new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide, roughness: 0.7 }));
        loader.load(lk.tex, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; const im = tx.image as { width: number; height: number }; pl.scale.y = im.height / im.width; (pl.material as THREE.MeshStandardMaterial).map = tx; (pl.material as THREE.MeshStandardMaterial).color.set(0xffffff); (pl.material as THREE.MeshStandardMaterial).needsUpdate = true; });
        if (lk.kind === 'art') { pl.position.set(0, 1.3, 0.25); const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, w + 0.08, 0.04), new THREE.MeshStandardMaterial({ color: 0x111111 })); fr.position.set(0, 1.3, 0.22); fig.add(fr); }
        else pl.position.set(0, 1.25, 0.18);
        fig.add(pl); pl.userData.id = lk.id; picks.push(pl);
      }
      g.userData.fig = fig;
      scene.add(g); stations.push({ u, g, id: lk.id });
      fig.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.id) { o.userData.id = lk.id; picks.push(o); } });
    });

    // ---- 自分（暗い色のアバター）----
    const avatar = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.7 });
    const av = mannequin(dark); avatar.add(av);
    const coat = garmentMesh('jacket', 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="220"><rect width="240" height="220" fill="#2a2b2e"/></svg>'), () => {}); coat.position.set(0, 1.47, 0.02); coat.scale.y *= 1.35; avatar.add(coat);
    scene.add(avatar);

    // ---- 動き ----
    const st = { s: 0, vel: 0, look: 0, pitch: 0.18, view360: false, orbit: 0, station: null as number | null, lastZone: -1, end: false };
    const stationS = stations.map((x) => x.u * L);
    apiRef.current = {
      move: (dv) => { st.vel = Math.max(-0.35, Math.min(0.35, st.vel + dv)); },
      goStation: (k) => { const s = stationS[Math.max(0, Math.min(stations.length - 1, k))]; if (s !== undefined) { st.vel = 0; target = s; } },
      view360: (on) => { st.view360 = on; st.orbit = 0; },
      restart: () => { st.s = 0; st.vel = 0; target = null; st.view360 = false; st.end = false; },
    };
    let target: number | null = null;
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => { keys.add(e.key.toLowerCase()); if (['arrowup', 'arrowdown', ' '].includes(e.key.toLowerCase())) e.preventDefault(); };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    const cv = renderer.domElement;
    let drag: { x: number; y: number; look: number; pitch: number; orbit: number; moved: boolean } | null = null;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, look: st.look, pitch: st.pitch, orbit: st.orbit, moved: false }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      if (!drag.moved) return;
      if (st.view360) st.orbit = drag.orbit - dx * 0.008;
      else if (Math.abs(dy) > Math.abs(dx) * 1.2 && mobile) { st.vel = Math.max(-0.35, Math.min(0.35, -dy * 0.0016 + st.vel * 0.6)); } // スマホ：上下スワイプで進む
      else st.look = drag.look - dx * 0.005;
      st.pitch = Math.max(-0.1, Math.min(0.6, drag.pitch + (st.view360 ? dy * 0.003 : 0)));
    });
    cv.addEventListener('pointerup', (e) => {
      const d = drag; drag = null; if (!d || d.moved) return;
      const r = cv.getBoundingClientRect(); const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
      const hit = ray.intersectObjects(picks, false)[0]; if (hit) onPick(hit.object.userData.id);
    });
    const wheel = (e: WheelEvent) => { e.preventDefault(); target = null; st.vel = Math.max(-0.35, Math.min(0.35, st.vel + e.deltaY * 0.0009)); };
    cv.addEventListener('wheel', wheel, { passive: false });

    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize(); const ro = new ResizeObserver(resize); ro.observe(el);
    const col = new THREE.Color(), col2 = new THREE.Color();
    let raf = 0, last = performance.now(), alive = true, walk = 0;
    const loop = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; const f = dt * 60;
      if (keys.has('w') || keys.has('arrowup')) { target = null; st.vel = Math.min(0.3, st.vel + 0.01 * f); }
      if (keys.has('s') || keys.has('arrowdown')) { target = null; st.vel = Math.max(-0.3, st.vel - 0.01 * f); }
      if (keys.has('a') || keys.has('arrowleft')) st.look += 0.03 * f;
      if (keys.has('d') || keys.has('arrowright')) st.look -= 0.03 * f;
      if (st.view360) st.vel = 0;
      if (target !== null) { st.vel = (target - st.s) * 0.06; if (Math.abs(target - st.s) < 0.02) { st.s = target; target = null; st.vel = 0; } }
      else {
        st.vel *= Math.pow(0.93, f);
        // 服の前でゆっくり止まる
        if (Math.abs(st.vel) < 0.05) { const near = stationS.reduce((b, s) => (Math.abs(s - st.s) < Math.abs(b - st.s) ? s : b), Infinity); if (Math.abs(near - st.s) < 2.2) st.vel += (near - st.s) * 0.012 * f; }
      }
      st.s = Math.max(0, Math.min(L - 0.5, st.s + st.vel * f));
      const u = st.s / L;
      const p = at(u), tg = tan(u);
      const heading = Math.atan2(-tg.x, -tg.z);
      avatar.position.copy(p); avatar.rotation.y = heading;
      walk += Math.abs(st.vel) * f * 2.2;
      const legs = av.userData.legs as THREE.Mesh[]; legs[0].rotation.x = Math.sin(walk) * 0.5 * Math.min(1, Math.abs(st.vel) * 12); legs[1].rotation.x = -legs[0].rotation.x;
      avatar.position.y = p.y + Math.abs(Math.sin(walk)) * 0.03 * Math.min(1, Math.abs(st.vel) * 12);
      // いまの服（近いマネキン）
      let si: number | null = null; stationS.forEach((s, k) => { if (Math.abs(s - st.s) < 1.6) si = k; });
      if (si !== st.station) { st.station = si; }
      // 360°：服のまわりをカメラが回る
      if (st.view360 && si !== null) {
        const g = stations[si].g; const c = g.position.clone().add(new THREE.Vector3(0, 1.2, 0));
        st.orbit += dt * 0.25; const a = g.rotation.y + st.orbit;
        cam.position.lerp(new THREE.Vector3(c.x + Math.sin(a) * 3.2, c.y + 0.35 + st.pitch, c.z + Math.cos(a) * 3.2), 0.08); cam.lookAt(c.x, c.y - 0.1, c.z);
        avatar.visible = false;
      } else if (si !== null && Math.abs(st.vel) < 0.03 && target === null && Math.abs(st.look) < 0.6) {
        // 服の前で止まったら、服を正面から見る位置へ（自分は手前の横に）
        avatar.visible = true;
        const g = stations[si].g, c = g.position.clone();
        const toPath = p.clone().sub(c).setY(0).normalize();
        const side = new THREE.Vector3(-toPath.z, 0, toPath.x).multiplyScalar(0.7);
        cam.position.lerp(c.clone().add(toPath.multiplyScalar(3.3)).add(side).add(new THREE.Vector3(0, 1.55 + st.pitch, 0)), 0.06);
        cam.lookAt(c.x, c.y + 1.15, c.z);
      } else {
        avatar.visible = true;
        const a = heading + st.look;
        const back = new THREE.Vector3(Math.sin(a) * 3.6, 1.9 + st.pitch * 2, Math.cos(a) * 3.6);
        cam.position.lerp(p.clone().add(back), 0.1);
        cam.lookAt(p.x - Math.sin(a) * 2, p.y + 1.25, p.z - Math.cos(a) * 2);
      }
      // 地帯ごとの空気（色・霧・光）をなめらかに切り替え
      const z = zoneOf(u), nz = Math.min(3, z + 1), k = z < 3 ? Math.max(0, Math.min(1, (u - ZONE_AT[nz] + 0.04) / 0.08)) : 0;
      const A = ZONES[z], B = ZONES[nz];
      (scene.background as THREE.Color).copy(col.set(A.sky).lerp(col2.set(B.sky), k));
      const fog = scene.fog as THREE.Fog; fog.color.copy(col.set(A.fog).lerp(col2.set(B.fog), k)); fog.near = A.near + (B.near - A.near) * k; fog.far = A.far + (B.far - A.far) * k;
      hemi.intensity = A.hemi + (B.hemi - A.hemi) * k; sun.intensity = A.sun + (B.sun - A.sun) * k; sun.color.copy(col.set(A.sunCol).lerp(col2.set(B.sunCol), k));
      const tt = now / 1000;
      drones.forEach((d) => { const ud = d.userData; d.position.set(ud.c.x + Math.cos(tt * ud.s + ud.ph) * ud.r, ud.c.y + Math.sin(tt * 1.3 + ud.ph) * 0.4, ud.c.z + Math.sin(tt * ud.s + ud.ph) * ud.r); (ud.led.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(tt * 6 + ud.ph) > 0.6 ? 0xff3b2f : 0x330a08); });
      bus.position.set(((tt * 6) % 120) - 60, 14 + Math.sin(tt * 0.7), busZ);
      (flies.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(tt * 3) * 0.3;
      stations.forEach((s2, k2) => { const fig = s2.g.userData.fig as THREE.Group; fig.rotation.y = k2 === si && !st.view360 ? Math.sin(tt * 0.6) * 0.25 : fig.rotation.y * 0.95; });
      const endNow = u > 0.985;
      if (z !== st.lastZone || endNow !== st.end || si !== (st as { _si?: number | null })._si) { st.lastZone = z; st.end = endNow; (st as { _si?: number | null })._si = si; onState({ u, zone: z, station: si, end: endNow }); }
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', kd); removeEventListener('keyup', ku); cv.removeEventListener('wheel', wheel);
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (mt) (Array.isArray(mt) ? mt : [mt]).forEach((x) => { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); }); });
      renderer.dispose(); el.innerHTML = ''; apiRef.current = null;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="jr-3d" ref={host} />;
}
