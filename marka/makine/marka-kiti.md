# UPDATED Marka Kiti — Makine Sürümü
Sürüm: 1.2 · Tarih: 2026-10-21 · Dil: tr
Marka: UPDATED (updated.com.tr) — teknoloji haber ve içerik markası. Kanallar: web sitesi, Instagram, YouTube, bülten, stüdyo/yönetim paneli.

Bu dosya marka kitinin yapay zekâ ve otomasyon için tek kaynağıdır. Görsel sayfalar ile çelişirse bu dosya ve `tokens.json` geçerlidir. Değerler `tokens.json` içinde makine okunur halde de vardır.

## 0. Nasıl kullanılır
- Örnek değişir, kural değişmez. Şablon görselleri örnektir; ölçü, güvenli alan, başlık uzunluğu, logo yeri ve renk eşleşmeleri sabittir.
- Platform sınırları her zaman geçerlidir. Platform arayüzünün bindiği alana başlık, logo ya da önemli bilgi konmaz.
- Kurallar ölçü ve örnekle yazılır; yorum gerektirmez.
- Kitte olmayan durumda önce ilkelere bakılır; çözüm sonra kite eklenir.
- Tüm Türkçe içeriklerde kapsayıcıda `lang="tr"` zorunlu (büyük harf İ/I sorunu).

## 1. İlkeler (öncelik sırasıyla; çatışırsa üstteki kazanır)
1. Doğru — Kaynağı belli olmayan, doğrulanmamış bilgi yayınlanmaz. Soru: "Bunu kim, nerede söyledi?"
2. Anlaşılır — Hiç bilmeyen biri ilk bakışta anlar; teknik terim açıklanır. Soru: "Teknolojiyle ilgisi olmayan biri anlar mı?"
3. Sade — Her görselde tek mesaj. Soru: "Bunu çıkarsam ne kaybederim?"
4. Basit — Herkesin uygulayabileceği kural; ölçü ve örnekle. Soru: "Yeni başlayan tek başına yapabilir mi?"
5. Tutarlı — Her kanalda aynı ses, renk, düzen. Soru: "Logo olmasa da UPDATED olduğu anlaşılır mı?"

## 2. Logo
- Üç işaret: yatay logo, dikey logo (UPDA/TED), kısa işaret UP. Yatay ve dikey eşittir; alanın biçimi seçer (geniş/alçak → yatay, kare/dikey → dikey).
- Metin içinde marka adı logo değil, yazı olarak: UPDATED.
- Renkler: siyah (açık zemin), beyaz (koyu ve mavi zemin), siyah (turuncu zemin). Turuncu zeminde beyaz logo kullanılmaz.
- Boşluk: her kenarda en az x (x = U harfinin genişliği).
- Minimum genişlik: yatay 96 px / 25 mm · dikey 40 px / 12 mm · UP 16 px / 6 mm. Küçükte daima solid.
- Outline sürüm logo değildir; yalnızca desen/doku.
- Favicon ve app ikonu yalnızca UP.
- Fotoğraf üstünde: açık bölge → siyah logo, koyu bölge → beyaz logo, karışık → düz renk kare kutu (siyah/mavi/turuncu), köşeye sıfır yaslı. Yüz/ürün/yazı üstüne konmaz; yarı saydam kutu ve gölge yok.
- Yasak: germe, döndürme, düşük kontrast, gölge/efekt, logoyu fontla yazma, eğimi değiştirme, palet dışı renk, iki logoyu birlikte kullanma.
- Ortak marka: yatay logo, UPDATED solda/üstte, partner aynı görsel yükseklikte, arada 2x boşluk ve 2 px dikey ayırıcı.
- Dosyalar: `logo/ana-palet/{svg,png,sosyal,app-ikon,favicon,banner}/`.

