"""App Store Connect'teki uygulamaları ve kayıtlı paket kimliklerini listeler (Actions → iOS → Run workflow → uygulama-listele).
Fatih'e "hangi paket kimliğini açtın" diye sormamak için (kural 8): günlükte yalnız uygulama adı, paket kimliği ve SKU görünür; gizli bilgi yazılmaz.
Kullanım: python uygulama_listesi.py <AuthKey.p8>  (ASC_KEY_ID ve ASC_ISSUER_ID ortamdan)"""
import json
import os
import sys
import time
import urllib.request

import jwt

ADRES = "https://api.appstoreconnect.apple.com"
an = int(time.time())
jeton = jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": an, "exp": an + 600, "aud": "appstoreconnect-v1"},
                   open(sys.argv[1]).read(), algorithm="ES256", headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})


def iste(yol):
    istek = urllib.request.Request(ADRES + yol, headers={"Authorization": "Bearer " + jeton})
    with urllib.request.urlopen(istek) as yanit:
        return json.loads(yanit.read())


print("Uygulamalar (App Store Connect):")
for u in iste("/v1/apps?limit=200&fields[apps]=name,bundleId,sku,primaryLocale")["data"]:
    a = u["attributes"]
    print(f"  - {a.get('name')} · {a.get('bundleId')} · SKU {a.get('sku')}")
print("Paket kimlikleri (Identifiers):")
for b in iste("/v1/bundleIds?limit=200&filter[platform]=IOS")["data"]:
    a = b["attributes"]
    print(f"  - {a.get('identifier')} · {a.get('name')}")
