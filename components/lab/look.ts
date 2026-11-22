// 縫った服の「見た目」：色・生地の質感・プリント・ステッチを、型紙のパーツごとに実寸（cm）で描いて1枚の絵（アトラス）にまとめる。
// 3D の布の各点は、型紙の上の位置（cm）でこの絵を参照するので、プリントは型紙で決めた位置・大きさのまま服に乗る。
import { outline, type PatternDoc, type PieceDef, type Pt } from './draft';
import type { UVMap } from './SewView';

export type LookPiece = 'front' | 'back' | 'sleeveR' | 'sleeveL';
export type LookPrint = { id: string; piece: LookPiece; type: 'image' | 'text'; src?: string; text?: string; font: 'sans' | 'serif' | 'mono'; color: string; x: number; y: number; w: number; rot: number; opacity: number; crack: boolean };
export type Look = { color: string; tile: string; texSrc?: string; prints: LookPrint[]; stitch: boolean; rib: boolean };

// ---- 生地の質感（小さな模様を描いて敷き詰める） ----
export function fabricTile(f: string, img?: HTMLImageElement | null): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d')!;
  g.clearRect(0, 0, 96, 96);
  if (f === 'image' && img) { const s = Math.min(img.naturalWidth, img.naturalHeight) * 0.5; g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 96, 96); return c; }
  let sd = 7; const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const dot = (a: number) => `rgba(0,0,0,${a})`, lit = (a: number) => `rgba(255,255,255,${a})`;
  if (f === 'jersey') { for (let x = 0; x < 96; x += 3) { g.fillStyle = dot(0.06); g.fillRect(x, 0, 1, 96); } for (let y = 0; y < 96; y += 4) for (let x = 0; x < 96; x += 3) { g.fillStyle = lit(0.05); g.fillRect(x + 1, y, 1, 2); } }
  if (f === 'rib') for (let x = 0; x < 96; x += 4) { const gr = g.createLinearGradient(x, 0, x + 4, 0); gr.addColorStop(0, dot(0.16)); gr.addColorStop(0.5, lit(0.1)); gr.addColorStop(1, dot(0.16)); g.fillStyle = gr; g.fillRect(x, 0, 4, 96); }
  if (f === 'fleece') for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? dot(0.07) : lit(0.07); g.fillRect(r() * 96, r() * 96, 2, 2); }
  if (f === 'denim') { for (let k = -96; k < 96; k += 3) { g.strokeStyle = dot(0.14); g.lineWidth = 1; g.beginPath(); g.moveTo(k, 96); g.lineTo(k + 96, 0); g.stroke(); } for (let i = 0; i < 300; i++) { g.fillStyle = lit(0.09); g.fillRect(r() * 96, r() * 96, 1, 3); } }
  if (f === 'canvas') { for (let x = 0; x < 96; x += 4) { g.fillStyle = dot(0.08); g.fillRect(x, 0, 1, 96); } for (let y = 0; y < 96; y += 4) { g.fillStyle = dot(0.08); g.fillRect(0, y, 96, 1); } }
  if (f === 'nylon' || f === 'silk') { const gr = g.createLinearGradient(0, 0, 96, 96); gr.addColorStop(0, lit(f === 'silk' ? 0.16 : 0.12)); gr.addColorStop(0.5, lit(0)); gr.addColorStop(1, lit(0.08)); g.fillStyle = gr; g.fillRect(0, 0, 96, 96); for (let y = 0; y < 96; y += 6) { g.fillStyle = dot(0.03); g.fillRect(0, y, 96, 1); } }
  if (f === 'corduroy') for (let x = 0; x < 96; x += 6) { const gr = g.createLinearGradient(x, 0, x + 6, 0); gr.addColorStop(0, dot(0.18)); gr.addColorStop(0.5, lit(0.12)); gr.addColorStop(1, dot(0.18)); g.fillStyle = gr; g.fillRect(x, 0, 6, 96); }
  return c;
}

