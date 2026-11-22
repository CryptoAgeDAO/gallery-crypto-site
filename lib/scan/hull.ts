// 3Dキャプチャ：服のまわりを一周して撮った写真（それぞれの向き＋服の形）から、立体を彫り出す（ビジュアルハル）。
//   1) 各写真の服の形を、高さをそろえて正規化（服の高さ＝1）
//   2) 箱いっぱいの小さな立方体（ボクセル）を、どの向きから見ても服の形の内側にあるものだけ残す
//   3) 残った形の表面を、なめらかな三角形の面にする（サーフェスネッツ）
//   4) 色は、その面がよく見えている写真から投影して貼る（表示はシェーダー、書き出しは頂点の色）
// 向きは、スマホの向きのセンサー（ジャイロ・方位）から。センサーがないときは一周を等間隔とみなす。
import * as THREE from 'three';

export type View = { img: HTMLCanvasElement; mask: Uint8ClampedArray; w: number; h: number; phi: number };
type Norm = { x0: number; y0: number; x1: number; y1: number; cx: number; H: number };

export function normOf(v: View): Norm | null {
  let x0 = v.w, y0 = v.h, x1 = -1, y1 = -1, sx = 0, n = 0;
  for (let y = 0; y < v.h; y += 2) for (let x = 0; x < v.w; x += 2) if (v.mask[y * v.w + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; sx += x; n++; }
  if (n < 50 || y1 <= y0) return null;
  // 回転の軸：胴のあたり（上から30〜60%）の左右の端の中央。袖や裾の広がりに引っぱられにくい
  const H = y1 - y0 + 1; let bl = 0, br = 0, c = 0;
  for (let y = Math.round(y0 + H * 0.3); y < y0 + H * 0.6; y += 2) { let l = -1, r = -1; for (let x = 0; x < v.w; x++) if (v.mask[y * v.w + x] > 127) { if (l < 0) l = x; r = x; } if (l >= 0) { bl += l; br += r; c++; } }
  void sx;
  return { x0, y0, x1, y1, cx: c ? (bl + br) / (2 * c) : (x0 + x1) / 2, H };
}

// 形の内側か（少し太らせて、向きのずれに強くする）
function dilated(v: View, r: number) {
  if (r <= 0) return v.mask;
  const W = v.w, H = v.h, a = new Uint8ClampedArray(W * H), b = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) { let last = -1e9; for (let x = 0; x < W; x++) { if (v.mask[y * W + x] > 127) last = x; a[y * W + x] = x - last <= r ? 255 : 0; } last = 1e9; for (let x = W - 1; x >= 0; x--) { if (v.mask[y * W + x] > 127) last = x; if (last - x <= r) a[y * W + x] = 255; } }
  for (let x = 0; x < W; x++) { let last = -1e9; for (let y = 0; y < H; y++) { if (a[y * W + x]) last = y; b[y * W + x] = y - last <= r ? 255 : 0; } last = 1e9; for (let y = H - 1; y >= 0; y--) { if (a[y * W + x]) last = y; if (last - y <= r) b[y * W + x] = 255; } }
  return b;
}

export type Hull = { field: Float32Array; nx: number; ny: number; nz: number; R: number; cell: number; views: { v: View; n: Norm }[] };

export function carve(views: View[], res = 96): Hull | null {
  const vs = views.map((v) => ({ v, n: normOf(v) })).filter((x): x is { v: View; n: Norm } => !!x.n);
  if (vs.length < 2) return null;
  let R = 0.2; for (const { n } of vs) R = Math.max(R, (n.cx - n.x0) / n.H, (n.x1 - n.cx) / n.H);
  R *= 1.06;
  const cell = 1 / res, ny = res + 4, nx = Math.ceil((2 * R) / cell) + 4, nz = nx;
  const ms = vs.map(({ v, n }) => dilated(v, Math.max(1, Math.round(n.H * 0.006))));
  const miss = Math.max(1, Math.round(vs.length * 0.08));
  const occ = new Float32Array(nx * ny * nz);
  const cs = vs.map(({ v }) => Math.cos(v.phi)), sn = vs.map(({ v }) => Math.sin(v.phi));
  for (let k = 0; k < nz; k++) { const z = (k - nz / 2 + 0.5) * cell; for (let j = 0; j < ny; j++) { const y = (j - 2 + 0.5) * cell; for (let i = 0; i < nx; i++) {
    const x = (i - nx / 2 + 0.5) * cell; let bad = 0;
    for (let t = 0; t < vs.length && bad <= miss; t++) {
      const { v, n } = vs[t], u = x * cs[t] - z * sn[t];
      const px = Math.round(n.cx + u * n.H), py = Math.round(n.y0 + (1 - y) * n.H);
      if (px < 0 || py < 0 || px >= v.w || py >= v.h || ms[t][py * v.w + px] < 128) bad++;
    }
    if (bad <= miss) occ[i + nx * (j + ny * k)] = 1;
  } } }
  // なめらかに（3方向に1-2-1）
  const blur = (f: Float32Array) => {
    const g = new Float32Array(f.length);
    const ax = (s: number, n: number) => { g.fill(0); for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const id = i + nx * (j + ny * k); let a = f[id] * 2, c = 2; const ii = [i, j, k][n]; const lim = [nx, ny, nz][n]; if (ii > 0) { a += f[id - s]; c++; } if (ii < lim - 1) { a += f[id + s]; c++; } g[id] = a / c; } f.set(g); };
    ax(1, 0); ax(nx, 1); ax(nx * ny, 2);
  };
  blur(occ); blur(occ); blur(occ);
  return { field: occ, nx, ny, nz, R, cell, views: vs };
}

