-- Onay bekleyen yorum bildirimi artık e-posta göndermez (25 Ekim 2026, kullanıcı: "yorum gelince mail gelmesine gerek yok").
-- Bildirim Stüdyo'da görünmeye devam eder; emailed=true ile eklendiği için notify-email onu atlar.
create or replace function public.yorum_onay_bildir(p_metin text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, body, link, emailed)
  select id, 'Sitede onay bekleyen yorum var: ' || left(coalesce(p_metin, ''), 160), '#/site?bolum=yorumlar', true
  from profiles where site_rol in ('admin', 'yayin-yonetmeni');
$$;
revoke execute on function public.yorum_onay_bildir(text) from public, anon, authenticated;
grant execute on function public.yorum_onay_bildir(text) to payload;
