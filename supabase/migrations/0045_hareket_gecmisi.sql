-- Hareket geçmişi (28 Ekim 2026, kullanıcı: "kim ne yaptı, her şeyin bir kaydı tutulsun, yalnız yöneticiler görsün").
-- Tek tablo: panelde (haber, inceleme, künye, sayfa, ayarlar, kullanıcı…) ve Stüdyo'da (anahtarlar, ekip/yetki, davetler, Haber Masası)
-- yapılan her iş. Panel tarafını Payload kancası yazar (site deposu apps/cms/src/hooks/hareket.ts; aynı Postgres, "payload" bağlantısıyla),
-- Stüdyo tarafını buradaki tetikleyiciler. Kayıt yalnız eklenir: kimse değiştiremez, silemez (yetki verilmez). Yöneticiler okur.
-- Silinen kaydın tam hâli "ayrinti.kayit" içinde saklanır; Stüdyo'daki "Geri getir" düğmesi oradan yeniden oluşturur.

create table if not exists public.hareketler (
  id bigint generated always as identity primary key,
  zaman timestamptz not null default now(),
  kaynak text not null default 'studyo' check (kaynak in ('panel', 'studyo', 'sistem')),
  kim_id uuid,                              -- Stüdyo profili (varsa)
  kim_eposta text not null default '',
  kim_ad text not null default '',
  islem text not null,                      -- olustur · degistir · yayinla · yayindan_kaldir · sil · giris · anahtar · yetki · davet · haber_masasi …
  tur text not null default '',             -- koleksiyon / tablo: news, reviews, products, users, site, baglanti_anahtarlari, profiles …
  nesne_id text not null default '',
  baslik text not null default '',
  ayrinti jsonb not null default '{}'::jsonb -- { alanlar: [...değişen alanlar], kayit: {...silinen kaydın tam hâli}, ... }
);
create index if not exists hareketler_zaman on public.hareketler (zaman desc);
create index if not exists hareketler_kim on public.hareketler (kim_eposta, zaman desc);
create index if not exists hareketler_nesne on public.hareketler (tur, nesne_id, zaman desc);

alter table public.hareketler enable row level security;
drop policy if exists hareketler_oku on public.hareketler;
create policy hareketler_oku on public.hareketler for select to authenticated using (public.is_admin());
-- Ekleme yalnız aşağıdaki fonksiyon (security definer) ve panelin kendi bağlantısıyla; güncelleme/silme yetkisi kimseye verilmez
grant select on public.hareketler to authenticated;
revoke all on public.hareketler from anon;

-- Stüdyo içinden kayıt: kim = o anki oturum (profiles)
create or replace function public.hareket_yaz(p_islem text, p_tur text, p_nesne text, p_baslik text, p_ayrinti jsonb default '{}'::jsonb, p_kaynak text default 'studyo')
returns void
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select id, email, name into p from public.profiles where id = auth.uid();
  insert into public.hareketler (kaynak, kim_id, kim_eposta, kim_ad, islem, tur, nesne_id, baslik, ayrinti)
  values (p_kaynak, p.id, coalesce(p.email, ''), coalesce(p.name, case when auth.uid() is null then 'Sistem' else '' end), p_islem, coalesce(p_tur, ''), coalesce(p_nesne, ''), left(coalesce(p_baslik, ''), 300), coalesce(p_ayrinti, '{}'::jsonb));
end $$;
revoke execute on function public.hareket_yaz(text, text, text, text, jsonb, text) from public, anon;
grant execute on function public.hareket_yaz(text, text, text, text, jsonb, text) to authenticated;

-- Bağlantı anahtarları: eklendi / değişti / silindi (anahtarın kendisi asla yazılmaz)
create or replace function public.hareket_anahtar() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.hareket_yaz('anahtar', 'baglanti_anahtarlari', old.ad, 'Anahtar silindi: ' || old.ad, '{}'::jsonb);
    return old;
  end if;
  if tg_op = 'UPDATE' and new.deger is not distinct from old.deger then return new; end if; -- yalnız ek bilgi (ek, hata) değiştiyse kayıt yok
  perform public.hareket_yaz('anahtar', 'baglanti_anahtarlari', new.ad, (case when tg_op = 'INSERT' then 'Anahtar girildi: ' else 'Anahtar yenilendi: ' end) || new.ad, jsonb_build_object('son4', new.son4));
  return new;
end $$;
drop trigger if exists hareket_anahtar_t on public.baglanti_anahtarlari;
create trigger hareket_anahtar_t after insert or update or delete on public.baglanti_anahtarlari for each row execute function public.hareket_anahtar();

