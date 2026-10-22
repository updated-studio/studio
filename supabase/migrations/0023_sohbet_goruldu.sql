-- Ekip sohbeti "son görülme" zamanı hesapta tutulur (önceden sadece tarayıcıda; başka cihazda bütün mesajlar okunmamış görünüyordu).
alter table public.profiles add column if not exists chat_seen_at timestamptz;
update public.profiles set chat_seen_at = now() where chat_seen_at is null; -- ilk kurulumda eski mesajlar okunmuş sayılır

create or replace function public.sohbet_goruldu(t timestamptz default now())
returns void language sql security definer set search_path to 'public' as $$
  update public.profiles
     set chat_seen_at = greatest(coalesce(chat_seen_at, '-infinity'::timestamptz), least(t, now()))
   where id = auth.uid();
$$;
revoke all on function public.sohbet_goruldu(timestamptz) from public, anon;
grant execute on function public.sohbet_goruldu(timestamptz) to authenticated;
