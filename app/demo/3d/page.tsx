import type { Metadata } from 'next';
import QRCode from 'qrcode';
import MoShell from '@/components/MoShell';
import CapViewerLazy from '@/components/CapViewerLazy';
import { DEMO_ITEMS, demoCert } from '@/lib/demoData';
import { siteUrl } from '@/lib/server';
import { getT } from '@/lib/lang';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '3D mockup — Gallery Crypto', description: 'Turn six demo caps in 3D, pull the NFC tag inside the back apart, and scan the hang tag to open each passport.' };

// 3D モックアップ（デモのキャップ6点）
export default async function ThreeD() {
  const t = getT();
  const base = siteUrl();
  const pieces = await Promise.all(
    DEMO_ITEMS.map(async (it) => ({
      n: it.n, band: it.band, title: it.title, year: it.year, cert: demoCert(it.n), cap: it.cap,
      qr: await QRCode.toString(`${base}/passport/${demoCert(it.n)}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } }),
    })),
  );
  return (
    <MoShell title={t('Every piece, in 3D', 'すべての作品を3Dで')} kicker={t('Demo · 3D mockup', 'デモ · 3Dモックアップ')}>
      <p className="mo-lead">{t("Turn it, come close, look inside. The NFC tag is sewn inside the back of each cap — pull it apart to see what is in it. The hang tag's code is live: scan it from the screen and the piece's passport opens on your phone.", '回して、近づいて、中をのぞいてください。NFCタグはどのキャップも後ろの内側に縫い込まれています。分解して中身を見られます。下げ札のコードは本物です。画面から読み取ると、その作品のパスポートがスマホで開きます。')}</p>
      <CapViewerLazy pieces={pieces} />
    </MoShell>
  );
}
