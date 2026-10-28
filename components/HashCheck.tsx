'use client';

// 写真の指紋を、この端末で計算して記録と照らし合わせる
import { useState } from 'react';

export default function HashCheck({ src, expected }: { src: string; expected: string }) {
  const [st, setSt] = useState<'idle' | 'busy' | 'ok' | 'ng'>('idle');
  const [got, setGot] = useState('');
  const run = async () => {
    setSt('busy');
    try {
      const buf = await (await fetch(src, { cache: 'no-store' })).arrayBuffer();
      const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map((b) => b.toString(16).padStart(2, '0')).join('');
      setGot(h);
      setSt(h === expected ? 'ok' : 'ng');
    } catch {
      setSt('ng');
    }
  };
  return (
    <div className="dm-hash">
      <p className="pp-mono">Recorded fingerprint<br />{expected}</p>
      <button className="mo-btn ghost small" onClick={run} disabled={st === 'busy'}>{st === 'busy' ? 'Calculating…' : 'Check this photo on my device'}</button>
      {got && <p className="pp-mono">This photo, calculated just now<br />{got}</p>}
      {st === 'ok' && <p className="pp-good">Match. This is the exact photo sealed in the record.</p>}
      {st === 'ng' && <p className="pp-bad">No match — the photo is not the one in the record.</p>}
    </div>
  );
}
