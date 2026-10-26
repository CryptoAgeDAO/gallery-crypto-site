import type { Metadata } from 'next';
import QRCode from 'qrcode';
import MoShell from '@/components/MoShell';
import PassportView from '@/components/PassportView';
import { demoPassport, getPassport } from '@/lib/passportPublic';
import { siteUrl } from '@/lib/server';
import { photoUrl } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { cert: string } }): Promise<Metadata> {
  return { title: `${params.cert.toUpperCase()} — Provenance passport — Gallery Crypto`, description: 'A signed, permanent record of where this piece came from and what it is made of.' };
}

// NFC タグや QR から開く、一点ごとの来歴パスポート
export default async function PassportPage({ params }: { params: { cert: string } }) {
  const cert = params.cert.toUpperCase();
  const b = cert === 'GC-DEMO' ? demoPassport() : await getPassport(cert);
  if (!b)
    return (
      <MoShell title="Passport not found" kicker="Provenance">
        <p className="mo-lead">This piece has no sealed record yet. See how passports work in the <a href="/proof">Proof Lab</a>.</p>
      </MoShell>
    );
  const url = `${siteUrl()}/passport/${b.cert}`;
  const qr = await QRCode.toString(url, { type: 'svg', margin: 0, color: { dark: '#111111', light: '#00000000' } });
  const photo = b.item?.photos?.[0];
  return (
    <MoShell title={b.item ? `${b.item.band}${b.item.title ? ` — ${b.item.title}` : ''}` : b.cert} kicker={`Provenance passport · ${b.cert}`}>
      {photo && (
        <div className="pp-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl(photo)} alt="" />
        </div>
      )}
      <PassportView b={b} qr={qr} url={url} />
    </MoShell>
  );
}
