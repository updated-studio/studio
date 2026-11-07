# Sunucu koruması (bellek dolması ve bağlantı kopmasına karşı)

7 Kasım 2026'da kuruldu. Sebep: 6-7 Kasım'da üç kez bellek doldu (OOM). Bir kez büyük bir konuşma kaydı tamamen belleğe okundu; bir kez denetim kapısı (derleme + Chromium) Stüdyo ile aynı anda çalıştı ve sohbet oturumu öldü; ardından köprü açık göründüğü halde bağlantısı koptu, sonra sunucu ağ bağlantısını tamamen kaybetti ("Network is unreachable"). Bunu yalnızca yeniden başlatmak düzeltti.

## Kural (her sohbet, nöbet, betik)

**Ağır iş = `~/bin/agir <komut>`**: derleme, `npm ci`, denetim kapısı, Chromium/Playwright, büyük Python işleri. `calisma/araclar/sirali.sh` de artık buna yönlendiriyor; eski çağrılar da korunuyor. Büyük dosyaları (konuşma kayıtları, günlükler) tamamen belleğe okuma, `grep`/`tail` ile oku.

## Parçalar

| Ne | Nerede | Ne yapar |
|---|---|---|
| Ağır iş koruyucusu | `~/bin/agir` | Aynı anda tek ağır iş (`/run/updated-agir.lock`, sunucunun site/panel yayınıyla ortak kilit). Boş bellek 1,2 GB'ın altındaysa en çok 10 dk bekler, sonra çıkış kodu 75 ile hata verir. İşi `oom_score_adj=1000` ile başlatır: bellek dolarsa önce o ölür, Stüdyo ve sohbetler değil. `systemd-run --user --scope` ile bellek tavanı koyar (1500M, takas 512M); tavanı aşan iş 137 ile öldürülür. Node işlerine `--max-old-space-size=1024`. İç içe çağrıda (`AGIR_ICINDE`) kilidi tekrar almaz. Kayıt: `~/agir.log` (başlangıç, süre, çıkış, en yüksek bellek). Ayar: `AGIR_TAVAN`, `AGIR_TAKAS`, `AGIR_MIN_MB`, `AGIR_BEKLE`, `AGIR_KILIT_BEKLE`. |
| Sıra betiği | `/opt/updated/calisma/araclar/sirali.sh` | Artık yalnızca `exec ~/bin/agir "$@"`. |
| Denetim kapısı | `/opt/updated/calisma/nobet/site-dene.sh`, `site-gonder.sh` | Derleme ve ölçek denetimi `agir` ile. Önizleme sunucusu kilidi tutmasın diye dışarıda, ama `choom -n 1000` ve 512 MB Node sınırıyla. `site-gonder.sh` 75 (bellek yetersiz/sıra dolu) ve 137 (tavanda öldürüldü) durumlarını ayrı yazar; ikisinde de gönderim yapılmaz. Eski sürümler: `calisma/nobet/kayit/*.yedek-20261107`. |
| Köprü yenileme | `~/bin/kopru-yenile` | Yalnızca tmux `claude` oturumundaki döngü kabuğunun doğrudan alt işlemi olan `claude remote-control`'ü kapatır (TERM, 15 sn sonra KILL); döngü 10 sn sonra yeniden açar. Döngü kabuğuna dokunmaz. `--kuru`: yalnızca neyi kapatacağını gösterir. **Dikkat:** sunucudaki sohbet oturumları köprünün alt işlemleri; köprü yenilenince açık sohbetler kopabilir. |
| Nöbetçi | `~/bin/nobetci`, cron her dakika | 1) tmux `claude` oturumu yoksa `bash ~/rc.sh`. 2) Köprü ekranının son satırlarında 5 dakika üst üste bağlantı hatası varsa (Reconnecting, Disconnected, connection error, poll failed, ETIMEDOUT…) ve internet çalışıyorsa `kopru-yenile` (en çok 30 dakikada bir). 3) İnternet: `api.anthropic.com`; kopuksa varsayılan yol, systemd-networkd, ağ geçidi pingi, DNS ve ens3 durumunu yazar; 5 dakikayı geçerse uyarır ve `~/bin/ag-onar` varsa onu çağırır (henüz yok, aşağıya bakın). 4) `~/bellek.log`: her dakika boş bellek, takas, yük ve en çok bellek kullanan 5 işlem. 5) Her şey `~/nobetci.log`'a. İki kayıt da 5 MB'ı geçince `.1`'e taşınır, eski `.1` silinir. Durum dosyaları: `~/.nobetci/`. |
| Döngü kaydı | `~/dongu.sh` | Köprü her açılış/kapanışta saat ve çıkış kodunu `~/claude-rc.log`'a yazar. Dosya çalışan köprü kapatılmadan değiştirildi (yeni dosya yazılıp yerine taşındı). Çalışan döngü eski kodu kullanmaya devam eder; yeni kayıt, döngü bir sonraki kez baştan açıldığında (yeniden başlatma ya da tmux oturumu yeniden kurulunca) başlar. Eski sürüm: `~/dongu.sh.yedek-20261107`. |
| Kullanıcı systemd'si | `loginctl enable-linger updated` | Root olmadan açıldı, kalıcı. `systemd-run --user` (bellek tavanı) bununla çalışıyor. |
| Crontab | `crontab -l` | `@reboot bash /home/updated/rc.sh` (eski, korundu) + `* * * * * /home/updated/bin/nobetci`. Eski crontab yedeği: `~/.nobetci/crontab.yedek-20261107`. |

