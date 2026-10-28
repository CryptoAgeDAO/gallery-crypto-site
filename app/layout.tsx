import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Gallery Crypto — Founder\'s Archive',
  description: "American band tees from the '80s to the 2000s, each recorded with its provenance. Free presale draw — release 2027, date TBA.",
  openGraph: {
    title: "Gallery Crypto — Founder's Archive",
    description: "American band tees from the '80s to the 2000s, each a 1-of-1 with its provenance. Free presale draw — release 2027, date TBA.",
    type: 'website',
  },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Cormorant+Garamond:wght@500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+JP:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
