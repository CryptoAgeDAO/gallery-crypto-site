'use client';
// パターンメーカー：取り込んだ服の写真から寸法を推定して型紙を自動でつくり、
// そこから変換パターン（クロップド、オーバーサイズ、ボクシー、ノースリーブ化、長袖化）も自動で生成する。
// 原寸の SVG と、家庭のプリンターで印刷できる A4 分割を書き出す。処理はすべてこの端末の中。
import { useEffect, useMemo, useRef, useState } from 'react';
import { autoBackground, flood, loadLayer, selectGarment, tidy, type Layer } from './GhostMannequin';
import { measure, pieces, toSVG, transform, VARIANTS, type Measures, type Variant } from './pattern';
import { tt, useLang } from './Lang';

const FIELDS: [keyof Measures, string, string][] = [
  ['length', 'Length', '着丈'], ['chest', 'Chest (flat)', '身幅'], ['hem', 'Hem (flat)', '裾幅'], ['shoulder', 'Shoulder', '肩幅'],
  ['armhole', 'Armhole depth', '袖ぐりの深さ'], ['neckW', 'Neck width', '衿ぐり幅'], ['neckF', 'Front neck drop', '前衿ぐりの深さ'],
  ['sleeve', 'Sleeve length', '袖丈'], ['bicep', 'Sleeve width (flat)', '袖幅'], ['cuff', 'Cuff (flat)', '袖口幅'],
];

