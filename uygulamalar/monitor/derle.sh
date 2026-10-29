#!/usr/bin/env bash
# UPDATED Monitör: APK'yı sunucuda derler ve indirme klasörüne koyar (studio.updated.com.tr/indir/<gizli klasör>/updated-monitor.apk).
# Site/panel derlemeleriyle aynı anda çalışmaz (bellek), düşük öncelikli. İmza: /opt/updated/monitor-imza (yalnız sunucuda).
# Kullanım: bash uygulamalar/monitor/derle.sh ["Bu sürümde ne var"]
#           Geri dönüş (önceki sürüme): bash uygulamalar/monitor/geri-al.sh <sürüm, ör. 0.11.0>  (not, uygulamadaki güncelleme penceresinde görünür)
#           bash uygulamalar/monitor/derle.sh --yalniz-onizleme  (APK'ya ve surum.json'a dokunmadan yalnız önizleme sayfasını yeniler)
# Yayından sonra ekran testi görüntüleri <gizli klasör>/onizleme/ altına sayfa olarak konur (iPhone'dan bakmak için); test hata verirse APK yine yayında kalır.
set -euo pipefail
cd "$(dirname "$0")"
export ANDROID_HOME=/opt/android-sdk GRADLE_USER_HOME=/opt/gradle/ev
GRADLE="flock -w 1800 /run/updated-agir.lock nice -n 19 /opt/gradle/gradle-8.9/bin/gradle"
SURUM=$(grep -o 'versionName = "[^"]*"' app/build.gradle.kts | cut -d'"' -f2)
KLASOR_DOSYA=/opt/updated/monitor-imza/indir-klasoru
[ -f $KLASOR_DOSYA ] || head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n' > $KLASOR_DOSYA
K=/var/www/indir/$(cat $KLASOR_DOSYA)
mkdir -p "$K"

onizleme() {
  rm -rf app/build/ekranlar
  if $GRADLE -q :app:testReleaseUnitTest --tests '*EkranTest*' --rerun --console=plain && python3 onizleme.py app/build/ekranlar "$K/onizleme" "$SURUM" "$1" >/dev/null; then
    echo "https://studio.updated.com.tr/indir/$(cat $KLASOR_DOSYA)/onizleme/ (önizleme $SURUM)"
  else
    echo "Önizleme yapılamadı (ekran testi hata verdi); APK etkilenmedi." >&2
  fi
}
if [ "${1:-}" = "--yalniz-onizleme" ]; then
  onizleme "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("not",""))' "$K/surum.json" 2>/dev/null || true)"
  exit 0
fi

$GRADLE -q assembleRelease --console=plain
cp app/build/outputs/apk/release/app-release.apk "$K/updated-monitor.apk"
cp app/build/outputs/apk/release/app-release.apk "$K/updated-monitor-$SURUM.apk"
# Eski sürümlerin son 5'i kalır (her biri ~45 MB); geri dönüş için hangi commit'ten derlendikleri yayinlar.txt'de (geri-al.sh)
ls -t "$K"/updated-monitor-*.apk | tail -n +6 | xargs -r rm -f
# Uygulama açılışta bu dosyaya bakar; yeni sürüm varsa kendini günceller
KOD=$(grep -o 'versionCode = [0-9]*' app/build.gradle.kts | grep -o '[0-9]*')
python3 -c 'import json,sys; print(json.dumps({"kod":int(sys.argv[1]),"ad":sys.argv[2],"not":sys.argv[3],"apk":"updated-monitor-"+sys.argv[2]+".apk"},ensure_ascii=False))' "$KOD" "$SURUM" "${1:-}" > "$K/surum.json"
echo "$SURUM $KOD $(git rev-parse --short HEAD)$(git diff --quiet HEAD -- . || echo '+degisiklik') $(date -u +%FT%TZ)" >> "$K/yayinlar.txt"
echo "https://studio.updated.com.tr/indir/$(cat $KLASOR_DOSYA)/updated-monitor.apk ($SURUM)"
onizleme "${1:-}"
