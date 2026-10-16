-- Gallery Crypto — データベースの初期設定
-- Supabase の SQL Editor に貼り付けて、1回だけ実行します。
-- 最後の行の 'you@example.com' を、管理画面にログインするご自身のメールアドレスに書き換えてから実行してください。

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
create policy "settings: anyone reads" on public.settings for select using (true);
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
create policy "items: anyone reads published" on public.items for select using (published or public.is_admin());
create policy "items: admin inserts" on public.items for insert with check (public.is_admin());
create policy "items: admin updates" on public.items for update using (public.is_admin()) with check (public.is_admin());
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
create policy "entries: anyone enters" on public.entries for insert with check (true);
create policy "entries: admin reads" on public.entries for select using (public.is_admin());
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
create policy "messages: anyone sends" on public.messages for insert with check (true);
create policy "messages: admin reads" on public.messages for select using (public.is_admin());
create policy "messages: admin deletes" on public.messages for delete using (public.is_admin());

-- 写真の保存場所 ------------------------------------------------------
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;
create policy "photos: admin uploads" on storage.objects for insert with check (bucket_id = 'photos' and public.is_admin());
create policy "photos: admin updates" on storage.objects for update using (bucket_id = 'photos' and public.is_admin());
create policy "photos: admin deletes" on storage.objects for delete using (bucket_id = 'photos' and public.is_admin());

-- 管理者のメールアドレス（書き換えてください） ---------------------------
insert into public.admins (email) values ('you@example.com') on conflict do nothing;
