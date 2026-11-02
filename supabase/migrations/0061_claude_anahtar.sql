-- Claude (Anthropic API) anahtarı (2 Kasım 2026, kullanıcı: "geminileri claude'un kredisiyle değiştirmeyi düşünüyorum", önce görsel seçimi).
-- triyaj-taslak/gorsel.ts görsel seçiminde Claude'u kullanır; anahtar yoksa ya da çağrı başarısızsa Gemini'ye döner.
-- Anahtar Stüdyo → Bağlantı anahtarları'ndan girilir.
alter table public.baglanti_anahtarlari drop constraint if exists baglanti_anahtarlari_ad_check;
alter table public.baglanti_anahtarlari add constraint baglanti_anahtarlari_ad_check
  check (ad = any (array['gemini_yedek', 'instagram', 'cloudflare_adres', 'cloudflare_anahtar', 'brave_arama', 'claude']));
