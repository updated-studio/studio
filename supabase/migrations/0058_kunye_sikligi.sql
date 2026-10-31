-- Künye turları sıklaşır (31 Ekim 2026): Brave araması + ücretsiz Gemini yolu çalışıyor (göç 0057); tur başına 3 ürün.
-- TR 11.10-23.40 arası yarım saatte bir (26 tur ≈ 78 ürün/gün). Doldurulacak ürün kalmayınca turlar hiçbir şey yapmadan biter;
-- Brave aylık 700 arama sınırı fonksiyonda (kunye-otomatik BRAVE_AY_SINIR).
do $$ begin
  if exists (select 1 from cron.job where jobname = 'kunye-otomatik') then perform cron.unschedule('kunye-otomatik'); end if;
  perform cron.schedule('kunye-otomatik', '10,40 8-20 * * *', 'select public.kunye_kick()');
end $$;
