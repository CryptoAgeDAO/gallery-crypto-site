'use client';

// 管理画面「Passport」：NFC タグ（NTAG 424 DNA）に書き込む設定を出す ＋ 試し方
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { tt } from '@/components/Lang';

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
    const t = setTimeout(() => { setS(null); setSt(tt('Keys hidden.', '鍵を隠しました。')); }, 120_000);
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
      if (!r.ok) setSt(r.status === 401 ? tt('Not allowed — sign in again with your 6-digit code.', '許可されていません — 6桁のコードでもう一度ログインしてください。') : j.error || tt('Could not load settings', '設定を読み込めませんでした'));
      else setS(j);
    } finally {
      setBusy(false);
    }
  };
  const copy = (v: string, what: string) => navigator.clipboard.writeText(v).then(() => setSt(tt(`${what} copied`, `${what}をコピーしました`)), () => setSt(tt('Could not copy', 'コピーできませんでした')));

  const Row = ({ k, v, what }: { k: string; v: string; what: string }) => (
    <tr><th>{k}</th><td className="pa-hash">{v}</td><td><button className="btn" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => copy(v, what)}>{tt('Copy', 'コピー')}</button></td></tr>
  );

  return (
    <div className="sec">
      <h4>NFC tag · {cert}</h4>
      <p>
        {tt('Settings to write into this piece\'s NTAG 424 DNA tag, so every tap opens the passport marked “Chip verified just now”. Read the tag\'s UID with the writing app first. The keys are made fresh for this UID and are not stored — copy them into the app, write the tag, then close this.', 'この作品の NTAG 424 DNA タグに書き込む設定です。書き込むと、タップのたびに「いまタップでチップを確認しました」の印つきでパスポートが開きます。先に書き込みアプリでタグのUIDを読み取ってください。鍵はこのUIDに合わせてその場で作り、保存しません — アプリにコピーしてタグに書き込んだら、この表示を閉じてください。')}
      </p>
      <div className="row" style={{ justifyContent: 'flex-start', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: 4 }}>{tt('Chip UID (14 characters)', 'チップのUID（14桁）')}
          <input type="text" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="04A1B2C3D4E5F6" style={{ fontFamily: 'var(--mono)' }} />
        </label>
        <button className="btn primary" disabled={busy || clean.length !== 14} onClick={show}>{tt('Show tag settings', 'タグの設定を表示')}</button>
        {s && <button className="btn" onClick={() => { setS(null); setSt(tt('Keys hidden.', '鍵を隠しました。')); }}>{tt('Hide', '隠す')}</button>}
      </div>
      {initial && clean !== initial.replace(/[^0-9a-fA-F]/g, '').toUpperCase() && <p className="status">This UID differs from the one in the record ({initial}).</p>}
      {!initial && <p className="status">{tt('Tip: also enter this UID in “NFC chip UID” above and seal, so taps open this passport.', 'ヒント：このUIDを上の「NFCチップのUID」にも入れて確定すると、タップでこのパスポートが開きます。')}</p>}

      {s && (
        <div className="tablewrap" style={{ marginTop: 10 }}>
          <table>
            <tbody>
              <Row k="URL (NDEF, https://)" v={s.url} what="URL" />
              <Row k="SDM meta read key" v={s.keys.sdmMetaRead} what="Meta read key" />
              <Row k="SDM file read key" v={s.keys.sdmFileRead} what="File read key" />
              <tr><th>{tt('PICC data offset', 'PICC データのオフセット')}</th><td className="pa-hash">{s.sdm.piccDataOffset}</td><td /></tr>
              <tr><th>{tt('SDM MAC input offset', 'SDM MAC 入力のオフセット')}</th><td className="pa-hash">{s.sdm.sdmMacInputOffset}</td><td /></tr>
              <tr><th>{tt('SDM MAC offset', 'SDM MAC のオフセット')}</th><td className="pa-hash">{s.sdm.sdmMacOffset}</td><td /></tr>
              <tr><th>{tt('File', 'ファイル')}</th><td colSpan={2}>{s.sdm.file}</td></tr>
              <tr><th>{tt('Options', 'オプション')}</th><td colSpan={2}>{s.sdm.options}</td></tr>
            </tbody>
          </table>
          <p className="status">{s.note} Hidden automatically after 2 minutes.</p>
        </div>
      )}

      <h5 style={{ marginTop: 16 }}>{tt('Test a written tag', '書き込んだタグを試す')}</h5>
      <ol style={{ margin: '4px 0 0', paddingLeft: 20, display: 'grid', gap: 4 }}>
        <li>{tt('Tap the tag with your phone. It should open this passport with a green “Chip verified just now” box.', 'スマホでタグをタップします。緑の「いまタップでチップを確認しました」の枠つきで、このパスポートが開けば成功です。')}</li>
        <li>{tt('Tap again: it works again, with a higher tap number.', 'もう一度タップします：タップの回数が増えて、また開きます。')}</li>
        <li>{tt('Reload the page the first tap opened from the address bar history (the /tap link): it must say “This link was already used”.', '最初のタップで開いたページ（/tap のリンク）を、アドレスバーの履歴から開き直します：「このリンクは使用済みです」と出れば正常です。')}</li>
        <li>{tt('If it says “could not be verified”, check the keys, the three offsets and that the URL was written exactly.', '「確認できませんでした」と出たら、鍵、3つのオフセット、URLが正確に書き込まれているかを確かめてください。')}</li>
      </ol>
      {st && <p className="status">{st}</p>}
    </div>
  );
}
