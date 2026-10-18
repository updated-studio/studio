-- Haber Masası güncellemesi (ARCHITECTURE.md, 18 Ekim 2026; Fatih): son kalite kontrolü, 30 dk'da bir olay kümeleme,
-- Flux görsel kuyruğu, Türkiye gündemi ve Türkçe kaynaklar. Silme yok; sütun, depo, görev ve kaynak ekler.

-- Taslak: son kalite kontrolünün durumu (bekliyor → calisiyor → tamam | hata) ve sonucu (sorunlar, önem, ana sayfa adaylığı)
alter table public.tr_drafts add column if not exists qc_state text not null default '';
alter table public.tr_drafts add column if not exists qc jsonb not null default '{}'::jsonb;
alter table public.tr_drafts add column if not exists qc_at timestamptz;
create index if not exists tr_drafts_qc_idx on public.tr_drafts (qc_state, qc_at);

-- Flux görselleri için herkese açık depo (yükleme sadece sunucu fonksiyonundan, FLUX_TOKEN ile)
insert into storage.buckets (id, name, public) values ('haber-gorsel', 'haber-gorsel', true) on conflict (id) do nothing;

-- 30 dakikada bir olay kümeleme (triyaj-topla {kumele:true}); otomatik taslak turlarından (3,13,23...) önce
create or replace function public.tr_kumele_kick() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://fulmooonidwrqyybbkvu.supabase.co/functions/v1/triyaj-topla',
    body := '{"kumele": true}'::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 1000);
end;
$$;
revoke execute on function public.tr_kumele_kick() from public, anon, authenticated;
select cron.schedule('triyaj-kumele', '1,31 * * * *', 'select public.tr_kumele_kick()');

-- Türkiye gündemi (Google Trends TR; sadece teknoloji konuları kalır) ve rakip olmayan güvenilir Türkçe kaynaklar
insert into public.tr_sources (category, name, url, active) values
  ('Türkiye gündemi', 'Google Trends TR', 'https://trends.google.com/trending/rss?geo=TR', true),
  ('Türkiye', 'Anadolu Ajansı Bilim-Teknoloji', 'https://www.aa.com.tr/tr/rss/default?cat=bilim-teknoloji', true),
  ('Türkiye', 'TRT Haber Bilim-Teknoloji', 'https://www.trthaber.com/bilim_teknoloji_articles.rss', true),
  ('Türkiye', 'Samsung Newsroom Türkiye', 'https://news.samsung.com/tr/feed', true)
on conflict (url) do nothing;

select 'kalite kontrol, kümeleme, flux tamam' as sonuc;
