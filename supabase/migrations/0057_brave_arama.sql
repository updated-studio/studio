-- Brave arama anahtarı (31 Ekim 2026, kullanıcı: "ücretsiz geminiye yaptırmanın yolu mantıklı, yapalım"): künye otomasyonu ürünün
-- özellik sayfasını Brave Search API ile bulur, sayfayı kendisi okur, değerleri ücretsiz Gemini (araçsız istek) çıkarır.
-- Google'ın Custom Search JSON API'si yeni kullanıcıya kapalı. Anahtar Stüdyo → Bağlantı anahtarları'ndan girilir.
alter table public.baglanti_anahtarlari drop constraint if exists baglanti_anahtarlari_ad_check;
alter table public.baglanti_anahtarlari add constraint baglanti_anahtarlari_ad_check
  check (ad = any (array['gemini_yedek', 'instagram', 'cloudflare_adres', 'cloudflare_anahtar', 'brave_arama']));
