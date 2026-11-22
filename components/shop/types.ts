// 3D店舗に並べる商品（サイトに登録された実物の商品 ＋ 見本）
export type ShopItem = {
  id: string;
  code: string;
  title: string;
  sub: string;
  price: string; // 表示用
  img?: string; // 写真の URL（または data URL）
  pid?: string; // 見本のとき PROJECTS の id（図を描く）
  back?: string; // 背中の絵（ツアーマーチの見本など）
  tour?: boolean;
  line?: 'tops' | 'outer' | 'bottoms' | 'head' | 'acc'; // 見本ライン（約100点）の分類
  acc?: boolean; // 小物（ハンガーに掛けない）
  group?: string; color?: string; hex?: string; // 色展開（同じ group は色違い）
  series?: 'paint' | 'record' | 'fade' | 'thrash' | 'objects'; // 見本ラインのシリーズ
  buy: 'stripe' | 'demo' | 'sold' | 'local';
  passport?: string;
  desc: string;
  facts: [string, string][];
  zone: 'rwa' | 'vintage' | 'art' | 'archive';
  display?: 'frame' | 'hang' | 'plinth' | 'case';
  size?: number;
  heightM?: number; // 実物の高さ（m）：モックアップ・スキャンで測った大きさのまま3Dにする
  glbKey?: string; // この端末に保存した立体（.glb）
};
