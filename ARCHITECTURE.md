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
| Ekip | Stüdyo modülü (`src/modules/ekip`). Eski panel (eneshsahin.github.io/updated-panel/ekip) 14 Ekim'de kapatıldı, Stüdyo'ya yönlendiriyor | Stüdyo modülü | Taşındı |
| Takvim | Stüdyo modülü (`src/modules/takvim`) | + kişisel takvime abonelik | Taşındı (12 Ekim); abonelik yapılacak |
| İçerik (post aracı) | Stüdyo modülü (`src/modules/icerik`): **yeni editör** (19 Ekim, deneme; Post/Story/Reels kapağı, bulut kayıt). Eski araç `public/araclar/post/` "Eski araç" sekmesinde çerçeveyle açılıyor. Eski adres (eneshsahin.github.io/updated-panel) **açık kalıyor**: kayıtlı düzenler o adreste tarayıcıda duruyor, buluta taşınmadan kapatılırsa kaybolur | Kayıtlı düzenler bulutta (ekip ortak), story boyutu, otomasyondan gelen postlar | 1. aşama taşındı (12 Ekim) |
| Post otomasyonu | GitHub Actions + Telegram + Gemini (eneshsahin/updated-post-otomasyonu), çalışıyor | Supabase zamanlanmış işleri; Telegram botu ekip grubunda | Taşınacak |
| Haber Masası (Triyaj) | Stüdyo modülü (`src/modules/haber-masasi`) + `triyaj-topla`, `triyaj-taslak` işleri. Eski Google Sheets/Apps Script sistemi 13 Ekim'de kapatıldı (tetikleyici silindi, tablo arşiv) | WordPress'e taslak gönderme | Çalışıyor |
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
| `tr_drafts` | Stüdyo içinde düzenlenen haber taslakları (SEO paketi dahil); otomatik mi (`auto`), WordPress yazı numarası/bağlantısı/gönderim zamanı/hatası (`wp_*`) |
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
| Supabase (organizasyon "Updated") | Enes + Fatih (sahip) | — |
| GitHub | `updated-studio` organizasyonu (ücretsiz plan), sahip Enes + Fatih | — |
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

