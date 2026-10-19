// İçerik editörünün çizim motoru: formatlar, veri tipleri, tuval yardımcıları ve dikey yerleşim.
// Tasarım (renk, zemin, kart) stiller.ts'te; yerleşim (hangi blok nerede) sablonlar.ts'te.
// Yeni marka kiti gelince sadece stiller.ts değişir; motor ve şablonlar aynı kalır.

export type Rect = { x: number; y: number; w: number; h: number };

export type FormatId = "post" | "story" | "reels";
export type Format = { id: FormatId; ad: string; aciklama: string; w: number; h: number; guvenli: Rect; izgara?: Rect };

// Güvenli alan: yazıların durması gereken bölge. Story'de üstte profil çubuğu, altta yanıt alanı var;
// Reels kapağı profil ızgarasında ortadan 3:4 kırpılır (izgara).
export const FORMATLAR: Record<FormatId, Format> = {
  post: { id: "post", ad: "Post", aciklama: "4:5 · 1080×1350", w: 1080, h: 1350, guvenli: { x: 72, y: 72, w: 936, h: 1206 } },
  story: { id: "story", ad: "Story", aciklama: "9:16 · 1080×1920", w: 1080, h: 1920, guvenli: { x: 72, y: 250, w: 936, h: 1330 } },
  reels: { id: "reels", ad: "Reels kapağı", aciklama: "9:16 · ızgarada 3:4", w: 1080, h: 1920, guvenli: { x: 84, y: 300, w: 912, h: 1320 }, izgara: { x: 0, y: 240, w: 1080, h: 1440 } },
};

export type Gorsel = { src: string; z: number; x: number; y: number }; // z: yakınlaştırma (1 = sığdır), x/y: kaydırma (-1..1)
export type GorselKey = "gorsel" | "gorselA" | "gorselB";

export type Icerik = {
  kategori: string; baslik: string; vurgu: string; metin: string; maddeler: string; bilgiler: string;
  puan: string; puanAlti: string; altPuanlar: string; karar: string; urunA: string; urunB: string; satirlar: string; alt: string;
  gorsel?: Gorsel; gorselA?: Gorsel; gorselB?: Gorsel;
};
export type MetinKey = Exclude<keyof Icerik, GorselKey>;

export type StilId = "cam" | "dergi" | "vizor" | "fis";
export type SablonId = "haber" | "liste" | "yorum" | "puan" | "karsilastirma" | "madde" | "ozet";
export type Slayt = { id: string; sablon: SablonId; icerik: Partial<Icerik> }; // sadece kullanıcının değiştirdiği alanlar
export type Proje = { id?: string; ad: string; format: FormatId; stil: StilId; slaytlar: Slayt[]; guncelleyen?: string; updated_at?: string; kapak?: string | null };

export const yeniId = () => Math.random().toString(36).slice(2, 10);

// ---------- Yazı tipleri ----------
export const YAZI = {
  baslik: (px: number) => `800 ${px}px "Bricolage Grotesque", system-ui, sans-serif`,
  baslik6: (px: number) => `600 ${px}px "Bricolage Grotesque", system-ui, sans-serif`,
  metin: (px: number, k = 500) => `${k} ${px}px "Instrument Sans", system-ui, sans-serif`,
  mono: (px: number) => `500 ${px}px "JetBrains Mono", ui-monospace, monospace`,
};
let yaziHazir: Promise<void> | null = null;
export function yazilariYukle() {
  if (!yaziHazir) {
    const ornek = "AaĞğÜüŞşİıÖöÇç0123456789";
    yaziHazir = Promise.all([
      YAZI.baslik(40), YAZI.baslik6(40), YAZI.metin(40, 400), YAZI.metin(40, 500), YAZI.metin(40, 600), YAZI.mono(40),
    ].map((f) => document.fonts.load(f, ornek).catch(() => []))).then(() => undefined);
  }
  return yaziHazir;
}

// ---------- Görseller ----------
const onbellek = new Map<string, HTMLImageElement>();
const bekleyen = new Map<string, Promise<HTMLImageElement>>();
export function gorselAl(src: string) { return onbellek.get(src); }
export function gorselYukle(src: string): Promise<HTMLImageElement> {
  const v = onbellek.get(src); if (v) return Promise.resolve(v);
  const b = bekleyen.get(src); if (b) return b;
  const p = new Promise<HTMLImageElement>((ok, no) => {
    const im = new Image(); im.crossOrigin = "anonymous"; im.decoding = "async";
    im.onload = () => { onbellek.set(src, im); bekleyen.delete(src); ok(im); };
    im.onerror = () => { bekleyen.delete(src); no(new Error("Görsel açılamadı")); };
    im.src = src;
  });
  bekleyen.set(src, p); return p;
}

