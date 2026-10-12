-- Haber Masası (triyaj) modülü: kaynaklardan haber toplama, yapay zekâ ile eleme, ekip iş akışı, taslaklar.
-- Eski Google Sheets "Updated Triyaj" sisteminin Stüdyo'daki karşılığı. Gizli anahtarlar burada değil, Supabase Secrets'ta.

-- Editörlerin ilgi alanları (önerilen editör seçimi için)
alter table public.profiles add column if not exists interests text not null default '';

-- Kaynaklar (RSS) ve sağlık durumu
create table if not exists public.tr_sources (
  id bigint generated always as identity primary key,
  category text not null default '',
  name text not null,
  url text not null unique,
  active boolean not null default true,
  last_check timestamptz,
  item_count int,
  last_item_at timestamptz,
  status text not null default '',          -- Çalışıyor / Yavaş / Ölü / Hata
  error text not null default '',
  created_at timestamptz not null default now()
);

-- Haberler: havuz, belirsiz, elenen, alınan, pas, yayında
create table if not exists public.tr_items (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),   -- sisteme girdiği an
  published_at timestamptz,                         -- kaynağın yayın zamanı
  source_id bigint references public.tr_sources on delete set null,
  source_name text not null default '',
  link text not null unique,
  title text not null,                              -- kaynaktaki özgün başlık
  event text not null default '',                   -- Türkçe tek cümle "olay"
  brand text not null default '',
  product text not null default '',
  kind text not null default '',                    -- Resmi / Söylenti / Sızıntı / İnceleme / Fırsat / Analiz
  topic text not null default '',
  priority smallint not null default 0,             -- 1-5
  ai_note text not null default '',
  model text not null default '',
  status text not null default 'aday' check (status in ('aday','belirsiz','elendi','alindi','pas','yayinda')),
  reason text not null default '',                  -- eleme nedeni
  wrong_by uuid references public.profiles on delete set null,   -- "yanlış elendi" diyen
  other_sources jsonb not null default '[]',        -- [{name, link}]
  suggested_editor uuid references public.profiles on delete set null,
  taken_by uuid references public.profiles on delete set null,
  taken_at timestamptz,
  transfer_from uuid references public.profiles on delete set null,
  transfer_seen boolean not null default true,
  last_dropped_by uuid references public.profiles on delete set null,
  translation text not null default '',
  work_state text not null default '' check (work_state in ('', 'ceviri', 'taslak', 'hata')),  -- arka plan işi sürüyor mu
  work_error text not null default '',
  touched boolean not null default false,           -- ekipten biri işlem yaptı mı (silme kuralı)
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles on delete set null
);
create index if not exists tr_items_status_idx on public.tr_items (status, priority desc, published_at desc);
create index if not exists tr_items_created_idx on public.tr_items (created_at);

