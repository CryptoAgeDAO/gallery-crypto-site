import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';

export const metadata: Metadata = { title: 'Privacy — Gallery Crypto' };

// プライバシーポリシー（抽選エントリー・問い合わせでメールアドレスを預かるため）
const ROWS: [string, string][] = [
  ['What we collect / 取得する情報', 'Your email address when you enter the draw; your name, email and message when you contact us. / 抽選エントリー時のメールアドレス、お問い合わせ時のお名前・メールアドレス・本文'],
  ['Why / 利用目的', 'To run the presale draw, contact winners, and reply to your message. We do not send newsletters without your consent. / 抽選の実施、当選のご連絡、お問い合わせへの返信のため。同意なくメールマガジン等は送りません。'],
  ['Sharing / 第三者提供', 'We do not sell or share your information. It is stored with our service providers (Supabase for the database, Vercel for hosting, Resend for email) only to run this site. / 第三者への販売・提供はしません。サイト運営のための委託先（Supabase・Vercel・Resend）に保管されます。'],
  ['Retention / 保管期間', 'Until the 2027 release is complete, or until you ask us to delete it. / 2027年の販売が終わるまで、またはご依頼があるまで'],
  ['Your choices / 削除・訂正', 'Ask us through the contact form to see, correct or delete your information. / お問い合わせフォームからご連絡いただければ、開示・訂正・削除に対応します。'],
  ['Operator / 運営', 'Gallery Crypto (Tokyo, Japan) / Gallery Crypto（東京）'],
];

export default function Privacy() {
  return (
    <MoShell title="Privacy · プライバシーポリシー" kicker="The fine print">
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
        <a href="/#contact">Contact us</a>
      </p>
    </MoShell>
  );
}
