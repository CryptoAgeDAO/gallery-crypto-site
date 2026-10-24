import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';

export const metadata: Metadata = { title: 'Legal notice — Gallery Crypto', robots: { index: false } }; // 販売開始までは検索に出さない

// 特定商取引法に基づく表記。［ ］の部分を開業後に書き換えてください。
// 個人事業の場合、住所・電話番号は「請求があれば遅滞なく開示します」とすることもできます。
const ROWS: [string, string][] = [
  ['Seller / 販売業者', 'Gallery Crypto'],
  ['Representative / 運営責任者', '[Your name / 氏名]'],
  ['Address / 所在地', 'Disclosed without delay upon request. / 請求があれば遅滞なく開示します。'],
  ['Phone / 電話番号', 'Disclosed without delay upon request. / 請求があれば遅滞なく開示します。'],
  ['Email / メール', '[contact email]'],
  ['Price / 販売価格', 'Shown on each item page in US dollars, tax included where applicable. / 各商品ページに米ドルで表示'],
  ['Additional fees / 商品代金以外の費用', 'Shipping (shown at checkout). Import duties and taxes in the destination country are paid by the buyer. / 送料（決済画面に表示）。お届け先の国の関税・輸入税は購入者負担'],
  ['Payment / 支払方法', 'Credit card, Apple Pay, Google Pay (processed by Stripe). / クレジットカード、Apple Pay、Google Pay（Stripe による決済）'],
  ['Payment timing / 支払時期', 'At the time of purchase. / 購入手続き時'],
  ['Delivery / 引渡時期', 'Shipped within 7 days of payment. / 決済確認後7日以内に発送'],
  ['Returns / 返品', 'Vintage, one-of-a-kind items: returns accepted only if the item differs from its description, within 7 days of delivery. / 一点物の古着のため、記載と異なる場合のみ到着後7日以内に返品を受け付けます。'],
  ['Presale draw / 抽選', 'Entry is free. Winning gives the right to purchase at the listed price; no purchase is required to enter. / 応募は無料。当選者は表示価格で購入できます。'],
];

export default function Legal() {
  return (
    <MoShell title="Legal notice · 特定商取引法に基づく表記" kicker="The fine print">
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
