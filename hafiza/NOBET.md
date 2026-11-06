# Nöbet: iş sırası

Kullanıcı 6 Kasım 2026'da "nöbeti kur" dedi. Sunucudaki zamanlayıcı (`updated-nobet.timer`) 30 dakikada bir bakar. Sunucudaki hiçbir sohbet son 20 dakikada çalışmadıysa ve "Sırada"da iş varsa Claude'u başlatır. Claude işleri sırayla yapar, denetimden geçirip gönderir, sonucu aşağıya yazar. Kota dolarsa durur, kota yenilenince sonraki turda kaldığı yerden devam eder.

- Kurallar: `/opt/updated/calisma/nobet/kurallar.md` (denetimsiz gönderim yok, silme yok, göç yok, karar isteyen iş atlanır).
- Nöbetin kendi kopyaları: `/opt/updated/calisma/nobet/site`, `/opt/updated/calisma/nobet/studio`. Kayıtlar: `/opt/updated/calisma/nobet/kayit/`.
- Durdurmak: sohbette "nöbeti durdur" yeter. Teknik olarak `/opt/updated/calisma/nobet/DURDUR` dosyası ya da `sudo systemctl disable --now updated-nobet.timer`.
- İş eklemek: kullanıcı sohbette söyler, sohbetteki Claude buraya "Sırada"nın sonuna ekler. Her iş tek madde, ne isteniyor ve kullanıcının kendi sözü.

## Sırada

## Sürüyor

## Bitti
- [x] 6 Kasım 2026 15:40 · **Çekim listesi Stüdyo aramasında.** Aramada "Çekim listesi" grubu var; tür adı ya da madde başlığı ve açıklaması eşleşince çıkıyor, sonuç çekim listesini o türde açıp maddeyi kısa süre mavi çerçeveyle gösteriyor. Sahte veriyle 1440 ve 390 px denendi, taşma yok, Stüdyo kaydı f21fcc9. Denenmeyen: gerçek oturumla Stüdyo'nun içinde.
- [x] 6 Kasım 2026 15:37 · **Ölçek denetimi paralel.** `cakisma.mjs` aynı anda 2 sekme açıyor; aynı derlemede 288 sn yerine 153 sn, 3 sekmeyle 122 sn, sonuçlar ve sıralama birebir aynı, bilerek taşma eklenmiş sayfada eski ve yeni aynı 23 sorunu buldu. Varsayılan 2: 3 sekme başka bir ağır işle çakışınca takas doldu; ayrıca yük altında çöken ölçüm artık bir kez yeniden deneniyor, olmazsa sorun sayılıyor. Denenmeyen: `site-dene.sh` denetimi `sirali.sh` kilidinin dışında çalıştırıyor, nöbet betiği olduğu için dokunulmadı. Site kaydı bd6fb3d, ayrıntı site DURUM.md.

## Atlandı
- 6 Kasım 2026 15:46 · **Videolar ve Reels'te kategori etiketi.** Kategori verisi yok. Videolar YouTube kanal akışından geliyor ve yalnız "Video" ya da "Shorts" bilgisi taşıyor; paneldeki video koleksiyonunun "Tür" alanı Haber, İnceleme, Karşılaştırma ya da Rehber, haber kategorisi değil ve liste boş. Reels Instagram listesinden geliyor, kategori alanı hiç yok. Seçenekler: panelde video ve Reels'e kategori alanı eklenir ve editör seçer, bu panel göçü ister; ya da kategori başlıktaki sözcüklerden otomatik tahmin edilir, kıyas sayfasındaki `KELIME` gibi, ama yanlış etiket çıkabilir; ya da "Tür" alanı etiket olarak gösterilir, bu kategori değildir.

## Öneriler (kullanıcının onayını bekliyor, nöbet bunlara dokunmaz)

## Rapor
- 6 Kasım 2026 15:47 · Nöbet turu. Bitenler: ölçek denetimi artık aynı anda 2 sekmeyle çalışıyor. Sonuç birebir aynı, süre 288 saniyeden 153 saniyeye indi. Site gönderimi derlemeyle birlikte 6 dakika yerine 3 dakika sürüyor. Stüdyo aramasında çekim listesi çıkıyor. Sonuca basınca liste o türde açılıyor, madde mavi çerçeveyle işaretleniyor. Atlanan: videolarda ve Reels'te kategori etiketi. Kategori verisi yok, üç seçenek "Atlandı"da, seçim senin. Bakman gerekenler: Stüdyo'da Ctrl+K ile arama kutusuna "ses" yaz, çekim sonucunu aç: https://studio.updated.com.tr/cekim. Gerçek oturumla denemedim. Bir de şunu gördüm: deneme betiği site-dene.sh ölçek denetimini sıra kilidinin dışında çalıştırıyor. Başka bir derlemeyle aynı anda koşunca sunucu belleği doldu, yük 110'a çıktı. Nöbet betiği olduğu için dokunmadım; denetimin de sirali.sh ile çalışmasını öneririm. Ayrıntı: site DURUM.md ve Stüdyo GUNLUK.md, 6 Kasım.
