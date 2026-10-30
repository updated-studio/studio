# UPDATED Kamera: Android ↔ iPhone/iPad eşitliği

Fatih (28 Ekim 2026): "Android'deki uygulamanın birebir aynısı Apple'da olsun; yeni özellikler iki tarafa birlikte eklensin." Bu liste iki tarafın durumunu tutar.
Yeni özellik eklenince iki sütun da doldurulur. ✓ var · ✱ yapılıyor · ○ yok · — platform izin vermiyor

İş bölümü (iki Claude aynı dalda): **Kamera ekranı** = proje sohbetindeki Claude, **Monitör ekranı** = sunucudaki (Remote Control) Claude. Ortak dosyalarda (AnaEkran.swift, Kamera.swift, project.yml) küçük ve sık gönderim, önce rebase.

İki uygulamaya hazırlık (Android, 0.17.1): Gradle modülleri `:ortak` (paylaşılan kod ve bütün kaynaklar; PRO + Monitör ekranı MainActivity burada, çünkü PRO Kamera'nın, Monitör Masa'nın), `:kamera` (KameraActivity, ayarlar, stiller, kayıt sonrası işleme, EkranYayini: yalnız Kamera kullanıyor), `:masa` (Masa ekranı). `:app` bugünkü tek uygulama (ikisi birden, paket kimliği aynı); `:masa-uygulama` = **UpCam Studio** (tr.com.upcam.studio; Masa + Monitör, kendi güncelleme kanalı `derle.sh --masa`; simge seçimi bekliyor). Modüller arası ekran açma adla (`Ekranlar.kt`).

## Kamera ekranı (Android: KameraActivity)

