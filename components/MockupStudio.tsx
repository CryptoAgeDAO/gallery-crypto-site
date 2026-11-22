'use client';
// モックアップ：服の形を「採寸の数字」から描き、実物どおりの大きさで3Dにする。
//   形と寸法：Tシャツ／長袖／パーカー／スウェット／パンツ／ショーツ、またはスキャンした服。着丈・身幅・肩幅・袖丈…を0.5cm単位で直す
//   素材：色と質感（ジャージー・フリース・デニム・キャンバス・ナイロン・コーデュロイ）。写真から色を拾う／質感を使う／AI（CLIP・この端末内）で素材を判定
//   プリント：画像や文字を、正面・背中の好きな位置と大きさ・角度で。ドラッグで動かせる
//   保存：ショップ・レール・ショールームに、この大きさのまま並ぶ（この端末に保存）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildGarment } from './garment3d';
import type { Layer } from './GhostMannequin';
import { tt } from './Lang';
import { isPhone } from '@/lib/device';

type Kind = 'tee' | 'ls' | 'hoodie' | 'crew' | 'pants' | 'shorts' | 'scan';
type Fabric = 'jersey' | 'fleece' | 'denim' | 'canvas' | 'nylon' | 'corduroy' | 'image';
type Side = 'front' | 'back';
type Print = { id: string; type: 'image' | 'text'; side: Side; src?: string; text?: string; font: 'sans' | 'serif' | 'mono'; color: string; x: number; y: number; w: number; rot: number; opacity: number; crack: boolean };
type M = Record<string, number>;

const PX = 8; // 1cm = 8px（描画の解像度）
const TOPS: Kind[] = ['tee', 'ls', 'hoodie', 'crew'];
const DEF: Record<Exclude<Kind, 'scan'>, M> = {
  tee: { length: 72, chest: 56, shoulder: 50, sleeve: 22, sleeveOpen: 19, hem: 56, neck: 19 },
  ls: { length: 71, chest: 55, shoulder: 49, sleeve: 62, sleeveOpen: 10, hem: 55, neck: 18 },
  hoodie: { length: 70, chest: 60, shoulder: 56, sleeve: 61, sleeveOpen: 11, hem: 54, neck: 20 },
  crew: { length: 68, chest: 58, shoulder: 54, sleeve: 60, sleeveOpen: 11, hem: 52, neck: 19 },
  pants: { waist: 40, hip: 54, rise: 32, inseam: 80, thigh: 31, hemW: 26 },
  shorts: { waist: 41, hip: 56, rise: 31, inseam: 19, thigh: 33, hemW: 31 },
};
const LABEL: Record<string, [string, string]> = {
  length: ['Length', '着丈'], chest: ['Chest (flat)', '身幅'], shoulder: ['Shoulder', '肩幅'], sleeve: ['Sleeve', '袖丈'], sleeveOpen: ['Sleeve opening', '袖口幅'], hem: ['Hem (flat)', '裾幅'], neck: ['Neck width', '襟ぐり幅'],
  waist: ['Waist (flat)', 'ウエスト'], hip: ['Hip (flat)', 'ヒップ'], rise: ['Rise', '股上'], inseam: ['Inseam', '股下'], thigh: ['Thigh (flat)', 'わたり幅'], hemW: ['Leg opening', '裾幅'],
};
const KINDS: [Kind, string, string][] = [['tee', 'T-shirt', 'Tシャツ'], ['ls', 'Longsleeve', '長袖'], ['hoodie', 'Hoodie', 'パーカー'], ['crew', 'Sweatshirt', 'スウェット'], ['pants', 'Pants', 'パンツ'], ['shorts', 'Shorts', 'ショーツ'], ['scan', 'From a scan', 'スキャンから']];
const FABRICS: [Fabric, string, string][] = [['jersey', 'Cotton jersey', '綿ジャージー'], ['fleece', 'Fleece', 'フリース'], ['denim', 'Denim', 'デニム'], ['canvas', 'Canvas', 'キャンバス'], ['nylon', 'Nylon', 'ナイロン'], ['corduroy', 'Corduroy', 'コーデュロイ']];
const COLORS = ['#141416', '#f4f3ef', '#e8e3d6', '#8f8c86', '#1d2740', '#2e3f66', '#4b5236', '#5b1a22', '#6a5442', '#c8b896', '#d7a2a8', '#4e6583'];
// サイズの目安（Mを基準に、身幅・着丈などを足し引き）
const GRADE: Record<string, number> = { S: -1, M: 0, L: 1, XL: 2 };

// ---- 布の質感（小さな模様を描いて敷き詰める） ----
function fabricTile(f: Fabric, img?: HTMLImageElement | null): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d')!;
  g.clearRect(0, 0, 96, 96);
  if (f === 'image' && img) { const s = Math.min(img.naturalWidth, img.naturalHeight) * 0.5; g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 96, 96); return c; }
  let sd = 7; const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const dot = (a: number) => `rgba(0,0,0,${a})`, lit = (a: number) => `rgba(255,255,255,${a})`;
  if (f === 'jersey') { for (let x = 0; x < 96; x += 3) { g.fillStyle = dot(0.06); g.fillRect(x, 0, 1, 96); } for (let y = 0; y < 96; y += 4) for (let x = 0; x < 96; x += 3) { g.fillStyle = lit(0.05); g.fillRect(x + 1, y, 1, 2); } }
  if (f === 'fleece') for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? dot(0.07) : lit(0.07); g.fillRect(r() * 96, r() * 96, 2, 2); }
  if (f === 'denim') { for (let k = -96; k < 96; k += 3) { g.strokeStyle = dot(0.14); g.lineWidth = 1; g.beginPath(); g.moveTo(k, 96); g.lineTo(k + 96, 0); g.stroke(); } for (let i = 0; i < 300; i++) { g.fillStyle = lit(0.09); g.fillRect(r() * 96, r() * 96, 1, 3); } }
  if (f === 'canvas') { for (let x = 0; x < 96; x += 4) { g.fillStyle = dot(0.08); g.fillRect(x, 0, 1, 96); } for (let y = 0; y < 96; y += 4) { g.fillStyle = dot(0.08); g.fillRect(0, y, 96, 1); } }
  if (f === 'nylon') { const gr = g.createLinearGradient(0, 0, 96, 96); gr.addColorStop(0, lit(0.12)); gr.addColorStop(0.5, lit(0)); gr.addColorStop(1, lit(0.08)); g.fillStyle = gr; g.fillRect(0, 0, 96, 96); for (let y = 0; y < 96; y += 6) { g.fillStyle = dot(0.03); g.fillRect(0, y, 96, 1); } }
  if (f === 'corduroy') for (let x = 0; x < 96; x += 6) { const gr = g.createLinearGradient(x, 0, x + 6, 0); gr.addColorStop(0, dot(0.18)); gr.addColorStop(0.5, lit(0.12)); gr.addColorStop(1, dot(0.18)); g.fillStyle = gr; g.fillRect(x, 0, 6, 96); }
  return c;
}

