'use client';
import ChainsPanel from './ChainsPanel';
import NfcTagPanel from './NfcTagPanel';

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
import { tt } from '@/components/Lang';
import { dl } from '@/lib/dppJa';
const jl = (s: string) => tt(s, dl('ja', s));

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
    if (!opts) throw new Error(tt('Register Face ID for signing first (Founder keys).', '先に署名用の Face ID を登録してください（「創業者の鍵」）。'));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await startAuthentication({ optionsJSON: opts as any });
    } catch {
      throw new Error(tt('Face ID was cancelled or did not match.', 'Face ID がキャンセルされたか、一致しませんでした。'));
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
      throw new Error(tt('Face ID setup was cancelled.', 'Face ID の登録がキャンセルされました。'));
    }
    const extra = auth ? { authKey: auth.pub, authSig: await signHash(auth.priv, sha256hex('passkey|' + resp.id)) } : {};
    const label = /iPhone|iPad/.test(navigator.userAgent) ? 'Face ID · iPhone' : /Mac/.test(navigator.userAgent) ? 'Touch ID · Mac' : /Android/.test(navigator.userAgent) ? tt('Biometrics · Android', '生体認証 · Android') : tt('Biometrics', '生体認証');
    const r = await call({ action: 'passkey-register', response: resp, challenge: o.j.challenge, exp: o.j.exp, token: o.j.token, label, ...extra });
    if (!r.ok) throw new Error(r.j.error || 'failed');
    try { localStorage.setItem('gc-face-here', '1'); } catch {}
    setFaceHere(true);
    await refreshInfo();
  };
  const addFaceHere = () => run(tt('Registering Face ID on this device', 'この端末に Face ID を登録中'), async () => {
    await registerFace(devActive && dev ? dev : undefined);
    setSt(tt('Face ID registered — every signature from now on needs your face.', 'Face ID を登録しました — これからの署名には、すべて顔認証が必要です。'));
  });

  // 端末は「自分が意図した内容か」を確かめてから署名する（サーバーが乗っ取られていても、別の内容には署名しない）
  const signKeyOp = async (kind: KeyEntry['kind'], key: string, label: string, signer: { pub: string; priv: CryptoKey }) => {
    const p = await call({ action: 'prepare-key', kind, key, label, signer: signer.pub });
    if (!p.ok) throw new Error(p.j.error || 'failed');
    const e = p.j.entry as KeyEntry;
    if (hashEntry(e) !== p.j.hash || e.kind !== kind || e.key !== key || e.signer !== signer.pub || e.label !== label.trim().slice(0, 60)) throw new Error(tt('The server asked to sign something different — stopped.', 'サーバーが別の内容への署名を求めました — 中止しました。'));
    const f = await face(p.j.face);
    const c = await call({ action: 'commit-key', entry: e, cosig: await signHash(signer.priv, p.j.hash), face: f });
    if (!c.ok) throw new Error(c.j.error || 'failed');
  };
  const signRecord = async (kind: GcppEntry['kind'], expect: (e: GcppEntry) => boolean, extra: Record<string, unknown>) => {
    if (!dev || !devActive || !item) throw new Error(tt('This device has no active founder key', 'この端末には有効な創業者の鍵がありません'));
    const p = await call({ action: 'prepare', kind, item_id: item.id, signer: dev.pub, ...extra });
    if (!p.ok) throw Object.assign(new Error(p.j.error === 'missing' ? 'Missing: ' + (p.j.missing || []).join(' · ') : p.j.error || 'failed'), {});
    const e = p.j.entry as GcppEntry;
    if (hashEntry(e) !== p.j.hash || e.kind !== kind || e.signer !== dev.pub || e.cert !== certNo(item) || !expect(e)) throw new Error(tt('The server asked to sign something different from what you entered — stopped.', 'サーバーが入力した内容と違うものへの署名を求めました — 中止しました。'));
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
      setSt(tt('Error: ', 'エラー：') + (e as Error).message);
      setBusy(false);
      return false;
    }
    setBusy(false);
    return true;
  };
  const createFounder = () => run(tt('Creating the founder key on this device', 'この端末で創業者の鍵を作成中'), async () => {
    const k = await createDeviceKey();
    setDev(k);
    await signKeyOp('genesis', k.pub, 'Founder device 1', k);
    await refreshInfo();
    setSt(tt('Founder key created. Next: make the offline recovery key.', '創業者の鍵を作成しました。次に、オフラインの復旧鍵を作ってください。'));
  });
  const makeRecovery = () => run(tt('Creating the recovery key', '復旧鍵を作成中'), async () => {
    if (!dev) throw new Error(tt('No device key', '端末の鍵がありません'));
    const rk = await createRecoveryKey();
    download(`gallery-crypto-recovery-key-${keyId(rk.pub)}.json`, rk.file);
    await signKeyOp('add', rk.pub, tt('Offline recovery key', 'オフラインの復旧鍵'), dev);
    await refreshInfo();
    setSt(tt('Recovery key saved as a file and registered. Move the file to a USB stick or print it, then delete it from this computer and its cloud folders.', '復旧鍵をファイルに保存し、登録しました。ファイルをUSBメモリに移すか印刷してから、このパソコンとクラウドのフォルダから削除してください。'));
  });
  const [pairCode, setPairCode] = useState('');
  const [pairLabel, setPairLabel] = useState('');
  const approveDevice = () => run(tt('Approving the new device', '新しい端末を承認中'), async () => {
    if (!dev) throw new Error(tt('No device key', '端末の鍵がありません'));
    const code = pairCode.trim().toLowerCase();
    await signKeyOp('add', code, pairLabel.trim() || 'Founder device', dev);
    setPairCode('');
    setPairLabel('');
    await refreshInfo();
    setSt(tt('New device approved', '新しい端末を承認しました'));
  });
  const setupThisDevice = () => run(tt('Creating a key on this device', 'この端末で鍵を作成中'), async () => {
    const k = await createDeviceKey();
    setDev(k);
    setSt(tt('Key created. Approve it from an active device (paste the code there) or with the recovery key file below.', '鍵を作成しました。有効な端末から承認する（そこでコードを貼り付ける）か、下の復旧鍵のファイルで承認してください。'));
  });
  const approveWithRecovery = (f: File | undefined) => {
    if (!f || !dev) return;
    run(tt('Approving this device with the recovery key', '復旧鍵でこの端末を承認中'), async () => {
      const rk = await importRecoveryKey(await f.text());
      if (!faceHere) await registerFace(rk);
      await signKeyOp('add', dev.pub, 'Founder device (recovered)', rk);
      await refreshInfo();
      setSt(tt('This device is now active.', 'この端末が有効になりました。'));
    });
  };
  const revoke = (k: string, label: string) => {
    if (!dev || !confirm(tt(`Revoke "${label}" (#${keyId(k)})? Records it already signed stay valid; it cannot sign anything new.`, `「${label}」（#${keyId(k)}）を取り消しますか？すでに署名した記録は有効なままで、新しい署名はできなくなります。`))) return;
    run(tt('Revoking', '取り消し中'), async () => {
      await signKeyOp('revoke', k, label, dev);
      await refreshInfo();
      setSt(tt('Key revoked', '鍵を取り消しました'));
    });
  };

  const load = useCallback(async () => {
    const a = await db.from('items').select('*').order('serial');
    setItems((a.data as Item[]) || []);
    const b = await db.from('passport_log').select('id,item_id,seq,kind,hash,anchor_id,created_at,entry').order('id');
    if (b.error) {
      setMissing(/relation|does not exist|schema cache/i.test(b.error.message));
      return setSt(tt('Could not load: ', '読み込めませんでした：') + b.error.message);
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
      setSt(tt('Setting up passports automatically…', 'パスポートを自動で準備中…'));
      const { data } = await db.auth.getSession();
      const r = await fetch('/api/admin/setup-events', { method: 'POST', headers: { authorization: `Bearer ${data.session?.access_token || ''}` } });
      if (r.ok) {
        setSt(tt('Passports are ready', 'パスポートを使えます'));
        setTimeout(() => { load(); call({ action: 'info' }).then(({ ok, j }) => ok && setInfo(j)); }, 800);
      } else setSt(tt('Automatic setup was not possible here — use the steps below once.', 'ここでは自動セットアップができませんでした — 下の手順を一度行ってください。'));
    })();
  }, [missing, autoTried, db, load]);
  useEffect(() => { call({ action: 'info' }).then(({ ok, j }) => ok && setInfo(j)); }, []);

  useEffect(() => {
    if (!item) return setDpp(null);
    setDirty(false);
    db.from('passports').select('dpp').eq('item_id', item.id).maybeSingle().then(({ data }) => setDpp(mergeDpp(prefill(item), (data?.dpp as Dpp) || null)));
  }, [item, db]);

  const mine = useMemo(() => log.filter((l) => l.item_id === sel), [log, sel]);
  const comp = dpp ? completeness(dpp, tt('en', 'ja') as 'en' | 'ja') : null;
  const pending = log.filter((l) => !l.anchor_id).length;

  const set = (s: string, k: string, v: Dpp[string][string]) => {
    setDpp((p) => (p ? { ...p, [s]: { ...p[s], [k]: v } } : p));
    setDirty(true);
  };
  const saveDraft = async () => {
    if (!item || !dpp) return false;
    const { error } = await db.from('passports').upsert({ item_id: item.id, dpp, updated_at: new Date().toISOString() });
    if (error) { setSt(tt('Error: ', 'エラー：') + error.message); return false; }
    setDirty(false);
    setSt(tt('Draft saved — not public until you seal it', '下書きを保存しました — 確定するまで公開されません'));
    return true;
  };
  const seal = async () => {
    if (!item || !comp) return;
    if (comp.missing.length) return setSt(tt('Fill the required fields first: ', '先に必須項目を入力してください：') + comp.missing.join(' · '));
    const n = mine.filter((l) => l.kind === 'seal').length;
    if (!confirm(tt(`Seal ${certNo(item)} as version ${n + 1}?\n\nThis writes a signed, permanent record that anyone can verify. It can be superseded by a new version later, but never edited or erased.`, `${certNo(item)} をバージョン${n + 1}として確定しますか？\n\n誰でも検証できる、署名つきの消えない記録を書き込みます。あとで新しいバージョンに置き換えることはできますが、書き換えや削除はできません。`))) return;
    if (!(await saveDraft())) return;
    const want = canonical(cleanDpp(dpp!));
    let anchored = false;
    const ok = await run(tt('Signing with this device and the server', 'この端末とサーバーで署名中'), async () => {
      const r = await signRecord('seal', (e) => canonical((e.data as { dpp: unknown }).dpp) === want, {});
      anchored = r.anchored;
    });
    if (!ok) return;
    setSt(tt(`Sealed v${n + 1} — signed twice${anchored ? ' and anchored on Solana' : ''}. Live at /passport/${certNo(item)}`, `v${n + 1} を確定しました — 二重に署名${anchored ? 'し、Solana に刻印' : ''}しました。公開先：/passport/${certNo(item)}`));
    load();
  };
  const addEvent = async () => {
    if (!item) return;
    const t = (v: string, n: number) => v.trim().slice(0, n);
    let anchored = false;
    const ok = await run(tt('Signing with this device and the server', 'この端末とサーバーで署名中'), async () => {
      const r = await signRecord('event', (e) => {
        const d = e.data as Record<string, string>;
        return d.type === ev.type && d.actor === t(ev.actor, 120) && d.place === t(ev.place, 120) && d.note === t(ev.note, 1000) && (d.date || '') === ev.date;
      }, { event: ev });
      anchored = r.anchored;
    });
    if (!ok) return;
    setSt(tt(`${eventLabel(ev.type)} recorded — signed twice${anchored ? ' and anchored on Solana' : ''}`, `「${eventLabel(ev.type, 'ja')}」を記録しました — 二重に署名${anchored ? 'し、Solana に刻印' : ''}しました`));
    setEv({ ...ev, note: '' });
    load();
  };
  const anchor = async () => {
    if (!confirm(tt(`Write ${pending} new records to ${info?.chain === 'solana-mainnet' ? 'Solana' : 'Solana devnet'} as one hash?`, `新しい記録${pending}件を1つのハッシュにして ${info?.chain === 'solana-mainnet' ? 'Solana' : 'Solana devnet'} に書き込みますか？`))) return;
    setBusy(true);
    setSt(tt('Writing to Solana… this takes up to 30 seconds', 'Solana に書き込み中…最大30秒かかります'));
    const { ok, j } = await call({ action: 'anchor' });
    setBusy(false);
    if (!ok) return setSt(tt('Error: ', 'エラー：') + (j.error || 'failed'));
    if (j.needFunds) {
      setFunds(true);
      return setSt(tt('The issuer address needs a little test SOL first (free). See the steps below, then press Anchor again.', '先に発行者のアドレスに少しテスト用の SOL（無料）が必要です。下の手順のあと、もう一度「刻印」を押してください。'));
    }
    if (!j.count) return setSt(tt('Nothing new to anchor', '新しく刻印するものはありません'));
    setFunds(false);
    setSt(tt(`Anchored ${j.count} records on Solana`, `${j.count}件の記録を Solana に刻印しました`));
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
    setSt(tt('Hashing photos…', '写真をハッシュ化中…'));
    const list = [...((dpp.fingerprint.photos as PhotoHash[]) || [])];
    for (const [i, p] of item.photos.entries()) {
      try {
        const r = await fetch(photoUrl(p));
        list.push({ label: `Catalog photo ${i + 1}`, sha256: await hashBytes(await r.arrayBuffer()) });
      } catch {}
    }
    set('fingerprint', 'photos', list);
    setSt(tt('Photo hashes added — save or seal to keep them', '写真のハッシュを追加しました — 残すには保存か確定をしてください'));
  };

  if (missing)
    return (
      <div className="sec">
        <h4>{tt('Set up passports (one time)', 'パスポートを準備する（1回だけ）')}</h4>
        <p>{tt('Provenance passports need three new tables. Tap the button — it takes a few seconds.', '来歴パスポートには新しい表が3つ必要です。ボタンを押してください（数秒で終わります）。')}</p>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn primary" onClick={async () => {
            setSt(tt('Setting up…', '準備中…'));
            const { data } = await db.auth.getSession();
            const r = await fetch('/api/admin/setup-events', { method: 'POST', headers: { authorization: `Bearer ${data.session?.access_token || ''}` } });
            const j = await r.json().catch(() => ({}));
            if (r.ok) { setSt(tt('Done — passports are ready', '完了 — パスポートを使えます')); setTimeout(load, 800); }
            else setSt(j.error === 'no-db-url' ? 'Automatic setup is not available. Use the manual steps below.' : tt('Automatic setup failed: ', '自動セットアップに失敗しました：') + (j.error || r.status));
          }}>{tt('Set up passports', 'パスポートを準備する')}</button>
        </div>
        {st && <p className="status">{st}</p>}
        <p style={{ marginTop: 10 }}><b>{tt('If the button does not work:', 'ボタンが動かない場合：')}</b></p>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
          <li><button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(PASSPORT_SQL); setSt(tt('Setup code copied', 'セットアップのコードをコピーしました')); } catch { setSt(tt('Could not copy — select the code below', 'コピーできませんでした — 下のコードを選んでください')); } }}>{tt('Copy setup code', 'セットアップのコードをコピー')}</button></li>
          <li><a className="btn" href="https://supabase.com/dashboard/project/tgivhkjwibwekuvbcgcm/sql/new" target="_blank" rel="noopener noreferrer">{tt('Open Supabase SQL editor', 'Supabase の SQL エディタを開く')}</a> {tt('— sign in if asked.', '— 求められたらログインしてください。')}</li>
          <li>{tt('Paste into the editor and press Run. Then reload this page.', 'エディタに貼り付けて Run を押し、このページを再読み込みしてください。')}</li>
        </ol>
        <details style={{ marginTop: 8 }}>
          <summary>{tt('Show the setup code', 'セットアップのコードを表示')}</summary>
          <textarea readOnly value={PASSPORT_SQL} style={{ width: '100%', minHeight: 200, fontSize: 11 }} onFocus={(e) => e.currentTarget.select()} />
        </details>
      </div>
    );

  const keysList = Array.from(ringV.keys.values());
  const founderSec = (
    <div className="sec">
      <h4>{tt('Founder keys · two-key signing', '創業者の鍵 · 2つの鍵での署名')}</h4>
      <p>
        {tt('Every record needs', 'すべての記録に必要なもの：')} <b>{tt('two signatures', '2つの署名')}</b>{tt(': the server\'s and a founder device key that never leaves this device (it cannot be copied, even by this page). If the server or database is ever broken into, nobody can create a valid record without your device. New devices can only be added with an existing key or the offline recovery key.', '：サーバーの鍵と、この端末から出ない創業者の端末の鍵（このページでさえコピーできません）。サーバーやデータベースに侵入されても、あなたの端末なしには誰も有効な記録を作れません。新しい端末を追加できるのは、既存の鍵かオフラインの復旧鍵があるときだけです。')}
      </p>
      {aal && !mfa && (
        <div className="pa-warn">
          <p><b>{tt('Turn on two-step sign-in first.', '先に2段階ログインをオンにしてください。')}</b> {tt('Signing records and managing keys needs a login verified with a 6-digit code. Go to', '記録への署名や鍵の管理には、6桁のコードで確認したログインが必要です。移動先：')} <b>{tt('Settings → Two-step sign-in', '設定 → 2段階ログイン')}</b>.</p>
        </div>
      )}
      {!deviceSupported() && <p className="status">{tt('This browser cannot hold a device key. Use Safari, Chrome or Edge.', 'このブラウザは端末の鍵を保存できません。Safari、Chrome、Edge をお使いください。')}</p>}
      {info?.ring && !info.ring.ok && <p className="status status-err">{tt('The keyring does not verify — signing is locked. Contact support before doing anything else.', '鍵の台帳の検証が通りません — 署名はロックされています。ほかの操作をする前に、サポートに連絡してください。')}</p>}
      {info && mfa && (
        <p>
          Face ID for signing: {faces.length ? <b style={{ color: '#0b6b2c' }}>{faces.length} registered ✓</b> : <b>{tt('not set', '未設定')}</b>}
          {faces.length > 0 && <> ({faces.map((x) => x.label).join(', ')})</>} · this device {faceHere ? '✓' : '—'}
        </p>
      )}
      {info && info.permanent && mfa && ringList.length === 0 && (
        <div className="pa-warn">
          {!faces.length ? (
            <>
              <p><b>{tt('Step 1.', '手順1.')}</b> {tt('Register Face ID (or Touch ID / fingerprint) on this device. Every signature will need it.', 'この端末に Face ID（または Touch ID・指紋）を登録してください。署名のたびに必要になります。')}</p>
              <button className="btn primary" disabled={busy} onClick={addFaceHere}>{tt('Register Face ID', 'Face ID を登録')}</button>
            </>
          ) : (
            <>
              <p><b>{tt('Step 2.', '手順2.')}</b> {tt('Create the founder key on this device. You will be asked for Face ID.', 'この端末で創業者の鍵を作ります。Face ID を求められます。')}</p>
              <button className="btn primary" disabled={busy} onClick={createFounder}>{tt('Create founder key on this device', 'この端末で創業者の鍵を作る')}</button>
            </>
          )}
        </div>
      )}
      {devActive && !faceHere && (
        <div className="pa-warn">
          <p>{tt('This device is active but Face ID is not registered here yet. Signing needs it.', 'この端末は有効ですが、まだ Face ID が登録されていません。署名に必要です。')}</p>
          <button className="btn primary" disabled={busy} onClick={addFaceHere}>{tt('Register Face ID on this device', 'この端末に Face ID を登録')}</button>
        </div>
      )}
      {ringList.length > 0 && (
        <>
          <p>
            This device: {dev ? <b>#{keyId(dev.pub)}</b> : tt('no key', '鍵なし')} {devActive ? <b style={{ color: '#0b6b2c' }}>{tt('· active — you can sign', '· 有効 — 署名できます')}</b> : dev ? tt('· waiting for approval', '· 承認待ち') : ''}
          </p>
          <div className="tablewrap">
            <table>
              <thead><tr><th>{tt('Key', '鍵')}</th><th>{tt('Name', '名前')}</th><th>{tt('Since', '登録日')}</th><th>{tt('Status', '状態')}</th><th /></tr></thead>
              <tbody>
                {keysList.map((k) => (
                  <tr key={k.key}>
                    <td className="pa-hash">#{keyId(k.key)}{dev?.pub === k.key ? ' (this device)' : ''}</td>
                    <td>{k.label}</td>
                    <td>{new Date(k.added).toLocaleDateString('en-US')}</td>
                    <td>{k.revoked ? 'revoked' : 'active'}</td>
                    <td>{!k.revoked && devActive && k.key !== dev?.pub && <button className="btn danger" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => revoke(k.key, k.label)}>{tt('Revoke', '取り消す')}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {devActive && (
            <>
              {!keysList.some((k) => !k.revoked && /recovery/i.test(k.label)) && (
                <div className="pa-warn">
                  <p><b>{tt('Make an offline recovery key now.', 'いま、オフラインの復旧鍵を作ってください。')}</b> {tt('If every device is lost, this file is the only way to approve a new one. Keep it on a USB stick or printed, never in the cloud.', 'すべての端末をなくしたとき、新しい端末を承認できるのはこのファイルだけです。USBメモリか印刷で保管し、クラウドには置かないでください。')}</p>
                  <button className="btn primary" disabled={busy} onClick={makeRecovery}>{tt('Create recovery key file', '復旧鍵のファイルを作る')}</button>
                </div>
              )}
              {keysList.some((k) => !k.revoked && /recovery/i.test(k.label)) && <p>{tt('Offline recovery key registered ✓', 'オフラインの復旧鍵を登録済み ✓')}</p>}
              <details style={{ marginTop: 8 }}>
                <summary>{tt('Approve another device', '別の端末を承認')}</summary>
                <p>{tt('On the new device, open this tab and press “Set up this device”. Paste the code it shows here.', '新しい端末でこのタブを開き、「この端末を準備する」を押してください。表示されたコードをここに貼り付けます。')}</p>
                <div className="form">
                  <label className="wide">{tt('Device code', '端末のコード')}<input type="text" value={pairCode} onChange={(e) => setPairCode(e.target.value)} placeholder="04…" /></label>
                  <label>{tt('Name', '名前')}<input type="text" value={pairLabel} onChange={(e) => setPairLabel(e.target.value)} placeholder="iPhone" /></label>
                </div>
                <button className="btn" disabled={busy || !/^04[0-9a-fA-F]{128}$/.test(pairCode.trim())} onClick={approveDevice}>{tt('Approve', '承認')}</button>
              </details>
            </>
          )}
          {mfa && !devActive && (
            <div className="pa-warn">
              {!dev ? (
                <button className="btn primary" disabled={busy} onClick={setupThisDevice}>{tt('Set up this device', 'この端末を準備する')}</button>
              ) : (
                <>
                  <p>{tt('Approve this device from an active device by pasting this code there:', '有効な端末でこのコードを貼り付けて、この端末を承認してください：')}</p>
                  <p className="pa-hash"><b>{dev.pub}</b> <button className="btn" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => navigator.clipboard.writeText(dev.pub).then(() => setSt(tt('Code copied', 'コードをコピーしました')))}>{tt('Copy', 'コピー')}</button></p>
                  <p>{tt('Or approve it with the offline recovery key file:', 'または、オフラインの復旧鍵のファイルで承認：')}</p>
                  <label className="btn" style={{ padding: '4px 10px', fontSize: 14 }}>{tt('Use recovery key file', '復旧鍵のファイルを使う')}<input type="file" accept=".json,application/json" hidden onChange={(e) => approveWithRecovery(e.target.files?.[0])} /></label>
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
      <ChainsPanel />
      <div className="sec">
        <h4>{tt('Provenance passports', '来歴パスポート')}</h4>
        <p>
          {tt('Fill in each piece\'s record (aligned with the EU Digital Product Passport), then', '作品ごとの記録（EUデジタル製品パスポートに準拠）を入力してから、')} <b>{tt('Seal', '確定')}</b> {tt('it: the record is signed by this device and the server and becomes permanent and public at /passport/GC-XXXX. Add events as the piece moves.', 'します。記録はこの端末とサーバーで署名され、/passport/GC-XXXX で永久に公開されます。作品が動いたら出来事を追加してください。')} <b>{tt('Anchor', '刻印')}</b> {tt('writes all new records to Solana as one hash. Public demo:', 'は、新しい記録をすべて1つのハッシュにして Solana に書き込みます。公開デモ：')} <a href="/proof" target="_blank" rel="noreferrer">/proof</a>
        </p>
        {info && (
          <p className="pa-hash">
            {tt('Issuer key (= Solana address):', '発行者の鍵（= Solana のアドレス）：')} <a href={explorerAddr(info.issuer, info.chain)} target="_blank" rel="noopener noreferrer">{info.issuer}</a> · {info.chain === 'solana-mainnet' ? 'Solana mainnet' : 'Solana devnet (test network)'} · balance {info.balance == null ? '—' : `${info.balance} SOL`} · {info.permanent ? 'server key stored ✓' : tt('server key not stored yet', 'サーバーの鍵はまだ保存されていません')} · records anchored right after signing, plus daily at 3:00 JST
          </p>
        )}
        {info && !info.permanent && (
          <div className="pa-warn">
            <p><b>{tt('Setup is not finished.', 'セットアップが終わっていません。')}</b> {info.setup === 'no-db-url' ? 'This server cannot create the tables by itself.' : info.setup && info.setup !== 'ran' ? `Automatic setup failed: ${info.setup}` : ''} {info.problem ? `(${info.problem})` : ''}</p>
            <p>{tt('Do this once:', '一度だけ行ってください：')} <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(PASSPORT_SQL); setSt(tt('Setup code copied — paste it in the Supabase SQL editor and press Run', 'セットアップのコードをコピーしました — Supabase の SQL エディタに貼り付けて Run を押してください')); } catch { setSt(tt('Could not copy', 'コピーできませんでした')); } }}>{tt('Copy setup code', 'セットアップのコードをコピー')}</button>{' '}
              <a className="btn" href="https://supabase.com/dashboard/project/tgivhkjwibwekuvbcgcm/sql/new" target="_blank" rel="noopener noreferrer">{tt('Open Supabase SQL editor', 'Supabase の SQL エディタを開く')}</a> {tt('→ paste → Run → reload this page.', '→ 貼り付け → Run → このページを再読み込み。')}</p>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn primary" disabled={busy || !pending} onClick={anchor}>Anchor {pending || ''} to Solana</button>
          <a className="btn" href="/proof" target="_blank" rel="noreferrer">{tt('Open Proof Lab', 'Proof Lab を開く')}</a>
          <a className="btn" href="/labels" target="_blank" rel="noreferrer">{tt('Print labels', 'ラベルを印刷')}</a>
        </div>
        {funds && info && (
          <ol style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
            <li><button className="btn" onClick={() => navigator.clipboard.writeText(info.issuer).then(() => setSt(tt('Address copied', 'アドレスをコピーしました')))}>{tt('Copy issuer address', '発行者のアドレスをコピー')}</button> {tt('(this is a public address, not a password)', '（これは公開のアドレスで、パスワードではありません）')}</li>
            <li><a className="btn" href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer">{tt('Open the Solana faucet', 'Solana の faucet を開く')}</a> {tt('— choose Devnet, paste the address, request 0.5 SOL. Test SOL is free and has no value.', '— Devnet を選び、アドレスを貼り付けて 0.5 SOL を申請します。テスト用の SOL は無料で、価値はありません。')}</li>
            <li>{tt('Come back and press Anchor again.', '戻ってきて、もう一度「刻印」を押してください。')}</li>
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
                <span>{i.band || tt('Untitled', '無題')}{i.published ? '' : tt(' · hidden', ' · 非公開')}</span>
                <span className={`pa-st${seals ? ' sealed' : ''}`}>{seals ? `sealed v${seals} · ${rows.length} rec` : rows.length ? `${rows.length} events` : 'draft'}</span>
              </button>
            );
          })}
          {!items.length && <p>{tt('Add pieces in the Archive tab first.', '先に「アーカイブ」タブで作品を追加してください。')}</p>}
        </div>
      </div>

      {item && dpp && comp && (
        <div className="sec">
          <h4>{certNo(item)} · {item.band}</h4>
          <p>
            {tt('Required fields:', '必須項目：')} <b>{comp.done} / {comp.total}</b>{comp.missing.length ? '' : ' — ready to seal'}{dirty ? ' · unsaved changes' : ''}
          </p>
          <div className={`pa-meter${comp.missing.length ? '' : ' full'}`}><i style={{ width: `${(comp.done / comp.total) * 100}%` }} /></div>

          {DPP_SECTIONS.map((s) => (
            <div key={s.key} className="pa-sec">
              <h5>{jl(s.title)}<small>{jl(s.espr)}</small></h5>
              <div className="form">
                {s.fields.map((f) => {
                  const v = dpp[s.key]?.[f.key];
                  const lab = <>{jl(f.label)}{f.required && <span className="pa-req"> *</span>}</>;
                  if (f.type === 'composition') {
                    const c = (v as Composition) || [];
                    return (
                      <div key={f.key} className="wide">
                        <label style={{ display: 'block' }}>{lab}</label>
                        {c.map((x, i) => (
                          <div key={i} className="pa-comp">
                            <input type="text" value={x.fiber} onChange={(e) => set(s.key, f.key, c.map((y, j) => (j === i ? { ...y, fiber: e.target.value } : y)))} placeholder={tt('Cotton', '綿')} />
                            <input type="number" className="pct" value={x.pct} onChange={(e) => set(s.key, f.key, c.map((y, j) => (j === i ? { ...y, pct: Number(e.target.value) } : y)))} />%
                            <button className="btn" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => set(s.key, f.key, c.filter((_, j) => j !== i))}>{tt('Remove', '外す')}</button>
                          </div>
                        ))}
                        <button className="btn" style={{ padding: '2px 8px', fontSize: 13, marginTop: 4 }} onClick={() => set(s.key, f.key, [...c, { fiber: '', pct: 0 }])}>{tt('Add fibre', '繊維を追加')}</button>
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
                            <button className="btn" style={{ padding: '2px 8px', fontSize: 13 }} onClick={() => set(s.key, f.key, h.filter((_, j) => j !== i))}>{tt('Remove', '外す')}</button>
                          </div>
                        ))}
                        <div className="pa-comp" style={{ marginTop: 4 }}>
                          <label className="btn" style={{ padding: '4px 10px', fontSize: 14 }}>{tt('Add macro photos', '接写写真を追加')}<input type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} /></label>
                          {item.photos.length > 0 && <button className="btn" style={{ padding: '4px 10px', fontSize: 14 }} onClick={hashItemPhotos}>{tt('Hash catalog photos', 'カタログ写真をハッシュ化')}</button>}
                        </div>
                        {f.hint && <small>{jl(f.hint)} {tt('The photo is hashed on this device and is not uploaded.', '写真はこの端末でハッシュ化し、アップロードしません。')}</small>}
                      </div>
                    );
                  }
                  const common = { value: String(v ?? ''), onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(s.key, f.key, f.type === 'number' ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value) };
                  return (
                    <label key={f.key} className={f.type === 'textarea' ? 'wide' : ''}>
                      {lab}
                      {f.type === 'textarea' ? <textarea {...common} placeholder={f.hint && jl(f.hint)} /> : <input type="text" inputMode={f.type === 'number' ? 'decimal' : undefined} {...common} placeholder={f.hint && jl(f.hint)} />}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy} onClick={saveDraft}>{tt('Save draft', '下書きを保存')}</button>
            <button className="btn primary" disabled={busy || comp.missing.length > 0 || !devActive} onClick={seal}>Seal record{mine.some((l) => l.kind === 'seal') ? ' (new version)' : ''}</button>
          </div>
          {comp.missing.length > 0 && <p className="status">Still needed: {comp.missing.join(' · ')}</p>}
        </div>
      )}

      {item && (
        <div className="sec">
          <h4>Add an event · {certNo(item)}</h4>
          <p>{tt('Each event is signed and linked to the one before. Never put buyer names, emails or prices here — the record is public.', '出来事はそれぞれ署名され、一つ前とつながります。購入者の名前、メールアドレス、価格は絶対に入れないでください — 記録は公開されます。')}</p>
          <div className="form">
            <label>{tt('What happened', '出来事')}
              <select value={ev.type} onChange={(e) => setEv({ ...ev, type: e.target.value })}>
                {EVENT_TYPES.map((t) => <option key={t.key} value={t.key}>{jl(t.label)}</option>)}
              </select>
            </label>
            <label>{tt('Date', '日付')}<input type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} /></label>
            <label>{tt('Who (dealer, artist ID…)', '誰が（ディーラー、アーティストID…）')}<input type="text" value={ev.actor} onChange={(e) => setEv({ ...ev, actor: e.target.value })} /></label>
            <label>{tt('Where', '場所')}<input type="text" value={ev.place} onChange={(e) => setEv({ ...ev, place: e.target.value })} placeholder="Los Angeles, US" /></label>
            <label className="wide">{tt('Note', 'メモ')}<textarea value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} placeholder={jl(EVENT_TYPES.find((t) => t.key === ev.type)?.hint || '')} /></label>
          </div>
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button className="btn primary" disabled={busy || !devActive} onClick={addEvent}>{tt('Sign & add', '署名して追加')}</button>
            {!devActive && <span>{tt('Needs an active founder key on this device (see Founder keys).', 'この端末に有効な創業者の鍵が必要です（「創業者の鍵」を参照）。')}</span>}
            {mine.length > 0 && <a className="btn" href={`/passport/${certNo(item)}`} target="_blank" rel="noreferrer">{tt('Open public passport', '公開のパスポートを開く')}</a>}
          </div>
          {mine.length > 0 && (
            <div className="tablewrap pa-log">
              <table>
                <thead><tr><th>#</th><th>{tt('Record', '記録')}</th><th>{tt('Signed', '署名日時')}</th><th>{tt('Hash', 'ハッシュ')}</th><th>Solana</th></tr></thead>
                <tbody>
                  {mine.map((l) => (
                    <tr key={l.id}>
                      <td>{l.seq}</td>
                      <td>{l.kind === 'seal' ? tt(`Sealed v${(l.entry.data as { version?: number }).version}`, `確定 v${(l.entry.data as { version?: number }).version}`) : jl(eventLabel(String(l.entry.data.type)))}</td>
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

      {item && <NfcTagPanel cert={certNo(item)} uid={String((dpp as { fingerprint?: { chip?: string } } | null)?.fingerprint?.chip || '')} />}
    </>
  );
}
