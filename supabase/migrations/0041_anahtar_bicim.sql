-- Bağlantı anahtarları biçim kontrolü (27 Ekim 2026): iki kez Meta'nın "uygulama gizli anahtarı" (App Secret, 32 karakter 0-9/a-f)
-- erişim anahtarı yerine kaydedildi. Ekrandaki kontrolün aynısı burada da var: eski açık sekmeden de yanlış değer kaydedilemez.
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
  insert into public.baglanti_anahtarlari (ad, deger, son4, ek, guncelleyen, updated_at)
  values (p_ad, d, right(d, 4), '{}'::jsonb, auth.uid(), now())
  on conflict (ad) do update set deger = excluded.deger, son4 = excluded.son4, ek = '{}'::jsonb, guncelleyen = excluded.guncelleyen, updated_at = now();
end $$;
