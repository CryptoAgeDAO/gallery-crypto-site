import { NextResponse } from 'next/server';
import { demoPassport, getPassport } from '@/lib/passportPublic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 機械で読める証明一式（これだけ保存しておけば、サイトがなくなっても検証できる）
export async function GET(_req: Request, { params }: { params: { cert: string } }) {
  const b = params.cert.toUpperCase() === 'GC-DEMO' ? await demoPassport() : await getPassport(params.cert);
  if (!b) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(
    { ...b, verify: 'For each entry: sha256(canonical JSON of entry) == hash; ed25519 signature over "GCPP/1:<hash>" by issuer (base58); entry.prev == previous hash. Anchors: merkle root of sorted leaves is written as a Solana memo.' },
    { headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } },
  );
}
