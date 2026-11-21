// 小物の見本の絵（SVG・背景なし）：キャップ・ニット帽・靴下・サングラス・ステッカー・キーホルダー・トート・ピン・ワッペン・バンダナ。
// 立体に見えるよう、面ごとのグラデーション・ハイライト・落ち影をつける。すべてオリジナルの図柄。
export type AccKind = 'cap' | 'beanie' | 'socks' | 'shades' | 'sticker' | 'keychain' | 'tote' | 'pin' | 'patch' | 'bandana';
export type Acc = { kind: AccKind; color: string; accent: string; ink?: string; text?: string; v?: number };

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16); const f = (c: number) => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
};
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const SANS = "'Arial Black','Helvetica Neue',Arial,sans-serif", SER = "'Times New Roman',Georgia,serif";

export function accArt(a: Acc, seed = 1): string {
  const id = `a${seed}`, c = a.color, ac = a.accent, ink = a.ink || (lum(c) < 0.45 ? '#f1ece2' : '#141414');
  const lo = shade(c, -0.35), hi = shade(c, 0.28), v = a.v || 0;
  const grad = `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
<linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${lo}"/><stop offset=".45" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
<radialGradient id="${id}r" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${hi}"/><stop offset=".6" stop-color="${c}"/><stop offset="1" stop-color="${lo}"/></radialGradient>
<filter id="${id}s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="${id}n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .22 -.04"/><feComposite in2="SourceGraphic" operator="in"/></filter>`;
  const word = a.text || 'GALLERY CRYPTO';
  let body = '';
  switch (a.kind) {
    case 'cap': {
      const crown = 'M58 128 Q60 64 120 58 Q180 64 182 128 Z';
      body = `<ellipse cx="124" cy="176" rx="96" ry="14" fill="#000" opacity=".25" filter="url(#${id}s)"/>
<path d="M50 130 Q120 116 196 134 Q214 150 200 162 Q130 150 52 146 Q40 140 50 130 Z" fill="${v % 2 ? ac : lo}"/>
<path d="${crown}" fill="url(#${id}r)"/><path d="${crown}" fill="#fff" filter="url(#${id}n)"/>
<path d="M120 58 Q118 92 120 128 M86 66 Q78 96 76 128 M154 66 Q162 96 164 128" stroke="${lo}" stroke-width="1.4" fill="none"/>
<circle cx="120" cy="58" r="4.5" fill="${lo}"/>
<path d="M58 128 Q120 120 182 128" stroke="${lo}" stroke-width="3" fill="none"/>
<text x="120" y="104" font-family="${v % 3 === 0 ? SER : SANS}" font-style="${v % 3 === 0 ? 'italic' : 'normal'}" font-weight="700" font-size="15" fill="${ac}" text-anchor="middle" textLength="${v % 3 === 0 ? 70 : 76}" lengthAdjust="spacingAndGlyphs">${v % 3 === 0 ? 'Gallery Crypto' : v % 3 === 1 ? 'GC' : 'ONE/ONE'}</text>`;
      break;
    }
    case 'beanie':
      body = `<ellipse cx="120" cy="184" rx="78" ry="12" fill="#000" opacity=".25" filter="url(#${id}s)"/>
<path d="M54 140 Q52 52 120 46 Q188 52 186 140 Z" fill="url(#${id}r)"/>
${Array.from({ length: 13 }, (_, i) => `<path d="M${62 + i * 10} 138 Q${64 + i * 10} 90 ${80 + i * 6} 56" stroke="${lo}" stroke-width="2.2" fill="none" opacity=".6"/>`).join('')}
<rect x="50" y="128" width="140" height="44" rx="10" fill="url(#${id}g)"/>
${Array.from({ length: 22 }, (_, i) => `<rect x="${54 + i * 6.2}" y="131" width="2.6" height="38" fill="${lo}" opacity=".45"/>`).join('')}
<rect x="96" y="138" width="48" height="22" rx="2" fill="${ac}"/><text x="120" y="153" font-family="${SANS}" font-size="9" fill="${ink === '#141414' ? '#f1ece2' : '#141414'}" text-anchor="middle" textLength="40" lengthAdjust="spacingAndGlyphs">GC</text>
${v % 2 ? `<circle cx="120" cy="40" r="16" fill="url(#${id}r)"/><circle cx="120" cy="40" r="16" fill="#fff" filter="url(#${id}n)"/>` : ''}`;
      break;
    case 'socks':
      body = [0, 1].map((k) => { const x = 70 + k * 56; return `<g transform="translate(${x} 0) rotate(${k ? 6 : -6} 30 100)"><path d="M10 20 H58 V140 Q58 176 30 186 Q2 192 -14 176 Q-22 164 -8 156 L10 146 Z" fill="url(#${id}h)"/>
<rect x="10" y="20" width="48" height="26" fill="${lo}"/>${Array.from({ length: 8 }, (_, i) => `<rect x="${12 + i * 6}" y="22" width="2.4" height="22" fill="${shade(c, -0.5)}" opacity=".5"/>`).join('')}
<rect x="10" y="54" width="48" height="6" fill="${ac}"/><rect x="10" y="64" width="48" height="6" fill="${ac}"/>
<text transform="translate(40 100) rotate(90)" font-family="${SANS}" font-size="8" fill="${ink}" text-anchor="middle" textLength="54" lengthAdjust="spacingAndGlyphs">${k ? 'CRYPTO' : 'GALLERY'}</text></g>`; }).join('') + `<ellipse cx="124" cy="198" rx="80" ry="8" fill="#000" opacity=".2" filter="url(#${id}s)"/>`;
      break;
    case 'shades':
      body = `<ellipse cx="120" cy="168" rx="92" ry="9" fill="#000" opacity=".25" filter="url(#${id}s)"/>
<path d="M24 92 Q22 80 34 78 L206 78 Q218 80 216 92" stroke="${c}" stroke-width="6" fill="none"/>
${[0, 1].map((k) => { const x = k ? 128 : 30; return `<path d="M${x} 82 H${x + 82} Q${x + 84} 130 ${x + 56} 138 Q${x + 18} 142 ${x + 6} 120 Q${x - 2} 100 ${x} 82 Z" fill="url(#${id}l)" stroke="${c}" stroke-width="5"/><path d="M${x + 12} 90 Q${x + 30} 88 ${x + 26} 110" stroke="#fff" stroke-width="4" opacity=".45" fill="none"/>`; }).join('')}
<path d="M112 90 Q120 84 128 90" stroke="${c}" stroke-width="5" fill="none"/>
<defs><linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ac}"/><stop offset="1" stop-color="#050505"/></linearGradient></defs>`;
      break;
    case 'sticker': {
      // ステッカー：白いふちどり＋少しめくれた角。図柄は4種類
      const motif = [
        `<text x="120" y="112" font-family="${SANS}" font-size="22" fill="${ac}" text-anchor="middle" textLength="140" lengthAdjust="spacingAndGlyphs">GALLERY</text><text x="120" y="138" font-family="${SANS}" font-size="22" fill="${ink}" text-anchor="middle" textLength="140" lengthAdjust="spacingAndGlyphs">CRYPTO</text>`,
        `<g transform="translate(120 112)" fill="none" stroke="${ink}" stroke-width="4"><circle r="40" stroke="${ac}" stroke-dasharray="6 4"/><path d="M-16 -26 H16 L0 0 L16 26 H-16 L0 0 Z" fill="${ac}" fill-opacity=".5"/></g>`,
        `<text x="120" y="108" font-family="${SER}" font-style="italic" font-weight="700" font-size="30" fill="${ink}" text-anchor="middle" textLength="150" lengthAdjust="spacingAndGlyphs">On Record</text><text x="120" y="136" font-family="${SANS}" font-size="10" fill="${ac}" text-anchor="middle" textLength="120" lengthAdjust="spacingAndGlyphs">ONE OF ONE · TOKYO</text>`,
        `<text x="120" y="130" font-family="${SANS}" font-size="44" fill="${ac}" text-anchor="middle" textLength="120" lengthAdjust="spacingAndGlyphs">${word.slice(0, 4) === 'GALL' ? 'GC' : word.slice(0, 6)}</text><text x="120" y="152" font-family="${SANS}" font-size="9" fill="${ink}" text-anchor="middle" textLength="90" lengthAdjust="spacingAndGlyphs">VERIFIED · No. 0${v + 1}</text>`,
      ][v % 4];
      const shape = v % 2 ? `<circle cx="120" cy="114" r="70"/>` : `<rect x="40" y="62" width="160" height="104" rx="${v % 4 === 0 ? 8 : 52}"/>`;
      body = `<g transform="rotate(${v % 2 ? 0 : -4} 120 114)"><g fill="#000" opacity=".25" filter="url(#${id}s)" transform="translate(4 6)">${shape}</g>
<g fill="#fbfaf6" stroke="#fbfaf6" stroke-width="12" stroke-linejoin="round">${shape}</g>
<g fill="${c}">${shape}</g>${motif}
<path d="M${v % 2 ? '160 160 l20 -6 l-6 20 Z' : '186 152 l14 0 l-14 14 Z'}" fill="#e8e5dd" stroke="#cfcac0"/></g>`;
      break;
    }
    case 'keychain':
      body = `<ellipse cx="124" cy="196" rx="44" ry="7" fill="#000" opacity=".25" filter="url(#${id}s)"/>
<circle cx="120" cy="40" r="20" fill="none" stroke="url(#${id}m)" stroke-width="5"/>
<path d="M120 60 v14" stroke="url(#${id}m)" stroke-width="5"/>
<rect x="84" y="74" width="72" height="${v % 2 ? 72 : 110}" rx="${v % 2 ? 36 : 10}" fill="url(#${id}g)"/>
<rect x="84" y="74" width="72" height="${v % 2 ? 72 : 110}" rx="${v % 2 ? 36 : 10}" fill="#fff" opacity=".08"/>
<text x="120" y="${v % 2 ? 116 : 132}" font-family="${SANS}" font-size="${v % 2 ? 22 : 14}" fill="${ac}" text-anchor="middle" textLength="${v % 2 ? 40 : 56}" lengthAdjust="spacingAndGlyphs">${v % 2 ? 'GC' : 'ONE/ONE'}</text>
${v % 2 ? '' : `<text x="120" y="150" font-family="${SANS}" font-size="7" fill="${ink}" text-anchor="middle" textLength="52" lengthAdjust="spacingAndGlyphs">NFC · RECORD</text>`}
<defs><linearGradient id="${id}m" x1="0" x2="1"><stop offset="0" stop-color="#7c7f84"/><stop offset=".45" stop-color="#f6f7f8"/><stop offset="1" stop-color="#6d6f73"/></linearGradient></defs>`;
      break;
    case 'tote':
      body = `<ellipse cx="124" cy="204" rx="84" ry="8" fill="#000" opacity=".25" filter="url(#${id}s)"/>
<path d="M86 70 Q86 22 120 22 Q154 22 154 70" stroke="${lo}" stroke-width="9" fill="none"/>
<path d="M50 66 H190 L196 200 H44 Z" fill="url(#${id}g)"/><path d="M50 66 H190 L196 200 H44 Z" fill="#fff" filter="url(#${id}n)"/>
<path d="M50 66 H190" stroke="${lo}" stroke-width="3"/>
${v % 2 ? `<text x="120" y="130" font-family="${SER}" font-style="italic" font-weight="700" font-size="24" fill="${ink}" text-anchor="middle" textLength="118" lengthAdjust="spacingAndGlyphs">Gallery Crypto</text><text x="120" y="152" font-family="${SANS}" font-size="8" fill="${ac}" text-anchor="middle" textLength="100" lengthAdjust="spacingAndGlyphs">REAL THINGS · ON RECORD</text>` : `<text x="120" y="122" font-family="${SANS}" font-size="20" fill="${ink}" text-anchor="middle" textLength="110" lengthAdjust="spacingAndGlyphs">GALLERY</text><text x="120" y="146" font-family="${SANS}" font-size="20" fill="${ac}" text-anchor="middle" textLength="110" lengthAdjust="spacingAndGlyphs">CRYPTO</text>`}`;
      break;
    case 'pin':
      body = `<ellipse cx="124" cy="176" rx="56" ry="8" fill="#000" opacity=".25" filter="url(#${id}s)"/>
<circle cx="120" cy="110" r="58" fill="url(#${id}m2)"/><circle cx="120" cy="110" r="50" fill="${c}"/>
<g transform="translate(120 110)" fill="none" stroke="${ac}" stroke-width="4"><path d="M-14 -22 H14 L0 0 L14 22 H-14 L0 0 Z" fill="${ac}" fill-opacity=".35"/><path d="M-18 -24 H18 M-18 24 H18"/></g>
<path d="M82 82 Q100 62 128 60" stroke="#fff" stroke-width="5" opacity=".35" fill="none"/>
<defs><linearGradient id="${id}m2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c8"/><stop offset=".5" stop-color="#c9a45c"/><stop offset="1" stop-color="#7a5a22"/></linearGradient></defs>`;
      break;
    case 'patch':
      body = `<ellipse cx="124" cy="184" rx="80" ry="9" fill="#000" opacity=".22" filter="url(#${id}s)"/>
<rect x="42" y="56" width="156" height="112" rx="16" fill="${ac}"/><rect x="48" y="62" width="144" height="100" rx="12" fill="url(#${id}g)"/>
<rect x="48" y="62" width="144" height="100" rx="12" fill="#fff" filter="url(#${id}n)"/>
<rect x="52" y="66" width="136" height="92" rx="10" fill="none" stroke="${ac}" stroke-width="1.6" stroke-dasharray="3 2"/>
<text x="120" y="108" font-family="${SANS}" font-size="20" fill="${ink}" text-anchor="middle" textLength="110" lengthAdjust="spacingAndGlyphs">ON RECORD</text><text x="120" y="132" font-family="${SER}" font-style="italic" font-size="13" fill="${ac}" text-anchor="middle" textLength="86" lengthAdjust="spacingAndGlyphs">Gallery Crypto</text>`;
      break;
    case 'bandana':
      body = `<ellipse cx="124" cy="196" rx="96" ry="9" fill="#000" opacity=".22" filter="url(#${id}s)"/>
<path d="M30 40 H210 L120 196 Z" fill="url(#${id}g)"/><path d="M30 40 H210 L120 196 Z" fill="#fff" filter="url(#${id}n)"/>
<path d="M42 48 H198 L120 182 Z" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="4 3"/>
${Array.from({ length: 14 }, (_, i) => { const x = 66 + (i % 5) * 27 + (Math.floor(i / 5) % 2) * 13, y = 64 + Math.floor(i / 5) * 26; return y < 190 - Math.abs(x - 120) * 1.7 ? `<g transform="translate(${x} ${y})" fill="${ink}" opacity=".85"><circle r="3"/>${[0, 1, 2, 3, 4, 5].map((k) => `<ellipse cx="${(Math.cos(k * 1.047) * 6).toFixed(1)}" cy="${(Math.sin(k * 1.047) * 6).toFixed(1)}" rx="3" ry="1.4" transform="rotate(${k * 60} ${(Math.cos(k * 1.047) * 6).toFixed(1)} ${(Math.sin(k * 1.047) * 6).toFixed(1)})"/>`).join('')}</g>` : ''; }).join('')}
<text x="120" y="60" font-family="${SANS}" font-size="7" fill="${ink}" text-anchor="middle" textLength="80" lengthAdjust="spacingAndGlyphs">GALLERY CRYPTO</text>`;
      break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="550" viewBox="0 0 240 220"><defs>${grad}</defs>${body}</svg>`;
}
