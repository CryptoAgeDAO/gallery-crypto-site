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

-- 自動セットアップが済んでいるかの目印
create or replace function public.gc_schema_version() returns integer language sql immutable as $$ select 2 $$;
grant execute on function public.gc_schema_version() to anon, authenticated, service_role;
