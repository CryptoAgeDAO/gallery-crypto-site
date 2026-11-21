'use client';
// ページの表示中にエラーが起きたとき、真っ白にせず、何が起きたかを画面に出す（原因を確かめるため）
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return (
    <div style={{ minHeight: '100vh', padding: '48px 20px', background: '#f4f3f0', color: '#111', fontFamily: 'Helvetica, Arial, sans-serif', lineHeight: 1.6 }}>
      <p style={{ fontSize: 12, letterSpacing: '.2em', margin: 0 }}>GALLERY CRYPTO</p>
      <h1 style={{ fontSize: 20, margin: '12px 0' }}>表示中にエラーが起きました / Something went wrong</h1>
      <p style={{ fontSize: 14, margin: '0 0 16px' }}>この画面のスクリーンショットを送ってください。原因の特定に使います。<br />Please send a screenshot of this screen.</p>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, background: '#fff', border: '1px solid #ddd', padding: 12, borderRadius: 6 }}>
        {(error?.name || 'Error') + ': ' + (error?.message || '(no message)')}{error?.digest ? `\ndigest: ${error.digest}` : ''}
        {'\n'}{typeof location !== 'undefined' ? location.pathname + location.hash : ''}
        {'\n'}{ua}
        {'\n'}{(error?.stack || '').split('\n').slice(0, 6).join('\n')}
      </pre>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={() => reset()} style={{ padding: '10px 16px', borderRadius: 999, border: 0, background: '#111', color: '#fff' }}>もう一度 / Retry</button>
        <a href="/" style={{ padding: '10px 16px', borderRadius: 999, border: '1px solid #111', color: '#111', textDecoration: 'none' }}>トップへ / Home</a>
      </div>
    </div>
  );
}
