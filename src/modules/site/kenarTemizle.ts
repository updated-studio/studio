// Arka planı silinmiş ürün görselinin kenar temizliği (5 Kasım 2026, kullanıcı: "künyelerde fotoların kenarında koyu temada hafif beyazlık
// oluyor"): silme yazılımı ürünün çevresinde eski beyaz zeminden yarı saydam açık renkli bir şerit bırakıyor; açık temada görünmüyor,
// koyu temada beyaz çizgi oluyor. Tarayıcıda (sunucuya yük olmadan):
// 1) saydamlık sınırı 1 piksel içeri çekilir (en dıştaki yarı saydam halka atılır),
// 2) kalan yarı saydam kenar piksellerinin rengi, yanlarındaki tam opak ürün pikselinin rengiyle değiştirilir (beyaz bulaşma silinir).
// Çıktı WebP (tarayıcı desteklemiyorsa PNG); tam opak ürün pikselleri değişmez.
export async function kenarTemizle(girdi: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(girdi);
  const { width: w, height: h } = bmp;
  const tuval = document.createElement("canvas");
  tuval.width = w; tuval.height = h;
  const c = tuval.getContext("2d", { willReadFrequently: true });
  if (!c) return girdi;
  c.drawImage(bmp, 0, 0);
  const veri = c.getImageData(0, 0, w, h);
  const p = veri.data;
  const a0 = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) a0[i] = p[i * 4 + 3];
  // 1) 1 piksel aşındırma: alfa = 3×3 komşuluğun en küçüğü
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!a0[i]) continue;
    let m = a0[i];
    for (let dy = -1; dy <= 1 && m; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy, xx = x + dx;
      const v = yy < 0 || yy >= h || xx < 0 || xx >= w ? 0 : a0[yy * w + xx];
      if (v < m) m = v;
    }
    p[i * 4 + 3] = m;
  }
  // 2) Yarı saydam kenarın rengi: 2 piksel içindeki tam opak komşuların ortalaması
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, a = p[i * 4 + 3];
    if (!a || a >= 250) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
      const j = (yy * w + xx) * 4;
      if (a0[yy * w + xx] >= 250) { r += p[j]; g += p[j + 1]; b += p[j + 2]; n++; }
    }
    if (n) { p[i * 4] = r / n; p[i * 4 + 1] = g / n; p[i * 4 + 2] = b / n; }
  }
  c.putImageData(veri, 0, 0);
  const cikti = await new Promise<Blob | null>((ok) => tuval.toBlob(ok, "image/webp", 0.92));
  return cikti ?? girdi;
}

/** Dekupe (zemini şeffaf) ürün görselini künye tuvaline oturtur (6 Kasım 2026: üreticinin şeffaf PNG'si sunucuda hiç işlenmeden gelir):
 *  ürünün sınır kutusundan kırpılır, 1360×720 alana sığdırılıp 1600×900 şeffaf tuvale ortalanır (arka plan silme programıyla aynı ölçü).
 *  Şeffaf piksel bulunamazsa ya da tuval kurulamazsa görsel olduğu gibi döner. */
export async function tuvaleOturt(girdi: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(girdi);
  // Sınır kutusu en çok 3000 px'lik kopyada aranır (çok büyük dosyada bellek)
  const o0 = Math.min(1, 3000 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * o0)), h = Math.max(1, Math.round(bmp.height * o0));
  const ara = document.createElement("canvas");
  ara.width = w; ara.height = h;
  const c = ara.getContext("2d", { willReadFrequently: true });
  if (!c) return girdi;
  c.imageSmoothingQuality = "high";
  c.drawImage(bmp, 0, 0, w, h);
  const p = c.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (p[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return girdi;
  const kw = x1 - x0 + 1, kh = y1 - y0 + 1, o = Math.min(1360 / kw, 720 / kh);
  const tuval = document.createElement("canvas");
  tuval.width = 1600; tuval.height = 900;
  const t = tuval.getContext("2d");
  if (!t) return girdi;
  t.imageSmoothingQuality = "high";
  t.drawImage(ara, x0, y0, kw, kh, Math.round((1600 - kw * o) / 2), Math.round((900 - kh * o) / 2), Math.round(kw * o), Math.round(kh * o));
  const cikti = await new Promise<Blob | null>((ok) => tuval.toBlob(ok, "image/webp", 0.92));
  if (cikti && cikti.type === "image/webp") return cikti;
  return (await new Promise<Blob | null>((ok) => tuval.toBlob(ok, "image/png"))) ?? girdi;
}
