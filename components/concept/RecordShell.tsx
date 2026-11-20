'use client';
// 購入まわりの画面（当選者の注文・購入完了）の外枠：コンセプトページと同じ黒い「記録保管庫」の雰囲気。
// 背景に光の粒の服を置き、done なら服がほどけて記録の鎖になる。
import dynamic from 'next/dynamic';
import { LangToggle, useLang } from '../Lang';
import { cutout } from '../shop/pieceArt';

const ParticlePiece = dynamic(() => import('./ParticlePiece'), { ssr: false });

export default function RecordShell({ kicker, title, children, art, photo, done }: { kicker?: string; title: string; children: React.ReactNode; art?: string; photo?: boolean; done?: boolean }) {
  const { t } = useLang();
  return (
    <div className="rx" translate="no">
      <header className="rx-top">
        <a className="cx-logo notranslate" href="/">GALLERY CRYPTO</a>
        <nav><a href="/shop">{t('Shop', 'ショップ')}</a><a href="/concept">{t('Concept', 'コンセプト')}</a><a href="/verify">{t('Verify', '検証')}</a><LangToggle /></nav>
      </header>
      <div className="rx-body">
        <div className="rx-art">
          <ParticlePiece src={art || cutout('v3')} photo={photo} reveal={!done && !!art} mode={done ? 'record' : 'piece'} className="rx-pp" />
        </div>
        <main className="rx-main">
          {kicker && <p className="cx-n">{kicker}</p>}
          <h1 className="rx-h">{title}</h1>
          {children}
        </main>
      </div>
      <footer className="rx-foot">
        <span>GALLERY CRYPTO · {t('Tokyo · one of one · on record', '東京 · 一点もの · 記録付き')}</span>
        <span><a href="/privacy">{t('Privacy', 'プライバシー')}</a> · <a href="/legal">{t('Legal notice', '特定商取引法に基づく表記')}</a> · <a href="mailto:garellycrypto@gmail.com">{t('Contact', 'お問い合わせ')}</a></span>
      </footer>
    </div>
  );
}
