"""Uygulama ikonlarını tek kaynak logodan üretir.

Kullanım:  python3 scripts/ikonlar.py [kaynak.png] [zemin_rengi] [favicon_rengi]
  kaynak: şeffaf zeminli işaret ya da siyah zemin üstüne beyaz işaret (varsayılan: assets/marka/up-isaret.png)
  zemin:  ana ekran ikonunun zemini (varsayılan: #1B1D21, açılış ekranıyla aynı; dikiş görünmesin)
  favicon_rengi: sekme ikonunun zemini, köşeleri yuvarlatılmış kare (varsayılan: marka mavisi #2563FF)
Üst bölümdeki "UPDATED" yazısı ayrı dosyadır (src/assets/logo.png, kaynağı assets/marka/updated-yazi.png); bu betik ona dokunmaz.

Üretilenler (public/):
  icon-180.png        iPhone ana ekran (apple-touch-icon)
  icon-192.png, icon-512.png   Android ana ekran (maskable: logo güvenli alanda, daire kesimde kırpılmaz)
  icon-seffaf-512.png Android açılış ekranı (şeffaf zemin)
  favicon-32.png      tarayıcı sekmesi
  favicon.png         tarayıcı sekmesi (64 px, yuvarlak köşeli, marka mavisi)
  isaret.png          açılış ekranı maskesi (beyaz işaret, şeffaf)
Logo optik merkeze oturtulur (kutu merkezi ile ağırlık merkezinin ortası): eğik logolar kayık görünmez.
"""
import sys
from PIL import Image
import numpy as np

KOK = __file__.rsplit("/scripts/", 1)[0]
kaynak = sys.argv[1] if len(sys.argv) > 1 else f"{KOK}/assets/marka/up-isaret.png"
zemin = sys.argv[2] if len(sys.argv) > 2 else "#1B1D21"
fav_zemin = sys.argv[3] if len(sys.argv) > 3 else "#2563FF"

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
yap(180, 0.60, True).convert("RGB").save(f"{P}/icon-180.png", optimize=True)
yap(192, 0.52, True).convert("RGB").save(f"{P}/icon-192.png", optimize=True)   # maskable: güvenli alan %80 daire
yap(512, 0.52, True).convert("RGB").save(f"{P}/icon-512.png", optimize=True)
yap(512, 0.60, False).save(f"{P}/icon-seffaf-512.png", optimize=True)

# Sekme ikonu: yuvarlak köşeli mavi kare (köşeler şeffaf), 4x büyük çizip küçült: kenarlar pürüzsüz
from PIL import ImageDraw
B = 256
fav = Image.new("RGBA", (B, B), (0, 0, 0, 0))
ImageDraw.Draw(fav).rounded_rectangle([0, 0, B - 1, B - 1], radius=round(B * 0.24), fill=fav_zemin)
zemin_yedek = zemin
zemin = (0, 0, 0, 0)
fav.alpha_composite(yap(B, 0.64, False))
zemin = zemin_yedek
fav.resize((64, 64), Image.LANCZOS).save(f"{P}/favicon.png", optimize=True)

# Açılış ekranı maskesi (beyaz işaret, şeffaf, kırpılmış)
olcek = 600 / max(w, h)
kucuk = maske.resize((round(w * olcek), round(h * olcek)), Image.LANCZOS)
isaret = Image.new("RGBA", kucuk.size, (255, 255, 255, 255)); isaret.putalpha(kucuk)
isaret.save(f"{P}/isaret.png", optimize=True)
print("tamam:", kutu, "optik merkez kayması", round(ox - w / 2), round(oy - h / 2))
