-- Haber Masası: "daha önce görüldü mü" kontrolü tek RPC ile (POST gövdesi).
-- Önceden triyaj-topla, 200 bağlantılık listeleri adres satırında (GET ?link=in.(...)) gönderiyordu;
-- her istek ~35-45 KB kayıt (log) bırakıyor, günde ~340 MB ediyordu (ücretsiz plan kayıt sınırını aşıyordu).
create or replace function public.tr_bilinen_linkler(linkler text[])
returns setof text
language sql
stable
security definer
set search_path to 'public'
as $$
  select link from public.tr_items where link = any(linkler)
  union
  select link from public.tr_seen where link = any(linkler);
$$;

revoke all on function public.tr_bilinen_linkler(text[]) from public, anon, authenticated;
grant execute on function public.tr_bilinen_linkler(text[]) to service_role;
