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
  tank: 'M90 30 Q98 27 104 29 Q120 56 136 29 Q142 27 150 30 L152 58 Q162 72 164 84 Q162 140 165 196 Q120 200 75 196 Q78 140 76 84 Q78 72 88 58 Z',
  ls: 'M72 40 Q88 32 102 28 Q120 43 138 28 Q152 32 168 40 Q192 92 204 150 Q195 157 184 158 Q172 118 163 84 Q160 140 162 196 Q120 200 78 196 Q80 140 77 84 Q68 118 56 158 Q45 157 36 150 Q48 92 72 40 Z',
  hoodie: 'M72 40 Q84 32 96 28 Q98 10 120 8 Q142 10 144 28 Q156 32 168 40 Q192 92 206 148 Q197 156 186 158 Q172 118 163 84 Q160 140 162 196 Q120 200 78 196 Q80 140 77 84 Q68 118 54 158 Q43 156 34 148 Q48 92 72 40 Z',
  vest: 'M82 38 Q94 30 104 26 L120 46 L136 26 Q146 30 158 38 L160 68 Q164 78 163 86 Q161 140 162 198 Q120 201 78 198 Q79 140 77 86 Q76 78 80 68 Z',
  pants: 'M84 28 L156 28 L158 58 Q162 120 176 210 L127 212 Q124 136 120 86 Q116 136 113 212 L64 210 Q78 120 82 58 Z',
  sweatpants: 'M82 28 L158 28 L160 60 Q162 132 154 204 L126 206 Q124 132 120 88 Q116 132 114 206 L86 204 Q78 132 80 60 Z',
  shorts: 'M80 30 L160 30 L164 60 L174 128 L127 134 L120 94 L113 134 L66 128 L76 60 Z',
};
// 身頃の左右の端・裾の高さ（陰影と縫い目の位置）
const BOX: Record<D['kind'], { l: number; r: number; b: number; sl: [number, number, number, number] }> = {
  tee: { l: 76, r: 164, b: 196, sl: [40, 78, 64, 92] },
  sweat: { l: 78, r: 162, b: 196, sl: [34, 150, 54, 158] },
  jacket: { l: 78, r: 162, b: 198, sl: [36, 150, 56, 158] },
  shirt: { l: 80, r: 160, b: 198, sl: [40, 146, 60, 154] },
  denim: { l: 78, r: 162, b: 178, sl: [38, 148, 58, 156] },
  tank: { l: 76, r: 164, b: 196, sl: [88, 60, 90, 66] },
  ls: { l: 78, r: 162, b: 196, sl: [36, 150, 56, 158] },
  hoodie: { l: 78, r: 162, b: 196, sl: [34, 150, 54, 158] },
  vest: { l: 78, r: 162, b: 198, sl: [80, 70, 80, 72] },
  pants: { l: 84, r: 156, b: 210, sl: [96, 80, 100, 200] },
  sweatpants: { l: 82, r: 158, b: 205, sl: [96, 80, 100, 200] },
  shorts: { l: 76, r: 164, b: 132, sl: [90, 70, 92, 120] },
};

