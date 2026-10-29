-- 0047'nin devamı (28 Ekim 2026): public.profiles'ta satır güvenliği (RLS) açık; panelin hesabı (payload) için okuma kuralı.
-- Sütun izni 0047'deki dört sütunla (id, email, name, avatar_url) sınırlı kalır.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'payload')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'panel_imza_okur') then
    create policy panel_imza_okur on public.profiles for select to payload using (true);
  end if;
end $$;
