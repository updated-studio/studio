-- Hata bildir (7 Kasım 2026, kullanıcı: "Studio ya hata bildir butonu ekle bildirilen hatalara cevap verebilelim doğrudan içeriden
-- yöneticiler"; "izin veriyorum"). Üst bardaki düğmeyle ekipten herkes hata bildirir; sayfa, tarayıcı, sürüm ve son hata mesajları
-- kendiliğinden eklenir. Yöneticiler bütün bildirimleri görür ve cevaplar; bildiren kendi bildirimlerini ve cevapları görür, cevap yazar.
-- Durum yalnız "acik" / "cozuldu"; atama yok. Bildirimler (zil, telefon) tetikleyicilerle düşer. Ekran görüntüleri gizli "hata" kovasında.

create table if not exists public.hata_bildirimleri (
  id bigint generated always as identity primary key,
  bildiren uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  metin text not null check (length(metin) between 1 and 4000),
  sayfa text,
  ortam jsonb not null default '{}',
  gorseller text[] not null default '{}',
  durum text not null default 'acik' check (durum in ('acik', 'cozuldu')),
  cozen uuid references public.profiles(id) on delete set null,
  cozuldu_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hata_bildirimleri_durum on public.hata_bildirimleri (durum, updated_at desc);

create table if not exists public.hata_cevaplari (
  id bigint generated always as identity primary key,
  bildirim_id bigint not null references public.hata_bildirimleri(id) on delete cascade,
  yazar uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  metin text not null check (length(metin) between 1 and 4000),
  gorseller text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists hata_cevaplari_bildirim on public.hata_cevaplari (bildirim_id, created_at);

alter table public.hata_bildirimleri enable row level security;
alter table public.hata_cevaplari enable row level security;

create or replace function public.hata_gorebilir(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from hata_bildirimleri where id = p_id and bildiren = auth.uid());
$$;

drop policy if exists hata_oku on public.hata_bildirimleri;
create policy hata_oku on public.hata_bildirimleri for select to authenticated using (bildiren = auth.uid() or public.is_admin());
drop policy if exists hata_ekle on public.hata_bildirimleri;
create policy hata_ekle on public.hata_bildirimleri for insert to authenticated with check (bildiren = auth.uid() and public.is_member() and durum = 'acik');
-- Durumu yalnız yönetici değiştirir; metin bildirildikten sonra değişmez (tetikleyici korur)
drop policy if exists hata_degistir on public.hata_bildirimleri;
create policy hata_degistir on public.hata_bildirimleri for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists hata_cevap_oku on public.hata_cevaplari;
create policy hata_cevap_oku on public.hata_cevaplari for select to authenticated using (public.hata_gorebilir(bildirim_id));
drop policy if exists hata_cevap_ekle on public.hata_cevaplari;
create policy hata_cevap_ekle on public.hata_cevaplari for insert to authenticated with check (yazar = auth.uid() and public.hata_gorebilir(bildirim_id));

-- Güncellemede yalnız durum alanları değişir; çözüldü işaretlenince kim ve ne zaman yazılır
create or replace function public.hata_guncelle() returns trigger
language plpgsql set search_path = public as $$
begin
  new.metin := old.metin; new.bildiren := old.bildiren; new.sayfa := old.sayfa; new.ortam := old.ortam;
  new.gorseller := old.gorseller; new.created_at := old.created_at;
  if new.durum is distinct from old.durum then
    if new.durum = 'cozuldu' then new.cozen := auth.uid(); new.cozuldu_at := now(); else new.cozen := null; new.cozuldu_at := null; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists hata_guncelle on public.hata_bildirimleri;
create trigger hata_guncelle before update on public.hata_bildirimleri for each row execute function public.hata_guncelle();

-- Bildirimler: yeni hata → yöneticiler (bildiren hariç); cevap → konuşmadaki herkes (bildiren + yöneticiler, yazan hariç);
-- çözüldü → bildiren
create or replace function public.hata_bildir_yeni() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, body, link)
  select p.id, format('%s hata bildirdi: %s', coalesce(b.name, 'Biri'), left(new.metin, 140)), '#/hatalar?h=' || new.id
  from profiles p left join profiles b on b.id = new.bildiren
  where p.is_admin and p.id <> new.bildiren;
  return new;
end $$;
drop trigger if exists hata_bildir_yeni on public.hata_bildirimleri;
create trigger hata_bildir_yeni after insert on public.hata_bildirimleri for each row execute function public.hata_bildir_yeni();

create or replace function public.hata_bildir_cevap() returns trigger
language plpgsql security definer set search_path = public as $$
declare h hata_bildirimleri;
begin
  select * into h from hata_bildirimleri where id = new.bildirim_id;
  insert into notifications (user_id, body, link)
  select k.id, format('%s hata bildirimine cevap yazdı: %s', coalesce(y.name, 'Biri'), left(new.metin, 140)), '#/hatalar?h=' || h.id
  from profiles k left join profiles y on y.id = new.yazar
  where (k.is_admin or k.id = h.bildiren) and k.id <> new.yazar;
  update hata_bildirimleri set updated_at = now() where id = h.id;
  return new;
end $$;
drop trigger if exists hata_bildir_cevap on public.hata_cevaplari;
create trigger hata_bildir_cevap after insert on public.hata_cevaplari for each row execute function public.hata_bildir_cevap();

create or replace function public.hata_bildir_durum() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.durum = 'cozuldu' and old.durum <> 'cozuldu' and new.bildiren is distinct from auth.uid() then
    insert into notifications (user_id, body, link)
    values (new.bildiren, 'Bildirdiğin hata çözüldü: ' || left(new.metin, 140), '#/hatalar?h=' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists hata_bildir_durum on public.hata_bildirimleri;
create trigger hata_bildir_durum after update of durum on public.hata_bildirimleri for each row execute function public.hata_bildir_durum();

-- Ekran görüntüleri: gizli kova; yol "<bildiren>/<dosya>". Sahibi ve yöneticiler okur; herkes yalnız kendi klasörüne yükler.
-- Cevaptaki görseller cevap yazanın klasöründe; yönetici her dosyayı, bildiren konuşmasındaki dosyaları imzalı adresle açar.
insert into storage.buckets (id, name, public) values ('hata', 'hata', false) on conflict (id) do nothing;
drop policy if exists hata_dosya_oku on storage.objects;
create policy hata_dosya_oku on storage.objects for select to authenticated using (
  bucket_id = 'hata' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.hata_bildirimleri h where h.bildiren = auth.uid() and name = any(h.gorseller))
    or exists (select 1 from public.hata_cevaplari c join public.hata_bildirimleri h on h.id = c.bildirim_id where h.bildiren = auth.uid() and name = any(c.gorseller))));
drop policy if exists hata_dosya_ekle on storage.objects;
create policy hata_dosya_ekle on storage.objects for insert to authenticated with check (
  bucket_id = 'hata' and public.is_member() and (storage.foldername(name))[1] = auth.uid()::text);

-- Canlı: yeni cevaplar açık konuşmaya anında gelsin
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'hata_cevaplari') then
    alter publication supabase_realtime add table public.hata_cevaplari;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'hata_bildirimleri') then
    alter publication supabase_realtime add table public.hata_bildirimleri;
  end if;
end $$;
