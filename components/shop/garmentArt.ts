// レール用の「写真っぽい」服の絵（SVG）。布の陰影・ハンガーから落ちるドレープ・織りの粒・縫い目・リブを重ねる。
// 背景は透明（切り抜き）。iPhone でも描けるよう、SVG の中だけで完結させる。
import type { Project } from '@/lib/hub';

type D = NonNullable<Project['draw']>;
const BODY: Record<D['kind'], string> = {
  tee: 'M70 40 L100 28 Q120 44 140 28 L170 40 L200 78 L176 92 L164 78 L164 196 L76 196 L76 78 L64 92 L40 78 Z',
  sweat: 'M72 40 L102 28 Q120 42 138 28 L168 40 L206 150 L186 158 L162 82 L162 196 L78 196 L78 82 L54 158 L34 150 Z',
  jacket: 'M72 38 L104 26 L120 46 L136 26 L168 38 L204 150 L184 158 L162 84 L162 198 L78 198 L78 84 L56 158 L36 150 Z',
  shirt: 'M74 38 L104 26 L120 40 L136 26 L166 38 L200 146 L180 154 L160 84 L160 198 L80 198 L80 84 L60 154 L40 146 Z',
  denim: 'M72 40 L104 26 L120 44 L136 26 L168 40 L202 148 L182 156 L162 84 L162 178 L78 178 L78 84 L58 156 L38 148 Z',
};
// 身頃の左右の端・裾の高さ（陰影と縫い目の位置）
const BOX: Record<D['kind'], { l: number; r: number; b: number; sl: [number, number, number, number] }> = {
  tee: { l: 76, r: 164, b: 196, sl: [40, 78, 64, 92] },
  sweat: { l: 78, r: 162, b: 196, sl: [34, 150, 54, 158] },
  jacket: { l: 78, r: 162, b: 198, sl: [36, 150, 56, 158] },
  shirt: { l: 80, r: 160, b: 198, sl: [40, 146, 60, 154] },
  denim: { l: 78, r: 162, b: 178, sl: [38, 148, 58, 156] },
};

function lum(hex: string) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }

