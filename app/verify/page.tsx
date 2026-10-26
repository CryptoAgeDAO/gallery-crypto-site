import type { Metadata, Viewport } from 'next';
import MoShell from '@/components/MoShell';
import VerifyApp from '@/components/VerifyApp';

export const metadata: Metadata = {
  title: 'Verify — Gallery Crypto',
  description: 'Check a Gallery Crypto provenance proof. Works offline once opened.',
  manifest: '/manifest.webmanifest',
  icons: { apple: '/gc-verify.svg' },
  appleWebApp: { capable: true, title: 'GC Verify', statusBarStyle: 'default' },
};
export const viewport: Viewport = { themeColor: '#111111' };

// オフライン検証アプリ。QR・NFC の小さな証明や、保存した証明ファイルを通信なしで照合する
export default function VerifyPage() {
  return (
    <MoShell title="Verify a piece" kicker="Offline verifier · GCPP/2">
      <VerifyApp />
    </MoShell>
  );
}