// オリジナルのプリント（Gallery Crypto の見本ライン）：文字・胸の小さな文字・ペンキの飛び散り・スタンプ・紋章・背中の大きな文字・脚の横の文字
function linePrint(d: D, side: 'front' | 'back', id: string): string {
  if (!d.print) return '';
  const dark = lum(d.color) < 0.4, ink = d.ink || (dark ? '#efe9dc' : '#151515'), acc = d.accent;
  const SER = "'Times New Roman',Georgia,serif", SANS = "'Arial Black','Helvetica Neue',Arial,sans-serif";
  const bottoms = d.kind === 'pants' || d.kind === 'sweatpants' || d.kind === 'shorts';
  const cy = bottoms ? 70 : 96;
  let sd = id.length * 31 + d.color.charCodeAt(2) * 7; const rr = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const splat = (n: number) => Array.from({ length: n }, () => {
    const x = 70 + rr() * 100, y = 30 + rr() * (bottoms ? 170 : 160), r = 0.6 + rr() * rr() * 5, c = [acc, ink, '#d23a2a', '#2a5bd2', '#e8c33a', '#2f9e5a'][Math.floor(rr() * 6)];
    const drip = rr() < 0.25 ? `<path d="M${x.toFixed(1)} ${y.toFixed(1)} v${(4 + rr() * 14).toFixed(1)}" stroke="${c}" stroke-width="${(r * 0.5).toFixed(2)}" stroke-linecap="round"/>` : '';
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${c}"/>${drip}`;
  }).join('');
  let g = '';
  const p = d.print;
  if (side === 'back') {
    if (p === 'back' || p === 'word') g = `<text x="120" y="${cy}" font-family="${SANS}" font-size="13" fill="${ink}" text-anchor="middle" textLength="74" lengthAdjust="spacingAndGlyphs">ONE OF ONE</text><text x="120" y="${cy + 10}" font-family="${SER}" font-style="italic" font-size="7" fill="${acc}" text-anchor="middle" textLength="44" lengthAdjust="spacingAndGlyphs">Gallery Crypto</text>`;
    else if (p === 'splat') g = splat(60);
  } else if (p === 'word') g = `<text x="120" y="${cy - 4}" font-family="${SANS}" font-size="12" fill="${ink}" text-anchor="middle" textLength="${bottoms ? 60 : 78}" lengthAdjust="spacingAndGlyphs">GALLERY</text><text x="120" y="${cy + 9}" font-family="${SANS}" font-size="12" fill="${acc}" text-anchor="middle" textLength="${bottoms ? 60 : 78}" lengthAdjust="spacingAndGlyphs">CRYPTO</text>`;
  else if (p === 'chest') g = `<text x="${bottoms ? 142 : 140}" y="${bottoms ? 50 : 72}" font-family="${SER}" font-style="italic" font-weight="700" font-size="7" fill="${ink}" text-anchor="middle" textLength="32" lengthAdjust="spacingAndGlyphs">Gallery Crypto</text>`;
  else if (p === 'splat') g = splat(bottoms ? 110 : 80);
  else if (p === 'stamp') g = `<g transform="translate(120 ${cy}) rotate(-8)"><rect x="-28" y="-15" width="56" height="30" rx="2" fill="none" stroke="${acc}" stroke-width="2"/><text y="-2" font-family="${SANS}" font-size="7" fill="${acc}" text-anchor="middle" textLength="44" lengthAdjust="spacingAndGlyphs">VERIFIED</text><text y="9" font-family="${SANS}" font-size="5.4" fill="${acc}" text-anchor="middle" textLength="40" lengthAdjust="spacingAndGlyphs">No. ${String(Math.floor(rr() * 900) + 100)}</text></g>`;
  else if (p === 'emblem') g = `<g transform="translate(120 ${cy})" fill="none" stroke="${ink}" stroke-width="1.6"><circle r="17" stroke="${acc}" stroke-dasharray="2 1.5"/><path d="M-7 -11 H7 L0 0 L7 11 H-7 L0 0 Z" fill="${ink}" fill-opacity=".15"/><path d="M-9 -12 H9 M-9 12 H9"/></g><text x="120" y="${cy + 30}" font-family="${SANS}" font-size="6" fill="${ink}" text-anchor="middle" textLength="54" lengthAdjust="spacingAndGlyphs">GALLERY CRYPTO</text>`;
  else if (p === 'side') g = bottoms ? `<text transform="translate(${d.kind === 'shorts' ? 158 : 150} 44) rotate(${d.kind === 'shorts' ? 80 : 84})" font-family="${SANS}" font-size="7" fill="${acc}" textLength="${d.kind === 'shorts' ? 70 : 140}" lengthAdjust="spacingAndGlyphs">GALLERY CRYPTO · ONE OF ONE</text>` : `<path d="M${BOX[d.kind].l + 2} 40 V${BOX[d.kind].b}" stroke="${acc}" stroke-width="3"/>`;
  if (p === 'splat' && side === 'front' && !bottoms) g += `<text x="120" y="${cy + 4}" font-family="${SER}" font-style="italic" font-weight="700" font-size="10" fill="${ink}" text-anchor="middle" textLength="62" lengthAdjust="spacingAndGlyphs">Gallery Crypto</text>`;
  if (!g) return '';
  return `<defs><filter id="${id}lw" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="${id.length}"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -5 2.3"/></filter><mask id="${id}lm" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="220"><rect width="240" height="220" fill="#fff"/><rect width="240" height="220" filter="url(#${id}lw)"/></mask></defs><g mask="url(#${id}lm)" opacity=".93">${g}</g>`;
}

function lum(hex: string) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }

