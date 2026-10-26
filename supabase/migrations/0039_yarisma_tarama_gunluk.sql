-- Yarışma taraması her gün 11.00'de (İstanbul) denenir; fonksiyon son başarılı tarama 6 günden yeniyse atlar.
-- Neden: yapay zekâ günlük kotası Haber Masası'yla ortak; kota dolduğu gün tarama ertesi gün yeniden denensin.
-- 11.00 seçildi: Gemini günlük kotası 10.00'da (İstanbul) sıfırlanır.
select cron.unschedule('yarisma-tarama');
select cron.schedule('yarisma-tarama', '0 8 * * *', 'select public.yarisma_kick()');
