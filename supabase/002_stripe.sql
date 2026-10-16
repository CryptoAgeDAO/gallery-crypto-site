-- Gallery Crypto — Stripe 決済の追加
-- schema.sql を実行したあとに、SQL Editor でこのファイルを1回だけ実行します。

-- 商品：価格（米ドル）・売約済み・決済中の一時確保
alter table public.items add column if not exists price_usd integer check (price_usd is null or price_usd > 0);
alter table public.items add column if not exists sold boolean not null default false;
alter table public.items add column if not exists reserved_until timestamptz;
grant select (price_usd, sold) on public.items to anon;

-- サイト設定：一般販売の開始スイッチ（オフの間は当選者リンクからのみ購入可）
alter table public.settings add column if not exists sale_open boolean not null default false;

-- 抽選エントリー：当選と購入リンク
alter table public.entries add column if not exists won boolean not null default false;
alter table public.entries add column if not exists token uuid unique;
alter table public.entries add column if not exists used_at timestamptz;
create policy "entries: admin updates" on public.entries for update using (public.is_admin()) with check (public.is_admin());

-- 注文（Stripe からの通知でサーバーが書き込む。管理者だけが読める）
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items(id) on delete set null,
  entry_id uuid references public.entries(id) on delete set null,
  stripe_session_id text not null unique,
  email text not null default '',
  name text not null default '',
  amount integer not null,
  currency text not null default 'usd',
  shipping jsonb,
  status text not null default 'paid',
  shipped_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;
create policy "orders: admin reads" on public.orders for select using (public.is_admin());
create policy "orders: admin updates" on public.orders for update using (public.is_admin()) with check (public.is_admin());

-- 送料（米ドル・1注文あたり。0 なら送料無料）
alter table public.settings add column if not exists shipping_usd integer not null default 20 check (shipping_usd >= 0);
