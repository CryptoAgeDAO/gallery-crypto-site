'use client';
// レールのページ：白い売り場に一本のレール。押した一着が真ん中に寄り、ほかはぼける。
// サイトで公開した商品は自動でレールに掛かる（20秒ごとに取り直し）。商品がまだないときは見本を掛ける。
import { useEffect, useMemo, useState } from 'react';
import { LangToggle, useLang } from '../Lang';
import { supabase } from '@/lib/supabase';
import { PUBLIC_ITEM_COLUMNS, type Item } from '@/lib/types';
import type { ShopItem } from './types';
import { toShop } from './toShop';
import { demoItems } from './demo';
import { cutout, kindOf } from './pieceArt';
import HangRail, { type RailItem } from './HangRail';

export const toRail = (i: ShopItem): RailItem => ({ ...i, src: i.img || (i.pid ? cutout(i.pid) : ''), kind: kindOf(i) });

export default function RailPage({ initial, saleOpen }: { initial: ShopItem[]; saleOpen: boolean }) {
  const { t } = useLang();
  const [real, setReal] = useState<ShopItem[]>(initial);
  const [local, setLocal] = useState<ShopItem[]>([]);
  const [fid, setFid] = useState<string | null>(null);
  useEffect(() => { try { setLocal(JSON.parse(localStorage.getItem('gc-shop-local') || '[]')); } catch { /* 無視 */ } }, []);
  useEffect(() => {
    const db = supabase(); if (!db) return;
    const h = setInterval(async () => {
      const { data } = await db.from('items').select(PUBLIC_ITEM_COLUMNS).eq('published', true).order('serial', { ascending: false }).limit(60);
      if (data) setReal(((data as unknown) as Item[]).map((it) => toShop(it, saleOpen)));
    }, 20000);
    return () => clearInterval(h);
  }, [saleOpen]);
  // #p=… で一着を開く（戻るボタンでレールに戻れる）
  useEffect(() => {
    const read = () => { const m = /[#&]p=([^&]+)/.exec(location.hash); setFid(m ? decodeURIComponent(m[1]) : null); };
    read(); addEventListener('hashchange', read); return () => removeEventListener('hashchange', read);
  }, []);
  const focus = (id: string | null) => { if (id) location.hash = 'p=' + encodeURIComponent(id); else { history.replaceState(null, '', location.pathname + location.search); setFid(null); } };
  // 服を先に、キャップ・アートは後ろに
  const items = useMemo(() => {
    const all = [...local, ...real, ...(real.length ? [] : demoItems())].map(toRail).filter((i) => i.src);
    // レールに掛けるのは服だけ（キャップ・アートはショールームの棚と壁に）
    const g = all.filter((i) => i.kind === 'garment');
    return (g.length >= 3 ? g : all).slice(0, 16);
  }, [local, real]);

  return (
    <div className="rp" translate="no">
      <header className="rp-top">
        <a href="/shop">← {t('Shop', 'ショップ')}</a>
        <a className="rp-logo notranslate" href="/">GALLERY CRYPTO</a>
        <span className="rp-r"><a href="/shop/room">{t('Showroom', 'ショールーム')}</a><LangToggle /></span>
      </header>
      <div className="rp-stage"><HangRail items={items} focusId={fid} onFocus={focus} /></div>
    </div>
  );
}