## 3. Renk
| Ad | HEX | RGB | CMYK | Pantone | Kullanım |
|---|---|---|---|---|---|
| Siyah | #000000 | 0 0 0 | 60 40 40 100 (zengin) / K100 (küçük yazı) | Black 6 C | Logo, metin, haber zemini |
| Beyaz | #FFFFFF | 255 255 255 | 0 0 0 0 | — | Zemin, negatif logo |
| Mavi (ana) | #2563EB | 37 99 235 | 84 58 0 0 | 2728 C | Marka, link, ana buton, inceleme/rehber |
| Turuncu (vurgu) | #FF6B1A | 255 107 26 | 0 58 90 0 | 1505 C | Son dakika, etiket, uyarı vurgusu |
| Açık Gri | #F2F2F2 | 242 242 242 | 0 0 0 5 | Cool Gray 1 C | Yüzey, ayırıcı |
- Turuncu zeminde yazı daima siyah. Mavi zeminde yazı daima beyaz.
- Arayüz nötrleri (yalnızca metin/çizgi): #171717 metin, #55585c ikincil metin, #6b6f74 yardımcı, #e2e2e2 çizgi.
- Palet dışı renk eklenmez. Saydamlık ve gradyan yok.
- Kullanım oranı: beyaz + açık gri %60 · siyah %25 · mavi %12 · turuncu %3. Turuncu bir yüzeyde tek öğede.
- Kontrast (WCAG): siyah/beyaz 21 · siyah/gri 18,8 · siyah/turuncu 7,4 · beyaz/mavi 5,2 · mavi/gri 4,6 → her yazı. Mavi/siyah 4,1 → yalnızca ≥24 px başlık. Beyaz/turuncu 2,9 · turuncu/mavi 1,8 · turuncu/beyaz 2,9 → yasak.
- Mavi zemine turuncu etiket konmaz; beyaz etiket kullanılır.

## 4. Tipografi — altı rol
| Rol | Font | Ağırlık | Kullanım |
|---|---|---|---|
| Başlık | Big Shoulders Display | 900 (h3: 700) | H1–H3, kapak, thumbnail. Daima büyük harf. |
| Metin | IBM Plex Sans | 400 / 600 | Gövde, spot, caption |
| Veri | IBM Plex Mono | 400 / 600 | Rakam, fiyat, tarih, süre, etiket |
| Vurgu | Big Shoulders Display | 900 | Rozet, şerit; en fazla 3 kelime |
| Alıntı | Newsreader İtalik | 400 | Yalnızca alıntı |
| Arayüz | IBM Plex Sans | 500 / 600 | Menü, buton, form, tablo, panel |
- Ölçek (masaüstü/mobil, px): display 96/56 · h1 64/40 · h2 40/30 · h3 30/24 · lead 21/18 · body 18/17 (satır 1.65) · small 14 · quote 30/24 · data 30/24 · label 12 (büyük harf, 0.04em) · ui 14/15 · tag 28/22.
- Kanal minimum metin: web 14 px · Instagram 32 px · YouTube thumbnail 48 px, video içi (1920×1080) 28 px · panel 12 px.
- Satır yüksekliği (Başlık ve Vurgu): tüm başlıklarda 1,2 (çok satırlı her başlık, Instagram, story, thumbnail dahil). Yalnızca tek satırlık Vurgu rozeti 1,0 olabilir. Test: 1,05 ve 1,1 değerlerinde Ç/Ş çengeli alt satırdaki Ü/İ/Ğ işaretine değiyor. Neden: Türkçe aksanlar (Ü, İ, Ğ üstte; Ç, Ş altta) satırlar arasında üst üste biner.
- Yasak: Big Shoulders gövdede ya da 20 px altında; Newsreader alıntı dışında; başlığa harf aralığı/yapay italik/gölge; mono paragraf; bir yüzeyde 2'den fazla vurgu rozeti; set dışı font.
- Lisans: hepsi SIL OFL 1.1, ticari kullanıma açık.

## 5. Grid ve Boşluk
- Boşluk ölçeği (4 px taban): 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Ara değer yok.
- Ekran gridi: masaüstü ≥1200 px 12 kolon, kenar 80, gutter 24, maks. içerik 1280 · tablet 768–1199 px 8 kolon, kenar 32, gutter 16 · mobil <768 px 4 kolon, kenar 16, gutter 16.
- Haber metni en fazla 680 px (60–72 karakter).
- Köşe yarıçapı 0 (istisna: mağazanın yuvarladığı app ikonu). Gölge yok. Çizgi 1 px ayırıcı, 3 px siyah vurgu.
- Dokunma alanı en az 44 × 44 px. Görsel oranı: web ve YouTube 16:9 · Instagram gönderisi 4:5 · story ve reels 9:16 · profil 1:1. Başka oran yok.

