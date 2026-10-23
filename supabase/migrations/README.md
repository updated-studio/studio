# Veritabanı değişiklikleri

Her değişiklik numaralı bir dosyadır ve sırayla uygulanır. 0001–0003 Supabase panelinden elle uygulandı (8 Ekim 2026).
Etkinlik/lansman verileri (18 kayıt) panelden girildi; veri olduğu için burada değil.
Yeni değişiklik = yeni numaralı dosya. Eski dosyalar değiştirilmez.

**Uygulama (23 Ekim 2026'dan beri Natro):** dosya `main`'e gelince kendiliğinden uygulanmaz (bilerek). Sunucuda: `sudo updated-studyo-goc --bekleyen` (bekleyenler), `sudo updated-studyo-goc 0025_ornek.sql` (tek işlemde uygular; hata verirse hiçbir değişiklik kalmaz). Uygulananlar `updated.studyo_gocler` tablosunda; 0001–0024 taşınırken zaten uygulanmıştı.
