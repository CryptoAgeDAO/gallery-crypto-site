import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';

export const metadata: Metadata = { title: 'Privacy — Gallery Crypto' };

// プライバシーポリシー（抽選エントリー・問い合わせでメールアドレスを預かるため）
const ROWS: [string, string][] = [
  ['What we collect', 'Your email address when you enter the draw; your name, email and message when you contact us.'],
  ['Why', 'To run the presale draw, contact winners, and reply to your message. We do not send newsletters without your consent.'],
  ['Sharing', 'We do not sell or share your information. It is stored with our service providers (Supabase for the database, Vercel for hosting, Resend for email) only to run this site.'],
  ['Retention', 'Until the 2027 release is complete, or until you ask us to delete it.'],
  ['Your choices', 'Ask us through the contact form to see, correct or delete your information.'],
  ['Operator', 'Gallery Crypto (Tokyo, Japan)'],
];

export default function Privacy() {
  return (
    <MoShell title="Privacy policy" kicker="The fine print">
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
