-- Künye otomasyonu (25 Ekim 2026): fonksiyon kunye-otomatik her ürün için resmî kaynakları internette bulur ve özellik değerlerini
-- kaynaklarıyla önerir; öneriler burada bekler, editör Stüdyo → Site → Künye onayı'ndan tek tıkla onaylar (değerler panele yazılır).
create table if not exists public.kunye_oneriler (
  id bigint generated always as identity primary key,
  urun_id int not null,
  urun_adi text not null,
  tur text,
  ozellikler jsonb not null default '[]',   -- [{key, value, num, kaynak, kanit}]
  kaynaklar jsonb not null default '[]',    -- [{baslik, url}]
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'onaylandi', 'reddedildi', 'hata')),
  hata text,
  karar_veren uuid references auth.users(id) on delete set null,
  karar_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists kunye_oneriler_urun on public.kunye_oneriler (urun_id, created_at desc);
alter table public.kunye_oneriler enable row level security;
create policy "ekip okur" on public.kunye_oneriler for select to authenticated using (true);
create policy "ekip karar verir" on public.kunye_oneriler for update to authenticated using (true) with check (true);
