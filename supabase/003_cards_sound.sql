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
create policy "audio: admin uploads" on storage.objects for insert with check (bucket_id = 'audio' and public.is_admin());
create policy "audio: admin updates" on storage.objects for update using (bucket_id = 'audio' and public.is_admin());
create policy "audio: admin deletes" on storage.objects for delete using (bucket_id = 'audio' and public.is_admin());
