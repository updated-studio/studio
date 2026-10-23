# Flux işçisi (Updated Stüdyo)

Haber Masası'nda uygun fotoğraf bulunamayan taslaklara **yazısız, gerçekçi** bir öne çıkan görseli Fatih'in Mac'i üretir (çevrimdışı, ücretsiz).

- Model: **FLUX.1-schnell** (Apache 2.0, ticari kullanım serbest). FLUX.1-dev ticari kullanıma kapalı, kullanılmaz.
- Gereken: Apple Silicon Mac, en az 16 GB bellek (32 GB rahat), ilk indirme için ~30 GB boş alan.
- Akış: taslağın kalite kontrolü fotoğraf bulamazsa görsel isteği sıraya girer (ya da editör Taslaklar → Görsel → "Flux ile görsel üret"e basar).
  İşçi dakikada bir sorar, üretir, yükler. Görsel taslağın öne çıkan görseli olur; taslak panele gönderilmişse orada kapak olur.
  Altyazı: "Görsel yapay zekâ ile üretilmiştir."
- Mac kapalıyken istekler bekler; açılınca üretilir.

## Kurulum (bir kez)
1. Supabase → Edge Functions → Secrets → `FLUX_TOKEN` adında uzun rastgele bir değer ekle (sahip ekler; Claude girmez).
2. Terminal'de: `bash scripts/flux-isci/kur.sh` → token sorulunca aynı değeri yapıştır (ekranda görünmez).
3. Kayıt: `~/updated-flux/kayit.log`. Durdurmak: `launchctl unload ~/Library/LaunchAgents/tr.com.updated.flux.plist`.