## 6. Kanal güvenli alanları
- Instagram gönderi 1080×1350: kenar 64, üst/alt 96. Başlık ortadaki 1080×1080 karede kalır.
- Story/Reels 1080×1920: üst 250, alt 340, kenar 64 platforma ait. Reels kapak başlığı ortadaki 3:4 alanda.
- YouTube thumbnail 1280×720: kenar 48; sağ alt 200×60 süre etiketi alanı boş.
- YouTube banner 2560×1440: güvenli alan ortadaki 1546×423.
- Video 1920×1080: kenar 96/54; isim bandı alt güvenli çizgide; logo sağ üst.
- Panel 1440×900: kenar çubuk 240, üst bar 64, iç boşluk 24; tablo satırı 48 (yoğun 40).

## 7. Yazım dili
- Ses: Net, Hızlı, Meraklı, Dürüst. Önce bilgi sonra yorum; etken çatı; abartı yok; sızıntı ve resmî bilgi ayrılır.
- Başlık formülü: kim/ne + ne oldu + neden önemli. Tık tuzağı yasak ("şok", "flaş", "inanılmaz"). Ünlem yok; soru işareti tek.
- Uzunluklar: web başlık ≤70 kr · SEO ≤60 · spot 1 cümle ≤160 · YouTube başlık ≤60 · thumbnail ≤4 kelime · Instagram kapak ≤6 kelime · push ≤50 · caption ilk satır ≤125.
- İçerik etiketleri: Son dakika (turuncu, son 2 saat, 24 saatte kalkar) · İnceleme (mavi, en az 7 gün kullanım, puan /20) · Karşılaştırma (mavi, aynı koşul, yöntem yazılır) · Sızıntı (siyah, başlıkta "iddia/sızıntı") · Rehber (gri, numaralı adım) · Sponsorlu (gri, açıkça görünür).
- İmla: yapay zekâ (AI değil) · iPhone, iOS, Wi-Fi 7, USB-C · iPhone'un · 49.999 TL · 1.200 · 4,7 inç · %15 · 19 Ekim 2026 · 14.30 · 256 GB · 5.000 mAh · 120 Hz · terim ilk kullanımda açıklanır · hitap: web, panel ve e-posta "siz"; sosyal medya ve video "sen". Aynı içerikte karıştırılmaz.
- Kaynak: birincil kaynak gösterilir; başka yayından alınan bilgide yayın adı; firmadan gelen ürün/sponsorluk belirtilir; hata silinmez, tarih-saatli düzeltme notu eklenir.

## 8. Görsel dil
- Fotoğraf: ürün tek, düz zemin, kadrajın ≥%60'ı · haber gerçek olay ya da resmî basın görseli · insan doğal ışık, gözler üst üçte bir · ekran görüntüsü düzenlenmemiş, kişisel bilgi bulanık, cihaz çerçevesi yok.
- Kullanılmaz: stok klişe, haber gibi sunulan yapay zekâ görseli, filtre/gölge/dekupe, görsel üstüne ok/daire/emoji, 1920 px altı görsel, kaynaksız görsel.
- Veri grafiği: konu ürün mavi, diğerleri gri, turuncu tek uyarı değeri · sayılar Plex Mono, ondalık virgül · karşılaştırma yatay çubuk, zaman çizgi; pasta/3B yok · büyükten küçüğe, eksen sıfırdan · altta kaynak ve tarih.
- İkon: çizgi, 2 px, düz uç, dolgu yok, tek renk · 24 px tuval (panel 20, web 24) · tek set (öneri: Lucide) · arayüzde etiketle; yalnız ikonlu düğmede tooltip · sosyal medya görselinde ikon yok.
- Künye: "Görsel: Apple", "Fotoğraf: Ad Soyad / UPDATED". Yapay zekâ görseli yalnızca temsili ve "Temsili görsel · Yapay zekâ ile üretildi" künyesiyle.

## 9. Instagram
- Akış 4:5 (1080×1350). Kare yalnızca zorunlu ortaklıkta.
- Başlık: haber kartı ≤6 kelime, story ve reels kapak ≤5.
- Haber kartı: fotoğraf üstte (%56), başlık siyah blokta, turuncu etiket, UP sol üst.
- Carousel: kapak mavi zemin, sayaç ve "Kaydır →"; iç sayfa beyaz, mavi numara, sayfa başına tek fikir ≤25 kelime; en fazla 10 sayfa; son sayfa kaynak + updated.com.tr.
- Story: başlık siyah blokta güvenli alan içinde, etiket yalnızca içerik etiketlerinden (ör. Son dakika); etkileşim story mavi zemin, çıkartma alanı ayrılır.
- Logo: yalnızca UP; yatay logo Instagram'da kullanılmaz.
- Caption: ilk satır haberi tek cümlede verir; en fazla 3 hashtag sonda; emoji yok.
- Dosya: akış ve carousel PNG, story ve reels kapak JPG. Ad: yyyy-aa-gg-konu-ig-[haber|carousel-01].png · yyyy-aa-gg-konu-ig-[story|reels].jpg

