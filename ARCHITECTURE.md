# Updated Stüdyo — Mimari Dokümanı

> **Bu doküman sistemin temelidir.** Updated üzerinde çalışan herkes (insan veya yapay zekâ), hangi sohbette veya oturumda olursa olsun, işe başlamadan önce bunu okur. Bir karar değişirse önce bu doküman güncellenir, sonra kod.

- Sürüm: 1 (12 Ekim 2026)
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
| Barındırma | **Karar bekliyor** (bkz. Açık kararlar) | |

Kaçınılmaz dış servisler: telefon bildirimleri Apple ve Google sunucularından geçer; iPhone dağıtımı Apple'a bağlıdır. Bunların dışında sistem hiçbir şirketin kapalı aracına bağlı değildir.

## 5. Modüllerin durumu

| Modül | Bugün nerede | Hedef | Durum |
|---|---|---|---|
| Ekip | Tek HTML dosyası, Supabase'e bağlı (eneshsahin.github.io/updated-panel/ekip) | Stüdyo modülü | Çalışıyor, taşınacak |
| Takvim | Ekip panelinin içinde | Ayrı modül + takvim aboneliği | Çalışıyor, genişletilecek |
| İçerik (post aracı) | Tek HTML dosyası (eneshsahin/updated-panel), girişsiz | Stüdyo modülü, ortak giriş, kayıtlı taslaklar, story boyutu | Taşınacak |
| Post otomasyonu | GitHub Actions + Telegram + Gemini (eneshsahin/updated-post-otomasyonu) | Supabase zamanlanmış işleri | Taşınacak |
| Triyaj | Google Apps Script + Sheets + Gemini | Supabase | Taşınacak (5 Kasım öncesi şartlı) |
| Marka Kiti | Dosyalar dağınık | Stüdyo modülü | Yapılacak |
| Kamera Simülatörü | Fikir | Stüdyo modülü | İleride |

## 6. Veri modeli (mevcut)

Supabase projesi: `updated-panel` (organizasyon: Updated, bölge: Frankfurt).

| Tablo | İçerik |
|---|---|
| `invites` | Davet listesi. Sadece buradaki e-postalar üye olabilir |
| `profiles` | Üyeler: ad, rol, çalıştığı yer, yönetici mi, e-posta bildirimi açık mı |
| `availability` | Kişi + gün: boş/dolu, saat, konum, gün notu |
| `jobs` | İşler: marka, kategori, tür, başlık, son gün, ambargo, durum, üstlenen, devir teklifi |
| `job_requests` | "Ben alırım" talepleri |
| `gear` | Ekipman: envanterde/yolda, kimde, iade/geliş tarihi |
| `events` | Etkinlik ve lansmanlar: kesin/tahmini |
| `notifications` | Kişiye özel bildirimler, e-posta gönderildi mi |
| `week_notes` | Kullanılmıyor (gün notuna geçildi), kaldırılabilir |

Sunucu işleri:
- `notify-email` (Edge Function): yeni bildirimleri e-posta olarak gönderir. Şu an gönderen Enes'in Gmail'i (uygulama şifresi Supabase Secrets'ta).
- Zamanlanmış: pazartesi 09:00 müsaitlik hatırlatması, her gün 09:05 yaklaşan etkinlik bildirimi.

Yeni modüller tablolarını bu modele ekler; aynı kişi bilgisi için ikinci bir tablo açılmaz, `profiles` kullanılır.

## 7. Klasör yapısı (hedef)

```
updated-studio/
├─ ARCHITECTURE.md        ← bu doküman
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

## 11. Açık kararlar

1. **Barındırma.** Depo gizli (private) olacaksa GitHub Pages ücretli plana geçmeyi gerektirir. Öneri: Cloudflare Pages (ücretsiz, gizli depoyla çalışır, alan adı bağlanır).
2. **Apple geliştirici hesabı:** alınacak mı, kimin adına? (Fatih ile görüşülecek)
3. **Alt adres:** `panel.updated.com.tr` (Natro erişimi gerekiyor)

## 12. Karar günlüğü

- **8 Ekim 2026:** Ekip paneli için Supabase seçildi; giriş davet listesiyle.
- **8 Ekim 2026:** E-posta bildirimi şimdilik Enes'in Gmail'inden; kurumsal adres gelince taşınacak.
- **12 Ekim 2026:** Tüm araçlar tek sistemde (Updated Stüdyo) toplanacak. Teknoloji: TypeScript + React + Vite + Supabase + Capacitor.
- **12 Ekim 2026:** iPhone uygulaması Apple hesabı kararına kadar ertelendi; kod tarafında iPhone'a hazır kurulacak.
- **12 Ekim 2026:** İç araçlar WordPress sitesinin içine gömülmeyecek; alt adres kullanılacak.
