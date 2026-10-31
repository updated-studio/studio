-- Davet tetikleyicisi döngüsü (31 Ekim 2026): invites_davet "FOR EACH STATEMENT ... UPDATE OF davet_gonderildi" idi. notify-email her
-- çalışmada davetleri işaretlemek için invites'a UPDATE gönderir; hiçbir satır değişmese de deyim tetikleyicisi çalışır ve notify-email'i
-- yeniden çağırır: kendi kendini besleyen döngü. 30 Ekim'de dakikada ~170, günde ~160 bin çağrı (sunucu işlemcisini boşa yakıyordu).
-- Artık satır başına ve yalnız gönderilmemiş davette (davet_gonderildi boş: yeni davet ya da "Daveti yeniden gönder") tetiklenir.
drop trigger if exists invites_davet on public.invites;
create trigger invites_davet
  after insert or update of davet_gonderildi on public.invites
  for each row when (new.davet_gonderildi is null)
  execute function public.kick_davet();
