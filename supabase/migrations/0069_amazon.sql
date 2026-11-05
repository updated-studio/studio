-- Amazon ortaklık fiyatları (5 Kasım 2026, kullanıcı: "Amazon API'si geldi, ekleyelim"; amaç: ürün sayfasında Amazon fiyatı ve ortaklık bağlantısı).
-- Amazon Creators API (PA-API 5'in yerini aldı): kimlik (Credential ID), gizli anahtar (Credential Secret), kimlik sürümü (Türkiye/Avrupa 3.2)
-- ve ortaklık etiketi (Partner Tag). Hepsi Stüdyo → Bağlantı anahtarları'ndan girilir. amazon-fiyat fonksiyonu günde iki kez fiyatları yeniler
-- (Amazon kuralı: gösterilen fiyat en geç 24 saatte bir güncellenir), eşleşmemiş ürünleri arar; sonuç panelde ürünün Amazon alanlarına yazılır.
alter table public.baglanti_anahtarlari drop constraint if exists baglanti_anahtarlari_ad_check;
alter table public.baglanti_anahtarlari add constraint baglanti_anahtarlari_ad_check
  check (ad = any (array['gemini_yedek', 'instagram', 'cloudflare_adres', 'cloudflare_anahtar', 'brave_arama', 'claude', 'openai', 'gemini_gorsel', 'bfl',
    'amazon_kimlik', 'amazon_gizli', 'amazon_surum', 'amazon_etiket']));

create or replace function public.anahtar_kaydet(p_ad text, p_deger text)
returns void
language plpgsql security definer set search_path = public as $$
declare d text := btrim(coalesce(p_deger, ''));
begin
  if not public.is_admin() then raise exception 'Yalnız yöneticiler'; end if;
  if d = '' then delete from public.baglanti_anahtarlari where ad = p_ad; return; end if;
  -- Amazon ortaklık etiketi ve kimlik sürümü kısa değerlerdir (5 Kasım 2026, göç 0069)
  if p_ad = 'amazon_etiket' then
    if d !~ '^[A-Za-z0-9_-]{3,64}$' then raise exception 'Ortaklık etiketi (Partner Tag) yalnız harf, rakam ve tire içerir; ör. updated-21.'; end if;
  elsif p_ad = 'amazon_surum' then
    if d !~ '^[23]\.[123]$' then raise exception 'Kimlik sürümü 2.1-2.3 ya da 3.1-3.3 olmalı (Associates Central''da kimliğin yanında yazar; Türkiye için genelde 3.2).'; end if;
  elsif length(d) < 20 or length(d) > 2000 then raise exception 'Anahtar geçerli görünmüyor';
  end if;
  if p_ad = 'instagram' and d ~* '^[0-9a-f]{32}$' then
    raise exception 'Bu, uygulamanın gizli anahtarı (App Secret); o gerekmiyor. "Generate token" ile çıkan, IG ile başlayan uzun anahtarı yapıştır.';
  end if;
  if p_ad = 'instagram' and (d !~ '^(IG|EAA)' or length(d) < 100) then
    raise exception 'Bu Instagram erişim anahtarına benzemiyor: anahtar IG ile başlar ve çok uzundur.';
  end if;
  -- 30 Ekim 2026: Google'ın yeni anahtarları her zaman AIza ile başlamıyor (yedek anahtar kaydedilemiyordu). Biçim yalnız kaba yanlışları yakalar:
  -- proje kimliği (gen-lang-client-…), adres, boşluklu metin. Anahtarın çalışıp çalışmadığını ilk kullanımda Gemini söyler.
  if p_ad = 'gemini_yedek' and (d ~* '^gen-lang-client' or d ~* '^https?:' or d ~ '\s' or d !~ '^[A-Za-z0-9._-]{30,200}$') then
    raise exception 'Bu Google (Gemini) anahtarına benzemiyor. AI Studio''da anahtarın satırındaki kopyala simgesine bas; proje adını (gen-lang-client…) değil anahtarı yapıştır.';
  end if;
  if p_ad = 'cloudflare_adres' and d !~ '^https://[A-Za-z0-9.-]+/?$' then
    raise exception 'Programın adresi https:// ile başlamalı (ör. https://updated-gorsel.ad.workers.dev).';
  end if;
  if p_ad = 'cloudflare_anahtar' and length(d) < 24 then
    raise exception 'Anahtar en az 24 karakter olmalı.';
  end if;
  insert into public.baglanti_anahtarlari (ad, deger, son4, ek, guncelleyen, updated_at)
  values (p_ad, d, right(d, 4), '{}'::jsonb, auth.uid(), now())
  on conflict (ad) do update set deger = excluded.deger, son4 = excluded.son4, ek = '{}'::jsonb, guncelleyen = excluded.guncelleyen, updated_at = now();
end $$;

create or replace function public.amazon_kick()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(url := 'http://functions:9000/amazon-fiyat', body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 5000);
end $$;
revoke execute on function public.amazon_kick() from public, anon, authenticated;
select cron.unschedule('amazon-fiyat') where exists (select 1 from cron.job where jobname = 'amazon-fiyat');
select cron.schedule('amazon-fiyat', '50 4,16 * * *', 'select public.amazon_kick()');
