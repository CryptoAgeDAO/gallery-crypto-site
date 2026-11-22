// 服の形の3D（ふくらみ方式）：シルエットの内側を、縁からの距離に応じてふっくら持ち上げる。
// 前面は正面の絵、後面は背面の絵（左右を合わせて）を貼り、縁でぴったり閉じる。
// 胴は厚く、袖やフードは細いぶん薄く、と形から自然に決まるので、どんな形（フード・ポケット・パンツ）でも崩れない。
import * as THREE from 'three';
import type { Layer } from './GhostMannequin';
import type { GarmentInfo } from './garment3d';

type Box = { x0: number; y0: number; x1: number; y1: number; w: number; h: number };
function bbox(L: Layer): Box | null {
  let x0 = L.w, y0 = L.h, x1 = 0, y1 = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.mask[y * L.w + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < x0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const layerCanvas = (L: Layer) => { const t = document.createElement('canvas'); t.width = L.w; t.height = L.h; const tx = t.getContext('2d')!; const d = tx.createImageData(L.w, L.h); for (let i = 0; i < L.mask.length; i++) { d.data[i * 4] = L.data.data[i * 4]; d.data[i * 4 + 1] = L.data.data[i * 4 + 1]; d.data[i * 4 + 2] = L.data.data[i * 4 + 2]; d.data[i * 4 + 3] = L.mask[i]; } tx.putImageData(d, 0, 0); return t; };

// 前（左半分）と後ろ（右半分）。後ろは正面の枠に合わせて左右反転して描く（3Dで同じ位置に来る）
function atlas(F: Layer, fb: Box, B: Layer | null, size: number, backFrame = false) {
  const W = size, H = size, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  g.drawImage(layerCanvas(F), 0, 0, F.w, F.h, 0, 0, W / 2, H);
  // 後ろ：まず正面のシルエットを服の平均色で塗り（背面の絵がない所も布に見えるよう）、その上に背面の絵
  let r = 0, gg = 0, b = 0, n = 0; const S = B || F;
  for (let i = 0; i < S.mask.length; i += 7) if (S.mask[i] > 127) { r += S.data.data[i * 4]; gg += S.data.data[i * 4 + 1]; b += S.data.data[i * 4 + 2]; n++; }
  n = Math.max(1, n);
  const t = document.createElement('canvas'); t.width = F.w; t.height = F.h; const tx = t.getContext('2d')!;
  const d = tx.createImageData(F.w, F.h);
  for (let i = 0; i < F.mask.length; i++) { d.data[i * 4] = r / n; d.data[i * 4 + 1] = gg / n; d.data[i * 4 + 2] = b / n; d.data[i * 4 + 3] = F.mask[i]; }
  tx.putImageData(d, 0, 0);
  const bb = B ? bbox(B) : null;
  if (B && backFrame) { tx.save(); tx.globalCompositeOperation = 'source-atop'; tx.translate(2 * (fb.x0 + fb.w / 2), 0); tx.scale(-1, 1); tx.drawImage(layerCanvas(B), 0, 0); tx.restore(); }
  else if (B && bb) { tx.save(); tx.globalCompositeOperation = 'source-atop'; tx.translate(fb.x0 + fb.w, 0); tx.scale(-1, 1); tx.drawImage(layerCanvas(B), bb.x0, bb.y0, bb.w, bb.h, 0, fb.y0, fb.w, fb.h); tx.restore(); }
  g.drawImage(t, 0, 0, F.w, F.h, W / 2, 0, W / 2, H);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.userData.mimeType = 'image/png';
  return tex;
}

// backFrame：背面の絵が正面と同じ枠・同じ縮尺で描かれている（モックアップ）。そうでなければ背面の服の範囲を正面に合わせる
export function buildPillow(F: Layer, B: Layer | null, heightM: number, depth = 1, texSize = 2048, rowsMax = texSize <= 512 ? 110 : texSize <= 1024 ? 150 : 200, backFrame = false): { group: THREE.Group; info: GarmentInfo } | null {
  const fb = bbox(F); if (!fb) return null;
  const unit = heightM / fb.h; // 画素 → メートル
  const rows = Math.max(40, Math.min(rowsMax, fb.h)), step = fb.h / rows, cols = Math.ceil(fb.w / step) + 2;
  const NX = cols + 1, NY = rows + 3;
  const gx0 = fb.x0 - step, gy0 = fb.y0 - step;
  const M = (x: number, y: number) => { const xi = Math.round(x), yi = Math.round(y); return xi >= 0 && yi >= 0 && xi < F.w && yi < F.h && F.mask[yi * F.w + xi] > 127; };
  const ins = new Uint8Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) ins[j * NX + i] = M(gx0 + i * step, gy0 + j * step) ? 1 : 0;
  // 縁からの距離（面取り距離：1 と √2）
  const D = new Float32Array(NX * NY).fill(0);
  for (let k = 0; k < D.length; k++) D[k] = ins[k] ? 1e9 : 0;
  const s2 = Math.SQRT2;
  for (let j = 1; j < NY; j++) for (let i = 1; i < NX - 1; i++) { const k = j * NX + i; if (!ins[k]) continue; D[k] = Math.min(D[k], D[k - 1] + 1, D[k - NX] + 1, D[k - NX - 1] + s2, D[k - NX + 1] + s2); }
  for (let j = NY - 2; j >= 0; j--) for (let i = NX - 2; i >= 1; i--) { const k = j * NX + i; if (!ins[k]) continue; D[k] = Math.min(D[k], D[k + 1] + 1, D[k + NX] + 1, D[k + NX + 1] + s2, D[k + NX - 1] + s2); }
  let Dm = 0; for (let k = 0; k < D.length; k++) if (ins[k] && D[k] > Dm) Dm = D[k];
  // 縁（まわりに外がある点）
  const edge = new Uint8Array(NX * NY);
  for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) { const k = j * NX + i; if (ins[k] && (!ins[k - 1] || !ins[k + 1] || !ins[k - NX] || !ins[k + NX])) edge[k] = 1; }
  // 厚み：縁から中へ、なめらかにふくらむ（胴は厚く、袖・フードは薄く）
  const Z = new Float32Array(NX * NY);
  for (let k = 0; k < Z.length; k++) if (ins[k] && !edge[k]) Z[k] = 0.4 * depth * Math.sqrt(Math.max(0, D[k] - 0.5) * Dm) * step * unit;
  // 中央の稜線（距離の折れ目）が出ないよう、しっかりならす。縁は0のまま
  const passes = Math.round(rows / 8);
  for (let it = 0; it < passes; it++) { const Z2 = Z.slice(); for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) { const k = j * NX + i; if (!ins[k] || edge[k]) continue; const nb = [k - 1, k + 1, k - NX, k + NX, k - NX - 1, k - NX + 1, k + NX - 1, k + NX + 1]; let sum = Z[k] * 2, c = 2; for (const q of nb) if (ins[q]) { sum += Z[q]; c++; } Z2[k] = Math.max(Z[k] * 0.9, sum / c); } Z.set(Z2); }
  // 縁の点の位置をならす（ギザギザを減らす）
  const PXs = new Float32Array(NX * NY), PYs = new Float32Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { PXs[j * NX + i] = gx0 + i * step; PYs[j * NX + i] = gy0 + j * step; }
  for (let it = 0; it < 2; it++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
    const k = j * NX + i; if (!edge[k]) continue; let sx = 0, sy = 0, c = 0;
    for (const o of [-NX - 1, -NX, -NX + 1, -1, 1, NX - 1, NX, NX + 1]) if (edge[k + o]) { sx += PXs[k + o]; sy += PYs[k + o]; c++; }
    if (c >= 2) { PXs[k] = PXs[k] * 0.5 + (sx / c) * 0.5; PYs[k] = PYs[k] * 0.5 + (sy / c) * 0.5; }
  }
  // 布らしいゆるい起伏
  const wob = (x: number, y: number) => { const u = (x - fb.x0) / fb.w, v = (y - fb.y0) / fb.h; return 1 + (0.02 + 0.05 * v) * Math.sin(u * Math.PI * 9 + 0.8 * Math.sin(v * 5)) + 0.025 * Math.sin(v * Math.PI * 3 + u * 2); }; // 縦に落ちるゆるいしわ（裾ほど深い）
  const cxp = fb.x0 + fb.w / 2;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const vid = new Int32Array(NX * NY * 2).fill(-1);
  for (let side = 0; side < 2; side++) for (let k = 0; k < NX * NY; k++) {
    if (!ins[k]) continue;
    const px = PXs[k], py = PYs[k], z = Z[k] * wob(px, py) * (side ? -1 : 1);
    vid[side * NX * NY + k] = pos.length / 3;
    pos.push((px - cxp) * unit, (fb.y1 - py) * unit, z);
    const u = Math.min(1, Math.max(0, px / F.w)), v = Math.min(1, Math.max(0, py / F.h));
    uv.push(side ? 0.5 + u * 0.5 : u * 0.5, 1 - v);
  }
  for (let side = 0; side < 2; side++) for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const o = side * NX * NY, a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
    const ia = vid[o + a], ib = vid[o + b], ic = vid[o + c], id = vid[o + d];
    const tri = (p: number, q: number, r: number) => { if (p < 0 || q < 0 || r < 0) return; if (side) idx.push(p, r, q); else idx.push(p, q, r); };
    const n = (ia >= 0 ? 1 : 0) + (ib >= 0 ? 1 : 0) + (ic >= 0 ? 1 : 0) + (id >= 0 ? 1 : 0);
    if (n === 4) { tri(ia, ic, ib); tri(ib, ic, id); }
    else if (n === 3) { if (ia < 0) tri(ib, ic, id); else if (ib < 0) tri(ia, ic, id); else if (ic < 0) tri(ia, id, ib); else tri(ia, ic, ib); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const tex = atlas(F, fb, B, texSize, backFrame);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.3, roughness: 0.9, side: THREE.DoubleSide }));
  mesh.name = 'garment';
  const group = new THREE.Group(); group.add(mesh);
  return { group, info: { sleeves: 2, armpit: true } };
}
