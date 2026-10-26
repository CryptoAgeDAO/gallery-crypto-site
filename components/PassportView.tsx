'use client';

// 来歴パスポートの表示と、ブラウザだけで行う検証（サーバーもブロックチェーンも信用しなくてよい）
import { useEffect, useMemo, useState } from 'react';
import { DPP_SECTIONS, eventLabel, type Composition, type PhotoHash } from '@/lib/dpp';
import { explorerAddr, explorerTx, merkleRoot, rpcFor, verifyLog, type Anchor, type Check, type SignedEntry } from '@/lib/gcpp';
import type { PassportBundle } from '@/lib/passportPublic';

const short = (h: string, n = 10) => (h.length > n * 2 ? `${h.slice(0, n)}…${h.slice(-6)}` : h);
const day = (s: string) => new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo' });

function Mark({ ok }: { ok: boolean | null }) {
  return <span className={`pp-mark ${ok === null ? 'wait' : ok ? 'ok' : 'ng'}`}>{ok === null ? '…' : ok ? '✓' : '✕'}</span>;
}

function useVerify(entries: SignedEntry[], issuer: string) {
  const [shown, setShown] = useState(0);
  const res = useMemo(() => verifyLog(entries, issuer), [entries, issuer]);
  useEffect(() => {
    setShown(0);
    let i = 0;
    const t = setInterval(() => {
      i++;
      setShown(i);
      if (i >= entries.length) clearInterval(t);
    }, 260);
    return () => clearInterval(t);
  }, [res, entries.length]);
  return { res, shown, done: shown >= entries.length };
}

function Checks({ checks, shown, entries }: { checks: Check[]; shown: number; entries: SignedEntry[] }) {
  return (
    <ol className="pp-checks">
      {checks.map((c, i) => {
        const vis = i < shown;
        const e = entries[i].entry;
        return (
          <li key={i} className={vis ? (c.hashOk && c.sigOk && c.chainOk && c.issuerOk ? 'ok' : 'ng') : ''}>
            <span className="pp-seq">#{String(e.seq).padStart(2, '0')}</span>
            <span className="pp-what">{e.kind === 'seal' ? `Record sealed v${(e.data as { version?: number }).version ?? 1}` : eventLabel(String((e.data as { type?: string }).type))}</span>
            <span className="pp-tests">
              <span>Contents <Mark ok={vis ? c.hashOk : null} /></span>
              <span>Signature <Mark ok={vis ? c.sigOk && c.issuerOk : null} /></span>
              <span>Chain link <Mark ok={vis ? c.chainOk : null} /></span>
            </span>
            {vis && !c.hashOk && <span className="pp-why">The contents no longer match the hash that was signed — someone changed this record.</span>}
            {vis && c.hashOk && !c.sigOk && <span className="pp-why">The signature does not belong to Gallery Crypto&apos;s published key.</span>}
            {vis && c.hashOk && c.sigOk && !c.chainOk && <span className="pp-why">This record does not link to the one before it — something was removed or inserted.</span>}
          </li>
        );
      })}
    </ol>
  );
}

