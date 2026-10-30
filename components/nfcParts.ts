// NFC タグの部品（銅のアンテナ・チップ・フィルム）と、タップするスマートフォン。3D の衣服ビューとシステム図で共用する
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export function canvasTex(draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export const COPPER = () => new THREE.MeshStandardMaterial({ color: '#C47A45', metalness: 1, roughness: 0.32, emissive: '#000000' });

// 角形のうず巻きアンテナ（巻数 turns）
export function coilGeometry(w: number, h: number, turns = 5, gap = 0.03, r = 0.006) {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k < turns; k++) {
    const hw = w / 2 - k * gap, hh = h / 2 - k * gap;
    pts.push(new THREE.Vector3(-hw, hh, 0), new THREE.Vector3(hw, hh, 0), new THREE.Vector3(hw, -hh, 0), new THREE.Vector3(-hw, -hh, 0));
  }
  pts.push(new THREE.Vector3(-w / 2 + turns * gap, h / 2 - turns * gap, 0));
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  return new THREE.TubeGeometry(path, pts.length * 10, r, 5, false);
}

// 透明フィルムの上に、アンテナとチップ（NTAG 424 DNA）
export function makeInlay(w: number, h: number, scale = 1) {
  const g = new THREE.Group();
  const film = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.004 * scale),
    new THREE.MeshPhysicalMaterial({ color: '#DCE7E6', transparent: true, opacity: 0.35, roughness: 0.15, transmission: 0, depthWrite: false }),
  );
  const coil = new THREE.Mesh(coilGeometry(w * 0.86, h * 0.86, 5, Math.min(w, h) * 0.06, 0.006 * scale), COPPER());
  coil.position.z = 0.004 * scale;
  const chip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, w * 0.16, 0.012 * scale), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.4, metalness: 0.2, emissive: '#000000' }));
  chip.position.set(w * 0.43 - w * 0.08, -h * 0.43 + w * 0.16, 0.01 * scale);
  g.add(film, coil, chip);
  g.userData = { coil, chip, film };
  return g;
}

export type Screen = 'idle' | 'reading' | 'ok' | 'offline';

export function drawScreen(c: CanvasRenderingContext2D, w: number, h: number, s: Screen, cert: string) {
  c.fillStyle = '#FAFAF8';
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#111';
  c.textAlign = 'center';
  c.font = '600 26px monospace';
  c.fillText('GALLERY CRYPTO', w / 2, 90);
  c.strokeStyle = '#E2DFD8';
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(60, 120); c.lineTo(w - 60, 120); c.stroke();
  if (s === 'idle' || s === 'reading') {
    c.strokeStyle = s === 'reading' ? '#111' : '#B9B4AB';
    c.lineWidth = 6;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(w / 2, h * 0.42, 60 + i * 50, -Math.PI * 0.75, -Math.PI * 0.25); c.stroke(); }
    c.fillStyle = '#6B6862';
    c.font = '500 30px sans-serif';
    c.fillText(s === 'reading' ? 'Reading the chip…' : 'Hold near the tag', w / 2, h * 0.62);
    return;
  }
  c.fillStyle = '#111';
  c.fillRect(70, 190, w - 140, 120);
  c.fillStyle = '#FAFAF8';
  c.font = '700 46px sans-serif';
  c.fillText('AUTHENTIC', w / 2, 268);
  c.fillStyle = '#111';
  c.font = 'italic 52px Georgia, serif';
  c.fillText(cert, w / 2, 410);
  c.font = '500 26px monospace';
  c.textAlign = 'left';
  const rows = s === 'ok'
    ? ['Chip one-time code  ✓', 'Server signature    ✓', 'Founder signature   ✓', 'Record chain        ✓', 'Solana anchor       ✓']
    : ['No signal           —', 'Saved public keys   ✓', 'Server signature    ✓', 'Founder signature   ✓'];
  rows.forEach((r, i) => c.fillText(r, 70, 520 + i * 62));
  c.fillStyle = '#6B6862';
  c.font = '500 22px sans-serif';
  c.textAlign = 'center';
  c.fillText(s === 'ok' ? 'Checked on this phone just now' : 'Checked offline, on this phone', w / 2, h - 90);
}

export function makePhone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.5, 3.05, 0.16, 6, 0.2), new THREE.MeshStandardMaterial({ color: '#1C1C1C', roughness: 0.35, metalness: 0.4 }));
  const cv = document.createElement('canvas');
  cv.width = 540;
  cv.height = 1080;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 2.9), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.z = 0.082;
  g.add(body, screen);
  let last = '';
  const set = (s: Screen, cert: string) => {
    if (last === s + cert) return;
    last = s + cert;
    drawScreen(cv.getContext('2d')!, cv.width, cv.height, s, cert);
    tex.needsUpdate = true;
  };
  return { group: g, set };
}

// タップしたときに広がる電波の輪
export function makeRings(n = 3, color = '#111111') {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }));
    g.add(m);
  }
  const tick = (t: number, on: boolean) => {
    g.children.forEach((m, i) => {
      const k = (t * 0.8 + i / n) % 1;
      const s = 0.15 + k * 0.9;
      m.scale.set(s, s, s);
      ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = on ? (1 - k) * 0.8 : 0;
    });
  };
  return { group: g, tick };
}
