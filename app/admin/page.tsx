'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, photoUrl, configured } from '@/lib/supabase';
import { shrink } from '@/lib/image';
import { DEFAULT_SETTINGS, ERA_LABEL, certNo, eraOf, usd, type Item, type Settings } from '@/lib/types';

type Entry = { id: string; email: string; item_id: string | null; created_at: string; won: boolean; token: string | null; used_at: string | null };
type Order = { id: string; item_id: string | null; email: string; name: string; amount: number; currency: string; shipping: Record<string, string> | null; shipped_at: string | null; created_at: string };
type Msg = { id: string; name: string; email: string; body: string; created_at: string };
type Tab = 'items' | 'entries' | 'orders' | 'messages' | 'settings';

const BLANK: Omit<Item, 'id' | 'serial' | 'created_at'> = {
  photos: [], band: '', title: '', year: '', era: '', size: '', tag: '', stitch: false,
  made_in: 'USA', cond: '', prov: '', dealer: '', published: true, rank: '', price_usd: null, sold: false,
  listen: '', audio_path: '', audio_name: '', audio_credit: '',
};

const fmt = (s: string) => new Date(s).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });

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
  if (!type) throw new Error('mp3・m4a・wav・aac のファイルを選んでください');
  if (file.size > 20 * 1024 * 1024) throw new Error('20MB を超えています。短くするか圧縮してください');
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
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gc-admin-email');
      if (saved) setEmail(saved);
    } catch {}
  }, []);
  const send = async () => {
    setBusy(true);
    setSt('送信中…');
    const { error } = await supabase()!.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/admin` },
    });
    setBusy(false);
    if (error) {
      setSt(/rate|seconds/i.test(error.message) ? '短い間に何度も送ったため、少し待ってからもう一度お試しください。' : 'このメールアドレスではログインできません。管理者として登録されたメールか確認してください。');
      return;
    }
    try { localStorage.setItem('gc-admin-email', email.trim()); } catch {}
    setStep('code');
    setSt('メールを送りました。届いた6桁のコードを入力してください（メール内のリンクを押しても入れます）。');
  };
  const verify = async () => {
    setBusy(true);
    setSt('確認中…');
    const { error } = await supabase()!.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setSt('コードが違うか、期限が切れています。もう一度「コードを送る」からやり直してください。');
  };
  return (
    <form
      className="sec"
      style={{ maxWidth: 420 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 'email') send();
        else verify();
      }}
    >
      <h4>管理画面にログイン</h4>
      {step === 'email' ? (
        <>
          <p>管理者のメールアドレスに、ログイン用の6桁のコードを送ります。iPhone でもパソコンでも同じ手順です。</p>
          <input type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <button className="btn primary" type="submit" disabled={busy}>コードを送る</button>
        </>
      ) : (
        <>
          <p>{email} に届いたコードを入力してください。</p>
          <input
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="123456"
            style={{ fontSize: 22, letterSpacing: '.3em', textAlign: 'center' }}
            autoFocus
          />
          <button className="btn primary" type="submit" disabled={busy || code.length < 6}>ログイン</button>
          <button className="btn" type="button" onClick={() => { setStep('email'); setCode(''); setSt(''); }}>メールアドレスを変える・再送する</button>
        </>
      )}
      {st && <p>{st}</p>}
    </form>
  );
}

function ItemForm({ init, onDone }: { init: Partial<Item> | null; onDone: (msg?: string) => void }) {
  const [f, setF] = useState({ ...BLANK, ...(init || {}) });
  const [busy, setBusy] = useState('');
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const db = supabase()!;
  const save = async () => {
    setBusy('保存中…');
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
    onDone('保存しました');
  };
  const alertMsg = (m: string) => setBusy('エラー: ' + m);
  return (
    <div className="sec">
      <h4>{init?.id ? `${certNo(init as Item)} を編集` : '新しく追加'}</h4>
      <div className="photos">
        {f.photos.map((p) => (
          <figure key={p}>
            <img src={photoUrl(p)} alt="" />
            <button type="button" onClick={() => set('photos', f.photos.filter((x) => x !== p))} aria-label="写真を外す">×</button>
          </figure>
        ))}
        <label className="btn" style={{ cursor: 'pointer' }}>
          写真を追加
          <input type="file" accept="image/*" multiple hidden onChange={async (e) => {
            if (!e.target.files?.length) return;
            setBusy('アップロード中…');
            try { const p = await upload(e.target.files); set('photos', [...f.photos, ...p]); setBusy(''); }
            catch (err) { alertMsg((err as Error).message); }
          }} />
        </label>
      </div>
      <div className="form">
        <label>バンド名<input value={f.band} onChange={(e) => set('band', e.target.value)} /></label>
        <label>ツアー名・デザイン<input value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
        <label>年<input inputMode="numeric" value={f.year} onChange={(e) => set('year', e.target.value)} placeholder="1991" /></label>
        <label>年代
          <select value={f.era} onChange={(e) => set('era', e.target.value)}>
            <option value="">年から自動</option>
            {Object.entries(ERA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>サイズ
          <select value={f.size} onChange={(e) => set('size', e.target.value)}>
            <option value="">—</option>
            {['xs', 's', 'm', 'l', 'xl', 'xxl'].map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </select>
        </label>
        <label>タグ<input value={f.tag} onChange={(e) => set('tag', e.target.value)} placeholder="Brockum" /></label>
        <label>製造国<input value={f.made_in} onChange={(e) => set('made_in', e.target.value)} /></label>
        <label>状態<input value={f.cond} onChange={(e) => set('cond', e.target.value)} placeholder="Good — light fading" /></label>
        <label>仕入れ先ディーラー<input value={f.dealer} onChange={(e) => set('dealer', e.target.value)} placeholder="空欄なら Founder's collection" /></label>
        <label>価格（米ドル・公開）<input inputMode="numeric" value={f.price_usd ?? ''} onChange={(e) => set('price_usd', e.target.value.replace(/[^0-9]/g, '') || null)} placeholder="例 450" /></label>
        <label>ランク（非公開）<input value={f.rank || ''} onChange={(e) => set('rank', e.target.value)} placeholder="A / B / C" /></label>
        <label className="wide">試聴リンク（Spotify・Apple Music・YouTube の URL）<input type="url" value={f.listen} onChange={(e) => set('listen', e.target.value)} placeholder="https://open.spotify.com/track/..." /></label>
        <div className="sec wide" style={{ gridColumn: '1/-1' }}>
          <h4>音源ファイル（権利をお持ちの音源のみ）</h4>
          <p>市販の CD や配信の曲をサイトで流すには、作詞・作曲の権利（JASRAC など）と原盤の権利（レーベル）の両方の許諾が必要です。許諾のない曲は上の試聴リンクを使ってください。ご自身で制作した音源や、利用許諾を得た BGM はここにアップロードできます（mp3・m4a・wav、20MB まで）。</p>
          <div className="row" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
            {f.audio_path ? (
              <>
                <span>♪ {f.audio_name || '音源'}</span>
                <button type="button" className="btn" onClick={() => { set('audio_path', ''); set('audio_name', ''); }}>外す</button>
              </>
            ) : (
              <span className="note">音源はまだありません</span>
            )}
            <label className="btn" style={{ cursor: 'pointer' }}>
              音源を選ぶ
              <input type="file" accept="audio/*,.mp3,.m4a,.wav,.aac" hidden onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy('音源をアップロード中…');
                try { const a = await uploadAudio(file); set('audio_path', a.path); set('audio_name', a.name); setBusy('音源を追加しました（保存してください）'); }
                catch (err) { alertMsg((err as Error).message); }
              }} />
            </label>
          </div>
          <label>曲名（公開）<input value={f.audio_name} onChange={(e) => set('audio_name', e.target.value)} /></label>
          <label>クレジット（公開・例：Music by ○○ / Licensed）<input value={f.audio_credit} onChange={(e) => set('audio_credit', e.target.value)} /></label>
        </div>
        <label className="wide">来歴（英語・公開）<textarea value={f.prov} onChange={(e) => set('prov', e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={f.stitch} onChange={(e) => set('stitch', e.target.checked)} />シングルステッチ</label>
        <label className="check"><input type="checkbox" checked={f.sold} onChange={(e) => set('sold', e.target.checked)} />売約済み</label>
        <label className="check"><input type="checkbox" checked={f.published} onChange={(e) => set('published', e.target.checked)} />サイトに公開</label>
      </div>
      <p className="note">ランクは管理画面だけに表示され、公開サイトからは読めません。仕入れ値などはここにも入れないでください。</p>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" disabled={!!busy && busy !== '' && !busy.startsWith('エラー')} onClick={save}>保存</button>
        <button className="btn" onClick={() => onDone()}>閉じる</button>
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
    if (error) setSt('読み込めません: ' + error.message);
    else setItems((data as Item[]) || []);
  }, [db]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="sec">
        <h4>写真からまとめて追加</h4>
        <p>1枚の写真につき1着として下書き登録します（非公開）。あとで1着ずつ情報を入れて公開してください。iPhone ならカメラで直接撮影もできます。</p>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <label className="btn primary" style={{ cursor: 'pointer' }}>
            写真を選ぶ
            <input type="file" accept="image/*" multiple hidden onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (!files.length) return;
              try {
                for (let i = 0; i < files.length; i++) {
                  setSt(`アップロード中 ${i + 1} / ${files.length}`);
                  const [p] = await upload([files[i]]);
                  const { error } = await db.from('items').insert({ ...BLANK, photos: [p], published: false });
                  if (error) throw error;
                }
                setSt(`${files.length} 着を下書きで追加しました`);
                load();
              } catch (err) { setSt('エラー: ' + (err as Error).message); }
            }} />
          </label>
          <label className="btn" style={{ cursor: 'pointer' }}>
            カメラで撮る
            <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setSt('アップロード中…');
              try { const [p] = await upload([f]); setEdit({ ...BLANK, photos: [p] }); setSt(''); }
              catch (err) { setSt('エラー: ' + (err as Error).message); }
            }} />
          </label>
          <button className="btn" onClick={() => setEdit(null)}>写真なしで追加</button>
          <button className="btn" onClick={() => csvDownload('items.csv', [
            ['No.', 'band', 'title', 'year', 'era', 'size', 'tag', 'stitch', 'made_in', 'cond', 'dealer', 'rank', 'price_usd', 'sold', 'published', 'provenance'],
            ...items.map((it) => [certNo(it), it.band, it.title, it.year, it.era, it.size, it.tag, it.stitch ? 'yes' : '', it.made_in, it.cond, it.dealer, it.rank || '', it.price_usd, it.sold ? 'yes' : '', it.published ? 'yes' : 'no', it.prov]),
          ])}>CSV</button>
        </div>
        {st && <p className="status">{st}</p>}
      </div>

      {edit !== undefined && <ItemForm key={edit?.id || 'new' + (edit?.photos?.[0] || '')} init={edit} onDone={(m) => { setEdit(undefined); if (m) setSt(m); load(); }} />}

      <p className="note">全 {items.length} 着 · 公開 {items.filter((i) => i.published).length} · 下書き {items.filter((i) => !i.published).length}</p>
      <div className="adm-grid">
        {items.map((it) => (
          <div key={it.id} style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
            <button className="card" onClick={() => setEdit(it)} style={{ opacity: it.published ? 1 : 0.5 }}>
              <div className="ph">{it.photos[0] ? <img src={photoUrl(it.photos[0])} alt="" loading="lazy" /> : <span className="noimg">No image</span>}</div>
              <div className="cap">
                <span className="nm">{it.band || '（未入力）'}</span>
                <span className="sub">{certNo(it)}{it.published ? '' : ' · 下書き'}{it.rank ? ` · ${it.rank}` : ''}{it.sold ? ' · SOLD' : it.price_usd ? ` · ${usd(it.price_usd)}` : ''}</span>
              </div>
            </button>
            <button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={async () => {
              if (!confirm(`${certNo(it)} ${it.band} を削除しますか？`)) return;
              await db.from('items').delete().eq('id', it.id);
              if (it.photos.length) await db.storage.from('photos').remove(it.photos);
              if (it.audio_path) await db.storage.from('audio').remove([it.audio_path]);
              load();
            }}>削除</button>
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
  const label = (id: string | null) => (id ? names[id] || '（削除済み）' : '全体エントリー');
  const link = (t: string | null) => (t ? `${location.origin}/buy/${t}` : '');
  const uniq = new Set(rows.map((r) => r.email)).size;
  const shown = onlyWon ? rows.filter((r) => r.won) : rows;
  const setWon = async (r: Entry, won: boolean) => {
    const { error } = await db.from('entries').update(won ? { won: true, token: r.token || crypto.randomUUID() } : { won: false, token: null }).eq('id', r.id);
    setSt(error ? 'エラー: ' + error.message : won ? '当選にしました。購入リンクをコピーして当選者にメールしてください。' : '当選を取り消しました（リンクは無効になります）');
    load();
  };
  return (
    <div className="sec">
      <h4>抽選エントリー（{rows.length} 件 · {uniq} 人 · 当選 {rows.filter((r) => r.won).length}）</h4>
      <p>当選にすると、その人だけが使える購入リンク（1回限り）ができます。一般販売を始める前でも、このリンクからは購入できます。</p>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <label className="check" style={{ fontSize: 12 }}><input type="checkbox" checked={onlyWon} onChange={(e) => setOnlyWon(e.target.checked)} />当選者だけ表示</label>
        <button className="btn" onClick={() => csvDownload('entries.csv', [['email', 'item', 'entered', 'won', 'purchase_link', 'purchased'], ...rows.map((r) => [r.email, label(r.item_id), r.created_at, r.won ? 'yes' : '', link(r.token), r.used_at || ''])])}>CSV</button>
        {st && <span className="status">{st}</span>}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>メール</th><th>対象</th><th>日時</th><th>当選・購入リンク</th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.id}>
              <td>{r.email}</td><td>{label(r.item_id)}</td><td>{fmt(r.created_at)}</td>
              <td>
                {r.used_at ? '購入済み' : r.won ? (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={async () => { await navigator.clipboard.writeText(link(r.token)); setSt('リンクをコピーしました'); }}>リンクをコピー</button>
                    <a className="btn" style={{ padding: '4px 8px', fontSize: 11 }} href={`mailto:${r.email}?subject=${encodeURIComponent('Gallery Crypto — You won the draw')}&body=${encodeURIComponent(`Congratulations — you won the Gallery Crypto presale draw.\n\nYou can buy your piece here (this link is for you only and works once):\n${link(r.token)}\n\nGallery Crypto`)}`}>メール作成</a>
                    <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setWon(r, false)}>取消</button>
                  </span>
                ) : (
                  <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setWon(r, true)}>当選にする</button>
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
      <h4>注文（{rows.length} 件 · 合計 {usd(total) || '$0'}）</h4>
      <p>支払いが完了すると自動でここに入り、商品は「売約済み」になります。返金は Stripe の管理画面から行います。</p>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" onClick={() => csvDownload('orders.csv', [['date', 'item', 'name', 'email', 'amount', 'currency', 'address', 'shipped'], ...rows.map((r) => [r.created_at, r.item_id ? names[r.item_id] || '' : '', r.name, r.email, r.amount / 100, r.currency, addr(r.shipping), r.shipped_at || ''])])}>CSV</button>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>日時</th><th>商品</th><th>購入者・配送先</th><th>金額</th><th>発送</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td>{fmt(r.created_at)}</td>
              <td>{r.item_id ? names[r.item_id] || '（削除済み）' : ''}</td>
              <td>{r.name}<br /><a href={`mailto:${r.email}`}>{r.email}</a><br />{addr(r.shipping)}</td>
              <td>{usd(r.amount / 100)}</td>
              <td>{r.shipped_at ? fmt(r.shipped_at) : (
                <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={async () => { await db.from('orders').update({ shipped_at: new Date().toISOString() }).eq('id', r.id); load(); }}>発送済みにする</button>
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
      <h4>問い合わせ（{rows.length} 件）</h4>
      {!rows.length && <p>まだありません。</p>}
      {rows.map((m) => (
        <div key={m.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'grid', gap: 6 }}>
          <p style={{ color: 'var(--fg)' }}><b>{m.name}</b> · <a href={`mailto:${m.email}`}>{m.email}</a> · {fmt(m.created_at)}</p>
          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--fg)' }}>{m.body}</p>
          <div><button className="btn danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={async () => {
            if (!confirm('この問い合わせを削除しますか？')) return;
            await db.from('messages').delete().eq('id', m.id); load();
          }}>削除</button></div>
        </div>
      ))}
    </div>
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
      <h4>サイトの文言（英語）</h4>
      <div className="form">
        <label className="wide">見出し<input value={s.headline} onChange={(e) => set('headline', e.target.value)} /></label>
        <label className="wide">紹介文<textarea value={s.lead} onChange={(e) => set('lead', e.target.value)} /></label>
        <label className="wide">発売の一行<input value={s.launch} onChange={(e) => set('launch', e.target.value)} /></label>
        <label>Instagram の URL<input value={s.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="https://instagram.com/..." /></label>
        <label>公開する連絡先メール<input value={s.email} onChange={(e) => set('email', e.target.value)} /></label>
        <label>送料（米ドル・1注文）<input inputMode="numeric" value={s.shipping_usd} onChange={(e) => setS((p) => ({ ...p, shipping_usd: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 }))} /></label>
        <label className="check wide"><input type="checkbox" checked={s.sale_open} onChange={(e) => setS((p) => ({ ...p, sale_open: e.target.checked }))} />一般販売を開始する（オンにすると、価格を入れた商品に誰でも買える「Buy now」が出ます）</label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="btn primary" onClick={async () => {
          const { headline, lead, launch, instagram, email, sale_open, shipping_usd } = s;
          if (sale_open && !confirm('一般販売を開始しますか？価格が入っている商品はすぐに誰でも購入できるようになります。')) return;
          const { error } = await db.from('settings').update({ headline, lead, launch, instagram, email, sale_open, shipping_usd, updated_at: new Date().toISOString() }).eq('id', 1);
          setSt(error ? 'エラー: ' + error.message : '保存しました（サイトへの反映は最大1分）');
        }}>保存</button>
        {st && <span className="status">{st}</span>}
      </div>
    </div>
  );
}

export default function Admin() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('items');

  useEffect(() => {
    const db = supabase();
    if (!db) return setSession(null);
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return setIsAdmin(null);
    supabase()!.rpc('is_admin').then(({ data }) => setIsAdmin(Boolean(data)));
  }, [session]);

  const head = (
    <header className="hd">
      <a className="wm" href="/">Gallery Crypto</a>
      <nav className="nav">
        <span>管理画面</span>
        {session && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => supabase()!.auth.signOut()}>ログアウト</button>}
      </nav>
    </header>
  );

  let body: React.ReactNode;
  if (!configured) body = <div className="sec"><h4>まだ接続されていません</h4><p>Vercel の環境変数に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください（README 参照）。</p></div>;
  else if (session === undefined) body = <p className="status">読み込み中…</p>;
  else if (!session) body = <Login />;
  else if (isAdmin === null) body = <p className="status">確認中…</p>;
  else if (!isAdmin) body = <div className="sec"><h4>管理者ではありません</h4><p>{session.user.email} は admins テーブルに登録されていません。</p></div>;
  else
    body = (
      <>
        <div className="adm-tabs">
          {([['items', 'アーカイブ'], ['entries', '抽選エントリー'], ['orders', '注文'], ['messages', '問い合わせ'], ['settings', 'サイト設定']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {tab === 'items' && <Items />}
        {tab === 'entries' && <Entries />}
        {tab === 'orders' && <Orders />}
        {tab === 'messages' && <Messages />}
        {tab === 'settings' && <SettingsForm />}
      </>
    );

  return (
    <div className="site">
      {head}
      <main className="adm">{body}</main>
    </div>
  );
}
