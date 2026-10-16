import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Thank you — Gallery Crypto', robots: { index: false } };

export default function Thanks() {
  return (
    <div className="site">
      <header className="hd">
        <a className="wm" href="/">Gallery Crypto</a>
      </header>
      <main className="block" style={{ borderTop: 0 }}>
        <h2>Thank you</h2>
        <p className="lead">
          Your payment is complete. A receipt has been sent to your email, and we will email you again with tracking when your piece ships.
          Its provenance certificate will be issued to you at the same time.
        </p>
        <p><a href="/">Back to the archive</a></p>
      </main>
    </div>
  );
}
