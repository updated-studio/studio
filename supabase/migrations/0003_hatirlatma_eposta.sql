-- Haftalik musaitlik hatirlatmasi (pazartesi 09:00 TR) ve e-posta bildirimi tetikleyicisi
create extension if not exists pg_cron;

create or replace function public.auto_reminder() returns void
language plpgsql security definer set search_path = public as $$
declare ws date := date_trunc('week', (now() at time zone 'Europe/Istanbul'))::date;
begin
  insert into notifications (user_id, body)
  select p.id, 'Yeni hafta başladı. Bu haftaki müsaitliğini işaretle.'
  from profiles p
  where not exists (select 1 from availability a where a.user_id = p.id and a.day >= ws and a.day < ws + 7);
end;
$$;
revoke execute on function public.auto_reminder() from public, anon, authenticated;
select cron.schedule('haftalik-hatirlatma', '0 6 * * 1', 'select public.auto_reminder()');

alter table public.notifications add column if not exists emailed boolean not null default false;
create extension if not exists pg_net;
create or replace function public.kick_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://fulmooonidwrqyybbkvu.supabase.co/functions/v1/notify-email',
    body := '{}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb);
  return null;
end;
$$;
drop trigger if exists notifications_email on public.notifications;
create trigger notifications_email after insert on public.notifications
  for each statement execute function public.kick_email();
