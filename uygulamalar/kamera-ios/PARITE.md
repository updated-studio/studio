# UPDATED Kamera: Android ↔ iPhone/iPad eşitliği

Fatih (28 Ekim 2026): "Android'deki uygulamanın birebir aynısı Apple'da olsun; yeni özellikler iki tarafa birlikte eklensin." Bu liste iki tarafın durumunu tutar.
Yeni özellik eklenince iki sütun da doldurulur. ✓ var · ✱ yapılıyor · ○ yok · — platform izin vermiyor

İş bölümü (iki Claude aynı dalda): **Kamera ekranı** = proje sohbetindeki Claude, **Monitör ekranı** = sunucudaki (Remote Control) Claude. Ortak dosyalarda (AnaEkran.swift, Kamera.swift, project.yml) küçük ve sık gönderim, önce rebase.

## Kamera ekranı (Android: KameraActivity)

| Özellik | Android | iOS | Not |
|---|---|---|---|
| Tam ekran görüntü, saydam katmanlar, simgeli düğmeler (0.11 düzeni): üst şerit, araç şeridi, yakınlaştırma, son çekim | ✓ | ✓ | iOS'ta ekran dönünce düzen de döner |
| Mod şeridi: TIMELAPSE · VİDEO · FOTO · PRO MODLAR · PORTRE · MONİTÖR | ✓ | ✓ | |
| Fotoğraf: çözünürlük seçimi, RAW (DNG), zamanlayıcı, deklanşör sesi | ✓ | ✓ | ProRAW/Bayer RAW cihaza göre; deklanşör sesi iOS 18+ |
| Video: 720p/1080p/4K, 30/60 fps | ✓ | ✓ | |
| Mercekler 0,5× / 1× / 2× / tele, iki parmakla yakınlaştırma, flaş ve fener | ✓ | ✓ | |
| Araç şeridi: pozlama (EV + elle ISO), beyaz denge, odak cetvelleri | ✓ | ✓ | |
| Timelapse: aralık, süre sınırı, pozlamayı sabitle | ✓ | ✓ | |
| PRO MODLAR (9 mod, Özelleştir, uyarı, "?" açıklamaları, baz ISO) | ✓ | ✓ | |
| Portre (pozlama/odak yüze göre) | ✓ | ✓ | |
| Kompozisyon kılavuzları (üçte bir, phi, spiral, köşegen, üçgen, simetri, öncü çizgi) | ✓ | ✓ | Kompozisyon.swift (`KompozisyonKatman`), Monitör'e de bağlanabilir |
| Otomatik sahne önerisi / akıllı yardımcı (ibre, yön tarifi, kılavuz önerisi) | ✓ | ✓ | Android ML Kit, iOS Vision (Asistan.swift, Analiz.swift) |
| Terazi (ufuk) | ✓ | ✓ | |
| Elle ISO + baz ISO işareti | ✓ | ✓ | |
| Wi-Fi kamera ol (Masa'ya) | ✓ | ✓ | |
| Ayarlar paneli (Fotoğraf, Video, Timelapse, Masa, Yardımcılar, Uygulama) | ✓ | ✓ | KameraAyarlar.swift |
| Açılış ekranı (Kamera / Monitör / Masa) ve "Açılışta sor" | ✓ | ✓ | `GirisEkran`, UserDefaults "giris" (Android ile aynı anahtar) |

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
