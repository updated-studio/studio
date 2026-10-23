-- Haber Masası taslakları WordPress yerine yeni sitenin paneline (Payload, panel.updated.com.tr) gider (Fatih, 23 Ekim 2026).
-- Eski wp_* kolonları geçmiş için kalır (silinmez); yeni gönderim bu kolonları kullanır. Tekrar çalıştırılabilir.
alter table public.tr_drafts add column if not exists site_id bigint;                              -- paneldeki haber numarası
alter table public.tr_drafts add column if not exists site_admin text not null default '';         -- panelde düzenleme bağlantısı
alter table public.tr_drafts add column if not exists site_onizleme text not null default '';      -- sitede "son taslak" önizleme bağlantısı
alter table public.tr_drafts add column if not exists site_guncel text not null default '';        -- panelde son gördüğümüz değişiklik zamanı (editör orada değiştirdiyse üzerine yazılmaz)
alter table public.tr_drafts add column if not exists site_gonderim timestamptz;
alter table public.tr_drafts add column if not exists site_hata text not null default '';
alter table public.tr_drafts add column if not exists site_bekliyor boolean not null default false; -- süre yetmedi, sonraki turda gönderilecek
