'use client';
// Gallery Crypto デモ版トップ：❶ RWA ❷ 古着 ❸ アート・その他 ❹ イベント・抽選。
// 見本はすべて架空。抽選・編集はこの端末のブラウザだけに保存（サーバーには送らない）。
import { AddToCart, QuickAdd } from './cart/Cart';
import { lineOf } from './cart/lineOf';
import { cutout as hubCut } from './shop/pieceArt';
import { LINE } from '@/lib/catalog';
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { LangToggle, useLang } from './Lang';
import { ProjectPic } from './HubArt';
import { Countdown, DrawShow, Meters, useReveal } from './HubFX';
import dynamic from 'next/dynamic';
import { cutout } from './shop/pieceArt';
import { textTarget, type MorphTarget } from './concept/morphText';
const ParticleMorph = dynamic(() => import('./concept/ParticleMorph'), { ssr: false });
const STAGE: Record<string, number> = { rwa: 1, vintage: 2, art: 3, events: 4 };
import { onSfxChange, setSfx, sfx, sfxEnabled } from '@/lib/sfx';
import { PROJECTS, csv, decline, drawOrder, freshEvents, newSeed, renumber, rid, runDraw, sampleEntrants, sha256, slotOf, swap, type Entrant, type GcEv, type Loc, type Pillar, type Project } from '@/lib/hub';

const KEY = 'gc-hub-v2';
const FACT_JA: Record<string, string> = { 'Made in': '製造国', Condition: '状態', Tag: 'タグ', Record: '記録', Edition: 'エディション', Sale: '販売', Size: 'サイズ', Material: '素材', Grade: '区分', Format: '形式', Seats: '席数' };
const PILLARS: { k: Pillar | 'events'; n: string; en: [string, string]; ja: [string, string] }[] = [
  { k: 'rwa', n: '01', en: ['RWA', 'Vintage & collab pieces with an on-chain record'], ja: ['RWA', 'ブロックチェーンで来歴を証明するヴィンテージ＆コラボ'] },
  { k: 'vintage', n: '02', en: ['Vintage & used', 'Simple shop — every piece linked to its photos & facts'], ja: ['古着', 'シンプルな販売ページ。写真と情報をデジタルで紐付け'] },
  { k: 'art', n: '03', en: ['Art & projects', 'Beyond fashion — prints, sound, objects'], ja: ['アート・プロジェクト', 'ファッション以外の企画（版画・音・オブジェ）'] },
  { k: 'events', n: '04', en: ['Events & lottery', 'Pre-entry, draw, numbers, times and venues — all editable'], ja: ['イベント・抽選', '事前登録・抽選・番号・時間・場所を自動で割り振り、編集も'] },
];
const yen = (n: number | null) => (n ? '¥' + n.toLocaleString('ja-JP') : '');
const dl = (name: string, text: string, type: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); };
const proj = (id: string) => PROJECTS.find((p) => p.id === id);

function useEvents(lang: 'en' | 'ja') {
  const [evs, setEvs] = useState<GcEv[] | null>(null);
  useEffect(() => {
    let saved: GcEv[] | null = null;
    try { const s = localStorage.getItem(KEY); if (s) saved = JSON.parse(s); } catch { /* 保存できない環境 */ }
    if (saved?.length) setEvs(saved); else freshEvents(lang).then(setEvs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (evs) try { localStorage.setItem(KEY, JSON.stringify(evs)); } catch { /* 無視 */ } }, [evs]);
  const put = (ev: GcEv) => setEvs((a) => (a || []).map((x) => (x.id === ev.id ? ev : x)));
  const reset = async () => setEvs(await freshEvents(lang));
  return { evs, put, reset };
}

// ---- 作品の詳細（デジタル記録） ----
function Detail({ p, onClose, evs, goEvent }: { p: Project; onClose: () => void; evs: GcEv[]; goEvent: (id: string) => void }) {
  const { t, lang } = useLang();
  const [qr, setQr] = useState('');
  const [fp, setFp] = useState('');
  const url = typeof location !== 'undefined' ? (p.passport ? location.origin + p.passport : `${location.origin}/#${p.code}`) : '';
  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(setQr).catch(() => {});
    (async () => {
      try {
        if (p.img) { const b = await (await fetch(p.img)).arrayBuffer(); const d = await crypto.subtle.digest('SHA-256', b); setFp(Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, '0')).join('')); }
        else setFp(await sha256(JSON.stringify(p.draw || p.art) + p.code));
      } catch { setFp(''); }
    })();
  }, [p, url]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const ev = evs.find((e) => e.items.some((i) => i.id === p.id));
  return (
    <div className="hb-over" onClick={onClose}>
      <div className="hb-sheet" role="dialog" aria-modal="true" aria-label={p.title} onClick={(e) => e.stopPropagation()}>
        <button className="hb-x" onClick={onClose} aria-label={t('Close', '閉じる')}>×</button>
        <div className="hb-pic gt-turn"><span className="gt-spin"><ProjectPic p={p} /></span><span className="gt-sweep" aria-hidden /></div>
        <div className="hb-info">
          <p className="hb-code">{p.code} · {t('Sample', '見本')}</p>
          <h3>{p.title}</h3>
          <p className="hb-sub">{p.sub} · {p.year}</p>
          {p.price && <p className="hb-price">{yen(p.price)}</p>}
          {p.price && <div className="hb-cart"><AddToCart line={lineOf({ id: 'demo-' + p.id, title: p.title, price: yen(p.price), code: p.code, buy: 'demo', facts: p.facts, src: p.img || hubCut(p.id), img: p.img })} /></div>}
          <p>{lang === 'ja' ? p.story[1] : p.story[0]}</p>
          <Meters p={p} big />
          <dl className="hb-facts">{p.facts.map(([k, v]) => <div key={k}><dt>{lang === 'ja' ? FACT_JA[k] || k : k}</dt><dd>{v}</dd></div>)}</dl>
          {ev && <button className="hb-btn" onClick={() => goEvent(ev.id)}>{ev.kind === 'sale' ? t('Enter the lottery sale →', '抽選販売に申し込む →') : t('See the event →', 'イベントを見る →')}</button>}
          <div className="hb-rec">
            <span className="hb-qr" dangerouslySetInnerHTML={{ __html: qr }} />
            <div>
              <b>{t('Digital record', 'デジタル記録')}</b>
              <p className="hb-fine">{p.passport ? t('Opens the signed passport. In store, the NFC tag opens the same page.', '署名つきパスポートが開きます。店頭ではNFCタグから同じページが開きます。') : t('Photos, measurements and condition are tied to this code. The tag on the garment opens it.', '写真・採寸・状態をこの番号に紐付けています。服のタグから開けます。')}</p>
              {fp && <p className="hb-hash" title={fp}>{t('Photo fingerprint', '画像の指紋')} SHA-256 {fp.slice(0, 16)}…</p>}
              {p.passport && <a className="hb-link" href={p.passport}>{t('Open the passport →', 'パスポートを開く →')}</a>}
            </div>
          </div>
          <ol className="hb-log">{p.log.map((l, i) => <li key={i}><time>{l.at}</time>{lang === 'ja' ? l.what[1] : l.what[0]}</li>)}</ol>
        </div>
      </div>
    </div>
  );
}

