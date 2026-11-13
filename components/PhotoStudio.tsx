'use client';
// フォトスタジオ（Photoroom のような商品写真づくり）：
// 何枚でも取り込み → AIで背景を自動で消す → 背景・影・余白・サイズのテンプレートを全部にまとめて適用 → 個別に手直し → まとめて書き出し。
// 背景除去AIは BiRefNet（MIT）をブラウザの中で動かす。写真はどこにも送らない。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { autoBackground, selectGarment, type Layer } from './GhostMannequin';
import { tt } from './Lang';

const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.web.min.js';
const MODEL = 'onnx-community/BiRefNet_lite-ONNX';
const MAXSRC = 2000;

type Item = { id: string; name: string; src: HTMLCanvasElement; mask: Uint8ClampedArray; status: 'wait' | 'run' | 'ok' | 'fallback' | 'err' };
type Bg = 'white' | 'offwhite' | 'black' | 'color' | 'gradient' | 'studio' | 'transparent' | 'image';
type Shadow = 'none' | 'soft' | 'floor' | 'reflection';
type Tpl = { bg: Bg; color: string; color2: string; shadow: Shadow; size: string; pad: number; align: 'center' | 'bottom'; mark: boolean; bgImg?: HTMLImageElement | null };

const SIZES: Record<string, { w: number; h: number; label: [string, string] }> = {
  sq: { w: 2000, h: 2000, label: ['Square 1:1', '正方形 1:1'] },
  ig: { w: 1080, h: 1350, label: ['Instagram 4:5', 'インスタ投稿 4:5'] },
  story: { w: 1080, h: 1920, label: ['Story 9:16', 'ストーリー 9:16'] },
  ec: { w: 1500, h: 2000, label: ['Shop 3:4', '商品ページ 3:4'] },
  wide: { w: 1920, h: 1080, label: ['Wide 16:9', '横長 16:9'] },
};
const PRESETS: { k: string; l: [string, string]; t: Partial<Tpl> }[] = [
  { k: 'ec', l: ['Shop white', 'ECの白背景'], t: { bg: 'white', shadow: 'floor', size: 'ec', pad: 8, align: 'center' } },
  { k: 'studio', l: ['Studio', 'スタジオ'], t: { bg: 'studio', shadow: 'soft', size: 'sq', pad: 10, align: 'bottom' } },
  { k: 'dark', l: ['Dark gallery', 'ダークギャラリー'], t: { bg: 'black', shadow: 'reflection', size: 'ig', pad: 12, align: 'center' } },
  { k: 'brand', l: ['Brand color', 'ブランド色'], t: { bg: 'gradient', color: '#FF3D7F', color2: '#FFD23F', shadow: 'soft', size: 'ig', pad: 10, align: 'center' } },
  { k: 'cut', l: ['Cut-out only', '切り抜きだけ'], t: { bg: 'transparent', shadow: 'none', size: 'sq', pad: 4, align: 'center' } },
];

