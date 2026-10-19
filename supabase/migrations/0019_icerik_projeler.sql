-- İçerik editörü: post / story / reels kapağı tasarımları ekipte ortak saklanır.
-- veri: { format, stil, slaytlar: [{ id, sablon, icerik }] }; görseller 'icerik' deposunda, veri içinde adresleriyle.

create table if not exists public.icerik_projeler (
  id uuid primary key default gen_random_uuid(),
  ad text not null default 'Adsız tasarım',
  veri jsonb not null,
  kapak text,
  olusturan uuid references public.profiles(id) on delete set null default auth.uid(),
  guncelleyen uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists icerik_projeler_guncel on public.icerik_projeler (updated_at desc);

create or replace function public.icerik_guncel() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.guncelleyen := auth.uid(); return new; end $$;
create or replace trigger icerik_guncel before update on public.icerik_projeler for each row execute function public.icerik_guncel();

alter table public.icerik_projeler enable row level security;
create policy icerik_oku on public.icerik_projeler for select to authenticated using (is_member());
create policy icerik_ekle on public.icerik_projeler for insert to authenticated with check (is_member() and olusturan = auth.uid());
create policy icerik_degistir on public.icerik_projeler for update to authenticated using (is_member()) with check (is_member());
create policy icerik_sil on public.icerik_projeler for delete to authenticated using (olusturan = auth.uid() or is_admin());

-- Görseller: herkes okur (yayınlanacak içerik), ekip üyesi yükler.
insert into storage.buckets (id, name, public) values ('icerik', 'icerik', true) on conflict (id) do nothing;
create policy icerik_dosya_oku on storage.objects for select using (bucket_id = 'icerik');
create policy icerik_dosya_ekle on storage.objects for insert to authenticated with check (bucket_id = 'icerik' and is_member());
create policy icerik_dosya_guncelle on storage.objects for update to authenticated using (bucket_id = 'icerik' and is_member());
create policy icerik_dosya_sil on storage.objects for delete to authenticated using (bucket_id = 'icerik' and is_member());
