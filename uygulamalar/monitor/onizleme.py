#!/usr/bin/env python3
"""Ekran testi görüntülerinden (app/build/ekranlar) telefona uygun önizleme sayfası yapar.
Kullanım: python3 onizleme.py <ekranlar klasörü> <hedef klasör> <sürüm> [not]"""
import html, os, shutil, sys
from datetime import datetime
from zoneinfo import ZoneInfo

kaynak, hedef, surum = sys.argv[1:4]
not_ = sys.argv[4] if len(sys.argv) > 4 else ""

# (bölüm adı, dosya adı öneki); sıra önemli: uzun önek önce denenir
BOLUMLER = [("Kamera", ["kamera-giris-", "kamera-"]), ("Timelapse", ["kamera-timelapse-"]), ("Ayarlar", ["kamera-ayarlar-"]),
            ("Kılavuz", ["kamera-kilavuz-", "katman-"]), ("PRO", ["pro-"]), ("Monitör", ["monitor-"])]
BOYUT = {"kucuk": "küçük telefon", "orta": "orta telefon", "buyuk": "büyük telefon"}
AD = {"kamera-giris": "Açılış seçimi", "kamera": "Vizör", "kamera-timelapse": "Timelapse", "kamera-ayarlar": "Ayarlar paneli",
      "kamera-kilavuz": "Kompozisyon kılavuzu", "katman-spiral": "Katman: spiral", "katman-oncu": "Katman: öncü çizgiler",
      "pro-port": "PRO · dikey", "pro-land": "PRO · yatay", "monitor-port": "Monitör · dikey", "monitor-land": "Monitör · yatay"}

def bolum(ad):
    en, uzun = "Diğer", 0
    for b, onekler in BOLUMLER:
        for o in onekler:
            if ad.startswith(o) and len(o) > uzun: en, uzun = b, len(o)
    return en

def etiket(ad):
    govde, _, son = ad.rpartition("-")
    if son in BOYUT: return f"{AD.get(govde, govde)} · {BOYUT[son]}"
    return AD.get(ad, ad)

pngler = sorted(f for f in os.listdir(kaynak) if f.endswith(".png"))
if not pngler: sys.exit("ekran görüntüsü yok")
shutil.rmtree(hedef, ignore_errors=True); os.makedirs(hedef)
gruplar = {}
for f in pngler:
    shutil.copy(os.path.join(kaynak, f), hedef)
    gruplar.setdefault(bolum(f[:-4]), []).append(f)

sira = [b for b, _ in BOLUMLER] + ["Diğer"]
kartlar = []
for b in sira:
    if b not in gruplar: continue
    resimler = "".join(f'<a href="{html.escape(f)}"><img src="{html.escape(f)}" loading="lazy" alt="{html.escape(etiket(f[:-4]))}"><span>{html.escape(etiket(f[:-4]))}</span></a>' for f in gruplar[b])
    kartlar.append(f"<h2>{html.escape(b)}</h2><div class=\"izgara\">{resimler}</div>")

tarih = datetime.now(ZoneInfo("Europe/Istanbul")).strftime("%d.%m.%Y %H:%M")
sayfa = f"""<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>UPDATED Kamera {html.escape(surum)} önizleme</title><style>
body{{margin:0;background:#101216;color:#e8e9eb;font:15px/1.5 -apple-system,system-ui,sans-serif;padding:16px}}
h1{{font-size:20px;margin:4px 0}} h2{{font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:#ff6b1a;margin:28px 0 10px}}
.ust{{color:#9a9ca1;font-size:13px}} .not{{background:#1e2126;border-radius:12px;padding:10px 12px;margin-top:10px}}
.izgara{{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}}
.izgara a{{color:#9a9ca1;text-decoration:none;font-size:12px}} .izgara img{{width:100%;border-radius:10px;display:block;background:#1e2126;margin-bottom:4px}}
</style></head><body><h1>UPDATED Kamera {html.escape(surum)} önizleme</h1>
<div class="ust">{tarih} · telefonsuz ekran testinden; kamera yok, görüntü alanında örnek sahne var. Resme dokununca tam boy açılır.</div>
{f'<div class="not">{html.escape(not_)}</div>' if not_ else ''}
{''.join(kartlar)}</body></html>"""
open(os.path.join(hedef, "index.html"), "w", encoding="utf-8").write(sayfa)
print(len(pngler))
