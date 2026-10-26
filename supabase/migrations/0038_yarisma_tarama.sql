-- Yarışmalar takvimi (26 Ekim 2026, offocus yol haritası 3): haftalık yarışma taraması.
-- yarisma-bul fonksiyonu bulduklarını panele "öneri" olarak bırakır; ekip Stüdyo → Site → Yarışmalar'da onaylar.
-- Bu tablo yalnız tarama kaydı (ne zaman, kim, kaç öneri, hata); fonksiyon oturumsuz çağrıyı 6 günde bire sınırlar.
create table if not exists public.yarisma_tarama (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kim text,
  eklenen int not null default 0,
  hata text
);
alter table public.yarisma_tarama enable row level security;
create policy "ekip okur" on public.yarisma_tarama for select to authenticated using (public.is_member());

create or replace function public.yarisma_kick() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(url := 'http://functions:9000/yarisma-bul', body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 1000);
end $$;
revoke execute on function public.yarisma_kick() from public, anon, authenticated;

-- Pazartesi 09.00 (İstanbul)
select cron.schedule('yarisma-tarama', '0 6 * * 1', 'select public.yarisma_kick()');
