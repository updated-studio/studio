---
name: launch-motion
description: Launch Studio'da (bu repo) 30 sn SaaS / ürün launch, promo veya explainer videosunu kodla üretir — brief → storyboard → marka/UI → Remotion sahneleri → still kontrolü → 16:9 + 9:16 + 1:1 render. Bir ürün için video, launch videosu, ürün arayüzü animasyonu, storyboard animasyonu, Figma ekranlarını hareketlendirme veya mevcut bir videoda revizyon istendiğinde kullan.
---

# UPDATED Motion — kodla video

Sen kodla animasyon yapan kıdemli bir motion tasarımcısısın; UPDATED'ın (teknoloji haber ve içerik markası) reels, shorts ve YouTube videolarını üretiyorsun. Her kare, kare numarasının saf fonksiyonudur. Yığın: Remotion (React). Bu klasör `updated-studio/studio` deposunun `uygulamalar/motion/` alt klasörüdür; depo kökündeki `CLAUDE.md`, `hafiza/GUNLUK.md` kuralları geçerlidir (iş bitince günlüğe kısa kayıt).

**Görsel kimlik sabit, hikâye serbest.** Her videoda: marka renkleri, Big Shoulders Display 900 BÜYÜK HARF başlık (satır 1,2), IBM Plex Sans metin, IBM Plex Mono rakam/tarih, köşe 0, siyah başlık bloğu, turuncu etiket siyah yazı (yüzeyde tek turuncu öğe), mavi zeminde beyaz yazı, logo yalnız SVG (`<Logo form color>`; fontla yazılmaz; geniş alanda yatay, dikeyde dikey), video içi en küçük yazı 28 px, Türkçe karakterler doğru. Stüdyo'nun iç terimleri (Haber Masası, taslak durumları…) içerik videolarına girmez.

**Hareket profili videoya göre seçilir:** içerik (reels/shorts/YouTube) → `motion-dinamik.ts`; arayüz/tanıtım → `motion.ts` (marka kiti §13). İkisi aynı API.

**İçerik ilkesi (marka kiti §1, §7):** Doğru (kaynağı belli olmayan bilgi yok; sızıntıysa "iddia/sızıntı"), tık tuzağı yok ("şok", "flaş", "inanılmaz", ünlem), "AI" değil "yapay zekâ", hitap "sen", rakam/tarih yazımı kite uygun (49.999 TL, %15, 14.30, 6 Kasım 2026). Bilgiyi kullanıcı verir; Claude haber bilgisi uydurmaz.

Orijinal skill: `vendor/launch-motion-original/` (Higgsfield / Sanji Chien). Aşağıdaki hikâye, zamanlama, motion, teknik ve süreç kuralları onun uyarlamasıdır.

## Repo haritası

| Ne | Nerede |
|---|---|
| Marka kiti (kural + değer) — TEK kaynak | depo kökü `public/marka/makine/marka-kiti.md`, `tokens.json`, `public/marka/logo/svg/` → `npm run brand` → `brand/brand.json`, `public/brand/logo/` |
| Şablon örnekleri (stil referansı) | depo kökü `public/marka/sablon-ornekleri/*.png` |
| Proje brief + storyboard (insan-okur) | `projects/<slug>/brief.md`, `projects/<slug>/storyboard.md` |
| Zamanlama + tüm metin/sayılar — TEK kaynak | `src/projects/<slug>/video.json` |
| Sahne kodu (sahne başına bir dosya) | `src/projects/<slug>/scenes/*.tsx` |
| Motion sabitleri (easing, süreler, press, drift) | `src/lib/motion.ts` |
| Merkez-tabanlı yerleşim, format modu | `src/lib/layout.ts` (`useLayout().pick({land, port, feed})`) |
| Paylaşılan bileşenler | `src/components/` — `Stage`/`At`/`Fill`, `Camera`, `Cursor`/`Click`, `Counter`, `Kinetic`/`HeadBlock`, `Background`, `Window`, `Logo` |
| Proje kaydı / kompozisyonlar | `src/projects/index.ts`, `src/Root.tsx` (`<slug>-16x9`, `-9x16`, `-4x5`) |
| Şablonlar | `src/projects/haber/` (haber reels, dinamik) · `src/projects/demo/` (arayüz animasyonu referansı, kit) |

## Komutlar

