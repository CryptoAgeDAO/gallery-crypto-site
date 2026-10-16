import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { db, stripe } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stripe からの通知（支払い完了・決済画面の失効）を受けて、売約済みにする
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get('stripe-signature');
  if (!secret || !sig) return new NextResponse('Not configured', { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), sig, secret);
  } catch {
    return new NextResponse('Bad signature', { status: 400 });
  }

  const d = db();
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status !== 'paid') return NextResponse.json({ ok: true });
    const itemId = s.metadata?.item_id || null;
    const entryId = s.metadata?.entry_id || null;
    const { error } = await d.from('orders').upsert(
      {
        item_id: itemId,
        entry_id: entryId,
        stripe_session_id: s.id,
        email: s.customer_details?.email || '',
        name: s.shipping_details?.name || s.customer_details?.name || '',
        amount: s.amount_total || 0,
        currency: s.currency || 'usd',
        shipping: s.shipping_details?.address || null,
      },
      { onConflict: 'stripe_session_id', ignoreDuplicates: true },
    );
    if (error) return new NextResponse('DB error', { status: 500 }); // Stripe が自動で再送する
    if (itemId) await d.from('items').update({ sold: true, reserved_until: null }).eq('id', itemId);
    if (entryId) await d.from('entries').update({ used_at: new Date().toISOString() }).eq('id', entryId);
  }

  if (event.type === 'checkout.session.expired') {
    const s = event.data.object as Stripe.Checkout.Session;
    const itemId = s.metadata?.item_id;
    if (itemId) await d.from('items').update({ reserved_until: null }).eq('id', itemId).eq('sold', false);
  }

  return NextResponse.json({ ok: true });
}
