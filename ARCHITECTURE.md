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
| GitHub | `updated-studio` organizasyonu (ücretsiz plan), sahip Enes | Fatih de sahip (ücretsiz planda sınırsız sahip/üye) |
| E-posta gönderimi | Enes'in Gmail'i | Kurumsal adres (updated.com.tr) |
| Alan adı ve DNS (Natro) | Fatih | Fatih |
| Triyaj (Google) | Kapatıldı (13 Ekim): Haber Masası'na taşındı; eski tablo Enes'in Google hesabında arşiv | — |
| Yapay zekâ anahtarları (Gemini, Groq) | Enes'in hesapları; anahtarlar Supabase Secrets'ta | Fatih'e devir paketinde |
| Claude (Project "Updated") | Enes | Project paylaşımı Claude Team/Enterprise ister; Fatih kendi Claude'uyla depoyu okur |
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
- **14 Ekim 2026 (2):** Altyapı uyarısı (Enes isteği): Stüdyo, Supabase'in durum sayfasını (status.supabase.com, herkese açık) 3 dakikada bir okur; bizi etkileyen bir arıza varsa (sunucu fonksiyonları, veritabanı, giriş, canlı güncelleme) tüm sayfaların üstünde "Altyapı sorunu (Supabase, bizden kaynaklı değil)" uyarısı çıkar. Küçük ve "izleniyor" aşamasındaki olaylar gösterilmez. Taslak/çeviri hatalarında kartta kaynak etiketi: Altyapı (Supabase) / Altyapı / Yapay zekâ (Gemini) / Kaynak site. Kod: `src/shared/altyapi.tsx`.
- **14 Ekim 2026 (3):** Haber Masası seviye adları "Hemen yaz / Yazılabilir / Beklet" yerine "Öncelik 1 / 2 / 3" (Enes). Puanlama ve eşikler (70 / 40) değişmedi. `ONCELIK_SURUMU` 14 Ekim 2026.
- **14 Ekim 2026 (4):** Üst bölümdeki "UPDATED" yazısı yerine logo (tema rengine uyar, `src/assets/logo.png` maske). Açılış ekranı: siyah kare ikon yerine tema arka planında arka plansız logo, yumuşak giriş/çıkış (`index.html` #acilis, `main.tsx`). Android açılışı için şeffaf ikon (`icon-seffaf-512.png`, purpose any); ana ekran ikonu siyah zeminli kaldı (maskable). Havuz sıralamasına "öncelik grubu, içinde yeni → eski" seçeneği eklendi.
- **14 Ekim 2026 (5):** Uygulama ikonları tek kaynaktan üretilir: `python3 scripts/ikonlar.py [logo.png] [zemin]` → iPhone (180), Android maskable (192/512, logo daire kesimde kırpılmaz), şeffaf açılış ikonu, favicon (32), logo maskesi. Logo optik merkeze oturtulur. Yeni marka kiti gelince sadece kaynak logo değişir.
- **14 Ekim 2026 (6):** Ana ekran ikonunun zemini #1B1D21 (manifest background_color ile aynı); Android 12+ açılışta ikonu bu renk üstünde gösterdiği için siyah kare/daire görünmez. Uygulamanın kendi açılış ekranı her temada #1B1D21 ve aynı boyutta logo: telefonun açılışıyla uygulamanınki arasında dikiş yok. Ana ekrandan açanlara bir kez "ikon yenilendi" uyarısı (`src/shared/IkonUyarisi.tsx`, ikon değişince IKON_SURUMU güncellenir).
- **14 Ekim 2026 (7):** Mobilde üst bölümde UP işareti, geniş ekranda UPDATED yazısı. İkonlar UP işaretinden üretiliyor (ana ekran koyu zemin, sekme ikonu yuvarlak köşeli mavi). ARCHITECTURE.md'ye "İşletme el kitabı" (bölüm 13) eklendi: adresler, gizli bilgilerin yeri, fonksiyonlar, zamanlanmış görevler, arıza tablosu, yapılacaklar.

## 13. İşletme el kitabı (her şey nerede, bir şey bozulursa)

Bu bölüm, sohbetleri okumadan sistemi devralacak kişi içindir. Gizli bilginin kendisi burada yazmaz; sadece **nerede durduğu** yazar.

### 13.1 Adresler

| Ne | Nerede |
|---|---|
| Stüdyo (canlı) | https://updated-studio.github.io/studio/ (hedef: `studio.updated.com.tr`, Natro'da CNAME → `updated-studio.github.io`) |
| Kod | GitHub `updated-studio/studio`, `main` dalı. `main`'e her gönderim GitHub Actions ile 1-2 dk'da canlıya çıkar |
| Veritabanı + sunucu | Supabase projesi `updated-panel` (kimlik `fulmooonidwrqyybbkvu`), organizasyon "Updated", ücretsiz plan |
| Supabase durum sayfası | https://status.supabase.com (Stüdyo bunu okur, arıza varsa üstte uyarı çıkar) |
| Marka dosyaları | `assets/marka/` (UP işareti şeffaf, mavi ve siyah kare, UPDATED yazısı) |

### 13.2 Gizli bilgiler (sadece Supabase → Edge Functions → Secrets)

`GEMINI_API_KEY` (Google AI Studio, ücretsiz kota), `GROQ_API_KEY` (Gemini kotası dolunca yedek, ücretsiz), `GMAIL_APP_PASSWORD` + `MAIL_FROM` (bildirim e-postaları, Enes'in Gmail'i), isteğe bağlı `UNSPLASH_ACCESS_KEY` / `PIXABAY_API_KEY` / `PEXELS_API_KEY` (taslakta stok görsel önerisi; şu an yok). Tarayıcıdaki "publishable" anahtar gizli değildir, kodda durur. Kural: şifre/anahtar asla koda ya da sohbete yazılmaz.

### 13.3 Sunucu fonksiyonları (supabase/functions)

| Fonksiyon | Ne yapar | Nasıl tetiklenir |
|---|---|---|
| `triyaj-topla` | Kaynaklardan haber toplar, yapay zekâyla etiketler, kurallarla eler, olayları gruplar | 15 dk'da bir zamanlanmış görev + "Haberleri şimdi topla" düğmesi |
| `triyaj-taslak` | Seçilen habere Türkçe taslak ya da çeviri yazar | Karttaki "Taslak hazırla" / "Tekrar dene" |
| `notify-email` | Bildirim e-postaları | Veritabanı tetikleyicileri |
| `triyaj-aktar` | Eski tablodan tek seferlik aktarım (kullanıldı, artık çalışmaz) | — |

**Yayınlama:** Supabase CLI kurulu değil. Fonksiyon kodu Supabase panelinde Edge Functions → fonksiyon → Code sekmesinde değiştirilip "Deploy updates" ile yayınlanır (Claude bunu kodu GitHub'daki son halinden alarak yapıyor). Uzun vadeli öneri: GitHub Actions + Supabase CLI ile otomatik yayın (bir `SUPABASE_ACCESS_TOKEN` gerekir, sahip oluşturur).
**Not:** Supabase arka plan işini ~150 sn'de öldürür. Taslak işi 115 sn bütçeyle çalışır; aşarsa hata yazar.

### 13.4 Zamanlanmış görevler (pg_cron)

| Ad | Ne zaman | Ne yapar |
|---|---|---|
| `triyaj-topla` | 15 dk'da bir | Haber toplama fonksiyonunu çağırır |
| `triyaj-is-kurtar` | Dakikada bir | 2 dk'dır nabızsız taslak/çeviri işini "hata"ya çeker (kilit açılır, kartta "Tekrar dene") |
| `triyaj-temizlik` | Her gece 03:30 TR | Eski haberleri ve görülme kayıtlarını temizler |
| `haftalik-hatirlatma` | Pazar 19:00 TR | Ekibe haftalık hatırlatma e-postası |
| `etkinlik-hatirlatma` | Her gün 09:05 TR | Yaklaşan etkinlik hatırlatması |

Liste SQL Editor'da: `select jobname, schedule from cron.job;`

### 13.5 Veritabanı değişikliği

Yeni dosya `supabase/migrations/00NN_ad.sql`; Supabase → SQL Editor'da çalıştırılır. Eski dosyalar değiştirilmez. Silme içeren SQL'de Supabase onay ister; onaya sahip basar. Son çalışan: `0013_is_kurtarma.sql`.

### 13.6 Bir şey bozulursa

| Belirti | Önce buna bak | Çözüm |
|---|---|---|
| Üstte "Altyapı sorunu (Supabase)" uyarısı | status.supabase.com | Bizden değil; beklenir, düzelince kendiliğinden geçer |
| Taslak "yazılıyor"da kalıyor | Karttaki kaynak etiketi (Altyapı / Yapay zekâ / Kaynak site) | 2 dk sonra kendiliğinden "Tekrar dene" çıkar. Sürekliyse: Supabase → triyaj-taslak → Logs |
| Yeni haber gelmiyor | Haber Masası üstündeki yapay zekâ uyarısı; Kaynaklar sekmesi | Kota dolduysa ertesi gün düzelir (Groq yedeği devreye girer). Kaynak bozuksa Kaynaklar'da kapat |
| "Yapay zekâ kotası doldu" | Google AI Studio kotası | Ertesi gün sıfırlanır; sürekliyse ücretli plan ya da toplama aralığını uzatmak |
| Site açılmıyor | GitHub → Actions son çalışma | Kırmızıysa son değişiklik geri alınır (`git revert`) |
| Giriş e-postası / bildirim gelmiyor | Supabase Secrets'ta `GMAIL_APP_PASSWORD` | Gmail uygulama şifresi yenilenir |
| Supabase projesi "paused" | Supabase paneli | "Restore" (ücretsiz plan uzun kullanılmazsa duraklatır) |

### 13.7 Haber Masası özeti

Toplama (15 dk): son 24 saat, kaynak başına 10, tur başına en fazla 100 haber, fazlası sıraya girer. Yapay zekâ sadece etiket çıkarır, kararı kurallar verir (hariç marka, kampanya → elenir; rehber/liste → "Rehber fikirleri"; Türkiye'de yok ve Öncelikli değil → elenir; belirsiz → Belirsiz). Aynı olay tek kartta, diğer kaynaklar bağlantı. Elenen başlıklar Türkçe görünür, "Havuza al" ile geri alınır. Öncelik: Öncelik 1 (≥70) / 2 (≥40) / 3; puan haber türü + kaynak sayısı + tazelik; ekip oyu (👍/👎) sadece aynı marka içinde etkili; aynı markadan art arda en fazla 2. Sıralama: öncelik puanı / öncelik grubu içinde yeni→eski / haber saati / sisteme düşme saati. Taslak: Gemini (3.8 → 3.6 → 3.5 flash), iki kaynak, SEO, editöre sorular, doğrulama, görsel önerisi; hazırlayan haberi alır. "Yayına hazır" şu an sadece durum + HTML kopyala (WordPress'e gönderim yok). Kurallar: eleme `supabase/functions/triyaj-topla/index.ts`, puan `src/modules/haber-masasi/oncelik.ts`.

### 13.8 Ekip geri bildirimleri (karşılananlar)

Taslak/Tekrar dene çalışmıyordu → düzeltildi (14 Ekim). Haber saatine ve sisteme düşme saatine göre yeniden eskiye sıralama → eklendi. Öncelik grubu içinde zamana göre sıralama → eklendi. Kopya kartlar → tek kartta birleşiyor. Elenenler İngilizceydi → Türkçe. Bildirimler altta ve beyaz zeminliydi → üstte, cam görünüm. Mobil menü (dock) bozuktu → düzeltildi; dokununca mavi kare kalktı.

### 13.9 Yapılacaklar (14 Ekim itibarıyla, sırayla)

1. Fatih'i GitHub ve Supabase'e sahip olarak eklemek; Stüdyo'da yönetici.
2. Devir paketi: bu bölümün Fatih'e göre gözden geçirilmesi + hesap listesi (kimin e-postası, kurtarma).
3. Alan adı: `studio.updated.com.tr` (Natro CNAME; sonra GitHub Pages özel alan adı, Supabase Auth izinli adresler, e-postalardaki panel adresi).
4. Sistem Durumu sayfası (tüm ekip görür): yapay zekâ/kota, son toplama, kaynak sağlığı (Kaynaklar'dan taşınır), zamanlanmış görevler, anahtar var/yok.
5. Kopya kart birleştirmesinin geçmiş haberler için tamamlanması (kaynak sınırına takıldı).
6. WordPress'e taslak gönderme (WordPress "Application Password" sahip tarafından oluşturulur).
7. Takvim aboneliği + davet e-postası; post aracı kayıtları buluta; post otomasyonu taşıma; format sistemi.
8. Kurumsal e-posta, telefon bildirimi, Android uygulaması.
9. Yeni kaynaklar: Asya sızıntı siteleri, resmi basın sayfaları, Türkiye kaynakları (araştırma notları: Webtekno, LOG, ShiftDelete ~50'şer haber incelendi).
10. Fonksiyonların GitHub'dan otomatik yayını (13.3).

### 13.10 Marka ve ikonlar

İkonlar tek komutla üretilir: `python3 scripts/ikonlar.py` (kaynak `assets/marka/up-isaret.png`). Ana ekran ikonu: koyu zemin (#1B1D21) üstünde beyaz UP; açılış ekranı aynı renk ve işaret (dikiş görünmesin). Sekme ikonu: yuvarlak köşeli marka mavisi (#2563FF) kare. Üst bölümde "UPDATED" yazısı (`src/assets/logo.png`). İkon değişince `src/shared/IkonUyarisi.tsx` içindeki tarih güncellenir (iPhone ikonu kendiliğinden yenilemez).

## 14. Sistem nasıl çalışır (uçtan uca)

**Katmanlar.** Ekip Stüdyo'yu tarayıcıdan ya da ana ekrana eklenmiş uygulama olarak açar. Sayfanın kendisi GitHub Pages'te duran hazır dosyalardır (sunucu yok). Giriş, veri ve canlı güncelleme Supabase'ten gelir: tarayıcı doğrudan veritabanıyla konuşur, kim neyi görebilir kuralları (RLS) veritabanının içindedir. Ağır ya da gizli anahtar gerektiren işler (yapay zekâ, e-posta, haber toplama) Supabase'teki sunucu fonksiyonlarında çalışır; anahtarlar sadece orada durur. Zamanlanmış görevler (pg_cron) veritabanının içinde çalışır ve fonksiyonları çağırır.

**Değişiklik nasıl canlıya çıkar.** Ekran kodu: depoya gönderim → GitHub Actions derler → GitHub Pages yayınlar → açık sayfalarda "yeni sürüm hazır, yenile" uyarısı çıkar (`SurumUyarisi`). Sunucu fonksiyonu: Supabase panelinden "Deploy" (13.3). Veritabanı: yeni migration dosyası + SQL Editor (13.5).

**Modüller ve ne işe yaradıkları.**
- **Ekip:** kim ne zaman müsait, kimde hangi iş, devir notları, ekipman; katkı puanı (kurallar `src/modules/ekip/Katki.tsx` PUAN_KURALLARI).
- **Haber Masası:** yabancı teknoloji haberlerini toplar, eler, önceliklendirir; editör haberi alır, Türkçe taslak hazırlatır, düzenler, yayınladım der (13.7).
- **İçerik:** Instagram post/story/reels görseli hazırlama aracı.
- **Takvim:** lansman ve etkinlikler, aylık görünüm.
- **Marka Kiti:** logolar, renkler, yazı tipleri; ekip buradan indirir.
- **Profilim / Yönetim:** kişisel ayarlar ve ilgi alanları ("Bana göre" görünümü buradan çalışır); yönetici için üye ve ayar ekranı.

**Haber Masası'nda bir haberin yolculuğu.**
1. Zamanlanmış görev 15 dk'da bir `triyaj-topla`yı çağırır. Fonksiyon kaynakların RSS'lerini okur (son 24 saat, kaynak başına 10), daha önce görülenleri atlar (`tr_seen`).
2. Yeni haberler 50'lik partilerle Gemini'ye (en ucuz model) gider; yapay zekâ sadece etiket döndürür (marka, ürün, tür, haber tipi, konu, Türkiye durumu, asıl kaynak, olay kimliği, Türkçe özet). Uydurma yasağı istemde yazılıdır. Gemini kotası doluysa Groq'a geçer ve panelde uyarı çıkar.
3. Kurallar karar verir: elenir / Belirsiz / Rehber fikirleri / Havuz. Elenen başlıklar tarayıcıda ücretsiz çeviriyle Türkçeleşir.
4. Aynı olay (48 saat içinde aynı olay kimliği ya da yapay zekâ eşleştirmesi) tek karta birleşir; diğer siteler kartta bağlantı olur ve puanı artırır.
5. Ekranda `oncelik.ts` puanlar ve sıralar; ekip 👍/👎 verir, "Ben alıyorum" der ya da pas geçer.
6. "Taslak hazırla" → `triyaj-taslak` makaleyi (ve varsa ikinci kaynağı) çeker, Gemini'ye yazdırır, taslağı `tr_drafts`a koyar, haberi hazırlayan kişiye verir. İş sürerken nabız atar; 2 dk nabız gelmezse `triyaj-is-kurtar` hatayı yazar.
7. Editör taslağı Taslaklar'da düzenler, "Yayına hazır" yapar, HTML'i kopyalayıp WordPress'e yapıştırır, kartta "Yayınladım" der. Her adım bildirim havuzuna (🔔) düşer.

## 15. Eski sistemle farklar (Google E-Tablolar + Apps Script → Stüdyo)

| Konu | Eski (Triyaj tablosu) | Yeni (Haber Masası) |
|---|---|---|
| Nerede | Google E-Tablolar + Apps Script, tek kişinin Google hesabı | Stüdyo içinde modül; ortak giriş, Supabase |
| İş süresi sınırı | 6 dk | ~150 sn (bu yüzden süre bütçesi + nabız + kendiliğinden kurtarma) |
| Öncelik | P1-P5 ve Sony kamera bonusu, Öncelikli marka listesi puan veriyordu | Öncelik 1/2/3; puan markadan bağımsız (haber türü + kaynak sayısı + tazelik); Öncelikli liste sadece elemede |
| Oy | ▲▼, haber başına tek oy | Herkes kendi 👍/👎'su, notlu; sadece aynı marka içinde etkili |
| Al / Pas | Sıralamayı etkiliyordu | Sinyal sayılmaz; pas geri alınabilir |
| Tur sınırı | 100'ü aşan haber "Toplu istek limiti" ile eleniyordu | Fazlası sıraya girer, sonraki turda işlenir |
| Aynı haber | Her kaynak ayrı satır | Tek kart, diğer kaynaklar bağlantı |
| Rehber / listeler | Eleniyordu | Ayrı "Rehber fikirleri" bölümü |
| Elenenler | İngilizce, geri alınamıyordu | Türkçe, "Havuza al" ile geri alınır |
| Taslak | Google Docs dosyası | Uygulama içinde düzenleyici; eski Docs taslakları bağlantı olarak kaldı |
| Yapay zekâ kotası | Dolunca durur, kimse bilmezdi | Groq yedeği + panelde uyarı |
| Anlık toplama | Yok | "Haberleri şimdi topla" (onaylı) |
| Arıza görünürlüğü | Yok | Altyapı uyarısı (Supabase durum sayfası) + kartta hata kaynağı |
| Görünüm | Tablo | Kartlar, filtreler, "Bana göre", 4 sıralama, mobil |

Aktarılanlar: alınan/yayında/pas haberler, oylar, bildirimler, "yanlış elenmiş" işaretleri tamamen; Yeni/Belirsiz/Elenen haberlerden son 3 gün. Eski tablo arşiv olarak duruyor, tetikleyicisi kapatıldı.

## 16. Tartışmalar ve gerekçeler (neden böyle karar verdik)

- **Tek depo, tek giriş, modüller.** Ayrı ayrı araçlar (triyaj tablosu, post aracı, takvim) her biri ayrı giriş ve ayrı bakım istiyordu; Enes askerdeyken bakacak kişi tek yere bakabilmeli.
- **Supabase + GitHub Pages.** Ücretsiz, sunucu yönetimi yok, Fatih devralabilir. Bedeli: fonksiyon süre sınırı (150 sn) ve Supabase arızalarına bağımlılık (14 Ekim'de 16 saatlik fonksiyon arızası yaşandı; buna karşı süre bütçesi, nabız, kurtarma görevi ve altyapı uyarısı eklendi).
- **Yapay zekâ karar vermez, etiket çıkarır.** Eleme kararı kurallarda: hangi haberin neden elendiği okunabilir ve kural değiştirmek kod satırı değiştirmek demek. Yapay zekâ "daha akıllı modele geçelim mi" sorusu konuşuldu: etiketlemede ucuz model yeterli, pahalı model kotayı hızla bitirir; taslakta daha güçlü model kullanılıyor.
- **Öncelik markadan bağımsız.** Enes: büyük markalar her şeyi ezmesin, küçük ama önemli haber kaybolmasın. Oy sadece aynı markanın kendi haberleri arasında sırayı değiştirir; aynı markadan art arda en fazla 2 haber (çeşitlilik).
- **Al/Pas sinyal değil.** Bir haberi almak "iyi haber" demek değil (müsait olan alır), pas "kötü" demek değil (başkası yazıyordur). Öğrenme için güvenilir değil.
- **Oy düğmeleri.** "Bunun gibi daha çok / az" yazısı beğenilmedi; global örnekler (Netflix, YouTube) incelendi, sadece simge (👍/👎) + sayı seçildi; açıklama üzerine gelince.
- **Seviye adları.** "Hemen yaz / Yazılabilir / Beklet" tutmadı; "Kaçırma / Değerlendir / Opsiyonel", "Sıcak / Ilık / Soğuk", "Manşet / Gündem / Kısa" seçenekleri konuşuldu; Enes "Öncelik 1/2/3"ü seçti (yanlış anlaşılmaz).
- **100 sınırı.** Önce haberler eleniyordu; Enes "hepsini okusun ama limit aşmasın" dedi → fazlası sıraya girer, sonraki turlarda işlenir, okunan tekrar alınmaz.
- **Rehber ayrı bölüm.** "En iyi 10 kulaklık" tarzı listeler Türkiye'de çok okunuyor (Enes); haber değil ama kendi rehberimiz için fikir → ayrı bölüm, puanlanmaz.
- **Kopya kartlar tek kart.** "Hangisini istersin seç" yerine tek kart, diğer kaynaklar bağlantı; Enes beğendi.
- **Çeviri tarayıcıda.** Kota tasarrufu için başlık çevirisi ücretsiz Google çeviri ucuna taşındı; sunucudan o uca erişilemediği için tarayıcıda yapılıyor ve tarayıcıda saklanıyor.
- **Groq yedeği.** Ücretsiz; Gemini kotası dolunca etiketleme durmasın. Taslakta Gemini kalıyor (Türkçe yazımda daha iyi).
- **Altyapı uyarısı.** Enes: "Supabase kaynaklıysa ekip bilsin, bana yazmasın." Durum sayfası canlı okunur; küçük/izlenen olaylar gürültü olmasın diye gösterilmez.
- **Sistem Durumu sayfası.** Adı için "Sağlık", "Status", "Sistem Durumu" konuşuldu; tüm ekip görecek (sadece yöneticiler değil), geri bildirim verebilsinler. Yapılacaklarda.
- **Alan adı.** Uzun vadede en sağlıklısı alt adres (`studio.updated.com.tr`, Natro'da CNAME); ana sitenin (WordPress) yanında ayrı durur, taşıma gerekmez.
- **WordPress'e gönderim.** Taslak WordPress'e "taslak" olarak gider, yayına basma kararı editörde kalır; uygulama şifresini sahip oluşturur.
- **Açılış ekranı ve ikon.** Siyah kare istenmedi; telefonun kendi açılışı (Android 12+ ikonu dairede gösterir) ile uygulamanın açılışı aynı renk (#1B1D21) yapıldı ki geçiş görünmesin. Ana ekran ve sekme ikonu için UP işareti (küçük boyutta UPDATED yazısı okunmuyor). Sekme ikonu yuvarlak köşeli mavi (şeffaf siyah logo koyu temada kaybolur).
- **Sohbet devri.** Fatih'in sohbet geçmişini okumasına gerek yok: GitHub + Supabase sahipliği ve bu doküman yeterli; yeni sohbet "önce ARCHITECTURE.md" ile başlar.
- **Çalışma biçimi (Enes):** teknik değil; yapması gereken adımda sayfa açılıp önüne konur. Bir sorun/engel olunca hemen söylenir, sormadan karar değiştirilmez, kalıcı silme istemeden yapılmaz, şifre/anahtar asla Claude tarafından girilmez.
