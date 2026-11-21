'use client';
// いちばん外側（レイアウト）でエラーが起きたときの画面。真っ白にせず、エラーの内容を出す
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return (
    <html lang="ja"><body style={{ margin: 0 }}>
      <div style={{ minHeight: '100vh', padding: '48px 20px', background: '#f4f3f0', color: '#111', fontFamily: 'Helvetica, Arial, sans-serif', lineHeight: 1.6 }}>
        <p style={{ fontSize: 12, letterSpacing: '.2em', margin: 0 }}>GALLERY CRYPTO</p>
        <h1 style={{ fontSize: 20, margin: '12px 0' }}>表示中にエラーが起きました / Something went wrong</h1>
        <p style={{ fontSize: 14 }}>この画面のスクリーンショットを送ってください。</p>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, background: '#fff', border: '1px solid #ddd', padding: 12 }}>
          {(error?.name || 'Error') + ': ' + (error?.message || '(no message)')}{error?.digest ? `\ndigest: ${error.digest}` : ''}{'\n'}{ua}{'\n'}{(error?.stack || '').split('\n').slice(0, 6).join('\n')}
        </pre>
        <button onClick={() => reset()} style={{ padding: '10px 16px', borderRadius: 999, border: 0, background: '#111', color: '#fff' }}>もう一度 / Retry</button>
      </div>
    </body></html>
  );
}