export function realGarment(d: D, seed = 1): string {
  const p = BODY[d.kind], b = BOX[d.kind];
  const dark = lum(d.color) < 0.35;
  const hl = dark ? 0.16 : 0.32; // 明るい所の強さ
  const id = `g${seed}`;
  const folds = [
    // ハンガーの肩から落ちるドレープ（ぼかした筋）
    `M${b.l + 10} 46 Q${b.l + 4} 120 ${b.l + 12} ${b.b - 4}`,
    `M${b.r - 10} 46 Q${b.r - 2} 120 ${b.r - 14} ${b.b - 4}`,
    `M${120 - 18} 52 Q${120 - 26} 130 ${120 - 14} ${b.b - 2}`,
    `M${120 + 20} 54 Q${120 + 30} 128 ${120 + 16} ${b.b - 2}`,
  ];
  const lights = [`M${120 - 6} 50 Q${120 - 10} 130 ${120 - 2} ${b.b - 6}`, `M${b.l + 24} 60 Q${b.l + 20} 130 ${b.l + 28} ${b.b - 8}`];
  const neck = d.kind === 'tee' || d.kind === 'sweat';
  const front = d.kind === 'jacket' || d.kind === 'denim' || d.kind === 'shirt';
  const sl = b.sl;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="660" viewBox="0 0 240 220">
<defs>
<clipPath id="${id}c"><path d="${p}"/></clipPath>
<filter id="${id}n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${d.kind === 'denim' ? '1.6 0.35' : d.kind === 'sweat' ? '0.9' : '1.3'}" numOctaves="2" seed="${seed}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="${dark ? 0.22 : 0.18}"/></feComponentTransfer></filter>
<filter id="${id}b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2"/></filter>
<filter id="${id}s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
<linearGradient id="${id}x" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset=".22" stop-color="#000" stop-opacity=".06"/><stop offset=".5" stop-color="#fff" stop-opacity="${hl * 0.5}"/><stop offset=".78" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".46"/></linearGradient>
<linearGradient id="${id}y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${hl * 0.6}"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
</defs>
<path d="${p}" transform="translate(6 7)" fill="#000" opacity=".22" filter="url(#${id}s)"/>
<path d="${p}" fill="${d.color}"/>
<g clip-path="url(#${id}c)">
${d.kind === 'shirt' ? Array.from({ length: 14 }, (_, i) => `<rect x="${30 + i * 13}" y="20" width="5" height="190" fill="${d.accent}" opacity=".42"/>`).join('') + Array.from({ length: 13 }, (_, i) => `<rect x="20" y="${34 + i * 13}" width="200" height="5" fill="${d.accent}" opacity=".36"/>`).join('') : ''}
<rect width="240" height="220" filter="url(#${id}n)"/>
${folds.map((f) => `<path d="${f}" fill="none" stroke="#000" stroke-opacity="${dark ? 0.45 : 0.22}" stroke-width="7" filter="url(#${id}b)"/>`).join('')}
${lights.map((f) => `<path d="${f}" fill="none" stroke="#fff" stroke-opacity="${hl}" stroke-width="6" filter="url(#${id}b)"/>`).join('')}
<rect x="${b.l}" y="20" width="${b.r - b.l}" height="${b.b - 18}" fill="url(#${id}x)"/>
<rect width="240" height="220" fill="url(#${id}y)"/>
<path d="M${b.l} 80 Q${b.l + 6} 64 ${b.l - 4} 44 M${b.r} 80 Q${b.r - 6} 64 ${b.r + 4} 44" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2.2" filter="url(#${id}b)"/>
<path d="M${sl[0]} ${sl[1]} L${sl[2]} ${sl[3]} M${240 - sl[0]} ${sl[1]} L${240 - sl[2]} ${sl[3]}" stroke="#000" stroke-opacity=".3" stroke-width="5"/>
</g>
<path d="M${b.l + 3} ${b.b - 4} H${b.r - 3}" stroke="${dark ? '#fff' : '#000'}" stroke-opacity=".28" stroke-width=".9" stroke-dasharray="2.2 1.6"/>
<path d="M${b.l} 84 Q${b.l + 4} 62 ${b.l - 2} 42 M${b.r} 84 Q${b.r - 4} 62 ${b.r + 2} 42" fill="none" stroke="${dark ? '#fff' : '#000'}" stroke-opacity=".22" stroke-width=".8" stroke-dasharray="2 1.6"/>
${neck ? `<path d="M100 30 Q120 ${d.kind === 'sweat' ? 46 : 48} 140 30" fill="none" stroke="${d.kind === 'sweat' ? d.accent : d.color}" stroke-width="6" stroke-linecap="round"/><path d="M100 30 Q120 ${d.kind === 'sweat' ? 46 : 48} 140 30" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="6" stroke-dasharray=".8 1.2"/><path d="M103 33 Q120 50 137 33" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.2"/>` : ''}
${d.kind === 'sweat' ? `<rect x="${b.l}" y="${b.b - 12}" width="${b.r - b.l}" height="12" fill="${d.accent}" opacity=".55"/><path d="${Array.from({ length: 28 }, (_, i) => `M${b.l + 2 + i * 3} ${b.b - 12} v12`).join(' ')}" stroke="#000" stroke-opacity=".18" stroke-width=".8"/>` : ''}
${front ? `<path d="M120 ${d.kind === 'shirt' ? 40 : 46} V${b.b}" stroke="#000" stroke-opacity=".45" stroke-width="1.4"/><path d="M118 ${d.kind === 'shirt' ? 40 : 46} V${b.b}" stroke="${d.accent}" stroke-width="1" stroke-dasharray="2 1.6" opacity=".9"/>${Array.from({ length: d.kind === 'denim' ? 5 : 6 }, (_, i) => `<circle cx="122.5" cy="${60 + i * ((b.b - 70) / (d.kind === 'denim' ? 5 : 6))}" r="2.2" fill="${d.kind === 'denim' ? '#b98a3e' : '#e9e4d8'}" stroke="#000" stroke-opacity=".4" stroke-width=".6"/>`).join('')}<path d="M104 26 L120 ${d.kind === 'shirt' ? 40 : 46} L136 26" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2"/>` : ''}
${d.kind === 'denim' ? `<path d="M86 96 h26 v18 h-26 Z M128 96 h26 v18 h-26 Z" fill="none" stroke="${d.accent}" stroke-width="1.1" stroke-dasharray="2 1.4"/><path d="M86 96 h26 l-13 6 Z M128 96 h26 l-13 6 Z" fill="#000" opacity=".18"/><path d="M78 150 H162" stroke="${d.accent}" stroke-width="1.1" stroke-dasharray="2 1.4"/><path d="M78 160 H162" stroke="#000" stroke-opacity=".25" stroke-width="1"/>` : ''}
${d.kind === 'tee' && dark ? `<g opacity=".82"><circle cx="120" cy="104" r="26" fill="none" stroke="${d.accent}" stroke-width="5"/><circle cx="120" cy="104" r="26" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="5" stroke-dasharray="1 2.4"/></g>` : ''}
${d.kind === 'tee' && !dark ? `<rect x="136" y="70" width="16" height="18" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1"/><path d="M137 72 h14" stroke="#000" stroke-opacity=".2" stroke-dasharray="1.5 1.2"/>` : ''}
</svg>`;
}

// 本物っぽい木のハンガー（銀のフック）
export const HANGER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><defs>
<linearGradient id="hw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c79a62"/><stop offset=".45" stop-color="#9c6b37"/><stop offset="1" stop-color="#5e3b1a"/></linearGradient>
<linearGradient id="hm" x1="0" x2="1"><stop offset="0" stop-color="#6d6f73"/><stop offset=".4" stop-color="#f4f5f7"/><stop offset="1" stop-color="#7c7f84"/></linearGradient>
<filter id="hs"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
<path d="M100 4 c-10 0 -12 14 -2 17 l2 1 v9" fill="none" stroke="url(#hm)" stroke-width="3.6" stroke-linecap="round"/>
<path d="M14 66 Q60 40 96 30 Q100 29 104 30 Q140 40 186 66 Q190 70 184 71 Q140 52 100 44 Q60 52 16 71 Q10 70 14 66 Z" fill="#000" opacity=".25" transform="translate(2 4)" filter="url(#hs)"/>
<path d="M14 66 Q60 40 96 30 Q100 29 104 30 Q140 40 186 66 Q190 70 184 71 Q140 52 100 44 Q60 52 16 71 Q10 70 14 66 Z" fill="url(#hw)"/>
<path d="M20 64 Q60 42 100 33 Q140 42 180 64" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/>
<circle cx="100" cy="36" r="3.2" fill="url(#hm)"/>
</svg>`;
export const HANGER_URL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(HANGER);
