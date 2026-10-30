-- Yedek Gemini anahtarı kaydedilemiyordu (30 Ekim 2026, kullanıcı: "Fatih abi Gemini API alıyor fakat sistem onaylamıyor"):
-- kayıt kuralı anahtarın AIza ile başlamasını şart koşuyordu. Kural gevşetildi; geri kalanı 0044 ile aynı.
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
