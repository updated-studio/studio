-- Enes'in kararı (13 Ekim 2026): oyda herkes kendi oyunu verir (notlu). Eski "haber başına tek oy" kuralı kaldırılır.
drop index if exists public.tr_votes_tek;
drop index if exists public.tr_votes_link;
create unique index if not exists tr_votes_kisi on public.tr_votes (item_id, user_id) where item_id is not null;
create unique index if not exists tr_votes_kisi_link on public.tr_votes (link, user_id) where link <> '';
select 'oy: herkes kendi oyu' as sonuc;
