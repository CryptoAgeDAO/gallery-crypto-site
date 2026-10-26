'use client';

// 管理画面「Security」タブ：守りの状態をひと目で（チェックリスト）＋ 暗号化バックアップ・検証・復元
import { useCallback, useEffect, useMemo, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { supabase } from '@/lib/supabase';
import { getDeviceKey, type DeviceKey } from '@/lib/deviceKey';
import { decryptBackup, encryptBackup, makePassphrase } from '@/lib/backupCrypto';
import { verifyKeyring, verifyLog, type GcppEntry, type SignedEntry, type SignedKey } from '@/lib/gcpp';
import { useAal } from '@/components/TwoStep';

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
  return d === null ? 'never' : d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
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
    { ok: factors > 0, title: 'Two-step sign-in', why: 'A stolen password alone cannot open the admin.', fix: () => goto('settings'), fixLabel: 'Settings' },
    { ok: (info?.passkeys?.length || 0) > 0, title: 'Face ID for every signature', why: 'Nothing is signed without your face, checked by the server.', fix: () => goto('passport'), fixLabel: 'Passport' },
    { ok: devActive, title: 'Founder key on this device', why: 'The second signature lives only inside your device.', fix: () => goto('passport'), fixLabel: 'Passport' },
    { ok: recovery, title: 'Offline recovery key', why: 'If every device is lost, this file approves a new one.', fix: () => goto('passport'), fixLabel: 'Passport' },
    { ok: dl !== null && dl <= 30, title: 'Encrypted backup (last 30 days)', why: `Your own copy of everything, sealed with a passphrase. Last: ${ago(info?.backups?.download)}.` },
    { ok: sn !== null && sn <= 2, title: 'Daily automatic snapshot', why: `Signed records saved every night at 3:00 JST. Last: ${ago(info?.backups?.snapshot)}.` },
    { ok: (info?.backups?.pending ?? 1) === 0, title: 'Everything anchored on Solana', why: `${info?.backups?.pending ?? '—'} records waiting. Balance ${info?.balance ?? '—'} SOL.` },
    { ok: Boolean(ring && (ring.ok || !info?.ring?.list.length)), title: 'Keyring verifies', why: 'Every key change was approved by an active key.' },
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
        throw new Error('Face ID was cancelled or did not match.');
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
    setSt('Collecting everything…');
    try {
      const data = await withFace('backup', {});
      setSt('Encrypting on this device…');
      const plain = JSON.stringify(data);
      const { file, sha256 } = await encryptBackup(plain, pass);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([file], { type: 'application/octet-stream' }));
      a.download = `gallery-crypto-backup-${new Date().toISOString().slice(0, 10)}.gcbak`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      await call({ action: 'backup-logged', sha256, bytes: file.length });
      const n = Object.values((data as Backup).tables).reduce((x, v) => x + v.length, 0);
      setSt(`Backup saved (${n} rows, ${(file.length / 1024).toFixed(0)} KB). Keep it on a USB stick or a second cloud — and the passphrase on paper, not next to the file.`);
      setPass('');
      setPass2('');
      setWrote(false);
      load();
    } catch (e) {
      setSt('Error: ' + (e as Error).message);
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
    setSt('Opening on this device…');
    try {
      const data = JSON.parse(await decryptBackup(await file.text(), rpass)) as Backup;
      setOpened({ data, v: verifyLocal(data) });
      setSt('');
    } catch (e) {
      setSt('Error: ' + (e as Error).message);
    }
    setBusy(false);
  };
  const restore = async () => {
    if (!opened || !confirm('Restore? Only missing rows are added back with their original numbers. Nothing that exists now is changed or deleted.')) return;
    setBusy(true);
    setSt('Restoring…');
    try {
      const r = await withFace('restore', { data: opened.data });
      const added = Object.entries(r.counts as Record<string, number>).filter(([k, v]) => v && !k.startsWith('warning')).map(([k, v]) => `${k} ${v}`).join(', ');
      setSt(`Restored. Added: ${added || 'nothing was missing'}.${(r.counts as Record<string, number>).warning_issuer_changed ? ' Warning: the server key differs from the backup — contact support before signing.' : ''}`);
      load();
    } catch (e) {
      setSt('Error: ' + (e as Error).message);
    }
    setBusy(false);
  };
  const snapshot = async () => {
    setBusy(true);
    setSt('Saving a snapshot…');
    const r = await call({ action: 'snapshot-now' });
    setBusy(false);
    setSt(r.ok ? `Snapshot saved (${r.j.day})${r.j.changed ? ' and anchored on Solana' : ''}.` : 'Error: ' + (r.j.error || 'failed'));
    load();
  };

  return (
    <>
      <div className="sec">
        <h4>Security · {score} / {checks.length}</h4>
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
        {!mfa && <p className="status">Sign in with two-step verification to make backups or sign records.</p>}
      </div>

      <div className="sec">
        <h4>Encrypted backup</h4>
        <p>
          One file with <b>everything</b>: pieces, texts, draw entries, orders, messages, events, every signed record, the keyring and the server key. It is encrypted <b>on this
          device</b> with your passphrase — the server never sees it. Photos and audio files stay in storage; their fingerprints are inside the records.
        </p>
        <p>Rule of three: keep one copy on a USB stick at home, one in a different cloud, and the passphrase on paper with the recovery key.</p>
        <div className="form">
          <label className="wide">Passphrase (12+ characters)
            <input type="text" autoComplete="off" spellCheck={false} value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
          <label className="wide">Repeat passphrase<input type="text" autoComplete="off" spellCheck={false} value={pass2} onChange={(e) => setPass2(e.target.value)} /></label>
          <label className="check wide"><input type="checkbox" checked={wrote} onChange={(e) => setWrote(e.target.checked)} />I wrote the passphrase on paper. Without it, nobody can open the backup — not even Gallery Crypto.</label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" onClick={() => { const p = makePassphrase(); setPass(p); setPass2(p); }}>Generate a strong passphrase</button>
          <button className="btn primary" disabled={busy || !passOk || !mfa} onClick={makeBackup}>Download encrypted backup</button>
          <button className="btn" disabled={busy || !mfa} onClick={snapshot}>Snapshot now</button>
        </div>
      </div>

      <div className="sec">
        <h4>Check or restore a backup</h4>
        <p>Open a backup on this device to prove it works — every signature is re-checked. Restore only adds what is missing; it never overwrites or deletes.</p>
        <div className="form">
          <label className="wide">Backup file<input type="file" accept=".gcbak,application/octet-stream,application/json" onChange={(e) => { setFile(e.target.files?.[0] || null); setOpened(null); }} /></label>
          <label className="wide">Passphrase<input type="text" autoComplete="off" spellCheck={false} value={rpass} onChange={(e) => setRpass(e.target.value)} /></label>
        </div>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" disabled={busy || !file || !rpass} onClick={openFile}>Open &amp; check</button>
          {opened && <button className="btn primary" disabled={busy || !opened.v.ok || !mfa} onClick={restore}>Restore missing data</button>}
        </div>
        {opened && (
          <div className={`pa-warn`} style={{ borderColor: opened.v.ok ? '#0b6b2c' : undefined }}>
            <p><b>{opened.v.ok ? 'Backup is intact ✓' : 'Backup has broken records ✕'}</b> · made {new Date(opened.data.created_at).toLocaleString('en-US')} · keyring {opened.v.keyringOk ? '✓' : '✕'} · {opened.v.pieces} pieces with records{opened.v.bad ? `, ${opened.v.bad} broken` : ''}</p>
            <p className="pa-hash">{Object.entries(opened.v.counts).filter(([, n]) => n).map(([k, n]) => `${k}: ${n}`).join(' · ')}</p>
            {info && opened.data.issuer !== info.issuer && <p className="status">This backup was made with a different server key ({opened.data.issuer.slice(0, 8)}…). Restoring into an empty database brings that key back.</p>}
          </div>
        )}
        {st && <p className="status">{st}</p>}
      </div>
    </>
  );
}
