-- Tek kişi kaydı, 1/2 (29 Ekim 2026, kullanıcı: "Stüdyo'daki üyelikler ile Uper üyelikler bir sistemde de bir olsun veritabanında da";
-- girişler ayrı kalır: Stüdyo'ya yalnız davetli e-postalar girer, Uper'ler giremez). Site deposu karar 36.
-- Kişi = e-posta. Uper kaydı (payload.uyeler, panelin) ile Stüdyo profili (public.profiles) aynı kişidir; ad ve fotoğraf eşitlenir.
-- Bu dosya yalnız izin verir: panelin hesabı (payload) profilin adını ve fotoğrafını yazabilir (başka sütunu değil).
-- Eşitleme işlevleri ve Uper tarafının tetikleyicisi panel göçündedir (site deposu 20261029_*_tek_kisi); profil tarafının tetikleyicisi 0050'de.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'payload') then
    grant update (name, avatar_url) on public.profiles to payload;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'panel_kisi_esitler') then
      create policy panel_kisi_esitler on public.profiles for update to payload using (true) with check (true);
    end if;
  end if;
end $$;
