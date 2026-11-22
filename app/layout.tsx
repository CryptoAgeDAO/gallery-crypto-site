import '@fontsource/anton/400.css';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/500.css';
import '@fontsource/oswald/600.css';
import '@fontsource/dela-gothic-one/400.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { LangProvider } from '@/components/Lang';
import { CartProvider } from '@/components/cart/Cart';
import EnterGate from '@/components/EnterGate';
import { getLang } from '@/lib/lang';

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
  const lang = getLang();
  return (
    <html lang={lang} data-lang={lang} translate="no">
      <head>
        <meta name="google" content="notranslate" />
        {/* 入口の一枚：このタブでまだ入っていなければ、表示の前から出しておく（ちらつき防止） */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(!sessionStorage.getItem('gc-entered')&&!/^\\/(admin|passport|verify|tap|buy|thanks|ticket|labels|ledger|proof|spec|privacy|legal)/.test(location.pathname))document.documentElement.classList.add('gate')}catch(e){}" }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+JP:wght@400;500&display=swap"
        />
      </head>
      <body>
        <LangProvider lang={lang}><CartProvider>{children}<EnterGate /></CartProvider></LangProvider>
      </body>
    </html>
  );
}
