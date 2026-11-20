'use client';
// ショールームの画面（3D の上に重ねる UI）：いま見ている売り場の名前・売り場の移動・押した作品の詳細パネル。
import { Component, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLang, LangToggle } from '../Lang';
import { sfx } from '@/lib/sfx';
import BuyButton from '../BuyButton';
import type { ShopItem } from './types';
import { demoItems } from './demo';
import { cutout, kindOf } from './pieceArt';
import type { GalleryApi, GRoom, GState } from './Gallery3D';
import HangRail, { type RailItem } from './HangRail';

const Gallery3D = dynamic(() => import('./Gallery3D'), { ssr: false });

// 3D が描けなかったとき（古い端末・メモリ不足など）に、画面全体をエラーにしないための受け皿
class Safe extends Component<{ children: React.ReactNode; fallback: React.ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  render() { return this.state.bad ? this.props.fallback : this.props.children; }
}

const ROOMS: { z: ShopItem['zone']; en: string; ja: string; den: string; dja: string }[] = [
  { z: 'rwa', en: 'RWA — vintage & collab', ja: 'RWA — 証明つきヴィンテージとコラボ', den: 'Left wall. One-of-one pieces on a steel shelf rack, each with its signed record.', dja: '左の壁。鉄の棚に並べた一点もの。来歴は署名して記録に残しています。' },
  { z: 'vintage', en: 'Vintage & used', ja: 'ヴィンテージ・古着', den: 'The rack at the back. Each piece hangs face-out, with folded stock on the shelves below.', dja: '奥のハンガーラック。一着ずつ正面を向けて掛け、下の棚にはたたんだ服。' },
  { z: 'art', en: 'Art & projects', ja: 'アート・プロジェクト', den: 'Right wall. Prints, sound and objects beyond fashion.', dja: '右の壁。版画・音・オブジェなど、ファッションの外の企画。' },
  { z: 'archive', en: 'Archive', ja: 'アーカイブ', den: 'Back wall, under the mural. Pieces kept for the record.', dja: '奥の壁、壁画の下。記録として残す作品。' },
];
const PER_ROOM = 6;

function Fallback() {
  const { t } = useLang();
  return (
    <div className="gr-fail">
      <b>{t('The showroom could not be shown on this device.', 'この端末ではショールームを表示できませんでした。')}</b>
      <span>{t('Close other tabs and try again, or see every piece in the shop.', 'ほかのタブを閉じてもう一度試すか、ショップですべての商品をご覧ください。')}</span>
      <div><button onClick={() => location.reload()}>{t('Try again', 'もう一度')}</button><a href="/shop">{t('Open the shop', 'ショップを見る')} →</a></div>
    </div>
  );
}

