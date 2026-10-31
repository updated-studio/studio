-- Haber Masası taslak/kümeleme modeli (31 Ekim 2026, kullanıcı: "değiştirebilirsin"): gemini-3.8-flash ücretsiz katmanda her istekte 429
-- veriyor (göç 0055 sayacı); her taslak ve kümeleme turunda bir istek boşa gidiyordu. Ayar gemini-3.6-flash'a alınır
-- (Haber Masası → Ayarlar'dan yine değiştirilebilir).
update public.tr_settings set value = '"gemini-3.6-flash"'::jsonb where key = 'model_taslak' and value = '"gemini-3.8-flash"'::jsonb;
