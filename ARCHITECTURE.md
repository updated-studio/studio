# Updated Stüdyo — Mimari Dokümanı

> **Bu doküman sistemin temelidir.** Updated üzerinde çalışan herkes (insan veya yapay zekâ), hangi sohbette veya oturumda olursa olsun, işe başlamadan önce bunu okur. Bir karar değişirse önce bu doküman güncellenir, sonra kod.

- Sürüm: 2 (12 Ekim 2026)
- Hazırlayan: Enes + Claude
- Onay: Enes ✔, Fatih (bekliyor)
- Asıl kopya: kod deposundaki `ARCHITECTURE.md`. Claude projesindeki kopya onun aynasıdır; ikisi aynı anda güncellenir.

---

## 1. Amaç

Updated'ın bütün iç araçlarını (ekip paneli, post/reels/story aracı, triyaj, takvim, marka kiti ve ileride eklenecekler) **tek üyelik, tek veritabanı ve tek kodla** çalışan bir sistemde toplamak. Bu sistemin adı **Updated Stüdyo**.

Aynı kod web'de, Android'de, bilgisayarda ve (Apple hesabı alınınca) iPhone'da çalışır. Sistem dağılmaz: yeni bir ihtiyaç doğduğunda ayrı bir araç kurulmaz, Stüdyo'ya yeni bir modül eklenir.

## 2. Temel kurallar

1. **Tek sistem.** Her yeni araç bu depoda bir modüldür. Ayrı giriş, ayrı veritabanı, ayrı depo, ayrı tasarım açılmaz.
2. **Önce bu doküman.** Her çalışma bu dokümanı okuyarak başlar. Mimariyi değiştiren her karar önce buraya yazılır (bkz. Karar günlüğü).
3. **Hesaplar Updated'ındır.** Kod, veritabanı, alan adı ve servis hesapları kişisel değil Updated adına tutulur; Fatih her birinde sahip yetkisine sahiptir.
4. **Gizli bilgi koda girmez.** Şifreler ve gizli anahtarlar yalnızca Supabase "Secrets" bölümünde durur. Kodda, dokümanda ve sohbetlerde yer almaz.
5. **Veritabanı değişikliği kayıtlı yapılır.** Her tablo/kural değişikliği depoda numaralı bir SQL dosyası (`supabase/migrations/`) olarak saklanır. Elle yapılan değişiklik de sonradan dosyaya yazılır.
6. **Her tabloda erişim kuralı (RLS) açıktır.** Kimin neyi görüp değiştirebileceği veritabanında tanımlıdır, yalnızca arayüze güvenilmez.
7. **Ortak tasarım.** Renkler, yazı tipleri ve ikonlar tek bir yerden gelir (`src/shared/tasarim`). Modüller kendi renk paletini icat etmez. Marka renkleri: mavi `#2563EB`, turuncu `#FF6B1A`.
8. **Arayüz Türkçe.** Kod içi adlar İngilizce olabilir; kullanıcının gördüğü her şey Türkçedir.
9. **Çalışan şey yarım bırakılmaz.** Bir araç taşınırken eskisi, yenisi tamamen çalışana kadar kapatılmaz.

## 3. Genel yapı

```
UPDATED STÜDYO (tek depo)
│
├─ Ortak omurga
│   ├─ Üyelik ve giriş (Supabase Auth, davet listesiyle)
│   ├─ Veritabanı (Supabase / PostgreSQL)
│   ├─ Sunucu işleri (Supabase Edge Functions + zamanlanmış işler)
│   ├─ Tasarım sistemi
│   └─ Bildirim: panel içi, e-posta, telefon
│
├─ Modüller
│   ├─ Ekip ............ müsaitlik, işler, devir, ekipman
│   ├─ Takvim .......... aylık görünüm, etkinlik/lansman, kişisel takvime abonelik
│   ├─ İçerik .......... post / reels / story aracı
│   ├─ Triyaj .......... haber tarama ve önceliklendirme
│   ├─ Marka Kiti ...... logolar, renkler, şablonlar
│   └─ (ileride) Kamera Simülatörü, ...
│
└─ Çıktılar (aynı koddan)
    ├─ Web ............. panel.updated.com.tr
    ├─ Android ......... siteden indirilen uygulama (APK)
    ├─ Bilgisayar ...... tarayıcıdan "Uygulamayı yükle"
    └─ iPhone .......... Apple geliştirici hesabı alınınca
```

