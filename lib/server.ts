// サーバー専用。ブラウザに送られるコードからは import しないこと。
import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

let admin: SupabaseClient | null = null;

// Vercel の Supabase 連携は SECRET_KEY、手動設定なら SERVICE_ROLE_KEY
function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
}
let stripeClient: Stripe | null = null;

export const paymentsConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && serviceKey() && process.env.STRIPE_SECRET_KEY,
);

// 管理者権限のデータベース接続（行レベルの保護を通らないので、サーバー内の決まった処理だけで使う）
export function db(): SupabaseClient {
  if (!admin) {
    admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, serviceKey() as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export function stripe(): Stripe {
  if (!stripeClient) stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  return stripeClient;
}

export function siteUrl(req?: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, '');
  if (req) return new URL(req.url).origin;
  return 'http://localhost:3000';
}
