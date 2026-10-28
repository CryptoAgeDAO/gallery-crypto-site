import type { Metadata } from 'next';
import QRCode from 'qrcode';
import MoShell from '@/components/MoShell';
import TeeViewerLazy from '@/components/TeeViewerLazy';
import { DEMO_ITEMS, demoCert } from '@/lib/demoData';
import { siteUrl } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '3D mockup — Gallery Crypto', description: 'Turn a demo piece in 3D, with its neck label, side label and a hang tag whose QR really opens its passport.' };

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
      <p className="mo-lead">Turn it, come close, look at the labels. The hang tag&apos;s code is live — scan it from the screen and the piece&apos;s passport opens on your phone.</p>
      <TeeViewerLazy pieces={pieces} />
    </MoShell>
  );
}
