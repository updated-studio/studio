// Stil aileleri: Cam, Dergi, Vizör, Fiş. Bir stil = renkler + yazı tipleri + zemin + etiket/kart/çizgi/fotoğraf çizimi.
// Şablonlar (sablonlar.ts) yerleşimi belirler, görünüşü buradan alır. Yeni marka kiti gelince sadece bu dosya değişir.
import {
  FORMATLAR, YAZI, buyukHarf, gorselAl, gorselCiz, logo, yuvarlak,
  type Ctx, type Format, type GorselKey, type Icerik, type Rect, type StilId,
} from "./motor";

export type Slot = { k: GorselKey; r: Rect; mod: "cover" | "contain"; ox: number; oy: number; katman?: string };
export type Katman = { id: string; r: Rect; ciz: () => void };
// katmanlar: şablonun yerleştirdiği bloklar (serbest düzende taşınabilir); aktifKatman: şu an çizilen katman (görsel alanları ona bağlanır)
export type Ciz = { ctx: Ctx; F: Format; S: Stil; I: Icerik; slotlar: Slot[]; cikti: boolean; katmanlar: Katman[]; aktifKatman?: string };
export type Zemin = { r: Rect; fotoAlindi: boolean; hiza: "ust" | "alt" | "orta" };
export type FotoTercih = "urun" | "kare";

export type Stil = {
  id: StilId; ad: string; aciklama: string;
  r: { ink: string; soluk: string; vurgu: string; vurgu2: string; cizgi: string };
  f: { baslik: (px: number) => string; metin: (px: number) => string; guclu: (px: number) => string; etiket: (px: number) => string; rakam: (px: number) => string };
  buyukEtiket: boolean;
  zemin: (c: Ciz, foto?: GorselKey, oran?: number) => Zemin; // oran: üst fotoğrafın boyu (1 = varsayılan)
  etiket: (c: Ciz, x: number, y: number, metin: string, k: number, ciz?: boolean) => { w: number; h: number };
  kart: (c: Ciz, r: Rect) => void;
  ayrac: (c: Ciz, x: number, y: number, w: number) => void;
  foto: (c: Ciz, k: GorselKey, r: Rect, tercih: FotoTercih) => void;
};

// ---------- ortak parçalar ----------
// Görseli alana çizer ve sürüklenebilir alan olarak kaydeder. Görsel yoksa editörde "Görsel ekle" kutusu, çıktıda boşluk.
export function slotCiz(c: Ciz, k: GorselKey, r: Rect, mod: "cover" | "contain", kirp: (() => void) | null, bos: (() => void) | null) {
  const g = c.I[k]; const im = g && gorselAl(g.src);
  const { ctx } = c;
  if (g && im) {
    ctx.save(); if (kirp) { kirp(); ctx.clip(); }
    const o = gorselCiz(ctx, im, g, r, mod); ctx.restore();
    c.slotlar.push({ k, r, mod, ...o, katman: c.aktifKatman });
  } else {
    c.slotlar.push({ k, r, mod, ox: 1, oy: 1, katman: c.aktifKatman });
    if (!c.cikti && bos) bos();
  }
}
function bosKutu(c: Ciz, r: Rect, renk: string, rad: number) {
  const { ctx } = c; ctx.save();
  yuvarlak(ctx, { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 }, rad);
  ctx.setLineDash([18, 14]); ctx.lineWidth = 4; ctx.strokeStyle = renk; ctx.stroke(); ctx.setLineDash([]);
  if (r.h > 90) {
    ctx.fillStyle = renk; ctx.font = YAZI.metin(Math.min(34, r.h / 4), 600); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("+ Görsel ekle", r.x + r.w / 2, r.y + r.h / 2);
  }
  ctx.restore();
}
function altYazi(c: Ciz, x: number, y: number, renk: string, hizala: CanvasTextAlign = "left") {
  if (!c.I.alt) return;
  const { ctx } = c; ctx.save(); ctx.font = YAZI.mono(22); ctx.fillStyle = renk; ctx.textAlign = hizala; ctx.textBaseline = "alphabetic";
  ctx.fillText(c.I.alt, x, y); ctx.restore();
}
function logoCiz(c: Ciz, renk: string, x: number, yAlt: number, h: number, sag = false) {
  const l = logo(renk); if (!l) return 0;
  const w = (l.width / l.height) * h;
  c.ctx.drawImage(l, sag ? x - w : x, yAlt - h, w, h); return w;
}
const ay = () => buyukHarf(new Date().toLocaleDateString("tr-TR", { month: "long", year: "numeric" }));