// サーフェスネッツ：0.5 の等値面を三角形に
export function surface(h: Hull, smooth = 2) {
  const { field: f, nx, ny, nz, cell } = h, iso = 0.5;
  const at = (i: number, j: number, k: number) => f[i + nx * (j + ny * k)];
  const wx = (i: number) => (i - nx / 2 + 0.5) * cell, wy = (j: number) => (j - 2 + 0.5) * cell, wz = (k: number) => (k - nz / 2 + 0.5) * cell;
  const cellIdx = new Int32Array(nx * ny * nz).fill(-1), pos: number[] = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v = C.map(([a, b, c]) => at(i + a, j + b, k + c));
    let inside = 0; for (const q of v) if (q > iso) inside++;
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) { const va = v[a], vb = v[b]; if ((va > iso) === (vb > iso)) continue; const t = (iso - va) / (vb - va); sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++; }
    cellIdx[i + nx * (j + ny * k)] = pos.length / 3;
    pos.push(wx(i + sx / n), wy(j + sy / n), wz(k + sz / n));
  }
  const idx: number[] = [];
  const ci = (i: number, j: number, k: number) => cellIdx[i + nx * (j + ny * k)];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const s0 = at(i, j, k) > iso;
    if (s0 !== (at(i + 1, j, k) > iso)) quad(ci(i, j - 1, k - 1), ci(i, j, k - 1), ci(i, j, k), ci(i, j - 1, k), !s0);
    if (s0 !== (at(i, j + 1, k) > iso)) quad(ci(i - 1, j, k - 1), ci(i - 1, j, k), ci(i, j, k), ci(i, j, k - 1), !s0);
    if (s0 !== (at(i, j, k + 1) > iso)) quad(ci(i - 1, j - 1, k), ci(i, j - 1, k), ci(i, j, k), ci(i - 1, j, k), !s0);
  }
  // 面の向き：外側（値が小さくなる方）へ。ずれていたら全体を裏返す
  const P = new Float32Array(pos);
  let agree = 0;
  for (let t = 0; t < idx.length; t += 3 * 7) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nxx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nzz = ux * vy - uy * vx;
    const mx = (P[a] + P[b] + P[c]) / 3, my = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, mz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
    const toI = (x: number, o: number) => Math.round(x / cell + o / 2 - 0.5);
    const i = Math.max(1, Math.min(nx - 2, toI(mx, nx))), j = Math.max(1, Math.min(ny - 2, Math.round(my / cell + 2 - 0.5))), k = Math.max(1, Math.min(nz - 2, toI(mz, nz)));
    const gx = at(i + 1, j, k) - at(i - 1, j, k), gy = at(i, j + 1, k) - at(i, j - 1, k), gz = at(i, j, k + 1) - at(i, j, k - 1);
    agree += nxx * gx + nyy * gy + nzz * gz < 0 ? 1 : -1;
  }
  if (agree < 0) for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
  // ならし（ラプラシアン）
  if (smooth) {
    const nb: number[][] = Array.from({ length: P.length / 3 }, () => []);
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3]; nb[a].push(b); nb[b].push(a); }
    for (let it = 0; it < smooth; it++) { const Q = P.slice(); for (let v = 0; v < nb.length; v++) { const L = nb[v]; if (!L.length) continue; let x = 0, y = 0, z = 0; for (const q of L) { x += P[q * 3]; y += P[q * 3 + 1]; z += P[q * 3 + 2]; } Q[v * 3] = P[v * 3] * 0.5 + (x / L.length) * 0.5; Q[v * 3 + 1] = P[v * 3 + 1] * 0.5 + (y / L.length) * 0.5; Q[v * 3 + 2] = P[v * 3 + 2] * 0.5 + (z / L.length) * 0.5; } P.set(Q); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// 投影の重みで、表示に使う写真を最大8枚えらぶ（向きがばらけるように）
function pickViews(h: Hull, max = 8) {
  const vs = h.views; if (vs.length <= max) return vs;
  const out: typeof vs = [];
  for (let k = 0; k < max; k++) { const tgt = (k / max) * Math.PI * 2; let best = vs[0], bd = 9; for (const v of vs) { const d = Math.abs(Math.atan2(Math.sin(v.v.phi - tgt), Math.cos(v.v.phi - tgt))); if (d < bd && !out.includes(v)) { bd = d; best = v; } } out.push(best); }
  return out;
}
// 縁は背景の色が混じりやすいので、少し内側だけを使う
function eroded(v: View, r: number) { const inv: View = { ...v, mask: v.mask.map((x) => (x > 127 ? 0 : 255)) as Uint8ClampedArray }; const d = dilated(inv, r); return d.map((x) => (x ? 0 : 255)) as Uint8ClampedArray; }
const maskedCanvas = (v: View, r = 0) => { const m = r ? eroded(v, r) : v.mask; const c = document.createElement('canvas'); c.width = v.w; c.height = v.h; const g = c.getContext('2d')!; g.drawImage(v.img, 0, 0); const d = g.getImageData(0, 0, v.w, v.h); for (let i = 0; i < m.length; i++) d.data[i * 4 + 3] = m[i]; g.putImageData(d, 0, 0); return c; };

// 写真を投影して貼った立体（表示用）＋頂点の色（書き出し用）
export function hullMesh(h: Hull, geo: THREE.BufferGeometry, maxTex = 1024) {
  const vs = pickViews(h);
  const texs = vs.map(({ v, n }) => { const c = maskedCanvas(v, Math.max(2, Math.round(n.H * 0.012))), k = Math.min(1, maxTex / Math.max(c.width, c.height)); let src = c; if (k < 1) { src = document.createElement('canvas'); src.width = Math.round(c.width * k); src.height = Math.round(c.height * k); src.getContext('2d')!.drawImage(c, 0, 0, src.width, src.height); } const t = new THREE.CanvasTexture(src); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
  // 頂点の色（どの写真から取るかは面の向きで）
  const P = geo.attributes.position.array as Float32Array, N = geo.attributes.normal.array as Float32Array, col = new Float32Array(P.length);
  const datas = h.views.map(({ v }) => v.img.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, v.w, v.h).data);
  const ems = h.views.map(({ v, n }) => eroded(v, Math.max(2, Math.round(n.H * 0.012))));
  for (let i = 0; i < P.length / 3; i++) {
    let r = 0, g = 0, b = 0, ws = 0;
    h.views.forEach(({ v, n }, t) => {
      const dx = Math.sin(v.phi), dz = Math.cos(v.phi), w0 = N[i * 3] * dx + N[i * 3 + 2] * dz; if (w0 <= 0.05) return;
      const u = P[i * 3] * Math.cos(v.phi) - P[i * 3 + 2] * Math.sin(v.phi), px = Math.round(n.cx + u * n.H), py = Math.round(n.y0 + (1 - P[i * 3 + 1]) * n.H);
      if (px < 0 || py < 0 || px >= v.w || py >= v.h || ems[t][py * v.w + px] < 128) return;
      const w = w0 ** 4, d = datas[t], q = (py * v.w + px) * 4; r += d[q] * w; g += d[q + 1] * w; b += d[q + 2] * w; ws += w;
    });
    const s = ws > 0 ? 1 / (ws * 255) : 0; col[i * 3] = ws ? (r * s) ** 2.2 : 0.5; col[i * 3 + 1] = ws ? (g * s) ** 2.2 : 0.5; col[i * 3 + 2] = ws ? (b * s) ** 2.2 : 0.5;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.88, vertexColors: true, side: THREE.DoubleSide });
  // シェーダー：写真を直接投影してくっきり（頂点の色はその下地）
  const U = vs.map(({ v, n }) => new THREE.Vector4(Math.cos(v.phi), Math.sin(v.phi), n.cx / v.w, n.H / v.w));
  const U2 = vs.map(({ v, n }) => new THREE.Vector2(n.y0 / v.h, n.H / v.h));
  mat.onBeforeCompile = (sh) => {
    vs.forEach((_, k) => { sh.uniforms[`pt${k}`] = { value: texs[k] }; });
    sh.uniforms.pA = { value: U }; sh.uniforms.pB = { value: U2 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
    let frag = `uniform vec4 pA[${vs.length}]; uniform vec2 pB[${vs.length}];\n` + vs.map((_, k) => `uniform sampler2D pt${k};`).join('\n') + '\nvarying vec3 vOP; varying vec3 vON;\n';
    let body = 'vec4 acc = vec4(0.0); vec3 nn = normalize(vON);\n';
    vs.forEach((_, k) => { body += `{ vec4 a = pA[${k}]; vec2 b = pB[${k}]; float w = max(0.0, nn.x * a.y + nn.z * a.x); w = w*w*w*w; float u = vOP.x * a.x - vOP.z * a.y; vec2 uv = vec2(a.z + u * a.w, 1.0 - (b.x + (1.0 - vOP.y) * b.y)); vec4 c = texture2D(pt${k}, uv); if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) c.a = 0.0; acc += vec4(c.rgb * c.a, c.a) * w; }\n`; });
    body += 'if (acc.a > 0.0005) diffuseColor.rgb = acc.rgb / acc.a;\n';
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + frag).replace('#include <color_fragment>', '#include <color_fragment>\n' + body);
  };
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'scan';
  return { mesh, dispose: () => { texs.forEach((t) => t.dispose()); mat.dispose(); geo.dispose(); } };
}

// 書き出し用（頂点の色だけ）
export function exportable(mesh: THREE.Mesh) {
  const m = new THREE.Mesh(mesh.geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  m.scale.copy(mesh.scale); m.position.copy(mesh.position); return m;
}
