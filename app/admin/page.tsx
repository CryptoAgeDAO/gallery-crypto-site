'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, photoUrl, configured } from '@/lib/supabase';
import { shrink } from '@/lib/image';
import { onSfxChange, setSfx, sfx, sfxBoot, sfxEnabled } from '@/lib/sfx';
import Ticket from '@/components/Ticket';
import PassportAdmin from '@/components/PassportAdmin';
import SecurityCenter from '@/components/SecurityCenter';
import { MfaChallenge, TwoStepSettings, useAal } from '@/components/TwoStep';
import { EVENTS_SQL } from '@/lib/eventsSql';
import { eventDate, type EventEntry, type GcEvent } from '@/lib/types';
import { DEFAULT_SETTINGS, ERA_LABEL, certNo, eraOf, usd, type Item, type Settings } from '@/lib/types';

type Entry = { id: string; email: string; item_id: string | null; created_at: string; won: boolean; token: string | null; used_at: string | null };
type Order = { id: string; item_id: string | null; email: string; name: string; amount: number; currency: string; shipping: Record<string, string> | null; shipped_at: string | null; created_at: string };
type Msg = { id: string; name: string; email: string; body: string; created_at: string };
type Tab = 'items' | 'entries' | 'events' | 'passport' | 'security' | 'orders' | 'messages' | 'settings';

const BLANK: Omit<Item, 'id' | 'serial' | 'created_at'> = {
  photos: [], band: '', title: '', year: '', era: '', size: '', tag: '', stitch: false,
  made_in: 'USA', cond: '', prov: '', dealer: '', published: true, rank: '', price_usd: null, sold: false,
  listen: '', audio_path: '', audio_name: '', audio_credit: '',
};

const fmt = (s: string) => new Date(s).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });

function csvDownload(name: string, rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const AUDIO_EXT: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg' };
async function uploadAudio(file: File): Promise<{ path: string; name: string }> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const type = AUDIO_EXT[ext];
  if (!type) throw new Error('Choose an mp3, m4a, wav or aac file.');
  if (file.size > 20 * 1024 * 1024) throw new Error('The file is over 20 MB. Shorten or compress it.');
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase()!.storage.from('audio').upload(path, file, { contentType: type, cacheControl: '31536000' });
  if (error) throw error;
  return { path, name: file.name.replace(/\.[^.]+$/, '') };
}

async function upload(files: FileList | File[]): Promise<string[]> {
  const db = supabase()!;
  const out: string[] = [];
  for (const f of Array.from(files)) {
    const blob = await shrink(f);
    const path = `${crypto.randomUUID()}.jpg`;
    const { error } = await db.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (error) throw error;
    out.push(path);
  }
  return out;
}

