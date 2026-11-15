// 3D店舗に並べる商品（サイトに登録された実物の商品 ＋ 見本）
export type ShopItem = {
  id: string;
  code: string;
  title: string;
  sub: string;
  price: string; // 表示用
  img?: string; // 写真の URL（または data URL）
  pid?: string; // 見本のとき PROJECTS の id（図を描く）
  buy: 'stripe' | 'demo' | 'sold' | 'local';
  passport?: string;
  desc: string;
  facts: [string, string][];
  zone: 'rwa' | 'vintage' | 'art' | 'archive';
};
