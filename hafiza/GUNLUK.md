# Çalışma günlüğü (Claude'un sohbetler arası hafızası)

Bu dosya sohbet geçmişinin yerini tutar. ARCHITECTURE.md **kararları**, bu dosya **süreci** tutar: ne konuşuldu, ne denendi, ne yarım kaldı, kullanıcı ne dedi. Her Claude oturumu başında **"Şu an" ve son 3 günlük kaydını** okur (tamamını değil, ucuz kalsın); her iş parçasının sonunda kayıt ekler (CLAUDE.md kural 13).

**Depo herkese açık:** buraya şifre, anahtar, kişisel e-posta, telefon ve proje dışı özel hayat bilgisi yazılmaz. Kişisel bilgiler Claude'un kendi hafızasında kalır.

---

## Şu an (her oturumda güncellenir)

- **Son güncelleme:** 19 Ekim 2026, Enes'in Claude'u.
- **Kim ne yapıyor:** Fatih Haber Masası'nda (otomatik taslak, WordPress, görsel, kümeleme). Enes İçerik modülüne başlıyor (Instagram post aracı). Ayrıntı: ORTAK_CALISMA.md.
- **Enes'in sıradaki işi:** İçerik modülü. İlk iş: ne istediğini sorup ARCHITECTURE bölüm 19'daki sırayı birlikte netleştirmek.
- **Bekleyen (kullanıcıda):** Fatih'in GitHub/Supabase/Stüdyo davetlerini kabul etmesi (14 Ekim'de gönderildi). Natro erişimi (alan adı). Yeni marka kiti (Enes hazırlıyor).
- **Bilinen açıklar:** Kopya kart birleştirmesi geçmiş haberler için yarım. Sistem Durumu sayfası yapılmadı. Eski post aracı adresi kayıtlar taşınana kadar açık.
- **Tarihler:** Enes 5 Kasım 2026'da askere gidiyor; video aracı hariç her şey ondan önce.

## Enes'le çalışma biçimi ve geri bildirimleri (birikir, silinmez)

