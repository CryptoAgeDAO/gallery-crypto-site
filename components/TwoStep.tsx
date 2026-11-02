'use client';

// 2段階認証（認証アプリの6桁コード）：設定画面での登録と、ログイン時の確認
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { tt } from '@/components/Lang';

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
const deviceLabel = () =>
  /iPhone|iPad/.test(navigator.userAgent) ? 'Face ID · iPhone' : /Mac/.test(navigator.userAgent) ? 'Touch ID · Mac' : /Android/.test(navigator.userAgent) ? tt('Biometrics · Android', '生体認証 · Android') : tt('Biometrics', '生体認証');

export function MfaChallenge({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);
  const [kinds, setKinds] = useState<{ totp: Factor[]; webauthn: Factor[] }>({ totp: [], webauthn: [] });
  useEffect(() => {
    supabase()!.auth.mfa.listFactors().then(({ data }) => {
      const d = data as unknown as { totp?: Factor[]; webauthn?: Factor[] } | null;
      setKinds({ totp: d?.totp || [], webauthn: d?.webauthn || [] });
    });
  }, []);
  const withFace = async () => {
    setBusy(true);
    setSt(tt('Look at your device…', '端末を見てください…'));
    for (const f of kinds.webauthn) {
      const { error } = await supabase()!.auth.mfa.webauthn.authenticate({ factorId: f.id });
      if (!error) { setBusy(false); setSt(''); return onDone(); }
    }
    setBusy(false);
    setSt(kinds.totp.length ? tt('Face ID did not work here. Use the 6-digit code instead.', 'ここでは Face ID が使えませんでした。代わりに6桁のコードを使ってください。') : tt('Face ID did not work. Try again.', 'Face ID が使えませんでした。もう一度お試しください。'));
  };
  const submit = async () => {
    setBusy(true);
    setSt(tt('Checking…', '確認中…'));
    const db = supabase()!;
    const { data: f } = await db.auth.mfa.listFactors();
    const factor = f?.totp?.[0];
    if (!factor) { setBusy(false); return setSt(tt('No authenticator is registered.', '認証アプリが登録されていません。')); }
    // 複数登録している場合は、どれかで通れば OK
    let ok = false;
    for (const fx of f!.totp) {
      const { error } = await db.auth.mfa.challengeAndVerify({ factorId: fx.id, code });
      if (!error) { ok = true; break; }
    }
    setBusy(false);
    if (!ok) return setSt(tt('That code did not work. Check the time on your phone and try the newest code.', 'そのコードは使えませんでした。スマホの時刻を確認し、最新のコードを入れてください。'));
    setSt('');
    onDone();
  };
  return (
    <form className="sec" style={{ maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); if (codeOk(code)) submit(); }}>
      <h4>{tt('Two-step sign-in', '2段階ログイン')}</h4>
      {kinds.webauthn.length > 0 && (
        <div className="row" style={{ justifyContent: 'flex-start', marginBottom: 8 }}>
          <button type="button" className="btn primary" disabled={busy} onClick={withFace}>{tt('Use Face ID / Touch ID', 'Face ID / Touch ID を使う')}</button>
        </div>
      )}
      {(kinds.totp.length > 0 || !kinds.webauthn.length) && <>
      <p>{kinds.webauthn.length ? tt('Or enter', 'または入力：') : tt('Open your authenticator app and enter', '認証アプリを開いて、')} {tt('the 6-digit code for Gallery Crypto.', 'Gallery Crypto の6桁のコードを入力してください。')}</p>
      <div className="form">
        <label className="wide">{tt('Code', 'コード')}<input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={() => supabase()!.auth.signOut()}>{tt('Sign out', 'ログアウト')}</button>
        <button className="btn primary" disabled={busy || !codeOk(code)}>{tt('Verify', '確認')}</button>
      </div>
      </>}
      {st && <p className="status">{st}</p>}
    </form>
  );
}

