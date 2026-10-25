-- UPDATED Monitör hata kayıtları (25 Ekim 2026): uygulama çöker ya da donarsa ayrıntı bir sonraki açılışta buraya gönderilir
-- (cihazda deneme yapan ekip log göndermek zorunda kalmasın). Uygulama yalnız ekleyebilir (açık anahtarla); okumak yalnız ekibe.
create table if not exists public.monitor_hatalar (
  id bigint generated always as identity primary key,
  surum text, cihaz text, android text, tur text, metin text,
  created_at timestamptz not null default now()
);
alter table public.monitor_hatalar enable row level security;
create policy "uygulama ekler" on public.monitor_hatalar for insert to anon, authenticated with check (length(coalesce(metin, '')) < 20000);
create policy "ekip okur" on public.monitor_hatalar for select to authenticated using (true);
