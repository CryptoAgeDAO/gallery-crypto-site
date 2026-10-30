// NFC タグと証明の仕組みを1枚の図に（横長＝PC、縦長＝スマホ）
import { NFC_STEPS, TAG_LAYERS, type NfcStep } from '@/lib/nfcSteps';
import { SvgIcon, type IconName } from './GcIcon';

const INK = '#111111', MUTE = '#6B6862', LINE = '#CFCAC0', PAPER = '#FAFAF8', CU = '#C47A45';
const SANS = 'Archivo, "Noto Sans JP", sans-serif', SERIF = '"Cormorant Garamond", Georgia, serif', MONO = '"JetBrains Mono", monospace';

function wrap(t: string, max: number) {
  const out: string[] = [];
  let cur = '';
  t.split(' ').forEach((w) => {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  });
  if (cur) out.push(cur);
  return out;
}

const ICON_OF: Record<string, IconName> = { piece: 'cap', tap: 'tap', chip: 'chip', record: 'shield', anchor: 'clock', offline: 'offline' };
function Icon({ k, x, y }: { k: string; x: number; y: number }) {
  return <SvgIcon name={ICON_OF[k] || 'qr'} x={x - 8} y={y - 4} size={40} tone={k === 'chip' ? 'copper' : 'soft'} />;
}

function Node({ s, x, y, w, h, techMax }: { s: NfcStep; x: number; y: number; w: number; h: number; techMax: number }) {
  const tech = wrap(s.tech.replace(/·/g, '· '), techMax);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={PAPER} stroke={s.next ? MUTE : INK} strokeDasharray={s.next ? '4 4' : undefined} />
      <text x={x + 16} y={y + 26} fontFamily={MONO} fontSize="11" letterSpacing="2" fill={MUTE}>{String(s.n).padStart(2, '0')}</text>
      {s.next && <text x={x + 44} y={y + 26} fontFamily={SANS} fontSize="9" letterSpacing="2" fill={CU}>NEXT · GCPP/3</text>}
      <Icon k={s.k} x={x + w - 40} y={y + 12} />
      <text x={x + 16} y={y + 60} fontFamily={SERIF} fontSize="25" fill={INK}>{s.title}</text>
      <text x={x + 16} y={y + 82} fontFamily={SANS} fontSize="12.5" fill={MUTE}>{s.short}</text>
      {tech.map((t, i) => (
        <text key={i} x={x + 16} y={y + h - 16 - (tech.length - 1 - i) * 14} fontFamily={MONO} fontSize="10" fill={INK}>{t}</text>
      ))}
    </g>
  );
}

function TagLayers({ x, y, labelX, labelMax, step, below = false }: { x: number; y: number; labelX: number; labelMax: number; step: number; below?: boolean }) {
  const para = (yy: number) => `M${x} ${yy + 34} L${x + 86} ${yy} H${x + 236} L${x + 150} ${yy + 34} Z`;
  return (
    <g>
      <text x={x} y={y - 14} fontFamily={SANS} fontSize="10" letterSpacing="2.4" fill={MUTE}>INSIDE THE NFC LABEL</text>
      {TAG_LAYERS.map((l, i) => {
        const yy = y + i * step;
        return (
          <g key={l.k}>
            <path d={para(yy)} fill={l.k === 'face' ? '#F4F1EA' : l.k === 'back' ? '#E6E1D6' : 'rgba(220,231,230,.6)'} stroke={INK} strokeWidth="1" />
            {l.k === 'face' && <text x={x + 96} y={yy + 22} fontFamily={MONO} fontSize="10" fill={INK}>GC · 0007</text>}
            {l.k === 'inlay' && (
              <g>
                {[0, 1, 2, 3].map((k) => {
                  const d = k * 6;
                  return <path key={k} d={`M${x + 34 + d * 1.6} ${yy + 28 - d * 0.35} L${x + 92 + d * 0.6} ${yy + 6 + d * 0.35} H${x + 196 - d * 1.6} L${x + 138 - d * 0.6} ${yy + 28 - d * 0.35} Z`} fill="none" stroke={CU} strokeWidth="1.3" />;
                })}
                <path d={`M${x + 148} ${yy + 20} l8 -5 h9 l-8 5 z`} fill={INK} />
              </g>
            )}
            {!below && i < TAG_LAYERS.length - 1 && <path d={`M${x + 118} ${yy + 38} V${yy + step - 4}`} stroke={LINE} strokeDasharray="2 3" />}
            {!below && <line x1={x + 240} y1={yy + 17} x2={labelX - 10} y2={yy + 17} stroke={LINE} />}
            <text x={below ? x + 262 : labelX} y={yy + 12} fontFamily={SANS} fontSize="12.5" fontWeight="500" fill={INK}>{below ? '' : l.title}</text>
            {below && <text x={x + 250} y={yy + 24} fontFamily={SANS} fontSize="12.5" fontWeight="500" fill={INK}>{l.title}</text>}
            {wrap(l.body, labelMax).map((t, j) => (
              <text key={j} x={below ? x : labelX} y={below ? yy + 54 + j * 15 : yy + 30 + j * 15} fontFamily={SANS} fontSize="11.5" fill={MUTE}>{t}</text>
            ))}
          </g>
        );
      })}
    </g>
  );
}

