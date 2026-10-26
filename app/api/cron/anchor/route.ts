import { NextResponse } from 'next/server';
import { anchorPending, issuerConfigured } from '@/lib/passportServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 毎日1回（日本時間 3:00）、まだ刻印していない記録を自動で Solana に書き込む（vercel.json の crons）
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  const fromCron = /vercel-cron/i.test(req.headers.get('user-agent') || '');
  if (secret ? auth !== `Bearer ${secret}` : !fromCron) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!issuerConfigured()) return NextResponse.json({ skipped: 'not configured' });
  try {
    const r = await anchorPending();
    return NextResponse.json({ count: r.count, tx: r.anchor?.tx || null, needFunds: Boolean(r.needFunds) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
