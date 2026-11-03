-- Görsel model kıyası anahtarları (3 Kasım 2026, kullanıcı: "modellerin arasına gemini ve chat gpt'yi de test etmeliyiz, anahtarları ayarlayalım").
-- openai: GPT Image; gemini_gorsel: faturalandırması açık Google projesinden Nano Banana (ücretsiz Gemini anahtarları görsel üretemez).
-- Anahtarlar Stüdyo → Bağlantı anahtarları'ndan girilir.
alter table public.baglanti_anahtarlari drop constraint if exists baglanti_anahtarlari_ad_check;
alter table public.baglanti_anahtarlari add constraint baglanti_anahtarlari_ad_check
  check (ad = any (array['gemini_yedek', 'instagram', 'cloudflare_adres', 'cloudflare_anahtar', 'brave_arama', 'claude', 'openai', 'gemini_gorsel']));