const imgCache = new Map<string, HTMLImageElement>();
export const getImg = (src: string) => new Promise<HTMLImageElement | null>((res) => { const c = imgCache.get(src); if (c?.complete) return res(c); const im = new Image(); im.onload = () => { imgCache.set(src, im); res(im); }; im.onerror = () => res(null); im.src = src; });

// プリントを描く（g は「1cm = k px」で、原点を合わせた状態で呼ぶ）
export async function drawPrint(g: CanvasRenderingContext2D, p: { id: string; type: 'image' | 'text'; src?: string; text?: string; font: 'sans' | 'serif' | 'mono'; color: string; x: number; y: number; w: number; rot: number; opacity: number; crack: boolean }, k: number, mirror = false) {
  const cx = (mirror ? -p.x : p.x) * k, cy = p.y * k;
  g.save(); g.translate(cx, cy); if (mirror) g.scale(-1, 1); g.rotate(p.rot * Math.PI / 180); g.globalAlpha = p.opacity;
  if (p.type === 'image' && p.src) {
    const im = await getImg(p.src);
    if (im) { const w = p.w * k, h = w * im.naturalHeight / im.naturalWidth; g.drawImage(im, -w / 2, -h / 2, w, h); }
  } else if (p.text) {
    const fam = p.font === 'serif' ? '"Times New Roman",Georgia,serif' : p.font === 'mono' ? 'Menlo,monospace' : '"Arial Black","Helvetica Neue",Arial,sans-serif';
    const wt = p.font === 'serif' ? 'italic 700' : '800', lines = p.text.split('\n');
    g.fillStyle = p.color; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 40; g.font = `${wt} ${fs}px ${fam}`;
    const widest = Math.max(...lines.map((l) => g.measureText(l).width)) || 1; fs = fs * (p.w * k) / widest; g.font = `${wt} ${fs}px ${fam}`;
    lines.forEach((l, i) => g.fillText(l, 0, (i - (lines.length - 1) / 2) * fs * 1.05));
  }
  g.restore();
  if (p.crack) {
    g.save(); g.globalCompositeOperation = 'destination-out';
    let sd = p.id.length * 97 + 13; const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
    const R = p.w * k * 0.6;
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.5})`; g.fillRect(cx + (r() - 0.5) * R * 2, cy + (r() - 0.5) * R * 1.4, 1 + r() * k * 0.3, 1 + r() * k * 0.3); }
    g.restore();
  }
}

const inside = (poly: Pt[], x: number, y: number) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
// 辺に沿った線を、パーツの内側へ d cm ずらして描く
function insetLine(g: CanvasRenderingContext2D, pts: Pt[], poly: Pt[], d: number, k: number) {
  if (pts.length < 2) return;
  g.beginPath();
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if (!inside(poly, p[0] + nx * 0.6, p[1] + ny * 0.6)) { nx = -nx; ny = -ny; }
    const x = (p[0] + nx * d) * k, y = (p[1] + ny * d) * k;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  });
  g.stroke();
}

export type Atlas = { canvas: HTMLCanvasElement; k: number; rects: Record<string, { ox: number; oy: number; x0: number; y0: number; w: number; h: number }>; uv: UVMap };

// 型紙のパーツを並べて1枚の絵に（棚詰め）。1cm = k px
export async function buildAtlas(doc: PatternDoc, look: Look, max = 2048): Promise<Atlas> {
  const pad = 2; // cm（縫い代ぶんの余白：境目で色がにじまない）
  const boxes = doc.pieces.map((pc) => { const o = outline(pc); const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]); const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad; return { pc, o, x0, y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 }; });
  const order = boxes.slice().sort((a, b) => b.h - a.h);
  const pack = (Wcm: number) => { let x = 0, y = 0, rowH = 0; const at = new Map<string, [number, number]>(); for (const b of order) { if (x + b.w > Wcm && x > 0) { x = 0; y += rowH; rowH = 0; } at.set(b.pc.id, [x, y]); x += b.w; rowH = Math.max(rowH, b.h); } return { at, H: y + rowH }; };
  const total = boxes.reduce((s, b) => s + b.w, 0);
  let best = { k: 1, Wcm: total, at: new Map<string, [number, number]>(), H: 0 };
  for (const Wcm of [total, total / 2, total / 3, Math.max(...boxes.map((b) => b.w))]) {
    const r = pack(Math.max(Wcm, Math.max(...boxes.map((b) => b.w)))); const k = Math.min(12, max / Math.max(Wcm, r.H));
    if (k > best.k) best = { k, Wcm, at: r.at, H: r.H };
  }
  const k = best.k, W = Math.ceil(best.Wcm * k), H = Math.ceil(best.H * k);
  const c = document.createElement('canvas'); c.width = Math.max(4, W); c.height = Math.max(4, H); const g = c.getContext('2d')!;
  const texImg = look.texSrc ? await getImg(look.texSrc) : null;
  const tile = fabricTile(look.tile === 'image' && texImg ? 'image' : look.tile, texImg);
  // 生地の模様は実寸（96px = 12cm）で敷く
  const pat = g.createPattern(tile, 'repeat');
  const rects: Atlas['rects'] = {};
  for (const b of boxes) {
    const [ax, ay] = best.at.get(b.pc.id)!; const ox = ax * k, oy = ay * k;
    rects[b.pc.id] = { ox, oy, x0: b.x0, y0: b.y0, w: b.w, h: b.h };
    g.save(); g.translate(ox - b.x0 * k, oy - b.y0 * k);
    g.fillStyle = look.color; g.fillRect(b.x0 * k, b.y0 * k, b.w * k, b.h * k);
    if (pat) { pat.setTransform(new DOMMatrix().scale((12 * k) / 96)); g.globalAlpha = look.tile === 'image' ? 0.85 : 1; g.globalCompositeOperation = look.tile === 'image' ? 'multiply' : 'source-over'; g.fillStyle = pat; g.fillRect(b.x0 * k, b.y0 * k, b.w * k, b.h * k); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    // パーツの形で切り抜いて、リブ・ステッチ・プリント
    const path = new Path2D(); b.o.forEach(([x, y], i) => (i ? path.lineTo(x * k, y * k) : path.moveTo(x * k, y * k))); path.closePath();
    g.save(); g.clip(path);
    const edge = (n: string) => b.pc.edges.find((e) => e.name === n)?.pts;
    if (look.rib) {
      for (const n of ['neck', 'cuff']) { const e = edge(n); if (!e) continue; g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = (n === 'neck' ? 4.4 : 6) * k; g.beginPath(); e.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k))); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 0.15 * k; g.setLineDash([0.25 * k, 0.25 * k]); g.stroke(); g.setLineDash([]); }
    }
    if (look.stitch) {
      g.strokeStyle = 'rgba(0,0,0,.42)'; g.lineWidth = Math.max(1, 0.09 * k); g.setLineDash([0.45 * k, 0.3 * k]);
      for (const [n, d] of [['hem', 2.2], ['cuff', 2.2], ['neck', 2.3], ['hem', 2.7], ['cuff', 2.7]] as [string, number][]) { const e = edge(n); if (e) insetLine(g, e, b.o, d, k); }
      g.setLineDash([]);
    }
    for (const p of look.prints.filter((q) => q.piece === b.pc.id || (q.piece === b.pc.role && !doc.pieces.some((x) => x.id === q.piece)))) await drawPrint(g, p, k, b.pc.role === 'back');
    g.restore(); g.restore();
  }
  const uv: UVMap = (id, _role, x, y) => { const r = rects[id]; if (!r) return null; return [(r.ox + (x - r.x0) * k) / c.width, (r.oy + (y - r.y0) * k) / c.height]; };
  return { canvas: c, k, rects, uv };
}

// 一つのパーツだけを切り出した絵（プリントの位置合わせ用のプレビュー）
export function pieceOf(doc: PatternDoc, id: string): PieceDef | undefined { return doc.pieces.find((p) => p.id === id); }
