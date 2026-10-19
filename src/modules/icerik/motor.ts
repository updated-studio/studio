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

export type Gorsel = { src: string; z: number; x: number; y: number; p?: number; k?: number; d?: number };
// z: yakınlaştırma (1 = sığdır), x/y: kaydırma (-1..1), p/k/d: parlaklık / kontrast / doygunluk (-100..100, 0 = dokunulmamış)
export type GorselKey = "gorsel" | "gorselA" | "gorselB";

export type Icerik = {
  kategori: string; baslik: string; vurgu: string; metin: string; maddeler: string; bilgiler: string;
  puan: string; puanAlti: string; altPuanlar: string; karar: string; urunA: string; urunB: string; satirlar: string; alt: string;
  gorsel?: Gorsel; gorselA?: Gorsel; gorselB?: Gorsel;
};
export type MetinKey = Exclude<keyof Icerik, GorselKey>;

export type StilId = "cam" | "dergi" | "vizor" | "fis";
export type SablonId = "haber" | "liste" | "yorum" | "puan" | "karsilastirma" | "madde" | "ozet";
// Serbest düzen: şablonun yerleştirdiği her blok bir katman. Kullanıcı katmanı taşır (x, y: piksel), boyutlandırır (s: oran),
// döndürür (r: derece), gizler; sira alttan üste çizim sırası. Her format için ayrı saklanır (Post'ta taşınan Story'yi bozmasın).
export type KatmanAyar = { x: number; y: number; s: number; r: number; gizli?: boolean };
export type Serbest = { katman: Record<string, KatmanAyar>; sira: string[] };
export const BOS_AYAR: KatmanAyar = { x: 0, y: 0, s: 1, r: 0 };
export type Slayt = { id: string; sablon: SablonId; icerik: Partial<Icerik>; serbest?: Partial<Record<FormatId, Serbest>> }; // icerik: sadece kullanıcının değiştirdiği alanlar
export const KATMAN_AD: Record<string, string> = {
  etiket: "Etiket", foto: "Görsel", baslik: "Başlık", metin: "Metin", maddeler: "Maddeler", bilgiler: "Kartlar", puan: "Puan",
  karar: "Karar kutusu", ikiFoto: "Ürün görselleri", tablo: "Tablo", tirnak: "Tırnak işareti", imza: "İmza",
};
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
export const filtreVar = (() => { try { return typeof document.createElement("canvas").getContext("2d")?.filter === "string"; } catch { return false; } })();
export function gorselCiz(ctx: Ctx, im: HTMLImageElement, g: Gorsel, r: Rect, mod: "cover" | "contain") {
  const iw = im.naturalWidth, ih = im.naturalHeight;
  const ayarli = filtreVar && (g.p || g.k || g.d);
  if (ayarli) { ctx.save(); ctx.filter = `brightness(${1 + (g.p ?? 0) / 100}) contrast(${1 + (g.k ?? 0) / 100}) saturate(${1 + (g.d ?? 0) / 100})`; }
  const s = (mod === "cover" ? Math.max(r.w / iw, r.h / ih) : Math.min(r.w / iw, r.h / ih)) * g.z;
  const dw = iw * s, dh = ih * s;
  const ox = mod === "cover" ? (dw - r.w) / 2 : r.w / 2, oy = mod === "cover" ? (dh - r.h) / 2 : r.h / 2;
  ctx.drawImage(im, r.x + (r.w - dw) / 2 + g.x * ox, r.y + (r.h - dh) / 2 + g.y * oy, dw, dh);
  if (ayarli) ctx.restore();
  return { ox: Math.max(ox, 1), oy: Math.max(oy, 1) };
}

// ---------- Dikey yerleşim ----------
// Her blok önce ölçülür (o), sonra çizilir (c). esnek bloklar (fotoğraf, boşluk) kalan yüksekliği paylaşır.
// İçerik sığmazsa yazılar orantılı küçültülür (k: 1 → 0.6).
export type Blok = { id?: string; o: (w: number, k: number) => number; c: (r: Rect, k: number) => void; esnek?: number; enAz?: number; bosluk?: number };
// kayit verilirse bloklar hemen çizilmez, yerleri kaydedilir (serbest düzen için katman olurlar).
export function dizilim(r: Rect, bloklar: Blok[], hiza: "ust" | "alt" | "orta" = "ust", kayit?: (b: Blok, r: Rect, k: number) => void) {
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
    const yer = { x: r.x, y, w: r.w, h };
    if (kayit) kayit(x, yer, k); else x.c(yer, k);
    y += h;
  });
}

// ---------- Katman geometrisi (serbest düzen) ----------
export type Nokta = { x: number; y: number };
export const merkez = (r: Rect): Nokta => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
// Katmanın dört köşesi, dönüşüm uygulanmış hâliyle (sol üst, sağ üst, sağ alt, sol alt).
export function koseler(r: Rect, t: KatmanAyar): Nokta[] {
  const m = merkez(r), a = (t.r * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([x, y]) => {
    const dx = (x - m.x) * t.s, dy = (y - m.y) * t.s;
    return { x: m.x + t.x + dx * cs - dy * sn, y: m.y + t.y + dx * sn + dy * cs };
  });
}
export function kutu(r: Rect, t: KatmanAyar): Rect {
  const k = koseler(r, t), xs = k.map((p) => p.x), ys = k.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
// Ekrandaki noktayı katmanın kendi (dönüşümsüz) koordinatına çevirir; isabet testi için.
export function geriCevir(p: Nokta, r: Rect, t: KatmanAyar): Nokta {
  const m = merkez(r), a = (-t.r * Math.PI) / 180, dx = p.x - m.x - t.x, dy = p.y - m.y - t.y;
  return { x: m.x + (dx * Math.cos(a) - dy * Math.sin(a)) / t.s, y: m.y + (dx * Math.sin(a) + dy * Math.cos(a)) / t.s };
}
export const icinde = (p: Nokta, r: Rect, pay = 0) => p.x >= r.x - pay && p.x <= r.x + r.w + pay && p.y >= r.y - pay && p.y <= r.y + r.h + pay;
