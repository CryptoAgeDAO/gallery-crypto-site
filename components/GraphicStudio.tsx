'use client';
// グラフィックスタジオ：写真を取り込むと、AIで背景を消し、プリントに使える完成度の高いグラフィックに変える。
// スタイル：スクリーンプリント（色分解）／ステンシル（2階調）／線画イラスト／網点（ハーフトーン）／リソ（2色ずれ）。
// かすれ（ヴィンテージ加工）と、Tシャツに乗せた見本つき。PNG（透明）・SVG（ベクター）・版ごとのPNG（ZIP）で書き出す。
// 処理はすべてこの端末の中。背景除去AIは PhotoStudio と同じ BiRefNet。
import { useEffect, useMemo, useRef, useState } from 'react';
import { aiMask, fallbackMask } from './PhotoStudio';
import { tt } from './Lang';

type Style = 'screen' | 'stencil' | 'line' | 'halftone' | 'riso';
type Opt = { style: Style; colors: number; detail: number; ink: string; ink2: string; paper: 'none' | 'tee'; tee: string; distress: number; cell: number; angle: number; thick: number; contrast: number; cut: boolean };
const PREVIEW = 900;

function canvasOf(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
async function fileToCanvas(f: File, max: number) {
  const url = URL.createObjectURL(f);
  const im = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  URL.revokeObjectURL(url);
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = canvasOf(Math.round(im.naturalWidth * k), Math.round(im.naturalHeight * k));
  c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
  return c;
}
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function scaleTo(c: HTMLCanvasElement, w: number, h: number) { const d = canvasOf(w, h); d.getContext('2d')!.drawImage(c, 0, 0, w, h); return d; }
function blurred(c: HTMLCanvasElement, px: number) { const d = canvasOf(c.width, c.height), x = d.getContext('2d')!; x.filter = `blur(${px}px)`; x.drawImage(c, 0, 0); return d; }
function gray(c: HTMLCanvasElement, contrast: number) {
  const x = c.getContext('2d', { willReadFrequently: true })!, d = x.getImageData(0, 0, c.width, c.height).data;
  const g = new Float32Array(c.width * c.height);
  for (let i = 0; i < g.length; i++) { const v = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255; g[i] = Math.min(1, Math.max(0, (v - 0.5) * contrast + 0.5)); }
  return g;
}

// 写真と切り抜きの形を、同じ大きさにそろえて受け取る
type Src = { img: HTMLCanvasElement; alpha: Uint8ClampedArray };
function resized(s: Src, w: number, h: number): Src {
  const img = scaleTo(s.img, w, h);
  const m = canvasOf(s.img.width, s.img.height), mx = m.getContext('2d')!, md = mx.createImageData(m.width, m.height);
  for (let i = 0; i < s.alpha.length; i++) md.data[i * 4 + 3] = s.alpha[i];
  mx.putImageData(md, 0, 0);
  const a = scaleTo(m, w, h).getContext('2d')!.getImageData(0, 0, w, h).data;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = a[i * 4 + 3];
  return { img, alpha };
}

// k-means で色を減らす（サンプルで中心を決めて全画素に割り当て）
function quantize(d: Uint8ClampedArray, alpha: Uint8ClampedArray, k: number) {
  const n = alpha.length, samples: number[][] = [];
  const stride = Math.max(1, Math.floor(n / 24000));
  for (let i = 0; i < n; i += stride) if (alpha[i] > 127) samples.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
  if (!samples.length) return { pal: [[0, 0, 0]], lab: new Uint8Array(n) };
  // k-means++ 風の初期化：明るさ順に等間隔
  samples.sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let C = Array.from({ length: k }, (_, i) => [...samples[Math.min(samples.length - 1, Math.floor(((i + 0.5) / k) * samples.length))]]);
  for (let it = 0; it < 12; it++) {
    const acc = C.map(() => [0, 0, 0, 0]);
    for (const s of samples) { let b = 0, bd = Infinity; for (let j = 0; j < C.length; j++) { const e = (s[0] - C[j][0]) ** 2 + (s[1] - C[j][1]) ** 2 + (s[2] - C[j][2]) ** 2; if (e < bd) { bd = e; b = j; } } acc[b][0] += s[0]; acc[b][1] += s[1]; acc[b][2] += s[2]; acc[b][3]++; }
    C = C.map((c, j) => (acc[j][3] ? [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] : c));
  }
  const lab = new Uint8Array(n);
  for (let i = 0; i < n; i++) { let b = 0, bd = Infinity; for (let j = 0; j < C.length; j++) { const e = (d[i * 4] - C[j][0]) ** 2 + (d[i * 4 + 1] - C[j][1]) ** 2 + (d[i * 4 + 2] - C[j][2]) ** 2; if (e < bd) { bd = e; b = j; } } lab[i] = b; }
  return { pal: C.map((c) => c.map(Math.round)), lab };
}
// 小さな点を消す（多数決フィルタ）
function majority(lab: Uint8Array, w: number, h: number, k: number, passes: number) {
  for (let p = 0; p < passes; p++) {
    const src = lab.slice(), cnt = new Uint16Array(k);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      cnt.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cnt[src[(y + dy) * w + x + dx]]++;
      let b = src[y * w + x], bc = 0;
      for (let j = 0; j < k; j++) if (cnt[j] > bc) { bc = cnt[j]; b = j; }
      if (bc >= 5) lab[y * w + x] = b;
    }
  }
}

