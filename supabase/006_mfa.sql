-- 2段階認証（認証アプリの6桁コード）
-- 認証アプリを登録した管理者は、6桁コードまで確認したログイン（aal2）のときだけ管理者として扱う。
-- データベースの保護（RLS）と、管理者用の全 API がこの判定を使うので、パスワードだけ盗まれても管理操作はできない。
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
     and (
       coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
     );
$$;

-- 自動セットアップが済んでいるかの目印（下で最新の番号に置き換える）
create or replace function public.gc_schema_version() returns integer language sql immutable as $$ select 2 $$;
grant execute on function public.gc_schema_version() to anon, authenticated, service_role;

-- 署名のたびの顔認証（Face ID / Touch ID などのパスキー）。サーバーが照合する。書き込みはサーバーだけ
create table if not exists public.passport_passkeys (
  id bigint generated always as identity primary key,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  label text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.passport_passkeys enable row level security;
drop policy if exists "passport passkeys: admin reads" on public.passport_passkeys;
create policy "passport passkeys: admin reads" on public.passport_passkeys for select using (public.is_admin());
grant select on public.passport_passkeys to authenticated;
create or replace function public.gc_schema_version() returns integer language sql immutable as $$ select 3 $$;
