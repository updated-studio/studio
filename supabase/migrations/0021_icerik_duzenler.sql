-- İçerik: ekipte ortak "hazır düzenler". Bir slaytın serbest düzeni (katmanların yeri, boyutu, açısı, yazı boyutu, sırası)
-- ad verilip kaydedilir; başka bir habere sadece düzen uygulanır, yazılar ve görseller korunur.
create table if not exists public.icerik_duzenler (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  sablon text not null,
  serbest jsonb not null,           -- { post?: Serbest, story?: Serbest, reels?: Serbest }
  olusturan uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists icerik_duzenler_sablon on public.icerik_duzenler (sablon, created_at desc);
alter table public.icerik_duzenler enable row level security;
create policy icerik_duzen_oku on public.icerik_duzenler for select to authenticated using (is_member());
create policy icerik_duzen_ekle on public.icerik_duzenler for insert to authenticated with check (is_member() and olusturan = auth.uid());
create policy icerik_duzen_sil on public.icerik_duzenler for delete to authenticated using (olusturan = auth.uid() or is_admin());
