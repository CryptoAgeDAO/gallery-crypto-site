import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';
import { getT } from '@/lib/lang';

export const metadata: Metadata = { title: 'Thank you — Gallery Crypto', robots: { index: false } };

export default function Thanks() {
  const t = getT();
  return (
    <MoShell title={t('Thank you!', 'ありがとうございます')} kicker={t('Order received', 'ご注文を受け付けました')}>
      <p className="mo-lead">
        {t('Your payment is complete. A receipt has been sent to your email, and we will email you again with tracking when your piece ships. Its provenance certificate will be issued to you at the same time.', 'お支払いが完了しました。領収書をメールでお送りしました。発送時には追跡番号をあらためてメールでお知らせします。来歴の証明書も同時に発行します。')}
      </p>
      <p>
        <a className="mo-btn" href="/">
          {t('Back to the catalog', 'カタログに戻る')}
        </a>
      </p>
    </MoShell>
  );
}
