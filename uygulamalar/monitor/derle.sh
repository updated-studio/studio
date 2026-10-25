#!/usr/bin/env bash
# UPDATED Monitör: APK'yı sunucuda derler ve indirme klasörüne koyar (studio.updated.com.tr/indir/<gizli klasör>/updated-monitor.apk).
# Site/panel derlemeleriyle aynı anda çalışmaz (bellek), düşük öncelikli. İmza: /opt/updated/monitor-imza (yalnız sunucuda).
# Kullanım: bash uygulamalar/monitor/derle.sh
set -euo pipefail
cd "$(dirname "$0")"
export ANDROID_HOME=/opt/android-sdk GRADLE_USER_HOME=/opt/gradle/ev
flock -w 1800 /run/updated-agir.lock nice -n 19 /opt/gradle/gradle-8.9/bin/gradle -q assembleRelease --console=plain
SURUM=$(grep -o 'versionName = "[^"]*"' app/build.gradle.kts | cut -d'"' -f2)
KLASOR_DOSYA=/opt/updated/monitor-imza/indir-klasoru
[ -f $KLASOR_DOSYA ] || head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n' > $KLASOR_DOSYA
K=/var/www/indir/$(cat $KLASOR_DOSYA)
mkdir -p "$K"
cp app/build/outputs/apk/release/app-release.apk "$K/updated-monitor.apk"
cp app/build/outputs/apk/release/app-release.apk "$K/updated-monitor-$SURUM.apk"
echo "https://studio.updated.com.tr/indir/$(cat $KLASOR_DOSYA)/updated-monitor.apk ($SURUM)"
