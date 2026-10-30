// MA-1 フライトジャケット（一般的な米軍型）の型紙を、数式で立体に組み立てる。単位はおよそ 10 cm。
// 胴（前・後ろ）・リブの裾・リブの襟・袖・リブの袖口・ファスナー・ポケットを、それぞれ閉じた面として作る。
import * as THREE from 'three';

export const M = {
  A: 3.0, // 胴の半幅
  B: 1.62, // 胴の半厚
  PN: 2.5, // 断面の角ばり
  Y0: -2.6, // 裾リブの上端
  RIB: 0.9, // 裾リブの高さ
  NX: 1.02, // 襟ぐりの半幅
  NZ: 0.92, // 襟ぐりの半奥行き
  NCZ: -0.22, // 襟ぐりの中心（少し後ろ）
  YN: 3.1, // 後ろ襟ぐりの高さ
  YS: 2.45, // 肩先の高さ
  CH: 0.72, // 襟リブの高さ
};

export const smooth = (a: number, b: number, t: number) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

export function grid(nu: number, nv: number, at: (u: number, v: number) => [number, number, number], flip: boolean, uvScale: [number, number] = [1, 1]) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const k = j * (nu + 1) + i;
    p.set(at(i / nu, j / nv), k * 3);
    uv[k * 2] = (i / nu) * uvScale[0];
    uv[k * 2 + 1] = (j / nv) * uvScale[1];
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 襟ぐり・肩線の高さ（front: 前身頃）
export const yTop = (x: number, front: boolean) => {
  const d = Math.abs(x);
  if (d < M.NX) return M.YN - (front ? 0.34 : 0.04) * (1 - (d / M.NX) ** 2);
  return M.YN - Math.min(1, (d - M.NX) / (M.A - M.NX)) * (M.YN - M.YS);
};
const zTop = (x: number, side: number) => {
  const d = Math.abs(x);
  if (d < M.NX) return M.NCZ + side * M.NZ * Math.sqrt(1 - (d / M.NX) ** 2);
  return M.NCZ * Math.max(0, 1 - (d - M.NX) / 0.9);
};
// 裾リブの上でふくらむ（ブラウジング）
const blouse = (y: number) => 0.89 + 0.17 * smooth(0, 0.38, y - M.Y0) - 0.06 * smooth(0.38, 1.6, y - M.Y0);

function torsoAt(c: number, s: number, v: number, side: 1 | -1, wr = true): [number, number, number] {
  const x0 = M.A * spow(c, 2 / M.PN);
  const y1 = yTop(x0, side > 0);
  const y = M.Y0 + (y1 - M.Y0) * v;
  const t = smooth(0.76, 1, v);
  const fb = blouse(y) * (1 - t) + t * 1;
  let x = x0 * fb * (1 - 0.035 * t);
  let z = side * M.B * fb * Math.pow(Math.abs(s), 2 / M.PN) * (1 - t) + t * zTop(x0, side);
  if (wr) {
    const low = Math.exp(-(y - M.Y0) * 2.0);
    const w =
      0.03 * Math.sin(x0 * 2.1 + y * 1.3) * Math.sin(y * 1.9 - x0 * 0.7) +
      0.045 * Math.sin(x0 * 4.6 + side * 0.8) * smooth(-1.8, 1.4, -y) * (1 - t) +
      0.06 * Math.sin(x0 * 10 + side * 2) * low;
    const nx = x / M.A, nz = (z - M.NCZ * t) / M.B;
    const nl = Math.hypot(nx, nz) || 1;
    x += (w * nx) / nl;
    z += (w * nz) / nl;
  }
  return [x, y, z];
}

export function torso(side: 1 | -1, flip: boolean) {
  return grid(150, 160, (u, v) => {
    const phi = u * Math.PI;
    return torsoAt(Math.cos(phi), Math.sin(phi), v, side);
  }, flip, [3, 3]);
}

// 胴の上の点と法線（ポケットやファスナーを置くため）。x0 は胴の基準幅での位置、y は高さ
export function torsoFrame(x0: number, y: number, side: 1 | -1) {
  const c = spow(THREE.MathUtils.clamp(x0 / M.A, -1, 1), M.PN / 2);
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  const v = (y - M.Y0) / (yTop(x0, side > 0) - M.Y0);
  const p = new THREE.Vector3(...torsoAt(c, s, v, side, false));
  const e = 0.01;
  const c2 = spow(THREE.MathUtils.clamp((x0 + e) / M.A, -1, 1), M.PN / 2);
  const px = new THREE.Vector3(...torsoAt(c2, Math.sqrt(Math.max(0, 1 - c2 * c2)), v, side, false));
  const py = new THREE.Vector3(...torsoAt(c, s, v + e, side, false));
  const tx = px.sub(p).normalize(), ty = py.sub(p).normalize();
  const n = new THREE.Vector3().crossVectors(tx, ty).normalize().multiplyScalar(side);
  return { p, n, tx, ty };
}

// リブ（裾・袖口）：筒。u は周、v は高さ
export function hemRib() {
  return grid(220, 14, (u, v) => {
    const phi = u * Math.PI * 2;
    const c = Math.cos(phi), s = Math.sin(phi);
    const k = 0.885 - 0.025 * (1 - v);
    const y = M.Y0 - M.RIB * (1 - v);
    return [M.A * k * spow(c, 2 / M.PN), y, M.B * 0.9 * k * spow(s, 2 / M.PN)];
  }, true, [70, 1]);
}

