# Ortak çalışma: iki kişi, iki Claude, tek depo

Bu depoda aynı anda iki kişi çalışıyor; ikisi de kendi Claude sohbetiyle. Bu dosya o iki Claude'un birbirine bıraktığı nottur. **Her oturumda ARCHITECTURE.md'den hemen sonra okunur** (CLAUDE.md kural 12).

## Kim, nerede çalışıyor (19 Ekim 2026)

| Kişi | Rol | Şu an üzerinde çalıştığı yer |
|---|---|---|
| **Fatih** | Projenin lideri, her hesapta sahip (GitHub `updated-studio`, Supabase "Updated", Stüdyo yöneticisi) | Haber Masası: `src/modules/haber-masasi/`, `supabase/functions/triyaj-topla/`, `supabase/functions/triyaj-taslak/`, `scripts/flux-isci` |
| **Enes** | Kurucu ortak, her hesapta sahip; teknik değil (CLAUDE.md kural 8) | İçerik (Instagram post aracı): `src/modules/icerik/`, `public/araclar/post/`; ileride post otomasyonu |

İkisi de tam yetkili. Biri diğerinin alanında değişiklik yapacaksa önce bu dosyanın "Notlar" bölümüne yazar; acil değilse beklenir.

## Kurallar (iki Claude için de)

1. **İşe başlamadan önce `git pull`.** Uzun bir işte ara ara tekrar. Gönderimler küçük ve sık; Fatih tarafı PR ile birleştiriyor (#1, #2 ...), Enes tarafı da aynı şekilde ya da çakışma yoksa doğrudan `main`.
2. **Başkasının modülündeki dosyaya dokunma.** Gerekiyorsa en küçük değişikliği yap ve aşağıya not bırak.
3. **Veritabanı dosyası numarası:** yeni migration açmadan hemen önce `git pull` + `ls supabase/migrations` ile son numaraya bak, bir sonrakini al, hemen gönder. Aynı numara iki kez kullanılırsa sonradan gelen bir üst numaraya kaydırılır.
4. **Sunucu fonksiyonları:** Supabase panelinden yayınlanıyor; panelde ne varsa canlı odur. **Sadece kendi alanındaki fonksiyonu yayınla** ve her zaman GitHub'daki en son hâlinden. Haber Masası fonksiyonları (`triyaj-*`) Fatih'in; İçerik için fonksiyon gerekirse yeni, ayrı bir fonksiyon açılır (ör. `icerik-*`).
5. **Ortak dosyalar** (`ARCHITECTURE.md` karar günlüğü, `public/yenilikler.json`, `src/index.css`, `src/shared/*`, `src/App.tsx`, `src/modules/index.ts`): sadece ekle, var olanı değiştirme/silme. Çakışmada iki tarafın satırları da korunur. `yenilikler.json`'da her not ayrı `id` ile; aynı gün iki kişi not eklerse ikisi de kalır.
6. **Ortak renk/yazı tipi değişkenleri** (`src/index.css`) değişecekse önce not; ikisinin ekranını da etkiler.
7. Bir şey bozulursa ya da diğerinin işine dokunmak zorunda kalındıysa: aşağıya tarihli not + kullanıcıya hemen söylenir.

## Notlar (en yeni üstte; tarih · kimden · kime)

- **19 Ekim 2026 · Enes'in Claude'u → Fatih'in Claude'u:** `hafiza/GUNLUK.md` açıldı (CLAUDE.md kural 13): sohbetler arası çalışma günlüğü. Sen de kendi oturumlarının sonunda o günün başlığı altına "Fatih:" diye başlayan kısa kayıt eklersen iki taraf da neyin neden yapıldığını görür.

- **19 Ekim 2026 · Enes'in Claude'u → Fatih'in Claude'u:** Merhaba. Enes bu hafta İçerik modülünü (Instagram post aracı, `src/modules/icerik/` ve `public/araclar/post/`) geliştirecek; Haber Masası'na ve `triyaj-*` fonksiyonlarına dokunmayacağız. Senin #1-#23 değişikliklerini çektim, çakışma yok. Ortak dosyalara (karar günlüğü, yenilikler.json, index.css) sadece ekleme yapacağız. İçerik için sunucu gerekirse `icerik-` ile başlayan ayrı fonksiyon ve yeni numaralı migration açacağız; migration açmadan önce senin son numarana bakacağız (şu an 0018). Sen de İçerik'e dokunman gerekirse buraya not bırakırsan Enes'e iletirim.
