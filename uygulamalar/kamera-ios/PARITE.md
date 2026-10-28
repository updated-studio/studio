# UPDATED Kamera: Android ↔ iPhone/iPad eşitliği

Fatih (28 Ekim 2026): "Android'deki uygulamanın birebir aynısı Apple'da olsun; yeni özellikler iki tarafa birlikte eklensin." Bu liste iki tarafın durumunu tutar.
Yeni özellik eklenince iki sütun da doldurulur. ✓ var · ✱ yapılıyor · ○ yok · — platform izin vermiyor

İş bölümü (iki Claude aynı dalda): **Kamera ekranı** = proje sohbetindeki Claude, **Monitör ekranı** = sunucudaki (Remote Control) Claude. Ortak dosyalarda (AnaEkran.swift, Kamera.swift, project.yml) küçük ve sık gönderim, önce rebase.

## Kamera ekranı (Android: KameraActivity)

| Özellik | Android | iOS | Not |
|---|---|---|---|
| Tam ekran görüntü, saydam katmanlar, simgeli düğmeler (0.11 düzeni) | ✓ | ✱ | |
| Mod şeridi: TIMELAPSE · VİDEO · FOTO · PRO MODLAR · PORTRE · MONİTÖR | ✓ | ✱ | iOS'ta şimdi FOTO/VİDEO/PRO |
| Fotoğraf: çözünürlük seçimi, RAW (DNG), zamanlayıcı, deklanşör sesi | ✓ | ✱ | iOS'ta ProRAW/Bayer RAW cihaza göre |
| Video: 720p/1080p/4K, 30/60 fps | ✓ | ✱ | |
| Timelapse: aralık, süre sınırı, pozlamayı sabitle | ✓ | ✱ | |
| PRO MODLAR (9 mod, Özelleştir, uyarı, "?" açıklamaları, baz ISO) | ✓ | ✓ | |
| Portre (pozlama/odak yüze göre) | ✓ | ✱ | iOS'ta Vision yüz bulma |
| Kompozisyon kılavuzları (üçte bir, phi, spiral, köşegen, üçgen, simetri, öncü çizgi) | ✓ | ✱ | |
| Otomatik sahne önerisi / akıllı yardımcı | ✓ | ✱ | Android ML Kit, iOS Vision |
| Terazi (ufuk) | ✓ | ✱ | |
| Ses göstergesi (çizgili, sol alt) | ✓ | ✱ | |
| Elle ISO + baz ISO işareti | ✓ | ✓ | |
| Wi-Fi kamera ol (Masa'ya) | ✓ | ✓ | |
| Açılışta Kamera / Monitör sor | ✓ | ✱ | |

## Monitör ekranı (Android: MainActivity + MonitorGorunum)

| Özellik | Android | iOS | Not |
|---|---|---|---|
| Kaynak: USB (Sony USB yayını, HDMI→USB çevirici) | ✓ | ○ | iPad'de var; iPhone'da Apple izin vermiyor (—) |
| Kaynak: telefon kamerası, ağ (Wi-Fi kamera) | ✓ | ○ | |
| LUT (.cube), LUT karşılaştırma | ✓ | ○ | |
| False color, zebra (seviye), odak yardımı (peaking, renk, hassasiyet) | ✓ | ○ | |
| Anamorfik açma, büyütme, ayna / ters çevir / döndür, siyah-beyaz, temiz görüntü | ✓ | ○ | |
| Kadraj kılavuzu, güvenli alan, merkez işareti | ✓ | ○ | |
| Ölçüm: dalga formu, RGB parade, vektörskop, histogram | ✓ | ○ | |
| Kipler: tek ekran, görüntü + ölçüm, LUT karşılaştırma, iki kaynak | ✓ | ○ | |
| Kayıt: kodek (H.264/H.265), bit hızı, ses kaydı | ✓ | ○ | |
| Ses göstergesi (iki kanal) | ✓ | ○ | |
| Ekran parlaklığı en yüksek | ✓ | ○ | |

## Masa (çok kamera)

| Özellik | Android | iOS | Not |
|---|---|---|---|
| Masa: kaynakları bul, canlı geçiş, tally, 1080p kayıt | ✓ | ✓ | |
| USB kameraları masaya ekle | ✓ | ✓ | iOS'ta yalnız iPad |

## Uygulama

| Özellik | Android | iOS | Not |
|---|---|---|---|
| Güncelleme | ✓ (uygulama içi) | ✓ (TestFlight) | |
| Çökme/donma kaydı → Stüdyo | ✓ | ○ | |
