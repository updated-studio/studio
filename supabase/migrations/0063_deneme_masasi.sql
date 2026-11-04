-- Deneme masası (4 Kasım 2026, kullanıcı: "taslak bozulmasın diye yöneticiye özel deneme sayfası; gerçek haberlerle").
-- Gerçek bir haberin kopyası (tr_items.deneme) ve ondan hazırlanan taslak (tr_drafts.deneme) her yerden ayrı tutulur:
-- Haber Masası listeleri, otomatik taslak, kümeleme, radar, panele gönderim, ölçümler ve katkı puanı bunları saymaz.
-- Kopyalar Stüdyo → Deneme masası'ndan silinir.
alter table public.tr_items add column if not exists deneme boolean not null default false;
alter table public.tr_drafts add column if not exists deneme boolean not null default false;
create index if not exists tr_items_deneme_idx on public.tr_items (id) where deneme;
create index if not exists tr_drafts_deneme_idx on public.tr_drafts (id) where deneme;
