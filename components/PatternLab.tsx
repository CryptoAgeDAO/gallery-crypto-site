'use client';
// パターンラボ：① 平置きの写真か3Dスキャンで採寸 → ② 型紙（点をドラッグで調整・型紙データの取り込み）→ ③ 3Dで縫って着せる。
// 写真・スキャンはこの端末の中だけで処理し、どこにも送らない。
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { autoBackground, loadLayer, selectGarment, type Layer } from './GhostMannequin';
import { LM_LABEL, type Landmarks, type LmKey } from './pattern';
import { calibrate, docToSVG, draft, MEASURES, parseDoc, parseDXF, pxMeasures, specFrom, specFromMeasures, type MeasureKey, type PatternDoc, type Pt, type Spec } from './lab/draft';
import { makeBody } from './lab/sew';
import { autoLandmarks as detectLandmarks } from './lab/landmarks';
import type { Skin } from './lab/SewView';
import PatternView from './lab/PatternView';
import { tt, useLang } from './Lang';

const SewView = dynamic(() => import('./lab/SewView'), { ssr: false, loading: () => <p className="status">…</p> });
const ScanViewer = dynamic(() => import('./lab/ScanViewer'), { ssr: false, loading: () => <p className="status">…</p> });

type Step = 'scan' | 'pattern' | 'sew';
const SPEC_FIELDS: { k: keyof Spec; en: string; ja: string; x2?: boolean; min: number; max: number }[] = [
  { k: 'length', en: 'Body length', ja: '着丈', min: 30, max: 120 },
  { k: 'chest', en: 'Chest width', ja: '身幅', x2: true, min: 30, max: 90 },
  { k: 'shoulderX', en: 'Shoulder width', ja: '肩幅', x2: true, min: 26, max: 90 },
  { k: 'hem', en: 'Hem width', ja: '裾幅', x2: true, min: 30, max: 100 },
  { k: 'armY', en: 'Armhole depth', ja: '脇の深さ', min: 14, max: 40 },
  { k: 'drop', en: 'Shoulder drop', ja: '肩の下がり', min: 0, max: 12 },
  { k: 'sleeve', en: 'Sleeve length', ja: '袖丈', min: 0, max: 80 },
  { k: 'cuff', en: 'Cuff width', ja: '袖口幅', min: 6, max: 30 },
  { k: 'neckW', en: 'Neck width', ja: '衿ぐり幅', x2: true, min: 10, max: 34 },
  { k: 'neckF', en: 'Front neck depth', ja: '前衿の深さ', min: 1, max: 30 },
];
const download = (name: string, data: string | Blob, type = 'text/plain') => { const b = typeof data === 'string' ? new Blob([data], { type }) : data; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); };

// 服の外側を服の平均色で埋めた写真（3Dの生地に使う）
function skinCanvas(L: Layer): { c: HTMLCanvasElement; med: string } {
  const c = document.createElement('canvas'); c.width = L.w; c.height = L.h;
  const x = c.getContext('2d')!, d = x.createImageData(L.w, L.h), s = L.data.data;
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let i = 0; i < L.mask.length; i += 7) if (L.mask[i] > 127) { rs.push(s[i * 4]); gs.push(s[i * 4 + 1]); bs.push(s[i * 4 + 2]); }
  const m = (a: number[]) => { a.sort((p, q) => p - q); return a[a.length >> 1] || 200; };
  const mr = m(rs), mg = m(gs), mb = m(bs);
  for (let i = 0; i < L.mask.length; i++) { const k = L.mask[i] > 127; d.data[i * 4] = k ? s[i * 4] : mr; d.data[i * 4 + 1] = k ? s[i * 4 + 1] : mg; d.data[i * 4 + 2] = k ? s[i * 4 + 2] : mb; d.data[i * 4 + 3] = 255; }
  x.putImageData(d, 0, 0);
  return { c, med: `rgb(${mr},${mg},${mb})` };
}

