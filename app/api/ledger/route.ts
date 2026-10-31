import { NextResponse } from 'next/server';
import { getLedger } from '@/lib/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 運用実績（機械で読める形）。審査・監査の方が、そのまま取り込んで照合できる
export async function GET() {
  const l = await getLedger();
  if (!l) return NextResponse.json({ error: 'not configured' }, { status: 501 });
  return NextResponse.json(
    { ...l, how_to_verify: 'For each anchor: merkleRoot(leaves) must equal root (GCPP/2, see /spec), and the Solana transaction `tx` must contain the memo "GCPP/2 root:<root> n:<leaves.length>" signed by addresses.solana. If xrpl_tx is set, the same memo is in that XRPL transaction from addresses.xrpl.' },
    { headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } },
  );
}