// かすれ（使い込んだプリントのひび・抜け）用の模様
function distressMask(w: number, h: number, amt: number, seed = 7) {
  const c = canvasOf(w, h), x = c.getContext('2d')!;
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // 細かいノイズを重ねて、しきい値で抜く
  const layer = (cell: number, a: number) => {
    const t = canvasOf(Math.ceil(w / cell), Math.ceil(h / cell)), tx = t.getContext('2d')!, d = tx.createImageData(t.width, t.height);
    for (let i = 0; i < d.data.length; i += 4) { const v = rnd() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    tx.putImageData(d, 0, 0);
    x.globalAlpha = a; x.imageSmoothingEnabled = true; x.drawImage(t, 0, 0, w, h);
  };
  x.fillStyle = '#808080'; x.fillRect(0, 0, w, h);
  layer(Math.max(2, Math.round(w / 260)), 0.6); layer(Math.max(4, Math.round(w / 70)), 0.45); layer(Math.max(8, Math.round(w / 18)), 0.35);
  // ひび割れ
  x.globalAlpha = 1; x.strokeStyle = '#000'; x.lineCap = 'round';
  for (let i = 0; i < 40 * amt; i++) {
    let px = rnd() * w, py = rnd() * h; x.lineWidth = Math.max(1, (w / 900) * (0.5 + rnd()));
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (rnd() - 0.5) * w * 0.05; py += (rnd() - 0.5) * h * 0.05; x.lineTo(px, py); }
    x.stroke();
  }
  const d = x.getImageData(0, 0, w, h).data, keep = new Uint8Array(w * h);
  const th = 128 - 70 * amt;
  for (let i = 0; i < keep.length; i++) keep[i] = d[i * 4] > th ? 1 : 0;
  return keep;
}

