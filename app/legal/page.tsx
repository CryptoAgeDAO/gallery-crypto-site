import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Legal notice — Gallery Crypto' };

// 特定商取引法に基づく表記。［ ］の部分を開業後に書き換えてください。
// 個人事業の場合、住所・電話番号は「請求があれば遅滞なく開示します」とすることもできます。
const ROWS: [string, string][] = [
  ['Seller / 販売業者', 'Gallery Crypto'],
  ['Representative / 運営責任者', '[Your name / 氏名]'],
  ['Address / 所在地', 'Disclosed without delay upon request. / 請求があれば遅滞なく開示します。'],
  ['Phone / 電話番号', 'Disclosed without delay upon request. / 請求があれば遅滞なく開示します。'],
  ['Email / メール', '[contact email]'],
  ['Price / 販売価格', 'Shown on each item page at launch (2027). / 各商品ページに表示（2027年）'],
  ['Additional fees / 商品代金以外の費用', 'Shipping, and import duties where applicable. / 送料、および該当する場合は輸入関税'],
  ['Payment / 支払方法', 'Credit card, Apple Pay. / クレジットカード、Apple Pay'],
  ['Payment timing / 支払時期', 'At the time of purchase. / 購入手続き時'],
  ['Delivery / 引渡時期', 'Shipped within 7 days of payment. / 決済確認後7日以内に発送'],
  ['Returns / 返品', 'Vintage, one-of-a-kind items: returns accepted only if the item differs from its description, within 7 days of delivery. / 一点物の古着のため、記載と異なる場合のみ到着後7日以内に返品を受け付けます。'],
  ['Presale draw / 抽選', 'Entry is free. Winning gives the right to purchase at the listed price; no purchase is required to enter. / 応募は無料。当選者は表示価格で購入できます。'],
];

export default function Legal() {
  return (
    <div className="site">
      <header className="hd">
        <a className="wm" href="/">Gallery Crypto</a>
      </header>
      <main className="legal">
        <h1>Legal notice · 特定商取引法に基づく表記</h1>
        <dl>
          {ROWS.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </main>
    </div>
  );
}