// Logo: Stüdyo'daki beyaz UPDATED işareti; boş kenarları kırpılıp istenen renge boyanır.
const logoOnbellek = new Map<string, HTMLCanvasElement>();
let logoKaynak: HTMLImageElement | null = null;
export function logoAyarla(im: HTMLImageElement) { logoKaynak = im; logoOnbellek.clear(); }
export function logo(renk: string): HTMLCanvasElement | null {
  if (!logoKaynak) return null;
  const v = logoOnbellek.get(renk); if (v) return v;
  const im = logoKaynak, t = document.createElement("canvas");
  t.width = im.naturalWidth; t.height = im.naturalHeight;
  const c = t.getContext("2d")!; c.drawImage(im, 0, 0);
  const d = c.getImageData(0, 0, t.width, t.height).data;
  let x0 = t.width, y0 = t.height, x1 = 0, y1 = 0;
  for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (d[(y * t.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const o = document.createElement("canvas"); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  const oc = o.getContext("2d")!; oc.drawImage(im, -x0, -y0);
  oc.globalCompositeOperation = "source-in"; oc.fillStyle = renk; oc.fillRect(0, 0, o.width, o.height);
  logoOnbellek.set(renk, o); return o;
}

// ---------- Tuval yardımcıları ----------
export type Ctx = CanvasRenderingContext2D;
export function yuvarlak(ctx: Ctx, r: Rect, rad: number) {
  const k = Math.min(rad, r.w / 2, r.h / 2);
  ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, k);
}
export const satirlariAyir = (s: string, max: number, alan = 2) =>
  s.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, max).map((l) => {
    const p = l.split("|").map((x) => x.trim());
    while (p.length < alan) p.push("");
    return p;
  });
export const buyukHarf = (s: string) => s.toLocaleUpperCase("tr");

// Kelimeleri genişliğe göre satırlara böler; sığmayan tek kelime harf harf kırılır.
export function sar(ctx: Ctx, metin: string, w: number): string[] {
  const out: string[] = [];
  for (const parca of metin.split("\n")) {
    let satir = "";
    for (const kelime of parca.split(/\s+/).filter(Boolean)) {
      const dene = satir ? satir + " " + kelime : kelime;
      if (ctx.measureText(dene).width <= w) { satir = dene; continue; }
      if (satir) out.push(satir);
      if (ctx.measureText(kelime).width <= w) { satir = kelime; continue; }
      let k = "";
      for (const h of kelime) { if (ctx.measureText(k + h).width > w && k) { out.push(k); k = h; } else k += h; }
      satir = k;
    }
    out.push(satir);
  }
  return out;
}
export function kes(ctx: Ctx, satirlar: string[], w: number, max: number) {
  if (satirlar.length <= max) return satirlar;
  const s = satirlar.slice(0, max); let son = s[max - 1];
  while (son && ctx.measureText(son + "…").width > w) son = son.slice(0, -1);
  s[max - 1] = son.trimEnd() + "…"; return s;
}

// Görseli dikdörtgene yerleştirir. cover: alanı doldurur; contain: tamamı görünür (arka plansız ürün).
export function gorselCiz(ctx: Ctx, im: HTMLImageElement, g: Gorsel, r: Rect, mod: "cover" | "contain") {
  const iw = im.naturalWidth, ih = im.naturalHeight;
  const s = (mod === "cover" ? Math.max(r.w / iw, r.h / ih) : Math.min(r.w / iw, r.h / ih)) * g.z;
  const dw = iw * s, dh = ih * s;
  const ox = mod === "cover" ? (dw - r.w) / 2 : r.w / 2, oy = mod === "cover" ? (dh - r.h) / 2 : r.h / 2;
  ctx.drawImage(im, r.x + (r.w - dw) / 2 + g.x * ox, r.y + (r.h - dh) / 2 + g.y * oy, dw, dh);
  return { ox: Math.max(ox, 1), oy: Math.max(oy, 1) };
}

// ---------- Dikey yerleşim ----------
// Her blok önce ölçülür (o), sonra çizilir (c). esnek bloklar (fotoğraf, boşluk) kalan yüksekliği paylaşır.
// İçerik sığmazsa yazılar orantılı küçültülür (k: 1 → 0.6).
export type Blok = { o: (w: number, k: number) => number; c: (r: Rect, k: number) => void; esnek?: number; enAz?: number; bosluk?: number };
export function dizilim(r: Rect, bloklar: Blok[], hiza: "ust" | "alt" | "orta" = "ust") {
  const b = bloklar.filter(Boolean);
  let k = 1, olc: number[] = [], top = 0;
  for (; k >= 0.6; k -= 0.04) {
    olc = b.map((x) => (x.esnek ? (x.enAz ?? 0) * k : x.o(r.w, k)));
    top = olc.reduce((a, v) => a + v, 0) + b.reduce((a, x, i) => a + (i ? (x.bosluk ?? 28) * k : 0), 0);
    if (top <= r.h) break;
  }
  k = Math.max(k, 0.6);
  const esnekTop = b.reduce((a, x) => a + (x.esnek ?? 0), 0);
  const artan = Math.max(0, r.h - top);
  let y = r.y;
  if (!esnekTop) y = hiza === "alt" ? r.y + artan : hiza === "orta" ? r.y + artan / 2 : r.y;
  b.forEach((x, i) => {
    if (i) y += (x.bosluk ?? 28) * k;
    const h = olc[i] + (x.esnek && esnekTop ? (artan * x.esnek) / esnekTop : 0);
    x.c({ x: r.x, y, w: r.w, h }, k);
    y += h;
  });
}
