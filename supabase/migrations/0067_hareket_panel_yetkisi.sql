-- Panelin hareket kaydı (5 Kasım 2026): Payload kancası (site deposu apps/cms/src/hooks/hareket.ts) public.hareketler'e "payload" rolüyle
-- yazıyor, ama 0045'te bu role yazma izni verilmemişti; 28 Ekim'den beri panelde yapılan hiçbir işlem Hareket geçmişine düşmüyordu
-- (panel kaydında "hareket yazılamadı"). Yalnız ekleme izni verilir; okuma, değiştirme, silme yok.
grant usage on schema public to payload;
grant insert on public.hareketler to payload;
