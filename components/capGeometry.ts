// キャップの型紙を立体に組み立てる（パネル・つば・天ボタン・アイレット・スベリ・ストラップ）。単位はおよそ 3 cm。
import * as THREE from 'three';

export type CapStyle = 'structured' | 'dad' | 'trucker' | 'five';
export type CapSpec = {
  style: CapStyle;
  crown: string; // 本体の生地の色
  front?: string; // トラッカーの前パネル（フォーム）
  mesh?: string; // トラッカーのメッシュ
  brim: string;
  under: string; // つばの裏
  thread: string;
  accent: string;
  art: string;
  fabric: 'twill' | 'cord' | 'canvas';
  print?: boolean; // 刺繍ではなくプリント
  closure: 'snap' | 'strap';
};

export const smooth = (a: number, b: number, t: number) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
const TAU = Math.PI * 2;

export function dims(s: CapStyle) {
  return {
    rx: 2.92,
    rz: 3.22,
    H: s === 'dad' ? 2.75 : s === 'five' ? 2.85 : 3.3,
    brimL: s === 'five' ? 2.55 : 2.45,
    curve: s === 'five' ? 0.1 : s === 'trucker' ? 0.42 : 0.55,
    archT: 0.34,
    archW: 0.42,
  };
}

// パネルの縫い目の角度（0 = 前中心、時計回りに +）
export function seams(s: CapStyle) {
  if (s === 'trucker' || s === 'five') return [-60, 60, 130, 180, 230, 300].map((d) => (d * Math.PI) / 180);
  return [0, 60, 120, 180, 240, 300, 360].map((d) => (d * Math.PI) / 180);
}

// 帽体の面上の点。th: 角度、t: 0（ふち）→ 1（てっぺん）、u: パネル内の位置（ふくらみ用）
export function crownAt(s: CapStyle, th: number, t: number, u = 0.5, puffOn = true): THREE.Vector3 {
  const d = dims(s);
  const c = Math.cos(th), sn = Math.sin(th);
  const rho = Math.pow(Math.max(0, Math.cos((t * Math.PI) / 2)), s === 'five' ? 0.55 : 0.72);
  let h = Math.pow(Math.sin((t * Math.PI) / 2), 0.95) * d.H;
  let r = 1;
  const front = Math.max(0, c);
  if (s === 'structured' || s === 'trucker') r *= 1 + 0.07 * Math.sin(t * Math.PI) * front * front;
  if (s === 'dad') r *= 1 - 0.07 * front * Math.pow(t, 1.4);
  if (s === 'five') { r *= 1 + 0.05 * Math.sin(t * Math.PI) * front; h *= 1 - 0.05 * front * t; }
  h *= 1 - 0.06 * Math.max(0, -c) * t;
  if (puffOn) r *= 1 + (s === 'dad' ? 0.045 : 0.032) * Math.sin(Math.PI * u) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.8);
  return new THREE.Vector3(d.rx * sn * rho * r, h, d.rz * c * rho * r - 0.18 * t * t);
}

export function crownFrame(s: CapStyle, th: number, t: number) {
  const p = crownAt(s, th, t, 0.5, false);
  const a = crownAt(s, th + 0.002, t, 0.5, false).sub(p);
  const b = crownAt(s, th, t + 0.002, 0.5, false).sub(p);
  const n = new THREE.Vector3().crossVectors(a, b).normalize();
  if (n.dot(p.clone().setY(p.y - dims(s).H * 0.3)) < 0) n.negate();
  return { p, n, up: b.normalize() };
}

function build(nu: number, nv: number, at: (u: number, v: number) => THREE.Vector3, flip: boolean, uv?: (p: THREE.Vector3, u: number, v: number) => [number, number]) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uvs = new Float32Array((nu + 1) * (nv + 1) * 2);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const k = j * (nu + 1) + i;
    const p = at(i / nu, j / nv);
    pos.set([p.x, p.y, p.z], k * 3);
    const q = uv ? uv(p, i / nu, j / nv) : [i / nu, j / nv];
    uvs[k * 2] = q[0];
    uvs[k * 2 + 1] = q[1];
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 後ろの開き（アーチ）の高さ
export const archBase = (s: CapStyle, th: number) => {
  const d = dims(s);
  const x = (Math.atan2(Math.sin(th - Math.PI), Math.cos(th - Math.PI))) / d.archW;
  return Math.abs(x) < 1 ? d.archT * Math.sqrt(1 - x * x) : 0;
};

