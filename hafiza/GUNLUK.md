# Çalışma günlüğü (Claude'un sohbetler arası hafızası)

Bu dosya sohbet geçmişinin yerini tutar. ARCHITECTURE.md **kararları**, bu dosya **süreci** tutar: ne konuşuldu, ne denendi, ne yarım kaldı, kullanıcı ne dedi. Nasıl kullanılacağı aşağıdaki "İş akışı" bölümünde (CLAUDE.md kural 13).

**Depo herkese açık:** buraya şifre, anahtar, kişisel e-posta, telefon ve proje dışı özel hayat bilgisi yazılmaz. Kişisel bilgiler Claude'un kendi hafızasında kalır.

---

## İş akışı (her sohbette aynen uygulanır — Enes'in isteği, 19 Ekim)

1. **Başlarken:** `git pull` → ARCHITECTURE.md → ORTAK_CALISMA.md → bu dosyanın "Şu an", "Çalışma biçimi", "Teknik notlar" bölümleri ve son 3 günlük kaydı. Enes'e tek cümleyle "şuradan devam ediyoruz" de; baştan anlattırma.
2. **Çalışırken:** Her iş parçası bitince (yayına çıkınca ya da bir karar verilince) bugünün başlığı altına kayıt ekle ve gönder. Sohbetin sonunu bekleme: sohbet her an kesilebilir (limit, kapanma).
3. **Kayda ne girer:** ne yapıldı; ne konuşuldu ve hangi seçenekler sunuldu; Enes ne dedi, neyi beğendi, neyi beğenmedi (mümkünse kendi kelimeleriyle); ne denendi ve olmadı; ne yarım kaldı; kimi ne bekliyoruz.
4. **Bitirirken / limit yaklaşınca:** "Şu an" bölümünü güncelle, gönder, Project'teki kopyayı (`claude/GUNLUK.md`) güncelle.
5. **Kalıcı karar** ise ayrıca ARCHITECTURE.md karar günlüğüne; ekibin göreceği değişiklikse `yenilikler.json`'a.
6. Eski kayıtlar silinmez; dosya çok büyürse 2 haftadan eski günler `hafiza/arsiv/AAAA-AA.md`'ye taşınır.

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
- Sohbetler uzayınca yeni sohbete geçmekten tedirgin; bu günlük o yüzden var. Obsidian gibi ayrı bir sistem yerine bu depoda tutmayı seçti; Supabase'i de sordu, GitHub seçildi (iki Claude da doğrudan okuyabiliyor, sürümlü, bedava) (19 Ekim). "Her detay girsin, bu bir iş akışı olsun, yeni sohbet buna devam etsin" dedi.

## Teknik notlar (Claude için; tekrar aynı duvara çarpmamak için)

- **Supabase bağlantısı (connector):** 19 Ekim'de Enes'e kurulumu önerildi. Kuruluysa veritabanı sorguları ve fonksiyon yayını **bağlantıyla** yapılır, Chrome sekmesiyle değil (aşağıdaki Chrome yöntemleri sadece yedek). Fatih'in Claude'unda bağlantı büyük ihtimalle kurulu. Ders: oturum başında hangi bağlantıların var olduğuna bak; 12-19 Ekim arası bu yapılmadığı için Chrome üzerinden zahmetle çalışıldı.

- **Supabase SQL:** Yıkıcı (silme içeren) sorgularda Supabase onay ister; o düğmeye Enes basar, Claude basamaz. Normal sorgular Claude'un açtığı SQL Editor sekmesinde çalışır.
- **Fonksiyon yayını (CLI yok):** Supabase → Edge Functions → fonksiyon → Code; Monaco'ya kod GitHub'ın raw adresinden `fetch` ile alınıp `monaco.editor.getModels()[0].setValue()`; sonra "Deploy updates" ve açılan pencerede yine "Deploy updates" (pencerede JS `.click()` çalışmadı, gerçek tıklama gerekti). Yayın oldu mu: üstte "a few seconds ago".
- **Arka plandaki Chrome sekmesi donar:** zamanlayıcı ve `fetch` çalışmaz, komutlar zaman aşımına düşer. Çözüm: yeni sekme açıp orada çalış.
- **Bu çalışma ortamının internet çıkışı kısıtlı:** status.supabase.com, updated-studio.github.io gibi adreslere komut satırından erişilemiyor; bu kontroller Enes'in Chrome'undaki Stüdyo sekmesinden `fetch` ile yapılır.
- **GitHub Pages yayını** bazen 10-15 dk sürüyor; "yayında" demeden önce Actions'ın bittiğini ve dosyanın sitede olduğunu kontrol et.
- **Supabase arka plan işi** ~150 sn'de kesiliyor; uzun işler süre bütçesiyle yazılır (taslak 115 sn).
- **Ücretsiz çeviri ucu** (translate.googleapis.com) sunucudan çalışmıyor, tarayıcıdan çalışıyor.
- **Gemini ücretsiz kota** sabah sıfırlanıyor; dolunca Groq yedeği.
- **Ekran testi:** Playwright `executablePath: /opt/pw-browsers/chromium`; 375 px genişlikte açık/koyu tema ekran görüntüsü alıp bak.
- `pkill` komutu Claude'un kendi kabuğunu da öldürebiliyor; önizleme sunucusunu kapatmak için kullanma.

## Günlük (en yeni üstte)

### 19 Ekim 2026
- Fatih #1-#23 değişikliklerini PR ile birleştirmiş (otomatik taslak + WordPress'e taslak gönderimi, görsel seçimi, üslup ve kalite kontrolü, kümeleme ve gömme, migration 0014-0018). Çektim, İçerik'e dokunulmamış.
- İki kişinin aynı anda çalışması konuşuldu: ORTAK_CALISMA.md (kurallar + iki Claude'un not panosu) ve CLAUDE.md kural 12 eklendi; Fatih'in Claude'una ilk not bırakıldı.
- ARCHITECTURE bölüm 19: İçerik modülünün bugünkü durumu (tek dosyalık araç, sadece 4:5, şablon aileleri Cam/Dergi/Vizör/Fiş, kayıtlar tarayıcıda) ve planı.
- Hafıza konusu: Enes yeni sohbete geçişte bilgi kaybından endişeli; "md her şeyi kapsamıyor" dedi. Obsidian'ı sordu (şimdilik hayır: iki yerde tutmak eskir, kurulum yükü, 5 Kasım yakın). Supabase'i sordu (anlık ve bedava ama Claude'lar onu ancak tarayıcıdan okuyabiliyor, uygulama verisiyle karışır; GitHub seçildi). Bu günlük, iş akışı ve teknik notlar eklendi; CLAUDE.md kural 13.
- Sürekli yeni sohbet açmak istemiyor: öneri her iş alanına tek uzun soluklu sohbet; yeni sohbet sadece konu değişince ya da sohbet pahalılaşınca.

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
