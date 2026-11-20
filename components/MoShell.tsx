'use client';
// お客さま向けの画面の共通の外枠（購入・お礼・チケット・パスポート・検証・プライバシー・特商法など）。
// ショップと同じ、トラバーチン・大理石・真鍮の静かな旗艦店の雰囲気にそろえる。
import { LangToggle, useLang } from './Lang';

export default function MoShell({ kicker, title, children }: { kicker?: string; title: string; children: React.ReactNode }) {
  const { t } = useLang();
  return (
    <div className="mo st">
      <div className="st-ann">{t('Every piece comes with a digital record', 'すべての商品にデジタル記録付き')}</div>
      <div className="mo-page">
        <header className="mo-mast">
          <nav className="mo-nav l" aria-label="Shop">
            <a href="/shop">{t('Shop', 'ショップ')}</a>
            <a href="/shop#c=new">{t('New', '新着')}</a>
            <a href="/#events">{t('Lottery', '抽選')}</a>
          </nav>
          <a className="mo-logo notranslate" translate="no" href="/shop">Gallery Crypto</a>
          <nav className="mo-nav r" aria-label="Help">
            <a href="/verify">{t('Verify', '検証')}</a>
            <a href="mailto:garellycrypto@gmail.com">{t('Contact', 'お問い合わせ')}</a>
            <LangToggle />
          </nav>
        </header>
      </div>
      <div className="st-hero">
        {kicker && <p className="mo-kicker">{kicker}</p>}
        <h1 className="mo-doch">{title}</h1>
      </div>
      <div className="mo-page">
        <main className="mo-doc">{children}</main>
      </div>
      <footer className="st-foot">
        <div>
          <b className="notranslate" translate="no">GALLERY CRYPTO</b>
          <span>{t('Tokyo · Each piece is one of a kind', '東京 · すべて一点もの')}</span>
        </div>
        <div>
          <b>{t('Shop', 'ショップ')}</b>
          <a href="/shop">{t('All pieces', 'すべての商品')}</a>
          <a href="/shop/room">{t('The showroom', 'ショールーム')}</a>
        </div>
        <div>
          <b>{t('Help', 'ヘルプ')}</b>
          <a href="mailto:garellycrypto@gmail.com">{t('Contact', 'お問い合わせ')}</a>
          <a href="/verify">{t('Verify a piece', '商品の記録を確かめる')}</a>
          <a href="/privacy">{t('Privacy', 'プライバシー')}</a>
          <a href="/legal">{t('Legal notice', '特定商取引法に基づく表記')}</a>
        </div>
        <div>
          <b>{t('Payment', 'お支払い')}</b>
          <span>{t('Card · Apple Pay', 'カード · Apple Pay')}</span>
        </div>
      </footer>
    </div>
  );
}
