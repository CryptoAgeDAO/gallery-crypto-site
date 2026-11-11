'use client';
// 共通の外枠（パスポート・Proof Lab・検証・仕様書・購入・お礼・プライバシー・特商法）。トップと同じ白黒の静かな見た目
import { LangToggle, useLang } from './Lang';
import GameHud from './GameHud';

export default function MoShell({ kicker, title, children }: { kicker?: string; title: string; children: React.ReactNode }) {
  const { t } = useLang();
  return (
    <div className="mo gx">
      <GameHud goal={title} />
      <div className="mo-page">
        <header className="mo-mast">
          <nav className="mo-nav l" aria-label="Collection">
            <a href="/#archive">{t('Archive', 'アーカイブ')}</a>
            <a href="/proof">{t('Provenance', '来歴')}</a>
            <a href="/ledger">{t('Ledger', '台帳')}</a>
          </nav>
          <a className="mo-logo notranslate" translate="no" href="/">Gallery Crypto</a>
          <nav className="mo-nav r" aria-label="House">
            <a href="/demo">{t('Demo', 'デモ')}</a>
            <a href="/verify">{t('Verify', '検証')}</a>
            <a href="/#contact">{t('Contact', 'お問い合わせ')}</a>
            <LangToggle />
          </nav>
        </header>
        <main className="mo-doc">
          {kicker && <p className="mo-kicker">{kicker}</p>}
          <h1 className="mo-doch">{title}</h1>
          {children}
        </main>
        <footer className="mo-foot">
          <span>{t('© Gallery Crypto · Tokyo · Each piece is one of a kind.', '© Gallery Crypto · 東京 · すべて一点もの')}</span>
          <span>
            <a href="/privacy">{t('Privacy', 'プライバシー')}</a>
            <a href="/">{t('Archive', 'アーカイブ')}</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
