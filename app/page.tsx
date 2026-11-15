import type { Metadata } from 'next';
import Hub from '@/components/Hub';

export const metadata: Metadata = {
  title: 'Gallery Crypto — demo',
  description: 'RWA vintage & collabs, a simple vintage shop, art projects, and fair event lotteries — one demo. All samples are fictional.',
};

// トップ：4本柱のデモ（以前のアーカイブページは /archive）
export default function Page() {
  return <Hub />;
}
