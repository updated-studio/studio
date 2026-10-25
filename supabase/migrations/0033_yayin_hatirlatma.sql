-- Yayın hatırlatması (25 Ekim 2026, Fatih: yayına Nehir, Fatih, Enes basar; günlük hedef 5).
-- Her gün 10.00 ve 15.00'te (İstanbul) incelemede bekleyen içerik varsa yöneticilere ve yayın yönetmenine Stüdyo bildirimi düşer
-- (e-posta da gider; kişi Ekip → Profilim'den kapatabilir). Bağlantı Site → Haberler → İncelemede'yi açar.
-- Sayılar panelin tablolarından (aynı veritabanı, payload şeması). Ekrandaki şerit: src/shared/YayinKuyrugu.tsx.
create or replace function public.yayin_hatirlat() returns void
language plpgsql security definer set search_path = public as $$
declare
  bekleyen int;
  bugun int;
begin
  select (select count(*) from payload.news where _status = 'draft' and workflow_state = 'incelemede')
       + (select count(*) from payload.reviews where _status = 'draft' and workflow_state = 'incelemede')
       + (select count(*) from payload.comparisons where _status = 'draft' and workflow_state = 'incelemede')
    into bekleyen;
  if bekleyen = 0 then return; end if;
  select count(*) into bugun from payload.news
   where _status = 'published' and published_at >= date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
  insert into notifications (user_id, body, link)
  select id, format('Yayın onayı bekleyen %s içerik var. Bugün yayınlanan: %s/5.', bekleyen, bugun), '#/site?bolum=news&sekme=incelemede'
  from profiles where site_rol in ('admin', 'yayin-yonetmeni');
end $$;
revoke execute on function public.yayin_hatirlat() from public, anon, authenticated;

select cron.schedule('yayin-hatirlatma', '0 7,12 * * *', 'select public.yayin_hatirlat()');
