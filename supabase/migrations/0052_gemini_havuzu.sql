-- Gemini anahtar havuzu (30 Ekim 2026, kullanıcı: "başka Google hesaplarından da ekleyebilelim; kimlerin girdiğini görüp kontrol edebilelim").
-- Her yönetici istediği kadar anahtar ekler ve hangi Google hesabından olduğunu yazar. Fonksiyonlar anahtarları sırayla kullanır
-- (supabase/functions/*/anahtar.ts): kotası dolan "kota_dolu" işaretlenir, sıradakine geçilir; ertesi gün yeniden baştan.
-- Sunucudaki ana anahtar (GEMINI_API_KEY) değeri boş satırdır (sıra 0). Tek yedek anahtar (baglanti_anahtarlari.gemini_yedek) buraya taşınır.
-- Anahtarın kendisi hiçbir ekrana dönmez: liste yalnız son 4 haneyi verir. Ekleme/silme Hareket geçmişine yazılır.
create table if not exists public.gemini_anahtarlari (
  id bigserial primary key,
  deger text,                                   -- boş: sunucudaki ana anahtar
  etiket text not null,                         -- hangi Google hesabı / not
  son4 text,
  ekleyen uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sira int not null default 100,
  durum text not null default 'bilinmiyor' check (durum in ('bilinmiyor', 'calisiyor', 'kota_dolu', 'gecersiz')),
  durum_zaman timestamptz,
  son_hata text,
  son_kullanim timestamptz
);
create unique index if not exists gemini_anahtarlari_deger on public.gemini_anahtarlari (deger) where deger is not null;
create unique index if not exists gemini_anahtarlari_ana on public.gemini_anahtarlari ((deger is null)) where deger is null;
alter table public.gemini_anahtarlari enable row level security;  -- kural yok: istemci doğrudan okuyamaz, yalnız aşağıdaki işlevler
revoke all on public.gemini_anahtarlari from anon, authenticated;

insert into public.gemini_anahtarlari (deger, etiket, sira, created_at)
select null, 'Ana anahtar (sunucu)', 0, now()
where not exists (select 1 from public.gemini_anahtarlari where deger is null);

insert into public.gemini_anahtarlari (deger, etiket, son4, ekleyen, created_at, sira)
select b.deger, coalesce(nullif(p.name, ''), 'Yedek') || ' · yedek', right(b.deger, 4), b.guncelleyen, b.updated_at, 10
from public.baglanti_anahtarlari b left join public.profiles p on p.id = b.guncelleyen
where b.ad = 'gemini_yedek' and not exists (select 1 from public.gemini_anahtarlari g where g.deger = b.deger);

create or replace function public.gemini_liste()
returns table (id bigint, etiket text, son4 text, ana boolean, ekleyen_ad text, created_at timestamptz, sira int, durum text, durum_zaman timestamptz, son_hata text, son_kullanim timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.etiket, g.son4, g.deger is null, p.name, g.created_at, g.sira, g.durum, g.durum_zaman, g.son_hata, g.son_kullanim
  from public.gemini_anahtarlari g left join public.profiles p on p.id = g.ekleyen
  where public.is_admin()
  order by g.sira, g.id;
$$;

create or replace function public.gemini_ekle(p_deger text, p_etiket text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare d text := btrim(coalesce(p_deger, '')); e text := left(btrim(coalesce(p_etiket, '')), 80); v_id bigint;
begin
  if not public.is_admin() then raise exception 'Yalnız yöneticiler'; end if;
  if length(e) < 2 then raise exception 'Hangi Google hesabından olduğunu yaz (ör. "Fatih – kişisel Gmail").'; end if;
  if d ~* '^gen-lang-client' or d ~* '^https?:' or d ~ '\s' or d !~ '^[A-Za-z0-9._-]{30,200}$' then
    raise exception 'Bu Google (Gemini) anahtarına benzemiyor. AI Studio''da anahtarın satırındaki kopyala simgesine bas; proje adını (gen-lang-client…) değil anahtarı yapıştır.';
  end if;
  if exists (select 1 from public.gemini_anahtarlari where deger = d) then raise exception 'Bu anahtar zaten listede.'; end if;
  insert into public.gemini_anahtarlari (deger, etiket, son4, ekleyen, sira)
  values (d, e, right(d, 4), auth.uid(), coalesce((select max(sira) from public.gemini_anahtarlari), 0) + 10)
  returning id into v_id;
  perform public.hareket_yaz('anahtar', 'gemini_anahtari', v_id::text, e, jsonb_build_object('islem', 'ekle', 'son4', right(d, 4)), 'studyo');
  return v_id;
end $$;

create or replace function public.gemini_sil(p_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.gemini_anahtarlari%rowtype;
begin
  if not public.is_admin() then raise exception 'Yalnız yöneticiler'; end if;
  select * into v from public.gemini_anahtarlari where id = p_id;
  if not found then return; end if;
  if v.deger is null then raise exception 'Ana anahtar sunucuda durur; buradan silinmez.'; end if;
  delete from public.gemini_anahtarlari where id = p_id;
  perform public.hareket_yaz('anahtar', 'gemini_anahtari', p_id::text, v.etiket, jsonb_build_object('islem', 'sil', 'son4', v.son4), 'studyo');
end $$;

-- Sıra değiştirme: p_yon -1 yukarı, 1 aşağı
create or replace function public.gemini_sira(p_id bigint, p_yon int)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.gemini_anahtarlari%rowtype; k public.gemini_anahtarlari%rowtype;
begin
  if not public.is_admin() then raise exception 'Yalnız yöneticiler'; end if;
  select * into v from public.gemini_anahtarlari where id = p_id;
  if not found then return; end if;
  if p_yon < 0 then select * into k from public.gemini_anahtarlari where (sira, id) < (v.sira, v.id) order by sira desc, id desc limit 1;
  else select * into k from public.gemini_anahtarlari where (sira, id) > (v.sira, v.id) order by sira, id limit 1; end if;
  if not found then return; end if;
  update public.gemini_anahtarlari set sira = k.sira where id = v.id;
  update public.gemini_anahtarlari set sira = v.sira where id = k.id;
  if v.sira = k.sira then update public.gemini_anahtarlari set sira = sira + (case when p_yon < 0 then -1 else 1 end) where id = v.id; end if;
end $$;

revoke execute on function public.gemini_liste(), public.gemini_ekle(text, text), public.gemini_sil(bigint), public.gemini_sira(bigint, int) from public, anon;
grant execute on function public.gemini_liste(), public.gemini_ekle(text, text), public.gemini_sil(bigint), public.gemini_sira(bigint, int) to authenticated;

-- Tek yedek alanı artık havuzda: eski satır silinir (değeri yukarıda taşındı)
delete from public.baglanti_anahtarlari where ad = 'gemini_yedek' and exists (select 1 from public.gemini_anahtarlari g where g.deger = baglanti_anahtarlari.deger);
