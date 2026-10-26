import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/passportServer';
import { runSetup } from '@/lib/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 管理者だけが押せる「自動セットアップ」（イベント機能と来歴パスポート）
export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const r = await runSetup();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === 'no-db-url' ? 501 : 500 });
  return NextResponse.json({ ok: true });
}