export default function PatternLab() {
  const { lang } = useLang();
  const J = lang === 'ja';
  const [step, setStep] = useState<Step>('scan');
  const [src, setSrc] = useState<'photo' | 'scan3d'>('photo');
  const [L, setL] = useState<Layer | null>(null);
  const [Bk, setBk] = useState<Layer | null>(null);
  const [ver, setVer] = useState(0);
  const [tol, setTol] = useState(9);
  const [tap, setTap] = useState<'points' | 'select'>('points');
  const [lm, setLm] = useState<Landmarks | null>(null);
  const [real, setReal] = useState<Partial<Record<MeasureKey, number>>>({});
  const [specEdit, setSpecEdit] = useState<Spec | null>(null);
  const [imported, setImported] = useState<PatternDoc | null>(null);
  const [density, setDensity] = useState(2.5);
  const [drag, setDrag] = useState<LmKey | null>(null);
  const [msg, setMsg] = useState('');
  const pv = useRef<HTMLCanvasElement>(null);
  const ov = useRef<SVGSVGElement>(null);

  const pick = async (f?: File) => {
    if (!f) return;
    try { const l = await loadLayer(f); autoBackground(l, tol); setL(l); setLm(detectLandmarks(l)); setSpecEdit(null); setImported(null); setTap('points'); setMsg(''); setVer((v) => v + 1); }
    catch (e) { setMsg(String((e as Error).message)); }
  };
  const pickBack = async (f?: File) => { if (!f) return; const l = await loadLayer(f); autoBackground(l, tol); setBk(l); };

  // 写真の表示（服以外は暗く）
  useEffect(() => {
    const c = pv.current;
    if (!c || !L) return;
    c.width = L.w; c.height = L.h;
    const x = c.getContext('2d')!, d = x.createImageData(L.w, L.h), s = L.data.data;
    for (let i = 0; i < L.mask.length; i++) { const k = L.mask[i] > 127; d.data[i * 4] = k ? s[i * 4] : s[i * 4] * 0.3 + 40; d.data[i * 4 + 1] = k ? s[i * 4 + 1] : s[i * 4 + 1] * 0.3 + 40; d.data[i * 4 + 2] = k ? s[i * 4 + 2] : s[i * 4 + 2] * 0.3 + 60; d.data[i * 4 + 3] = 255; }
    x.putImageData(d, 0, 0);
  }, [L, ver, step, src]);

  const cover = useMemo(() => { if (!L) return 0; let n = 0; for (let i = 0; i < L.mask.length; i += 5) if (L.mask[i] > 127) n++; return n / (L.mask.length / 5); }, [L, ver]);
  const px = useMemo(() => (lm ? pxMeasures(lm) : null), [lm]);
  const cal = useMemo(() => (px ? calibrate(px, real) : null), [px, real]);
  const baseSpec = useMemo(() => (lm && cal ? specFrom(lm, cal.k, real) : specFromMeasures(real)), [lm, cal, real]);
  const spec = specEdit || baseSpec;
  const doc = useMemo(() => imported || draft(spec), [imported, spec]);
  const body = useMemo(() => {
    const f = doc.pieces.find((p) => p.role === 'front');
    const half = f ? Math.max(...f.edges.flatMap((e) => e.pts.map((p) => Math.abs(p[0])))) : 26;
    return makeBody(imported ? half : spec.chest, imported ? half * 0.9 : spec.shoulderX);
  }, [doc, imported, spec.chest, spec.shoulderX]);

  // 3D の生地：写真から（型紙の cm → 写真の位置）
  const skin: Skin = useMemo(() => {
    if (imported || !L || !lm || !cal) return { tex: null, back: null, uv: null, color: '#d9d4ca' };
    const { c, med } = skinCanvas(L);
    let back: HTMLCanvasElement;
    let bmap: ((x: number, y: number) => [number, number]) | null = null;
    const lb = Bk ? detectLandmarks(Bk) : null;
    if (Bk && lb) {
      back = skinCanvas(Bk).c;
      const hpsB = (lb.NL[1] + lb.NR[1]) / 2, hemB = (lb.HL[1] + lb.HR[1]) / 2, kB = spec.length / Math.max(1, hemB - hpsB), cxB = (lb.AL[0] + lb.AR[0]) / 2;
      bmap = (x, y) => [(cxB - x / kB) / Bk.w, (hpsB + y / kB) / Bk.h];
    } else { back = document.createElement('canvas'); back.width = back.height = 4; const g = back.getContext('2d')!; g.fillStyle = med; g.fillRect(0, 0, 4, 4); }
    const k = cal.k, cx = lm.CF[0], hps = (lm.NL[1] + lm.NR[1]) / 2;
    const sl = doc.pieces.find((p) => p.role === 'sleeveR');
    const bw = sl ? Math.max(...sl.edges.flatMap((e) => e.pts.map((p) => Math.abs(p[0])))) : 20;
    const ch = Math.max(4, Math.min(16, (spec.armY - spec.drop) * 0.5)), Ls = Math.max(ch + 3, spec.sleeve);
    const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const cl = (v: number) => Math.max(0, Math.min(1, v));
    return {
      tex: c, back, color: med,
      uv: (_id, role, x, y) => {
        if (role === 'front') return [(cx + x / k) / L.w, (hps + y / k) / L.h];
        if (role === 'back') return bmap ? bmap(x, y) : [0.5, 0.5];
        if (role === 'sleeveR' || role === 'sleeveL') {
          const t = cl(y / Ls), tb = cl((y - ch) / (Ls - ch));
          const hw = y <= ch ? bw : bw + (spec.cuff - bw) * tb;
          const top = lerp(lm.SR, lm.CO, t), bot = lerp(lm.AR, lm.CI, tb);
          let p = lerp(top, bot, cl(Math.abs(x) / Math.max(1, hw)));
          if (role === 'sleeveL') p = [2 * cx - p[0], p[1]];
          return [p[0] / L.w, p[1] / L.h];
        }
        return null;
      },
    };
  }, [imported, L, lm, cal, Bk, spec, doc, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  const svgPt = (e: { clientX: number; clientY: number }): Pt | null => { const s = ov.current, m = s?.getScreenCTM(); if (!s || !m) return null; const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return [p.x, p.y]; };
  const onPhotoTap = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!L || tap !== 'select') return;
    const p = svgPt(e);
    if (!p) return;
    const x = Math.round(p[0]), y = Math.round(p[1]);
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return;
    selectGarment(L, x, y, tol);
    setLm(detectLandmarks(L)); setSpecEdit(null); setVer((v) => v + 1); setTap('points');
  };

  const importFile = async (f?: File) => {
    if (!f) return;
    const text = await f.text();
    if (/\.dxf$/i.test(f.name)) {
      const ps = parseDXF(text);
      if (!ps.length) { setMsg(tt('No closed outlines found in this DXF.', 'このDXFに型紙の輪郭が見つかりませんでした。')); return; }
      setImported({ kind: 'gallery-crypto-pattern', version: 1, unit: 'cm', pieces: ps, seams: [] });
      setMsg(tt('Imported. Set what each piece is, then pair the seams.', '取り込みました。各パーツの種類を選び、縫い合わせる辺を指定してください。'));
    } else {
      const j = (() => { try { return JSON.parse(text); } catch { return null; } })();
      if (j?.spec && !j.custom) { setImported(null); setSpecEdit(j.spec); setMsg(tt('Pattern loaded.', '型紙を読み込みました。')); }
      else { const d = parseDoc(text); if (!d) { setMsg(tt('Could not read this file.', 'このファイルは読めませんでした。')); return; } setImported(d); setMsg(tt('Pattern loaded.', '型紙を読み込みました。')); }
    }
    setStep('pattern');
  };

  const r1 = (v: number) => Math.round(v * 10) / 10;
  const lmLines: [LmKey, LmKey, MeasureKey | null][] = [['NL', 'NR', null], ['SL', 'SR', 'shoulder'], ['AL', 'AR', 'chest'], ['HL', 'HR', 'hem'], ['CO', 'CI', 'cuff']];
  const rad = L ? Math.max(L.w, L.h) * 0.014 : 6;
  const devMax = cal ? Math.max(0, ...Object.values(cal.dev).map((v) => Math.abs(v || 0))) : 0;

  return (
    <div className="lab" translate="no">
      <nav className="lab-steps">
        {([['scan', tt('Measure', '採寸'), tt('Photo or 3D scan', '写真・3Dスキャン')], ['pattern', tt('Pattern', '型紙'), tt('Drag to adjust', 'ドラッグで調整')], ['sew', tt('Sew in 3D', '3Dで縫う'), tt('Assemble & view', '組み立てて確認')]] as [Step, string, string][]).map(([k, a, b], i) => (
          <button key={k} type="button" aria-pressed={step === k} onClick={() => setStep(k)}><i>{i + 1}</i><b>{a}</b><span>{b}</span></button>
        ))}
        <label className="lab-open btn">
          <input type="file" accept=".json,.dxf" onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
          {tt('Open pattern file', '型紙ファイルを開く')}
        </label>
      </nav>
      {msg && <p className="lab-msg">{msg}</p>}

      {step === 'scan' && (
        <div className="lab-main">
          <div className="lab-stage">
            <div className="lab-row">
              <button type="button" className="chip" aria-pressed={src === 'photo'} onClick={() => setSrc('photo')}>{tt('Flat-lay photo', '平置き写真')}</button>
              <button type="button" className="chip" aria-pressed={src === 'scan3d'} onClick={() => setSrc('scan3d')}>{tt('3D scan file', '3Dスキャン')}</button>
            </div>
            {src === 'photo' ? (
              !L ? (
                <label className="lab-drop big">
                  <input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0])} />
                  <b>{tt('Add a flat-lay photo', '平置きの写真を入れる')}</b>
                  <span>{tt('Lay the garment flat on a plain floor or table, smooth it out, sleeves spread. Shoot straight down from above with the whole garment in frame.', '無地の床や台に服を平らに置き、シワをのばして袖を広げます。真上から、服全体が入るように撮ってください。')}</span>
                </label>
              ) : (
                <>
                  <div className="lab-photo">
                    <canvas ref={pv} />
                    <svg ref={ov} viewBox={`0 0 ${L.w} ${L.h}`} className="lab-ov" style={{ touchAction: drag ? 'none' : tap === 'select' ? 'manipulation' : 'pan-y' }}
                      onClick={onPhotoTap}
                      onPointerMove={(e) => { if (!drag || !lm) return; const p = svgPt(e); if (!p) return; setLm({ ...lm, [drag]: [Math.max(0, Math.min(L.w, p[0])), Math.max(0, Math.min(L.h, p[1]))] as Pt }); setSpecEdit(null); }}
                      onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
                      {lm && (
                        <g>
                          {lmLines.map(([a, b, mk]) => (lm.hasSleeves || mk !== 'cuff') && (
                            <g key={a + b}>
                              <line x1={lm[a][0]} y1={lm[a][1]} x2={lm[b][0]} y2={lm[b][1]} stroke="#ffd23f" strokeWidth={rad * 0.3} strokeDasharray={mk ? undefined : `${rad} ${rad * 0.6}`} />
                              {mk && cal && px && <text x={(lm[a][0] + lm[b][0]) / 2} y={(lm[a][1] + lm[b][1]) / 2 - rad * 0.8} fontSize={rad * 2.2} textAnchor="middle" className="lab-lbl">{r1(real[mk] || px[mk] * cal.k)}</text>}
                            </g>
                          ))}
                          {(() => { const hps = (lm.NL[1] + lm.NR[1]) / 2, hem = (lm.HL[1] + lm.HR[1]) / 2, x = lm.CF[0]; return <g><line x1={x} y1={hps} x2={x} y2={hem} stroke="#ffd23f" strokeWidth={rad * 0.25} />{cal && px && <text x={x + rad} y={(hps + hem) / 2} fontSize={rad * 2.2} className="lab-lbl">{r1(real.length || px.length * cal.k)}</text>}</g>; })()}
                          {lm.hasSleeves && (() => { const m: Pt = [(lm.CO[0] + lm.CI[0]) / 2, (lm.CO[1] + lm.CI[1]) / 2]; return <g><line x1={lm.SR[0]} y1={lm.SR[1]} x2={m[0]} y2={m[1]} stroke="#ffd23f" strokeWidth={rad * 0.25} />{cal && px && <text x={(lm.SR[0] + m[0]) / 2} y={(lm.SR[1] + m[1]) / 2 - rad} fontSize={rad * 2.2} textAnchor="middle" className="lab-lbl">{r1(real.sleeve || px.sleeve * cal.k)}</text>}</g>; })()}
                          {tap === 'points' && (Object.keys(LM_LABEL) as LmKey[]).filter((k) => lm.hasSleeves || (k !== 'CO' && k !== 'CI')).map((k) => (
                            <g key={k} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); ov.current?.setPointerCapture(e.pointerId); setDrag(k); }} style={{ cursor: 'grab', touchAction: 'none' }}>
                              <circle cx={lm[k][0]} cy={lm[k][1]} r={rad * 2.4} fill="transparent" />
                              <circle cx={lm[k][0]} cy={lm[k][1]} r={drag === k ? rad * 1.2 : rad * 0.85} fill={drag === k ? '#d2452f' : '#fff'} stroke="#d2452f" strokeWidth={rad * 0.35} />
                              {drag === k && <text x={lm[k][0]} y={lm[k][1] - rad * 2} fontSize={rad * 2} textAnchor="middle" className="lab-lbl">{J ? LM_LABEL[k][1] : LM_LABEL[k][0]}</text>}
                            </g>
                          ))}
                        </g>
                      )}
                    </svg>
                  </div>
                  <div className="lab-row">
                    <button type="button" className="chip" aria-pressed={tap === 'points'} onClick={() => setTap('points')}>{tt('Move points', '点を動かす')}</button>
                    <button type="button" className="chip" aria-pressed={tap === 'select'} onClick={() => setTap('select')}>{tt('Tap the garment to reselect', '服をタップして選び直す')}</button>
                    <label className="lab-note">{tt('Color tolerance', '色の幅')} <input type="range" min={3} max={24} value={tol} onChange={(e) => setTol(+e.target.value)} /></label>
                    <button type="button" className="chip" onClick={() => { if (L) { setLm(detectLandmarks(L)); setSpecEdit(null); } }}>{tt('Re-detect points', '点を置き直す')}</button>
                    <label className="chip lab-file"><input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0])} />{tt('Change photo', '写真を変える')}</label>
                  </div>
                  {(cover > 0.9 || cover < 0.04) && <p className="err">{tt('The garment is not separated from the background. Choose “Tap the garment to reselect” and tap the garment.', '服と背景が分かれていません。「服をタップして選び直す」を押して服をタップしてください。')}</p>}
                  <p className="lab-note">{tt('Drag the red points onto the neck, shoulder tips, armpits, hem corners and cuff. The yellow numbers are the sizes in cm.', '赤い点を、首の付け根・肩先・脇の下・裾の角・袖口に合わせてドラッグします。黄色の数字が寸法（cm）です。')}</p>
                </>
              )
            ) : (
              <ScanViewer onUse={(k, cm) => setReal((r) => ({ ...r, [k]: cm }))} />
            )}
          </div>

          <aside className="lab-side">
            <h5>{tt('Real measurements (cm)', '実寸（cm）')}</h5>
            <p className="lab-note">{tt('Measure the garment flat with a tape measure. Anything you enter is used exactly; the photo fills in the rest.', '平置きの服をメジャーで測って入れてください。入れた数値はそのまま型紙に使い、入れていない所を写真から割り出します。')}</p>
            <div className="lab-meas">
              {MEASURES.map((m) => {
                const est = px && cal ? r1(px[m.k] * cal.k) : null;
                const dv = cal?.dev[m.k];
                return (
                  <label key={m.k}>
                    <span><b>{J ? m.ja : m.en}</b><small>{J ? m.how[1] : m.how[0]}</small></span>
                    <span className="lab-in">
                      <input type="number" inputMode="decimal" step="0.5" placeholder={est ? String(est) : '—'} value={real[m.k] ?? ''} onChange={(e) => { const v = parseFloat(e.target.value); setReal((r) => ({ ...r, [m.k]: isFinite(v) && v > 0 ? v : undefined })); setSpecEdit(null); }} />
                      {dv !== undefined && cal && cal.n >= 2 && <em className={Math.abs(dv) > 1.5 ? 'warn' : 'ok'}>{dv > 0 ? '+' : ''}{dv.toFixed(1)}</em>}
                    </span>
                  </label>
                );
              })}
            </div>
            {lm && cal && (
              <p className={`lab-acc ${cal.n === 0 ? 'warn' : ''}`}>
                {cal.n === 0
                  ? tt('No real measurement yet: the scale is a guess (body length 70 cm). Enter at least one.', '実寸がまだありません。縮尺は仮（着丈70cm）です。1つ以上入れてください。')
                  : cal.n === 1
                    ? tt('Scale set from 1 measurement. Add one more to check the photo for distortion.', '実寸1つで縮尺を決めました。もう1つ入れると、写真のゆがみを確かめられます。')
                    : tt(`Scale from ${cal.n} measurements. The photo differs from your tape by up to ${devMax.toFixed(1)} cm (numbers beside the boxes).`, `実寸${cal.n}つで縮尺を決めました。写真とメジャーの差は最大 ${devMax.toFixed(1)}cm です（入力欄の横の数字）。`)}
              </p>
            )}
            {L && (
              <label className="lab-drop small">
                <input type="file" accept="image/*" onChange={(e) => pickBack(e.target.files?.[0])} />
                <b>{Bk ? tt('Back photo added ✓', '背面の写真 ✓') : tt('Add a back photo (optional)', '背面の写真（任意）')}</b>
                <span>{tt('Used for the back in 3D.', '3Dの背中に使います。')}</span>
              </label>
            )}
            <button type="button" className="btn primary lab-next" onClick={() => setStep('pattern')}>{tt('Make the pattern →', '型紙をつくる →')}</button>
            {!L && <p className="lab-note">{tt('No photo? Enter the measurements and go on — a pattern is drafted from the numbers alone.', '写真がなくても、実寸だけ入れて進めば数値から型紙を作ります。')}</p>}
          </aside>
        </div>
      )}

      {step === 'pattern' && (
        <div className="lab-main">
          <div className="lab-stage">
            <PatternView doc={doc} spec={imported ? null : spec} onSpec={(s) => setSpecEdit(s)} onDoc={imported ? setImported : undefined} />
          </div>
          <aside className="lab-side">
            {imported ? (
              <>
                <h5>{tt('Imported pattern', '取り込んだ型紙')}</h5>
                <p className="lab-note">{tt('Choose what each piece is (front, back, sleeves) so it is placed on the body, and pair the edges that are sewn together. Same-length pairs sew cleanly.', '各パーツが前身頃・後身頃・袖のどれかを選ぶとボディの正しい位置に置かれます。縫い合わせる辺を2本ずつ指定してください。長さがそろっているほどきれいに縫えます。')}</p>
                <button type="button" className="btn" onClick={() => { setImported(null); setMsg(''); }}>{tt('Back to my measured pattern', '採寸した型紙に戻る')}</button>
              </>
            ) : (
              <>
                <h5>{tt('Sizes (cm)', '寸法（cm）')}</h5>
                <div className="lab-sliders">
                  {SPEC_FIELDS.filter((f) => spec.sleeves || (f.k !== 'sleeve' && f.k !== 'cuff')).map((f) => {
                    const v = (spec[f.k] as number) * (f.x2 ? 2 : 1);
                    const set = (n: number) => setSpecEdit({ ...spec, [f.k]: Math.round((n / (f.x2 ? 2 : 1)) * 10) / 10 });
                    return (
                      <label key={f.k}>
                        <span>{J ? f.ja : f.en}</span>
                        <input type="range" min={f.min} max={f.max} step={0.5} value={v} onChange={(e) => set(+e.target.value)} />
                        <input type="number" step="0.5" value={r1(v)} onChange={(e) => { const n = parseFloat(e.target.value); if (isFinite(n)) set(n); }} />
                      </label>
                    );
                  })}
                </div>
                <div className="lab-row">
                  <button type="button" className="chip" aria-pressed={spec.sleeves} onClick={() => setSpecEdit({ ...spec, sleeves: !spec.sleeves, sleeve: spec.sleeve || 20, cuff: spec.cuff || 16 })}>{spec.sleeves ? tt('Sleeves on', '袖あり') : tt('Sleeveless', '袖なし')}</button>
                  {specEdit && <button type="button" className="chip" onClick={() => setSpecEdit(null)}>{tt('Reset to measured', '採寸どおりに戻す')}</button>}
                </div>
              </>
            )}
            <h5>{tt('Save', '保存')}</h5>
            <div className="lab-row">
              <button type="button" className="btn" onClick={() => download('gallery-crypto-pattern.svg', docToSVG(doc, 1), 'image/svg+xml')}>{tt('Pattern SVG (1:1)', '型紙 SVG（原寸）')}</button>
              <button type="button" className="btn" onClick={() => download('gallery-crypto-pattern.json', JSON.stringify({ ...doc, spec: imported ? undefined : spec, custom: !!imported }, null, 1), 'application/json')}>{tt('Pattern data (.json)', '型紙データ（.json）')}</button>
            </div>
            <p className="lab-note">{tt('The SVG is full size with 1 cm seam allowance (dashed). The .json can be opened here again or by other tools.', 'SVGは原寸・縫い代1cm（点線）。.json はここでまた開けます。')}</p>
            <button type="button" className="btn primary lab-next" onClick={() => setStep('sew')} disabled={!doc.pieces.length}>{tt('Sew it in 3D →', '3Dで縫う →')}</button>
          </aside>
        </div>
      )}

      {step === 'sew' && (
        <div className="lab-main">
          <div className="lab-stage">
            <SewView doc={doc} body={body} skin={skin} density={density} />
          </div>
          <aside className="lab-side">
            <h5>{tt('How it works', 'しくみ')}</h5>
            <p className="lab-note">{tt('Each pattern piece becomes cloth, is placed around the body and pulled together along its seams (shoulders, sides, armholes, underarms). Gravity then lets it hang. The fit you see comes from the pattern sizes, so change them on step 2 and sew again.', '型紙の各パーツを布にしてボディのまわりに置き、縫い目（肩・脇・袖ぐり・袖下）を引き寄せて縫い合わせ、重力で落ち着かせます。見た目は型紙の寸法そのものなので、②で寸法を変えてもう一度縫えば確かめられます。')}</p>
            <h5>{tt('Cloth detail', '布の細かさ')}</h5>
            <div className="lab-row">
              {[[3.5, tt('Fast', '速い')], [2.5, tt('Normal', '普通')], [1.8, tt('Fine', '細かい')]].map(([v, l]) => <button key={v as number} type="button" className="chip" aria-pressed={density === v} onClick={() => setDensity(v as number)}>{l as string}</button>)}
            </div>
            <p className="lab-note">{tt('Body: chest ', 'ボディ：胸囲 ')}{Math.round(2 * Math.PI * 0.863 * body.a)}cm {tt('(made smaller than the garment to leave ease)', '（服より小さめにしてゆとりを残しています）')}</p>
            <button type="button" className="btn lab-next" onClick={() => setStep('pattern')}>{tt('← Adjust the pattern', '← 型紙を調整')}</button>
          </aside>
        </div>
      )}
    </div>
  );
}
