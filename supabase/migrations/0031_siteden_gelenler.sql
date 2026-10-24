-- Siteden gelenler (Otomasyon 3+4, 24 Ekim 2026; Fatih ve Enes onayladı).
-- Sitede bir haber / inceleme / karşılaştırma yayınlanınca panel bu fonksiyonu çağırır (site deposu apps/cms/src/lib/icerikGelen.ts):
--   * İçerik → Siteden gelenler listesine düşer (türüne göre format: son dakika ve sızıntı Story, diğerleri Post; sponsorlu hiç gelmez),
--   * yazıyı hazırlayan (yoksa yayınlayan) ekip üyesine İşler'de iş açılır ve ona bildirim gider (bağlantı tasarımı açar).
-- Aynı yazı ikinci kez gelirse bilgisi güncellenir, ikinci iş açılmaz.

create table if not exists public.icerik_gelen (
  id bigint generated always as identity primary key,
  kaynak text not null unique,               -- 'news:12', 'reviews:3', 'comparisons:5'
  tur text not null,                          -- news | reviews | comparisons
  format text not null default 'post' check (format in ('post', 'story', 'reels')),
  baslik text not null,
  spot text not null default '',
  kategori text not null default '',
  etiket text not null default '',            -- son-dakika, sizinti, rehber, yok
  yol text not null default '',               -- sitedeki adres (/kategori/slug)
  gorsel text,                                -- kapak görselinin adresi
  ek jsonb not null default '{}'::jsonb,      -- türe özel: ürün adı, puan, karar, ürünler, alt başlıklar
  atanan uuid references public.profiles on delete set null,
  is_id bigint references public.jobs on delete set null,
  durum text not null default 'yeni' check (durum in ('yeni', 'acildi', 'hazir')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists icerik_gelen_tarih_idx on public.icerik_gelen (created_at desc);
alter table public.icerik_gelen enable row level security;
drop policy if exists icerik_gelen_okuma on public.icerik_gelen;
create policy icerik_gelen_okuma on public.icerik_gelen for select to authenticated using (is_member());
drop policy if exists icerik_gelen_durum on public.icerik_gelen;
create policy icerik_gelen_durum on public.icerik_gelen for update to authenticated using (is_member()) with check (is_member());

-- Otomatik açılan işler herkese "Havuza yeni iş eklendi" bildirimi göndermesin (yalnız işi alan kişiye bildirim gider)
create or replace function public.on_job_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('updated.oto_is', true), '') = '1' then return new; end if;
  perform notify_all('Havuza yeni iş eklendi: ' || new.brand || ' ' || new.title, auth.uid());
  return new;
end;
$$;

create or replace function public.icerik_gelen_ekle(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint; v_yeni boolean; v_kisi uuid; v_is bigint; v_tur text;
begin
  select id into v_kisi from profiles where lower(email) = lower(coalesce(p->>'eposta', '')) limit 1;
  insert into icerik_gelen as g (kaynak, tur, format, baslik, spot, kategori, etiket, yol, gorsel, ek, atanan)
  values (p->>'kaynak', p->>'tur', coalesce(p->>'format', 'post'), left(coalesce(p->>'baslik', ''), 300), left(coalesce(p->>'spot', ''), 600),
          coalesce(p->>'kategori', ''), coalesce(p->>'etiket', ''), coalesce(p->>'yol', ''), p->>'gorsel', coalesce(p->'ek', '{}'::jsonb), v_kisi)
  on conflict (kaynak) do update set baslik = excluded.baslik, spot = excluded.spot, kategori = excluded.kategori, etiket = excluded.etiket,
    yol = excluded.yol, gorsel = excluded.gorsel, ek = excluded.ek, format = excluded.format, updated_at = now()
  returning g.id, (xmax = 0) into v_id, v_yeni;
  if v_yeni then
    v_tur := case when p->>'format' = 'story' then 'Story' else 'Post' end;
    perform set_config('updated.oto_is', '1', true);
    insert into jobs (brand, category, type, title, due, status, assignee, priority, stage, brief)
    values (coalesce(nullif(p->>'marka', ''), nullif(p->>'kategori', ''), 'Updated'), coalesce(nullif(p->>'is_kategori', ''), 'kamera'), v_tur,
            left(coalesce(p->>'baslik', ''), 140), (now() at time zone 'Europe/Istanbul')::date,
            case when v_kisi is null then 'havuz' else 'atandi' end, v_kisi,
            case when p->>'etiket' = 'son-dakika' then 'acil' else 'normal' end, 'alindi',
            'Sitede yayınlandı, paylaşım görseli hazırlanacak (' || v_tur || '). İçerik → Siteden gelenler''den aç; bilgiler şablona kendiliğinden yerleşir. Yazı: https://updated.com.tr' || coalesce(p->>'yol', ''))
    returning id into v_is;
    perform set_config('updated.oto_is', '', true);
    update icerik_gelen set is_id = v_is where id = v_id;
    if v_kisi is not null then
      insert into notifications (user_id, body, link) values (v_kisi, 'Yeni ' || v_tur || ' işi: ' || left(coalesce(p->>'baslik', ''), 120), '#/icerik?gelen=' || v_id);
    end if;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.icerik_gelen_ekle(jsonb) from public, anon, authenticated;
grant execute on function public.icerik_gelen_ekle(jsonb) to payload;
