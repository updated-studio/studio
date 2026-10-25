-- Takvim aboneliği (25 Ekim 2026, yol haritası): kişiye özel gizli bağlantı; telefonun takvimi (iPhone, Google) Stüdyo takvimini
-- kendiliğinden çeker: lansman/etkinlikler, kişinin bitmemiş işleri (teslim günü), ekipman geliş/iade. Fonksiyon: takvim.
create extension if not exists pgcrypto;
create table if not exists public.takvim_anahtarlari (
  user_id uuid primary key references auth.users(id) on delete cascade,
  anahtar text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.takvim_anahtarlari enable row level security;
create policy "kendi anahtarim" on public.takvim_anahtarlari for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
