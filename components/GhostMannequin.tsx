'use client';
// ゴーストマネキン（自作）：マネキンに着せて撮った写真から、背景とマネキンを消し、
// 首の内側（後ろ身頃の裏）の写真を奥に重ねて「透明な人が着ている」立体的な商品写真をつくる。
// すべてブラウザ内で処理する（画像はどこにも送らない）。保存したときだけアップロードする。
import { useCallback, useEffect, useRef, useState } from 'react';
import { tt } from './Lang';

const MAX = 1600;
export type Layer = { img: HTMLCanvasElement; data: ImageData; mask: Uint8ClampedArray; w: number; h: number };
type Tool = 'select' | 'pick' | 'erase' | 'restore' | 'move';
type Target = 'front' | 'inner';

export function loadLayer(file: File): Promise<Layer> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
      const w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(im, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const data = x.getImageData(0, 0, w, h);
      res({ img: c, data, mask: new Uint8ClampedArray(w * h).fill(255), w, h });
    };
    im.onerror = () => rej(new Error(tt('Could not read the image.', '画像を読み込めませんでした。')));
    im.src = url;
  });
}

// 指定の色に近い、つながった範囲を塗りつぶす（スタック式）。hit=1 の画素を返す
export function flood(L: Layer, seeds: number[], ref: [number, number, number], tol: number): Uint8Array {
  const { w, h } = L, d = L.data.data;
  const lim = (tol * 2.2) ** 2;
  const hit = new Uint8Array(w * h);
  const st = seeds.slice();
  const ok = (i: number) => {
    const r = d[i * 4] - ref[0], g = d[i * 4 + 1] - ref[1], b = d[i * 4 + 2] - ref[2];
    return 0.3 * r * r + 0.59 * g * g + 0.11 * b * b < lim;
  };
  while (st.length) {
    const i = st.pop()!;
    if (hit[i] || !ok(i)) continue;
    hit[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) st.push(i - 1);
    if (x < w - 1) st.push(i + 1);
    if (y > 0) st.push(i - w);
    if (y < h - 1) st.push(i + w);
  }
  return hit;
}

// 小さな穴や点を消して輪郭を整える（3x3 の多数決を2回）
export function tidy(m: Uint8ClampedArray, w: number, h: number) {
  for (let pass = 0; pass < 2; pass++) {
    const src = m.slice();
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[(y + dy) * w + x + dx] > 127 ? 1 : 0;
        m[y * w + x] = s >= 5 ? 255 : 0;
      }
  }
}

