-- Profil fotoğrafının köşesindeki emoji (durum rozeti). Metin olarak saklanır, cihazın emoji setiyle çizilir.
alter table public.profiles add column if not exists emoji text check (char_length(emoji) <= 16);
select 'emoji tamam' as sonuc;
