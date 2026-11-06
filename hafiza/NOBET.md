# Nöbet: iş sırası

Kullanıcı 6 Kasım 2026'da "nöbeti kur" dedi. Sunucudaki zamanlayıcı (`updated-nobet.timer`) 30 dakikada bir bakar. Sunucudaki hiçbir sohbet son 20 dakikada çalışmadıysa ve "Sırada"da iş varsa Claude'u başlatır. Claude işleri sırayla yapar, denetimden geçirip gönderir, sonucu aşağıya yazar. Kota dolarsa durur, kota yenilenince sonraki turda kaldığı yerden devam eder.

- Kurallar: `/opt/updated/calisma/nobet/kurallar.md` (denetimsiz gönderim yok, silme yok, göç yok, karar isteyen iş atlanır).
- Nöbetin kendi kopyaları: `/opt/updated/calisma/nobet/site`, `/opt/updated/calisma/nobet/studio`. Kayıtlar: `/opt/updated/calisma/nobet/kayit/`.
- Durdurmak: sohbette "nöbeti durdur" yeter. Teknik olarak `/opt/updated/calisma/nobet/DURDUR` dosyası ya da `sudo systemctl disable --now updated-nobet.timer`.
- İş eklemek: kullanıcı sohbette söyler, sohbetteki Claude buraya "Sırada"nın sonuna ekler. Her iş tek madde, ne isteniyor ve kullanıcının kendi sözü.

## Sırada

## Sürüyor
- [~] (başladı 6 Kasım 2026 15:41) (6 Kasım 2026, kullanıcı onayı) **Videolar ve Reels'te kategori etiketi.** Sitede haber kartlarında kategori etiketi var, video ve Reels kartlarında yok. Önce nerede eksik olduğunu ve verinin nereden geldiğini bul. Kategori verisi mevcutsa haber kartlarındaki etiketle aynı biçimde göster. Veri yoksa ve yeni bir kaynak ya da tasarım kararı gerekiyorsa işi "Atlandı"ya al ve seçenekleri yaz.

## Bitti
- [x] 6 Kasım 2026 15:40 · **Çekim listesi Stüdyo aramasında.** Aramada "Çekim listesi" grubu var; tür adı ya da madde başlığı ve açıklaması eşleşince çıkıyor, sonuç çekim listesini o türde açıp maddeyi kısa süre mavi çerçeveyle gösteriyor. Sahte veriyle 1440 ve 390 px denendi, taşma yok, Stüdyo kaydı f21fcc9. Denenmeyen: gerçek oturumla Stüdyo'nun içinde.
- [x] 6 Kasım 2026 15:37 · **Ölçek denetimi paralel.** `cakisma.mjs` aynı anda 2 sekme açıyor; aynı derlemede 288 sn yerine 153 sn, 3 sekmeyle 122 sn, sonuçlar ve sıralama birebir aynı, bilerek taşma eklenmiş sayfada eski ve yeni aynı 23 sorunu buldu. Varsayılan 2: 3 sekme başka bir ağır işle çakışınca takas doldu; ayrıca yük altında çöken ölçüm artık bir kez yeniden deneniyor, olmazsa sorun sayılıyor. Denenmeyen: `site-dene.sh` denetimi `sirali.sh` kilidinin dışında çalıştırıyor, nöbet betiği olduğu için dokunulmadı. Site kaydı bd6fb3d, ayrıntı site DURUM.md.

## Atlandı

## Öneriler (kullanıcının onayını bekliyor, nöbet bunlara dokunmaz)

## Rapor