- Türkçe, kısa, doğrudan. Önce seçenekler ve bedelleri, sonra tek tavsiye. Teknik terim sade anlatılır.
- Teknik değil: yapması gereken adımda sayfayı aç, linki ver, ne tıklayacağını yaz. Şifre/anahtarı asla Claude girmez.
- **Engel ya da sorun olunca hemen söyle** (token/limit dahil). Sormadan karar değiştirme; önceki geri bildirimlerini geri alma (13 Ekim'de bu yüzden uyardı).
- Kalıcı silme istemeden yapılmaz. Çalışan şey yenisi bitmeden kapanmaz.
- "Ben sürekli sana yazamam": sistem kendi kendini toparlamalı, ekip Enes'e sormadan anlayabilmeli (altyapı uyarısı, hata kaynağı etiketi bu yüzden).
- Tasarımda: iOS tarzı cam görünüm, amatör görünen şeyleri sevmez (dokununca mavi kare, beyaz zeminli bildirim), simgeler uygulama ikonu gibi. Global örneklere bakılmasını ister ("globalde ne yapıyorlar").
- İsimlendirmede: anlaşılır olan kazanır (Öncelik 1/2/3 seçti; "Hemen yaz/Beklet" tutmadı).
- Tasarruf: ücretsiz kotayı korumak önemli (çeviriyi ücretsiz uca taşıma isteği, Groq yedeği).
- Sohbetler uzayınca yeni sohbete geçmekten tedirgin; bu günlük o yüzden var. Obsidian gibi ayrı bir sistem yerine bu depoda tutmayı seçti (19 Ekim).

## Günlük (en yeni üstte)

### 19 Ekim 2026
- Fatih #1-#23 değişikliklerini PR ile birleştirmiş (otomatik taslak + WordPress'e taslak gönderimi, görsel seçimi, üslup ve kalite kontrolü, kümeleme ve gömme, migration 0014-0018). Çektim, İçerik'e dokunulmamış.
- İki kişinin aynı anda çalışması konuşuldu: ORTAK_CALISMA.md (kurallar + iki Claude'un not panosu) ve CLAUDE.md kural 12 eklendi; Fatih'in Claude'una ilk not bırakıldı.
- ARCHITECTURE bölüm 19: İçerik modülünün bugünkü durumu (tek dosyalık araç, sadece 4:5, şablon aileleri Cam/Dergi/Vizör/Fiş, kayıtlar tarayıcıda) ve planı.
- Hafıza konusu: Enes yeni sohbete geçişte bilgi kaybından endişeli; "md her şeyi kapsamıyor" dedi. Bu günlük dosyası ve kural 13 eklendi.

### 14 Ekim 2026
- Taslaklar "hazırlanıyor"da takılıyordu: sebep Supabase'in arka plan işini ~150 sn'de kesmesi + yapay zekâ isteğinin süre sınırı olmaması (eski Apps Script'te 6 dk vardı) + aynı gün Supabase'te 16 saatlik fonksiyon arızası. Çözüm: süre bütçesi, nabız, dakikada bir kurtarma görevi (0013), takıldı eşiği 2 dk. Enes "3 dk çok, kendiliğinden sıfırlansın" dedi → böyle yapıldı.
- Enes isteği: Supabase kaynaklı arızada "altyapı kaynaklı" diye gösterilsin → durum sayfasından canlı uyarı + kartta hata kaynağı etiketi.
- Ekip isteği: haber saatine / sisteme düşme saatine göre yeniden eskiye sıralama; sonra "öncelik dahil zamana göre" → eklendi.
- Seviye adları: Hemen yaz/Yazılabilir/Beklet beğenilmedi; seçenekler sunuldu, Enes Öncelik 1/2/3 seçti.
- Logo: üstte UPDATED yazısı (mobilde UP), açılış ekranı arka plansız logo, ikonlar UP işaretinden; sekme ikonu yuvarlak köşeli mavi (Enes "kare duruyor" dedi). Android açılışındaki siyah daire için ikon zemini açılış rengiyle aynı yapıldı. Ana ekrandakilere bir kez "ikon yenilendi" uyarısı.
- GitHub Pages yayını o akşam 10-15 dk sürdü; Enes değişiklikleri hemen göremeyince "güncellenmedi mi" diye sordu. Ders: yayın bitmeden "yayında" deme, kontrol et.
- "Neler değişti" penceresi (yenilikler.json, kural 11).
- Eski Ekip paneli kapatıldı (yönlendirme). Eski post aracı adresi ve post otomasyonu bilerek açık bırakıldı (kayıtlar tarayıcıda, otomasyon taşınmadı).
- Fatih'e sahiplik: Enes dört daveti gönderdi (GitHub organizasyonu Owner, eski iki depo Collaborator, Supabase Owner, Stüdyo yönetici). Eski depolar organizasyona taşınmadı (adres değişirse post kayıtları kaybolur).
- ARCHITECTURE'a işletme el kitabı, sistem nasıl çalışır, eski sistemle farklar, tartışmalar ve gerekçeler, yapay zekâ talimatlarının özeti eklendi. Enes "her şey ama her şey olsun, tartışmalar da" dedi.
- Enes sordu: "Yayına hazır deyince WordPress'e gidiyor mu?" O gün gitmiyordu; Fatih sonra ekledi (#1).

### 13 Ekim 2026
- Eski triyaj (Google E-Tablolar + Apps Script) satır satır Haber Masası'na aktarıldı, Enes'in sonraki geri bildirimleri korunarak; eski tetikleyici kapatıldı. Enes, sormadan aktarım biçimi seçildiği için uyardı; sonra seçimleri tek tek kendisi verdi (öncelikli liste puanı etkilemez, herkes kendi oyu, son 3 gün, eski Docs taslakları bağlantı).
- Rakip kaynak araştırması: Webtekno, LOG, ShiftDelete ~50'şer haber; haberleri nereden aldıkları çıkarıldı (notlar Enes'in Claude oturumundaydı, yeni kaynak eklerken yeniden bakılır).
- 100 sınırı: fazlası elenmiyor, sıraya giriyor. Otomobil kapsama alındı. Rehber/liste içerikleri ayrı bölüm. Kopya haberler tek kart (Enes beğendi).
- Gemini kotası doldu → Groq yedeği + panelde kota uyarısı; elenen başlıklar ücretsiz çeviriyle Türkçe; "Haberleri şimdi topla" onaylı düğme.
- Mobil dock düzeltildi, iOS cam görünüm, bildirimler üstte.
- Alan adı konuşuldu: öneri `studio.updated.com.tr` (Natro CNAME); Enes'in onayı ve Natro erişimi bekleniyor.

### 12 Ekim 2026
- Stüdyo kuruldu: tek depo, tek giriş; Ekip, Takvim, İçerik (çerçeveyle), Marka Kiti, Haber Masası modülleri. GitHub organizasyonu `updated-studio`, Supabase projesi `updated-panel`.