function canvasOf(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
async function fileToCanvas(f: File) {
  const url = URL.createObjectURL(f);
  const im = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  URL.revokeObjectURL(url);
  const k = Math.min(1, MAXSRC / Math.max(im.naturalWidth, im.naturalHeight));
  const c = canvasOf(Math.round(im.naturalWidth * k), Math.round(im.naturalHeight * k));
  c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
  return c;
}

// ---- 背景除去AI ----
type Seg = (img: unknown) => Promise<{ data: Uint8ClampedArray; width: number; height: number; channels: number }>;
let segP: Promise<{ seg: Seg; RawImage: { fromCanvas: (c: HTMLCanvasElement) => unknown } }> | null = null;
function loadSeg(onProg: (m: string) => void) {
  if (!segP)
    segP = (async () => {
      onProg(tt('Loading the AI engine…', 'AIエンジンを読み込み中…'));
      const T = (await import(/* webpackIgnore: true */ TF_URL)) as unknown as {
        pipeline: (task: string, model: string, o: Record<string, unknown>) => Promise<Seg>;
        RawImage: { fromCanvas: (c: HTMLCanvasElement) => unknown };
      };
      const gpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
      const seen = new Map<string, number>();
      const seg = await T.pipeline('background-removal', MODEL, {
        device: gpu ? 'webgpu' : 'wasm',
        dtype: gpu ? 'fp16' : 'fp32',
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status === 'progress' && p.file && p.total) {
            seen.set(p.file, p.loaded || 0);
            const pct = Math.round(((p.loaded || 0) / p.total) * 100);
            onProg(tt(`Downloading the AI model (first time only) ${pct}%`, `AIモデルをダウンロード中（初回だけ） ${pct}%`));
          }
        },
      });
      return { seg, RawImage: T.RawImage };
    })().catch((e) => { segP = null; throw e; });
  return segP;
}
export async function aiMask(src: HTMLCanvasElement, onProg: (m: string) => void): Promise<Uint8ClampedArray> {
  const { seg, RawImage } = await loadSeg(onProg);
  onProg(tt('Removing the background…', '背景を消しています…'));
  const out = await seg(RawImage.fromCanvas(src));
  let alpha: Uint8ClampedArray;
  const ch = out.channels;
  const a = new Uint8ClampedArray(out.width * out.height);
  for (let i = 0; i < a.length; i++) a[i] = ch === 4 ? out.data[i * 4 + 3] : out.data[i * ch];
  if (out.width === src.width && out.height === src.height) alpha = a;
  else {
    // 大きさが違うときは引き伸ばす
    const m = canvasOf(out.width, out.height), mx = m.getContext('2d')!;
    const d = mx.createImageData(out.width, out.height);
    for (let i = 0; i < a.length; i++) { d.data[i * 4 + 3] = a[i]; }
    mx.putImageData(d, 0, 0);
    const n = canvasOf(src.width, src.height), nx = n.getContext('2d')!;
    nx.drawImage(m, 0, 0, src.width, src.height);
    const nd = nx.getImageData(0, 0, src.width, src.height).data;
    alpha = new Uint8ClampedArray(src.width * src.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = nd[i * 4 + 3];
  }
  return alpha;
}
export function fallbackMask(src: HTMLCanvasElement) {
  const x = src.getContext('2d', { willReadFrequently: true })!;
  const L: Layer = { img: src, data: x.getImageData(0, 0, src.width, src.height), mask: new Uint8ClampedArray(src.width * src.height).fill(255), w: src.width, h: src.height };
  autoBackground(L, 9);
  return L.mask;
}

// ---- 仕上げ ----
function cutout(it: Item) {
  const c = canvasOf(it.src.width, it.src.height), x = c.getContext('2d')!;
  x.drawImage(it.src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < it.mask.length; i++) d.data[i * 4 + 3] = it.mask[i];
  x.putImageData(d, 0, 0);
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (it.mask[y * c.width + xx] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  return { c, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

export function compose(it: Item, t: Tpl, scale = 1, cache?: Map<string, ReturnType<typeof cutout>>) {
  const S = SIZES[t.size] || SIZES.sq;
  const W = Math.round(S.w * scale), H = Math.round(S.h * scale);
  const c = canvasOf(W, H), x = c.getContext('2d')!;
  // 背景
  if (t.bg !== 'transparent') {
    if (t.bg === 'gradient') { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, t.color); g.addColorStop(1, t.color2); x.fillStyle = g; }
    else if (t.bg === 'studio') { const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f4f2ee'); g.addColorStop(0.72, '#e4e0d8'); g.addColorStop(1, '#d6d1c7'); x.fillStyle = g; }
    else x.fillStyle = t.bg === 'white' ? '#ffffff' : t.bg === 'offwhite' ? '#f2f0ec' : t.bg === 'black' ? '#0b0a11' : t.color;
    x.fillRect(0, 0, W, H);
    if (t.bg === 'image' && t.bgImg) {
      const k = Math.max(W / t.bgImg.width, H / t.bgImg.height);
      x.drawImage(t.bgImg, (W - t.bgImg.width * k) / 2, (H - t.bgImg.height * k) / 2, t.bgImg.width * k, t.bgImg.height * k);
    }
    if (t.bg === 'studio') { const r = x.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.7); r.addColorStop(0, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = r; x.fillRect(0, 0, W, H); }
  }
  const key = it.id + ':' + it.mask.length + ':' + (it as Item & { v?: number }).v;
  let cu = cache?.get(key);
  if (cu === undefined) { cu = cutout(it); cache?.set(key, cu); }
  if (!cu) return c;
  const pad = (t.pad / 100) * Math.min(W, H);
  const k = Math.min((W - pad * 2) / cu.box.w, (H - pad * 2 - (t.shadow === 'reflection' ? H * 0.12 : 0)) / cu.box.h);
  const dw = cu.box.w * k, dh = cu.box.h * k;
  const dx = (W - dw) / 2;
  const dy = t.align === 'bottom' ? H - pad - dh : (H - dh) / 2 - (t.shadow === 'reflection' ? H * 0.05 : 0);
  const dark = t.bg === 'black';
  // 影
  if (t.shadow === 'soft') {
    x.save(); x.filter = `blur(${Math.round(Math.min(W, H) * 0.018)}px) brightness(0)`; x.globalAlpha = dark ? 0.6 : 0.28;
    x.drawImage(cu.c, cu.box.x, cu.box.y, cu.box.w, cu.box.h, dx + dw * 0.015, dy + dh * 0.025, dw, dh); x.restore();
  }
  if (t.shadow === 'floor') {
    x.save(); const cy = dy + dh;
    const g = x.createRadialGradient(W / 2, cy, 0, W / 2, cy, dw * 0.55); g.addColorStop(0, `rgba(0,0,0,${dark ? 0.6 : 0.32})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.translate(W / 2, cy); x.scale(1, 0.12); x.translate(-W / 2, -cy); x.fillRect(0, cy - dw * 0.6, W, dw * 1.2); x.restore();
  }
  if (t.shadow === 'reflection') {
    const r = canvasOf(Math.round(dw), Math.round(dh)), rx = r.getContext('2d')!;
    rx.translate(0, dh); rx.scale(1, -1); rx.drawImage(cu.c, cu.box.x, cu.box.y, cu.box.w, cu.box.h, 0, 0, dw, dh);
    rx.setTransform(1, 0, 0, 1, 0, 0); rx.globalCompositeOperation = 'destination-in';
    const g = rx.createLinearGradient(0, 0, 0, dh * 0.45); g.addColorStop(0, 'rgba(0,0,0,.32)'); g.addColorStop(1, 'rgba(0,0,0,0)'); rx.fillStyle = g; rx.fillRect(0, 0, dw, dh);
    x.drawImage(r, dx, dy + dh + 2);
  }
  x.drawImage(cu.c, cu.box.x, cu.box.y, cu.box.w, cu.box.h, dx, dy, dw, dh);
  if (t.mark) {
    const fs = Math.round(Math.min(W, H) * 0.022);
    x.font = `600 ${fs}px "Oswald", "Helvetica Neue", Arial, sans-serif`;
    x.textAlign = 'right'; x.textBaseline = 'bottom';
    x.fillStyle = dark || t.bg === 'gradient' ? 'rgba(255,255,255,.75)' : 'rgba(11,10,17,.55)';
    (x as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(fs * 0.2)}px`;
    x.fillText('GALLERY CRYPTO', W - fs * 1.4, H - fs * 1.2);
  }
  return c;
}

const blobOf = (c: HTMLCanvasElement, png: boolean) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('export'))), png ? 'image/png' : 'image/jpeg', 0.92));

export default function PhotoStudio({ onSave }: { onSave?: (blob: Blob, name: string) => Promise<void> }) {
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [tpl, setTpl] = useState<Tpl>({ bg: 'white', color: '#FF3D7F', color2: '#FFD23F', shadow: 'floor', size: 'ec', pad: 8, align: 'center', mark: false, bgImg: null });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [tool, setTool] = useState<'erase' | 'restore' | 'tap'>('erase');
  const [brush, setBrush] = useState(40);
  const [tick, setTick] = useState(0);
  const cache = useRef(new Map<string, ReturnType<typeof cutout>>());
  const queue = useRef<string[]>([]);
  const running = useRef(false);
  const ed = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const item = items.find((i) => i.id === sel) || null;
  const bump = (it?: Item) => { if (it) (it as Item & { v?: number }).v = ((it as Item & { v?: number }).v || 0) + 1; setTick((t) => t + 1); };

  // 背景除去を順番に処理する（写真の一覧は ref にも持ち、処理中に書き換える）
  const all = useRef<Item[]>([]);
  const sync = () => setItems([...all.current]);
  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const id = queue.current.shift()!;
      const it = all.current.find((i) => i.id === id);
      if (!it) continue;
      it.status = 'run'; sync();
      try {
        it.mask = await aiMask(it.src, setBusy);
        it.status = 'ok';
      } catch (e) {
        it.mask = fallbackMask(it.src); it.status = 'fallback';
        setMsg(tt('The AI could not start on this device, so a simpler method was used. Fix edges by hand if needed. ', 'この端末ではAIを起動できなかったため、簡易な方法で切り抜きました。必要なら手で直してください。') + (e as Error).message);
      }
      (it as Item & { v?: number }).v = Date.now();
      sync();
    }
    setBusy('');
    running.current = false;
  }, []);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setMsg('');
    const news: Item[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      const src = await fileToCanvas(f);
      news.push({ id: Math.random().toString(36).slice(2), name: f.name.replace(/\.[^.]+$/, ''), src, mask: new Uint8ClampedArray(src.width * src.height).fill(255), status: 'wait' });
    }
    all.current.push(...news);
    sync();
    if (!sel && news[0]) setSel(news[0].id);
    queue.current.push(...news.map((n) => n.id));
    pump();
  };

  // 編集画面（選んだ1枚）
  useEffect(() => {
    const c = ed.current;
    if (!c || !item) return;
    const out = compose(item, tpl, 0.5, cache.current);
    c.width = out.width; c.height = out.height;
    c.getContext('2d')!.drawImage(out, 0, 0);
  }, [item, items, tpl, tick]);

  // 編集画面の座標 → 元写真の座標
  const toSrc = (e: React.PointerEvent) => {
    if (!item) return null;
    const c = ed.current!, r = c.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * c.width, py = ((e.clientY - r.top) / r.height) * c.height;
    const cu = cache.current.get(item.id + ':' + item.mask.length + ':' + (item as Item & { v?: number }).v) || cutout(item);
    if (!cu) return null;
    const S = SIZES[tpl.size], W = S.w * 0.5, H = S.h * 0.5;
    const pad = (tpl.pad / 100) * Math.min(W, H);
    const k = Math.min((W - pad * 2) / cu.box.w, (H - pad * 2 - (tpl.shadow === 'reflection' ? H * 0.12 : 0)) / cu.box.h);
    const dw = cu.box.w * k, dh = cu.box.h * k, dx = (W - dw) / 2;
    const dy = tpl.align === 'bottom' ? H - pad - dh : (H - dh) / 2 - (tpl.shadow === 'reflection' ? H * 0.05 : 0);
    return { x: cu.box.x + (px - dx) / k, y: cu.box.y + (py - dy) / k, r: (brush / 2) * (c.width / r.width) / k };
  };
  const paint = (e: React.PointerEvent) => {
    const p = toSrc(e);
    if (!p || !item) return;
    const { width: w, height: h } = item.src;
    const v = tool === 'erase' ? 0 : 255;
    const x0 = Math.max(0, Math.floor(p.x - p.r)), x1 = Math.min(w - 1, Math.ceil(p.x + p.r)), y0 = Math.max(0, Math.floor(p.y - p.r)), y1 = Math.min(h - 1, Math.ceil(p.y + p.r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const d = Math.hypot(x - p.x, y - p.y) / p.r; if (d <= 1) { const i = y * w + x, a = d < 0.7 ? 1 : (1 - d) / 0.3; item.mask[i] = tool === 'erase' ? Math.min(item.mask[i], Math.round(255 * (1 - a))) : Math.max(item.mask[i], Math.round(v * a)); } }
    bump(item);
  };
  const down = (e: React.PointerEvent) => {
    if (!item) return;
    if (tool === 'tap') {
      // 元写真の上でタップして服を選び直す（AIがうまくいかないとき用）
      const p = toSrc(e); if (!p) return;
      const x = item.src.getContext('2d', { willReadFrequently: true })!;
      const L: Layer = { img: item.src, data: x.getImageData(0, 0, item.src.width, item.src.height), mask: item.mask, w: item.src.width, h: item.src.height, sel: true };
      const xi = Math.round(p.x), yi = Math.round(p.y);
      if (xi >= 0 && yi >= 0 && xi < L.w && yi < L.h) { selectGarment(L, xi, yi, 9); bump(item); }
      return;
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId); drawing.current = true; paint(e);
  };

  const exportOne = async (it: Item) => {
    const png = tpl.bg === 'transparent';
    const b = await blobOf(compose(it, tpl, 1, cache.current), png);
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${it.name}-gc.${png ? 'png' : 'jpg'}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };
  const exportAll = async () => {
    if (!items.length) return;
    setBusy(tt('Making the ZIP…', 'ZIPを作成中…'));
    const { zipSync } = await import('fflate');
    const png = tpl.bg === 'transparent';
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < items.length; i++) {
      setBusy(tt(`Exporting ${i + 1} / ${items.length}`, `書き出し中 ${i + 1} / ${items.length}`));
      const b = await blobOf(compose(items[i], tpl, 1, cache.current), png);
      files[`${String(i + 1).padStart(2, '0')}-${items[i].name}.${png ? 'png' : 'jpg'}`] = new Uint8Array(await b.arrayBuffer());
    }
    const z = zipSync(files, { level: 0 });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([z as BlobPart], { type: 'application/zip' })); a.download = 'gallery-crypto-photos.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    setBusy('');
  };
  const saveAll = async () => {
    if (!onSave) return;
    try {
      for (let i = 0; i < items.length; i++) { setBusy(tt(`Saving ${i + 1} / ${items.length}`, `保存中 ${i + 1} / ${items.length}`)); await onSave(await blobOf(compose(items[i], tpl, 1, cache.current), false), items[i].name); }
      setMsg(tt('Saved as draft pieces in Archive.', 'アーカイブに下書きの作品として保存しました。'));
    } catch (e) { setMsg(tt('Error: ', 'エラー：') + (e as Error).message); }
    setBusy('');
  };

  const thumbs = useMemo(() => items.map((it) => ({ it, url: it.status === 'wait' || it.status === 'run' ? '' : compose(it, tpl, 0.12, cache.current).toDataURL('image/jpeg', 0.7) })), [items, tpl, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const T = (k: Partial<Tpl>) => setTpl((o) => ({ ...o, ...k }));

  return (
    <div className="ps">
      <div className="ps-top">
        <label className="btn primary" style={{ cursor: 'pointer' }}>
          {tt('Add photos', '写真を追加')}
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </label>
        <div className="ps-presets">
          {PRESETS.map((p) => <button key={p.k} type="button" className="ps-chip" onClick={() => T(p.t)}>{tt(p.l[0], p.l[1])}</button>)}
        </div>
      </div>
      {busy && <div className="ai-busy" style={{ position: 'static' }}><i /> {busy}</div>}
      {msg && <p className="note">{msg}</p>}

      {!items.length ? (
        <label className="ai-drop">
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          <b>{tt('Add one or many photos', '写真を1枚でも何枚でも追加')}</b>
          <span>{tt('The AI removes the background automatically. Then pick a look and apply it to every photo at once.', 'AIが背景を自動で消します。仕上がりを選ぶと、全部の写真にまとめて反映されます。')}</span>
        </label>
      ) : (
        <div className="ps-main">
          <div className="ps-stage">
            {item && (item.status === 'wait' || item.status === 'run') ? (
              <div className="ps-wait"><i />{tt('Removing the background…', '背景を消しています…')}</div>
            ) : item ? (
              <canvas ref={ed} className={`ps-cv t-${tool}`} onPointerDown={down} onPointerMove={(e) => { if (drawing.current) paint(e); }} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
            ) : null}
          </div>
          <aside className="ai-panel">
            <h5>{tt('Background', '背景')}</h5>
            <div className="gm-row">
              {([['white', '#fff'], ['offwhite', '#f2f0ec'], ['studio', 'linear-gradient(#f4f2ee,#d6d1c7)'], ['black', '#0b0a11'], ['gradient', `linear-gradient(135deg,${tpl.color},${tpl.color2})`], ['transparent', 'repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/10px 10px']] as [Bg, string][]).map(([k, b]) => (
                <button key={k} type="button" className="gm-sw" aria-pressed={tpl.bg === k} style={{ background: b }} onClick={() => T({ bg: k })} aria-label={k} />
              ))}
              <label className="gm-sw" style={{ background: tpl.color, position: 'relative' }} aria-pressed={tpl.bg === 'color'}>
                <input type="color" value={tpl.color} onChange={(e) => T({ bg: 'color', color: e.target.value })} style={{ opacity: 0, position: 'absolute', inset: 0 }} />
              </label>
              <label className="btn" style={{ cursor: 'pointer', padding: '6px 10px' }}>
                {tt('Image', '画像')}
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const im = new Image(); im.onload = () => T({ bg: 'image', bgImg: im }); im.src = URL.createObjectURL(f); }} />
              </label>
            </div>
            {tpl.bg === 'gradient' && (
              <div className="gm-row"><input type="color" value={tpl.color} onChange={(e) => T({ color: e.target.value })} /><input type="color" value={tpl.color2} onChange={(e) => T({ color2: e.target.value })} /></div>
            )}
            <h5>{tt('Shadow', '影')}</h5>
            <div className="gm-row">
              {([['none', tt('None', 'なし')], ['soft', tt('Soft', 'やわらか')], ['floor', tt('Floor', '床')], ['reflection', tt('Reflection', '映り込み')]] as [Shadow, string][]).map(([k, l]) => (
                <button key={k} type="button" className={`btn${tpl.shadow === k ? ' primary' : ''}`} onClick={() => T({ shadow: k })}>{l}</button>
              ))}
            </div>
            <h5>{tt('Size', 'サイズ')}</h5>
            <select className="ps-sel" value={tpl.size} onChange={(e) => T({ size: e.target.value })}>
              {Object.entries(SIZES).map(([k, s]) => <option key={k} value={k}>{tt(s.label[0], s.label[1])} · {s.w}×{s.h}</option>)}
            </select>
            <label className="gm-sl">{tt('Margin', '余白')} <input type="range" min={0} max={30} value={tpl.pad} onChange={(e) => T({ pad: +e.target.value })} /> <b>{tpl.pad}%</b></label>
            <div className="gm-row">
              <button type="button" className={`btn${tpl.align === 'center' ? ' primary' : ''}`} onClick={() => T({ align: 'center' })}>{tt('Center', '中央')}</button>
              <button type="button" className={`btn${tpl.align === 'bottom' ? ' primary' : ''}`} onClick={() => T({ align: 'bottom' })}>{tt('On the floor', '床に置く')}</button>
              <label className="gm-ck"><input type="checkbox" checked={tpl.mark} onChange={(e) => T({ mark: e.target.checked })} /> {tt('Logo', 'ロゴ')}</label>
            </div>
            {item && item.status !== 'wait' && item.status !== 'run' && (
              <>
                <h5>{tt('Touch up this photo', 'この写真を手直し')}</h5>
                <div className="gm-row">
                  <button type="button" className={`btn${tool === 'erase' ? ' primary' : ''}`} onClick={() => setTool('erase')}>{tt('Erase', '消す')}</button>
                  <button type="button" className={`btn${tool === 'restore' ? ' primary' : ''}`} onClick={() => setTool('restore')}>{tt('Restore', '戻す')}</button>
                  <button type="button" className={`btn${tool === 'tap' ? ' primary' : ''}`} onClick={() => setTool('tap')}>{tt('Tap to add', 'タップで足す')}</button>
                </div>
                <label className="gm-sl">{tt('Brush', 'ブラシ')} <input type="range" min={8} max={120} value={brush} onChange={(e) => setBrush(+e.target.value)} /> <b>{brush}</b></label>
                <div className="gm-row">
                  <button type="button" className="btn" onClick={() => { item.status = 'wait'; sync(); queue.current.push(item.id); pump(); }}>{tt('Redo with AI', 'AIでやり直す')}</button>
                  <button type="button" className="btn" onClick={() => exportOne(item)}>{tt('Download this', 'この1枚を保存')}</button>
                </div>
              </>
            )}
            <h5>{tt('Export', '書き出し')}</h5>
            <div className="gm-row">
              <button type="button" className="btn primary" disabled={!!busy} onClick={exportAll}>{tt(`Download all (${items.length}) as ZIP`, `全部（${items.length}枚）をZIPで保存`)}</button>
              {onSave && <button type="button" className="btn" disabled={!!busy} onClick={saveAll}>{tt('Save all as draft pieces', '全部を下書きの作品として保存')}</button>}
            </div>
          </aside>
          <div className="ps-strip">
            {thumbs.map(({ it, url }) => (
              <button type="button" key={it.id} className={it.id === sel ? 'on' : ''} onClick={() => setSel(it.id)}>
                {url ? <img src={url} alt="" /> : <span className="ps-mini"><i /></span>}
                <em>{it.status === 'fallback' ? '△' : it.status === 'err' ? '!' : ''}</em>
                <span role="button" aria-label={tt('Remove', '外す')} className="ps-x" onClick={(e) => { e.stopPropagation(); all.current = all.current.filter((i) => i.id !== it.id); sync(); if (sel === it.id) setSel(null); }}>×</span>
              </button>
            ))}
            <label className="ps-add">+<input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} /></label>
          </div>
        </div>
      )}
    </div>
  );
}