function Grid({ ps, open, evs }: { ps: Project[]; open: (p: Project) => void; evs: GcEv[] }) {
  const { t } = useLang();
  return (
    <div className="hb-grid">
      {ps.map((p) => {
        const ev = evs.find((e) => e.items.some((i) => i.id === p.id));
        return (
          <button key={p.id} className="hb-card" data-rv onClick={() => { sfx('open'); open(p); }}>
            <span className="hb-cpic"><ProjectPic p={p} />{p.price ? <QuickAdd className="hb-qa" line={lineOf({ id: 'demo-' + p.id, title: p.title, price: yen(p.price), code: p.code, buy: 'demo', facts: p.facts, src: p.img || hubCut(p.id), img: p.img })} /> : null}{ev && <em>{ev.kind === 'sale' ? t('Lottery sale', '抽選販売') : t('Event', 'イベント')}</em>}</span>
            <span className="hb-ccode">{p.code}</span>
            <b>{p.title}</b>
            <span className="hb-csub">{p.sub}</span>
            <span className="hb-cprice">{p.price ? yen(p.price) : t('Price TBA', '価格未定')}</span>
            <Meters p={p} />
          </button>
        );
      })}
    </div>
  );
}

// ---- イベント：申し込み（来場者の画面） ----
function Join({ ev, put }: { ev: GcEv; put: (e: GcEv) => void }) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loc, setLoc] = useState(ev.locs[0]?.code || '');
  const [item, setItem] = useState(ev.items[0]?.id || '');
  const [mine, setMine] = useState<string>('');
  const [look, setLook] = useState('');
  const [err, setErr] = useState('');
  const me = ev.entrants.find((e) => e.id === (mine || look.trim().toUpperCase()));
  const L = (c: string) => ev.locs.find((l) => l.code === c);
  return (
    <div className="hb-join">
      {ev.state === 'open' ? (
        <form className="hb-form" onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !/.+@.+\..+/.test(email)) { setErr(t('Enter your name and a valid email.', 'お名前と正しいメールアドレスを入れてください。')); return; }
          if (ev.entrants.some((x) => x.email.toLowerCase() === email.trim().toLowerCase())) { setErr(t('This email has already entered.', 'このメールアドレスは申し込み済みです。')); return; }
          const id = rid();
          put({ ...ev, entrants: [...ev.entrants, { id, name: name.trim(), email: email.trim(), loc, item: ev.kind === 'sale' ? item : '', at: new Date().toISOString(), status: 'entered' }] });
          setMine(id); setErr(''); setName(''); setEmail('');
        }}>
          <b>{t('Pre-entry', '事前登録')}</b>
          <input type="text" placeholder={t('Name', 'お名前')} value={name} onChange={(e) => setName(e.target.value)} />
          <input type="email" placeholder={t('Email', 'メールアドレス')} value={email} onChange={(e) => setEmail(e.target.value)} />
          {ev.kind === 'sale' && <select value={item} onChange={(e) => setItem(e.target.value)}>{ev.items.map((i) => <option key={i.id} value={i.id}>{proj(i.id)?.title} — {t(`${i.stock} available`, `${i.stock}点`)}</option>)}</select>}
          {ev.locs.length > 1 && <select value={loc} onChange={(e) => setLoc(e.target.value)}>{ev.locs.map((l) => <option key={l.code} value={l.code}>{l.code} · {l.name}</option>)}</select>}
          <button className="hb-btn" type="submit">{t('Enter', '申し込む')}</button>
          <p className="hb-fine">{t('Demo: saved only in this browser. One entry per email. Names marked * are samples.', 'デモ：このブラウザにだけ保存します。1つのメールにつき1回。* 印の名前は見本です。')}</p>
          {err && <p className="hb-err">{err}</p>}
        </form>
      ) : <p className="hb-fine">{ev.state === 'closed' ? t('Entries are closed. The draw is next.', '受付は締め切りました。次は抽選です。') : t('The draw is done. Check your result with your receipt number.', '抽選は終わりました。受付番号で結果を確認できます。')}</p>}

      <div className="hb-check">
        <b>{t('Check your result', '結果を確認')}</b>
        <input type="text" placeholder={t('Receipt number (e.g. R-ABC2)', '受付番号（例 R-ABC2）')} value={mine || look} onChange={(e) => { setMine(''); setLook(e.target.value); }} />
        {me && (
          <div className={`hb-ticket ${me.status}`}>
            <span className="hb-tk-h">{ev.title}</span>
            <span>{t('Receipt', '受付番号')} <b>{me.id}</b> · {me.name}</span>
            {me.item && <span>{proj(me.item)?.title}</span>}
            {me.status === 'entered' && <strong>{t('Entered — waiting for the draw', '受付済み — 抽選をお待ちください')}</strong>}
            {(me.status === 'win' || me.status === 'checked') && (
              <>
                <strong>{t('You won', '当選')} · {t('No.', '整理番号')} {me.no}</strong>
                <span>{t('Time', '時間')} {ev.date} {me.slot} · {L(me.loc)?.name}</span>
                <span className="hb-fine">{L(me.loc)?.address}</span>
                {me.status === 'checked' && <span>{t('Checked in ✓', '来場済み ✓')}</span>}
              </>
            )}
            {me.status === 'wait' && <strong>{t(`Waitlist no. ${me.w}`, `補欠 ${me.w}番`)}</strong>}
            {me.status === 'declined' && <strong>{t('Declined', '辞退')}</strong>}
          </div>
        )}
        {!me && (mine || look).length > 4 && <p className="hb-fine">{t('Not found.', '見つかりません。')}</p>}
      </div>
    </div>
  );
}

