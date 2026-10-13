-- Enes (13 Ekim 2026): yabancı kaynakların rehber ve liste içerikleri ("en iyi 10 kulaklık", "nasıl yapılır") elenmez,
-- "Rehber fikirleri" bölümüne düşer. Kampanya/indirim yazıları elenmeye devam eder.
alter table public.tr_items drop constraint if exists tr_items_status_check;
alter table public.tr_items add constraint tr_items_status_check
  check (status in ('aday','belirsiz','elendi','alindi','pas','yayinda','rehber'));

-- Eski "Tür: Rehber" ile elenmiş ve kimsenin dokunmadığı haberler rehber bölümüne taşınır
update public.tr_items set status = 'rehber', reason = ''
where status = 'elendi' and reason = 'Tür: Rehber';

-- Rehber fikirleri de saklama kuralına girer (kimse dokunmadıysa N gün sonra silinir)
create or replace function public.tr_cleanup() returns int
language plpgsql security definer set search_path = public as $$
declare gun int; n int;
begin
  select coalesce((value #>> '{}')::int, 3) into gun from tr_settings where key = 'saklama_gun';
  delete from tr_items
  where touched = false and taken_by is null
    and status in ('aday', 'belirsiz', 'elendi', 'rehber')
    and created_at < now() - make_interval(days => coalesce(gun, 3));
  get diagnostics n = row_count;
  delete from tr_seen where created_at < now() - interval '7 days';
  return n;
end;
$$;

-- Etkinlik: rehber fikrinden alınan haber de "aldı" sayılır
create or replace function public.tr_item_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare tur text; ad text;
begin
  if auth.uid() is null or new.status is not distinct from old.status then return new; end if;
  tur := case
    when new.status = 'alindi' and old.status in ('aday', 'belirsiz', 'pas', 'elendi', 'rehber') then 'aldı'
    when new.status = 'yayinda' then 'yayında'
    when new.status = 'pas' then 'pas'
    when new.status = 'aday' and old.status = 'alindi' then 'bıraktı'
    when new.status = 'aday' and old.status = 'pas' then 'geri aldı'
    else null end;
  if tur is null then return new; end if;
  select name into ad from profiles where id = auth.uid();
  insert into tr_activity (kind, actor, actor_name, item_id, title, link, read_by)
  values (tur, auth.uid(), coalesce(ad, ''), new.id, left(coalesce(nullif(new.event, ''), new.title), 160), new.link, array[auth.uid()]);
  return new;
end;
$$;

select 'rehber fikirleri hazır' as sonuc;
