'use client';

// オフライン検証：保存しておいた公開鍵の台帳だけで、QR・NFC の小さな証明や証明ファイルを照合する
import { useEffect, useMemo, useState } from 'react';
import { checkOk, unpackCompact, verifyCompact, verifyKeyring, verifyLog, type Anchor, type SignedEntry, type SignedKey } from '@/lib/gcpp';
import { useLang } from './Lang';

type Ring = { issuer: string; chain: string; keyring: SignedKey[]; demoKeyring: SignedKey[]; anchors: Anchor[]; fetched_at: string };
type Bundle = { issuer: string; cert: string; demo?: boolean; item?: { band?: string; title?: string } | null; entries: SignedEntry[]; keyring: SignedKey[] };

const RING_KEY = 'gc-keyring-cache';
const PIN_KEY = 'gc-genesis';
const dayFmt = (s: string, lang: 'en' | 'ja') => new Date(s).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }) + (lang === 'ja' ? '（日本時間）' : ' JST');
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

export default function VerifyApp() {
  const { t, lang } = useLang();
  const day = (x: string) => dayFmt(x, lang);
  const [ring, setRing] = useState<Ring | null>(null);
  const [net, setNet] = useState<'online' | 'offline' | 'checking'>('checking');
  const [ready, setReady] = useState(false);
  const [hash, setHash] = useState('');
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [fileErr, setFileErr] = useState('');
  const [live, setLive] = useState<'match' | 'nomatch' | null>(null);

  useEffect(() => {
    const cached = store.get(RING_KEY);
    if (cached) try { setRing(JSON.parse(cached)); } catch {}
    setHash(location.hash.slice(1));
    const onHash = () => setHash(location.hash.slice(1));
    window.addEventListener('hashchange', onHash);
    fetch('/api/keyring', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Ring) => {
        setRing(j);
        store.set(RING_KEY, JSON.stringify(j));
        setNet(navigator.onLine ? 'online' : 'offline');
      })
      .catch(() => setNet('offline'));
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(async () => {
        const reg = await navigator.serviceWorker.ready;
        const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith(location.origin + '/_next/static/'));
        reg.active?.postMessage({ cache: [...urls, location.origin + '/verify'] });
        setReady(true);
      }).catch(() => {});
    }
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const real = useMemo(() => (ring ? verifyKeyring(ring.keyring, ring.issuer) : null), [ring]);
  const demo = useMemo(() => (ring ? verifyKeyring(ring.demoKeyring, ring.issuer) : null), [ring]);
  const [pin, setPin] = useState<string | null>(null);
  useEffect(() => {
    if (!real?.genesis || !real.ok) return;
    const prev = store.get(PIN_KEY);
    if (!prev) store.set(PIN_KEY, real.genesis);
    setPin(prev || real.genesis);
  }, [real]);
  const pinBroken = Boolean(pin && real?.genesis && pin !== real.genesis);

  // QR・NFC の小さな証明
  const compact = useMemo(() => unpackCompact(hash), [hash]);
  const cres = useMemo(() => {
    if (!compact || !ring) return null;
    const isDemo = compact.serial === 0 || (compact.serial > 9000 && compact.serial <= 9006);
    const r = isDemo ? demo : real;
    if (!r) return null;
    return { ...verifyCompact(compact, ring.issuer, r.keys), ringOk: r.ok };
  }, [compact, ring, real, demo]);
  const cert = compact ? (compact.serial === 0 ? 'GC-DEMO' : compact.serial > 9000 && compact.serial <= 9006 ? `GC-DEMO-${compact.serial - 9000}` : 'GC-' + String(compact.serial).padStart(4, '0')) : '';
  const cOk = Boolean(cres && cres.sigOk && cres.cosigOk && cres.ringOk && !pinBroken);

  // つながっていれば、サイト上の記録とも照合する（任意）
  useEffect(() => {
    setLive(null);
    if (!compact || net !== 'online') return;
    fetch(`/api/passport/${cert}`)
      .then((r) => r.json())
      .then((b: Bundle) => setLive(b.entries?.some((e) => e.hash === compact.hash) ? 'match' : 'nomatch'))
      .catch(() => {});
  }, [compact, cert, net]);

  // 証明ファイル（Download proof で保存したもの）
  const fres = useMemo(() => {
    if (!bundle) return null;
    const kr = verifyKeyring(bundle.keyring || [], bundle.issuer);
    const lg = verifyLog(bundle.entries || [], bundle.issuer, kr.keys);
    const issuerKnown = ring ? ring.issuer === bundle.issuer : null;
    const rootKnown = bundle.demo ? demo?.genesis === kr.genesis : pin ? pin === kr.genesis : null;
    return { kr, lg, issuerKnown, rootKnown, ok: kr.ok && lg.ok && issuerKnown !== false && rootKnown !== false };
  }, [bundle, ring, pin, demo]);

  const onFile = async (f: File | undefined) => {
    setFileErr('');
    setBundle(null);
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!Array.isArray(j.entries) || !j.issuer) throw new Error();
      setBundle(j);
    } catch {
      setFileErr(t('This is not a Gallery Crypto proof file.', 'これは Gallery Crypto の証明ファイルではありません。'));
    }
  };

  return (
    <div className="vf">
      <p className="vf-status">
        <span className={`vf-dot ${net}`} /> {net === 'checking' ? t('Checking connection…', '接続を確認中…') : net === 'online' ? t('Online', 'オンライン') : t('Offline', 'オフライン')} ·{' '}
        {ring ? t(`Keys saved on this device (${day(ring.fetched_at)})`, `この端末に鍵を保存済み（${day(ring.fetched_at)}）`) : t('No keys saved yet — open this page online once', 'まだ鍵が保存されていません — 一度オンラインでこのページを開いてください')} · {ready ? t('Works offline ✓', 'オフラインで使えます ✓') : t('Preparing offline mode…', 'オフライン用に準備中…')}
      </p>
      {pinBroken && <p className="mo-err">{t('Warning: the founder keyring changed since this device first saw it. Do not trust new records until Gallery Crypto confirms.', '注意：創業者の鍵の台帳が、この端末が最初に見たときから変わっています。Gallery Crypto が確認するまで、新しい記録は信用しないでください。')}</p>}

      {compact && (
        <section className={`vf-card ${cres ? (cOk ? 'ok' : 'ng') : ''}`}>
          <div className="pp-stamp">{!cres ? t('Need keys', '鍵が必要') : cOk ? t('Authentic', '本物') : t('Not verified', '確認できず')}</div>
          <h2>{cert} · {t('record', '記録')} #{compact.seq}</h2>
          <p>{t('Signed', '署名')} {day(new Date(compact.at * 1000).toISOString())}</p>
          {cres && (
            <ul className="vf-list">
              <li>{t('Server key signature', 'サーバーの鍵の署名')} {cres.sigOk ? '✓' : '✕'}</li>
              <li>{t('Founder device signature', '創業者の端末の署名')} {cres.cosigOk ? `✓ (${cres.signer?.label || t('key', '鍵')})` : t('✕ — no active founder key signed this', '✕ — 有効な創業者の鍵の署名がありません')}</li>
              <li>{t('Founder keyring', '創業者の鍵の台帳')} {cres.ringOk ? '✓' : '✕'}</li>
              {net === 'online' && <li>{t('Live record on gallerycrypto', 'サイト上の最新の記録')} {live === 'match' ? t('✓ matches', '✓ 一致') : live === 'nomatch' ? t('✕ not found', '✕ 見つかりません') : '…'}</li>}
            </ul>
          )}
          <p className="pp-mono">{t('hash', 'ハッシュ')} {compact.hash}</p>
          {!ring && <p>{t('Open this page once with internet so the public keys are saved. After that it works with no connection.', '一度インターネットにつないでこのページを開くと、公開鍵が保存されます。その後は通信なしで使えます。')}</p>}
          {net === 'online' && <a className="mo-btn small" href={`/passport/${cert}`}>{t('Open the full passport', 'パスポート全体を開く')}</a>}
        </section>
      )}

      {!compact && (
        <section className="vf-card">
          <h2>{t('Scan a tag', 'タグを読み取る')}</h2>
          <p>{t('Scan the QR code or tap the NFC tag on a Gallery Crypto piece with your phone camera. It opens here and is checked on this device — even with no signal at a fair or a warehouse.', 'Gallery Crypto の作品のQRコードをスマホのカメラで読み取るか、NFCタグをタップしてください。このページで開き、この端末の中で確かめます。電波のない展示会や倉庫でも使えます。')}</p>
          <p>{t('Tip: add this page to your home screen. Once it has been opened online, it keeps the public keys and works offline.', 'ヒント：このページをホーム画面に追加してください。一度オンラインで開けば公開鍵を保存し、オフラインでも使えます。')}</p>
        </section>
      )}

      <section className="vf-card">
        <h2>{t('Check a proof file', '証明ファイルを確かめる')}</h2>
        <p>{t('Choose a proof you downloaded from a passport page. Every record and both signatures are checked here, without the internet.', 'パスポートのページからダウンロードした証明を選んでください。すべての記録と2つの署名を、インターネットなしでここで確かめます。')}</p>
        <label className="mo-btn small">
          {t('Choose proof file', '証明ファイルを選ぶ')}
          <input type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {fileErr && <p className="mo-err">{fileErr}</p>}
        {bundle && fres && (
          <div className={`vf-file ${fres.ok ? 'ok' : 'ng'}`}>
            <div className="pp-stamp">{fres.ok ? t('Authentic', '本物') : t('Broken', '壊れています')}</div>
            <p>
              <b>{bundle.cert}</b> {bundle.item?.band ? `· ${bundle.item.band}` : ''} — {t(`${bundle.entries.length} records`, `${bundle.entries.length}件の記録`)}
            </p>
            <ul className="vf-list">
              <li>{t('Founder keyring', '創業者の鍵の台帳')} {fres.kr.ok ? '✓' : '✕'}</li>
              <li>{t('Records (contents, both signatures, chain)', '記録（内容・2つの署名・つながり）')} {fres.lg.ok ? '✓' : `✕ #${fres.lg.checks.findIndex((c) => !checkOk(c)) + 1}`}</li>
              <li>{t('Server key matches the one saved on this device', 'サーバーの鍵がこの端末に保存したものと一致')} {fres.issuerKnown === null ? t('— (no keys saved)', '—（鍵の保存なし）') : fres.issuerKnown ? '✓' : '✕'}</li>
              <li>{t('Keyring root matches the one saved on this device', '鍵の台帳の起点がこの端末に保存したものと一致')} {fres.rootKnown === null ? t('— (none saved)', '—（保存なし）') : fres.rootKnown ? '✓' : '✕'}</li>
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
