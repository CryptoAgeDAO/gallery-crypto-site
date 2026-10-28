'use client';

// オフライン検証：保存しておいた公開鍵の台帳だけで、QR・NFC の小さな証明や証明ファイルを照合する
import { useEffect, useMemo, useState } from 'react';
import { checkOk, unpackCompact, verifyCompact, verifyKeyring, verifyLog, type Anchor, type SignedEntry, type SignedKey } from '@/lib/gcpp';

type Ring = { issuer: string; chain: string; keyring: SignedKey[]; demoKeyring: SignedKey[]; anchors: Anchor[]; fetched_at: string };
type Bundle = { issuer: string; cert: string; demo?: boolean; item?: { band?: string; title?: string } | null; entries: SignedEntry[]; keyring: SignedKey[] };

const RING_KEY = 'gc-keyring-cache';
const PIN_KEY = 'gc-genesis';
const day = (s: string) => new Date(s).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }) + ' JST';
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

export default function VerifyApp() {
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
      setFileErr('This is not a Gallery Crypto proof file.');
    }
  };

  return (
    <div className="vf">
      <p className="vf-status">
        <span className={`vf-dot ${net}`} /> {net === 'checking' ? 'Checking connection…' : net === 'online' ? 'Online' : 'Offline'} ·{' '}
        {ring ? `Keys saved on this device (${day(ring.fetched_at)})` : 'No keys saved yet — open this page online once'} · {ready ? 'Works offline ✓' : 'Preparing offline mode…'}
      </p>
      {pinBroken && <p className="mo-err">Warning: the founder keyring changed since this device first saw it. Do not trust new records until Gallery Crypto confirms.</p>}

      {compact && (
        <section className={`vf-card ${cres ? (cOk ? 'ok' : 'ng') : ''}`}>
          <div className="pp-stamp">{!cres ? 'Need keys' : cOk ? 'Authentic' : 'Not verified'}</div>
          <h2>{cert} · record #{compact.seq}</h2>
          <p>Signed {day(new Date(compact.at * 1000).toISOString())}</p>
          {cres && (
            <ul className="vf-list">
              <li>Server key signature {cres.sigOk ? '✓' : '✕'}</li>
              <li>Founder device signature {cres.cosigOk ? `✓ (${cres.signer?.label || 'key'})` : '✕ — no active founder key signed this'}</li>
              <li>Founder keyring {cres.ringOk ? '✓' : '✕'}</li>
              {net === 'online' && <li>Live record on gallerycrypto {live === 'match' ? '✓ matches' : live === 'nomatch' ? '✕ not found' : '…'}</li>}
            </ul>
          )}
          <p className="pp-mono">hash {compact.hash}</p>
          {!ring && <p>Open this page once with internet so the public keys are saved. After that it works with no connection.</p>}
          {net === 'online' && <a className="mo-btn small" href={`/passport/${cert}`}>Open the full passport</a>}
        </section>
      )}

      {!compact && (
        <section className="vf-card">
          <h2>Scan a tag</h2>
          <p>Scan the QR code or tap the NFC tag on a Gallery Crypto piece with your phone camera. It opens here and is checked on this device — even with no signal at a fair or a warehouse.</p>
          <p>Tip: add this page to your home screen. Once it has been opened online, it keeps the public keys and works offline.</p>
        </section>
      )}

      <section className="vf-card">
        <h2>Check a proof file</h2>
        <p>Choose a proof you downloaded from a passport page. Every record and both signatures are checked here, without the internet.</p>
        <label className="mo-btn small">
          Choose proof file
          <input type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {fileErr && <p className="mo-err">{fileErr}</p>}
        {bundle && fres && (
          <div className={`vf-file ${fres.ok ? 'ok' : 'ng'}`}>
            <div className="pp-stamp">{fres.ok ? 'Authentic' : 'Broken'}</div>
            <p>
              <b>{bundle.cert}</b> {bundle.item?.band ? `· ${bundle.item.band}` : ''} — {bundle.entries.length} records
            </p>
            <ul className="vf-list">
              <li>Founder keyring {fres.kr.ok ? '✓' : '✕'}</li>
              <li>Records (contents, both signatures, chain) {fres.lg.ok ? '✓' : `✕ at #${fres.lg.checks.findIndex((c) => !checkOk(c)) + 1}`}</li>
              <li>Server key matches the one saved on this device {fres.issuerKnown === null ? '— (no keys saved)' : fres.issuerKnown ? '✓' : '✕'}</li>
              <li>Keyring root matches the one saved on this device {fres.rootKnown === null ? '— (none saved)' : fres.rootKnown ? '✓' : '✕'}</li>
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
