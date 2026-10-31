-- 刻印の XRPL ミラー（同じルートを XRP Ledger にも書いた記録）。何度実行しても大丈夫
alter table public.passport_anchors add column if not exists xrpl_tx text not null default '';
alter table public.passport_anchors add column if not exists xrpl_chain text not null default '';
create or replace function public.gc_schema_version() returns integer language sql immutable as $$ select 5 $$;
grant execute on function public.gc_schema_version() to anon, authenticated, service_role;
