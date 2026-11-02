import { NextResponse } from 'next/server';
import { verifyTap } from '@/lib/sunServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// NFC タグの使い捨てコードを確かめる（機械向け）。?e=<32桁>&c=<16桁>（picc_data / cmac の名前でも可）
// 1つのコードは1回しか通らない。同じリンクをもう一度送ると replayed になる。
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const r = await verifyTap(q.get('e') || q.get('picc_data'), q.get('c') || q.get('cmac'));
  const code = r.status === 'authentic' || r.status === 'unlinked' ? 200 : r.status === 'replayed' ? 409 : r.status === 'invalid' ? 400 : r.status === 'unconfigured' ? 501 : 500;
  const body = { status: r.status, cert: r.cert || null, counter: r.counter ?? null, passport: r.cert ? `/passport/${r.cert}${r.token ? `?tap=${r.token}` : ''}` : null };
  return NextResponse.json(body, { status: code, headers: { 'cache-control': 'no-store' } });
}
