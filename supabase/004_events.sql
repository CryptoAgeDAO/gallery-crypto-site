-- イベント・抽選（入場券のようなチケット）
-- 何度実行しても大丈夫（idempotent）

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  starts_at timestamptz,
  venue text not null default '',
  description text not null default '',
  mode text not null default 'lottery' check (mode in ('lottery', 'order')), -- lottery=当たり外れ / order=入場順を抽選
  capacity integer not null default 10 check (capacity >= 0),               -- lottery のときの当選人数
  status text not null default 'open' check (status in ('open', 'closed', 'drawn')),
  published boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;
drop policy if exists "events: anyone reads published" on public.events;
create policy "events: anyone reads published" on public.events for select using (published or public.is_admin());
drop policy if exists "events: admin inserts" on public.events;
create policy "events: admin inserts" on public.events for insert with check (public.is_admin());
drop policy if exists "events: admin updates" on public.events;
create policy "events: admin updates" on public.events for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "events: admin deletes" on public.events;
create policy "events: admin deletes" on public.events for delete using (public.is_admin());

create table if not exists public.event_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null check (position('@' in email) > 1 and length(email) <= 254),
  name text not null default '' check (length(name) <= 120),
  ticket_no integer,
  token uuid not null default gen_random_uuid() unique,
  result text check (result in ('win', 'lose')),
  position integer,
  created_at timestamptz not null default now()
);
create unique index if not exists event_entries_one_per_email on public.event_entries (event_id, lower(email));
alter table public.event_entries enable row level security;
-- 申し込みはサーバー（/api/events/enter）からだけ。一般公開の読み書きはなし
drop policy if exists "event entries: admin reads" on public.event_entries;
create policy "event entries: admin reads" on public.event_entries for select using (public.is_admin());
drop policy if exists "event entries: admin updates" on public.event_entries;
create policy "event entries: admin updates" on public.event_entries for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "event entries: admin deletes" on public.event_entries;
create policy "event entries: admin deletes" on public.event_entries for delete using (public.is_admin());

-- チケット番号をイベントごとに 1, 2, 3… と振る
create or replace function public.event_ticket_no() returns trigger language plpgsql as $$
begin
  perform 1 from public.events where id = new.event_id for update;
  select coalesce(max(ticket_no), 0) + 1 into new.ticket_no from public.event_entries where event_id = new.event_id;
  return new;
end $$;
drop trigger if exists event_entries_ticket_no on public.event_entries;
create trigger event_entries_ticket_no before insert on public.event_entries for each row execute function public.event_ticket_no();

grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant select, update, delete on public.event_entries to authenticated;
