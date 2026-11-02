'use client';

// 写真の指紋を、この端末で計算して記録と照らし合わせる
import { useState } from 'react';
import { useLang } from './Lang';

export default function HashCheck({ src, expected }: { src: string; expected: string }) {
  const { t } = useLang();
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
      <p className="pp-mono">{t('Recorded fingerprint', '記録された指紋')}<br />{expected}</p>
      <button className="mo-btn ghost small" onClick={run} disabled={st === 'busy'}>{st === 'busy' ? t('Calculating…', '計算中…') : t('Check this photo on my device', 'この写真を自分の端末で確かめる')}</button>
      {got && <p className="pp-mono">{t('This photo, calculated just now', 'いま計算したこの写真')}<br />{got}</p>}
      {st === 'ok' && <p className="pp-good">{t('Match. This is the exact photo sealed in the record.', '一致しました。記録に封じ込められた写真そのものです。')}</p>}
      {st === 'ng' && <p className="pp-bad">{t('No match — the photo is not the one in the record.', '一致しません。記録の写真ではありません。')}</p>}
    </div>
  );
}
