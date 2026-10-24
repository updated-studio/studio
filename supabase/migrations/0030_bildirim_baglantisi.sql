-- Bildirimlere bağlantı (24 Ekim 2026, Fatih: "yorum geldi, maili de geldi ama tıklayınca bildirime gitmiyor").
-- link: Stüdyo içi adres (ör. '#/site?bolum=yorumlar'); Stüdyo'da bildirim satırı ve e-postadaki "Aç:" satırı oraya götürür.
alter table public.notifications add column if not exists link text;

create or replace function public.yorum_onay_bildir(p_metin text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, body, link)
  select id, 'Sitede onay bekleyen yorum var: ' || left(coalesce(p_metin, ''), 160), '#/site?bolum=yorumlar'
  from profiles where site_rol in ('admin', 'yayin-yonetmeni');
$$;
revoke execute on function public.yorum_onay_bildir(text) from public, anon, authenticated;
grant execute on function public.yorum_onay_bildir(text) to payload;
