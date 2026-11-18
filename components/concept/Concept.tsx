'use client';
// コンセプトページ「On Record」：Gallery Crypto の考え方を、一着の服で見せる。
// 光の粒でできた服が、スクロールで「実物 → タグ → 記録（ハッシュの鎖）→ 来歴」と姿を変える。
// 見本の服・記録・日付はすべて架空。ハッシュはこの端末で実際に計算した SHA-256（見本の文から）。
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { LangToggle, useLang } from '../Lang';
import { cutout } from '../shop/RailShop';
import { PROJECTS } from '@/lib/hub';
import type { SceneApi } from './RecordScene';

const RecordScene = dynamic(() => import('./RecordScene'), { ssr: false });
const PIECE = PROJECTS.find((p) => p.id === 'v3') || PROJECTS[0];

const EVENTS: [string, string, string][] = [
  ['2026-09-02', 'Bought in, Tokyo', '東京で買い付け'],
  ['2026-09-04', 'Measured · photographed', '採寸・撮影'],
  ['2026-09-04', 'Record created', '記録を作成'],
  ['2026-09-05', 'NFC tag sewn in', 'NFCタグを縫い付け'],
  ['2027-01-10', 'Listed', '販売を開始'],
  ['2027-02-14', 'Sold · owner 01', '販売・オーナー01'],
  ['2028-06-01', 'Resold · owner 02', '再販売・オーナー02'],
];

async function sha(s: string) {
  try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''); }
  catch { return ''; }
}

