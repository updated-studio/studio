-- Hareket geçmişi: geriye dönük doldurma (28 Ekim 2026, kullanıcı: "geçmişe dönük olanlar görünmüyor, gösterebilir miyiz").
-- Kayıt tutulmaya başlamadan öncesi için elimizdeki izler tek seferlik aktarılır (tekrar çalıştırılabilir; var olanı eklemez):
--  · Haber Masası hareketleri (tr_activity: gerçek kişi ve zaman)
--  · Paneldeki içeriklerin oluşturulması (kişi: iş akışı sahibi, yoksa yazar) ve yayını (kişi: onaylayan, yoksa yazar)
--  · Panele girişler (açık oturum kayıtları)
-- Bu kayıtlar "geriye_donuk" işaretlidir; kişi bilgisi tahminidir (ekranda "geçmiş kayıt" etiketi). Silinenler geri getirilemez: izleri yok.

insert into public.hareketler (zaman, kaynak, kim_id, kim_eposta, kim_ad, islem, tur, nesne_id, baslik, ayrinti)
select a.created_at, 'studyo', a.actor, coalesce(p.email, ''), coalesce(nullif(a.actor_name, ''), 'Sistem'), 'haber_masasi', 'tr_items', coalesce(a.item_id::text, ''),
  left(coalesce(a.kind, '') || ': ' || coalesce(a.title, ''), 300), jsonb_build_object('tur', a.kind, 'hedef', a.target_name, 'not', a.note, 'baglanti', a.link, 'geriye_donuk', true)
from public.tr_activity a left join public.profiles p on p.id = a.actor
where not exists (select 1 from public.hareketler h where h.tur = 'tr_items' and h.zaman = a.created_at and h.nesne_id = coalesce(a.item_id::text, ''));

do $$
declare t text;
begin
  foreach t in array array['news', 'reviews', 'comparisons'] loop
    execute format($q$
      insert into public.hareketler (zaman, kaynak, kim_eposta, kim_ad, islem, tur, nesne_id, baslik, ayrinti)
      select n.created_at, 'panel', coalesce(u.email, ''), coalesce(u.name, au.name, ''), 'olustur', %1$L, n.id::text, left(coalesce(n.title, ''), 300), jsonb_build_object('geriye_donuk', true)
      from payload.%1$I n left join payload.users u on u.id = n.workflow_owner_user_id left join payload.authors au on au.id = n.author_id
      where not exists (select 1 from public.hareketler h where h.tur = %1$L and h.islem = 'olustur' and h.nesne_id = n.id::text);
      insert into public.hareketler (zaman, kaynak, kim_eposta, kim_ad, islem, tur, nesne_id, baslik, ayrinti)
      select n.published_at, 'panel', coalesce(u.email, ''), coalesce(u.name, au.name, ''), 'yayinla', %1$L, n.id::text, left(coalesce(n.title, ''), 300), jsonb_build_object('geriye_donuk', true)
      from payload.%1$I n left join payload.users u on u.id = n.workflow_approved_by_id left join payload.authors au on au.id = n.author_id
      where n._status = 'published' and n.published_at is not null
        and not exists (select 1 from public.hareketler h where h.tur = %1$L and h.islem = 'yayinla' and h.nesne_id = n.id::text);
    $q$, t);
  end loop;
end $$;

insert into public.hareketler (zaman, kaynak, kim_eposta, kim_ad, islem, tur, nesne_id, baslik, ayrinti)
select p.created_at, 'panel', '', '', 'olustur', 'products', p.id::text, left(coalesce(p.brand, '') || ' ' || coalesce(p.name, ''), 300), jsonb_build_object('geriye_donuk', true)
from payload.products p where not exists (select 1 from public.hareketler h where h.tur = 'products' and h.islem = 'olustur' and h.nesne_id = p.id::text);

insert into public.hareketler (zaman, kaynak, kim_eposta, kim_ad, islem, tur, nesne_id, baslik, ayrinti)
select p.created_at, 'panel', '', '', 'olustur', 'pages', p.id::text, left(coalesce(p.title, ''), 300), jsonb_build_object('geriye_donuk', true)
from payload.pages p where not exists (select 1 from public.hareketler h where h.tur = 'pages' and h.islem = 'olustur' and h.nesne_id = p.id::text);

insert into public.hareketler (zaman, kaynak, kim_eposta, kim_ad, islem, tur, nesne_id, baslik, ayrinti)
select s.created_at, 'panel', coalesce(u.email, ''), coalesce(u.name, ''), 'giris', 'users', u.id::text, coalesce(u.name, ''), jsonb_build_object('geriye_donuk', true)
from payload.users_sessions s join payload.users u on u.id = s._parent_id
where not exists (select 1 from public.hareketler h where h.tur = 'users' and h.islem = 'giris' and h.zaman = s.created_at and h.nesne_id = u.id::text);
