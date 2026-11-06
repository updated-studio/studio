# UPDATED Motion

Kodla video üretimi (Remotion + Claude). Reels, Shorts ve YouTube içeriklerini **bizim görsel kimliğimizle**, istediğimiz hikâyeyle üretir.
Başlangıç noktası: Higgsfield'deki "Claude Motion" yazısı ve `launch-motion` skill'i (orijinali `vendor/`).

```
fikir/haber ──► brief ──► storyboard (sahne + kare) ──► video.json + sahneler ──► check ──► stills (Claude bakar, düzeltir) ──► render ×3
```

## Kurulum
```bash
cd uygulamalar/motion
npm install
npm run setup          # marka (public/marka'dan), fontlar, ses
npm run studio         # canlı önizleme
```

## Claude ile yeni video
Bu klasörde Claude Code açın (`.claude/skills/launch-motion` yüklenir). Örnek istek:

> haber şablonundan "pixel-11-tanitim" adıyla 15 sn reels yap. Başlık: … Kaynak: … Üç madde: … 
> check + stills çalıştır, karelere bakıp düzelt, 9:16 / 16:9 / 4:5 render et.

Elle:
```bash
npm run new -- pixel-11-tanitim --from haber   # şablonu kopyalar; src/projects/index.ts'e ekleyin
npm run check -- pixel-11-tanitim
npm run stills -- pixel-11-tanitim
npm run render -- pixel-11-tanitim             # out/<id>/yyyy-aa-gg-<slug>-reels.mp4 / -youtube.mp4 / -ig.mp4
```

## Şablonlar
| id | Ne | Hareket |
|---|---|---|
| `haber` | Haber reels/shorts: Son dakika etiketi, siyah blokta başlık, üç madde, kaynak, "devamı sitede", logo. 15 sn. | dinamik |
| `demo` | Arayüz animasyonu referansı: imleç, kamera zoom, panel, durum etiketleri, sayaç. 30 sn. | kit |

## Marka
Tek kaynak deponun kendisi: `public/marka/makine/tokens.json` (değerler) ve `public/marka/logo/svg/` (logolar).
`npm run brand` bunları `brand/brand.json` ve `public/brand/logo/`'ya çeker; elle değer yazılmaz.

**Görsel kimlik her videoda sabit:** renkler, Big Shoulders başlık / Plex Sans metin / Plex Mono rakam, köşe 0, siyah başlık bloğu, turuncu etiket (siyah yazı), logo SVG.
**Hareket profili videoya göre:**
- `src/lib/motion.ts` → **kit**: marka kiti §13 (tek eğri, zıplama/döndürme/paralaks/daktilo yok). Arayüz, tanıtım.
- `src/lib/motion-dinamik.ts` → **dinamik**: hafif overshoot'lu girişler, kaskadlar. Reels/shorts/YouTube içerikleri.
Sahne dosyasında import yolunu değiştirmek profili değiştirir.

## Müzik (Epidemic Sound)
Bağlayıcı kurulunca Claude parçayı bulup `public/audio/`'ya indirir. Kurulana kadar: parçayı Epidemic'ten indirip `public/audio/` altına koyun,
`video.json → audio.music` alanına yazın. `public/audio/music-placeholder.wav` sentetik yer tutucudur, yayına çıkmaz.

## Klasörler
| | |
|---|---|
| `src/lib/` | `brand.ts` (marka), `motion.ts` / `motion-dinamik.ts` (hareket), `layout.ts` (merkez-tabanlı yerleşim, güvenli alanlar), `fonts.ts` |
| `src/components/` | `Stage/At/Fill`, `Camera`, `Cursor/Click`, `Counter`, `Kinetic/HeadBlock`, `Background`, `Window`, `Logo` |
| `src/projects/<id>/` | `video.json` (süre + bütün metin, tek kaynak), `scenes/`, `Video.tsx` |
| `scripts/` | `brand`, `setup`, `check`, `stills`, `render`, `new` |
| `.claude/skills/launch-motion/` | Claude'un iş akışı ve kuralları |
