-- Haber kapsamı genişledi (6 Kasım 2026, Fatih: "sadece Apple/Android değil; genel kamera, aksiyon kameraları, akıllı ev ürünleri,
-- güneş panelleri"): bu alanların kaynakları. Akışlar 6 Kasım'da denendi (hepsi güncel yanıt verdi). Var olan adres yeniden eklenmez.
-- Kaynaklar sonradan Stüdyo → Yönetim → Kaynaklar ve eleme'den kapatılabilir.
insert into public.tr_sources (category, name, url) values
  ('Kamera ve Video', 'Digital Camera World', 'https://www.digitalcameraworld.com/feeds.xml'),
  ('Kamera ve Video', 'Camera Jabber', 'https://camerajabber.com/feed/'),
  ('Kamera ve Video', 'Photo Rumors', 'https://photorumors.com/feed/'),
  ('Kamera ve Video', 'Fuji Rumors', 'https://www.fujirumors.com/feed/'),
  ('Akıllı Ev', 'The Verge Smart Home', 'https://www.theverge.com/rss/smart-home/index.xml'),
  ('Akıllı Ev', 'The Ambient', 'https://www.the-ambient.com/feed'),
  ('Akıllı Ev', 'Matter Alpha', 'https://www.matteralpha.com/feed'),
  ('Akıllı Ev', 'Android Police Smart Home', 'https://www.androidpolice.com/feed/smart-home/'),
  ('Enerji', 'pv magazine', 'https://www.pv-magazine.com/feed/'),
  ('Enerji', 'Electrek Solar', 'https://electrek.co/guides/solar/feed/')
on conflict (url) do nothing;
