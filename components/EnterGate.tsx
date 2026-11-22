'use client';
// 入口：サイトを開いたとき最初に出る一枚。「タップ／クリックして入る」。
// 作品のように見せるため、ゆっくり形を変える色の塊と、美術館の作品札を添える（すべてオリジナル）。
// 一度入ったら、そのタブではもう出さない。記録の確認・管理・決済などのページでは出さない。
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLang } from './Lang';
import { sfx } from '@/lib/sfx';

const SKIP = /^\/(admin|passport|verify|tap|buy|thanks|ticket|labels|ledger|proof|spec|privacy|legal|api)/;

export default function EnterGate() {
  const { t } = useLang();
  const path = usePathname() || '/';
  const [gone, setGone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => { if (SKIP.test(path)) { document.documentElement.classList.remove('gate'); setGone(true); } }, [path]);
  const enter = () => {
    if (leaving) return;
    setLeaving(true); sfx('open');
    try { sessionStorage.setItem('gc-entered', '1'); } catch { /* 無視 */ }
    setTimeout(() => { document.documentElement.classList.remove('gate'); setGone(true); }, 900);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (document.documentElement.classList.contains('gate') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); enter(); } };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });
  if (gone) return null;
  return (
    <div className={`eg ${leaving ? 'out' : ''}`} onClick={enter} role="button" tabIndex={0} aria-label={t('Enter Gallery Crypto', 'Gallery Crypto に入る')}>
      <div className="eg-blobs" aria-hidden><i /><i /><i /><i /></div>
      <div className="eg-grain" aria-hidden />
      <p className="eg-kick">GALLERY CRYPTO — TOKYO</p>
      <h1 className="eg-h"><span>{t('Tap', 'タップ')}</span><span className="eg-sl">/</span><span>{t('Click', 'クリック')}</span><span className="eg-to">{t('to enter', 'して入る')}</span></h1>
      <div className="eg-label" aria-hidden>
        <b>{t('Untitled (Entrance)', '無題（入口）')}, 2026</b>
        <span>{t('Light, colour, motion on a screen', '光・色・動き、画面')}</span>
        <span>{t('Courtesy of Gallery Crypto', 'Gallery Crypto 所蔵')}</span>
      </div>
      <span className="eg-curtain" aria-hidden />
    </div>
  );
}