function AnchorCheck({ a, hashes }: { a: Anchor; hashes: string[] }) {
  const [st, setSt] = useState<'idle' | 'busy' | 'ok' | 'ng'>('idle');
  const [msg, setMsg] = useState('');
  const rootOk = merkleRoot(a.leaves) === a.root;
  const inside = hashes.filter((h) => a.leaves.includes(h)).length;
  const run = async () => {
    setSt('busy');
    try {
      const r = await fetch(rpcFor(a.chain), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [a.tx, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }] }) });
      const j = await r.json();
      const logs: string[] = j?.result?.meta?.logMessages || [];
      const found = logs.some((l) => l.includes(a.root));
      const when = j?.result?.blockTime ? new Date(j.result.blockTime * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '';
      setSt(found ? 'ok' : 'ng');
      setMsg(found ? `Found on ${a.chain === 'solana-devnet' ? 'Solana devnet' : 'Solana'}${when ? ` · block time ${when}` : ''}. Nobody — not even Gallery Crypto — can change it now.` : 'The transaction did not contain this root.');
    } catch {
      setSt('ng');
      setMsg('Could not reach Solana right now. Try again, or open the explorer link.');
    }
  };
  return (
    <div className="pp-anchor">
      <p>
        <b>Anchor #{a.id}</b> · {day(a.created_at)} · {a.leaves.length} records rolled into one root
      </p>
      <p className="pp-mono">root {short(a.root, 14)}</p>
      <p>
        Root recomputed in your browser <Mark ok={rootOk} /> · This passport&apos;s records inside <Mark ok={inside > 0} /> ({inside})
      </p>
      <div className="pp-row">
        <button className="mo-btn small" onClick={run} disabled={st === 'busy'}>{st === 'busy' ? 'Asking Solana…' : 'Check on Solana'}</button>
        <a className="mo-btn small ghost" href={explorerTx(a.tx, a.chain)} target="_blank" rel="noopener noreferrer">Explorer ↗</a>
      </div>
      {msg && <p className={st === 'ok' ? 'pp-good' : 'pp-bad'}>{msg}</p>}
    </div>
  );
}

function Value({ v }: { v: unknown }) {
  if (Array.isArray(v)) {
    if (!v.length) return <>—</>;
    if ((v[0] as PhotoHash).sha256 !== undefined)
      return (
        <ul className="pp-hashes">
          {(v as PhotoHash[]).map((h, i) => (
            <li key={i}><b>{h.label || `Area ${i + 1}`}</b> <span className="pp-mono">{short(h.sha256, 12)}</span></li>
          ))}
        </ul>
      );
    return <>{(v as Composition).map((c) => `${c.pct}% ${c.fiber}`).join(' · ')}</>;
  }
  const s = String(v ?? '');
  return <>{s === '' ? '—' : s}</>;
}

