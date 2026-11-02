import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import MoShell from '@/components/MoShell';
import { verifyTap } from '@/lib/sunServer';
import { getT } from '@/lib/lang';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tag check — Gallery Crypto', robots: { index: false } };

// NFC タグが開くページ。本物なら、そのままパスポートへ（「いまタップで確認済み」の印つき）
export default async function TapPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const t = getT();
  const TEXT: Record<string, { title: string; body: string }> = {
    replayed: {
      title: t('This link was already used', 'このリンクは使用済みです'),
      body: t('Each tap of the tag makes a new one-time code, and every code works once. If you are holding the piece, tap the tag again. If someone sent you this link, it does not prove they have the real tag.', 'タグはタップのたびに新しい使い捨てコードを出し、各コードは1回しか使えません。作品がお手元にあれば、もう一度タグをタップしてください。誰かから送られてきたリンクなら、その人が本物のタグを持っている証明にはなりません。'),
    },
    unlinked: { title: t('Genuine Gallery Crypto tag', '本物の Gallery Crypto のタグです'), body: t('The chip passed the check, but it is not linked to a sealed passport yet.', 'チップの確認は通りましたが、まだ確定したパスポートと結びついていません。') },
    invalid: {
      title: t('This tag could not be verified', 'このタグは確認できませんでした'),
      body: t('The code did not match a Gallery Crypto chip. The tag may be a copy, or the link may be incomplete. Tap the tag again, and contact us if it keeps failing.', 'コードが Gallery Crypto のチップと一致しませんでした。タグがコピーされたものか、リンクが途中で切れている可能性があります。もう一度タップして、それでも失敗する場合はお問い合わせください。'),
    },
    unconfigured: { title: t('Tag checks are not switched on yet', 'タグの確認はまだ使えません'), body: t('This site is not connected to its database yet.', 'このサイトはまだデータベースにつながっていません。') },
    error: { title: t('Something went wrong', 'エラーが起きました'), body: t('We could not finish the check. Please tap the tag again in a moment.', '確認を完了できませんでした。少し時間をおいて、もう一度タップしてください。') },
  };
  const r = await verifyTap(searchParams.e || searchParams.picc_data, searchParams.c || searchParams.cmac);
  if (r.status === 'authentic' && r.cert) redirect(`/passport/${r.cert}?tap=${r.token}`);
  const x = TEXT[r.status] || TEXT.error;
  return (
    <MoShell title={x.title} kicker={t('NFC tag check', 'NFCタグの確認')}>
      <p className="mo-lead">{x.body}</p>
      {r.status === 'replayed' && r.cert && (
        <p>
          <a href={`/passport/${r.cert}`}>{t(`Open the passport for ${r.cert}`, `${r.cert} のパスポートを開く`)}</a>
          {t(' (record only, without a live tag check).', '（記録のみ。タップでの確認はありません）')}
        </p>
      )}
      <p><a href="/demo/nfc">{t('How the tag works', 'タグの仕組み')}</a></p>
    </MoShell>
  );
}
