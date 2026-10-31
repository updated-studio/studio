-- Künye önerisinde resmî ad (31 Ekim 2026, kullanıcı: "adı düzeltmeyi de ekleyemiyor muyuz"): otomasyon üreticinin sayfasındaki tam model
-- adını da önerir (ör. "MacBook Pro" → "MacBook Pro 14 inç (M6, 2026)"); editör onaylarken künyenin adı da güncellenir.
alter table public.kunye_oneriler add column if not exists resmi_ad text;
