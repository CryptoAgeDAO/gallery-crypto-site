import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';

export const metadata: Metadata = { title: 'Legal notice — Gallery Crypto', robots: { index: false } }; // 販売開始までは検索に出さない

// 特定商取引法に基づく表記。［ ］の部分を開業後に書き換えてください。
// 個人事業の場合、住所・電話番号は「請求があれば遅滞なく開示します」とすることもできます。
const ROWS: [string, string][] = [
  ['Seller', 'Gallery Crypto'],
  ['Representative', '[Your name]'],
  ['Address', 'Disclosed without delay upon request.'],
  ['Phone', 'Disclosed without delay upon request.'],
  ['Email', '[contact email]'],
  ['Price', 'Shown on each item page in US dollars, tax included where applicable.'],
  ['Additional fees', 'Shipping (shown at checkout). Import duties and taxes in the destination country are paid by the buyer.'],
  ['Payment', 'Credit card, Apple Pay, Google Pay (processed by Stripe).'],
  ['Payment timing', 'At the time of purchase.'],
  ['Delivery', 'Shipped within 7 days of payment.'],
  ['Returns', 'Vintage, one-of-a-kind items: returns accepted only if the item differs from its description, within 7 days of delivery.'],
  ['Presale draw', 'Entry is free. Winning gives the right to purchase at the listed price; no purchase is required to enter.'],
];

export default function Legal() {
  return (
    <MoShell title="Legal notice" kicker="The fine print">
      <div className="mo-legal">
        <dl>
          {ROWS.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </MoShell>
  );
}
