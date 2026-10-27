-- Künye görselleri (27 Ekim 2026, kullanıcı: "künyelerin fotoğrafları nasıl çekilecek… otomatize edebilir miyiz"):
-- kunye-otomatik üreticinin resmî ürün sayfasındaki görseli bulur (gorsel_aday); sunucudaki işçi (scripts/kunye-gorsel)
-- arka planı siler, ürünü standart UPDATED tuvaline (1600×900, şeffaf) ortalar, "kunye" kovasına yükler (gorsel).
-- Editör Künye onayı'nda görür; onaylarsa panele görsel olarak yüklenir ve ürüne bağlanır.
alter table public.kunye_oneriler
  add column if not exists gorsel_aday jsonb,
  add column if not exists gorsel text,
  add column if not exists gorsel_durum text not null default 'yok' check (gorsel_durum in ('yok', 'isleniyor', 'hazir', 'hata')),
  add column if not exists gorsel_hata text;
create index if not exists kunye_oneriler_gorsel_isleniyor on public.kunye_oneriler (id) where gorsel_durum = 'isleniyor';
insert into storage.buckets (id, name, public) values ('kunye', 'kunye', true) on conflict (id) do nothing;