const Arrow = ({ id }: { id: string }) => (
  <defs>
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill={INK} />
    </marker>
  </defs>
);

export default function NfcDiagram() {
  const main = NFC_STEPS.filter((s) => s.k !== 'offline');
  const off = NFC_STEPS.find((s) => s.k === 'offline')!;
  const W = 200, H = 170, GAP = 32, X0 = 30, Y0 = 40;
  return (
    <figure className="nd">
      <svg className="nd-wide" viewBox="0 0 1200 650" role="img" aria-label="How the NFC tag proves a piece: tap, chip check, signed record, Solana anchor, and offline check from the hang-tag QR.">
        <Arrow id="ndA" />
        {main.map((s, i) => (
          <g key={s.k}>
            <Node s={s} x={X0 + i * (W + GAP)} y={Y0} w={W} h={H} techMax={27} />
            {i < main.length - 1 && <line x1={X0 + i * (W + GAP) + W + 3} y1={Y0 + H / 2} x2={X0 + (i + 1) * (W + GAP) - 4} y2={Y0 + H / 2} stroke={INK} markerEnd="url(#ndA)" />}
          </g>
        ))}
        {/* オフラインの枝 */}
        <path d={`M${X0 + W / 2} ${Y0 + H + 3} V${330 + H / 2} H${X0 + W + GAP - 4}`} fill="none" stroke={INK} markerEnd="url(#ndA)" />
        <text x={X0 + W / 2 + 10} y={Y0 + H + 40} fontFamily={SANS} fontSize="11.5" fill={MUTE}>or scan the hang-tag QR</text>
        <Node s={off} x={X0 + W + GAP} y={330} w={W} h={H} techMax={27} />
        <path d={`M${X0 + 2 * W + GAP + 3} ${330 + H / 2} H${X0 + 3 * (W + GAP) + W / 2} V${Y0 + H + 6}`} fill="none" stroke={INK} strokeDasharray="5 4" markerEnd="url(#ndA)" />
        <text x={X0 + 2 * W + GAP + 18} y={330 + H / 2 - 10} fontFamily={SANS} fontSize="11.5" fill={MUTE}>same two signatures, checked on the phone</text>
        <TagLayers x={560} y={460} labelX={850} labelMax={52} step={64} />
      </svg>

      <svg className="nd-tall" viewBox="0 0 360 1330" role="img" aria-label="How the NFC tag proves a piece, step by step.">
        <Arrow id="ndB" />
        {main.map((s, i) => (
          <g key={s.k}>
            <Node s={s} x={24} y={20 + i * 156} w={316} h={128} techMax={46} />
            {i < main.length - 1 && <line x1={182} y1={20 + i * 156 + 131} x2={182} y2={20 + (i + 1) * 156 - 4} stroke={INK} markerEnd="url(#ndB)" />}
          </g>
        ))}
        <path d="M24 84 H10 V872 H20" fill="none" stroke={INK} markerEnd="url(#ndB)" />
        <text x={30} y={800} fontFamily={SANS} fontSize="11.5" fill={MUTE}>or scan the hang-tag QR (no signal)</text>
        <Node s={off} x={24} y={808} w={316} h={128} techMax={46} />
        <TagLayers x={8} y={1000} labelX={8} labelMax={56} step={106} below />
      </svg>
    </figure>
  );
}
