import type { Metadata } from 'next';
import BuyButton from '@/components/BuyButton';
import MoShell from '@/components/MoShell';
import { db, paymentsConfigured } from '@/lib/server';
import { photoUrl } from '@/lib/supabase';
import { certNo, metaLine, usd, type Item } from '@/lib/types';

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
        <p className="mo-no">Item {certNo(it)}</p>
        <h2 className="mo-dh">{it.band || 'Untitled'}</h2>
        {it.title && <p className="mo-dsub">{it.title}</p>}
        <p className="mo-fine">{metaLine(it)}</p>
        <div className="mo-coupon small">
          <p className="mo-cut" aria-hidden>
            ✂ - - - - - - - - - - - - - - - - - - - - - - - -
          </p>
          {it.sold ? (
            <p className="mo-price">Sold</p>
          ) : it.price_usd ? (
            <>
              <p className="mo-price">{usd(it.price_usd)}</p>
              <BuyButton itemId={it.id} token={token} />
            </>
          ) : (
            <p className="mo-price">
              Price <span>coming soon</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
export default async function Buy({ params }: { params: { token: string } }) {
  const token = params.token;
  if (!paymentsConfigured || !/^[0-9a-f-]{36}$/i.test(token)) return <Shell title="Link not valid"><p className="mo-lead">Please check the link in your email.</p></Shell>;
  const d = db();
  const { data: entry } = await d.from('entries').select('id,item_id,won,used_at').eq('token', token).maybeSingle();
  if (!entry || !entry.won) return <Shell title="Link not valid"><p className="mo-lead">Please check the link in your email.</p></Shell>;
  if (entry.used_at) return <Shell title="Already purchased"><p className="mo-lead">This link has been used. Thank you — your order confirmation was sent by email.</p></Shell>;

  let q = d.from('items').select(COLS).eq('published', true);
  q = entry.item_id ? q.eq('id', entry.item_id) : q.eq('sold', false).not('price_usd', 'is', null);
  const { data } = await q.order('serial', { ascending: false });
  const items = (data as unknown as Item[]) || [];

  return (
    <Shell title="You won the draw!" kicker="Winner's order form">
      <p className="mo-lead">
        {entry.item_id ? 'This piece is reserved for you to buy.' : 'Choose one piece from the archive.'} The link works once and is for you only.
      </p>
      {items.length ? items.map((it) => <Piece key={it.id} it={it} token={token} />) : <p className="mo-lead">No pieces are available right now.</p>}
    </Shell>
  );
}
