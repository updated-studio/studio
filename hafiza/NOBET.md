# Nöbet: iş sırası

Kullanıcı 6 Kasım 2026'da "nöbeti kur" dedi. Sunucudaki zamanlayıcı (`updated-nobet.timer`) 30 dakikada bir bakar. Sunucudaki hiçbir sohbet son 20 dakikada çalışmadıysa ve "Sırada"da iş varsa Claude'u başlatır. Claude işleri sırayla yapar, denetimden geçirip gönderir, sonucu aşağıya yazar. Kota dolarsa durur, kota yenilenince sonraki turda kaldığı yerden devam eder.

- Kurallar: `/opt/updated/calisma/nobet/kurallar.md` (denetimsiz gönderim yok, silme yok, göç yok, karar isteyen iş atlanır).
- Nöbetin kendi kopyaları: `/opt/updated/calisma/nobet/site`, `/opt/updated/calisma/nobet/studio`. Kayıtlar: `/opt/updated/calisma/nobet/kayit/`.
- Durdurmak: sohbette "nöbeti durdur" yeter. Teknik olarak `/opt/updated/calisma/nobet/DURDUR` dosyası ya da `sudo systemctl disable --now updated-nobet.timer`.
- İş eklemek: kullanıcı sohbette söyler, sohbetteki Claude buraya "Sırada"nın sonuna ekler. Her iş tek madde, ne isteniyor ve kullanıcının kendi sözü.

## Sırada

## Sürüyor

## Bitti

## Atlandı

## Öneriler (kullanıcının onayını bekliyor, nöbet bunlara dokunmaz)
- Ölçek denetimini paralel çalıştırmak: sayfaları ikişer üçer açmak, kontroller aynı kalır, süre tahminen yarıya iner.
- Çekim listesi Stüdyo aramasında çıkmıyor.
- Videolar ve Reels'in kategori etiketi yok.

## Rapor