## 4. Teknoloji seçimleri

| Katman | Seçim | Neden |
|---|---|---|
| Dil | TypeScript | Hataları yazarken yakalar; büyük projede düzen sağlar |
| Arayüz | React | En yaygın yapı; geliştirici ve yapay zekâ desteği en geniş |
| Derleme | Vite | Hızlı, sade |
| Veritabanı, giriş, sunucu işleri | Supabase | Hepsi tek pakette. PostgreSQL standart; veri her an dışa alınabilir, Supabase açık kaynak olduğu için ileride kendi sunucumuza taşınabilir |
| Mobil paketleme | Capacitor | Aynı koddan Android ve iPhone uygulaması üretir. Açık kaynak kütüphanedir, araya bir şirket veya sunucu girmez |
| Bilgisayar | Kurulabilir web uygulaması (PWA) | Ek iş gerektirmez. Gerekirse ileride aynı koddan Tauri ile kurulum dosyası |
| Yayın | GitHub Actions | Kod depoya gelince web sürümü ve Android dosyası kendiliğinden üretilir |
| Barındırma | GitHub Pages (`updated-studio.github.io/studio`), otomatik yayın | Depo şimdilik açık; gizli olursa GitHub Team gerekir |

Kaçınılmaz dış servisler: telefon bildirimleri Apple ve Google sunucularından geçer; iPhone dağıtımı Apple'a bağlıdır. Bunların dışında sistem hiçbir şirketin kapalı aracına bağlı değildir.

## 5. Modüllerin durumu

| Modül | Bugün nerede | Hedef | Durum |
|---|---|---|---|
| Ekip | Stüdyo modülü (`src/modules/ekip`). Eski tek dosyalık panel (eneshsahin.github.io/updated-panel/ekip) geçiş bitene kadar açık | Stüdyo modülü | Taşındı (12 Ekim), denemede |
| Takvim | Stüdyo modülü (`src/modules/takvim`) | + kişisel takvime abonelik | Taşındı (12 Ekim); abonelik yapılacak |
| İçerik (post aracı) | Stüdyo modülü (`src/modules/icerik`); araç `public/araclar/post/` içinde olduğu gibi çerçeveyle açılıyor. Eski adres de açık | Kayıtlı düzenler bulutta (ekip ortak), story boyutu, otomasyondan gelen postlar | 1. aşama taşındı (12 Ekim) |
| Post otomasyonu | GitHub Actions + Telegram + Gemini (eneshsahin/updated-post-otomasyonu) | Supabase zamanlanmış işleri | Taşınacak |
| Haber Masası (Triyaj) | Stüdyo modülü (`src/modules/haber-masasi`) + `triyaj-topla`, `triyaj-taslak` işleri. Eski Google Sheets/Apps Script sistemi ("Updated Haber Masası") geçiş bitene kadar paralel çalışıyor | Eski sistem kapanır; WordPress'e taslak gönderme | Kuruldu (12 Ekim), denemede |
| Marka Kiti | Stüdyo modülü (`src/modules/marka-kiti`): renkler, yazı tipleri | + logolar | Başlandı |
| Kamera Simülatörü | Fikir | Stüdyo modülü | İleride |

## 6. Veri modeli (mevcut)

Supabase projesi: `updated-panel` (organizasyon: Updated, bölge: Frankfurt).