// ---------- CAM: koyu zemin, renkli ışık küreleri, cam kartlar ----------
const cam: Stil = {
  id: "cam", ad: "Cam", aciklama: "Koyu zemin, cam kartlar",
  r: { ink: "#FFFFFF", soluk: "rgba(255,255,255,.70)", vurgu: "#6EA2FF", vurgu2: "#FF7A2E", cizgi: "rgba(255,255,255,.14)" },
  f: { baslik: YAZI.baslik, metin: (p) => YAZI.metin(p, 400), guclu: (p) => YAZI.metin(p, 600), etiket: (p) => YAZI.metin(p, 600), rakam: YAZI.baslik },
  buyukEtiket: false,
  zemin(c) {
    const { ctx, F } = c;
    const g = ctx.createLinearGradient(0, 0, 0, F.h); g.addColorStop(0, "#0B1122"); g.addColorStop(1, "#111A35");
    ctx.fillStyle = g; ctx.fillRect(0, 0, F.w, F.h);
    const kure = (x: number, y: number, r: number, renk: string) => {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, renk); rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg; ctx.fillRect(0, 0, F.w, F.h);
    };
    kure(F.w * 0.9, F.h * 0.08, F.w * 0.75, "rgba(37,99,235,.55)");
    kure(F.w * 0.05, F.h * 0.95, F.w * 0.7, "rgba(255,107,26,.32)");
    const s = F.guvenli;
    logoCiz(c, "#FFFFFF", s.x, s.y + s.h, 64);
    altYazi(c, s.x + s.w, s.y + s.h - 6, "rgba(255,255,255,.6)", "right");
    return { r: { x: s.x, y: s.y, w: s.w, h: s.h - 86 }, fotoAlindi: false, hiza: "ust" };
  },
  etiket(c, x, y, metin, k, ciz = true) {
    const { ctx } = c; const fs = 25 * k, h = 54 * k, pad = 24 * k, nokta = 12 * k;
    ctx.font = this.f.etiket(fs); const w = ctx.measureText(metin).width + pad * 2 + nokta + 12 * k;
    if (ciz) {
      ctx.save(); yuvarlak(ctx, { x, y, w, h }, h / 2); ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.stroke();
      ctx.beginPath(); ctx.arc(x + pad + nokta / 2, y + h / 2, nokta / 2, 0, Math.PI * 2); ctx.fillStyle = this.r.vurgu2; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(metin, x + pad + nokta + 12 * k, y + h / 2 + 1); ctx.restore();
    }
    return { w, h };
  },
  kart(c, r) {
    const { ctx } = c; ctx.save(); yuvarlak(ctx, r, 36);
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h); g.addColorStop(0, "rgba(255,255,255,.13)"); g.addColorStop(1, "rgba(255,255,255,.05)");
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.stroke(); ctx.restore();
  },
  ayrac(c, x, y, w) { c.ctx.fillStyle = this.r.cizgi; c.ctx.fillRect(x, y, w, 2); },
  foto(c, k, r, tercih) {
    const { ctx } = c;
    if (tercih === "urun") {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
      slotCiz(c, k, r, "contain", null, () => bosKutu(c, r, "rgba(255,255,255,.35)", 36)); ctx.restore();
    } else {
      this.kart(c, r);
      const ic = { x: r.x + 12, y: r.y + 12, w: r.w - 24, h: r.h - 24 };
      slotCiz(c, k, ic, "cover", () => yuvarlak(ctx, ic, 26), () => bosKutu(c, ic, "rgba(255,255,255,.35)", 26));
    }
  },
};

