-- Künye görselleri Cloudflare'de (27 Ekim 2026, kullanıcı: "cloudflare arkaplan silme tabiki"; sunucu yalnız çekirdek işler,
-- ağır işlem dışarıda). Bağlantı anahtarlarına Cloudflare görsel programının adresi ve ortak anahtarı eklenir.
-- Program kodu: public/cloudflare/gorsel-worker.js. kunye-otomatik görseli bulunca programa gönderir, sonucu "kunye" kovasına koyar.
alter table public.baglanti_anahtarlari drop constraint if exists baglanti_anahtarlari_ad_check;
alter table public.baglanti_anahtarlari add constraint baglanti_anahtarlari_ad_check
  check (ad in ('gemini_yedek', 'instagram', 'cloudflare_adres', 'cloudflare_anahtar'));

create or replace function public.anahtar_kaydet(p_ad text, p_deger text)
returns void
language plpgsql security definer set search_path = public as $$
declare d text := btrim(coalesce(p_deger, ''));
begin
  if not public.is_admin() then raise exception 'Yalnız yöneticiler'; end if;
  if d = '' then delete from public.baglanti_anahtarlari where ad = p_ad; return; end if;
  if length(d) < 20 or length(d) > 2000 then raise exception 'Anahtar geçerli görünmüyor'; end if;
  if p_ad = 'instagram' and d ~* '^[0-9a-f]{32}$' then
    raise exception 'Bu, uygulamanın gizli anahtarı (App Secret); o gerekmiyor. "Generate token" ile çıkan, IG ile başlayan uzun anahtarı yapıştır.';
  end if;
  if p_ad = 'instagram' and (d !~ '^(IG|EAA)' or length(d) < 100) then
    raise exception 'Bu Instagram erişim anahtarına benzemiyor: anahtar IG ile başlar ve çok uzundur.';
  end if;
  if p_ad = 'gemini_yedek' and d !~ '^AIza' then
    raise exception 'Bu Google (Gemini) anahtarına benzemiyor: anahtar AIza ile başlar.';
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