// 布の起伏を「高さの地図」として描き、SVG の光源フィルター（拡散光＋鏡面光）で照らす。
// 平らな色に影を描き足すのではなく、膨らみ・ドレープ・縫い目のくぼみから陰影が生まれるので写真に近づく。
// ツアーマーチのプリント（オリジナル）。胸：アーチの文字・翼のついた砂時計・ツアー名。背中：その一着の来歴をツアー日程のように。
function tourPrint(d: D, side: 'front' | 'back', id: string): string {
  if (!d.tour) return '';
  const dark = lum(d.color) < 0.35, ink = dark ? '#ece5d3' : '#141414', acc = d.accent;
  const SER = "'Times New Roman',Georgia,serif", CON = "'Arial Narrow','Helvetica Neue',Arial,sans-serif";
  // かすれ：プリントに細かい抜けをつくる
  const wear = `<mask id="${id}pw" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="220"><rect width="240" height="220" fill="#fff"/><rect width="240" height="220" filter="url(#${id}pn)"/></mask>
<filter id="${id}pn" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${d.tour === 'c' ? 0.9 : 0.6}" numOctaves="2" seed="${id.length + 5}"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${d.tour === 'c' ? -8 : -6} ${d.tour === 'c' ? 3.9 : 2.5}"/></filter>`;
  let g = '';
  if (side === 'front') {
    if (d.tour === 'b') {
      // 長袖：胸に小さく、袖に縦の文字
      g = `<text x="146" y="66" font-family="${SER}" font-weight="700" font-style="italic" font-size="7.5" fill="${ink}" text-anchor="middle" textLength="34" lengthAdjust="spacingAndGlyphs">Gallery Crypto</text>
<text x="146" y="74" font-family="${CON}" font-weight="700" font-size="3.6" letter-spacing="1.2" fill="${acc}" text-anchor="middle" textLength="30" lengthAdjust="spacingAndGlyphs">ON RECORD TOUR</text>
<text transform="translate(61 64) rotate(66)" font-family="${CON}" font-weight="700" font-size="7" letter-spacing="2.2" fill="${acc}" textLength="52" lengthAdjust="spacingAndGlyphs">ON RECORD</text>
<text transform="translate(178 64) rotate(114) scale(-1 -1)" font-family="${CON}" font-weight="700" font-size="5" letter-spacing="1.6" fill="${ink}" text-anchor="end" textLength="36" lengthAdjust="spacingAndGlyphs">TOKYO 2027</text>`;
    } else {
      g = `<path id="${id}arc" d="M86 76 Q120 52 154 76" fill="none"/>
<text font-family="${SER}" font-weight="700" font-size="11" letter-spacing=".6" fill="${ink}"><textPath href="#${id}arc" startOffset="50%" text-anchor="middle" textLength="70" lengthAdjust="spacingAndGlyphs">Gallery Crypto</textPath></text>
<g transform="translate(120 106)" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round">
  <circle r="20" stroke-dasharray="2.2 1.6" stroke="${acc}"/>
  ${Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return `<path d="M${(Math.cos(a) * 20).toFixed(1)} ${(Math.sin(a) * 20).toFixed(1)} l${(Math.cos(a + 0.5) * 3.5).toFixed(1)} ${(Math.sin(a + 0.5) * 3.5).toFixed(1)}" stroke="${acc}" stroke-width="1"/>`; }).join('')}
  <path d="M-8 -14 H8 L0 0 L8 14 H-8 L0 0 Z" fill="${ink}" fill-opacity=".12"/>
  <path d="M-10 -15 H10 M-10 15 H10"/>
  <path d="M-3 -8 L3 -8 L0 -3 Z M-5 12 Q0 6 5 12 Z" fill="${acc}" stroke="none"/>
  ${[0, 1].map((sd) => { const m = sd ? -1 : 1; return Array.from({ length: 5 }, (_, i) => `<path d="M${m * 11} ${-2 + i * 1.5} Q${m * (22 + i * 3)} ${-14 + i * 4} ${m * (34 - i * 2)} ${-6 + i * 5}" stroke-width="${1.4 - i * 0.18}"/>`).join(''); }).join('')}
</g>
<text x="120" y="148" font-family="${CON}" font-weight="800" font-size="13" letter-spacing="1.4" fill="${ink}" text-anchor="middle" textLength="66" lengthAdjust="spacingAndGlyphs">ON RECORD</text>
<text x="120" y="157" font-family="${CON}" font-weight="700" font-size="4.4" letter-spacing="2.4" fill="${acc}" text-anchor="middle" textLength="66" lengthAdjust="spacingAndGlyphs">WORLD TOUR · ONE OF ONE · 2027</text>`;
    }
  } else {
    // 背中：来歴の「ツアー日程」
    const rows: [string, string][] = [['TOKYO', 'FOUND'], ['TOKYO', 'MEASURED'], ['TOKYO', 'PHOTOGRAPHED'], ['TOKYO', 'RECORDED'], ['TOKYO', 'TAG SEWN IN'], ['ONLINE', 'LISTED'], ['ANYWHERE', 'NEXT OWNER']];
    g = `<text x="120" y="64" font-family="${SER}" font-weight="700" font-size="12" fill="${ink}" text-anchor="middle" textLength="46" lengthAdjust="spacingAndGlyphs">On Record</text>
<text x="120" y="73" font-family="${CON}" font-weight="700" font-size="4.6" letter-spacing="2.6" fill="${acc}" text-anchor="middle" textLength="56" lengthAdjust="spacingAndGlyphs">THE PROVENANCE TOUR</text>
<path d="M92 79 H148" stroke="${acc}" stroke-width=".8"/>
${rows.map(([c, e], i) => `<text x="94" y="${90 + i * 9}" font-family="${CON}" font-weight="700" font-size="4.4" letter-spacing=".4" fill="${ink}" textLength="${(6 + c.length * 2.6).toFixed(1)}" lengthAdjust="spacingAndGlyphs">${String(i + 1).padStart(2, '0')} ${c}</text><text x="146" y="${90 + i * 9}" font-family="${CON}" font-weight="400" font-size="4.4" letter-spacing=".3" fill="${ink}" text-anchor="end" textLength="${(e.length * 2.4).toFixed(1)}" lengthAdjust="spacingAndGlyphs">${e}</text>`).join('')}
<path d="M92 ${90 + rows.length * 9 - 3} H148" stroke="${acc}" stroke-width=".8"/>
<text x="120" y="${90 + rows.length * 9 + 6}" font-family="${CON}" font-weight="700" font-size="3.6" letter-spacing="1.6" fill="${ink}" fill-opacity=".8" text-anchor="middle" textLength="60" lengthAdjust="spacingAndGlyphs">EVERY STOP SIGNED · GALLERY CRYPTO</text>`;
  }
  return `<defs>${wear}</defs><g mask="url(#${id}pw)" opacity="${d.tour === 'c' ? 0.86 : 0.94}">${g}</g>`;
}

