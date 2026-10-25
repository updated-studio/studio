-- Telefon bildirimi (25 Ekim 2026, yol haritası "telefon bildirimi"): kişi Profilim'den cihazını kaydeder,
-- her yeni Stüdyo bildirimi (notifications) e-postanın yanında o cihazlara da gider (notify-email fonksiyonu, web push).
-- Gönderim anahtarı (VAPID) yalnız sunucuda: /opt/updated/supabase/functions.env.
create table if not exists public.push_abonelikleri (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  cihaz text,
  created_at timestamptz not null default now()
);
alter table public.push_abonelikleri enable row level security;
create policy "kendi cihazlarim" on public.push_abonelikleri for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.notifications add column if not exists pushed boolean not null default false;
update public.notifications set pushed = true where pushed = false;
