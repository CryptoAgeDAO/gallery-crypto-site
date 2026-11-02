import type { Metadata } from 'next';
import BuyButton from '@/components/BuyButton';
import MoShell from '@/components/MoShell';
import { db, paymentsConfigured } from '@/lib/server';
import { photoUrl } from '@/lib/supabase';
import { certNo, metaLine, usd, type Item } from '@/lib/types';
import { getT } from '@/lib/lang';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your purchase — Gallery Crypto', robots: { index: false } };

const COLS = 'id,serial,photos,band,title,year,era,size,tag,stitch,made_in,cond,prov,dealer,published,created_at,price_usd,sold';

function Shell({ title, kicker, children }: { title: string; kicker?: string; children?: React.ReactNode }) {
  return (
    <MoShell title={title} kicker={kicker}>
      {children}
    </MoShell>
  );
}

function Piece({ it, token }: { it: Item; token: string }) {
  const t = getT();
  return (
    <div className="mo-order">
      <div className="mo-dpic">
        {it.photos[0] ? (
          <span className="mo-ht">
            <img src={photoUrl(it.photos[0])} alt={`${it.band} ${it.title}`.trim()} />
          </span>
        ) : (
          <span className="mo-art" />
        )}
      </div>
      <div className="mo-dinfo">
        <p className="mo-no">{t('Item', '作品')} {certNo(it)}</p>
        <h2 className="mo-dh">{it.band || t('Untitled', '無題')}</h2>
        {it.title && <p className="mo-dsub">{it.title}</p>}
        <p className="mo-fine">{metaLine(it)}</p>
        <div className="mo-coupon small">
          <p className="mo-cut" aria-hidden>
            ✂ - - - - - - - - - - - - - - - - - - - - - - - -
          </p>
          {it.sold ? (
            <p className="mo-price">{t('Sold', '売約済み')}</p>
          ) : it.price_usd ? (
            <>
              <p className="mo-price">{usd(it.price_usd)}</p>
              <BuyButton itemId={it.id} token={token} />
            </>
          ) : (
            <p className="mo-price">
              {t('Price', '価格')} <span>{t('coming soon', '近日公開')}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
export default async function Buy({ params }: { params: { token: string } }) {
  const token = params.token;
  const t = getT();
  const bad = <Shell title={t('Link not valid', 'リンクが無効です')}><p className="mo-lead">{t('Please check the link in your email.', 'メールに記載のリンクをご確認ください。')}</p></Shell>;
  if (!paymentsConfigured || !/^[0-9a-f-]{36}$/i.test(token)) return bad;
  const d = db();
  const { data: entry } = await d.from('entries').select('id,item_id,won,used_at').eq('token', token).maybeSingle();
  if (!entry || !entry.won) return bad;
  if (entry.used_at) return <Shell title={t('Already purchased', '購入済みです')}><p className="mo-lead">{t('This link has been used. Thank you — your order confirmation was sent by email.', 'このリンクは使用済みです。ありがとうございました。ご注文の確認はメールでお送りしています。')}</p></Shell>;

  let q = d.from('items').select(COLS).eq('published', true);
  q = entry.item_id ? q.eq('id', entry.item_id) : q.eq('sold', false).not('price_usd', 'is', null);
  const { data } = await q.order('serial', { ascending: false });
  const items = (data as unknown as Item[]) || [];

  return (
    <Shell title={t('You won the draw!', '抽選に当選しました！')} kicker={t("Winner's order form", '当選者の注文フォーム')}>
      <p className="mo-lead">
        {entry.item_id ? t('This piece is reserved for you to buy.', 'この作品はあなたのために確保されています。') : t('Choose one piece from the archive.', 'アーカイブから1点お選びください。')} {t('The link works once and is for you only.', 'このリンクは1回限り、ご本人専用です。')}
      </p>
      {items.length ? items.map((it) => <Piece key={it.id} it={it} token={token} />) : <p className="mo-lead">{t('No pieces are available right now.', 'いま購入できる作品はありません。')}</p>}
    </Shell>
  );
}
