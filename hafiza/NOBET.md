# Nöbet: iş sırası

Kullanıcı 6 Kasım 2026'da "nöbeti kur" dedi. Sunucudaki zamanlayıcı (`updated-nobet.timer`) 30 dakikada bir bakar. Sunucudaki hiçbir sohbet son 20 dakikada çalışmadıysa ve "Sırada"da iş varsa Claude'u başlatır. Claude işleri sırayla yapar, denetimden geçirip gönderir, sonucu aşağıya yazar. Kota dolarsa durur, kota yenilenince sonraki turda kaldığı yerden devam eder.

- Kurallar: `/opt/updated/calisma/nobet/kurallar.md` (denetimsiz gönderim yok, silme yok, göç yok, karar isteyen iş atlanır).
- Nöbetin kendi kopyaları: `/opt/updated/calisma/nobet/site`, `/opt/updated/calisma/nobet/studio`. Kayıtlar: `/opt/updated/calisma/nobet/kayit/`.
- Durdurmak: sohbette "nöbeti durdur" yeter. Teknik olarak `/opt/updated/calisma/nobet/DURDUR` dosyası ya da `sudo systemctl disable --now updated-nobet.timer`.
- İş eklemek: kullanıcı sohbette söyler, sohbetteki Claude buraya "Sırada"nın sonuna ekler. Her iş tek madde, ne isteniyor ve kullanıcının kendi sözü.

## Sırada
- [ ] (6 Kasım 2026, kullanıcı: "şimdi başla", üç öneriyi onayladı) **Ölçek denetimini paralel çalıştır.** `site/deploy/denetim/cakisma.mjs` sayfaları sırayla açıyor: 20 sayfa × 8 genişlik, sunucuda yaklaşık 6 dakika. Aynı anda 2 ya da 3 sekme açarak hızlandır. Kontroller ve sonuç birebir aynı kalmalı: aynı derlemede eski ve yeni sürümü çalıştır, sonuçları ve süreleri karşılaştır, bilerek taşma eklenmiş bir deneme sayfasında yenisinin de yakaladığını göster. Sunucu 2 çekirdek: bellek ve yük taşarsa sayıyı düşür. Sonucu DURUM.md'ye süreleriyle yaz.
- [ ] (6 Kasım 2026, kullanıcı onayı) **Çekim listesi Stüdyo aramasında çıksın.** Üst çubuktaki arama (`src/shared/Arama.tsx`, Ctrl/⌘+K) bölümleri, haberleri, taslakları, notları, işleri ve künyeleri arıyor; çekim listesi yok (`src/modules/editor/cekimListesi.ts`, ekranı `Cekim`). Çekim listesindeki kayıtları da aramaya ekle, sonuç ilgili çekim kaydını açsın. Arayüz aynı düzende kalsın. Sahte veriyle 1440 ve 390 px ekran görüntüsüyle dene.
- [ ] (6 Kasım 2026, kullanıcı onayı) **Videolar ve Reels'te kategori etiketi.** Sitede haber kartlarında kategori etiketi var, video ve Reels kartlarında yok. Önce nerede eksik olduğunu ve verinin nereden geldiğini bul. Kategori verisi mevcutsa haber kartlarındaki etiketle aynı biçimde göster. Veri yoksa ve yeni bir kaynak ya da tasarım kararı gerekiyorsa işi "Atlandı"ya al ve seçenekleri yaz.

## Sürüyor

## Bitti

## Atlandı

## Öneriler (kullanıcının onayını bekliyor, nöbet bunlara dokunmaz)

## Rapor
