// わかりやすいアイコン（どれも文字のラベルと一緒に使う）。24×24 の線画を、角丸の下地にのせる
import type { ReactNode } from 'react';

export type IconName =
  | 'cap' | 'tap' | 'chip' | 'antenna' | 'battery' | 'server' | 'founder' | 'chain' | 'ledger' | 'clock' | 'offline'
  | 'qr' | 'lock' | 'shield' | 'eye' | 'download' | 'warn' | 'copy' | 'move' | 'phone' | 'fingerprint' | 'tree' | 'search' | 'person';

export const ICONS: Record<IconName, ReactNode> = {
  cap: <><path d="M4 15c0-5 3.6-8.5 8-8.5S20 10 20 15" /><path d="M3 15.5h12.5c2.5 0 4.5.6 5.5 1.5-1.4.8-3.3 1.2-5.5 1.2H6" /><circle cx="12" cy="6" r=".9" fill="currentColor" /></>,
  tap: <><rect x="8" y="3" width="9" height="17" rx="2" /><path d="M11.5 17.5h2" /><path d="M5 9.5a4 4 0 0 0 0 5M2.5 7.5a7 7 0 0 0 0 9" /></>,
  chip: <><rect x="7" y="7" width="10" height="10" rx="1.5" /><rect x="10" y="10" width="4" height="4" fill="currentColor" stroke="none" /><path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3" /></>,
  antenna: <><rect x="4" y="5" width="16" height="14" rx="1.5" /><rect x="7" y="8" width="10" height="8" rx="1" /><rect x="10" y="11" width="4" height="2" /></>,
  battery: <><rect x="3" y="8" width="16" height="9" rx="1.5" /><path d="M21 11v3" /><path d="M2 3l20 18" /></>,
  server: <><rect x="4" y="4" width="16" height="6" rx="1.5" /><rect x="4" y="14" width="16" height="6" rx="1.5" /><circle cx="8" cy="7" r=".9" fill="currentColor" /><circle cx="8" cy="17" r=".9" fill="currentColor" /><path d="M12 7h5M12 17h5" /></>,
  founder: <><circle cx="8.5" cy="9" r="3.2" /><path d="M11 11.5l8.5 8.5M16.5 17l2-2M14.5 15l1.5-1.5" /></>,
  chain: <><rect x="2.5" y="8.5" width="8" height="7" rx="3.5" transform="rotate(-30 6.5 12)" /><rect x="13.5" y="8.5" width="8" height="7" rx="3.5" transform="rotate(-30 17.5 12)" /><path d="M9.5 12.5l5-1" /></>,
  ledger: <><rect x="3" y="4" width="7" height="7" rx="1" /><rect x="14" y="4" width="7" height="7" rx="1" /><rect x="8.5" y="14" width="7" height="7" rx="1" /><path d="M10 7.5h4M17.5 11v1.5H12V14M6.5 11v1.5H12" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  offline: <><path d="M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9.2 16a4 4 0 0 1 5.6 0" /><path d="M3 3l18 18" /></>,
  qr: <><rect x="3.5" y="3.5" width="7" height="7" /><rect x="13.5" y="3.5" width="7" height="7" /><rect x="3.5" y="13.5" width="7" height="7" /><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 19h2" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><circle cx="12" cy="15.5" r="1.2" fill="currentColor" /></>,
  shield: <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  download: <><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M4.5 19.5h15" /></>,
  warn: <><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.2" r=".9" fill="currentColor" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></>,
  move: <><path d="M4 12h16M15.5 7.5L20 12l-4.5 4.5" /><rect x="3" y="4" width="6" height="5" rx="1" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M10.5 18.5h3" /></>,
  fingerprint: <><path d="M6.5 18c1-2 1.5-4 1.5-6a4 4 0 0 1 8 0c0 3-.6 5.5-1.6 7.5" /><path d="M12 12c0 3-.8 5.6-2.2 7.6M4 14.5c.4-1 .5-1.8.5-2.5a7.5 7.5 0 0 1 15 0c0 1.5-.2 3-.5 4.3" /></>,
  tree: <><rect x="9.5" y="2.5" width="5" height="4" rx=".8" /><rect x="3" y="11" width="5" height="4" rx=".8" /><rect x="16" y="11" width="5" height="4" rx=".8" /><path d="M12 6.5v2.5H5.5V11M12 9h6.5v2" /><path d="M5.5 15v2.5M18.5 15v2.5M3.5 20h4M16.5 20h4" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5.5 5.5" /></>,
  person: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c1.2-3.8 4-5.8 7.5-5.8s6.3 2 7.5 5.8" /></>,
};

export type IconTone = 'ink' | 'ok' | 'ng' | 'wait' | 'soft' | 'copper';

export default function GcIcon({ name, size = 44, tone = 'soft', status }: { name: IconName; size?: number; tone?: IconTone; status?: 'ok' | 'ng' | 'wait' | 'next' }) {
  return (
    <span className={`gi gi-${tone}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name]}
      </svg>
      {status && (
        <span className={`gi-badge ${status}`}>
          {status === 'ok' ? '✓' : status === 'ng' ? '✕' : status === 'wait' ? '…' : '·'}
        </span>
      )}
    </span>
  );
}

// アイコンと短い説明の一行
export function IconRow({ name, title, children, status, tone }: { name: IconName; title: string; children?: ReactNode; status?: 'ok' | 'ng' | 'wait' | 'next'; tone?: IconTone }) {
  return (
    <div className={`gi-row ${status || ''}`}>
      <GcIcon name={name} status={status} tone={tone} />
      <div>
        <b>{title}</b>
        {children && <span>{children}</span>}
      </div>
    </div>
  );
}

// SVG の図の中に置く版
export function SvgIcon({ name, x, y, size = 40, tone = 'soft' }: { name: IconName; x: number; y: number; size?: number; tone?: 'soft' | 'ink' | 'copper' }) {
  const bg = tone === 'ink' ? '#111111' : tone === 'copper' ? '#F4E7DC' : '#F1EFEA';
  const fg = tone === 'ink' ? '#FAFAF8' : tone === 'copper' ? '#9A5223' : '#111111';
  const k = (size * 0.58) / 24;
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden>
      <rect width={size} height={size} rx={size * 0.26} fill={bg} />
      <g transform={`translate(${size * 0.21} ${size * 0.21}) scale(${k})`} fill="none" stroke={fg} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" color={fg}>
        {ICONS[name]}
      </g>
    </g>
  );
}
