-- Haber Masası öncelik sistemi: yapay zekâ haberi sabit bir "haber türü" listesine yerleştirir;
-- öncelik markadan bağımsız olarak bu türden, kaynak sayısından ve tazelikten hesaplanır (src/modules/haber-masasi/oncelik.ts).
alter table public.tr_items add column if not exists news_type text not null default '';
select 'haber türü sütunu hazır' as sonuc;
