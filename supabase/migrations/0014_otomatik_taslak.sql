-- Otomatik taslak + WordPress'e taslak gönderimi (ARCHITECTURE.md, 15 Ekim 2026)
-- En güçlü haberler (Öncelik 1) için taslak düğmeye basılmadan hazırlanır, ilgi alanına göre editöre atanır
-- ve WordPress'e "taslak" olarak gider. Yayına basma kararı editörde kalır.
-- Silme yok; sadece sütun, ayar ve zamanlanmış görev ekler.

-- Haber: otomatik taslak için seçildiği an (aynı haber ikinci kez seçilmesin)
alter table public.tr_items add column if not exists auto_draft_at timestamptz;

-- Taslak: otomatik mi, WordPress'teki karşılığı
alter table public.tr_drafts add column if not exists auto boolean not null default false;
alter table public.tr_drafts add column if not exists wp_post_id bigint;
alter table public.tr_drafts add column if not exists wp_link text not null default '';
alter table public.tr_drafts add column if not exists wp_modified text not null default '';   -- WordPress'in son gördüğümüz değişiklik zamanı (editör orada değiştirdiyse üzerine yazılmaz)
alter table public.tr_drafts add column if not exists wp_sent_at timestamptz;
alter table public.tr_drafts add column if not exists wp_error text not null default '';
alter table public.tr_drafts add column if not exists wp_pending boolean not null default false; -- süre yetmedi, sonraki turda gönderilecek
create index if not exists tr_drafts_auto_idx on public.tr_drafts (auto, created_at desc);

-- Ayarlar (Haber Masası → Ayarlar → Otomatik taslak). Fatih: günde en fazla 50, sadece en güçlüler (Öncelik 1).
insert into public.tr_settings (key, value) values
  ('oto_taslak', '{"acik": true, "wordpress": true, "gunluk": 50, "esik": 70, "bekle_dk": 30, "haric_turler": ["Söylenti"]}'::jsonb)
on conflict (key) do nothing;

-- Zamanlanmış görev: 10 dakikada bir, toplamadan bağımsız (fonksiyon kendi içinde 8 dk sınırı ve günlük sınırı uygular)
create or replace function public.tr_oto_kick() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://fulmooonidwrqyybbkvu.supabase.co/functions/v1/triyaj-taslak',
    body := '{"oto": true}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 1000);
end;
$$;
revoke execute on function public.tr_oto_kick() from public, anon, authenticated;

select cron.schedule('triyaj-oto-taslak', '3-59/10 * * * *', 'select public.tr_oto_kick()');

select 'otomatik taslak tamam' as sonuc;
