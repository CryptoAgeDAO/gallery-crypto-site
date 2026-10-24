'use client';

import { useState } from 'react';

export default function BuyButton({ itemId, token, label = 'Buy now' }: { itemId: string; token?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        className="mo-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr('');
          try {
            const r = await fetch('/api/checkout', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ item_id: itemId, token }),
            });
            const j = await r.json();
            if (j.url) {
              location.href = j.url;
              return;
            }
            setErr(j.error || 'Checkout could not be started.');
          } catch {
            setErr('Checkout could not be started.');
          }
          setBusy(false);
        }}
      >
        {busy ? 'Opening checkout…' : label}
      </button>
      <p className="mo-fine">Card or Apple Pay · Secure checkout by Stripe</p>
      {err && <p className="mo-err">{err}</p>}
    </div>
  );
}