// ---------- DERGİ: kâğıt zemin, üstte tam genişlik fotoğraf, turuncu etiket ----------
const dergi: Stil = {
  id: "dergi", ad: "Dergi", aciklama: "Kâğıt zemin, büyük fotoğraf",
  r: { ink: "#141414", soluk: "#5E5A52", vurgu: "#E85A0C", vurgu2: "#2563EB", cizgi: "#141414" },
  f: { baslik: YAZI.baslik, metin: (p) => YAZI.metin(p, 400), guclu: (p) => YAZI.metin(p, 600), etiket: YAZI.baslik6, rakam: YAZI.baslik },
  buyukEtiket: true,
  zemin(c, foto, oran = 1) {
    const { ctx, F } = c; const s = F.guvenli;
    ctx.fillStyle = "#F4F1EA"; ctx.fillRect(0, 0, F.w, F.h);
    // künye: logo + ince çizgi + sayı bilgisi
    const ku = s.y + 40;
    logoCiz(c, "#141414", s.x, ku + 12, 56);
    ctx.font = YAZI.mono(22); ctx.fillStyle = this.r.soluk; ctx.textAlign = "right"; ctx.fillText(`SAYI · ${ay()}`, s.x + s.w, ku); ctx.textAlign = "left";
    ctx.fillStyle = "#141414"; ctx.fillRect(s.x, ku + 26, s.w, 4);
    let ust = ku + 58, alindi = false;
    if (foto) {
      const h = Math.round(F.h * (F.h > 1400 ? 0.4 : 0.42) * oran);
      const r = { x: 0, y: ust, w: F.w, h };
      slotCiz(c, foto, r, "cover", () => { ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); }, () => { ctx.fillStyle = "#E3DED3"; ctx.fillRect(r.x, r.y, r.w, r.h); bosKutu(c, { x: s.x, y: r.y + 24, w: s.w, h: r.h - 48 }, "#9A9488", 8); });
      ust += h + 44; alindi = true;
    }
    const altY = s.y + s.h;
    ctx.fillStyle = "#141414"; ctx.fillRect(s.x, altY - 50, s.w, 2);
    altYazi(c, s.x, altY - 6, this.r.soluk);
    return { r: { x: s.x, y: ust, w: s.w, h: altY - 80 - ust }, fotoAlindi: alindi, hiza: "ust" };
  },
  etiket(c, x, y, metin, k, ciz = true) {
    const { ctx } = c; const fs = 26 * k, h = 50 * k, pad = 18 * k; const t = buyukHarf(metin);
    ctx.font = this.f.etiket(fs); const w = ctx.measureText(t).width + pad * 2;
    if (ciz) { ctx.save(); ctx.fillStyle = this.r.vurgu; ctx.fillRect(x, y, w, h); ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(t, x + pad, y + h / 2 + 1); ctx.restore(); }
    return { w, h };
  },
  kart(c, r) { const { ctx } = c; ctx.fillStyle = "rgba(20,20,20,.05)"; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = "#141414"; ctx.fillRect(r.x, r.y, r.w, 4); },
  ayrac(c, x, y, w) { c.ctx.fillStyle = "rgba(20,20,20,.25)"; c.ctx.fillRect(x, y, w, 2); },
  foto(c, k, r) {
    const { ctx } = c;
    slotCiz(c, k, r, "cover", () => { ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); }, () => { ctx.fillStyle = "#E3DED3"; ctx.fillRect(r.x, r.y, r.w, r.h); bosKutu(c, r, "#9A9488", 4); });
  },
};

