# Monitör tasarım dili (iPhone · iPad · Android)

Fatih (30 Ekim 2026 10:41): "Monitörün arayüzü hâlâ eski; iPhone, iPad ve Android'de menüler farklı, tasarımlar da farklı olmalı.
Güvendiğin bir uygulamanın iOS ve iPadOS sürümünün tasarım dilini özetle, ona göre kur."

## Örnek alınan uygulama: Blackmagic Camera (iOS + iPadOS)

Neden: profesyonel çekim/monitör işinde en yaygın, iPhone ve iPad'de aynı mantığı farklı düzenle kuran, Apple'ın tanıtımlarında da kullanılan uygulama.
Final Cut Camera ve Apple Kamera (iOS 26) cam malzemesi ikinci referans.

Özeti:
1. **Görüntü her şeyden önce.** Kenardan kenara; arayüz yalnız kenarlarda, dokununca saklanır.
2. **Üstte değer hücreleri.** Kare hızı, enstantane, diyafram, zaman kodu (ortada, büyük), ISO, beyaz denge, pozlama. Küçük etiket üstte, büyük değer altta. Hücreye dokununca hemen altında ince seçenek şeridi açılır (ayrı sayfa yok).
3. **Sağda kayıt sütunu.** Ayarlar, büyük kırmızı kayıt düğmesi ortada, son kayıt ve kalan alan altta.
4. **Solda/altta araçlar.** Odak yardımı, zebra, false color, kılavuz, LUT: tek dokunuşla aç/kapa; açık olan dolu renk.
5. **Ayarlar sekmeli.** Kayıt · Görüntü · Ses · Ortam gibi sekmeler, her sekmede başlıklı gruplar.
6. **iPad farkı:** aynı mantık, daha çok yer: etiketli araçlar, alt şeritte ölçümler (histogram, ses), ayarlar görüntüyü kapatmayan yan panel.

## Bizim uygulamamız (UpCam Studio Monitör)

| | iPhone | iPad | Android |
|---|---|---|---|
| Üst | Değer hücreleri; dikeyde zaman kodu ayrı satırda | Cam durum çubuğu (hücreler + zaman kodu tek satır) | iPhone ile aynı |
| Araçlar | Yuvarlak cam düğmeler, yalnız simge | Alt cam çubukta etiketli araçlar + histogram + ses | Yuvarlak düğmeler |
| Kaynak/büyüt/odak/temiz/düzen | Yatayda sol sütun, dikeyde alt satır (cam kareler) | Solda cam araç rayı | iPhone ile aynı |
| Kayıt | Yatayda sağ sütun, dikeyde alt ortada | Sağda cam kayıt sütunu | iPhone ile aynı |
| Ayarlar | Alttan açılan cam sayfa (tutamaçlı, üst %30 görüntü kalır) | Sağda cam denetçi panel (görüntü görünür kalır) | Alttan sayfa |
| Sekmeler | Kapsül sekmeler: KAYNAK · GÖRÜNTÜ · STİLLER · KADRAJ · ÖLÇÜM · KAYIT | Aynı | Aynı |

Ortak dil: Apple cam malzemesi (iOS 26, öncesinde yarı saydam siyah + yarım piksel hat), tek yazı ailesi, tablo rakamları, sarı yalnız seçili/elle değişmiş değerde, kırmızı yalnız kayıtta, sönümlü yay geçişleri (Kamera ile aynı: `spring(response: 0.34, dampingFraction: 0.9)`).
