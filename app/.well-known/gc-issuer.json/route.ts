import { NextResponse } from 'next/server';
import { ensureIssuer, issuerAddress, issuerConfigured, issuerSeedForChains } from '@/lib/passportServer';
import { getChains, xrplAddress } from '@/lib/chains';
import { PROTOCOL } from '@/lib/gcpp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 発行者の公開鍵をドメインで公開する（ブロックチェーンに頼らない信頼の起点）
export async function GET() {
  await ensureIssuer();
  if (!issuerConfigured()) return NextResponse.json({ error: 'not configured' }, { status: 501 });
  const c = await getChains();
  return NextResponse.json(
    { protocol: PROTOCOL, issuer: 'Gallery Crypto', key: { type: 'ed25519', encoding: 'base58', value: issuerAddress() }, solana: { chain: c.solana, address: issuerAddress() }, xrpl: { chain: c.xrpl, address: await xrplAddress(issuerSeedForChains()) } },
    { headers: { 'access-control-allow-origin': '*' } },
  );
}
