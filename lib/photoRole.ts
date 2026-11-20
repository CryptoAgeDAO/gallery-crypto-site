// 写真の向き（正面・背中）。データベースの列は増やさず、写真のパスの末尾に「#back」を付けて背中の写真を示す。
// 「#back」は URL のフラグメントなので、付いたままでも画像は表示できる。保存場所から消すときは外す。
export const BACK = '#back';
export const isBack = (p: string) => p.endsWith(BACK);
export const bare = (p: string) => (isBack(p) ? p.slice(0, -BACK.length) : p);
export const frontOf = (photos: string[]) => photos.find((p) => !isBack(p));
export const backOf = (photos: string[]) => photos.find(isBack);
// 並べ替え：正面にした写真を先頭に、背中にした写真は1枚だけ
export function setFront(photos: string[], p: string) { const b = bare(p); return [b, ...photos.filter((x) => x !== p)]; }
export function setBack(photos: string[], p: string) {
  if (isBack(p)) return photos.map((x) => (x === p ? bare(x) : x)); // もう一度押すと背中を外す
  const rest = photos.filter((x) => x !== p).map(bare);
  return [...rest, p + BACK];
}