export default function PatternMaker() {
  const { lang } = useLang();
  const [L, setL] = useState<Layer | null>(null);
  const [ver, setVer] = useState(0);
  const [len, setLen] = useState(70);
  const [tol, setTol] = useState(9);
  const [mode, setMode] = useState<'select' | 'toggle'>('select');
  const [base, setBase] = useState<Measures | null>(null);
  const [over, setOver] = useState<Partial<Measures>>({});
  const [variant, setVariant] = useState<Variant>('original');
  const [rib, setRib] = useState(false);
  const [msg, setMsg] = useState('');
  const pv = useRef<HTMLCanvasElement>(null);

  const pick = async (f?: File) => {
    if (!f) return;
    const l = await loadLayer(f);
    autoBackground(l, tol);
    setL(l); setMode('select'); setOver({}); setMsg('');
  };
  useEffect(() => {
    const c = pv.current;
    if (!c || !L) return;
    c.width = L.w; c.height = L.h;
    const x = c.getContext('2d')!, d = x.createImageData(L.w, L.h), s = L.data.data;
    for (let i = 0; i < L.mask.length; i++) { const k = L.mask[i] > 127; d.data[i * 4] = k ? s[i * 4] : s[i * 4] * 0.35 + 150; d.data[i * 4 + 1] = k ? s[i * 4 + 1] : s[i * 4 + 1] * 0.35; d.data[i * 4 + 2] = k ? s[i * 4 + 2] : s[i * 4 + 2] * 0.35; d.data[i * 4 + 3] = 255; }
    x.putImageData(d, 0, 0);
  }, [L, ver]);
  // 写真・着丈が変わったら寸法を測り直す
  useEffect(() => {
    if (!L) return;
    const m = measure(L, len);
    setBase(m);
    if (m && m.sleeve > 40) setRib(true);
  }, [L, ver, len]);

  const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!L) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * L.w), y = Math.round(((e.clientY - r.top) / r.height) * L.h);
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return;
    if (mode === 'select') selectGarment(L, x, y, tol);
    else { const i = y * L.w + x, d = L.data.data, restore = L.mask[i] < 128; const hit = flood(L, [i], [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], tol); for (let k = 0; k < hit.length; k++) if (hit[k]) L.mask[k] = restore ? 255 : 0; tidy(L.mask, L.w, L.h); }
    setVer((v) => v + 1);
  };

  const m = useMemo(() => (base ? { ...base, ...over } : null), [base, over]);
  const sheet = useMemo(() => {
    if (!m) return null;
    const mv = transform(m, variant);
    const ps = pieces(mv, { rib });
    const v = VARIANTS.find((x) => x.k === variant)!;
    return { ...toSVG(ps, lang === 'ja' ? 'ja' : 'en', `GALLERY CRYPTO — ${lang === 'ja' ? v.ja : v.en}`), mv };
  }, [m, variant, rib, lang]);
  const thumbs = useMemo(() => (m ? VARIANTS.map((v) => ({ v, svg: toSVG(pieces(transform(m, v.k), { rib }), 'en', '').svg })) : []), [m, rib]);
  const url = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const dl = (b: Blob, n: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = n; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); };

  const printA4 = () => {
    if (!sheet) return;
    const pw = 19, ph = 27.7; // 余白を除いた印刷範囲（cm）
    const cols = Math.ceil(sheet.W / pw), rows = Math.ceil(sheet.H / ph);
    const src = url(sheet.svg);
    let pages = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const label = `${String.fromCharCode(65 + r)}${c + 1}`;
      pages += `<section class="pg"><div class="win"><img src="${src}" style="width:${sheet.W * 10}mm;height:${sheet.H * 10}mm;left:-${c * pw * 10}mm;top:-${r * ph * 10}mm"></div><b>${label}</b><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></section>`;
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pattern A4</title><style>@page{size:A4;margin:0}body{margin:0}.pg{width:210mm;height:297mm;position:relative;page-break-after:always;overflow:hidden}.win{position:absolute;left:10mm;top:10mm;width:190mm;height:277mm;overflow:hidden}.win img{position:absolute}b{position:absolute;right:12mm;bottom:4mm;font:12px sans-serif}i{position:absolute;width:6mm;height:6mm;border:0 solid #000}.tl{left:4mm;top:4mm;border-width:0.3mm 0 0 0.3mm}.tr{right:4mm;top:4mm;border-width:0.3mm 0.3mm 0 0}.bl{left:4mm;bottom:4mm;border-width:0 0 0.3mm 0.3mm}.br{right:4mm;bottom:4mm;border-width:0 0.3mm 0.3mm 0}</style></head><body>${pages}<script>window.onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { setMsg(tt('Allow pop-ups to print.', '印刷するにはポップアップを許可してください。')); return; }
    w.document.write(html); w.document.close();
  };
  const zipAll = async () => {
    if (!m) return;
    const { zipSync, strToU8 } = await import('fflate');
    const files: Record<string, Uint8Array> = {};
    VARIANTS.forEach((v, i) => { files[`${String(i + 1).padStart(2, '0')}-${v.k}.svg`] = strToU8(toSVG(pieces(transform(m, v.k), { rib }), lang === 'ja' ? 'ja' : 'en', `GALLERY CRYPTO — ${lang === 'ja' ? v.ja : v.en}`).svg); });
    const sizes = VARIANTS.map((v) => { const t = transform(m, v.k); return `${v.k}: ` + FIELDS.map(([k, en]) => `${en} ${(t[k] as number).toFixed(1)}`).join(', '); }).join('\n');
    files['measurements.txt'] = strToU8(sizes + '\n\nEstimated from a photo. Check with a toile before cutting fabric.\n');
    dl(new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }), 'gc-patterns.zip');
  };

  return (
    <div className="pm">
      {!L ? (
        <label className="ai-drop">
          <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <b>{tt('Choose a photo of the garment, laid flat from straight above', '服を平らに置いて真上から撮った写真を選ぶ')}</b>
          <span>{tt('Measurements are estimated from the outline, a sewing pattern is drawn, and new variations are generated from it.', '輪郭から寸法を推定して型紙をつくり、そこから新しい変換パターンも自動でつくります。')}</span>
        </label>
      ) : (
        <div className="pm-main">
          <div className="pm-left">
            <canvas ref={pv} className="p3-pv" onPointerDown={tap} />
            <div className="gm-row">
              <button type="button" className={`btn${mode === 'select' ? ' primary' : ''}`} onClick={() => setMode('select')}>{tt('Tap the garment', '服をタップして選ぶ')}</button>
              <button type="button" className={`btn${mode === 'toggle' ? ' primary' : ''}`} onClick={() => setMode('toggle')}>{tt('Tap to remove / restore', 'タップで消す・戻す')}</button>
            </div>
            <label className="gm-sl">{tt('Tolerance', '色の幅')} <input type="range" min={2} max={45} value={tol} onChange={(e) => setTol(+e.target.value)} /> <b>{tol}</b></label>
            <label className="ai-field">{tt('Measured length of the real garment (cm) — sets the scale', '実物の着丈（cm）— これで縮尺が決まります')}
              <input type="number" min={20} max={150} step={0.5} value={len} onChange={(e) => setLen(+e.target.value || 70)} />
            </label>
            {m && (
              <details className="ai-adv" open>
                <summary>{tt('Estimated measurements (edit if you measured)', '推定した寸法（実測したら書き換えてください）')}</summary>
                <div className="pm-meas">
                  {FIELDS.filter(([k]) => m.hasSleeves || !['sleeve', 'bicep', 'cuff'].includes(k)).map(([k, en, ja]) => (
                    <label key={k}>{tt(en, ja)}
                      <input type="number" step={0.5} value={(m[k] as number).toFixed(1)} onChange={(e) => setOver((o) => ({ ...o, [k]: +e.target.value }))} />
                    </label>
                  ))}
                </div>
                <label className="gm-ck"><input type="checkbox" checked={rib} onChange={(e) => setRib(e.target.checked)} /> {tt('Rib hem and cuffs (sweatshirt style)', '裾と袖口をリブにする（スウェット仕様）')}</label>
              </details>
            )}
            <label className="btn" style={{ cursor: 'pointer' }}>
              {tt('Use another photo', '別の写真にする')}
              <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          <div className="pm-right">
            <div className="pm-vars">
              {thumbs.map(({ v, svg }) => (
                <button type="button" key={v.k} className={variant === v.k ? 'on' : ''} onClick={() => setVariant(v.k)}>
                  <img src={url(svg)} alt="" />
                  <b>{tt(v.en, v.ja)}</b>
                  <span>{tt(v.desc[0], v.desc[1])}</span>
                </button>
              ))}
            </div>
            {sheet && <div className="pm-sheet"><img src={url(sheet.svg)} alt="" /></div>}
            <div className="gm-row">
              <button type="button" className="btn primary" disabled={!sheet} onClick={() => sheet && dl(new Blob([sheet.svg], { type: 'image/svg+xml' }), `gc-pattern-${variant}.svg`)}>{tt('Full-size SVG', '原寸 SVG')}</button>
              <button type="button" className="btn" disabled={!sheet} onClick={printA4}>{tt('Print on A4 sheets', 'A4で分割印刷')}</button>
              <button type="button" className="btn" disabled={!m} onClick={zipAll}>{tt('All variations (ZIP)', '全変換パターン（ZIP）')}</button>
            </div>
            <p className="note">{tt('Full-size SVG opens at real scale in Illustrator or Inkscape. When printing on A4, keep scale at 100% and check the 5 cm square. These are estimates from a photo — always make a toile first.', '原寸 SVG は Illustrator や Inkscape で実寸で開けます。A4 で印刷するときは倍率100%にし、5cm の四角で大きさを確かめてください。写真からの推定なので、本番の布を切る前に必ず仮縫い（トワル）で確認してください。')}</p>
            {msg && <p className="note">{msg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
