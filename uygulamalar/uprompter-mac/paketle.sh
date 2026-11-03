#!/usr/bin/env bash
# UPrompter (Mac): derler, UPrompter.app'i paketler, zip + surum.json üretir.
# GitHub Actions'taki Mac sunucusunda çalışır (.github/workflows/uprompter-mac.yml).
# Ortam: YAPI (yapı numarası; uygulama güncellemeyi buna bakarak anlar), NOT (sürüm notu).
set -euo pipefail
cd "$(dirname "$0")"
SURUM=$(tr -d ' \n' < SURUM)
YAPI=${YAPI:-1}
NOT=${NOT:-}
KOK=${GITHUB_WORKSPACE:-$(git rev-parse --show-toplevel)}

rm -rf build && mkdir -p build
ARGS=(-c release --arch arm64 --arch x86_64)

# Derleme hatalarını GitHub'da satır satır işaretle (dışarıdan okunabilsin diye)
if ! swift build "${ARGS[@]}" 2>&1 | tee build/derleme.log; then
  grep -E ': error: ' build/derleme.log | sort -u | head -40 | while IFS= read -r l; do
    l=${l#"$KOK/"}
    if [[ $l =~ ^([^:]+):([0-9]+):([0-9]+):\ error:\ (.*)$ ]]; then
      echo "::error file=${BASH_REMATCH[1]},line=${BASH_REMATCH[2]},col=${BASH_REMATCH[3]}::${BASH_REMATCH[4]}"
    else
      echo "::error::$l"
    fi
  done
  grep -qE ': error: ' build/derleme.log || tail -30 build/derleme.log | while IFS= read -r l; do echo "::error::$l"; done
  exit 1
fi
BIN=$(swift build "${ARGS[@]}" --show-bin-path)

APP=build/UPrompter.app
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN/UPrompter" "$APP/Contents/MacOS/UPrompter"

# İkon
IS=build/AppIcon.iconset
mkdir -p "$IS"
for s in 16 32 128 256 512; do
  sips -z $s $s Kaynaklar/AppIcon-1024.png --out "$IS/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z $d $d Kaynaklar/AppIcon-1024.png --out "$IS/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$IS" -o "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>UPrompter</string>
  <key>CFBundleDisplayName</key><string>UPrompter</string>
  <key>CFBundleIdentifier</key><string>tr.com.updated.uprompter</string>
  <key>CFBundleExecutable</key><string>UPrompter</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${SURUM}</string>
  <key>CFBundleVersion</key><string>${YAPI}</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleDevelopmentRegion</key><string>tr</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.video</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSMicrophoneUsageDescription</key><string>UPrompter, siz konuştukça metni kaydırmak için mikrofonu dinler. Ses kaydedilmez.</string>
  <key>NSSpeechRecognitionUsageDescription</key><string>UPrompter, okuduğunuz yeri bulmak için konuşmanızı metne çevirir. Mümkünse bu iş Mac'in üzerinde yapılır.</string>
</dict>
</plist>
PLIST

# Apple geliştirici imzası gelene kadar yerel (ad-hoc) imza
codesign --force --sign - --timestamp=none "$APP"
codesign --verify --verbose "$APP"

ditto -c -k --sequesterRsrc --keepParent "$APP" build/UPrompter.zip

python3 - "$SURUM" "$YAPI" "$NOT" > build/surum.json <<'PY'
import json, sys
s, y, n = sys.argv[1], int(sys.argv[2]), sys.argv[3]
print(json.dumps({"surum": s, "yapi": y, "not": n,
  "url": "https://github.com/updated-studio/studio/releases/download/uprompter/UPrompter.zip"}, ensure_ascii=False))
PY
cat build/surum.json
