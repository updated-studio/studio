-- Tek giriş (Fatih, 24 Ekim 2026): ekibe yeni biri yalnız Stüdyo'dan davet edilir; site panelindeki (Payload) hesabı
-- kendiliğinden, burada seçilen rolle açılır. Rol değişikliği ve üyeliğin kaldırılması da yalnız Stüdyo'dan yapılır.
-- Davet edilen kişiye otomatik davet e-postası gider (notify-email). Tekrar çalıştırılabilir.

-- Site rolleri: site deposu apps/cms/src/access/roles.ts ROLES ile aynı; 'yok' = sitede yetkisi yok
alter table public.invites add column if not exists site_rol text not null default 'editor';
alter table public.profiles add column if not exists site_rol text not null default 'yok';
alter table public.invites add column if not exists davet_gonderildi timestamptz;

do $$ begin
  alter table public.invites add constraint invites_site_rol check (site_rol in ('yok','admin','yayin-yonetmeni','editor','video','tasarimci','sosyal'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_site_rol check (site_rol in ('yok','admin','yayin-yonetmeni','editor','video','tasarimci','sosyal'));
exception when duplicate_object then null; end $$;

-- Mevcut üyeler: paneldeki bugünkü rolleri aynen taşınır; panel hesabı olmayan üyenin sitede yetkisi yok
update public.profiles p set site_rol = u.role::text
  from payload.users u where lower(u.email) = lower(p.email) and p.site_rol = 'yok';
-- Bekleyen eski davetler: site yetkisi Fatih seçene kadar yok; eski davetlere e-posta gönderilmez
update public.invites i set site_rol = 'yok', davet_gonderildi = coalesce(davet_gonderildi, i.created_at)
  where davet_gonderildi is null and not exists (select 1 from public.profiles p where lower(p.email) = lower(i.email));
update public.invites i set site_rol = p.site_rol, davet_gonderildi = coalesce(davet_gonderildi, i.created_at)
  from public.profiles p where lower(p.email) = lower(i.email);

-- Kaydolan kişi davetteki site rolüyle başlar
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv invites;
begin
  select * into inv from invites where lower(email) = lower(new.email);
  if not found then
    raise exception 'Bu e-posta davet listesinde yok';
  end if;
  insert into profiles (id, email, name, role, org, is_admin, site_rol)
  values (new.id, new.email, inv.name, inv.role, inv.org, inv.is_admin, inv.site_rol);
  return new;
end;
$$;

-- Üye kendi site rolünü de değiştiremez
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin()
     and (new.is_admin is distinct from old.is_admin or new.email is distinct from old.email
          or new.site_rol is distinct from old.site_rol) then
    raise exception 'Bu alani sadece yonetici degistirebilir';
  end if;
  return new;
end;
$$;

-- Site paneli (veritabanı kullanıcısı payload) kişinin adını ve site rolünü yalnız bu işlevle okur; tablolara erişimi yok
create or replace function public.site_uyesi(eposta text) returns table (ad text, site_rol text)
language sql stable security definer set search_path = public as $$
  select name, site_rol from profiles where lower(email) = lower(eposta) limit 1;
$$;
revoke execute on function public.site_uyesi(text) from public, anon, authenticated;
grant usage on schema public to payload;
grant execute on function public.site_uyesi(text) to payload;

-- Davet eklenince (ya da "yeniden gönder" ile davet_gonderildi boşaltılınca) davet e-postası gider
create or replace function public.kick_davet() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'http://functions:9000/notify-email',
    body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb);
  return null;
end;
$$;
drop trigger if exists invites_davet on public.invites;
create trigger invites_davet after insert or update of davet_gonderildi on public.invites
  for each statement execute function public.kick_davet();
