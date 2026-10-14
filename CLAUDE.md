# Updated Stüdyo: çalışma talimatı

1. **Her oturumun ilk işi `ARCHITECTURE.md`'yi okumaktır.** Oradaki kurallar bu depodaki her işten önce gelir.
2. Yeni araç = `src/modules/<ad>/` altında modül + `src/modules/index.ts`'e bir satır. Ayrı depo, ayrı giriş, ayrı veritabanı açılmaz.
3. Mimariyi etkileyen her karar önce `ARCHITECTURE.md`'ye (Karar günlüğü) yazılır. Claude projesindeki `claude/ARCHITECTURE.md` kopyası da aynı anda güncellenir.
4. Veritabanı değişikliği = `supabase/migrations/` altında yeni numaralı dosya. Eski dosyalar değiştirilmez.
5. Gizli bilgi (şifre, gizli anahtar, kişisel e-posta) koda yazılmaz; depo herkese açık olabilir.
6. Çalışan araç, yenisi tamamen çalışana kadar kapatılmaz (kural 9).
7. Arayüz metinleri Türkçe; renk ve yazı tipi `src/index.css` değişkenlerinden.
8. Kullanıcı (Enes) teknik değil: kendisinin yapması gereken adımlarda ilgili sayfayı açıp önüne koy, işi ona yükleme; yapılan işlemi azaltan her otomasyon tercih edilir.
9. Ekip katkı puanı kuralları tek yerde: `src/modules/ekip/Katki.tsx` içindeki `PUAN_KURALLARI` (ekrandaki açıklama buradan üretilir). Puanlamayı etkileyen her değişiklikte bu liste, `PUAN_SURUMU` tarihi ve ARCHITECTURE.md karar günlüğü birlikte güncellenir.
10. Haber Masası kuralları iki yerde: eleme kuralları ve yapay zekânın etiket listesi `supabase/functions/triyaj-topla/index.ts` (SISTEM istemi, TUR, SAAT/KAYNAK_MAX/MAX_HABER); öncelik puanı `src/modules/haber-masasi/oncelik.ts` (marka grubu puanları, ek puanlar, oy etkisi, seviyeler). Ekrandaki "Öncelik nasıl hesaplanır?" açıklaması ve kart gerekçeleri `oncelik.ts`'ten üretilir. Değişiklikte ilgili dosya, `ONCELIK_SURUMU` ve ARCHITECTURE.md karar günlüğü birlikte güncellenir.
11. Ekibin fark edeceği her değişiklikte `public/yenilikler.json`un en üstüne yeni not eklenir (yeni `id`, tarih, kısa başlık, bölüm bölüm sade Türkçe maddeler). Stüdyo açılınca kullanıcı görmediği notları pencerede okur.
