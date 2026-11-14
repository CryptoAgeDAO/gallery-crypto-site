'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, photoUrl, configured } from '@/lib/supabase';
import { shrink } from '@/lib/image';
import { onSfxChange, setSfx, sfx, sfxBoot, sfxEnabled } from '@/lib/sfx';
import Ticket from '@/components/Ticket';
import PassportAdmin from '@/components/PassportAdmin';
import ModelAdmin from '@/components/ModelAdmin';
import GhostMannequin from '@/components/GhostMannequin';
import dynamic from 'next/dynamic';
const PhotoTo3D = dynamic(() => import('@/components/PhotoTo3D'), { ssr: false });
const AIImport = dynamic(() => import('@/components/AIImport'), { ssr: false });
const PhotoStudio = dynamic(() => import('@/components/PhotoStudio'), { ssr: false });
const GraphicStudio = dynamic(() => import('@/components/GraphicStudio'), { ssr: false });
const PatternLab = dynamic(() => import('@/components/PatternLab'), { ssr: false });
import SecurityCenter from '@/components/SecurityCenter';
import { MfaChallenge, TwoStepSettings, useAal } from '@/components/TwoStep';
import { EVENTS_SQL } from '@/lib/eventsSql';
import { eventDate, type EventEntry, type GcEvent } from '@/lib/types';
import { DEFAULT_SETTINGS, ERA_LABEL, certNo, eraOf, usd, type Item, type Settings } from '@/lib/types';
import { LangToggle, tt, useLang } from '@/components/Lang';

type Entry = { id: string; email: string; item_id: string | null; created_at: string; won: boolean; token: string | null; used_at: string | null };
type Order = { id: string; item_id: string | null; email: string; name: string; amount: number; currency: string; shipping: Record<string, string> | null; shipped_at: string | null; created_at: string };
type Msg = { id: string; name: string; email: string; body: string; created_at: string };
type Tab = 'items' | 'pattern' | 'graphic' | 'photostudio' | 'aiimport' | 'ghost' | 'photo3d' | 'entries' | 'events' | 'passport' | 'security' | 'orders' | 'messages' | 'settings';

const BLANK: Omit<Item, 'id' | 'serial' | 'created_at'> = {
  photos: [], band: '', title: '', year: '', era: '', size: '', tag: '', stitch: false,
  made_in: 'USA', cond: '', prov: '', dealer: '', published: true, rank: '', price_usd: null, sold: false,
  listen: '', audio_path: '', audio_name: '', audio_credit: '',
};

