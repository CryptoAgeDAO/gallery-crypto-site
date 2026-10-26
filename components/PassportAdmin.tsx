'use client';

// 管理画面「Passport」タブ：DPP に沿った記録の入力 → 確定（署名）→ 出来事の追記 → Solana への刻印
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, photoUrl } from '@/lib/supabase';
import { PASSPORT_SQL } from '@/lib/passportSql';
import { DPP_SECTIONS, EVENT_TYPES, cleanDpp, completeness, eventLabel, mergeDpp, prefill, type Composition, type Dpp, type PhotoHash } from '@/lib/dpp';
import { canonical, explorerAddr, explorerTx, hashEntry, keyId, sha256hex, verifyKeyring, type GcppEntry, type KeyEntry, type SignedKey } from '@/lib/gcpp';
import { useAal } from '@/components/TwoStep';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { createDeviceKey, createRecoveryKey, deviceSupported, download, getDeviceKey, importRecoveryKey, signHash, type DeviceKey } from '@/lib/deviceKey';
import { certNo, type Item } from '@/lib/types';

type LogRow = { id: number; item_id: string; seq: number; kind: string; hash: string; anchor_id: number | null; created_at: string; entry: { data: Record<string, unknown> } };
type Info = { issuer: string; permanent?: boolean; problem?: string; setup?: string; chain: string; balance: number | null; ring: { list: SignedKey[]; ok: boolean } | null; passkeys?: { id: number; label: string; created_at: string; last_used_at: string | null }[] };

