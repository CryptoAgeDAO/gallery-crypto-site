import type { Metadata } from 'next';
import Hub from '@/components/Hub';

export const metadata: Metadata = {
  title: 'Gallery Crypto — demo',
  description: 'RWA vintage & collabs, a simple vintage shop, art projects, and fair event lotteries — one demo. All samples are fictional.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://gallery-crypto-site.vercel.app'),
  openGraph: {
    title: 'Gallery Crypto',
    description: 'Real things, with a record you can check.',
    type: 'website',
    images: [{ url: '/media/og.jpg', width: 1200, height: 630, alt: 'Gallery Crypto — real things, with a record you can check' }],
  },
  twitter: { card: 'summary_large_image', images: ['/media/og.jpg'] },
};

// トップ：4本柱のデモ（以前のアーカイブページは /archive）
export default function Page() {
  return <Hub />;
}