// ---------- VİZÖR: tam ekran fotoğraf, kamera vizörü arayüzü ----------
function koseler(ctx: Ctx, r: Rect, uz: number, kal: number, renk: string) {
  ctx.save(); ctx.strokeStyle = renk; ctx.lineWidth = kal; ctx.lineCap = "square"; ctx.beginPath();
  const { x, y, w, h } = r;
  ctx.moveTo(x, y + uz); ctx.lineTo(x, y); ctx.lineTo(x + uz, y);
  ctx.moveTo(x + w - uz, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + uz);
  ctx.moveTo(x + w, y + h - uz); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - uz, y + h);
  ctx.moveTo(x + uz, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - uz);
  ctx.stroke(); ctx.restore();
}
const vizor: Stil = {
  id: "vizor", ad: "Vizör", aciklama: "Tam ekran fotoğraf, kamera arayüzü",
  r: { ink: "#FFFFFF", soluk: "rgba(255,255,255,.78)", vurgu: "#FF7A2E", vurgu2: "#6EA2FF", cizgi: "rgba(255,255,255,.28)" },
  f: { baslik: YAZI.baslik, metin: (p) => YAZI.metin(p, 400), guclu: (p) => YAZI.metin(p, 600), etiket: YAZI.mono, rakam: YAZI.baslik },
  buyukEtiket: true,
  zemin(c, foto) {
    const { ctx, F } = c; const s = F.guvenli; const tam = { x: 0, y: 0, w: F.w, h: F.h };
    const g = ctx.createLinearGradient(0, 0, F.w, F.h); g.addColorStop(0, "#1E4FD8"); g.addColorStop(1, "#0A1640");
    ctx.fillStyle = g; ctx.fillRect(0, 0, F.w, F.h);
    if (foto) slotCiz(c, foto, tam, "cover", null, () => {
      ctx.save(); ctx.font = YAZI.mono(30); ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.textAlign = "center";
      ctx.fillText("+ Arka plan fotoğrafı ekle", F.w / 2, F.h * 0.36); ctx.restore();
    });
    const ust = ctx.createLinearGradient(0, 0, 0, F.h * 0.3); ust.addColorStop(0, "rgba(0,0,0,.5)"); ust.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ust; ctx.fillRect(0, 0, F.w, F.h * 0.3);
    const alt = ctx.createLinearGradient(0, F.h * 0.3, 0, F.h); alt.addColorStop(0, "rgba(0,0,0,0)"); alt.addColorStop(0.55, "rgba(0,0,0,.55)"); alt.addColorStop(1, "rgba(0,0,0,.88)");
    ctx.fillStyle = alt; ctx.fillRect(0, F.h * 0.3, F.w, F.h * 0.7);
    // vizör arayüzü
    const v = { x: s.x - 24, y: s.y - 24, w: s.w + 48, h: s.h + 48 };
    koseler(ctx, v, 64, 5, "rgba(255,255,255,.9)");
    ctx.save(); ctx.font = YAZI.mono(24); ctx.textBaseline = "middle";
    ctx.beginPath(); ctx.arc(s.x + 12, s.y + 22, 10, 0, Math.PI * 2); ctx.fillStyle = "#FF3B30"; ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText("REC", s.x + 34, s.y + 23);
    ctx.textAlign = "right"; ctx.fillText("4K · 24P · ISO 800", s.x + s.w, s.y + 23); ctx.restore();
    altYazi(c, s.x, s.y + s.h - 4, "rgba(255,255,255,.75)");
    logoCiz(c, "#FFFFFF", s.x + s.w, s.y + s.h, 54, true);
    return { r: { x: s.x, y: s.y + 80, w: s.w, h: s.h - 80 - 76 }, fotoAlindi: !!foto, hiza: foto ? "alt" : "ust" };
  },
  etiket(c, x, y, metin, k, ciz = true) {
    const { ctx } = c; const fs = 24 * k, h = 48 * k, pad = 16 * k; const t = buyukHarf(metin);
    ctx.font = this.f.etiket(fs); const w = ctx.measureText(t).width + pad * 2;
    if (ciz) {
      ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(t, x + pad, y + h / 2 + 1); ctx.restore();
    }
    return { w, h };
  },
  kart(c, r) {
    const { ctx } = c; ctx.save(); ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.restore();
  },
  ayrac(c, x, y, w) { c.ctx.fillStyle = this.r.cizgi; c.ctx.fillRect(x, y, w, 2); },
  foto(c, k, r) {
    const { ctx } = c;
    slotCiz(c, k, r, "cover", () => { ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); }, () => bosKutu(c, r, "rgba(255,255,255,.55)", 2));
    koseler(ctx, { x: r.x + 14, y: r.y + 14, w: r.w - 28, h: r.h - 28 }, 30, 3, "rgba(255,255,255,.9)");
  },
};

