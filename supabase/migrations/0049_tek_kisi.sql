-- Tek kişi kaydı (29 Ekim 2026, kullanıcı: "Stüdyo'daki üyelikler ile Uper üyelikler bir sistemde de bir olsun veritabanında da";
-- girişler ayrı kalır: Stüdyo'ya yalnız davetli e-postalar girer, Uper'ler giremez). Site deposu karar 36.
-- Kişi = e-posta. Ekip üyesinin Uper üyeliği (payload.uyeler) ile Stüdyo profili (public.profiles) aynı kişidir:
--   · Ad: birinde değişince öbürüne ve paneldeki yazar profiline (haber imzası) yazılır.
--   · Fotoğraf: Stüdyo'da yüklenen fotoğraf Uper'de "Stüdyo fotoğrafı" olur; Uper'de Google/Gravatar seçilirse Stüdyo profiline geçer.
-- Önce panelin 20261029_071812_uye_studyo_foto göçü ('studyo' fotoğraf türü) uygulanmış olmalı.
-- İlk eşitleme: üç yerdeki adın en uzunu (soyadlı olan) ortak ad olur; Stüdyo fotoğrafı varsa o, yoksa Uper fotoğrafı.

create or replace function public.kisi_yazar_adi(p_eposta text, p_ad text) returns void
language sql security definer set search_path = public, payload as $$
  update payload.authors a set name = p_ad, updated_at = now()
  from payload.users u
  where u.author_id = a.id and lower(u.email) = lower(p_eposta) and a.name is distinct from p_ad and length(btrim(p_ad)) >= 2;
$$;

-- Stüdyo profili değişti → Uper ve yazar
create or replace function public.kisi_profilden() returns trigger
language plpgsql security definer set search_path = public, payload as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.name is distinct from old.name and length(btrim(coalesce(new.name, ''))) >= 2 then
    update payload.uyeler set ad = left(btrim(new.name), 40), updated_at = now() where lower(email) = lower(new.email) and ad is distinct from left(btrim(new.name), 40);
    perform public.kisi_yazar_adi(new.email, btrim(new.name));
  end if;
  if new.avatar_url is distinct from old.avatar_url then
    if coalesce(new.avatar_url, '') <> '' then
      update payload.uyeler set foto_tur = 'studyo', foto = new.avatar_url, updated_at = now()
      where lower(email) = lower(new.email) and foto is distinct from new.avatar_url;
    else
      update payload.uyeler set foto_tur = 'harf', foto = null, updated_at = now() where lower(email) = lower(new.email) and foto_tur = 'studyo';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists kisi_profilden on public.profiles;
create trigger kisi_profilden after update of name, avatar_url on public.profiles for each row execute function public.kisi_profilden();

-- Uper kaydı değişti ya da ekip üyesi Uper'e katıldı → Stüdyo profili ve yazar
create or replace function public.kisi_uperden() returns trigger
language plpgsql security definer set search_path = public, payload as $$
declare v_profil public.profiles%rowtype;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  select * into v_profil from public.profiles where lower(email) = lower(new.email) limit 1;
  if not found then return new; end if;
  -- Yeni katılan ekip üyesi: Stüdyo'da fotoğrafı varsa ve Uper'de seçmediyse Stüdyo fotoğrafı gelir
  if tg_op = 'INSERT' then
    if coalesce(v_profil.avatar_url, '') <> '' and new.foto is null then
      update payload.uyeler set foto_tur = 'studyo', foto = v_profil.avatar_url where id = new.id;
    end if;
  end if;
  if tg_op = 'INSERT' or new.ad is distinct from old.ad then
    update public.profiles set name = new.ad where id = v_profil.id and name is distinct from new.ad;
    perform public.kisi_yazar_adi(new.email, new.ad);
  end if;
  if tg_op = 'UPDATE' and (new.foto is distinct from old.foto or new.foto_tur is distinct from old.foto_tur) and new.foto_tur::text <> 'studyo' then
    update public.profiles set avatar_url = case when new.foto_tur::text in ('google', 'gravatar') then new.foto else null end
    where id = v_profil.id and avatar_url is distinct from (case when new.foto_tur::text in ('google', 'gravatar') then new.foto else null end);
  end if;
  return new;
end $$;
drop trigger if exists kisi_uperden on payload.uyeler;
create trigger kisi_uperden after insert or update of ad, foto, foto_tur on payload.uyeler for each row execute function public.kisi_uperden();

-- İlk eşitleme (tetikleyiciler derinlik kontrolüyle kendi kendini çağırmaz)
do $$
declare r record; v_ad text;
begin
  for r in
    select p.id as pid, p.email, p.name as pad, nullif(p.avatar_url, '') as pfoto, y.id as yid, y.ad as yad, nullif(y.foto, '') as yfoto, y.foto_tur::text as ytur,
           (select a.name from payload.users u join payload.authors a on a.id = u.author_id where lower(u.email) = lower(p.email) limit 1) as aad
    from public.profiles p left join payload.uyeler y on lower(y.email) = lower(p.email)
  loop
    -- En uzun ad (soyadlı olan) ortak ad
    select x into v_ad from unnest(array[r.yad, r.aad, r.pad]) x where length(btrim(coalesce(x, ''))) >= 2 order by length(btrim(x)) desc limit 1;
    if v_ad is null then continue; end if;
    v_ad := left(btrim(v_ad), 40);
    update public.profiles set name = v_ad where id = r.pid and name is distinct from v_ad;
    perform public.kisi_yazar_adi(r.email, v_ad);
    if r.yid is not null then
      update payload.uyeler set ad = v_ad where id = r.yid and ad is distinct from v_ad;
      if r.pfoto is not null then
        update payload.uyeler set foto_tur = 'studyo', foto = r.pfoto where id = r.yid and foto is distinct from r.pfoto;
      elsif r.yfoto is not null and r.ytur in ('google', 'gravatar') then
        update public.profiles set avatar_url = r.yfoto where id = r.pid;
      end if;
    end if;
  end loop;
end $$;
