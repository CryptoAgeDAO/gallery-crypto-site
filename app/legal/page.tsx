import type { Metadata } from 'next';
import MoShell from '@/components/MoShell';
import { getT } from '@/lib/lang';

export const metadata: Metadata = { title: 'Legal notice — Gallery Crypto', robots: { index: false } }; // 販売開始までは検索に出さない

// 特定商取引法に基づく表記。［ ］の部分を開業後に書き換えてください。
// 個人事業の場合、住所・電話番号は「請求があれば遅滞なく開示します」とすることもできます。
export default function Legal() {
  const t = getT();
  const ROWS: [string, string][] = [
    [t('Seller', '販売業者'), 'Gallery Crypto'],
    [t('Representative', '運営責任者'), t('[Your name]', '［氏名］')],
    [t('Address', '所在地'), t('Disclosed without delay upon request.', '請求があれば遅滞なく開示します。')],
    [t('Phone', '電話番号'), t('Disclosed without delay upon request.', '請求があれば遅滞なく開示します。')],
    [t('Email', 'メールアドレス'), t('[contact email]', '［連絡先メール］')],
    [t('Price', '販売価格'), t('Shown on each item page in US dollars, tax included where applicable.', '各商品ページに米ドルで表示（該当する場合は税込）。')],
    [t('Additional fees', '商品代金以外の必要料金'), t('Shipping (shown at checkout). Import duties and taxes in the destination country are paid by the buyer.', '送料（購入画面に表示）。お届け先の国の関税・税金はお客様のご負担です。')],
    [t('Payment', 'お支払い方法'), t('Credit card, Apple Pay, Google Pay (processed by Stripe).', 'クレジットカード、Apple Pay、Google Pay（Stripe が処理）。')],
    [t('Payment timing', 'お支払い時期'), t('At the time of purchase.', 'ご購入時。')],
    [t('Delivery', '引渡し時期'), t('Shipped within 7 days of payment.', 'お支払いから7日以内に発送します。')],
    [t('Returns', '返品・交換'), t('Vintage, one-of-a-kind items: returns accepted only if the item differs from its description, within 7 days of delivery.', 'ヴィンテージの一点ものにつき、商品が説明と異なる場合に限り、到着後7日以内の返品を受け付けます。')],
    [t('Presale draw', '先行抽選'), t('Entry is free. Winning gives the right to purchase at the listed price; no purchase is required to enter.', '応募は無料です。当選すると表示価格で購入する権利が得られます。応募に購入は不要です。')],
  ];
  return (
    <MoShell title={t('Legal notice', '特定商取引法に基づく表記')} kicker={t('The fine print', '規約')}>
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
