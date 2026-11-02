-- NFC タグ（NTAG 424 DNA）の読み取り回数。タップのたびに回数が増えていなければ、コピーした古いリンクとして断る。
-- 書き込みはサーバー（service role）だけ。何度実行しても大丈夫
create table if not exists public.nfc_tags (
  uid text primary key,
  last_counter integer not null,
  cert text not null default '',
  taps integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table public.nfc_tags enable row level security;
revoke all on public.nfc_tags from anon, authenticated;
grant select, insert, update on public.nfc_tags to service_role;

-- 回数が前回より大きいときだけ受け付けて true を返す（同時に2回来ても片方だけ通る）
create or replace function public.gc_sun_accept(p_uid text, p_ctr integer, p_cert text) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean := false;
begin
  insert into public.nfc_tags as t (uid, last_counter, cert)
  values (p_uid, p_ctr, coalesce(p_cert, ''))
  on conflict (uid) do update
    set last_counter = excluded.last_counter, cert = excluded.cert, taps = t.taps + 1, last_seen = now()
    where t.last_counter < excluded.last_counter
  returning true into ok;
  return coalesce(ok, false);
end $$;
revoke all on function public.gc_sun_accept(text, integer, text) from public, anon, authenticated;
grant execute on function public.gc_sun_accept(text, integer, text) to service_role;

create or replace function public.gc_schema_version() returns integer language sql immutable as $$ select 6 $$;
grant execute on function public.gc_schema_version() to anon, authenticated, service_role;
