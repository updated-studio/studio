-- Haber Masası yedeği (18 Ekim 2026, büyük güncelleme öncesi; Fatih istedi). Elle SQL Editor'da çalıştırıldı, burada kayıt için duruyor.
-- Sadece kopya oluşturur; hiçbir şeyi silmez/değiştirmez. Kod yedeği: GitHub'da "yedek/haber-masasi-2026-10-18" dalı.
-- Geri dönmek gerekirse: tablolar yedek_20261018 şemasından geri kopyalanır (sahip karar verir).
create schema if not exists yedek_20261018;
revoke all on schema yedek_20261018 from public, anon, authenticated;
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='public' and tablename like 'tr\_%' loop
    execute format('create table if not exists yedek_20261018.%I as table public.%I', t, t);
    execute format('alter table yedek_20261018.%I enable row level security', t);
  end loop;
end $$;
create table if not exists yedek_20261018.cron_job as select jobname, schedule, command from cron.job;
alter table yedek_20261018.cron_job enable row level security;
-- Alınan kayıt sayıları: tr_items 2229, tr_drafts 100, tr_seen 2923, tr_activity 241, tr_votes 16, tr_sources 56, tr_brands 22, tr_press 10, tr_settings 8, tr_chat 5, cron 6