// 襟リブ：外側 → 折り返しの丸み → 内側。前中心で開いている（ファスナーで閉じる）
export function collar() {
  const gap = 0.05;
  return grid(200, 40, (u, t) => {
    const phi = Math.PI / 2 + gap + u * (Math.PI * 2 - 2 * gap);
    let off: number, h: number;
    const H = M.CH;
    if (t < 0.42) { off = 0.075; h = (t / 0.42) * H * 0.9; }
    else if (t < 0.58) { const a = ((t - 0.42) / 0.16) * Math.PI; off = 0.075 * Math.cos(a); h = H * 0.9 + 0.075 * Math.sin(a); }
    else { off = -0.075; h = (1 - (t - 0.58) / 0.42) * H * 0.9; }
    const c = Math.cos(phi), s = Math.sin(phi);
    const taper = 1 - 0.07 * (h / H);
    const front = s > 0;
    const hh = h * (front ? 0.86 : 1);
    const x = (M.NX * taper + off) * c;
    const z = M.NCZ + (M.NZ * taper + off) * s;
    return [x, yTop(M.NX * c, front) - 0.02 + hh, z];
  }, false, [60, 1]);
}

// 袖（付け根は胴の脇に沿った縦の輪 → 斜め下へ細くなる → 袖口の上でたまる）
export const SLV = { x: 2.55, y: 1.3, r: 1.22, rz: 1.3, ang: -1.0, len: 5.1 };
function sleeveFrame(side: 1 | -1) {
  const r0 = new THREE.Vector2(side * SLV.x, SLV.y);
  const ax = new THREE.Vector2(side * Math.cos(SLV.ang), Math.sin(SLV.ang));
  const r1 = r0.clone().add(ax.clone().multiplyScalar(SLV.len));
  let perp = new THREE.Vector2(-ax.y, ax.x);
  if (perp.y < 0) perp = perp.negate();
  return { r0, r1, ax, perp };
}
function sleeveAt(side: 1 | -1, u: number, v: number, wr = true): [number, number, number] {
  const { r0, r1, perp } = sleeveFrame(side);
  const phi = u * Math.PI * 2;
  const e = smooth(0, 0.35, v);
  const dir = new THREE.Vector2(0, 1).lerp(perp, e).normalize();
  const ctr = r0.clone().lerp(r1, v);
  let rin = SLV.r + (0.6 - SLV.r) * smooth(0, 0.9, v) + 0.07 * Math.exp(-(((v - 0.93) / 0.05) ** 2));
  let rz = SLV.rz + (0.55 - SLV.rz) * smooth(0, 0.9, v) - 0.2 * smooth(0, 0.25, v) * (1 - smooth(0.25, 0.9, v)) + 0.05 * Math.exp(-(((v - 0.93) / 0.05) ** 2));
  const c = Math.cos(phi), s = Math.sin(phi);
  if (wr) {
    const w =
      0.05 * Math.sin(v * 52 + side + c * 1.5) * smooth(0.6, 0.95, v) +
      0.035 * Math.sin(phi * 2 + v * 13) * smooth(0.25, 0.7, v) * (c < 0 ? 1 : 0.35) +
      0.02 * Math.sin(phi * 5 + v * 7);
    rin += w;
    rz += w;
  }
  const lift = c > 0 ? 1 : 0.94;
  return [ctr.x + dir.x * rin * c * lift, ctr.y + dir.y * rin * c * lift, rz * s];
}
export function sleeve(side: 1 | -1, flip: boolean) {
  return grid(120, 140, (u, v) => sleeveAt(side, u, v), flip, [3, 4]);
}
export function sleeveFrameAt(side: 1 | -1, u: number, v: number) {
  const p = new THREE.Vector3(...sleeveAt(side, u, v, false));
  const pu = new THREE.Vector3(...sleeveAt(side, u + 0.004, v, false));
  const pv = new THREE.Vector3(...sleeveAt(side, u, v + 0.004, false));
  const tu = pu.sub(p).normalize(), tv = pv.sub(p).normalize();
  const n = new THREE.Vector3().crossVectors(tu, tv).normalize();
  if (n.dot(new THREE.Vector3(p.x - sleeveFrame(side).r0.x * 0.5, 0, p.z)) < 0) n.negate();
  return { p, n, tv };
}
export function cuffRib(side: 1 | -1, flip: boolean) {
  const { r1, ax, perp } = sleeveFrame(side);
  const start = r1.clone().add(ax.clone().multiplyScalar(-0.12));
  return grid(120, 12, (u, v) => {
    const phi = u * Math.PI * 2;
    const ctr = start.clone().add(ax.clone().multiplyScalar(v * 0.78));
    const r = 0.53 - 0.06 * v, rz = 0.48 - 0.05 * v;
    return [ctr.x + perp.x * r * Math.cos(phi), ctr.y + perp.y * r * Math.cos(phi), rz * Math.sin(phi)];
  }, flip, [40, 1]);
}

// 前中心のファスナーが通る線（裾リブの下端から襟の上まで）
export function zipPath() {
  const pts: THREE.Vector3[] = [];
  const yTopFront = yTop(0, true);
  for (let i = 0; i <= 60; i++) {
    const y = M.Y0 - M.RIB + 0.02 + (i / 60) * (yTopFront + M.CH * 0.86 - (M.Y0 - M.RIB) - 0.05);
    let z: number;
    if (y < M.Y0) z = M.B * 0.9 * (0.885 - 0.025 * (1 - (y - (M.Y0 - M.RIB)) / M.RIB));
    else if (y <= yTopFront) {
      const v = (y - M.Y0) / (yTopFront - M.Y0);
      z = torsoAt(0, 1, v, 1, false)[2];
    } else z = M.NCZ + M.NZ * 0.95 + 0.075;
    pts.push(new THREE.Vector3(0, y, z + 0.03));
  }
  return new THREE.CatmullRomCurve3(pts);
}
