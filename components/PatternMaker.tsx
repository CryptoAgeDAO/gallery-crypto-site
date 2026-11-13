'use client';
// パターンメーカー：服の写真 → AI（Gemini）が作りと寸法を予測 → 型紙を自動作図 →
// 変換パターン（ラグラン化、フーディ化、パッチワークの切り替え、アシンメトリー裾 など）を AI が提案・指示どおりに生成。
// AI キーがなくても、輪郭からの推定と組み込みの変換で使える。原寸 SVG／A4 分割印刷／ZIP。
import { useEffect, useMemo, useRef, useState } from 'react';
import { autoBackground, flood, loadLayer, selectGarment, tidy, type Layer } from './GhostMannequin';
import { detectLandmarks, measuresFromLandmarks, LM_LABEL, toSVG, type Landmarks, type LmKey, type Measures } from './pattern';
import { baseSpec, frontOutline, specPieces, type Spec } from './patternSpec';
import { analyze, propose, DEFAULT_MODEL } from './gemini';
import { tt, useLang } from './Lang';

const FIELDS: [keyof Measures, string, string][] = [
  ['length', 'Length', '着丈'], ['chest', 'Chest (flat)', '身幅'], ['hem', 'Hem (flat)', '裾幅'], ['shoulder', 'Shoulder', '肩幅'],
  ['armhole', 'Armhole depth', '袖ぐりの深さ'], ['neckW', 'Neck width', '衿ぐり幅'], ['neckF', 'Front neck drop', '前衿ぐりの深さ'],
  ['sleeve', 'Sleeve length', '袖丈'], ['bicep', 'Sleeve width (flat)', '袖幅'], ['cuff', 'Cuff (flat)', '袖口幅'],
];
const store = { get: (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {} } };

// 組み込みの変換（AI なしでも使える）
function builtins(b: Spec): Spec[] {
  const m = b.m;
  const w = (o: Partial<Spec>, mm: Partial<Measures> = {}): Spec => ({ ...b, ...o, m: { ...m, ...mm }, splits: o.splits || [] });
  return [
    { ...b, name: 'Original', nameJa: '原型' },
    w({ name: 'Cropped', nameJa: 'クロップド', note: '着丈を2割短く、身幅を少し広げたショート丈。' }, { length: m.length * 0.8, chest: m.chest * 1.04, hem: m.chest * 1.04 }),
    w({ name: 'Drop-shoulder oversize', nameJa: 'オーバーサイズ', sleeve: m.hasSleeves ? 'drop' : 'none', drop: 9, note: '肩を9cm落とし、身幅と袖幅を広げたオーバーサイズ。' }, { chest: m.chest * 1.14, hem: m.hem * 1.14, length: m.length + 3, bicep: m.bicep * 1.15 }),
    w({ name: 'Raglan', nameJa: 'ラグラン化', sleeve: 'raglan', note: '肩を袖側に入れ、襟ぐりから脇へ斜めに切り替えるラグラン袖に変換。' }, { hasSleeves: true }),
    w({ name: 'Hoodie', nameJa: 'フーディ化', hood: true, pocket: 'kangaroo', ribHem: true, ribCuff: m.sleeve > 40, sleeve: m.hasSleeves ? 'drop' : 'none', drop: 6, note: 'フードとカンガルーポケット、裾リブを足してパーカーに変換。' }, { chest: m.chest * 1.08, hem: m.hem * 1.04 }),
    w({ name: 'Patchwork panels', nameJa: 'パッチワーク切り替え', splits: [{ piece: 'front', dir: 'h', at: 0.42 }, { piece: 'front', dir: 'v', at: 0.55 }, { piece: 'back', dir: 'h', at: 0.6 }, { piece: 'sleeve', dir: 'h', at: 0.5 }], note: '前身頃・後身頃・袖を切り替えて、別々の古着から取った布をつなぐ再構築用のパターン。' }),
    w({ name: 'Asymmetric hem', nameJa: 'アシンメトリー裾', hem: 'asym', hemAmount: 12, note: '左右で着丈を12cm変えた、斜めの裾。前身頃は全身で裁つ。' }),
    w({ name: 'Curved hem', nameJa: 'カーブ裾', hem: 'curved', hemAmount: 7, note: '脇を7cm上げた、ラウンドの裾。' }, { length: m.length + 3 }),
    w({ name: 'Sleeveless', nameJa: 'ノースリーブ化', sleeve: 'none', note: '袖をなくし、袖ぐりを深くしてバイアスで始末。' }, { shoulder: m.shoulder * 0.86, hasSleeves: false }),
    w({ name: 'Mock neck long sleeve', nameJa: 'モックネック長袖', neck: 'mock', ribCuff: true, note: '衿をモックネックに、袖を手首までの長袖に。' }, { hasSleeves: true, sleeve: Math.max(58, m.sleeve), cuff: Math.min(m.cuff, m.bicep * 0.6) }),
  ];
}

