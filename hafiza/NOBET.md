# Nöbet: iş sırası

Kullanıcı 6 Kasım 2026'da "nöbeti kur" dedi. Sunucudaki zamanlayıcı (`updated-nobet.timer`) 30 dakikada bir bakar. Sunucudaki hiçbir sohbet son 20 dakikada çalışmadıysa ve "Sırada"da iş varsa Claude'u başlatır. Claude işleri sırayla yapar, denetimden geçirip gönderir, sonucu aşağıya yazar. Kota dolarsa durur, kota yenilenince sonraki turda kaldığı yerden devam eder.

- Kurallar: `/opt/updated/calisma/nobet/kurallar.md` (denetimsiz gönderim yok, silme yok, göç yok, karar isteyen iş atlanır).
- Nöbetin kendi kopyaları: `/opt/updated/calisma/nobet/site`, `/opt/updated/calisma/nobet/studio`. Kayıtlar: `/opt/updated/calisma/nobet/kayit/`.
- Durdurmak: sohbette "nöbeti durdur" yeter. Teknik olarak `/opt/updated/calisma/nobet/DURDUR` dosyası ya da `sudo systemctl disable --now updated-nobet.timer`.
- İş eklemek: kullanıcı sohbette söyler, sohbetteki Claude buraya "Sırada"nın sonuna ekler. Her iş tek madde, ne isteniyor ve kullanıcının kendi sözü.

## Sırada
- [ ] (6 Kasım 2026, kullanıcı onayı) **Videolar ve Reels'te kategori etiketi.** Sitede haber kartlarında kategori etiketi var, video ve Reels kartlarında yok. Önce nerede eksik olduğunu ve verinin nereden geldiğini bul. Kategori verisi mevcutsa haber kartlarındaki etiketle aynı biçimde göster. Veri yoksa ve yeni bir kaynak ya da tasarım kararı gerekiyorsa işi "Atlandı"ya al ve seçenekleri yaz.

## Sürüyor
- [~] (başladı 6 Kasım 2026 15:38) (6 Kasım 2026, kullanıcı onayı) **Çekim listesi Stüdyo aramasında çıksın.** Üst çubuktaki arama (`src/shared/Arama.tsx`, Ctrl/⌘+K) bölümleri, haberleri, taslakları, notları, işleri ve künyeleri arıyor; çekim listesi yok (`src/modules/editor/cekimListesi.ts`, ekranı `Cekim`). Çekim listesindeki kayıtları da aramaya ekle, sonuç ilgili çekim kaydını açsın. Arayüz aynı düzende kalsın. Sahte veriyle 1440 ve 390 px ekran görüntüsüyle dene.

## Bitti
- [x] 6 Kasım 2026 15:37 · **Ölçek denetimi paralel.** `cakisma.mjs` aynı anda 2 sekme açıyor; aynı derlemede 288 sn yerine 153 sn, 3 sekmeyle 122 sn, sonuçlar ve sıralama birebir aynı, bilerek taşma eklenmiş sayfada eski ve yeni aynı 23 sorunu buldu. Varsayılan 2: 3 sekme başka bir ağır işle çakışınca takas doldu; ayrıca yük altında çöken ölçüm artık bir kez yeniden deneniyor, olmazsa sorun sayılıyor. Denenmeyen: `site-dene.sh` denetimi `sirali.sh` kilidinin dışında çalıştırıyor, nöbet betiği olduğu için dokunulmadı. Site kaydı bd6fb3d, ayrıntı site DURUM.md.

## Atlandı

## Öneriler (kullanıcının onayını bekliyor, nöbet bunlara dokunmaz)

## Rapor
