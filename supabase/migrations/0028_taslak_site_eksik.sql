-- Panele giden taslağın durumu (Otomasyon 2, 24 Ekim 2026): panel her gönderimde editörün tamamlaması gerekenleri
-- (eksikler: kapak yok/küçük, kısa cevap yok…) ve yayın kuralına uydurmak için yaptığı düzeltmeleri döner.
-- Haber Masası taslak kartında "Panelde hazır" ya da "Eksik: …" olarak görünür.
alter table public.tr_drafts add column if not exists site_eksik jsonb;
