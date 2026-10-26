import { NextResponse } from 'next/server';
import { demoPassport, getPassport } from '@/lib/passportPublic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 機械で読める証明一式（これだけ保存しておけば、サイトがなくなっても検証できる）
export async function GET(_req: Request, { params }: { params: { cert: string } }) {
  const b = params.cert.toUpperCase() === 'GC-DEMO' ? await demoPassport() : await getPassport(params.cert);
  if (!b) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(
    { ...b, verify: 'GCPP/2 — see /spec. For each entry: hash = sha256(canonical JSON); sig = Ed25519 by issuer over "GCPP/2:<hash>"; cosig = ECDSA P-256 by entry.signer over the same; signer active in keyring at entry.at; entry.prev = previous hash.' },
    { headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } },
  );
}