export type Panel = { geo: THREE.BufferGeometry; a: number; b: number; zone: 'front' | 'side' | 'back' };
export function panels(s: CapStyle): Panel[] {
  const d = dims(s);
  const sm = seams(s);
  const out: Panel[] = [];
  for (let i = 0; i < sm.length - 1; i++) {
    const a = sm[i], b = sm[i + 1];
    const mid = (a + b) / 2;
    const cm = Math.cos(mid);
    const zone: Panel['zone'] = cm > 0.45 ? 'front' : cm < -0.6 ? 'back' : 'side';
    const geo = build(48, 64, (u, v) => {
      const th = a + (b - a) * u;
      const t0 = archBase(s, th);
      const t = t0 + (1 - t0) * v;
      return crownAt(s, th, t, u);
    }, true, (p) =>
      // 前・後ろの刺繍は正面（後ろは背面）から投影
      zone === 'back' ? [0.5 - p.x / (2 * d.rx), p.y / d.H] : [0.5 + p.x / (2 * d.rx), p.y / d.H],
    );
    out.push({ geo, a, b, zone });
  }
  return out;
}

// つば：上面・下面・ふち
export function brim(s: CapStyle) {
  const d = dims(s);
  const TB = 1.42;
  // 前へ張り出す D 字形：内側は帽体のふち、外側は前方へ押し出した線
  const at = (u: number, k: number, dy: number) => {
    const th = -TB + 2 * TB * u;
    const P = new THREE.Vector3(d.rx * Math.sin(th), 0, d.rz * Math.cos(th));
    const f = Math.pow(Math.max(0, Math.cos((th / TB) * (Math.PI / 2))), 0.75);
    const Q = new THREE.Vector3(P.x * (1 + 0.06 * f), 0, P.z + d.brimL * f);
    const q = P.lerp(Q, k);
    q.y = -d.curve * Math.pow(q.x / (d.rx + 0.4), 2) * Math.min(1, k * 1.4) - 0.16 * k + dy;
    return q;
  };
  const T = 0.045;
  const top = build(120, 24, (u, v) => at(u, v, T), false, (p) => [p.x / 7 + 0.5, p.z / 7]);
  const bottom = build(120, 24, (u, v) => at(u, v, -T), true, (p) => [p.x / 7 + 0.5, p.z / 7]);
  const edge = build(120, 2, (u, v) => at(u, 1, T - 2 * T * v), true);
  const rows = [0.24, 0.36, 0.48, 0.6, 0.72, 0.84].map((k) =>
    new THREE.CatmullRomCurve3(Array.from({ length: 61 }, (_, i) => at(0.04 + 0.92 * (i / 60), k, T + 0.006))),
  );
  return { top, bottom, edge, rows, at };
}

// スベリ（内側の汗止めテープ）
export function sweatband(s: CapStyle) {
  const d = dims(s);
  const a0 = -(Math.PI - d.archW - 0.05), a1 = Math.PI - d.archW - 0.05;
  return build(160, 4, (u, v) => {
    const th = a0 + (a1 - a0) * u;
    const p = crownAt(s, th, 0.02 + v * 0.16, 0.5, false);
    return new THREE.Vector3(p.x * 0.975, v * 0.5 + 0.01, p.z * 0.975);
  }, false);
}

// 後ろのストラップ（アーチの下を渡る）
export function strap(s: CapStyle) {
  const d = dims(s);
  const a0 = Math.PI - d.archW - 0.22, a1 = Math.PI + d.archW + 0.22;
  const geo = build(60, 2, (u, v) => {
    const th = a0 + (a1 - a0) * u;
    const p = crownAt(s, th, 0.03, 0.5, false);
    return new THREE.Vector3(p.x * 1.012, 0.05 + v * 0.3, p.z * 1.012);
  }, false);
  const studs = Array.from({ length: 7 }, (_, i) => {
    const th = Math.PI - d.archW * 0.75 + (i / 6) * d.archW * 1.5;
    const p = crownAt(s, th, 0.03, 0.5, false);
    return new THREE.Vector3(p.x * 1.03, 0.2, p.z * 1.03);
  });
  return { geo, studs };
}

export function seamCurve(s: CapStyle, th: number, off: number) {
  const pts: THREE.Vector3[] = [];
  const t0 = archBase(s, th + off);
  for (let i = 0; i <= 50; i++) {
    const t = t0 + (0.985 - t0) * (i / 50);
    const f = crownFrame(s, th + off, t);
    pts.push(f.p.add(f.n.multiplyScalar(0.012)));
  }
  return new THREE.CatmullRomCurve3(pts);
}

export const angleNorm = (a: number) => ((a % TAU) + TAU) % TAU;