export default function Concept() {
  const { t, lang } = useLang();
  const progress = useRef(0);
  const api = useRef<SceneApi | null>(null);
  const [sec, setSec] = useState(0);
  const [hashes, setHashes] = useState<string[]>([]);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const src = useMemo(() => cutout(PIECE.id), []);

  // 記録の鎖：前のハッシュをつないで次を計算（本物の SHA-256）
  useEffect(() => {
    (async () => {
      const out: string[] = []; let prev = '0'.repeat(64);
      for (const [d, en] of EVENTS) { const h = await sha(`${prev}|${PIECE.code}|${d}|${en}|sample`); out.push(h); prev = h; }
      setHashes(out);
    })();
  }, []);

  // スクロール → 進み具合（0〜5）。ラベルは毎フレーム3Dの位置に合わせる
  useEffect(() => {
    let raf = 0, cur = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      // 章ごとの高さが違っても、画面の中央にある章を基準に進み具合を出す
      const secs = document.querySelectorAll<HTMLElement>('.cx-sec'), mid = scrollY + innerHeight / 2;
      let target = 0;
      secs.forEach((el, k) => { const top = el.offsetTop, h = el.offsetHeight; if (mid >= top && mid < top + h) target = k + (mid - (top + h / 2)) / h; else if (k === secs.length - 1 && mid >= top + h) target = k; });
      target = Math.max(0, target);
      cur += (target - cur) * 0.09; progress.current = cur;
      const s = Math.round(target); setSec((o) => (o === s ? o : s));
      const bl = api.current?.blocks();
      if (bl) bl.forEach((b, k) => { const e = labels.current[k]; if (e) { e.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px)`; e.style.opacity = String(Math.max(0, (b.v - 0.6) / 0.4)); } });
    };
    loop(); return () => cancelAnimationFrame(raf);
  }, []);

  const NAV = [t('Origin', '始まり'), t('The piece', '実物'), t('The tag', 'タグ'), t('The record', '記録'), t('The history', '来歴'), t('Find yours', '探す')];
  const go = (k: number) => { const el = document.querySelectorAll<HTMLElement>('.cx-sec')[k]; if (el) scrollTo({ top: el.offsetTop + el.offsetHeight / 2 - innerHeight / 2, behavior: 'smooth' }); };
  const short = (h: string) => (h ? `${h.slice(0, 6)}…${h.slice(-4)}` : '········');

  return (
    <div className="cx" translate="no">
      <RecordScene src={src} progress={progress} apiRef={api} />
      <div className="cx-grain" aria-hidden />
      {/* 記録のブロックに付くラベル */}
      <div className="cx-labels" aria-hidden>
        {EVENTS.map(([d, en, ja], k) => (
          <div key={k} className={`cx-lb ${k === 0 ? 'first' : ''}`} ref={(e) => { labels.current[k] = e; }}>
            <em>#{String(k).padStart(3, '0')}</em><b>{lang === 'ja' ? ja : en}</b><span>{d}</span><code>{short(hashes[k])}</code>
          </div>
        ))}
      </div>

      <header className="cx-top">
        <a className="cx-logo notranslate" href="/">GALLERY CRYPTO</a>
        <nav><a href="/shop">{t('Shop', 'ショップ')}</a><a href="/verify">{t('Verify', '検証')}</a><LangToggle /></nav>
      </header>
      <nav className="cx-prog" aria-label={t('Chapters', '章')}>
        {NAV.map((n, k) => <button key={n} className={k === sec ? 'on' : ''} onClick={() => go(k)}><i />{String(k).padStart(2, '0')}<span>{n}</span></button>)}
      </nav>

      <main className="cx-main">
        <section className="cx-sec hero">
          <p className="cx-kick">{t('Gallery Crypto — Tokyo — Concept', 'Gallery Crypto — 東京 — コンセプト')}</p>
          <h1>{lang === 'ja' ? <>一点ものに、<br />消えない記録を。</> : <>One of one.<br />On record.</>}</h1>
          <p className="cx-lead">{t('Every piece we sell is a real object with a record that travels with it — who made it, where it has been, who has owned it.', '私たちが扱うのは、記録と一緒に旅をする本物の一着。どこで生まれ、どこを巡り、誰の手にあったのか。')}</p>
          <button className="cx-cue" onClick={() => go(1)}>{t('Scroll', 'スクロール')}<i /></button>
        </section>

        <section className="cx-sec">
          <div className="cx-card">
            <p className="cx-n">01 — {t('The piece', '実物')}</p>
            <h2>{t('A real thing, measured to the centimetre.', '本物を、1cm単位で確かめる。')}</h2>
            <p>{t('Each piece is checked, measured and photographed before it is listed. Condition notes are written plainly, flaws included.', '一着ずつ状態を確かめ、採寸し、撮影してから並べます。ほつれや色あせも、そのまま書きます。')}</p>
            <dl>{PIECE.facts.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
            <small>{PIECE.code} · {PIECE.title} · {t('sample piece', '見本の一着')}</small>
          </div>
        </section>

        <section className="cx-sec">
          <div className="cx-card">
            <p className="cx-n">02 — {t('The tag', 'タグ')}</p>
            <h2>{t('Tap the label. The piece answers.', 'タグに触れると、服が答える。')}</h2>
            <p>{t('A small NFC tag is sewn inside. Hold a phone to it and the page for that exact piece opens — its photos, measurements and record.', '服の内側に小さなNFCタグを縫い付けます。スマホをかざすと、その一着だけのページが開きます。写真も、寸法も、記録も。')}</p>
          </div>
        </section>

        <section className="cx-sec">
          <div className="cx-card">
            <p className="cx-n">03 — {t('The record', '記録')}</p>
            <h2>{t('Only fingerprints go on chain.', '記録に残すのは、指紋だけ。')}</h2>
            <p>{t('Each event is turned into a hash — a fingerprint that changes if a single letter changes — and linked to the one before. Names, prices and addresses never leave our records.', '出来事ごとに、1文字でも変われば別物になる「ハッシュ（指紋）」をつくり、前の記録とつなぎます。名前・価格・住所は公開の記録に載せません。')}</p>
            <code className="cx-hash">{hashes[2] || '…'}</code>
            <small>{t('Real SHA-256, computed on this device from sample text.', '見本の文から、この端末で実際に計算した SHA-256 です。')}</small>
          </div>
        </section>

        <section className="cx-sec">
          <div className="cx-card">
            <p className="cx-n">04 — {t('The history', '来歴')}</p>
            <h2>{t('The story stays with the piece.', '持ち主が変わっても、物語は残る。')}</h2>
            <ol className="cx-tl">{EVENTS.map(([d, en, ja], k) => <li key={k}><span>{d}</span><b>{lang === 'ja' ? ja : en}</b><code>{short(hashes[k])}</code></li>)}</ol>
            <small>{t('Sample history — dates after today are illustrations.', '見本の来歴です。今日より先の日付はイメージです。')}</small>
          </div>
        </section>

        <section className="cx-sec end">
          <p className="cx-n">05 — {t('Find yours', '探す')}</p>
          <h2>{t('Find the piece that will carry your chapter.', 'あなたの章が書き足される一着を。')}</h2>
          <div className="cx-ctas">
            <a href="/shop">{t('Shop the pieces', 'ショップを見る')}</a>
            <a className="ghost" href="/verify">{t('Verify a record', '記録を確かめる')}</a>
            <a className="ghost" href="/shop/store">{t('Walk the store', '売り場を歩く')}</a>
          </div>
          <p className="cx-fine">{t('Gallery Crypto is in preparation. Sales open in 2027 (card / Apple Pay). All pieces, owners and dates on this page are samples.', 'Gallery Crypto は準備中です。販売は2027年から（カード／Apple Pay）。このページの服・持ち主・日付はすべて見本です。')}</p>
        </section>
      </main>
    </div>
  );
}
