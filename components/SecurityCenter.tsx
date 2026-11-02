'use client';

// 管理画面「Security」タブ：守りの状態をひと目で（チェックリスト）＋ 暗号化バックアップ・検証・復元
import { useCallback, useEffect, useMemo, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { supabase } from '@/lib/supabase';
import { getDeviceKey, type DeviceKey } from '@/lib/deviceKey';
import { decryptBackup, encryptBackup, makePassphrase } from '@/lib/backupCrypto';
import { verifyKeyring, verifyLog, type GcppEntry, type SignedEntry, type SignedKey } from '@/lib/gcpp';
import { useAal } from '@/components/TwoStep';
import { tt } from '@/components/Lang';

type Info = {
  issuer: string; permanent?: boolean; balance: number | null; chain: string;
  ring: { list: SignedKey[]; ok: boolean } | null;
  passkeys?: { id: number; label: string }[];
  backups?: { download: string | null; snapshot: string | null; restore: string | null; pending: number } | null;
};
type Backup = { format: string; created_at: string; issuer: string; tables: Record<string, Record<string, unknown>[]> };

async function call(body: Record<string, unknown>) {
  const { data } = await supabase()!.auth.getSession();
  const r = await fetch('/api/admin/passport', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token || ''}` }, body: JSON.stringify(body) });
  return { ok: r.ok, j: await r.json().catch(() => ({})) };
}
const daysAgo = (s: string | null | undefined) => (s ? Math.floor((Date.now() - Date.parse(s)) / 86400_000) : null);
const ago = (s: string | null | undefined) => {
  const d = daysAgo(s);
  return d === null ? tt('never', '未実施') : d === 0 ? tt('today', '今日') : d === 1 ? tt('yesterday', '昨日') : tt(`${d} days ago`, `${d}日前`);
};

// バックアップの中身をこの端末で検証（署名・鎖・鍵の台帳）
function verifyLocal(b: Backup) {
  const keyring = ((b.tables.passport_keys || []) as unknown as (SignedKey & { seq: number })[]).sort((x, y) => x.seq - y.seq);
  const kr = verifyKeyring(keyring, b.issuer);
  const byItem = new Map<string, (SignedEntry & { seq: number })[]>();
  ((b.tables.passport_log || []) as unknown as (SignedEntry & { item_id: string; seq: number })[]).forEach((l) => byItem.set(l.item_id, [...(byItem.get(l.item_id) || []), l]));
  let bad = 0;
  byItem.forEach((list) => {
    const sorted = list.sort((x, y) => x.seq - y.seq).map((l) => ({ entry: l.entry as GcppEntry, hash: l.hash, sig: l.sig, cosig: l.cosig, issuer: l.issuer }));
    if (!verifyLog(sorted, b.issuer, kr.keys).ok) bad++;
  });
  const counts = Object.fromEntries(Object.entries(b.tables).map(([k, v]) => [k, v.length]));
  return { ok: (keyring.length === 0 || kr.ok) && bad === 0, keyringOk: keyring.length === 0 || kr.ok, pieces: byItem.size, bad, counts };
}

export default function SecurityCenter({ goto }: { goto: (tab: 'settings' | 'passport') => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [dev, setDev] = useState<DeviceKey | null>(null);
  const [factors, setFactors] = useState(0);
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);
  const { aal } = useAal();
  const mfa = aal?.current === 'aal2';

  const load = useCallback(async () => {
    const r = await call({ action: 'info' });
    if (r.ok) setInfo(r.j);
    const { data } = await supabase()!.auth.mfa.listFactors();
    const d = data as unknown as { totp?: unknown[]; webauthn?: unknown[] } | null;
    setFactors((d?.totp?.length || 0) + (d?.webauthn?.length || 0));
  }, []);
  useEffect(() => { load(); getDeviceKey().then(setDev); }, [load]);

  const ring = useMemo(() => (info?.ring ? verifyKeyring(info.ring.list, info.issuer) : null), [info]);
  const active = ring ? Array.from(ring.keys.values()).filter((k) => !k.revoked) : [];
  const devActive = Boolean(dev && active.some((k) => k.key === dev.pub));
  const recovery = active.some((k) => /recovery/i.test(k.label));
  const dl = daysAgo(info?.backups?.download);
  const sn = daysAgo(info?.backups?.snapshot);

  const checks: { ok: boolean; title: string; why: string; fix?: () => void; fixLabel?: string }[] = [
    { ok: factors > 0, title: tt('Two-step sign-in', '2段階ログイン'), why: tt('A stolen password alone cannot open the admin.', 'パスワードを盗まれただけでは、管理画面は開けません。'), fix: () => goto('settings'), fixLabel: tt('Settings', '設定') },
    { ok: (info?.passkeys?.length || 0) > 0, title: tt('Face ID for every signature', '署名ごとの Face ID'), why: tt('Nothing is signed without your face, checked by the server.', 'あなたの顔認証なしには何も署名されず、サーバーがそれを確かめます。'), fix: () => goto('passport'), fixLabel: tt('Passport', 'パスポート') },
    { ok: devActive, title: tt('Founder key on this device', 'この端末の創業者の鍵'), why: tt('The second signature lives only inside your device.', '2つ目の署名は、あなたの端末の中だけにあります。'), fix: () => goto('passport'), fixLabel: tt('Passport', 'パスポート') },
    { ok: recovery, title: tt('Offline recovery key', 'オフラインの復旧鍵'), why: tt('If every device is lost, this file approves a new one.', 'すべての端末をなくしても、このファイルで新しい端末を承認できます。'), fix: () => goto('passport'), fixLabel: tt('Passport', 'パスポート') },
    { ok: dl !== null && dl <= 30, title: tt('Encrypted backup (last 30 days)', '暗号化バックアップ（30日以内）'), why: tt(`Your own copy of everything, sealed with a passphrase. Last: ${ago(info?.backups?.download)}.`, `パスフレーズで封じた、すべての控え。前回：${ago(info?.backups?.download)}。`) },
    { ok: sn !== null && sn <= 2, title: tt('Daily automatic snapshot', '毎日の自動スナップショット'), why: tt(`Signed records saved every night at 3:00 JST. Last: ${ago(info?.backups?.snapshot)}.`, `署名済みの記録を毎晩午前3時（日本時間）に保存。前回：${ago(info?.backups?.snapshot)}。`) },
    { ok: (info?.backups?.pending ?? 1) === 0, title: tt('Everything anchored on Solana', 'すべて Solana に刻印済み'), why: tt(`${info?.backups?.pending ?? '—'} records waiting. Balance ${info?.balance ?? '—'} SOL.`, `待機中の記録 ${info?.backups?.pending ?? '—'}件。残高 ${info?.balance ?? '—'} SOL。`) },
    { ok: Boolean(ring && (ring.ok || !info?.ring?.list.length)), title: tt('Keyring verifies', '鍵の台帳の検証が通る'), why: tt('Every key change was approved by an active key.', '鍵の変更はすべて、有効な鍵が承認しています。') },
  ];
  const score = checks.filter((c) => c.ok).length;

  // ── 顔認証つきの往復 ──
  const withFace = async (kind: 'backup' | 'restore', extra: Record<string, unknown>) => {
    const b = await call({ action: `${kind}-begin` });
    if (!b.ok) throw new Error(b.j.error === 'mfa-required' ? 'Sign in with two-step verification first.' : b.j.error || 'failed');
    let face;
    if (b.j.face) {
      try {
        face = await startAuthentication({ optionsJSON: b.j.face });
      } catch {
        throw new Error(tt('Face ID was cancelled or did not match.', 'Face ID がキャンセルされたか、一致しませんでした。'));
      }
    }
    const r = await call({ action: kind === 'backup' ? 'backup-get' : 'restore', nonce: b.j.nonce, exp: b.j.exp, token: b.j.token, face, ...extra });
    if (!r.ok) throw new Error(r.j.error || 'failed');
    return r.j;
  };

  // ── バックアップ ──
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [wrote, setWrote] = useState(false);
  const passOk = pass.length >= 12 && pass === pass2 && wrote;
  const makeBackup = async () => {
    setBusy(true);
    setSt(tt('Collecting everything…', 'すべて集めています…'));
    try {
      const data = await withFace('backup', {});
      setSt(tt('Encrypting on this device…', 'この端末で暗号化中…'));
      const plain = JSON.stringify(data);
      const { file, sha256 } = await encryptBackup(plain, pass);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([file], { type: 'application/octet-stream' }));
      a.download = `gallery-crypto-backup-${new Date().toISOString().slice(0, 10)}.gcbak`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      await call({ action: 'backup-logged', sha256, bytes: file.length });
      const n = Object.values((data as Backup).tables).reduce((x, v) => x + v.length, 0);
      setSt(tt(`Backup saved (${n} rows, ${(file.length / 1024).toFixed(0)} KB). Keep it on a USB stick or a second cloud — and the passphrase on paper, not next to the file.`, `バックアップを保存しました（${n}行、${(file.length / 1024).toFixed(0)} KB）。USBメモリか別のクラウドに保管し、パスフレーズはファイルのそばではなく紙に書いておいてください。`));
      setPass('');
      setPass2('');
      setWrote(false);
      load();
    } catch (e) {
      setSt(tt('Error: ', 'エラー：') + (e as Error).message);
    }
    setBusy(false);
  };

  // ── 検証・復元 ──
  const [file, setFile] = useState<File | null>(null);
  const [rpass, setRpass] = useState('');
  const [opened, setOpened] = useState<{ data: Backup; v: ReturnType<typeof verifyLocal> } | null>(null);
  const openFile = async () => {
    if (!file) return;
    setBusy(true);
    setSt(tt('Opening on this device…', 'この端末で開いています…'));
    try {
      const data = JSON.parse(await decryptBackup(await file.text(), rpass)) as Backup;
      setOpened({ data, v: verifyLocal(data) });
      setSt('');
    } catch (e) {
      setSt(tt('Error: ', 'エラー：') + (e as Error).message);
    }
    setBusy(false);
  };
  const restore = async () => {
    if (!opened || !confirm(tt('Restore? Only missing rows are added back with their original numbers. Nothing that exists now is changed or deleted.', '復元しますか？足りない行だけを元の番号で戻します。今あるものは変更も削除もしません。'))) return;
    setBusy(true);
    setSt(tt('Restoring…', '復元中…'));
    try {
      const r = await withFace('restore', { data: opened.data });
      const added = Object.entries(r.counts as Record<string, number>).filter(([k, v]) => v && !k.startsWith('warning')).map(([k, v]) => `${k} ${v}`).join(', ');
      setSt(`Restored. Added: ${added || tt('nothing was missing', '足りないものはありませんでした')}.${(r.counts as Record<string, number>).warning_issuer_changed ? ' Warning: the server key differs from the backup — contact support before signing.' : ''}`);
      load();
    } catch (e) {
      setSt(tt('Error: ', 'エラー：') + (e as Error).message);
    }
    setBusy(false);
  };
  const snapshot = async () => {
    setBusy(true);
    setSt(tt('Saving a snapshot…', 'スナップショットを保存中…'));
    const r = await call({ action: 'snapshot-now' });
    setBusy(false);
    setSt(r.ok ? `Snapshot saved (${r.j.day})${r.j.changed ? ' and anchored on Solana' : ''}.` : tt('Error: ', 'エラー：') + (r.j.error || 'failed'));
    load();
  };

  return (
    <>
      <div className="sec">
        <h4>{tt('Security', 'セキュリティ')} · {score} / {checks.length}</h4>
        <div className={`pa-meter${score === checks.length ? ' full' : ''}`}><i style={{ width: `${(score / checks.length) * 100}%` }} /></div>
        <ol className="sc-list">
          {checks.map((c) => (
            <li key={c.title} className={c.ok ? 'ok' : ''}>
              <span className="sc-mark">{c.ok ? '✓' : '!'}</span>
              <span><b>{c.title}</b><br /><small>{c.why}</small></span>
              {!c.ok && c.fix && <button className="btn" style={{ padding: '2px 10px', fontSize: 14 }} onClick={c.fix}>{c.fixLabel}</button>}
            </li>
          ))}
        </ol>
        {!mfa && <p className="status">{tt('Sign in with two-step verification to make backups or sign records.', 'バックアップの作成や記録への署名には、2段階認証でログインしてください。')}</p>}
      </div>

      <div className="sec">
        <h4>{tt('Encrypted backup', '暗号化バックアップ')}</h4>
        <p>
          {tt('One file with', '1つのファイルに')} <b>{tt('everything', 'すべて')}</b>{tt(': pieces, texts, draw entries, orders, messages, events, every signed record, the keyring and the server key. It is encrypted', '：作品、文言、抽選の応募、注文、メッセージ、イベント、署名済みの記録すべて、鍵の台帳、サーバーの鍵。暗号化は')} <b>{tt('on this device', 'この端末で')}</b> {tt('with your passphrase — the server never sees it. Photos and audio files stay in storage; their fingerprints are inside the records.', 'あなたのパスフレーズで行い、サーバーは中身を見ません。写真と音声ファイルは保管場所に残り、その指紋は記録の中に入っています。')}
        </p>
        <p>{tt('Rule of three: keep one copy on a USB stick at home, one in a different cloud, and the passphrase on paper with the recovery key.', '3つのルール：1つは自宅のUSBメモリに、1つは別のクラウドに、パスフレーズは紙に書いて復旧鍵と一緒に保管します。')}</p>
        <div className="form">
          <label className="wide">{tt('Passphrase (12+ characters)', 'パスフレーズ（12文字以上）')}
            <input type="text" autoComplete="off" spellCheck={false} value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
          <label className="wide">{tt('Repeat passphrase', 'パスフレーズをもう一度')}<input type="text" autoComplete="off" spellCheck={false} value={pass2} onChange={(e) => setPass2(e.target.value)} /></label>
          <label className="check wide"><input type="checkbox" checked={wrote} onChange={(e) => setWrote(e.target.checked)} />{tt('I wrote the passphrase on paper. Without it, nobody can open the backup — not even Gallery Crypto.', 'パスフレーズを紙に書きました。これがないと、誰もバックアップを開けません — Gallery Crypto でさえ。')}</label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" onClick={() => { const p = makePassphrase(); setPass(p); setPass2(p); }}>{tt('Generate a strong passphrase', '強いパスフレーズを作る')}</button>
          <button className="btn primary" disabled={busy || !passOk || !mfa} onClick={makeBackup}>{tt('Download encrypted backup', '暗号化バックアップをダウンロード')}</button>
          <button className="btn" disabled={busy || !mfa} onClick={snapshot}>{tt('Snapshot now', 'いまスナップショット')}</button>
        </div>
      </div>

      <div className="sec">
        <h4>{tt('Check or restore a backup', 'バックアップの確認・復元')}</h4>
        <p>{tt('Open a backup on this device to prove it works — every signature is re-checked. Restore only adds what is missing; it never overwrites or deletes.', 'この端末でバックアップを開いて、使えることを確かめます — 署名はすべて確認し直します。復元は足りないものだけを追加し、上書きや削除はしません。')}</p>
        <div className="form">
          <label className="wide">{tt('Backup file', 'バックアップファイル')}<input type="file" accept=".gcbak,application/octet-stream,application/json" onChange={(e) => { setFile(e.target.files?.[0] || null); setOpened(null); }} /></label>
          <label className="wide">{tt('Passphrase', 'パスフレーズ')}<input type="text" autoComplete="off" spellCheck={false} value={rpass} onChange={(e) => setRpass(e.target.value)} /></label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" disabled={busy || !file || !rpass} onClick={openFile}>{tt('Open & check', '開いて確認')}</button>
          {opened && <button className="btn primary" disabled={busy || !opened.v.ok || !mfa} onClick={restore}>{tt('Restore missing data', '足りないデータを復元')}</button>}
        </div>
        {opened && (
          <div className={`pa-warn`} style={{ borderColor: opened.v.ok ? '#0b6b2c' : undefined }}>
            <p><b>{opened.v.ok ? tt('Backup is intact ✓', 'バックアップは無事です ✓') : tt('Backup has broken records ✕', 'バックアップに壊れた記録があります ✕')}</b> · made {new Date(opened.data.created_at).toLocaleString('en-US')} · keyring {opened.v.keyringOk ? '✓' : '✕'} · {opened.v.pieces} pieces with records{opened.v.bad ? `, ${opened.v.bad} broken` : ''}</p>
            <p className="pa-hash">{Object.entries(opened.v.counts).filter(([, n]) => n).map(([k, n]) => `${k}: ${n}`).join(' · ')}</p>
            {info && opened.data.issuer !== info.issuer && <p className="status">This backup was made with a different server key ({opened.data.issuer.slice(0, 8)}…). Restoring into an empty database brings that key back.</p>}
          </div>
        )}
        {st && <p className="status">{st}</p>}
      </div>
    </>
  );
}
