// スマホ・タブレットかどうか（画面の幅だけでなく、指で操作する端末か・iPhone/iPad かも見る）。
// iPhone を横向きにすると幅が 760px を超えるため、幅だけだと重い描画（影・光のにじみ・床の映り込み）が選ばれてしまう。
export function isPhone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const ua = navigator.userAgent || '';
    return matchMedia('(max-width: 760px)').matches
      || matchMedia('(pointer: coarse)').matches
      || /iPhone|iPad|iPod|Android|Mobile/i.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  } catch { return false; }
}
