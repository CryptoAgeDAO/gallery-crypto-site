import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';
import { getT } from '@/lib/lang';

export const metadata: Metadata = { title: 'Privacy — Gallery Crypto' };

// プライバシーポリシー（抽選エントリー・問い合わせでメールアドレスを預かるため）
export default function Privacy() {
  const t = getT();
  const ROWS: [string, string][] = [
    [t('What we collect', '取得する情報'), t('Your email address when you enter the draw; your name, email and message when you contact us.', '抽選に応募するときのメールアドレス、お問い合わせのときのお名前・メールアドレス・メッセージ。')],
    [t('Why', '利用目的'), t('To run the presale draw, contact winners, and reply to your message. We do not send newsletters without your consent.', '先行抽選の実施、当選者への連絡、お問い合わせへの返信のため。同意なくメールマガジンを送ることはありません。')],
    [t('Sharing', '第三者への提供'), t('We do not sell or share your information. It is stored with our service providers (Supabase for the database, Vercel for hosting, Resend for email) only to run this site.', '情報を販売・共有することはありません。このサイトの運営のためだけに、委託先（データベースは Supabase、ホスティングは Vercel、メールは Resend）に保管します。')],
    [t('Retention', '保管期間'), t('Until the 2027 release is complete, or until you ask us to delete it.', '2027年の発売が完了するまで、または削除のご依頼があるまで。')],
    [t('Your choices', 'ご本人の権利'), t('Ask us through the contact form to see, correct or delete your information.', 'お問い合わせフォームから、情報の開示・訂正・削除をご依頼いただけます。')],
    [t('Operator', '運営者'), t('Gallery Crypto (Tokyo, Japan)', 'Gallery Crypto（東京都）')],
  ];
  return (
    <MoShell title={t('Privacy policy', 'プライバシーポリシー')} kicker={t('The fine print', '規約')}>
      <div className="mo-legal">
        <dl>
          {ROWS.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mo-fine" style={{ marginTop: 18 }}>
        <a href="/#contact">{t('Contact us', 'お問い合わせ')}</a>
      </p>
    </MoShell>
  );
}