## 10. YouTube
- Thumbnail 1280×720 (JPG ≤2 MB): haber siyah blok sol yarı + fotoğraf sağ · inceleme mavi zemin, ürün sağda, puan siyah kutuda · karşılaştırma iki ürün, turuncu VS karesi, soru alt bantta.
- Başlık ≤4 kelime; video başlığını tekrar etmez. Logo yalnızca UP, sol üst.
- Video içi: isim bandı sol alt (beyaz ad + mavi unvan), en fazla 5 sn · bölüm kartı mavi, 2 sn · bitiş ekranı son 20 sn, YouTube öğe alanlarına yazı konmaz. Yatay logo sağ üst, tam beyaz.
- Video içi en küçük yazı 28 px; isim bandında ad 44, unvan 28 px.
- Yayın öncesi thumbnail 320 px genişlikte kontrol edilir.
- Dosya adı: yyyy-aa-gg-konu-thumbnail.jpg

## 10b. Web sitesi
- Üst menü 64 px, beyaz, altta 3 px siyah çizgi; solda yatay logo, en fazla 7 kategori, sağda Ara + tek mavi "Bülten" butonu. Son dakika şeridi 40 px siyah, turuncu etiket; yalnızca aktif haber varken.
- Kartlar: manşet (ana sayfada tek; görsel 16:9 + kategori + başlık + spot + künye) · standart (3–4'lü grid; içerik etiketi görselin sol üstüne sıfır yaslı) · liste (numaralı, görselsiz).
- Haber sayfası sırası: kategori → H1 başlık ≤70 → spot ≤160 → künye satırı (yazar · tarih · saat · okuma süresi) → kapak 16:9 + görsel künyesi → metin 17–18 px, ≤680 px, ara başlık H2 → kaynak → düzeltme notu → ilgili haberler (≤4).
- İnceleme puan kutusu: haberin sonunda; mavi başlık şeridi + mono puan /20 (tam sayı); artı/eksi ≤3'er madde, ≤6 kelime; kullanım süresi ve cihazın kaynağı yazılır.
- Ana sayfa sırası: son dakika → manşet → son haberler → incelemeler → video → en çok okunan.
- Reklam: "Reklam" yazar, içerik gibi görünmez; haber metninde ≤2, ilk paragraftan önce yok; açılır ve sesli reklam yok.
- Performans: mobilde 2,5 sn; görsel WebP ≤200 KB. URL: updated.com.tr/kategori/baslik-kisa-hali, başlık değişse de sabit.

## 10c. Bülten
- Haftalık bülten: pazartesi 08.30, 600 px tek kolon, 4 dakikada okunur. Sıra: konu satırı (≤50 kr, en önemli iki haber) → önizleme (≤90 kr) → yatay logo + sayı no + tarih, 3 px siyah çizgi → haftanın haberi (tek 16:9 görsel ≤150 KB, başlık, 1–2 cümle, tek mavi buton) → 4–6 görselsiz haber (kategori + başlık + tek cümle) → siyah altbilgi (UP, neden aldığı, abonelikten çık).
- Son dakika e-postası: siyah üst bant + turuncu etiket, tek haber, görsel yok, haftada ≤2, yalnızca seçenlere.
- Telefon bildirimi: başlık ≤50, alt satır ≤90 kr; günde ≤3; 23.00–08.00 yalnızca çok büyük gelişme.
- Yazı yedekleri: başlık Impact, metin Arial; başlık görsel olarak gömülmez. Görseller kapalıyken okunur. Koyu mod için beyaz logo tanımlanır.
- Linkler utm_source=bulten, kısaltılmış link yok. KVKK açık rıza; tek tıkla çıkış.

## 11. Erişilebilirlik (hedef WCAG 2.2 AA)
- Kontrast metin 4,5:1, büyük başlık 3:1 · dokunma alanı 44×44 px · web gövde 18/17 px, en küçük 14 px, %200 büyütmede bozulmaz · satır ≤680 px · saniyede 3'ten fazla yanıp sönme yok · konuşmalı her videoda kontrol edilmiş altyazı.
- Alt metin: ne + önemli detay, ≤125 karakter. Grafikte sonuç yazılır. Süs görseli alt="".
- Web: lang="tr", tek H1 ve sıralı başlıklar, anlamlı link metni, klavyeyle tam kullanım, sesli otomatik video yok.
- Panel: durum = renk + ikon + metin; görünür form etiketi; hata mesajı alanın altında ve çözümü söyler; yalnız ikonlu düğmede etiket + tooltip.
- Instagram: her gönderide alt metin; görseldeki ana bilgi caption'da; reels altyazılı; hashtag'ler kelime başı büyük harf (#YapayZeka).
- YouTube: Türkçe altyazı; ekrandaki önemli yazı seslendirilir ya da açıklamada; bölüm zamanları; müzik konuşmayı bastırmaz.
- Odak halkası: 2 px, 3 px dışarıda; açık zeminde mavi, mavi öğede siyah. Kaldırılmaz.

## 12. Panel arayüzü
- Yerleşim: siyah kenar çubuk 240 px (seçili öğe #171717 zemin + 3 px mavi sol çizgi), üst bar 64 px (konum, arama ⌘K, kullanıcı), iç boşluk 24 px, sayfa başlığı 32 px Başlık rolü, ana eylem sağ üstte.
- Butonlar (köşe 0, 40 px; yoğun 32 px; etiket fiille, 1–3 kelime): ana = mavi zemin beyaz yazı, ekranda bir tane · ikincil = beyaz zemin 1 px siyah çerçeve · metin = mavi yazı · yıkıcı = siyah zemin, daima onay penceresi · pasif = gri zemin #9a9ea3 yazı.
- Form: etiket üstte ve görünür, alan 40 px, 1 px çerçeve; odakta 2 px mavi; hata 2 px turuncu çerçeve + turuncu "!" + "ne yanlış, nasıl düzelir" metni. Karakter sınırlı alanda mono sayaç (48 / 70).
- Durumlar (sabit beş): Taslak ○ gri/siyah · İncelemede ◐ turuncu/siyah · Planlandı ◷ beyaz/mavi çerçeve · Yayında ● mavi/beyaz · Arşiv ■ siyah/beyaz.
- Tablo: satır 48 (yoğun 40), başlık satırı gri zemin mono büyük harf 12 px, uzun metin tek satırda kesilir.
- Bildirim: başarı siyah zemin, mavi ✓, sol alt, 5 sn, "Geri al" · uyarı beyaz zemin 2 px turuncu çerçeve, kapatılana kadar kalır.
- Boş durum: ne olduğu + ne yapılacağı + tek eylem.
- Kırmızı/yeşil durum rengi eklenmez. Teknik hata kodu kullanıcıya gösterilmez. Geri alınamaz işlemde onay, geri alınabilirde "Geri al".

## 12b. Panel koyu mod
- Seçim: Ayarlar › Görünüm: Sistem (varsayılan) / Açık / Koyu; kullanıcı hesabına kaydedilir. Yeni renk yok; katmanlar gölgeyle değil ton farkıyla ayrılır.
- Değerler (açık → koyu): zemin #F2F2F2 → #121212 · yüzey (kart, tablo, form, pencere) #FFFFFF → #1C1C1C · yüzey 2 (tablo başlığı, pasif buton) #F2F2F2 → #262626 · kenar çubuk #000000 → #000000 + sağda 1 px #333333 · seçili menü #171717 → #1C1C1C + 3 px mavi sol çizgi · çizgi #E2E2E2 → #333333 · metin #171717 → #F2F2F2 · metin 2 #55585C → #B4B7BB · metin 3 #6B6F74 → #8E9297 · form alanı çerçevesi #9A9EA3 → #8E9297.
- Butonlar: ana = mavi zemin beyaz yazı (aynı) · ikincil = şeffaf zemin, 1 px #F2F2F2 çerçeve, #F2F2F2 yazı · metin/link = #F2F2F2, altı çizili · yıkıcı = beyaz zemin siyah yazı · pasif = #262626 zemin, #8E9297 yazı.
- Mavi koyu zeminde yazı rengi olarak kullanılmaz (kontrast ~4:1, yetmez); yalnızca zemin, çizgi, seçili durum ve odak halkası (2 px, 3:1 sağlar). Turuncu değişmez (koyu zeminde 7:1).
- Durum etiketleri: taslak #262626 zemin #F2F2F2 yazı · incelemede turuncu zemin siyah yazı (aynı) · planlandı şeffaf zemin, 1 px mavi çerçeve, #F2F2F2 yazı · yayında mavi zemin beyaz yazı (aynı) · arşiv #F2F2F2 zemin siyah yazı.
- Bildirim: başarı = beyaz zemin, siyah yazı, mavi ✓, sol alt, 5 sn · uyarı = #1C1C1C zemin, 2 px turuncu çerçeve, kapatılana kadar.
- Logo beyaz sürüm. Fotoğraf/video/kapak karartılmaz, filtre yok. Yayın önizlemesi her zaman yayının gerçek (açık) görünümüyle açılır.
- Tüm metin çiftleri ≥4,5:1. Bülten, e-posta istemcisinin koyu modunda aynı zemin (#121212) ve beyaz logoyla görünür; web sitesi koyu görünüm sunarsa aynı değerleri kullanır.

## 13. Hareket
- Süreler: hızlı 120 ms (üzerine gelme, basma) · standart 200 ms (menü, sekme, bildirim) · yavaş 320 ms (pencere, sayfa); üstü yok. Tek eğri: cubic-bezier(0.2, 0, 0, 1).
- Buton: yalnızca zemin rengi değişir. Menü 4 px kayma + solma. Bildirim sol alttan. Yükleniyor: gri iskelet; çark yalnızca 1 sn'yi geçen işlemde.
- Video: logo animasyonu yalnızca açılış/kapanış, harfler soldan sağa, 0,8 sn, eğim korunur · isim bandı soldan kayar 320 ms, unvan 120 ms gecikmeli · bölüm kartı kesme geçiş, 2 sn · sosyal medyada kesme ya da tek kayma.
- Yasak: zıplama/esnek eğri, döndürme, paralaks, otomatik dönen slayt, saniyede 3+ yanıp sönme, hazır efekt paketi, daktilo efekti.
- "Hareketi azalt" açıksa yalnızca 120 ms solma.

## 14. Yönetişim
- Roller: marka sahibi (kiti onaylar) · yayın yönetmeni (yayın, son dakika, düzeltme kararı) · editör (yazar; kendi haberini onaylamaz) · tasarımcı (şablon üretir, palet/font/logo dışına çıkmaz) · sosyal medya (şablonla paylaşır, şablonu değiştirmez) · yazılımcı (tokens.json kullanır, değeri elle yazmaz) · dış ajans (brif + kitle üretir, onaysız yayın yok).
- Onay akışı: taslak → ikinci editör incelemesi → yayın yönetmeni onayı → yayın (web önce, sonra sosyal ve bülten; her kanalda aynı başlık) → takip (düzeltme notu, silme yok). Son dakikada tek onay + 30 dk içinde ikinci kontrol.
- Kit sürümü: küçük değişiklik 1.x, renk/font/logo/ilke değişikliği 2.0. Küçüğü yayın yönetmeni, büyüğü marka sahibi onaylar. Her değişiklik sürüm geçmişine yazılır; bu dosya ve tokens.json aynı gün güncellenir. Kit 6 ayda bir gözden geçirilir.
- Dış ajans: kit + makine sürümü verilir; teslimde düzenlenebilir kaynak dosya (SVG, PSD ya da AI); şablon işleri stüdyo panelinin düzenleyicisine kalıp olarak aktarılır; kontrol listesi; tüm haklar UPDATED'da.
- Yapay zekâ: bu dosya + tokens.json verilir; her çıktı insan kontrolünden geçer; haber bilgisi yapay zekâdan alınmaz; üretilmiş görsel "Temsili görsel" künyeli; yayınlanmamış haber ve kişisel veri harici araca yüklenmez.

## 15. Dosyalar
- Logo: logo/ana-palet/{svg,png,sosyal,app-ikon,favicon,banner}/ · baskı: UPDATED Logo Baskı Dosyası · fontlar: Google Fonts (SIL OFL) · kurallar: makine/marka-kiti.md · değerler: makine/tokens.json · şablonlar: stüdyo panelinin düzenleyicisinde hazır kalıp (Figma/Canva kullanılmaz).
- Dosya adı kuralı: küçük harf, Türkçe karakter ve boşluk yok, kelimeler tire ile: yyyy-aa-gg-konu-kanal.uzantı. Örnek: 2026-10-19-pixel-11-pro-thumbnail.jpg
- Sürüm geçmişi: 1.2 — 21.10.2026 — alan adı updated.com.tr (sayfalar, makine sürümü, alan adlı logo SVG/PNG), panel koyu modu (12b), tam yayın öncesi kontrol listesi (16), yapay zekâ paketine şablon örnek görselleri · 1.1 — 20.10.2026 — tutarlılık düzeltmeleri: başlık satır yüksekliği 1,2, Instagram başlık sınırı ve logo, YouTube video içi yazı ölçüsü, grid boşlukları ölçeğe çekildi, görsel oranları, hitap, dosya adı kuralı, imla. · 1.0 — 19.10.2026 — ilk sürüm, 19 sayfa + makine sürümü.

## 16. Yayın öncesi kontrol
Her madde işaretlenmeden yayın yapılmaz. Önce Ortak, sonra kanal listesi.

Ortak
- [ ] Bilgi doğrulandı: en az bir birincil kaynak var. Sızıntıysa başlıkta "iddia" ya da "sızıntı" yazıyor.
- [ ] Başlık bilgiyi veriyor: kim + ne oldu + neden önemli. "Şok", "flaş", ünlem yok.
- [ ] İmla kontrol edildi: iPhone, yapay zekâ, 49.999 TL, %15, 14.30 gibi yazımlar Yazım Dili'ne uygun.
- [ ] Renkler palet içinde: turuncu zeminde yazı siyah, mavi zeminde beyaz. Turuncu bir yüzeyde tek.
- [ ] Görselin künyesi var: kaynak yazıyor. Yapay zekâ görseliyse "Temsili görsel" künyesi var.
- [ ] Sponsorlu mu: ücretli içerikse "Sponsorlu" etiketi açıkça görünüyor.

Web
- [ ] Başlık ≤70, SEO başlığı ≤60 karakter; spot tek cümle, ≤160 karakter.
- [ ] Kapak görseli 16:9, en az 1920 px; künye görselin altında.
- [ ] Kategori ve içerik etiketi seçildi (Son dakika, İnceleme, Sızıntı vb.).
- [ ] Görsellerde alt metin var: ne gösterdiği tek cümleyle.
- [ ] Mobil önizlemede kontrol edildi: başlık taşmıyor, görsel kırpılmıyor.

Instagram
- [ ] Format 4:5 (1080 × 1350); story ve reels 9:16 (1080 × 1920).
- [ ] Başlık güvenli alanda: story'de üst 250, alt 340 px boş; reels kapakta başlık ortadaki 3:4 alanda.
- [ ] Başlık kısa: kapak ≤6, story ≤5 kelime; carousel sayfası ≤25 kelime.
- [ ] Logo yalnızca UP; yatay logo kullanılmaz.
- [ ] Caption hazır: ilk satır haberi tek cümlede veriyor, en fazla 3 hashtag sonda, emoji yok.
- [ ] Telefonda önizlendi: profil ızgarasında kırpılınca başlık okunuyor.

YouTube
- [ ] Thumbnail 1280 × 720, JPG, ≤2 MB; dosya adı yyyy-aa-gg-konu-thumbnail.jpg.
- [ ] Thumbnail başlığı ≤4 kelime; video başlığını tekrar etmiyor, tamamlıyor.
- [ ] Sağ alt köşe boş: süre etiketi alanına yazı, puan ya da logo konmadı.
- [ ] 320 px testi yapıldı: küçük boyda başlık okunuyor.
- [ ] Video başlığı ≤60 karakter; bölüm zamanları açıklamada, bölüm kartlarıyla aynı.
- [ ] Bitiş ekranı son 20 saniyede; öğe alanlarında yazı yok.

Bülten
- [ ] Konu satırı ≤50 karakter, haberin kendisini veriyor ("Bu haftanın bülteni" gibi genel değil).
- [ ] Önizleme metni yazıldı: konu satırını tamamlayan ilk cümle, ≤90 karakter.
- [ ] Linkler test edildi: her haber linki doğru sayfaya gidiyor.
- [ ] Mobilde ve koyu modda kontrol edildi: logo beyaz sürüme geçiyor, metin okunuyor.
- [ ] Abonelikten çıkış linki altbilgide görünür.

Görsel sürüm (tıklanabilir): `UPDATED Kontrol Listesi.dc.html`.
