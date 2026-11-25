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
import { withColors } from './withColors';
import { AddToCart } from '../cart/Cart';
import { lineOf } from '../cart/lineOf';
import { isPhone } from '@/lib/device';

const Showroom3D = dynamic(() => import('./Showroom3D'), { ssr: false });

// 3D が描けなかったとき（古い端末・メモリ不足など）に、画面全体をエラーにしないための受け皿
class Safe extends Component<{ children: React.ReactNode; fallback: React.ReactNode }, { bad: boolean }> {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  render() { return this.state.bad ? this.props.fallback : this.props.children; }
}

// 売り場（陳列の仕方ごと）。商品の種類で振り分ける
type RoomDef = { key: string; dp: DP; max: number; exhibit?: boolean; en: string; ja: string; den: string; dja: string; pick: (i: ShopItem) => boolean };
const isLine = (i: ShopItem) => !!i.line;
const ROOMS: RoomDef[] = [
  { key: 'forms', dp: 'forms', max: 3, en: 'At the door — on the forms', ja: '入口 — トルソー', den: 'Three pieces worn on forms, turning slowly on white plinths.', dja: '白い回転台の上で、ゆっくり回るトルソーに着せた3点。', pick: (i) => isLine(i) && /hoodie|jacket|crew/i.test(i.title) },
  { key: 'bike', dp: 'bike', max: 0, exhibit: true, en: 'Custom BMX — by the door', ja: 'カスタムBMX — 入口のトルソーの横に', den: 'Chrome frame and gold parts on a turning mirror. Sample display — not for sale.', dja: 'クロームのフレームと金のパーツ、回る鏡の台。見本の展示で、売り物ではありません。', pick: () => false },
  { key: 'wall', dp: 'wall', max: 40, en: 'Tops room', ja: 'トップスの部屋', den: 'Face-out up to three rows high on two walls, folded stock on the top shelf.', dja: '二面の壁に、高く三段までのフェイスアウト。いちばん上の棚には、たたんだ在庫。', pick: (i) => i.line === 'tops' && !/ tee /i.test(` ${i.title} `) && !/Tee —/.test(i.title) },
  { key: 'outer', dp: 'outer', max: 40, en: 'Outerwear room', ja: 'アウターの部屋', den: 'Jackets and coats on one long rail, with the lowrider parked in front.', dja: 'ジャケットとコートを長いレールに一列。手前にローライダーを停めて。', pick: (i) => i.line === 'outer' },
  { key: 'car', dp: 'car', max: 0, exhibit: true, en: 'Lowrider — with the outerwear', ja: 'ローライダー — アウターと一緒に', den: 'Candy paint, lace and gold leaf, on hydraulics. Sample display — not for sale.', dja: 'キャンディ塗装・レース・金の線、油圧で弾む。見本の展示で、売り物ではありません。', pick: () => false },
  { key: 'rack', dp: 'rack', max: 40, en: 'Pants room', ja: 'パンツの部屋', den: 'Two racks set in an L. The opening on the left wall leads to the yacht hall.', dja: '二台のラックを L 字に。左の壁の開口から、ヨットの展示ホールへ。', pick: (i) => i.line === 'bottoms' },
  { key: 'yacht', dp: 'yacht', max: 0, exhibit: true, en: 'The Collection — Nocturne', ja: 'コレクション — ヨット「Nocturne」', den: 'An original 8.6 m day cruiser: midnight hull, teak deck, cream leather. Sample display — not for sale.', dja: 'オリジナルの8.6mのデイクルーザー。真夜中の紺の船体・チークの甲板・クリームの革。見本の展示で、売り物ではありません。', pick: () => false },
  { key: 'back', dp: 'back', max: 40, en: 'Back room — vintage & tour', ja: '奥の部屋 — ヴィンテージ・ツアー', den: 'One-of-one vintage and tour merch on the long rail, under the mezzanine.', dja: '中二階の下の長いレールに、一点もののヴィンテージとツアーマーチ。', pick: (i) => !isLine(i) && kindOf(i) === 'garment' },
  { key: 'table', dp: 'table', max: 40, en: 'Tee room', ja: 'Tシャツの部屋', den: 'Folded tees on a long stone-top table with chrome X legs, print side up. Entered from the back room.', dja: 'クロームのX脚に石の天板の長いテーブルに、柄を上にしてたたんだTシャツ。奥の部屋から入ります。', pick: (i) => i.line === 'tops' && /Tee —/.test(i.title) },
  { key: 'case', dp: 'case', max: 40, en: 'Small things room', ja: '小物の部屋', den: 'Stickers, pins, keychains and more under glass.', dja: 'ガラスの中に、ステッカー・ピン・キーホルダーなど。', pick: (i) => i.line === 'acc' },
  { key: 'caps', dp: 'caps', max: 40, en: 'Headwear room', ja: '帽子の部屋', den: 'Caps and beanies, one to each glowing cube.', dja: 'キャップとニット帽を、光る箱の格子にひとつずつ。', pick: (i) => i.line === 'head' || (!isLine(i) && kindOf(i) === 'cap') },
  { key: 'atrium', dp: 'atrium', max: 0, exhibit: true, en: 'The atrium', ja: '吹き抜け', den: 'Ten metres high: a skate bowl, one piece hung 4.4 m tall, a mural and a wall of decks. Seen from the mezzanine.', dja: '天井 10m。スケートボウル、高さ4.4mに吊るした一着、壁画とスケートデッキの壁。中二階から見下ろします。', pick: () => false },
  { key: 'art', dp: 'art', max: 40, en: 'Mezzanine — art', ja: '中二階 — アート', den: 'Framed pieces on the high back wall.', dja: '奥の高い壁に、額装の作品。', pick: (i) => !isLine(i) && kindOf(i) === 'art' },
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
  // スマホは売り場ごとの点数を減らす（メモリ対策）
  const [phone, setPhone] = useState<boolean | null>(null); // 端末を確かめるまでは3Dを開かない
  useEffect(() => { setPhone(isPhone()); }, []);
  const groups = useMemo(() => {
    // 同じ商品を二つの売り場に置かない。ひとつの売り場ごとに、種類をばらして選ぶ
    const used = new Set<string>();
    return ROOMS.map((r) => {
      const cand = items.filter((i) => !used.has(i.id) && r.pick(i) && (i.img || i.pid));
      const seen = new Map<string, number>(), list: ShopItem[] = [];
      for (const i of cand) { const t = i.title.split(' —')[0]; if ((seen.get(t) || 0) >= (r.dp === 'table' ? 2 : 1) && cand.length > r.max) continue; seen.set(t, (seen.get(t) || 0) + 1); list.push(i); if (list.length >= r.max) break; }
      if (phone && list.length > 6) list.length = 6; // スマホは売り場ごとに6点まで（軽くするため）
      list.forEach((i) => used.add(i.id));
      return { ...r, z: r.key, list };
    }).filter((r) => r.list.length || r.exhibit);
  }, [items, phone]);
  const rooms: SRoom[] = useMemo(() => groups.map((g) => ({ key: g.key, dp: g.dp, pieces: g.list.map((i) => ({ id: i.id, title: i.title, code: i.code, kind: kindOf(i), tex: i.img || (i.pid ? cutout(i.pid) : ''), back: i.back, heightM: i.heightM })) })), [groups]);
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
  const railItems: RailItem[] = useMemo(() => { if (!isG) return []; const r = (i: ShopItem): RailItem => ({ ...i, src: i.img || (i.pid ? cutout(i.pid) : ''), kind: 'garment' as const }); return withColors(inRoom.filter((i) => kindOf(i) === 'garment').map(r), items.filter((i) => kindOf(i) === 'garment').map(r), cur?.id || null); }, [isG, inRoom, items, cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (i: number) => { if (i < 0 || i >= groups.length) return; api.current?.goRoom(i); sfx('tick'); };
  const step = (d: number) => { const n = inRoom[(k + d + inRoom.length) % inRoom.length]; if (n) { api.current?.focus(n.id); sfx('tick'); } };
  const two = (n: number) => String(n).padStart(2, '0');

  return (
    <div className={`gr ${cur && !isG ? 'has-panel' : ''} ${isG ? 'taking' : ''} ${st.walking ? 'walking' : ''}`} translate="no">
      <Safe fallback={<Fallback />}>
        {phone !== null && <Showroom3D paused={isG} rooms={rooms} apiRef={api} onState={setSt} onPick={(id) => { api.current?.focus(id); sfx('open'); }} />}
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

      {/* 歩く：ゲームのように自由に。パソコンはキー、スマホは左下のスティック */}
      {st.ready && !cur && (
        <button className={`gr-walk ${st.walking ? 'on' : ''}`} onClick={() => { api.current?.walk?.(!st.walking); sfx('tick'); }}>
          {st.walking ? t('Back to the tour', 'ツアーに戻る') : t('Walk freely', '自由に歩く')}
        </button>
      )}
      {st.walking && !cur && (
        <>
          <Stick onMove={(x, y) => api.current?.stick?.(x, y)} />
          <p className="gr-hint">{phone ? t('Left stick to walk · drag to look · walk into the spiral stair to go up', '左のスティックで歩く · ドラッグで見回す · らせん階段に入ると中二階へ') : t('WASD / arrows to walk · Shift to run · drag to look · Esc to go back', 'WASD・矢印で歩く · Shift で走る · ドラッグで見回す · Esc で戻る')}</p>
        </>
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
              {cur.buy !== 'sold' && <AddToCart line={lineOf({ ...cur, src: cur.img || (cur.pid ? cutout(cur.pid) : '') })} />}
              {/* 色展開 */}
              {cur.group && items.filter((x) => x.group === cur.group).length > 1 && (
                <div className="gc-swatches" style={{ justifyContent: 'flex-start' }}>
                  {items.filter((x) => x.group === cur.group).map((x) => <a key={x.id} href={`/shop#p=${encodeURIComponent(x.id)}`} aria-current={x.id === cur.id} title={x.color} style={{ background: x.hex }} />)}
                  <small>{cur.color}</small>
                </div>
              )}
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

// 画面のスティック（スマホで歩く）：中心からのずれを -1〜1 で返す。離すと 0
function Stick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null), knob = useRef<HTMLElement>(null), id = useRef<number | null>(null);
  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect(), R = r.width / 2;
    let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    if (knob.current) knob.current.style.transform = `translate(${x * R * 0.55}px,${y * R * 0.55}px)`;
    onMove(Math.abs(x) < 0.12 ? 0 : x, Math.abs(y) < 0.12 ? 0 : y);
  };
  const end = () => { id.current = null; if (knob.current) knob.current.style.transform = ''; onMove(0, 0); };
  return (
    <div ref={ref} className="gr-stick" aria-hidden
      onPointerDown={(e) => { id.current = e.pointerId; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); set(e); }}
      onPointerMove={(e) => { if (id.current === e.pointerId) set(e); }}
      onPointerUp={end} onPointerCancel={end}>
      <i ref={knob} />
    </div>
  );
}
