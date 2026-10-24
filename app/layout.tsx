import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Gallery Crypto — Founder\'s Archive',
  description: "American band tees from the '80s to the 2000s, each recorded with its provenance. Free presale draw — on sale in 2027.",
  openGraph: {
    title: "Gallery Crypto — Founder's Archive",
    description: "American band tees from the '80s to the 2000s, each a 1-of-1 with its provenance. Free presale draw for 2027.",
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
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Pixelify+Sans:wght@400;600;700&family=Press+Start+2P&family=Courier+Prime:wght@400;700&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+JP:wght@400;500;700;900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