// ---------- FİŞ: mavi zemin üstünde fiş kâğıdı, daktilo yazısı ----------
function kesikCizgi(ctx: Ctx, x: number, y: number, w: number, renk: string) {
  ctx.save(); ctx.strokeStyle = renk; ctx.lineWidth = 3; ctx.setLineDash([10, 9]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke(); ctx.restore();
}
const fis: Stil = {
  id: "fis", ad: "Fiş", aciklama: "Mavi zemin, fiş kâğıdı",
  r: { ink: "#141414", soluk: "#6A6A66", vurgu: "#E85A0C", vurgu2: "#2563EB", cizgi: "#141414" },
  f: { baslik: YAZI.baslik, metin: YAZI.mono, guclu: YAZI.mono, etiket: YAZI.mono, rakam: YAZI.baslik },
  buyukEtiket: true,
  zemin(c, foto, oran = 1) {
    const { ctx, F } = c; const s = F.guvenli;
    ctx.fillStyle = "#2563EB"; ctx.fillRect(0, 0, F.w, F.h);
    ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    for (let i = -F.h; i < F.w; i += 36) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + F.h, F.h); ctx.stroke(); }
    ctx.restore();
    const pw = Math.min(s.w, 860), px = (F.w - pw) / 2, py = s.y - 10, ph = s.h + 10, dis = 22;
    // kâğıt (alt kenar tırtıklı)
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + pw, py); ctx.lineTo(px + pw, py + ph);
    for (let x = px + pw; x > px; x -= dis) { ctx.lineTo(x - dis / 2, py + ph - dis / 2); ctx.lineTo(x - dis, py + ph); }
    ctx.closePath(); ctx.fillStyle = "#FBFAF5"; ctx.fill(); ctx.restore();
    const ic = { x: px + 52, w: pw - 104 };
    let y = py + 48;
    const l = logo("#141414");
    if (l) { const lw = (l.width / l.height) * 60; ctx.drawImage(l, F.w / 2 - lw / 2, y, lw, 60); }
    y += 84; kesikCizgi(ctx, ic.x, y, ic.w, "#141414"); y += 30;
    let alindi = false;
    if (foto) {
      const h = Math.round(ph * (F.h > 1400 ? 0.3 : 0.28) * oran);
      const r = { x: ic.x, y, w: ic.w, h };
      slotCiz(c, foto, r, "cover", () => { ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); }, () => bosKutu(c, r, "#9A9A94", 2));
      ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.globalCompositeOperation = "saturation"; ctx.fillStyle = "#808080"; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore();
      y += h + 34; alindi = true;
    }
    const altY = py + ph - 40;
    kesikCizgi(ctx, ic.x, altY - 92, ic.w, "#141414");
    ctx.save(); ctx.fillStyle = "#141414"; let bx = ic.x;
    for (let i = 0; bx < ic.x + ic.w * 0.42; i++) { const bw = [3, 6, 2, 4, 8, 3][i % 6]; ctx.fillRect(bx, altY - 66, bw, 40); bx += bw + [4, 3, 6, 2, 5][i % 5]; }
    ctx.restore();
    altYazi(c, ic.x + ic.w, altY - 36, this.r.soluk, "right");
    return { r: { x: ic.x, y, w: ic.w, h: altY - 120 - y }, fotoAlindi: alindi, hiza: "ust" };
  },
  etiket(c, x, y, metin, k, ciz = true) {
    const { ctx } = c; const fs = 24 * k, h = 46 * k, pad = 14 * k; const t = buyukHarf(metin);
    ctx.font = this.f.etiket(fs); const w = ctx.measureText(t).width + pad * 2;
    if (ciz) { ctx.save(); ctx.fillStyle = "#141414"; ctx.fillRect(x, y, w, h); ctx.fillStyle = "#FBFAF5"; ctx.textBaseline = "middle"; ctx.fillText(t, x + pad, y + h / 2 + 1); ctx.restore(); }
    return { w, h };
  },
  kart(c, r) {
    const { ctx } = c; ctx.save(); ctx.setLineDash([10, 8]); ctx.lineWidth = 3; ctx.strokeStyle = "#141414"; ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3); ctx.restore();
  },
  ayrac(c, x, y, w) { kesikCizgi(c.ctx, x, y, w, "rgba(20,20,20,.45)"); },
  foto(c, k, r) {
    const { ctx } = c;
    slotCiz(c, k, r, "cover", () => { ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); }, () => bosKutu(c, r, "#9A9A94", 2));
    ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); ctx.globalCompositeOperation = "saturation"; ctx.fillStyle = "#808080"; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore();
  },
};

export const STILLER: Record<StilId, Stil> = { cam, dergi, vizor, fis };
export const STIL_SIRA: StilId[] = ["cam", "dergi", "vizor", "fis"];
export { FORMATLAR };
