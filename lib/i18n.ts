// 英語・日本語の切り替え（サーバー・ブラウザ共通の部分）。文言は各ページで t('English', '日本語') の形で並べて書く
export type Lang = 'en' | 'ja';
export const LANG_COOKIE = 'gc-lang';
export const parseLang = (v: string | undefined | null): Lang => (v === 'ja' ? 'ja' : 'en');
export type T = (en: string, ja: string) => string;
export const makeT = (lang: Lang): T => (en, ja) => (lang === 'ja' ? ja : en);
// 日付の表示（日本語なら 2027年1月18日 の形）
export const dateLocale = (lang: Lang) => (lang === 'ja' ? 'ja-JP' : 'en-US');
