'use client';
// 旅するショールームの画面（3D の上に重ねる UI）：はじまり・地帯の見出し・進むボタン・服のカード・360°・おわり。
import { useMemo, useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useLang, LangToggle } from '../Lang';
import { PROJECTS } from '@/lib/hub';
import { sfx } from '@/lib/sfx';
import type { ShopItem } from './types';
import { demoItems } from './ShopClient';
import { realGarment } from './garmentArt';
import type { JourneyApi, JState, Look } from './Journey3D';

const Journey3D = dynamic(() => import('./Journey3D'), { ssr: false });
const ZN: [string, string, string][] = [['01', 'Store', '店'], ['02', 'City', '街'], ['03', 'Forest', '森'], ['04', 'Summit', '山頂']];
const svgUrl = (s: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

export default function JourneyClient({ initial }: { initial: ShopItem[] }) {
  const { t, lang } = useLang();
  const [local, setLocal] = useState<ShopItem[]>([]);
  useEffect(() => { try { setLocal(JSON.parse(localStorage.getItem('gc-shop-local') || '[]')); } catch { /* 無視 */ } }, []);
  const items = useMemo(() => [...local, ...initial, ...(initial.length ? [] : demoItems())], [local, initial]);
  const looks: Look[] = useMemo(() => items.map((i) => {
    const p = PROJECTS.find((x) => x.id === i.pid);
    if (p?.draw) return { id: i.id, title: i.title, kind: 'garment' as const, tex: svgUrl(realGarment(p.draw, PROJECTS.indexOf(p) + 3)), shape: p.draw.kind };
    const kind = i.zone === 'art' ? 'art' as const : i.zone === 'rwa' ? 'cap' as const : 'garment' as const;
    return { id: i.id, title: i.title, kind, tex: i.img || '' };
  }).filter((l) => l.tex), [items]);
  const api = useRef<JourneyApi | null>(null);
  const [st, setSt] = useState<JState>({ u: 0, zone: 0, station: null, end: false });
  const [started, setStarted] = useState(false);
  const [v360, setV360] = useState(false);
  const [zoneCard, setZoneCard] = useState(0);
  const hold = useRef<number | undefined>(undefined);
  useEffect(() => { if (!started) return; setZoneCard(Date.now()); sfx(st.zone === 3 ? 'fanfare' : 'drop'); }, [st.zone, started]);
  const cur = st.station !== null ? items.find((i) => i.id === looks[st.station!]?.id) : null;
  const press = (d: number) => { api.current?.move(d * 0.06); clearInterval(hold.current); hold.current = window.setInterval(() => api.current?.move(d * 0.03), 80); };
  const release = () => clearInterval(hold.current);
  useEffect(() => () => clearInterval(hold.current), []);
  const showZone = Date.now() - zoneCard < 2600;

  return (
    <div className="jr" translate="no">
      <Journey3D looks={looks} apiRef={api} onState={(s) => { setSt(s); if (s.station === null) setV360(false); }} onPick={(id) => { const k = looks.findIndex((l) => l.id === id); if (k >= 0) { api.current?.goStation(k); sfx('open'); } }} />

      <header className="jr-top">
        <a href="/shop">← {t('Shop', 'ショップ')}</a>
        <b>GALLERY CRYPTO <span>{t('— The walk', '— 旅するショールーム')}</span></b>
        <LangToggle />
      </header>

      {started && showZone && (
        <div className="jr-zone" key={zoneCard}>
          <em>{ZN[st.zone][0]}</em>
          <b>{lang === 'ja' ? ZN[st.zone][2] : ZN[st.zone][1].toUpperCase()}</b>
        </div>
      )}

      {started && (
        <div className="jr-hud">
          <div className="jr-prog"><i style={{ width: `${st.u * 100}%` }} />{[0.2, 0.5, 0.8].map((x) => <s key={x} style={{ left: `${x * 100}%` }} />)}</div>
          <div className="jr-ctl">
            <button onPointerDown={() => press(-1)} onPointerUp={release} onPointerLeave={release} aria-label={t('Back', '戻る')}>◀</button>
            <button className="jr-next" onClick={() => { const k = st.station === null ? looks.findIndex((_, i) => (i + 0.5) / looks.length > st.u) : st.station + 1; api.current?.goStation(Math.max(0, k)); sfx('tick'); }}>{t('Next look', '次の服へ')}</button>
            <button onPointerDown={() => press(1)} onPointerUp={release} onPointerLeave={release} aria-label={t('Walk', '進む')}>▶</button>
          </div>
          <p>{t('Scroll, swipe up or hold ▶ to walk · drag to look around', 'スクロール・上スワイプ・▶長押しで進む · ドラッグで見回す')}</p>
        </div>
      )}

      {started && cur && st.station !== null && (
        <aside className={`jr-card ${v360 ? 'v360' : ''}`} key={cur.id}>
          <em>LOOK {String(st.station + 1).padStart(2, '0')} / {String(looks.length).padStart(2, '0')}</em>
          <b>{cur.title}</b>
          <span>{cur.sub}</span>
          <strong>{cur.price}</strong>
          <div>
            <button onClick={() => { const on = !v360; setV360(on); api.current?.view360(on); sfx('select'); }}>{v360 ? t('Back to the walk', '旅に戻る') : t('View 360°', '360°で見る')}</button>
            <a href={`/shop#p=${encodeURIComponent(cur.id)}`}>{t('Buy →', '購入画面へ →')}</a>
          </div>
          {v360 && <small>{t('Drag to turn the look', 'ドラッグで回す')}</small>}
        </aside>
      )}

      {!started && (
        <div className="jr-start">
          <em>{t('Gallery Crypto — Drop 01', 'Gallery Crypto — Drop 01')}</em>
          <h1>{t('The walk', '旅するショールーム')}</h1>
          <p>{t('Walk from the store through a future city and a misty forest to a summit at dawn. Every look stands on the way — stop, turn it 360°, and buy.', '店から未来の街、霧の森を抜けて、夜明けの山頂へ。道の途中に一着ずつ立っています。立ち止まって360°で見て、そのまま購入へ。')}</p>
          <button onClick={() => { setStarted(true); sfx('select'); }}>{t('Start', '旅を始める')}</button>
          <small>{t('Samples are fictional. Sales open in 2027.', '見本は架空の商品です。販売は2027年から。')}</small>
        </div>
      )}

      {started && st.end && !v360 && (
        <div className="jr-end">
          <em>{t('Dawn', '夜明け')}</em>
          <b>{t('End of the walk', '旅はここまで')}</b>
          <div>
            <a href="/shop">{t('Go to the shop', 'ショップへ')}</a>
            <button onClick={() => api.current?.restart()}>{t('Walk again', 'もう一度歩く')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