// ---- 採寸の数字 → 服の外形（cm、肩の一番高いところの中心が原点） ----
type Pt = [number, number];
function outline(kind: Kind, m: M, side: Side): { pts: Pt[]; neck?: { w: number; drop: number }; hood?: boolean } {
  if (kind === 'pants' || kind === 'shorts') {
    const { waist: W, hip: Hp, rise: R, inseam: I, hemW: Hw, thigh: T } = m;
    const cx = Hp / 4 + (kind === 'pants' ? 1.5 : 1), hemY = R + I;
    const thighOut = Math.max(Hp / 2, cx + T / 2);
    const right: Pt[] = [[W / 2, 0], [Hp / 2, R * 0.62], [thighOut, R + 2], [cx + Hw / 2, hemY], [Math.max(0.8, cx - Hw / 2), hemY], [0.6, R + 1.5]];
    const left = right.slice().reverse().map(([x, y]) => [-x, y] as Pt);
    return { pts: [...right, [0, R], ...left] };
  }
  const { length: L, chest: C, shoulder: S, sleeve: Sl, sleeveOpen: So, hem: Hm, neck: N } = m;
  const th = (kind === 'tee' ? 26 : 58) * Math.PI / 180;
  const sp: Pt = [S / 2, 4.5], A = Math.max(18, C * 0.42);
  const e1: Pt = [sp[0] + Sl * Math.cos(th), sp[1] + Sl * Math.sin(th)];
  const e2: Pt = [e1[0] - So * Math.sin(th), e1[1] + So * Math.cos(th)];
  const ua: Pt = [C / 2, A];
  const right: Pt[] = [[N / 2, 0], sp, e1, e2, ua, [Hm / 2, L]];
  const left = right.slice().reverse().map(([x, y]) => [-x, y] as Pt);
  return { pts: [...right, ...left], neck: { w: N, drop: side === 'front' ? (kind === 'hoodie' ? 7 : 9) : 2.5 }, hood: kind === 'hoodie' };
}

type Built = { canvas: HTMLCanvasElement; bounds: { x0: number; y0: number; w: number; h: number } };
type Pair = { front: Built; back: Built; heightM: number };
const imgCache = new Map<string, HTMLImageElement>();
const getImg = (src: string) => new Promise<HTMLImageElement | null>((res) => { const c = imgCache.get(src); if (c?.complete) return res(c); const im = new Image(); im.onload = () => { imgCache.set(src, im); res(im); }; im.onerror = () => res(null); im.src = src; });

// ---- 一面を描く（地の色・質感・陰影・縫い目・プリント） ----
// スキャン画像の、服が写っている範囲（透明でないところ）
const boxCache = new Map<string, { x: number; y: number; w: number; h: number }>();
function alphaBox(im: HTMLImageElement) {
  const c0 = boxCache.get(im.src); if (c0) return c0;
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 100) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const b = x1 > x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w: c.width, h: c.height }; boxCache.set(im.src, b); return b;
}
// 服が写っている高さ（m）：3Dの大きさをここに合わせる
function maskHeightM(L: Layer) { let a = -1, b = -1; for (let y = 0; y < L.h; y++) { let on = false; for (let x = 0; x < L.w; x += 2) if (L.mask[y * L.w + x]) { on = true; break; } if (on) { if (a < 0) a = y; b = y; } } return a < 0 ? 0.7 : (b - a + 1) / PX / 100; }

