-- İşler: öncelik, aşama (Alındı → Çekim → Kurgu → Onay → Yayında), yedek kişi, brief, teslim linki.
-- İş sahibi aşamayı ilerletir; "Onay"a gelen işi yönetici bitirir ya da düzeltme ister.

alter table public.jobs add column if not exists priority text not null default 'normal';
alter table public.jobs add column if not exists stage text not null default 'alindi';
alter table public.jobs add column if not exists backup uuid references public.profiles on delete set null;
alter table public.jobs add column if not exists brief text not null default '';
alter table public.jobs add column if not exists link text;
alter table public.jobs add column if not exists stage_note text;
alter table public.jobs add column if not exists stage_at timestamptz;
do $$ begin
  alter table public.jobs add constraint jobs_priority_chk check (priority in ('acil','yuksek','normal','dusuk'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.jobs add constraint jobs_stage_chk check (stage in ('alindi','cekim','kurgu','onay','yayinda'));
exception when duplicate_object then null; end $$;

-- Biten iş her zaman "Yayında" aşamasındadır; bitmiş iş yeniden açılırsa baştan başlar.
create or replace function public.job_stage_sync() returns trigger language plpgsql as $$
begin
  if new.status = 'bitti' and old.status is distinct from 'bitti' then new.stage := 'yayinda'; new.stage_at := now(); end if;
  if new.status = 'havuz' then new.stage := 'alindi'; end if;
  return new;
end $$;
drop trigger if exists jobs_stage_sync on public.jobs;
create trigger jobs_stage_sync before update on public.jobs for each row execute function public.job_stage_sync();

create or replace function public.job_stage(p_job bigint, p_stage text, p_link text default null, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs; who text;
begin
  select * into j from jobs where id = p_job and status = 'atandi';
  if not found then raise exception 'Is devam etmiyor'; end if;
  if not (j.assignee = auth.uid() or j.backup = auth.uid() or is_admin()) then raise exception 'Bu isi guncelleme yetkin yok'; end if;
  if p_stage not in ('alindi','cekim','kurgu','onay') then raise exception 'Gecersiz asama'; end if;
  update jobs set stage = p_stage, link = coalesce(nullif(trim(p_link), ''), link), stage_note = nullif(trim(p_note), ''), stage_at = now() where id = p_job;
  select name into who from profiles where id = auth.uid();
  if p_stage = 'onay' then
    perform notify_admins(coalesce(who, 'Ekip') || ', "' || j.brand || ' ' || j.title || '" işini onaya gönderdi.', auth.uid());
  elsif j.stage = 'onay' and j.assignee is distinct from auth.uid() and j.assignee is not null then
    insert into notifications (user_id, body)
    values (j.assignee, 'Düzeltme istendi: "' || j.brand || ' ' || j.title || '"' || coalesce(' · ' || nullif(trim(p_note), ''), ''));
  end if;
end $$;
grant execute on function public.job_stage(bigint, text, text, text) to authenticated;
