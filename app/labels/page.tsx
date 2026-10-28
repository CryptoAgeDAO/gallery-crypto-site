import type { Metadata } from 'next';
import QRCode from 'qrcode';
import LabelSheet, { type LabelItem } from '@/components/LabelSheet';
import { db, siteUrl } from '@/lib/server';
import { compactOf, type GcppEntry, type SignedEntry } from '@/lib/gcpp';
import { demoPassport } from '@/lib/passportPublic';
import { PUBLIC_ITEM_COLUMNS, certNo, type Item } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Print labels — Gallery Crypto', robots: { index: false, follow: false } };

const svg = (text: string, ecc: 'L' | 'M') => QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: ecc, color: { dark: '#000000', light: '#ffffff' } });

// 印刷用ラベル（下げ札・証明カード・小型シール）。載せるのは公開情報だけ（作品番号・QR）
export default async function LabelsPage() {
  const base = siteUrl();
  const out: LabelItem[] = [];
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { data: items } = await db().from('items').select(PUBLIC_ITEM_COLUMNS).eq('published', true).order('serial');
    // 各作品の最新の記録（オフラインQRの中身）
    const latest = new Map<string, SignedEntry>();
    const { data: logs } = await db().from('passport_log').select('item_id,seq,entry,hash,sig,cosig,issuer').order('seq');
    ((logs as (SignedEntry & { item_id: string })[]) || []).forEach((l) => latest.set(l.item_id, { entry: l.entry as GcppEntry, hash: l.hash, sig: l.sig, cosig: l.cosig, issuer: l.issuer }));
    for (const raw of (items as unknown as Item[]) || []) {
      const cert = certNo(raw);
      const url = `${base}/passport/${cert}`;
      const last = latest.get(raw.id);
      const offlineUrl = last ? `${base}/verify#${compactOf(last, raw.serial)}` : '';
      out.push({
        cert,
        band: raw.band,
        title: raw.title,
        year: raw.year,
        size: raw.size,
        dealer: raw.dealer,
        sealed: Boolean(last),
        records: last?.entry.seq || 0,
        url,
        qr: await svg(url, 'M'),
        offlineQr: offlineUrl ? await svg(offlineUrl, 'L') : '',
      });
    }
  }
  // 作品がまだない間は、見本（デモ）を1枚出す
  const demo = await demoPassport();
  if (demo) {
    const url = `${base}/passport/${demo.cert}`;
    const last = demo.entries[demo.entries.length - 1];
    out.push({
      cert: demo.cert, band: demo.item?.band || '', title: demo.item?.title || '', year: demo.item?.year || '', size: 'L', dealer: 'Demo Dealer, Los Angeles', sealed: true, records: last.entry.seq, demo: true,
      url, qr: await svg(url, 'M'), offlineQr: await svg(`${base}/verify#${compactOf(last, 9001)}`, 'L'),
    });
  }
  return <LabelSheet items={out} host={base.replace(/^https?:\/\//, '')} />;
}
