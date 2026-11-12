'use client';
// AI取り込み：写真 → AIで補完（手・値札・隠れた部分を消して埋める）→ 切り抜き → AIで3D（見えない裏側も予測）→ 書き出し。
// 2Dの補完は LaMa（Apache-2.0）をこの端末のブラウザ内で動かす。3Dは Hugging Face の公開 Space（既定は Microsoft の TRELLIS.2、MIT）を呼ぶ。
// Hugging Face のトークンは本人が入力し、この端末にだけ保存する（サーバーには送らない）。
import { useCallback, useEffect, useRef, useState } from 'react';
import ModelViewerLazy from './ModelViewerLazy';
import { selectGarment, flood, tidy, autoBackground, type Layer } from './GhostMannequin';
import { tt } from './Lang';

const LAMA_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx';
const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.wasm.min.mjs';
const DEFAULT_SPACE = 'microsoft/TRELLIS.2';
const MAX = 1600;

type Step = 'in' | 'fix' | 'cut' | 'gen' | 'out';
type Version = { id: number; kind: '2d' | '3d'; thumb: string; img?: HTMLCanvasElement; glb?: string; note: string };

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {} },
};

function canvasOf(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function copy(c: HTMLCanvasElement) { const d = canvasOf(c.width, c.height); d.getContext('2d')!.drawImage(c, 0, 0); return d; }
function layerOf(c: HTMLCanvasElement): Layer {
  const x = c.getContext('2d', { willReadFrequently: true })!;
  return { img: c, data: x.getImageData(0, 0, c.width, c.height), mask: new Uint8ClampedArray(c.width * c.height).fill(255), w: c.width, h: c.height };
}
function thumb(c: HTMLCanvasElement) { const k = 120 / Math.max(c.width, c.height); const t = canvasOf(Math.round(c.width * k), Math.round(c.height * k)); t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', 0.7); }
async function fileToCanvas(f: File) {
  const url = URL.createObjectURL(f);
  const im = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  URL.revokeObjectURL(url);
  const k = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
  const c = canvasOf(Math.round(im.naturalWidth * k), Math.round(im.naturalHeight * k));
  c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
  return c;
}

// ---- LaMa（端末内で実行） ----
type Ort = { InferenceSession: { create: (b: ArrayBuffer, o?: unknown) => Promise<{ run: (f: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>> }> }; Tensor: new (t: string, d: Float32Array, s: number[]) => unknown; env: { wasm: { wasmPaths?: string; numThreads?: number } } };
let lamaP: Promise<{ ort: Ort; s: Awaited<ReturnType<Ort['InferenceSession']['create']>> }> | null = null;
async function lama(onProg: (m: string) => void) {
  if (!lamaP)
    lamaP = (async () => {
      onProg(tt('Loading the AI engine…', 'AIエンジンを読み込み中…'));
      const ort = (await import(/* webpackIgnore: true */ ORT_URL)) as unknown as Ort;
      ort.env.wasm.wasmPaths = ORT_URL.replace(/[^/]+$/, '');
      ort.env.wasm.numThreads = 1;
      // モデル（約200MB）は初回だけダウンロードし、ブラウザのキャッシュに残す
      const cache = 'caches' in window ? await caches.open('gc-ai-models') : null;
      let res = cache ? await cache.match(LAMA_URL) : undefined;
      if (!res) {
        const r = await fetch(LAMA_URL);
        if (!r.ok || !r.body) throw new Error('model ' + r.status);
        const total = +(r.headers.get('content-length') || 0);
        const rd = r.body.getReader();
        const parts: Uint8Array[] = [];
        let got = 0;
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          parts.push(value); got += value.length;
          onProg(tt(`Downloading the AI model (first time only) ${total ? Math.round((got / total) * 100) + '%' : Math.round(got / 1e6) + ' MB'}`, `AIモデルをダウンロード中（初回だけ） ${total ? Math.round((got / total) * 100) + '%' : Math.round(got / 1e6) + 'MB'}`));
        }
        const blob = new Blob(parts as BlobPart[]);
        res = new Response(blob);
        if (cache) await cache.put(LAMA_URL, new Response(blob));
      }
      onProg(tt('Starting the AI…', 'AIを起動中…'));
      const s = await ort.InferenceSession.create(await res.arrayBuffer(), { executionProviders: ['wasm'] });
      return { ort, s };
    })().catch((e) => { lamaP = null; throw e; });
  return lamaP;
}

// 塗った範囲のまわりを正方形で切り出し、512 に縮めて補完し、塗った所だけ元の大きさで戻す
async function inpaint(img: HTMLCanvasElement, paint: HTMLCanvasElement, onProg: (m: string) => void) {
  const { ort, s } = await lama(onProg);
  const W = img.width, H = img.height;
  const pd = paint.getContext('2d')!.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pd[(y * W + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) throw new Error(tt('Paint over the parts to fix first.', '先に直したい所を塗ってください。'));
  const side = Math.min(Math.max(W, H), Math.max(512, Math.round(Math.max(x1 - x0, y1 - y0) * 1.6)));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const sx = Math.round(Math.max(0, Math.min(W - side, cx - side / 2))), sy = Math.round(Math.max(0, Math.min(H - side, cy - side / 2)));
  const sw = Math.min(side, W), sh = Math.min(side, H);
  const N = 512;
  const a = canvasOf(N, N), ax = a.getContext('2d')!;
  ax.drawImage(img, sx, sy, sw, sh, 0, 0, N, N);
  const m = canvasOf(N, N), mx = m.getContext('2d')!;
  mx.drawImage(paint, sx, sy, sw, sh, 0, 0, N, N);
  const id = ax.getImageData(0, 0, N, N).data, md = mx.getImageData(0, 0, N, N).data;
  const im = new Float32Array(3 * N * N), mk = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    im[i] = id[i * 4] / 255; im[N * N + i] = id[i * 4 + 1] / 255; im[2 * N * N + i] = id[i * 4 + 2] / 255;
    mk[i] = md[i * 4 + 3] > 10 ? 1 : 0;
  }
  onProg(tt('AI is filling in…', 'AIが補完中…'));
  const out = await s.run({ image: new ort.Tensor('float32', im, [1, 3, N, N]), mask: new ort.Tensor('float32', mk, [1, 1, N, N]) });
  const o = (out.output || Object.values(out)[0]).data;
  let mxv = 0;
  for (let i = 0; i < o.length; i += 97) if (o[i] > mxv) mxv = o[i];
  const k = mxv <= 1.5 ? 255 : 1;
  const r = ax.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    r.data[i * 4] = o[i] * k; r.data[i * 4 + 1] = o[N * N + i] * k; r.data[i * 4 + 2] = o[2 * N * N + i] * k; r.data[i * 4 + 3] = 255;
  }
  ax.putImageData(r, 0, 0);
  // 塗った所だけ、ぼかした境目で元の写真に重ねる
  const res = copy(img), rx = res.getContext('2d')!;
  const patch = canvasOf(sw, sh), px = patch.getContext('2d')!;
  px.drawImage(a, 0, 0, N, N, 0, 0, sw, sh);
  px.globalCompositeOperation = 'destination-in';
  px.filter = 'blur(3px)';
  px.drawImage(paint, sx, sy, sw, sh, 0, 0, sw, sh);
  px.drawImage(paint, sx, sy, sw, sh, 0, 0, sw, sh);
  rx.drawImage(patch, sx, sy);
  return res;
}

// 切り抜いた服を、余白つきの正方形（透明背景）にする
function subject(L: Layer) {
  let x0 = L.w, y0 = L.h, x1 = 0, y1 = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.mask[y * L.w + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) return null;
  const side = Math.round(Math.max(x1 - x0, y1 - y0) * 1.12);
  const S = Math.min(1024, side);
  const k = S / side;
  const c = canvasOf(S, S), x = c.getContext('2d')!;
  const cut = canvasOf(L.w, L.h), cx = cut.getContext('2d')!;
  const d = cx.createImageData(L.w, L.h);
  for (let i = 0; i < L.mask.length; i++) { d.data[i * 4] = L.data.data[i * 4]; d.data[i * 4 + 1] = L.data.data[i * 4 + 1]; d.data[i * 4 + 2] = L.data.data[i * 4 + 2]; d.data[i * 4 + 3] = L.mask[i]; }
  cx.putImageData(d, 0, 0);
  const ox = (side - (x1 - x0)) / 2, oy = (side - (y1 - y0)) / 2;
  x.drawImage(cut, x0, y0, x1 - x0, y1 - y0, ox * k, oy * k, (x1 - x0) * k, (y1 - y0) * k);
  return c;
}

// ---- 3D（Hugging Face Space） ----
type Gr = { Client: { connect: (s: string, o?: Record<string, unknown>) => Promise<GrClient> }; handle_file: (b: Blob) => unknown };
type GrParam = { parameter_name: string; label: string; parameter_default?: unknown; parameter_has_default?: boolean };
type GrClient = {
  view_api: () => Promise<{ named_endpoints: Record<string, { parameters: GrParam[] }> }>;
  submit: (ep: string, data: Record<string, unknown>) => AsyncIterable<{ type: string; stage?: string; position?: number; eta?: number; progress_data?: { index: number; length: number; desc?: string }[]; data?: unknown[]; message?: string }>;
};
async function runSpace(c: GrClient, ep: string, data: Record<string, unknown>, onProg: (m: string) => void) {
  let out: unknown[] | undefined;
  for await (const ev of c.submit(ep, data)) {
    if (ev.type === 'status') {
      if (ev.stage === 'error') throw new Error(ev.message || 'error');
      if (ev.position != null && ev.position > 0) onProg(tt(`Waiting in line: ${ev.position} ahead`, `順番待ち：前に${ev.position}件`));
      else if (ev.progress_data?.length) { const p = ev.progress_data[0]; onProg(`${p.desc || tt('Generating', '生成中')} ${p.length ? Math.round((p.index / p.length) * 100) + '%' : ''}`); }
      else onProg(tt('AI is building the 3D…', 'AIが3Dをつくっています…'));
    }
    if (ev.type === 'data') out = ev.data;
  }
  if (!out) throw new Error('no result');
  return out;
}
function argsFor(params: GrParam[], over: (name: string) => unknown) {
  const o: Record<string, unknown> = {};
  for (const p of params) { const v = over(p.parameter_name.toLowerCase()); o[p.parameter_name] = v !== undefined ? v : p.parameter_default; }
  return o;
}
function fileUrl(x: unknown): string | null {
  if (!x) return null;
  if (typeof x === 'string') return x;
  const o = x as { url?: string; value?: unknown; path?: string };
  return o.url || (o.value ? fileUrl(o.value) : null);
}

export default function AIImport({ onGlb }: { onGlb?: (f: File) => void }) {
  const [step, setStep] = useState<Step>('in');
  const [img, setImg] = useState<HTMLCanvasElement | null>(null);
  const [layer, setLayer] = useState<Layer | null>(null);
  const [subj, setSubj] = useState<HTMLCanvasElement | null>(null);
  const [glb, setGlb] = useState<string>('');
  const [brush, setBrush] = useState(36);
  const [tol, setTol] = useState(9);
  const [cutMode, setCutMode] = useState<'select' | 'toggle'>('select');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [hist, setHist] = useState<Version[]>([]);
  const [token, setToken] = useState('');
  const [space, setSpace] = useState(DEFAULT_SPACE);
  const [seed, setSeed] = useState(0);
  const [ver, setVer] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const paint = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => { setToken(store.get('gc-hf-token')); setSpace(store.get('gc-hf-space') || DEFAULT_SPACE); }, []);
  useEffect(() => { setErr(''); }, [step]);
  const addVer = (v: Omit<Version, 'id'>) => setHist((h) => [...h, { ...v, id: Date.now() + Math.random() }].slice(-24));

  // 2D 画面を描く
  useEffect(() => {
    const c = cv.current;
    if (!c || !img) return;
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d')!;
    if (step === 'cut' && layer) {
      const d = x.createImageData(layer.w, layer.h), s = layer.data.data;
      for (let i = 0; i < layer.mask.length; i++) {
        const k = layer.mask[i] > 127;
        d.data[i * 4] = k ? s[i * 4] : s[i * 4] * 0.35 + 150; d.data[i * 4 + 1] = k ? s[i * 4 + 1] : s[i * 4 + 1] * 0.35; d.data[i * 4 + 2] = k ? s[i * 4 + 2] : s[i * 4 + 2] * 0.35; d.data[i * 4 + 3] = 255;
      }
      x.putImageData(d, 0, 0);
    } else {
      x.drawImage(img, 0, 0);
      if (step === 'fix' && paint.current) { x.globalAlpha = 0.55; x.drawImage(paint.current, 0, 0); x.globalAlpha = 1; }
    }
  }, [img, layer, step, ver]);

  const pick = async (f?: File) => {
    if (!f) return;
    setErr('');
    const c = await fileToCanvas(f);
    setImg(c); setLayer(null); setSubj(null); setGlb('');
    paint.current = canvasOf(c.width, c.height);
    addVer({ kind: '2d', thumb: thumb(c), img: copy(c), note: tt('Original', '元の写真') });
    setStep('fix');
  };

  const pos = (e: React.PointerEvent) => { const c = cv.current!, r = c.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height, k: c.width / r.width }; };
  const stroke = (e: React.PointerEvent) => {
    const p = pos(e), x = paint.current!.getContext('2d')!;
    x.fillStyle = '#ff2d55';
    x.beginPath(); x.arc(p.x, p.y, (brush * p.k) / 2, 0, Math.PI * 2); x.fill();
    setVer((v) => v + 1);
  };
  const down = (e: React.PointerEvent) => {
    if (!img) return;
    if (step === 'fix') { (e.target as HTMLElement).setPointerCapture(e.pointerId); drawing.current = true; stroke(e); return; }
    if (step === 'cut' && layer) {
      const p = pos(e), xi = Math.round(p.x), yi = Math.round(p.y);
      if (cutMode === 'select') selectGarment(layer, xi, yi, tol);
      else {
        const i = yi * layer.w + xi, d = layer.data.data, restore = layer.mask[i] < 128;
        const hit = flood(layer, [i], [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], tol);
        for (let k = 0; k < hit.length; k++) if (hit[k]) layer.mask[k] = restore ? 255 : 0;
        tidy(layer.mask, layer.w, layer.h);
      }
      setVer((v) => v + 1);
    }
  };
  const move = (e: React.PointerEvent) => { if (drawing.current) stroke(e); };
  const up = () => { drawing.current = false; };

  const doFix = async () => {
    if (!img || !paint.current) return;
    setErr(''); setBusy(tt('Preparing…', '準備中…'));
    try {
      const r = await inpaint(img, paint.current, setBusy);
      setImg(r);
      paint.current = canvasOf(r.width, r.height);
      addVer({ kind: '2d', thumb: thumb(r), img: copy(r), note: tt('AI fill', 'AI補完') });
    } catch (e) { setErr(tt('AI fill failed: ', 'AI補完に失敗しました：') + (e as Error).message); }
    setBusy('');
  };

  const toCut = () => {
    if (!img) return;
    const L = layerOf(copy(img));
    autoBackground(L, tol);
    setLayer(L); setCutMode('select'); setStep('cut');
  };

  const toGen = () => {
    if (!layer) return;
    const s = subject(layer);
    if (!s) { setErr(tt('Select the garment first.', '先に服を選んでください。')); return; }
    setSubj(s); setStep('gen');
    addVer({ kind: '2d', thumb: thumb(s), img: s, note: tt('Cut out', '切り抜き') });
  };

  const gen = useCallback(async (newSeed?: number) => {
    if (!subj) return;
    setErr(''); setBusy(tt('Connecting to the 3D AI…', '3D AIに接続中…'));
    store.set('gc-hf-token', token.trim()); store.set('gc-hf-space', space.trim() === DEFAULT_SPACE ? '' : space.trim());
    try {
      const gr = (await import('@gradio/client')) as unknown as Gr;
      const t = token.trim();
      const c = await gr.Client.connect(space.trim() || DEFAULT_SPACE, t.startsWith('hf_') ? { token: t, record_history: false } : { record_history: false });
      const api = await c.view_api();
      const eps = Object.keys(api.named_endpoints);
      const genEp = eps.find((k) => /image_to_3d|generate/i.test(k)) || eps.find((k) => /3d/i.test(k));
      const exEp = eps.find((k) => /extract_glb|extract|export/i.test(k));
      if (!genEp) throw new Error(tt('This Space has no image-to-3D endpoint: ', 'この Space には画像→3Dの窓口がありません：') + eps.join(', '));
      const blob: Blob = await new Promise((res) => subj.toBlob((b) => res(b!), 'image/png'));
      const sd = newSeed ?? seed;
      // Space に前処理（背景除去・中央寄せ）の窓口があれば先に通す
      let input: unknown = gr.handle_file(blob);
      const preEp = eps.find((k) => /preprocess/i.test(k));
      if (preEp) {
        try {
          setBusy(tt('Preparing the image…', '画像を準備中…'));
          const pre = await runSpace(c, preEp, argsFor(api.named_endpoints[preEp].parameters, (n) => (/image/.test(n) ? input : undefined)), setBusy);
          const pu = pre.map(fileUrl).find((u) => !!u);
          if (pu) input = gr.handle_file(await (await fetch(pu)).blob());
        } catch { /* 前処理なしで続ける */ }
      }
      const out1 = await runSpace(c, genEp, argsFor(api.named_endpoints[genEp].parameters, (n) => (/image/.test(n) ? input : /randomize/.test(n) ? false : n === 'seed' ? sd : undefined)), setBusy);
      let url = out1.map(fileUrl).find((u) => u && /\.(glb|gltf)(\?|$)/i.test(u)) || null;
      if (!url && exEp) {
        setBusy(tt('Exporting the 3D file…', '3Dファイルを書き出し中…'));
        const out2 = await runSpace(c, exEp, argsFor(api.named_endpoints[exEp].parameters, () => undefined), setBusy);
        url = out2.map(fileUrl).find((u) => !!u) || null;
      }
      if (!url) throw new Error(tt('No 3D file came back.', '3Dファイルが返ってきませんでした。'));
      const r = await fetch(url, t.startsWith('hf_') ? { headers: { Authorization: `Bearer ${t}` } } : undefined);
      if (!r.ok) throw new Error('download ' + r.status);
      const b = await r.blob();
      const u = URL.createObjectURL(new Blob([b], { type: 'model/gltf-binary' }));
      setGlb(u);
      addVer({ kind: '3d', thumb: thumb(subj), glb: u, note: `3D · seed ${sd}` });
      setStep('out');
    } catch (e) {
      const m = (e as Error).message || String(e);
      setErr(/quota|ZeroGPU|exceeded|GPU/i.test(m)
        ? tt('The free GPU time for today is used up. Add a Hugging Face token (free account) for more, or try again later. ', '今日の無料GPU時間を使い切りました。Hugging Face のトークン（無料アカウント）を入れると増えます。または時間をおいて試してください。') + m
        : tt('3D generation failed: ', '3D生成に失敗しました：') + m);
    }
    setBusy('');
  }, [subj, token, space, seed]);

  const restore = (v: Version) => {
    if (v.kind === '3d' && v.glb) { setGlb(v.glb); setStep('out'); return; }
    if (v.img) { const c = copy(v.img); setImg(c); paint.current = canvasOf(c.width, c.height); setLayer(null); setStep('fix'); }
  };

  const download = async () => {
    if (!glb) return;
    const a = document.createElement('a'); a.href = glb; a.download = 'gallery-crypto-ai-3d.glb'; a.click();
  };

  const steps: [Step, string][] = [['in', tt('Import', '取り込み')], ['fix', tt('AI fill', 'AI補完')], ['cut', tt('Cut out', '切り抜き')], ['gen', tt('AI 3D', 'AI 3D')], ['out', tt('Export', '書き出し')]];
  const order = steps.map((s) => s[0]);
  const can = (s: Step) => s === 'in' || (s === 'fix' && !!img) || (s === 'cut' && !!img) || (s === 'gen' && !!subj) || (s === 'out' && !!glb);

  return (
    <div className="ai">
      <ol className="ai-flow">
        {steps.map(([k, l], i) => (
          <li key={k}>
            <button type="button" className={`ai-node${step === k ? ' on' : ''}${order.indexOf(step) > i ? ' done' : ''}`} disabled={!can(k) || !!busy} onClick={() => (k === 'cut' ? toCut() : k === 'gen' ? toGen() : setStep(k))}>
              <span>{String(i + 1).padStart(2, '0')}</span>{l}
            </button>
          </li>
        ))}
      </ol>

      <div className="ai-main">
        <div className="ai-stage">
          {step === 'in' || !img ? (
            <label className="ai-drop">
              <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
              <b>{tt('Drop or choose a photo of the garment', '服の写真を選ぶ')}</b>
              <span>{tt('Shop shelves, hands, price tags are fine — AI will clean them up.', 'お店の棚、持っている手、値札が写っていても大丈夫です。AIで直します。')}</span>
            </label>
          ) : step === 'gen' || step === 'out' ? (
            glb ? <ModelViewerLazy key={glb} src={glb} /> : subj ? <img className="ai-subj" src={subj.toDataURL('image/png')} alt="" /> : null
          ) : (
            <canvas ref={cv} className={`ai-cv mode-${step}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          )}
          {busy && <div className="ai-busy"><i /> {busy}</div>}
        </div>

        <aside className="ai-panel">
          {step === 'fix' && (
            <>
              <h5>{tt('AI fill', 'AI補完')}</h5>
              <p className="note">{tt('Paint over hands, price tags, hangers or holes. The AI predicts what is underneath and fills it in. Repeat as many times as you like.', '手、値札、ハンガー、穴など、消したい所を塗ってください。下に隠れている部分をAIが予測して埋めます。何回でも繰り返せます。')}</p>
              <label className="gm-sl">{tt('Brush', 'ブラシ')} <input type="range" min={8} max={120} value={brush} onChange={(e) => setBrush(+e.target.value)} /> <b>{brush}</b></label>
              <div className="gm-row">
                <button type="button" className="btn primary" disabled={!!busy} onClick={doFix}>{tt('Fill with AI', 'AIで補完する')}</button>
                <button type="button" className="btn" disabled={!!busy} onClick={() => { if (img) { paint.current = canvasOf(img.width, img.height); setVer((v) => v + 1); } }}>{tt('Clear paint', '塗りを消す')}</button>
              </div>
              <button type="button" className="btn" disabled={!!busy} onClick={toCut}>{tt('Next: cut out →', '次へ：切り抜き →')}</button>
              <p className="note">{tt('The first run downloads the AI model (about 200 MB) to this browser. After that it works offline.', '初回だけ、AIモデル（約200MB）をこのブラウザにダウンロードします。2回目からはすぐ使えます。')}</p>
            </>
          )}
          {step === 'cut' && (
            <>
              <h5>{tt('Cut out', '切り抜き')}</h5>
              <div className="gm-row">
                <button type="button" className={`btn${cutMode === 'select' ? ' primary' : ''}`} onClick={() => setCutMode('select')}>{tt('Tap the garment', '服をタップして選ぶ')}</button>
                <button type="button" className={`btn${cutMode === 'toggle' ? ' primary' : ''}`} onClick={() => setCutMode('toggle')}>{tt('Tap to remove / restore', 'タップで消す・戻す')}</button>
              </div>
              <label className="gm-sl">{tt('Tolerance', '色の幅')} <input type="range" min={2} max={45} value={tol} onChange={(e) => setTol(+e.target.value)} /> <b>{tol}</b></label>
              <p className="note">{tt('Red = removed. Tap more of the garment to add to it.', '赤い所が消える部分です。服を続けてタップすると足されます。')}</p>
              <button type="button" className="btn primary" onClick={toGen}>{tt('Next: AI 3D →', '次へ：AI 3D →')}</button>
            </>
          )}
          {(step === 'gen' || step === 'out') && (
            <>
              <h5>{tt('AI 3D', 'AI 3D')}</h5>
              <p className="note">{tt('The AI predicts the full shape, including the back and the sides it cannot see, and makes a textured 3D model. It runs on a free public GPU, so it can take a minute or two, and there is a daily limit.', '見えていない背面や側面も含めて、AIが形全体を予測し、色つきの3Dモデルをつくります。無料の公開GPUで動くため1〜2分かかることがあり、1日の上限があります。')}</p>
              <div className="gm-row">
                <button type="button" className="btn primary" disabled={!!busy || !subj} onClick={() => gen()}>{glb ? tt('Generate again', 'もう一度つくる') : tt('Make 3D with AI', 'AIで3Dをつくる')}</button>
                <button type="button" className="btn" disabled={!!busy || !subj} onClick={() => { const s = Math.floor(Math.random() * 1e6); setSeed(s); gen(s); }}>{tt('Try another variation', '別の案をつくる')}</button>
              </div>
              <details className="ai-adv">
                <summary>{tt('Settings', '設定')}</summary>
                <label className="ai-field">{tt('Hugging Face token (optional — more free GPU time)', 'Hugging Face のトークン（なくても可。無料GPU時間が増えます）')}
                  <input type="password" autoComplete="off" value={token} placeholder="hf_…" onChange={(e) => setToken(e.target.value)} />
                </label>
                <p className="note">{tt('Saved only in this browser. Make a free account at huggingface.co → Settings → Access Tokens → Read.', 'このブラウザにだけ保存します。huggingface.co で無料アカウントを作り、Settings → Access Tokens → Read で作成できます。')}</p>
                <label className="ai-field">{tt('3D AI (Space)', '3D AI（Space）')}
                  <input value={space} onChange={(e) => setSpace(e.target.value)} />
                </label>
                <label className="ai-field">Seed <input type="number" value={seed} onChange={(e) => setSeed(+e.target.value)} /></label>
              </details>
              {glb && (
                <>
                  <h5>{tt('Export', '書き出し')}</h5>
                  <div className="gm-row">
                    <button type="button" className="btn" onClick={download}>{tt('Download .glb', '.glb をダウンロード')}</button>
                    {onGlb && <button type="button" className="btn primary" onClick={async () => { const b = await (await fetch(glb)).blob(); onGlb(new File([b], 'ai-3d.glb', { type: 'model/gltf-binary' })); }}>{tt('Use as this piece’s 3D', 'この作品の3Dにする')}</button>}
                  </div>
                  <p className="note">{tt('Not right? Go back to AI fill or Cut out, fix the photo, and generate again. Every version stays in the history below.', '違うときは「AI補完」や「切り抜き」に戻って写真を直し、もう一度つくってください。つくったものはすべて下の履歴に残ります。')}</p>
                </>
              )}
            </>
          )}
          {err && <p className="note" style={{ color: '#b3261e' }}>{err}</p>}
        </aside>
      </div>

      {hist.length > 0 && (
        <div className="ai-hist" aria-label={tt('History', '履歴')}>
          {hist.map((v) => (
            <button type="button" key={v.id} onClick={() => restore(v)} title={v.note}>
              <img src={v.thumb} alt="" />
              <span>{v.kind === '3d' ? '3D' : ''} {v.note}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
