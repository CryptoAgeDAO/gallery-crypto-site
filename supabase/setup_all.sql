-- Gallery Crypto — データベースの初期設定（全部入り・1回貼って Run するだけ）
-- schema.sql ＋ 002_stripe.sql ＋ 003_cards_sound.sql をまとめたものです。
-- 管理者メールは conductor80s@gmail.com にしてあります（違うメールでログインする場合は最後の方の該当行を書き換え）。
-- 2回実行してもエラーにならないようにしてあります。

-- Gallery Crypto — データベースの初期設定
-- Supabase の SQL Editor に貼り付けて、1回だけ実行します。

-- 管理者 ---------------------------------------------------------------
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- サイトの文言 ---------------------------------------------------------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  headline text not null default 'Founder''s Archive',
  lead text not null default '',
  launch text not null default 'On sale in 2027 · Lottery release',
  instagram text not null default '',
  email text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.settings (id, lead) values (1,
  'A personal archive of American band tees from the ''80s to the 2000s, collected over the years by the founder of Gallery Crypto. Every piece is recorded with its provenance, and the whole collection goes on sale together in 2027.')
on conflict (id) do nothing;
alter table public.settings enable row level security;
drop policy if exists "settings: anyone reads" on public.settings;
create policy "settings: anyone reads" on public.settings for select using (true);
drop policy if exists "settings: admin updates" on public.settings;
create policy "settings: admin updates" on public.settings for update using (public.is_admin()) with check (public.is_admin());

-- アーカイブ（バンドT） ------------------------------------------------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  serial bigint generated always as identity,
  photos text[] not null default '{}',
  band text not null default '',
  title text not null default '',
  year text not null default '',
  era text not null default '',
  size text not null default '',
  tag text not null default '',
  stitch boolean not null default false,
  made_in text not null default '',
  cond text not null default '',
  prov text not null default '',
  dealer text not null default '',
  rank text not null default '',
  published boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.items enable row level security;
drop policy if exists "items: anyone reads published" on public.items;
create policy "items: anyone reads published" on public.items for select using (published or public.is_admin());
drop policy if exists "items: admin inserts" on public.items;
create policy "items: admin inserts" on public.items for insert with check (public.is_admin());
drop policy if exists "items: admin updates" on public.items;
create policy "items: admin updates" on public.items for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "items: admin deletes" on public.items;
create policy "items: admin deletes" on public.items for delete using (public.is_admin());
-- ランク（社内用）は一般の閲覧者に見せない
revoke select on public.items from anon;
grant select (id, serial, photos, band, title, year, era, size, tag, stitch, made_in, cond, prov, dealer, published, created_at) on public.items to anon;

-- 抽選エントリー ------------------------------------------------------
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 254 and email like '%@%'),
  item_id uuid references public.items(id) on delete set null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (email, item_id)
);
alter table public.entries enable row level security;
drop policy if exists "entries: anyone enters" on public.entries;
create policy "entries: anyone enters" on public.entries for insert with check (true);
drop policy if exists "entries: admin reads" on public.entries;
create policy "entries: admin reads" on public.entries for select using (public.is_admin());
drop policy if exists "entries: admin deletes" on public.entries;
create policy "entries: admin deletes" on public.entries for delete using (public.is_admin());

-- 問い合わせ ----------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 254 and email like '%@%'),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
drop policy if exists "messages: anyone sends" on public.messages;
create policy "messages: anyone sends" on public.messages for insert with check (true);
drop policy if exists "messages: admin reads" on public.messages;
create policy "messages: admin reads" on public.messages for select using (public.is_admin());
drop policy if exists "messages: admin deletes" on public.messages;
create policy "messages: admin deletes" on public.messages for delete using (public.is_admin());

-- 写真の保存場所 ------------------------------------------------------
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;
drop policy if exists "photos: admin uploads" on storage.objects;
create policy "photos: admin uploads" on storage.objects for insert with check (bucket_id = 'photos' and public.is_admin());
drop policy if exists "photos: admin updates" on storage.objects;
create policy "photos: admin updates" on storage.objects for update using (bucket_id = 'photos' and public.is_admin());
drop policy if exists "photos: admin deletes" on storage.objects;
create policy "photos: admin deletes" on storage.objects for delete using (bucket_id = 'photos' and public.is_admin());

-- 管理者のメールアドレス（書き換えてください） ---------------------------
insert into public.admins (email) values ('conductor80s@gmail.com') on conflict do nothing;


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
drop policy if exists "entries: admin updates" on public.entries;
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
drop policy if exists "orders: admin reads" on public.orders;
create policy "orders: admin reads" on public.orders for select using (public.is_admin());
drop policy if exists "orders: admin updates" on public.orders;
create policy "orders: admin updates" on public.orders for update using (public.is_admin()) with check (public.is_admin());

-- 送料（米ドル・1注文あたり。0 なら送料無料）
alter table public.settings add column if not exists shipping_usd integer not null default 20 check (shipping_usd >= 0);


-- Gallery Crypto — トレーディングカード表示と音楽
-- 002_stripe.sql のあとに、SQL Editor でこのファイルを1回だけ実行します。

-- 商品ごとの音楽：試聴リンク（Spotify など）と、権利をお持ちの音源ファイル
alter table public.items add column if not exists listen text not null default '' check (listen = '' or listen like 'https://%');
alter table public.items add column if not exists audio_path text not null default '';
alter table public.items add column if not exists audio_name text not null default '';
alter table public.items add column if not exists audio_credit text not null default '';
grant select (listen, audio_path, audio_name, audio_credit) on public.items to anon;

-- 音源の保存場所（誰でも再生できる・書き込みは管理者だけ）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', true, 20971520, array['audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/x-wav','audio/webm','audio/ogg'])
on conflict (id) do nothing;
drop policy if exists "audio: admin uploads" on storage.objects;
create policy "audio: admin uploads" on storage.objects for insert with check (bucket_id = 'audio' and public.is_admin());
drop policy if exists "audio: admin updates" on storage.objects;
create policy "audio: admin updates" on storage.objects for update using (bucket_id = 'audio' and public.is_admin());
drop policy if exists "audio: admin deletes" on storage.objects;
create policy "audio: admin deletes" on storage.objects for delete using (bucket_id = 'audio' and public.is_admin());

-- 公開サイトから使える範囲（新しい Supabase プロジェクトでも確実に動くよう明示。中身の保護は上の行レベルの規則で行う）
grant usage on schema public to anon, authenticated;
grant select on public.settings to anon;
grant insert on public.entries, public.messages to anon, authenticated;
grant select, insert, update, delete on public.settings, public.items, public.entries, public.messages, public.orders, public.admins to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
