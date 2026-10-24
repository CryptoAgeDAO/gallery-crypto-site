import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';

export const metadata: Metadata = { title: 'Thank you — Gallery Crypto', robots: { index: false } };

export default function Thanks() {
  return (
    <MoShell title="Thank you!" kicker="Order received">
      <p className="mo-lead">
        Your payment is complete. A receipt has been sent to your email, and we will email you again with tracking when your piece ships. Its provenance certificate will be issued to you at the same time.
      </p>
      <p>
        <a className="mo-btn" href="/">
          Back to the catalog
        </a>
      </p>
    </MoShell>
  );
}
