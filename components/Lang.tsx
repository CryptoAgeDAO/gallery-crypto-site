'use client';

// 表示言語をページ全体に配る ＋ EN / 日本語 の切り替えボタン
import { createContext, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { LANG_COOKIE, dateLocale, makeT, type Lang, type T } from '@/lib/i18n';

type Ctx = { lang: Lang; t: T; locale: string };
const LangCtx = createContext<Ctx>({ lang: 'en', t: makeT('en'), locale: 'en-US' });

// フックを使えない場所（管理画面の補助関数やメッセージ）用。いまの言語で英語か日本語を返す
let current: Lang = 'en';
export const tt: T = (en, ja) => (current === 'ja' ? ja : en);

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  current = lang;
  const v = useMemo(() => ({ lang, t: makeT(lang), locale: dateLocale(lang) }), [lang]);
  return <LangCtx.Provider value={v}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

export function LangToggle({ className = '' }: { className?: string }) {
  const { lang } = useLang();
  const router = useRouter();
  const set = (l: Lang) => {
    if (l === lang) return;
    current = l;
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    router.refresh();
  };
  return (
    <span className={`lang-tg ${className}`} role="group" aria-label="Language / 言語">
      <button type="button" aria-pressed={lang === 'en'} className={lang === 'en' ? 'on' : ''} onClick={() => set('en')}>EN</button>
      <button type="button" aria-pressed={lang === 'ja'} className={lang === 'ja' ? 'on' : ''} onClick={() => set('ja')} lang="ja">日本語</button>
    </span>
  );
}