// 公平性：抽選の種のハッシュを先に公開 → 抽選後に種を公開。誰でも順番を再計算できる
function Fair({ ev }: { ev: GcEv }) {
  const { t } = useLang();
  const [ok, setOk] = useState<boolean | null>(null);
  return (
    <div className="hb-fair">
      <b>{t('Fair draw', '公平な抽選')}</b>
      <p className="hb-fine">{t('Before the draw we publish a fingerprint of a secret seed. After the draw we reveal the seed; anyone can recompute the order.', '抽選前に、秘密の「種」の指紋（ハッシュ）を公開します。抽選後に種を公開するので、誰でも同じ順番を再計算できます。')}</p>
      <p className="hb-hash">{t('Seed fingerprint', '種の指紋')} {ev.seedHash.slice(0, 24)}…</p>
      {ev.state === 'drawn' && (
        <>
          <p className="hb-hash">{t('Seed', '種')} {ev.seed}</p>
          <button className="hb-btn ghost" onClick={async () => {
            const h = await sha256(ev.seed);
            const ord = await drawOrder(ev.seed, ev.drawIds || ev.entrants.map((e) => e.id));
            setOk(h === ev.seedHash && (await sha256(ord.join(','))) === ev.orderHash);
          }}>{t('Verify', '検証する')}</button>
          {ok !== null && <span className={ok ? 'hb-ok' : 'hb-err'}>{ok ? t('Seed matches the fingerprint and the order recomputes ✓', '種は公開済みの指紋と一致し、順番も再計算で一致 ✓') : t('Mismatch', '不一致')}</span>}
        </>
      )}
    </div>
  );
}

