#!/bin/bash
# Updated Stüdyo · Flux işçisi kurulumu (Mac, Apple Silicon). Tek komut: bash kur.sh
# Ne yapar: ~/updated-flux klasörü, Python ortamı, mflux (FLUX.1-schnell), ayar dosyası (token sorulur, ekrana yazılmaz),
# oturum açıldığında kendiliğinden başlayan arka plan görevi (launchd). İlk üretimde model indirilir (~20-30 GB, bir kez).
set -e
[ "$(uname -m)" = "arm64" ] || { echo "Bu kurulum Apple Silicon (M serisi) Mac içindir."; exit 1; }
K="$HOME/updated-flux"; mkdir -p "$K"
cp "$(dirname "$0")/isci.py" "$K/isci.py"
PY=$(command -v python3.12 || command -v python3.11 || command -v python3)
"$PY" -m venv "$K/env"
"$K/env/bin/pip" install -q --upgrade pip mflux pillow
if [ ! -f "$K/ayar.json" ]; then
  read -r -s -p "FLUX_TOKEN (Supabase Secrets'taki değer): " TOK; echo
  printf '{"adres":"https://fulmooonidwrqyybbkvu.supabase.co/functions/v1/triyaj-taslak","token":"%s","adim":4,"quantize":8}\n' "$TOK" > "$K/ayar.json"
  chmod 600 "$K/ayar.json"
fi
P="$HOME/Library/LaunchAgents/tr.com.updated.flux.plist"
cat > "$P" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>tr.com.updated.flux</string>
  <key>ProgramArguments</key><array><string>$K/env/bin/python</string><string>$K/isci.py</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$K/env/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$K/kayit.log</string><key>StandardErrorPath</key><string>$K/kayit.log</string>
</dict></plist>
PL
launchctl unload "$P" 2>/dev/null || true
launchctl load "$P"
echo "Kuruldu. Kayıt: $K/kayit.log  ·  Durdurmak: launchctl unload $P"
