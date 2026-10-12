-- Profil fotoğrafı (Supabase Storage) ve pazar akşamı "gelecek hafta" hatırlatması

alter table public.profiles add column if not exists avatar_url text;

-- Fotoğraflar herkese açık okunur (link bilinmeden bulunamaz); her üye yalnızca kendi klasörüne yazar: avatars/<uid>/...
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
create policy avatars_okuma on storage.objects for select using (bucket_id = 'avatars');
create policy avatars_yukleme on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_guncelleme on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_silme on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Pazar 19:00 (TR): gelecek haftayı işaretlememiş herkese hatırlatma
create or replace function public.auto_reminder() returns void
language plpgsql security definer set search_path = public as $$
declare ws date := date_trunc('week', (now() at time zone 'Europe/Istanbul'))::date + 7;
begin
  insert into notifications (user_id, body)
  select p.id, 'Yeni hafta yaklaşıyor. Gelecek haftaki müsaitliğini işaretle (Bu Hafta > Gelecek hafta).'
  from profiles p
  where not exists (select 1 from availability a where a.user_id = p.id and a.day >= ws and a.day < ws + 7);
end;
$$;
revoke execute on function public.auto_reminder() from public, anon, authenticated;
select cron.unschedule('haftalik-hatirlatma');
select cron.schedule('haftalik-hatirlatma', '0 16 * * 0', 'select public.auto_reminder()');

select 'v4 tamam' as sonuc;
