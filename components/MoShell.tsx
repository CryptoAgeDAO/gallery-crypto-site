// 通信販売ページ風の外枠（購入・お礼・プライバシー・特商法のページ共通）
export default function MoShell({ kicker, title, children }: { kicker?: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mo">
      <div className="mo-page">
        <header className="mo-mast small">
          <div className="mo-top">
            <span>Vol. 1 · Tokyo, Japan</span>
            <nav aria-label="Sections">
              <a href="/#archive">Catalog</a>
              <a href="/#presale">Order form</a>
              <a href="/#contact">Write us</a>
            </nav>
          </div>
          <a className="mo-logo mo-logo-s" href="/">
            Gallery Crypto <em>Mail Order</em>
          </a>
        </header>
        <main className="mo-doc">
          {kicker && <p className="mo-kicker">{kicker}</p>}
          <h1 className="mo-doch">{title}</h1>
          {children}
        </main>
        <footer className="mo-foot">
          <span>© Gallery Crypto. All pieces are one of a kind — when it&apos;s gone, it&apos;s gone.</span>
          <span>
            <a href="/privacy">Privacy</a>
            <a href="/">Back to the catalog</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
