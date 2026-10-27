-- Künye otomasyonu zamanlayıcısı (27 Ekim 2026, kullanıcı: "her gün otomatik"): günde 4 tur, her turda 3 ürün (~12 ürün/gün;
-- 82 künye yaklaşık bir haftada önerilir). Öneriler Stüdyo → Site → Künye onayı'na düşer, editör onaylamadan siteye geçmez.
-- Gemini kotası dolunca kunye-otomatik yedek anahtara (Bağlantı anahtarları) geçer; o da doluysa durur, ertesi tur dener.
-- Saatler UTC: yarışma taramasıyla (pazartesi 06.00) çakışmaz.
create or replace function public.kunye_kick()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(url := 'http://functions:9000/kunye-otomatik', body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 5000);
end $$;
revoke execute on function public.kunye_kick() from public, anon, authenticated;
select cron.schedule('kunye-otomatik', '40 7,11,15,19 * * *', 'select public.kunye_kick()');