// ---- イベント：運営（編集） ----
function Ops({ ev, put }: { ev: GcEv; put: (e: GcEv) => void }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const pending = useRef<GcEv | null>(null);
  const [view, setView] = useState(ev.locs[0]?.code || '');
  const set = (p: Partial<GcEv>) => put({ ...ev, ...p });
  const setLoc = (i: number, p: Partial<Loc>) => { const locs = ev.locs.map((l, j) => (j === i ? { ...l, ...p } : l)); const n = { ...ev, locs }; put(ev.state === 'drawn' ? renumber(n) : n); };
  const upd = (id: string, p: Partial<Entrant>) => set({ entrants: ev.entrants.map((e) => (e.id === id ? { ...e, ...p } : e)) });
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of ev.entrants) c[ev.kind === 'sale' ? e.item : e.loc] = (c[ev.kind === 'sale' ? e.item : e.loc] || 0) + 1;
    return c;
  }, [ev]);
  const loc = ev.locs.find((l) => l.code === view) || ev.locs[0];
  const winners = ev.entrants.filter((e) => e.loc === loc?.code && (e.status === 'win' || e.status === 'checked')).sort((a, b) => (a.k || 0) - (b.k || 0));
  const waits = ev.entrants.filter((e) => e.loc === loc?.code && e.status === 'wait').sort((a, b) => (a.w || 0) - (b.w || 0));
  const declined = ev.entrants.filter((e) => e.loc === loc?.code && e.status === 'declined');

  return (
    <div className="hb-ops">
      <div className="hb-edit">
        <label><span>{t('Title', 'タイトル')}</span><input type="text" value={ev.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label><span>{t('Type', '種類')}</span>
          <select value={ev.kind} disabled={ev.state === 'drawn'} onChange={(e) => set({ kind: e.target.value as GcEv['kind'] })}>
            <option value="sale">{t('Lottery sale (per piece)', '抽選販売（作品ごと）')}</option>
            <option value="entry">{t('Entry lottery (per venue)', '入場抽選（会場ごと）')}</option>
          </select>
        </label>
        <label><span>{t('Event date', '開催日')}</span><input type="text" value={ev.date} onChange={(e) => set({ date: e.target.value })} /></label>
        <label><span>{t('Entry deadline', '受付締切')}</span><input type="text" value={ev.entryEnd} onChange={(e) => set({ entryEnd: e.target.value })} /></label>
        <label><span>{t('Minutes per slot', '1枠の分数')}</span><input type="number" min={5} step={5} value={ev.slotMin} onChange={(e) => { const n = { ...ev, slotMin: Math.max(5, +e.target.value || 5) }; put(ev.state === 'drawn' ? renumber(n) : n); }} /></label>
        <label><span>{t('People per slot', '1枠の人数')}</span><input type="number" min={1} value={ev.perSlot} onChange={(e) => { const n = { ...ev, perSlot: Math.max(1, +e.target.value || 1) }; put(ev.state === 'drawn' ? renumber(n) : n); }} /></label>
        <label className="wide"><span>{t('Description', '説明')}</span><textarea rows={2} value={ev.desc} onChange={(e) => set({ desc: e.target.value })} /></label>
      </div>

      {ev.kind === 'sale' && (
        <div className="hb-sub2">
          <b>{t('Pieces in the lottery', '抽選する作品')}</b>
          {ev.items.map((it, i) => (
            <div key={it.id} className="hb-row">
              <span className="grow">{proj(it.id)?.title}</span>
              <span className="hb-fine">{t('entries', '応募')} {counts[it.id] || 0}</span>
              <label>{t('Stock', '数量')} <input type="number" min={1} value={it.stock} disabled={ev.state === 'drawn'} onChange={(e) => set({ items: ev.items.map((x, j) => (j === i ? { ...x, stock: Math.max(1, +e.target.value || 1) } : x)) })} /></label>
            </div>
          ))}
        </div>
      )}

      <div className="hb-sub2">
        <b>{t('Venues', '会場・受け取り場所')}</b>
        {ev.locs.map((l, i) => (
          <div key={i} className="hb-loc">
            <input type="text" className="code" value={l.code} disabled={ev.state === 'drawn'} onChange={(e) => setLoc(i, { code: e.target.value.toUpperCase().slice(0, 2) || l.code })} aria-label={t('Code', '記号')} />
            <input type="text" value={l.name} onChange={(e) => setLoc(i, { name: e.target.value })} aria-label={t('Venue name', '会場名')} />
            <input type="text" value={l.address} onChange={(e) => setLoc(i, { address: e.target.value })} aria-label={t('Address', '住所')} />
            <label>{t('Opens', '開始')} <input type="text" value={l.start} onChange={(e) => /^\d{1,2}:\d{2}$/.test(e.target.value) ? setLoc(i, { start: e.target.value }) : setLoc(i, { start: l.start })} /></label>
            {ev.kind === 'entry' && <label>{t('Winners', '当選数')} <input type="number" min={0} value={l.capacity} disabled={ev.state === 'drawn'} onChange={(e) => setLoc(i, { capacity: Math.max(0, +e.target.value || 0) })} /></label>}
            <span className="hb-fine">{t('entries', '応募')} {counts[l.code] || ev.entrants.filter((e) => e.loc === l.code).length}</span>
            {ev.locs.length > 1 && ev.state !== 'drawn' && <button className="hb-mini" onClick={() => set({ locs: ev.locs.filter((_, j) => j !== i), entrants: ev.entrants.map((e) => (e.loc === l.code ? { ...e, loc: ev.locs.find((x) => x.code !== l.code)!.code } : e)) })}>×</button>}
          </div>
        ))}
        {ev.state !== 'drawn' && <button className="hb-mini" onClick={() => { const used = new Set(ev.locs.map((l) => l.code)); const code = 'ABCDEFGHJK'.split('').find((c) => !used.has(c)) || 'Z'; set({ locs: [...ev.locs, { code, name: t('New venue', '新しい会場'), address: '', start: '12:00', capacity: 10, note: '' }] }); }}>+ {t('Add venue', '会場を追加')}</button>}
      </div>

      <div className="hb-actions">
        <span className={`hb-state ${ev.state}`}>{ev.state === 'open' ? t('Taking entries', '受付中') : ev.state === 'closed' ? t('Closed', '締切') : t('Drawn', '抽選済み')}</span>
        <span className="hb-fine">{t('Entries', '応募')} {ev.entrants.length}</span>
        {ev.state === 'open' && <button className="hb-mini" onClick={() => set({ entrants: [...ev.entrants, ...sampleEntrants(ev, 20)] })}>+20 {t('sample entries', '見本の応募')}</button>}
        {ev.state === 'open' && <button className="hb-mini" onClick={() => set({ state: 'closed' })}>{t('Close entries', '受付を締め切る')}</button>}
        {ev.state === 'closed' && <button className="hb-mini" onClick={() => set({ state: 'open' })}>{t('Reopen', '受付を再開')}</button>}
        {ev.state !== 'drawn' && <button className="hb-btn gt-start" disabled={busy || !ev.entrants.length} onClick={() => { sfx('servo'); setBusy(true); }}>{t('Run the draw', '抽選する')}</button>}
        {busy && <DrawShow run={async () => { const r = await runDraw(ev); pending.current = r; sfx('fanfare'); const w = r.entrants.filter((e) => e.status === 'win').sort((a, b) => (a.no || '').localeCompare(b.no || '')); return { n: w.length, first: w.slice(0, 5).map((e) => `${e.no}  ${e.slot}  ${e.name}`) }; }} onDone={() => { if (pending.current) put(pending.current); pending.current = null; setBusy(false); }} />}
        {ev.state === 'drawn' && <button className="hb-mini" onClick={() => put(renumber(ev))}>{t('Renumber', '番号を振り直す')}</button>}
        {ev.state === 'drawn' && <button className="hb-mini" onClick={async () => { const seed = newSeed(); put({ ...ev, state: 'open', seed, seedHash: await sha256(seed), orderHash: undefined, drawIds: undefined, entrants: ev.entrants.map((e) => ({ ...e, status: 'entered', k: undefined, no: undefined, slot: undefined, w: undefined })) }); }}>{t('Undo draw (new seed)', '抽選を取り消す（種を新しく）')}</button>}
        <button className="hb-mini" onClick={() => dl(`${ev.id}-entries.csv`, '﻿' + csv(ev, (id) => proj(id)?.title || id), 'text/csv')}>CSV</button>
      </div>

      {ev.state === 'drawn' && loc && (
        <div className="hb-res">
          {ev.locs.length > 1 && <div className="hb-tabs">{ev.locs.map((l) => <button key={l.code} aria-pressed={l.code === loc.code} onClick={() => setView(l.code)}>{l.code} · {l.name}</button>)}</div>}
          <p className="hb-fine">{t(`Winners ${winners.length} · waitlist ${waits.length}. Use ↑↓ to change the order, then the time follows the number. “Decline” promotes the first on the waitlist.`, `当選 ${winners.length}・補欠 ${waits.length}。↑↓で順番を入れ替えると番号と時間も入れ替わります。「辞退」で補欠の先頭が繰り上がります。`)}</p>
          <div className="hb-table" role="table">
            {winners.map((e) => (
              <div key={e.id} className={`hb-tr ${e.status}`} role="row">
                <span className="no">{e.no}</span>
                <input className="slot" type="text" value={e.slot || ''} onChange={(x) => upd(e.id, { slot: x.target.value })} aria-label={t('Time', '時間')} />
                <input className="nm" type="text" value={e.name} onChange={(x) => upd(e.id, { name: x.target.value })} aria-label={t('Name', '名前')} />
                {e.item && <span className="it">{proj(e.item)?.title}</span>}
                <span className="ops">
                  <button className="hb-mini" onClick={() => put(swap(ev, e.id, -1))} aria-label="up">↑</button>
                  <button className="hb-mini" onClick={() => put(swap(ev, e.id, 1))} aria-label="down">↓</button>
                  <button className="hb-mini" aria-pressed={e.status === 'checked'} onClick={() => upd(e.id, { status: e.status === 'checked' ? 'win' : 'checked' })}>{e.status === 'checked' ? t('In ✓', '来場 ✓') : t('Check in', '来場')}</button>
                  <button className="hb-mini" onClick={() => put(decline(ev, e.id))}>{t('Decline', '辞退')}</button>
                </span>
              </div>
            ))}
          </div>
          {waits.length > 0 && <p className="hb-fine"><b>{t('Waitlist', '補欠')}</b> {waits.slice(0, 12).map((e) => `${e.w}. ${e.name}${e.item ? ` (${proj(e.item)?.title})` : ''}`).join(' / ')}{waits.length > 12 ? ' …' : ''}</p>}
          {declined.length > 0 && <p className="hb-fine"><b>{t('Declined', '辞退')}</b> {declined.map((e) => e.name).join(' / ')}</p>}
        </div>
      )}
    </div>
  );
}

