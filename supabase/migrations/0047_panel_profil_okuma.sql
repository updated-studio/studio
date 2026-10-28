-- Panelin Stüdyo profillerinden yalnız ad, e-posta ve fotoğrafı okuması (28 Ekim 2026).
-- Sitede haber imzasının yanındaki editör fotoğrafı Stüdyo profilinden gelir (panel /api/yazar-fotolari). Panelin veritabanı hesabı
-- (payload) public.profiles'ı okuyamadığı için fotoğraflar hiç gelmiyordu. Yalnız bu dört sütun açılır; yetki, rol ve diğer bilgiler kapalı kalır.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'payload') then
    grant usage on schema public to payload;
    grant select (id, email, name, avatar_url) on public.profiles to payload;
  end if;
end $$;
