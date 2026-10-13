-- Haber Masası'nı eski "Updated Triyaj" (Apps Script) sistemiyle birebir eşitler.
-- Eski sistemde olup yenide olmayan alanlar, oy biçimi, etkinlik (bildirim) havuzu, notlu aktarma ve taslak alanları.

-- 1) Haber alanları (eski tablodaki sütunlar)
alter table public.tr_items add column if not exists origin text not null default '';        -- Asıl Kaynak
alter table public.tr_items add column if not exists turkey text not null default '';        -- var / yok / global / belirsiz
alter table public.tr_items add column if not exists event_key text not null default '';     -- olay kimliği (aynı olay gruplanır)
alter table public.tr_items add column if not exists draft_url text not null default '';     -- eski sistemin Google Docs taslağı
alter table public.tr_items add column if not exists transfer_note text not null default ''; -- aktarırken yazılan not
alter table public.tr_items add column if not exists last_action text not null default '';   -- "Güncelleme": zaman · kişi · işlem
create index if not exists tr_items_event_key_idx on public.tr_items (event_key) where event_key <> '';

-- 2) Görülen bağlantılar: aynı olaya bağlanıp ayrı satır olmayan haberler tekrar gelmesin
create table if not exists public.tr_seen (link text primary key, created_at timestamptz not null default now());
alter table public.tr_seen enable row level security;
revoke all on public.tr_seen from anon, authenticated;
insert into public.tr_seen (link)
  select distinct o->>'link' from public.tr_items, jsonb_array_elements(other_sources) o where coalesce(o->>'link', '') <> ''
  on conflict do nothing;

-- 3) Oy (eski "Geri Bildirim"): haber başına tek oy; marka/konu/olay/link oyla birlikte saklanır (haber silinse de oy kalır)
alter table public.tr_votes drop constraint if exists tr_votes_pkey;
alter table public.tr_votes add column if not exists id bigint generated always as identity primary key;
alter table public.tr_votes alter column item_id drop not null;
alter table public.tr_votes drop constraint if exists tr_votes_item_id_fkey;
alter table public.tr_votes add constraint tr_votes_item_id_fkey foreign key (item_id) references public.tr_items on delete set null;
alter table public.tr_votes add column if not exists brand text not null default '';
alter table public.tr_votes add column if not exists topic text not null default '';
alter table public.tr_votes add column if not exists event text not null default '';
alter table public.tr_votes add column if not exists link text not null default '';
-- Aynı habere ikinci oy verilmez (eski kural). Varsa fazlalar silinir, ilk oy kalır.
delete from public.tr_votes a using public.tr_votes b where a.item_id = b.item_id and a.created_at > b.created_at;
create unique index if not exists tr_votes_tek on public.tr_votes (item_id) where item_id is not null;
create unique index if not exists tr_votes_link on public.tr_votes (link) where link <> '';

create or replace function public.tr_vote_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare it tr_items;
begin
  if new.item_id is not null then
    select * into it from tr_items where id = new.item_id;
    if found then
      new.brand := it.brand; new.topic := it.topic; new.event := coalesce(nullif(it.event, ''), it.title); new.link := it.link;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists tr_votes_fill on public.tr_votes;
create trigger tr_votes_fill before insert on public.tr_votes for each row execute function public.tr_vote_fill();
update public.tr_votes v set brand = i.brand, topic = i.topic, event = coalesce(nullif(i.event, ''), i.title), link = i.link
  from public.tr_items i where i.id = v.item_id;

-- 4) Taslak alanları (eski taslak dokümanındaki bölümler)
alter table public.tr_drafts add column if not exists questions jsonb not null default '[]';  -- editöre sorular
alter table public.tr_drafts add column if not exists checks jsonb not null default '[]';     -- yayından önce doğrula
alter table public.tr_drafts add column if not exists notes jsonb not null default '[]';      -- editör notları
alter table public.tr_drafts add column if not exists image jsonb not null default '{}';      -- öneri, alt text, aramalar, stok, basın kiti, yapay zekâ istemi

-- 5) Etkinlik / bildirim havuzu (eski "Bildirimler")
create table if not exists public.tr_activity (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null,                 -- aldı / yayında / pas / bıraktı / geri aldı / aktar
  actor uuid references public.profiles on delete set null,
  target uuid references public.profiles on delete set null,
  actor_name text not null default '',
  target_name text not null default '',
  item_id bigint references public.tr_items on delete set null,
  title text not null default '',
  link text not null default '',
  note text not null default '',
  read_by uuid[] not null default '{}'
);
create index if not exists tr_activity_created_idx on public.tr_activity (created_at desc);
alter table public.tr_activity enable row level security;
create policy tr_activity_okuma on public.tr_activity for select to authenticated using (is_member());
grant select on public.tr_activity to authenticated;
revoke all on public.tr_activity from anon;

create or replace function public.tr_activity_read() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_member() then raise exception 'Yetki yok'; end if;
  update tr_activity set read_by = array_append(read_by, auth.uid())
  where not (auth.uid() = any(read_by)) and created_at > now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.tr_activity_read() from public, anon;
