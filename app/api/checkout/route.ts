import { NextResponse } from 'next/server';
import { db, stripe, siteUrl, paymentsConfigured } from '@/lib/server';
import { certNo } from '@/lib/types';
import { photoUrl } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HOLD_MIN = 31; // Stripe の決済画面は最短30分で失効。その間は他の人が買えないよう確保する
const COUNTRIES = ['US', 'CA', 'JP', 'GB', 'AU', 'FR', 'DE', 'IT', 'ES', 'NL', 'SE', 'KR', 'TW', 'HK', 'SG'] as const;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  if (!paymentsConfigured) return fail(503, 'Payments are not open yet.');
  let body: { item_id?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Bad request.');
  }
  const itemId = String(body.item_id || '');
  const token = body.token ? String(body.token) : '';
  if (!/^[0-9a-f-]{36}$/i.test(itemId) || (token && !/^[0-9a-f-]{36}$/i.test(token))) return fail(400, 'Bad request.');

  const d = db();
  const [{ data: item }, { data: settings }] = await Promise.all([
    d.from('items').select('id,serial,band,title,year,photos,price_usd,sold,published').eq('id', itemId).maybeSingle(),
    d.from('settings').select('sale_open,shipping_usd').eq('id', 1).maybeSingle(),
  ]);
  if (!item || !item.published || !item.price_usd) return fail(404, 'This piece is not for sale.');
  if (item.sold) return fail(409, 'This piece has been sold.');

  // 購入できる人：一般販売中なら誰でも、そうでなければ当選者リンクを持つ人だけ
  let entry: { id: string; email: string; item_id: string | null } | null = null;
  if (token) {
    const { data } = await d.from('entries').select('id,email,item_id,won,used_at').eq('token', token).maybeSingle();
    if (!data || !data.won || data.used_at) return fail(403, 'This purchase link is no longer valid.');
    if (data.item_id && data.item_id !== itemId) return fail(403, 'This link is for a different piece.');
    entry = data;
  } else if (!settings?.sale_open) {
    return fail(403, 'Sales open in 2027. Enter the draw for a chance to buy first.');
  }

  // 同時に2人が買えないよう、決済画面の有効時間だけ確保する
  const now = new Date();
  const until = new Date(now.getTime() + HOLD_MIN * 60_000);
  const { data: held } = await d
    .from('items')
    .update({ reserved_until: until.toISOString() })
    .eq('id', itemId)
    .eq('sold', false)
    .or(`reserved_until.is.null,reserved_until.lt.${now.toISOString()}`)
    .select('id');
  if (!held?.length) return fail(409, 'Someone is checking out this piece right now. Please try again in 30 minutes.');

  const base = siteUrl(req);
  const shipping = Number(settings?.shipping_usd ?? 0);
  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: item.price_usd * 100,
            product_data: {
              name: [item.band, item.title].filter(Boolean).join(' — ') || 'Vintage band tee',
              description: `${certNo(item)}${item.year ? ' · ' + item.year : ''} · Gallery Crypto Founder's Archive`,
              images: item.photos?.[0] ? [photoUrl(item.photos[0])] : undefined,
            },
          },
        },
      ],
      shipping_address_collection: { allowed_countries: [...COUNTRIES] },
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: shipping ? 'Tracked shipping' : 'Free shipping',
            type: 'fixed_amount',
            fixed_amount: { amount: shipping * 100, currency: 'usd' },
          },
        },
      ],
      customer_email: entry?.email || undefined,
      expires_at: Math.floor(now.getTime() / 1000) + 30 * 60,
      metadata: { item_id: item.id, entry_id: entry?.id || '' },
      payment_intent_data: { metadata: { item_id: item.id, cert: certNo(item) } },
      success_url: `${base}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: token ? `${base}/buy/${token}` : `${base}/#archive`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    await d.from('items').update({ reserved_until: null }).eq('id', itemId).eq('sold', false);
    console.error('checkout', e);
    return fail(500, 'Checkout could not be started. Please try again.');
  }
}