function EventCard({ ev, put, open, setOpen }: { ev: GcEv; put: (e: GcEv) => void; open: boolean; setOpen: (b: boolean) => void }) {
  const { t } = useLang();
  const [tab, setTab] = useState<'join' | 'ops'>('join');
  const pill = PILLARS.find((p) => p.k === ev.pillar)!;
  const { lang } = useLang();
  const cap = ev.kind === 'sale' ? ev.items.reduce((a, i) => a + i.stock, 0) : ev.locs.reduce((a, l) => a + l.capacity, 0);
  return (
    <article className={`hb-ev ${open ? 'open' : ''}`} id={`ev-${ev.id}`} data-rv>
      <button className="hb-evh" onClick={() => { sfx(open ? 'close' : 'menu'); setOpen(!open); }} aria-expanded={open}>
        <span className="hb-evd"><b>{ev.date.slice(5).replace('-', '/')}</b><i>{ev.date.slice(0, 4)}</i></span>
        <span className="hb-evt">
          <em>{pill.n} {lang === 'ja' ? pill.ja[0] : pill.en[0]} · {ev.kind === 'sale' ? t('Lottery sale', '抽選販売') : t('Entry lottery', '入場抽選')}</em>
          <b>{ev.title}</b>
          <span>{ev.locs.map((l) => l.name).join(' / ')}</span>
        </span>
        <span className="gt-evr">
          <span className={`hb-state ${ev.state}`}>{ev.state === 'open' ? t('Open', '受付中') : ev.state === 'closed' ? t('Closed', '締切') : t('Drawn', '抽選済み')}</span>
          {ev.state === 'open' && <Countdown until={ev.entryEnd} />}
        </span>
        <span className="gt-gauge" aria-hidden><i style={{ ['--v' as string]: Math.min(1, ev.entrants.length / Math.max(1, cap * 3)) }} /><em>{t(`${ev.entrants.length} entries · ${cap} places`, `応募 ${ev.entrants.length} · 枠 ${cap}`)} · {t('odds', '倍率')} {(ev.entrants.length / Math.max(1, cap)).toFixed(1)}x</em></span>
      </button>
      {open && (
        <div className="hb-evb">
          <p>{ev.desc}</p>
          <div className="hb-meta">
            <span>{t('Entry until', '受付締切')} {ev.entryEnd}</span>
            <span>{t('Entries', '応募')} {ev.entrants.length}</span>
            <span>{t(`Slots: ${ev.perSlot} people every ${ev.slotMin} min`, `${ev.slotMin}分ごとに${ev.perSlot}人ずつ案内`)}</span>
          </div>
          <div className="hb-locs">
            {ev.locs.map((l) => (
              <div key={l.code} className="hb-locc">
                <b>{l.code} · {l.name}</b>
                <span>{l.address}</span>
                <span>{t('From', '開始')} {l.start}{ev.kind === 'entry' ? ` · ${t('winners', '当選')} ${l.capacity}` : ''} · {t('e.g. No.', '例：番号')} {l.code}-001 → {slotOf(ev, l, 1)}, {l.code}-{String(ev.perSlot + 1).padStart(3, '0')} → {slotOf(ev, l, ev.perSlot + 1)}</span>
                {l.note && <span className="hb-fine">{l.note}</span>}
                {l.address && <a className="hb-link" href={`https://www.google.com/maps/search/${encodeURIComponent(l.address)}`} target="_blank" rel="noopener noreferrer">{t('Map →', '地図 →')}</a>}
              </div>
            ))}
          </div>
          {ev.kind === 'sale' && <div className="hb-chips">{ev.items.map((i) => <span key={i.id}>{proj(i.id)?.title} · {t(`${i.stock} pcs`, `${i.stock}点`)}</span>)}</div>}
          <div className="hb-tabs">
            <button aria-pressed={tab === 'join'} onClick={() => setTab('join')}>{t('Visitor view', '来場者の画面')}</button>
            <button aria-pressed={tab === 'ops'} onClick={() => setTab('ops')}>{t('Organizer (edit)', '運営（編集）')}</button>
          </div>
          {tab === 'join' ? <><Join ev={ev} put={put} /><Fair ev={ev} /></> : <Ops ev={ev} put={put} />}
        </div>
      )}
    </article>
  );
}

