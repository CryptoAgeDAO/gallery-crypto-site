// レール用の「写真っぽい」服の絵（SVG）。布の陰影・ハンガーから落ちるドレープ・織りの粒・縫い目・リブを重ねる。
// 背景は透明（切り抜き）。iPhone でも描けるよう、SVG の中だけで完結させる。
import type { Project } from '@/lib/hub';

type D = NonNullable<Project['draw']>;
export const BODY: Record<D['kind'], string> = {
  // 直線だけでなく、肩の丸み・脇のふくらみ・裾のゆるいカーブをつける
  tee: 'M70 40 Q86 32 100 28 Q120 47 140 28 Q154 32 170 40 L199 77 Q190 86 176 92 L165 80 Q162 140 165 196 Q120 200 75 196 Q78 140 75 80 L64 92 Q50 86 41 77 Z',
  sweat: 'M72 40 Q88 32 102 28 Q120 43 138 28 Q152 32 168 40 Q192 92 206 148 Q197 156 186 158 Q172 118 163 84 Q160 140 162 196 Q120 200 78 196 Q80 140 77 84 Q68 118 54 158 Q43 156 34 148 Q48 92 72 40 Z',
  jacket: 'M72 38 Q88 30 104 26 L120 46 L136 26 Q152 30 168 38 Q192 92 204 150 Q195 157 184 158 Q172 120 163 86 Q161 140 162 198 Q120 201 78 198 Q79 140 77 86 Q68 120 56 158 Q45 157 36 150 Q48 92 72 38 Z',
  shirt: 'M74 38 Q90 30 104 26 L120 40 L136 26 Q150 30 166 38 Q188 90 200 146 Q191 153 180 154 Q170 118 161 86 Q159 140 160 198 Q120 202 80 198 Q81 140 79 86 Q70 118 60 154 Q49 153 40 146 Q52 90 74 38 Z',
  denim: 'M72 40 Q88 31 104 26 L120 44 L136 26 Q152 31 168 40 Q190 92 202 148 Q193 155 182 156 Q171 120 163 86 Q162 130 162 178 Q120 181 78 178 Q78 130 77 86 Q69 120 58 156 Q47 155 38 148 Q50 92 72 40 Z',
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

// 布の起伏を「高さの地図」として描き、SVG の光源フィルター（拡散光＋鏡面光）で照らす。
// 平らな色に影を描き足すのではなく、膨らみ・ドレープ・縫い目のくぼみから陰影が生まれるので写真に近づく。
export function realGarment(d: D, seed = 1): string {
  const p = BODY[d.kind], b = BOX[d.kind];
  const dark = lum(d.color) < 0.35;
  const id = `g${seed}`;
  let s0 = seed * 9301 + 49297; const rnd = () => { s0 = (s0 * 9301 + 49297) % 233280; return s0 / 233280; };
  const j = (v: number, a: number) => +(v + (rnd() - 0.5) * a).toFixed(1);
  const cx = 120, sl = b.sl;
  const front = d.kind === 'jacket' || d.kind === 'denim' || d.kind === 'shirt';
  const neck = d.kind === 'tee' || d.kind === 'sweat';
  // ドレープ：肩（ハンガーの先）から裾へ落ちる谷と山。左右で少しずつ違う
  const valleys = [
    `M${j(b.l + 12, 4)} 44 C${j(b.l + 4, 6)} 90 ${j(b.l + 16, 6)} 140 ${j(b.l + 10, 4)} ${b.b}`,
    `M${j(b.r - 12, 4)} 44 C${j(b.r - 2, 6)} 96 ${j(b.r - 18, 6)} 146 ${j(b.r - 12, 4)} ${b.b}`,
    `M${j(cx - 22, 6)} 60 C${j(cx - 30, 8)} 110 ${j(cx - 18, 8)} 160 ${j(cx - 24, 6)} ${b.b}`,
    `M${j(cx + 24, 6)} 62 C${j(cx + 34, 8)} 116 ${j(cx + 20, 8)} 160 ${j(cx + 26, 6)} ${b.b}`,
    `M${j(b.l + 30, 4)} ${b.b - 30} Q${j(b.l + 34, 6)} ${b.b - 12} ${j(b.l + 30, 4)} ${b.b}`,
  ];
  const ridges = [
    `M${j(cx - 6, 4)} 54 C${j(cx - 12, 6)} 110 ${j(cx - 2, 6)} 150 ${j(cx - 8, 4)} ${b.b}`,
    `M${j(b.l + 24, 4)} 56 C${j(b.l + 20, 6)} 110 ${j(b.l + 30, 6)} 150 ${j(b.l + 24, 4)} ${b.b}`,
    `M${j(b.r - 26, 4)} 58 C${j(b.r - 20, 6)} 112 ${j(b.r - 32, 6)} 152 ${j(b.r - 26, 4)} ${b.b}`,
  ];
  // 袖のしわ（袖口に向かって寄る）
  const sleeveCreases = [0, 1].map((side) => {
    const m = (x: number) => (side ? 240 - x : x);
    const sx = (sl[0] + b.l) / 2, sy = (sl[1] + 60) / 2;
    return `M${m(b.l - 4)} ${j(70, 6)} Q${m(sx)} ${j(sy - 8, 8)} ${m(sl[2] + 4)} ${j(sl[3] - 10, 6)} M${m(b.l - 2)} ${j(90, 6)} Q${m(sx + 6)} ${j(sy + 10, 8)} ${m(sl[0] + 8)} ${j(sl[1] - 6, 6)}`;
  });
  const weave = d.kind === 'denim' ? '1.9 0.42' : d.kind === 'sweat' ? '0.85' : d.kind === 'shirt' ? '1.4' : '1.15';
  const sheen = dark ? 0.18 : 0.12;
  // 生地の柄
  const plaid = d.kind === 'shirt'
    ? Array.from({ length: 16 }, (_, i) => `<rect x="${18 + i * 13}" y="10" width="${i % 3 === 0 ? 5 : 2.4}" height="210" fill="${i % 3 === 0 ? d.accent : '#111'}" opacity="${i % 3 === 0 ? 0.5 : 0.28}"/>`).join('') +
      Array.from({ length: 15 }, (_, i) => `<rect x="10" y="${24 + i * 13}" width="220" height="${i % 3 === 0 ? 5 : 2.4}" fill="${i % 3 === 0 ? d.accent : '#111'}" opacity="${i % 3 === 0 ? 0.44 : 0.24}"/>`).join('')
    : '';
  const twill = d.kind === 'denim' ? `<path d="${Array.from({ length: 90 }, (_, i) => `M${-40 + i * 3.4} 0 l60 220`).join(' ')}" stroke="#fff" stroke-opacity=".07" stroke-width="1.1"/>` : '';
  const heightMap = `
<rect x="-10" y="-10" width="260" height="240" fill="#000"/>
<path d="${p}" fill="#8a8a8a"/>
${valleys.map((v) => `<path d="${v}" fill="none" stroke="#000" stroke-opacity=".75" stroke-width="${j(8, 3)}"/>`).join('')}
${ridges.map((v) => `<path d="${v}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="${j(9, 3)}"/>`).join('')}
${sleeveCreases.map((v) => `<path d="${v}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="4"/>`).join('')}
<path d="M${b.l} 84 Q${b.l + 4} 62 ${b.l - 2} 42 M${b.r} 84 Q${b.r - 4} 62 ${b.r + 2} 42" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="2.4"/>
<path d="M${sl[0]} ${sl[1]} L${sl[2]} ${sl[3]} M${240 - sl[0]} ${sl[1]} L${240 - sl[2]} ${sl[3]}" stroke="#fff" stroke-opacity=".55" stroke-width="7"/>
${neck ? `<path d="M100 30 Q120 ${d.kind === 'sweat' ? 46 : 48} 140 30" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>` : ''}
${front ? `<path d="M104 26 L120 ${d.kind === 'shirt' ? 40 : 46} L136 26" fill="none" stroke="#fff" stroke-width="6"/><path d="M120 ${d.kind === 'shirt' ? 42 : 48} V${b.b}" stroke="#000" stroke-width="2.4"/>` : ''}
${d.kind === 'sweat' ? `<rect x="${b.l}" y="${b.b - 12}" width="${b.r - b.l}" height="12" fill="#b0b0b0"/>` : ''}
${d.kind === 'denim' ? `<path d="M86 96 h26 v18 h-26 Z M128 96 h26 v18 h-26 Z" fill="#a5a5a5" stroke="#000" stroke-opacity=".6" stroke-width="1.6"/><path d="M78 150 H162" stroke="#000" stroke-opacity=".6" stroke-width="2"/>` : ''}
${d.kind === 'tee' && dark ? `<circle cx="120" cy="104" r="26" fill="none" stroke="#b5b5b5" stroke-width="5"/>` : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1320" viewBox="0 0 240 220">
<defs>
<filter id="${id}r" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.8"/><feComponentTransfer><feFuncA type="linear" slope="6" intercept="-2.6"/></feComponentTransfer></filter>
<mask id="${id}c" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="220"><path d="${p}" fill="#fff" filter="url(#${id}r)"/></mask>
<filter id="${id}L" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="h0"/>
  <feGaussianBlur in="h0" stdDeviation="2.2" result="h1"/>
  <feTurbulence type="fractalNoise" baseFrequency="${weave}" numOctaves="2" seed="${seed}" result="nz"/>
  <feColorMatrix in="nz" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.035 0.035 0.035 0 -0.035" result="na"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="${seed + 7}" result="lz"/>
  <feColorMatrix in="lz" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.07 0.07 0.07 0 -0.08" result="la"/>
  <feComposite in="h1" in2="na" operator="arithmetic" k2="1" k3="1" result="h2"/>
  <feComposite in="h2" in2="la" operator="arithmetic" k2="1" k3="1" result="h"/>
  <feDiffuseLighting in="h" surfaceScale="${d.kind === 'sweat' ? 6 : 5}" diffuseConstant="1.16" lighting-color="#fff" result="dif"><feDistantLight azimuth="235" elevation="52"/></feDiffuseLighting>
  <feComposite in="dif" in2="SourceAlpha" operator="in"/>
</filter>
<filter id="${id}S" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="h0"/>
  <feGaussianBlur in="h0" stdDeviation="3.2" result="h"/>
  <feSpecularLighting in="h" surfaceScale="7" specularConstant="${sheen}" specularExponent="${d.kind === 'denim' ? 9 : 14}" lighting-color="#fff6ea" result="sp"><feDistantLight azimuth="235" elevation="48"/></feSpecularLighting>
  <feComposite in="sp" in2="SourceAlpha" operator="in"/>
</filter>
<filter id="${id}F" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="${seed + 3}"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${dark ? 0.35 : 0.18} ${dark ? -0.08 : -0.06}"/></filter>
<filter id="${id}s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4.5"/></filter>
<filter id="${id}t" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation=".25"/></filter>
</defs>
<path d="${p}" transform="translate(4 7)" fill="#000" opacity=".22" filter="url(#${id}s)"/>
<g mask="url(#${id}c)">
  <rect width="240" height="220" fill="${d.color}"/>
  ${plaid}${twill}
  <rect width="240" height="220" filter="url(#${id}F)"/>
  ${d.kind === 'sweat' ? `<rect x="${b.l}" y="${b.b - 12}" width="${b.r - b.l}" height="12" fill="${d.accent}" opacity=".5"/>` : ''}
  ${d.kind === 'tee' && dark ? `<circle cx="120" cy="104" r="26" fill="none" stroke="${d.accent}" stroke-width="5" opacity=".85"/>` : ''}
  <g style="mix-blend-mode:multiply">
    <g filter="url(#${id}L)">${heightMap}</g>
  </g>
  <g style="mix-blend-mode:screen">
    <g filter="url(#${id}S)">${heightMap}</g>
  </g>
</g>
<path d="${p}" fill="none" stroke="#000" stroke-opacity="${dark ? 0.5 : 0.22}" stroke-width=".6"/>
<g filter="url(#${id}t)">
<path d="M${b.l + 3} ${b.b - 4} H${b.r - 3}" stroke="${dark ? '#fff' : '#000'}" stroke-opacity=".3" stroke-width=".7" stroke-dasharray="1.8 1.3"/>
<path d="M${b.l} 84 Q${b.l + 4} 62 ${b.l - 2} 42 M${b.r} 84 Q${b.r - 4} 62 ${b.r + 2} 42" fill="none" stroke="${dark ? '#fff' : '#000'}" stroke-opacity=".22" stroke-width=".6" stroke-dasharray="1.6 1.3"/>
${front ? `<path d="M117.6 ${d.kind === 'shirt' ? 42 : 48} V${b.b - 1}" stroke="${d.accent}" stroke-width=".8" stroke-dasharray="1.8 1.3" opacity=".9"/>${Array.from({ length: d.kind === 'denim' ? 5 : 6 }, (_, i) => `<circle cx="122.6" cy="${60 + i * ((b.b - 70) / (d.kind === 'denim' ? 5 : 6))}" r="2.1" fill="${d.kind === 'denim' ? '#b88d45' : '#ece7da'}" stroke="#000" stroke-opacity=".45" stroke-width=".5"/><circle cx="122.1" cy="${59.5 + i * ((b.b - 70) / (d.kind === 'denim' ? 5 : 6))}" r=".7" fill="#fff" opacity=".6"/>`).join('')}` : ''}
${d.kind === 'denim' ? `<path d="M86 96 h26 v18 h-26 Z M128 96 h26 v18 h-26 Z M78 150 H162" fill="none" stroke="${d.accent}" stroke-width=".8" stroke-dasharray="1.8 1.2"/>` : ''}
${neck ? `<path d="M103 33 Q120 50 137 33" fill="none" stroke="${dark ? '#fff' : '#000'}" stroke-opacity=".25" stroke-width=".6" stroke-dasharray="1.6 1.2"/>` : ''}
${d.kind === 'tee' && !dark ? `<rect x="136" y="70" width="16" height="18" fill="none" stroke="#000" stroke-opacity=".22" stroke-width=".7" stroke-dasharray="1.6 1.2"/>` : ''}
</g>
</svg>`;
}
