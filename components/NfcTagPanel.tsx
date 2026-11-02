'use client';

// 管理画面「Passport」：NFC タグ（NTAG 424 DNA）に書き込む設定を出す ＋ 試し方
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Settings = {
  uid: string;
  url: string;
  keys: { sdmMetaRead: string; sdmFileRead: string };
  sdm: { file: string; options: string; piccDataOffset: number; sdmMacInputOffset: number; sdmMacOffset: number };
  note: string;
};

export default function NfcTagPanel({ uid: initial, cert }: { uid: string; cert: string }) {
  const [uid, setUid] = useState(initial);
  const [s, setS] = useState<Settings | null>(null);
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setUid(initial); setS(null); }, [initial, cert]);
  // 鍵は2分で画面から消す
  useEffect(() => {
    if (!s) return;
    const t = setTimeout(() => { setS(null); setSt('Keys hidden.'); }, 120_000);
    return () => clearTimeout(t);
  }, [s]);

  const clean = uid.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  const show = async () => {
    setBusy(true);
    setSt('');
    try {
      const { data } = await supabase()!.auth.getSession();
      const r = await fetch('/api/admin/sun', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token || ''}` }, body: JSON.stringify({ uid: clean }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setSt(r.status === 401 ? 'Not allowed — sign in again with your 6-digit code.' : j.error || 'Could not load settings');
      else setS(j);
    } finally {
      setBusy(false);
    }
  };
  const copy = (v: string, what: string) => navigator.clipboard.writeText(v).then(() => setSt(`${what} copied`), () => setSt('Could not copy'));

  const Row = ({ k, v, what }: { k: string; v: string; what: string }) => (
    <tr><th>{k}</th><td className="pa-hash">{v}</td><td><button className="btn" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => copy(v, what)}>Copy</button></td></tr>
  );

  return (
    <div className="sec">
      <h4>NFC tag · {cert}</h4>
      <p>
        Settings to write into this piece&apos;s NTAG 424 DNA tag, so every tap opens the passport marked “Chip verified just now”. Read the tag&apos;s UID with the writing app first.
        The keys are made fresh for this UID and are not stored — copy them into the app, write the tag, then close this.
      </p>
      <div className="row" style={{ justifyContent: 'flex-start', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: 4 }}>Chip UID (14 characters)
          <input type="text" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="04A1B2C3D4E5F6" style={{ fontFamily: 'var(--mono)' }} />
        </label>
        <button className="btn primary" disabled={busy || clean.length !== 14} onClick={show}>Show tag settings</button>
        {s && <button className="btn" onClick={() => { setS(null); setSt('Keys hidden.'); }}>Hide</button>}
      </div>
      {initial && clean !== initial.replace(/[^0-9a-fA-F]/g, '').toUpperCase() && <p className="status">This UID differs from the one in the record ({initial}).</p>}
      {!initial && <p className="status">Tip: also enter this UID in “NFC chip UID” above and seal, so taps open this passport.</p>}

      {s && (
        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table>
            <tbody>
              <Row k="URL (NDEF, https://)" v={s.url} what="URL" />
              <Row k="SDM meta read key" v={s.keys.sdmMetaRead} what="Meta read key" />
              <Row k="SDM file read key" v={s.keys.sdmFileRead} what="File read key" />
              <tr><th>PICC data offset</th><td className="pa-hash">{s.sdm.piccDataOffset}</td><td /></tr>
              <tr><th>SDM MAC input offset</th><td className="pa-hash">{s.sdm.sdmMacInputOffset}</td><td /></tr>
              <tr><th>SDM MAC offset</th><td className="pa-hash">{s.sdm.sdmMacOffset}</td><td /></tr>
              <tr><th>File</th><td colSpan={2}>{s.sdm.file}</td></tr>
              <tr><th>Options</th><td colSpan={2}>{s.sdm.options}</td></tr>
            </tbody>
          </table>
          <p className="status">{s.note} Hidden automatically after 2 minutes.</p>
        </div>
      )}

      <h5 style={{ marginTop: 16 }}>Test a written tag</h5>
      <ol style={{ margin: '4px 0 0', paddingLeft: 20, display: 'grid', gap: 4 }}>
        <li>Tap the tag with your phone. It should open this passport with a green “Chip verified just now” box.</li>
        <li>Tap again: it works again, with a higher tap number.</li>
        <li>Reload the page the first tap opened from the address bar history (the /tap link): it must say “This link was already used”.</li>
        <li>If it says “could not be verified”, check the keys, the three offsets and that the URL was written exactly.</li>
      </ol>
      {st && <p className="status">{st}</p>}
    </div>
  );
}
