-- Bağlantı anahtarları (27 Ekim 2026): dış servis anahtarları (Instagram erişim anahtarı, yedek Gemini anahtarı) Stüdyo'dan
-- yöneticilerce girilir. Değer bir daha ekrana gelmez: tabloda okuma kuralı yok (yalnız sunucu fonksiyonları, servis rolüyle okur);
-- yöneticiler yalnız durumunu (girildi mi, son 4 karakter, tarih) görür ve yeni değer yazar ya da siler.
create table if not exists public.baglanti_anahtarlari (
  ad text primary key check (ad in ('gemini_yedek', 'instagram')),
  deger text not null,
  son4 text not null default '',
  ek jsonb not null default '{}'::jsonb,      -- ör. Instagram anahtarının bitiş tarihi, hesap adı
  guncelleyen uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.baglanti_anahtarlari enable row level security;
revoke all on public.baglanti_anahtarlari from anon, authenticated;

-- Yöneticiye durum: değerin kendisi asla dönmez
create or replace function public.anahtar_durum()
returns table (ad text, son4 text, ek jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yalnız yöneticiler'; end if;
  return query select a.ad, a.son4, a.ek, a.updated_at from public.baglanti_anahtarlari a;
end $$;

-- Yönetici yeni değer yazar (boş değer = sil)
create or replace function public.anahtar_kaydet(p_ad text, p_deger text)
returns void
language plpgsql security definer set search_path = public as $$
declare d text := btrim(coalesce(p_deger, ''));
begin
  if not public.is_admin() then raise exception 'Yalnız yöneticiler'; end if;
  if d = '' then delete from public.baglanti_anahtarlari where ad = p_ad; return; end if;
  if length(d) < 20 or length(d) > 2000 then raise exception 'Anahtar geçerli görünmüyor'; end if;
  insert into public.baglanti_anahtarlari (ad, deger, son4, ek, guncelleyen, updated_at)
  values (p_ad, d, right(d, 4), '{}'::jsonb, auth.uid(), now())
  on conflict (ad) do update set deger = excluded.deger, son4 = excluded.son4, ek = '{}'::jsonb, guncelleyen = excluded.guncelleyen, updated_at = now();
end $$;

revoke all on function public.anahtar_durum() from public, anon;
revoke all on function public.anahtar_kaydet(text, text) from public, anon;
grant execute on function public.anahtar_durum() to authenticated;
grant execute on function public.anahtar_kaydet(text, text) to authenticated;

-- Instagram Reels (27 Ekim 2026): instagram-reels fonksiyonu 6 saatte bir son Reels'leri çeker; kapaklar "instagram" kovasına
-- kopyalanır (Instagram'ın kendi görsel adresleri birkaç günde geçersiz olur). Site derlemesi listeyi fonksiyonun GET ucundan okur.
create table if not exists public.instagram_reels (
  id text primary key,
  aciklama text not null default '',
  baglanti text not null,
  kapak text,
  zaman timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.instagram_reels enable row level security;
drop policy if exists instagram_reels_oku on public.instagram_reels;
create policy instagram_reels_oku on public.instagram_reels for select using (true);

insert into storage.buckets (id, name, public) values ('instagram', 'instagram', true) on conflict (id) do nothing;

create or replace function public.instagram_kick()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(url := 'http://functions:9000/instagram-reels', body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 1000);
end $$;
select cron.schedule('instagram-reels', '20 */6 * * *', 'select public.instagram_kick()');