function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gc-admin-email');
      if (saved) setEmail(saved);
    } catch {}
  }, []);
  const remember = () => {
    try { localStorage.setItem('gc-admin-email', email.trim()); } catch {}
  };
  const sendLink = async () => {
    setBusy(true);
    setSt('Sending…');
    const { error } = await supabase()!.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/admin` },
    });
    setBusy(false);
    if (error) return setSt(/rate|seconds/i.test(error.message) ? 'Too many requests. Wait a minute and try again.' : 'This email cannot sign in. Check that it is registered as an admin.');
    remember();
    setSt('Email sent. On iPhone, long-press the link and choose "Open in Safari".');
  };
  const signIn = async () => {
    setBusy(true);
    setSt('Signing in…');
    const { error } = await supabase()!.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) return setSt('Wrong email or password. If you have not set a password yet, sign in with the email link and set one under Settings.');
    remember();
  };
  return (
    <form
      className="sec"
      style={{ maxWidth: 420 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === 'password') signIn();
        else sendLink();
      }}
    >
      <h4>Admin sign-in</h4>
      <div className="adm-tabs">
        <button type="button" aria-pressed={mode === 'password'} onClick={() => { setMode('password'); setSt(''); }}>Password</button>
        <button type="button" aria-pressed={mode === 'link'} onClick={() => { setMode('link'); setSt(''); }}>Email link</button>
      </div>
      <input type="email" required autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      {mode === 'password' ? (
        <>
          <input type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" />
          <button className="btn primary" type="submit" disabled={busy}>Sign in</button>
          <p>First time, or forgot your password? Use the email link, then set a password under Settings.</p>
        </>
      ) : (
        <>
          <button className="btn primary" type="submit" disabled={busy}>Send sign-in link</button>
          <p>Open the link in the email to sign in.</p>
        </>
      )}
      {st && <p>{st}</p>}
    </form>
  );
}

function PasswordForm({ highlight }: { highlight?: boolean }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [st, setSt] = useState('');
  return (
    <form
      className="sec"
      style={highlight ? { borderColor: 'var(--fg)' } : undefined}
      onSubmit={async (e) => {
        e.preventDefault();
        if (pw.length < 8) return setSt('Use at least 8 characters.');
        if (pw !== pw2) return setSt('The two entries do not match.');
        setSt('Saving…');
        const { error } = await supabase()!.auth.updateUser({ password: pw });
        if (error) return setSt('Could not save: ' + error.message);
        setPw(''); setPw2('');
        setSt('Password set. You can now sign in with your email and password on any device.');
      }}
    >
      <h4>{highlight ? 'Set your sign-in password' : 'Sign-in password'}</h4>
      <p>Once set, sign in on iPhone or computer with your email and this password. Saving it on your iPhone is handy.</p>
      <div className="form">
        <label>New password (8+ characters)<input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label>Again<input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" type="submit">Save password</button>
        {st && <span className="status">{st}</span>}
      </div>
    </form>
  );
}

function ItemForm({ init, onDone }: { init: Partial<Item> | null; onDone: (msg?: string) => void }) {
  const [f, setF] = useState({ ...BLANK, ...(init || {}) });
  const [busy, setBusy] = useState('');
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const db = supabase()!;
  const save = async () => {
    setBusy('Saving…');
    const row = {
      photos: f.photos, band: f.band.trim(), title: f.title.trim(), year: f.year.trim(),
      era: f.era || eraOf(f.year), size: f.size, tag: f.tag.trim(), stitch: f.stitch, made_in: f.made_in.trim(),
      cond: f.cond.trim(), prov: f.prov.trim(), dealer: f.dealer.trim(), published: f.published, rank: f.rank || '',
      price_usd: f.price_usd ? Math.round(Number(f.price_usd)) || null : null, sold: f.sold,
      listen: /^https:\/\//.test(f.listen.trim()) ? f.listen.trim() : '', audio_path: f.audio_path, audio_name: f.audio_name.trim(), audio_credit: f.audio_credit.trim(),
    };
    const { error } = init?.id ? await db.from('items').update(row).eq('id', init.id) : await db.from('items').insert(row);
    setBusy('');
    if (error) return alertMsg(error.message);
    onDone('Saved');
  };
  const alertMsg = (m: string) => setBusy('Error: ' + m);
  return (
    <div className="sec">
      <h4>{init?.id ? `Edit ${certNo(init as Item)}` : 'Add a piece'}</h4>
      <div className="photos">
        {f.photos.map((p) => (
          <figure key={p}>
            <img src={photoUrl(p)} alt="" />
            <button type="button" onClick={() => set('photos', f.photos.filter((x) => x !== p))} aria-label="Remove photo">×</button>
          </figure>
        ))}
        <label className="btn" style={{ cursor: 'pointer' }}>
          Add photos
          <input type="file" accept="image/*" multiple hidden onChange={async (e) => {
            if (!e.target.files?.length) return;
            setBusy('Uploading…');
            try { const p = await upload(e.target.files); set('photos', [...f.photos, ...p]); setBusy(''); }
            catch (err) { alertMsg((err as Error).message); }
          }} />
        </label>
      </div>
      <div className="form">
        <label>Band<input value={f.band} onChange={(e) => set('band', e.target.value)} /></label>
        <label>Tour / design<input value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label>Year<input inputMode="numeric" value={f.year} onChange={(e) => set('year', e.target.value)} placeholder="1991" /></label>
        <label>Decade
          <select value={f.era} onChange={(e) => set('era', e.target.value)}>
            <option value="">Auto from year</option>
            {Object.entries(ERA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Size
          <select value={f.size} onChange={(e) => set('size', e.target.value)}>
            <option value="">—</option>
            {['xs', 's', 'm', 'l', 'xl', 'xxl'].map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </select>
        </label>
        <label>Tag<input value={f.tag} onChange={(e) => set('tag', e.target.value)} placeholder="Brockum" /></label>
        <label>Made in<input value={f.made_in} onChange={(e) => set('made_in', e.target.value)} /></label>
        <label>Condition<input value={f.cond} onChange={(e) => set('cond', e.target.value)} placeholder="Good — light fading" /></label>
        <label>Dealer (source)<input value={f.dealer} onChange={(e) => set('dealer', e.target.value)} placeholder="Blank = Founder's collection" /></label>
        <label>Price (USD, public)<input inputMode="numeric" value={f.price_usd ?? ''} onChange={(e) => set('price_usd', e.target.value.replace(/[^0-9]/g, '') || null)} placeholder="e.g. 450" /></label>
        <label>Rank (private)<input value={f.rank || ''} onChange={(e) => set('rank', e.target.value)} placeholder="A / B / C" /></label>
        <label className="wide">Listen link (Spotify, Apple Music or YouTube URL)<input type="url" value={f.listen} onChange={(e) => set('listen', e.target.value)} placeholder="https://open.spotify.com/track/..." /></label>
        <div className="sec wide" style={{ gridColumn: '1/-1' }}>
          <h4>Audio file (only audio you have the rights to)</h4>
          <p>Playing commercial recordings on the site needs permission for both the song (publishing, e.g. JASRAC) and the recording (label). For anything unlicensed, use the listen link above. Upload only audio you made or have a licence for (mp3, m4a, wav, up to 20 MB).</p>
          <div className="row" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
            {f.audio_path ? (
              <>
                <span>♪ {f.audio_name || 'Audio'}</span>
                <button type="button" className="btn" onClick={() => { set('audio_path', ''); set('audio_name', ''); }}>Remove</button>
              </>
            ) : (
              <span className="note">No audio yet</span>
            )}
            <label className="btn" style={{ cursor: 'pointer' }}>
              Choose audio
              <input type="file" accept="audio/*,.mp3,.m4a,.wav,.aac" hidden onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy('Uploading audio…');
                try { const a = await uploadAudio(file); set('audio_path', a.path); set('audio_name', a.name); setBusy('Audio added — remember to save'); }
                catch (err) { alertMsg((err as Error).message); }
              }} />
            </label>
          </div>
          <label>Track name (public)<input value={f.audio_name} onChange={(e) => set('audio_name', e.target.value)} /></label>
          <label>Credit (public, e.g. Music by … / Licensed)<input value={f.audio_credit} onChange={(e) => set('audio_credit', e.target.value)} /></label>
        </div>
        <label className="wide">Provenance (public)<textarea value={f.prov} onChange={(e) => set('prov', e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={f.stitch} onChange={(e) => set('stitch', e.target.checked)} />Single stitch</label>
        <label className="check"><input type="checkbox" checked={f.sold} onChange={(e) => set('sold', e.target.checked)} />Sold</label>
        <label className="check"><input type="checkbox" checked={f.published} onChange={(e) => set('published', e.target.checked)} />Published on the site</label>
      </div>
      <p className="note">Rank is shown only here and cannot be read from the public site. Do not enter purchase costs anywhere.</p>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" disabled={!!busy && busy !== '' && !busy.startsWith('Error')} onClick={save}>Save</button>
        <button className="btn" onClick={() => onDone()}>Close</button>
        {busy && <span className="status">{busy}</span>}
      </div>
    </div>
  );
}

function Items() {
  const db = supabase()!;
  const [items, setItems] = useState<Item[]>([]);
  const [edit, setEdit] = useState<Partial<Item> | null | undefined>(undefined);
  const [st, setSt] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await db.from('items').select('*').order('serial', { ascending: false });
    if (error) setSt('Could not load: ' + error.message);
    else setItems((data as Item[]) || []);
  }, [db]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="sec">
        <h4>Add from photos</h4>
        <p>Each photo becomes one draft piece (not public). Fill in the details later and publish. On iPhone you can shoot straight from the camera.</p>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <label className="btn primary" style={{ cursor: 'pointer' }}>
            Choose photos
            <input type="file" accept="image/*" multiple hidden onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (!files.length) return;
              try {
                for (let i = 0; i < files.length; i++) {
                  setSt(`Uploading ${i + 1} / ${files.length}`);
                  const [p] = await upload([files[i]]);
                  const { error } = await db.from('items').insert({ ...BLANK, photos: [p], published: false });
                  if (error) throw error;
                }
                setSt(`Added ${files.length} drafts`);
                load();
              } catch (err) { setSt('Error: ' + (err as Error).message); }
            }} />
          </label>
          <label className="btn" style={{ cursor: 'pointer' }}>
            Take a photo
            <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setSt('Uploading…');
              try { const [p] = await upload([f]); setEdit({ ...BLANK, photos: [p] }); setSt(''); }
              catch (err) { setSt('Error: ' + (err as Error).message); }
            }} />
          </label>
          <button className="btn" onClick={() => setEdit(null)}>Add without photo</button>
          <button className="btn" onClick={() => csvDownload('items.csv', [
            ['No.', 'band', 'title', 'year', 'era', 'size', 'tag', 'stitch', 'made_in', 'cond', 'dealer', 'rank', 'price_usd', 'sold', 'published', 'provenance'],
            ...items.map((it) => [certNo(it), it.band, it.title, it.year, it.era, it.size, it.tag, it.stitch ? 'yes' : '', it.made_in, it.cond, it.dealer, it.rank || '', it.price_usd, it.sold ? 'yes' : '', it.published ? 'yes' : 'no', it.prov]),
          ])}>CSV</button>
        </div>
        {st && <p className="status">{st}</p>}
      </div>

      {edit !== undefined && <ItemForm key={edit?.id || 'new' + (edit?.photos?.[0] || '')} init={edit} onDone={(m) => { setEdit(undefined); if (m) setSt(m); load(); }} />}

      <p className="note">{items.length} pieces · {items.filter((i) => i.published).length} published · {items.filter((i) => !i.published).length} drafts</p>
      <div className="adm-grid">
        {items.map((it) => (
          <div key={it.id} style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
            <button className="card" onClick={() => setEdit(it)} style={{ opacity: it.published ? 1 : 0.5 }}>
              <div className="ph">{it.photos[0] ? <img src={photoUrl(it.photos[0])} alt="" loading="lazy" /> : <span className="noimg">No image</span>}</div>
              <div className="cap">
                <span className="nm">{it.band || '(no band yet)'}</span>
                <span className="sub">{certNo(it)}{it.published ? '' : ' · draft'}{it.rank ? ` · ${it.rank}` : ''}{it.sold ? ' · SOLD' : it.price_usd ? ` · ${usd(it.price_usd)}` : ''}</span>
              </div>
            </button>
            <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={async () => {
              if (!confirm(`Delete ${certNo(it)} ${it.band}?`)) return;
              await db.from('items').delete().eq('id', it.id);
              if (it.photos.length) await db.storage.from('photos').remove(it.photos);
              if (it.audio_path) await db.storage.from('audio').remove([it.audio_path]);
              load();
            }}>Delete</button>
          </div>
        ))}
      </div>
    </>
  );
}

function Entries() {
  const db = supabase()!;
  const [rows, setRows] = useState<Entry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [onlyWon, setOnlyWon] = useState(false);
  const [st, setSt] = useState('');
  const load = useCallback(async () => {
    const [{ data: e }, { data: i }] = await Promise.all([
      db.from('entries').select('*').order('created_at', { ascending: false }),
      db.from('items').select('id,serial,band'),
    ]);
    setRows((e as Entry[]) || []);
    const m: Record<string, string> = {};
    (i || []).forEach((x: { id: string; serial: number; band: string }) => (m[x.id] = `${certNo(x)} ${x.band}`));
    setNames(m);
  }, [db]);
  useEffect(() => { load(); }, [load]);
  const label = (id: string | null) => (id ? names[id] || '(deleted)' : 'General entry');
  const link = (t: string | null) => (t ? `${location.origin}/buy/${t}` : '');
  const uniq = new Set(rows.map((r) => r.email)).size;
  const shown = onlyWon ? rows.filter((r) => r.won) : rows;
  const setWon = async (r: Entry, won: boolean) => {
    const { error } = await db.from('entries').update(won ? { won: true, token: r.token || crypto.randomUUID() } : { won: false, token: null }).eq('id', r.id);
    setSt(error ? 'Error: ' + error.message : won ? 'Marked as winner. Copy the purchase link and email it to them.' : 'Win cancelled (the link no longer works).');
    load();
  };
  return (
    <div className="sec">
      <h4>Draw entries ({rows.length} · {uniq} people · {rows.filter((r) => r.won).length} winners)</h4>
      <p>Marking a winner creates a one-time purchase link only they can use. It works even before general sale opens.</p>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <label className="check" style={{ fontSize: 12 }}><input type="checkbox" checked={onlyWon} onChange={(e) => setOnlyWon(e.target.checked)} />Winners only</label>
        <button className="btn" onClick={() => csvDownload('entries.csv', [['email', 'item', 'entered', 'won', 'purchase_link', 'purchased'], ...rows.map((r) => [r.email, label(r.item_id), r.created_at, r.won ? 'yes' : '', link(r.token), r.used_at || ''])])}>CSV</button>
        {st && <span className="status">{st}</span>}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Email</th><th>Piece</th><th>Date</th><th>Winner / link</th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.id}>
              <td>{r.email}</td><td>{label(r.item_id)}</td><td>{fmt(r.created_at)}</td>
              <td>
                {r.used_at ? 'Purchased' : r.won ? (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={async () => { await navigator.clipboard.writeText(link(r.token)); setSt('Link copied'); }}>Copy link</button>
                    <a className="btn" style={{ padding: '4px 8px', fontSize: 11 }} href={`mailto:${r.email}?subject=${encodeURIComponent('Gallery Crypto — You won the draw')}&body=${encodeURIComponent(`Congratulations — you won the Gallery Crypto presale draw.\n\nYou can buy your piece here (this link is for you only and works once):\n${link(r.token)}\n\nGallery Crypto`)}`}>Write email</a>
                    <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setWon(r, false)}>Cancel</button>
                  </span>
                ) : (
                  <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setWon(r, true)}>Mark winner</button>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function Orders() {
  const db = supabase()!;
  const [rows, setRows] = useState<Order[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const [{ data: o }, { data: i }] = await Promise.all([
      db.from('orders').select('*').order('created_at', { ascending: false }),
      db.from('items').select('id,serial,band'),
    ]);
    setRows((o as Order[]) || []);
    const m: Record<string, string> = {};
    (i || []).forEach((x: { id: string; serial: number; band: string }) => (m[x.id] = `${certNo(x)} ${x.band}`));
    setNames(m);
  }, [db]);
  useEffect(() => { load(); }, [load]);
  const addr = (a: Record<string, string> | null) => (a ? [a.line1, a.line2, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(', ') : '');
  const total = rows.reduce((n, r) => n + r.amount, 0) / 100;
  return (
    <div className="sec">
      <h4>Orders ({rows.length} · total {usd(total) || '$0'})</h4>
      <p>Paid orders appear here automatically and the piece is marked sold. Refunds are made in the Stripe dashboard.</p>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" onClick={() => csvDownload('orders.csv', [['date', 'item', 'name', 'email', 'amount', 'currency', 'address', 'shipped'], ...rows.map((r) => [r.created_at, r.item_id ? names[r.item_id] || '' : '', r.name, r.email, r.amount / 100, r.currency, addr(r.shipping), r.shipped_at || ''])])}>CSV</button>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Date</th><th>Piece</th><th>Buyer / ship to</th><th>Amount</th><th>Shipping</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td>{fmt(r.created_at)}</td>
              <td>{r.item_id ? names[r.item_id] || '(deleted)' : ''}</td>
              <td>{r.name}<br /><a href={`mailto:${r.email}`}>{r.email}</a><br />{addr(r.shipping)}</td>
              <td>{usd(r.amount / 100)}</td>
              <td>{r.shipped_at ? fmt(r.shipped_at) : (
                <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={async () => { await db.from('orders').update({ shipped_at: new Date().toISOString() }).eq('id', r.id); load(); }}>Mark shipped</button>
              )}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function Messages() {
  const db = supabase()!;
  const [rows, setRows] = useState<Msg[]>([]);
  const load = useCallback(async () => {
    const { data } = await db.from('messages').select('*').order('created_at', { ascending: false });
    setRows((data as Msg[]) || []);
  }, [db]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="sec">
      <h4>Messages ({rows.length})</h4>
      {!rows.length && <p>None yet.</p>}
      {rows.map((m) => (
        <div key={m.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'grid', gap: 6 }}>
          <p style={{ color: 'var(--fg)' }}><b>{m.name}</b> · <a href={`mailto:${m.email}`}>{m.email}</a> · {fmt(m.created_at)}</p>
          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--fg)' }}>{m.body}</p>
          <div><button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={async () => {
            if (!confirm('Delete this message?')) return;
            await db.from('messages').delete().eq('id', m.id); load();
          }}>Delete</button></div>
        </div>
      ))}
    </div>
  );
}

// イベント・抽選（入場券のようなチケット）。当たり外れ（lottery）か、入場順の抽選（order）。
const EV_BLANK = { title: '', starts_at: '', venue: '', description: '', mode: 'lottery' as GcEvent['mode'], capacity: 10, published: true };
const toLocal = (s: string | null) => (s ? new Date(new Date(s).getTime() + 9 * 3600_000).toISOString().slice(0, 16) : '');
const fromLocal = (s: string) => (s ? new Date(s + ':00+09:00').toISOString() : null);
function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    const j = u[0] % (i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function EventsAdmin() {
  const db = supabase()!;
  const [list, setList] = useState<GcEvent[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EV_BLANK & { id?: string }>(EV_BLANK);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<EventEntry[]>([]);
  const [st, setSt] = useState('');
  const [missing, setMissing] = useState(false);
  const ev = list.find((e) => e.id === sel) || null;

  const load = useCallback(async () => {
    const { data, error } = await db.from('events').select('*').order('created_at', { ascending: false });
    if (error) {
      setMissing(/relation|does not exist|schema cache/i.test(error.message));
      return setSt('Could not load: ' + error.message);
    }
    setList((data as GcEvent[]) || []);
  }, [db]);
  const loadRows = useCallback(async (id: string) => {
    const { data } = await db.from('event_entries').select('*').eq('event_id', id).order('ticket_no', { ascending: true });
    setRows((data as EventEntry[]) || []);
  }, [db]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (sel) loadRows(sel); else setRows([]); }, [sel, loadRows]);

  const save = async () => {
    if (!form.title.trim()) return setSt('Give the event a title.');
    const row = { title: form.title.trim(), starts_at: fromLocal(form.starts_at), venue: form.venue.trim(), description: form.description.trim(), mode: form.mode, capacity: Math.max(0, Number(form.capacity) || 0), published: form.published };
    const r = form.id ? await db.from('events').update(row).eq('id', form.id).select('id').single() : await db.from('events').insert(row).select('id').single();
    if (r.error) return setSt('Error: ' + r.error.message);
    setSt('Saved');
    setEditing(false);
    await load();
    setSel(r.data.id);
  };
  const setStatus = async (status: GcEvent['status']) => {
    if (!ev) return;
    const { error } = await db.from('events').update({ status }).eq('id', ev.id);
    setSt(error ? 'Error: ' + error.message : status === 'open' ? 'Tickets reopened' : status === 'closed' ? 'Tickets closed' : 'Results published');
    load();
  };
  const draw = async () => {
    if (!ev || !rows.length) return;
    const msg = ev.mode === 'lottery' ? `Draw ${Math.min(ev.capacity, rows.length)} winners from ${rows.length} tickets? Ticket holders see the result right away.` : `Draw the entry order for ${rows.length} tickets? Ticket holders see their number right away.`;
    if (!confirm(msg)) return;
    setSt('Drawing…');
    const order = shuffle(rows);
    for (let i = 0; i < order.length; i++) {
      const patch = ev.mode === 'lottery' ? { result: i < ev.capacity ? 'win' : 'lose', position: null } : { position: i + 1, result: null };
      const { error } = await db.from('event_entries').update(patch).eq('id', order[i].id);
      if (error) return setSt('Error: ' + error.message);
    }
    await db.from('events').update({ status: 'drawn' }).eq('id', ev.id);
    setSt('Draw complete — results are live on every ticket link');
    await load();
    loadRows(ev.id);
  };
  const reset = async () => {
    if (!ev || !confirm('Clear the results and go back to "closed"?')) return;
    await db.from('event_entries').update({ result: null, position: null }).eq('event_id', ev.id);
    await db.from('events').update({ status: 'closed' }).eq('id', ev.id);
    setSt('Results cleared');
    await load();
    loadRows(ev.id);
  };
  const remove = async () => {
    if (!ev || !confirm(`Delete "${ev.title}" and all ${rows.length} tickets?`)) return;
    await db.from('events').delete().eq('id', ev.id);
    setSel(null);
    load();
  };
  const link = (t: string) => `${location.origin}/ticket/${t}`;
  const sorted = ev?.mode === 'order' && ev.status === 'drawn' ? rows.slice().sort((a, b) => (a.position || 0) - (b.position || 0)) : rows;

  if (missing)
    return (
      <div className="sec">
        <h4>Set up events (one time)</h4>
        <p>The events feature needs two new tables in the database. Tap the button below — it takes a few seconds.</p>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button
            className="btn primary"
            onClick={async () => {
              setSt('Setting up…');
              const { data } = await db.auth.getSession();
              const r = await fetch('/api/admin/setup-events', { method: 'POST', headers: { authorization: `Bearer ${data.session?.access_token || ''}` } });
              const j = await r.json().catch(() => ({}));
              if (r.ok) {
                setSt('Done — events are ready');
                setMissing(false);
                setTimeout(load, 800);
              } else setSt(j.error === 'no-db-url' ? 'Automatic setup is not available. Use the manual steps below.' : 'Automatic setup failed: ' + (j.error || r.status) + ' — use the manual steps below.');
            }}
          >
            Set up events
          </button>
        </div>
        {st && <p className="status">{st}</p>}
        <p style={{ marginTop: 10 }}><b>If the button does not work:</b></p>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
          <li>
            <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(EVENTS_SQL); setSt('Setup code copied'); } catch { setSt('Could not copy — select the code below and copy it'); } }}>Copy setup code</button>
          </li>
          <li>
            <a className="btn" href="https://supabase.com/dashboard/project/tgivhkjwibwekuvbcgcm/sql/new" target="_blank" rel="noopener noreferrer">Open Supabase SQL editor</a> — sign in if asked.
          </li>
          <li>Paste into the editor and press Run. Then reload this page.</li>
        </ol>
        <details style={{ marginTop: 8 }}>
          <summary>Show the setup code</summary>
          <textarea readOnly value={EVENTS_SQL} style={{ width: '100%', minHeight: 200, fontSize: 11 }} onFocus={(e) => e.currentTarget.select()} />
        </details>
      </div>
    );

  return (
    <>
      <div className="sec">
        <h4><span className="ev-badge">EVENT</span> Events &amp; ticket draws</h4>
        <p>Run a separate event or draw. Visitors get a numbered ticket like an admission ticket. Lottery: you draw winners and losers. Order: you draw the entry order. Each ticket has its own link where the result appears.</p>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn primary" onClick={() => { setForm(EV_BLANK); setEditing(true); setSel(null); }}>New event</button>
        </div>
        {list.length > 0 && (
          <div className="ev-adm-list">
            {list.map((e) => (
              <button key={e.id} className={`ev-adm-item${sel === e.id ? ' on' : ''}`} onClick={() => { setSel(e.id); setEditing(false); }}>
                <span className="ev-badge sm">{e.mode === 'lottery' ? 'LOTTERY' : 'ORDER'}</span>
                <b>{e.title || 'Untitled'}</b>
                <span>{eventDate(e.starts_at)}</span>
                <span className={`ev-st ${e.status}`}>{e.status}{e.published ? '' : ' · hidden'}</span>
              </button>
            ))}
          </div>
        )}
        {st && <p className="status">{st}</p>}
      </div>

      {editing && (
        <div className="sec">
          <h4>{form.id ? 'Edit event' : 'New event'}</h4>
          <div className="form">
            <label className="wide">Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Pop-up at Harajuku" /></label>
            <label>Date &amp; time (JST)<input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></label>
            <label>Venue<input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Tokyo" /></label>
            <label>Type
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as GcEvent['mode'] })}>
                <option value="lottery">Lottery — win or lose</option>
                <option value="order">Order — draw the entry order</option>
              </select>
            </label>
            {form.mode === 'lottery' && <label>Winners<input inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} /></label>}
            <label className="wide">Description (public)<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />Show on the site</label>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setEditing(false)}>Close</button>
            <button className="btn primary" onClick={save}>Save</button>
          </div>
        </div>
      )}

      {ev && !editing && (
        <div className="sec">
          <h4><span className="ev-badge">EVENT</span> {ev.title}</h4>
          <p>{eventDate(ev.starts_at)}{ev.venue ? ` · ${ev.venue}` : ''} · {ev.mode === 'lottery' ? `Lottery, ${ev.capacity} winners` : 'Entry order by draw'} · Status: <b>{ev.status}</b> · {rows.length} tickets</p>
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button className="btn" onClick={() => { setForm({ id: ev.id, title: ev.title, starts_at: toLocal(ev.starts_at), venue: ev.venue, description: ev.description, mode: ev.mode, capacity: ev.capacity, published: ev.published }); setEditing(true); }}>Edit</button>
            {ev.status === 'open' && <button className="btn" onClick={() => setStatus('closed')}>Close tickets</button>}
            {ev.status === 'closed' && <button className="btn" onClick={() => setStatus('open')}>Reopen tickets</button>}
            {ev.status !== 'drawn' && <button className="btn primary" disabled={!rows.length} onClick={draw}>{ev.mode === 'lottery' ? 'Draw winners' : 'Draw the order'}</button>}
            {ev.status === 'drawn' && <button className="btn" onClick={reset}>Clear results</button>}
            <button className="btn danger" onClick={remove}>Delete event</button>
          </div>
          <div className="ev-adm-prev">
            <Ticket ev={ev} t={{ ticket_no: rows[0]?.ticket_no || 1, name: 'Sample', result: ev.status === 'drawn' && ev.mode === 'lottery' ? 'win' : null, position: ev.status === 'drawn' && ev.mode === 'order' ? 1 : null }} />
          </div>
          {rows.length > 0 ? (
            <div className="tablewrap">
              <table>
                <thead><tr><th>Ticket</th><th>Name</th><th>Email</th><th>{ev.mode === 'order' ? 'Number' : 'Result'}</th><th>Date</th><th>Ticket link</th></tr></thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id}>
                      <td>#{String(r.ticket_no || 0).padStart(4, '0')}</td>
                      <td>{r.name || '—'}</td>
                      <td><a href={`mailto:${r.email}`}>{r.email}</a></td>
                      <td>{ev.mode === 'order' ? (r.position ? String(r.position).padStart(3, '0') : '—') : r.result === 'win' ? <b style={{ color: 'var(--red)' }}>WIN</b> : r.result === 'lose' ? 'lose' : '—'}</td>
                      <td>{fmt(r.created_at)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn" style={{ padding: '4px 8px', fontSize: 13 }} onClick={async () => { await navigator.clipboard.writeText(link(r.token)); setSt('Link copied'); }}>Copy</button>{' '}
                        <a className="btn" style={{ padding: '4px 8px', fontSize: 13 }} href={`mailto:${r.email}?subject=${encodeURIComponent(`Your ticket — ${ev.title}`)}&body=${encodeURIComponent(`Your ticket for ${ev.title} (#${r.ticket_no}).\n\nSee your ticket and result here:\n${link(r.token)}\n\nGallery Crypto`)}`}>Email</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No tickets yet.</p>
          )}
        </div>
      )}
    </>
  );
}

function SettingsForm() {
  const db = supabase()!;
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [st, setSt] = useState('');
  useEffect(() => {
    db.from('settings').select('*').eq('id', 1).single().then(({ data }) => data && setS({ ...DEFAULT_SETTINGS, ...data }));
  }, [db]);
  const set = (k: 'headline' | 'lead' | 'launch' | 'instagram' | 'email', v: string) => setS((p) => ({ ...p, [k]: v }));
  return (
    <div className="sec">
      <h4>Site text</h4>
      <div className="form">
        <label className="wide">Headline<input value={s.headline} onChange={(e) => set('headline', e.target.value)} /></label>
        <label className="wide">Intro<textarea value={s.lead} onChange={(e) => set('lead', e.target.value)} /></label>
        <label className="wide">Launch line<input value={s.launch} onChange={(e) => set('launch', e.target.value)} /></label>
        <label>Instagram URL<input value={s.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="https://instagram.com/..." /></label>
        <label>Public contact email<input value={s.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label>Shipping (USD per order)<input inputMode="numeric" value={s.shipping_usd} onChange={(e) => setS((p) => ({ ...p, shipping_usd: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 }))} /></label>
        <label className="check wide"><input type="checkbox" checked={s.sale_open} onChange={(e) => setS((p) => ({ ...p, sale_open: e.target.checked }))} />Open general sale (every piece with a price gets a public "Buy now")</label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" onClick={async () => {
          const { headline, lead, launch, instagram, email, sale_open, shipping_usd } = s;
          if (sale_open && !confirm('Open general sale? Anyone will be able to buy priced pieces right away.')) return;
          const { error } = await db.from('settings').update({ headline, lead, launch, instagram, email, sale_open, shipping_usd, updated_at: new Date().toISOString() }).eq('id', 1);
          setSt(error ? 'Error: ' + error.message : 'Saved — it shows on the site right away');
        }}>Save</button>
        {st && <span className="status">{st}</span>}
      </div>
    </div>
  );
}

export default function Admin() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('items');
  const [needPw, setNeedPw] = useState(false);
  const { aal, refresh: refreshAal } = useAal();

  useEffect(() => {
    const db = supabase();
    if (!db) return setSession(null);
    db.auth.getSession().then(({ data }) => setSession(data.session));
    if (/type=(invite|recovery|magiclink)/.test(location.hash)) setNeedPw(true);
    const { data } = db.auth.onAuthStateChange((e, s) => {
      setSession(s);
      if (e === 'PASSWORD_RECOVERY') setNeedPw(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // 受付中のイベント数（タブのバッジ用）
  const [openEvents, setOpenEvents] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    supabase()!.from('events').select('id', { count: 'exact', head: true }).neq('status', 'drawn').then(({ count }) => setOpenEvents(count || 0));
  }, [isAdmin, tab]);

  useEffect(() => {
    if (!session) return setIsAdmin(null);
    supabase()!.rpc('is_admin').then(({ data }) => setIsAdmin(Boolean(data)));
  }, [session]);

  // 1999〜2000年ごろのパソコン風の見た目と操作音
  const [clock, setClock] = useState('');
  const [sound, setSound] = useState(true);
  useEffect(() => {
    setSound(sfxEnabled());
    const off = onSfxChange(setSound);
    const tick = () => {
      const d = new Date(Date.now() + 9 * 3600_000);
      setClock(`${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 15_000);
    // ボタン・リンク・チェックを押したらクリック音
    const down = (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest('button, a, input[type=checkbox], input[type=file], label.check, select');
      if (el && !el.closest('.os9-snd')) sfx(el.closest('.adm-tabs') ? 'select' : 'tick');
    };
    document.addEventListener('pointerdown', down);
    return () => {
      off();
      clearInterval(t);
      document.removeEventListener('pointerdown', down);
    };
  }, []);
  useEffect(() => {
    if (tab) sfx('shade');
  }, [tab]);

  const head = (
    <header className="os9-menu">
      <a className="os9-gc" href="/" aria-label="Go to the public site">
        <svg viewBox="0 0 16 16" aria-hidden shapeRendering="crispEdges">
          <path d="M4 1h3v1h2V1h3v1h1v1h1v1h1v2h-1v1h-2v8H4V7H2V6H1V4h1V3h1V2h1Z" fill="#000" />
          <path d="M5 2h1v1h4V2h1v1h1v1h1v1h-1v1h-1V5h-1v8H5V5H4v1H3V5H2V4h1V3h2Z" fill="#fff" />
        </svg>
      </a>
      <b>Gallery Crypto</b>
      <span>Admin</span>
      <span className="os9-right">
        <button
          className="os9-snd"
          aria-label={sound ? 'Sound off' : 'Sound on'}
          aria-pressed={sound}
          onClick={() => {
            const v = !sound;
            setSfx(v);
            if (v) setTimeout(() => sfxBoot(), 120);
          }}
        >
          <svg viewBox="0 0 20 20" aria-hidden>
            <path d="M3 8h3l5-4v12l-5-4H3Z" fill="currentColor" />
            {sound ? <path d="M14 6q3 4 0 8M16 4q5 6 0 12" fill="none" stroke="currentColor" strokeWidth="1.6" /> : <path d="M14 7l5 6M19 7l-5 6" stroke="currentColor" strokeWidth="1.6" />}
          </svg>
        </button>
        <span>{clock}</span>
        {session && (
          <button className="os9-out" onClick={() => (sfx('close'), supabase()!.auth.signOut())}>
            Sign out
          </button>
        )}
      </span>
    </header>
  );

  let body: React.ReactNode;
  if (!configured) body = <div className="sec"><h4>Not connected yet</h4><p>Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the Vercel environment variables (see README).</p></div>;
  else if (session === undefined) body = <p className="status">Loading…</p>;
  else if (!session) body = <Login />;
  else if (aal && aal.current === 'aal1' && aal.next === 'aal2') body = <MfaChallenge onDone={refreshAal} />;
  else if (isAdmin === null) body = <p className="status">Checking…</p>;
  else if (!isAdmin) body = <div className="sec"><h4>Not an admin</h4><p>{session.user.email} is not in the admins table.</p></div>;
  else
    body = (
      <>
        {needPw && <PasswordForm highlight />}
        <div className="adm-tabs">
          {([['items', 'Archive'], ['entries', 'Draw entries'], ['events', 'Events'], ['passport', 'Passport'], ['security', 'Security'], ['orders', 'Orders'], ['messages', 'Messages'], ['settings', 'Settings']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{k === 'events' && <span className="ev-badge">EVENT</span>}{l}{k === 'events' && openEvents > 0 && <sup className="ev-count">{openEvents}</sup>}</button>
          ))}
        </div>
        {tab === 'items' && <Items />}
        {tab === 'entries' && <Entries />}
        {tab === 'orders' && <Orders />}
        {tab === 'events' && <EventsAdmin />}
        {tab === 'passport' && <PassportAdmin />}
        {tab === 'security' && <SecurityCenter goto={setTab} />}
        {tab === 'messages' && <Messages />}
        {tab === 'settings' && <SettingsForm />}
        {tab === 'settings' && <TwoStepSettings />}
        {tab === 'settings' && !needPw && <PasswordForm />}
      </>
    );

  return (
    <div className="os9">
      {head}
      <div className="os9-desk">
        <div className="os9-win">
          <div className="os9-title">
            <span className="os9-box" aria-hidden />
            <span className="os9-ridge" aria-hidden />
            <span className="os9-tt">Gallery Crypto Admin</span>
            <span className="os9-ridge" aria-hidden />
            <span className="os9-box" aria-hidden />
          </div>
          <main className="adm">{body}</main>
        </div>
      </div>
    </div>
  );
}
