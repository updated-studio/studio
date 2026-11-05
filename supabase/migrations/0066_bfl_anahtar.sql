-- Black Forest Labs anahtarı (5 Kasım 2026, kullanıcı: "FLUX 3'ü de deneyelim"): FLUX 3 Image ve FLUX 3 Image Klein yalnız BFL'nin kendi
-- servisinde (Cloudflare'de yok). Görsel kıyasında diğer modellerle yan yana üretir. Anahtar Stüdyo → Bağlantı anahtarları'ndan girilir.
alter table public.baglanti_anahtarlari drop constraint if exists baglanti_anahtarlari_ad_check;
alter table public.baglanti_anahtarlari add constraint baglanti_anahtarlari_ad_check
  check (ad = any (array['gemini_yedek', 'instagram', 'cloudflare_adres', 'cloudflare_anahtar', 'brave_arama', 'claude', 'openai', 'gemini_gorsel', 'bfl']));