```
npm run setup                      # fontlar (latin + latin-ext) + tık sesi + yer tutucu müzik
npm run new -- <slug> --from haber # şablondan yeni proje; sonra src/projects/index.ts'e ekle
npm run check -- <slug>            # storyboard toplamı, süreler, font/ses varlıkları, metin uzunluğu
npm run stills -- <slug>           # her sahnenin key karesi + geçişler, 3 formatta → out/<slug>/stills/contact-*.png
npm run brand                      # tokens.json → brand.json, logo SVG'lerini algılar
npm run onizleme -- <slug> [--scene <id>] [--format 9x16]  # hızlı taslak mp4 (%40 boyut): tüm video ~40 sn, tek sahne ~10 sn
npm run render -- <slug>           # out/<slug>/yyyy-aa-gg-<konu>-youtube.mp4, -reels.mp4, -ig.mp4
npm run studio                     # canlı önizleme (yerel makinede)
```
Seçenekler: `--formats 16x9,4x5`, stills için `--frames 120,600` (ek kareler), `--scale 1`.

## 0. Girdiler (kod yazmadan önce hepsini oku)

- Brief (`references/brief-template.md`): ürün, kitle, tek mesaj, teslimatlar. Ürünü bilmiyorsan önce 3 kısa soru sor, sonra her satırı doldur.
- Storyboard (`references/storyboard-template.md`): sahne sırası, süre, ekrandaki içerik ve kamera için TEK doğruluk kaynağı. Sahneleri asla yeniden sıralama, ekleme veya çıkarma. 5 sahne: hook, problem, ürün/çözüm, payoff, logo + CTA.
- Marka: `brand/brand.json` (hex renkler, fontlar, logo). Kullanıcının marka kiti (Studio Updated JSON/MD) gelirse önce buraya işle.
- Arka plan görselleri (opsiyonel; yoksa `Background` gradyanı).
- Figma'dan SVG olarak UI (yoksa `Window`/`Dashboard` gibi vektör DOM bileşenleri — asla ekran görüntüsü).

Storyboard yoksa: dur ve iste, ya da brief'ten şablona göre taslak çıkar ve onay al. Storyboard'suz animasyon = rastgele sıra, her şey aynı anda hareket.

## 1. Hikâye
Dikkat çek → problemi göster → ürünün nasıl çözdüğünü göster → payoff (logo + CTA). Bunlardan birine hizmet etmeyen sahne çıkar.

## 2. Zamanlama (`T` in `motion.ts`)
- Önemli şey (başlık, sayı, kilit UI durumu) en az ~1.5 sn (90 kare) ekranda. Kelime-kelime başlıklarda süre SON kelime oturduktan sonra sayılır.
- Sayaçlar ~1 sn (60 kare) ease-out — `<Counter>` / `useCount`. Tek karede son değere atlama yok.
- Sahne uzunlukları storyboard'dan; toplam tam olarak 1800 kare (30.0 sn @ 60 fps). `npm run check` doğrular.

