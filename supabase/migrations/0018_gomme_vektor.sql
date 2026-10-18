-- Kartların anlam vektörü (gömme / embedding), 18 Ekim 2026. Her haberin vektörü bir kez hesaplanıp saklanır:
-- ücretsiz kotada toplu istekteki her metin ayrı istek sayıldığı için kümeleme her turda 300 kartı yeniden hesaplayamıyor (429).
-- Ayrı tablo: tr_items'a konmaz ki ekrana ve canlı güncellemeye büyük veri gitmesin. Sadece aynı modelin vektörleri karşılaştırılır.
create table if not exists public.tr_gomme (
  link text primary key,
  model text not null,
  v real[] not null,
  created_at timestamptz not null default now()
);
alter table public.tr_gomme enable row level security; -- sadece sunucu fonksiyonu (servis anahtarı) okur/yazar
-- Gece temizliği: 7 günden eski vektörler (haberler zaten 3 günde temizleniyor)
select cron.schedule('triyaj-gomme-temizlik', '45 0 * * *', $$delete from public.tr_gomme where created_at < now() - interval '7 days'$$);
select 'gömme tablosu tamam' as sonuc;
