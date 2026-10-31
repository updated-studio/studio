-- Gemini kullanım sayacı (31 Ekim 2026, kullanıcı: "neden kota bu kadar doluyor, neler kotayı harcıyor, her işlem tek tek"):
-- her Gemini isteği hangi fonksiyondan, hangi modelle, nasıl sonuçlandı, gün gün sayılır. Google kotayı model başına ve Pasifik günü
-- (UTC-8) sayar; gün de öyle tutulur. Yazan: fonksiyonlardaki ortak anahtar.ts (fetch sarmalayıcı, service role). Okuyan: Stüdyo →
-- Bağlantı anahtarları → Gemini (yalnız yönetici). Anahtar değeri tutulmaz.
create table if not exists public.gemini_kullanim (
  gun date not null,
  fonk text not null,
  model text not null,
  basarili integer not null default 0,
  kota integer not null default 0,
  hata integer not null default 0,
  primary key (gun, fonk, model)
);
alter table public.gemini_kullanim enable row level security;
drop policy if exists gemini_kullanim_yonetici on public.gemini_kullanim;
create policy gemini_kullanim_yonetici on public.gemini_kullanim for select to authenticated using (public.is_admin());

create or replace function public.gemini_say(p_fonk text, p_model text, p_sonuc text)
returns void language sql security definer set search_path = public as $$
  insert into public.gemini_kullanim (gun, fonk, model, basarili, kota, hata)
  values ((now() at time zone 'Etc/GMT+8')::date, left(p_fonk, 40), left(p_model, 60),
          (p_sonuc = 'basarili')::int, (p_sonuc = 'kota')::int, (p_sonuc = 'hata')::int)
  on conflict (gun, fonk, model) do update set
    basarili = gemini_kullanim.basarili + excluded.basarili,
    kota = gemini_kullanim.kota + excluded.kota,
    hata = gemini_kullanim.hata + excluded.hata;
$$;
revoke execute on function public.gemini_say(text, text, text) from public, anon, authenticated;
grant execute on function public.gemini_say(text, text, text) to service_role;