grant execute on function public.tr_activity_read() to authenticated;

-- Durum değişince: "Güncelleme" satırı ve etkinlik kaydı (eski durumGuncelle + logla_)
create or replace function public.tr_item_touch() returns trigger
language plpgsql security definer set search_path = public as $$
declare ad text;
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
    new.touched := true;
    if new.status is distinct from old.status then
      select name into ad from profiles where id = auth.uid();
      new.last_action := to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') || ' · ' || coalesce(ad, '');
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.tr_item_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare tur text; ad text;
begin
  if auth.uid() is null or new.status is not distinct from old.status then return new; end if;
  tur := case
    when new.status = 'alindi' and old.status in ('aday', 'belirsiz', 'pas', 'elendi') then 'aldı'
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
drop trigger if exists tr_items_log on public.tr_items;
create trigger tr_items_log after update on public.tr_items for each row execute function public.tr_item_log();

-- 6) Al / bırak / aktar (eski kurallar: alınca "son bırakan" silinir; bırakınca aktarım izi silinir; aktarmada not)
create or replace function public.tr_take(p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'Yetki yok'; end if;
  update tr_items set status = 'alindi', taken_by = auth.uid(), taken_at = now(), transfer_from = null, transfer_seen = true,
                      transfer_note = '', last_dropped_by = null
  where id = p_item and (taken_by is null or status not in ('alindi','yayinda') or taken_by = auth.uid());
  if not found then raise exception 'Bu haberi başkası aldı'; end if;
end;
$$;

create or replace function public.tr_drop(p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update tr_items set status = 'aday', last_dropped_by = taken_by, taken_by = null, taken_at = null,
                      transfer_from = null, transfer_seen = true, transfer_note = ''
  where id = p_item and (taken_by = auth.uid() or is_admin());
  if not found then raise exception 'Bu haber sende değil'; end if;
end;
$$;

drop function if exists public.tr_transfer(bigint, uuid);
create or replace function public.tr_transfer(p_item bigint, p_user uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare it tr_items; me text; kime text; baslik text;
begin
  select * into it from tr_items where id = p_item;
  if not found or not (it.taken_by = auth.uid() or is_admin()) or it.status <> 'alindi' then raise exception 'Bu haber artık sende değil, sayfayı yenile'; end if;
  if p_user = it.taken_by then raise exception 'Haber zaten bu kişide'; end if;
  select name into me from profiles where id = auth.uid();
  select name into kime from profiles where id = p_user;
  if kime is null then raise exception 'Geçersiz editör'; end if;
  baslik := left(coalesce(nullif(it.event, ''), it.title), 160);
  update tr_items set taken_by = p_user, transfer_from = auth.uid(), transfer_seen = false, taken_at = now(),
                      transfer_note = left(coalesce(p_note, ''), 300),
                      last_action = to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM-DD HH24:MI') || ' · ' || me || ' → ' || kime
  where id = p_item;
  insert into tr_activity (kind, actor, target, actor_name, target_name, item_id, title, link, note, read_by)
  values ('aktar', auth.uid(), p_user, me, kime, p_item, baslik, it.link, left(coalesce(p_note, ''), 300), array[auth.uid()]);
  insert into notifications (user_id, body)
  values (p_user, me || ' sana bir haber aktardı: ' || baslik || case when coalesce(p_note, '') <> '' then ' — "' || p_note || '"' else '' end || ' (Haber Masası > Benim aldıklarım)');
end;
$$;
revoke execute on function public.tr_transfer(bigint, uuid, text) from public, anon;
grant execute on function public.tr_transfer(bigint, uuid, text) to authenticated;

-- 7) Saklama: görülen bağlantılar 7 günde temizlenir
create or replace function public.tr_cleanup() returns int
language plpgsql security definer set search_path = public as $$
declare gun int; n int;
begin
  select coalesce((value #>> '{}')::int, 3) into gun from tr_settings where key = 'saklama_gun';
  delete from tr_items
  where touched = false and taken_by is null
    and status in ('aday', 'belirsiz', 'elendi')
    and created_at < now() - make_interval(days => coalesce(gun, 3));
  get diagnostics n = row_count;
  delete from tr_seen where created_at < now() - interval '7 days';
  return n;
end;
$$;

-- 8) Eski sistemin ayarları: gürültü kelimeleri (başlık + özette, kelime sınırıyla), modeller
insert into public.tr_settings (key, value) values
  ('gurultu_kelimeleri', '["deals","discount","% off","on sale for","coupon","promo code","price drop","lowest price","save $","black friday","prime day","cyber monday","in stock","restock","back in stock","giveaway","sponsored","best buy"]'),
  ('model_taslak', '"gemini-3.8-flash"')
on conflict (key) do update set value = excluded.value;

alter publication supabase_realtime add table public.tr_activity;

select 'triyaj eşitleme hazır' as sonuc;
