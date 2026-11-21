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
import type { GalleryApi, GState } from './Gallery3D';
import type { DP, SRoom } from './Showroom3D';
import HangRail, { type RailItem } from './HangRail';

const Showroom3D = dynamic(() => import('./Showroom3D'), { ssr: false });

// 3D が描けなかったとき（古い端末・メモリ不足など）に、画面全体をエラーにしないための受け皿
class Safe extends Component<{ children: React.ReactNode; fallback: React.ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  render() { return this.state.bad ? this.props.fallback : this.props.children; }
}

// 売り場（陳列の仕方ごと）。商品の種類で振り分ける
type RoomDef = { key: string; dp: DP; max: number; en: string; ja: string; den: string; dja: string; pick: (i: ShopItem) => boolean };
const isLine = (i: ShopItem) => !!i.line;
const ROOMS: RoomDef[] = [
  { key: 'forms', dp: 'forms', max: 3, en: 'At the door — on the forms', ja: '入口 — トルソー', den: 'Three pieces worn on forms, turning slowly on white plinths.', dja: '白い回転台の上で、ゆっくり回るトルソーに着せた3点。', pick: (i) => isLine(i) && /hoodie|jacket|crew/i.test(i.title) },
  { key: 'wall', dp: 'wall', max: 10, en: 'Tops wall', ja: 'トップスの壁', den: 'Two rows face-out on the left wall, folded stock on the shelves.', dja: '左の壁に二段のフェイスアウト。棚には、たたんだ在庫。', pick: (i) => i.line === 'tops' && !/ tee /i.test(` ${i.title} `) && !/Tee —/.test(i.title) },
  { key: 'table', dp: 'table', max: 10, en: 'The table — tees', ja: 'テーブル — Tシャツ', den: 'Folded tees stacked on the oak table, print side up.', dja: 'オークのテーブルに、柄を上にしてたたんだTシャツ。', pick: (i) => i.line === 'tops' && /Tee —/.test(i.title) },
  { key: 'rack', dp: 'rack', max: 8, en: 'Pants rack', ja: 'パンツのラック', den: 'Flares, sweatpants and shorts hung on a free-standing rack.', dja: '自立式のラックに、フレア・スウェットパンツ・ショーツ。', pick: (i) => i.line === 'bottoms' },
  { key: 'back', dp: 'back', max: 10, en: 'Back wall — vintage & tour', ja: '奥の壁 — ヴィンテージ・ツアー', den: 'One-of-one vintage and tour merch on the long rail.', dja: '長いレールに、一点もののヴィンテージとツアーマーチ。', pick: (i) => !isLine(i) && kindOf(i) === 'garment' },
  { key: 'caps', dp: 'caps', max: 10, en: 'Headwear wall', ja: '帽子の棚', den: 'Caps and beanies, one to a shelf.', dja: 'キャップとニット帽を、ひとつずつ棚に。', pick: (i) => i.line === 'head' || (!isLine(i) && kindOf(i) === 'cap') },
  { key: 'case', dp: 'case', max: 8, en: 'The case — small things', ja: 'ショーケース — 小物', den: 'Stickers, pins, keychains and more under glass.', dja: 'ガラスの中に、ステッカー・ピン・キーホルダーなど。', pick: (i) => i.line === 'acc' },
  { key: 'art', dp: 'art', max: 3, en: 'Art', ja: 'アート', den: 'Framed pieces on the front wall.', dja: '手前の壁に、額装の作品。', pick: (i) => !isLine(i) && kindOf(i) === 'art' },
];

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
  const groups = useMemo(() => {
    // 同じ商品を二つの売り場に置かない。ひとつの売り場ごとに、種類をばらして選ぶ
    const used = new Set<string>();
    return ROOMS.map((r) => {
      const cand = items.filter((i) => !used.has(i.id) && r.pick(i) && (i.img || i.pid));
      const seen = new Map<string, number>(), list: ShopItem[] = [];
      for (const i of cand) { const t = i.title.split(' —')[0]; if ((seen.get(t) || 0) >= (r.dp === 'table' ? 2 : 1) && cand.length > r.max) continue; seen.set(t, (seen.get(t) || 0) + 1); list.push(i); if (list.length >= r.max) break; }
      list.forEach((i) => used.add(i.id));
      return { ...r, z: r.key, list };
    }).filter((r) => r.list.length);
  }, [items]);
  const rooms: SRoom[] = useMemo(() => groups.map((g) => ({ key: g.key, dp: g.dp, pieces: g.list.map((i) => ({ id: i.id, title: i.title, code: i.code, kind: kindOf(i), tex: i.img || (i.pid ? cutout(i.pid) : ''), back: i.back })) })), [groups]);
  const api = useRef<GalleryApi | null>(null);
  const [st, setSt] = useState<GState>({ room: 0, focus: null, moving: false, ready: false });
  // 診断：この画面で起きたエラーを画面の下に出す（iPhone で表示できない原因を確かめるため）
  const [diag, setDiag] = useState<string[]>([]);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const add = (m: string) => setDiag((d) => (d.includes(m) || d.length > 5 ? d : [...d, m]));
    const onErr = (e: ErrorEvent) => add('error: ' + (e.message || String(e.error)));
    const onRej = (e: PromiseRejectionEvent) => add('promise: ' + String((e.reason && (e.reason.message || e.reason)) || ''));
    const on3d = (e: Event) => add(String((e as CustomEvent).detail || '3d'));
    addEventListener('error', onErr); addEventListener('unhandledrejection', onRej); addEventListener('gc-3d-error', on3d);
    return () => { removeEventListener('error', onErr); removeEventListener('unhandledrejection', onRej); removeEventListener('gc-3d-error', on3d); };
  }, []);
  // 15秒たっても3Dが開かなければ、代わりの案内を出す
  useEffect(() => { if (st.ready) return; const h = setTimeout(() => setSlow(true), 15000); return () => clearTimeout(h); }, [st.ready]);
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
        <Showroom3D paused={isG} rooms={rooms} apiRef={api} onState={setSt} onPick={(id) => { api.current?.focus(id); sfx('open'); }} />
      </Safe>
      {(st.lost || (slow && !st.ready)) && <Fallback />}
      {diag.length > 0 && <pre className="gr-diag">{diag.join('\n')}{'\n'}{typeof navigator !== 'undefined' ? navigator.userAgent : ''}</pre>}
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
          <small>{t('‹ › to move between areas · drag to look around · pinch or scroll to get closer · tap a piece for details', '‹ › で売り場を移動 · ドラッグで見回す · ピンチ／スクロールで寄る · 商品を押すと詳細')}</small>
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