export default function PatternMaker() {
  const { lang } = useLang();
  const [L, setL] = useState<Layer | null>(null);
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [ver, setVer] = useState(0);
  const [len, setLen] = useState(70);
  const [tol, setTol] = useState(9);
  const [mode, setMode] = useState<'select' | 'toggle'>('select');
  const [base, setBase] = useState<Spec | null>(null);
  const [aiBase, setAiBase] = useState(false);
  const [aiSpecs, setAiSpecs] = useState<Spec[]>([]);
  const [sel, setSel] = useState(0);
  const [edits, setEdits] = useState<Record<number, Spec>>({});
  const [key, setKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [lm, setLm] = useState<Landmarks | null>(null);
  const [lmTouched, setLmTouched] = useState(false);
  const [ruler, setRuler] = useState<{ on: boolean; a: [number, number]; b: [number, number]; cm: number }>({ on: false, a: [0, 0], b: [0, 0], cm: 29.7 });
  const [showFit, setShowFit] = useState(true);
  const dragK = useRef<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pv = useRef<HTMLCanvasElement>(null);

  useEffect(() => { setKey(store.get('gc-gemini-key')); setModel(store.get('gc-gemini-model') || DEFAULT_MODEL); }, []);

  const pick = async (f?: File) => {
    if (!f) return;
    const l = await loadLayer(f);
    autoBackground(l, tol);
    setL(l); setPhoto(l.img); setMode('select'); setLmTouched(false); setAiBase(false); setAiSpecs([]); setEdits({}); setSel(0); setMsg('');
  };
  useEffect(() => {
    const c = pv.current;
    if (!c || !L) return;
    c.width = L.w; c.height = L.h;
    const x = c.getContext('2d')!, d = x.createImageData(L.w, L.h), s = L.data.data;
    for (let i = 0; i < L.mask.length; i++) { const k = L.mask[i] > 127; d.data[i * 4] = k ? s[i * 4] : s[i * 4] * 0.35 + 150; d.data[i * 4 + 1] = k ? s[i * 4 + 1] : s[i * 4 + 1] * 0.35; d.data[i * 4 + 2] = k ? s[i * 4 + 2] : s[i * 4 + 2] * 0.35; d.data[i * 4 + 3] = 255; }
    x.putImageData(d, 0, 0);
  }, [L, ver]);
  // 服の形が変わったら目印の点を置き直す（手で動かした後は動かさない）
  useEffect(() => {
    if (!L || lmTouched) return;
    const d = detectLandmarks(L);
    setLm(d);
    if (d) setRuler((r) => (r.on ? r : { ...r, a: [d.HL[0], d.HL[1] + L.h * 0.03], b: [d.HR[0], d.HR[1] + L.h * 0.03] }));
  }, [L, ver, lmTouched]);
  // 縮尺：ものさし（既知の長さ）か、実物の着丈
  const kScale = useMemo(() => {
    if (!lm) return 0;
    if (ruler.on) { const px = Math.hypot(ruler.a[0] - ruler.b[0], ruler.a[1] - ruler.b[1]); return px > 5 ? ruler.cm / px : 0; }
    const px = (lm.HL[1] + lm.HR[1]) / 2 - (lm.NL[1] + lm.NR[1]) / 2;
    return px > 5 ? len / px : 0;
  }, [lm, ruler, len]);
  const measured = useMemo(() => (lm && kScale ? measuresFromLandmarks(lm, kScale) : null), [lm, kScale]);
  // 点から測った寸法を型紙に使う。AI は作り（袖・衿など）だけを予測し、寸法は写真の点を優先する
  useEffect(() => {
    if (!measured) return;
    setBase((b) => (b && aiBase ? { ...b, m: { ...b.m, ...measured, hasSleeves: b.m.hasSleeves } } : baseSpec(measured)));
    setEdits({});
  }, [measured]); // eslint-disable-line react-hooks/exhaustive-deps

  // 点のドラッグ
  const svgPt = (e: React.PointerEvent) => { const r = svgRef.current!.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * L!.w, ((e.clientY - r.top) / r.height) * L!.h] as [number, number]; };
  const startDrag = (k: string) => (e: React.PointerEvent) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); dragK.current = k; };
  const moveDrag = (e: React.PointerEvent) => {
    const k = dragK.current; if (!k || !L) return;
    const p = svgPt(e);
    if (k === 'ra' || k === 'rb') { setRuler((r) => ({ ...r, [k === 'ra' ? 'a' : 'b']: p })); return; }
    setLm((o) => (o ? { ...o, [k]: p } : o)); setLmTouched(true);
  };

  const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!L) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * L.w), y = Math.round(((e.clientY - r.top) / r.height) * L.h);
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return;
    if (mode === 'select') selectGarment(L, x, y, tol);
    else { const i = y * L.w + x, d = L.data.data, restore = L.mask[i] < 128; const hit = flood(L, [i], [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], tol); for (let k = 0; k < hit.length; k++) if (hit[k]) L.mask[k] = restore ? 255 : 0; tidy(L.mask, L.w, L.h); }
    setVer((v) => v + 1);
  };

  const all = useMemo(() => (base ? [...aiSpecs, ...builtins(base)] : []), [base, aiSpecs]);
  const cur = all.length ? edits[sel] || all[Math.min(sel, all.length - 1)] : null;
  const setCur = (p: Partial<Spec>, mm?: Partial<Measures>) => { if (!cur) return; setEdits((e) => ({ ...e, [sel]: { ...cur, ...p, m: { ...cur.m, ...(mm || {}) } } })); };
  const svgOf = (s: Spec, title = '') => toSVG(specPieces(s), lang === 'ja' ? 'ja' : 'en', title);
  const sheet = useMemo(() => (cur ? svgOf(cur, `GALLERY CRYPTO — ${lang === 'ja' ? cur.nameJa || cur.name : cur.name}`) : null), [cur, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const thumbs = useMemo(() => all.map((s, i) => ({ s, i, url: url(svgOf(edits[i] || s).svg) })), [all, edits, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  function url(svg: string) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
  const dl = (b: Blob, n: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = n; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); };

  const needKey = () => { if (key.trim()) { store.set('gc-gemini-key', key.trim()); store.set('gc-gemini-model', model.trim() === DEFAULT_MODEL ? '' : model.trim()); return true; } setMsg(tt('Enter your Gemini API key in AI settings first.', '先に「AIの設定」で Gemini の API キーを入れてください。')); return false; };
  const cutPhoto = () => {
    if (!L) return null;
    // 切り抜いた服を白背景にして AI に渡す
    const c = document.createElement('canvas'); c.width = L.w; c.height = L.h;
    const x = c.getContext('2d')!, d = x.createImageData(L.w, L.h), s = L.data.data;
    for (let i = 0; i < L.mask.length; i++) { const k = L.mask[i] > 127; d.data[i * 4] = k ? s[i * 4] : 255; d.data[i * 4 + 1] = k ? s[i * 4 + 1] : 255; d.data[i * 4 + 2] = k ? s[i * 4 + 2] : 255; d.data[i * 4 + 3] = 255; }
    x.putImageData(d, 0, 0);
    return c;
  };
  const doAnalyze = async () => {
    if (!base || !needKey()) return;
    setMsg(''); setBusy(tt('AI is reading the garment…', 'AIが服の作りと寸法を読み取っています…'));
    try {
      const s = await analyze(key.trim(), model.trim() || DEFAULT_MODEL, cutPhoto() || photo!, base.m);
      if (s) { setBase(measured ? { ...s, m: { ...s.m, ...measured, hasSleeves: s.m.hasSleeves } } : s); setAiBase(true); setEdits({}); setSel(aiSpecs.length); setMsg(s.note || ''); }
    } catch (e) { setMsg(tt('AI error: ', 'AIのエラー：') + (e as Error).message); }
    setBusy('');
  };
  const doPropose = async (instruction: string) => {
    if (!cur || !needKey()) return;
    setMsg(''); setBusy(instruction ? tt('AI is converting…', 'AIが指示どおりに変換しています…') : tt('AI is designing variations…', 'AIが変換案を考えています…'));
    try {
      const got = await propose(key.trim(), model.trim() || DEFAULT_MODEL, cutPhoto(), instruction ? cur : base!, 4, instruction);
      if (!got.length) throw new Error(tt('No design came back.', '案が返ってきませんでした。'));
      const tagged = got.map((g) => ({ ...g, name: '✦ ' + g.name, nameJa: '✦ ' + (g.nameJa || g.name) }));
      setAiSpecs((a) => [...tagged, ...a].slice(0, 16));
      setEdits({}); setSel(0); setAsk('');
    } catch (e) { setMsg(tt('AI error: ', 'AIのエラー：') + (e as Error).message); }
    setBusy('');
  };

  const printA4 = () => {
    if (!sheet) return;
    const pw = 19, ph = 27.7, cols = Math.ceil(sheet.W / pw), rows = Math.ceil(sheet.H / ph), src = url(sheet.svg);
    let pages = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pages += `<section class="pg"><div class="win"><img src="${src}" style="width:${sheet.W * 10}mm;height:${sheet.H * 10}mm;left:-${c * pw * 10}mm;top:-${r * ph * 10}mm"></div><b>${String.fromCharCode(65 + r)}${c + 1}</b><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></section>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pattern A4</title><style>@page{size:A4;margin:0}body{margin:0}.pg{width:210mm;height:297mm;position:relative;page-break-after:always;overflow:hidden}.win{position:absolute;left:10mm;top:10mm;width:190mm;height:277mm;overflow:hidden}.win img{position:absolute}b{position:absolute;right:12mm;bottom:4mm;font:12px sans-serif}i{position:absolute;width:6mm;height:6mm;border:0 solid #000}.tl{left:4mm;top:4mm;border-width:0.3mm 0 0 0.3mm}.tr{right:4mm;top:4mm;border-width:0.3mm 0.3mm 0 0}.bl{left:4mm;bottom:4mm;border-width:0 0 0.3mm 0.3mm}.br{right:4mm;bottom:4mm;border-width:0 0.3mm 0.3mm 0}</style></head><body>${pages}<script>window.onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { setMsg(tt('Allow pop-ups to print.', '印刷するにはポップアップを許可してください。')); return; }
    w.document.write(html); w.document.close();
  };
  const zipAll = async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const files: Record<string, Uint8Array> = {};
    all.forEach((s0, i) => { const s = edits[i] || s0; files[`${String(i + 1).padStart(2, '0')}-${s.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}.svg`] = strToU8(svgOf(s, `GALLERY CRYPTO — ${lang === 'ja' ? s.nameJa || s.name : s.name}`).svg); });
    files['specs.json'] = strToU8(JSON.stringify(all.map((s, i) => edits[i] || s), null, 2));
    dl(new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), 'gc-patterns.zip');
  };

  const O = <K extends keyof Spec>(k: K, opts: [Spec[K], string, string][]) => (
    <div className="gm-row">{opts.map(([v, en, ja]) => <button key={String(v)} type="button" className={`btn${cur && cur[k] === v ? ' primary' : ''}`} onClick={() => setCur({ [k]: v } as Partial<Spec>, k === 'sleeve' ? { hasSleeves: v !== 'none' } : undefined)}>{tt(en, ja)}</button>)}</div>
  );

  return (
    <div className="pm">
      {!L ? (
        <label className="ai-drop">
          <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <b>{tt('Choose a photo of the garment', '服の写真を選ぶ')}</b>
          <span>{tt('AI reads how it is made and its measurements, drafts the pattern, and designs new conversions from it.', 'AIが服の作りと寸法を読み取って型紙をつくり、そこから新しい変換パターンを考えます。')}</span>
        </label>
      ) : (
        <div className="pm-main">
          <div className="pm-left">
            <div className="pm-photo">
              <canvas ref={pv} className="p3-pv" onPointerDown={tap} />
              {lm && L && (
                <svg ref={svgRef} className="pm-ov" viewBox={`0 0 ${L.w} ${L.h}`} onPointerMove={moveDrag} onPointerUp={() => { dragK.current = null; }} onPointerCancel={() => { dragK.current = null; }}>
                  {(() => {
                    const r = L.w / 95, sw = L.w / 420;
                    const ln = (a: [number, number], b: [number, number], c: string) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={c} strokeWidth={sw * 2} strokeDasharray={`${sw * 6} ${sw * 4}`} />;
                    const hpsY = (lm.NL[1] + lm.NR[1]) / 2, cxI = (lm.NL[0] + lm.NR[0]) / 2;
                    const cm = (v: number) => (measured ? `${(measured[v as unknown as keyof Measures] as number) ?? ''}` : '');
                    void cm;
                    let fit: string | null = null;
                    if (showFit && cur && kScale) {
                      const half = frontOutline(cur);
                      const pts = [...half.map((q) => [cxI + q[0] / kScale, hpsY + q[1] / kScale]), ...[...half].reverse().map((q) => [cxI - q[0] / kScale, hpsY + q[1] / kScale])];
                      fit = pts.map((q) => q.join(',')).join(' ');
                    }
                    const cuffMid: [number, number] = [(lm.CO[0] + lm.CI[0]) / 2, (lm.CO[1] + lm.CI[1]) / 2];
                    return (
                      <>
                        {fit && <polygon points={fit} fill="rgba(45,226,200,.10)" stroke="#12b5a0" strokeWidth={sw * 2.5} />}
                        {ln(lm.SL, lm.SR, '#ff3d7f')}{ln(lm.AL, lm.AR, '#ff3d7f')}{ln(lm.HL, lm.HR, '#ff3d7f')}{ln(lm.NL, lm.NR, '#ff3d7f')}
                        {ln([cxI, hpsY], [cxI, (lm.HL[1] + lm.HR[1]) / 2], '#ffb020')}
                        {lm.hasSleeves && ln(lm.SR, cuffMid, '#ffb020')}{lm.hasSleeves && ln(lm.CO, lm.CI, '#ff3d7f')}
                        {ruler.on && <><line x1={ruler.a[0]} y1={ruler.a[1]} x2={ruler.b[0]} y2={ruler.b[1]} stroke="#2563eb" strokeWidth={sw * 3} />
                          {(['ra', 'rb'] as const).map((k) => { const q = k === 'ra' ? ruler.a : ruler.b; return <circle key={k} cx={q[0]} cy={q[1]} r={r} fill="#2563eb" stroke="#fff" strokeWidth={sw * 2} onPointerDown={startDrag(k)} style={{ cursor: 'grab' }} />; })}</>}
                        {(Object.keys(LM_LABEL) as LmKey[]).filter((k) => lm.hasSleeves || (k !== 'CO' && k !== 'CI')).map((k) => (
                          <g key={k} onPointerDown={startDrag(k)} style={{ cursor: 'grab' }}>
                            <circle cx={lm[k][0]} cy={lm[k][1]} r={r * 2.2} fill="transparent" />
                            <circle cx={lm[k][0]} cy={lm[k][1]} r={r} fill="#fff" stroke="#ff3d7f" strokeWidth={sw * 2.5} />
                            <text x={lm[k][0] + r * 1.4} y={lm[k][1] - r * 1.2} fontSize={r * 1.7} fill="#111" stroke="#fff" strokeWidth={sw * 2} paintOrder="stroke">{k}</text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              )}
            </div>
            <p className="note">{tt('Drag the pink points onto the garment: neck (NL/NR/CF), shoulder tips (SL/SR), armpits (AL/AR), hem corners (HL/HR), cuff edges (CO/CI). The pattern is measured from these points. The green outline is the front pattern laid over the photo.', 'ピンクの点を服の位置にドラッグして合わせてください：首の付け根（NL/NR）、前衿の一番下（CF）、肩先（SL/SR）、脇の下（AL/AR）、裾の角（HL/HR）、袖口の両端（CO/CI）。型紙の寸法はこの点から測ります。緑の線は、前身頃の型紙を写真に重ねたものです。')}</p>
            <div className="gm-row">
              <label className="gm-ck"><input type="checkbox" checked={showFit} onChange={(e) => setShowFit(e.target.checked)} /> {tt('Overlay pattern', '型紙を重ねる')}</label>
              <button type="button" className="btn" onClick={() => setLmTouched(false)}>{tt('Re-place points automatically', '点を自動で置き直す')}</button>
            </div>
            <div className="gm-row">
              <button type="button" className={`btn${mode === 'select' ? ' primary' : ''}`} onClick={() => setMode('select')}>{tt('Tap the garment', '服をタップして選ぶ')}</button>
              <button type="button" className={`btn${mode === 'toggle' ? ' primary' : ''}`} onClick={() => setMode('toggle')}>{tt('Tap to remove / restore', 'タップで消す・戻す')}</button>
            </div>
            <div className="pm-scale">
              <p className="pm-k">{tt('Scale (how big the garment really is)', '縮尺（実物の大きさ）')}</p>
              <div className="gm-row">
                <button type="button" className={`btn${!ruler.on ? ' primary' : ''}`} onClick={() => setRuler((r) => ({ ...r, on: false }))}>{tt('By real length', '実物の着丈で')}</button>
                <button type="button" className={`btn${ruler.on ? ' primary' : ''}`} onClick={() => setRuler((r) => ({ ...r, on: true }))}>{tt('By a ruler in the photo', '写真の中のものさしで')}</button>
              </div>
              {!ruler.on ? (
                <label className="ai-field">{tt('Measure the real garment from the neck point to the hem (cm)', '実物の首の付け根から裾までを測った長さ（cm）')}
                  <input type="number" min={20} max={150} step={0.5} value={len} onChange={(e) => setLen(+e.target.value || 70)} />
                </label>
              ) : (
                <>
                  <p className="note">{tt('Put something of known size next to the garment when you shoot (A4 paper, a ruler…), then drag the blue line onto it.', '撮るときに服の横に大きさの分かる物（A4の紙、定規など）を置き、青い線をその上に合わせてください。')}</p>
                  <div className="gm-row">
                    {([[29.7, 'A4 long side', 'A4の長辺'], [21, 'A4 short side', 'A4の短辺'], [30, '30 cm ruler', '30cm定規'], [8.56, 'Card', 'カード']] as [number, string, string][]).map(([v, en, ja]) => <button key={v} type="button" className={`btn${ruler.cm === v ? ' primary' : ''}`} onClick={() => setRuler((r) => ({ ...r, cm: v }))}>{tt(en, ja)}</button>)}
                  </div>
                  <label className="ai-field">{tt('Length of the blue line (cm)', '青い線の長さ（cm）')}<input type="number" step={0.1} value={ruler.cm} onChange={(e) => setRuler((r) => ({ ...r, cm: +e.target.value || 1 }))} /></label>
                </>
              )}
              {measured && <p className="note">{tt(`Measured: length ${measured.length} · chest ${measured.chest} · shoulder ${measured.shoulder} · sleeve ${measured.sleeve} cm`, `測った値：着丈 ${measured.length}・身幅 ${measured.chest}・肩幅 ${measured.shoulder}・袖丈 ${measured.sleeve} cm`)}</p>}
            </div>

            <div className="pm-ai">
              <h5>✦ {tt('AI', 'AI')}</h5>
              <button type="button" className="btn primary" disabled={!!busy} onClick={doAnalyze}>{tt('1. AI reads the garment', '① AIで服を解析')}</button>
              <p className="note">{aiBase ? tt('Measurements and construction predicted by AI.', '寸法と作りはAIの予測です。') : tt('Now: rough estimate from the outline only.', '今は輪郭からの簡易な推定です。')}</p>
              <button type="button" className="btn" disabled={!!busy} onClick={() => doPropose('')}>{tt('2. AI proposes 4 conversions', '② AIが変換案を4つ提案')}</button>
              <label className="ai-field">{tt('3. Tell the AI how to convert the selected pattern', '③ 選んだ型紙をどう変えたいか、AIに指示')}
                <textarea rows={3} value={ask} placeholder={tt('e.g. Make it a cropped raglan hoodie, and split the front into 3 panels for patchwork', '例：クロップド丈のラグランパーカーにして、前身頃をパッチワーク用に3枚に切り替えて')} onChange={(e) => setAsk(e.target.value)} />
              </label>
              <button type="button" className="btn" disabled={!!busy || !ask.trim()} onClick={() => doPropose(ask.trim())}>{tt('Convert with AI', 'AIで変換')}</button>
              <details className="ai-adv">
                <summary>{tt('AI settings', 'AIの設定')}</summary>
                <label className="ai-field">{tt('Gemini API key', 'Gemini の API キー')}<input type="password" autoComplete="off" value={key} placeholder="AIza…" onChange={(e) => setKey(e.target.value)} /></label>
                <p className="note">{tt('Saved only in this browser. Get one free at aistudio.google.com → Get API key. On the free tier, Google may use the content to improve its products.', 'このブラウザにだけ保存します。aistudio.google.com の「Get API key」から無料で作れます。無料枠では、送った内容が Google の製品改善に使われることがあります。')}</p>
                <label className="ai-field">{tt('Model', 'モデル')}<input value={model} onChange={(e) => setModel(e.target.value)} /></label>
              </details>
            </div>

            {cur && (
              <details className="ai-adv" open>
                <summary>{tt('Edit the selected pattern', '選んだ型紙を調整')}</summary>
                <div className="pm-meas">
                  {FIELDS.filter(([k]) => cur.sleeve !== 'none' || !['sleeve', 'bicep', 'cuff'].includes(k)).map(([k, en, ja]) => (
                    <label key={k}>{tt(en, ja)}<input type="number" step={0.5} value={(cur.m[k] as number).toFixed(1)} onChange={(e) => setCur({}, { [k]: +e.target.value })} /></label>
                  ))}
                </div>
                <p className="pm-k">{tt('Sleeve', '袖')}</p>
                {O('sleeve', [['setin', 'Set-in', 'セットイン'], ['raglan', 'Raglan', 'ラグラン'], ['drop', 'Drop shoulder', 'ドロップ'], ['none', 'None', 'なし']])}
                {cur.sleeve === 'drop' && <label className="gm-sl">{tt('Drop', '肩を落とす')} <input type="range" min={3} max={16} value={cur.drop} onChange={(e) => setCur({ drop: +e.target.value })} /> <b>{cur.drop}</b></label>}
                <p className="pm-k">{tt('Neck', '衿')}</p>
                {O('neck', [['crew', 'Crew', 'クルー'], ['v', 'V', 'V'], ['mock', 'Mock', 'モック'], ['boat', 'Boat', 'ボート']])}
                <p className="pm-k">{tt('Hem', '裾')}</p>
                {O('hem', [['straight', 'Straight', 'まっすぐ'], ['curved', 'Curved', 'カーブ'], ['asym', 'Asymmetric', 'アシメ'], ['slits', 'Slits', 'スリット']])}
                {cur.hem !== 'straight' && <label className="gm-sl">{tt('Amount', '量')} <input type="range" min={2} max={25} value={cur.hemAmount} onChange={(e) => setCur({ hemAmount: +e.target.value })} /> <b>{cur.hemAmount}</b></label>}
                <p className="pm-k">{tt('Pocket', 'ポケット')}</p>
                {O('pocket', [['none', 'None', 'なし'], ['kangaroo', 'Kangaroo', 'カンガルー'], ['patch', 'Patch', 'パッチ']])}
                <div className="gm-row">
                  <label className="gm-ck"><input type="checkbox" checked={cur.hood} onChange={(e) => setCur({ hood: e.target.checked })} /> {tt('Hood', 'フード')}</label>
                  <label className="gm-ck"><input type="checkbox" checked={cur.ribHem} onChange={(e) => setCur({ ribHem: e.target.checked })} /> {tt('Rib hem', '裾リブ')}</label>
                  <label className="gm-ck"><input type="checkbox" checked={cur.ribCuff} onChange={(e) => setCur({ ribCuff: e.target.checked })} /> {tt('Rib cuffs', '袖口リブ')}</label>
                </div>
                <p className="pm-k">{tt('Panels (split lines)', '切り替え線')}</p>
                {cur.splits.map((q, i) => (
                  <div className="gm-row" key={i}>
                    <select value={q.piece} onChange={(e) => setCur({ splits: cur.splits.map((x, j) => (j === i ? { ...x, piece: e.target.value as 'front' } : x)) })}><option value="front">{tt('Front', '前')}</option><option value="back">{tt('Back', '後ろ')}</option><option value="sleeve">{tt('Sleeve', '袖')}</option></select>
                    <select value={q.dir} onChange={(e) => setCur({ splits: cur.splits.map((x, j) => (j === i ? { ...x, dir: e.target.value as 'h' } : x)) })}><option value="h">{tt('Across', '横')}</option><option value="v">{tt('Down', '縦')}</option></select>
                    <input type="range" min={0.1} max={0.9} step={0.05} value={q.at} onChange={(e) => setCur({ splits: cur.splits.map((x, j) => (j === i ? { ...x, at: +e.target.value } : x)) })} />
                    <button type="button" className="btn" onClick={() => setCur({ splits: cur.splits.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <button type="button" className="btn" onClick={() => setCur({ splits: [...cur.splits, { piece: 'front', dir: 'h', at: 0.5 }] })}>{tt('+ Add a split line', '＋ 切り替え線を足す')}</button>
              </details>
            )}
            <label className="btn" style={{ cursor: 'pointer' }}>
              {tt('Use another photo', '別の写真にする')}
              <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>

          <div className="pm-right">
            {busy && <div className="ai-busy" style={{ position: 'static' }}><i /> {busy}</div>}
            {msg && <p className="note pm-msg">{msg}</p>}
            <div className="pm-vars">
              {thumbs.map(({ s, i, url: u }) => (
                <button type="button" key={i} className={`${sel === i ? 'on' : ''}${s.name.startsWith('✦') ? ' ai' : ''}`} onClick={() => setSel(i)}>
                  <img src={u} alt="" />
                  <b>{lang === 'ja' ? s.nameJa || s.name : s.name}</b>
                  {s.note && <span>{s.note}</span>}
                </button>
              ))}
            </div>
            {sheet && <div className="pm-sheet"><img src={url(sheet.svg)} alt="" /></div>}
            {cur?.note && <p className="note">{cur.note}</p>}
            <div className="gm-row">
              <button type="button" className="btn primary" disabled={!sheet} onClick={() => sheet && dl(new Blob([sheet.svg], { type: 'image/svg+xml' }), `gc-pattern-${(cur?.name || 'pattern').replace(/[^\w-]+/g, '-').toLowerCase()}.svg`)}>{tt('Full-size SVG', '原寸 SVG')}</button>
              <button type="button" className="btn" disabled={!sheet} onClick={printA4}>{tt('Print on A4 sheets', 'A4で分割印刷')}</button>
              <button type="button" className="btn" disabled={!all.length} onClick={zipAll}>{tt('All patterns (ZIP)', '全パターン（ZIP）')}</button>
            </div>
            <p className="note">{tt('Measurements are predictions. Check them against the real garment and make a toile before cutting good fabric. Print A4 at 100% and check the 5 cm square.', '寸法は予測です。実物と照らし合わせ、本番の布を切る前に仮縫い（トワル）で確認してください。A4印刷は倍率100%で、5cmの四角を確かめてください。')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
