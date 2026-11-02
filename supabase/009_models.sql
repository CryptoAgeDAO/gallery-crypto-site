-- 作品の3Dモデル（CLO 3D から書き出した .glb）。何度実行しても大丈夫（idempotent）
-- 管理画面の「3Dの準備」ボタン（自動セットアップ）でも同じ内容が実行されます。

create table if not exists public.item_models (
  item_id uuid primary key references public.items(id) on delete cascade,
  path text not null,
  name text not null default '',
  bytes integer not null default 0,
  source text not null default 'clo3d',
  updated_at timestamptz not null default now()
);
alter table public.item_models enable row level security;
drop policy if exists "item models: public reads published" on public.item_models;
create policy "item models: public reads published" on public.item_models for select
  using (public.is_admin() or exists (select 1 from public.items i where i.id = item_id and i.published));
drop policy if exists "item models: admin writes" on public.item_models;
create policy "item models: admin writes" on public.item_models for all using (public.is_admin()) with check (public.is_admin());
grant select on public.item_models to anon, authenticated;
grant insert, update, delete on public.item_models to authenticated;

-- 保存先（公開・1ファイル50MBまで）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('models', 'models', true, 52428800, array['model/gltf-binary','application/octet-stream'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = array['model/gltf-binary','application/octet-stream'];
drop policy if exists "models: admin uploads" on storage.objects;
create policy "models: admin uploads" on storage.objects for insert with check (bucket_id = 'models' and public.is_admin());
drop policy if exists "models: admin updates" on storage.objects;
create policy "models: admin updates" on storage.objects for update using (bucket_id = 'models' and public.is_admin());
drop policy if exists "models: admin deletes" on storage.objects;
create policy "models: admin deletes" on storage.objects for delete using (bucket_id = 'models' and public.is_admin());

notify pgrst, 'reload schema';
