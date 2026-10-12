-- Haber Masası: eski "Updated Triyaj" tablosundan işlem görmüş haberlerin (alındı/yayında/pas) içe aktarımı.
-- Veri koda yazılmaz; yönetici Stüdyo'dan bu fonksiyonu tablodan okunan satırlarla çağırır.
create or replace function public.tr_import(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; durum text; kisi uuid; pri int;
begin
  if not is_admin() then raise exception 'Sadece yönetici'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    durum := case r->>'durum' when 'Alındı' then 'alindi' when 'Yayında' then 'yayinda' when 'Pas' then 'pas' else null end;
    continue when durum is null or coalesce(r->>'link', '') = '';
    select id into kisi from profiles where lower(name) = lower(r->>'editor') limit 1;
    pri := coalesce(nullif(substring(r->>'oncelik' from '\((\d+)\)'), '')::int, 0);
    insert into tr_items (created_at, published_at, source_name, link, title, event, brand, kind, topic, priority, model, status,
                          taken_by, taken_at, touched, updated_at)
    values (
      coalesce((r->>'tarih')::timestamp at time zone 'Europe/Istanbul', now()),
      (r->>'tarih')::timestamp at time zone 'Europe/Istanbul',
      coalesce(r->>'kaynak', ''), r->>'link', coalesce(r->>'baslik', ''), coalesce(r->>'olay', ''), coalesce(r->>'marka', ''),
      coalesce(r->>'tur', ''), coalesce(r->>'konu', ''), least(pri, 5), 'eski tablo', durum,
      case when durum in ('alindi', 'yayinda') then kisi end,
      case when durum in ('alindi', 'yayinda') then (r->>'tarih')::timestamp at time zone 'Europe/Istanbul' end,
      true, now())
    on conflict (link) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.tr_import(jsonb) from public, anon;
grant execute on function public.tr_import(jsonb) to authenticated;

-- Wirecutter'ın RSS adresi kaldırıldı (404); kaynak kapatılır.
update public.tr_sources set active = false where name = 'Wirecutter';
select 'aktarim fonksiyonu hazir' as sonuc;