- **14 Ekim 2026 (8):** Güncelleme notları: her yayından sonra kullanıcı görmediği notları "Neler değişti" penceresinde bölüm bölüm okur (`public/yenilikler.json`, `src/shared/Yenilikler.tsx`; CLAUDE.md kural 11). Eski ekip paneli kapatıldı (Stüdyo'ya yönlendirme). Eski post aracı adresi ve post otomasyonu açık kalıyor (kayıtlar ve otomasyon henüz taşınmadı, kural 9). Dokümana bölüm 17 (yapay zekâya verilen talimatların tam özeti) ve 18 (bu doküman ne için) eklendi.
- **14 Ekim 2026 (9):** Fatih sahip yapılmaya başlandı (GitHub organizasyonu, eski depolar, Supabase, Stüdyo yöneticiliği). Yapılacaklara eklendi: post aracı kayıtlarının buluta taşınması (eski adres ancak sonra kapanır) ve post otomasyonunun Telegram botunun ekip grubuna alınması.
- **15 Ekim 2026:** **Otomatik taslak + WordPress'e gönderim** (Fatih). En güçlü haberler (Öncelik 1, puanı en yüksekten başlayarak) için taslak düğmeye basılmadan hazırlanır ve WordPress'e **taslak** olarak gider; yayına basma kararı editörde kalır. Günde en fazla 50. Haber ilk düştükten 30 dk sonra seçilir (diğer kaynaklar aynı karta birleşsin, puan otursun); söylentiler varsayılan olarak hariç; kaynağın tam metni alınamadıysa WordPress'e gönderilmez. Taslak, ilgi alanı haberle en çok eşleşen editöre atanır (eşitlikte o gün müsait olan, sonra elinde en az iş olan); eşleşen yoksa sahipsiz kalır. Atanan kişiye bildirim + e-posta. Kategori sadece sitede **var olan** kategorilerden seçilir (liste WordPress'ten okunur, yapay zekâ bu listeden seçer); etiketler önce sitede aranır, yoksa oluşturulur. Editör notları, sorular ve doğrulama listesi WordPress'e gitmez, Stüdyo'da kalır. WordPress'te editörün değiştirdiği taslağın üzerine yazılmaz. Bağlantı MCP değil WordPress REST API + Uygulama Şifresi (ayrı "Stüdyo" kullanıcısı, rolü Editör); şifre sadece Supabase Secrets'ta (`WP_URL`, `WP_USER`, `WP_APP_PASSWORD`). MCP sadece ileride Claude'un sohbetten WordPress'e erişmesi istenirse, ayrı ve isteğe bağlı. Öncelik puanının çekirdeği ekran ve sunucu ortak kullansın diye `supabase/functions/triyaj-taslak/puan.ts`'e taşındı (`oncelik.ts` oradan alır). Ayarlar: Haber Masası → Ayarlar → Otomatik taslak (kapalı başlar; WordPress bağlantısı doğrulanınca açılır). Kod: `triyaj-taslak` (seçim `secim.ts`; `{oto:true}` ile 10 dk'da bir `tr_oto_kick`), `wordpress.ts`, `gorsel.ts`, migration 0014.
- **16 Ekim 2026:** WordPress tarafı kontrol edildi (Fatih'in oturumuyla). WordPress 7.1.3, PHP 8.1, sunucu LiteSpeed (Natro). "Studyo" kullanıcısı (id 12, Editör) var, uygulama şifreleri açık; 18 kategori, 81 etiket. **Engel:** sunucu yetkilendirme üst bilgisini (Authorization) WordPress'e iletmiyor (Site Sağlığı: "Yetkilendirme üst bilgisi eksik"); kalıcı bağlantıları yeniden kaydetmek düzeltmedi. Bu düzelmeden uygulama şifresiyle giriş (Stüdyo da, MCP de) 401 alır. Çözüm: Natro dosya yöneticisinde `.htaccess`'in en üstüne `SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1` satırı (ya da Natro desteğine yaptırmak). Sitede SEO eklentisi yok: SEO başlığı/odak kelime WordPress'e yazılmaz, meta açıklama yazı özetine gider. **MCP kararı:** sitede Elementor/Angie ile gelen bir MCP sunucusu zaten var (`/wp-json/mcp/mcp-adapter-default-server`), ama yazı oluşturma yeteneği yok; buna karşılık PHP çalıştırma, dosya okuma, kod parçası yayınlama yetenekleri açık. Haber taslağına katkısı olmadığı ve riski yüksek olduğu için Claude Desktop'a bağlanmadı; taslaklar REST API ile gider.
- **16 Ekim 2026 (2):** WordPress bağlantısı çalıştı (Natro ModSecurity'yi bu site için kapattı; önceki "üst bilgi eksik" teşhisinin bir kısmı yanlış testtendi: Site Sağlığı testi isteğe deneme `Authorization` eklenmeden çağrılmıştı). **Otomatik taslak açıldı.** Eklenenler (Fatih): (1) **Öne çıkan görsel** otomatik: önce Wikimedia Commons'ta marka+ürün adıyla ürünün kendi fotoğrafı (sadece CC0/kamu malı/CC BY/CC BY-SA, yatay, ≥900 px), sonra Pexels/Pixabay (anahtar varsa); yapay zekâ adaylardan en doğrusunu seçer ya da hiçbirini seçmez; WordPress ortam kütüphanesine yüklenir, alt metin + yazar/kaynak/lisans altyazısı yazılır. Haber sitelerinin kendi görselleri (og:image) telif nedeniyle alınmaz; Unsplash API kuralları yüzünden yüklenmez. Yayına basma kararı yine editörde. (2) **Aynı haber tekrarı:** son 3 günde taslağı yazılmış ya da alınmış haberle aynı olay anahtarı veya aynı marka+ürün olan kartlar otomatik yazılmaz (Tesla Roadster 9 karta bölünmüştü). (3) **Kota beklemesi:** Gemini 429 verirse otomatik taslak 1 saat bekler. (4) Ayarlar'daki "Son çalışma" satırı işin sonucunu da yazar. Kod: `triyaj-taslak/gorsel.ts` (yeni), `secim.ts` (`ayniHaber`), `wordpress.ts` (`gorselYukle`). Görsel seçimi önce küçük modelle, kotası doluysa taslağı yazan modellerle yapılır; yapay zekâ hiç yanıt vermezse sadece açıklamasında marka+ürün adının bütün kelimeleri geçen Commons fotoğrafı kuralla seçilir (stok fotoğraf kuralla seçilmez).
- **16 Ekim 2026 (3):** (Fatih) Pexels artık yeni API anahtarı vermiyor; yerine **Openverse** eklendi (anahtarsız; Flickr, rawpixel vb. kaynaklardan sadece CC0/kamu malı/CC BY/CC BY-SA, yatay, büyük fotoğraf). Sıra: Commons (ürün adı) → Openverse (ürün adı, sonra konu) → Pexels/Pixabay (anahtar varsa). **Yapay zekâ yedeği:** Gemini modellerinin hepsi kota/servis hatası verirse aynı iş Groq'a yaptırılır (`GROQ_API_KEY`; modeller sırayla: llama-3.3-70b-versatile, openai/gpt-oss-120b, qwen/qwen3-32b, llama-3.1-8b-instant); taslağın `model` alanında `groq/...` görünür. Bu taslak yazımı, görsel seçimi ve kategori seçimi için geçerli. Sahipsiz otomatik taslaklar sorun değil: WordPress'te "Studyo" kullanıcısıyla açılır, hangi editörün alacağı WordPress'te düzenlenirken belirlenir. Natro, Authorization sorununu çözmek için ModSecurity'yi bu sitede tamamen kapattı; güvenlik için Natro'dan sadece ilgili kuralı muaf tutup ModSecurity'yi geri açması istenmeli (açılınca "Bağlantıyı dene" tekrar denenir).
- **16 Ekim 2026 (4):** **Yazım üslubu + insanlaştırma** (Fatih: "haberler bizim tarzımızla, Humanizer gibi"). Üslup kılavuzu `triyaj-taslak/uslup.ts`'te; updated.com.tr'deki son 40 yazı (özellikle Fatih'inkiler), Nerdesin Fatih YouTube kanalının 94 video başlığı ve 14 açıklaması, @nerdesinfatih Instagram gönderilerinden çıkarıldı (samimi ama bilgili ses, "kağıttan özellik okumak yok", iki parçalı başlık, somut ara başlıklar, kalın rakamlar, cümle içi doğal kaynak atfı, Türkiye bağlamı, ürün haberlerinde okura soru; birinci tekil deneyim anlatımı yasak). Taslak isteminin içine girer; Ayarlar → "Yazım üslubu"ndan değiştirilir (`tr_settings.yazim_uslubu`). Taslaktan sonra yapay zekâ izi (ör. "sonuç olarak", "devrim niteliğinde", uzun tire) kalırsa ikinci bir "insanlaştırma" geçişi bilgiye ve ara başlıklara dokunmadan yeniden ifade ettirir; kalanlar editör notuna yazılır. "Dikkat edilmesi gerekenler" artık metne değil editör notlarına gider. **Kaynak listesi** yazıya zaten girmiyordu; kaynak atfı cümle içinde. **Görsel altyazısı:** sadece CC BY / CC BY-SA'da (lisans zorunlu kılıyor); CC0, kamu malı, Pexels, Pixabay'de altyazı yok. **Resmi basın görseli** eklendi: haberin kaynaklarından biri markanın kendi sitesiyse (tr_press adresi ya da alan adında marka) o sayfanın paylaşım görseli aday olur ve önceliklidir. **Başka haber sitelerinin görselleri kullanılmıyor:** Fatih "filigransız olanları kullan" dedi; filigran olmaması kullanım izni anlamına gelmediği (çoğu ajans/yayın fotoğrafı) ve telif şikâyeti/yayından kaldırma riski olduğu için uygulanmadı.
- **16 Ekim 2026 (5):** (Fatih) Otomatik taslak hızlandı: haber düştükten **10 dk** sonra (30 yerine), eşik **55** (Öncelik 1 + Öncelik 2'nin üst yarısı; tek kaynaklı taze bir ürün duyurusu 60 puanla hemen girer), günde en fazla **100**. Her 10 dakikalık turda birbirinin tekrarı olmayan en fazla **2** haber aynı anda yazılır (`tur_basina`, Ayarlar'dan 1-3). Aynı olayın sonraki kartları (aynı olay anahtarı ya da aynı marka+ürün) yapay zekâya hiç gönderilmez, kota harcamaz: son 3 günde taslağı yazılmış, alınmış ya da şu an (son 30 dk) yazılmakta olan haberle aynıysa atlanır. Kota dolarsa Groq, o da dolarsa 1 saat bekleme (değişmedi).
- **16 Ekim 2026 (6):** (Fatih) Resmi basın görseli genişletildi; yazılım/uygulama haberlerinde Commons/Openverse'te fotoğraf çıkmıyordu (ör. Bluesky Attie). Resmi sayfa artık üç yoldan bulunur: (1) kaynaklardan biri markanın sitesiyse, (2) kaynak haberin içinde markanın kendi duyurusuna/bloguna verilen bağlantıdan (sosyal ağlar ve diğer haber siteleri hariç; alan adında marka ya da bağlantı metninde marka adı + blog/news/press yolu), (3) markanın basın sayfasında (tr_press) ürün/başlık kelimelerinden en az ikisini taşıyan duyurudan. O sayfanın og:image'ı aday olur (logo/varsayılan görseller elenir). Groq taslaklarına "Türkçesini gözden geçir" uyarısı eklenmedi (Fatih istemedi).
- **17 Ekim 2026:** (Fatih) Taslak gövdesi WordPress blok biçimiyle gider (`triyaj-taslak/html.ts`): paragraf ve listeler 16px (`GOVDE_PX`), ara başlıklar mavi (WordPress "vivid-cyan-blue" satır içi rengi). Biçim, sitede elle düzenlenmiş yazıdan (LG Display FLiPP) birebir alındı; taslak WordPress'te klasik blok yerine normal bloklar olarak açılır. Ekrandaki önizleme ve "HTML kopyala" da aynı çıktıyı kullanır.
- **17 Ekim 2026 (2):** Görsel teşhisi: Commons ve Openverse yanıt veriyor ("tamam") ama 0 aday dönüyordu. Openverse aramasında sıkı filtre (büyük + yatay + fotoğraf) sonuç vermezse filtreler sırayla gevşetilir, boyut/yön kodda denetlenir; Commons konu aramasıyla (aramalar[0]) ve Openverse ikinci konu aramasıyla da denenir. Alakasız adayları seçim adımı zaten eler. Görsel çıkmazsa "Görsel" bölümünde her aramanın sonuç/uygun sayısı yazar.
- **17 Ekim 2026 (3):** (Fatih'in "her taslak görselli gitsin" isteği) Teşhis sonuçları: Openverse sıkı filtreyle hep 0 dönüyor, art arda isteklerde zaman aşımına düşüyor → yalnız "fotoğraf" filtresi + filtresiz tek deneme. Resmi sayfalar (asus.com, xbox.com) açılıyor ama og:image yok → twitter:image, image_src ve JSON-LD "image" de okunur; istek kimliği "Mozilla/5.0 (compatible; UpdatedStudyo/1.0 ...)" biçimine alındı. Seçim kuralı: ürünün kendi fotoğrafı yoksa aynı ürün türünü ya da konuyu açıkça gösteren gerçekçi fotoğraf "temsili" olarak seçilir (başka markanın ürününü öne çıkaran fotoğraf hariç); editör yayından önce değiştirir.
- **18 Ekim 2026:** **Haber Masası büyük güncellemesi** (Fatih). Önce yedek alındı: kod `yedek/haber-masasi-2026-10-18` dalı, veritabanı `yedek_20261018` şeması (tr_* tabloları + zamanlanmış görev listesi, migration 0015). Değişenler:
  (1) **Yazım:** üsluba "ajans / haber sitesi dili" temeli eklendi (tarafsız, 5N1K ilk iki paragrafta) + Updated sesi. Özet değil haber: uzunluk malzemeye göre (az ise 250-350, zenginse 500-800 kelime), dolgu yok. Spot en fazla 210 karakter, TAM 3 ara başlık. Kaynak/referans site adı rutin olarak yazılmaz; sadece bilginin değerini belirliyorsa (resmi açıklama, sızıntının kaynağı). (16 Ekim'deki "cümle içi kaynak atfı" kuralının yerini aldı.)
  (2) **Kümedeki bütün kaynaklar okunur:** taslak asıl haber + en fazla 4 diğer kaynağın tam metniyle yazılır (önce 2 kaynaktı); kaynaklar farklı ayrıntı veriyorsa birleştirilir, çelişki editör notuna.
  (3) **Etiketler kaynak meta verisinden:** kaynak sitelerin `article:tag` / `news_keywords` / `keywords` etiketleri yapay zekâya aday olarak verilir.
  (4) **İç link:** sitemizin arşivinde (WordPress araması, yayındaki yazılar) marka/ürünle ilgili en fazla 6 yazı bulunur; yapay zekâ bağlam katıyorsa 1-2'sine cümle içinde bağlantı verir. Listede olmayan adres metinden silinir.
  (5) **Son kalite kontrolü** (yeni aşama, ayrı çağrı; `uslup.ts` `KONTROL_SISTEM`): taslak kaynak metinlere karşı denetlenir: rakamlar, özel adlar, kaynakta olmayan iddia, tutarsızlık, taraflılık, biçim; düzeltilmiş metin + sorunlar listesi döner ve aynı adımda insanlaştırılır (eski "insanlaştırma" adımı bunun içine alındı). Güvenlik: editör yorumu yeri duruyor, 2-4 ara başlık, metin %25'ten fazla kısalmamış; değilse ilk taslak korunur. Editör bu arada metni değiştirdiyse düzeltme uygulanmaz, notlara yazılır. Görsel seçimi ve (otomatikse) WordPress'e gönderim bu aşamada, kontrolden SONRA yapılır. Taslak `qc_state`: bekliyor → calisiyor → tamam/hata (migration 0016); başlatılamayan/yarıda kalan kontrolü otomatik tur 3-5 dk sonra devralır.
  (6) **Öncelik 10'luk ölçek + Türkiye ilgisi:** önem = puan ÷ 10 (1-10). Konunun Türkiye'deki genel ilgisi puana eklenir (`puan.ts` `KONU_ILGI`: telefon +10, yapay zeka +8, oyun +6, otomobil/bilgisayar/kamera +5 ... sektör −2, diğer −4). Seviyeler: Öncelik 1 = **ana sayfa adayı** (önem 8+), Öncelik 2 = **yayına değer** (5,5+; otomatik taslak varsayılan eşiği), Öncelik 3 = beklet. "Öncelik 1/2/3" adları korundu (Enes'in kararı), yanına önem yazılır. Ana sayfa adayı taslakta rozet + editör notu; sitede ana sayfaya alma kararı editörde.
  (7) **30 dakikada bir olay kümeleme** (`triyaj-topla` `{kumele:true}`, görev `triyaj-kumele`): son 48 saatteki kartlardan aynı olayı anlatanlar markadan bağımsız (başlık farklı olsa da) tek karta birleşir; dokunulmuş/taslaklı kart tutulur, dokunulmamışlar onun diğer kaynakları olur ve silinir. Az taslak, az kota. Yanlış birleşmeye karşı kümeleme taslak modeliyle (daha güçlü) yapılır ve her birleşme ortak marka ya da en az iki ortak anlamlı kelimeyle doğrulanır; aynı denetim toplama sırasındaki yapay zekâ eşleştirmesine de eklendi (ilk kümelemede 18 kart birleşti; havuzda eskiden kalma birkaç yanlış eşleşme görüldü, ör. el konsolu haberine bilim haberi). Taslak yazarken ilgisiz çıkan kaynak yok sayılır ve editöre yazılır.
  (8) **Görsel:** üzerinde yazı olan görsel (banner, afiş, yazı bindirmeli kart, kolaj, filigran, infografik, ekran görüntüsü) seçilmez; yapay zekâ adayların kendisini görerek seçer (Gemini'ye küçük kopyalar gider). Fotoğraf bulunamazsa **Flux** isteği sıraya girer: Fatih'in Mac'inde çevrimdışı FLUX.1-schnell (Apache 2.0) yazısız, gerçekçi görsel üretir, Stüdyo'ya yükler (`scripts/flux-isci`, Secrets `FLUX_TOKEN`, depo `haber-gorsel`); WordPress'teki taslağın öne çıkan görseli yoksa oraya da eklenir; altyazı "Görsel yapay zekâ ile üretilmiştir." Editör Taslaklar'dan elle de isteyebilir. **Telifli dış görsel kredi verilerek kullanılmaz:** kredi vermek kullanım izni sağlamaz; resmi basın görselleri (basına açık) "Görsel: Marka" kredisiyle kullanılmaya devam eder.
  (9) **Türkiye gündemi ve Türkçe kaynaklar:** Google Trends Türkiye RSS'i kaynak oldu: gündemdeki başlıkların altındaki haberler alınır, sadece teknoloji konuları kalır (siyaset/spor/magazin elenir, rakip teknoloji siteleri hiç alınmaz). X, Instagram ve Ekşi Sözlük'ün herkese açık, kurallarına uygun okuma yolu (API/RSS) olmadığı için doğrudan okunmuyor. Rakip olmayan güvenilir Türkçe kaynak: Anadolu Ajansı ve TRT Haber bilim-teknoloji, Samsung Newsroom Türkiye (çalışmayan kaynak Kaynaklar'da kapatılır).
- **18 Ekim 2026 (2):** (Fatih) **Telif: Türkiye'deki haber sitelerinden, basın bültenleri dışında haber metni ve görsel alınmaz.** Google Trends Türkiye artık haber üretmez, sadece **sinyal**: gündem terimleri `tr_settings.gundem`'de 24 saat tutulur; terim yabancı kaynaklı bir kartta geçiyorsa karta `trend` yazılır ve öncelik puanına **+10** ("gündemde: …") eklenir (`puan.ts` `EK.gundem`, migration 0017). Anadolu Ajansı ve TRT Haber kaynakları kapatıldı (Samsung Newsroom Türkiye basın bülteni olduğu için açık); bu sitelerden ve gündem üzerinden Türk haber sitelerinden gelmiş dokunulmamış kartlar "elendi"ye alındı (geri alınabilir). Taslak yazarken kartın diğer kaynakları arasında Türk haber sitesi varsa okunmaz. AA kaynaklı bir otomatik taslak (18 Ekim gece, WordPress'te taslak) Fatih'in kararına bırakıldı. **Kümeleme "emin olmadan birleştirme" kuralıyla yeniden yazıldı:** üç kapı birden: (1) gömme (embedding) benzerliği eşiğin üstünde (model ve eşik aşağıda), (2) yapay zekâ o çifti tek tek değerlendirip "kesinlikle aynı olay" der (aynı ürünün tanıtımı ile fiyatı, sızıntı ile resmi duyuru ayrı sayılır), (3) ortak marka ya da en az iki ortak kelime. Zincirleme yok: kart ancak tutulan kartla doğrudan onaylıysa katılır. Gömme alınamazsa birleştirme yapılmaz. Toplama sırasındaki bağlama (aynı olay kimliği ya da yapay zekâ eşleştirmesi) ve aynı turda aynı kimliği alan haberler de gömme benzerliği ≥ 0,82 şartına bağlandı. Eşikler `triyaj-topla` `BENZERLIK_KUME` / `BENZERLIK_BAGLA`; "Son kümeleme" özetinde aday çift, onaylanan ve birleşenlerin en düşük benzerliği yazar. İlk denemede `gemini-embedding-001` kota (429; ücretsiz katmanda toplu istekteki her metin ayrı istek sayılıyor) ve `text-embedding-004` kaldırılmış (404) çıktı: `gemini-embedding-2` ve `-2-preview` da 429 verdi; Supabase'in kendi `gte-small` modeli denendi, fonksiyonun işlemci süresini aştı ("CPU Time exceeded"). Karar: tek model `gemini-embedding-001`, her çağrıda en fazla 40 metin (ücretsiz kotada her metin bir istek sayılıyor), her haberin vektörü bir kez hesaplanıp `tr_gomme` tablosunda (bağlantıya göre, 7 gün) saklanıyor (migration 0018); kümeleme eksik vektörleri turda 40'ar 40'ar doldurur, vektörü olmayan kart o tur birleşmez/bağlanmaz. Eşikler 0,86 (kümeleme) / 0,82 (bağlama); "Son kümeleme" özetindeki benzerlik dağılımına göre ayarlanacak.
- **19 Ekim 2026:** İki kişi aynı anda çalışıyor: Fatih Haber Masası'nda (#1-#23: otomatik taslak, WordPress'e gönderim, görsel, kümeleme, gömme), Enes İçerik modülünde. Çakışma kuralları ve iki Claude'un not panosu `ORTAK_CALISMA.md` (CLAUDE.md kural 12). İçerik modülünün durumu ve planı bölüm 19.
- **19 Ekim 2026 (2):** (Enes) **İçerik editörü Stüdyo'nun kendi kodu olarak yeniden yazıldı** (iframe'deki eski aracın taşınması yerine; şablonlar yeni marka kitiyle zaten yeniden tasarlanacağı için). Yapı: `motor.ts` (formatlar, tuval yardımcıları, dikey yerleşim: bloklar ölçülür, fotoğraf kalan alanı alır, sığmazsa yazı orantılı küçülür), `stiller.ts` (Cam / Dergi / Vizör / Fiş: renk, yazı, zemin, etiket, kart, fotoğraf çizimi; **yeni marka kiti sadece bu dosyayı değiştirir**), `sablonlar.ts` (7 yerleşim: haber kapağı, inceleme puanı, karşılaştırma, liste, yorum, madde slaytı, özet slaytı; her stil ve formatta çalışır). Formatlar: Post 1080×1350, Story 1080×1920 (güvenli alan üst 250 / alt 340), Reels kapağı 1080×1920 (ızgarada ortadaki 3:4). Önizleme odaklı arayüz: şablon/stil galerisi kullanıcının kendi metniyle canlı küçük önizleme; görsel önizlemede sürüklenir/yakınlaştırılır; slaytta sadece değiştirilen alanlar saklanır, gerisi şablonun örneği. Kayıt: `icerik_projeler` tablosu + `icerik` deposu (migration 0019; ekip ortak, silme oluşturan/yönetici), taslak ayrıca tarayıcıda. Eski kayıtların aktarımı yapılmayacak (şablonlar değiştiği için açılamaz); eski araç "Eski araç" sekmesinde, ekip geçince kapanır (kural 9).
- **19 Ekim 2026 (3):** (Enes) **İşler disiplini.** İş açma Yönetim'den Ekip → İşler'e taşındı (`ekip/IsFormu.tsx`). `jobs`'a öncelik (acil/yüksek/normal/düşük), aşama (alındı → çekim → kurgu → onay → yayında), yedek kişi, brief, teslim linki, aşama notu eklendi (migration 0020). Aşamayı sorumlu, yedek ya da yönetici `job_stage` ile ilerletir; "onay"a gelince yöneticilere bildirim; yönetici `complete_job` ile bitirir (aşama kendiliğinden "yayında") ya da notla düzeltme ister (sorumluya bildirim). Zorunlu alan sadece marka, başlık, son gün (fazla alan ekibi yavaşlatmasın diye). Sıralama: geciken → öncelik → son gün. Sorumlu seçilirse iş havuza düşmeden atanır.
- **19 Ekim 2026 (4):** (Enes) Ekip sohbeti üst bölüme, zilin yanına alındı (`src/shared/SohbetDugme.tsx`, aynı `tr_chat` kanalı, canlı; okunmamış sayısı tarayıcıda tutulan son görülme zamanına göre). Haber Masası'ndaki Sohbet sekmesine dokunulmadı (Fatih'in alanı); kaldırılıp kaldırılmayacağı ORTAK_CALISMA'da Fatih'e soruldu. Yönetim sayfasında iş formu yok; iş açma/düzenleme sadece Ekip → İşler'de.
- **19 Ekim 2026 (5):** E-posta gönderimi sunucudan bağımsız: `notify-email` SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD Secrets'ını okur (yoksa Gmail + GMAIL_APP_PASSWORD). Kurumsal adrese (Natro) geçiş kod değiştirmeden Secrets ile yapılır. Supabase ücretsiz planında otomatik yedek olmadığı teyit edildi; haftalık yedek özel depoda kurulacak. Fatih her hesapta sahip (Enes teyit etti).
- **19 Ekim 2026 (6):** (Enes) **İçerik: serbest düzen (katmanlar).** Eski araçtaki "her şey ayarlanabilir" esnekliği geri geldi ama karma yapıda: her şablon önce kendi otomatik yerleşimiyle açılır; "Serbest düzen" açılınca şablonun yerleştirdiği her blok (etiket, başlık, metin, görsel, kartlar, puan, tablo...) katman olur: taşı / boyutlandır / döndür / gizle / sırala. Zemin (arka plan, logo, alt yazı, Dergi/Vizör/Fiş fotoğrafı) katman değildir, sabit kalır (marka korunur). Veri: `Slayt.serbest[format] = { katman: {id: {x,y,s,r,gizli}}, sira }`, her format ayrı (Post'ta taşınan Story'yi bozmasın); şablon değişince sıfırlanır. Dönüşüm katmanın gerçek boyalı alanının merkezine göre (`sikiKutular`: küçük ölçekte çizip saydam olmayan pikselden bulunur, içerik değişmedikçe önbellekte); editör, PNG ve küçük önizleme aynı hesabı kullanır. Hizalama: tuvalin ortası/kenarları, güvenli alan kenarları, diğer katmanların kenar/ortası (8 ekran px mıknatıs, pembe çizgi); açı 15°'lere, boyut %100'e yapışır; güvenli alan dışına taşan katman turuncu uyarı. Görsele parlaklık/kontrast/doygunluk (`ctx.filter`; desteklemeyen tarayıcıda gizli) ve konum kaydırıcıları eklendi. Şablonların "sabit / esnek" diye ayrılması yerine hepsinde aç-kapa seçildi (Enes onayladı).
- **19 Ekim 2026 (7):** (Enes) **İçerik: eski araçtaki eksikler (A grubu).** Eski araç tarandı; eksikler 3 gruba ayrıldı (A şimdi, B marka kitiyle: 11 logo çeşidi + taşınabilir logo, stile özel parçalar (Fiş fiyat fişi, Vizör odak kutuları, Dergi künye/kapak satırları/iki sütun, VS rozeti ayrı katman), örnek görseller; C gerekmez: kayıtları dosyaya aktarma, tema düğmesi, `.updated.json`/`UPD1:` açma (siteden köprü gelince; o zamana kadar "Eski araç" sekmesi kalır)). A: (1) dokunulan öğenin kendi kartı sağda en üstte (`ALAN_KATMAN` katman → alan eşlemesi), (2) aç-kapa kalktı: sürüklemeye başlayınca serbest düzen kendiliğinden açılır, (3) fotoğraflı katmana ikinci dokunuş / "Fotoğrafı düzenle" = çerçeve içindeki fotoğraf (kaydır, büyüt, döndür: `Gorsel.r`); zemin fotoğrafı tek dokunuşla, (4) katman başına yazı boyutu `f` ve genişlik `g` (bloğun k ölçüsü ve sütun genişliği değişir, yazı yeniden dizilir; `sikiKutular` önbellek anahtarına girer), (5) ekip ortak "hazır düzenler" (`icerik_duzenler`, migration 0021; sadece yerleşim uygulanır, içerik korunur), (6) görsel yoksa görsel bloğu/alanı hiç yer kaplamaz (haber kapağı görselsizken büyük başlık alta yaslı; diğerleri ortalı). Düzenleyici seçim için serbest düzen kapalıyken de gerçek boyalı alanı hesaplar (`slaytCiz(..., siki=true)`).
- **20 Ekim 2026 (1):** (Enes) **Kayıt (log) hacmi düşürüldü.** Supabase ücretsiz plan "Log Ingestion" 1 GB sınırını aştı (2,25 GB). Ölçüm (son 24 saat): kaydın ~%90'ı `edge_logs` (API ağ geçidi), onun da neredeyse tamamı `triyaj-topla`'nın "görüldü mü" kontrolü: 200 bağlantılık listeler adres satırında (`GET ?link=in.(...)`) `tr_items` ve `tr_seen`'e soruluyordu; istek başına ~35-45 KB kayıt, günde ~7.500 istek, ~340 MB. Yerine tek RPC `tr_bilinen_linkler(text[])` (migration 0022, POST gövdesi, sadece service_role), 1000'lik parça; RPC hata verirse eski yola düşer (haber kaçmaz). Pro plan bunu çözmez (kayıt kotası Pro'da da 5 GB, sadece aşım faturalanır). Zaten alınmış kayıt silinerek kullanım düşmez; sayaç dönem başında sıfırlanır. Enes yaptırdı; Fatih'e ORTAK_CALISMA'da not var.
- **21 Ekim 2026 (marka kiti):** (Enes) Marka kiti 1.2 depoya eklendi: `public/marka/` (kurallar `makine/marka-kiti.md`, değerler `makine/tokens.json`, logo SVG ve 2048 PNG `logo/`, şablon örnekleri `sablon-ornekleri/`; Stüdyo → Marka Kiti sayfası buradan indirir). Kit tek kaynak; değer elle yazılmaz. Sol üst logo yatay logo oldu (`src/assets/logo-yatay.svg`, dar ekranda `logo-up.svg`); açılış ekranındaki UP işaretine dokunulmadı (Enes). Şablonları ekip kendisi düzenleyecek; kit editöre ek kaynak olarak girecek. Panel: Enes'in kararıyla **kitin renk ve yazı tipleri alındı, cam görünüm (yarı saydamlık, yuvarlak köşe) korundu** (kitin 12. bölümünden bilinçli sapma). `index.css`: açık zemin #F2F2F2, metin #171717 / #55585C, çizgi #E2E2E2, turuncu #FF6B1A (üstünde yazı siyah, `--on-orange`); koyu mod kit 12b tonları (#121212 / #1C1C1C / #262626 / #333333, metin #F2F2F2 / #B4B7BB); koyu modda mavi yazı için açık ton (#6A98F8) kaldı (kit mavi yazıyı koyuda yasaklıyor; okunurluk için geçici). Yazı: başlık Big Shoulders Display 900 büyük harf (h2; 20 px altı yasak olduğundan küçük başlıklar Plex Sans), metin/arayüz IBM Plex Sans, veri IBM Plex Mono, alıntı Newsreader. Yeşil/kırmızı/mor durum renkleri şimdilik kaldı (kit yasaklıyor; Haber Masası'nda anlam taşıyor, Enes Claude Design'a soracak). Editör şablonlarının yazı tipleri ayrı (eski fontlar onlar için yükleniyor). Marka Kiti sayfası (`src/modules/marka-kiti`) kit 1.2'yi gösterir.
- **21 Ekim 2026 (İçerik, akşam):** (Enes) (1) Telefonda önizleme: yalnız tuvalin yapışması "bozuk" görünüyordu; araç çubuğu + tuval + ipucu tek kart olarak üstte durur (`OnizlemeKutu.tsx`, iki editörde de), "Küçült" ile küçük hâle geçer (tercih tarayıcıda saklanır). (2) Yeni klasik şablon `seffaf` (grup "Şeffaf"): zemin boş, sadece logo + kategori etiketi; etiket marka kitine göre (Big Shoulders 900 büyük harf, köşe 0, renk kategoriden: son dakika turuncu, inceleme/karşılaştırma mavi, sızıntı siyah, rehber/sponsorlu gri). PNG alfa kanallı; SVG `klasik/seffafSvg.ts`: logo kitin SVG'sinden, yazı opentype.js ile yola çevrilir (font `@fontsource/big-shoulders-display` woff, latin + latin-ext; sadece SVG indirilirken yüklenir). (3) Klasik logo listesine kit 1.2 logoları eklendi (`kit-up-*`, `kit-yatay-*`, `public/marka/logo/svg/`); diğer şablonların varsayılan logosu değişmedi. Post / Story-Reels ayrımı hakkında: klasik motor yalnız 1080×1350; Story/Reels ayrı (yeni) motorda; birleştirme planı Enes'e soruldu.
- **24 Ekim 2026:** (Fatih) **Site yönetimi Stüdyo'ya taşınıyor ("C yolu").** Payload altyapı olarak kalır (veritabanı, kurallar, yayın → site derlemesi); ekran Stüdyo'nun `site` modülü olur. Bağlantı: Stüdyo isteğe `Authorization: Studyo <oturum anahtarı>` ekler, panel (site deposu `apps/cms/src/auth/studyo.ts`) anahtarı Supabase Auth'a sorar ve e-postadan kendi kullanıcısıyla eşleştirir; panelin rol ve yayın kuralları aynen geçerli, panel hesabı olmayan göremez. Aşamalar: (1) listeler + yayınla/yayından kaldır/incelemeye gönder, düzenleme panelde (24 Ekim) → (2) haber düzenleme Stüdyo'da (24 Ekim, yapıldı: metin editörü panelin Lexical 0.50 biçimiyle birebir, `src/modules/site/editor/dugumler.ts`; doğrulama `scripts/site-metin-dene.ts` bütün kayıtlı metinleri açıp kaydeder ve panelinkiyle karşılaştırır, 266/266 aynı; tanımadığı öğe olan metin açılmaz, panele yönlendirir) → (3) bütün bölümler Stüdyo'da (24 Ekim, yapıldı): panel `/api/studyo/alanlar` ile alan yapısını bildirir, Stüdyo genel formu (`Form.tsx`, `GenelListe.tsx`, `GenelDuzenle.tsx`) bundan çizer — panele eklenen alan Stüdyo'da kendiliğinden çıkar; iç alanlar (`_status`) gönderilmez, yayın durumu yalnız Yayınla/Yayından kaldır ile değişir; zengin metin doğrulaması 1.691/1.691 (sürümler, sayfalar, inceleme, Kulüp dahil). Kalan: tek giriş (Payload'un kendi paneline de Stüdyo hesabıyla girmek; ekip üyesini tek yerden eklemek). Payload'un kendi paneli yedek olarak açık kalır.
- **23 Ekim 2026 (6):** (Fatih) **Stüdyo ekranı da Natro'da; GitHub Pages bırakıldı.** `studio.updated.com.tr` → Natro VPS (Caddy). Sunucu 2 dakikada bir `main`'e bakar: değiştiyse ekranı derler (~40 sn, hata verirse eski sürüm kalır, son 5 sürüm saklanır) ve değişen fonksiyonları Natro'daki Supabase'e yükler. Veritabanı göçleri bilerek elle: `sudo updated-studyo-goc <dosya>` (uygulananlar `updated.studyo_gocler`). `yayin.yml`, `fonksiyonlar.yml`, `veritabani.yml` kaldırıldı. Kod: site deposu `deploy/altyapi/studyo`. Bu dosyadaki eski "Barındırma: GitHub Pages" satırları tarihsel.
- **23 Ekim 2026 (5):** (Fatih) Elle hazırlanan taslaklar da kalite kontrolü bitince panele kendiliğinden gönderilir (önce yalnız otomatik taslaklar gidiyordu, elle olanlar düğme bekliyordu). Ayar aynı (`OTO_VARSAYILAN.site`, Ayarlar'daki kutu); tam metni okunamayan taslak gönderilmez, uyarı yazar.
- **23 Ekim 2026 (4):** (Fatih) **Stüdyo'nun Supabase'i Natro'ya taşındı** ("her şey Natro'da, aracı olmasın"). Natro VPS'te Supabase'in açık kaynak sürümü yalın kurulu (site deposu `deploy/altyapi`: db, auth, rest, realtime, storage, functions, Envoy; yönetim ekranı yok). Adres `https://panel.updated.com.tr` (`/rest/v1`, `/auth/v1`, `/storage/v1`, `/realtime/v1`, `/functions/v1` Caddy ile), panel (Payload) ile aynı veritabanı sunucusu, ayrı şema. Taşıma: site deposu "Stüdyo taşıma (Natro)" iş akışı (`deneme` / `gecis`); veri, hesaplar (şifre özetiyle), kovalar, zamanlanmış işler (bulut adresleri fonksiyon sunucusuna çevrildi), Stüdyo tetikleyicileri ve depolama kuralları. Fonksiyon gizli bilgileri sunucuda `functions.env`; Gemini/Groq Fatih'in hesabı. JWT anahtarı yeni: herkes bir kez yeniden giriş yapar. `altyapi.tsx` artık kendi sunucunun sağlık kontrolü. Bulut projesi silinmedi (geri dönüş: `supabase.ts` eski adrese + bulut zamanlanmış işleri yeniden açılır). Supabase bağlantısı (connector) ve `fonksiyonlar.yml`/`veritabani.yml` buluta bakar; Natro için site deposundaki iş akışları kullanılır (GitHub → Forgejo aşamasında yenilenecek).
- **23 Ekim 2026 (3):** (Fatih) **WordPress devreden çıktı; taslaklar yeni sitenin paneline gider.** updated.com.tr 23 Ekim'de yeni sisteme (Astro + Payload) geçti. Haber Masası'nın otomatik ve elle gönderimi artık `triyaj-taslak/site.ts` → panel `POST /api/triyaj/import` (site deposu `apps/cms/src/endpoints/triyajImport.ts`); `wordpress.ts` kaldırıldı. Kurallar aynı: haber panelde "incelemede" taslak açılır, yayına panelde yayın yönetmeni basar; kategori yalnız paneldeki listeden (`/api/triyaj/durum`, 12 saat `tr_settings.site_kategoriler`), bulunamazsa Ayarlar'daki varsayılan, o da yoksa gönderilmez; etiketler panelde sayfa açmaz, en fazla 4 "varlık" olur (etiket yığılması sorunu kendiliğinden bitti, `ETIKET_IZINLI` kalktı); kaynaklar artık haberle gider (ilk satır birincil); panelde yayınlanmış ya da editörün değiştirdiği taslağın üzerine yazılmaz ("Üzerine yaz" hariç); Flux görseli sonradan `/api/triyaj/kapak` ile kapak olur; iç link adayları panelin herkese açık okuma ucundan. Anahtar `STUDIO_IMPORT_KEY` (Supabase Secrets; site deposundaki panel iş akışı sunucudaki değeri `SUPABASE_ACCESS_TOKEN` organizasyon secret'ıyla eşitler). Veritabanı: 0024 (`tr_drafts.site_*`; eski `wp_*` kolonları geçmiş için kalır), elle tetiklenen "Veritabanı göçü" iş akışıyla uygulanır. Otomatik taslak ayarı `wordpress` → `site` (eski değer okunur). PR'larda "Kontrol" iş akışı derleme + Edge Function tip denetimi yapar.
- **23 Ekim 2026 (2):** (Fatih) Otomatik taslakların editöre atanması duraklatıldı: uzmanlık alanları ve bölümler henüz belirlenmedi. `OTO_VARSAYILAN.ata = false`; taslak yine yazılır ama havuzda sahipsiz kalır, kimseye "sana atandı" bildirimi gitmez. Haber Masası → Ayarlar → Otomatik taslak'taki "Taslağı ilgi alanı en uygun editöre ata" kutusuyla yeniden açılır.
- **23 Ekim 2026:** (Fatih) Etiket yığılması: WordPress'te 1.725 etiketin 1.513'ü hiçbir yazıda yoktu (otomatik taslaklar bulunamayan her etiketi açıyordu). Karar: taslağa en fazla 3 etiket; yalnız sitede var olan ve en az 2 yazıda kullanılmış etiket ya da `triyaj-taslak/wordpress.ts` içindeki `ETIKET_IZINLI` listesindeki ad (marka, ürün ailesi, ana konu); liste dışında yeni etiket açılmaz. İstem 2-4 etiket ister. Edge Function'lar artık GitHub Actions'tan yayınlanır (`.github/workflows/fonksiyonlar.yml`, `supabase/functions/` değişince yalnız değişen fonksiyon; "Verify JWT" kapalı kalır; `SUPABASE_ACCESS_TOKEN` secret'ı gerekir, yoksa iş atlanır ve panelden elle yayın sürer).
- **22 Ekim 2026:** (Enes) Ekip sohbetinin "son görülme" zamanı hesapta: `profiles.chat_seen_at` + `sohbet_goruldu()` RPC (migration 0023; ilk kurulumda herkes için şimdiki zaman). Önceden sadece tarayıcıdaydı, başka cihazda bütün mesajlar okunmamış görünüyordu. `SohbetDugme` tarayıcıdaki ve hesaptaki zamandan yenisini alır. Klasik editörde logo seçimi en üste (şablon seçiminin altına) taşındı. Bumper (video logo) Marka Kiti sayfasına eklendi: `public/marka/video/` (asıl dosya ProRes 4444 saydam 1920×1080 4,5 sn; web için VP9 saydam WebM ve siyah zeminli MP4 ffmpeg ile üretildi; kapak PNG). Kitin md dosyasına (Claude Design'ın kaynağı) dokunulmadı.

- **21 Ekim 2026:** İçerik: Enes yeni editörde eskisinin özellikleri eksik dedi ("her şey birbirinden ayrı düzenlenebiliyordu"; "birebir tüm özellikler olsun, sonra şablonları arttıracağız"). Karar: ana editör yine eski post aracı (`public/araclar/post/`, kodu değiştirilmeden), sekme 1 "Post editörü". Tek ekleme: "Kayıtlı düzenler" Stüdyo içinde ekipte ortak (`icerik_duzenler`, `sablon = 'klasik:<şablon>'`, `serbest` = düzen; araç `window.parent.__studio.sb` ile Stüdyo oturumunu kullanır; tek başına açılırsa eskisi gibi tarayıcıda). Yerel kayıtlar ilk açılışta bir kez buluta aktarılır. Yeni editör (Story/Reels) ikinci sekmede kalıyor; yeni şablonlar ve formatlar eski motora eklenecek. E-posta panel linki `studio.updated.com.tr`.
- **21 Ekim 2026 (2):** Enes doğruladı: istenen, eski aracın özelliklerinin **yeni editöre** taşınmasıydı (iframe'le geri koymak değil). Yapılan: eski aracın çizim motoru birebir `src/modules/icerik/klasik/motor.js`'e alındı (şablonlar T, yardımcılar, gömülü logolar/örnek görseller; ölçüm/çizim kodu değiştirilmedi), arayüzü React ile `klasik/KlasikEditor.tsx`'te yeniden kuruldu (öğe kartları, yazı boyutu, görsel, çerçeve/fotoğraf, logo, katman sırası, ayar kaydırıcıları, önizlemede sürükleme, geri/ileri/tümünü geri al, içerik getir, sıfırla, kayıtlı düzenler ekipte ortak, dosyaya aktarma, otomasyon postu, PNG/paylaş). Yazılar eski araçla aynı anahtarda (`updated-post-araci-v4`) saklanır. 29 şablonun çizimi eski araçla piksel karşılaştırmasında %0 fark. Inter ve IBM Plex Mono yazı tipleri Stüdyo'ya eklendi. Motor ~700 KB, sadece sekme açılınca yüklenir. Sekmeler: Post editörü (klasik) / Story-Reels / Story-Reels kayıtları / Eski araç (yedek; ekip onaylayınca kaldırılır). Sıradaki: yeni şablonlar ve Story/Reels boyutlarını bu motora eklemek, sonra iki editörü tek editörde birleştirmek.
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

`GEMINI_API_KEY` (Google AI Studio, ücretsiz kota), `GROQ_API_KEY` (Gemini kotası dolunca yedek, ücretsiz), `GMAIL_APP_PASSWORD` + `MAIL_FROM` (bildirim e-postaları, Enes'in Gmail'i), isteğe bağlı `UNSPLASH_ACCESS_KEY` / `PIXABAY_API_KEY` / `PEXELS_API_KEY` (taslakta stok görsel önerisi; şu an yok), `FLUX_TOKEN` (Fatih'in Mac'indeki Flux işçisi; aynı değer Mac'te `~/updated-flux/ayar.json`). Tarayıcıdaki "publishable" anahtar gizli değildir, kodda durur. Kural: şifre/anahtar asla koda ya da sohbete yazılmaz.

E-posta için (19 Ekim'den beri) `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` de okunur; yoksa Gmail ayarı (`smtp.gmail.com`, `GMAIL_APP_PASSWORD`) kullanılır. Kurumsal adres `studio@updated.com.tr` (Natro Xmail): `SMTP_HOST` = `mail.kurumsaleposta.com`, `SMTP_PORT` = `465` (SSL/TLS), kullanıcı adı tam e-posta adresi (Natro yardım sayfasından, 20 Ekim).

**Yapay zekâ anahtarını değiştirme (ör. Fatih'in kendi hesabına geçiş):**
1. Yeni anahtarı al: Gemini → https://aistudio.google.com/apikey (Create API key), Groq → https://console.groq.com/keys.
2. Supabase → Edge Functions → Secrets → `GEMINI_API_KEY` (ya da `GROQ_API_KEY`) → değeri yenisiyle değiştir → Save. Fonksiyonu yeniden yayınlamak gerekmez; bir sonraki çağrıda yeni anahtar kullanılır.
3. Sonra eski anahtarı eski hesaptan sil. Sıra önemli: önce yenisini koy, sonra eskisini sil (tersi olursa arada birkaç dakika haber toplanmaz; zararı yok, bir sonraki turda devam eder).
4. Kontrol: Haber Masası'nda üstte kota/yapay zekâ uyarısı çıkmıyorsa ve Ayarlar → "Son toplama" yeni bir saat gösteriyorsa çalışıyor. Hata varsa Supabase → Edge Functions → `triyaj-topla` → Logs.
Kota anahtarın sahibine göre işler: yeni hesapta ücretsiz kota sıfırdan başlar.

**Yedek:** Supabase ücretsiz planında otomatik yedek yoktur (Pro planda günlük). Günlük yedek özel depo `updated-studio/yedek`'te GitHub Actions ile alınır (şablon: `scripts/yedek/veritabani-yedegi.yml`; gizli bilgiler o deponun Secrets'ında: `SUPABASE_DB_URL` (Connect → Session pooler adresi, kopyalandığı gibi) + `SUPABASE_DB_PASSWORD` (veritabanı şifresi; şifre değişince sadece bu güncellenir)). Yedek sadece veritabanıdır; depolama dosyaları (profil fotoğrafları, İçerik görselleri) dahil değildir.

### 13.3 Sunucu fonksiyonları (supabase/functions)

| Fonksiyon | Ne yapar | Nasıl tetiklenir |
|---|---|---|
| `triyaj-topla` | Kaynaklardan haber toplar, yapay zekâyla etiketler, kurallarla eler, olayları gruplar | 15 dk'da bir zamanlanmış görev + "Haberleri şimdi topla" düğmesi |
| `triyaj-taslak` | Seçilen habere Türkçe taslak ya da çeviri yazar; otomatik taslak (en güçlü haber + editör seçimi); WordPress'e taslak gönderimi (`wordpress.ts`) | Karttaki "Taslak hazırla" / "Tekrar dene", taslaktaki "WordPress'e gönder", 10 dk'da bir zamanlanmış görev (`{oto:true}`) |
| `notify-email` | Bildirim e-postaları | Veritabanı tetikleyicileri |
| `triyaj-aktar` | Eski tablodan tek seferlik aktarım (kullanıldı, artık çalışmaz) | — |

**Yayınlama:** Supabase CLI kurulu değil. Fonksiyon kodu Supabase panelinde Edge Functions → fonksiyon → Code sekmesinde değiştirilip "Deploy updates" ile yayınlanır (Claude bunu kodu GitHub'daki son halinden alarak yapıyor). Uzun vadeli öneri: GitHub Actions + Supabase CLI ile otomatik yayın (bir `SUPABASE_ACCESS_TOKEN` gerekir, sahip oluşturur).
**Not:** Supabase arka plan işini ~150 sn'de öldürür. Taslak işi 115 sn bütçeyle çalışır; aşarsa hata yazar.

### 13.4 Zamanlanmış görevler (pg_cron)

| Ad | Ne zaman | Ne yapar |
|---|---|---|
| `triyaj-topla` | 15 dk'da bir | Haber toplama fonksiyonunu çağırır |
| `triyaj-oto-taslak` | 10 dk'da bir | Öncelik 1 haberden birine otomatik taslak yazdırır ve WordPress'e taslak gönderir (Ayarlar'dan kapatılabilir) |
| `triyaj-kumele` | Saatte iki kez (:01, :31) | Son 48 saatte birebir aynı olayı anlatan kartları tek kartta birleştirir (gömme benzerliği + çift çift yapay zekâ onayı + ortak kelime) |
| `triyaj-gomme-temizlik` | Her gece 03:45 TR | 7 günden eski haber vektörlerini (`tr_gomme`) siler |
| `triyaj-is-kurtar` | Dakikada bir | 2 dk'dır nabızsız taslak/çeviri işini "hata"ya çeker (kilit açılır, kartta "Tekrar dene") |
| `triyaj-temizlik` | Her gece 03:30 TR | Eski haberleri ve görülme kayıtlarını temizler |
| `haftalik-hatirlatma` | Pazar 19:00 TR | Ekibe haftalık hatırlatma e-postası |
| `etkinlik-hatirlatma` | Her gün 09:05 TR | Yaklaşan etkinlik hatırlatması |

Liste SQL Editor'da: `select jobname, schedule from cron.job;`

### 13.5 Veritabanı değişikliği

Yeni dosya `supabase/migrations/00NN_ad.sql`; Supabase → SQL Editor'da çalıştırılır. Eski dosyalar değiştirilmez. Silme içeren SQL'de Supabase onay ister; onaya sahip basar. Son çalışan: `0018_gomme_vektor.sql` (18 Ekim). `0019_icerik_projeler.sql`, `0020_is_disiplini.sql`, `0021_icerik_duzenler.sql` (19 Ekim, Supabase bağlantısıyla).

### 13.6 Bir şey bozulursa

| Belirti | Önce buna bak | Çözüm |
|---|---|---|
| Üstte "Altyapı sorunu (Supabase)" uyarısı | status.supabase.com | Bizden değil; beklenir, düzelince kendiliğinden geçer |
| Taslak "yazılıyor"da kalıyor | Karttaki kaynak etiketi (Altyapı / Yapay zekâ / Kaynak site) | 2 dk sonra kendiliğinden "Tekrar dene" çıkar. Sürekliyse: Supabase → triyaj-taslak → Logs |
| Yeni haber gelmiyor | Haber Masası üstündeki yapay zekâ uyarısı; Kaynaklar sekmesi | Kota dolduysa ertesi gün düzelir (Groq yedeği devreye girer). Kaynak bozuksa Kaynaklar'da kapat |
| "Yapay zekâ kotası doldu" | Google AI Studio kotası | Ertesi gün sıfırlanır; sürekliyse ücretli plan ya da toplama aralığını uzatmak |
| Site açılmıyor | GitHub → Actions son çalışma | Kırmızıysa son değişiklik geri alınır (`git revert`) |
| (23 Ekim 2026'ya kadar) WordPress'e gönderilmiyor | Taslaktaki kırmızı WordPress hatası; Ayarlar → "Bağlantıyı dene"; WordPress → Araçlar → Site Sağlığı'nda "Yetkilendirme üst bilgisi eksik" uyarısı | 401: uygulama şifresi yanlış ya da sunucu kimlik başlığını düşürüyor (16 Ekim'de durum buydu; `.htaccess` satırı için karar günlüğüne bak). 403: Stüdyo kullanıcısının rolü yetmiyor (Editör olmalı). 404: REST API kapalı |
| Giriş e-postası / bildirim gelmiyor | Supabase Secrets'ta `SMTP_PASSWORD` (ya da eski `GMAIL_APP_PASSWORD`); `notify-email` → Logs | Posta kutusunun şifresi değiştiyse Secrets'ta güncellenir |
| Veritabanı bozuldu / veri silindi | `updated-studio/yedek` deposunda son yedeğin tarihi (`yedek/SON_YEDEK.txt`) | Supabase SQL Editor'da sırayla `roller.sql`, `sema.sql`, `veri.sql` (yeni/boş projeye). Mevcut projeye yazmadan önce mutlaka Fatih karar verir |
| Yedek alınmıyor | yedek deposu → Actions → son çalışma kırmızı mı | Genelde veritabanı şifresi değişmiştir: yedek deposunda `SUPABASE_DB_PASSWORD` güncellenir |
| Supabase projesi "paused" | Supabase paneli | "Restore" (ücretsiz plan uzun kullanılmazsa duraklatır) |
| Yapay zekâ anahtarını başka hesaba almak | 13.2 "Yapay zekâ anahtarını değiştirme" | Secrets'ta değer değişir, kod değişmez |

### 13.7 Haber Masası özeti

Toplama (15 dk): son 24 saat, kaynak başına 10, tur başına en fazla 100 haber, fazlası sıraya girer. Yapay zekâ sadece etiket çıkarır, kararı kurallar verir (hariç marka, kampanya → elenir; rehber/liste → "Rehber fikirleri"; Türkiye'de yok ve Öncelikli değil → elenir; belirsiz → Belirsiz). Aynı olay tek kartta, diğer kaynaklar bağlantı. Elenen başlıklar Türkçe görünür, "Havuza al" ile geri alınır. Öncelik: Öncelik 1 (≥70) / 2 (≥40) / 3; puan haber türü + kaynak sayısı + tazelik; ekip oyu (👍/👎) sadece aynı marka içinde etkili; aynı markadan art arda en fazla 2. Sıralama: öncelik puanı / öncelik grubu içinde yeni→eski / haber saati / sisteme düşme saati. Taslak: Gemini (3.8 → 3.6 → 3.5 flash), iki kaynak, SEO, editöre sorular, doğrulama, görsel önerisi; hazırlayan haberi alır. Taslak "WordPress'e gönder" ile siteye taslak olarak gider (kategori sitedekilerden, etiketler eşleşir ya da açılır). Önem 10'luk (puan ÷ 10); Öncelik 1 ≥ 80 ana sayfa adayı, Öncelik 2 ≥ 55 yayına değer; konu Türkiye ilgisine göre ek puan alır. Taslak kümedeki bütün kaynaklarla yazılır, ayrı çağrıda son kalite kontrolünden geçer (doğrulama + insanlaştırma), sonra görsel (yazısız; yoksa Flux) ve WordPress. 30 dk'da bir aynı olay kartları birleşir. Otomatik taslak: eşik 55 (önem 5,5), 10 dk bekleme, turda en fazla 2 farklı haber, günde en fazla 100, aynı haberin diğer kartları atlanır, ilgi alanına göre editör. Kurallar: eleme `supabase/functions/triyaj-topla/index.ts`, puan `supabase/functions/triyaj-taslak/puan.ts` (ekran `oncelik.ts` üzerinden kullanır).

### 13.8 Ekip geri bildirimleri (karşılananlar)

Taslak/Tekrar dene çalışmıyordu → düzeltildi (14 Ekim). Haber saatine ve sisteme düşme saatine göre yeniden eskiye sıralama → eklendi. Öncelik grubu içinde zamana göre sıralama → eklendi. Kopya kartlar → tek kartta birleşiyor. Elenenler İngilizceydi → Türkçe. Bildirimler altta ve beyaz zeminliydi → üstte, cam görünüm. Mobil menü (dock) bozuktu → düzeltildi; dokununca mavi kare kalktı.

### 13.9 Haber Masası yol haritası (Fatih, 18 Ekim; sıra yeniden düzenlendi)

1. ✔ Yedek (kod dalı + veritabanı şeması). 2. ✔ Ajans dili + Updated üslubu, uzunluk, spot 210, 3 ara başlık, kaynak adı sadece gerekiyorsa. 3. ✔ Kümedeki bütün kaynaklar + 30 dk'da bir kümeleme. 4. ✔ Son kalite kontrolü (doğrulama + insanlaştırma). 5. ✔ 10'luk önem, Türkiye ilgisi, yayın (5,5) ve ana sayfa (8) eşiği. 6. ✔ İç link (sitemizin arşivi). 7. ✔ Kaynak meta etiketleri. 8. ✔ Yazılı banner/afiş görsel yasağı + görerek seçim. 9. ◐ Flux (Mac'te çevrimdışı): kod ve kuyruk hazır; Mac'e kurulum ve `FLUX_TOKEN` bekliyor. 10. ◐ Türkiye gündemi (Google Trends TR) + Türkçe kaynaklar: eklendi, ilk turlarda sağlıkları izlenecek. 11. Açık: X/Instagram/Ekşi Sözlük (resmi erişim yolu yok; ücretli API ya da elle takip kararı Fatih'te). 12. Öneri: ana sayfa adayı haberlerin WordPress'te otomatik "Öne çıkan" (sticky) yapılması; şimdilik sadece rozet + not.

### 13.10 Yapılacaklar (14 Ekim itibarıyla, sırayla)

1. **Fatih'i sahip yapmak** (Enes 14 Ekim'de dört daveti de gönderdi; Fatih'in kabul etmesi ve Stüdyo'da hesap oluşturması bekleniyor; Fatih'in Gmail adresi Enes'te, depo herkese açık olduğu için buraya yazılmaz):
   a. GitHub `updated-studio` organizasyonuna Owner olarak davet.
   b. Enes'in kişisel hesabındaki eski depolara (`eneshsahin/updated-panel`, `eneshsahin/updated-post-otomasyonu`) Collaborator. **Şimdi organizasyona taşınmıyor:** `updated-panel` taşınırsa adresi `eneshsahin.github.io` → `updated-studio.github.io` olur ve eski post aracındaki tarayıcı kayıtları (adrese bağlı) kaybolur; GitHub eski adresi yönlendirmez. `updated-post-otomasyonu` zaten Supabase'e taşınacağı için çalışan otomasyonu taşıma riskine sokmaya değmez. İkisi de taşıma işleri bitince ya arşivlenir ya da organizasyona alınır.
   c. Supabase "Updated" organizasyonuna Owner olarak davet.
   d. Stüdyo: davet listesine e-posta → Fatih kayıt olur → Yönetim'de yönetici yapılır.
2. Devir paketi: hesap listesi (hangi hesap kimin e-postasında, kurtarma), Google AI Studio (Gemini) ve Groq anahtarlarının sahibi, Natro erişimi.
3. **Post aracı kayıtlarını buluta taşımak.** Bugün kayıtlı düzenler herkesin kendi tarayıcısında, eski adreste (eneshsahin.github.io/updated-panel) duruyor. Plan: Stüdyo'daki post aracına "eski kayıtlarımı aktar" adımı (eski adreste dışa aktar → Stüdyo'da içe al) ve kayıtların Supabase'te ekip ortak tutulması. Bu bitip ekip aktardıktan sonra eski post aracı adresi kapatılır (yönlendirme sayfası). O zamana kadar açık kalır (kural 9).
4. **Post otomasyonunu taşımak** (`eneshsahin/updated-post-otomasyonu`: GitHub Actions + Telegram botu + Gemini) Supabase zamanlanmış işlerine. Telegram botu **ekip grubuna** eklenecek: otomasyonun bildirimleri ve onayları tek kişiye değil gruba gelsin (Enes, 14 Ekim). Taşıma bitene kadar eski otomasyon çalışmaya devam eder.
5. Alan adı: `studio.updated.com.tr` (Natro CNAME; sonra GitHub Pages özel alan adı, Supabase Auth izinli adresler, e-postalardaki panel adresi).
6. Sistem Durumu sayfası (tüm ekip görür): yapay zekâ/kota, son toplama, kaynak sağlığı (Kaynaklar'dan taşınır), zamanlanmış görevler, anahtar var/yok.
7. Kopya kart birleştirmesinin geçmiş haberler için tamamlanması (kaynak sınırına takıldı).
8. WordPress'e taslak gönderme + otomatik taslak: yayında (16 Ekim; ekran, `triyaj-taslak`, migration 0014, Secrets `WP_URL`/`WP_USER`/`WP_APP_PASSWORD` tamam; otomatik taslak kapalı). 16 Ekim'de bağlantı doğrulandı ve otomatik taslak açıldı; öne çıkan görsel eklendi. İsteğe bağlı: `PEXELS_API_KEY` / `PIXABAY_API_KEY` (Commons'ta ürün fotoğrafı yoksa yedek). WordPress'teki "Yetkilendirme üst bilgisi" Code Snippets kodu: kapatılırsa bağlantıyı tekrar dene; çalışıyorsa kapalı kalsın.
9. Takvim aboneliği + davet e-postası; format sistemi (Post 4:5 / Story 9:16 / Reels kapağı).
10. Kurumsal e-posta, telefon bildirimi, Android uygulaması.
11. Yeni kaynaklar: Asya sızıntı siteleri, resmi basın sayfaları, Türkiye kaynakları (Webtekno, LOG, ShiftDelete ~50'şer haber incelendi).
12. Fonksiyonların GitHub'dan otomatik yayını (13.3).
13. Yeni marka kiti gelince: `assets/marka/` güncellenir, `python3 scripts/ikonlar.py`, Marka Kiti modülüne logolar.

### 13.11 Marka ve ikonlar

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

## 17. Yapay zekâya ve sisteme verdiğimiz talimatlar (Haber Masası)

Asıl metinler kodda durur; burada ne söylediğimizin tam özeti var. Değiştirirken CLAUDE.md kural 10'a uyulur.

**1. Toplama ve ön eleme** (`triyaj-topla`, yapay zekâdan önce, ücretsiz)
- Son 24 saatteki haberler; kaynak başına tur başına en fazla 10; daha önce görülen link tekrar alınmaz.
- Gürültü kelimeleri (Ayarlar'dan düzenlenir): başlık + özette geçerse "Reklam / gürültü" diye elenir.
- Turda en fazla 100 haber yapay zekâya gider, fazlası sıraya girer (en yeniler önce).

**2. Etiketleme talimatı** (yapay zekâ puan vermez, karar vermez, sadece etiket çıkarır)
- marka, ürün; tür: resmi / sızıntı / söylenti / inceleme / sektör / kampanya / rehber / diğer.
- haber tipi (puanı bu belirler): Ürün duyurusu, Türkiye fiyatı, Lansman tarihi, Güçlü sızıntı, Önemli güncelleme, Şirket ve sektör, Söylenti, İnceleme ve test, Küçük güncelleme, Diğer.
- konu: telefon, tablet, bilgisayar, bileşen, giyilebilir, ses, kamera, drone, video ekipmanı, ev aletleri, akıllı ev, oyun, yapay zeka, yazılım, otomobil, sektör, eğlence, diğer.
- Türkiye: var (Türkiye'de satılıyor/kullanılıyor ya da küresel önemde) / yok (başka ülkeye özel) / global (Türkiye'de yok ama dünya çapında ilgi çekici yenilik) / belirsiz.
- asıl kaynak (ör. "Mark Gurman / Bloomberg"), olay kimliği (aynı olaya aynı kimlik), en fazla 15 kelimelik Türkçe özet.
- Sadece JSON döner; başka bir şey yazmaz.

**3. Kurallar (kararı bunlar verir)**
- Hariç marka listesinde → elenir. Tür kampanya → elenir. Tür rehber → "Rehber fikirleri".
- Türkiye "yok" ve marka Öncelikli değil → elenir; Öncelikli ise kalır ama puanı −16.
- Türkiye "belirsiz" → Belirsiz bölümü (ekip karar verir).
- Kalanlar Havuz'a. Marka grupları (Öncelikli / normal / Hariç) Ayarlar'dan düzenlenir.

**4. Aynı haber eşleştirme**
- 48 saat içinde aynı olay kimliği → aynı kart.
- Ayrıca yapay zekâya "bu yeni haber mevcut kartlardan biriyle birebir aynı olay mı?" sorulur: aynı marka ya da benzer konu yetmez, olay aynı olmalı, emin değilse "hayır".

**5. Öncelik puanı** (`oncelik.ts`, yapay zekâ değil)
- Haber tipine göre taban puan + her ek kaynak +8 (en fazla +24) + tazelik (3 saatten yeni +20, 12 saat +12, 24 saat +6) − Türkiye zayıf 16.
- Öncelik 1 ≥ 70, Öncelik 2 ≥ 40, altı Öncelik 3. Kartta gerekçe yazar; "Öncelik nasıl hesaplanır?" ekranda.
- Ekip oyu: her 👍/👎 aynı marka + tür haberlerine ±6 (en fazla ±18, son 60 gün). Aynı markadan art arda en fazla 2 haber.

**6. Taslak talimatı** (`triyaj-taslak`, 18 Ekim 2026 itibarıyla)
- Rol: Updated'ın haber editörü; kümedeki bütün kaynaklardan (asıl + en fazla 4) yayına hazırlanacak Türkçe haber. Üslup `uslup.ts`: ajans/haber sitesi dili temeli + Updated/Nerdesin Fatih sesi.
- Çeviri yapma, kendi cümlelerinle; ters piramit; TAM 3 ara başlık; spot ≤210 karakter; uzunluk malzemeye göre (250-350 / 500-800 kelime), özet değil, dolgu yok.
- Başlık iki parçalı, her iddiası kaynakta; abartı ve tık tuzağı yok. Kaynak site adı rutin yazılmaz, sadece bilginin değerini belirliyorsa.
- Doğrulanmamış bilgi "iddiaya göre / sızıntıya göre". Fiyat kaynaktaki para biriminde. **Kaynakta olmayan bilgi eklenmez**; çelişki editör notuna.
- Etiketler önce kaynak sitelerin meta etiketlerinden; iç link sadece sitemizin arşivinden verilen listeden, 1-2 adet.
- Editöre sorular, doğrulama listesi, dikkat notları (metne girmez), görsel önerisi (Flux istemi: gerçekçi, yazısız, logosuz), SEO, sona "[EDİTÖR YORUMU]".
- **Son kalite kontrolü** (`KONTROL_SISTEM`, ayrı çağrı): rakamlar, özel adlar, kaynakta olmayan iddia, tutarsızlık, taraflılık, biçim, yapay zekâ izi → düzeltilmiş metin + sorunlar listesi (Stüdyo'da "Kalite kontrolünün bulduğu").
- Görsel seçimi: yapay zekâ adayları görerek seçer; üzerinde yazı olan banner/afiş/kolaj/filigran/ekran görüntüsü seçilmez; yoksa Flux.

**7. Çeviri talimatı:** paragraf yapısını koruyarak eksiksiz, sadık çeviri; yorum, özet, ekleme yok.

**8. Ekibin ayarlayabildikleri (Haber Masası → Ayarlar / Kaynaklar):** kaynak listesi (aç/kapat), marka grupları (Öncelikli / Hariç), gürültü kelimeleri, saklama süresi (varsayılan 3 gün), taslak modeli.

## 18. Bu doküman ne için

İlk kez bakan biri (Fatih, yeni bir ekip üyesi ya da yeni bir Claude sohbeti) sohbet geçmişine ihtiyaç duymadan sistemi anlayıp devralabilsin diye. Okuma sırası: 1-2 (amaç, kurallar) → 14 (nasıl çalışır) → 13 (her şey nerede, arıza tablosu) → 16 (neden böyle) → 12 (karar günlüğü, en yenisi altta). Her mimari karar önce buraya yazılır; Claude Project'teki `claude/ARCHITECTURE.md` kopyası aynı anda güncellenir.

## 19. İçerik modülü: bugünkü durum ve plan (Enes, 19 Ekim'de başlıyor)

**Planlanan (19 Ekim, Enes): siteden otomatik post.** Sitede yayınlanan her yazı İçerik'e "Siteden gelenler" olarak kendiliğinden düşer; yazının türüne göre (kategori/etiket: haber → Haber kapağı, inceleme → İnceleme puanı, karşılaştırma → Karşılaştırma, liste → Liste) şablon seçilir, başlık / alt metin / öne çıkan görsel alanlara yerleşir, ekip bakıp indirir ya da düzenler. Kaynak WordPress'in herkese açık yazı listesi; Haber Masası'na dokunmaz. Instagram'a otomatik paylaşım ayrı bir adım (Meta işletme hesabı ve uygulama onayı gerekir), şimdilik "paylaşıma hazır PNG". Marka kiti şablonlarından sonra; mevcut Telegram post otomasyonunun yerine geçer (Enes 19 Ekim: JSON/Telegram adımı kalkar). Yazıyı yazan üyeye İşler'de iş açılır ve bildirim gider (tasarım işe bağlı, onay İşler'in onay akışıyla); yazar eşleşmesi önce `tr_drafts.wp_post_id` → taslağı gönderen üye, yoksa WordPress yazar ↔ üye eşleştirme tablosu.

**21 Ekim güncellemesi:** Ana editör tekrar eski post aracı (aşağıdaki özellik listesi korunacak asgari çizgidir). Özellikler: 29 şablon / 4 aile (Cam, Dergi, Vizör, Fiş); her şablonda alanlar (uzunluk sınırı, yazı boyutu aralığı) ve görseller (açıklamalı); 12 logo seçeneği (UP / UPDATED dolu-çizgili / kare rozet, beyaz-siyah-mavi); önizlemede parça seçip taşıma, boyut, açı; katman sırası; zemin katmanı; her yazının boyutu; etiket/değer yazı boyutu; fotoğraf boyutu, yatay, dikey, açı; görseli kaldırma; geri al / yeniden yap / tümünü geri al; önceki şablonun içeriğini getir; şablonu ve tüm şablonları sıfırla (onaylı); kayıtlı düzenler (kaydet, düzeni uygula, içerikle aç, sil; ekipte ortak); kayıtları dosyaya dışa/içe aktarma; otomasyondan gelen postu açma (.updated.json, tüm slaytlar + fotoğraf; ya da UPD1: kodu); PNG indirme, telefonda paylaşım; açık/koyu tema; yazılar tarayıcıda otomatik saklanır.

**Bugün ne var (19 Ekim).** `src/modules/icerik/Icerik.tsx` sadece bir çerçeve: eski post aracını (`public/araclar/post/index.html`, ~750 KB tek dosya; yazı tipleri ve örnek görseller içine gömülü) olduğu gibi Stüdyo içinde açıyor. Araç tuval (canvas) üzerinde çiziyor, çıktı **sadece 1080×1350 (4:5)**. Şablonlar dört stil ailesinde: **Cam** (8), **Dergi** (7), **Vizör** (7), **Fiş** (3); her ailede haber kapağı, karşılaştırma, inceleme puanı, tek post (yorum / liste), kaydırmalı (özet ve madde slaytı). Kişinin yazdıkları ve "düzeni kaydet" kayıtları **tarayıcıda (localStorage)** duruyor; ekip arasında paylaşılmıyor, cihaz değişince kayboluyor. Aynı aracın eski kopyası eski adreste (eneshsahin.github.io/updated-panel) hâlâ açık ve ekibin eski kayıtları orada.

**Planlanan (öncelik sırası Enes'le netleşecek).**
1. Kayıtlı düzenler ve taslaklar Supabase'te, ekip ortak (kim kaydetti, ne zaman); eski adresteki kayıtlar için "dışa aktar → Stüdyo'da içe al" adımı. Bu bitince eski adres kapanır (yönlendirme).
2. Format sistemi: Post 4:5 (1080×1350), Story 9:16 (1080×1920), Reels kapağı 9:16 (profil ızgarasında 3:4 güvenli alan). Şablonlar oran ve güvenli alanla tanımlanır; format değişince sadece çerçeve değişir. Story'de kaydırmalı şablon yok.
3. Aracın Stüdyo'ya gerçek modül olarak taşınması (çerçeve yerine React bileşenleri, ortak tasarım değişkenleri); bu büyük iş, aşama aşama ve eski araç çalışırken yapılır (kural 9).
4. Haber Masası'ndan "bu habere post hazırla" (başlık, spot, görsel karta dolar) — Fatih'in alanıyla kesişir, önce ORTAK_CALISMA.md'ye not.
5. Post otomasyonunun (`eneshsahin/updated-post-otomasyonu`: GitHub Actions + Telegram + Gemini) Supabase'e taşınması; Telegram botu ekip grubuna.
6. Yeni marka kiti gelince şablonlarda yeni logo/renkler.

**Yeni sohbete geçerken:** "Önce ARCHITECTURE.md'yi ve ORTAK_CALISMA.md'yi oku; İçerik modülü üzerinde çalışacağız, Fatih aynı anda Haber Masası'nda çalışıyor." Bu bölüm ve 13.9 yapılacaklar, kaldığımız yeri anlatır.
