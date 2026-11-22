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
import { buildPillow } from './pillow3d';
import type { Layer } from './GhostMannequin';
import { tt } from './Lang';
import { isPhone } from '@/lib/device';
import { canListen, canSpeak, listen, speak, unlockSpeech } from '@/lib/voice';
import { parseVoice } from '@/lib/voiceCommands';
import { TEMPLATES, GRADE_STEP, shapeOf, type BaseKind, type Handle, type Deco } from './mockup/templates';

type Kind = 'tee' | 'ls' | 'hoodie' | 'crew' | 'pants' | 'shorts' | 'scan';
type Fabric = 'jersey' | 'fleece' | 'denim' | 'canvas' | 'nylon' | 'corduroy' | 'image';
type Side = 'front' | 'back';
type Print = { id: string; type: 'image' | 'text'; side: Side; src?: string; text?: string; font: 'sans' | 'serif' | 'mono'; color: string; x: number; y: number; w: number; rot: number; opacity: number; crack: boolean };
type M = Record<string, number>;

const PX = 8; // 1cm = 8px（描画の解像度）
const TOPS: Kind[] = ['tee', 'ls', 'hoodie', 'crew'];
const DEF = Object.fromEntries(Object.entries(TEMPLATES).map(([k, v]) => [k, v.def])) as Record<Exclude<Kind, 'scan'>, M>;
const LABEL: Record<string, [string, string]> = { length: ['Length', '着丈'], chest: ['Chest (flat)', '身幅'] };
for (const t of Object.values(TEMPLATES)) for (const f of t.fields) LABEL[f.k] = [f.en, f.ja];
const RANGE: Record<string, [number, number]> = {};
for (const t of Object.values(TEMPLATES)) for (const f of t.fields) RANGE[f.k] = [f.min, f.max];
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

