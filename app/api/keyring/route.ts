import { NextResponse } from 'next/server';
import { demoPassport, publicKeyring } from '@/lib/passportPublic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 公開の鍵の台帳。オフライン検証アプリ（/verify）が保存しておき、通信なしで照合に使う
export async function GET() {
  const k = await publicKeyring();
  if (!k) return NextResponse.json({ error: 'not configured' }, { status: 501 });
  const demo = await demoPassport();
  return NextResponse.json({ ...k, demoKeyring: demo?.keyring || [], fetched_at: new Date().toISOString() }, { headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
}
