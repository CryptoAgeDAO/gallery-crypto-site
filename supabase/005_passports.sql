-- 来歴パスポート（DPP 準拠の記録・署名つきの追記専用ログ・Solana への刻印）
-- 何度実行しても大丈夫（idempotent）

-- 下書き（管理者だけが見られる）
create table if not exists public.passports (
  item_id uuid primary key references public.items(id) on delete cascade,
  dpp jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.passports enable row level security;
drop policy if exists "passports: admin all" on public.passports;
create policy "passports: admin all" on public.passports for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.passports to authenticated;

-- 確定した記録（署名つき・追記のみ。書き換えと削除はデータベースが拒否する）
create table if not exists public.passport_log (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.items(id) on delete restrict,
  cert text not null,
  seq integer not null,
  kind text not null check (kind in ('seal', 'event')),
  entry jsonb not null,
  hash text not null unique,
  sig text not null,
  issuer text not null,
  anchor_id bigint,
  created_at timestamptz not null default now(),
  unique (item_id, seq)
);
alter table public.passport_log add column if not exists cosig text not null default '';
alter table public.passport_log enable row level security;
drop policy if exists "passport log: public reads published" on public.passport_log;
create policy "passport log: public reads published" on public.passport_log for select
  using (public.is_admin() or exists (select 1 from public.items i where i.id = item_id and i.published));
grant select on public.passport_log to anon, authenticated;

create or replace function public.passport_log_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'passport records are permanent'; end if;
  if new.entry is distinct from old.entry or new.hash is distinct from old.hash or new.sig is distinct from old.sig
     or new.issuer is distinct from old.issuer or new.seq is distinct from old.seq or new.item_id is distinct from old.item_id
     or new.cosig is distinct from old.cosig then
    raise exception 'passport records are permanent';
  end if;
  return new;
end $$;
drop trigger if exists passport_log_guard on public.passport_log;
create trigger passport_log_guard before update or delete on public.passport_log for each row execute function public.passport_log_guard();

-- サーバー専用の秘密（発行者の鍵の元）。一般・管理者ともに読み書き不可、サーバー（service role）だけが使う
create table if not exists public.gc_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.gc_secrets enable row level security;
revoke all on public.gc_secrets from anon, authenticated;

-- ブロックチェーンへの刻印（まとめたハッシュの根）
create table if not exists public.passport_anchors (
  id bigint generated always as identity primary key,
  chain text not null,
  root text not null,
  leaves text[] not null default '{}',
  tx text not null default '',
  created_at timestamptz not null default now()
);
alter table public.passport_anchors enable row level security;
drop policy if exists "passport anchors: public reads" on public.passport_anchors;
create policy "passport anchors: public reads" on public.passport_anchors for select using (true);
grant select on public.passport_anchors to anon, authenticated;

-- 創業者の鍵の台帳（端末の鍵・オフラインの復旧鍵）。追加・取り消しは、有効な鍵の署名がないとサーバーが受け付けない
create table if not exists public.passport_keys (
  id bigint generated always as identity primary key,
  seq integer not null unique,
  entry jsonb not null,
  hash text not null unique,
  sig text not null,
  cosig text not null,
  issuer text not null,
  anchor_id bigint,
  created_at timestamptz not null default now()
);
alter table public.passport_keys enable row level security;
drop policy if exists "passport keys: public reads" on public.passport_keys;
create policy "passport keys: public reads" on public.passport_keys for select using (true);
grant select on public.passport_keys to anon, authenticated;

create or replace function public.passport_keys_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'key records are permanent'; end if;
  if new.entry is distinct from old.entry or new.hash is distinct from old.hash or new.sig is distinct from old.sig
     or new.cosig is distinct from old.cosig or new.issuer is distinct from old.issuer or new.seq is distinct from old.seq then
    raise exception 'key records are permanent';
  end if;
  return new;
end $$;
drop trigger if exists passport_keys_guard on public.passport_keys;
create trigger passport_keys_guard before update or delete on public.passport_keys for each row execute function public.passport_keys_guard();
