import type { Metadata } from 'next';
import RecordShell from '@/components/concept/RecordShell';
import { getT } from '@/lib/lang';

export const metadata: Metadata = { title: 'Thank you — Gallery Crypto', robots: { index: false } };

export default function Thanks() {
  const t = getT();
  return (
    <RecordShell title={t('Thank you!', 'ありがとうございます')} kicker={t('Order received', 'ご注文を受け付けました')} done>
      <p className="mo-lead">
        {t('Your payment is complete. A receipt has been sent to your email, and we will email you again with tracking when your piece ships. Its provenance certificate will be issued to you at the same time.', 'お支払いが完了しました。領収書をメールでお送りしました。発送時には追跡番号をあらためてメールでお知らせします。来歴の証明書も同時に発行します。')}
      </p>
      <p className="rx-note">{t('Behind this text, the piece turns into its record — each event linked to the one before. Your chapter is added when the piece ships.', 'うしろでは、服が記録の鎖に変わっていきます。出来事が一つ前とつながる記録です。あなたの章は、発送のときに書き足されます。')}</p>
      <p className="cx-ctas">
        <a href="/shop">{t('Back to the shop', 'ショップに戻る')}</a>
        <a className="ghost" href="/concept">{t('How the record works', '記録のしくみ')}</a>
      </p>
    </RecordShell>
  );
}
