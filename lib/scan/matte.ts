// 服の切り抜き（AI）：U²-Net の小型版（u2netp・約4.6MB・Apache-2.0）を、この端末の中で動かす。
// 写真の中で一番目立つもの（=服）の形を 320×320 で推定し、元の大きさに戻して「服／背景」の2値にする。
// 読み込めないとき（オフラインなど）は、色の差で切り抜く方法に切り替える。画像はどこにも送らない。
import { segment } from '@/components/scanSegment';
import type { Layer } from '@/components/GhostMannequin';

const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.wasm.min.mjs';
const MODEL_URL = 'https://huggingface.co/edgetools/u2netp/resolve/main/u2netp.onnx';
const S = 320;
type Sess = { run: (f: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>>; inputNames: string[]; outputNames: string[] };
type Ort = { InferenceSession: { create: (b: ArrayBuffer, o?: unknown) => Promise<Sess> }; Tensor: new (t: string, d: Float32Array, s: number[]) => unknown; env: { wasm: { wasmPaths?: string; numThreads?: number } } };
let P: Promise<{ ort: Ort; s: Sess }> | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function loadMatte(onProg?: (m: string) => void) {
  if (!P) P = (async () => {
    const ort = (await import(/* webpackIgnore: true */ ORT_URL)) as unknown as Ort;
    ort.env.wasm.wasmPaths = ORT_URL.replace(/[^/]+$/, ''); ort.env.wasm.numThreads = 1;
    const cache = 'caches' in window ? await caches.open('gc-ai-models') : null;
    let res = cache ? await cache.match(MODEL_URL) : undefined;
    if (!res) { onProg?.('model'); const r = await fetch(MODEL_URL); if (!r.ok) throw new Error('model ' + r.status); const b = await r.blob(); res = new Response(b); if (cache) await cache.put(MODEL_URL, new Response(b)).catch(() => null); }
    const s = await ort.InferenceSession.create(await res.arrayBuffer(), { executionProviders: ['wasm'] });
    return { ort, s };
  })().catch((e) => { P = null; throw e; });
  return P;
}

// 320×320 の「服らしさ」（0〜1）
export async function saliency(src: CanvasImageSource, w: number, h: number): Promise<Float32Array> {
  const { ort, s } = await loadMatte();
  const c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, w, h, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data; let mx = 1; for (let i = 0; i < d.length; i += 4) mx = Math.max(mx, d[i], d[i + 1], d[i + 2]);
  const t = new Float32Array(3 * S * S), mean = [0.485, 0.456, 0.406], sd = [0.229, 0.224, 0.225];
  for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) t[k * S * S + i] = (d[i * 4 + k] / mx - mean[k]) / sd[k];
  // 同じAIを同時に2回は動かせないので、順番待ちにする
  const job = queue.then(() => s.run({ [s.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, S, S]) }));
  queue = job.catch(() => null);
  const out = await job;
  const o = out[s.outputNames[0]].data; let lo = Infinity, hi = -Infinity; for (const v of o) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const r = new Float32Array(S * S); for (let i = 0; i < r.length; i++) r[i] = (o[i] - lo) / (hi - lo || 1);
  return r;
}

// 2値の形を整える：一番大きな塊（と大きめの塊）だけ残し、中の穴を埋める
export function cleanMask(m: Uint8Array, W: number, H: number) {
  const n = W * H, lab = new Int32Array(n).fill(-1), sizes: number[] = []; let best = 0;
  for (let s0 = 0; s0 < n; s0++) {
    if (!m[s0] || lab[s0] >= 0) continue; const id = sizes.length; let cnt = 0; const q = [s0]; lab[s0] = id;
    while (q.length) { const i = q.pop()!; cnt++; const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && m[j] && lab[j] < 0) { lab[j] = id; q.push(j); } }
    sizes.push(cnt); if (cnt > best) best = cnt;
  }
  const out = new Uint8Array(n); for (let i = 0; i < n; i++) if (lab[i] >= 0 && sizes[lab[i]] > best * 0.06) out[i] = 1;
  // 穴埋め：外側からつながる背景だけを背景に
  const bg = new Uint8Array(n), st: number[] = [];
  const push = (i: number) => { if (!out[i] && !bg[i]) { bg[i] = 1; st.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); } for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (st.length) { const i = st.pop()!, x = i % W; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < n - W) push(i + W); }
  for (let i = 0; i < n; i++) out[i] = bg[i] ? 0 : 1;
  return out;
}

// 写真 → 服の形（写真と同じ大きさ、0/255）。AI が使えなければ色で
export async function matte(c: HTMLCanvasElement, tol = 9): Promise<{ mask: Uint8ClampedArray; ai: boolean }> {
  const W = c.width, H = c.height;
  try {
    const sal = await saliency(c, W, H);
    // 320×320 → 元の大きさ（なめらかに拡大してから 0.5 で切る）
    const t = document.createElement('canvas'); t.width = S; t.height = S; const tg = t.getContext('2d')!; const id = tg.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { const v = Math.round(sal[i] * 255); id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    tg.putImageData(id, 0, 0);
    const u = document.createElement('canvas'); u.width = W; u.height = H; const ug = u.getContext('2d', { willReadFrequently: true })!; ug.imageSmoothingQuality = 'high'; ug.drawImage(t, 0, 0, W, H);
    const d = ug.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H); for (let i = 0; i < m.length; i++) m[i] = d[i * 4] > 127 ? 1 : 0;
    const cl = cleanMask(m, W, H), mask = new Uint8ClampedArray(W * H); for (let i = 0; i < mask.length; i++) mask[i] = cl[i] ? 255 : 0;
    return { mask, ai: true };
  } catch {
    const g = c.getContext('2d', { willReadFrequently: true })!;
    const L: Layer = { img: c, data: g.getImageData(0, 0, W, H), mask: new Uint8ClampedArray(W * H).fill(255), w: W, h: H };
    segment(L, tol);
    return { mask: L.mask, ai: false };
  }
}
