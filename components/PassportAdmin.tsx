'use client';

// 管理画面「Passport」タブ：DPP に沿った記録の入力 → 確定（署名）→ 出来事の追記 → Solana への刻印
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, photoUrl } from '@/lib/supabase';
import { PASSPORT_SQL } from '@/lib/passportSql';
import { DPP_SECTIONS, EVENT_TYPES, completeness, eventLabel, mergeDpp, prefill, type Composition, type Dpp, type PhotoHash } from '@/lib/dpp';
import { explorerAddr, explorerTx } from '@/lib/gcpp';
import { certNo, type Item } from '@/lib/types';

type LogRow = { id: number; item_id: string; seq: number; kind: string; hash: string; anchor_id: number | null; created_at: string; entry: { data: Record<string, unknown> } };
type Info = { issuer: string; permanent?: boolean; chain: string; balance: number | null };

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

  const load = useCallback(async () => {
    const a = await db.from('items').select('*').order('serial');
    setItems((a.data as Item[]) || []);
    const b = await db.from('passport_log').select('id,item_id,seq,kind,hash,anchor_id,created_at,entry').order('id');
    if (b.error) {
      setMissing(/relation|does not exist|schema cache/i.test(b.error.message));
      return setSt('Could not load: ' + b.error.message);
    }
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
    setBusy(true);
    if (!(await saveDraft())) return setBusy(false);
    const { ok, j } = await call({ action: 'seal', item_id: item.id });
    setBusy(false);
    if (!ok) return setSt(j.error === 'missing' ? 'Missing: ' + (j.missing || []).join(' · ') : 'Error: ' + (j.error || 'failed'));
    setSt(`Sealed v${n + 1} — signed and live at /passport/${certNo(item)}`);
    load();
  };
  const addEvent = async () => {
    if (!item) return;
    setBusy(true);
    const { ok, j } = await call({ action: 'event', item_id: item.id, event: ev });
    setBusy(false);
    if (!ok) return setSt('Error: ' + (j.error || 'failed'));
    setSt(`${eventLabel(ev.type)} recorded and signed`);
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

  return (
    <>
      <div className="sec">
        <h4>Provenance passports</h4>
        <p>
          Fill in each piece&apos;s record (aligned with the EU Digital Product Passport), then <b>Seal</b> it: the record is signed with Gallery Crypto&apos;s key and becomes permanent and
          public at /passport/GC-XXXX. Add events as the piece moves. <b>Anchor</b> writes all new records to Solana as one hash. Public demo: <a href="/proof" target="_blank" rel="noreferrer">/proof</a>
        </p>
        {info && (
          <p className="pa-hash">
            Issuer key (= Solana address): <a href={explorerAddr(info.issuer, info.chain)} target="_blank" rel="noopener noreferrer">{info.issuer}</a> · {info.chain === 'solana-mainnet' ? 'Solana mainnet' : 'Solana devnet (test network)'} · balance {info.balance == null ? '—' : `${info.balance} SOL`} · {info.permanent ? 'key stored permanently ✓' : 'temporary key (finishing setup)'} · auto-anchor daily 3:00 JST
          </p>
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
            <button className="btn primary" disabled={busy || comp.missing.length > 0} onClick={seal}>Seal record{mine.some((l) => l.kind === 'seal') ? ' (new version)' : ''}</button>
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
            <button className="btn primary" disabled={busy} onClick={addEvent}>Sign &amp; add</button>
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
