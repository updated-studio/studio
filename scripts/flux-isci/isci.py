#!/usr/bin/env python3
"""Updated Stüdyo · Flux işçisi (Fatih'in Mac'i, çevrimdışı görsel üretimi).

Haber Masası'nda uygun fotoğrafı bulunamayan taslaklar için yazısız, gerçekçi bir görsel üretir ve taslağa yükler.
Çalışma: dakikada bir Stüdyo'ya "bekleyen iş var mı?" diye sorar → varsa FLUX.1-schnell ile (Apple Silicon, mflux) üretir →
JPEG olarak yükler. Görsel taslağın öne çıkan görseli olur; WordPress'te taslak açılmışsa oraya da eklenir. Yayın kararı editörde.

Model: FLUX.1-schnell (Apache 2.0, ticari kullanım serbest). FLUX.1-dev ticari kullanıma kapalı olduğu için kullanılmaz.
Ayar: ~/updated-flux/ayar.json  {"adres": "...functions/v1/triyaj-taslak", "token": "<Supabase Secrets'taki FLUX_TOKEN>"}
"""
import base64, io, json, os, subprocess, sys, tempfile, time, urllib.request

KLASOR = os.path.expanduser("~/updated-flux")
AYAR = json.load(open(os.path.join(KLASOR, "ayar.json")))
ADIM = int(AYAR.get("adim", 4))          # schnell için 2-4 adım yeterli
EN, BOY = 1344, 768                      # 16:9'a yakın, WordPress öne çıkan görsel


def istek(govde: dict, sure: int = 60) -> dict:
    govde = {**govde, "token": AYAR["token"]}
    r = urllib.request.Request(AYAR["adres"], data=json.dumps(govde).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(r, timeout=sure) as y:
        return json.loads(y.read().decode())


def uret(istem: str, cikti: str) -> None:
    komut = ["mflux-generate", "--model", "schnell", "--prompt", istem, "--steps", str(ADIM),
             "--width", str(EN), "--height", str(BOY), "--seed", str(int(time.time()) % 100000), "--output", cikti]
    if AYAR.get("quantize", 8):
        komut += ["--quantize", str(AYAR.get("quantize", 8))]
    subprocess.run(komut, check=True, timeout=900)


def jpeg(yol: str) -> bytes:
    from PIL import Image
    im = Image.open(yol).convert("RGB")
    b = io.BytesIO(); im.save(b, "JPEG", quality=88, optimize=True)
    return b.getvalue()


def tur() -> int:
    isler = istek({"flux": "isler"}).get("isler", [])
    for i in isler:
        print(time.strftime("%H:%M"), "üretiliyor:", i["id"], i.get("baslik", "")[:60], flush=True)
        try:
            with tempfile.TemporaryDirectory() as d:
                yol = os.path.join(d, "g.png")
                uret(i["istem"], yol)
                veri = jpeg(yol)
            s = istek({"flux": "yukle", "id": i["id"], "b64": base64.b64encode(veri).decode(), "mime": "image/jpeg"}, 120)
            print("  yüklendi:", s, flush=True)
        except Exception as e:  # noqa: BLE001
            print("  hata:", e, flush=True)
            try: istek({"flux": "hata", "id": i["id"], "mesaj": str(e)[:200]})
            except Exception: pass
    return len(isler)


if __name__ == "__main__":
    if "--bir-kez" in sys.argv:
        tur(); sys.exit(0)
    while True:
        try:
            n = tur()
        except Exception as e:  # noqa: BLE001  (internet yoksa ya da Stüdyo yanıt vermezse bekleyip yeniden dener)
            print(time.strftime("%H:%M"), "bağlantı hatası:", e, flush=True); n = 0
        time.sleep(15 if n else 60)
