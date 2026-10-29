# Insta360 Luna Ultra: Wi-Fi'dan canlı görüntü (inceleme notu, 29 Ekim 2026)

Amaç: Luna Ultra (ve X serisi) görüntüsünü telefon olmadan Masa'ya kaynak olarak almak. Kamera USB'de yalnız depolama, webcam/RTMP/HDMI yok;
canlı görüntü yalnız kameranın kendi Wi-Fi erişim noktası (AP) üzerinden Insta360 uygulamasına gidiyor. Kameraya hiçbir şey yazılmadı/yüklenmedi.

## Kesin olmayanlar önce
- **APK statik incelemesi yapılamadı:** APKPure (403, bot koruması) ve Uptodown (indirme bağlantısı JavaScript ile) sunucudan indirmeye izin vermedi.
  Aşağıdakiler Luna'ya özgü doğrulanmış bilgi değil; aynı uygulamayı ve aynı kuşağı (GO Ultra 2025, X4/X5) kullanan kameralar için yayımlanmış
  tersine mühendislik çalışmalarına dayanıyor. Luna'da doğrulama: APK'yı (APKPure'dan XAPK) bir bilgisayarda indirip proje dosyalarına koymak
  ya da doğrudan Luna ile denemek (aşağıdaki deneme planı).
- Insta360'ın resmi Camera SDK'sı X5/X4/X3/X2 içindir; belgesinde Luna geçmiyor. SDK'da Android Wi-Fi bağlantısı ve H.264 önizleme var.

## Protokol (ONE RS, One R ve GO Ultra'da aynı; Luna'da büyük olasılıkla aynı)
- Kamera AP'si: kamera `192.168.42.1`, istemci DHCP ile `192.168.42.x`. GO Ultra AP'si 5 GHz; Luna Wi-Fi 6.
- Denetim ve görüntü **aynı TCP bağlantısında, kapı 6666**. Her paket: `[uzunluk 4 bayt LE, kendisi dahil][yük]`.
- Yük türleri (ilk 3 bayt):
  - `06 00 00` + `syNceNdinS`: eşleşme; bağlanınca istemci gönderir, kamera aynısını döner.
  - `05 00 00`: canlı tutma; iki taraf da ~2 sn'de bir.
  - `04 00 00`: komut/yanıt. Komut: `04 00 00 [komut 2B LE] 02 [sıra 3B LE] 80 00 00 [protobuf]`. Yanıt kodu 200 tamam, 500 hata (`Error{code,message}`),
    8208/8198 bildirim.
  - `01 00 00`: **görüntü verisi**. 12 baytlık başlıktan sonra (zaman damgası ms + 8 bayt bilinmeyen) **ham H.265 Annex B**
    (GO Ultra'da 1920×1080 30 fps; One R'da da HEVC). Resmi SDK X4/X5 önizlemesini H.264 diye anlatıyor; Luna'nın hangisini verdiği denenince belli olur.
- Komutlar: 1 StartLiveStream, 2 StopLiveStream, 3 TakePicture, 4 StartCapture, 5 StopCapture, 7 SetOptions, 8 GetOptions, 13 GetFileList …
  `StartLiveStream` alanları: enableVideo/enableAudio, audioType, audioSampleRate, audioBitrate, videoBitrate, resolution, resolution1/videoBitrate1
  (ikinci akış), previewStreamNum, enableGyro, enableRotate, isForLive. GO Ultra'da boş istek yetiyor.
- Bağlantı sırası: eşleşme → canlı tutma → SetOptions (saat eşitleme) → GetOptions (model, yazılım sürümü) → StartLiveStream → `01` paketleri akar.
- Protobuf tanımları uygulamanın `libOne.so` dosyasından çıkarılmış (RigacciOrg/insta360-wifi-api `pb2/`).

## Yetki
- Yeni tanımlarda `RequestAuthorization`, `CheckAuthorization`, `AuthorizationResult`, `CancelRequestAuthorization` var. Yeni kameralar ilk bağlanan
  istemci için kameranın ekranında "izin ver" sorabilir; GO Ultra çalışmasında gerekmediği yazıyor. Luna'da hata 500 dönerse bu akış eklenir.
- Bir inceleme yazısı: uygulama bağlanınca Luna'nın kendi ekranı kararıyor ve tuşları kilitleniyor (denetim uygulamaya geçiyor). Masa'dan bağlanınca da
  aynısı beklenmeli; kayıt kameradan değil Masa'dan yapılır.

## Kameranın başka ağa katılması (istasyon / STA)
- Tanımlarda `SetWifiConnectionInfo { WifiConnectionInfo { ssid, password, ip_addr } }`, `GetWifiConnectionInfo`, `CameraWifiConnectionResult`
  ve `SetWifiSeize` mesajları var. Bu, kameranın bir yönlendiriciye (ofis Wi-Fi'ı) katılabildiği bir mod olduğunu düşündürüyor; ancak hangi
  modellerde çalıştığı ve nasıl tetiklendiği doğrulanmadı (APK incelemesiyle ya da Pi'den denemeyle netleşir).
- İşe yararsa en iyi durum: her kamera doğrudan ofis ağına katılır, Pi'de kamera başına Wi-Fi çubuğu gerekmez; köprü yalnız 6666'ya bağlanıp görüntüyü
  Masa'ya verir.

## Hedef mimari: Raspberry Pi köprü kutusu
```
[Luna 1 AP] ~5 GHz~ [USB Wi-Fi çubuğu 1]┐
[Luna 2 AP] ~5 GHz~ [USB Wi-Fi çubuğu 2]┼─ Raspberry Pi ── Ethernet ── ofis ağı ── Masa (iPad / Android)
[X serisi]  ~5 GHz~ [USB Wi-Fi çubuğu 3]┘
```
- Pi her çubukla bir kameranın AP'sine bağlanır (hepsi 192.168.42.1 olduğundan her arayüz ayrı ağ ad alanında ya da kaynak arayüze bağlı soketle),
  6666'ya bağlanıp akışı başlatır, `01` paketlerinden H.265 Annex B'yi çıkarır.
- Masa'ya mevcut **AgYayin** biçimiyle verir (Bonjour `_updatedkam._tcp`, başlık JSON, paketler); ad ör. "Luna · 1".
- **Kodek:** AgYayin şu an H.264. Pi'de yeniden kodlamak yerine (Pi 5'te H.264 donanım kodlayıcı yok) AgYayin başlığına `"kodek":"hevc"` alanı
  eklenip Masa'nın çözücüsü HEVC'yi de açmalı (Android MediaCodec, iOS VideoToolbox ikisi de HEVC çözer). En az gecikme ve en iyi kalite bu.
- Donanım: Raspberry Pi 5 (4 GB) + kamera başına Linux'ta hazır sürücülü 5 GHz USB Wi-Fi çubuğu (ör. MediaTek MT7612U/MT7921AU) + Ethernet.
  Görüntü yalnız aktarıldığı için bir Pi birkaç kamerayı taşır.
- Yazılım: tek dosyalık köprü (Python ya da Go), systemd hizmeti; kamera koparsa yeniden bağlanır, canlı tutmayı gönderir.

## Deneme planı (Luna elde, kameraya yazma yok)
1. Bir bilgisayar/Pi ile Luna'nın Wi-Fi'ına bağlan; 6666'ya eşleşme + GetOptions gönder: model ve yazılım sürümü dönüyor mu?
2. StartLiveStream (boş) gönder: `01` paketleri geliyor mu, H.265 mi H.264 mü, çözünürlük/fps?
3. Hata 500 olursa yetki akışını dene (kameranın ekranında onay).
4. GetWifiConnectionInfo oku; SetWifiConnectionInfo ile ofis ağına katılmayı dene (geri almak: kamerayı yeniden başlat / ağ ayarlarını sıfırla).
5. Sonuca göre: AgYayin'a HEVC + köprü yazılımı.

## Kaynaklar
- RigacciOrg/insta360-wifi-api (ONE RS; Python, protobuf tanımları): https://github.com/RigacciOrg/insta360-wifi-api
- Rigacci, Insta360 Wi-Fi protokolü notları: https://www.rigacci.org/wiki/doku.php/doc/appunti/hardware/insta360_one_rs_wifi_reverse_engineering
- Daiki-Iijima/insta360-go-ultra-sdk (GO Ultra; canlı H.265, Pi Zero 2W + USB Wi-Fi ile köprü): https://github.com/Daiki-Iijima/insta360-go-ultra-sdk
- NiklasVoigt/Insta360-Livestream (One R; APK + tcpdump ile canlı akış): https://github.com/NiklasVoigt/Insta360-Livestream
- Insta360 geliştirici SSS (resmi SDK; X serisi, H.264 önizleme): https://onlinemanual.insta360.com/developer/en-us/resource/integration
