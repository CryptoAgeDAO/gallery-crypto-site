'use client';

import { useState } from 'react';
import { useLang } from './Lang';

export default function BuyButton({ itemId, token, label }: { itemId: string; token?: string; label?: string }) {
  const { t } = useLang();
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
            setErr(j.error || t('Checkout could not be started.', '購入手続きを開始できませんでした。'));
          } catch {
            setErr(t('Checkout could not be started.', '購入手続きを開始できませんでした。'));
          }
          setBusy(false);
        }}
      >
        {busy ? t('Opening checkout…', '購入画面を開いています…') : label || t('Buy now', '購入する')}
      </button>
      <p className="mo-fine">{t('Card or Apple Pay · Secure checkout by Stripe', 'カードまたは Apple Pay · Stripe による安全なお支払い')}</p>
      {err && <p className="mo-err">{err}</p>}
    </div>
  );
}
