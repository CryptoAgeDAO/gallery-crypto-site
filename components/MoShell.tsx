// 共通の外枠（パスポート・Proof Lab・検証・仕様書・購入・お礼・プライバシー・特商法）。トップと同じ白黒の静かな見た目
export default function MoShell({ kicker, title, children }: { kicker?: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mo">
      <div className="mo-page">
        <header className="mo-mast">
          <nav className="mo-nav l" aria-label="Collection">
            <a href="/#archive">Archive</a>
            <a href="/proof">Provenance</a>
            <a href="/ledger">Ledger</a>
          </nav>
          <a className="mo-logo" href="/">Gallery Crypto</a>
          <nav className="mo-nav r" aria-label="House">
            <a href="/demo">Demo</a>
            <a href="/verify">Verify</a>
            <a href="/#contact">Contact</a>
          </nav>
        </header>
        <main className="mo-doc">
          {kicker && <p className="mo-kicker">{kicker}</p>}
          <h1 className="mo-doch">{title}</h1>
          {children}
        </main>
        <footer className="mo-foot">
          <span>© Gallery Crypto · Tokyo · Each piece is one of a kind.</span>
          <span>
            <a href="/privacy">Privacy</a>
            <a href="/">Archive</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
