'use client';

// 刻印の一覧。各行を、このブラウザから公開の Solana ノードに直接問い合わせて確かめられる
import { useState } from 'react';
import GcIcon from './GcIcon';
import { useLang } from './Lang';
import { explorerTx, explorerXrplTx, merkleRoot, rpcFor, type Anchor } from '@/lib/gcpp';

const day = (s: string, ja = false) => new Date(s).toLocaleString(ja ? 'ja-JP' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }) + (ja ? '（日本時間）' : ' JST');
const short = (s: string, n = 6) => (s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);
const net = (c: string, ja = false) => (c === 'solana-mainnet' ? 'Solana' : c === 'solana-devnet' ? (ja ? 'Solana テスト' : 'Solana test') : c === 'xrpl-mainnet' ? 'XRPL' : c === 'xrpl-testnet' ? (ja ? 'XRPL テスト' : 'XRPL test') : c);

function Row({ a }: { a: Anchor }) {
  const { t, lang } = useLang();
  const ja = lang === 'ja';
  const [st, setSt] = useState<'idle' | 'busy' | 'ok' | 'ng'>('idle');
  const [msg, setMsg] = useState('');
  const rootOk = merkleRoot(a.leaves) === a.root;
  const check = async () => {
    setSt('busy');
    try {
      const r = await fetch(rpcFor(a.chain), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [a.tx, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }] }) });
      const j = await r.json();
      const logs: string[] = j?.result?.meta?.logMessages || [];
      const found = logs.some((l) => l.includes(a.root));
      setSt(found && rootOk ? 'ok' : 'ng');
      setMsg(found ? (rootOk ? t('Root recomputed here and found in the Solana transaction.', 'ここでルートを計算し直し、Solana の取引の中に見つけました。') : t('Found on Solana, but the root does not match its records.', 'Solana で見つかりましたが、ルートが記録と一致しません。')) : t('This transaction does not contain the root.', 'この取引にはルートが含まれていません。'));
    } catch {
      setSt('ng');
      setMsg(t('Could not reach Solana from this browser. Use the explorer link instead.', 'このブラウザから Solana につながりません。エクスプローラーのリンクをお使いください。'));
    }
  };
  return (
    <li className={`lg-row ${st}`}>
      <GcIcon name="ledger" size={40} tone={a.chain === 'solana-mainnet' ? 'ink' : 'soft'} status={st === 'idle' ? undefined : st === 'busy' ? 'wait' : st} />
      <div className="lg-main">
        <p className="lg-when">#{a.id} · {day(a.created_at, ja)}</p>
        <p className="lg-what">{t(`${a.leaves.length} record${a.leaves.length === 1 ? '' : 's'} in one fingerprint`, `${a.leaves.length}件の記録を1つの指紋に`)} · <span className="pp-mono">{short(a.root, 8)}</span></p>
        {msg && <p className={`lg-msg ${st}`}>{msg}</p>}
      </div>
      <div className="lg-links">
        <a className="lg-chip" href={explorerTx(a.tx, a.chain)} target="_blank" rel="noopener noreferrer">{net(a.chain, ja)} ↗</a>
        {a.xrpl_tx ? <a className="lg-chip" href={explorerXrplTx(a.xrpl_tx, a.xrpl_chain || 'xrpl-testnet')} target="_blank" rel="noopener noreferrer">{net(a.xrpl_chain || 'xrpl-testnet', ja)} ↗</a> : null}
        <button className="lg-chip" onClick={check} disabled={st === 'busy'}>{st === 'busy' ? t('Checking…', '確認中…') : t('Check', '確かめる')}</button>
      </div>
    </li>
  );
}

export default function LedgerTable({ anchors }: { anchors: Anchor[] }) {
  const { t } = useLang();
  const [all, setAll] = useState(false);
  const shown = all ? anchors : anchors.slice(0, 20);
  return (
    <>
      <ol className="lg">
        {shown.map((a) => <Row key={a.id} a={a} />)}
      </ol>
      {anchors.length > shown.length && <button className="mo-btn ghost small" onClick={() => setAll(true)}>{t(`Show all ${anchors.length}`, `${anchors.length}件すべて表示`)}</button>}
    </>
  );
}