// ---- 各スタイルの描画（RGBA を返す。透明＝インクなし） ----
type Out = { canvas: HTMLCanvasElement; pal: number[][]; lab?: Uint8Array };
function render(src: Src, o: Opt, W: number, H: number): Out {
  const s = resized(src, W, H);
  const out = canvasOf(W, H), ox = out.getContext('2d')!, od = ox.createImageData(W, H);
  const alpha = o.cut ? s.alpha : new Uint8ClampedArray(W * H).fill(255);
  const scale = W / PREVIEW;
  let pal: number[][] = [];
  let lab: Uint8Array | undefined;
  if (o.style === 'screen') {
    const pre = blurred(s.img, Math.max(0.5, (6 - o.detail) * 0.6 * scale));
    const d = pre.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
    const q = quantize(d, alpha, o.colors);
    majority(q.lab, W, H, o.colors, Math.round((6 - o.detail) * scale) + 1);
    pal = q.pal; lab = q.lab;
    for (let i = 0; i < W * H; i++) { const c = pal[q.lab[i]]; od.data[i * 4] = c[0]; od.data[i * 4 + 1] = c[1]; od.data[i * 4 + 2] = c[2]; od.data[i * 4 + 3] = alpha[i] > 127 ? 255 : 0; }
  } else if (o.style === 'stencil') {
    const pre = blurred(s.img, Math.max(0.5, (6 - o.detail) * 0.8 * scale));
    const g = gray(pre, o.contrast);
    const ink = hex(o.ink);
    const l = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) l[i] = alpha[i] > 127 && g[i] < 0.5 ? 1 : 0;
    majority(l, W, H, 2, Math.round((6 - o.detail) * scale) + 1);
    pal = [ink]; lab = l;
    for (let i = 0; i < W * H; i++) { od.data[i * 4] = ink[0]; od.data[i * 4 + 1] = ink[1]; od.data[i * 4 + 2] = ink[2]; od.data[i * 4 + 3] = l[i] ? 255 : 0; }
  } else if (o.style === 'line') {
    // XDoG（差分ガウシアン）でイラスト風の線と影
    const sg = (0.6 + (6 - o.detail) * 0.35) * scale;
    const g1 = gray(blurred(s.img, sg), o.contrast), g2 = gray(blurred(s.img, sg * 1.6), o.contrast);
    const ink = hex(o.ink);
    const tau = 0.985, eps = 0.0, phi = 120 * o.thick;
    for (let i = 0; i < W * H; i++) {
      const D = g1[i] - tau * g2[i];
      const v = D >= eps ? 1 : 1 + Math.tanh(phi * (D - eps));
      const a = alpha[i] > 127 ? Math.round((1 - Math.max(0, Math.min(1, v))) * 255) : 0;
      od.data[i * 4] = ink[0]; od.data[i * 4 + 1] = ink[1]; od.data[i * 4 + 2] = ink[2]; od.data[i * 4 + 3] = a > 90 ? 255 : a > 40 ? a : 0;
    }
    pal = [ink];
  } else if (o.style === 'halftone' || o.style === 'riso') {
    ox.putImageData(od, 0, 0);
    const g = gray(blurred(s.img, scale), o.contrast);
    const inks = o.style === 'riso' ? [hex(o.ink), hex(o.ink2)] : [hex(o.ink)];
    const cell = Math.max(3, o.cell * scale);
    inks.forEach((ink, ii) => {
      const ang = ((o.angle + ii * 30) * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
      const off = o.style === 'riso' ? ii * cell * 0.35 : 0;
      ox.fillStyle = `rgb(${ink[0]},${ink[1]},${ink[2]})`;
      ox.globalCompositeOperation = o.style === 'riso' ? 'multiply' : 'source-over';
      const R = Math.hypot(W, H);
      for (let v = -R; v < R; v += cell) for (let u = -R; u < R; u += cell) {
        const px = W / 2 + u * ca - v * sa + off, py = H / 2 + u * sa + v * ca + off * 0.6;
        if (px < -cell || py < -cell || px > W + cell || py > H + cell) continue;
        const xi = Math.min(W - 1, Math.max(0, Math.round(px))), yi = Math.min(H - 1, Math.max(0, Math.round(py)));
        if (alpha[yi * W + xi] < 128) continue;
        // 2色のときは、暗い所をインク1、中間をインク2 に振り分け
        let dark = 1 - g[yi * W + xi];
        if (inks.length === 2) dark = ii === 0 ? Math.max(0, dark - 0.35) / 0.65 : Math.min(1, dark * 1.3) * 0.8;
        const r = Math.sqrt(dark) * cell * 0.62;
        if (r < 0.35) continue;
        ox.beginPath(); ox.arc(px, py, r, 0, Math.PI * 2); ox.fill();
      }
    });
    ox.globalCompositeOperation = 'source-over';
    pal = inks;
    const dd = ox.getImageData(0, 0, W, H);
    // multiply で白く残った所は透明に
    for (let i = 0; i < W * H; i++) { const r = dd.data[i * 4], gg = dd.data[i * 4 + 1], b = dd.data[i * 4 + 2]; if (dd.data[i * 4 + 3] && r > 245 && gg > 245 && b > 245) dd.data[i * 4 + 3] = 0; }
    od.data.set(dd.data);
  }
  // かすれ
  if (o.distress > 0) {
    const keep = distressMask(W, H, o.distress);
    for (let i = 0; i < W * H; i++) if (!keep[i]) od.data[i * 4 + 3] = 0;
    if (lab) for (let i = 0; i < W * H; i++) if (!keep[i]) lab[i] = 255;
  }
  ox.putImageData(od, 0, 0);
  return { canvas: out, pal, lab };
}

