-- Taslak/çeviri işi yarıda kalırsa (sunucu işi öldürdüyse) kilit kendiliğinden açılır.
-- triyaj-taslak iş sürdükçe updated_at'i tazeler (nabız). 2 dakikadır nabız gelmeyen iş "hata"ya çekilir,
-- kartta "Tekrar dene" çıkar. Kimsenin elle müdahale etmesi gerekmez.
create or replace function public.tr_is_kurtar() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.tr_items
     set work_state = 'hata',
         work_error = 'Sunucu işi yarıda bıraktı (yapay zekâ ya da kaynak site çok yavaş). Tekrar dene.'
   where work_state in ('taslak', 'ceviri')
     and updated_at < now() - interval '2 minutes';
end;
$$;
revoke execute on function public.tr_is_kurtar() from public, anon, authenticated;

select cron.schedule('triyaj-is-kurtar', '* * * * *', 'select public.tr_is_kurtar()');
