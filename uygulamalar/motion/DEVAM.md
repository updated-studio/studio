# Motion — devir notu (bulut oturumundan yerele, 6 Kasım 2026)

Bu dosya, Enes'le bulutta yürütülen "Claude Motion" sohbetinin kaldığı yer. Yeni oturum önce depo kökündeki
`CLAUDE.md` → `ARCHITECTURE.md` → `ORTAK_CALISMA.md` → `hafiza/GUNLUK.md` (6 Kasım Motion kayıtları), sonra bunu okur.

## Sıradaki iş
Enes'in bilgisayarındaki **büyük bir videoyu "Motion tarzında" edit etmek**. Dosya Enes'in Mac'inde; yolunu Enes verecek.
Akış (skill'deki gibi): önce sor → **nereye?** (YouTube 16:9 / Reels-Shorts 9:16 kesitleri), hedef süre, kalacak/çıkacak yerler.
Sonra: Whisper ile kelime zamanlı döküm → sessizlik/dolgu/tekrar temizliği (autokurgu mantığı) → konuşmada geçen her özellik/rakam/ürün
o an Liquid Glass kartla ekranda (gerçek ürün görseli + künye) → kelime vurgulu altyazı → UP sol üst → isteğe bağlı Epidemic müzik
(konuşmayı bastırmaz) → kontrol kareleri (güvenli alan çizgileri) → hızlı önizleme → onay → tam render. Kaynak 4K ise hafif kopya ile çalış.
Remotion'da kaynak video: `<OffthreadVideo src={staticFile('media/<id>/kaynak.mp4')} />`, kesitler `startFrom`/`endAt` ile.

## Enes'in kararları (kalıcı)
- Görsel kimlik sabit, hikâye serbest; içerik videolarında **dinamik** hareket + **Liquid Glass** (`components/LiquidGlass.tsx`).
- **Her söylenen ekranda görünür** (kelime zamanına bağlı: `at(sahne, kelime)`), ses yeni şey söylerken görüntü aynı kalmaz.
- **Ürünler gerçek görüntüyle** (üreticinin basın görselleri / kullanıcının çekimi), künyeli; ürün çizilmez.
- Seslendirme: favoriler **Arman**, Doğa, Duygu Eriş (ElevenLabs, **eleven_v4**). Enes kendi sesini klonlayacak (Starter'da anlık klon açık).
- Altyazıda doğru yazım (`altyaziGoster`: ƒ/1.48, %50, 400 mm); ses doğal okur.
- Her işte 3 format verilmez, sorulur. Önce önizleme, onayla tam render.
- UP sol üst (kit 1.7). 9:16 güvenli alan: üst 200, alt 420, sol 64, sağ 140 (kit 1.8).
- Kapanış Fatih üslubunda okura soru. Fatih'in video tarzı: "anlatma, göster" (konuşmasız, müzik + tek yazı, 3-2-1 kanca, sürenin çoğu ürünle çekilen görüntü).
- Firmadan gelen ürün / iş birliği videoda görünür (kit §7). Telesin videosunda "Telesin iş birliği"; ücretliyse "Sponsorlu" (soruldu, cevap bekleniyor).

## Açık işler
- `telesin-35x` önizlemesi gönderildi; Enes'in geri bildirimi, "Sponsorlu" sorusu ve Fatih'in ham çekimleri bekleniyor.
- `iphone-reels`: ses seçimi (Arman v4 / etiketli / Duygu) bekleniyor; kamera sahnesindeki hap konumu düzeltildi, yeniden önizlenmedi.
- Enes'in ses klonu kaydı.

## Mac'te kurulum
```bash
cd uygulamalar/motion
npm install
npm run setup                      # marka, fontlar, ses efekti
npm run medya -- telesin-35x       # depoya girmeyen ürün görselleri (iphone-reels için de)
npm run seslendir -- telesin-35x   # sesi yeniden üretir (ElevenLabs)
```
- **ElevenLabs anahtarı** bulut ortamına kayıtlıydı, Mac'te yok: Enes elevenlabs.io → Developers → API Keys'ten bir anahtar oluşturur,
  terminalde `export ELEVENLABS_API_KEY=...` (anahtar koda/depoya yazılmaz). `seslendir.mjs` bu değişkeni okur.
- **Epidemic Sound** bağlayıcısı hesaba bağlı; müzik `video.json → audio.epidemic` kaydından yeniden bulunur/indirilir.
- Render Mac'te: `remotion.config.ts` bulut Chromium'u yoksa Remotion'ın kendi indirdiğini kullanır (ilk render'da iner).

## Komutlar
`check` · `stills` (güvenli alan çizgili kontrol kareleri) · `onizleme` (hızlı, `--scene`) · `render` · `zamanla` (sahneler sesten) ·
`seslendir` · `medya` · `brand` · `new -- <slug> --from haber`
