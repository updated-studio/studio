#!/usr/bin/env bash
# UPDATED Monitör: önceki bir sürüme geri döner. Android eski versionCode'lu APK'yı yenisinin üstüne kurmaz (güncelleme ile
# düşürme yok), bu yüzden o sürümün commit'i ayrı bir çalışma kopyasında yeni (daha yüksek) versionCode ile yeniden derlenip
# derle.sh ile yayınlanır; telefonlar bunu her zamanki güncelleme gibi alır. Veriler silinmez.
# Kullanım: bash uygulamalar/monitor/geri-al.sh 0.11.0
set -euo pipefail
cd "$(dirname "$0")"
HEDEF=${1:?Kullanım: geri-al.sh <sürüm>}
K=/var/www/indir/$(cat /opt/updated/monitor-imza/indir-klasoru)
COMMIT=$(awk -v s="$HEDEF" '$1==s {c=$3} END {print c}' "$K/yayinlar.txt" | sed 's/+degisiklik//')
[ -n "$COMMIT" ] || { echo "$HEDEF yayinlar.txt'de yok." >&2; exit 1; }
KOD=$(grep -o 'versionCode = [0-9]*' app/build.gradle.kts | grep -o '[0-9]*')
SON=$(awk '{print $2}' "$K/yayinlar.txt" | sort -n | tail -1)
YENI=$(( (KOD > SON ? KOD : SON) + 1 ))
D=$(mktemp -d /tmp/geri-al-XXXX)
git worktree add -q --detach "$D" "$COMMIT"
trap 'git worktree remove --force "$D"' EXIT
M="$D/uygulamalar/monitor"
sed -i "s/versionCode = [0-9]*/versionCode = $YENI/; s/versionName = \"[^\"]*\"/versionName = \"$HEDEF-geri\"/" "$M/app/build.gradle.kts"
cp derle.sh "$M/derle.sh"
bash "$M/derle.sh" "Önceki sürüme ($HEDEF) geri dönüldü."
echo "Not: depodaki versionCode $KOD; bir sonraki normal yayında versionCode $YENI'den büyük olmalı."
