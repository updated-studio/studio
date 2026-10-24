-- Sitenin yorumları (24 Ekim 2026, Fatih): onay bekleyen yorum olunca yayın yönetmeni ve yöneticilere Stüdyo bildirimi düşer.
-- Panel (payload rolü) çağırır; 30 dakikada en fazla bir kez (site deposu apps/cms/src/lib/uye.ts ekibeHaberVer).
-- Uygulanmazsa yalnız bu bildirim gitmez; yorumlar ve onay akışı çalışmaya devam eder.
create or replace function public.yorum_onay_bildir(p_metin text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, body)
  select id, 'Sitede onay bekleyen yorum var (Site → Topluluk → Yorumlar): ' || left(coalesce(p_metin, ''), 160)
  from profiles where site_rol in ('admin', 'yayin-yonetmeni');
$$;
revoke execute on function public.yorum_onay_bildir(text) from public, anon, authenticated;
grant execute on function public.yorum_onay_bildir(text) to payload;