-- Oy ve geri bildirim (yapay zekânın öğrenmesi için son notlar istemde kullanılır)
create table if not exists public.tr_votes (
  item_id bigint not null references public.tr_items on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  value smallint not null check (value in (-1, 1)),
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

-- Taslaklar (Stüdyo içinde düzenlenir; ileride WordPress'e gönderilir)
create table if not exists public.tr_drafts (
  id bigint generated always as identity primary key,
  item_id bigint references public.tr_items on delete set null,
  author uuid references public.profiles on delete set null,
  title text not null default '',
  spot text not null default '',
  body text not null default '',                   -- Markdown
  seo jsonb not null default '{}',                 -- focus, title_tag, slug, meta, category, tags[]
  sources text not null default '',
  image_note text not null default '',
  editor_note text not null default '',
  status text not null default 'taslak' check (status in ('taslak','hazir','gonderildi')),
  wp_post_id bigint,
  model text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ekip sohbeti
create table if not exists public.tr_chat (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  body text not null check (char_length(body) between 1 and 2000),
  item_id bigint references public.tr_items on delete set null,
  created_at timestamptz not null default now()
);

-- Türkiye pazarı markaları, basın kiti, ayarlar
create table if not exists public.tr_brands (
  name text primary key,
  grp text not null default 'Öncelikli',
  note text not null default ''
);
create table if not exists public.tr_press (
  id bigint generated always as identity primary key,
  brand text not null,
  url text not null,
  note text not null default ''
);
create table if not exists public.tr_settings (
  key text primary key,
  value jsonb not null
);
insert into public.tr_settings (key, value) values
  ('saklama_gun', '3'),
  ('gurultu_kelimeleri', '["sponsored","deals","deal:","% off","coupon","giveaway","daily:","podcast","quiz","wordle","horoscope","promo code","best buy","prime day","black friday deals"]'),
  ('model_eleme', '"gemini-3.5-flash-lite"'),
  ('model_taslak', '"gemini-3.6-flash"')
on conflict (key) do nothing;

-- Değişiklik izi: ekipten biri dokunursa "touched" ve "updated_by" işlenir
create or replace function public.tr_item_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
    new.touched := true;
  end if;
  return new;
end;
$$;
drop trigger if exists tr_items_touch on public.tr_items;
create trigger tr_items_touch before update on public.tr_items
  for each row execute function public.tr_item_touch();

create or replace function public.tr_vote_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update tr_items set touched = true where id = new.item_id;
  return new;
end;
$$;
drop trigger if exists tr_votes_touch on public.tr_votes;
create trigger tr_votes_touch after insert or update on public.tr_votes
  for each row execute function public.tr_vote_touch();

-- İş akışı: al, bırak, aktar (bildirimli; yarışta iki kişi aynı haberi alamaz)
create or replace function public.tr_take(p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'Yetki yok'; end if;
  update tr_items set status = 'alindi', taken_by = auth.uid(), taken_at = now(), transfer_from = null, transfer_seen = true
  where id = p_item and (taken_by is null or status not in ('alindi','yayinda'));
  if not found then raise exception 'Bu haberi başkası aldı'; end if;
end;
$$;

create or replace function public.tr_drop(p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update tr_items set status = 'aday', taken_by = null, taken_at = null, last_dropped_by = auth.uid()
  where id = p_item and (taken_by = auth.uid() or is_admin());
  if not found then raise exception 'Bu haber sende değil'; end if;
end;
$$;

create or replace function public.tr_transfer(p_item bigint, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it tr_items; me text;
begin
  select * into it from tr_items where id = p_item;
  if not found or not (it.taken_by = auth.uid() or is_admin()) then raise exception 'Bu haberi aktarma yetkin yok'; end if;
  if p_user = it.taken_by then raise exception 'Haber zaten bu kişide'; end if;
  update tr_items set taken_by = p_user, status = 'alindi', transfer_from = auth.uid(), transfer_seen = false, taken_at = now()
  where id = p_item;
  select name into me from profiles where id = auth.uid();
  insert into notifications (user_id, body)
  values (p_user, me || ' sana bir haber aktardı: ' || coalesce(nullif(it.event, ''), it.title) || ' (Haber Masası > Benim aldıklarım)');
end;
$$;

-- Saklama kuralı: kimsenin dokunmadığı havuz/belirsiz/elenen haberler N günden eskiyse silinir
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
  return n;
end;
$$;

-- Erişim kuralları
alter table public.tr_sources enable row level security;
alter table public.tr_items enable row level security;
alter table public.tr_votes enable row level security;
alter table public.tr_drafts enable row level security;
alter table public.tr_chat enable row level security;
alter table public.tr_brands enable row level security;
alter table public.tr_press enable row level security;
alter table public.tr_settings enable row level security;

create policy tr_sources_okuma on public.tr_sources for select to authenticated using (is_member());
create policy tr_sources_yonetim on public.tr_sources for all to authenticated using (is_admin()) with check (is_admin());
create policy tr_items_okuma on public.tr_items for select to authenticated using (is_member());
create policy tr_items_guncelleme on public.tr_items for update to authenticated using (is_member()) with check (is_member());
create policy tr_items_silme on public.tr_items for delete to authenticated using (is_admin());
create policy tr_votes_okuma on public.tr_votes for select to authenticated using (is_member());
create policy tr_votes_yazma on public.tr_votes for insert to authenticated with check (is_member() and user_id = auth.uid());
create policy tr_votes_guncelleme on public.tr_votes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tr_votes_silme on public.tr_votes for delete to authenticated using (user_id = auth.uid());
create policy tr_drafts_okuma on public.tr_drafts for select to authenticated using (is_member());
create policy tr_drafts_yazma on public.tr_drafts for insert to authenticated with check (is_member());
create policy tr_drafts_guncelleme on public.tr_drafts for update to authenticated using (is_member()) with check (is_member());
create policy tr_drafts_silme on public.tr_drafts for delete to authenticated using (author = auth.uid() or is_admin());
create policy tr_chat_okuma on public.tr_chat for select to authenticated using (is_member());
create policy tr_chat_yazma on public.tr_chat for insert to authenticated with check (is_member() and user_id = auth.uid());
create policy tr_chat_silme on public.tr_chat for delete to authenticated using (user_id = auth.uid() or is_admin());
create policy tr_brands_okuma on public.tr_brands for select to authenticated using (is_member());
create policy tr_brands_yonetim on public.tr_brands for all to authenticated using (is_admin()) with check (is_admin());
create policy tr_press_okuma on public.tr_press for select to authenticated using (is_member());
create policy tr_press_yonetim on public.tr_press for all to authenticated using (is_admin()) with check (is_admin());
create policy tr_settings_okuma on public.tr_settings for select to authenticated using (is_member());
create policy tr_settings_yonetim on public.tr_settings for all to authenticated using (is_admin()) with check (is_admin());

grant select, insert, update, delete on public.tr_sources, public.tr_items, public.tr_votes, public.tr_drafts,
  public.tr_chat, public.tr_brands, public.tr_press, public.tr_settings to authenticated;
revoke all on public.tr_sources, public.tr_items, public.tr_votes, public.tr_drafts,
  public.tr_chat, public.tr_brands, public.tr_press, public.tr_settings from anon;

revoke execute on function public.tr_take(bigint), public.tr_drop(bigint), public.tr_transfer(bigint, uuid) from public, anon;
grant execute on function public.tr_take(bigint), public.tr_drop(bigint), public.tr_transfer(bigint, uuid) to authenticated;
revoke execute on function public.tr_cleanup() from public, anon, authenticated;

alter publication supabase_realtime add table public.tr_items, public.tr_votes, public.tr_drafts, public.tr_chat, public.tr_sources, public.tr_settings, public.tr_brands, public.tr_press;

-- Zamanlanmış işler: 15 dakikada bir toplama, her gece 03:30 (TR) temizlik
create or replace function public.tr_kick() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://fulmooonidwrqyybbkvu.supabase.co/functions/v1/triyaj-topla',
    body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 1000);
end;
$$;
revoke execute on function public.tr_kick() from public, anon, authenticated;

select cron.schedule('triyaj-topla', '*/15 * * * *', 'select public.tr_kick()');
select cron.schedule('triyaj-temizlik', '30 0 * * *', 'select public.tr_cleanup()');

select 'haber masası tamam' as sonuc;
