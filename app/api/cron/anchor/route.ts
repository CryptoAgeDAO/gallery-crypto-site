import { NextResponse } from 'next/server';
import { issuerConfigured } from '@/lib/passportServer';
import { dailySnapshot } from '@/lib/backup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 毎日1回（日本時間 3:00）：自動スナップショット＋ Solana への刻印（vercel.json の crons）
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  const fromCron = /vercel-cron/i.test(req.headers.get('user-agent') || '');
  if (secret ? auth !== `Bearer ${secret}` : !fromCron) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!issuerConfigured()) return NextResponse.json({ skipped: 'not configured' });
  try {
    // 毎日：署名つき記録のスナップショットを非公開の保管庫に保存し、まだ刻んでいない記録と一緒に Solana に刻む
    return NextResponse.json(await dailySnapshot());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