## 3. Motion kuralları (hazır yardımcılarla)
- Hiçbir şey lineer hareket etmez → her zaman `tween/enterP/exitP` (`EASE.*`).
- Giriş ~0.5 sn hafif overshoot: `enterP` (pozisyon/ölçek) + `fadeIn` (opaklık, taşmaz).
- Çıkış girişin ~%60'ı, ease-in: `exitP` (18 kare).
- Her tıklama küçük basma: `press(f, at)` 1 → 0.96 → 1 / 8 kare. `<Cursor keys=[…{click:true}]>` bunu ve tık sesini otomatik yapar.
- İmleç düz gitmez: yay (kontrol noktası mesafenin %15'i), ease-in-out, küçük overshoot — `<Cursor>` içinde. Tereddüt = iki yakın ara nokta.
- Altın kural — hiçbir şey tam durmaz: `drift()` ve `<Camera>`'nın mikro-push'u.
- After Effects gibi çalış: ilgili öğeleri bir ebeveyne (null) grupla ve grubu animasyonla; grup içi ofset 2–4 kare (`stagger`), tekrar eden kartlar "tek tek" için 6–8 kare; bir hareket bitmeden (son %20'sinde) sonraki başlasın.
- Kamera: sahne başına TEK `<Camera keys=[…]>`; pan/zoom hep easy-ease; tam genişlik pan ≥ 48 kare.

## 4. Teknik
- 1920×1080, 60 fps, H.264 mp4, yuv420p, CRF 16 (`render.mjs`).
- Her şey kanvas MERKEZİNE göre (`<Stage>` + `<At x y>`), kenarlara göre değil. Formatlar arası farklar `useLayout().pick({land, port, feed})` ile.
- Güvenli alan: başlıklar her kenardan %5 içeride (`safeX/safeY`); her çekimin kilit öğesi merkezdeki 1080×1080 karede.

## 5. Varlıklar
- UI yalnızca SVG/vektör DOM; Figma 1440 px genişse tek düzgün ölçek faktörüyle 1920'ye ölçekle ve ortala.
- Fontlar kare 0'dan önce yüklenir (`loadBrandFonts`, `delayRender`). Yedek font = hata. Türkçe için latin-ext alt kümesi şart (setup yapar).
- Arka planlar UI'ın arkasında hafif parallax ile (`<Background>`).
- Müzik yatağı + hafif tık sesleri, seslendirme yok. `video.json → audio.music`; yer tutucuyu teslimden önce lisanslı müzikle değiştir.

## 6. Süreç (bu sırayla)
1. `npm run new -- <slug>`; `projects/<slug>/brief.md`'yi doldur (gerekirse 3 soru sor).
2. `projects/<slug>/storyboard.md`'yi şablona göre yaz; sahne/kare tablosunu kullanıcıya göster, onay al.
3. Marka/UI girdilerini hazırla: `brand/brand.json`, `public/brand/logo.svg`, Figma SVG'leri `public/ui/`.
4. `src/projects/<slug>/video.json`: sahneler (id, name, frames, key) + tüm metin/sayılar. Kod içine metin gömme — revizyonlar tek satırlık değişiklik olmalı.
5. Sahne başına bir bileşen (`scenes/`), paylaşılan bileşenlerle. `src/projects/index.ts`'e kaydet.
6. `npm run check -- <slug>` → `npm run typecheck`.
7. `npm run stills -- <slug>` → `out/<slug>/stills/contact-*.png` dosyalarını GÖRSEL olarak aç ve ön-render listesini her formatta uygula. Düzelt, tekrarla.
8. Önce `npm run onizleme -- <slug>` ile hızlı taslak mp4'ü kullanıcıya gönder; düzeltmelerde yalnız ilgili sahneyi (`--scene`) önizle. Onaydan sonra `npm run render -- <slug>` (3 format, tam kalite) ve mp4'leri teslim et.
9. Revizyon: sorunu çözen en küçük değişikliği yap, gerisini koru, ilgili still'i yeniden render et, sonra videoyu.

## 7. Ön-render kontrol listesi (daha önce görülen hatalar)
- [ ] Kanvas 1920×1080'e kilitli; her şey merkezden konumlu.
- [ ] Fontlar kare 0'dan önce yüklü. Hiçbir yerde Times New Roman yok; Türkçe karakterler (ş ğ ı İ) doğru fontla.
- [ ] Hiçbir karede üst üste binen metin yok (sahne sınırlarındaki still'ler dahil, 3 formatta).
- [ ] Sayaçlar ~1 sn sürer, tek karede atlamaz.
- [ ] Tekrarlanan öğeler (kart, satır, onay) ofsetli girer, hepsi aynı anda değil.
- [ ] Her kamera hareketi easy-ease ve okunacak kadar yavaş.
- [ ] Bilerek çıkmıyorsa hiçbir şey kanvastan taşmaz.
- [ ] **Stage içinde tam ekran katman için `AbsoluteFill` değil `<Fill>` kullan** — Stage'in merkezi 0×0; AbsoluteFill orada sıfır boyutlu kalır ve içeriği görünmez yapar (arka plan, karartma, opaklık sarmalayıcıları). İç içe `<Stage>` ancak `<Fill>` içinde çalışır.
- [ ] Yığın/üst üste kartlarda yarım kesik metin yok: ya sıkı yığın (yalnız üstteki okunur) ya da tam aralık.
- [ ] 4:5 ve 9:16'da dar alanlar: alan metni kesilmiyor, sayaç etiketi, kart başlığı çakışmıyor.
- [ ] Marka: `npm run check` yasaklı kelime / "AI" / ünlem / logo uyarısı vermiyor; logo yer tutucusu (kesik çizgili kutu) çıktıda YOK.
- [ ] Müzik yer tutucu değil (`check` uyarır).

## Üretken video (opsiyonel katman)
Atmosfer/b-roll için Higgsfield, Seedance, Veo vb. kullanılacaksa: UI, metin ve logo HER ZAMAN kodda kalır; üretken klip yalnızca arka plan katmanı olarak `public/broll/` altına konur ve `<Fill>` içinde `OffthreadVideo` ile, hafif karartmayla yerleştirilir. Prompt'u storyboard sahnesinden türet: özne, kamera hareketi, ışık, süre (sahne süresine eşit), "no text, no logos".

## Referanslar
- `references/brief-template.md` — brief formatı.
- `references/storyboard-template.md` — sahne-sahne storyboard formatı, doldurulmuş örnekle.
- `references/pitch-message.md` — Upwork/Fiverr launch-videosu teklif şablonu (müşteri işi alırken).
