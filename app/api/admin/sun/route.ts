import { NextResponse } from 'next/server';
import { ensureIssuer, isAdminRequest, issuerConfigured } from '@/lib/passportServer';
import { siteUrl } from '@/lib/server';
import { sunFileKey, sunMetaKey } from '@/lib/sunServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 管理者用：NTAG 424 DNA にタグを書き込むときの設定一式（鍵・URL・位置）。
// 鍵は画面に出すだけで保存しない。書き込みが終わったら閉じること。
export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!issuerConfigured()) return NextResponse.json({ error: 'issuer-not-configured' }, { status: 501 });
  await ensureIssuer();
  const body = await req.json().catch(() => ({}));
  const uid = String(body.uid || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (uid.length !== 14) return NextResponse.json({ error: 'uid must be 7 bytes (14 hex characters)' }, { status: 400 });

  // NDEF の URI レコード（https:// は短縮コード 0x04）。位置はファイル先頭からのバイト数
  const url = `${siteUrl(req)}/tap?e=${'0'.repeat(32)}&c=${'0'.repeat(16)}`;
  const rest = url.replace(/^https:\/\//, '');
  const head = 7; // NLEN(2) + D1 + 01 + 長さ + 'U' + 0x04
  const piccOffset = head + rest.indexOf('e=') + 2;
  const macOffset = head + rest.indexOf('c=') + 2;
  return NextResponse.json(
    {
      uid,
      url,
      keys: { sdmMetaRead: sunMetaKey().toString('hex').toUpperCase(), sdmFileRead: sunFileKey(uid).toString('hex').toUpperCase() },
      sdm: {
        file: 'NDEF file (E104h, file 02)',
        options: 'UID mirror on, read counter mirror on, encrypted PICC data, SDM MAC on',
        piccDataOffset: piccOffset,
        sdmMacInputOffset: macOffset,
        sdmMacOffset: macOffset,
      },
      note: 'Write these keys into the key slots you set as SDMMetaRead and SDMFileRead. Change the master key (key 0) from the factory default and keep it private. The keys are derived each time and never stored.',
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