export function realGarment(d: D, seed = 1, side: 'front' | 'back' = 'front'): string {
  const p = BODY[d.kind], b = BOX[d.kind];
  const dark = lum(d.color) < 0.35;
  const id = `g${seed}`;
  let s0 = seed * 9301 + 49297; const rnd = () => { s0 = (s0 * 9301 + 49297) % 233280; return s0 / 233280; };
  const j = (v: number, a: number) => +(v + (rnd() - 0.5) * a).toFixed(1);
  const cx = 120, sl = b.sl;
  const front = side === 'front' && (d.kind === 'jacket' || d.kind === 'denim' || d.kind === 'shirt' || d.kind === 'vest');
  const neck = d.kind === 'tee' || d.kind === 'sweat' || d.kind === 'ls';
  const bottoms = d.kind === 'pants' || d.kind === 'sweatpants' || d.kind === 'shorts';
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
  const weave = d.kind === 'denim' || d.kind === 'pants' ? '1.9 0.42' : d.kind === 'sweat' || d.kind === 'hoodie' || d.kind === 'sweatpants' ? '0.85' : d.kind === 'shirt' ? '1.4' : '1.15';
  const sheen = dark ? 0.18 : 0.12;
  // 生地の柄
  const plaid = d.kind === 'shirt'
    ? Array.from({ length: 16 }, (_, i) => `<rect x="${18 + i * 13}" y="10" width="${i % 3 === 0 ? 5 : 2.4}" height="210" fill="${i % 3 === 0 ? d.accent : '#111'}" opacity="${i % 3 === 0 ? 0.5 : 0.28}"/>`).join('') +
      Array.from({ length: 15 }, (_, i) => `<rect x="10" y="${24 + i * 13}" width="220" height="${i % 3 === 0 ? 5 : 2.4}" fill="${i % 3 === 0 ? d.accent : '#111'}" opacity="${i % 3 === 0 ? 0.44 : 0.24}"/>`).join('')
    : '';
  const twill = d.kind === 'denim' || d.kind === 'pants' ? `<path d="${Array.from({ length: 90 }, (_, i) => `M${-40 + i * 3.4} 0 l60 220`).join(' ')}" stroke="#fff" stroke-opacity=".07" stroke-width="1.1"/>` : '';
  const heightMap = `
<rect x="-10" y="-10" width="260" height="240" fill="#000"/>
<path d="${p}" fill="#8a8a8a"/>
${valleys.map((v) => `<path d="${v}" fill="none" stroke="#000" stroke-opacity=".75" stroke-width="${j(8, 3)}"/>`).join('')}
${ridges.map((v) => `<path d="${v}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="${j(9, 3)}"/>`).join('')}
${sleeveCreases.map((v) => `<path d="${v}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="4"/>`).join('')}
<path d="M${b.l} 84 Q${b.l + 4} 62 ${b.l - 2} 42 M${b.r} 84 Q${b.r - 4} 62 ${b.r + 2} 42" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="2.4"/>
<path d="M${sl[0]} ${sl[1]} L${sl[2]} ${sl[3]} M${240 - sl[0]} ${sl[1]} L${240 - sl[2]} ${sl[3]}" stroke="#fff" stroke-opacity=".55" stroke-width="7"/>
${neck ? `<path d="M100 30 Q120 ${side === 'back' ? 36 : d.kind === 'sweat' ? 46 : 48} 140 30" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>` : ''}
${front ? `<path d="M104 26 L120 ${d.kind === 'shirt' ? 40 : 46} L136 26" fill="none" stroke="#fff" stroke-width="6"/><path d="M120 ${d.kind === 'shirt' ? 42 : 48} V${b.b}" stroke="#000" stroke-width="2.4"/>` : ''}
${d.kind === 'sweat' || d.kind === 'hoodie' ? `<rect x="${b.l}" y="${b.b - 12}" width="${b.r - b.l}" height="12" fill="#b0b0b0"/>` : ''}
${d.kind === 'hoodie' && side === 'front' ? `<ellipse cx="120" cy="30" rx="17" ry="13" fill="#000"/><path d="M92 26 Q120 50 148 26" fill="none" stroke="#fff" stroke-width="5"/><path d="M90 150 Q92 128 102 124 H138 Q148 128 150 150 V172 H90 Z" fill="#a8a8a8" stroke="#000" stroke-opacity=".6" stroke-width="2"/><path d="M114 40 v26 M126 40 v26" stroke="#fff" stroke-width="2"/>` : ''}
${d.kind === 'hoodie' && side === 'back' ? `<path d="M98 26 Q120 6 142 26 Q130 40 120 40 Q110 40 98 26 Z" fill="#a0a0a0" stroke="#000" stroke-opacity=".5" stroke-width="2"/>` : ''}
${bottoms ? `<rect x="${b.l - 2}" y="28" width="${b.r - b.l + 4}" height="11" fill="#b4b4b4" stroke="#000" stroke-opacity=".5" stroke-width="1.6"/>${side === 'front' ? `<path d="M120 39 V${d.kind === 'shorts' ? 92 : 84}" stroke="#000" stroke-opacity=".7" stroke-width="2"/><path d="M${b.l + 4} 44 Q${b.l + 16} 58 ${b.l + 26} 46 M${b.r - 4} 44 Q${b.r - 16} 58 ${b.r - 26} 46" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="1.8"/>` : ''}${d.kind === 'sweatpants' ? `<rect x="86" y="196" width="28" height="9" fill="#b0b0b0"/><rect x="126" y="196" width="28" height="9" fill="#b0b0b0"/><path d="M110 39 q-3 10 -7 14 M130 39 q3 10 7 14" stroke="#fff" stroke-width="1.6"/>` : ''}` : ''}
${d.kind === 'denim' ? `<path d="M86 96 h26 v18 h-26 Z M128 96 h26 v18 h-26 Z" fill="#a5a5a5" stroke="#000" stroke-opacity=".6" stroke-width="1.6"/><path d="M78 150 H162" stroke="#000" stroke-opacity=".6" stroke-width="2"/>` : ''}
${d.kind === 'tee' && dark && !d.tour && !d.print && side === 'front' ? `<circle cx="120" cy="104" r="26" fill="none" stroke="#b5b5b5" stroke-width="5"/>` : ''}`;
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
  ${d.kind === 'tee' && dark && !d.tour && !d.print && side === 'front' ? `<circle cx="120" cy="104" r="26" fill="none" stroke="${d.accent}" stroke-width="5" opacity=".85"/>` : ''}
  ${tourPrint(d, side, id + side[0])}
  ${linePrint(d, side, id + side[0] + 'l')}
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
${neck ? `<path d="M103 33 Q120 ${side === 'back' ? 38 : 50} 137 33" fill="none" stroke="${dark ? '#fff' : '#000'}" stroke-opacity=".25" stroke-width=".6" stroke-dasharray="1.6 1.2"/>` : ''}
${d.kind === 'tee' && !dark && !d.tour && !d.print && side === 'front' ? `<rect x="136" y="70" width="16" height="18" fill="none" stroke="#000" stroke-opacity=".22" stroke-width=".7" stroke-dasharray="1.6 1.2"/>` : ''}
</g>
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
