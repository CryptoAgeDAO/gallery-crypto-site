// デモ用の図（古着・アートの見本）。写真の代わりに、その場で描くオリジナルの図
import type { Project } from '@/lib/hub';

const GARMENT: Record<string, string> = {
  tee: 'M70 40 L100 28 Q120 44 140 28 L170 40 L200 78 L176 92 L164 78 L164 196 L76 196 L76 78 L64 92 L40 78 Z',
  sweat: 'M72 40 L102 28 Q120 42 138 28 L168 40 L206 150 L186 158 L162 82 L162 196 L78 196 L78 82 L54 158 L34 150 Z',
  jacket: 'M72 38 L104 26 L120 46 L136 26 L168 38 L204 150 L184 158 L162 84 L162 198 L78 198 L78 84 L56 158 L36 150 Z',
  shirt: 'M74 38 L104 26 L120 40 L136 26 L166 38 L200 146 L180 154 L160 84 L160 198 L80 198 L80 84 L60 154 L40 146 Z',
  denim: 'M72 40 L104 26 L120 44 L136 26 L168 40 L202 148 L182 156 L162 84 L162 178 L78 178 L78 84 L58 156 L38 148 Z',
};

export function GarmentArt({ d }: { d: NonNullable<Project['draw']> }) {
  const p = GARMENT[d.kind];
  return (
    <svg viewBox="0 0 240 220" role="img" aria-hidden>
      <rect width="240" height="220" fill="#f2f1ec" />
      <ellipse cx="120" cy="206" rx="78" ry="6" fill="#000" opacity=".06" />
      <path d={p} fill={d.color} stroke="#000" strokeOpacity=".18" strokeWidth="1.2" strokeLinejoin="round" />
      {d.kind === 'shirt' && Array.from({ length: 8 }, (_, i) => <line key={i} x1={80 + i * 11} y1="40" x2={80 + i * 11} y2="198" stroke={d.accent} strokeOpacity=".5" strokeWidth="3" />)}
      {d.kind === 'shirt' && Array.from({ length: 7 }, (_, i) => <line key={'h' + i} x1="80" y1={60 + i * 20} x2="160" y2={60 + i * 20} stroke={d.accent} strokeOpacity=".45" strokeWidth="3" />)}
      {(d.kind === 'jacket' || d.kind === 'denim' || d.kind === 'shirt') && <line x1="120" y1="46" x2="120" y2={d.kind === 'denim' ? 178 : 198} stroke={d.accent} strokeWidth="2" />}
      {d.kind === 'denim' && <><path d="M86 96 h26 v18 h-26 Z M128 96 h26 v18 h-26 Z" fill="none" stroke={d.accent} strokeWidth="1.6" /><line x1="78" y1="150" x2="162" y2="150" stroke={d.accent} strokeWidth="1.6" /></>}
      {d.kind === 'sweat' && <><rect x="78" y="186" width="84" height="10" fill={d.accent} opacity=".5" /><path d="M104 30 Q120 50 136 30" fill="none" stroke={d.accent} strokeWidth="4" /></>}
      {d.kind === 'tee' && d.color < '#8' && <circle cx="120" cy="104" r="26" fill="none" stroke={d.accent} strokeWidth="5" opacity=".8" />}
      {d.kind === 'tee' && d.color >= '#8' && <rect x="136" y="70" width="16" height="18" fill="none" stroke={d.accent} strokeWidth="1.5" />}
    </svg>
  );
}

function rnd(seed: number) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

export function ArtArt({ a }: { a: NonNullable<Project['art']> }) {
  const r = rnd(a.seed), [c1, c2, bg] = a.palette;
  return (
    <svg viewBox="0 0 240 220" role="img" aria-hidden>
      <rect width="240" height="220" fill={bg} />
      {a.form === 'rings' && Array.from({ length: 9 }, (_, i) => <circle key={i} cx={120 + (r() - 0.5) * 16} cy={110 + (r() - 0.5) * 16} r={12 + i * 10} fill="none" stroke={i % 3 === 0 ? c2 : c1} strokeWidth={1 + r() * 4} />)}
      {a.form === 'grid' && Array.from({ length: 36 }, (_, i) => { const x = 30 + (i % 6) * 31, y = 20 + Math.floor(i / 6) * 31; return <rect key={i} x={x} y={y} width="26" height="26" fill={r() > 0.72 ? c1 : 'none'} stroke={c2 === bg ? c1 : c1} strokeWidth="1" opacity={0.4 + r() * 0.6} />; })}
      {a.form === 'wave' && Array.from({ length: 14 }, (_, i) => <path key={i} d={`M0 ${40 + i * 11} ${Array.from({ length: 13 }, (_, j) => `Q ${j * 20 + 10} ${40 + i * 11 + (r() - 0.5) * 30} ${(j + 1) * 20} ${40 + i * 11}`).join(' ')}`} fill="none" stroke={i % 4 === 0 ? c2 : c1} strokeOpacity={i % 4 === 0 ? 1 : 0.55} strokeWidth="1.4" />)}
    </svg>
  );
}

export function ProjectPic({ p }: { p: Project }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (p.img) return <img src={p.img} alt="" loading="lazy" />;
  if (p.draw) return <GarmentArt d={p.draw} />;
  if (p.art) return <ArtArt a={p.art} />;
  return null;
}
