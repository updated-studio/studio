-- Fatih, 18 Ekim 2026 (öğlen): Türkiye'deki haber sitelerinden (basın bültenleri hariç) haber metni ve görsel ALINMAZ (telif).
-- Google Trends Türkiye sadece sinyal: gündem terimi yabancı kaynaklı karta işaret olarak yazılır, puanı artırır.
-- Silme yok: kaynaklar kapatılır, Türk haber sitelerinden gelmiş ve kimsenin dokunmadığı kartlar "elendi"ye alınır (geri alınabilir).

alter table public.tr_items add column if not exists trend text;

-- Türk haber siteleri kaynak olarak kapatılır (Samsung Newsroom Türkiye basın bülteni olduğu için açık kalır)
update public.tr_sources set active = false where name in ('Anadolu Ajansı Bilim-Teknoloji', 'TRT Haber Bilim-Teknoloji');
update public.tr_sources set category = 'Türkiye gündemi (sadece sinyal)' where name = 'Google Trends TR';

-- Bu kaynaklardan ya da gündem üzerinden Türk haber sitelerinden gelmiş, dokunulmamış kartlar
update public.tr_items
set status = 'elendi', reason = 'Telif: Türkiye''deki haber sitesi (Fatih, 18 Ekim: basın bülteni dışında Türk haber sitelerinden içerik alınmaz)'
where status in ('aday', 'belirsiz', 'rehber') and touched = false
  and (source_name in ('Anadolu Ajansı Bilim-Teknoloji', 'TRT Haber Bilim-Teknoloji')
       or (source_name like 'Gündem ·%' and (link ~* '^https?://[^/]+\.tr(/|$|\?)' or link ~* '^https?://([a-z0-9-]+\.)*(haberturk|cnnturk|trthaber|ensonhaber|haberler|mynet|webtekno|shiftdelete|donanimhaber|onedio|sporx|ajansspor|internethaber|haber7|bloomberght|ekonomim|t24|odatv|gazeteduvar|halktv|tele1|sozcu|aksam|star|takvim|yenisafak|dunya|bianet|diken|indyturk|euronews|bbc|dw|independentturkish|tgrthaber|ahaber|kanald|showtv|atv|foxhaber|nowtv|tv100|teve2|beyazgazete|gzt|karar|korkusuz|yeniakit|milligazete|evrensel|birgun|cumhuriyet|sabah|milliyet|hurriyet|posta|fotomac|fanatik|ntv|ntvspor|aa)\.(com|net|org|tv)(/|$|\?)')));

select 'gündem sinyali ve telif kuralı tamam' as sonuc;
