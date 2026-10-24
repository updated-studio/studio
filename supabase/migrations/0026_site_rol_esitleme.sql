-- Tek giriş devamı: Stüdyo'da site rolü değişince ya da üye çıkarılınca site paneli (Payload, aynı veritabanında payload şeması)
-- anında güncellenir. Rol "yok" olursa ya da üye silinirse panelde açık oturumları ve API anahtarı kapanır; Stüdyo'dan girişi
-- zaten panelin Stüdyo girişi (site deposu auth/studyo.ts) engeller. Tekrar çalıştırılabilir.
create or replace function public.site_rol_esitle() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  e text := case when tg_op = 'DELETE' then old.email else new.email end;
  r text := case when tg_op = 'DELETE' then 'yok' else new.site_rol end;
begin
  if r = 'yok' then
    delete from payload.users_sessions s using payload.users u where s._parent_id = u.id and lower(u.email) = lower(e);
    update payload.users set enable_a_p_i_key = false where lower(email) = lower(e);
  else
    update payload.users set role = r::payload.enum_users_role, name = new.name
      where lower(email) = lower(e) and (role::text is distinct from r or name is distinct from new.name);
  end if;
  return null;
end;
$$;
revoke execute on function public.site_rol_esitle() from public, anon, authenticated;
drop trigger if exists profiles_site_rol on public.profiles;
create trigger profiles_site_rol after update of site_rol, name or delete on public.profiles
  for each row execute function public.site_rol_esitle();
