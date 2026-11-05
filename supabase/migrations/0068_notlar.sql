-- Ekip notları (5 Kasım 2026, kullanıcı: "ekibin ortak çalışabileceği not sistemi; kimin ne eklediği, ne katkı sağladığı belli olacak; bir yorumun
-- üstüne not veya yorum eklenebilecek; klasörleme ve sayfa açma; Craft notes gibi ufak çaplı"; "kilitleyebilme olsun"; "katkıya sayılsın ama çok değil").
-- Klasör → sayfa → alt sayfa; sayfa bloklardan oluşur (her blok ayrı satır: kim ekledi, kim son değiştirdi). Bloklara yorum, yorumlara cevap.
-- Kilit: klasör ya da sayfa kilitlenince yalnız açan, izin verilen kişiler ve yöneticiler görür; kilit üst klasör/sayfadan alta geçer.
-- Kilidi yalnız açan kişi ya da yönetici değiştirir. not_gecmis yalnız tetikleyicilerle yazılır (kim, ne zaman, ne yaptı); katkı puanı buradan.

create table if not exists public.not_klasorler (
  id bigint generated always as identity primary key,
  ad text not null default 'Yeni klasör',
  ust_id bigint references public.not_klasorler on delete cascade,
  sira double precision not null default 0,
  kilitli boolean not null default false,
  izinli uuid[] not null default '{}',
  olusturan uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.not_sayfalar (
  id bigint generated always as identity primary key,
  klasor_id bigint references public.not_klasorler on delete cascade,
  ust_id bigint references public.not_sayfalar on delete cascade,
  baslik text not null default '',
  sira double precision not null default 0,
  kilitli boolean not null default false,
  izinli uuid[] not null default '{}',
  olusturan uuid default auth.uid() references public.profiles on delete set null,
  guncelleyen uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists not_sayfalar_klasor on public.not_sayfalar (klasor_id);
create index if not exists not_sayfalar_ust on public.not_sayfalar (ust_id);

create table if not exists public.not_bloklar (
  id uuid primary key default gen_random_uuid(),
  sayfa_id bigint not null references public.not_sayfalar on delete cascade,
  sira double precision not null default 0,
  tur text not null default 'metin' check (tur in ('metin', 'baslik', 'altbaslik', 'madde', 'numara', 'yapilacak', 'alinti', 'kod', 'ayrac', 'gorsel')),
  metin text not null default '',
  isaretli boolean not null default false,
  ek jsonb not null default '{}'::jsonb,
  olusturan uuid default auth.uid() references public.profiles on delete set null,
  guncelleyen uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists not_bloklar_sayfa on public.not_bloklar (sayfa_id, sira);

create table if not exists public.not_yorumlar (
  id bigint generated always as identity primary key,
  sayfa_id bigint not null references public.not_sayfalar on delete cascade,
  blok_id uuid references public.not_bloklar on delete set null,
  ust_id bigint references public.not_yorumlar on delete cascade,
  alinti text not null default '',
  metin text not null,
  yazar uuid default auth.uid() references public.profiles on delete set null,
  cozuldu boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists not_yorumlar_sayfa on public.not_yorumlar (sayfa_id);

create table if not exists public.not_gecmis (
  id bigint generated always as identity primary key,
  sayfa_id bigint references public.not_sayfalar on delete set null,  -- sayfa silinse de katkı günü kalır
  blok_id uuid,
  kim uuid references public.profiles on delete set null,
  islem text not null,   -- sayfa, blok_ekle, blok_degistir, blok_sil, yorum
  once text,
  sonra text,
  zaman timestamptz not null default now()
);
create index if not exists not_gecmis_sayfa on public.not_gecmis (sayfa_id, zaman desc);
create index if not exists not_gecmis_kim on public.not_gecmis (kim, zaman);

-- Erişim: üst zincirdeki her kilitli klasör/sayfa için açan ya da izinli olmak gerekir (yönetici hepsini görür)
create or replace function public.not_klasor_acik(k bigint) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive z as (
    select id, ust_id, kilitli, izinli, olusturan from not_klasorler where id = k
    union all
    select p.id, p.ust_id, p.kilitli, p.izinli, p.olusturan from not_klasorler p join z on p.id = z.ust_id
  )
  select public.is_member() and (public.is_admin() or not exists (
    select 1 from z where kilitli and not (auth.uid() = any(izinli) or olusturan is not distinct from auth.uid())));
$$;

create or replace function public.not_sayfa_acik(s bigint) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive z as (
    select id, ust_id, klasor_id, kilitli, izinli, olusturan from not_sayfalar where id = s
    union all
    select p.id, p.ust_id, p.klasor_id, p.kilitli, p.izinli, p.olusturan from not_sayfalar p join z on p.id = z.ust_id
  )
  select public.is_member()
    and (public.is_admin() or not exists (select 1 from z where kilitli and not (auth.uid() = any(izinli) or olusturan is not distinct from auth.uid())))
    and coalesce((select public.not_klasor_acik(klasor_id) from z where ust_id is null and klasor_id is not null limit 1), true);
$$;

alter table public.not_klasorler enable row level security;
alter table public.not_sayfalar enable row level security;
alter table public.not_bloklar enable row level security;
alter table public.not_yorumlar enable row level security;
alter table public.not_gecmis enable row level security;

drop policy if exists not_klasor_oku on public.not_klasorler;
create policy not_klasor_oku on public.not_klasorler for select to authenticated using (public.not_klasor_acik(id));
drop policy if exists not_klasor_ekle on public.not_klasorler;
create policy not_klasor_ekle on public.not_klasorler for insert to authenticated
  with check (public.is_member() and olusturan = auth.uid() and (ust_id is null or public.not_klasor_acik(ust_id)));
drop policy if exists not_klasor_degistir on public.not_klasorler;
create policy not_klasor_degistir on public.not_klasorler for update to authenticated using (public.not_klasor_acik(id));
drop policy if exists not_klasor_sil on public.not_klasorler;
create policy not_klasor_sil on public.not_klasorler for delete to authenticated using (public.not_klasor_acik(id) and (olusturan = auth.uid() or public.is_admin()));

drop policy if exists not_sayfa_oku on public.not_sayfalar;
create policy not_sayfa_oku on public.not_sayfalar for select to authenticated using (public.not_sayfa_acik(id));
drop policy if exists not_sayfa_ekle on public.not_sayfalar;
create policy not_sayfa_ekle on public.not_sayfalar for insert to authenticated
  with check (public.is_member() and olusturan = auth.uid()
    and (klasor_id is null or public.not_klasor_acik(klasor_id)) and (ust_id is null or public.not_sayfa_acik(ust_id)));
drop policy if exists not_sayfa_degistir on public.not_sayfalar;
create policy not_sayfa_degistir on public.not_sayfalar for update to authenticated using (public.not_sayfa_acik(id));
drop policy if exists not_sayfa_sil on public.not_sayfalar;
create policy not_sayfa_sil on public.not_sayfalar for delete to authenticated using (public.not_sayfa_acik(id) and (olusturan = auth.uid() or public.is_admin()));

drop policy if exists not_blok_hepsi on public.not_bloklar;
create policy not_blok_hepsi on public.not_bloklar for all to authenticated using (public.not_sayfa_acik(sayfa_id)) with check (public.not_sayfa_acik(sayfa_id));

drop policy if exists not_yorum_oku on public.not_yorumlar;
create policy not_yorum_oku on public.not_yorumlar for select to authenticated using (public.not_sayfa_acik(sayfa_id));
drop policy if exists not_yorum_ekle on public.not_yorumlar;
create policy not_yorum_ekle on public.not_yorumlar for insert to authenticated with check (yazar = auth.uid() and public.not_sayfa_acik(sayfa_id));
drop policy if exists not_yorum_degistir on public.not_yorumlar;
create policy not_yorum_degistir on public.not_yorumlar for update to authenticated using (public.not_sayfa_acik(sayfa_id));
drop policy if exists not_yorum_sil on public.not_yorumlar;
create policy not_yorum_sil on public.not_yorumlar for delete to authenticated using (yazar = auth.uid() or public.is_admin());

drop policy if exists not_gecmis_oku on public.not_gecmis;
create policy not_gecmis_oku on public.not_gecmis for select to authenticated using (sayfa_id is not null and public.not_sayfa_acik(sayfa_id));

-- Kilit ve izin listesini yalnız açan ya da yönetici değiştirir; yorumun metnini yalnız yazarı; güncelleyen ve zaman kendiliğinden
create or replace function public.not_degisiklik() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name in ('not_klasorler', 'not_sayfalar') then
    if (new.kilitli is distinct from old.kilitli or new.izinli is distinct from old.izinli)
       and not (old.olusturan is not distinct from auth.uid() or public.is_admin()) then
      raise exception 'Kilidi yalnız açan kişi ya da yönetici değiştirebilir';
    end if;
    new.olusturan := old.olusturan;
  end if;
  if tg_table_name = 'not_yorumlar' then
    if new.metin is distinct from old.metin and old.yazar is distinct from auth.uid() then
      raise exception 'Yorumu yalnız yazarı değiştirebilir';
    end if;
    new.yazar := old.yazar;
  end if;
  if tg_table_name = 'not_bloklar' then
    new.olusturan := old.olusturan;
    if new.metin is distinct from old.metin or new.tur is distinct from old.tur or new.isaretli is distinct from old.isaretli or new.ek is distinct from old.ek then
      new.guncelleyen := auth.uid();
    end if;
  end if;
  if tg_table_name = 'not_sayfalar' then
    if new.baslik is distinct from old.baslik then new.guncelleyen := auth.uid(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists not_klasor_degisiklik on public.not_klasorler;
create trigger not_klasor_degisiklik before update on public.not_klasorler for each row execute function public.not_degisiklik();
drop trigger if exists not_sayfa_degisiklik on public.not_sayfalar;
create trigger not_sayfa_degisiklik before update on public.not_sayfalar for each row execute function public.not_degisiklik();
drop trigger if exists not_blok_degisiklik on public.not_bloklar;
create trigger not_blok_degisiklik before update on public.not_bloklar for each row execute function public.not_degisiklik();
drop trigger if exists not_yorum_degisiklik on public.not_yorumlar;
create trigger not_yorum_degisiklik before update on public.not_yorumlar for each row execute function public.not_degisiklik();

-- Geçmiş: aynı kişinin aynı bloktaki 10 dakika içindeki yazımı tek satırda toplanır (her tuşta satır açılmaz)
create or replace function public.not_gecmis_yaz() returns trigger
language plpgsql security definer set search_path = public as $$
declare son public.not_gecmis;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_table_name = 'not_sayfalar' then
    insert into not_gecmis (sayfa_id, kim, islem, sonra) values (new.id, auth.uid(), 'sayfa', new.baslik);
  elsif tg_table_name = 'not_yorumlar' then
    insert into not_gecmis (sayfa_id, blok_id, kim, islem, sonra) values (new.sayfa_id, new.blok_id, auth.uid(), 'yorum', left(new.metin, 500));
  elsif tg_op = 'INSERT' then
    insert into not_gecmis (sayfa_id, blok_id, kim, islem, sonra) values (new.sayfa_id, new.id, auth.uid(), 'blok_ekle', left(new.metin, 2000));
  elsif tg_op = 'DELETE' then
    if exists (select 1 from not_sayfalar where id = old.sayfa_id) then
      insert into not_gecmis (sayfa_id, blok_id, kim, islem, once) values (old.sayfa_id, old.id, auth.uid(), 'blok_sil', left(old.metin, 2000));
    end if;
  elsif new.metin is distinct from old.metin or new.tur is distinct from old.tur or new.isaretli is distinct from old.isaretli then
    select * into son from not_gecmis where blok_id = new.id and kim = auth.uid() and islem in ('blok_ekle', 'blok_degistir') and zaman > now() - interval '10 minutes'
      order by zaman desc limit 1;
    if found then update not_gecmis set sonra = left(new.metin, 2000), zaman = now() where id = son.id;
    else insert into not_gecmis (sayfa_id, blok_id, kim, islem, once, sonra) values (new.sayfa_id, new.id, auth.uid(), 'blok_degistir', left(old.metin, 2000), left(new.metin, 2000));
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists not_sayfa_gecmis on public.not_sayfalar;
create trigger not_sayfa_gecmis after insert on public.not_sayfalar for each row execute function public.not_gecmis_yaz();
drop trigger if exists not_blok_gecmis on public.not_bloklar;
create trigger not_blok_gecmis after insert or update or delete on public.not_bloklar for each row execute function public.not_gecmis_yaz();
drop trigger if exists not_yorum_gecmis on public.not_yorumlar;
create trigger not_yorum_gecmis after insert on public.not_yorumlar for each row execute function public.not_gecmis_yaz();

-- Katkı puanı: notlarda bir şey yazdığı günler (kişi başına günde en çok bir kez sayılır; Stüdyo Ekip → Katkı)
create or replace function public.not_katki_gunleri() returns table (kim uuid, gun date)
language sql stable security definer set search_path = public as $$
  select distinct kim, (zaman at time zone 'Europe/Istanbul')::date from not_gecmis where public.is_member() and kim is not null;
$$;

-- Not görselleri
insert into storage.buckets (id, name, public) values ('notlar', 'notlar', true) on conflict (id) do nothing;
drop policy if exists notlar_dosya_oku on storage.objects;
create policy notlar_dosya_oku on storage.objects for select using (bucket_id = 'notlar');
drop policy if exists notlar_dosya_ekle on storage.objects;
create policy notlar_dosya_ekle on storage.objects for insert to authenticated with check (bucket_id = 'notlar' and public.is_member());

-- Canlı ortak çalışma
do $$
declare t text;
begin
  foreach t in array array['not_klasorler', 'not_sayfalar', 'not_bloklar', 'not_yorumlar'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
