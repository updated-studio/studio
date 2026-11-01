-- 0061 · Editör görünümü (1 Kasım 2026, kullanıcı: "editörler ihtiyaçları hariç hiçbir şey görmesin; bazı editörler haber giriyor,
-- bazıları hem haber hem video çekiyor"; "video çekeceği zaman telefondan içeriğin türüne göre adım adım kontrol listesi").
-- 1) profiles.gorevler: kişinin Stüdyo'daki işleri (birden çok): haber, video, tasarim, sosyal. Boşsa site rolünden çıkarılır
--    (video → video, diğerleri → haber). Yalnız yönetici değiştirir (profiles_update politikası kendi satırına da izin verdiği için
--    tetikleyiciyle korunur).
-- 2) cekim_kontrol: bir işin (jobs) çekim kontrol listesinde işaretlenen maddeler. Ekip okur; işin sorumlusu ya da yönetici yazar.

alter table public.profiles add column if not exists gorevler text[];

create or replace function public.profiles_gorev_koru() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.gorevler is distinct from old.gorevler and not public.is_admin() then
    new.gorevler := old.gorevler;
  end if;
  if new.gorevler is not null then
    new.gorevler := array(select distinct g from unnest(new.gorevler) g where g in ('haber', 'video', 'tasarim', 'sosyal'));
  end if;
  return new;
end $$;
drop trigger if exists profiles_gorev_koru on public.profiles;
create trigger profiles_gorev_koru before update on public.profiles for each row execute function public.profiles_gorev_koru();

create table if not exists public.cekim_kontrol (
  job_id bigint primary key references public.jobs(id) on delete cascade,
  tur text not null,
  isaretli jsonb not null default '{}'::jsonb,
  guncelleyen uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.cekim_kontrol enable row level security;

drop policy if exists cekim_kontrol_oku on public.cekim_kontrol;
create policy cekim_kontrol_oku on public.cekim_kontrol for select to authenticated using (public.is_member());

drop policy if exists cekim_kontrol_yaz on public.cekim_kontrol;
create policy cekim_kontrol_yaz on public.cekim_kontrol for all to authenticated
  using (public.is_admin() or exists (select 1 from public.jobs j where j.id = job_id and j.assignee = auth.uid()))
  with check (public.is_admin() or exists (select 1 from public.jobs j where j.id = job_id and j.assignee = auth.uid()));

grant select, insert, update, delete on public.cekim_kontrol to authenticated;