async function drawSide(kind: Kind, m: M, side: Side, color: string, fabric: Fabric, texImg: HTMLImageElement | null, prints: Print[], scan: { front?: string; back?: string; length?: number; chest?: number } | null, tint = false): Promise<Built> {
  const pad = 6;
  let pts: Pt[] = [], neck: { w: number; drop: number } | undefined, hood = false;
  let scanImg: HTMLImageElement | null = null;
  if (kind === 'scan') {
    scanImg = await getImg((side === 'back' ? scan?.back : scan?.front) || scan?.front || '');
    const bx = scanImg ? alphaBox(scanImg) : null;
    const L = m.length || 70, ar = bx ? bx.w / bx.h : 0.8, sx = scan?.chest ? (m.chest || scan.chest) / scan.chest : 1;
    const w = L * ar * sx; pts = [[-w / 2, 0], [w / 2, 0], [w / 2, L], [-w / 2, L]];
  } else ({ pts, neck, hood = false } = outline(kind, m, side));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const y0 = Math.min(0, ...ys) - (hood ? 30 : 0) - pad, x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y1 = Math.max(...ys) + pad;
  const W = Math.ceil((x1 - x0) * PX), H = Math.ceil((y1 - y0) * PX);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  const P = (x: number, y: number): Pt => [(x - x0) * PX, (y - y0) * PX];
  const path = new Path2D();
  if (kind === 'scan') { const [a, b] = P(pts[0][0], 0); path.rect(a, b, (pts[1][0] - pts[0][0]) * PX, (pts[2][1]) * PX); }
  else {
    pts.forEach(([x, y], i) => { const [a, b] = P(x, y); if (i) path.lineTo(a, b); else path.moveTo(a, b); });
    if (neck) { const [a, b] = P(-neck.w / 2, 0); path.lineTo(a, b); const [cx, cy] = P(0, neck.drop * 1.9); const [ex, ey] = P(neck.w / 2, 0); path.quadraticCurveTo(cx, cy, ex, ey); }
    path.closePath();
  }
  // フード（後ろに大きく、前は首の後ろに見える）
  if (hood) { const hp = new Path2D(); const pt = (x: number, y: number) => P(x, y); const [a, b] = pt(-14, 4); hp.moveTo(a, b); const [c1, d1] = pt(-17, -26); const [c2, d2] = pt(17, -26); const [e, f] = pt(14, 4); hp.bezierCurveTo(c1, d1, c2, d2, e, f); hp.closePath(); path.addPath(hp); }

  if (kind === 'scan' && scanImg) {
    const bx = alphaBox(scanImg), [dx, dy] = P(pts[0][0], 0), dw = (pts[1][0] - pts[0][0]) * PX, dh = pts[2][1] * PX;
    g.drawImage(scanImg, bx.x, bx.y, bx.w, bx.h, dx, dy, dw, dh);
    // 色を変える：明るさ（しわ・柄の濃淡）は残して、色味だけ選んだ色に
    if (tint) { const t = document.createElement('canvas'); t.width = W; t.height = H; const tg = t.getContext('2d')!; tg.drawImage(c, 0, 0); tg.globalCompositeOperation = 'color'; tg.fillStyle = color; tg.fillRect(0, 0, W, H); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(c, 0, 0); g.clearRect(0, 0, W, H); g.drawImage(t, 0, 0); }
  } else {
    g.save(); g.clip(path);
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    const tile = fabricTile(fabric, texImg); const pat = g.createPattern(tile, 'repeat');
    if (pat) { g.globalAlpha = fabric === 'image' ? 0.85 : 1; g.globalCompositeOperation = fabric === 'image' ? 'multiply' : 'source-over'; g.fillStyle = pat; g.fillRect(0, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    // 陰影：脇と裾を暗く、中央を少し明るく。縦のしわ
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(0,0,0,.22)'); gr.addColorStop(0.3, 'rgba(255,255,255,.04)'); gr.addColorStop(0.5, 'rgba(255,255,255,.07)'); gr.addColorStop(0.7, 'rgba(255,255,255,.03)'); gr.addColorStop(1, 'rgba(0,0,0,.24)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) { const x = W * (0.25 + i * 0.12), w = W * 0.05; const f = g.createLinearGradient(x - w, 0, x + w, 0); f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(0.5, `rgba(0,0,0,${0.04 + (i % 2) * 0.03})`); f.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = f; g.fillRect(x - w, H * 0.3, w * 2, H * 0.7); }
    // 縫い目・リブ
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.2; g.setLineDash([3, 3]);
    if (TOPS.includes(kind)) {
      const [hx0, hy] = P(-m.hem / 2, m.length - 2.2); const [hx1] = P(m.hem / 2, 0); g.beginPath(); g.moveTo(hx0, hy); g.lineTo(hx1, hy); g.stroke();
      if (neck) { g.setLineDash([]); g.lineWidth = 2.4 * PX / 4; g.strokeStyle = 'rgba(0,0,0,.22)'; const [a, b] = P(-neck.w / 2 - 1, 0.5); const [cx, cy] = P(0, neck.drop * 1.9 + 1.6); const [ex, ey] = P(neck.w / 2 + 1, 0.5); g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke(); }
      if (kind === 'hoodie' || kind === 'crew') { g.setLineDash([]); g.fillStyle = 'rgba(0,0,0,.1)'; const [a, b] = P(-m.hem / 2, m.length - 6); g.fillRect(a, b, m.hem * PX, 6 * PX); }
      if (kind === 'hoodie' && side === 'front') { g.setLineDash([3, 3]); g.strokeStyle = 'rgba(0,0,0,.3)'; const [a, b] = P(-m.chest * 0.33, m.length * 0.62); const [c2, d2] = P(m.chest * 0.33, m.length - 7); g.strokeRect(a, b, c2 - a, d2 - b); g.setLineDash([]); g.fillStyle = 'rgba(0,0,0,.35)'; const [e, f] = P(0, -2); g.beginPath(); g.ellipse(e, f + 4 * PX, 8 * PX, 5 * PX, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(...P(-3, 2)); g.lineTo(...P(-3, 16)); g.moveTo(...P(3, 2)); g.lineTo(...P(3, 16)); g.stroke(); }
    } else {
      g.setLineDash([]); g.fillStyle = 'rgba(0,0,0,.12)'; const [a, b] = P(-m.waist / 2, 0); g.fillRect(a, b, m.waist * PX, 4 * PX);
      g.setLineDash([3, 3]); g.strokeStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.moveTo(...P(0, 4)); g.lineTo(...P(0, m.rise * 0.7)); g.stroke();
      if (side === 'front') { g.beginPath(); g.moveTo(...P(m.waist / 2 - 2, 4.5)); g.quadraticCurveTo(...P(m.waist / 2 - 8, 9), ...P(m.waist / 2 - 12, 4.5)); g.moveTo(...P(-m.waist / 2 + 2, 4.5)); g.quadraticCurveTo(...P(-m.waist / 2 + 8, 9), ...P(-m.waist / 2 + 12, 4.5)); g.stroke(); }
    }
    g.setLineDash([]);
    g.restore();
  }
  // プリント（服の外にはみ出さない）
  g.save(); g.clip(path);
  for (const p of prints.filter((q) => q.side === side)) {
    const [cx, cy] = P(p.x, p.y);
    g.save(); g.translate(cx, cy); g.rotate(p.rot * Math.PI / 180); g.globalAlpha = p.opacity;
    if (p.type === 'image' && p.src) {
      const im = await getImg(p.src);
      if (im) { const w = p.w * PX, h = w * im.naturalHeight / im.naturalWidth; g.drawImage(im, -w / 2, -h / 2, w, h); }
    } else if (p.text) {
      const fam = p.font === 'serif' ? '"Times New Roman",Georgia,serif' : p.font === 'mono' ? 'Menlo,monospace' : '"Arial Black","Helvetica Neue",Arial,sans-serif';
      const lines = p.text.split('\n');
      g.fillStyle = p.color; g.textAlign = 'center'; g.textBaseline = 'middle';
      let fs = 40; g.font = `${p.font === 'serif' ? 'italic 700' : '800'} ${fs}px ${fam}`;
      const widest = Math.max(...lines.map((l) => g.measureText(l).width)) || 1; fs = fs * (p.w * PX) / widest; g.font = `${p.font === 'serif' ? 'italic 700' : '800'} ${fs}px ${fam}`;
      lines.forEach((l, i) => g.fillText(l, 0, (i - (lines.length - 1) / 2) * fs * 1.05));
    }
    g.restore();
    // ひび割れ加工：小さな抜けを散らす
    if (p.crack) { g.save(); g.globalCompositeOperation = 'destination-out'; let sd = p.id.length * 97; const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; }; const R = p.w * PX * 0.6; for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.5})`; g.fillRect(cx + (r() - 0.5) * R * 2, cy + (r() - 0.5) * R * 1.4, 1 + r() * 2.5, 1 + r() * 2.5); } g.restore(); }
  }
  g.restore();
  return { canvas: c, bounds: { x0, y0, w: x1 - x0, h: y1 - y0 } };
}

const layerFrom = (c: HTMLCanvasElement): Layer => {
  const g = c.getContext('2d', { willReadFrequently: true })!, data = g.getImageData(0, 0, c.width, c.height);
  const mask = new Uint8ClampedArray(c.width * c.height); for (let i = 0; i < mask.length; i++) mask[i] = data.data[i * 4 + 3] > 100 ? 255 : 0;
  return { img: c, data, mask, w: c.width, h: c.height };
};
// 写真の色を k-means で6色に
function palette(im: HTMLImageElement, k = 6): string[] {
  const c = document.createElement('canvas'), s = 64; c.width = c.height = s; const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(im, 0, 0, s, s);
  const d = g.getImageData(0, 0, s, s).data, px: number[][] = []; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
  let cs = Array.from({ length: k }, (_, i) => px[Math.floor((i + 0.5) * px.length / k)] || [128, 128, 128]);
  for (let it = 0; it < 8; it++) {
    const sum = cs.map(() => [0, 0, 0, 0]);
    for (const p of px) { let bi = 0, bd = 1e9; cs.forEach((q, j) => { const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (dd < bd) { bd = dd; bi = j; } }); sum[bi][0] += p[0]; sum[bi][1] += p[1]; sum[bi][2] += p[2]; sum[bi][3]++; }
    cs = sum.map((s2, j) => (s2[3] ? [s2[0] / s2[3], s2[1] / s2[3], s2[2] / s2[3]] : cs[j]));
  }
  return cs.map((q) => '#' + q.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
}
// 背景を抜く（四隅の色に近いところを透明に）
async function keyOut(src: string): Promise<string> {
  const im = await getImg(src); if (!im) return src;
  const k = Math.min(1, 1000 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(im, 0, 0, c.width, c.height); const d = g.getImageData(0, 0, c.width, c.height), q = d.data, w = c.width, h = c.height;
  let r = 0, gg = 0, b = 0; for (const i of [0, w - 1, (h - 1) * w, h * w - 1]) { r += q[i * 4] / 4; gg += q[i * 4 + 1] / 4; b += q[i * 4 + 2] / 4; }
  for (let i = 0; i < q.length; i += 4) { const dd = Math.hypot(q[i] - r, q[i + 1] - gg, q[i + 2] - b); q[i + 3] = Math.min(q[i + 3], Math.max(0, Math.min(255, (dd - 26) * 8))); }
  g.putImageData(d, 0, 0); return c.toDataURL('image/png');
}
const readFile = (f: File) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
const shrinkPng = (c: HTMLCanvasElement, max = 720) => { const k = Math.min(1, max / Math.max(c.width, c.height)); const o = document.createElement('canvas'); o.width = Math.round(c.width * k); o.height = Math.round(c.height * k); o.getContext('2d')!.drawImage(c, 0, 0, o.width, o.height); return o.toDataURL('image/png'); };

// AI：CLIP（画像と言葉を結びつけるモデル）でこの端末の中だけで素材を判定する
const CLIP_LABELS: [Fabric, string][] = [['denim', 'a close-up photo of denim fabric'], ['jersey', 'a close-up photo of cotton jersey t-shirt fabric'], ['fleece', 'a close-up photo of fleece sweatshirt fabric'], ['canvas', 'a close-up photo of cotton canvas fabric'], ['nylon', 'a close-up photo of shiny nylon fabric'], ['corduroy', 'a close-up photo of corduroy fabric']];
const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
type Classifier = (img: string, labels: string[]) => Promise<{ label: string; score: number }[]>;
let clip: Promise<Classifier> | null = null;
function loadClip(): Promise<Classifier> {
  if (!clip) clip = (async () => {
    const mod = (await import(/* webpackIgnore: true */ TF_URL)) as { pipeline: (task: string, model: string) => Promise<(img: string, labels: string[]) => Promise<{ label: string; score: number }[]>> };
    const pipe = await mod.pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
    return (img: string, labels: string[]) => pipe(img, labels);
  })();
  return clip;
}

export default function MockupStudio() {
  const phone = typeof window !== 'undefined' && isPhone();
  const [kind, setKind] = useState<Kind>('tee');
  const [m, setM] = useState<M>({ ...DEF.tee });
  const [color, setColor] = useState('#141416');
  const [fabric, setFabric] = useState<Fabric>('jersey');
  const [texSrc, setTexSrc] = useState<string>('');
  const [refSrc, setRefSrc] = useState<string>('');
  const [pal, setPal] = useState<string[]>([]);
  const [ai, setAi] = useState<{ busy: boolean; out?: { f: Fabric; s: number }[]; err?: string }>({ busy: false });
  const [prints, setPrints] = useState<Print[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('front');
  const [tab, setTab] = useState<'shape' | 'material' | 'print' | 'save'>('shape');
  const [showDims, setShowDims] = useState(true);
  const [scan, setScan] = useState<{ front?: string; back?: string; length?: number; chest?: number } | null>(null);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState(12800);
  const [saved, setSaved] = useState('');
  const [msg, setMsg] = useState('');
  const view2d = useRef<HTMLCanvasElement>(null);
  const host3d = useRef<HTMLDivElement>(null);
  const three = useRef<{ setGarment: (g: THREE.Object3D | null, top: boolean) => void } | null>(null);
  const lastBuilt = useRef<Pair | null>(null);
  const t3 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tint, setTint] = useState(false);

  // スマートスキャンから「モックアップで編集」で来たとき
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem('gc-mock-src') || 'null'); if (s?.front) { setScan(s); setKind('scan'); setM({ length: s.length || 70, chest: s.chest || 56 }); } } catch { /* 無視 */ }
  }, []);
  const pickKind = (k: Kind) => { setKind(k); if (k !== 'scan') setM({ ...DEF[k] }); else setM({ length: scan?.length || 70, chest: scan?.chest || 56 }); };
  const grade = (sz: string) => { if (kind === 'scan') return; const d = GRADE[sz], base = DEF[kind]; const out: M = {}; for (const [k, v] of Object.entries(base)) out[k] = Math.round((v + d * ({ length: 2, chest: 2.5, shoulder: 2, sleeve: 1, hem: 2.5, waist: 2, hip: 2, thigh: 1, inseam: 0, rise: 0.5, sleeveOpen: 0.5, neck: 0.5, hemW: 0.5 }[k] || 0)) * 2) / 2; setM(out); };

  // ---- 3D：実物の大きさ（床に10cmの格子、175cmの人の影、1cmきざみの物差し） ----
  useEffect(() => {
    const el = host3d.current; if (!el) return;
    let r: THREE.WebGLRenderer; try { r = new THREE.WebGLRenderer({ antialias: !phone, alpha: false }); } catch { return; }
    r.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.5 : 2)); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; el.appendChild(r.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf1efea);
    const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4ca, 1.2)); const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-1.2, 2.4, 2); scene.add(key);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 30); cam.position.set(0.9, 1.25, 2.9);
    const oc = new OrbitControls(cam, r.domElement); oc.target.set(0, 1.05, 0); oc.enableDamping = true; oc.minDistance = 0.6; oc.maxDistance = 6;
    const grid = new THREE.GridHelper(2, 20, 0xb9b3a8, 0xd8d3ca); scene.add(grid);
    // 175cm の人の影
    const sil = document.createElement('canvas'); sil.width = 200; sil.height = 700; const sg = sil.getContext('2d')!; sg.fillStyle = 'rgba(40,40,40,.16)';
    sg.beginPath(); sg.arc(100, 52, 40, 0, 7); sg.fill(); sg.beginPath(); sg.moveTo(52, 110); sg.quadraticCurveTo(100, 96, 148, 110); sg.lineTo(170, 360); sg.lineTo(150, 365); sg.lineTo(140, 250); sg.lineTo(138, 690); sg.lineTo(104, 690); sg.lineTo(100, 420); sg.lineTo(96, 690); sg.lineTo(62, 690); sg.lineTo(60, 250); sg.lineTo(50, 365); sg.lineTo(30, 360); sg.closePath(); sg.fill();
    const st = new THREE.CanvasTexture(sil); st.colorSpace = THREE.SRGBColorSpace;
    const person = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.75), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false })); person.position.set(-0.75, 0.875, -0.25); scene.add(person);
    // 物差し（1cm・10cm）
    const ru = document.createElement('canvas'); ru.width = 64; ru.height = 1024; const rg = ru.getContext('2d')!; rg.fillStyle = '#fbfaf6'; rg.fillRect(0, 0, 64, 1024); rg.fillStyle = '#111'; rg.font = '14px Helvetica';
    for (let cm = 0; cm <= 200; cm++) { const y = 1024 - cm * 1024 / 200; const l = cm % 10 === 0 ? 30 : cm % 5 === 0 ? 18 : 9; rg.fillRect(0, y, l, 1); if (cm % 20 === 0 && cm) rg.fillText(String(cm), 34, y + 5); }
    const rt = new THREE.CanvasTexture(ru); rt.colorSpace = THREE.SRGBColorSpace;
    const ruler = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 2), new THREE.MeshBasicMaterial({ map: rt })); ruler.position.set(0.62, 1, -0.05); scene.add(ruler);
    const hold = new THREE.Group(); scene.add(hold);
    const size = () => { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    size(); const ro = new ResizeObserver(size); ro.observe(el);
    let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); oc.update(); r.render(scene, cam); }; loop();
    three.current = {
      setGarment: (g, top) => {
        hold.children.slice().forEach((c) => { hold.remove(c); c.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.geometry.dispose(); const mt = mm.material as THREE.MeshStandardMaterial; mt.map?.dispose(); mt.dispose(); } }); });
        if (!g) return;
        const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3());
        // 上の服は肩を床から145cm（身長175cmの人の肩の高さ）、パンツはウエストを100cmに
        g.position.set(-c.x, (top ? 1.45 : 1.0) - b.max.y, -c.z); hold.add(g);
      },
    };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); oc.dispose(); pm.dispose(); r.dispose(); r.domElement.remove(); three.current = null; };
  }, [phone]);

  // ---- 描き直し（2Dはすぐ、3Dは少し待ってから） ----
  const texImg = useRef<HTMLImageElement | null>(null);
  useEffect(() => { if (!texSrc) { texImg.current = null; return; } getImg(texSrc).then((im) => { texImg.current = im; setM((x) => ({ ...x })); }); }, [texSrc]);
  const stamp = JSON.stringify([kind, m, color, fabric, texSrc, prints, scan?.front]);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (kind === 'scan' && !scan?.front) return;
      const front = await drawSide(kind, m, 'front', color, fabric, texImg.current, prints, scan, tint), back = await drawSide(kind, m, 'back', color, fabric, texImg.current, prints, scan, tint);
      if (!alive) return;
      const F = layerFrom(front.canvas), heightM = maskHeightM(F);
      lastBuilt.current = { front, back, heightM }; paint2d();
      if (t3.current) clearTimeout(t3.current);
      t3.current = setTimeout(() => {
        if (!alive) return;
        // 布の厚み：フリース・デニムは少し厚く
        const depth = fabric === 'fleece' ? 1.25 : fabric === 'denim' || fabric === 'canvas' ? 1.1 : fabric === 'nylon' ? 0.9 : 1;
        const res = buildGarment(F, layerFrom(back.canvas), heightM, depth, phone ? 512 : 1024);
        three.current?.setGarment(res?.group || null, kind !== 'pants' && kind !== 'shorts');
      }, 350);
    })();
    return () => { alive = false; if (t3.current) clearTimeout(t3.current); };
  }, [stamp, tint]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2Dの画面（寸法線・選んだプリントの枠）
  const paint2d = useCallback(() => {
    const cv = view2d.current, b = lastBuilt.current?.[side]; if (!cv || !b) return;
    const box = cv.parentElement!.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio, 2);
    cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
    const g = cv.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    const sc = Math.min(cv.width / b.canvas.width, cv.height / b.canvas.height) * 0.92, ox = (cv.width - b.canvas.width * sc) / 2, oy = (cv.height - b.canvas.height * sc) / 2;
    g.drawImage(b.canvas, ox, oy, b.canvas.width * sc, b.canvas.height * sc);
    const C = (x: number, y: number): Pt => [ox + (x - b.bounds.x0) * PX * sc, oy + (y - b.bounds.y0) * PX * sc];
    (cv as HTMLCanvasElement & { _map?: unknown })._map = { sc, ox, oy, x0: b.bounds.x0, y0: b.bounds.y0 };
    g.font = `${12 * dpr}px Helvetica,Arial`; g.textAlign = 'center';
    const dim = (a: Pt, z: Pt, label: string, off: Pt = [0, 0]) => { g.strokeStyle = '#d23a2a'; g.fillStyle = '#d23a2a'; g.lineWidth = 1.2 * dpr; g.beginPath(); g.moveTo(a[0] + off[0], a[1] + off[1]); g.lineTo(z[0] + off[0], z[1] + off[1]); g.stroke(); for (const p of [a, z]) { g.beginPath(); g.arc(p[0] + off[0], p[1] + off[1], 2.5 * dpr, 0, 7); g.fill(); } const mx = (a[0] + z[0]) / 2 + off[0], my = (a[1] + z[1]) / 2 + off[1]; const tw = g.measureText(label).width + 8 * dpr; g.fillStyle = '#fff'; g.fillRect(mx - tw / 2, my - 9 * dpr, tw, 16 * dpr); g.fillStyle = '#d23a2a'; g.fillText(label, mx, my + 4 * dpr); };
    if (showDims && kind !== 'scan') {
      if (TOPS.includes(kind)) {
        const th = (kind === 'tee' ? 26 : 58) * Math.PI / 180;
        dim(C(0, 0), C(0, m.length), `${tt('Length', '着丈')} ${m.length}`, [0, 0]);
        dim(C(-m.chest / 2, m.chest * 0.42 + 2), C(m.chest / 2, m.chest * 0.42 + 2), `${tt('Chest', '身幅')} ${m.chest}`);
        dim(C(-m.shoulder / 2, 4.5), C(m.shoulder / 2, 4.5), `${tt('Shoulder', '肩幅')} ${m.shoulder}`, [0, -14 * dpr]);
        dim(C(m.shoulder / 2, 4.5), C(m.shoulder / 2 + m.sleeve * Math.cos(th), 4.5 + m.sleeve * Math.sin(th)), `${tt('Sleeve', '袖丈')} ${m.sleeve}`, [8 * dpr, -8 * dpr]);
      } else if (kind === 'pants' || kind === 'shorts') {
        dim(C(-m.waist / 2, 0), C(m.waist / 2, 0), `${tt('Waist', 'ウエスト')} ${m.waist}`, [0, -10 * dpr]);
        dim(C(-m.hip / 2, m.rise * 0.62), C(m.hip / 2, m.rise * 0.62), `${tt('Hip', 'ヒップ')} ${m.hip}`);
        dim(C(0, 0), C(0, m.rise), `${tt('Rise', '股上')} ${m.rise}`);
        const cx = m.hip / 4 + 1.5; dim(C(cx, m.rise), C(cx, m.rise + m.inseam), `${tt('Inseam', '股下')} ${m.inseam}`);
      }
    }
    const p = prints.find((q) => q.id === sel && q.side === side);
    if (p) { const [x, y] = C(p.x, p.y), w = p.w * PX * sc; g.save(); g.translate(x, y); g.rotate(p.rot * Math.PI / 180); g.strokeStyle = '#2a5bd2'; g.setLineDash([5 * dpr, 4 * dpr]); g.lineWidth = 1.5 * dpr; g.strokeRect(-w / 2, -w * 0.4, w, w * 0.8); g.setLineDash([]); g.fillStyle = '#2a5bd2'; g.fillRect(w / 2 - 6 * dpr, w * 0.4 - 6 * dpr, 12 * dpr, 12 * dpr); g.restore(); }
  }, [side, showDims, kind, m, prints, sel]);
  useEffect(() => { paint2d(); }, [paint2d]);
  useEffect(() => { const h = () => paint2d(); addEventListener('resize', h); return () => removeEventListener('resize', h); }, [paint2d]);

  // 2Dの上でプリントをドラッグして動かす・右下の四角で大きさ
  const drag = useRef<{ id: string; mode: 'move' | 'size'; sx: number; sy: number; x: number; y: number; w: number } | null>(null);
  const toCm = (e: React.PointerEvent) => { const cv = view2d.current!; const mp = (cv as HTMLCanvasElement & { _map?: { sc: number; ox: number; oy: number; x0: number; y0: number } })._map; if (!mp) return null; const r = cv.getBoundingClientRect(), dpr = cv.width / r.width; const px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr; return { x: (px - mp.ox) / (PX * mp.sc) + mp.x0, y: (py - mp.oy) / (PX * mp.sc) + mp.y0 }; };
  const down = (e: React.PointerEvent) => {
    const c = toCm(e); if (!c) return;
    const hit = prints.filter((p) => p.side === side).reverse().find((p) => Math.abs(c.x - p.x) < p.w / 2 + 2 && Math.abs(c.y - p.y) < p.w * 0.45 + 2);
    if (!hit) { setSel(null); return; }
    setSel(hit.id); setTab('print');
    const corner = Math.abs(c.x - (hit.x + hit.w / 2)) < 3 && Math.abs(c.y - (hit.y + hit.w * 0.4)) < 3;
    drag.current = { id: hit.id, mode: corner ? 'size' : 'move', sx: c.x, sy: c.y, x: hit.x, y: hit.y, w: hit.w };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return; const c = toCm(e); if (!c) return;
    setPrints((ps) => ps.map((p) => (p.id !== d.id ? p : d.mode === 'move' ? { ...p, x: Math.round((d.x + c.x - d.sx) * 2) / 2, y: Math.round((d.y + c.y - d.sy) * 2) / 2 } : { ...p, w: Math.max(2, Math.round((d.w + (c.x - d.sx) * 2) * 2) / 2) })));
  };
  const up = () => { drag.current = null; };

  // ---- プリントの追加 ----
  const addImage = async (f: File) => { const src = await readFile(f); const id = 'p' + Date.now().toString(36); const top = kind === 'pants' || kind === 'shorts'; setPrints((ps) => [...ps, { id, type: 'image', side, src, font: 'sans', color: '#ffffff', x: top ? 10 : 0, y: top ? 14 : 22, w: top ? 10 : 24, rot: 0, opacity: 1, crack: false }]); setSel(id); };
  const addText = () => { const id = 'p' + Date.now().toString(36); const top = kind === 'pants' || kind === 'shorts'; setPrints((ps) => [...ps, { id, type: 'text', side, text: 'GALLERY\nCRYPTO', font: 'sans', color: color === '#f4f3ef' || color === '#e8e3d6' ? '#141414' : '#f1ece2', x: top ? 10 : 0, y: top ? 14 : 22, w: top ? 12 : 26, rot: 0, opacity: 0.95, crack: false }]); setSel(id); };
  const cur = prints.find((p) => p.id === sel) || null;
  const upd = (patch: Partial<Print>) => cur && setPrints((ps) => ps.map((p) => (p.id === cur.id ? { ...p, ...patch } : p)));

  // ---- 素材：写真から ----
  const onRef = async (f: File) => { const src = await readFile(f); setRefSrc(src); const im = await getImg(src); if (im) setPal(palette(im)); setAi({ busy: false }); };
  const runAi = async () => {
    if (!refSrc) return; setAi({ busy: true });
    try {
      const cls = await loadClip(); const out = await cls(refSrc, CLIP_LABELS.map((x) => x[1]));
      const res = out.map((o) => ({ f: CLIP_LABELS.find((x) => x[1] === o.label)![0], s: o.score })).sort((a, b) => b.s - a.s);
      setAi({ busy: false, out: res.slice(0, 3) }); setFabric(res[0].f); if (pal[0]) setColor(pal[0]);
    } catch { setAi({ busy: false, err: tt('The AI model could not be loaded on this device. Pick the material by hand.', 'この端末ではAIのモデルを読み込めませんでした。素材は手で選んでください。') }); }
  };

  // ---- 保存：ショップ・レール・ショールームに（この端末） ----
  const save = () => {
    const b = lastBuilt.current; if (!b) return;
    try {
      const id = 'mock-' + Date.now().toString(36), list = JSON.parse(localStorage.getItem('gc-shop-local') || '[]') as { id: string }[];
      const fabName = kind === 'scan' ? tt('Scanned', 'スキャン') : (FABRICS.find((x) => x[0] === fabric)?.[1] || fabric);
      const size = kind === 'pants' || kind === 'shorts' ? `${tt('Waist', 'ウエスト')} ${m.waist} / ${tt('Inseam', '股下')} ${m.inseam} cm` : `${tt('Length', '着丈')} ${m.length} / ${tt('Chest', '身幅')} ${m.chest} cm`;
      const item = { id, code: 'MOCK-' + id.slice(-4).toUpperCase(), title: title || `${KINDS.find((k) => k[0] === kind)?.[1]} mockup`, sub: `${tt('Mockup', 'モックアップ')} · ${fabName}`, price: '¥' + price.toLocaleString('ja-JP'), img: shrinkPng(b.front.canvas), back: shrinkPng(b.back.canvas), buy: 'local', desc: '',
        facts: [['Size', size], ...Object.entries(m).filter(([k]) => !['length', 'chest', 'waist', 'inseam'].includes(k)).map(([k, v]) => [tt(LABEL[k]?.[0] || k, LABEL[k]?.[1] || k), `${v} cm`]), ['Material', fabName]], zone: 'vintage', heightM: Math.round(b.heightM * 100) / 100, color, hex: color };
      const rest = list.filter((x) => !String(x.id).startsWith('mock-')).concat(list.filter((x) => String(x.id).startsWith('mock-')).slice(0, 5));
      localStorage.setItem('gc-shop-local', JSON.stringify([item, ...rest])); setSaved(id); setMsg('');
    } catch { setMsg(tt('Could not save on this device (storage is full).', 'この端末に保存できませんでした（保存領域がいっぱいです）。')); }
  };
  const download = () => { const b = lastBuilt.current; if (!b) return; for (const s of ['front', 'back'] as Side[]) { const a = document.createElement('a'); a.href = b[s].canvas.toDataURL('image/png'); a.download = `mockup-${s}.png`; a.click(); } };

  const fields = useMemo(() => Object.keys(m), [m]);
  return (
    <section className="mk">
      <div className="mk-stage">
        <div className="mk-3d" ref={host3d} aria-label={tt('3D at real size', '実物大の3D')} />
        <div className="mk-badge">{tt('Real size — grid 10 cm · figure 175 cm', '実物大 — 床の格子10cm・人の影175cm')}</div>
        <div className="mk-2d">
          <div className="mk-2dbar">
            <div className="mk-seg"><button aria-pressed={side === 'front'} onClick={() => setSide('front')}>{tt('Front', '正面')}</button><button aria-pressed={side === 'back'} onClick={() => setSide('back')}>{tt('Back', '背中')}</button></div>
            <label className="mk-chk"><input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} />{tt('Measurements', '寸法線')}</label>
          </div>
          <div className="mk-2dwrap"><canvas ref={view2d} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} /></div>
          <small>{tt('Drag a print to move it · drag its blue corner to resize', 'プリントはドラッグで移動 · 青い角で大きさ')}</small>
        </div>
      </div>

      <div className="mk-panel">
        <div className="mk-tabs">
          {([['shape', 'Shape & size', '形と寸法'], ['material', 'Material', '素材'], ['print', 'Print', 'プリント'], ['save', 'Save', '保存']] as const).map(([k, en, ja]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{tt(en, ja)}</button>)}
        </div>

        {tab === 'shape' && (
          <div className="mk-sec">
            <div className="mk-kinds">{KINDS.map(([k, en, ja]) => <button key={k} aria-pressed={kind === k} disabled={k === 'scan' && !scan} onClick={() => pickKind(k)}>{tt(en, ja)}</button>)}</div>
            {kind === 'scan' && !scan && <p className="mk-fine">{tt('Scan a piece in Smart scan, then press “Edit as mockup”.', 'スマートスキャンで服を読み込み、「モックアップで編集」を押すと使えます。')}</p>}
            {kind !== 'scan' && <div className="mk-grade"><span>{tt('Start from a size', 'サイズの目安')}</span>{Object.keys(GRADE).map((s) => <button key={s} onClick={() => grade(s)}>{s}</button>)}</div>}
            <div className="mk-meas">
              {fields.map((k) => (
                <label key={k} className="mk-m">
                  <span>{tt(LABEL[k]?.[0] || k, LABEL[k]?.[1] || k)}</span>
                  <button onClick={() => setM((x) => ({ ...x, [k]: Math.max(1, x[k] - 0.5) }))} aria-label="-0.5">−</button>
                  <input type="number" step={0.5} value={m[k]} onChange={(e) => setM((x) => ({ ...x, [k]: Math.max(1, Number(e.target.value) || 0) }))} />
                  <em>cm</em>
                  <button onClick={() => setM((x) => ({ ...x, [k]: x[k] + 0.5 }))} aria-label="+0.5">＋</button>
                  <input type="range" min={k === 'inseam' ? 5 : 5} max={k === 'inseam' || k === 'length' ? 110 : 80} step={0.5} value={m[k]} onChange={(e) => setM((x) => ({ ...x, [k]: Number(e.target.value) }))} />
                </label>
              ))}
            </div>
            <p className="mk-fine">{tt('Measured flat, in centimetres, to 0.5 cm. The 3D shows the piece at this exact size.', '平置きで測った数字（cm・0.5cm単位）。3Dはこの大きさのまま表示します。')}</p>
          </div>
        )}

        {tab === 'material' && (
          <div className="mk-sec">
            <b className="mk-h">{tt('Colour', '色')}</b>
            <div className="mk-colors">{[...pal, ...COLORS].map((c, i) => <button key={c + i} style={{ background: c }} aria-pressed={color === c} onClick={() => setColor(c)} title={c} />)}<label className="mk-pick"><input type="color" value={color} onChange={(e) => setColor(e.target.value)} />{tt('Any colour', '自由に')}</label></div>
            {kind === 'scan' && <label className="mk-chk"><input type="checkbox" checked={tint} onChange={(e) => setTint(e.target.checked)} />{tt('Recolour the scan (keeps folds and print shading)', 'スキャンの色を変える（しわ・柄の濃淡はそのまま）')}</label>}
            <b className="mk-h">{tt('Texture', '質感')}</b>
            <div className="mk-fabs">
              {FABRICS.map(([f, en, ja]) => <button key={f} aria-pressed={fabric === f} onClick={() => setFabric(f)}><span ref={(el) => { if (el && !el.firstChild) { const t2 = fabricTile(f); t2.style.background = color; el.appendChild(t2); } }} />{tt(en, ja)}</button>)}
              {texSrc && <button aria-pressed={fabric === 'image'} onClick={() => setFabric('image')}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={texSrc} alt="" />{tt('From photo', '写真の質感')}</button>}
            </div>
            <b className="mk-h">{tt('From a photo', '写真から')}</b>
            <label className="ss-btn ghost mk-up"><input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onRef(f); }} />{tt('Choose a fabric photo', '生地の写真を選ぶ')}</label>
            {refSrc && (
              <div className="mk-ref">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={refSrc} alt="" />
                <div>
                  <p className="mk-fine">{tt('Colours picked from the photo were added above.', '写真から拾った色を上の色に足しました。')}</p>
                  <button className="ss-btn ghost" onClick={() => { setTexSrc(refSrc); setFabric('image'); }}>{tt('Use this texture', 'この質感を使う')}</button>
                  <button className="ss-btn" onClick={runAi} disabled={ai.busy}>{ai.busy ? tt('AI is looking…', 'AIが判定中…') : tt('Let AI pick the material', 'AIで素材を判定')}</button>
                  {ai.out && <ul className="mk-ai">{ai.out.map((o) => <li key={o.f}><button onClick={() => setFabric(o.f)}>{tt(FABRICS.find((x) => x[0] === o.f)![1], FABRICS.find((x) => x[0] === o.f)![2])}</button><i style={{ width: `${Math.round(o.s * 100)}%` }} /><em>{Math.round(o.s * 100)}%</em></li>)}</ul>}
                  {ai.err && <p className="mk-fine">{ai.err}</p>}
                  <p className="mk-fine">{tt('AI: CLIP image model, run on this device (about 90 MB downloaded the first time). The photo is not sent anywhere.', 'AI：画像のモデル CLIP をこの端末の中で動かします（初回だけ約90MBを読み込み）。写真はどこにも送りません。')}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'print' && (
          <div className="mk-sec">
            <div className="mk-row">
              <label className="ss-btn ghost"><input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) addImage(f); e.target.value = ''; }} />{tt('Add an image', '画像を追加')}</label>
              <button className="ss-btn ghost" onClick={addText}>{tt('Add text', '文字を追加')}</button>
            </div>
            {prints.length > 0 && <div className="mk-layers">{prints.map((p) => <button key={p.id} aria-pressed={p.id === sel} onClick={() => { setSel(p.id); setSide(p.side); }}>{p.type === 'text' ? `“${(p.text || '').split('\n')[0]}”` : tt('Image', '画像')} · {p.side === 'front' ? tt('front', '正面') : tt('back', '背中')}</button>)}</div>}
            {cur && (
              <div className="mk-edit">
                <div className="mk-seg"><button aria-pressed={cur.side === 'front'} onClick={() => { upd({ side: 'front' }); setSide('front'); }}>{tt('Front', '正面')}</button><button aria-pressed={cur.side === 'back'} onClick={() => { upd({ side: 'back' }); setSide('back'); }}>{tt('Back', '背中')}</button></div>
                {cur.type === 'text' && <textarea value={cur.text} rows={2} onChange={(e) => upd({ text: e.target.value })} />}
                {cur.type === 'text' && <div className="mk-row">{(['sans', 'serif', 'mono'] as const).map((f) => <button key={f} className="mk-chip" aria-pressed={cur.font === f} onClick={() => upd({ font: f })}>{f === 'sans' ? 'Sans' : f === 'serif' ? 'Serif' : 'Mono'}</button>)}<input type="color" value={cur.color} onChange={(e) => upd({ color: e.target.value })} /></div>}
                {([['x', tt('Left / right', '左右'), -40, 40], ['y', tt('Up / down', '上下'), -10, 110], ['w', tt('Width', '幅'), 2, 60], ['rot', tt('Angle', '角度'), -180, 180]] as [keyof Print, string, number, number][]).map(([k, l, a, b]) => (
                  <label key={k} className="mk-m small"><span>{l}</span><input type="range" min={a} max={b} step={0.5} value={cur[k] as number} onChange={(e) => upd({ [k]: Number(e.target.value) } as Partial<Print>)} /><em>{cur[k] as number}{k === 'rot' ? '°' : ' cm'}</em></label>
                ))}
                <label className="mk-m small"><span>{tt('Opacity', '濃さ')}</span><input type="range" min={0.2} max={1} step={0.05} value={cur.opacity} onChange={(e) => upd({ opacity: Number(e.target.value) })} /><em>{Math.round(cur.opacity * 100)}%</em></label>
                <div className="mk-row">
                  <label className="mk-chk"><input type="checkbox" checked={cur.crack} onChange={(e) => upd({ crack: e.target.checked })} />{tt('Cracked print', 'ひび割れ加工')}</label>
                  {cur.type === 'image' && <button className="mk-chip" onClick={async () => { if (cur.src) upd({ src: await keyOut(cur.src) }); }}>{tt('Remove background', '背景を抜く')}</button>}
                  <button className="mk-chip" onClick={() => upd({ x: 0 })}>{tt('Centre', '中央へ')}</button>
                  <button className="mk-chip danger" onClick={() => { setPrints((ps) => ps.filter((p) => p.id !== cur.id)); setSel(null); }}>{tt('Delete', '削除')}</button>
                </div>
              </div>
            )}
            {!prints.length && <p className="mk-fine">{tt('Add a logo, artwork or text, then drag it on the garment.', 'ロゴ・作品・文字を追加して、服の上でドラッグしてください。')}</p>}
          </div>
        )}

        {tab === 'save' && (
          <div className="mk-sec">
            <label className="mk-f"><span>{tt('Name', '商品名')}</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tt('e.g. Studio Tee — Black', '例：Studio Tee — Black')} /></label>
            <label className="mk-f"><span>{tt('Price (yen)', '価格（円）')}</span><input type="number" step={100} value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} /></label>
            <div className="mk-row">
              <button className="ss-btn" onClick={save}>{tt('Display in the store', '店に並べる')}</button>
              <button className="ss-btn ghost" onClick={download}>{tt('Download PNG', 'PNGで保存')}</button>
            </div>
            {saved && <div className="mk-row"><a className="ss-btn ghost" href={`/shop/room`}>{tt('See it in the showroom →', 'ショールームで見る →')}</a><a className="ss-btn ghost" href={`/shop/rail#p=${saved}`}>{tt('On the rail →', 'レールで見る →')}</a><a className="ss-btn ghost" href={`/shop#p=${saved}`}>{tt('In the shop →', 'ショップで見る →')}</a></div>}
            {msg && <p className="mk-fine">{msg}</p>}
            <p className="mk-fine">{tt('Saved on this device only, as a sample (not for sale). It appears in the shop, on the rail and in the 3D showroom at its measured size.', 'この端末にだけ、見本として保存します（購入不可）。ショップ・レール・3Dのショールームに、測った大きさのまま並びます。')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