const TOOLS: { p: string; items: [string, string, string][] }[] = [
  { p: '01', items: [['/demo', 'Provenance demo', '来歴デモ'], ['/passport/GC-DEMO-1', 'Signed passport', '署名つきパスポート'], ['/demo/nfc', 'NFC tag', 'NFCタグ'], ['/demo/3d', '3D view', '3D表示'], ['/verify', 'Verify offline', 'オフライン検証'], ['/ledger', 'Ledger', '台帳'], ['/proof', 'Proof lab', 'Proof Lab']] },
  { p: '02', items: [['/shop', 'Shop & 3D showroom', 'ショップと3Dショールーム'], ['/studio', 'Smart scan (scan → 3D → pattern) · photo studio · ghost mannequin', 'スマートスキャン（撮影→立体→型紙）・写真スタジオ・ゴーストマネキン'], ['/labels', 'Tag labels', 'タグのラベル印刷'], ['/archive', 'Previous archive page', '以前のアーカイブページ']] },
  { p: '03', items: [['/studio', 'Graphic studio · pattern lab (measure → pattern → 3D sewing)', 'グラフィック・パターンラボ（採寸→型紙→3D縫製）']] },
  { p: '04', items: [['/admin', 'Organizer admin (real events, tickets)', '運営の管理画面（本番のイベント・チケット）']] },
];

function SoundBtn() {
  const { t } = useLang();
  const [on, setOn] = useState(true);
  useEffect(() => { setOn(sfxEnabled()); return onSfxChange(setOn); }, []);
  return <button className="gt-snd" aria-pressed={on} onClick={() => setSfx(!on)} aria-label={t('Sound', '効果音')}>{on ? '♪ ON' : '♪ OFF'}</button>;
}

