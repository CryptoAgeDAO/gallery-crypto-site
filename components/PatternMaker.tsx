'use client';
// パターンメーカー：写真の形どおりに型紙をなぞり、そこに再構築の操作（切り替え・ハーフ＆ハーフ・ゴデ・サイドパネル・継ぎ足し・斜めカット・フード…）を重ねる。
// AI（Gemini）は写真を見て再構築案を考え、文章の指示どおりに操作を組み立てる。仕上がりは取り込んだ写真を切り貼りしたプレビューで確認できる。
import { useEffect, useMemo, useRef, useState } from 'react';
import { autoBackground, flood, loadLayer, selectGarment, tidy, type Layer } from './GhostMannequin';
import { toSVG } from './pattern';
import { trace, type Traced } from './traced';
import { build, preview, BUILTIN, type Design, type Op } from './recon';
import { proposeDesigns, DEFAULT_MODEL } from './gemini';
import { tt, useLang } from './Lang';

const store = { get: (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {} } };
const OPS: { t: Op['t']; en: string; ja: string; make: () => Op }[] = [
  { t: 'split', en: 'Split panel', ja: '切り替え', make: () => ({ t: 'split', piece: 'front', dir: 'h', at: 0.5, fabric: 'B' }) },
  { t: 'half', en: 'Half & half', ja: 'ハーフ＆ハーフ', make: () => ({ t: 'half', fabric: 'B' }) },
  { t: 'godet', en: 'Godets', ja: 'ゴデ', make: () => ({ t: 'godet', count: 4, h: 24, w: 16, fabric: 'B' }) },
  { t: 'widen', en: 'Side panels', ja: 'サイドパネル', make: () => ({ t: 'widen', cm: 8, fabric: 'B' }) },
  { t: 'extend', en: 'Hem extension', ja: '裾の継ぎ足し', make: () => ({ t: 'extend', cm: 12, fabric: 'B' }) },
  { t: 'sleeveExtend', en: 'Sleeve extension', ja: '袖の継ぎ足し', make: () => ({ t: 'sleeveExtend', cm: 25, fabric: 'B' }) },
  { t: 'crop', en: 'Crop / diagonal', ja: 'カット', make: () => ({ t: 'crop', at: 0.85, angle: 0 }) },
  { t: 'scale', en: 'Resize', ja: '拡大縮小', make: () => ({ t: 'scale', chest: 0.1, length: 0 }) },
  { t: 'sleeveless', en: 'Sleeveless', ja: '袖なし', make: () => ({ t: 'sleeveless' }) },
  { t: 'hood', en: 'Hood', ja: 'フード', make: () => ({ t: 'hood', fabric: 'B' }) },
  { t: 'pocket', en: 'Pocket', ja: 'ポケット', make: () => ({ t: 'pocket', fabric: 'B' }) },
  { t: 'swap', en: 'Back to front', ja: '前後入れ替え', make: () => ({ t: 'swap' }) },
];
const NUM: Record<string, [string, string, number, number, number]> = {
  at: ['Position', '位置', 0.1, 1, 0.05], angle: ['Angle', '角度', -30, 30, 1], cm: ['cm', 'cm', 2, 60, 1], count: ['Count', '枚数', 1, 8, 1],
  h: ['Height', '高さ', 6, 60, 1], w: ['Width', '幅', 4, 50, 1], chest: ['Width %', '身幅', -0.3, 0.6, 0.02], length: ['Length %', '着丈', -0.4, 0.6, 0.02],
};