// Tシャツに乗せた見本（オリジナルの簡単なシルエット）
function teeMock(g: HTMLCanvasElement, color: string) {
  const W = 900, H = 1000, c = canvasOf(W, H), x = c.getContext('2d')!;
  x.fillStyle = '#ecebe8'; x.fillRect(0, 0, W, H);
  x.fillStyle = color;
  x.beginPath();
  x.moveTo(330, 90); x.quadraticCurveTo(450, 150, 570, 90); x.lineTo(760, 160); x.lineTo(870, 380); x.lineTo(740, 440); x.lineTo(700, 360);
  x.lineTo(700, 960); x.lineTo(200, 960); x.lineTo(200, 360); x.lineTo(160, 440); x.lineTo(30, 380); x.lineTo(140, 160); x.closePath();
  x.shadowColor = 'rgba(0,0,0,.18)'; x.shadowBlur = 30; x.shadowOffsetY = 10; x.fill(); x.shadowColor = 'transparent';
  x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = 10; x.beginPath(); x.moveTo(330, 92); x.quadraticCurveTo(450, 155, 570, 92); x.stroke();
  const bw = 380, k = Math.min(bw / g.width, 470 / g.height);
  x.globalAlpha = 0.94;
  x.drawImage(g, 450 - (g.width * k) / 2, 230, g.width * k, g.height * k);
  x.globalAlpha = 1;
  // 布のしわの陰影
  const sh = x.createLinearGradient(200, 0, 700, 0); sh.addColorStop(0, 'rgba(0,0,0,.10)'); sh.addColorStop(0.5, 'rgba(255,255,255,.04)'); sh.addColorStop(1, 'rgba(0,0,0,.12)');
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = sh; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over';
  return c;
}

const STYLES: [Style, string, string][] = [
  ['screen', 'Screen print', 'スクリーンプリント'],
  ['stencil', 'Stencil', 'ステンシル'],
  ['line', 'Line art', '線画イラスト'],
  ['halftone', 'Halftone', '網点'],
  ['riso', 'Riso 2-color', 'リソ2色'],
];

