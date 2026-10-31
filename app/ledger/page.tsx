import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';
import GcIcon, { IconRow } from '@/components/GcIcon';
import LedgerTable from '@/components/LedgerTable';
import { getLedger } from '@/lib/ledger';
import { explorerAddr, explorerXrplAddr } from '@/lib/gcpp';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Public ledger — Gallery Crypto',
  description: 'Every fingerprint Gallery Crypto has written to Solana (and mirrored to the XRP Ledger), live, with links to check each one yourself.',
};

const day = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'Asia/Tokyo' }) : '—');
const netName = (c: string) => (c === 'solana-mainnet' ? 'Solana mainnet' : c === 'solana-devnet' ? 'Solana devnet (test network)' : c === 'xrpl-mainnet' ? 'XRP Ledger mainnet' : c === 'xrpl-testnet' ? 'XRP Ledger testnet' : 'off');

// 運用実績：これまでに書いたすべての刻印。サイトが読むのは自分のデータベース、照合は誰でも公開ノードで
export default async function LedgerPage() {
  const l = await getLedger();
  if (!l) {
    return (
      <MoShell title="Public ledger" kicker="Track record">
        <p className="mo-lead">The ledger appears here once this server is connected to its database.</p>
      </MoShell>
    );
  }
  const t = l.totals;
  return (
    <MoShell title="Every write, in public" kicker="Track record · live">
      <p className="mo-lead">
        This page lists every fingerprint Gallery Crypto has written to Solana — and, when switched on, mirrored to the XRP Ledger. Each line links to the public transaction, and the
        Check button asks a Solana node directly from your browser. Nothing here is taken on our word.
      </p>

      <div className="lg-stats">
        <div><GcIcon name="ledger" size={40} tone="ink" /><b>{t.anchors}</b><span>writes to Solana{t.anchors_mainnet ? ` · ${t.anchors_mainnet} on mainnet` : ''}</span></div>
        <div><GcIcon name="fingerprint" size={40} /><b>{t.records_anchored}</b><span>records covered</span></div>
        <div><GcIcon name="cap" size={40} /><b>{t.pieces_sealed}</b><span>pieces with a sealed passport</span></div>
        <div><GcIcon name="clock" size={40} /><b>{t.days_active}</b><span>days with a write · since {day(t.first_anchor)}</span></div>
        <div><GcIcon name="chain" size={40} tone={t.xrpl_mirrors ? 'copper' : 'soft'} /><b>{t.xrpl_mirrors}</b><span>mirrored to the XRP Ledger</span></div>
      </div>

      <div className="sol-grid">
        <IconRow name="ledger" tone="ink" title={`Solana · ${netName(l.chains.solana)}`}>
          Issuer address <a href={explorerAddr(l.addresses.solana, l.chains.solana)} target="_blank" rel="noopener noreferrer" className="pp-mono">{l.addresses.solana.slice(0, 6)}…{l.addresses.solana.slice(-6)}</a> — the same key that signs every passport. All of its transactions are public.
        </IconRow>
        <IconRow name="chain" tone="copper" title={`XRP Ledger · ${netName(l.chains.xrpl)}`}>
          {l.chains.xrpl === 'off' ? 'Mirroring is switched off.' : <>Account <a href={explorerXrplAddr(l.addresses.xrpl, l.chains.xrpl)} target="_blank" rel="noopener noreferrer" className="pp-mono">{l.addresses.xrpl.slice(0, 6)}…{l.addresses.xrpl.slice(-6)}</a> writes the same fingerprint as a memo. No payment is made.</>}
        </IconRow>
        <IconRow name="clock" title="When we write">Right after a passport is sealed or a record is added, and once a day at 03:00 Tokyo time for the day&apos;s backup fingerprint. Nothing is written on a quiet day without changes.</IconRow>
        <IconRow name="eye" title="What is in each write">One 32-byte fingerprint and how many records it covers. Never names, prices, photos or anything about a buyer.</IconRow>
      </div>

      <h2 className="pl-h">All writes</h2>
      {l.anchors.length ? (
        <LedgerTable anchors={l.anchors} />
      ) : (
        <p className="sol-status"><GcIcon name="clock" size={30} tone="copper" /> <span><b>No writes yet.</b> The first one happens when the first real piece is sealed. The demo pieces are signed but deliberately not written.</span></p>
      )}

      <p className="mo-fine">
        Machine-readable: <a href="/api/ledger">/api/ledger</a> (JSON, every write with its records) · Protocol: <a href="/spec">GCPP/2 specification</a> · Public keys: <a href="/.well-known/gc-issuer.json">/.well-known/gc-issuer.json</a> · How it works: <a href="/demo/nfc#solana">Solana, in plain words</a>
      </p>
    </MoShell>
  );
}