export default function PatternMaker() {
  const { lang } = useLang();
  const [L, setL] = useState<Layer | null>(null);
  const [back, setBack] = useState<Layer | null>(null);
  const [fabB, setFabB] = useState<HTMLCanvasElement | null>(null);
  const [ver, setVer] = useState(0);
  const [len, setLen] = useState(70);
  const [tol, setTol] = useState(9);
  const [mode, setMode] = useState<'select' | 'toggle'>('select');
  const [ai, setAi] = useState<Design[]>([]);
  const [sel, setSel] = useState(0);
  const [edits, setEdits] = useState<Record<number, Design>>({});
  const [key, setKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [view, setView] = useState<'look' | 'pattern'>('look');
  const pv = useRef<HTMLCanvasElement>(null);
  const look = useRef<HTMLCanvasElement>(null);

  useEffect(() => { setKey(store.get('gc-gemini-key')); setModel(store.get('gc-gemini-model') || DEFAULT_MODEL); }, []);
  const pick = async (f?: File) => { if (!f) return; const l = await loadLayer(f); autoBackground(l, tol); setL(l); setMode('select'); setAi([]); setEdits({}); setSel(0); setMsg(''); };
  const pickBack = async (f?: File) => { if (!f) return; const l = await loadLayer(f); autoBackground(l, tol); setBack(l); };
  const pickB = async (f?: File) => { if (!f) return; const l = await loadLayer(f); setFabB(l.img); };

  useEffect(() => {
    const c = pv.current;
    if (!c || !L) return;
    c.width = L.w; c.height = L.h;
    const x = c.getContext('2d')!, d = x.createImageData(L.w, L.h), s = L.data.data;
    for (let i = 0; i < L.mask.length; i++) { const k = L.mask[i] > 127; d.data[i * 4] = k ? s[i * 4] : s[i * 4] * 0.35 + 150; d.data[i * 4 + 1] = k ? s[i * 4 + 1] : s[i * 4 + 1] * 0.35; d.data[i * 4 + 2] = k ? s[i * 4 + 2] : s[i * 4 + 2] * 0.35; d.data[i * 4 + 3] = 255; }
    x.putImageData(d, 0, 0);
  }, [L, ver]);
  const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!L) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * L.w), y = Math.round(((e.clientY - r.top) / r.height) * L.h);
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return;
    if (mode === 'select') selectGarment(L, x, y, tol);
    else { const i = y * L.w + x, d = L.data.data, restore = L.mask[i] < 128; const hit = flood(L, [i], [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], tol); for (let k = 0; k < hit.length; k++) if (hit[k]) L.mask[k] = restore ? 255 : 0; tidy(L.mask, L.w, L.h); }
    setVer((v) => v + 1);
  };

  const tr: Traced | null = useMemo(() => (L ? trace(L, len, back) : null), [L, back, len, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => [...ai, ...BUILTIN], [ai]);
  const cur = edits[sel] || all[sel] || all[0];
  const setOps = (ops: Op[]) => setEdits((e) => ({ ...e, [sel]: { ...cur, ops } }));
  const svgOf = (d: Design, title = '') => (tr ? toSVG(build(tr, d).pieces, lang === 'ja' ? 'ja' : 'en', title) : null);
  const sheet = useMemo(() => (tr && cur ? svgOf(cur, `GALLERY CRYPTO — ${lang === 'ja' ? cur.nameJa || cur.name : cur.name}`) : null), [tr, cur, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const url = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  // 仕上がりプレビュー（写真の切り貼り）
  useEffect(() => { if (L && tr && cur && look.current && view === 'look') preview(L.img, L.mask, tr, cur, fabB, look.current); }, [L, tr, cur, fabB, view, ver]);
  // 一覧のサムネイル
  const thumbs = useMemo(() => {
    if (!L || !tr) return [];
    return all.map((d0, i) => { const d = edits[i] || d0; const c = document.createElement('canvas'); try { preview(L.img, L.mask, tr, d, fabB, c); } catch { /* 表示だけ */ } const t = document.createElement('canvas'); const k = 150 / Math.max(c.width, c.height); t.width = Math.round(c.width * k); t.height = Math.round(c.height * k); t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height); return { d, i, src: t.toDataURL('image/jpeg', 0.75) }; });
  }, [L, tr, all, edits, fabB, ver]);

  const dl = (b: Blob, n: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = n; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); };
  const cutPhoto = () => { if (!L) return null; const c = document.createElement('canvas'); c.width = L.w; c.height = L.h; const x = c.getContext('2d')!, d = x.createImageData(L.w, L.h), s = L.data.data; for (let i = 0; i < L.mask.length; i++) { const k = L.mask[i] > 127; d.data[i * 4] = k ? s[i * 4] : 255; d.data[i * 4 + 1] = k ? s[i * 4 + 1] : 255; d.data[i * 4 + 2] = k ? s[i * 4 + 2] : 255; d.data[i * 4 + 3] = 255; } x.putImageData(d, 0, 0); return c; };
  const runAI = async (instruction: string) => {
    if (!tr) return;
    if (!key.trim()) { setMsg(tt('Enter your Gemini API key in AI settings first.', '先に「AIの設定」で Gemini の API キーを入れてください。')); return; }
    store.set('gc-gemini-key', key.trim()); store.set('gc-gemini-model', model.trim() === DEFAULT_MODEL ? '' : model.trim());
    setMsg(''); setBusy(instruction ? tt('AI is building your design…', 'AIが指示どおりにデザインを組み立てています…') : tt('AI is designing reconstructions…', 'AIが再構築案を考えています…'));
    try {
      const summary = { length: tr.length, halfChest: +tr.halfChest.toFixed(1), halfHem: +tr.halfHem.toFixed(1), sleeveLength: +tr.sleeveLen.toFixed(1), hasSleeves: tr.sleeve ? 1 : 0 };
      const got = await proposeDesigns(key.trim(), model.trim() || DEFAULT_MODEL, cutPhoto(), summary, 4, instruction, !!fabB);
      if (!got.length) throw new Error(tt('No design came back.', '案が返ってきませんでした。'));
      setAi((a) => [...got.map((g) => ({ ...g, name: '✦ ' + g.name, nameJa: '✦ ' + (g.nameJa || g.name) })), ...a].slice(0, 16));
      setEdits({}); setSel(0); setAsk('');
    } catch (e) { setMsg(tt('AI error: ', 'AIのエラー：') + (e as Error).message); }
    setBusy('');
  };

  const printA4 = () => {
    if (!sheet) return;
    const pw = 19, ph = 27.7, cols = Math.ceil(sheet.W / pw), rows = Math.ceil(sheet.H / ph), src = url(sheet.svg);
    let pages = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pages += `<section class="pg"><div class="win"><img src="${src}" style="width:${sheet.W * 10}mm;height:${sheet.H * 10}mm;left:-${c * pw * 10}mm;top:-${r * ph * 10}mm"></div><b>${String.fromCharCode(65 + r)}${c + 1}</b></section>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pattern A4</title><style>@page{size:A4;margin:0}body{margin:0}.pg{width:210mm;height:297mm;position:relative;page-break-after:always;overflow:hidden}.win{position:absolute;left:10mm;top:10mm;width:190mm;height:277mm;overflow:hidden;outline:0.2mm dashed #999}.win img{position:absolute}b{position:absolute;right:12mm;bottom:4mm;font:12px sans-serif}</style></head><body>${pages}<script>window.onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { setMsg(tt('Allow pop-ups to print.', '印刷するにはポップアップを許可してください。')); return; }
    w.document.write(html); w.document.close();
  };
  const zipAll = async () => {
    if (!tr) return;
    const { zipSync, strToU8 } = await import('fflate');
    const files: Record<string, Uint8Array> = {};
    all.forEach((d0, i) => { const d = edits[i] || d0; const s = svgOf(d, `GALLERY CRYPTO — ${lang === 'ja' ? d.nameJa || d.name : d.name}`); if (s) files[`${String(i + 1).padStart(2, '0')}-${d.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}.svg`] = strToU8(s.svg); });
    files['designs.json'] = strToU8(JSON.stringify(all.map((d, i) => edits[i] || d), null, 2));
    dl(new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), 'gc-patterns.zip');
  };

  const fileBtn = (label: string, onPick: (f?: File) => void, primary = false) => (
    <label className={`btn${primary ? ' primary' : ''}`} style={{ cursor: 'pointer' }}>{label}<input type="file" accept="image/*" hidden onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ''; }} /></label>
  );

  return (
    <div className="pm">
      {!L ? (
        <label className="ai-drop">
          <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <b>{tt('Choose a photo of the garment (laid flat, from straight above)', '服の写真を選ぶ（平らに置いて真上から）')}</b>
          <span>{tt('The pattern is traced from the garment’s own outline, then rebuilt into new designs.', '服の輪郭をそのままなぞって型紙にし、そこから新しいデザインに再構築します。')}</span>
        </label>
      ) : (
        <div className="pm-main">
          <div className="pm-left">
            <canvas ref={pv} className="p3-pv" onPointerDown={tap} />
            <div className="gm-row">
              <button type="button" className={`btn${mode === 'select' ? ' primary' : ''}`} onClick={() => setMode('select')}>{tt('Tap the garment', '服をタップして選ぶ')}</button>
              <button type="button" className={`btn${mode === 'toggle' ? ' primary' : ''}`} onClick={() => setMode('toggle')}>{tt('Tap to remove / restore', 'タップで消す・戻す')}</button>
            </div>
            <label className="ai-field">{tt('Real length of the garment (cm)', '実物の着丈（cm）')}<input type="number" min={20} max={150} step={0.5} value={len} onChange={(e) => setLen(+e.target.value || 70)} /></label>
            <div className="gm-row">
              {fileBtn(back ? tt('Back photo ✓', '背面の写真 ✓') : tt('+ Back photo', '＋ 背面の写真'), pickBack)}
              {fileBtn(fabB ? tt('Garment B ✓', '組み合わせる古着B ✓') : tt('+ Garment B (to splice)', '＋ 組み合わせる古着B'), pickB)}
            </div>
            {tr && <p className="note">{tt(`Traced: length ${tr.length} cm · chest ${(tr.halfChest * 2).toFixed(1)} · hem ${(tr.halfHem * 2).toFixed(1)}${tr.sleeve ? ` · sleeve ${tr.sleeveLen.toFixed(1)}` : ''}`, `なぞった寸法：着丈 ${tr.length}cm・身幅 ${(tr.halfChest * 2).toFixed(1)}・裾幅 ${(tr.halfHem * 2).toFixed(1)}${tr.sleeve ? `・袖丈 ${tr.sleeveLen.toFixed(1)}` : ''}`)}</p>}

            <div className="pm-ai">
              <h5>✦ AI</h5>
              <button type="button" className="btn primary" disabled={!!busy} onClick={() => runAI('')}>{tt('AI designs 4 reconstructions', 'AIが再構築案を4つ考える')}</button>
              <label className="ai-field">{tt('Or tell the AI what to make', 'または、つくりたいものをAIに指示')}
                <textarea rows={3} value={ask} placeholder={tt('e.g. Splice the front diagonally with garment B, flare the hem with godets, make the sleeves long with B', '例：前身頃を古着Bと斜めに切り替えて、裾をゴデで広げ、袖をBで長袖にして')} onChange={(e) => setAsk(e.target.value)} />
              </label>
              <button type="button" className="btn" disabled={!!busy || !ask.trim()} onClick={() => runAI(ask.trim())}>{tt('Make it with AI', 'AIでつくる')}</button>
              <details className="ai-adv">
                <summary>{tt('AI settings', 'AIの設定')}</summary>
                <label className="ai-field">{tt('Gemini API key', 'Gemini の API キー')}<input type="password" autoComplete="off" value={key} placeholder="AIza…" onChange={(e) => setKey(e.target.value)} /></label>
                <p className="note">{tt('Saved only in this browser. Free at aistudio.google.com → Get API key. On the free tier, Google may use what you send to improve its products.', 'このブラウザにだけ保存します。aistudio.google.com の「Get API key」から無料で作れます。無料枠では、送った内容が Google の製品改善に使われることがあります。')}</p>
                <label className="ai-field">{tt('Model', 'モデル')}<input value={model} onChange={(e) => setModel(e.target.value)} /></label>
              </details>
            </div>

            {cur && (
              <details className="ai-adv" open>
                <summary>{tt('Operations in this design (edit freely)', 'このデザインの操作（自由に直せます）')}</summary>
                {cur.ops.map((o, i) => (
                  <div className="pm-op" key={i}>
                    <b>{(() => { const d = OPS.find((x) => x.t === o.t); return d ? tt(d.en, d.ja) : o.t; })()}</b>
                    {'piece' in o && <select value={o.piece} onChange={(e) => setOps(cur.ops.map((x, j) => (j === i ? { ...x, piece: e.target.value } as Op : x)))}><option value="front">{tt('Front', '前')}</option><option value="back">{tt('Back', '後ろ')}</option><option value="sleeve">{tt('Sleeve', '袖')}</option></select>}
                    {'dir' in o && <select value={o.dir} onChange={(e) => setOps(cur.ops.map((x, j) => (j === i ? { ...x, dir: e.target.value } as Op : x)))}><option value="h">{tt('Across', '横')}</option><option value="v">{tt('Down', '縦')}</option><option value="d">{tt('Diagonal', '斜め')}</option></select>}
                    {Object.keys(NUM).filter((k) => k in o).map((k) => { const [en, ja, a, z, st] = NUM[k]; const v = (o as unknown as Record<string, number>)[k] ?? 0; return <label key={k} className="pm-num">{tt(en, ja)} <input type="range" min={a} max={z} step={st} value={v} onChange={(e) => setOps(cur.ops.map((x, j) => (j === i ? { ...x, [k]: +e.target.value } as Op : x)))} /> <em>{st < 1 ? v.toFixed(2) : v}</em></label>; })}
                    {'fabric' in o && <button type="button" className={`btn pm-fab${o.fabric === 'B' ? ' b' : ''}`} onClick={() => setOps(cur.ops.map((x, j) => (j === i ? { ...x, fabric: (x as { fabric?: string }).fabric === 'B' ? 'A' : 'B' } as Op : x)))}>{tt('Fabric ', '生地')}{o.fabric || 'B'}</button>}
                    <button type="button" className="btn" onClick={() => setOps(cur.ops.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
                <select className="ps-sel" value="" onChange={(e) => { const d = OPS.find((x) => x.t === e.target.value); if (d) setOps([...cur.ops, d.make()]); }}>
                  <option value="">{tt('+ Add an operation…', '＋ 操作を足す…')}</option>
                  {OPS.map((d) => <option key={d.t} value={d.t}>{tt(d.en, d.ja)}</option>)}
                </select>
              </details>
            )}
            {fileBtn(tt('Use another photo', '別の写真にする'), pick)}
          </div>

          <div className="pm-right">
            {busy && <div className="ai-busy" style={{ position: 'static' }}><i /> {busy}</div>}
            {msg && <p className="note pm-msg">{msg}</p>}
            <div className="pm-vars">
              {thumbs.map(({ d, i, src }) => (
                <button type="button" key={i} className={`${sel === i ? 'on' : ''}${d.name.startsWith('✦') ? ' ai' : ''}`} onClick={() => setSel(i)}>
                  <img src={src} alt="" />
                  <b>{lang === 'ja' ? d.nameJa || d.name : d.name}</b>
                  {d.note && <span>{d.note}</span>}
                </button>
              ))}
            </div>
            <div className="gm-row">
              <button type="button" className={`btn${view === 'look' ? ' primary' : ''}`} onClick={() => setView('look')}>{tt('Finished look', '仕上がり')}</button>
              <button type="button" className={`btn${view === 'pattern' ? ' primary' : ''}`} onClick={() => setView('pattern')}>{tt('Pattern', '型紙')}</button>
            </div>
            {view === 'look' ? <div className="pm-sheet pm-look"><canvas ref={look} /></div> : sheet && <div className="pm-sheet"><img src={url(sheet.svg)} alt="" /></div>}
            {cur?.note && <p className="note">{cur.note}</p>}
            <div className="gm-row">
              <button type="button" className="btn primary" disabled={!sheet} onClick={() => sheet && dl(new Blob([sheet.svg], { type: 'image/svg+xml' }), `gc-pattern-${cur.name.replace(/[^\w-]+/g, '-').toLowerCase()}.svg`)}>{tt('Full-size SVG', '原寸 SVG')}</button>
              <button type="button" className="btn" disabled={!sheet} onClick={printA4}>{tt('Print on A4 sheets', 'A4で分割印刷')}</button>
              <button type="button" className="btn" disabled={!tr} onClick={zipAll}>{tt('All designs (ZIP)', '全デザイン（ZIP）')}</button>
            </div>
            <p className="note">{tt('The finished look is a quick preview made by cutting and re-placing your photo. Check the pattern with a toile before cutting good fabric.', '仕上がりは写真を切り貼りした簡易な見本です。本番の布を切る前に、型紙を仮縫い（トワル）で確かめてください。')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
