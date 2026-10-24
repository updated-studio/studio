-- 0026 düzeltmesi: site rolü "yok" olunca ya da üye silinince panel API anahtarının kendisi de silinir.
-- Panel (Payload) API anahtarıyla girişte yalnız anahtarın varlığına bakıyor, "açık/kapalı" işaretine bakmıyor; 0026'daki
-- enable_a_p_i_key = false tek başına anahtarı durdurmuyordu. Tekrar çalıştırılabilir.
-- Not: postgres rolünün payload.users üzerindeki güncelleme izni api_key ve api_key_index sütunlarını da kapsamalı
-- (site deposu deploy/altyapi/panel-tasi.sh ve KURTARMA.md'deki grant satırı).
create or replace function public.site_rol_esitle() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  e text := case when tg_op = 'DELETE' then old.email else new.email end;
  r text := case when tg_op = 'DELETE' then 'yok' else new.site_rol end;
begin
  if r = 'yok' then
    delete from payload.users_sessions s using payload.users u where s._parent_id = u.id and lower(u.email) = lower(e);
    update payload.users set enable_a_p_i_key = false, api_key = null, api_key_index = null where lower(email) = lower(e);
  else
    update payload.users set role = r::payload.enum_users_role, name = new.name
      where lower(email) = lower(e) and (role::text is distinct from r or name is distinct from new.name);
  end if;
  return null;
end;
$$;
revoke execute on function public.site_rol_esitle() from public, anon, authenticated;