| Tablo | İçerik |
|---|---|
| `invites` | Davet listesi. Sadece buradaki e-postalar üye olabilir |
| `profiles` | Üyeler: ad, rol, çalıştığı yer, yönetici mi, e-posta bildirimi açık mı, profil fotoğrafı (`avatar_url`), emoji rozeti (`emoji`, metin) |
| Depolama `avatars` | Profil fotoğrafları, `<kişi id>/…webp`; herkes okur, kişi sadece kendi klasörüne yazar. Tarayıcıda 512 px WebP'ye küçültülür |
| `availability` | Kişi + gün: boş/dolu, saat, konum, gün notu |
| `jobs` | İşler: marka, kategori, tür, başlık, son gün, ambargo, durum, üstlenen, devir teklifi |
| `job_requests` | "Ben alırım" talepleri |
| `gear` | Ekipman: envanterde/yolda, kimde, iade/geliş tarihi |
| `events` | Etkinlik ve lansmanlar: kesin/tahmini |
| `notifications` | Kişiye özel bildirimler, e-posta gönderildi mi |
| `week_notes` | Kullanılmıyor (gün notuna geçildi), kaldırılabilir |
| `tr_sources` | Haber Masası RSS kaynakları ve sağlık durumu |
| `tr_items` | Haberler: havuz (`aday`), belirsiz, elendi, alındı, pas, yayında; olay özeti, marka, ürün, tür, konu, Türkiye bilgisi (`turkey`), asıl kaynak (`origin`), olay kimliği (`event_key`), diğer kaynaklar, alan kişi, son bırakan, aktarım + not, çeviri, eski taslak linki, son işlem satırı, `touched` (ekip dokundu mu) |
| `tr_votes` | Editör oyu (eski Geri Bildirim): haber başına tek oy, notlu; marka/konu/link oyla saklanır |
| `tr_activity` | Bildirim havuzu: aldı / yayında / pas / bıraktı / aktar (notlu), kimin okuduğu |
| `tr_seen` | Aynı olaya bağlanan haber bağlantıları (tekrar gelmesin; 7 günde silinir) |
| `tr_votes` | Oy ve not (yapay zekâ son 30 notu istemde kullanır, böylece ekibin zevkini öğrenir) |
| `tr_drafts` | Stüdyo içinde düzenlenen haber taslakları (SEO paketi dahil) |
| `tr_chat` | Haber Masası sohbeti |
| `tr_brands`, `tr_press`, `tr_settings` | Türkiye pazarı markaları (Öncelikli/Normal/Hariç), basın kiti, ayarlar (saklama günü, gürültü kelimeleri, modeller, son toplama özeti) |

Sunucu işleri:
- `notify-email` (Edge Function): yeni bildirimleri e-posta olarak gönderir, e-postadaki link Stüdyo'yu gösterir. Gönderen adres (`MAIL_FROM`) ve şifre (`GMAIL_APP_PASSWORD`) Supabase Secrets'ta; şu an Enes'in Gmail'i.
- Giriş ayarları: Site URL Stüdyo'nun adresi; izinli yönlendirmeler Stüdyo ve eski ekip paneli.
- `triyaj-topla` (Edge Function, 15 dakikada bir `tr_kick` ile): RSS'leri okur, gürültü kelimesini kuralla, gerisini Gemini ile eler/sınıflandırır, aynı olayı tek kartta toplar ("diğer kaynaklar"), kaynak sağlığını yazar. Gemini yoksa ya da yanıt vermezse haber yazılmaz, sonraki turda yeniden denenir. 5 dakikadan sık çalışmaz.
- `triyaj-taslak` (Edge Function, ekip üyesi çağırır): haber sayfasını okur, çeviri ya da Updated yazım standardında taslak üretir. Aynı haberde iki iş aynı anda başlamaz (kilit).
- Gemini anahtarı `GEMINI_API_KEY` Supabase Secrets'ta.
- Saklama kuralı (`tr_cleanup`, her gece 03:30): havuz/belirsiz/elenen haberlerden kimsenin dokunmadığı (alınmamış, oylanmamış, pas geçilmemiş) ve N günden eski olanlar silinir (N = ayar, varsayılan 3). İşlem görenler kalır.
- Zamanlanmış: pazar 19:00 gelecek hafta müsaitlik hatırlatması, her gün 09:05 yaklaşan etkinlik bildirimi.