export default function PassportView({ b, qr, url }: { b: PassportBundle; qr?: string; url?: string }) {
  const { res, shown, done } = useVerify(b.entries, b.issuer);
  const seal = [...b.entries].reverse().find((e) => e.entry.kind === 'seal');
  const dpp = (seal?.entry.data as { dpp?: Record<string, Record<string, unknown>> } | undefined)?.dpp;
  const [domainKey, setDomainKey] = useState<boolean | null>(null);
  useEffect(() => {
    fetch('/.well-known/gc-issuer.json').then((r) => r.json()).then((j) => setDomainKey(j?.key?.value === b.issuer)).catch(() => setDomainKey(false));
  }, [b.issuer]);

  // 改ざんの実験：手元のコピーだけを書き換えて、もう一度検証する
  const [fake, setFake] = useState(false);
  const [fakeDealer, setFakeDealer] = useState('');
  const sealIdx = b.entries.findIndex((e) => e === seal);
  const tampered = useMemo(() => {
    if (!fake || sealIdx < 0) return null;
    const copy: SignedEntry[] = JSON.parse(JSON.stringify(b.entries));
    const d = (copy[sealIdx].entry.data as { dpp: Record<string, Record<string, unknown>> }).dpp;
    d.provenance.dealer = fakeDealer;
    return copy;
  }, [fake, fakeDealer, b.entries, sealIdx]);
  const tv = useVerify(tampered || b.entries, b.issuer);

  const download = () => {
    const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${b.cert}-proof.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const events = b.entries.filter((e) => e.entry.kind === 'event');
  const hashes = b.entries.map((e) => e.hash);

  return (
    <div className="pp">
      <section className={`pp-verdict ${done ? (res.ok ? 'ok' : 'ng') : ''}`} aria-live="polite">
        <div className="pp-stamp">{!done ? 'Checking…' : res.ok ? 'Authentic record' : 'Record broken'}</div>
        <div>
          <p className="pp-cert">{b.cert}{b.demo ? ' · demo' : ''}</p>
          <p>
            {b.entries.length} signed records, checked here in your browser — not by our server. Key: <span className="pp-mono">{short(b.issuer, 8)}</span>{' '}
            · published at our domain <Mark ok={domainKey} />
          </p>
        </div>
        {qr && <div className="pp-qr" aria-label="QR code for this passport" dangerouslySetInnerHTML={{ __html: qr }} />}
      </section>

      <Checks checks={res.checks} shown={shown} entries={b.entries} />

      <div className="pp-grid">
        <section className="pp-box">
          <h2>Product passport</h2>
          {seal ? <p className="pp-sub">Sealed {day(seal.entry.at)} · schema {(seal.entry.data as { schema?: string }).schema} · aligned with the EU Digital Product Passport (textiles)</p> : <p>No sealed record yet.</p>}
          {dpp &&
            DPP_SECTIONS.map((s) => (
              <div key={s.key} className="pp-sec">
                <h3>{s.title} <small>{s.espr}</small></h3>
                <dl>
                  {s.fields.map((f) => {
                    const v = dpp[s.key]?.[f.key];
                    if (v === '' || v == null || (Array.isArray(v) && !v.length)) return null;
                    return (
                      <div key={f.key}>
                        <dt>{f.label}</dt>
                        <dd><Value v={v} /></dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
        </section>

        <aside className="pp-side">
          <section className="pp-box">
            <h2>Life of the piece</h2>
            <ol className="pp-time">
              {events.map((e) => {
                const d = e.entry.data as { type: string; actor?: string; place?: string; note?: string; date?: string };
                return (
                  <li key={e.hash}>
                    <b>{eventLabel(d.type)}</b>
                    <span>{d.date || day(e.entry.at)}{d.place ? ` · ${d.place}` : ''}</span>
                    {d.actor && <span>{d.actor}</span>}
                    {d.note && <p>{d.note}</p>}
                  </li>
                );
              })}
              {!events.length && <li>No events recorded yet.</li>}
            </ol>
          </section>

          <section className="pp-box">
            <h2>Blockchain anchor</h2>
            {b.anchors.length ? (
              b.anchors.map((a) => <AnchorCheck key={a.id} a={a} hashes={hashes} />)
            ) : (
              <p>{b.demo ? 'Real passports are rolled into one hash and written to Solana. This demo is signed but not anchored.' : 'Waiting for the next anchor to Solana. The signatures above already prove the record on their own.'}</p>
            )}
            <p className="pp-fine">
              The chain is optional: it only adds a public timestamp. Issuer address{' '}
              <a href={explorerAddr(b.issuer, b.chain)} target="_blank" rel="noopener noreferrer" className="pp-mono">{short(b.issuer, 6)}</a>
            </p>
          </section>

          <section className="pp-box">
            <h2>Try to fake it</h2>
            {sealIdx < 0 ? (
              <p>Available once a record is sealed.</p>
            ) : !fake ? (
              <>
                <p>Change the dealer credit in your own copy and watch the proof break.</p>
                <button className="mo-btn small" onClick={() => { setFakeDealer('Somebody Else'); setFake(true); }}>Edit my copy</button>
              </>
            ) : (
              <>
                <label className="pp-label">Inherited from<input value={fakeDealer} onChange={(e) => setFakeDealer(e.target.value)} /></label>
                <p className={tv.done ? (tv.res.ok ? 'pp-good' : 'pp-bad') : ''}>
                  {!tv.done ? 'Checking…' : tv.res.ok ? 'Matches the original — the proof holds.' : `Broken at record #${tv.res.checks.findIndex((c) => !(c.hashOk && c.sigOk && c.chainOk)) + 1}. A fake copy can never pass, because only Gallery Crypto's private key can sign a new hash.`}
                </p>
                <button className="mo-btn small ghost" onClick={() => setFake(false)}>Put it back</button>
              </>
            )}
          </section>

          <section className="pp-box">
            <h2>Keep the proof</h2>
            <p>Download the full proof. It verifies with the public key alone — even if this website disappears.</p>
            <div className="pp-row">
              <button className="mo-btn small" onClick={download}>Download proof</button>
              <a className="mo-btn small ghost" href={`/api/passport/${b.cert}`} target="_blank" rel="noopener noreferrer">JSON</a>
            </div>
            {url && <p className="pp-fine">NFC tap or QR opens <span className="pp-mono">{url.replace(/^https?:\/\//, '')}</span></p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