async function hashBytes(buf: ArrayBuffer) {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function call(body: Record<string, unknown>) {
  const { data } = await supabase()!.auth.getSession();
  const r = await fetch('/api/admin/passport', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token || ''}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

export default function PassportAdmin() {
  const db = supabase()!;
  const [items, setItems] = useState<Item[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [dpp, setDpp] = useState<Dpp | null>(null);
  const [dirty, setDirty] = useState(false);
  const [st, setSt] = useState('');
  const [missing, setMissing] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [funds, setFunds] = useState(false);
  const [ev, setEv] = useState({ type: 'sourced', date: '', actor: '', place: '', note: '' });
  const [busy, setBusy] = useState(false);
  const item = items.find((i) => i.id === sel) || null;

  // ── 創業者の端末の鍵 ──
  const [dev, setDev] = useState<DeviceKey | null>(null);
  useEffect(() => { getDeviceKey().then(setDev); }, []);
  const ringList = info?.ring?.list || [];
  const ringV = useMemo(() => verifyKeyring(ringList, info?.issuer || ''), [ringList, info?.issuer]);
  const { aal } = useAal();
  const mfa = aal?.current === 'aal2';
  const devActive = mfa && Boolean(dev && ringV.keys.get(dev.pub) && !ringV.keys.get(dev.pub)!.revoked);
  const refreshInfo = () => call({ action: 'info' }).then(({ ok, j }) => ok && setInfo(j));

  // ── 署名のたびの顔認証（Face ID / Touch ID） ──
  const faces = info?.passkeys || [];
  const [faceHere, setFaceHere] = useState(false);
  useEffect(() => { try { setFaceHere(localStorage.getItem('gc-face-here') === '1'); } catch {} }, []);
  const face = async (opts: unknown) => {
    if (!opts) throw new Error('Register Face ID for signing first (Founder keys).');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await startAuthentication({ optionsJSON: opts as any });
    } catch {
      throw new Error('Face ID was cancelled or did not match.');
    }
  };
  const registerFace = async (auth?: { pub: string; priv: CryptoKey }) => {
    const o = await call({ action: 'passkey-options' });
    if (!o.ok) throw new Error(o.j.error || 'failed');
    let resp;
    try {
      resp = await startRegistration({ optionsJSON: o.j.options });
    } catch (e) {
      const m = String((e as Error & { code?: string }).code || (e as Error).message);
      if (/PREVIOUSLY_REGISTERED|already|exclude/i.test(m)) {
        // この端末の Face ID は登録済み（同期されたパスキーなど）
        try { localStorage.setItem('gc-face-here', '1'); } catch {}
        setFaceHere(true);
        return;
      }
      throw new Error('Face ID setup was cancelled.');
    }
    const extra = auth ? { authKey: auth.pub, authSig: await signHash(auth.priv, sha256hex('passkey|' + resp.id)) } : {};
    const label = /iPhone|iPad/.test(navigator.userAgent) ? 'Face ID · iPhone' : /Mac/.test(navigator.userAgent) ? 'Touch ID · Mac' : /Android/.test(navigator.userAgent) ? 'Biometrics · Android' : 'Biometrics';
    const r = await call({ action: 'passkey-register', response: resp, challenge: o.j.challenge, exp: o.j.exp, token: o.j.token, label, ...extra });
    if (!r.ok) throw new Error(r.j.error || 'failed');
    try { localStorage.setItem('gc-face-here', '1'); } catch {}
    setFaceHere(true);
    await refreshInfo();
  };
  const addFaceHere = () => run('Registering Face ID on this device', async () => {
    await registerFace(devActive && dev ? dev : undefined);
    setSt('Face ID registered — every signature from now on needs your face.');
  });

  // 端末は「自分が意図した内容か」を確かめてから署名する（サーバーが乗っ取られていても、別の内容には署名しない）
  const signKeyOp = async (kind: KeyEntry['kind'], key: string, label: string, signer: { pub: string; priv: CryptoKey }) => {
    const p = await call({ action: 'prepare-key', kind, key, label, signer: signer.pub });
    if (!p.ok) throw new Error(p.j.error || 'failed');
    const e = p.j.entry as KeyEntry;
    if (hashEntry(e) !== p.j.hash || e.kind !== kind || e.key !== key || e.signer !== signer.pub || e.label !== label.trim().slice(0, 60)) throw new Error('The server asked to sign something different — stopped.');
    const f = await face(p.j.face);
    const c = await call({ action: 'commit-key', entry: e, cosig: await signHash(signer.priv, p.j.hash), face: f });
    if (!c.ok) throw new Error(c.j.error || 'failed');
  };
  const signRecord = async (kind: GcppEntry['kind'], expect: (e: GcppEntry) => boolean, extra: Record<string, unknown>) => {
    if (!dev || !devActive || !item) throw new Error('This device has no active founder key');
    const p = await call({ action: 'prepare', kind, item_id: item.id, signer: dev.pub, ...extra });
    if (!p.ok) throw Object.assign(new Error(p.j.error === 'missing' ? 'Missing: ' + (p.j.missing || []).join(' · ') : p.j.error || 'failed'), {});
    const e = p.j.entry as GcppEntry;
    if (hashEntry(e) !== p.j.hash || e.kind !== kind || e.signer !== dev.pub || e.cert !== certNo(item) || !expect(e)) throw new Error('The server asked to sign something different from what you entered — stopped.');
    const f = await face(p.j.face);
    const c = await call({ action: 'commit', item_id: item.id, entry: e, cosig: await signHash(dev.priv, p.j.hash), face: f });
    if (!c.ok) throw new Error(c.j.error || 'failed');
    return c.j as { anchored: boolean };
  };
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setSt(label + '…');
    try {
      await fn();
    } catch (e) {
      setSt('Error: ' + (e as Error).message);
      setBusy(false);
      return false;
    }
    setBusy(false);
    return true;
  };
  const createFounder = () => run('Creating the founder key on this device', async () => {
    const k = await createDeviceKey();
    setDev(k);
    await signKeyOp('genesis', k.pub, 'Founder device 1', k);
    await refreshInfo();
    setSt('Founder key created. Next: make the offline recovery key.');
  });
  const makeRecovery = () => run('Creating the recovery key', async () => {
    if (!dev) throw new Error('No device key');
    const rk = await createRecoveryKey();
    download(`gallery-crypto-recovery-key-${keyId(rk.pub)}.json`, rk.file);
    await signKeyOp('add', rk.pub, 'Offline recovery key', dev);
    await refreshInfo();
    setSt('Recovery key saved as a file and registered. Move the file to a USB stick or print it, then delete it from this computer and its cloud folders.');
  });
  const [pairCode, setPairCode] = useState('');
  const [pairLabel, setPairLabel] = useState('');
  const approveDevice = () => run('Approving the new device', async () => {
    if (!dev) throw new Error('No device key');
    const code = pairCode.trim().toLowerCase();
    await signKeyOp('add', code, pairLabel.trim() || 'Founder device', dev);
    setPairCode('');
    setPairLabel('');
    await refreshInfo();
    setSt('New device approved');
  });
  const setupThisDevice = () => run('Creating a key on this device', async () => {
    const k = await createDeviceKey();
    setDev(k);
    setSt('Key created. Approve it from an active device (paste the code there) or with the recovery key file below.');
  });
  const approveWithRecovery = (f: File | undefined) => {
    if (!f || !dev) return;
    run('Approving this device with the recovery key', async () => {
      const rk = await importRecoveryKey(await f.text());
      if (!faceHere) await registerFace(rk);
      await signKeyOp('add', dev.pub, 'Founder device (recovered)', rk);
      await refreshInfo();
      setSt('This device is now active.');
    });
  };
  const revoke = (k: string, label: string) => {
    if (!dev || !confirm(`Revoke "${label}" (#${keyId(k)})? Records it already signed stay valid; it cannot sign anything new.`)) return;
    run('Revoking', async () => {
      await signKeyOp('revoke', k, label, dev);
      await refreshInfo();
      setSt('Key revoked');
    });
  };

  const load = useCallback(async () => {
    const a = await db.from('items').select('*').order('serial');
    setItems((a.data as Item[]) || []);
    const b = await db.from('passport_log').select('id,item_id,seq,kind,hash,anchor_id,created_at,entry').order('id');
    if (b.error) {
      setMissing(/relation|does not exist|schema cache/i.test(b.error.message));
      return setSt('Could not load: ' + b.error.message);
    }
    const k = await db.from('passport_keys').select('id', { count: 'exact', head: true });
    if (k.error && /relation|does not exist|schema cache/i.test(k.error.message)) return setMissing(true);
    setMissing(false);
    setLog((b.data as LogRow[]) || []);
  }, [db]);
  useEffect(() => { load(); }, [load]);

  // 表がまだなければ、自動でセットアップする（1回だけ試す）
  const [autoTried, setAutoTried] = useState(false);
  useEffect(() => {
    if (!missing || autoTried) return;
    setAutoTried(true);
    (async () => {
      setSt('Setting up passports automatically…');
      const { data } = await db.auth.getSession();
      const r = await fetch('/api/admin/setup-events', { method: 'POST', headers: { authorization: `Bearer ${data.session?.access_token || ''}` } });
      if (r.ok) {
        setSt('Passports are ready');
        setTimeout(() => { load(); call({ action: 'info' }).then(({ ok, j }) => ok && setInfo(j)); }, 800);
      } else setSt('Automatic setup was not possible here — use the steps below once.');
    })();
  }, [missing, autoTried, db, load]);
  useEffect(() => { call({ action: 'info' }).then(({ ok, j }) => ok && setInfo(j)); }, []);

  useEffect(() => {
    if (!item) return setDpp(null);
    setDirty(false);
    db.from('passports').select('dpp').eq('item_id', item.id).maybeSingle().then(({ data }) => setDpp(mergeDpp(prefill(item), (data?.dpp as Dpp) || null)));
  }, [item, db]);

  const mine = useMemo(() => log.filter((l) => l.item_id === sel), [log, sel]);
  const comp = dpp ? completeness(dpp) : null;
  const pending = log.filter((l) => !l.anchor_id).length;

  const set = (s: string, k: string, v: Dpp[string][string]) => {
    setDpp((p) => (p ? { ...p, [s]: { ...p[s], [k]: v } } : p));
    setDirty(true);
  };
  const saveDraft = async () => {
    if (!item || !dpp) return false;
    const { error } = await db.from('passports').upsert({ item_id: item.id, dpp, updated_at: new Date().toISOString() });
    if (error) { setSt('Error: ' + error.message); return false; }
    setDirty(false);
    setSt('Draft saved — not public until you seal it');
    return true;
  };
  const seal = async () => {
    if (!item || !comp) return;
    if (comp.missing.length) return setSt('Fill the required fields first: ' + comp.missing.join(' · '));
    const n = mine.filter((l) => l.kind === 'seal').length;
    if (!confirm(`Seal ${certNo(item)} as version ${n + 1}?\n\nThis writes a signed, permanent record that anyone can verify. It can be superseded by a new version later, but never edited or erased.`)) return;
    if (!(await saveDraft())) return;
    const want = canonical(cleanDpp(dpp!));
    let anchored = false;
    const ok = await run('Signing with this device and the server', async () => {
      const r = await signRecord('seal', (e) => canonical((e.data as { dpp: unknown }).dpp) === want, {});
      anchored = r.anchored;
    });
    if (!ok) return;
    setSt(`Sealed v${n + 1} — signed twice${anchored ? ' and anchored on Solana' : ''}. Live at /passport/${certNo(item)}`);
    load();
  };
  const addEvent = async () => {
    if (!item) return;
    const t = (v: string, n: number) => v.trim().slice(0, n);
    let anchored = false;
    const ok = await run('Signing with this device and the server', async () => {
      const r = await signRecord('event', (e) => {
        const d = e.data as Record<string, string>;
        return d.type === ev.type && d.actor === t(ev.actor, 120) && d.place === t(ev.place, 120) && d.note === t(ev.note, 1000) && (d.date || '') === ev.date;
      }, { event: ev });
      anchored = r.anchored;
    });
    if (!ok) return;
    setSt(`${eventLabel(ev.type)} recorded — signed twice${anchored ? ' and anchored on Solana' : ''}`);
    setEv({ ...ev, note: '' });
    load();
  };
  const anchor = async () => {
    if (!confirm(`Write ${pending} new records to ${info?.chain === 'solana-mainnet' ? 'Solana' : 'Solana devnet'} as one hash?`)) return;
    setBusy(true);
    setSt('Writing to Solana… this takes up to 30 seconds');
    const { ok, j } = await call({ action: 'anchor' });
    setBusy(false);
    if (!ok) return setSt('Error: ' + (j.error || 'failed'));
    if (j.needFunds) {
      setFunds(true);
      return setSt('The issuer address needs a little test SOL first (free). See the steps below, then press Anchor again.');
    }
    if (!j.count) return setSt('Nothing new to anchor');
    setFunds(false);
    setSt(`Anchored ${j.count} records on Solana`);
    if (j.anchor?.tx) window.open(explorerTx(j.anchor.tx, j.anchor.chain), '_blank', 'noopener');
    load();
    call({ action: 'info' }).then(({ ok: o, j: k }) => o && setInfo(k));
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || !dpp) return;
    const list = [...((dpp.fingerprint.photos as PhotoHash[]) || [])];
    for (const f of Array.from(files)) list.push({ label: f.name.replace(/\.[^.]+$/, ''), sha256: await hashBytes(await f.arrayBuffer()) });
    set('fingerprint', 'photos', list);
  };
  const hashItemPhotos = async () => {
    if (!item || !dpp) return;
    setSt('Hashing photos…');
    const list = [...((dpp.fingerprint.photos as PhotoHash[]) || [])];
    for (const [i, p] of item.photos.entries()) {
      try {
        const r = await fetch(photoUrl(p));
        list.push({ label: `Catalog photo ${i + 1}`, sha256: await hashBytes(await r.arrayBuffer()) });
      } catch {}
    }
    set('fingerprint', 'photos', list);
    setSt('Photo hashes added — save or seal to keep them');
  };

  if (missing)
    return (
      <div className="sec">
        <h4>Set up passports (one time)</h4>
        <p>Provenance passports need three new tables. Tap the button — it takes a few seconds.</p>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn primary" onClick={async () => {
            setSt('Setting up…');
            const { data } = await db.auth.getSession();
            const r = await fetch('/api/admin/setup-events', { method: 'POST', headers: { authorization: `Bearer ${data.session?.access_token || ''}` } });
            const j = await r.json().catch(() => ({}));
            if (r.ok) { setSt('Done — passports are ready'); setTimeout(load, 800); }
            else setSt(j.error === 'no-db-url' ? 'Automatic setup is not available. Use the manual steps below.' : 'Automatic setup failed: ' + (j.error || r.status));
          }}>Set up passports</button>
        </div>
        {st && <p className="status">{st}</p>}
        <p style={{ marginTop: 10 }}><b>If the button does not work:</b></p>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
          <li><button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(PASSPORT_SQL); setSt('Setup code copied'); } catch { setSt('Could not copy — select the code below'); } }}>Copy setup code</button></li>
          <li><a className="btn" href="https://supabase.com/dashboard/project/tgivhkjwibwekuvbcgcm/sql/new" target="_blank" rel="noopener noreferrer">Open Supabase SQL editor</a> — sign in if asked.</li>
          <li>Paste into the editor and press Run. Then reload this page.</li>
        </ol>
        <details style={{ marginTop: 8 }}>
          <summary>Show the setup code</summary>
          <textarea readOnly value={PASSPORT_SQL} style={{ width: '100%', minHeight: 200, fontSize: 11 }} onFocus={(e) => e.currentTarget.select()} />
        </details>
      </div>
    );

  const keysList = Array.from(ringV.keys.values());
  const founderSec = (
    <div className="sec">
      <h4>Founder keys · two-key signing</h4>
      <p>
        Every record needs <b>two signatures</b>: the server&apos;s and a founder device key that never leaves this device (it cannot be copied, even by this page). If the
        server or database is ever broken into, nobody can create a valid record without your device. New devices can only be added with an existing key or the offline recovery key.
      </p>
      {aal && !mfa && (
        <div className="pa-warn">
          <p><b>Turn on two-step sign-in first.</b> Signing records and managing keys needs a login verified with a 6-digit code. Go to <b>Settings → Two-step sign-in</b>.</p>
        </div>
      )}
      {!deviceSupported() && <p className="status">This browser cannot hold a device key. Use Safari, Chrome or Edge.</p>}
      {info?.ring && !info.ring.ok && <p className="status status-err">The keyring does not verify — signing is locked. Contact support before doing anything else.</p>}
      {info && mfa && (
        <p>
          Face ID for signing: {faces.length ? <b style={{ color: '#0b6b2c' }}>{faces.length} registered ✓</b> : <b>not set</b>}
          {faces.length > 0 && <> ({faces.map((x) => x.label).join(', ')})</>} · this device {faceHere ? '✓' : '—'}
        </p>
      )}
      {info && info.permanent && mfa && ringList.length === 0 && (
        <div className="pa-warn">
          {!faces.length ? (
            <>
              <p><b>Step 1.</b> Register Face ID (or Touch ID / fingerprint) on this device. Every signature will need it.</p>
              <button className="btn primary" disabled={busy} onClick={addFaceHere}>Register Face ID</button>
            </>
          ) : (
            <>
              <p><b>Step 2.</b> Create the founder key on this device. You will be asked for Face ID.</p>
              <button className="btn primary" disabled={busy} onClick={createFounder}>Create founder key on this device</button>
            </>
          )}
        </div>
      )}
      {devActive && !faceHere && (
        <div className="pa-warn">
          <p>This device is active but Face ID is not registered here yet. Signing needs it.</p>
          <button className="btn primary" disabled={busy} onClick={addFaceHere}>Register Face ID on this device</button>
        </div>
      )}
      {ringList.length > 0 && (
        <>
          <p>
            This device: {dev ? <b>#{keyId(dev.pub)}</b> : 'no key'} {devActive ? <b style={{ color: '#0b6b2c' }}>· active — you can sign</b> : dev ? '· waiting for approval' : ''}
          </p>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Key</th><th>Name</th><th>Since</th><th>Status</th><th /></tr></thead>
              <tbody>
                {keysList.map((k) => (
                  <tr key={k.key}>
                    <td className="pa-hash">#{keyId(k.key)}{dev?.pub === k.key ? ' (this device)' : ''}</td>
                    <td>{k.label}</td>
                    <td>{new Date(k.added).toLocaleDateString('en-US')}</td>
                    <td>{k.revoked ? 'revoked' : 'active'}</td>
                    <td>{!k.revoked && devActive && k.key !== dev?.pub && <button className="btn danger" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => revoke(k.key, k.label)}>Revoke</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {devActive && (
            <>
              {!keysList.some((k) => !k.revoked && /recovery/i.test(k.label)) && (
                <div className="pa-warn">
                  <p><b>Make an offline recovery key now.</b> If every device is lost, this file is the only way to approve a new one. Keep it on a USB stick or printed, never in the cloud.</p>
                  <button className="btn primary" disabled={busy} onClick={makeRecovery}>Create recovery key file</button>
                </div>
              )}
              {keysList.some((k) => !k.revoked && /recovery/i.test(k.label)) && <p>Offline recovery key registered ✓</p>}
              <details style={{ marginTop: 8 }}>
                <summary>Approve another device</summary>
                <p>On the new device, open this tab and press “Set up this device”. Paste the code it shows here.</p>
                <div className="form">
                  <label className="wide">Device code<input type="text" value={pairCode} onChange={(e) => setPairCode(e.target.value)} placeholder="04…" /></label>
                  <label>Name<input type="text" value={pairLabel} onChange={(e) => setPairLabel(e.target.value)} placeholder="iPhone" /></label>
                </div>
                <button className="btn" disabled={busy || !/^04[0-9a-fA-F]{128}$/.test(pairCode.trim())} onClick={approveDevice}>Approve</button>
              </details>
            </>
          )}
          {mfa && !devActive && (
            <div className="pa-warn">
              {!dev ? (
                <button className="btn primary" disabled={busy} onClick={setupThisDevice}>Set up this device</button>
              ) : (
                <>
                  <p>Approve this device from an active device by pasting this code there:</p>
                  <p className="pa-hash"><b>{dev.pub}</b> <button className="btn" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => navigator.clipboard.writeText(dev.pub).then(() => setSt('Code copied'))}>Copy</button></p>
                  <p>Or approve it with the offline recovery key file:</p>
                  <label className="btn" style={{ padding: '4px 10px', fontSize: 14 }}>Use recovery key file<input type="file" accept=".json,application/json" hidden onChange={(e) => approveWithRecovery(e.target.files?.[0])} /></label>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      {founderSec}
      <div className="sec">
        <h4>Provenance passports</h4>
        <p>
          Fill in each piece&apos;s record (aligned with the EU Digital Product Passport), then <b>Seal</b> it: the record is signed by this device and the server and becomes permanent and
          public at /passport/GC-XXXX. Add events as the piece moves. <b>Anchor</b> writes all new records to Solana as one hash. Public demo: <a href="/proof" target="_blank" rel="noreferrer">/proof</a>
        </p>
        {info && (
          <p className="pa-hash">
            Issuer key (= Solana address): <a href={explorerAddr(info.issuer, info.chain)} target="_blank" rel="noopener noreferrer">{info.issuer}</a> · {info.chain === 'solana-mainnet' ? 'Solana mainnet' : 'Solana devnet (test network)'} · balance {info.balance == null ? '—' : `${info.balance} SOL`} · {info.permanent ? 'server key stored ✓' : 'server key not stored yet'} · records anchored right after signing, plus daily at 3:00 JST
          </p>
        )}
        {info && !info.permanent && (
          <div className="pa-warn">
            <p><b>Setup is not finished.</b> {info.setup === 'no-db-url' ? 'This server cannot create the tables by itself.' : info.setup && info.setup !== 'ran' ? `Automatic setup failed: ${info.setup}` : ''} {info.problem ? `(${info.problem})` : ''}</p>
            <p>Do this once: <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(PASSPORT_SQL); setSt('Setup code copied — paste it in the Supabase SQL editor and press Run'); } catch { setSt('Could not copy'); } }}>Copy setup code</button>{' '}
              <a className="btn" href="https://supabase.com/dashboard/project/tgivhkjwibwekuvbcgcm/sql/new" target="_blank" rel="noopener noreferrer">Open Supabase SQL editor</a> → paste → Run → reload this page.</p>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn primary" disabled={busy || !pending} onClick={anchor}>Anchor {pending || ''} to Solana</button>
          <a className="btn" href="/proof" target="_blank" rel="noreferrer">Open Proof Lab</a>
        </div>
        {funds && info && (
          <ol style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
            <li><button className="btn" onClick={() => navigator.clipboard.writeText(info.issuer).then(() => setSt('Address copied'))}>Copy issuer address</button> (this is a public address, not a password)</li>
            <li><a className="btn" href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer">Open the Solana faucet</a> — choose Devnet, paste the address, request 0.5 SOL. Test SOL is free and has no value.</li>
            <li>Come back and press Anchor again.</li>
          </ol>
        )}
        {st && <p className="status">{st}</p>}
        <div className="pa-items">
          {items.map((i) => {
            const rows = log.filter((l) => l.item_id === i.id);
            const seals = rows.filter((l) => l.kind === 'seal').length;
            return (
              <button key={i.id} className={`pa-item${sel === i.id ? ' on' : ''}`} onClick={() => setSel(i.id)}>
                <b>{certNo(i)}</b>
                <span>{i.band || 'Untitled'}{i.published ? '' : ' · hidden'}</span>
                <span className={`pa-st${seals ? ' sealed' : ''}`}>{seals ? `sealed v${seals} · ${rows.length} rec` : rows.length ? `${rows.length} events` : 'draft'}</span>
              </button>
            );
          })}
          {!items.length && <p>Add pieces in the Archive tab first.</p>}
        </div>
      </div>

      {item && dpp && comp && (
        <div className="sec">
          <h4>{certNo(item)} · {item.band}</h4>
          <p>
            Required fields: <b>{comp.done} / {comp.total}</b>{comp.missing.length ? '' : ' — ready to seal'}{dirty ? ' · unsaved changes' : ''}
          </p>
          <div className={`pa-meter${comp.missing.length ? '' : ' full'}`}><i style={{ width: `${(comp.done / comp.total) * 100}%` }} /></div>

          {DPP_SECTIONS.map((s) => (
            <div key={s.key} className="pa-sec">
              <h5>{s.title}<small>{s.espr}</small></h5>
              <div className="form">
                {s.fields.map((f) => {
                  const v = dpp[s.key]?.[f.key];
                  const lab = <>{f.label}{f.required && <span className="pa-req"> *</span>}</>;
                  if (f.type === 'composition') {
                    const c = (v as Composition) || [];
                    return (
                      <div key={f.key} className="wide">
                        <label style={{ display: 'block' }}>{lab}</label>
                        {c.map((x, i) => (
                          <div key={i} className="pa-comp">
                            <input type="text" value={x.fiber} onChange={(e) => set(s.key, f.key, c.map((y, j) => (j === i ? { ...y, fiber: e.target.value } : y)))} placeholder="Cotton" />
                            <input type="number" className="pct" value={x.pct} onChange={(e) => set(s.key, f.key, c.map((y, j) => (j === i ? { ...y, pct: Number(e.target.value) } : y)))} />%
                            <button className="btn" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => set(s.key, f.key, c.filter((_, j) => j !== i))}>Remove</button>
                          </div>
                        ))}
                        <button className="btn" style={{ padding: '2px 8px', fontSize: 13, marginTop: 4 }} onClick={() => set(s.key, f.key, [...c, { fiber: '', pct: 0 }])}>Add fibre</button>
                      </div>
                    );
                  }
                  if (f.type === 'hashes') {
                    const h = (v as PhotoHash[]) || [];
                    return (
                      <div key={f.key} className="wide">
                        <label style={{ display: 'block' }}>{lab}</label>
                        {h.map((x, i) => (
                          <div key={i} className="pa-comp">
                            <input type="text" value={x.label} onChange={(e) => set(s.key, f.key, h.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                            <span className="pa-hash">{x.sha256.slice(0, 16)}…</span>
                            <button className="btn" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => set(s.key, f.key, h.filter((_, j) => j !== i))}>Remove</button>
                          </div>
                        ))}
                        <div className="pa-comp" style={{ marginTop: 4 }}>
                          <label className="btn" style={{ padding: '4px 10px', fontSize: 14 }}>Add macro photos<input type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} /></label>
                          {item.photos.length > 0 && <button className="btn" style={{ padding: '4px 10px', fontSize: 14 }} onClick={hashItemPhotos}>Hash catalog photos</button>}
                        </div>
                        {f.hint && <small>{f.hint} The photo is hashed on this device and is not uploaded.</small>}
                      </div>
                    );
                  }
                  const common = { value: String(v ?? ''), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(s.key, f.key, f.type === 'number' ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value) };
                  return (
                    <label key={f.key} className={f.type === 'textarea' ? 'wide' : ''}>
                      {lab}
                      {f.type === 'textarea' ? <textarea {...common} placeholder={f.hint} /> : <input type="text" inputMode={f.type === 'number' ? 'decimal' : undefined} {...common} placeholder={f.hint} />}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy} onClick={saveDraft}>Save draft</button>
            <button className="btn primary" disabled={busy || comp.missing.length > 0 || !devActive} onClick={seal}>Seal record{mine.some((l) => l.kind === 'seal') ? ' (new version)' : ''}</button>
          </div>
          {comp.missing.length > 0 && <p className="status">Still needed: {comp.missing.join(' · ')}</p>}
        </div>
      )}

      {item && (
        <div className="sec">
          <h4>Add an event · {certNo(item)}</h4>
          <p>Each event is signed and linked to the one before. Never put buyer names, emails or prices here — the record is public.</p>
          <div className="form">
            <label>What happened
              <select value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value })}>
                {EVENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
            <label>Date<input type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} /></label>
            <label>Who (dealer, artist ID…)<input type="text" value={ev.actor} onChange={(e) => setEv({ ...ev, actor: e.target.value })} /></label>
            <label>Where<input type="text" value={ev.place} onChange={(e) => setEv({ ...ev, place: e.target.value })} placeholder="Los Angeles, US" /></label>
            <label className="wide">Note<textarea value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} placeholder={EVENT_TYPES.find((t) => t.key === ev.type)?.hint} /></label>
          </div>
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button className="btn primary" disabled={busy || !devActive} onClick={addEvent}>Sign &amp; add</button>
            {!devActive && <span>Needs an active founder key on this device (see Founder keys).</span>}
            {mine.length > 0 && <a className="btn" href={`/passport/${certNo(item)}`} target="_blank" rel="noreferrer">Open public passport</a>}
          </div>
          {mine.length > 0 && (
            <div className="tablewrap pa-log">
              <table>
                <thead><tr><th>#</th><th>Record</th><th>Signed</th><th>Hash</th><th>Solana</th></tr></thead>
                <tbody>
                  {mine.map((l) => (
                    <tr key={l.id}>
                      <td>{l.seq}</td>
                      <td>{l.kind === 'seal' ? `Sealed v${(l.entry.data as { version?: number }).version}` : eventLabel(String(l.entry.data.type))}</td>
                      <td>{new Date(l.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="pa-hash">{l.hash.slice(0, 12)}…</td>
                      <td>{l.anchor_id ? `✓ #${l.anchor_id}` : 'pending'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
