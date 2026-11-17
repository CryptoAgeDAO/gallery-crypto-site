'use client';
// Try the Look：奥に並んだ人型（架空のシルエット）のうち、選んだ一体が手前へ歩いてくる。
// 上は店の服（絵）を着せ、下はパンツの色だけ変える。人物は特定の誰でもない、顔のない人型。
import { useEffect, useRef, useState } from 'react';
import { useLang } from '../Lang';
import { sfx } from '@/lib/sfx';

export type LookPiece = { id: string; title: string; sub: string; price: string; code: string; src: string };
const PANTS = ['#2b2d33', '#cbc4b6', '#4f5f74', '#3a3934', '#8b8579', '#1f2a3a'];
const SHOES = ['#f2f0ea', '#1b1b1b', '#efeee8', '#6b5a48', '#f2f0ea', '#222'];

function Figure({ src, i }: { src: string; i: number }) {
  const p = PANTS[i % PANTS.length], s = SHOES[i % SHOES.length];
  return (
    <svg viewBox="0 0 200 520" className="tl-fig" aria-hidden>
      <defs>
        <linearGradient id={`tlp${i}`} x1="0" x2="1"><stop offset="0" stopColor="#000" stopOpacity=".28" /><stop offset=".45" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".22" /></linearGradient>
        <radialGradient id="tlh" cx=".4" cy=".35"><stop offset="0" stopColor="#e6e1d9" /><stop offset="1" stopColor="#bdb6ab" /></radialGradient>
      </defs>
      <ellipse cx="100" cy="506" rx="62" ry="9" fill="#000" opacity=".12" />
      {/* 脚（歩くときに交互に振る） */}
      <g className="tl-leg l"><path d={`M72 236 L58 470 Q57 480 66 480 L92 480 L100 250 Z`} fill={p} /><path d={`M72 236 L58 470 Q57 480 66 480 L92 480 L100 250 Z`} fill={`url(#tlp${i})`} /><path d="M54 474 q-2 18 14 18 h30 q8 0 6-12 l-4-8 z" fill={s} /></g>
      <g className="tl-leg r"><path d={`M128 236 L142 470 Q143 480 134 480 L108 480 L100 250 Z`} fill={p} /><path d={`M128 236 L142 470 Q143 480 134 480 L108 480 L100 250 Z`} fill={`url(#tlp${i})`} /><path d="M146 474 q2 18 -14 18 h-30 q-8 0 -6-12 l4-8 z" fill={s} /></g>
      <path d="M70 226 h60 l2 22 h-64 z" fill={p} />
      {/* 首と頭（顔は描かない） */}
      <rect x="90" y="52" width="20" height="24" rx="8" fill="#c9c2b7" />
      <ellipse cx="100" cy="34" rx="19" ry="23" fill="url(#tlh)" />
      {/* 服 */}
      <image href={src} x="-5" y="58" width="210" height="193" preserveAspectRatio="xMidYMin meet" />
    </svg>
  );
}

export default function TryTheLook({ pieces, onPick }: { pieces: LookPiece[]; onPick?: (id: string) => void }) {
  const { t } = useLang();
  const list = pieces.slice(0, 6);
  const [sel, setSel] = useState(0);
  const [walk, setWalk] = useState(false);
  const auto = useRef(true);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => { const f = () => setNarrow(innerWidth < 720); f(); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);
  const choose = (k: number, user = true) => {
    if (!list.length) return;
    const n = (k + list.length) % list.length; if (n === sel) return;
    if (user) auto.current = false;
    setSel(n); setWalk(true); sfx('tick');
  };
  useEffect(() => { if (!walk) return; const id = setTimeout(() => setWalk(false), 1700); return () => clearTimeout(id); }, [walk, sel]);
  useEffect(() => { const id = setInterval(() => { if (auto.current) choose(sel + 1, false); }, 6500); return () => clearInterval(id); }); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = list[sel];
  if (!cur) return null;
  const n = list.length;
  return (
    <section className="tl" aria-label="Try the Look">
      <div className="tl-head">
        <p>{t('Try the look', '着たときの姿を見る')}</p>
        <h3>Try the Look.</h3>
      </div>
      <div className="tl-stage">
        {list.map((it, i) => {
          const back = i !== sel;
          const slot = ((i - sel + n) % n) - 0; // 選んだもの以外は奥に一列
          const order = back ? (slot <= n / 2 ? slot : slot - n) : 0;
          const x = back ? order * (narrow ? 19 : 13) : narrow ? -18 : -6; // vw
          const style: React.CSSProperties = back
            ? { transform: `translate(${x}vw, ${narrow ? -16 : -6}%) scale(${narrow ? 0.42 : 0.5})`, filter: `blur(${1.5 + Math.abs(order) * 0.6}px)`, opacity: 0.86 - Math.abs(order) * 0.08, zIndex: 10 - Math.abs(order) }
            : { transform: `translate(${x}vw, ${narrow ? 2 : 6}%) scale(${narrow ? 0.92 : 1})`, filter: 'blur(0)', opacity: 1, zIndex: 20 };
          return (
            <button key={it.id} className={`tl-p ${back ? '' : 'on'} ${!back && walk ? 'walking' : ''}`} style={style} onClick={() => (back ? choose(i) : onPick?.(it.id))} aria-label={it.title}>
              <span className="tl-bob"><Figure src={it.src} i={i} /></span>
            </button>
          );
        })}
        <div className={`tl-card ${walk ? 'out' : ''}`} key={cur.id}>
          <em>{String(sel + 1).padStart(2, '0')} / {String(n).padStart(2, '0')} · {cur.code}</em>
          <b>{cur.title}</b>
          <span>{cur.sub}</span>
          <strong>{cur.price}</strong>
          <button onClick={() => onPick?.(cur.id)}>{t('View this piece', 'この服を見る')} →</button>
          <small>{t('Figures are illustrations, not real people.', '人型はイラストで、実在の人物ではありません。')}</small>
        </div>
        <div className="tl-ctl">
          <button onClick={() => choose(sel - 1)} aria-label={t('Previous look', '前のルック')}>←</button>
          <button onClick={() => choose(sel + 1)} aria-label={t('Next look', '次のルック')}>→</button>
        </div>
      </div>
    </section>
  );
}