const fmt = (s: string) => new Date(s).toLocaleString(tt('en-US', 'ja-JP'), { dateStyle: 'short', timeStyle: 'short' });

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
  if (!type) throw new Error(tt('Choose an mp3, m4a, wav or aac file.', 'mp3・m4a・wav・aac のファイルを選んでください。'));
  if (file.size > 20 * 1024 * 1024) throw new Error(tt('The file is over 20 MB. Shorten or compress it.', 'ファイルが20MBを超えています。短くするか圧縮してください。'));
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
    setSt(tt('Sending…', '送信中…'));
    const { error } = await supabase()!.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/admin` },
    });
    setBusy(false);
    if (error) return setSt(/rate|seconds/i.test(error.message) ? tt('Too many requests. Wait a minute and try again.', 'リクエストが多すぎます。1分ほど待ってから、もう一度お試しください。') : tt('This email cannot sign in. Check that it is registered as an admin.', 'このメールアドレスではログインできません。管理者として登録されているか確認してください。'));
    remember();
    setSt(tt('Email sent. On iPhone, long-press the link and choose "Open in Safari".', 'メールを送りました。iPhone では、リンクを長押しして「Safariで開く」を選んでください。'));
  };
  const signIn = async () => {
    setBusy(true);
    setSt(tt('Signing in…', 'ログイン中…'));
    const { error } = await supabase()!.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) return setSt(tt('Wrong email or password. If you have not set a password yet, sign in with the email link and set one under Settings.', 'メールアドレスかパスワードが違います。まだパスワードを設定していなければ、メールのリンクでログインし、「設定」でパスワードを設定してください。'));
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
      <h4>{tt('Admin sign-in', '管理者ログイン')}</h4>
      <div className="adm-tabs">
        <button type="button" aria-pressed={mode === 'password'} onClick={() => { setMode('password'); setSt(''); }}>{tt('Password', 'パスワード')}</button>
        <button type="button" aria-pressed={mode === 'link'} onClick={() => { setMode('link'); setSt(''); }}>{tt('Email link', 'メールのリンク')}</button>
      </div>
      <input type="email" required autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tt('Email', 'メール')} />
      {mode === 'password' ? (
        <>
          <input type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={tt('Password', 'パスワード')} />
          <button className="btn primary" type="submit" disabled={busy}>{tt('Sign in', 'ログイン')}</button>
          <p>{tt('First time, or forgot your password? Use the email link, then set a password under Settings.', '初めての方、またはパスワードを忘れた方は、メールのリンクでログインしてから「設定」でパスワードを設定してください。')}</p>
        </>
      ) : (
        <>
          <button className="btn primary" type="submit" disabled={busy}>{tt('Send sign-in link', 'ログイン用のリンクを送る')}</button>
          <p>{tt('Open the link in the email to sign in.', 'メールのリンクを開くとログインできます。')}</p>
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
        if (pw.length < 8) return setSt(tt('Use at least 8 characters.', '8文字以上にしてください。'));
        if (pw !== pw2) return setSt(tt('The two entries do not match.', '2つの入力が一致しません。'));
        setSt(tt('Saving…', '保存中…'));
        const { error } = await supabase()!.auth.updateUser({ password: pw });
        if (error) return setSt(tt('Could not save: ', '保存できませんでした：') + error.message);
        setPw(''); setPw2('');
        setSt(tt('Password set. You can now sign in with your email and password on any device.', 'パスワードを設定しました。どの端末でも、メールアドレスとパスワードでログインできます。'));
      }}
    >
      <h4>{highlight ? tt('Set your sign-in password', 'ログイン用のパスワードを設定') : tt('Sign-in password', 'ログイン用のパスワード')}</h4>
      <p>{tt('Once set, sign in on iPhone or computer with your email and this password. Saving it on your iPhone is handy.', '設定すると、iPhone でもパソコンでも、メールアドレスとこのパスワードでログインできます。iPhone に保存しておくと便利です。')}</p>
      <div className="form">
        <label>{tt('New password (8+ characters)', '新しいパスワード（8文字以上）')}<input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <label>{tt('Again', 'もう一度')}<input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" type="submit">{tt('Save password', 'パスワードを保存')}</button>
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
    setBusy(tt('Saving…', '保存中…'));
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
    onDone(tt('Saved', '保存しました'));
  };
  const alertMsg = (m: string) => setBusy(tt('Error: ', 'エラー：') + m);
  return (
    <div className="sec">
      <h4>{init?.id ? `Edit ${certNo(init as Item)}` : tt('Add a piece', '作品を追加')}</h4>
      <div className="photos">
        {f.photos.map((p) => (
          <figure key={p}>
            <img src={photoUrl(p)} alt="" />
            <button type="button" onClick={() => set('photos', f.photos.filter((x) => x !== p))} aria-label={tt('Remove photo', '写真を外す')}>×</button>
          </figure>
        ))}
        <label className="btn" style={{ cursor: 'pointer' }}>
          {tt('Add photos', '写真を追加')}
          <input type="file" accept="image/*" multiple hidden onChange={async (e) => {
            if (!e.target.files?.length) return;
            setBusy(tt('Uploading…', 'アップロード中…'));
            try { const p = await upload(e.target.files); set('photos', [...f.photos, ...p]); setBusy(''); }
            catch (err) { alertMsg((err as Error).message); }
          }} />
        </label>
      </div>
      <div className="form">
        <label>{tt('Band', 'バンド')}<input value={f.band} onChange={(e) => set('band', e.target.value)} /></label>
        <label>{tt('Tour / design', 'ツアー・デザイン')}<input value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label>{tt('Year', '年')}<input inputMode="numeric" value={f.year} onChange={(e) => set('year', e.target.value)} placeholder="1991" /></label>
        <label>{tt('Decade', '年代')}
          <select value={f.era} onChange={(e) => set('era', e.target.value)}>
            <option value="">{tt('Auto from year', '年から自動')}</option>
            {Object.entries(ERA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>{tt('Size', 'サイズ')}
          <select value={f.size} onChange={(e) => set('size', e.target.value)}>
            <option value="">—</option>
            {['xs', 's', 'm', 'l', 'xl', 'xxl'].map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </select>
        </label>
        <label>{tt('Tag', 'タグ')}<input value={f.tag} onChange={(e) => set('tag', e.target.value)} placeholder="Brockum" /></label>
        <label>{tt('Made in', '製造国')}<input value={f.made_in} onChange={(e) => set('made_in', e.target.value)} /></label>
        <label>{tt('Condition', '状態')}<input value={f.cond} onChange={(e) => set('cond', e.target.value)} placeholder={tt('Good — light fading', '良好 — 軽い色あせ')} /></label>
        <label>{tt('Dealer (source)', 'ディーラー（入手先）')}<input value={f.dealer} onChange={(e) => set('dealer', e.target.value)} placeholder={tt('Blank = Founder\'s collection', '空欄 = 創業者のコレクション')} /></label>
        <label>{tt('Price (USD, public)', '価格（米ドル・公開）')}<input inputMode="numeric" value={f.price_usd ?? ''} onChange={(e) => set('price_usd', e.target.value.replace(/[^0-9]/g, '') || null)} placeholder="e.g. 450" /></label>
        <label>{tt('Rank (private)', 'ランク（非公開）')}<input value={f.rank || ''} onChange={(e) => set('rank', e.target.value)} placeholder="A / B / C" /></label>
        <label className="wide">{tt('Listen link (Spotify, Apple Music or YouTube URL)', '試聴リンク（Spotify・Apple Music・YouTube の URL）')}<input type="url" value={f.listen} onChange={(e) => set('listen', e.target.value)} placeholder="https://open.spotify.com/track/..." /></label>
        <ModelAdmin itemId={init?.id} />
        <div className="sec wide" style={{ gridColumn: '1/-1' }}>
          <h4>{tt('Audio file (only audio you have the rights to)', '音声ファイル（権利のある音声のみ）')}</h4>
          <p>{tt('Playing commercial recordings on the site needs permission for both the song (publishing, e.g. JASRAC) and the recording (label). For anything unlicensed, use the listen link above. Upload only audio you made or have a licence for (mp3, m4a, wav, up to 20 MB).', '市販の音源をサイトで流すには、楽曲（著作権、例：JASRAC）と録音（レーベル）の両方の許諾が必要です。許諾のないものは上の試聴リンクを使ってください。アップロードするのは、自分で作った音声か、ライセンスのある音声だけにしてください（mp3・m4a・wav、20MBまで）。')}</p>
          <div className="row" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
            {f.audio_path ? (
              <>
                <span>♪ {f.audio_name || tt('Audio', '音声')}</span>
                <button type="button" className="btn" onClick={() => { set('audio_path', ''); set('audio_name', ''); }}>{tt('Remove', '外す')}</button>
              </>
            ) : (
              <span className="note">{tt('No audio yet', '音声はまだありません')}</span>
            )}
            <label className="btn" style={{ cursor: 'pointer' }}>
              {tt('Choose audio', '音声を選ぶ')}
              <input type="file" accept="audio/*,.mp3,.m4a,.wav,.aac" hidden onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(tt('Uploading audio…', '音声をアップロード中…'));
                try { const a = await uploadAudio(file); set('audio_path', a.path); set('audio_name', a.name); setBusy(tt('Audio added — remember to save', '音声を追加しました — 保存を忘れずに')); }
                catch (err) { alertMsg((err as Error).message); }
              }} />
            </label>
          </div>
          <label>{tt('Track name (public)', '曲名（公開）')}<input value={f.audio_name} onChange={(e) => set('audio_name', e.target.value)} /></label>
          <label>{tt('Credit (public, e.g. Music by … / Licensed)', 'クレジット（公開、例：Music by … / Licensed）')}<input value={f.audio_credit} onChange={(e) => set('audio_credit', e.target.value)} /></label>
        </div>
        <label className="wide">{tt('Provenance (public)', '来歴（公開）')}<textarea value={f.prov} onChange={(e) => set('prov', e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={f.stitch} onChange={(e) => set('stitch', e.target.checked)} />{tt('Single stitch', 'シングルステッチ')}</label>
        <label className="check"><input type="checkbox" checked={f.sold} onChange={(e) => set('sold', e.target.checked)} />{tt('Sold', '売約済み')}</label>
        <label className="check"><input type="checkbox" checked={f.published} onChange={(e) => set('published', e.target.checked)} />{tt('Published on the site', 'サイトに公開')}</label>
      </div>
      <p className="note">{tt('Rank is shown only here and cannot be read from the public site. Do not enter purchase costs anywhere.', 'ランクはここだけに表示され、公開サイトからは読めません。仕入れ値はどこにも入力しないでください。')}</p>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" disabled={!!busy && busy !== '' && !busy.startsWith('Error')} onClick={save}>{tt('Save', '保存')}</button>
        <button className="btn" onClick={() => onDone()}>{tt('Close', '閉じる')}</button>
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
    if (error) setSt(tt('Could not load: ', '読み込めませんでした：') + error.message);
    else setItems((data as Item[]) || []);
  }, [db]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="sec">
        <h4>{tt('Add from photos', '写真から追加')}</h4>
        <p>{tt('Each photo becomes one draft piece (not public). Fill in the details later and publish. On iPhone you can shoot straight from the camera.', '写真1枚が下書きの作品1点になります（非公開）。詳細はあとで入力して公開してください。iPhone ならカメラから直接撮影できます。')}</p>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <label className="btn primary" style={{ cursor: 'pointer' }}>
            {tt('Choose photos', '写真を選ぶ')}
            <input type="file" accept="image/*" multiple hidden onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (!files.length) return;
              try {
                for (let i = 0; i < files.length; i++) {
                  setSt(tt(`Uploading ${i + 1} / ${files.length}`, `アップロード中 ${i + 1} / ${files.length}`));
                  const [p] = await upload([files[i]]);
                  const { error } = await db.from('items').insert({ ...BLANK, photos: [p], published: false });
                  if (error) throw error;
                }
                setSt(tt(`Added ${files.length} drafts`, `下書きを${files.length}点追加しました`));
                load();
              } catch (err) { setSt(tt('Error: ', 'エラー：') + (err as Error).message); }
            }} />
          </label>
          <label className="btn" style={{ cursor: 'pointer' }}>
            {tt('Take a photo', '写真を撮る')}
            <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setSt(tt('Uploading…', 'アップロード中…'));
              try { const [p] = await upload([f]); setEdit({ ...BLANK, photos: [p] }); setSt(''); }
              catch (err) { setSt(tt('Error: ', 'エラー：') + (err as Error).message); }
            }} />
          </label>
          <button className="btn" onClick={() => setEdit(null)}>{tt('Add without photo', '写真なしで追加')}</button>
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
              <div className="ph">{it.photos[0] ? <img src={photoUrl(it.photos[0])} alt="" loading="lazy" /> : <span className="noimg">{tt('No image', '画像なし')}</span>}</div>
              <div className="cap">
                <span className="nm">{it.band || '(no band yet)'}</span>
                <span className="sub">{certNo(it)}{it.published ? '' : tt(' · draft', ' · 下書き')}{it.rank ? ` · ${it.rank}` : ''}{it.sold ? tt(' · SOLD', ' · 売約済み') : it.price_usd ? ` · ${usd(it.price_usd)}` : ''}</span>
              </div>
            </button>
            <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={async () => {
              if (!confirm(tt(`Delete ${certNo(it)} ${it.band}?`, `${certNo(it)} ${it.band} を削除しますか？`))) return;
              await db.from('items').delete().eq('id', it.id);
              if (it.photos.length) await db.storage.from('photos').remove(it.photos);
              if (it.audio_path) await db.storage.from('audio').remove([it.audio_path]);
              load();
            }}>{tt('Delete', '削除')}</button>
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
  const label = (id: string | null) => (id ? names[id] || '(deleted)' : tt('General entry', '全体への応募'));
  const link = (t: string | null) => (t ? `${location.origin}/buy/${t}` : '');
  const uniq = new Set(rows.map((r) => r.email)).size;
  const shown = onlyWon ? rows.filter((r) => r.won) : rows;
  const setWon = async (r: Entry, won: boolean) => {
    const { error } = await db.from('entries').update(won ? { won: true, token: r.token || crypto.randomUUID() } : { won: false, token: null }).eq('id', r.id);
    setSt(error ? tt('Error: ', 'エラー：') + error.message : won ? tt('Marked as winner. Copy the purchase link and email it to them.', '当選にしました。購入リンクをコピーして、メールで送ってください。') : tt('Win cancelled (the link no longer works).', '当選を取り消しました（リンクは使えなくなりました）。'));
    load();
  };
  return (
    <div className="sec">
      <h4>{tt(`Draw entries (${rows.length} · ${uniq} people · ${rows.filter((r) => r.won).length} winners)`, `抽選の応募（${rows.length}件 · ${uniq}人 · 当選 ${rows.filter((r) => r.won).length}人）`)}</h4>
      <p>{tt('Marking a winner creates a one-time purchase link only they can use. It works even before general sale opens.', '当選にすると、その人だけが使える1回限りの購入リンクができます。一般販売の開始前でも使えます。')}</p>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <label className="check" style={{ fontSize: 12 }}><input type="checkbox" checked={onlyWon} onChange={(e) => setOnlyWon(e.target.checked)} />{tt('Winners only', '当選者のみ')}</label>
        <button className="btn" onClick={() => csvDownload('entries.csv', [['email', 'item', 'entered', 'won', 'purchase_link', 'purchased'], ...rows.map((r) => [r.email, label(r.item_id), r.created_at, r.won ? 'yes' : '', link(r.token), r.used_at || ''])])}>CSV</button>
        {st && <span className="status">{st}</span>}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>{tt('Email', 'メール')}</th><th>{tt('Piece', '作品')}</th><th>{tt('Date', '日付')}</th><th>{tt('Winner / link', '当選・リンク')}</th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.id}>
              <td>{r.email}</td><td>{label(r.item_id)}</td><td>{fmt(r.created_at)}</td>
              <td>
                {r.used_at ? tt('Purchased', '購入済み') : r.won ? (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={async () => { await navigator.clipboard.writeText(link(r.token)); setSt(tt('Link copied', 'リンクをコピーしました')); }}>{tt('Copy link', 'リンクをコピー')}</button>
                    <a className="btn" style={{ padding: '4px 8px', fontSize: 11 }} href={`mailto:${r.email}?subject=${encodeURIComponent('Gallery Crypto — You won the draw')}&body=${encodeURIComponent(`Congratulations — you won the Gallery Crypto presale draw.\n\nYou can buy your piece here (this link is for you only and works once):\n${link(r.token)}\n\nGallery Crypto`)}`}>{tt('Write email', 'メールを書く')}</a>
                    <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setWon(r, false)}>{tt('Cancel', '取り消す')}</button>
                  </span>
                ) : (
                  <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setWon(r, true)}>{tt('Mark winner', '当選にする')}</button>
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
      <h4>{tt(`Orders (${rows.length} · total ${usd(total) || '$0'})`, `注文（${rows.length}件 · 合計 ${usd(total) || '$0'}）`)}</h4>
      <p>{tt('Paid orders appear here automatically and the piece is marked sold. Refunds are made in the Stripe dashboard.', '支払いが済んだ注文は自動でここに表示され、作品は売約済みになります。返金は Stripe の管理画面で行います。')}</p>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" onClick={() => csvDownload('orders.csv', [['date', 'item', 'name', 'email', 'amount', 'currency', 'address', 'shipped'], ...rows.map((r) => [r.created_at, r.item_id ? names[r.item_id] || '' : '', r.name, r.email, r.amount / 100, r.currency, addr(r.shipping), r.shipped_at || ''])])}>CSV</button>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>{tt('Date', '日付')}</th><th>{tt('Piece', '作品')}</th><th>{tt('Buyer / ship to', '購入者・お届け先')}</th><th>{tt('Amount', '金額')}</th><th>{tt('Shipping', '配送')}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td>{fmt(r.created_at)}</td>
              <td>{r.item_id ? names[r.item_id] || '(deleted)' : ''}</td>
              <td>{r.name}<br /><a href={`mailto:${r.email}`}>{r.email}</a><br />{addr(r.shipping)}</td>
              <td>{usd(r.amount / 100)}</td>
              <td>{r.shipped_at ? fmt(r.shipped_at) : (
                <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={async () => { await db.from('orders').update({ shipped_at: new Date().toISOString() }).eq('id', r.id); load(); }}>{tt('Mark shipped', '発送済みにする')}</button>
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
      {!rows.length && <p>{tt('None yet.', 'まだありません。')}</p>}
      {rows.map((m) => (
        <div key={m.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'grid', gap: 6 }}>
          <p style={{ color: 'var(--fg)' }}><b>{m.name}</b> · <a href={`mailto:${m.email}`}>{m.email}</a> · {fmt(m.created_at)}</p>
          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--fg)' }}>{m.body}</p>
          <div><button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={async () => {
            if (!confirm(tt('Delete this message?', 'このメッセージを削除しますか？'))) return;
            await db.from('messages').delete().eq('id', m.id); load();
          }}>{tt('Delete', '削除')}</button></div>
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
      return setSt(tt('Could not load: ', '読み込めませんでした：') + error.message);
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
    if (!form.title.trim()) return setSt(tt('Give the event a title.', 'イベントに名前を付けてください。'));
    const row = { title: form.title.trim(), starts_at: fromLocal(form.starts_at), venue: form.venue.trim(), description: form.description.trim(), mode: form.mode, capacity: Math.max(0, Number(form.capacity) || 0), published: form.published };
    const r = form.id ? await db.from('events').update(row).eq('id', form.id).select('id').single() : await db.from('events').insert(row).select('id').single();
    if (r.error) return setSt(tt('Error: ', 'エラー：') + r.error.message);
    setSt(tt('Saved', '保存しました'));
    setEditing(false);
    await load();
    setSel(r.data.id);
  };
  const setStatus = async (status: GcEvent['status']) => {
    if (!ev) return;
    const { error } = await db.from('events').update({ status }).eq('id', ev.id);
    setSt(error ? tt('Error: ', 'エラー：') + error.message : status === 'open' ? 'Tickets reopened' : status === 'closed' ? 'Tickets closed' : 'Results published');
    load();
  };
  const draw = async () => {
    if (!ev || !rows.length) return;
    const msg = ev.mode === 'lottery' ? tt(`Draw ${Math.min(ev.capacity, rows.length)} winners from ${rows.length} tickets? Ticket holders see the result right away.`, `チケット${rows.length}枚から当選者${Math.min(ev.capacity, rows.length)}人を抽選しますか？結果はすぐにチケットに表示されます。`) : tt(`Draw the entry order for ${rows.length} tickets? Ticket holders see their number right away.`, `チケット${rows.length}枚の入場順を抽選しますか？番号はすぐにチケットに表示されます。`);
    if (!confirm(msg)) return;
    setSt(tt('Drawing…', '抽選中…'));
    const order = shuffle(rows);
    for (let i = 0; i < order.length; i++) {
      const patch = ev.mode === 'lottery' ? { result: i < ev.capacity ? 'win' : 'lose', position: null } : { position: i + 1, result: null };
      const { error } = await db.from('event_entries').update(patch).eq('id', order[i].id);
      if (error) return setSt(tt('Error: ', 'エラー：') + error.message);
    }
    await db.from('events').update({ status: 'drawn' }).eq('id', ev.id);
    setSt(tt('Draw complete — results are live on every ticket link', '抽選が完了しました — 各チケットのリンクに結果が出ています'));
    await load();
    loadRows(ev.id);
  };
  const reset = async () => {
    if (!ev || !confirm(tt('Clear the results and go back to "closed"?', '結果を消して「受付終了」に戻しますか？'))) return;
    await db.from('event_entries').update({ result: null, position: null }).eq('event_id', ev.id);
    await db.from('events').update({ status: 'closed' }).eq('id', ev.id);
    setSt(tt('Results cleared', '結果を消しました'));
    await load();
    loadRows(ev.id);
  };
  const remove = async () => {
    if (!ev || !confirm(tt(`Delete "${ev.title}" and all ${rows.length} tickets?`, `「${ev.title}」と、チケット${rows.length}枚をすべて削除しますか？`))) return;
    await db.from('events').delete().eq('id', ev.id);
    setSel(null);
    load();
  };
  const link = (t: string) => `${location.origin}/ticket/${t}`;
  const sorted = ev?.mode === 'order' && ev.status === 'drawn' ? rows.slice().sort((a, b) => (a.position || 0) - (b.position || 0)) : rows;

  if (missing)
    return (
      <div className="sec">
        <h4>{tt('Set up events (one time)', 'イベントを準備する（1回だけ）')}</h4>
        <p>{tt('The events feature needs two new tables in the database. Tap the button below — it takes a few seconds.', 'イベント機能には、データベースに新しい表が2つ必要です。下のボタンを押してください（数秒で終わります）。')}</p>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button
            className="btn primary"
            onClick={async () => {
              setSt(tt('Setting up…', '準備中…'));
              const { data } = await db.auth.getSession();
              const r = await fetch('/api/admin/setup-events', { method: 'POST', headers: { authorization: `Bearer ${data.session?.access_token || ''}` } });
              const j = await r.json().catch(() => ({}));
              if (r.ok) {
                setSt(tt('Done — events are ready', '完了 — イベントを使えます'));
                setMissing(false);
                setTimeout(load, 800);
              } else setSt(j.error === 'no-db-url' ? 'Automatic setup is not available. Use the manual steps below.' : tt('Automatic setup failed: ', '自動セットアップに失敗しました：') + (j.error || r.status) + tt(' — use the manual steps below.', ' — 下の手順で手動で行ってください。'));
            }}
          >
            {tt('Set up events', 'イベントを準備する')}
          </button>
        </div>
        {st && <p className="status">{st}</p>}
        <p style={{ marginTop: 10 }}><b>{tt('If the button does not work:', 'ボタンが動かない場合：')}</b></p>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
          <li>
            <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(EVENTS_SQL); setSt(tt('Setup code copied', 'セットアップのコードをコピーしました')); } catch { setSt(tt('Could not copy — select the code below and copy it', 'コピーできませんでした — 下のコードを選んでコピーしてください')); } }}>{tt('Copy setup code', 'セットアップのコードをコピー')}</button>
          </li>
          <li>
            <a className="btn" href="https://supabase.com/dashboard/project/tgivhkjwibwekuvbcgcm/sql/new" target="_blank" rel="noopener noreferrer">{tt('Open Supabase SQL editor', 'Supabase の SQL エディタを開く')}</a> {tt('— sign in if asked.', '— 求められたらログインしてください。')}
          </li>
          <li>{tt('Paste into the editor and press Run. Then reload this page.', 'エディタに貼り付けて Run を押し、このページを再読み込みしてください。')}</li>
        </ol>
        <details style={{ marginTop: 8 }}>
          <summary>{tt('Show the setup code', 'セットアップのコードを表示')}</summary>
          <textarea readOnly value={EVENTS_SQL} style={{ width: '100%', minHeight: 200, fontSize: 11 }} onFocus={(e) => e.currentTarget.select()} />
        </details>
      </div>
    );

  return (
    <>
      <div className="sec">
        <h4><span className="ev-badge">EVENT</span> {tt('Events & ticket draws', 'イベントとチケットの抽選')}</h4>
        <p>{tt('Run a separate event or draw. Visitors get a numbered ticket like an admission ticket. Lottery: you draw winners and losers. Order: you draw the entry order. Each ticket has its own link where the result appears.', '別枠のイベントや抽選を行えます。来場者は入場券のような番号つきのチケットを受け取ります。抽選：当選と落選を決めます。入場順：入場の順番を抽選します。チケットごとに専用のリンクがあり、そこに結果が出ます。')}</p>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="btn primary" onClick={() => { setForm(EV_BLANK); setEditing(true); setSel(null); }}>{tt('New event', '新しいイベント')}</button>
        </div>
        {list.length > 0 && (
          <div className="ev-adm-list">
            {list.map((e) => (
              <button key={e.id} className={`ev-adm-item${sel === e.id ? ' on' : ''}`} onClick={() => { setSel(e.id); setEditing(false); }}>
                <span className="ev-badge sm">{e.mode === 'lottery' ? 'LOTTERY' : 'ORDER'}</span>
                <b>{e.title || tt('Untitled', '無題')}</b>
                <span>{eventDate(e.starts_at, tt('en', 'ja') as 'en' | 'ja')}</span>
                <span className={`ev-st ${e.status}`}>{e.status}{e.published ? '' : tt(' · hidden', ' · 非公開')}</span>
              </button>
            ))}
          </div>
        )}
        {st && <p className="status">{st}</p>}
      </div>

      {editing && (
        <div className="sec">
          <h4>{form.id ? tt('Edit event', 'イベントを編集') : tt('New event', '新しいイベント')}</h4>
          <div className="form">
            <label className="wide">{tt('Title', 'タイトル')}<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={tt('Pop-up at Harajuku', '原宿でのポップアップ')} /></label>
            <label>{tt('Date & time (JST)', '日時（日本時間）')}<input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></label>
            <label>{tt('Venue', '会場')}<input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Tokyo" /></label>
            <label>{tt('Type', '種類')}
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as GcEvent['mode'] })}>
                <option value="lottery">{tt('Lottery — win or lose', '抽選 — 当選か落選')}</option>
                <option value="order">{tt('Order — draw the entry order', '入場順 — 入場の順番を抽選')}</option>
              </select>
            </label>
            {form.mode === 'lottery' && <label>{tt('Winners', '当選者数')}<input inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} /></label>}
            <label className="wide">{tt('Description (public)', '説明（公開）')}<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />{tt('Show on the site', 'サイトに表示')}</label>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setEditing(false)}>{tt('Close', '閉じる')}</button>
            <button className="btn primary" onClick={save}>{tt('Save', '保存')}</button>
          </div>
        </div>
      )}

      {ev && !editing && (
        <div className="sec">
          <h4><span className="ev-badge">EVENT</span> {ev.title}</h4>
          <p>{eventDate(ev.starts_at, tt('en', 'ja') as 'en' | 'ja')}{ev.venue ? ` · ${ev.venue}` : ''} · {ev.mode === 'lottery' ? tt(`Lottery, ${ev.capacity} winners`, `抽選・当選${ev.capacity}人`) : tt('Entry order by draw', '入場順を抽選')} · {tt('Status:', '状態：')} <b>{ev.status === 'open' ? tt('open', '受付中') : ev.status === 'closed' ? tt('closed', '受付終了') : tt('drawn', '抽選済み')}</b> · {tt(`${rows.length} tickets`, `チケット${rows.length}枚`)}</p>
          <div className="row" style={{ justifyContent: 'flex-start' }}>
            <button className="btn" onClick={() => { setForm({ id: ev.id, title: ev.title, starts_at: toLocal(ev.starts_at), venue: ev.venue, description: ev.description, mode: ev.mode, capacity: ev.capacity, published: ev.published }); setEditing(true); }}>{tt('Edit', '編集')}</button>
            {ev.status === 'open' && <button className="btn" onClick={() => setStatus('closed')}>{tt('Close tickets', '受付を締め切る')}</button>}
            {ev.status === 'closed' && <button className="btn" onClick={() => setStatus('open')}>{tt('Reopen tickets', '受付を再開')}</button>}
            {ev.status !== 'drawn' && <button className="btn primary" disabled={!rows.length} onClick={draw}>{ev.mode === 'lottery' ? tt('Draw winners', '当選者を抽選') : tt('Draw the order', '入場順を抽選')}</button>}
            {ev.status === 'drawn' && <button className="btn" onClick={reset}>{tt('Clear results', '結果を消す')}</button>}
            <button className="btn danger" onClick={remove}>{tt('Delete event', 'イベントを削除')}</button>
          </div>
          <div className="ev-adm-prev">
            <Ticket ev={ev} t={{ ticket_no: rows[0]?.ticket_no || 1, name: 'Sample', result: ev.status === 'drawn' && ev.mode === 'lottery' ? 'win' : null, position: ev.status === 'drawn' && ev.mode === 'order' ? 1 : null }} />
          </div>
          {rows.length > 0 ? (
            <div className="tablewrap">
              <table>
                <thead><tr><th>{tt('Ticket', 'チケット')}</th><th>{tt('Name', '名前')}</th><th>{tt('Email', 'メール')}</th><th>{ev.mode === 'order' ? tt('Number', '番号') : tt('Result', '結果')}</th><th>{tt('Date', '日付')}</th><th>{tt('Ticket link', 'チケットのリンク')}</th></tr></thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id}>
                      <td>#{String(r.ticket_no || 0).padStart(4, '0')}</td>
                      <td>{r.name || '—'}</td>
                      <td><a href={`mailto:${r.email}`}>{r.email}</a></td>
                      <td>{ev.mode === 'order' ? (r.position ? String(r.position).padStart(3, '0') : '—') : r.result === 'win' ? <b style={{ color: 'var(--red)' }}>WIN</b> : r.result === 'lose' ? tt('lose', '落選') : '—'}</td>
                      <td>{fmt(r.created_at)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn" style={{ padding: '4px 8px', fontSize: 13 }} onClick={async () => { await navigator.clipboard.writeText(link(r.token)); setSt(tt('Link copied', 'リンクをコピーしました')); }}>{tt('Copy', 'コピー')}</button>{' '}
                        <a className="btn" style={{ padding: '4px 8px', fontSize: 13 }} href={`mailto:${r.email}?subject=${encodeURIComponent(`Your ticket — ${ev.title}`)}&body=${encodeURIComponent(`Your ticket for ${ev.title} (#${r.ticket_no}).\n\nSee your ticket and result here:\n${link(r.token)}\n\nGallery Crypto`)}`}>{tt('Email', 'メール')}</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{tt('No tickets yet.', 'まだチケットはありません。')}</p>
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
      <h4>{tt('Site text', 'サイトの文言')}</h4>
      <div className="form">
        <label className="wide">{tt('Headline', '見出し')}<input value={s.headline} onChange={(e) => set('headline', e.target.value)} /></label>
        <label className="wide">{tt('Intro', '紹介文')}<textarea value={s.lead} onChange={(e) => set('lead', e.target.value)} /></label>
        <label className="wide">{tt('Launch line', '発売の一行')}<input value={s.launch} onChange={(e) => set('launch', e.target.value)} /></label>
        <label>{tt('Instagram URL', 'Instagram の URL')}<input value={s.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="https://instagram.com/..." /></label>
        <label>{tt('Public contact email', '公開する連絡先メール')}<input value={s.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label>{tt('Shipping (USD per order)', '送料（1注文あたり米ドル）')}<input inputMode="numeric" value={s.shipping_usd} onChange={(e) => setS((p) => ({ ...p, shipping_usd: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 }))} /></label>
        <label className="check wide"><input type="checkbox" checked={s.sale_open} onChange={(e) => setS((p) => ({ ...p, sale_open: e.target.checked }))} />{tt('Open general sale (every piece with a price gets a public “Buy now” button)', '一般販売を始める（価格を付けた作品すべてに、公開の「購入する」ボタンが付きます）')}</label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" onClick={async () => {
          const { headline, lead, launch, instagram, email, sale_open, shipping_usd } = s;
          if (sale_open && !confirm(tt('Open general sale? Anyone will be able to buy priced pieces right away.', '一般販売を始めますか？価格を付けた作品を、誰でもすぐに購入できるようになります。'))) return;
          const { error } = await db.from('settings').update({ headline, lead, launch, instagram, email, sale_open, shipping_usd, updated_at: new Date().toISOString() }).eq('id', 1);
          setSt(error ? tt('Error: ', 'エラー：') + error.message : tt('Saved — it shows on the site right away', '保存しました — すぐにサイトに反映されます'));
        }}>{tt('Save', '保存')}</button>
        {st && <span className="status">{st}</span>}
      </div>
    </div>
  );
}

export default function Admin() {
  // 言語を切り替えたら管理画面全体を描き直す（各部品は tt() で今の言語を読む）
  useLang();
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
      <a className="os9-gc" href="/" aria-label={tt('Go to the public site', '公開サイトへ')}>
        <svg viewBox="0 0 16 16" aria-hidden shapeRendering="crispEdges">
          <path d="M4 1h3v1h2V1h3v1h1v1h1v1h1v2h-1v1h-2v8H4V7H2V6H1V4h1V3h1V2h1Z" fill="#000" />
          <path d="M5 2h1v1h4V2h1v1h1v1h1v1h-1v1h-1V5h-1v8H5V5H4v1H3V5H2V4h1V3h2Z" fill="#fff" />
        </svg>
      </a>
      <b>Gallery Crypto</b>
      <span>{tt('Admin', '管理')}</span>
      <span className="os9-right">
        <button
          className="os9-snd"
          aria-label={sound ? tt('Sound off', '音を消す') : tt('Sound on', '音を出す')}
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
        <LangToggle className="os9-lang" />
        <span>{clock}</span>
        {session && (
          <button className="os9-out" onClick={() => (sfx('close'), supabase()!.auth.signOut())}>
            {tt('Sign out', 'ログアウト')}
          </button>
        )}
      </span>
    </header>
  );

  let body: React.ReactNode;
  if (!configured) body = <div className="sec"><h4>{tt('Not connected yet', 'まだつながっていません')}</h4><p>{tt('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the Vercel environment variables (see README).', 'Vercel の環境変数に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください（README 参照）。')}</p></div>;
  else if (session === undefined) body = <p className="status">{tt('Loading…', '読み込み中…')}</p>;
  else if (!session) body = <Login />;
  else if (aal && aal.current === 'aal1' && aal.next === 'aal2') body = <MfaChallenge onDone={refreshAal} />;
  else if (isAdmin === null) body = <p className="status">{tt('Checking…', '確認中…')}</p>;
  else if (!isAdmin) body = <div className="sec"><h4>{tt('Not an admin', '管理者ではありません')}</h4><p>{session.user.email} is not in the admins table.</p></div>;
  else
    body = (
      <>
        {needPw && <PasswordForm highlight />}
        <div className="adm-tabs">
          {([['items', tt('Archive', 'アーカイブ')], ['pattern', tt('Pattern maker', 'パターン')], ['graphic', tt('Graphic studio', 'グラフィック')], ['photostudio', tt('Photo studio', 'フォトスタジオ')], ['aiimport', tt('AI import', 'AI取り込み')], ['ghost', tt('Ghost mannequin', 'ゴーストマネキン')], ['photo3d', tt('Photo to 3D', '写真から3D')], ['entries', tt('Draw entries', '抽選の応募')], ['events', tt('Events', 'イベント')], ['passport', tt('Passport', 'パスポート')], ['security', tt('Security', 'セキュリティ')], ['orders', tt('Orders', '注文')], ['messages', tt('Messages', 'メッセージ')], ['settings', tt('Settings', '設定')]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{k === 'events' && <span className="ev-badge">EVENT</span>}{l}{k === 'events' && openEvents > 0 && <sup className="ev-count">{openEvents}</sup>}</button>
          ))}
        </div>
        {tab === 'items' && <Items />}
        {tab === 'pattern' && <div className="sec"><h4>{tt('Pattern lab', 'パターンラボ')}</h4><PatternLab /></div>}
        {tab === 'graphic' && <div className="sec"><h4>{tt('Graphic studio', 'グラフィックスタジオ')}</h4><GraphicStudio /></div>}
        {tab === 'photostudio' && (
          <div className="sec">
            <h4>{tt('Photo studio', 'フォトスタジオ')}</h4>
            <PhotoStudio
              onSave={async (blob) => {
                const [p] = await upload([new File([blob], 'studio.jpg', { type: 'image/jpeg' })]);
                const { error } = await supabase()!.from('items').insert({ ...BLANK, photos: [p], published: false });
                if (error) throw error;
              }}
            />
          </div>
        )}
        {tab === 'aiimport' && <div className="sec"><h4>{tt('AI import', 'AI取り込み')}</h4><AIImport /><p className="note">{tt('To attach the 3D to a piece, open the piece in Archive and use “AI import” in its 3D section.', '作品に3Dを付けるときは、アーカイブで作品を開き、3Dの欄の「AI取り込み」を使ってください。')}</p></div>}
        {tab === 'photo3d' && <div className="sec"><h4>{tt('Photo to 3D', '写真から3D')}</h4><PhotoTo3D /><p className="note">{tt('To attach the 3D to a piece, open the piece in Archive and use “Make 3D from photos”.', '作品に3Dを付けるときは、アーカイブで作品を開き「写真から3Dをつくる」を使ってください。')}</p></div>}
        {tab === 'ghost' && (
          <GhostMannequin
            onSave={async (blob) => {
              const [p] = await upload([new File([blob], 'ghost.jpg', { type: 'image/jpeg' })]);
              const { error } = await supabase()!.from('items').insert({ ...BLANK, photos: [p], published: false });
              if (error) throw error;
            }}
          />
        )}
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
            <span className="os9-tt">{tt('Gallery Crypto Admin', 'Gallery Crypto 管理')}</span>
            <span className="os9-ridge" aria-hidden />
            <span className="os9-box" aria-hidden />
          </div>
          <main className="adm">{body}</main>
        </div>
      </div>
    </div>
  );
}
