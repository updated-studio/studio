-- Tek kişi kaydı, 2/2 (29 Ekim 2026): Stüdyo profili değişince (ad, fotoğraf) Uper kaydına ve haber imzasına yazılır.
-- İşlev panelin göçündedir (payload.kisi_profilden, site deposu 20261029_090000_tek_kisi); bu dosya yalnız tetikleyiciyi bağlar.
do $$ begin
  if to_regprocedure('payload.kisi_profilden()') is null then
    raise exception 'Önce panelin tek_kisi göçü uygulanmalı (payload.kisi_profilden yok)';
  end if;
end $$;
drop trigger if exists kisi_profilden on public.profiles;
create trigger kisi_profilden after update of name, avatar_url on public.profiles for each row execute function payload.kisi_profilden();
