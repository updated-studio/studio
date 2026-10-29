#!/bin/bash
# App Store Connect API anahtarını (ASC_KEY_P8 gizli bilgisi) dosyaya yazar, yolunu basar.
# Yapıştırırken satır sonları kaybolmuş ya da başlık satırları eksik olabilir: anahtar PEM biçimine yeniden dizilir.
set -e
mkdir -p ~/.appstoreconnect/private_keys
ANAHTAR=~/.appstoreconnect/private_keys/AuthKey_$ASC_KEY_ID.p8
GOVDE=$(printf '%s' "$ASC_KEY_P8" | tr -d '\r' | sed -e 's/-----[A-Z ]*-----//g' | tr -d ' \n\t')
{ echo "-----BEGIN PRIVATE KEY-----"; printf '%s' "$GOVDE" | fold -w 64; echo; echo "-----END PRIVATE KEY-----"; } > "$ANAHTAR"
# Gizli değeri göstermeden kısa denetim
if ! printf '%s' "$GOVDE" | base64 -D > /dev/null 2>&1 || [ ${#GOVDE} -lt 150 ] || [ ${#GOVDE} -gt 400 ]; then
  echo "::error title=ASC_KEY_P8::Anahtar .p8 dosyasının içine benzemiyor (uzunluk ${#GOVDE}; beklenen ~200). Dosyayı metin düzenleyiciyle açıp BEGIN'den END'e kadar tamamını yapıştırın." >&2
  exit 1
fi
echo "$ANAHTAR"
