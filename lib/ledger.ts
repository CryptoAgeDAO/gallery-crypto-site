import 'server-only';
// 公開の運用実績：これまでに Solana（と XRPL）へ書いたすべての刻印と、その中身の数
import { db } from './server';
import { ensureIssuer, issuerAddress, issuerConfigured, issuerSeedForChains } from './passportServer';
import { getChains, xrplAddress, type Chains } from './chains';
import type { Anchor } from './gcpp';

export type Ledger = {
  generated_at: string;
  chains: Chains;
  addresses: { solana: string; xrpl: string };
  totals: {
    anchors: number;
    anchors_mainnet: number;
    xrpl_mirrors: number;
    records_anchored: number;
    pieces_sealed: number;
    records: number;
    keyring_changes: number;
    first_anchor: string | null;
    last_anchor: string | null;
    days_active: number;
  };
  anchors: Anchor[];
};

export async function getLedger(): Promise<Ledger | null> {
  if (!issuerConfigured() || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  await ensureIssuer();
  const chains = await getChains();
  const [a, logs, keys] = await Promise.all([
    db().from('passport_anchors').select('*').order('id', { ascending: false }).limit(500),
    db().from('passport_log').select('item_id,kind', { count: 'exact' }),
    db().from('passport_keys').select('id', { count: 'exact', head: true }),
  ]);
  const anchors = ((a.data as Anchor[]) || []).filter((x) => x.tx);
  const logRows = (logs.data as { item_id: string; kind: string }[]) || [];
  const dates = anchors.map((x) => x.created_at).sort();
  const days = new Set(dates.map((d) => d.slice(0, 10))).size;
  return {
    generated_at: new Date().toISOString(),
    chains,
    addresses: { solana: issuerAddress(), xrpl: await xrplAddress(issuerSeedForChains()) },
    totals: {
      anchors: anchors.length,
      anchors_mainnet: anchors.filter((x) => x.chain === 'solana-mainnet').length,
      xrpl_mirrors: anchors.filter((x) => x.xrpl_tx).length,
      records_anchored: anchors.reduce((n, x) => n + (x.leaves?.length || 0), 0),
      pieces_sealed: new Set(logRows.filter((r) => r.kind === 'seal').map((r) => r.item_id)).size,
      records: logs.count || logRows.length,
      keyring_changes: keys.count || 0,
      first_anchor: dates[0] || null,
      last_anchor: dates[dates.length - 1] || null,
      days_active: days,
    },
    anchors,
  };
}
