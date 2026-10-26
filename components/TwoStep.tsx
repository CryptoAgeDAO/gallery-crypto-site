'use client';

// 2段階認証（認証アプリの6桁コード）：設定画面での登録と、ログイン時の確認
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Factor = { id: string; friendly_name?: string; status: string; created_at: string; factor_type: string };

export function useAal() {
  const [aal, setAal] = useState<{ current: string | null; next: string | null } | null>(null);
  const refresh = useCallback(async () => {
    if (!supabase()) return;
    const { data } = await supabase()!.auth.mfa.getAuthenticatorAssuranceLevel();
    setAal({ current: data?.currentLevel ?? null, next: data?.nextLevel ?? null });
  }, []);
  useEffect(() => {
    refresh();
    if (!supabase()) return;
    const { data } = supabase()!.auth.onAuthStateChange(() => { setTimeout(refresh, 0); });
    return () => data.subscription.unsubscribe();
  }, [refresh]);
  return { aal, refresh };
}

const codeOk = (c: string) => /^\d{6}$/.test(c);

// ログイン直後：6桁コードの入力
export function MfaChallenge({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setSt('Checking…');
    const db = supabase()!;
    const { data: f } = await db.auth.mfa.listFactors();
    const factor = f?.totp?.[0];
    if (!factor) { setBusy(false); return setSt('No authenticator is registered.'); }
    // 複数登録している場合は、どれかで通れば OK
    let ok = false;
    for (const fx of f!.totp) {
      const { error } = await db.auth.mfa.challengeAndVerify({ factorId: fx.id, code });
      if (!error) { ok = true; break; }
    }
    setBusy(false);
    if (!ok) return setSt('That code did not work. Check the time on your phone and try the newest code.');
    setSt('');
    onDone();
  };
  return (
    <form className="sec" style={{ maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); if (codeOk(code)) submit(); }}>
      <h4>Two-step sign-in</h4>
      <p>Open your authenticator app and enter the 6-digit code for Gallery Crypto.</p>
      <div className="form">
        <label className="wide">Code<input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={() => supabase()!.auth.signOut()}>Sign out</button>
        <button className="btn primary" disabled={busy || !codeOk(code)}>Verify</button>
      </div>
      {st && <p className="status">{st}</p>}
    </form>
  );
}

// 設定画面：登録・予備の追加・解除
export function TwoStepSettings() {
  const db = supabase()!;
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);
  const { aal, refresh } = useAal();

  const load = useCallback(async () => {
    const { data } = await db.auth.mfa.listFactors();
    setFactors(((data?.totp as Factor[]) || []).filter((f) => f.status === 'verified'));
  }, [db]);
  useEffect(() => { load(); }, [load]);

  const start = async (backup: boolean) => {
    setBusy(true);
    setSt('');
    // 途中でやめた登録が残っていれば片付ける
    const { data } = await db.auth.mfa.listFactors();
    for (const f of (data?.all as Factor[]) || []) if (f.status !== 'verified') await db.auth.mfa.unenroll({ factorId: f.id });
    const { data: e, error } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: `${backup ? 'Backup' : 'Main'} authenticator ${new Date().toISOString().slice(0, 16)}` });
    setBusy(false);
    if (error || !e) return setSt('Could not start: ' + (error?.message || 'unknown'));
    setEnroll({ id: e.id, qr: e.totp.qr_code, secret: e.totp.secret });
    setCode('');
  };
  const confirmCode = async () => {
    if (!enroll) return;
    setBusy(true);
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
    setBusy(false);
    if (error) return setSt('That code did not work. Try the newest code.');
    setEnroll(null);
    setSt('Two-step sign-in is on. From now on, signing in needs your password and a code from the app.');
    load();
    refresh();
  };
  const remove = async (f: Factor) => {
    if (factors.length === 1 && !confirm('Turn off two-step sign-in? Records can no longer be signed until you turn it on again.')) return;
    if (factors.length > 1 && !confirm(`Remove "${f.friendly_name || 'authenticator'}"?`)) return;
    const { error } = await db.auth.mfa.unenroll({ factorId: f.id });
    setSt(error ? 'Error: ' + error.message : 'Removed');
    load();
    refresh();
  };

  return (
    <div className="sec">
      <h4>Two-step sign-in</h4>
      <p>
        Protects the admin even if your password leaks: signing in also needs a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator,
        1Password, iPhone Passwords…). It is required to sign provenance records.
      </p>
      {factors.length > 0 ? (
        <>
          <p><b style={{ color: '#0b6b2c' }}>On ✓</b> · this session: {aal?.current === 'aal2' ? 'verified with a code ✓' : 'not verified yet'}</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {factors.map((f) => (
              <li key={f.id}>
                {f.friendly_name || 'Authenticator'} · added {new Date(f.created_at).toLocaleDateString('en-US')}{' '}
                {aal?.current === 'aal2' && <button className="btn danger" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => remove(f)}>Remove</button>}
              </li>
            ))}
          </ul>
          {factors.length === 1 && aal?.current === 'aal2' && !enroll && (
            <p style={{ marginTop: 8 }}>Recommended: add a backup authenticator on a second phone or a password manager, in case you lose this one. <button className="btn" disabled={busy} onClick={() => start(true)}>Add a backup</button></p>
          )}
        </>
      ) : (
        !enroll && <button className="btn primary" disabled={busy} onClick={() => start(false)}>Turn on two-step sign-in</button>
      )}
      {enroll && (
        <div className="pa-warn" style={{ marginTop: 8 }}>
          <p><b>1.</b> In your authenticator app, add an account and scan this code:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="QR code for your authenticator app" width={180} height={180} style={{ background: '#fff', padding: 6, border: '2px solid #111' }} />
          <p className="pa-hash">Can&apos;t scan? Enter this key by hand: <b>{enroll.secret}</b></p>
          <p><b>2.</b> Enter the 6-digit code the app shows:</p>
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ width: 120 }} />
            <button className="btn primary" disabled={busy || !codeOk(code)} onClick={confirmCode}>Confirm</button>
            <button className="btn" onClick={() => setEnroll(null)}>Cancel</button>
          </div>
        </div>
      )}
      {st && <p className="status">{st}</p>}
    </div>
  );
}
