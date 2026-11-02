import type { Metadata } from 'next';
import QRCode from 'qrcode';
import MoShell from '@/components/MoShell';
import PassportView from '@/components/PassportView';
import CapViewerLazy from '@/components/CapViewerLazy';
import { DEMO_ITEMS } from '@/lib/demoData';
import { demoPassport, getPassport, parseCert, parseDemo } from '@/lib/passportPublic';
import { compactOf } from '@/lib/gcpp';
import { siteUrl } from '@/lib/server';
import { photoUrl } from '@/lib/supabase';
import { readTapToken } from '@/lib/sunServer';
import { getT } from '@/lib/lang';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { cert: string } }): Promise<Metadata> {
  const t = getT();
  return { title: `${params.cert.toUpperCase()} — ${t('Provenance passport', '来歴パスポート')} — Gallery Crypto`, description: t('A signed, permanent record of where this piece came from and what it is made of.', 'この作品がどこから来て、何でできているかを示す、署名つきの消えない記録。') };
}

// NFC タグや QR から開く、一点ごとの来歴パスポート
export default async function PassportPage({ params, searchParams }: { params: { cert: string }; searchParams?: { tap?: string } }) {
  const t = getT();
  const cert = params.cert.toUpperCase();
  const dn = parseDemo(cert);
  const b = dn ? await demoPassport(dn) : await getPassport(cert);
  if (!b)
    return (
      <MoShell title={t('Passport not found', 'パスポートが見つかりません')} kicker={t('Provenance', '来歴')}>
        <p className="mo-lead">{t('This piece has no sealed record yet. See how passports work in the', 'この作品にはまだ確定した記録がありません。パスポートの仕組みは')} <a href="/proof">Proof Lab</a>{t('.', ' でご覧いただけます。')}</p>
      </MoShell>
    );
  const url = `${siteUrl()}/passport/${b.cert}`;
  const qr = await QRCode.toString(url, { type: 'svg', margin: 0, color: { dark: '#111111', light: '#00000000' } });
  const offlineUrl = `${siteUrl()}/verify#${compactOf(b.entries[b.entries.length - 1], dn ? 9000 + dn : parseCert(b.cert) || 0)}`;
  const offlineQr = await QRCode.toString(offlineUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'L', color: { dark: '#111111', light: '#00000000' } });
  const photo = b.item?.photos?.[0];
  // NFC タグから来たとき：サーバーがチップの使い捨てコードを確かめた印（10分有効）
  const tap = dn ? null : readTapToken(b.cert, searchParams?.tap);
  return (
    <MoShell title={b.item ? `${b.item.band}${b.item.title ? ` — ${b.item.title}` : ''}` : b.cert} kicker={`${t('Provenance passport', '来歴パスポート')} · ${b.cert}`}>
      {tap && (
        <div className="pp-tap" role="status">
          <span className="pp-mark ok">✓</span>
          <div>
            <b>{t('Chip verified just now', 'いまタップでチップを確認しました')}</b>
            <span>{t(`The NFC tag sewn into this piece made a fresh one-time code that only the genuine chip can make (tap no. ${tap.counter}).`, `この作品に縫い込まれたNFCタグが、本物のチップにしか作れない新しい使い捨てコードを出しました（${tap.counter}回目のタップ）。`)}</span>
          </div>
        </div>
      )}
      {dn ? (
        <div className="pp-3d">
          <CapViewerLazy compact pieces={[{ n: dn, band: b.item?.band || '', title: b.item?.title || '', year: b.item?.year || '', cert: b.cert, cap: DEMO_ITEMS[dn - 1].cap, qr }]} />
        </div>
      ) : photo && (
        <div className="pp-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(photo)} alt="" />
        </div>
      )}
      <PassportView b={b} qr={qr} url={url} offlineQr={offlineQr} offlineUrl={offlineUrl} tapped={Boolean(tap)} />
    </MoShell>
  );
}