// 服をタップして選ぶ：タップした色から、なだらかにつながる範囲を広げ（陰影は許す）、
// 中に囲まれたプリントやタグは穴埋めで含める。背景がごちゃごちゃした写真向け。
export function selectGarment(L: Layer, sx: number, sy: number, tol: number) {
  const { w, h } = L, d = L.data.data;
  const s0 = sy * w + sx;
  // タップ地点まわり 7x7 の平均色
  let r0 = 0, g0 = 0, b0 = 0, c0 = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = sx + dx, y = sy + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = (y * w + x) * 4; r0 += d[i]; g0 += d[i + 1]; b0 += d[i + 2]; c0++;
  }
  r0 /= c0; g0 /= c0; b0 /= c0;
  const far = (tol * 4.2) ** 2, near = (tol * 0.9) ** 2;
  const dist = (i: number, r: number, g: number, b: number) => { const a = d[i * 4] - r, c = d[i * 4 + 1] - g, e = d[i * 4 + 2] - b; return 0.3 * a * a + 0.59 * c * c + 0.11 * e * e; };
  const hit = new Uint8Array(w * h);
  const st = [s0];
  hit[s0] = 1;
  while (st.length) {
    const i = st.pop()!;
    const x = i % w, y = (i / w) | 0;
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) {
      if (j < 0 || hit[j]) continue;
      if (dist(j, r, g, b) < near && dist(j, r0, g0, b0) < far) { hit[j] = 1; st.push(j); }
    }
  }
  // 穴埋め：外側（画像の縁からつながる非選択部分）以外はすべて服
  const out = new Uint8Array(w * h);
  const q: number[] = [];
  const push = (i: number) => { if (!hit[i] && !out[i]) { out[i] = 1; q.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (q.length) {
    const i = q.pop()!;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < w * h; i++) L.mask[i] = out[i] ? 0 : 255;
  tidy(L.mask, w, h);
}

export function autoBackground(L: Layer, tol: number) {
  const { w, h } = L, d = L.data.data;
  // 四辺の画素の中央値を背景色とみなす
  const rs: number[] = [], gs: number[] = [], bs: number[] = [], seeds: number[] = [];
  const add = (i: number) => { rs.push(d[i * 4]); gs.push(d[i * 4 + 1]); bs.push(d[i * 4 + 2]); seeds.push(i); };
  for (let x = 0; x < w; x += 2) { add(x); add((h - 1) * w + x); }
  for (let y = 0; y < h; y += 2) { add(y * w); add(y * w + w - 1); }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  const hit = flood(L, seeds, [med(rs), med(gs), med(bs)], Math.max(14, tol * 1.8));
  for (let i = 0; i < hit.length; i++) L.mask[i] = hit[i] ? 0 : 255;
  tidy(L.mask, w, h);
}

function cutout(L: Layer, feather: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = L.w; c.height = L.h;
  const x = c.getContext('2d')!;
  const m = document.createElement('canvas');
  m.width = L.w; m.height = L.h;
  const mx = m.getContext('2d')!;
  const md = mx.createImageData(L.w, L.h);
  for (let i = 0; i < L.mask.length; i++) md.data[i * 4 + 3] = L.mask[i];
  mx.putImageData(md, 0, 0);
  x.drawImage(L.img, 0, 0);
  x.globalCompositeOperation = 'destination-in';
  if (feather > 0) x.filter = `blur(${feather}px)`;
  x.drawImage(m, 0, 0);
  x.filter = 'none';
  x.globalCompositeOperation = 'source-over';
  return c;
}

export default function GhostMannequin({ onSave }: { onSave?: (blob: Blob) => Promise<void> }) {
  const [front, setFront] = useState<Layer | null>(null);
  const [inner, setInner] = useState<Layer | null>(null);
  const [tool, setTool] = useState<Tool>('pick');
  const [target, setTarget] = useState<Target>('front');
  const [tol, setTol] = useState(9);
  const [brush, setBrush] = useState(28);
  const [feather, setFeather] = useState(1.2);
  const [bg, setBg] = useState('#ffffff');
  const [shadow, setShadow] = useState(true);
  const [dark, setDark] = useState(35);
  const [pose, setPose] = useState({ x: 0.5, y: 0.2, s: 0.5, r: 0, flip: false });
  const [showOrig, setShowOrig] = useState(false);
  const [st, setSt] = useState('');
  const [tick, setTick] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const undo = useRef<{ t: Target; m: Uint8ClampedArray }[]>([]);
  const cache = useRef<{ f?: HTMLCanvasElement; n?: HTMLCanvasElement; key?: string }>({});
  const drag = useRef<{ on: boolean; lx: number; ly: number }>({ on: false, lx: 0, ly: 0 });

  const layer = target === 'front' ? front : inner;
  const bump = () => { cache.current.key = ''; setTick((t) => t + 1); };
  const snap = (t: Target) => {
    const L = t === 'front' ? front : inner;
    if (!L) return;
    undo.current.push({ t, m: L.mask.slice() });
    if (undo.current.length > 25) undo.current.shift();
  };

  // 内側の写真の変換（作業座標 → 内側画像の座標）
  const innerMat = useCallback(() => {
    if (!front || !inner) return null;
    const s = (pose.s * front.w) / inner.w;
    const m = new DOMMatrix().translate(pose.x * front.w, pose.y * front.h).rotate(pose.r).scale(pose.flip ? -s : s, s).translate(-inner.w / 2, -inner.h / 2);
    return m;
  }, [front, inner, pose]);

  // 合成
  const render = useCallback((out?: HTMLCanvasElement) => {
    const c = out || cv.current;
    if (!c || !front) return;
    c.width = front.w; c.height = front.h;
    const x = c.getContext('2d')!;
    if (showOrig && !out) { x.drawImage(front.img, 0, 0); return; }
    const key = `${feather}|${tick}`;
    if (cache.current.key !== key) {
      cache.current.f = cutout(front, feather);
      cache.current.n = inner ? cutout(inner, feather) : undefined;
      cache.current.key = key;
    }
    x.fillStyle = bg;
    x.fillRect(0, 0, c.width, c.height);
    const f = cache.current.f!;
    if (shadow) {
      // 床に落ちる柔らかい影
      x.save();
      x.filter = 'blur(18px) brightness(0)';
      x.globalAlpha = bg === '#0b0a11' ? 0.5 : 0.22;
      x.translate(front.w * 0.01, front.h * 0.018);
      x.drawImage(f, 0, 0);
      x.restore();
    }
    const n = cache.current.n;
    const m = innerMat();
    if (n && m) {
      // 内側は奥にあるので少し暗く、上ほど影を濃く
      const t = document.createElement('canvas');
      t.width = n.width; t.height = n.height;
      const tx = t.getContext('2d')!;
      tx.drawImage(n, 0, 0);
      tx.globalCompositeOperation = 'source-atop';
      const g = tx.createLinearGradient(0, 0, 0, n.height);
      g.addColorStop(0, `rgba(0,0,0,${Math.min(0.9, dark / 100 + 0.25)})`);
      g.addColorStop(1, `rgba(0,0,0,${dark / 100})`);
      tx.fillStyle = g;
      tx.fillRect(0, 0, n.width, n.height);
      x.save();
      x.setTransform(m);
      x.drawImage(t, 0, 0);
      x.restore();
    }
    x.drawImage(f, 0, 0);
  }, [front, inner, bg, shadow, dark, feather, tick, showOrig, innerMat]);

  useEffect(() => { render(); }, [render]);

  const toWork = (e: React.PointerEvent) => {
    const c = cv.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height, k: c.width / r.width };
  };
  const toLayer = (p: { x: number; y: number }) => {
    if (target === 'front') return p;
    const m = innerMat();
    if (!m) return null;
    const q = m.inverse().transformPoint(new DOMPoint(p.x, p.y));
    return { x: q.x, y: q.y };
  };

  const paint = (e: React.PointerEvent) => {
    const L = layer;
    if (!L) return;
    const p = toWork(e);
    const q = toLayer(p);
    if (!q) return;
    const scale = target === 'front' ? 1 : 1 / ((pose.s * (front?.w || 1)) / L.w);
    const r = (brush * p.k * scale) / 2;
    const v = tool === 'erase' ? 0 : 255;
    const x0 = Math.max(0, Math.floor(q.x - r)), x1 = Math.min(L.w - 1, Math.ceil(q.x + r));
    const y0 = Math.max(0, Math.floor(q.y - r)), y1 = Math.min(L.h - 1, Math.ceil(q.y + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - q.x) ** 2 + (y - q.y) ** 2 <= r * r) L.mask[y * L.w + x] = v;
    bump();
  };

  const onDown = (e: React.PointerEvent) => {
    if (!front) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toWork(e);
    if (tool === 'move') { drag.current = { on: true, lx: p.x, ly: p.y }; return; }
    if (tool === 'select') {
      const L = layer, q = toLayer(p);
      if (!L || !q) return;
      const xi = Math.round(q.x), yi = Math.round(q.y);
      if (xi < 0 || yi < 0 || xi >= L.w || yi >= L.h) return;
      snap(target);
      selectGarment(L, xi, yi, tol);
      setTool('pick');
      bump();
      return;
    }
    if (tool === 'pick') {
      const L = layer, q = toLayer(p);
      if (!L || !q) return;
      const xi = Math.round(q.x), yi = Math.round(q.y);
      if (xi < 0 || yi < 0 || xi >= L.w || yi >= L.h) return;
      snap(target);
      const i = yi * L.w + xi, d = L.data.data;
      const hit = flood(L, [i], [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], tol);
      for (let k = 0; k < hit.length; k++) if (hit[k]) L.mask[k] = 0;
      tidy(L.mask, L.w, L.h);
      bump();
      return;
    }
    snap(target);
    drag.current = { on: true, lx: p.x, ly: p.y };
    paint(e);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.on || !front) return;
    if (tool === 'move') {
      const p = toWork(e);
      setPose((o) => ({ ...o, x: o.x + (p.x - drag.current.lx) / front.w, y: o.y + (p.y - drag.current.ly) / front.h }));
      drag.current.lx = p.x; drag.current.ly = p.y;
      return;
    }
    if (tool === 'erase' || tool === 'restore') paint(e);
  };
  const onUp = () => { drag.current.on = false; };

  const doUndo = () => {
    const u = undo.current.pop();
    if (!u) return;
    const L = u.t === 'front' ? front : inner;
    if (L) { L.mask.set(u.m); bump(); }
  };

  const pickFile = async (file: File | undefined, which: Target) => {
    if (!file) return;
    setSt(tt('Reading…', '読み込み中…'));
    try {
      const L = await loadLayer(file);
      autoBackground(L, tol);
      if (which === 'front') { setFront(L); setTarget('front'); setTool('pick'); }
      else { setInner(L); setTarget('inner'); setTool('move'); setPose((p) => ({ ...p, x: 0.5, y: 0.25, s: 0.2 })); }
      undo.current = [];
      cache.current.key = '';
      setSt('');
    } catch (err) { setSt((err as Error).message); }
  };

  const redoBg = () => {
    if (!layer) return;
    snap(target);
    autoBackground(layer, tol);
    bump();
  };

  const exportBlob = () => new Promise<Blob>((res, rej) => {
    const c = document.createElement('canvas');
    render(c);
    c.toBlob((b) => (b ? res(b) : rej(new Error('export failed'))), 'image/jpeg', 0.92);
  });

  const download = async () => {
    const b = await exportBlob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'ghost-mannequin.jpg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const save = async () => {
    if (!onSave) return;
    setSt(tt('Saving…', '保存中…'));
    try { await onSave(await exportBlob()); setSt(tt('Saved as a new draft piece.', '下書きの作品として保存しました。')); }
    catch (err) { setSt(tt('Error: ', 'エラー：') + (err as Error).message); }
  };

  const T = (k: Tool, l: string, dis = false) => (
    <button type="button" className={`btn${tool === k ? ' primary' : ''}`} aria-pressed={tool === k} disabled={dis} onClick={() => setTool(k)}>{l}</button>
  );

  return (
    <div className="gm">
      <div className="sec">
        <h4>{tt('Ghost mannequin', 'ゴーストマネキン')}</h4>
        <p>{tt(
          'Shoot the piece on a mannequin against a plain wall, then shoot the inside of the back neck. The background is removed automatically; tap the mannequin to remove it, then place the inside shot behind the collar. Everything runs on this device.',
          '無地の壁の前でマネキンに着せて撮り、次に首の内側（後ろ身頃の裏）を撮ります。背景は自動で消えます。マネキンをタップして消し、内側の写真を襟の奥に合わせてください。処理はすべてこの端末の中で行います。',
        )}</p>
        <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <label className="btn primary" style={{ cursor: 'pointer' }}>
            {tt('1. Photo on mannequin', '① マネキンの写真')}
            <input type="file" accept="image/*" hidden onChange={(e) => { pickFile(e.target.files?.[0], 'front'); e.target.value = ''; }} />
          </label>
          <label className="btn" style={{ cursor: front ? 'pointer' : 'not-allowed', opacity: front ? 1 : 0.5 }}>
            {tt('2. Inside of the neck', '② 首の内側の写真')}
            <input type="file" accept="image/*" hidden disabled={!front} onChange={(e) => { pickFile(e.target.files?.[0], 'inner'); e.target.value = ''; }} />
          </label>
        </div>
        {st && <p className="status">{st}</p>}
      </div>

      {front && (
        <div className="gm-work">
          <div className="gm-stage" style={{ background: bg }}>
            <canvas
              ref={cv}
              className={`gm-cv tool-${tool}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
          </div>
          <div className="gm-panel sec">
            {inner && (
              <div className="gm-row">
                <span>{tt('Editing', '編集する写真')}</span>
                <button type="button" className={`btn${target === 'front' ? ' primary' : ''}`} onClick={() => { setTarget('front'); if (tool === 'move') setTool('pick'); }}>{tt('Front', '正面')}</button>
                <button type="button" className={`btn${target === 'inner' ? ' primary' : ''}`} onClick={() => setTarget('inner')}>{tt('Inside', '内側')}</button>
              </div>
            )}
            <div className="gm-row">
              {T('select', tt('Tap the garment', '服をタップして選ぶ'))}
              {T('pick', tt('Tap to remove', 'タップで消す'))}
              {T('erase', tt('Erase', '消しゴム'))}
              {T('restore', tt('Restore', '戻すブラシ'))}
              {T('move', tt('Move inside', '内側を動かす'), !inner)}
            </div>
            <label className="gm-sl">{tt('Tolerance', '色の幅')} <input type="range" min={2} max={45} value={tol} onChange={(e) => setTol(+e.target.value)} /> <b>{tol}</b></label>
            <label className="gm-sl">{tt('Brush', 'ブラシ')} <input type="range" min={6} max={90} value={brush} onChange={(e) => setBrush(+e.target.value)} /> <b>{brush}</b></label>
            <label className="gm-sl">{tt('Edge softness', '輪郭のぼかし')} <input type="range" min={0} max={4} step={0.2} value={feather} onChange={(e) => { setFeather(+e.target.value); }} /> <b>{feather}</b></label>
            {inner && (
              <>
                <label className="gm-sl">{tt('Inside size', '内側の大きさ')} <input type="range" min={0.1} max={1.2} step={0.01} value={pose.s} onChange={(e) => setPose({ ...pose, s: +e.target.value })} /></label>
                <label className="gm-sl">{tt('Inside angle', '内側の角度')} <input type="range" min={-30} max={30} step={0.5} value={pose.r} onChange={(e) => setPose({ ...pose, r: +e.target.value })} /></label>
                <label className="gm-sl">{tt('Inside shade', '内側の暗さ')} <input type="range" min={0} max={70} value={dark} onChange={(e) => setDark(+e.target.value)} /></label>
                <label className="gm-ck"><input type="checkbox" checked={pose.flip} onChange={(e) => setPose({ ...pose, flip: e.target.checked })} /> {tt('Flip inside', '内側を左右反転')}</label>
              </>
            )}
            <div className="gm-row">
              <span>{tt('Background', '背景')}</span>
              {['#ffffff', '#f2f0ec', '#0b0a11'].map((c) => (
                <button key={c} type="button" className="gm-sw" aria-pressed={bg === c} style={{ background: c }} onClick={() => setBg(c)} aria-label={c} />
              ))}
              <label className="gm-ck"><input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} /> {tt('Shadow', '影')}</label>
            </div>
            <div className="gm-row">
              <button type="button" className="btn" onClick={doUndo}>{tt('Undo', '元に戻す')}</button>
              <button type="button" className="btn" onClick={redoBg}>{tt('Redo background', '背景を消し直す')}</button>
              <button type="button" className="btn" onPointerDown={() => setShowOrig(true)} onPointerUp={() => setShowOrig(false)} onPointerLeave={() => setShowOrig(false)}>{tt('Hold: original', '押す間 元画像')}</button>
            </div>
            <div className="gm-row">
              <button type="button" className="btn" onClick={download}>{tt('Download', 'ダウンロード')}</button>
              {onSave && <button type="button" className="btn primary" onClick={save}>{tt('Save as draft piece', '下書きの作品として保存')}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
