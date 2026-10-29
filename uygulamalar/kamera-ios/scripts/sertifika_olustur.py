"""Bir kez çalışır (Actions → iOS → Run workflow → "sertifika-olustur"): kalıcı bir Apple Development sertifikası açar.
Neden: GitHub'ın Mac makinesi her yüklemede sıfırdan geldiği için Xcode her seferinde yeni sertifika açıyor, temizlik betiği
eskileri iptal ediyordu; Apple her açılış ve iptalde e-posta gönderiyor. Kalıcı sertifika (anahtarıyla birlikte .p12 olarak
GitHub Secrets'ta: SERTIFIKA_P12) bir kez açılır, sonraki yüklemeler onu kullanır; ne yeni sertifika ne iptal, ne e-posta.
Kullanım: python sertifika_olustur.py <AuthKey.p8> <istek.csr> <cikti.cer>  (ASC_KEY_ID ve ASC_ISSUER_ID ortamdan).
Günlüğe ad ve kimlik yazılmaz (depo açık)."""
import base64
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
csr = open(sys.argv[2]).read()
govde = json.dumps({"data": {"type": "certificates", "attributes": {"certificateType": "DEVELOPMENT", "csrContent": csr}}}).encode()
istek = urllib.request.Request(ADRES + "/v1/certificates", data=govde, method="POST",
                               headers={"Authorization": "Bearer " + jeton, "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(istek) as yanit:
        veri = json.loads(yanit.read())
except urllib.error.HTTPError as h:
    hata = h.read().decode(errors="replace")
    print("::error title=Sertifika::Apple sertifikayı vermedi (HTTP %d). Sınır dolduysa eski 'Created via API' sertifikaları "
          "developer.apple.com → Certificates'te iptal edin." % h.code)
    print(hata[:600])
    sys.exit(1)
a = veri["data"]["attributes"]
open(sys.argv[3], "wb").write(base64.b64decode(a["certificateContent"]))
print("Sertifika açıldı: tür %s, son kullanma %s" % (a.get("certificateType"), (a.get("expirationDate") or "")[:10]))
