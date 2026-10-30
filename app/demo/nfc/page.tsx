import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';
import NfcDiagram from '@/components/NfcDiagram';
import NfcSystem3DLazy from '@/components/NfcSystem3DLazy';

export const metadata: Metadata = {
  title: 'How the NFC tag works — Gallery Crypto',
  description: 'The NFC label inside every piece, and how a tap becomes a proof: one-time chip code, two signatures, a Solana anchor and an offline check.',
};

// NFC タグとその仕組み：図（2D）と 3D
export default function NfcPage() {
  return (
    <MoShell title="One tap, one proof" kicker="Demo · NFC tag and system">
      <p className="mo-lead">Every piece carries a small NFC label in its side seam. Tap it with any phone and the piece proves itself — with a code the chip makes once, two signatures, and a public timestamp. No app, and it still works with no signal.</p>

      <h2 className="pl-h">The system at a glance</h2>
      <NfcDiagram />

      <h2 className="pl-h">In 3D</h2>
      <p className="mo-lead">Open the label layer by layer, then follow a tap through the whole system.</p>
      <NfcSystem3DLazy />

      <p className="mo-links">
        <a href="/demo/3d">See the label on the garment →</a>
        <a href="/proof">Proof lab →</a>
        <a href="/spec">Specification →</a>
      </p>
    </MoShell>
  );
}