export default function GraphicStudio() {
  const [src, setSrc] = useState<Src | null>(null);
  const [cutOk, setCutOk] = useState<'none' | 'ai' | 'simple'>('none');
  const [o, setO] = useState<Opt>({ style: 'screen', colors: 4, detail: 3, ink: '#111111', ink2: '#FF3D7F', paper: 'tee', tee: '#f3efe6', distress: 0, cell: 9, angle: 45, thick: 1, contrast: 1.2, cut: true });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [res, setRes] = useState<Out | null>(null);
  const pv = useRef<HTMLCanvasElement>(null);
  const mk = useRef<HTMLCanvasElement>(null);
  const set = (p: Partial<Opt>) => setO((v) => ({ ...v, ...p }));

  const pick = async (f?: File) => {
    if (!f) return;
    setMsg(''); setRes(null);
    const img = await fileToCanvas(f, 2400);
    let alpha: Uint8ClampedArray;
    try { alpha = await aiMask(img, setBusy); setCutOk('ai'); }
    catch (e) { alpha = fallbackMask(img); setCutOk('simple'); setMsg(tt('The background AI could not start on this device, so a simpler cut-out was used. ', 'この端末では背景除去AIを起動できなかったため、簡易な切り抜きを使いました。') + (e as Error).message); }
    setBusy('');
    setSrc({ img, alpha });
  };

  // プレビュー（設定が変わるたびに描き直す）
  const size = useMemo(() => { if (!src) return null; const k = PREVIEW / Math.max(src.img.width, src.img.height); return { w: Math.round(src.img.width * k), h: Math.round(src.img.height * k) }; }, [src]);
  useEffect(() => {
    if (!src || !size) return;
    const t = setTimeout(() => {
      const r = render(src, o, size.w, size.h);
      setRes(r);
      const c = pv.current; if (c) { c.width = r.canvas.width; c.height = r.canvas.height; c.getContext('2d')!.drawImage(r.canvas, 0, 0); }
      const m = mk.current; if (m) { const t2 = teeMock(r.canvas, o.tee); m.width = t2.width; m.height = t2.height; m.getContext('2d')!.drawImage(t2, 0, 0); }
    }, 60);
    return () => clearTimeout(t);
  }, [src, o, size]);

  const full = () => { if (!src) return null; const k = 3600 / Math.max(src.img.width, src.img.height); return render(src, o, Math.round(src.img.width * k), Math.round(src.img.height * k)); };
  const dl = (b: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); };
  const exportPng = async () => {
    setBusy(tt('Rendering at print size…', '印刷サイズで描き出し中…'));
    await new Promise((r) => setTimeout(r, 30));
    const r = full(); if (!r) return;
    r.canvas.toBlob((b) => { if (b) dl(b, `gc-graphic-${o.style}.png`); setBusy(''); }, 'image/png');
  };
  const exportSvg = async () => {
    if (!src || !size) return;
    setBusy(tt('Tracing to vector…', 'ベクターに変換中…'));
    await new Promise((r) => setTimeout(r, 30));
    const k = Math.min(1, 1600 / Math.max(src.img.width, src.img.height));
    const r = render(src, { ...o, distress: o.style === 'screen' || o.style === 'stencil' ? o.distress : 0 }, Math.round(src.img.width * k), Math.round(src.img.height * k));
    const ImageTracer = (await import('imagetracerjs')).default as unknown as { imagedataToSVG: (d: ImageData, opt: Record<string, unknown>) => string };
    const d = r.canvas.getContext('2d')!.getImageData(0, 0, r.canvas.width, r.canvas.height);
    const pal = [...r.pal.map((c) => ({ r: c[0], g: c[1], b: c[2], a: 255 })), { r: 0, g: 0, b: 0, a: 0 }];
    let svg = ImageTracer.imagedataToSVG(d, { pal, ltres: 0.6, qtres: 0.6, pathomit: 6, colorsampling: 0, colorquantcycles: 1, strokewidth: 0, linefilter: true, roundcoords: 1, viewbox: true, blurradius: 0 });
    svg = svg.replace(/<path[^>]*opacity="0"[^>]*\/>/g, '');
    dl(new Blob([svg], { type: 'image/svg+xml' }), `gc-graphic-${o.style}.svg`);
    setBusy('');
  };
  const exportSeps = async () => {
    setBusy(tt('Separating colors…', '版を分けています…'));
    await new Promise((r) => setTimeout(r, 30));
    const r = full(); if (!r) return;
    const { zipSync } = await import('fflate');
    const files: Record<string, Uint8Array> = {};
    const W = r.canvas.width, H = r.canvas.height;
    const d = r.canvas.getContext('2d')!.getImageData(0, 0, W, H).data;
    for (let j = 0; j < r.pal.length; j++) {
      const c = canvasOf(W, H), x = c.getContext('2d')!, od = x.createImageData(W, H);
      const p = r.pal[j];
      for (let i = 0; i < W * H; i++) {
        const on = r.lab ? r.lab[i] === j && d[i * 4 + 3] > 0 : d[i * 4 + 3] > 0 && Math.abs(d[i * 4] - p[0]) + Math.abs(d[i * 4 + 1] - p[1]) + Math.abs(d[i * 4 + 2] - p[2]) < 60;
        if (on) { od.data[i * 4 + 3] = 255; }
      }
      x.putImageData(od, 0, 0);
      const b: Blob = await new Promise((res) => c.toBlob((bb) => res(bb!), 'image/png'));
      const hx = p.map((v) => v.toString(16).padStart(2, '0')).join('');
      files[`plate-${j + 1}-${hx}.png`] = new Uint8Array(await b.arrayBuffer());
    }
    const z = zipSync(files, { level: 0 });
    dl(new Blob([z as BlobPart], { type: 'application/zip' }), `gc-plates-${o.style}.zip`);
    setBusy('');
  };

  return (
    <div className="gs">
      {!src ? (
        <label className="ai-drop">
          <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <b>{tt('Choose a photo', '写真を選ぶ')}</b>
          <span>{tt('The AI removes the background, then the photo becomes a print-ready graphic: screen print, stencil, line art, halftone or riso.', 'AIが背景を消して、プリントに使えるグラフィック（スクリーンプリント、ステンシル、線画、網点、リソ）に変えます。')}</span>
        </label>
      ) : (
        <div className="gs-main">
          <div className="gs-views">
            <div className="gs-v"><span>{tt('Graphic', 'グラフィック')}</span><canvas ref={pv} className="gs-cv" /></div>
            <div className="gs-v"><span>{tt('On a tee (sample)', 'Tシャツに乗せた見本')}</span><canvas ref={mk} className="gs-cv" /></div>
          </div>
          <aside className="ai-panel">
            <h5>{tt('Style', 'スタイル')}</h5>
            <div className="gm-row">
              {STYLES.map(([k, en, ja]) => <button key={k} type="button" className={`btn${o.style === k ? ' primary' : ''}`} onClick={() => set({ style: k })}>{tt(en, ja)}</button>)}
            </div>
            {o.style === 'screen' && <label className="gm-sl">{tt('Colors', '色数')} <input type="range" min={2} max={8} value={o.colors} onChange={(e) => set({ colors: +e.target.value })} /> <b>{o.colors}</b></label>}
            {(o.style === 'screen' || o.style === 'stencil' || o.style === 'line') && <label className="gm-sl">{tt('Detail', '細かさ')} <input type="range" min={1} max={5} value={o.detail} onChange={(e) => set({ detail: +e.target.value })} /> <b>{o.detail}</b></label>}
            {o.style === 'line' && <label className="gm-sl">{tt('Line weight', '線の強さ')} <input type="range" min={0.3} max={3} step={0.1} value={o.thick} onChange={(e) => set({ thick: +e.target.value })} /> <b>{o.thick.toFixed(1)}</b></label>}
            {(o.style === 'halftone' || o.style === 'riso') && (
              <>
                <label className="gm-sl">{tt('Dot size', '網点の大きさ')} <input type="range" min={4} max={24} value={o.cell} onChange={(e) => set({ cell: +e.target.value })} /> <b>{o.cell}</b></label>
                <label className="gm-sl">{tt('Angle', '角度')} <input type="range" min={0} max={90} value={o.angle} onChange={(e) => set({ angle: +e.target.value })} /> <b>{o.angle}°</b></label>
              </>
            )}
            {o.style !== 'screen' && <label className="gm-sl">{tt('Contrast', 'コントラスト')} <input type="range" min={0.6} max={2.5} step={0.05} value={o.contrast} onChange={(e) => set({ contrast: +e.target.value })} /> <b>{o.contrast.toFixed(1)}</b></label>}
            {o.style !== 'screen' && (
              <div className="gm-row">
                <span>{tt('Ink', 'インク')}</span>
                <input type="color" value={o.ink} onChange={(e) => set({ ink: e.target.value })} />
                {o.style === 'riso' && <input type="color" value={o.ink2} onChange={(e) => set({ ink2: e.target.value })} />}
              </div>
            )}
            <label className="gm-sl">{tt('Vintage wear', 'かすれ（古着感）')} <input type="range" min={0} max={1} step={0.05} value={o.distress} onChange={(e) => set({ distress: +e.target.value })} /> <b>{Math.round(o.distress * 100)}</b></label>
            <label className="gm-ck"><input type="checkbox" checked={o.cut} onChange={(e) => set({ cut: e.target.checked })} /> {tt('Remove background', '背景を消す')} {cutOk === 'ai' ? '(AI)' : cutOk === 'simple' ? tt('(simple)', '（簡易）') : ''}</label>
            <div className="gm-row">
              <span>{tt('Tee color', 'Tシャツの色')}</span>
              {['#f3efe6', '#ffffff', '#1a1a1c', '#3b4a3a', '#8a1c22'].map((c) => <button key={c} type="button" className="gm-sw" aria-pressed={o.tee === c} style={{ background: c }} onClick={() => set({ tee: c })} aria-label={c} />)}
            </div>
            <h5>{tt('Export', '書き出し')}</h5>
            <div className="gm-row">
              <button type="button" className="btn primary" disabled={!!busy} onClick={exportPng}>{tt('PNG (print size)', 'PNG（印刷サイズ）')}</button>
              {(o.style === 'screen' || o.style === 'stencil') && <button type="button" className="btn" disabled={!!busy} onClick={exportSvg}>{tt('SVG (vector)', 'SVG（ベクター）')}</button>}
              {(o.style === 'screen' || o.style === 'riso' || o.style === 'stencil') && <button type="button" className="btn" disabled={!!busy} onClick={exportSeps}>{tt('Plates per color (ZIP)', '色ごとの版（ZIP）')}</button>}
            </div>
            <p className="note">{tt('PNG is 3600 px on the long side with a transparent background (about 30 cm at 300 dpi).', 'PNG は長い辺 3600px・背景透明です（300dpi で約30cm）。')}</p>
            <label className="btn" style={{ cursor: 'pointer' }}>
              {tt('Use another photo', '別の写真にする')}
              <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {res && <p className="note">{tt(`${res.pal.length} ink${res.pal.length > 1 ? 's' : ''}`, `インク ${res.pal.length} 色`)}</p>}
          </aside>
        </div>
      )}
      {busy && <div className="ai-busy" style={{ position: 'static' }}><i /> {busy}</div>}
      {msg && <p className="note">{msg}</p>}
    </div>
  );
}