// 設定画面：登録・予備の追加・解除
export function TwoStepSettings() {
  const db = supabase()!;
  const [factors, setFactors] = useState<Factor[]>([]);
  const [faceF, setFaceF] = useState<Factor[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);
  const { aal, refresh } = useAal();

  const load = useCallback(async () => {
    const { data } = await db.auth.mfa.listFactors();
    setFactors(((data?.totp as Factor[]) || []).filter((f) => f.status === 'verified'));
    setFaceF((((data as unknown as { webauthn?: Factor[] })?.webauthn) || []).filter((f) => f.status === 'verified'));
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
    if (error || !e) return setSt(tt('Could not start: ', '開始できませんでした：') + (error?.message || 'unknown'));
    setEnroll({ id: e.id, qr: e.totp.qr_code, secret: e.totp.secret });
    setCode('');
  };
  const confirmCode = async () => {
    if (!enroll) return;
    setBusy(true);
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
    setBusy(false);
    if (error) return setSt(tt('That code did not work. Try the newest code.', 'そのコードは使えませんでした。最新のコードを入れてください。'));
    setEnroll(null);
    setSt(tt('Two-step sign-in is on. From now on, signing in needs your password and a code from the app.', '2段階ログインをオンにしました。これからはパスワードとアプリのコードでログインします。'));
    load();
    refresh();
  };
  const addFace = async () => {
    setBusy(true);
    setSt(tt('Follow the Face ID / Touch ID prompt…', 'Face ID / Touch ID の案内に従ってください…'));
    const { error } = await db.auth.mfa.webauthn.register({ friendlyName: `${deviceLabel()} ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error) {
      const m = error.message || '';
      return setSt(/disabled|not enabled|not supported|unsupported/i.test(m) ? tt('Face ID sign-in is switched off for this project. In Supabase: Authentication → Multi-Factor → WebAuthn → Enabled, then try again. Until then, use the 6-digit code.', 'このプロジェクトでは Face ID でのログインがオフです。Supabase で Authentication → Multi-Factor → WebAuthn → Enabled にしてから、もう一度お試しください。それまでは6桁のコードを使ってください。') : tt('Could not add Face ID: ', 'Face ID を追加できませんでした：') + m);
    }
    setSt(tt('Face ID sign-in added. Next time you can sign in with your face instead of a code.', 'Face ID でのログインを追加しました。次からはコードの代わりに顔でログインできます。'));
    load();
    refresh();
  };
  const remove = async (f: Factor) => {
    if (factors.length === 1 && !confirm(tt('Turn off two-step sign-in? Records can no longer be signed until you turn it on again.', '2段階ログインをオフにしますか？もう一度オンにするまで、記録に署名できなくなります。'))) return;
    if (factors.length > 1 && !confirm(tt(`Remove "${f.friendly_name || 'authenticator'}"?`, `「${f.friendly_name || '認証アプリ'}」を削除しますか？`))) return;
    const { error } = await db.auth.mfa.unenroll({ factorId: f.id });
    setSt(error ? tt('Error: ', 'エラー：') + error.message : tt('Removed', '削除しました'));
    load();
    refresh();
  };

  return (
    <div className="sec">
      <h4>{tt('Two-step sign-in', '2段階ログイン')}</h4>
      <p>
        {tt('Protects the admin even if your password leaks: signing in also needs a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, iPhone Passwords…). It is required to sign provenance records.', 'パスワードが漏れても管理画面を守ります。ログインには、スマホの認証アプリ（Google Authenticator、Microsoft Authenticator、1Password、iPhone のパスワードなど）の6桁のコードも必要になります。来歴の記録に署名するには必須です。')}
      </p>
      {factors.length > 0 ? (
        <>
          <p><b style={{ color: '#0b6b2c' }}>{tt('On ✓', 'オン ✓')}</b> · {tt('this session:', 'このログイン：')} {aal?.current === 'aal2' ? tt('verified with a code ✓', 'コードで確認済み ✓') : tt('not verified yet', '未確認')}</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {factors.map((f) => (
              <li key={f.id}>
                {f.friendly_name || tt('Authenticator', '認証アプリ')} · {tt('added', '追加日')} {new Date(f.created_at).toLocaleDateString(tt('en-US', 'ja-JP'))}{' '}
                {aal?.current === 'aal2' && <button className="btn danger" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => remove(f)}>{tt('Remove', '外す')}</button>}
              </li>
            ))}
          </ul>
          {factors.length === 1 && aal?.current === 'aal2' && !enroll && (
            <p style={{ marginTop: 8 }}>{tt('Recommended: add a backup authenticator on a second phone or a password manager, in case you lose this one.', 'おすすめ：このスマホをなくしたときのために、2台目のスマホやパスワード管理アプリに予備の認証アプリを追加してください。')} <button className="btn" disabled={busy} onClick={() => start(true)}>{tt('Add a backup', '予備を追加')}</button></p>
          )}
        </>
      ) : (
        !enroll && <button className="btn primary" disabled={busy} onClick={() => start(false)}>{tt('Turn on two-step sign-in', '2段階ログインをオンにする')}</button>
      )}
      <div style={{ marginTop: 10 }}>
        <p><b>{tt('Face ID / Touch ID sign-in', 'Face ID / Touch ID でのログイン')}</b> {tt('— use your face instead of typing a code.', '— コードを入力する代わりに顔を使います。')}</p>
        {faceF.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {faceF.map((f) => (
              <li key={f.id}>{f.friendly_name || 'Face ID'} {aal?.current === 'aal2' && <button className="btn danger" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => remove(f)}>{tt('Remove', '外す')}</button>}</li>
            ))}
          </ul>
        )}
        {(aal?.current === 'aal2' || (!factors.length && !faceF.length)) && <button className="btn" disabled={busy} onClick={addFace}>{tt('Add Face ID on this device', 'この端末に Face ID を追加')}</button>}
      </div>
      {enroll && (
        <div className="pa-warn" style={{ marginTop: 8 }}>
          <p><b>1.</b> {tt('In your authenticator app, add an account and scan this code:', '認証アプリでアカウントを追加し、このコードを読み取ってください：')}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="QR code for your authenticator app" width={180} height={180} style={{ background: '#fff', padding: 6, border: '2px solid #111' }} />
          <p className="pa-hash">{tt('Can\'t scan? Enter this key by hand:', '読み取れない場合は、このキーを手で入力してください：')} <b>{enroll.secret}</b></p>
          <p><b>2.</b> {tt('Enter the 6-digit code the app shows:', 'アプリに表示された6桁のコードを入力：')}</p>
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ width: 120 }} />
            <button className="btn primary" disabled={busy || !codeOk(code)} onClick={confirmCode}>{tt('Confirm', '確認')}</button>
            <button className="btn" onClick={() => setEnroll(null)}>{tt('Cancel', '取り消す')}</button>
          </div>
        </div>
      )}
      {st && <p className="status">{st}</p>}
    </div>
  );
}
