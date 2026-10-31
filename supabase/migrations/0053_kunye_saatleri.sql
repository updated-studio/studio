-- Künye otomasyonu saatleri (31 Ekim 2026): 25-31 Ekim arası hiç öneri yazılmadı; elle başlatılan tur iki Gemini anahtarında da 429 (kota dolu) aldı.
-- Haber Masası günlük kotayı gün içinde bitiriyor. Google kotayı Pasifik gece yarısı yeniler (TR 10.00 yaz saati, 1 Kasım'dan sonra 11.00);
-- künye turları bu yüzden yenilemenin hemen arkasına, 08.10 / 08.30 / 08.50 UTC'ye (TR 11.10-11.50) alınır: her iki saat düzeninde de yenilemeden sonradır.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'kunye-otomatik') then perform cron.unschedule('kunye-otomatik'); end if;
  perform cron.schedule('kunye-otomatik', '10,30,50 8 * * *', 'select public.kunye_kick()');
end $$;
