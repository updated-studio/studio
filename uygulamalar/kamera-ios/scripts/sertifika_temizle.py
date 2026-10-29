"""TestFlight yüklemesinden önce: GitHub'ın Mac makinesi her çalıştırmada Apple hesabında yeni bir geliştirme sertifikası açıyor
(makine her seferinde sıfırdan; eski sertifikanın anahtarı makineyle birlikte gidiyor). Sınır dolunca yükleme duruyor
("Your account has reached the maximum number of certificates"). Bu betik eski, API ile açılmış ("Created via API") geliştirme
sertifikalarını iptal eder; elle açılmış sertifikalara dokunmaz (Fatih'in onayı, 29 Ekim 2026). Günlüğe ad ve kimlik yazılmaz (depo açık).
Yalnız SERTIFIKA_P12 girilmemişse çalışır; kalıcı sertifika da "Created via API" adlı olduğundan o yolda çalıştırılmaz.
Kullanım: python sertifika_temizle.py <AuthKey.p8>  (ASC_KEY_ID ve ASC_ISSUER_ID ortamdan)"""
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


def iste(yol, yontem="GET"):
    istek = urllib.request.Request(ADRES + yol, method=yontem, headers={"Authorization": "Bearer " + jeton})
    with urllib.request.urlopen(istek) as yanit:
        veri = yanit.read()
        return json.loads(veri) if veri else None


liste = iste("/v1/certificates?limit=200&filter[certificateType]=DEVELOPMENT,IOS_DEVELOPMENT")["data"]
silinen = 0
for s in liste:
    a = s["attributes"]
    if "Created via API" in f"{a.get('displayName') or ''} {a.get('name') or ''}":
        iste("/v1/certificates/" + s["id"], "DELETE")
        silinen += 1
print(f"Geliştirme sertifikası: {len(liste)}, API ile açılmış ve iptal edilen: {silinen}")