type Pt = [number, number];
// 多角形の向き（時計回りにそろえる：重ねて塗っても穴があかない）
const cw = (p: Pt[]) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return a < 0 ? p.slice().reverse() : p; };

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
  let pts: Pt[] = [], decos: Deco[] = [], topY = 0;
  let scanImg: HTMLImageElement | null = null;
  if (kind === 'scan') {
    scanImg = await getImg((side === 'back' ? scan?.back : scan?.front) || scan?.front || '');
    const bx = scanImg ? alphaBox(scanImg) : null;
    const L = m.length || 70, ar = bx ? bx.w / bx.h : 0.8, sx = scan?.chest ? (m.chest || scan.chest) / scan.chest : 1;
    const w = L * ar * sx; pts = [[-w / 2, 0], [w / 2, 0], [w / 2, L], [-w / 2, L]];
  } else { const sh = shapeOf(kind as BaseKind, m, side); pts = sh.outline; decos = sh.decos; topY = sh.top; }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const y0 = Math.min(0, topY, ...ys) - pad, x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y1 = Math.max(...ys) + pad;
  const W = Math.ceil((x1 - x0) * PX), H = Math.ceil((y1 - y0) * PX);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  const P = (x: number, y: number): Pt => [(x - x0) * PX, (y - y0) * PX];
  const path = new Path2D();
  if (kind === 'scan') { const [a, b] = P(pts[0][0], 0); path.rect(a, b, (pts[1][0] - pts[0][0]) * PX, (pts[2][1]) * PX); }
  else {
    // 服の形＋（フードなど）地と同じ布の部分。向きをそろえて重ねる
    for (const poly of [pts, ...decos.filter((d) => d.fill === '__base__' && d.poly).map((d) => d.poly!)]) { cw(poly).forEach(([x, y], i) => { const [a, b] = P(x, y); if (i) path.lineTo(a, b); else path.moveTo(a, b); }); path.closePath(); }
  }
  const polyPath = (poly: Pt[], close = true) => { const q = new Path2D(); poly.forEach(([x, y], i) => { const [a, b] = P(x, y); if (i) q.lineTo(a, b); else q.moveTo(a, b); }); if (close) q.closePath(); return q; };

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
    // 縫い目・リブ・ポケット・フードなどの細部（テンプレートの通りに）
    for (const d of decos) {
      if (d.poly && d.fill && d.fill !== '__base__') {
        const q = polyPath(d.poly); g.fillStyle = d.fill; g.fill(q);
        if (d.rib) { g.save(); g.clip(q); g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = Math.max(1, 0.12 * PX); const xs2 = d.poly.map((p) => p[0]), ys2 = d.poly.map((p) => p[1]); const [dx, dy] = d.rib.dir, nx = -dy, ny = dx; const cxp = (Math.min(...xs2) + Math.max(...xs2)) / 2, cyp = (Math.min(...ys2) + Math.max(...ys2)) / 2, R = Math.hypot(Math.max(...xs2) - Math.min(...xs2), Math.max(...ys2) - Math.min(...ys2)); for (let t = -R; t <= R; t += d.rib.gap) { const ax = cxp + nx * t, ay = cyp + ny * t; g.beginPath(); g.moveTo(...P(ax - dx * R, ay - dy * R)); g.lineTo(...P(ax + dx * R, ay + dy * R)); g.stroke(); } g.restore(); }
      }
      if (d.line) { g.strokeStyle = d.stroke || 'rgba(0,0,0,.3)'; g.lineWidth = Math.max(1, (d.width || 0.1) * PX); g.setLineDash((d.dash || []).map((v) => v * PX)); g.lineCap = 'round'; g.stroke(polyPath(d.line, false)); g.setLineDash([]); }
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
  const hot = useRef(''); const [hotV, setHotV] = useState(0);
  const frozen = useRef<{ sc: number; ox: number; oy: number; x0: number; y0: number } | null>(null);
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
  const grade = (sz: string) => { if (kind === 'scan') return; const d = GRADE[sz], base = DEF[kind]; const out: M = {}; for (const [k, v] of Object.entries(base)) out[k] = Math.round((v + d * (GRADE_STEP[k] || 0)) * 2) / 2; setM(out); };

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
        const sz = b.getSize(new THREE.Vector3()); g.position.set(-c.x, (top ? 1.45 : Math.max(1.0, sz.y + 0.03)) - b.max.y, -c.z); hold.add(g);
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
        // 背面の絵を正面と同じ枠に置き直す（フードなどで上下の範囲がちがっても位置がずれない）
        const al = document.createElement('canvas'); al.width = front.canvas.width; al.height = front.canvas.height;
        al.getContext('2d')!.drawImage(back.canvas, (back.bounds.x0 - front.bounds.x0) * PX, (back.bounds.y0 - front.bounds.y0) * PX);
        const res = buildPillow(F, layerFrom(al), heightM, depth, phone ? 1024 : 2048, phone ? 140 : 200, true);
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
    // つまんで動かしている間は、画面の縮尺を止める（服が大きくなっても指の下の点がずれないように）
    const fr = frozen.current;
    const sc = fr ? fr.sc : Math.min(cv.width / b.canvas.width, cv.height / b.canvas.height) * 0.92;
    const ox = fr ? fr.ox + (b.bounds.x0 - fr.x0) * PX * sc : (cv.width - b.canvas.width * sc) / 2, oy = fr ? fr.oy + (b.bounds.y0 - fr.y0) * PX * sc : (cv.height - b.canvas.height * sc) / 2;
    g.drawImage(b.canvas, ox, oy, b.canvas.width * sc, b.canvas.height * sc);
    const C = (x: number, y: number): Pt => [ox + (x - b.bounds.x0) * PX * sc, oy + (y - b.bounds.y0) * PX * sc];
    (cv as HTMLCanvasElement & { _map?: unknown })._map = { sc, ox, oy, x0: b.bounds.x0, y0: b.bounds.y0 };
    g.font = `${12 * dpr}px Helvetica,Arial`; g.textAlign = 'center';
    const dim = (a: Pt, z: Pt, label: string, off: Pt = [0, 0]) => { g.strokeStyle = '#d23a2a'; g.fillStyle = '#d23a2a'; g.lineWidth = 1.2 * dpr; g.beginPath(); g.moveTo(a[0] + off[0], a[1] + off[1]); g.lineTo(z[0] + off[0], z[1] + off[1]); g.stroke(); for (const p of [a, z]) { g.beginPath(); g.arc(p[0] + off[0], p[1] + off[1], 2.5 * dpr, 0, 7); g.fill(); } const mx = (a[0] + z[0]) / 2 + off[0], my = (a[1] + z[1]) / 2 + off[1]; const tw = g.measureText(label).width + 8 * dpr; g.fillStyle = '#fff'; g.fillRect(mx - tw / 2, my - 9 * dpr, tw, 16 * dpr); g.fillStyle = '#d23a2a'; g.fillText(label, mx, my + 4 * dpr); };
    const hs = kind === 'scan' ? [] : shapeOf(kind as BaseKind, m, side).handles, H = (k: string) => hs.find((h) => h.key === k)?.at;
    if (showDims && kind !== 'scan') {
      if (TOPS.includes(kind)) {
        const ua = H('ua')!, sp = H('sp')!, ct = H('cuffT')!;
        dim(C(0, 0), C(0, m.length), `${tt('Length', '着丈')} ${m.length}`, [0, 0]);
        dim(C(-ua[0], ua[1] + 1.5), C(ua[0], ua[1] + 1.5), `${tt('Chest', '身幅')} ${m.chest}`);
        dim(C(-sp[0], sp[1]), C(sp[0], sp[1]), `${tt('Shoulder', '肩幅')} ${m.shoulder}`, [0, -14 * dpr]);
        dim(C(sp[0], sp[1]), C(ct[0], ct[1]), `${tt('Sleeve', '袖丈')} ${m.sleeve}`, [6 * dpr, -10 * dpr]);
      } else if (kind === 'pants' || kind === 'shorts') {
        const hp = H('hip')!, ho = H('hemO')!;
        dim(C(-m.waist / 2, 0), C(m.waist / 2, 0), `${tt('Waist', 'ウエスト')} ${m.waist}`, [0, -10 * dpr]);
        dim(C(-hp[0], hp[1]), C(hp[0], hp[1]), `${tt('Hip', 'ヒップ')} ${m.hip}`);
        dim(C(0, 0), C(0, m.rise), `${tt('Rise', '股上')} ${m.rise}`, [-10 * dpr, 0]);
        dim(C(ho[0] + 1.5, m.rise), C(ho[0] + 1.5, m.rise + m.inseam), `${tt('Inseam', '股下')} ${m.inseam}`);
      }
    }
    // 指でつまんで形を変える点（左右どちらでも）
    if (kind !== 'scan') for (const h of hs) for (const sx of h.at[0] === 0 ? [1] : [1, -1]) {
      const [x, y] = C(h.at[0] * sx, h.at[1]), on = hot.current === h.key;
      g.beginPath(); g.arc(x, y, (on ? 9 : 7) * dpr, 0, 7); g.fillStyle = on ? '#d23a2a' : '#fff'; g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = '#d23a2a'; g.stroke();
      if (on && sx === 1) { const lab = `${tt(h.label[0], h.label[1])}`; g.font = `600 ${12 * dpr}px Helvetica,Arial`; const tw = g.measureText(lab).width + 14 * dpr; g.fillStyle = '#151515'; g.fillRect(x - tw / 2, y - 34 * dpr, tw, 20 * dpr); g.fillStyle = '#fff'; g.fillText(lab, x, y - 20 * dpr); }
    }
    const p = prints.find((q) => q.id === sel && q.side === side);
    if (p) { const [x, y] = C(p.x, p.y), w = p.w * PX * sc; g.save(); g.translate(x, y); g.rotate(p.rot * Math.PI / 180); g.strokeStyle = '#2a5bd2'; g.setLineDash([5 * dpr, 4 * dpr]); g.lineWidth = 1.5 * dpr; g.strokeRect(-w / 2, -w * 0.4, w, w * 0.8); g.setLineDash([]); g.fillStyle = '#2a5bd2'; g.fillRect(w / 2 - 6 * dpr, w * 0.4 - 6 * dpr, 12 * dpr, 12 * dpr); g.restore(); }
  }, [side, showDims, kind, m, prints, sel, hotV]);
  useEffect(() => { paint2d(); }, [paint2d]);
  useEffect(() => { const h = () => paint2d(); addEventListener('resize', h); return () => removeEventListener('resize', h); }, [paint2d]);

  // 2Dの上でプリントをドラッグして動かす・右下の四角で大きさ
  const drag = useRef<{ id: string; mode: 'move' | 'size'; sx: number; sy: number; x: number; y: number; w: number } | null>(null);
  const hdrag = useRef<{ h: Handle; sx: number } | null>(null);
  const toCm = (e: React.PointerEvent) => { const cv = view2d.current!; const mp = (cv as HTMLCanvasElement & { _map?: { sc: number; ox: number; oy: number; x0: number; y0: number } })._map; if (!mp) return null; const r = cv.getBoundingClientRect(), dpr = cv.width / r.width; const px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr; return { x: (px - mp.ox) / (PX * mp.sc) + mp.x0, y: (py - mp.oy) / (PX * mp.sc) + mp.y0 }; };
  const down = (e: React.PointerEvent) => {
    const c = toCm(e); if (!c) return;
    // 形の点をつまむ（指でも押しやすいよう、少し広めに）
    if (kind !== 'scan') {
      const mp = (view2d.current as HTMLCanvasElement & { _map?: { sc: number } })._map, reach = mp ? 22 / (PX * mp.sc) * Math.min(devicePixelRatio, 2) : 2;
      for (const h of shapeOf(kind as BaseKind, m, side).handles) for (const sx of [1, -1]) if (Math.hypot(c.x - h.at[0] * sx, c.y - h.at[1]) < Math.max(1.6, reach)) {
        hdrag.current = { h, sx }; hot.current = h.key; frozen.current = { ...(view2d.current as HTMLCanvasElement & { _map: { sc: number; ox: number; oy: number; x0: number; y0: number } })._map }; setHotV((v) => v + 1); (e.target as HTMLElement).setPointerCapture(e.pointerId); return;
      }
    }
    const hit = prints.filter((p) => p.side === side).reverse().find((p) => Math.abs(c.x - p.x) < p.w / 2 + 2 && Math.abs(c.y - p.y) < p.w * 0.45 + 2);
    if (!hit) { setSel(null); return; }
    setSel(hit.id); setTab('print');
    const corner = Math.abs(c.x - (hit.x + hit.w / 2)) < 3 && Math.abs(c.y - (hit.y + hit.w * 0.4)) < 3;
    drag.current = { id: hit.id, mode: corner ? 'size' : 'move', sx: c.x, sy: c.y, x: hit.x, y: hit.y, w: hit.w };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const hd = hdrag.current;
    if (hd) { const c = toCm(e); if (!c) return; setM((x) => { const next = hd.h.apply(x, [c.x * hd.sx, c.y]); for (const k of Object.keys(next)) { const r = RANGE[k]; if (r) next[k] = Math.max(r[0], Math.min(r[1], next[k])); } return next; }); return; }
    const d = drag.current; if (!d) return; const c = toCm(e); if (!c) return;
    setPrints((ps) => ps.map((p) => (p.id !== d.id ? p : d.mode === 'move' ? { ...p, x: Math.round((d.x + c.x - d.sx) * 2) / 2, y: Math.round((d.y + c.y - d.sy) * 2) / 2 } : { ...p, w: Math.max(2, Math.round((d.w + (c.x - d.sx) * 2) * 2) / 2) })));
  };
  const up = () => { drag.current = null; if (hdrag.current) { hdrag.current = null; hot.current = ''; frozen.current = null; setHotV((v) => v + 1); } };

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
  // ---- 声で操作 ----
  const [mic, setMic] = useState<'off' | 'on'>('off');
  const [heard, setHeard] = useState('');
  const [did, setDid] = useState('');
  const [voiceHelp, setVoiceHelp] = useState(false);
  const hist = useRef<{ kind: Kind; m: M; color: string; fabric: Fabric; prints: Print[] }[]>([]);
  const stopMic = useRef<() => void>(() => undefined);
  const say = (t: string) => { setDid(t); if (canSpeak()) speak(t, { urgent: true }); };
  const runVoice = (text: string) => {
    const acts = parseVoice(text);
    if (!acts.length) { say(tt('Sorry, I did not catch a command. Try “length 72” or “colour black”.', 'うまく聞き取れませんでした。「着丈72センチ」「色を黒に」のように話してください。')); return; }
    const u = acts.find((a) => a.t === 'undo');
    if (u) { const h = hist.current.pop(); if (h) { setKind(h.kind); setM(h.m); setColor(h.color); setFabric(h.fabric); setPrints(h.prints); say(tt('Undone.', '元に戻しました。')); } else say(tt('Nothing to undo.', '戻せる操作がありません。')); return; }
    hist.current.push({ kind, m, color, fabric, prints }); if (hist.current.length > 20) hist.current.shift();
    let k = kind, mm: M = { ...m }; const done: string[] = [];
    for (const a of acts) {
      if (a.t === 'kind' && a.v in DEF) { k = a.v as Kind; mm = { ...DEF[a.v as Exclude<Kind, 'scan'>] }; done.push(tt(TEMPLATES[a.v as BaseKind].en, TEMPLATES[a.v as BaseKind].ja)); }
      if (a.t === 'size' && k !== 'scan' && a.v in GRADE) { const d = GRADE[a.v], base = DEF[k as Exclude<Kind, 'scan'>]; mm = {}; for (const [q, v] of Object.entries(base)) mm[q] = Math.round((v + d * (GRADE_STEP[q] || 0)) * 2) / 2; done.push(tt(`size ${a.v}`, `${a.v}サイズ`)); }
      if (a.t === 'set' || a.t === 'add') {
        const key = a.k === 'hem' && (k === 'pants' || k === 'shorts') ? 'hemW' : a.k;
        if (!(key in mm)) { done.push(tt(`this shape has no ${LABEL[key]?.[0] || key}`, `この形に「${LABEL[key]?.[1] || key}」はありません`)); continue; }
        const r = RANGE[key] || [1, 200], v = Math.round(Math.max(r[0], Math.min(r[1], a.t === 'set' ? a.v : mm[key] + a.v)) * 2) / 2;
        mm[key] = v; done.push(tt(`${LABEL[key]?.[0] || key} ${v} cm`, `${LABEL[key]?.[1] || key}を${v}センチ`));
      }
      if (a.t === 'color') { setColor(a.v); if (k === 'scan') setTint(true); done.push(tt(`colour ${a.name}`, `色を${a.name}`)); }
      if (a.t === 'fabric' && k !== 'scan') { setFabric(a.v as Fabric); done.push(tt(FABRICS.find((f) => f[0] === a.v)?.[1] || a.v, FABRICS.find((f) => f[0] === a.v)?.[2] || a.v)); }
      if (a.t === 'side') { setSide(a.v); done.push(a.v === 'back' ? tt('back', '背中') : tt('front', '正面')); }
      if (a.t === 'text') { const id = 'p' + Date.now().toString(36); const bottom = k === 'pants' || k === 'shorts'; setPrints((ps) => [...ps, { id, type: 'text', side, text: a.v, font: 'sans', color: color === '#f4f3ef' || color === '#e8e3d6' ? '#141414' : '#f1ece2', x: bottom ? 10 : 0, y: bottom ? 14 : 22, w: bottom ? 12 : 24, rot: 0, opacity: 0.95, crack: false }]); setSel(id); setTab('print'); done.push(tt(`added the text “${a.v}”`, `文字「${a.v}」を追加`)); }
    }
    if (k !== kind) setKind(k);
    if (JSON.stringify(mm) !== JSON.stringify(m)) setM(mm);
    if (acts.some((a) => a.t === 'save')) { setTimeout(() => save(), 700); done.push(tt('saving to the store', '店に並べます')); }
    say(done.join(tt(', ', '、')) + tt('.', '。'));
  };
  const toggleMic = () => {
    if (mic === 'on') { stopMic.current(); setMic('off'); return; }
    unlockSpeech(); setHeard(''); setDid('');
    stopMic.current = listen((t) => { setHeard(t); runVoice(t); }, (t) => setHeard(t), (st, err) => { if (st === 'on') setMic('on'); else { setMic('off'); if (st === 'error' && err && err !== 'no-speech' && err !== 'aborted') setDid(err === 'not-allowed' ? tt('Microphone access was not allowed.', 'マイクの使用が許可されていません。') : tt('Voice input stopped.', '音声入力が止まりました。')); } });
  };

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
  // 型紙（パターンラボ）へ：寸法を型紙の仕様に、色・生地・プリントもいっしょに渡す
  const toPattern = () => {
    if (!TOPS.includes(kind)) return;
    const spec = { neckW: m.neck / 2, neckF: m.neckDrop || 9, neckB: 2.5, shoulderX: m.shoulder / 2, drop: 4, chest: m.chest / 2, armY: m.armhole || Math.max(16, m.chest * 0.43), hem: m.hem / 2, length: m.length, sleeve: m.sleeve, cuff: m.sleeveOpen, sleeves: true };
    const phys = fabric === 'corduroy' ? 'canvas' : fabric === 'image' ? 'jersey' : fabric;
    try {
      localStorage.setItem('gc-pattern-src', JSON.stringify({ spec, color, fabric: phys, tile: fabric, texSrc: fabric === 'image' ? texSrc : undefined, prints: prints.map((p) => ({ ...p, piece: p.side })) }));
      location.hash = 'pattern'; dispatchEvent(new HashChangeEvent('hashchange'));
    } catch { setMsg(tt('Could not hand over (storage is full).', '引き継げませんでした（保存領域がいっぱいです）。')); }
  };
  return (
    <section className="mk">
      <div className="mk-stage">
        <div className="mk-3d" ref={host3d} aria-label={tt('3D at real size', '実物大の3D')} />
        <div className="mk-badge">{tt('Real size — grid 10 cm · figure 175 cm', '実物大 — 床の格子10cm・人の影175cm')}</div>
        <div className="mk-2d">
          <div className="mk-2dbar">
            <div className="mk-seg"><button aria-pressed={side === 'front'} onClick={() => setSide('front')}>{tt('Front', '正面')}</button><button aria-pressed={side === 'back'} onClick={() => setSide('back')}>{tt('Back', '背中')}</button></div>
            <label className="mk-chk"><input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} />{tt('Measurements', '寸法線')}</label>
            {canListen() && <button className={`mk-mic ${mic === 'on' ? 'on' : ''}`} onClick={toggleMic} aria-pressed={mic === 'on'} aria-label={tt('Voice control', '声で操作')}><svg viewBox="0 0 24 24" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>{mic === 'on' ? tt('Listening…', '聞いています…') : tt('Voice', '声で操作')}</button>}
            <button className="mk-q" onClick={() => setVoiceHelp((v) => !v)} aria-label={tt('Voice examples', '話し方の例')}>?</button>
          </div>
          {(heard || did || voiceHelp) && (
            <div className="mk-voice">
              {heard && <p><b>{tt('Heard', '聞き取り')}</b>「{heard}」</p>}
              {did && <p><b>{tt('Done', '反映')}</b>{did}</p>}
              {voiceHelp && <p className="mk-fine">{tt('Try: “hoodie”, “size L”, “length 72”, “chest 2 cm bigger”, “sleeve minus 3”, “colour black”, “denim”, “back”, “text TOKYO add”, “undo”, “save”. Speech is turned into text by the browser’s own recognition (in Chrome this is done on the browser maker’s server).', '例：「パーカー」「Lサイズ」「着丈72センチ」「身幅を2センチ大きく」「袖丈マイナス3」「色を黒に」「デニム」「背中」「文字 TOKYO を追加」「元に戻して」「保存」。声の文字起こしはブラウザの音声認識を使います（Chrome ではブラウザ提供元のサーバーで処理されます）。')}</p>}
            </div>
          )}
          <div className="mk-2dwrap"><canvas ref={view2d} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} /></div>
          <small>{tt('Drag the red points to reshape (each changes a measurement) · drag a print to move it, its blue corner to resize', '赤い点をつまんで形を直す（寸法に反映）・プリントはドラッグで移動、青い角で大きさ')}</small>
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
                  <input type="range" min={RANGE[k]?.[0] ?? 5} max={RANGE[k]?.[1] ?? 110} step={0.5} value={m[k]} onChange={(e) => setM((x) => ({ ...x, [k]: Number(e.target.value) }))} />
                </label>
              ))}
            </div>
            <p className="mk-fine">{tt('Measured flat, in centimetres, to 0.5 cm. The 3D shows the piece at this exact size.', '平置きで測った数字（cm・0.5cm単位）。3Dはこの大きさのまま表示します。')}</p>
            {TOPS.includes(kind) && (
              <div className="mk-pat">
                <button className="ss-btn" onClick={toPattern}>{tt('Sew it precisely from a pattern →', '型紙から精密に縫う（3D縫製）→')}</button>
                <p className="mk-fine">{tt('Turns these measurements into a real pattern (front, back, sleeves), then sews it as cloth on an avatar — with fabric physics, strain and fit maps, like CLO. Colour, fabric and prints come along.', 'この寸法から型紙（前身頃・後身頃・袖）をつくり、アバターに布として縫って着せます。CLOのように生地の物性・ひずみ・フィットを確かめられます。色・生地・プリントも引き継ぎます。')}</p>
              </div>
            )}
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
