# UPrompter (Mac)

Metni MacBook'un çentiğinin (kameranın) hemen altında akıtan teleprompter.
Sese göre, sabit hızla ya da elle kayar; ekran paylaşımında ve kayıtta görünmez.

## Kurulum (bir kez)

Terminal'i açın (Spotlight → "Terminal"), aşağıdaki satırı yapıştırıp Enter'a basın:

```bash
curl -fL https://github.com/updated-studio/studio/releases/download/uprompter/UPrompter.zip -o /tmp/UPrompter.zip && ditto -x -k /tmp/UPrompter.zip /Applications && open /Applications/UPrompter.app
```

Uygulama Uygulamalar klasörüne kurulur ve açılır. İlk "Başlat"ta Mac mikrofon ve
konuşma tanıma izni ister; ikisine de izin verin.

Tarayıcıdan indirip açmak isterseniz: zip'i açın, UPrompter'ı Uygulamalar'a sürükleyin,
ilk açılışta "açılamıyor" uyarısı gelirse Sistem Ayarları › Gizlilik ve Güvenlik'in
altındaki "Yine de Aç" düğmesine basın.

## Güncelleme

Uygulama her açılışta yeni sürüm var mı diye bakar; varsa sorar, "Şimdi güncelle"ye
basınca indirir, kapanır ve yeni sürümle açılır. Elle bakmak için:
UPrompter menüsü › Güncellemeleri Denetle…

Not: Apple geliştirici imzası eklenene kadar her güncellemeden sonra mikrofon izni
yeniden sorulabilir.

## Geliştirme

- Kod: `Sources/UPrompter/` (Swift, SwiftUI + AppKit). Xcode gerekmez; derleme GitHub'da.
- `uygulamalar/uprompter-mac/` altında bir değişiklik gönderilince
  `.github/workflows/uprompter-mac.yml` Mac sunucusunda derler (`paketle.sh`) ve
  "uprompter" yayınına `UPrompter.zip` + `surum.json` koyar. Yapı numarası = iş akışı
  çalışma numarası; uygulama güncellemeyi buna bakarak anlar.
- Sürüm adı `SURUM` dosyasında. Sürüm notu = son commit mesajının ilk satırı.
- Kısayollar (her uygulamada çalışır): ⌃⌥ Boşluk başlat/durdur, ⌃⌥ ↑↓ hız ya da geri/ileri,
  ⌃⌥ ←→ geri/ileri, ⌃⌥ R başa dön, ⌃⌥ P prompter'ı göster/gizle.
