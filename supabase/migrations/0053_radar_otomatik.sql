-- Çıkış radarı otomasyonu (30 Ekim 2026, kullanıcı: "çıkış radarlarını da otomatiğe bağlamak istiyorum", "hem bunlara hem interneti kontrol etmesi lazım",
-- "bizim yapımıza uygun ürünler olacak, ileride otomotiv eklenince o da girilir").
-- Akış: radar-otomatik (günde bir) haber masasındaki söylenti/sızıntı/duyuru haberlerini ürün ürün toplar, yapay zekâ konu dışını eler,
-- kalanları Google aramasıyla doğrular ve sonucu buraya yazar. Panel (site deposu apps/cms/src/lib/radar.ts) 15 dakikada bir "bekliyor"
-- satırlarını künyeye işler: künye yoksa açar, varsa durumunu/tarihini günceller; editörün radardan çıkardığı ürüne dokunmaz.
-- Ürün türleri panelin ürün türü listesinden okunur (payload.enum_products_type): panele yeni tür (ör. otomobil) eklenince radar onu da alır.

create table if not exists public.radar_adaylari (
  id bigint generated always as identity primary key,
  anahtar text not null unique,                 -- marka + ad, küçük harf ve yalnız harf/rakam (aynı ürünü tek satırda tutar)
  marka text not null,
  ad text not null,                             -- markasız model adı ("Galaxy S27 Ultra")
  tur text not null,                            -- panelin ürün türü (camera, phone…)
  durum text not null check (durum in ('soylenti', 'sizinti', 'test', 'takvim', 'duyuruldu', 'satista')),
  tarih date,                                   -- tahmini çıkış ayı (ayın 1'i)
  tarih_notu text not null default '',          -- "Eylül 2027 etkinliği" gibi kısa not
  ozet text not null default '',                -- tek cümle Türkçe tanım (künyenin "tek cümle tanım"ı olur)
  kaynaklar jsonb not null default '[]',        -- [{baslik, url}] Google aramasının kaynakları
  haberler bigint[] not null default '{}',      -- haber masasındaki ilgili haberler (tr_items.id)
  urun_id integer,                              -- panelde işlendiği künye
  islem text not null default 'bekliyor' check (islem in ('bekliyor', 'uygulandi', 'atlandi', 'hata')),
  islem_notu text not null default '',
  kontrol_zamani timestamptz not null default now(),  -- internetten en son doğrulandığı an
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists radar_adaylari_islem_idx on public.radar_adaylari (islem);
alter table public.radar_adaylari enable row level security;

-- Stüdyo'da ekip görebilir (ileride radar listesi için); yazma yalnız otomasyon (service role) ve panel
drop policy if exists radar_ekip_okur on public.radar_adaylari;
create policy radar_ekip_okur on public.radar_adaylari for select to authenticated using (true);
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'payload') then
    grant usage on schema public to payload;
    grant select on public.radar_adaylari to payload;
    grant update (urun_id, islem, islem_notu, updated_at) on public.radar_adaylari to payload;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'radar_adaylari' and policyname = 'panel_radar_isler') then
      create policy panel_radar_isler on public.radar_adaylari for all to payload using (true) with check (true);
    end if;
  end if;
end $$;

-- Otomasyonun okuduğu panel bilgisi: ürün türleri ve künyedeki ürünler (yalnız service role; panel tablolarına başka yol açılmaz).
-- plpgsql: gövde çalışınca derlenir, panelin radar_oto sütunu (panel göçü) henüz yoksa bile bu göç uygulanır.
create or replace function public.radar_turler()
returns text[] language plpgsql stable security definer set search_path = public as $$
begin
  return (select array_agg(t::text) from unnest(enum_range(null::payload.enum_products_type)) t);
end $$;

create or replace function public.radar_urunler()
returns table (id integer, ad text, marka text, tur text, durum text, radarda boolean, radar_oto boolean, tarih date)
language plpgsql stable security definer set search_path = public as $$
begin
  return query execute
    'select p.id, p.name::text, p.brand::text, p.type::text, p.status::text, coalesce(p.on_radar, false), coalesce(p.radar_oto, false), p.release_date::date from payload.products p';
exception when undefined_column then
  return query execute
    'select p.id, p.name::text, p.brand::text, p.type::text, p.status::text, coalesce(p.on_radar, false), false, p.release_date::date from payload.products p';
end $$;

revoke execute on function public.radar_turler() from public, anon, authenticated;
revoke execute on function public.radar_urunler() from public, anon, authenticated;
grant execute on function public.radar_turler() to service_role;
grant execute on function public.radar_urunler() to service_role;

-- Günde bir kez, 05.20 UTC (08.20 TR): haber masasının gece toplananları işlenmiş olur; künye turlarıyla (x.40) çakışmaz
create or replace function public.radar_kick()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(url := 'http://functions:9000/radar-otomatik', body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 5000);
end $$;
revoke execute on function public.radar_kick() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'radar-otomatik') then perform cron.unschedule('radar-otomatik'); end if;
  perform cron.schedule('radar-otomatik', '20 5 * * *', 'select public.radar_kick()');
end $$;