-- Ekip: yetki ve site rolü değişiklikleri, ayrılma, katılma
create or replace function public.hareket_profil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.hareket_yaz('ekip', 'profiles', new.id::text, 'Ekibe katıldı: ' || new.name, jsonb_build_object('eposta', new.email, 'yonetici', new.is_admin));
    return new;
  end if;
  if tg_op = 'DELETE' then
    perform public.hareket_yaz('ekip', 'profiles', old.id::text, 'Ekipten çıkarıldı: ' || old.name, jsonb_build_object('eposta', old.email));
    return old;
  end if;
  if new.is_admin is distinct from old.is_admin then
    perform public.hareket_yaz('yetki', 'profiles', new.id::text, new.name || (case when new.is_admin then ' yönetici yapıldı' else ' yöneticilikten çıkarıldı' end), jsonb_build_object('yonetici', new.is_admin));
  end if;
  if to_jsonb(new) ? 'site_rol' and (to_jsonb(new) ->> 'site_rol') is distinct from (to_jsonb(old) ->> 'site_rol') then
    perform public.hareket_yaz('yetki', 'profiles', new.id::text, new.name || ' site rolü: ' || coalesce(to_jsonb(new) ->> 'site_rol', ''), jsonb_build_object('alanlar', jsonb_build_array('site_rol'), 'eski', to_jsonb(old) ->> 'site_rol', 'yeni', to_jsonb(new) ->> 'site_rol'));
  end if;
  if new.role is distinct from old.role or new.org is distinct from old.org or new.name is distinct from old.name then
    perform public.hareket_yaz('degistir', 'profiles', new.id::text, 'Ekip bilgisi değişti: ' || new.name, jsonb_build_object('alanlar', jsonb_build_array('ad', 'görev', 'yer')));
  end if;
  return new;
end $$;
drop trigger if exists hareket_profil_t on public.profiles;
create trigger hareket_profil_t after insert or update or delete on public.profiles for each row execute function public.hareket_profil();

-- Davetler
create or replace function public.hareket_davet() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform public.hareket_yaz('davet', 'invites', old.email, 'Davet iptal edildi: ' || old.name, jsonb_build_object('eposta', old.email)); return old; end if;
  if tg_op = 'INSERT' then perform public.hareket_yaz('davet', 'invites', new.email, 'Davet gönderildi: ' || new.name, jsonb_build_object('eposta', new.email, 'yonetici', new.is_admin)); end if;
  return new;
end $$;
drop trigger if exists hareket_davet_t on public.invites;
create trigger hareket_davet_t after insert or delete on public.invites for each row execute function public.hareket_davet();

-- Haber Masası hareketleri (tr_activity zaten tutuluyor): aynı listede görünsün
create or replace function public.hareket_haber_masasi() returns trigger language plpgsql security definer set search_path = public as $$
declare e text;
begin
  select email into e from public.profiles where id = new.actor;
  insert into public.hareketler (kaynak, kim_id, kim_eposta, kim_ad, islem, tur, nesne_id, baslik, ayrinti)
  values ('studyo', new.actor, coalesce(e, ''), coalesce(nullif(new.actor_name, ''), 'Sistem'), 'haber_masasi', 'tr_items', coalesce(new.item_id::text, ''), left(coalesce(new.kind, '') || ': ' || coalesce(new.title, ''), 300),
    jsonb_build_object('tur', new.kind, 'hedef', new.target_name, 'not', new.note, 'baglanti', new.link));
  return new;
end $$;
drop trigger if exists hareket_haber_masasi_t on public.tr_activity;
create trigger hareket_haber_masasi_t after insert on public.tr_activity for each row execute function public.hareket_haber_masasi();

-- Künye önerileri: onay/ret (Stüdyo KunyeOnay); kayıt panelde de düşer (ürün güncellenir) ama karar burada verilir
create or replace function public.hareket_kunye() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.durum is distinct from old.durum and new.durum in ('onaylandi', 'reddedildi') then
    perform public.hareket_yaz('kunye', 'kunye_oneriler', new.id::text, (case when new.durum = 'onaylandi' then 'Künye onaylandı: ' else 'Künye reddedildi: ' end) || coalesce(new.urun_adi, ''), jsonb_build_object('urun_id', new.urun_id));
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'kunye_oneriler' and column_name = 'durum') then
    drop trigger if exists hareket_kunye_t on public.kunye_oneriler;
    create trigger hareket_kunye_t after update on public.kunye_oneriler for each row execute function public.hareket_kunye();
  end if;
end $$;
