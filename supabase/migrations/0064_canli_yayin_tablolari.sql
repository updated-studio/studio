-- Anlık güncelleme (Realtime) tabloları yeniden (4 Kasım 2026). 23 Ekim'de Natro'ya taşınırken supabase_realtime yayını boş kuruldu
-- (0001, 0002, 0006, 0010'daki "alter publication" satırları uygulanmış sayıldı ama yeni sunucuda çalışmadı): o günden beri Haber Masası,
-- sohbet ve ekip ekranları değişikliği ancak sayfa yenilenince görüyordu. Hangi tablo zaten yayındaysa atlanır.
do $$
declare t text;
begin
  foreach t in array array['availability','week_notes','jobs','job_requests','gear','notifications','profiles','events','invites',
    'tr_items','tr_votes','tr_drafts','tr_chat','tr_sources','tr_settings','tr_brands','tr_press','tr_activity'] loop
    if to_regclass('public.' || t) is not null and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
