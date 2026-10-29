# Insta360 Luna Ultra: Wi-Fi'dan canlı görüntü (inceleme notu, 29 Ekim 2026)

Amaç: Luna Ultra (ve X serisi) görüntüsünü telefon olmadan Masa'ya kaynak olarak almak. Kamera USB'de yalnız depolama, webcam/RTMP/HDMI yok;
canlı görüntü yalnız kameranın kendi Wi-Fi erişim noktası (AP) üzerinden Insta360 uygulamasına gidiyor. Kameraya hiçbir şey yazılmadı/yüklenmedi.

## Kesin olmayanlar önce
- **Güncel (29 Ekim akşam):** Luna'ya özgü protokol aşağıda, "Luna UCD2 protokolü (APK incelemesi)" bölümünde. Ondan önceki bölümler
  eski kuşak (ONE RS/GO Ultra) bilgisi; Luna'da çerçeve farklı.
- İlk denemede APK statik incelemesi yapılamamıştı: APKPure (403, bot koruması) ve Uptodown (indirme bağlantısı JavaScript ile) sunucudan indirmeye izin vermedi.
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

## Luna Ultra ilk ham döküm (29 Ekim, iPhone deneme aracı, 192.168.42.1:6666)
- Luna, **eski çerçeveyi (`syNceNdinS`) kullanmıyor**. Bağlanınca, istemci bir şey göndermeden, saniyede bir 16 baytlık bir paket yolluyor:
  `55 43 44 32 | 01 | 0c | 05 | SS 00 00 00 | 00 | T0 T1 T2 T3`
  - `UCD2` imza; `01` sürüm; `0c` = imzadan sonraki başlık uzunluğu (12); `05` mesaj türü (nabız/selam);
    `SS` sıra (1, 2, 3 … artıyor; muhtemelen 32 bit LE); `00` (yük uzunluğu 0 olabilir); son 4 bayt denetim değeri.
- **Denetim değeri çözüldü (doğrusal yapı):** Ardışık paketlerdeki son 4 baytın XOR farkları sıra numarasının değişen bitleriyle birebir
  tekrarlıyor; yani değer sıra numarasının doğrusal (affine) bir işlevi: **CRC-32, polinom 0x04C11DB7, MSB önce (MPEG-2/BZIP2 ailesi),
  sonuç küçük-endian yazılmış.** Sıra baytından sonra CRC hesabına 16 bayt daha giriyor (paketin kalanı 8 bayt; yani hesapta kabloda
  görünmeyen ~8 bayt ya da standart dışı başlangıç değeri var). Sabit kısım `C = 0xA5E7194C` (sıra=0 için değer, LE) ile 8 örneğin
  hepsi birebir tutuyor: `T(sıra) = C xor CRC32lin(sıra baytı + 16 sıfır bayt)`.