export default function GalleryClient({ initial }: { initial: ShopItem[] }) {
  const { t, lang } = useLang();
  const [local, setLocal] = useState<ShopItem[]>([]);
  useEffect(() => { try { setLocal(JSON.parse(localStorage.getItem('gc-shop-local') || '[]')); } catch { /* 無視 */ } }, []);
  const items = useMemo(() => [...local, ...initial, ...(initial.length ? [] : demoItems())], [local, initial]);
  const groups = useMemo(() => ROOMS.map((r) => ({ ...r, list: items.filter((i) => i.zone === r.z).slice(0, PER_ROOM) })).filter((r) => r.list.length), [items]);
  const rooms: GRoom[] = useMemo(() => groups.map((g) => ({ key: g.z, pieces: g.list.map((i) => ({ id: i.id, title: i.title, code: i.code, kind: i.img && kindOf(i) !== 'cap' ? 'art' as const : kindOf(i), tex: i.img || (i.pid ? cutout(i.pid) : '') })) })), [groups]);
  const api = useRef<GalleryApi | null>(null);
  const [st, setSt] = useState<GState>({ room: 0, focus: null, moving: false, ready: false });
  // ショップの「ショールームで見る」から来たときは、その作品の前まで歩いていく
  const handed = useRef(false);
  useEffect(() => {
    if (!st.ready || handed.current) return; handed.current = true;
    const m = /[#&]p=([^&]+)/.exec(location.hash); if (!m) return;
    const id = decodeURIComponent(m[1]); setTimeout(() => api.current?.focus(id), 900);
  }, [st.ready]);
  const [label, setLabel] = useState(0);
  useEffect(() => { setLabel(st.room); }, [st.room]);
  const g = groups[label];
  const cur = st.focus ? items.find((i) => i.id === st.focus) : null;
  const inRoom = cur ? groups[st.room]?.list || [] : [];
  const k = cur ? inRoom.findIndex((i) => i.id === cur.id) : -1;
  // 服を押したら、ラックから外して手に取る：その売り場の服が一本のレールに並び、押した一着が真ん中に寄る
  const isG = !!cur && kindOf(cur) === 'garment';
  const railItems: RailItem[] = useMemo(() => (isG ? inRoom.filter((i) => kindOf(i) === 'garment').map((i) => ({ ...i, src: i.img || (i.pid ? cutout(i.pid) : ''), kind: 'garment' as const })) : []), [isG, inRoom]);
  const go = (i: number) => { if (i < 0 || i >= groups.length) return; api.current?.goRoom(i); sfx('tick'); };
  const step = (d: number) => { const n = inRoom[(k + d + inRoom.length) % inRoom.length]; if (n) { api.current?.focus(n.id); sfx('tick'); } };
  const two = (n: number) => String(n).padStart(2, '0');

  return (
    <div className={`gr ${cur && !isG ? 'has-panel' : ''} ${isG ? 'taking' : ''}`} translate="no">
      <Safe fallback={<Fallback />}>
        <Gallery3D paused={isG} rooms={rooms} apiRef={api} onState={setSt} onPick={(id) => { api.current?.focus(id); sfx('open'); }} />
      </Safe>
      {st.lost && <Fallback />}
      <div className={`gr-veil ${st.ready ? 'off' : ''}`}><em>Gallery Crypto</em><span>{t('Opening the showroom…', 'ショールームをひらいています…')}</span></div>

      <header className="gr-top">
        <a href="/shop">← {t('Shop', 'ショップ')}</a>
        <a className="gr-logo notranslate" href="/">Gallery Crypto</a>
        <span className="gr-r"><LangToggle /></span>
      </header>

      {g && (
        <div className={`gr-room ${st.moving ? 'out' : ''} ${cur ? 'dim' : ''}`} key={label}>
          <em>{t('Area', 'エリア')} {two(label + 1)} / {two(groups.length)}</em>
          <b>{lang === 'ja' ? g.ja : g.en}</b>
          <p>{lang === 'ja' ? g.dja : g.den}</p>
          <small>{t('Walk the store: tap the floor or use W A S D / the stick · drag to look around · tap a circle or a piece for details', '店内を歩けます：床をタップ、または W A S D／左下のスティック · ドラッグで見回す · 丸か作品を押すと詳細')}</small>
        </div>
      )}

      <nav className={`gr-nav ${cur ? 'dim' : ''}`} aria-label={t('Areas', 'エリア')}>
        <button onClick={() => go(st.room - 1)} disabled={st.room === 0} aria-label={t('Previous area', '前のエリアへ歩く')}>←</button>
        <span>{groups.map((r, i) => <i key={r.z} className={i === st.room ? 'on' : ''} onClick={() => go(i)} title={lang === 'ja' ? r.ja : r.en} />)}</span>
        <button onClick={() => go(st.room + 1)} disabled={st.room >= groups.length - 1} aria-label={t('Next area', '次のエリアへ歩く')}>→</button>
      </nav>

      {isG && cur && (
        <div className="gr-take" role="dialog" aria-label={cur.title}>
          <HangRail dark items={railItems} focusId={cur.id} onFocus={(id) => { api.current?.focus(id); sfx('tick'); }} />
          <a className="gr-take-shop" href={`/shop#p=${encodeURIComponent(cur.id)}`}>{t('View in the shop →', 'ショップで見る →')}</a>
        </div>
      )}
      <aside className={`gr-panel ${cur && !isG ? 'on' : ''}`} aria-hidden={!cur || isG}>
        {cur && !isG && (
          <div key={cur.id}>
            <button className="gr-x" onClick={() => { api.current?.focus(null); sfx('tick'); }} aria-label={t('Close', '閉じる')}>×</button>
            <em className="gr-code">{cur.code}{cur.buy === 'demo' ? ` · ${t('Sample', '見本')}` : ''}</em>
            <h2>{cur.title}</h2>
            <p className="gr-sub">{cur.sub}</p>
            <strong className="gr-price">{cur.price}</strong>
            <p className="gr-desc">{cur.desc}</p>
            {cur.facts.length > 0 && <dl>{cur.facts.slice(0, 6).map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>}
            <div className="gr-buy">
              {cur.buy === 'stripe' && <BuyButton itemId={cur.id} />}
              {cur.buy === 'sold' && <span className="gr-fine">{t('Sold', '売約済み')}</span>}
              <a className="gr-btn" href={`/shop#p=${encodeURIComponent(cur.id)}`}>{t('View in the shop →', 'ショップで見る →')}</a>
              {(cur.buy === 'demo' || cur.buy === 'local') && <p className="gr-fine">{t('Sample — not for sale. Sales open in 2027 (card / Apple Pay).', '見本のため購入はできません。販売は2027年から（カード／Apple Pay）。')}</p>}
            </div>
            {inRoom.length > 1 && (
              <div className="gr-step">
                <button onClick={() => step(-1)}>‹ {t('Prev', '前へ')}</button>
                <span>{two(k + 1)} / {two(inRoom.length)}</span>
                <button onClick={() => step(1)}>{t('Next', '次へ')} ›</button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
