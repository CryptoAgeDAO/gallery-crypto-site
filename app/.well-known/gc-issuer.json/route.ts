import { NextResponse } from 'next/server';
import { CHAIN, ensureIssuer, issuerAddress, issuerConfigured } from '@/lib/passportServer';
import { PROTOCOL } from '@/lib/gcpp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 発行者の公開鍵をドメインで公開する（ブロックチェーンに頼らない信頼の起点）
export async function GET() {
  await ensureIssuer();
  if (!issuerConfigured()) return NextResponse.json({ error: 'not configured' }, { status: 501 });
  return NextResponse.json(
    { protocol: PROTOCOL, issuer: 'Gallery Crypto', key: { type: 'ed25519', encoding: 'base58', value: issuerAddress() }, solana: { chain: CHAIN, address: issuerAddress() } },
    { headers: { 'access-control-allow-origin': '*' } },
  );
}
