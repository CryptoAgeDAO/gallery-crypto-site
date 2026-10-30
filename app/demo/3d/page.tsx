import type { Metadata } from 'next';
import QRCode from 'qrcode';
import MoShell from '@/components/MoShell';
import Demo3D from '@/components/JacketViewerLazy';
import { DEMO_ITEMS, demoCert } from '@/lib/demoData';
import { siteUrl } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '3D mockup — Gallery Crypto', description: 'Turn a demo MA-1 flight jacket in 3D, pull its NFC neck tag apart, and scan the hang tag to open its passport.' };

// 3D モックアップ（デモ作品6点）
export default async function ThreeD() {
  const base = siteUrl();
  const pieces = await Promise.all(
    DEMO_ITEMS.map(async (it) => ({
      n: it.n, band: it.band, title: it.title, year: it.year, cert: demoCert(it.n), fabric: it.fabric,
      qr: await QRCode.toString(`${base}/passport/${demoCert(it.n)}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } }),
    })),
  );
  return (
    <MoShell title="Every piece, in 3D" kicker="Demo · 3D mockup">
      <p className="mo-lead">Turn it, come close, look inside the collar. The NFC tag is sewn into the back neck — pull it apart to see what is inside. The hang tag&apos;s code is live: scan it from the screen and the piece&apos;s passport opens on your phone.</p>
      <Demo3D pieces={pieces} jacket={{ cert: demoCert(1), qr: pieces[0].qr }} />
    </MoShell>
  );
}
