// サーバー専用：いまの表示言語（クッキー gc-lang。なければ英語）
import 'server-only';
import { cookies } from 'next/headers';
import { LANG_COOKIE, makeT, parseLang, type Lang } from './i18n';

export const getLang = (): Lang => parseLang(cookies().get(LANG_COOKIE)?.value);
export const getT = () => makeT(getLang());
