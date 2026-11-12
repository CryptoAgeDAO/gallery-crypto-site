import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Studio — Gallery Crypto',
  description: 'Photo to 3D and ghost mannequin, processed on your device.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'GC Studio', statusBarStyle: 'default' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
