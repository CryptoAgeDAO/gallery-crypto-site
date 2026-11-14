'use client';
// 型紙の画面：パーツを並べて表示。○の点をドラッグすると寸法が変わる。辺を2本タップすると「縫い合わせ」を作れる。
import { useMemo, useRef, useState } from 'react';
import { handles, moveHandle, outline, plen, type PatternDoc, type Pt, type Role, type Seam, type Spec } from './draft';
import { tt, useLang } from '../Lang';

const COLORS = ['#d2452f', '#2f6fd2', '#2f9d55', '#c78a12', '#8a3fc7', '#16a3a3', '#c73f8a', '#5a6b10'];
const ROLES: { r: Role; en: string; ja: string }[] = [
  { r: 'front', en: 'Front', ja: '前身頃' }, { r: 'back', en: 'Back', ja: '後身頃' },
  { r: 'sleeveR', en: 'Right sleeve', ja: '右袖' }, { r: 'sleeveL', en: 'Left sleeve', ja: '左袖' }, { r: 'other', en: 'Other', ja: 'その他' },
];

export default function PatternView({ doc, spec, onSpec, onDoc }: { doc: PatternDoc; spec: Spec | null; onSpec?: (s: Spec) => void; onDoc?: (d: PatternDoc) => void }) {
  const { lang } = useLang();
  const svg = useRef<SVGSVGElement>(null);
  const frozen = useRef<Record<string, Pt> | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [pick, setPick] = useState<[string, string] | null>(null);
  const [seamMode, setSeamMode] = useState(!spec);

  const lay = useMemo(() => {
    const gap = 8;
    let x = gap, H = 0;
    const off: Record<string, Pt> = {};
    for (const pc of doc.pieces) {
      const o = outline(pc), xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      off[pc.id] = [x - x0, gap - y0];
      x += x1 - x0 + gap;
      H = Math.max(H, y1 - y0 + gap * 2 + 6);
    }
    return { off, W: x, H };
  }, [doc]);
  const off = frozen.current || lay.off;
  const toSvg = (e: React.PointerEvent): Pt | null => {
    const s = svg.current, m = s?.getScreenCTM();
    if (!s || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const hs = spec ? handles(spec) : [];
  const seamOf = (pid: string, e: string) => doc.seams.findIndex((s) => (s.a[0] === pid && s.a[1] === e) || (s.b[0] === pid && s.b[1] === e));
  const tapEdge = (pid: string, e: string) => {
    if (!seamMode || !onDoc) return;
    if (!pick) { setPick([pid, e]); return; }
    if (pick[0] === pid && pick[1] === e) { setPick(null); return; }
    const pa = doc.pieces.find((p) => p.id === pick[0])!.edges.find((x) => x.name === pick[1])!.pts;
    const pb = doc.pieces.find((p) => p.id === pid)!.edges.find((x) => x.name === e)!.pts;
    // 向きは、長さの比が大きく違わない前提で「始点どうしが近い方」を仮に選ぶ（あとで反転できる）
    const d = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const rev = d(pa[0], pb[0]) + d(pa[pa.length - 1], pb[pb.length - 1]) > d(pa[0], pb[pb.length - 1]) + d(pa[pa.length - 1], pb[0]);
    const seams = doc.seams.filter((s) => !((s.a[0] === pid && s.a[1] === e) || (s.b[0] === pid && s.b[1] === e) || (s.a[0] === pick[0] && s.a[1] === pick[1]) || (s.b[0] === pick[0] && s.b[1] === pick[1])));
    onDoc({ ...doc, seams: [...seams, { a: pick, b: [pid, e], rev }] });
    setPick(null);
  };
  const setSeam = (i: number, s: Seam | null) => onDoc?.({ ...doc, seams: s ? doc.seams.map((x, j) => (j === i ? s : x)) : doc.seams.filter((_, j) => j !== i) });
  const fs = Math.max(2, lay.W / 90);
  const name = (pid: string) => doc.pieces.find((p) => p.id === pid)?.name || pid;

  return (
    <div className="lab-pat">
      <div className="lab-row">
        {spec && <button type="button" className="chip" aria-pressed={!seamMode} onClick={() => { setSeamMode(false); setPick(null); }}>{tt('Move points', '点を動かす')}</button>}
        {onDoc && <button type="button" className="chip" aria-pressed={seamMode} onClick={() => setSeamMode(true)}>{tt('Pair seams', '縫い合わせを指定')}</button>}
        <span className="lab-note">{seamMode ? (pick ? tt('Now tap the edge it is sewn to.', '縫い合わせる相手の辺をタップ。') : tt('Tap an edge, then the edge it is sewn to.', '辺をタップ → 縫い合わせる相手の辺をタップ。')) : tt('Drag the round handles. Sizes update everywhere.', '○をドラッグすると寸法が変わります。')}</span>
      </div>
      <div className="lab-svgwrap">
        <svg ref={svg} viewBox={`0 0 ${lay.W.toFixed(1)} ${lay.H.toFixed(1)}`} className="lab-svg" style={{ touchAction: drag ? 'none' : 'pan-x pan-y' }}
          onPointerMove={(e) => { if (!drag || !spec || !onSpec) return; const p = toSvg(e); if (!p) return; const h = hs.find((x) => x.piece + x.key === drag)!; const o = off[h.piece]; onSpec(moveHandle(spec, h.key, [p[0] - o[0], p[1] - o[1]])); }}
          onPointerUp={() => { setDrag(null); frozen.current = null; }} onPointerCancel={() => { setDrag(null); frozen.current = null; }}>
          {/* 5cm の目盛り */}
          <g opacity=".5"><rect x={8} y={lay.H - 7} width={5} height={1.2} fill="#111" /><text x={14.5} y={lay.H - 5.9} fontSize={fs * 0.7}>5cm</text></g>
          {doc.pieces.map((pc) => {
            const o = off[pc.id] || [0, 0];
            const T = (p: Pt) => `${(p[0] + o[0]).toFixed(2)},${(p[1] + o[1]).toFixed(2)}`;
            const ol = outline(pc);
            const xs = ol.map((p) => p[0]), ys = ol.map((p) => p[1]);
            const cxp: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
            return (
              <g key={pc.id}>
                <polygon points={ol.map(T).join(' ')} fill="#fbfaf7" stroke="none" />
                {pc.edges.map((e) => {
                  const si = seamOf(pc.id, e.name), on = pick && pick[0] === pc.id && pick[1] === e.name;
                  const col = si >= 0 ? COLORS[si % COLORS.length] : '#222';
                  return (
                    <g key={e.name} onClick={() => tapEdge(pc.id, e.name)} style={{ cursor: seamMode ? 'pointer' : 'default' }}>
                      {seamMode && <polyline points={e.pts.map(T).join(' ')} fill="none" stroke="transparent" strokeWidth={fs * 1.6} />}
                      <polyline points={e.pts.map(T).join(' ')} fill="none" stroke={on ? '#f0b400' : col} strokeWidth={on ? fs * 0.45 : si >= 0 ? fs * 0.3 : fs * 0.14} strokeLinecap="round" />
                      {si >= 0 && (() => { const m = e.pts[Math.floor(e.pts.length / 2)]; return <text x={m[0] + o[0]} y={m[1] + o[1]} fontSize={fs * 0.75} fill={col} textAnchor="middle" dy={-fs * 0.3}>{si + 1}</text>; })()}
                    </g>
                  );
                })}
                <text x={cxp[0] + o[0]} y={cxp[1] + o[1]} fontSize={fs} textAnchor="middle" fill="#555">{pc.name}</text>
              </g>
            );
          })}
          {!seamMode && hs.map((h) => {
            const o = off[h.piece];
            if (!o) return null;
            const id = h.piece + h.key;
            return (
              <g key={id} onPointerDown={(e) => { e.preventDefault(); (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId); frozen.current = { ...lay.off }; setDrag(id); }} style={{ cursor: 'grab', touchAction: 'none' }}>
                <circle cx={h.at[0] + o[0]} cy={h.at[1] + o[1]} r={fs * 1.3} fill="transparent" />
                <circle cx={h.at[0] + o[0]} cy={h.at[1] + o[1]} r={fs * (drag === id ? 0.75 : 0.55)} fill={drag === id ? '#d2452f' : '#fff'} stroke="#d2452f" strokeWidth={fs * 0.18} />
                {drag === id && <text x={h.at[0] + o[0]} y={h.at[1] + o[1] - fs * 1.2} fontSize={fs * 0.8} textAnchor="middle" fill="#d2452f">{lang === 'ja' ? h.label[1] : h.label[0]}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      {onDoc && (
        <div className="lab-list">
          {doc.pieces.map((pc) => (
            <div key={pc.id} className="lab-row">
              <input className="lab-name" value={pc.name} onChange={(e) => onDoc({ ...doc, pieces: doc.pieces.map((p) => (p.id === pc.id ? { ...p, name: e.target.value } : p)) })} />
              <select value={pc.role} onChange={(e) => onDoc({ ...doc, pieces: doc.pieces.map((p) => (p.id === pc.id ? { ...p, role: e.target.value as Role } : p)) })}>
                {ROLES.map((r) => <option key={r.r} value={r.r}>{lang === 'ja' ? r.ja : r.en}</option>)}
              </select>
            </div>
          ))}
          {doc.seams.map((s, i) => {
            const la = plen(doc.pieces.find((p) => p.id === s.a[0])?.edges.find((e) => e.name === s.a[1])?.pts || []);
            const lb = plen(doc.pieces.find((p) => p.id === s.b[0])?.edges.find((e) => e.name === s.b[1])?.pts || []);
            return (
              <div key={i} className="lab-row lab-seam">
                <b style={{ color: COLORS[i % COLORS.length] }}>{i + 1}</b>
                <span>{name(s.a[0])}·{s.a[1]} ↔ {name(s.b[0])}·{s.b[1]}</span>
                <em className={Math.abs(la - lb) > 2 ? 'warn' : ''}>{la.toFixed(1)} / {lb.toFixed(1)} cm</em>
                <button type="button" className="chip" aria-pressed={s.rev} onClick={() => setSeam(i, { ...s, rev: !s.rev })}>{tt('Flip', '向き反転')}</button>
                <button type="button" className="chip" onClick={() => setSeam(i, null)}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
