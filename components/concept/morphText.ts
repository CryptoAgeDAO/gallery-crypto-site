// ホームの光の粒の「形」の指定（three.js を読み込まない軽い部品）
export type MorphTarget = { src: string; photo?: boolean; thr?: number };

// 文字（抽選番号など）を粒にするための画像
export function textTarget(text: string, sub = ''): MorphTarget {
  if (typeof document === 'undefined') return { src: '' };
  const c = document.createElement('canvas'); c.width = 900; c.height = 520;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ece8df'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 230px "Archivo", "Helvetica Neue", Arial, sans-serif'; g.fillText(text, 450, 230);
  if (sub) { g.fillStyle = '#c9a46a'; g.font = '600 64px ui-monospace, Menlo, monospace'; g.fillText(sub, 450, 430); }
  return { src: c.toDataURL('image/png') };
}

