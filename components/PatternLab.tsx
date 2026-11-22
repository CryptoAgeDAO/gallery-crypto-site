'use client';
// パターンラボ：① 平置きの写真か3Dスキャンで採寸 → ② 型紙（点をドラッグで調整・型紙データの取り込み）→ ③ 3Dで縫って着せる。
// 写真・スキャンはこの端末の中だけで処理し、どこにも送らない。
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { autoBackground, loadLayer, selectGarment, type Layer } from './GhostMannequin';
import { LM_LABEL, type Landmarks, type LmKey } from './pattern';
import { calibrate, docToSVG, draft, MEASURES, parseDoc, parseDXF, pxMeasures, specFrom, specFromMeasures, type MeasureKey, type PatternDoc, type Pt, type Spec } from './lab/draft';
import { makeAvatar, AVATARS, FABRIC_PHYS, fabricOf, ellipseC, type Avatar } from './lab/sew';
import { buildAtlas, fabricTile, type Look, type LookPrint, type LookPiece } from './lab/look';
import { autoLandmarks as detectLandmarks } from './lab/landmarks';
import type { Skin, SewApi, SewStats, MapMode } from './lab/SewView';
import { isPhone } from '@/lib/device';
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
  // ---- 3D 縫製（CLO のような）：アバター・生地・見た目・フィット・保存 ----
  const [av, setAv] = useState<Avatar>(AVATARS[1].a);
  const [avKey, setAvKey] = useState('M');
  const [fabKey, setFabKey] = useState('jersey');
  const [look, setLook] = useState<Look>({ color: '#1d1d1f', tile: 'jersey', prints: [], stitch: true, rib: true });
  const [usePhoto, setUsePhoto] = useState(true); // 写真から作った型紙は、写真の柄をそのまま貼れる
  const [map, setMap] = useState<MapMode>('look');
  const [showBody, setShowBody] = useState(true);
  const [slow, setSlow] = useState(false);
  const [sewTab, setSewTab] = useState<'avatar' | 'fabric' | 'look' | 'fit' | 'save'>('fabric');
  const [stats, setStats] = useState<SewStats | null>(null);
  const [selP, setSelP] = useState<string | null>(null);
  const [pieceSel, setPieceSel] = useState<LookPiece>('front');
  const [pTitle, setPTitle] = useState('');
  const [pPrice, setPPrice] = useState(14800);
  const [pSaved, setPSaved] = useState('');
  const sewApi = useRef<SewApi | null>(null);
  const prevCv = useRef<HTMLCanvasElement>(null);
  const [atlas, setAtlas] = useState<Awaited<ReturnType<typeof buildAtlas>> | null>(null);
  const fab = useMemo(() => fabricOf(fabKey), [fabKey]);
  // モックアップの「型紙から精密に縫う」から来たとき：寸法・色・生地・プリントを引き継ぐ
  useEffect(() => {
    try {
      const j = JSON.parse(localStorage.getItem('gc-pattern-src') || 'null'); if (!j?.spec) return;
      localStorage.removeItem('gc-pattern-src');
      setSpecEdit(j.spec); setImported(null);
      if (j.fabric) setFabKey(FABRIC_PHYS.some((f) => f.key === j.fabric) ? j.fabric : 'jersey');
      setLook((l) => ({ ...l, color: j.color || l.color, tile: j.tile || l.tile, texSrc: j.texSrc, prints: (j.prints || []) as LookPrint[] }));
      setUsePhoto(false); setStep('pattern');
      setMsg(tt('Measurements, colour, fabric and prints came over from the mockup.', 'モックアップから寸法・色・生地・プリントを引き継ぎました。'));
    } catch { /* 無視 */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  const body = useMemo(() => makeAvatar(av), [av]);
  // 型紙ごとの絵（色・生地・プリント・ステッチ）
  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => { buildAtlas(doc, look, isPhone() ? 1024 : 2048).then((a) => { if (alive) setAtlas(a); }); }, 120);
    return () => { alive = false; clearTimeout(h); };
  }, [doc, look]);

  // 3D の生地：写真から（型紙の cm → 写真の位置）
  const photoSkin: Skin = useMemo(() => {
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
  const hasPhoto = !!photoSkin.uv;
  const skin: Skin = useMemo(() => (hasPhoto && usePhoto ? photoSkin : atlas ? { tex: atlas.canvas, back: atlas.canvas, uv: atlas.uv, color: look.color } : { tex: null, back: null, uv: null, color: look.color }), [hasPhoto, usePhoto, photoSkin, atlas, look.color]);

  // プリントの位置合わせ用：選んだパーツだけを大きく（背中は外から見た向き）
  useEffect(() => {
    const cv = prevCv.current, a = atlas, r = a?.rects[pieceSel]; if (!cv || !a || !r) return;
    const box = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio); cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
    const g = cv.getContext('2d')!, sw = r.w * a.k, sh = r.h * a.k, sc = Math.min(cv.width / sw, cv.height / sh) * 0.94, ox = (cv.width - sw * sc) / 2, oy = (cv.height - sh * sc) / 2;
    const back = doc.pieces.find((p) => p.id === pieceSel)?.role === 'back';
    g.clearRect(0, 0, cv.width, cv.height); g.save();
    if (back) { g.translate(cv.width, 0); g.scale(-1, 1); }
    g.drawImage(a.canvas, r.ox, r.oy, sw, sh, ox, oy, sw * sc, sh * sc); g.restore();
    (cv as HTMLCanvasElement & { _m?: unknown })._m = { ox, oy, sc: sc * a.k, x0: r.x0, y0: r.y0, back, W: cv.width };
    const p = look.prints.find((q) => q.id === selP && q.piece === pieceSel);
    if (p) { const X = back ? cv.width - (ox + ((-p.x) - r.x0) * sc * a.k) : ox + (p.x - r.x0) * sc * a.k, Y = oy + (p.y - r.y0) * sc * a.k, w = p.w * sc * a.k; g.strokeStyle = '#2a5bd2'; g.lineWidth = 1.5 * dpr; g.setLineDash([5 * dpr, 4 * dpr]); g.strokeRect(X - w / 2, Y - w * 0.4, w, w * 0.8); g.setLineDash([]); }
  }, [atlas, pieceSel, selP, look.prints, doc, step, sewTab]);
  const pDrag = useRef<{ id: string; sx: number; sy: number; x: number; y: number } | null>(null);
  const prevCm = (e: React.PointerEvent) => { const cv = prevCv.current!; const m = (cv as HTMLCanvasElement & { _m?: { ox: number; oy: number; sc: number; x0: number; y0: number; back: boolean; W: number } })._m; if (!m) return null; const r = cv.getBoundingClientRect(), d = cv.width / r.width; let px = (e.clientX - r.left) * d; const py = (e.clientY - r.top) * d; if (m.back) px = m.W - px; const x = (px - m.ox) / m.sc + m.x0; return { x: m.back ? -x : x, y: (py - m.oy) / m.sc + m.y0 }; };
  const updP = (patch: Partial<LookPrint>) => setLook((l) => ({ ...l, prints: l.prints.map((p) => (p.id === selP ? { ...p, ...patch } : p)) }));
  const curP = look.prints.find((p) => p.id === selP) || null;
  const addPrint = async (type: 'image' | 'text', f?: File) => {
    const src = f ? await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); }) : undefined;
    const sleeve = pieceSel.startsWith('sleeve'), id = 'lp' + Date.now().toString(36);
    const light = /^#(f|e|d|c)/i.test(look.color);
    setLook((l) => ({ ...l, prints: [...l.prints, { id, piece: pieceSel, type, src, text: type === 'text' ? 'GALLERY\nCRYPTO' : undefined, font: 'sans', color: light ? '#141414' : '#f1ece2', x: 0, y: sleeve ? 12 : 20, w: sleeve ? 8 : 24, rot: 0, opacity: 0.95, crack: false }] }));
    setSelP(id);
  };
  // 縫い上がった服を店に並べる（この端末に保存）
  const savePiece = () => {
    const sh = sewApi.current?.shots(); if (!sh) { setMsg(tt('Wait until sewing finishes.', '縫い上がるまでお待ちください。')); return; }
    try {
      const id = 'pat-' + Date.now().toString(36), list = JSON.parse(localStorage.getItem('gc-shop-local') || '[]') as { id: string }[];
      const ease = stats?.fit.find((f) => f.label[0] === 'Chest');
      const item = { id, code: 'PAT-' + id.slice(-4).toUpperCase(), title: pTitle || tt('Pattern sample', '型紙サンプル'), sub: `${tt('Sewn from the pattern', '型紙から縫製')} · ${tt(fab.en, fab.ja)}`, price: '¥' + pPrice.toLocaleString('ja-JP'), img: sh.front, back: sh.back, buy: 'local', desc: '',
        facts: [['Size', `${tt('Length', '着丈')} ${Math.round(spec.length)} / ${tt('Chest', '身幅')} ${Math.round(spec.chest * 2)} cm`], [tt('Shoulder', '肩幅'), `${Math.round(spec.shoulderX * 2)} cm`], ...(spec.sleeves ? [[tt('Sleeve', '袖丈'), `${Math.round(spec.sleeve)} cm`]] : []), [tt('Fabric', '生地'), `${tt(fab.en, fab.ja)} · ${fab.gsm} g/m²`], ...(ease ? [[tt('Chest ease', '胸囲のゆとり'), `${ease.ease > 0 ? '+' : ''}${ease.ease} cm (${tt('avatar', 'アバター')} ${avKey})`]] : [])], zone: 'vintage', heightM: sh.heightM, color: look.color, hex: look.color };
      const rest = list.filter((x) => !String(x.id).startsWith('pat-')).concat(list.filter((x) => String(x.id).startsWith('pat-')).slice(0, 5));
      localStorage.setItem('gc-shop-local', JSON.stringify([item, ...rest])); setPSaved(id); setMsg('');
    } catch { setMsg(tt('Could not save on this device (storage is full).', 'この端末に保存できませんでした（保存領域がいっぱいです）。')); }
  };

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
        <div className="lab-main sew">
          <div className="lab-stage">
            <SewView doc={doc} body={body} skin={skin} density={density} fabric={fab} map={map} showBody={showBody} onStats={setStats} apiRef={sewApi} slow={slow} />
            <div className="lab-row">
              {([['look', tt('Look', '見た目')], ['strain', tt('Strain map', 'ひずみマップ')], ['fit', tt('Fit map', 'フィットマップ')]] as [MapMode, string][]).map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={map === k} onClick={() => setMap(k)}>{l}</button>)}
              <button type="button" className="chip" aria-pressed={showBody} onClick={() => setShowBody((v) => !v)}>{showBody ? tt('Avatar on', 'アバター表示') : tt('Avatar off', 'アバター非表示')}</button>
              <button type="button" className="chip" onClick={() => sewApi.current?.restart()}>{tt('Sew again', 'もう一度縫う')}</button>
              <button type="button" className="chip" aria-pressed={slow} onClick={() => setSlow((v) => !v)}>{tt('Slow motion', 'スローで見る')}</button>
            </div>
          </div>
          <aside className="lab-side sew-side">
            <div className="sew-tabs">
              {([['avatar', tt('Avatar', 'アバター')], ['fabric', tt('Fabric', '生地')], ['look', tt('Colour & print', '色・柄')], ['fit', tt('Fit', 'フィット')], ['save', tt('Save', '保存')]] as [typeof sewTab, string][]).map(([k, l]) => <button key={k} type="button" aria-pressed={sewTab === k} onClick={() => setSewTab(k)}>{l}</button>)}
            </div>

            {sewTab === 'avatar' && (<>
              <div className="lab-row">{AVATARS.map((x) => <button key={x.key} type="button" className="chip" aria-pressed={avKey === x.key} onClick={() => { setAvKey(x.key); setAv(x.a); }}>{tt(x.en, x.ja)}</button>)}</div>
              <div className="sew-grid">
                {([['height', tt('Height', '身長'), 140, 200], ['chest', tt('Chest (round)', '胸囲'), 70, 130], ['waist', tt('Waist (round)', 'ウエスト'), 55, 120], ['hip', tt('Hip (round)', 'ヒップ'), 75, 130], ['shoulder', tt('Shoulder width', '肩幅'), 34, 54], ['arm', tt('Arm length', '腕の長さ'), 45, 70]] as [keyof Avatar, string, number, number][]).map(([k, l, a, b]) => (
                  <label key={k}><span>{l}</span><input type="number" step={0.5} min={a} max={b} value={av[k]} onChange={(e) => { setAvKey('custom'); setAv({ ...av, [k]: Math.max(a, Math.min(b, Number(e.target.value) || a)) }); }} /><em>cm</em></label>
                ))}
              </div>
              <p className="lab-note">{tt('Enter real body measurements to try the fit on that person. Circumferences are all the way round.', '実際の体の寸法を入れると、その人に着せたときの見え方を確かめられます。胸囲・ウエスト・ヒップは一周の長さ。')}</p>
            </>)}

            {sewTab === 'fabric' && (<>
              <div className="sew-fabs">
                {FABRIC_PHYS.map((f) => (
                  <button key={f.key} type="button" aria-pressed={fabKey === f.key} onClick={() => { setFabKey(f.key); setLook((l) => ({ ...l, tile: l.tile === 'image' ? 'image' : f.key })); }}>
                    <span ref={(el) => { if (el && !el.firstChild) { const t = fabricTile(f.key); t.style.background = '#55524c'; el.appendChild(t); } }} />
                    <b>{tt(f.en, f.ja)}</b><small>{f.gsm} g/m²</small>
                  </button>
                ))}
              </div>
              <table className="sew-props"><tbody>
                <tr><th>{tt('Weight', '重さ')}</th><td><i style={{ width: `${Math.min(100, fab.gsm / 4.2)}%` }} /></td><td>{fab.gsm} g/m²</td></tr>
                <tr><th>{tt('Stretch', '伸び')}</th><td><i style={{ width: `${Math.round((1 - fab.stretch) * 600)}%` }} /></td><td>{fab.stretch < 0.9 ? tt('High', '大') : fab.stretch < 0.99 ? tt('Some', '中') : tt('Little', '小')}</td></tr>
                <tr><th>{tt('Stiffness', '張り')}</th><td><i style={{ width: `${Math.round(fab.bend * 140)}%` }} /></td><td>{fab.bend > 0.4 ? tt('Firm', '硬い') : fab.bend > 0.1 ? tt('Medium', '中') : tt('Soft', '柔らかい')}</td></tr>
                <tr><th>{tt('Thickness', '厚み')}</th><td><i style={{ width: `${Math.round(fab.thick * 330)}%` }} /></td><td>{(fab.thick * 10).toFixed(1)} mm</td></tr>
              </tbody></table>
              <h5>{tt('Cloth detail', '布の細かさ（精度）')}</h5>
              <div className="lab-row">
                {[[3.5, tt('Fast', '速い')], [2.5, tt('Normal', '普通')], [1.8, tt('Fine', '細かい')], ...(isPhone() ? [] : [[1.4, tt('Very fine', 'とても細かい')]])].map(([v, l]) => <button key={v as number} type="button" className="chip" aria-pressed={density === v} onClick={() => setDensity(v as number)}>{l as string} <small>{v as number}cm</small></button>)}
              </div>
              <p className="lab-note">{tt('Each fabric drapes differently: heavy and firm ones (denim) hang straight, light and soft ones (silk, nylon) fall into fine folds. Finer cloth gives more folds but takes longer.', '生地ごとに落ち方が変わります。重く張りのある生地（デニム）はまっすぐ落ち、軽く柔らかい生地（シルク・ナイロン）は細かいしわになります。布を細かくするほど精密になりますが、時間がかかります。')}</p>
            </>)}

            {sewTab === 'look' && (<>
              {hasPhoto && <div className="lab-row"><button type="button" className="chip" aria-pressed={usePhoto} onClick={() => setUsePhoto(true)}>{tt('Photo of the garment', '服の写真の柄')}</button><button type="button" className="chip" aria-pressed={!usePhoto} onClick={() => setUsePhoto(false)}>{tt('Colour & print', '色とプリント')}</button></div>}
              {(!hasPhoto || !usePhoto) && (<>
                <h5>{tt('Colour', '色')}</h5>
                <div className="sew-colors">{['#1d1d1f', '#f4f3ef', '#e8e3d6', '#8f8c86', '#1d2740', '#2e3f66', '#4b5236', '#5b1a22', '#6a5442', '#c8b896', '#d7a2a8', '#4e6583'].map((c) => <button key={c} type="button" style={{ background: c }} aria-pressed={look.color === c} onClick={() => setLook({ ...look, color: c })} />)}<input type="color" value={look.color} onChange={(e) => setLook({ ...look, color: e.target.value })} /></div>
                <div className="lab-row">
                  <label className="chip"><input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setLook({ ...look, texSrc: String(r.result), tile: 'image' }); r.readAsDataURL(f); e.target.value = ''; }} />{tt('Fabric texture from a photo', '生地の写真で質感')}</label>
                  {look.tile === 'image' && <button type="button" className="chip" onClick={() => setLook({ ...look, tile: fab.key, texSrc: undefined })}>{tt('Back to fabric', '生地の質感に戻す')}</button>}
                  <button type="button" className="chip" aria-pressed={look.rib} onClick={() => setLook({ ...look, rib: !look.rib })}>{tt('Rib', 'リブ')}</button>
                  <button type="button" className="chip" aria-pressed={look.stitch} onClick={() => setLook({ ...look, stitch: !look.stitch })}>{tt('Topstitch', 'ステッチ')}</button>
                </div>
                <h5>{tt('Print', 'プリント')}</h5>
                <div className="lab-row">{doc.pieces.filter((p) => p.role !== 'other').map((p) => <button key={p.id} type="button" className="chip" aria-pressed={pieceSel === p.id} onClick={() => setPieceSel(p.id as LookPiece)}>{p.name.split(' ')[0]}</button>)}</div>
                <div className="sew-prev"><canvas ref={prevCv}
                  onPointerDown={(e) => { const c = prevCm(e); if (!c) return; const hit = look.prints.filter((p) => p.piece === pieceSel).reverse().find((p) => Math.abs(c.x - p.x) < p.w / 2 + 2 && Math.abs(c.y - p.y) < p.w * 0.45 + 2); if (!hit) { setSelP(null); return; } setSelP(hit.id); pDrag.current = { id: hit.id, sx: c.x, sy: c.y, x: hit.x, y: hit.y }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
                  onPointerMove={(e) => { const d = pDrag.current; if (!d) return; const c = prevCm(e); if (!c) return; setLook((l) => ({ ...l, prints: l.prints.map((p) => (p.id === d.id ? { ...p, x: Math.round((d.x + c.x - d.sx) * 2) / 2, y: Math.round((d.y + c.y - d.sy) * 2) / 2 } : p)) })); }}
                  onPointerUp={() => { pDrag.current = null; }} onPointerCancel={() => { pDrag.current = null; }} /></div>
                <div className="lab-row">
                  <label className="chip"><input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) addPrint('image', f); e.target.value = ''; }} />{tt('+ Image', '＋ 画像')}</label>
                  <button type="button" className="chip" onClick={() => addPrint('text')}>{tt('+ Text', '＋ 文字')}</button>
                </div>
                {curP && (
                  <div className="sew-edit">
                    {curP.type === 'text' && <textarea rows={2} value={curP.text} onChange={(e) => updP({ text: e.target.value })} />}
                    {curP.type === 'text' && <div className="lab-row">{(['sans', 'serif', 'mono'] as const).map((f) => <button key={f} type="button" className="chip" aria-pressed={curP.font === f} onClick={() => updP({ font: f })}>{f}</button>)}<input type="color" value={curP.color} onChange={(e) => updP({ color: e.target.value })} /></div>}
                    {([['x', tt('Left / right', '左右'), -40, 40, 'cm'], ['y', tt('From the top', '上から'), 0, 100, 'cm'], ['w', tt('Width', '幅'), 2, 60, 'cm'], ['rot', tt('Angle', '角度'), -180, 180, '°'], ['opacity', tt('Opacity', '濃さ'), 0.2, 1, '']] as [keyof LookPrint, string, number, number, string][]).map(([k, l, a, b, u]) => (
                      <label key={k}><span>{l}</span><input type="range" min={a} max={b} step={k === 'opacity' ? 0.05 : 0.5} value={curP[k] as number} onChange={(e) => updP({ [k]: Number(e.target.value) } as Partial<LookPrint>)} /><em>{k === 'opacity' ? `${Math.round((curP.opacity) * 100)}%` : `${curP[k]}${u}`}</em></label>
                    ))}
                    <div className="lab-row">
                      <button type="button" className="chip" aria-pressed={curP.crack} onClick={() => updP({ crack: !curP.crack })}>{tt('Cracked', 'ひび割れ加工')}</button>
                      <button type="button" className="chip" onClick={() => updP({ x: 0 })}>{tt('Centre', '中央へ')}</button>
                      <button type="button" className="chip" onClick={() => { setLook((l) => ({ ...l, prints: l.prints.filter((p) => p.id !== curP.id) })); setSelP(null); }}>{tt('Delete', '削除')}</button>
                    </div>
                  </div>
                )}
                <p className="lab-note">{tt('Prints sit on the pattern in centimetres, so they keep their real size and position when sewn. Drag a print on the piece to move it.', 'プリントは型紙の上にcmで置くので、縫っても実寸の大きさと位置のまま。パーツの絵の上でドラッグして動かせます。')}</p>
              </>)}
            </>)}

            {sewTab === 'fit' && (<>
              {stats ? (<>
                <table className="sew-fit"><thead><tr><th /><th>{tt('Body', '体')}</th><th>{tt('Garment', '服')}</th><th>{tt('Ease', 'ゆとり')}</th></tr></thead><tbody>
                  {stats.fit.map((f) => <tr key={f.label[0]}><th>{tt(f.label[0], f.label[1])}</th><td>{f.body}</td><td>{f.garment}</td><td className={f.ease < 2 ? 'tight' : f.ease > 30 ? 'loose' : ''}>{f.ease > 0 ? '+' : ''}{f.ease}</td></tr>)}
                </tbody></table>
                <p className="lab-note">cm · {tt('Measured on the 3D garment around the avatar.', '3Dで着せた服を、アバターの周りで測った値です。')}</p>
                <dl className="sew-dl">
                  <dt>{tt('Length on the body', '着たときの丈')}</dt><dd>{stats.lengthCm} cm <small>({tt('pattern', '型紙')} {Math.round(spec.length)} cm)</small></dd>
                  <dt>{tt('Most stretched', '最も伸びた所')}</dt><dd>{stats.strainMax.toFixed(1)} %</dd>
                  <dt>{tt('Largest seam gap', '縫い目の最大のずれ')}</dt><dd>{stats.gap.toFixed(1)} cm</dd>
                  <dt>{tt('Avatar chest', 'アバターの胸囲')}</dt><dd>{Math.round(ellipseC(body.a, body.b))} cm</dd>
                </dl>
                <div className="lab-row"><button type="button" className="chip" aria-pressed={map === 'strain'} onClick={() => setMap('strain')}>{tt('Show strain', 'ひずみを見る')}</button><button type="button" className="chip" aria-pressed={map === 'fit'} onClick={() => setMap('fit')}>{tt('Show fit', '当たりを見る')}</button></div>
              </>) : <p className="lab-note">{tt('Measured when sewing finishes…', '縫い上がると測ります…')}</p>}
            </>)}

            {sewTab === 'save' && (<>
              <label className="sew-f"><span>{tt('Name', '商品名')}</span><input value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder={tt('e.g. Studio Tee — Black', '例：Studio Tee — Black')} /></label>
              <label className="sew-f"><span>{tt('Price (yen)', '価格（円）')}</span><input type="number" step={100} value={pPrice} onChange={(e) => setPPrice(Number(e.target.value) || 0)} /></label>
              <div className="lab-row">
                <button type="button" className="btn primary" onClick={savePiece}>{tt('Display in the store', '店に並べる')}</button>
                <button type="button" className="btn" onClick={() => sewApi.current?.glb()}>{tt('Download .glb', '.glb を保存')}</button>
                <button type="button" className="btn" onClick={() => download('gallery-crypto-pattern.svg', docToSVG(doc, 1), 'image/svg+xml')}>{tt('Pattern SVG (1:1)', '型紙 SVG（原寸）')}</button>
              </div>
              {pSaved && <div className="lab-row"><a className="btn" href="/shop/room">{tt('Showroom →', 'ショールーム →')}</a><a className="btn" href={`/shop/rail#p=${pSaved}`}>{tt('Rail →', 'レール →')}</a><a className="btn" href={`/shop#p=${pSaved}`}>{tt('Shop →', 'ショップ →')}</a></div>}
              <p className="lab-note">{tt('Saved on this device as a sample (not for sale), at the sewn size. To list it for real, open Admin → “From the studio”.', 'この端末に、縫い上がった大きさのまま見本として保存します（購入不可）。本番の商品として登録するときは、管理画面の「スタジオから」で取り込めます。')}</p>
            </>)}
            <button type="button" className="btn lab-next" onClick={() => setStep('pattern')}>{tt('← Adjust the pattern', '← 型紙を調整')}</button>
          </aside>
        </div>
      )}
    </div>
  );
}
