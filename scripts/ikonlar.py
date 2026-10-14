"""Uygulama ikonlarını tek kaynak logodan üretir.

Kullanım:  python3 scripts/ikonlar.py [kaynak.png] [zemin_rengi]
  kaynak: şeffaf zeminli logo ya da siyah zemin üstüne beyaz logo (varsayılan: src/assets/logo.png)
  zemin:  ana ekran ikonunun zemin rengi (varsayılan: #000000)

Üretilenler (public/):
  icon-180.png        iPhone ana ekran (apple-touch-icon)
  icon-192.png, icon-512.png   Android ana ekran (maskable: logo güvenli alanda, daire kesimde kırpılmaz)
  icon-seffaf-512.png Android açılış ekranı (şeffaf zemin)
  favicon-32.png      tarayıcı sekmesi
  logo.png            açılış ekranı ve üst bölüm maskesi
Logo optik merkeze oturtulur (kutu merkezi ile ağırlık merkezinin ortası): eğik logolar kayık görünmez.
"""
import sys
from PIL import Image
import numpy as np

KOK = __file__.rsplit("/scripts/", 1)[0]
kaynak = sys.argv[1] if len(sys.argv) > 1 else f"{KOK}/src/assets/logo.png"
zemin = sys.argv[2] if len(sys.argv) > 2 else "#000000"

im = Image.open(kaynak).convert("RGBA")
a = np.array(im)
alfa = a[..., 3].astype(float)
if alfa.min() == 255:  # şeffaf değil: açık renkli kısımlar logo
    alfa = np.array(im.convert("L")).astype(float)
maske = Image.fromarray(alfa.astype("uint8"))
kutu = maske.point(lambda v: 255 if v > 128 else 0).getbbox()
maske = maske.crop(kutu)
m = np.array(maske).astype(float)
ys, xs = np.nonzero(m > 128)
w, h = maske.size
# optik merkez: kutu merkezi ile ağırlık merkezinin ortası
ox = (w / 2 + xs.mean()) / 2
oy = (h / 2 + ys.mean()) / 2


def yap(boyut: int, oran: float, zeminli: bool, renk=(255, 255, 255)) -> Image.Image:
    """oran: logonun uzun kenarının ikona oranı"""
    s = boyut * oran / max(w, h)
    r = maske.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    tuval = Image.new("RGBA", (boyut, boyut), zemin if zeminli else (0, 0, 0, 0))
    katman = Image.new("RGBA", r.size, renk + (255,))
    katman.putalpha(r)
    x = round(boyut / 2 - ox * s)
    y = round(boyut / 2 - oy * s)
    tuval.alpha_composite(katman, (x, y))
    return tuval


P = f"{KOK}/public"
yap(180, 0.58, True).convert("RGB").save(f"{P}/icon-180.png", optimize=True)
yap(192, 0.50, True).convert("RGB").save(f"{P}/icon-192.png", optimize=True)   # maskable: güvenli alan %80 daire
yap(512, 0.50, True).convert("RGB").save(f"{P}/icon-512.png", optimize=True)
yap(512, 0.58, False).save(f"{P}/icon-seffaf-512.png", optimize=True)
yap(32, 0.86, True).convert("RGB").save(f"{P}/favicon-32.png", optimize=True)
# maske (beyaz, şeffaf zemin, kırpılmış): üst bölüm ve açılış ekranı
buyuk = maske.resize((w * 2, h * 2), Image.LANCZOS) if max(w, h) < 400 else maske
logo = Image.new("RGBA", buyuk.size, (255, 255, 255, 255)); logo.putalpha(buyuk)
logo.save(f"{P}/logo.png", optimize=True)
logo.save(f"{KOK}/src/assets/logo.png", optimize=True)
print("tamam:", kutu, "optik merkez kayması", round(ox - w / 2), round(oy - h / 2))
