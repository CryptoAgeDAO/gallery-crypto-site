import type { Metadata } from 'next';
import BuyButton from '@/components/BuyButton';
import { db, paymentsConfigured } from '@/lib/server';
import { photoUrl } from '@/lib/supabase';
import { certNo, metaLine, usd, type Item } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your purchase — Gallery Crypto', robots: { index: false } };

const COLS = 'id,serial,photos,band,title,year,era,size,tag,stitch,made_in,cond,prov,dealer,published,created_at,price_usd,sold';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <header className="hd">
        <a className="wm" href="/">Gallery Crypto</a>
      </header>
      <main className="block" style={{ borderTop: 0 }}>{children}</main>
    </div>
  );
}

function Piece({ it, token }: { it: Item; token: string }) {
  return (
    <div className="certcard">
      <div className="ph">{it.photos[0] ? <img src={photoUrl(it.photos[0])} alt="" /> : <span className="noimg">No image</span>}</div>
      <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
        <span className="nm" style={{ fontWeight: 600 }}>{it.band || 'Untitled'}</span>
        {it.title && <span className="sub">{it.title}</span>}
        <span className="sub">{[certNo(it), metaLine(it)].filter(Boolean).join(' · ')}</span>
        {it.sold ? <p className="price">Sold</p> : it.price_usd ? (
          <>
            <p className="price">{usd(it.price_usd)}</p>
            <BuyButton itemId={it.id} token={token} />
          </>
        ) : <p className="price">Price coming soon</p>}
      </div>
    </div>
  );
}

export default async function Buy({ params }: { params: { token: string } }) {
  const token = params.token;
  if (!paymentsConfigured || !/^[0-9a-f-]{36}$/i.test(token)) return <Shell><h2>Link not valid</h2><p className="lead">Please check the link in your email.</p></Shell>;
  const d = db();
  const { data: entry } = await d.from('entries').select('id,item_id,won,used_at').eq('token', token).maybeSingle();
  if (!entry || !entry.won) return <Shell><h2>Link not valid</h2><p className="lead">Please check the link in your email.</p></Shell>;
  if (entry.used_at) return <Shell><h2>Already purchased</h2><p className="lead">This link has been used. Thank you — your order confirmation was sent by email.</p></Shell>;

  let q = d.from('items').select(COLS).eq('published', true);
  q = entry.item_id ? q.eq('id', entry.item_id) : q.eq('sold', false).not('price_usd', 'is', null);
  const { data } = await q.order('serial', { ascending: false });
  const items = (data as unknown as Item[]) || [];

  return (
    <Shell>
      <h2>You won the draw</h2>
      <p className="lead">
        {entry.item_id ? 'This piece is reserved for you to buy.' : 'Choose one piece from the archive.'} The link works once and is for you only.
      </p>
      {items.length ? items.map((it) => <Piece key={it.id} it={it} token={token} />) : <p className="empty">No pieces are available right now.</p>}
    </Shell>
  );
}
