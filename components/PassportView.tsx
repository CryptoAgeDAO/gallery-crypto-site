'use client';

// 来歴パスポートの表示と、ブラウザだけで行う検証（サーバーもブロックチェーンも信用しなくてよい）
import { useEffect, useMemo, useState } from 'react';
import { DPP_SECTIONS, eventLabel, type Composition, type PhotoHash } from '@/lib/dpp';
import { checkOk, explorerAddr, explorerTx, keyId, merkleRoot, rpcFor, verifyKeyring, verifyLog, type Anchor, type Check, type KeyState, type SignedEntry } from '@/lib/gcpp';
import type { PassportBundle } from '@/lib/passportPublic';
import GcIcon, { type IconName } from './GcIcon';
import { useLang } from './Lang';
import { dl } from '@/lib/dppJa';

const short = (h: string, n = 10) => (h.length > n * 2 ? `${h.slice(0, n)}…${h.slice(-6)}` : h);
const day = (s: string, locale = 'en-US') => new Date(s).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo' });

function Mark({ ok }: { ok: boolean | null }) {
  return <span className={`pp-mark ${ok === null ? 'wait' : ok ? 'ok' : 'ng'}`}>{ok === null ? '…' : ok ? '✓' : '✕'}</span>;
}

function useVerify(entries: SignedEntry[], issuer: string, keys: Map<string, KeyState>) {
  const [shown, setShown] = useState(0);
  const res = useMemo(() => verifyLog(entries, issuer, keys), [entries, issuer, keys]);
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
  const { t, lang } = useLang();
  return (
    <ol className="pp-checks">
      {checks.map((c, i) => {
        const vis = i < shown;
        const e = entries[i].entry;
        return (
          <li key={i} className={vis ? (checkOk(c) ? 'ok' : 'ng') : ''}>
            <span className="pp-seq">#{String(e.seq).padStart(2, '0')}</span>
            <span className="pp-what">{e.kind === 'seal' ? t(`Record sealed v${(e.data as { version?: number }).version ?? 1}`, `記録の確定 v${(e.data as { version?: number }).version ?? 1}`) : eventLabel(String((e.data as { type?: string }).type), lang)}</span>
            <span className="pp-tests">
              <span>{t('Contents', '内容')} <Mark ok={vis ? c.hashOk : null} /></span>
              <span>{t('Server key', 'サーバーの鍵')} <Mark ok={vis ? c.sigOk && c.issuerOk : null} /></span>
              <span>{t('Founder key', '創業者の鍵')} <Mark ok={vis ? c.cosigOk : null} /></span>
              <span>{t('Chain link', '前とのつながり')} <Mark ok={vis ? c.chainOk : null} /></span>
            </span>
            {vis && !c.hashOk && <span className="pp-why">{t('The contents no longer match the hash that was signed — someone changed this record.', '内容が署名されたハッシュと一致しません。誰かがこの記録を書き換えています。')}</span>}
            {vis && c.hashOk && !(c.sigOk && c.issuerOk) && <span className="pp-why">{t("The server signature does not belong to Gallery Crypto's published key.", 'サーバーの署名が、Gallery Crypto が公開している鍵のものではありません。')}</span>}
            {vis && c.hashOk && c.sigOk && !c.cosigOk && <span className="pp-why">{t('Missing a valid signature from an active founder device key — a server alone cannot create records.', '有効な創業者の端末の鍵による署名がありません。サーバーだけでは記録を作れません。')}</span>}
            {vis && c.hashOk && c.sigOk && c.cosigOk && !c.chainOk && <span className="pp-why">{t('This record does not link to the one before it — something was removed or inserted.', 'この記録が一つ前の記録とつながっていません。何かが削除されたか、差し込まれています。')}</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ひと目でわかる確認：5つの問いに、アイコンと一言で答える
type Easy = { icon: IconName; title: string; ok: boolean | null | 'next'; good: string; bad: string; next?: string };
function EasyChecks({ items }: { items: Easy[] }) {
  const { t } = useLang();
  return (
    <ul className="ez">
      {items.map((it) => {
        const st = it.ok === 'next' ? 'next' : it.ok === null ? 'wait' : it.ok ? 'ok' : 'ng';
        return (
          <li key={it.title} className={`ez-i ${st}`}>
            <GcIcon name={it.icon} size={48} status={st} tone={st === 'ok' ? 'ok' : st === 'ng' ? 'ng' : 'soft'} />
            <b>{it.title}</b>
            <span>{st === 'wait' ? t('Checking…', '確認中…') : st === 'next' ? it.next : st === 'ok' ? it.good : it.bad}</span>
          </li>
        );
      })}
    </ul>
  );
}

function AnchorCheck({ a, hashes }: { a: Anchor; hashes: string[] }) {
  const { t, locale } = useLang();
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
      const net = a.chain === 'solana-devnet' ? t('Solana devnet', 'Solana のテスト網') : 'Solana';
      setMsg(found ? t(`Found on ${net}${when ? ` · block time ${when}` : ''}. Nobody — not even Gallery Crypto — can change it now.`, `${net} で見つかりました${when ? `（ブロック時刻 ${when}）` : ''}。もう誰も — Gallery Crypto でさえ — 書き換えられません。`) : t('The transaction did not contain this root.', 'この取引にはこのルートが含まれていませんでした。'));
    } catch {
      setSt('ng');
      setMsg(t('Could not reach Solana right now. Try again, or open the explorer link.', 'いま Solana につながりません。もう一度試すか、エクスプローラーのリンクを開いてください。'));
    }
  };
  return (
    <div className="pp-anchor">
      <p>
        <b>{t('Anchor', '刻印')} #{a.id}</b> · {day(a.created_at, locale)} · {t(`${a.leaves.length} records rolled into one root`, `${a.leaves.length}件の記録を1つのルートにまとめたもの`)}
      </p>
      <p className="pp-mono">{t('root', 'ルート')} {short(a.root, 14)}</p>
      <p>
        {t('Root recomputed in your browser', 'ブラウザでルートを計算し直した')} <Mark ok={rootOk} /> · {t("This passport's records inside", 'このパスポートの記録が含まれる')} <Mark ok={inside > 0} /> ({inside})
      </p>
      <div className="pp-row">
        <button className="mo-btn small" onClick={run} disabled={st === 'busy'}>{st === 'busy' ? t('Asking Solana…', 'Solana に確認中…') : t('Check on Solana', 'Solana で確かめる')}</button>
        <a className="mo-btn small ghost" href={explorerTx(a.tx, a.chain)} target="_blank" rel="noopener noreferrer">{t('Explorer ↗', 'エクスプローラー ↗')}</a>
      </div>
      {msg && <p className={st === 'ok' ? 'pp-good' : 'pp-bad'}>{msg}</p>}
    </div>
  );
}

function Value({ v }: { v: unknown }) {
  const { t } = useLang();
  if (Array.isArray(v)) {
    if (!v.length) return <>—</>;
    if ((v[0] as PhotoHash).sha256 !== undefined)
      return (
        <ul className="pp-hashes">
          {(v as PhotoHash[]).map((h, i) => (
            <li key={i}><b>{h.label || `${t('Area', '箇所')} ${i + 1}`}</b> <span className="pp-mono">{short(h.sha256, 12)}</span></li>
          ))}
        </ul>
      );
    return <>{(v as Composition).map((c) => `${c.pct}% ${c.fiber}`).join(' · ')}</>;
  }
  const s = String(v ?? '');
  return <>{s === '' ? '—' : s}</>;
}

export default function PassportView({ b, qr, url, offlineQr, offlineUrl, tapped }: { b: PassportBundle; qr?: string; url?: string; offlineQr?: string; offlineUrl?: string; tapped?: boolean }) {
  const { t, lang, locale } = useLang();
  const dayL = (s: string) => day(s, locale);
  const ring = useMemo(() => verifyKeyring(b.keyring || [], b.issuer), [b.keyring, b.issuer]);
  const v = useVerify(b.entries, b.issuer, ring.keys);
  const res = { ok: v.res.ok && ring.ok, checks: v.res.checks };
  const { shown, done } = v;
  // 台帳の起点（最初の鍵）をこの端末に記憶し、すり替えを検出する
  const [pin, setPin] = useState<'new' | 'same' | 'changed' | null>(null);
  useEffect(() => {
    if (b.demo || !ring.genesis) return;
    try {
      const k = 'gc-genesis';
      const prev = localStorage.getItem(k);
      if (!prev) { localStorage.setItem(k, ring.genesis); setPin('new'); }
      else setPin(prev === ring.genesis ? 'same' : 'changed');
    } catch {}
  }, [b.demo, ring.genesis]);
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
  const tv = useVerify(tampered || b.entries, b.issuer, ring.keys);

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
        <div className="pp-stamp">{!done ? t('Checking…', '確認中…') : res.ok ? t('Authentic record', '本物の記録') : t('Record broken', '記録が壊れています')}</div>
        <div>
          <p className="pp-cert">{b.cert}{b.demo ? t(' · demo', ' · デモ') : ''}</p>
          <p>
            {t(`${b.entries.length} records, each signed twice (server key + founder device key), checked here in your browser — not by our server. Server key`, `${b.entries.length}件の記録。それぞれ二重に署名され（サーバーの鍵＋創業者の端末の鍵）、私たちのサーバーではなく、このブラウザで確かめています。サーバーの鍵`)}{' '}
            <span className="pp-mono">{short(b.issuer, 8)}</span> · {t('published at our domain', '当サイトで公開')} <Mark ok={domainKey} /> · {t('founder keyring', '創業者の鍵の台帳')} <Mark ok={ring.ok} />
          </p>
          {pin === 'changed' && <p className="pp-bad">{t("Warning: the founder keyring's root is different from the one this device saw before. Treat this record as suspicious.", '注意：創業者の鍵の台帳の起点が、この端末が以前見たものと違います。この記録は疑ってください。')}</p>}
          {pin === 'same' && <p className="pp-fine">{t('Keyring root matches the one this device remembered.', '鍵の台帳の起点は、この端末が覚えているものと一致しています。')}</p>}
        </div>
        {qr && <div className="pp-qr" aria-label={t('QR code for this passport', 'このパスポートのQRコード')} dangerouslySetInnerHTML={{ __html: qr }} />}
      </section>

      <EasyChecks
        items={[
          { icon: 'chip', title: t('The tag', 'タグ'), ok: tapped ? true : 'next', good: t('The chip sewn into this piece just made a fresh one-time code, and our server confirmed it.', 'この作品に縫い込まれたチップが、いま新しい使い捨てコードを出し、サーバーが確認しました。'), bad: '', next: t('Tap the NFC tag sewn into the piece: the site checks the chip’s one-time code and marks this page.', '作品に縫い込まれたNFCタグをタップすると、チップの使い捨てコードを確かめて、このページに印を付けます。') },
          { icon: 'server', title: t('Signed by Gallery Crypto', 'Gallery Crypto の署名'), ok: done ? res.checks.every((c) => c.sigOk && c.issuerOk) && domainKey !== false : null, good: t('Every record carries our server signature, and the key matches the one published on our website.', 'すべての記録にサーバーの署名があり、鍵は当サイトで公開しているものと一致します。'), bad: t('A signature does not match Gallery Crypto’s published key.', '署名が Gallery Crypto の公開鍵と一致しません。') },
          { icon: 'founder', title: t('Approved by a founder', '創業者の承認'), ok: done ? res.checks.every((c) => c.cosigOk) && ring.ok : null, good: t('Every record was also signed on a founder’s own phone. A server alone cannot make a record.', 'すべての記録は創業者自身のスマホでも署名されています。サーバーだけでは記録を作れません。'), bad: t('A record is missing a valid founder signature.', '有効な創業者の署名がない記録があります。') },
          { icon: 'chain', title: t('Nothing changed or removed', '書き換え・削除なし'), ok: done ? res.checks.every((c) => c.hashOk && c.chainOk) : null, good: t(`All ${b.entries.length} records are exactly as signed, and each links to the one before.`, `${b.entries.length}件の記録はすべて署名されたままで、それぞれ一つ前とつながっています。`), bad: t('A record was changed, removed or inserted.', '記録が書き換えられたか、削除・差し込みがあります。') },
          { icon: 'clock', title: t('Public timestamp', '公開の日時の証明'), ok: b.anchors.length ? (done ? true : null) : 'next', good: t(`Written to ${b.chain === 'solana-devnet' ? 'Solana (test network)' : 'Solana'}. Press “Check on Solana” below to see it yourself.`, `${b.chain === 'solana-devnet' ? 'Solana（テスト網）' : 'Solana'}に書き込み済みです。下の「Solana で確かめる」で、ご自身で確認できます。`), bad: '', next: b.demo ? t('Demo records are not written to Solana. Real passports are, within a day.', 'デモの記録は Solana に書き込みません。本物のパスポートは1日以内に書き込みます。') : t('Waiting for the next daily anchor on Solana.', '次の Solana への刻印（毎日）を待っています。') },
        ]}
      />

      <details className="pp-more">
        <summary>{t('Show every check, record by record', '記録ごとの確認をすべて見る')} ({b.entries.length})</summary>
        <Checks checks={res.checks} shown={shown} entries={b.entries} />
      </details>

      <div className="pp-grid">
        <section className="pp-box">
          <h2>{t('Product passport', '製品パスポート')}</h2>
          {seal ? <p className="pp-sub">{t('Sealed', '確定')} {dayL(seal.entry.at)} · {t('schema', 'スキーマ')} {(seal.entry.data as { schema?: string }).schema} · {t('aligned with the EU Digital Product Passport (textiles)', 'EUデジタル製品パスポート（繊維）に準拠')}</p> : <p>{t('No sealed record yet.', 'まだ確定した記録はありません。')}</p>}
          {dpp &&
            DPP_SECTIONS.map((s) => (
              <div key={s.key} className="pp-sec">
                <h3>{dl(lang, s.title)} <small>{dl(lang, s.espr)}</small></h3>
                <dl>
                  {s.fields.map((f) => {
                    const v = dpp[s.key]?.[f.key];
                    if (v === '' || v == null || (Array.isArray(v) && !v.length)) return null;
                    return (
                      <div key={f.key}>
                        <dt>{dl(lang, f.label)}</dt>
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
            <h2>{t('Life of the piece', 'この作品の歩み')}</h2>
            <ol className="pp-time">
              {events.map((e) => {
                const d = e.entry.data as { type: string; actor?: string; place?: string; note?: string; date?: string };
                return (
                  <li key={e.hash}>
                    <b>{eventLabel(d.type, lang)}</b>
                    <span>{d.date || dayL(e.entry.at)}{d.place ? ` · ${d.place}` : ''}</span>
                    {d.actor && <span>{d.actor}</span>}
                    {d.note && <p>{d.note}</p>}
                  </li>
                );
              })}
              {!events.length && <li>{t('No events recorded yet.', 'まだ出来事の記録はありません。')}</li>}
            </ol>
          </section>

          <section className="pp-box">
            <h2>{t('Blockchain anchor', 'ブロックチェーンへの刻印')}</h2>
            {b.anchors.length ? (
              b.anchors.map((a) => <AnchorCheck key={a.id} a={a} hashes={hashes} />)
            ) : (
              <p>{b.demo ? t('Real passports are rolled into one hash and written to Solana. This demo is signed but not anchored.', '本物のパスポートは1つのハッシュにまとめて Solana に書き込みます。このデモは署名済みですが、刻印はしていません。') : t('Waiting for the next anchor to Solana. The signatures above already prove the record on their own.', '次の Solana への刻印を待っています。上の署名だけでも、記録はすでに証明されています。')}</p>
            )}
            <p className="pp-fine">
              {t('The chain is optional: it only adds a public timestamp. Issuer address', 'ブロックチェーンは補助です。公開の日時の証明を加えるだけです。発行者のアドレス')}{' '}
              <a href={explorerAddr(b.issuer, b.chain)} target="_blank" rel="noopener noreferrer" className="pp-mono">{short(b.issuer, 6)}</a>
            </p>
          </section>

          <section className="pp-box">
            <h2>{t('Try to fake it', '偽造を試す')}</h2>
            {sealIdx < 0 ? (
              <p>{t('Available once a record is sealed.', '記録が確定すると試せます。')}</p>
            ) : !fake ? (
              <>
                <p>{t('Change the dealer credit in your own copy and watch the proof break.', '手元のコピーで入手先を書き換えて、証明が壊れるのを見てください。')}</p>
                <button className="mo-btn small" onClick={() => { setFakeDealer('Somebody Else'); setFake(true); }}>{t('Edit my copy', '手元のコピーを書き換える')}</button>
              </>
            ) : (
              <>
                <label className="pp-label">{t('Inherited from', '入手先')}<input value={fakeDealer} onChange={(e) => setFakeDealer(e.target.value)} /></label>
                <p className={tv.done ? (tv.res.ok ? 'pp-good' : 'pp-bad') : ''}>
                  {!tv.done ? t('Checking…', '確認中…') : tv.res.ok ? t('Matches the original — the proof holds.', '元と一致 — 証明は有効です。') : t(`Broken at record #${tv.res.checks.findIndex((c) => !checkOk(c)) + 1}. A fake copy can never pass: a new hash needs both Gallery Crypto's server key and a founder's device key.`, `記録 #${tv.res.checks.findIndex((c) => !checkOk(c)) + 1} で壊れました。偽のコピーは決して通りません。新しいハッシュには Gallery Crypto のサーバーの鍵と、創業者の端末の鍵の両方が必要です。`)}
                </p>
                <button className="mo-btn small ghost" onClick={() => setFake(false)}>{t('Put it back', '元に戻す')}</button>
              </>
            )}
          </section>

          <section className="pp-box">
            <h2>{t('Founder keys', '創業者の鍵')}</h2>
            <p>{t("Every record needs a signature from one of these device keys. Keys can only be added or revoked with an existing key's signature.", 'すべての記録に、これらの端末の鍵のどれかによる署名が必要です。鍵の追加・取り消しは、既存の鍵の署名がないとできません。')}</p>
            <ul className="pp-keys">
              {Array.from(ring.keys.values()).map((k) => (
                <li key={k.key}>
                  <b>{k.label || t('Key', '鍵')}</b> <span className="pp-mono">#{keyId(k.key)}</span> · {t('since', '登録')} {dayL(k.added)} {k.revoked ? <span className="pp-bad">· {t('revoked', '取り消し')} {dayL(k.revoked)}</span> : <span className="pp-good">· {t('active', '有効')}</span>}
                </li>
              ))}
            </ul>
          </section>

          {offlineQr && (
            <section className="pp-box">
              <h2>{t('Offline proof', 'オフラインの証明')}</h2>
              <p>{t("This code carries the latest record's two signatures. The Gallery Crypto verifier checks it with no internet connection.", 'このコードには最新の記録の2つの署名が入っています。Gallery Crypto の検証ツールは、インターネットなしで確かめられます。')}</p>
              <div className="pp-qr big" dangerouslySetInnerHTML={{ __html: offlineQr }} />
              {offlineUrl && <a className="mo-btn small ghost" href={offlineUrl}>{t('Open in the offline verifier', 'オフライン検証ツールで開く')}</a>}
            </section>
          )}

          <section className="pp-box">
            <h2>{t('Keep the proof', '証明を保存する')}</h2>
            <p>{t('Download the full proof. It verifies with the public key alone — even if this website disappears.', '証明一式をダウンロードできます。このサイトがなくなっても、公開鍵だけで確かめられます。')}</p>
            <div className="pp-row">
              <button className="mo-btn small" onClick={download}>{t('Download proof', '証明をダウンロード')}</button>
              <a className="mo-btn small ghost" href={`/api/passport/${b.cert}`} target="_blank" rel="noopener noreferrer">JSON</a>
            </div>
            {url && <p className="pp-fine">{t('NFC tap or QR opens', 'NFCタップやQRで開くページ：')} <span className="pp-mono">{url.replace(/^https?:\/\//, '')}</span></p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
