-- Yapay zekâ iş kıyasları (4 Kasım 2026, kullanıcı: "her yapay zekâyı en iyi olduğu işte kullanalım; ölçerek karar verelim; yöneticiler
-- olarak kıyaslayabilelim"). Haber eleme (triyaj-topla) ve künye çıkarma (kunye-otomatik) aynı girdiyle Gemini ve iki Claude modelinde
-- çalışır; asıl sonucu yine Gemini verir, Claude'unkiler yalnız buraya yazılır. Stüdyo → Haber Masası → Ayarlar → Ölçümler okur.
create table if not exists public.yz_kiyas (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  is_turu text not null check (is_turu in ('eleme', 'kunye')),
  nesne text not null,                       -- eleme: haberin bağlantısı; künye: kunye_oneriler.id
  model text not null,                       -- kıyas modeli; 'editor' = yöneticinin hakem kararı
  sonuc jsonb not null default '{}'::jsonb,  -- eleme: etiketler; künye: çıkarılan özellikler
  karar text,                                -- eleme: kurallardan çıkan karar (aday, elendi, belirsiz, rehber)
  sure_ms integer,
  hata text
);
create index if not exists yz_kiyas_is_zaman on public.yz_kiyas (is_turu, created_at desc);
create index if not exists yz_kiyas_nesne on public.yz_kiyas (nesne);
alter table public.yz_kiyas enable row level security;
drop policy if exists yz_kiyas_oku on public.yz_kiyas;
create policy yz_kiyas_oku on public.yz_kiyas for select to authenticated using (public.is_admin());
-- Hakem kararı: modeller anlaşamadığında yönetici Stüdyo'dan doğru kararı işaretler (model = 'editor'); başka satır yazamaz
drop policy if exists yz_kiyas_hakem on public.yz_kiyas;
create policy yz_kiyas_hakem on public.yz_kiyas for insert to authenticated with check (public.is_admin() and model = 'editor');
