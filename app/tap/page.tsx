import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import MoShell from '@/components/MoShell';
import { verifyTap } from '@/lib/sunServer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tag check — Gallery Crypto', robots: { index: false } };

const TEXT: Record<string, { title: string; body: string }> = {
  replayed: { title: 'This link was already used', body: 'Each tap of the tag makes a new one-time code, and every code works once. If you are holding the piece, tap the tag again. If someone sent you this link, it does not prove they have the real tag.' },
  unlinked: { title: 'Genuine Gallery Crypto tag', body: 'The chip passed the check, but it is not linked to a sealed passport yet.' },
  invalid: { title: 'This tag could not be verified', body: 'The code did not match a Gallery Crypto chip. The tag may be a copy, or the link may be incomplete. Tap the tag again, and contact us if it keeps failing.' },
  unconfigured: { title: 'Tag checks are not switched on yet', body: 'This site is not connected to its database yet.' },
  error: { title: 'Something went wrong', body: 'We could not finish the check. Please tap the tag again in a moment.' },
};

// NFC タグが開くページ。本物なら、そのままパスポートへ（「いまタップで確認済み」の印つき）
export default async function TapPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const r = await verifyTap(searchParams.e || searchParams.picc_data, searchParams.c || searchParams.cmac);
  if (r.status === 'authentic' && r.cert) redirect(`/passport/${r.cert}?tap=${r.token}`);
  const t = TEXT[r.status] || TEXT.error;
  return (
    <MoShell title={t.title} kicker="NFC tag check">
      <p className="mo-lead">{t.body}</p>
      {r.status === 'replayed' && r.cert && <p><a href={`/passport/${r.cert}`}>Open the passport for {r.cert}</a> (record only, without a live tag check).</p>}
      <p><a href="/demo/nfc">How the tag works</a></p>
    </MoShell>
  );
}