- Standart CRC-32/MPEG-2, BZIP2, POSIX (başlangıç/çıkış FFFFFFFF/0 bileşimleri, başlığın tüm alt aralıkları, sıfır dolgulu) tam eşleşmiyor.
  Kalan sabit, büyük olasılıkla kabloda olmayan bir oturum/cihaz değeri (ör. Bluetooth'tan alınan anahtar, seri no) ya da özel başlangıç değeri.
- Sonuç: **şifreleme değil, CRC.** Aynı uzunluktaki (16 bayt) paketlerin denetim değerini artık hesaplayabiliyoruz; farklı uzunluktaki
  paketler için gizli 8 baytlık kısmın ne olduğu gerekiyor (APK ya da ikinci döküm).
- Sonraki zararsız denemeler (kameraya yazma yok):
  1. Bağlantıyı kapatıp yeniden aç, ve kamerayı kapatıp aç: iki yeni döküm. `C` aynı kalıyorsa cihaz sabiti (seri/anahtar), değişiyorsa oturum değeri.
  2. Kameranın nabzını aynen geri gönder (yankı) ve bizim sıra numaramızla, yukarıdaki formülle hesaplanmış bir `05` nabzı gönder;
     kamera farklı türde (01/02/…) bir paket gönderiyor mu bak.
  3. Kameranın seri numarasını ve Wi-Fi adını not et (gizli kısım bunlardan türetiliyor olabilir).

## Luna UCD2 protokolü (APK incelemesi, 29 Ekim akşam)
Kaynak: Fatih'in paylaştığı üçüncü taraf "LunaLive 0.1.49" APK'sı (Luna'dan canlı yayın yapan bağımsız bir uygulama; Kotlin, yerel kitaplık yok).
Yalnız statik inceleme (dexdump); hiçbir şey çalıştırılmadı, kameraya bir şey yazılmadı. Aşağıdakiler protokol bilgisi; kod alınmadı.
APK sha256: 3cc24010aa243f3b55d76b350b1654bd288d10ca1e719bcd8fae61fa934ff36d

**Çerçeve** (her yön aynı; tüm sayılar küçük-endian):
```
0  4  "UCD2" (55 43 44 32)
4  1  sürüm = 01
5  1  başlık uzunluğu = 0c (12)
6  1  tür: 01 medya, 04 komut/yanıt/bildirim, 05 nabız (selam)
7  1  sıra (gönderenin sayacı, 8 bit)
8  4  gövde uzunluğu N (en çok 8 MB)
12 N  gövde
12+N 4 denetim değeri
```
- **Denetim değeri** = bayt 0 … 12+N-1 üzerinden CRC: başlangıç FFFFFFFF; her bayt değerin **en düşük** baytına XOR'lanır, sonra 4 kez
  "8 bit sola kaydır, tablo[en üst bayt] ile XOR" (tablo: MSB-önce polinom 04C11DB7). Son XOR yok; sonuç LE yazılır.
  Kameranın nabzı için hesap tutuyor: sıra 0 → `4c 19 e7 a5` (önceki notlardaki `C = 0xA5E7194C`), yani gizli bayt yok.
- **İstemci nabzı/selamı:** 16 bayt: `UCD2 01 0c 05 [sıra] 00 00 00 00` + sabit `f6 cc 4f 09` (CRC hesaplanmıyor, sabit gönderiliyor;
  kamera kabul ediyor). Bağlanınca bir kez, sonra 3 sn'de bir, sıra artarak.
- **Komut gövdesi** (tür 04): `[komut 2B] 02 [istek no 2B] 00 80 00 00 [protobuf]`. Yanıt da tür 04: bayt 0-1 yanıt kodu (200 tamam, 500 ret),
  bayt 3-4 aynı istek no, 9'dan sonrası protobuf. Kod ≥ 8192 olanlar bildirim (8195 pil, 8201 kayıt durdu).
- **Medya** (tür 01): gövde bayt 0 alt akış (0x20 = görüntü), 9 baytlık medya başlığından sonrası **H.265 Annex B** erişim birimi
  (başlangıç kodlu; anahtar kare = NAL 16-23 ya da VPS/SPS). Uygulama 1280×720 HEVC çözücü açıyor.

**Bağlantı sırası:**
1. Kameranın Wi-Fi'ı (SSID "Luna Ultra…"), `192.168.42.1:6666` TCP (Nagle kapalı).
2. Selam gönder, 1,5 sn bekle. Kamera bağlantıyı kapatırsa: başka telefonda Insta360 uygulaması açık (kamera tek istemci kabul ediyor).
3. 3 sn'de bir selam (canlı tutma).
4. **Yetki:** komut 39 (CheckAuthorization), protobuf {1: uygulama kimliği (metin, UUID), 2: 2}; yanıtı 30 sn'ye kadar bekle
   (kameranın ekranında onay isteyebilir). Biz kendi kimliğimizi üretmeliyiz (başka uygulamanınkini kullanmıyoruz).
5. Komut 118 (dosya erişim durumu) {1: 5}: bundan sonra gimbal park konumundan çıkıyor.
6. **Canlı görüntü:** komut 1 (StartLiveStream) protobuf {2:1, 6:40, 7:9, 8:1, 9:40, 10:18} (alan anlamları: eski tanımlarda
   2 enableAudio?, 6/9 çözünürlük kodu, 7/10 bit hızı/ikinci akış olabilir; ham değerler bu). Sonra tür 01 paketleri akar.
- Diğer komutlar: 2 StopLiveStream, 4 StartCapture {1: …}, 5 StopCapture, 8 GetOptions {1: 40, 1: 41 …} (40 foto alt modu, 41 video alt modu,
  11 pil), 9 SetPhotographyOptions (zoom: seçenek 53), 49 ekranı aç, 56 bekleme modu {1:1}, 226 gimbal (alt komut 1 hareket ±100, 2 ortala, 3 selfie).
- Protobuf düz: varint alanlar (anahtar = alan<<3), metin/bayt alanlar (anahtar = alan<<3|2).

**Bluetooth (Wi-Fi'ı açmak için):** GATT hizmeti `0000be80-0000-1000-8000-00805f9b34fb`, yazma `be81`, bildirim `be82` (CCCD 2902).
Aynı UCD2 çerçevesi BLE üzerinden de gidiyor: komut 33 kameranın Wi-Fi'ını aç, GetOptions 36 Wi-Fi adı/şifresi, 56 bekleme/uyandırma.
Yani kamera beklemedeyken telefon/Pi BLE ile uyandırıp Wi-Fi'ı açtırabilir, şifreyi alıp bağlanabilir.

**Sonuç / yapılacak:** Önceki iOS deneme aracı eski çerçeveyi gönderiyordu; Luna onu tanımıyor. Deneme aracına yukarıdaki selam + 39 + 118 + 1
eklenince görüntünün gelmesi bekleniyor. Görüntü HEVC; Masa/AgYayin için `"kodek":"hevc"` planı geçerli.