## Test sonuçları (7 Kasım 2026)

- `agir`: choom (oom_score_adj=1000), Node yığın sınırı (1048 MB), tavan aşımı (150M tavanda 400 MB isteyen iş 137 ile öldü), iç içe çağrı, bellek bekleme (eşik aşılmayınca 75), tek iş kilidi (ikinci iş sırada bekledi, süre dolunca 75): hepsi geçti.
- Gerçek denetim kapısı (`site-dene.sh`) koruyucunun içinden: derleme 38 sn, en yüksek 421 MB; ölçek denetimi 139 sn, en yüksek 564 MB; sonuç **Temiz**. 1500M tavan rahat yetiyor. Aynı anda başka bir oturumun derlemesi kilit boşalınca sırayla başladı.
- `kopru-yenile`: sahte döngüde köprü kapatıldı, döngü kabuğu yaşadı, 11 sn sonra yeni köprü açıldı. Gerçek köprüde `--kuru` doğru işlemi (remote-control) gösterdi, kabuğu korudu.
- `nobetci`: cron ortamında çalıştı; sahte oturumla "oturum yok → aç", "5 dk köprü hatası → yenile", "ağ kopuk → teşhis, 5 dk uyarısı, geri geldi kaydı" senaryoları geçti.

## Yapılmayanlar / açık işler

- **Android derlemesi** (`uygulamalar/monitor/derle.sh`) aynı kilidi kullanıyor ama tavansız: Gradle ayarları 1536 MB + 1024 MB yığın istiyor, 1500M tavana sığmaz. Gerekirse `AGIR_TAVAN=2600M ~/bin/agir ...` ile bağlanabilir.
- **Root ile çalışan yayın betikleri** (`updated-site-yayinla`, `updated-panel-guncelle`) aynı kilidi paylaşıyor, dolayısıyla `agir` işleriyle aynı anda çalışmıyor; ama tavanları yok (root işi, dokunulmadı).
- **Ağ kopması 5 dakikayı geçerse** root olmadan onarılamıyor: `networkctl reconfigure` ve `systemctl reboot` yönetici izni istiyor. Önerilen tek seferlik root kurulumu: root zamanlayıcısı `ag-onar` (5 dk kopuklukta `networkctl reconfigure ens3`, 10 dk'da `systemctl restart systemd-networkd`, 20 dk'da yeniden başlatma) ve systemd-networkd'ye bellek dolmasında öldürülmemesi için `OOMScoreAdjust=-900`. Kullanıcı kararı bekleniyor.