export default function Hub() {
  // 風船は少し下まで読んだら出す（最初の見出しと重ならないように）
  const [away, setAway] = useState(true);
  useEffect(() => { const on = () => setAway(window.scrollY < window.innerHeight * 0.8); on(); addEventListener('scroll', on, { passive: true }); return () => removeEventListener('scroll', on); }, []);
  const { t, lang } = useLang();
  const { evs, put, reset } = useEvents(lang === 'ja' ? 'ja' : 'en');
  const [sel, setSel] = useState<Project | null>(null);
  const [openEv, setOpenEv] = useState<string>('e1');
  const [vf, setVf] = useState<'all' | 'v' | 'u'>('all');
  const L = (p: (typeof PILLARS)[number]) => (lang === 'ja' ? p.ja : p.en);
  const by = (k: Pillar) => PROJECTS.filter((p) => p.pillar === k && !p.tour); // ツアーマーチはショップの特集で見せる
  const goEvent = (id: string) => { setSel(null); setOpenEv(id); setTimeout(() => document.getElementById(`ev-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); };
  useEffect(() => { const h = decodeURIComponent(location.hash.slice(1)); const p = PROJECTS.find((x) => x.code === h); if (p) setSel(p); }, []);
  useReveal(`${vf}${evs ? 1 : 0}`);
  // 背景の光の粒：章ごとに形を変える（0 ヒーロー / 1 RWA / 2 ヴィンテージ / 3 アート / 4 イベント）
  const [targets, setTargets] = useState<MorphTarget[]>([]);
  const [stage, setStage] = useState(0);
  const [hoverStage, setHoverStage] = useState<number | null>(null);
  useEffect(() => {
    setTargets([{ src: cutout('v3') }, textTarget('RWA', lang === 'ja' ? 'NFC · 記録つき' : 'NFC · ON-CHAIN RECORD'), { src: cutout('v1') }, { src: cutout('a1'), photo: true }, textTarget('No.0001', lang === 'ja' ? '抽選 · 受付番号' : 'LOTTERY · ENTRY NO.')]);
  }, [lang]);
  useEffect(() => {
    const ids = ['top', 'rwa', 'vintage', 'art', 'events'];
    const io = new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) setStage(Math.max(0, ids.indexOf((e.target as HTMLElement).id))); }); }, { rootMargin: '-45% 0px -45% 0px' });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [evs]);
  const vint = by('vintage').filter((p) => vf === 'all' || (vf === 'v' ? p.code.startsWith('GC-V') : p.code.startsWith('GC-U')));

  return (
    <div className="hb kh cxh" translate="no">
      {targets.length > 0 && <ParticleMorph targets={targets} active={hoverStage ?? stage} dim={stage > 0} />}
      <div className="st-ann">{t('Demo — all pieces and people are fictional samples · Launching 2027', 'デモ版 — 作品・人物はすべて架空の見本です · 2027年始動')}</div>
      <header className="hb-top">
        <nav>{PILLARS.map((p) => <a key={p.k} href={`#${p.k}`}>{L(p)[0]}</a>)}</nav>
        <a className="hb-logo notranslate" translate="no" href="/">Gallery Crypto</a>
        <span className="kh-r">
          <a href="/concept">{t('Concept', 'コンセプト')}</a>
          <a href="/shop">{t('Shop', 'ショップ')}</a>
          <SoundBtn />
          <LangToggle />
        </span>
      </header>

      <section className="kh-hero" id="top">
        <div className="kh-txt">
          <p className="kh-kick">Gallery Crypto — Tokyo</p>
          <h1>{t('Real things, with a record you can check.', '本物に、確かめられる記録を。')}</h1>
          <p className="kh-lead">{t('Each physical piece — one-of-one vintage, collabs, used clothing and art — is linked to a digital record, and events run on fair, verifiable lotteries.', '一点もののヴィンテージ、コラボ、古着、アート。実物の一つひとつをデジタルの記録と結びつけ、イベントは確かめられる公平な抽選で。')}</p>
          <div className="kh-ctas">
            <a href="/shop" onClick={() => sfx('select')}>{t('Shop now', 'ショップへ')}</a>
            <a href="/shop/room" className="ghost">{t('Walk the showroom', 'ショールームを歩く')}</a>
          </div>
          <div className="kh-stats">
            <span><b>{PROJECTS.length}</b>{t('pieces', '作品')}</span>
            <span><b>{evs?.length ?? 0}</b>{t('events', 'イベント')}</span>
            <span><b>{evs ? evs.reduce((a, e) => a + e.entrants.length, 0) : 0}</b>{t('entries', '応募')}</span>
          </div>
        </div>
      </section>
      <nav className="kh-tiles" aria-label={t('Main menu', 'メインメニュー')}>
        {PILLARS.map((p) => {
          const rep = p.k === 'events' ? PROJECTS.find((x) => x.id === 'a2')! : PROJECTS.find((x) => x.pillar === p.k && (x.img || x.draw || x.art))!;
          return (
            <a key={p.k} href={`#${p.k}`} className="kh-tile" onClick={() => sfx('select')} onPointerEnter={() => setHoverStage(STAGE[p.k])} onPointerLeave={() => setHoverStage(null)}>
              <span className="kh-tpic"><ProjectPic p={rep} /></span>
              <b>{L(p)[0]}</b><span>{L(p)[1]}</span>
            </a>
          );
        })}
      </nav>

      {/* 作品のように見せる大きな区画：写真（絵）を大きく、大きな見出しと「もっと見る」、美術館の作品札 */}
      <section className="ap" aria-label={t('Rooms', '部屋')}>
        {(() => {
          // 各区画に飾る一着（見本ラインからシリーズ違いで）
          const f = (se: string, kd: string) => LINE.find((l) => l.series === se && l.draw?.kind === kd) || LINE[0];
          const lab = (l: (typeof LINE)[number]) => [`${l.title.split(' —')[0]}, 2027`, `${l.facts.find((x) => x[0] === 'Material')?.[1] || ''} — ${l.facts.find((x) => x[0] === 'Finish')?.[1] || ''}`];
          const a = f('paint', 'hoodie'), b2 = f('record', 'tee'), c = f('fade', 'pants');
          return [
            { href: '/shop', k: t('Shop', 'ショップ'), h: t('Five series, one hundred samples.', '5つのシリーズ、100点の見本。'), pid: a.id, bg: '#efe9dc', fg: '#111', lab: lab(a) },
            { href: '/shop/rail', k: 'The Rail', h: t('Take one off the rail. Turn it in 3D.', 'レールから外して、3Dで回す。'), pid: b2.id, bg: '#0f0f10', fg: '#f1ece2', lab: lab(b2) },
            { href: '/shop/room', k: t('Showroom', 'ショールーム'), h: t('A white room, every display in 3D.', '白い部屋。すべての陳列を3Dで。'), pid: c.id, bg: '#c9b48e', fg: '#2a2017', lab: lab(c) },
            { href: '/concept', k: t('Concept', 'コンセプト'), h: t('One of one. On record.', '一点ものに、消えない記録を。'), pid: 't1', bg: '#2a2a2d', fg: '#e8e3d6', lab: [t('On Record Tour tee, 2027', 'On Record ツアーT、2027'), t('The back print is its own record', '背中のプリントはその一着の来歴')] },
          ];
        })()        .map((x, i) => (
          <a key={x.href} href={x.href} className={`ap-p ${i % 2 ? 'r' : ''}`} style={{ background: x.bg, color: x.fg }} data-rv onClick={() => sfx('select')}>
            <span className="ap-pic">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={hubCut(x.pid)} alt="" loading="lazy" /></span>
            <span className="ap-txt">
              <em>{String(i + 1).padStart(2, '0')} — {x.k}</em>
              <b>{x.h}</b>
              <i>{t('Explore more', 'もっと見る')} →</i>
            </span>
            <span className="ap-label"><b>{x.lab[0]}</b><span>{x.lab[1]}</span><span>{t('Sample — Gallery Crypto', '見本 — Gallery Crypto')}</span></span>
          </a>
        ))}
      </section>
      {/* ふわふわ浮かぶ、銀色の砂時計の風船（遊び心。押すといちばん上へ） */}
      <button className={`ap-balloon ${away ? 'away' : ''}`} onClick={() => { sfx('tick'); scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label={t('Back to top', 'いちばん上へ')}>
        <svg viewBox="0 0 80 160" aria-hidden>
          <defs><linearGradient id="apb" x1="0" x2="1"><stop offset="0" stop-color="#8d939a" /><stop offset=".35" stop-color="#f6f7f8" /><stop offset=".6" stop-color="#c3c8cd" /><stop offset="1" stop-color="#6f757c" /></linearGradient></defs>
          <path d="M14 8 H66 Q68 8 66 12 L44 48 L66 84 Q68 88 66 92 H14 Q12 88 14 84 L36 48 L14 12 Q12 8 14 8 Z" fill="url(#apb)" stroke="#9aa0a6" strokeWidth="1" />
          <path d="M22 14 L38 42" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".7" />
          <path d="M40 92 v4 q-6 16 2 30 q8 14 -2 30" fill="none" stroke="#777" strokeWidth="1.2" />
        </svg>
      </button>

      {(['rwa', 'vintage', 'art'] as Pillar[]).map((k) => {
        const p = PILLARS.find((x) => x.k === k)!;
        return (
          <section key={k} className="hb-sec" id={k}>
            <div className="hb-sh" data-rv><i>{p.n}</i><h2>{L(p)[0]}</h2><p>{L(p)[1]}</p></div>
            <SysBanner k={k} />
            {k === 'rwa' && <p className="hb-note">{t('Vintage originals and collaboration products. Each piece carries an NFC tag and a signed record whose fingerprint is anchored on a public blockchain — provenance and ownership you can verify without trusting us.', 'ヴィンテージの原型とコラボ商品。一点ごとにNFCタグと署名つきの記録を付け、その指紋を公開ブロックチェーンに記録します。私たちを信用しなくても、来歴と持ち主を確かめられます。')}</p>}
            {k === 'vintage' && (
              <div className="hb-tabs">
                {([['all', t('All', 'すべて')], ['v', t('Vintage', 'ヴィンテージ')], ['u', t('Used', '古着')]] as const).map(([v, l]) => <button key={v} aria-pressed={vf === v} onClick={() => setVf(v)}>{l}</button>)}
              </div>
            )}
            {k === 'art' && <p className="hb-note">{t('Projects outside fashion use the same record and the same event system.', 'ファッション以外の企画も、同じ記録と同じイベントのしくみで動きます。')}</p>}
            <Grid ps={k === 'vintage' ? vint : by(k)} open={setSel} evs={evs || []} />
          </section>
        );
      })}

      <section className="hb-sec" id="events">
        <div className="hb-sh" data-rv><i>04</i><h2>{t('Events & lottery', 'イベント・抽選')}</h2><p>{t('Pre-entry → fair draw → numbers, times and venues assigned automatically → edit anything', '事前登録 → 公平な抽選 → 番号・時間・場所を自動で割り振り → 何でも編集')}</p></div>
        <SysBanner k="events" />
        <ol className="hb-flow">
          <li><b>1</b>{t('Pre-entry', '事前登録')}</li>
          <li><b>2</b>{t('Seed fingerprint published', '種の指紋を公開')}</li>
          <li><b>3</b>{t('Draw', '抽選')}</li>
          <li><b>4</b>{t('No. + time + venue', '番号・時間・会場')}</li>
          <li><b>5</b>{t('Edit, promote, check in', '編集・繰り上げ・来場')}</li>
        </ol>
        {!evs ? <p className="hb-fine">…</p> : evs.map((ev) => <EventCard key={ev.id} ev={ev} put={put} open={openEv === ev.id} setOpen={(b) => setOpenEv(b ? ev.id : '')} />)}
        <button className="hb-mini" onClick={() => reset()}>{t('Reset the demo events', 'デモのイベントを初期化')}</button>
      </section>

      <section className="hb-sec" id="tools">
        <div className="hb-sh" data-rv><i>—</i><h2>{t('Everything built so far', 'これまでの機能')}</h2><p>{t('Sorted into the four pillars', '4つの柱に整理')}</p></div>
        <div className="hb-map">
          {TOOLS.map((g) => {
            const p = PILLARS.find((x) => x.n === g.p)!;
            return (
              <div key={g.p}>
                <b><i>{g.p}</i> {L(p)[0]}</b>
                <ul>{g.items.map(([href, en, ja]) => <li key={href + en}><a href={href}>{lang === 'ja' ? ja : en}</a></li>)}</ul>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="hb-foot">
        <span>© Gallery Crypto · Tokyo · {t('Demo. Sample data only; nothing here is for sale yet.', 'デモ版。見本データのみで、まだ販売はしていません。')}</span>
        <span><a href="/privacy">{t('Privacy', 'プライバシー')}</a> <a href="/legal">{t('Legal', '特商法')}</a></span>
      </footer>

      {sel && <Detail p={sel} onClose={() => setSel(null)} evs={evs || []} goEvent={goEvent} />}
    </div>
  );
}

// 各柱の見出し下に置く、3Dの構造図（PIECE / TAG / RECORD / OWNER の4層）
const SYS_ALT: Record<string, [string, string]> = {
  rwa: ['The four layers of a piece: the garment, an NFC tag sewn into the seam, its record, and the owner', '一着の4層：服、縫い込まれたNFCタグ、来歴の記録、持ち主'],
  vintage: ['The record layer: item, origin, where it was found, owners', '記録の層：品名、産地、見つかった場所、持ち主'],
  art: ['The same four layers, turned into an object', '同じ4層を、ひとつのオブジェとして'],
  events: ['A phone shows a lottery result: No. A-001, 12:00, Shibuya', '抽選結果をスマホで表示：No. A-001、12:00、渋谷'],
};
function SysBanner({ k }: { k: string }) {
  const { lang } = useLang();
  const a = SYS_ALT[k];
  if (!a) return null;
  return (
    <figure className="hb-ban" data-rv>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/media/sys-${k}.webp`} alt={lang === 'ja' ? a[1] : a[0]} width={1600} height={800} loading="lazy" decoding="async" />
    </figure>
  );
}