Yeni modüller tablolarını bu modele ekler; aynı kişi bilgisi için ikinci bir tablo açılmaz, `profiles` kullanılır.

## 7. Klasör yapısı (hedef)

```
updated-studio/
├─ ARCHITECTURE.md        ← bu doküman
├─ CLAUDE.md              ← her oturumda otomatik okunur, buraya yönlendirir
├─ src/
│  ├─ shared/             ← giriş, veritabanı bağlantısı, tasarım, bildirim
│  └─ modules/
│     ├─ ekip/
│     ├─ takvim/
│     ├─ icerik/
│     ├─ triyaj/
│     └─ marka-kiti/
├─ supabase/
│  ├─ migrations/         ← numaralı SQL dosyaları
│  └─ functions/          ← sunucu işleri
├─ android/  ios/         ← Capacitor'ün ürettiği uygulama projeleri
└─ .github/workflows/     ← otomatik yayın
```

## 8. Hesaplar ve sahiplik

| Servis | Şu an kimde | Hedef |
|---|---|---|
| Supabase (organizasyon "Updated") | Enes | Fatih de sahip |
| GitHub | Enes'in kişisel hesabı | "Updated" GitHub organizasyonu, Fatih sahip |
| E-posta gönderimi | Enes'in Gmail'i | Kurumsal adres (updated.com.tr) |
| Alan adı ve DNS (Natro) | Fatih | Fatih |
| Triyaj (Google) | Enes'in Google hesabı | Supabase'e taşınınca kapanır |
| Apple geliştirici hesabı | Yok | Fatih ile karar verilecek |

## 9. Maliyet

| Kalem | Ücret | Ne zaman |
|---|---|---|
| Supabase | Şimdilik ücretsiz; büyüyünce aylık 25 $ | Kullanım artınca veya proje duraklatma riski görülürse |
| Apple geliştirici hesabı | Yıllık 99 $ | iPhone uygulaması istendiğinde |
| Google Play (isteğe bağlı) | Tek seferlik 25 $ | Uygulama mağazaya konmak istenirse; APK için gerekmez |
| Barındırma, GitHub | Ücretsiz | — |

Not: Supabase ücretsiz projeleri uzun süre kullanılmazsa duraklatabiliyor; güncel kural kurulumda teyit edilecek.

## 10. Yol haritası

**5 Kasım'a kadar (Enes askere gitmeden)**

| Tarih | İş |
|---|---|
| 12–18 Ekim | GitHub organizasyonu ve tek depo. Stüdyo kabuğu: tek giriş, menü, ortak tasarım. Ekip ve Takvim modül olarak içeri. Marka Kiti. |
| 19–25 Ekim | İçerik modülü (post aracı) ortak girişle, kayıtlı taslaklar, story boyutu. Takvim aboneliği. Android uygulaması. Natro erişimi gelirse alt adres + kurumsal e-posta. |
| 26 Ekim–1 Kasım | Triyaj ve post otomasyonu taşıma, **ilk iki hafta bittiyse**. Bitmediyse ikisi bugünkü yerinde çalışmaya devam eder. |
| 2–4 Kasım | Devir: Fatih her hesapta sahip, bu doküman güncel, "bir şey bozulursa" sayfası. |

**Sonra:** iPhone uygulaması, telefon bildirimi, Öneriler kuyruğu (haberden etkinlik), Kamera Simülatörü.

### İstek listesi (taşımalar bittikten sonra)

- Haber Masası: taslağı WordPress'e tek tuşla taslak olarak gönderme; Unsplash/basın kiti görsel önerisi.
- Haber Masası geçiş günü: eski tablodaki işlem görmüş haberler (alındı/yayında/pas, ~100 kayıt) içe aktarılır, sonra eski sistem kapanır ve tablodaki anahtarlar silinir.
- İçerik: format sistemi (Post 4:5 / Story 9:16 / Reels kapağı 9:16, ızgara 3:4); şablonlar oran ve güvenli alanla tanımlanır, format değişince sadece çerçeve değişir. Story'de kaydırmalı şablon yok.

## 11. Açık kararlar