| Özellik | Android | iOS | Not |
|---|---|---|---|
| Tam ekran görüntü, saydam katmanlar, simgeli düğmeler (0.11 düzeni): üst şerit, araç şeridi, yakınlaştırma, son çekim | ✓ | ✓ | iOS'ta ekran dönünce düzen de döner |
| Mod şeridi: TIMELAPSE · VİDEO · FOTO · PRO MODLAR · PORTRE · MONİTÖR | ✓ | ✓ | |
| Fotoğraf: çözünürlük seçimi, RAW (DNG), zamanlayıcı, deklanşör sesi | ✓ | ✓ | ProRAW/Bayer RAW cihaza göre; deklanşör sesi iOS 18+ |
| Video: 720p/1080p/4K, 30/60 fps | ✓ | ✓ | |
| Mercekler 0,5× / 1× / 2× / tele (yalnız gerçek mercek durakları; iki parmakla yakınlaştırma 28 Ekim'de kalktı), flaş ve fener | ✓ | ✓ | |
| PRO modlarda mercek (Özelleştir'de LENS; ekranda seçilen mercek moda kaydedilir) | ✓ | ✓ | 28 Ekim |
| FOTO'da elle enstantane 1/1000–30 sn + BULB; telefonun tek karede veremediği süre kareler birleştirilerek (İpeksi / Aydınlat / Işık izi) | ✓ | ✓ | 28 Ekim. iPhone tek kareyi ~1 sn'den uzun açamıyor |
| Apple Kamera (iOS 26) görünümü: siyah bantlar, biçim bilgisi, ⋯ kontroller, kapsül mod seçici, cam panolar | ✱ | ✓ | Fatih 28 Ekim 15:37: Android de aynı görünsün. **Sunucudaki Claude yapıyor** (KameraActivity.kt; Android SDK sunucuda), çakışmasın |
| Yan tutuşta deklanşör sağ kenarda ortada | ✓ | ✓ | Android'de düzen dik sabit, simgeler döner |
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
| **Genel Ayarlar** (Fatih 29 Ekim): çözünürlük en üstte, kodek (HEVC / H.264 / ProRes 422 HQ·422·LT·Proxy), SDR / HDR / Log, sabitleme, enstantane süre ↔ açı, video enstantanesi, ses girişi seçimi, harici mikrofonda 24 bit PCM (16 bit / AAC da seçilebilir), beyaz dengede Kelvin kaydırıcısı + yeşil–macenta | ✓ | ✓ | Android GenelAyarlar.kt + BeyazDenge.kt (Kelvin sensör kalibrasyonundan); ProRes ve Log Android'de — (soluk gösterilir), HDR = HLG10 10 bit (Android 13+, destekleyen telefon), ses yalnız AAC (MediaRecorder; 24 bit PCM —), sabitleme Kapalı/Standart/Sinematik(önizleme sabitlemesi), değişken diyafram varsa Pozlama'da. iOS KayitAyarlari.swift + KameraAyarlar.swift. 2. aşama: LUT/Log önizleme, false color, zebra, histogram, stiller pedi |
| **Görüntü araçları kamera ekranında:** false color, zebra (%95 / %70), odak vurgusu, histogram, siyah-beyaz, LUT (.cube ekle), Apple Log çekerken ekranda Rec.709 (yerleşik LUT); yalnız ekranda, kayıt temiz | ✓ | ✓ | Android: Kontroller → Göstergeler ve Ayarlar → Göstergeler (MonitorGorunum çizicisi, LUT kitaplığı Monitör ile ortak; Log → Android'de yok). 29 Ekim; iOS Gostergeler.swift (Monitör çizicisi). Kontroller → Göstergeler ve Genel Ayarlar → Göstergeler |
| **Stiller** (Renk grubu): hazır stiller (Standart, Sinematik, Sıcak, Soğuk, Canlı, S-B), pad (soğuk ↔ sıcak, ton), yoğunluk, doygunluk; "Ekranda" ya da "Kayda göm" (fotoğraf yeniden yazılır, video kayıttan sonra HEVC'ye işlenir). Stil + LUT tek 3D LUT | ✓ | ✓ | 29 Ekim; iOS Stiller.swift |
| **Ekrandaki menü grupları:** "⋯" son grubu açar; alttaki şeritte Kayıt (biçim, kodek, renk, sabitleme, flaş…), Pozlama (+ odak), Renk (Stiller / Beyaz denge), Ses (giriş, biçim), Göstergeler (+ kılavuz, yardımcı, terazi) | ✓ | ✓ | 29 Ekim; AnaEkran `Grup`, HizliMenuler.swift |
| **Otomatik kompozisyon:** açıkken (varsayılan) kılavuz sahneye göre kendisi gelir (öneri 1,5 sn sabit kalınca), kılavuza dokununca elle seçime geçer | ✓ | ✓ | Fatih 29 Ekim 06:56; Kamera.otoKompozisyon |
| **Sabitlenen kısayollar (iOS 27 Kamera gibi):** seçilen denetimler (en fazla 6; varsayılan ISO, enstantane, beyaz denge, zebra) vizörün üstünde durur; "⋯" DENETİMLER ızgarası (3 sütun daire); üst şeride uzun bas ya da "Düzenle" → ⊖ ile çıkar, 4 sütunlu ızgaradan ekle, "Temel Ayarlara Sıfırla"; Genel Ayarlar → Sabitlenenler | ✓ | ✓ | Fatih 29 Ekim; Favoriler.swift, anahtar "k.favoriler" iki tarafta aynı |
| **Tam ekran önizleme:** Kamera ekranında görüntü tüm ekranı doldurur (kenarlar kırpılır, kayıt tam kare), menüler ve düğmeler görüntünün üstünde, hafif karartmayla (Monitör gibi) | ✓ | ✓ | Fatih 29 Ekim 12:39; iOS Onizleme aspect fill, AnaEkran.doldurAlan |
| **Ekranı Masa'ya gönder:** telefon ekranı Wi-Fi kamera dilinde (AgYayin) masaya kaynak olur, adı "Ekran · <cihaz>"; kendi çıkışı olmayan kameralar için (Insta360 Luna Ultra: kendi uygulaması açık durur). Genel Ayarlar → Masa | ✓ | … | Fatih 29 Ekim 13:57; iOS ReplayKit uzantısı Ekran/YayinIsleyici.swift, Android MediaProjection |
| **PRO'dan normale dön:** PRO MODLAR'da seçili moda tekrar dokununca FOTO'ya döner (altında tek satır not) | ✓ | ✓ | Fatih 29 Ekim 16:28 |
| **AI Kadraj:** konu algılama + yön tarifi + kompozisyon ve sahne önerisi tek anahtarda ("k.aiKadraj", varsayılan kapalı; kapalıyken ekranda hiçbiri yok). Otomatik kılavuz geçişi kalktı: aynı öneri 6 sn sürünce tek çip "Kadraj: **Üçte bir**" / "Sahne: **Gece**", dokununca uygulanır; düşünürken küçük "AI Kadraj inceliyor". Konu güçlü noktadaysa kılavuz çizgileri yeşil. Favori adı "AI Kadraj" | ✓ | ✓ | Fatih 29 Ekim 16:28; Kamera.aiDusun, aiBekleme = 6 |
| **Film reçeteleri:** Stiller'de "TEMEL" ve "FİLM REÇETELERİ" sıraları. Kimlik / ad: lcKlasik "LC Klasik", lcCanli "LC Canlı", lcSB "LC S-B", klasikKrom "Klasik Krom", klasikNegatif "Klasik Negatif", canliSlayt "Canlı Slayt", sinemaYumusak "Sinema Yumuşak", gumusSB "Gümüş S-B", filmGorunumu "Film Görünümü", retro "Retro", vintage "Vintage". Formüller Stiller.swift `Stil.uygula` (sol, ayir, sEgri, sb, egri, doy, sicaklik) ile birebir aynı olmalı. Seçili kutuya tekrar dokununca Standart; basılı tutunca açıklama + "Seç ve üst şeride sabitle" | ✓ | ✓ | Fatih 29 Ekim 16:28; marka adı yok |
| **Stüdyo dili (tasarım, Fatih onayı 29 Ekim 17:45):** tek yazı ailesi (iOS SF, Android Inter), tablo rakamları; okuma değeri 15 pt yarı kalın + etiket 9,5 pt büyük harf; metin beyaz / %62 / %28; yüzeyler siyah %34 + hafif bulanıklık + 0,5 px beyaz %18 hat; sarı yalnız elle değiştirilmiş değerde, yeşil onay, kırmızı kayıt. Ana ekran: tek okuma şeridi, sabitlenenler altında 24 pt kapsüller; AI Kadraj açıkken kadraj çentikleri (iyi kadrajda yeşil); zaman kodu çipi (kırmızı nokta + ss:dd:ss:kare); mod şeridi arkasız, seçili beyaz %12 kapsül; PRO MODLAR → "PRO", yatayda TL / MON.; deklanşör 74/60; paneller köşe 30, başlık 13 pt; seçenek kapsülleri sarı yazı + %12 dolgu (sarı dolgu yok). Tokenlar `Tema.swift` (`yuzey`, `yuvarlakYuzey`, `bolumBasligi`) | ✓ | … | tasarim-studyo.png |
| **Hızlı menüler (basılı tut):** üst şeritteki sabitlenen kapsüle ve Denetimler dairesine basılı tutunca sistem menüsü: ayarın 4-6 sık değeri (BD: Oto/3200/4000/5600/6500/7500; ISO: Oto + baz,200,400,800,1600,3200'ye en yakınlar; S: Oto + videoda 1/1000…1/25, fotoda 1/1000…1/4; EV −1…+1; odak Oto/Sonsuz; kodek, renk, sabitleme, stil (Temel + "Film reçeteleri" alt menüsü), LUT, flaş, zamanlayıcı, kılavuz; anahtarlar Aç/Kapat), "Ayrıntılı…" (tam panel), "Üst şeride sabitle / Sabitlemeyi kaldır". `HizliMenu` (Favoriler.swift) | ✓ | … | Fatih 29 Ekim 16:28 madde 6 |
| **Konu seçimi (AI Kadraj):** AI Kadraj açıkken ekrana dokununca o noktadaki konu (yüz, hayvan, insan, belirgin nesne; hedefi içeren en küçük kutu, yoksa 0,2 yakınındaki) seçilir, sarı köşe çentikli kutu ve "Yüz · AF" etiketi; odak ve pozlama noktası konuyu izler (0,3 sn, 0,02 hareket). ~2,5 sn bulunamazsa "Konu kayboldu"; 1,5 sn içinde hiç bulunamazsa "Orada konu bulunamadı". Uzun basış, mod değişimi ve AI Kadraj kapanınca seçim düşer. Portre yüz odağı seçili konuyla çakışmaz | ✓ | ✓ (adaylar: ML Kit yüzler + en çok 5 nesne; ayrı hayvan/insan sınıfı yok) | Fatih 29 Ekim 17:05 |
| **Stil her çekime işlenir:** "Ekranda / Kayda göm" seçimi kalktı; stil ve LUT fotoğrafa ve videoya her zaman işlenir. İstisna: VİDEO + Apple Log kaydı özgün kalır (stil yalnız ekranda). RAW dosyası da özgün | ✓ | ✓ | Fatih 29 Ekim: "Monitör değil burası" |
| **Ton kaydırıcısı (beyaz denge):** Beyaz denge panelinde yeşil ↔ macenta renkli kaydırıcı, iki yanda − / + (±5), ortada sıfır çentiği, çift dokunuş sıfırlar, sağda "Y12 / M12 / 0" | ✓ | ✓ | Fatih 29 Ekim 16:53 |
| **Kayıt başında oturuma dokunmama:** kodek, sabitleme, ses biçimi VİDEO moduna geçince ve ayar değişince uygulanır; kayıt başında yalnız değişen ayar yazılır | ✓ | — (Android: MediaRecorder kayıt yüzeyi için oturum kayıt başında yeniden kurulmak zorunda; stil kayıttan sonra tüm dosyaya işlendiği için video başında düz renk yok. Kalıcı giriş yüzeyine geçiş cihazda denenince) | video başı düz renk / donma şikâyeti |
| Açılış ekranı (Kamera / Monitör / Masa) ve "Açılışta sor" | ✓ | ✓ | `GirisEkran`, UserDefaults "giris" (Android ile aynı anahtar) |

## Monitör ekranı (Android: MainActivity + MonitorGorunum)

| Özellik | Android | iOS | Not |
|---|---|---|---|
| Kaynak: USB (Sony USB yayını, HDMI→USB çevirici) | ✓ | ✓ | iOS'ta yalnız iPad (USB-C, iPadOS 17); iPhone'da Apple izin vermiyor |
| Kaynak: telefon kamerası | ✓ | ✓ | |
| Kaynak: Wi-Fi kamera (UPDATED Kamera'nın "Wi-Fi kamera ol"u) | ✓ | ✓ | Android'e 28 Ekim'de eklendi (0.12.0) |
| Kaynak: ağ yayını | ✓ (RTSP/RTMP/HLS) | ✓ (HLS / http) | iOS'ta RTSP/RTMP için hazır oynatıcı yok, açıklama gösterilir |
| LUT (.cube) kitaplığı, LUT karşılaştırma | ✓ | ✓ | |
| False color, zebra (seviye), odak yardımı (peaking, renk, hassasiyet) | ✓ | ✓ | Metal (Monitor.metal), Android GLSL'in karşılığı |
| Anamorfik açma, büyütme, ayna / ters çevir / döndür, siyah-beyaz, temiz görüntü | ✓ | ✓ | |
| Kadraj kılavuzu, ızgara, güvenli alan, merkez işareti | ✓ | ✓ | |
| Kompozisyon kılavuzları, akıllı yardımcı, kompozisyon önerisi | ✓ | ✓ | Kamera ekranıyla aynı kod (Kompozisyon.swift, Asistan.swift) |
| Terazi (ufuk) | ✓ | ✓ | |
| Ölçüm: dalga formu, RGB parade, vektörskop, histogram, köşe histogramı | ✓ | ✓ | |
| Kipler: tek ekran, görüntü + ölçüm, LUT karşılaştırma, iki kaynak | ✓ | ✓ | İki cihaz kamerası AVCaptureMultiCamSession ister (destekleyen cihazlarda) |
| El ile kamera ayarları (fps, enstantane, ISO, beyaz denge, EV, odak, çözünürlük, sabitleme) | ✓ | ✓ | |
| Kayıt: kodek (H.264/H.265), bit hızı, ses kaydı, temiz kayıt, ekran görüntüsü | ✓ | ✓ | |
| Ses göstergesi (iki kanal) | ✓ | ✓ | |
| Ekran parlaklığı en yüksek | ✓ | ✓ | |

Gerçek cihazda henüz denenmedi (iOS): dönüş yönleri, USB kamera ile iki kaynak, HLS kaynağı.

## Masa (çok kamera)

| Özellik | Android | iOS | Not |
|---|---|---|---|
| Masa: kaynakları bul, canlı geçiş, tally, 1080p kayıt | ✓ | ✓ | |
| USB kameraları masaya ekle | ✓ | ✓ | iOS'ta yalnız iPad |
| **Tablet masası (yönetmen masası):** ÖNİZLEME + PROGRAM monitörleri, numaralı kaynaklar, KES, hızlı geçiş, klavye (1–4, boşluk, R) | ✓ | ✓ | 29 Ekim; iOS MasaIpad.swift; Android MasaActivity tabletDuzen (en kısa kenar ≥ 600 dp), telefon düzeni aynı |
| **Tasarım dili (stüdyo):** tek yazı ailesi Inter (tablo rakamları); okuma 15 sp yarı kalın + 9,5 sp büyük harf etiket; metin beyaz / %62 / %28; yüzeyler siyah %34 + 0,5 px beyaz %18 hat (paneller köşe 30); sarı yalnız elle değişen değerde, yeşil onay, kırmızı kayıt. Üstte tek okuma şeridi, altında 24 dp sabitlenen kapsülleri; AI Kadraj açıkken köşe çentikleri; kayıtta zaman kodu çipi; mercekler 40/34 dp; mod şeridi arkasız (PRO, yanda TL / MON.); deklanşör 74 dp; panellerde 13 sp başlık, 28 dp ✕, 10 sp bölüm başlıkları, seçili kapsül sarı yazı + beyaz %12 + sarı yarım hat | … | ✓ (paneller görüntü bulanıklaştırılamadığı için siyah %84) | Fatih 29 Ekim: "Tasarım daha iyi" |

## Uygulama

| Özellik | Android | iOS | Not |
|---|---|---|---|
| Güncelleme | ✓ (uygulama içi) | ✓ (TestFlight) | |
| Çökme/donma kaydı → Stüdyo | ✓ | ○ | |
| **Insta360 Luna Ultra canlı görüntü (UCD2 dili):** Genel Ayarlar → Masa → "Insta360 kamerayı dene": kameranın Wi-Fi'ına bağlıyken selam (3 sn nabız) → 39 yetki (kamera ekranda onay sorabilir, 30 sn) → 118 → 1 canlı görüntü; 1280×720 H.265 çözülüp gösterilir. Kendi uygulama kimliği üretilir, kameraya ayar yazılmaz. Dil: uygulamalar/monitor/notlar/insta360-luna.md | ✓ (0.10.2, cihazda denenmedi) | ✓ (0.15.1, cihazda denenmedi): Masa → + Kaynak → "Insta360 Luna": telefon kameranın Wi-Fi'ına bağlıyken aynı sıra, H.265 çözülüp yuvada gösterilir; koparsa yeniden bağlanır, kapanırken 2. Fatih 18:53 "Evet, Android'e de ekle" | 29 Ekim akşam, LunaLive APK incelemesi |
| **Masa çoklu kayıt + SSD:** KAYIT her kaynağı kendi dosyasına (Wi-Fi akışı yeniden kodlanmadan olduğu gibi, USB kaynağı HEVC) ve programı (canlıdaki görüntü kesimli; en büyük kaynağın boyutunda, 4K'ya kadar, HEVC 20/60 Mb/sn, kare hızı kaynağın hızı; ses programda) aynı anda yazar; tüm dosyaların 0 anı aynı. SSD/klasör üst şeritten bir kez seçilir (boş alan gösterilir), "UPDATED Masa/<yyyy-MM-dd HH-mm-ss>/Program.mp4, <no> - <ad>.mp4"; klasör yoksa ya da SSD takılı değilse cihaza yazılıp Fotoğraflar'a gider. Kaynak hücresinde kayıt rozeti, DURDUR altında "N KAMERA + PROGRAM". Wi-Fi kamera yayını 1080p60 (yoksa 30) H.264 20 Mb/sn, anahtar kare ≤1 sn; masa→kamera {"anahtar":true} | ✓ (0.11.0, cihazda denenmedi) | ✓ (0.16.0, cihazda denenmedi): klasör Android klasör seçicisiyle (SSD) bir kez seçilir, izin kalıcı; Luna kaynağı da ayrı dosya (H.265, yeniden kodlanmadan); kayıt sırasında SSD'ye yazılamazsa kayıt telefonda yeni klasörde sürer | Fatih 29 Ekim 23:30; iOS MasaKayit.swift, Masa.swift, AgYayin.swift |
| **Stil/LUT çekerken işlenir (video):** SDR'de kayıt kare çıkışından gider (CanliKaydedici: GPU LUT → HEVC/H.264/ProRes, ses AVCaptureAudioDataOutput, sabitleme kare çıkışı bağlantısında); kayıttan sonra bekleme yok. HDR'de stil kayıttan sonra işlenir (arka planda, yüzdeli, yarıda kalan açılışta sürer); Apple Log özgün kalır | ✓ (0.12.0, cihazda denenmedi) | ✓ (0.17.0, cihazda denenmedi): SDR'de kamera → GPU (stil/LUT) → kodlayıcı (Kaydedici, ses USB/mikrofon); HDR ya da Wi-Fi kamera açıkken kayıttan sonra işlenir, ön plan hizmetinde yüzdeli (VideoIsleme), uygulama kapanırsa açılışta özgün renkte kurtarılır | Fatih 29 Ekim 23:59 "LUT'u çekerken uygula" |
| **İki uygulama (C):** Updated Camera (tr.com.updated.monitor) ve UpCam Studio (iOS tr.com.UpCam.Studio). iOS: ikinci XcodeGen hedefi `UpdatedMasa` aynı kaynakları derler (UpdatedKameraApp ve Kamera simgesi hariç) + `MasaUygulama/` (giriş: Masa / Monitör kartları, son seçim hatırlanır); `Uygulama.masa` ile geri düğmeleri "Menü". İş akışı: "iOS Kamera x:" / "iOS Masa x:" / "iOS Kamera+Masa x:" iletisi hangi uygulamanın yükleneceğini seçer. Kamera uygulamasından Masa/Monitör sekmeleri Masa cihazda denenip tamam olunca kalkar | ✓ (0.13.0, ikisi de TestFlight'a) | ✓ Gradle modülleri :ortak / :kamera / :masa, :masa-uygulama iskeleti (0.17.1) | Fatih 30 Ekim 01:26 "uygulamaları ayıracağım"; simgeler: UP işareti + vizör köşeleri (Kamera), + çoklu görünüm şeridi (Masa) |
| **ProRes 4:2:2 ve harici SSD (Kamera):** ProRes seçilince kamera 10 bit 4:2:2 ('x422') biçime geçer (Apple kuralı; önce 4:2:0'da kalıyor, ProRes soluk görünüyordu); kodek listesi o çözünürlük/kare/renkte x422 biçimi olup olmadığından. USB-C SSD takılıysa video doğrudan oraya (AVExternalStorageDevice, iOS 17, iPhone 15 Pro+), Ayarlar → Kayıt → Harici SSD'den kapatılabilir; dosya SSD'de kalır. ProRes 4K 60 yalnız SSD'ye (SSD yoksa HEVC + uyarı). HDR'de stil/LUT ekranda uygulanmaz (HLG kare BGRA'ya düşüp 709 LUT'tan geçince renkler bozuluyordu), iPhone'un önizlemesi kullanılır | ✓ (0.12.2, cihazda denenmedi) | — ProRes kodlayıcısı Android'de yok; Kamera'dan SSD'ye doğrudan kayıt ○ (Masa'da ✓ 0.16.0) | Fatih 30 Ekim 00:42/00:45 |
| **Wi-Fi kamera yayınında renk:** yayın açıkken HDR SDR'ye düşer (HLG ton eşlemesiz 8 bit'e çiziliyor, Masa'da soluk/kayık görünüyordu), kısa uyarı; kayıt ve yayın kodlayıcılarına BT.709 + sınırlı aralık + SDR renk bilgisi yazılır | ✓ (0.17.1) | ○ | Fatih 30 Ekim 00:42 "renkler birbirine giriyor" |
| **Kayıt sonrası düzenleme (B):** son çekime dokununca Düzenle: kırpma (başlangıç/bitiş), renk (stil/LUT + yoğunluk), gürültü giderme (Kapalı/Hafif/Orta/Güçlü; uzamsal + zamansal, GPU), dışa aktarma aynı kodek/boyutta yeni dosya (özgün kalır), arka planda yüzdeyle | ✱ motor hazır (Duzenleme.kt: Media3 kırpma + LUT yoğunluğu + GurultuGiderme GPU efekti, VideoIsleme'de iş); ekran görsel onayı bekliyor | ○ | Fatih 29 Ekim 23:51, onay 23:59 |
| **Masa program düzeni (çoklu görünüm):** Oto / Tek / 2'li / 3'lü / 2×2; dizili düzende program 3840×2160 tuval, her kaynak 1920×1080 kutusuna tam boyutuyla (2'li yan yana ortada, 3'lü üstte iki altta ortada bir, 2×2 ızgara, yuva sırasıyla), 30 kare/sn HEVC; ekrandaki program monitörü aynı düzeni 1280×720 gösterir; Tek'te eski davranış. Kayıt sürerken değiştirilebilir; kaynak dosyaları aynen sürer | ✓ (0.12.1, cihazda denenmedi) | ✓ (0.17.0, cihazda denenmedi): üst şeritte düzen seçimi; program 4K tuval 60 kare/sn (cihaz kaldırmazsa 30); Tek'te başlayan kayıtta sonradan çoklu düzene geçilirse tuval o kaydın boyutunda kalır (uyarı) | Fatih 29 Ekim 23:51/23:59 (A) |