1. **Depo gizliliği.** Depo şimdilik açık (GitHub Pages ücretsiz). Fatih onay verirse gizliye çevrilir; o durumda yayının GitHub'da kalması için GitHub Team (kişi başı aylık ücret) gerekir.
2. **Apple geliştirici hesabı:** alınacak mı, kimin adına? (Fatih ile görüşülecek)
3. **Alt adres:** `panel.updated.com.tr` (Natro erişimi gerekiyor)

## 12. Karar günlüğü

- **8 Ekim 2026:** Ekip paneli için Supabase seçildi; giriş davet listesiyle.
- **8 Ekim 2026:** E-posta bildirimi şimdilik Enes'in Gmail'inden; kurumsal adres gelince taşınacak.
- **12 Ekim 2026:** Tüm araçlar tek sistemde (Updated Stüdyo) toplanacak. Teknoloji: TypeScript + React + Vite + Supabase + Capacitor.
- **12 Ekim 2026:** iPhone uygulaması Apple hesabı kararına kadar ertelendi; kod tarafında iPhone'a hazır kurulacak.
- **12 Ekim 2026:** İç araçlar WordPress sitesinin içine gömülmeyecek; alt adres kullanılacak.
- **12 Ekim 2026:** Kod `updated-studio/studio` deposunda (GitHub organizasyonu). Depo şimdilik açık; yayın GitHub Pages, otomatik (`.github/workflows/yayin.yml`).
- **12 Ekim 2026:** Ana menü telefonda altta, geniş ekranda solda; ekran içi bölümler segmentli seçici. Bu Hafta ekranına "Gelecek hafta" eklendi.
- **12 Ekim 2026:** Kayıt onayı / şifre sıfırlama bağlantıları ve e-posta linkleri Stüdyo'ya yönlendirildi; e-posta fonksiyonu depodaki sürüme güncellendi.
- **12 Ekim 2026:** Ekip ve Takvim modülleri Stüdyo'ya taşındı. Ortak canlı veri `src/shared/veri.tsx`; yeni sürüm uyarısı `src/shared/SurumUyarisi.tsx`.
- **12 Ekim 2026:** Ana menü macOS tarzı yüzen **dock** oldu (telefon ve masaüstünde altta, ortada). Hesapla ilgili sayfalar sağ üstteki **profil menüsünde**: Profilim (fotoğraf yükleme), Yönetim (sadece yönetici), Çıkış. Modül nerede görünür `src/modules/index.ts`'te `yer: "dock" | "profil"` ile belirlenir. Kişi görseli her yerde `src/shared/Avatar.tsx`. Ekip listesinde 8 kişiyi geçince arama çıkar (50+ kişiye hazırlık).
- **12 Ekim 2026:** Müsaitlik hatırlatması pazartesi 09:00 yerine **pazar 19:00**, gelecek hafta için (migration 0004).
- **12 Ekim 2026:** Dock'ta modül adları simgenin altında sürekli görünür (ekip alışana kadar; gerekmezse kaldırılır). Profil fotoğrafına emoji rozeti eklendi: emoji metin olarak saklanır, her cihaz kendi emoji setiyle çizer (Apple cihazlarda Apple emojileri). Apple'ın emoji görselleri telif nedeniyle sunucudan dağıtılmaz (migration 0005).
- **12 Ekim 2026:** Profil fotoğrafı yüklenmemişse Gravatar'daki fotoğraf (WordPress'in kullandığı servis, e-postanın SHA-256 özetiyle) gösterilir; o da yoksa baş harf. Emoji kutusu sadece tek emoji kabul eder; hazır liste hayvan emojileri.
- **12 Ekim 2026:** Post aracı yeniden yazılmadan Stüdyo'ya alındı (aşamalı taşıma): mevcut tek dosya `public/araclar/post/index.html`, İçerik modülü onu çerçeveyle (iframe) açar; Stüdyo içinde açılınca kendi başlığını gizler. Gerekçe: 29 şablon çalışıyor, baştan yazmak haftalar sürer. Sonraki adımlar araç içinde parça parça: kayıtların buluta taşınması, story boyutu.
- **12 Ekim 2026:** Triyaj, "Haber Masası" adıyla Stüdyo modülü olarak yeniden kuruldu (tam kapsam, sohbet dahil). Toplama Supabase Edge Function + pg_cron ile; taslaklar Google Docs yerine Stüdyo'da. Editör girişi ayrı şifre yerine Stüdyo hesabı. Eski sistem yenisi denenene kadar paralel çalışır (kural 9). Saklama: sadece dokunulmamış havuz haberleri 3 günde silinir.
- **12 Ekim 2026:** Sıralama kararı (Enes): Haber Masası → kayıtların buluta taşınması → takvim aboneliği → İçerik format sistemi → (sonra) video aracı → en son Android uygulaması.
- **12 Ekim 2026:** Tek hesap: ekip paneli, post aracı ve Haber Masası artık aynı Stüdyo hesabını kullanır (Haber Masası'nın ayrı şifre listesi bırakıldı). Ekip > Ekip'te katkı sıralaması (bu hafta / bu ay / tümü) ve kişi profili eklendi. Puan yayına gideni ödüllendirir (yayında 3, biten ekip işi 3, alınan haber ve taslak 1, oy 0.2) ki sayı şişirme teşvik edilmesin (`src/modules/ekip/Katki.tsx`).
- **13 Ekim 2026:** Puanlama kuralları sistemde görünür: Ekip > Ekip > "Puan nasıl hesaplanır?" açıklaması `PUAN_KURALLARI` listesinden üretilir; kural değişince ekran kendiliğinden güncellenir. Değişiklik yapan, `PUAN_SURUMU` tarihini ve bu günlüğü günceller (CLAUDE.md kural 9).
- **13 Ekim 2026:** Haber Masası'na eski tablodan işlem görmüş 99 haber aktarıldı (38 alındı, 50 yayında, 11 pas; alan editörler eşleşti). Toplamadaki hata düzeltildi: toplu yazmada bazı satırların eksik sütunu tüm partiyi reddettiriyordu; artık her satır tam sütunla yazılıyor ve yazma hatası "son toplama" özetinde görünüyor.
- **13 Ekim 2026:** Video aracı yapılmayacak (Enes: uzun iş, mantıklı değil). "Askerlik sonrası" listesi yok: listedeki her iş 5 Kasım'dan önce yapılacak. Sıradakiler: taslak/çeviri testi → öncelik sistemi (P1-5 yerine anlaşılır seviye + gerekçe) ve oy yerine eylemden öğrenme → arayüz tasarımı → takvim aboneliği + davet e-postası → post aracı kayıtları buluta → post otomasyonu taşıma → format sistemi → WordPress'e taslak gönderme → Natro alt adres + kurumsal e-posta → telefon bildirimi → Android → devir paketi.
- **13 Ekim 2026:** Haber Masası öncelik sistemi yenilendi (Enes ile): P1-5 kaldırıldı; seviyeler "Hemen yaz / Yazılabilir / Beklet". Puan markadan bağımsız: haber türü (yapay zekâ sabit listeden seçer) + ek kaynak sayısı + tazelik + yapay zekânın küçük önem payı − Türkiye'de satılmayan marka. Kartta gerekçe yazar. Ekip oyu "Bunun gibi daha çok / az" (▲▼ yerine); oy sadece aynı markanın kendi haberleri arasında sırayı değiştirir, markaları birbirinin önüne geçirmez. Al/Pas öğrenmede kullanılmaz (güvenilir sinyal değil). Havuzda aynı markadan art arda en fazla 2 haber. Her editöre "Bana göre" görünümü (ilgi alanı üstte; ortak sıra değişmez). Pas geçilen haber geri alınabilir. Kurallar: `src/modules/haber-masasi/oncelik.ts` (CLAUDE.md kural 10).
- **13 Ekim 2026 (akşam):** Eski triyaj (Kod.gs, Triyaj.gs, Index.html) satır satır karşılaştırılıp Haber Masası'na tam aktarıldı (0010, 0011); Enes'in sonradan verdiği geri bildirimler korunarak. Eskiden gelen: yapay zekâ sadece etiket çıkarır (marka, ürün, tür, haber türü, konu, Türkiye var/yok/global/belirsiz, asıl kaynak, olay kimliği); kararı kurallar verir: Hariç marka, kampanya/rehber ve (Öncelikli değilse) Türkiye'de yok → elenir; Türkiye belirsiz → Belirsiz. Toplama: son 24 saat, kaynak başına 10, en fazla 100 haber, eski gürültü listesi (başlık + özet, kelime sınırı), aynı olay kimliği tek satırda. Taslak eski istemle: SEO, gövde, dikkat edilmesi gerekenler, editöre sorular, doğrulama listesi, görsel (basın kiti, Unsplash/Pixabay/Pexels stok önerileri, yapay zekâ istemi), iki kaynak; taslak hazırlayan haberi otomatik alır. Notlu aktarma + açılır pencere, bildirim havuzu, ayrı Pas sekmesi, marka/kategori/kaynak filtreleri, Elenenler kategori çipleri, kaynak hata açıklamaları. Enes'in kararlarıyla yeni kalan: puan markadan bağımsız haber türüne göre (seviyeler Hemen yaz / Yazılabilir / Beklet, gerekçe kartta); Öncelikli marka listesi ve Sony kamera bonusu puanı etkilemez (liste sadece elemede); oy "Bunun gibi daha çok / az", herkes kendi oyunu verir, notlu, sadece marka içinde etkili; çeşitlilik (aynı markadan art arda 2); Al/Pas sinyal değil; "Bana göre" görünümü. Eski tablodan aktarılan: alınan/yayında/pas haberler (eski Google Docs taslakları bağlantı olarak), oylar, bildirimler, "yanlış elenmiş" işaretleri; Yeni/Belirsiz/Elenen haberlerden sadece son 3 gün. Kurallar: eleme `supabase/functions/triyaj-topla`, puan `src/modules/haber-masasi/oncelik.ts` (CLAUDE.md kural 10).
- **13 Ekim 2026 (akşam, 2):** Enes: bir turda 100'ü aşan haberler elenmez, sıraya girer (önceki turda okunan tekrar alınmaz). Otomobil kapsama alındı: Carscoops, Autocar, Motor1 kaynak olarak eklendi. Oy düğmeleri 👍/👎 (sayılı; açıklama ve kim/not üzerine gelince). "Haberleri şimdi topla" düğmesi onay penceresiyle. Eski tablodan aktarıldı: 99 işlenmiş haberin taslak/çeviri/aktarım bilgileri, son 3 günün 550 Yeni haberi, 362 Elenen, 12 oy, 126 bildirim. Açık konular: rehber/liste içerik için ayrı sekme, havuzun varsayılan görünümü (~20 haber), sınır yüzünden elenen 121 haberin yeniden toplanması, aynı olayın farklı turlarda tekrar gelmesi.
- **14 Ekim 2026:** Taslak işlerinin "hazırlanıyor"da takılması kalıcı çözüldü. Neden: eski Apps Script'te 6 dk süre vardı; Supabase Edge Function arka plan işini ~150 sn'de öldürüyor ve yapay zekâ isteğinin süre sınırı yoktu. Çözüm: (1) yapay zekâ isteği en fazla 50 sn bekler, toplam iş bütçesi 115 sn, "düşünme" kısık (model desteklemezse kendiliğinden kapanır); (2) iş sürdükçe nabız (updated_at) tazelenir; (3) dakikada bir çalışan `tr_is_kurtar` (0013) 2 dk nabızsız işi "hata"ya çeker, kartta "Tekrar dene" çıkar; kilit 2 dk sonra kendiliğinden açılır. Ekranda "takıldı" eşiği 2 dk. Haber listelerine sıralama seçimi eklendi (öncelik / haber saati / sisteme düşme saati, yeniden eskiye). "Yayına hazır" şu an sadece durum + HTML kopyala; WordPress'e taslak gönderme planlı iş.
