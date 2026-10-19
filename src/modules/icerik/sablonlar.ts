// Şablonlar: her biri bir yerleşim (hangi blok hangi sırada). Görünüşü seçili stil verir (stiller.ts).
// Aynı şablon her stilde ve her formatta (Post / Story / Reels kapağı) çalışır.
import {
  FORMATLAR, dizilim, kes, sar, satirlariAyir, buyukHarf, type Blok, type FormatId, type GorselKey, type Icerik,
  type MetinKey, type Rect, type SablonId, type StilId,
} from "./motor";
import { STILLER, type Ciz, type FotoTercih, type Slot } from "./stiller";

// ---------- alan tanımları (editördeki form) ----------
export type Alan = { k: MetinKey; l: string; tip?: "uzun"; yardim?: string; max?: number };
export type GorselAlan = { k: GorselKey; l: string; yardim?: string };
export type Sablon = {
  id: SablonId; ad: string; grup: "Kapak" | "Tek post" | "Kaydırmalı";
  alanlar: Alan[]; gorseller: GorselAlan[];
  ciz: (c: Ciz) => void;
};

export const ORNEK: Icerik = {
  kategori: "Haber", baslik: "iPhone 18 Pro Max.", vurgu: "198.000 TL.",
  metin: "Türkiye fiyatı açıklandı. Şimdiye kadarki en pahalı iPhone.",
  maddeler: "198.000 TL. | Şimdiye kadarki en pahalı iPhone.\nDaha büyük sensör. | Düşük ışıkta belirgin fark var.\nBir günü çıkaran pil. | Şarj hızı değişmedi.\nYeni renk. | Turuncu seçenek geri döndü.",
  bilgiler: "Fiyat | 198.000 TL\nPuan | 86\nAna kamera | 48 MP\nEkran | 6,9 inç",
  puan: "86", puanAlti: "100 üzerinden", altPuanlar: "Kamera | 92\nPerformans | 95\nPil | 84\nTürkiye'de sahiplik | 58",
  karar: "Çok iyi bir telefon, ama bu fiyata değil.", urunA: "iPhone 18 Pro Max", urunB: "Galaxy S26 Ultra",
  satirlar: "Fiyat | 198.000 TL | 172.000 TL\nAna kamera | 48 MP | 200 MP\nPil | 4.800 mAh | 5.000 mAh\nAğırlık | 231 g | 218 g",
  alt: "updated.com.tr",
};

// Şablona özel örnek metin: kullanıcı bir alana dokunmadıysa şablonun kendi örneği görünür.
export const SABLON_ORNEK: Record<SablonId, Partial<Icerik>> = {
  haber: {},
  liste: { kategori: "Liste", baslik: "Bilmen gereken", vurgu: "4 şey." },
  yorum: { kategori: "Editör yorumu", baslik: "Çok iyi bir telefon.", vurgu: "Ama bu fiyata değil.", metin: "198.000 TL'lik etiket, kamera ve performanstaki artışı gölgede bırakıyor.", karar: "Updated incelemesi, 86/100" },
  puan: { kategori: "İnceleme", baslik: "iPhone 18 Pro Max" },
  karsilastirma: { kategori: "Karşılaştırma", baslik: "Hangisi", vurgu: "daha iyi?", karar: "Kamerada Galaxy, ekosistemde iPhone önde." },
  madde: { kategori: "Kamera", baslik: "Daha büyük sensör.", metin: "Ana kamera düşük ışıkta daha temiz sonuç veriyor. Zoom tarafında değişiklik yok.", bilgiler: "Ana kamera | 48 MP\nSensör | 1/1,14 inç" },
  ozet: { kategori: "Özet", baslik: "iPhone 18 Pro Max", vurgu: "Kısaca." },
};
export const etkin = (sablon: SablonId, i: Partial<Icerik>): Icerik => ({ ...ORNEK, ...SABLON_ORNEK[sablon], ...i });

const K = { kategori: { k: "kategori", l: "Etiket", max: 22 } } as const;
const ALT: Alan = { k: "alt", l: "Alt yazı", max: 40 };

// ---------- bloklar ----------
const KONTROL_SATIR = 4;
function bEtiket(c: Ciz, metin: string, bosluk = 0): Blok | null {
  if (!metin.trim()) return null;
  return {
    bosluk,
    o: (_w, k) => c.S.etiket(c, 0, 0, metin, k, false).h,
    c: (r, k) => { c.S.etiket(c, r.x, r.y, metin, k); },
  };
}
function baslikDuzen(c: Ciz, t1: string, t2: string, w: number, k: number, taban: number, maxSatir: number) {
  const { ctx, S } = c;
  let px = taban * k;
  for (;;) {
    ctx.font = S.f.baslik(px);
    const a = t1.trim() ? sar(ctx, t1.trim(), w) : [], b = t2.trim() ? sar(ctx, t2.trim(), w) : [];
    if (a.length + b.length <= maxSatir || px <= taban * k * 0.55) return { px, a, b, lh: px * 1.02 };
    px -= 3;
  }
}
function bBaslik(c: Ciz, t1: string, t2: string, taban = 96, maxSatir = 4, bosluk?: number): Blok | null {
  if (!t1.trim() && !t2.trim()) return null;
  return {
    bosluk,
    o: (w, k) => { const d = baslikDuzen(c, t1, t2, w, k, taban, maxSatir); return (d.a.length + d.b.length) * d.lh; },
    c: (r, k) => {
      const { ctx, S } = c; const d = baslikDuzen(c, t1, t2, r.w, k, taban, maxSatir);
      ctx.font = S.f.baslik(d.px); ctx.textBaseline = "alphabetic";
      let y = r.y + d.px * 0.86;
      for (const s of d.a) { ctx.fillStyle = S.r.ink; ctx.fillText(s, r.x, y); y += d.lh; }
      for (const s of d.b) { ctx.fillStyle = S.r.vurgu; ctx.fillText(s, r.x, y); y += d.lh; }
    },
  };
}
function bMetin(c: Ciz, metin: string, taban = 34, maxSatir = 4, renk?: string, bosluk?: number): Blok | null {
  if (!metin.trim()) return null;
  const duzen = (w: number, k: number) => { c.ctx.font = c.S.f.metin(taban * k); return kes(c.ctx, sar(c.ctx, metin.trim(), w), w, maxSatir); };
  return {
    bosluk,
    o: (w, k) => duzen(w, k).length * taban * k * 1.35,
    c: (r, k) => {
      const s = duzen(r.w, k); const { ctx } = c; ctx.font = c.S.f.metin(taban * k); ctx.fillStyle = renk ?? c.S.r.soluk; ctx.textBaseline = "alphabetic";
      s.forEach((t, i) => ctx.fillText(t, r.x, r.y + taban * k * (1.05 + i * 1.35)));
    },
  };
}
function bFoto(c: Ciz, k: GorselKey, tercih: FotoTercih, esnek = 1, enAz = 260): Blok {
  return { esnek, enAz, o: () => enAz, c: (r) => c.S.foto(c, k, r, tercih) };
}
function bMaddeler(c: Ciz, metin: string, max = KONTROL_SATIR): Blok | null {
  const m = satirlariAyir(metin, max); if (!m.length) return null;
  const { ctx, S } = c;
  const olc = (w: number, k: number) => {
    const no = 64 * k, ic = w - no - 20 * k;
    return m.map(([b, a]) => {
      ctx.font = S.f.guclu(40 * k); const bs = kes(ctx, sar(ctx, b, ic), ic, 2);
      ctx.font = S.f.metin(30 * k); const as = a ? kes(ctx, sar(ctx, a, ic), ic, 2) : [];
      return { bs, as, h: Math.max(no, bs.length * 48 * k + as.length * 40 * k + (as.length ? 6 * k : 0)) };
    });
  };
  return {
    o: (w, k) => olc(w, k).reduce((a, x) => a + x.h, 0) + (m.length - 1) * 44 * k,
    c: (r, k) => {
      const d = olc(r.w, k); let y = r.y; const no = 64 * k;
      d.forEach((x, i) => {
        if (i) { S.ayrac(c, r.x, y + 21 * k, r.w); y += 44 * k; }
        ctx.save();
        if (S.id === "cam") { ctx.beginPath(); ctx.roundRect(r.x, y, no, no, 18 * k); ctx.fillStyle = "rgba(255,255,255,.1)"; ctx.fill(); ctx.fillStyle = S.r.vurgu; }
        else if (S.id === "vizor") { ctx.strokeStyle = S.r.vurgu; ctx.lineWidth = 3; ctx.strokeRect(r.x + 1.5, y + 1.5, no - 3, no - 3); ctx.fillStyle = S.r.vurgu; }
        else { ctx.fillStyle = S.r.vurgu; ctx.fillRect(r.x, y, no, no); ctx.fillStyle = "#fff"; }
        ctx.font = S.f.rakam(32 * k); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1).padStart(2, "0"), r.x + no / 2, y + no / 2 + 2);
        ctx.restore();
        const tx = r.x + no + 20 * k; let ty = y + 34 * k;
        ctx.font = S.f.guclu(40 * k); ctx.fillStyle = S.r.ink; for (const s of x.bs) { ctx.fillText(s, tx, ty); ty += 48 * k; }
        ctx.font = S.f.metin(30 * k); ctx.fillStyle = S.r.soluk; ty += 2 * k; for (const s of x.as) { ctx.fillText(s, tx, ty); ty += 40 * k; }
        y += x.h;
      });
    },
  };
}
function bBilgiler(c: Ciz, metin: string, max: number, kolon = 2): Blok | null {
  const m = satirlariAyir(metin, max); if (!m.length) return null;
  const { ctx, S } = c; const satir = Math.ceil(m.length / kolon);
  const hucre = (k: number) => 168 * k;
  return {
    o: (_w, k) => satir * hucre(k) + (satir - 1) * 20 * k,
    c: (r, k) => {
      const ara = 20 * k, hw = (r.w - ara * (kolon - 1)) / kolon, hh = hucre(k);
      m.forEach(([e, d], i) => {
        const x = r.x + (i % kolon) * (hw + ara), y = r.y + Math.floor(i / kolon) * (hh + ara);
        S.kart(c, { x, y, w: hw, h: hh });
        const p = 28 * k;
        ctx.font = S.f.etiket(22 * k); ctx.fillStyle = S.r.soluk; ctx.textBaseline = "alphabetic";
        ctx.fillText(kes(ctx, [S.buyukEtiket ? buyukHarf(e) : e], hw - p * 2, 1)[0], x + p, y + p + 22 * k);
        let px = 56 * k; ctx.font = S.f.rakam(px);
        while (ctx.measureText(d).width > hw - p * 2 && px > 24) { px -= 2; ctx.font = S.f.rakam(px); }
        ctx.fillStyle = i === 0 ? S.r.vurgu : S.r.ink; ctx.fillText(d, x + p, y + hh - p);
      });
    },
  };
}
function bPuan(c: Ciz): Blok {
  const { ctx, S, I } = c; const alt = satirlariAyir(I.altPuanlar, 4);
  const ust = (k: number) => 190 * k;
  return {
    o: (_w, k) => ust(k) + (alt.length ? 30 * k + alt.length * 66 * k : 0),
    c: (r, k) => {
      ctx.font = S.f.rakam(200 * k); ctx.fillStyle = S.r.vurgu; ctx.textBaseline = "alphabetic";
      const pw = ctx.measureText(I.puan).width; ctx.fillText(I.puan, r.x - 6 * k, r.y + 170 * k);
      ctx.font = S.f.etiket(26 * k); ctx.fillStyle = S.r.soluk; ctx.fillText(S.buyukEtiket ? buyukHarf(I.puanAlti) : I.puanAlti, r.x + pw + 24 * k, r.y + 166 * k);
      let y = r.y + ust(k) + 30 * k;
      for (const [e, v] of alt) {
        const n = Math.max(0, Math.min(100, parseFloat(v.replace(",", ".")) || 0));
        ctx.font = S.f.guclu(28 * k); ctx.fillStyle = S.r.ink; ctx.textAlign = "left"; ctx.fillText(e, r.x, y + 26 * k);
        ctx.font = S.f.rakam(30 * k); ctx.textAlign = "right"; ctx.fillText(v, r.x + r.w, y + 26 * k); ctx.textAlign = "left";
        ctx.fillStyle = S.r.cizgi; ctx.globalAlpha = S.id === "dergi" || S.id === "fis" ? 0.15 : 1; ctx.fillRect(r.x, y + 40 * k, r.w, 10 * k); ctx.globalAlpha = 1;
        ctx.fillStyle = n < 60 ? S.r.vurgu2 : S.r.vurgu; ctx.fillRect(r.x, y + 40 * k, (r.w * n) / 100, 10 * k);
        y += 66 * k;
      }
    },
  };
}
function bKarar(c: Ciz, metin: string, etiket?: string): Blok | null {
  if (!metin.trim()) return null;
  const { ctx, S } = c; const p = 32;
  const duzen = (w: number, k: number) => { ctx.font = S.f.guclu(32 * k); return kes(ctx, sar(ctx, metin.trim(), w - p * 2 * k), w - p * 2 * k, 3); };
  const ek = (k: number) => (etiket ? 40 * k : 0);
  return {
    o: (w, k) => p * 2 * k + ek(k) + duzen(w, k).length * 42 * k,
    c: (r, k) => {
      S.kart(c, r); let y = r.y + p * k;
      if (etiket) { ctx.font = S.f.etiket(22 * k); ctx.fillStyle = S.r.vurgu; ctx.textBaseline = "alphabetic"; ctx.fillText(S.buyukEtiket ? buyukHarf(etiket) : etiket, r.x + p * k, y + 22 * k); y += ek(k); }
      ctx.font = S.f.guclu(32 * k); ctx.fillStyle = S.r.ink;
      duzen(r.w, k).forEach((s, i) => ctx.fillText(s, r.x + p * k, y + 32 * k + i * 42 * k));
    },
  };
}
function bIkiFoto(c: Ciz, enAz = 300): Blok {
  const { ctx, S, I } = c;
  return {
    esnek: 1, enAz, o: () => enAz,
    c: (r, k) => {
      const ara = 24 * k, w = (r.w - ara) / 2, ad = 54 * k, h = r.h - ad;
      S.foto(c, "gorselA", { x: r.x, y: r.y, w, h }, "urun");
      S.foto(c, "gorselB", { x: r.x + w + ara, y: r.y, w, h }, "urun");
      ctx.font = S.f.guclu(30 * k); ctx.fillStyle = S.r.ink; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText(kes(ctx, [I.urunA], w, 1)[0], r.x + w / 2, r.y + r.h - 12 * k);
      ctx.fillText(kes(ctx, [I.urunB], w, 1)[0], r.x + w * 1.5 + ara, r.y + r.h - 12 * k);
      ctx.textAlign = "left";
      // ortadaki VS rozeti
      const cx = r.x + r.w / 2, cy = r.y + h / 2, rr = 46 * k;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fillStyle = S.r.vurgu; ctx.fill();
      ctx.font = S.f.rakam(34 * k); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("VS", cx, cy + 2); ctx.textAlign = "left";
    },
  };
}
function bTablo(c: Ciz, metin: string): Blok | null {
  const m = satirlariAyir(metin, 5, 3); if (!m.length) return null;
  const { ctx, S } = c; const sh = 64;
  return {
    o: (_w, k) => m.length * sh * k,
    c: (r, k) => {
      const col = r.w * 0.36, cw = (r.w - col) / 2;
      m.forEach(([e, a, b], i) => {
        const y = r.y + i * sh * k;
        if (i) S.ayrac(c, r.x, y, r.w);
        const by = y + sh * k / 2; ctx.textBaseline = "middle";
        ctx.font = S.f.etiket(24 * k); ctx.fillStyle = S.r.soluk; ctx.textAlign = "left";
        ctx.fillText(kes(ctx, [S.buyukEtiket ? buyukHarf(e) : e], col - 12, 1)[0], r.x, by);
        ctx.font = S.f.guclu(30 * k); ctx.fillStyle = S.r.ink; ctx.textAlign = "center";
        ctx.fillText(kes(ctx, [a], cw - 12, 1)[0], r.x + col + cw / 2, by);
        ctx.fillText(kes(ctx, [b], cw - 12, 1)[0], r.x + col + cw * 1.5, by);
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      });
    },
  };
}
function bTirnak(c: Ciz): Blok {
  return { o: (_w, k) => 90 * k, c: (r, k) => { c.ctx.font = c.S.f.baslik(200 * k); c.ctx.fillStyle = c.S.r.vurgu; c.ctx.textBaseline = "alphabetic"; c.ctx.fillText("“", r.x - 8 * k, r.y + 150 * k); } };
}
const yok = (b: (Blok | null | false)[]) => b.filter(Boolean) as Blok[];

// ---------- şablonlar ----------
const haber: Sablon = {
  id: "haber", ad: "Haber kapağı", grup: "Kapak",
  alanlar: [K.kategori, { k: "baslik", l: "Başlık" }, { k: "vurgu", l: "Başlık devamı (renkli)" }, { k: "metin", l: "Alt metin", tip: "uzun" }, ALT],
  gorseller: [{ k: "gorsel", l: "Görsel", yardim: "Cam stilinde arka planı silinmiş ürün görseli (PNG) en iyi sonucu verir." }],
  ciz(c) {
    const z = c.S.zemin(c, c.S.id === "cam" ? undefined : "gorsel");
    dizilim(z.r, yok([bEtiket(c, c.I.kategori), !z.fotoAlindi && bFoto(c, "gorsel", "urun"), bBaslik(c, c.I.baslik, c.I.vurgu, 100), bMetin(c, c.I.metin, 34, 3, undefined, 20)]), z.hiza);
  },
};
const liste: Sablon = {
  id: "liste", ad: "Liste", grup: "Tek post",
  alanlar: [K.kategori, { k: "baslik", l: "Başlık" }, { k: "vurgu", l: "Başlık devamı (renkli)" }, { k: "maddeler", l: "Maddeler", tip: "uzun", yardim: "Her satır: Başlık | Açıklama. En fazla 4 satır." }, ALT],
  gorseller: [],
  ciz(c) {
    const z = c.S.zemin(c);
    dizilim(z.r, yok([bEtiket(c, c.I.kategori), bBaslik(c, c.I.baslik, c.I.vurgu, 88, 3), bMaddeler(c, c.I.maddeler)]), c.F.h > 1400 ? "orta" : z.hiza);
  },
};
const yorum: Sablon = {
  id: "yorum", ad: "Yorum", grup: "Tek post",
  alanlar: [K.kategori, { k: "baslik", l: "Cümle" }, { k: "vurgu", l: "Cümle devamı (renkli)" }, { k: "metin", l: "Açıklama", tip: "uzun" }, { k: "karar", l: "İmza / kaynak", max: 40 }, ALT],
  gorseller: [],
  ciz(c) {
    const z = c.S.zemin(c);
    const imza: Blok | null = c.I.karar.trim() ? { o: (_w, k) => 40 * k, c: (r, k) => { c.ctx.font = c.S.f.etiket(24 * k); c.ctx.fillStyle = c.S.r.soluk; c.ctx.textBaseline = "alphabetic"; c.ctx.fillText("— " + c.I.karar, r.x, r.y + 30 * k); } } : null;
    dizilim(z.r, yok([bEtiket(c, c.I.kategori), bTirnak(c), bBaslik(c, c.I.baslik, c.I.vurgu, 92, 5, 10), bMetin(c, c.I.metin, 34, 4), imza]), "orta");
  },
};
const puan: Sablon = {
  id: "puan", ad: "İnceleme puanı", grup: "Kapak",
  alanlar: [K.kategori, { k: "baslik", l: "Ürün adı" }, { k: "puan", l: "Puan", max: 3 }, { k: "puanAlti", l: "Puan yanı yazı", max: 24 }, { k: "altPuanlar", l: "Alt puanlar", tip: "uzun", yardim: "Her satır: Etiket | Puan. 60 altı turuncu. En fazla 4 satır." }, { k: "karar", l: "Karar cümlesi", tip: "uzun" }, ALT],
  gorseller: [{ k: "gorsel", l: "Ürün görseli" }],
  ciz(c) {
    const z = c.S.zemin(c, c.S.id === "vizor" ? "gorsel" : undefined);
    dizilim(z.r, yok([bEtiket(c, c.I.kategori), !z.fotoAlindi && bFoto(c, "gorsel", "urun", 1, 200), bBaslik(c, c.I.baslik, "", 72, 2, 20), bPuan(c), bKarar(c, c.I.karar)]), z.hiza);
  },
};
const karsilastirma: Sablon = {
  id: "karsilastirma", ad: "Karşılaştırma", grup: "Kapak",
  alanlar: [K.kategori, { k: "baslik", l: "Başlık" }, { k: "vurgu", l: "Başlık devamı (renkli)" }, { k: "urunA", l: "Ürün A", max: 24 }, { k: "urunB", l: "Ürün B", max: 24 }, { k: "satirlar", l: "Satırlar", tip: "uzun", yardim: "Her satır: Özellik | A değeri | B değeri. En fazla 5 satır." }, { k: "karar", l: "Sonuç cümlesi", tip: "uzun" }, ALT],
  gorseller: [{ k: "gorselA", l: "Ürün A görseli" }, { k: "gorselB", l: "Ürün B görseli" }],
  ciz(c) {
    const z = c.S.zemin(c);
    dizilim(z.r, yok([bEtiket(c, c.I.kategori), bBaslik(c, c.I.baslik, c.I.vurgu, 80, 2, 20), bIkiFoto(c), bTablo(c, c.I.satirlar), bKarar(c, c.I.karar)]), z.hiza);
  },
};
const madde: Sablon = {
  id: "madde", ad: "Madde slaytı", grup: "Kaydırmalı",
  alanlar: [K.kategori, { k: "baslik", l: "Başlık" }, { k: "metin", l: "Açıklama", tip: "uzun" }, { k: "bilgiler", l: "Kartlar", tip: "uzun", yardim: "Her satır: Etiket | Değer. En fazla 2 satır." }, ALT],
  gorseller: [{ k: "gorsel", l: "Madde görseli" }],
  ciz(c) {
    const z = c.S.zemin(c, c.S.id === "cam" ? undefined : "gorsel", 0.85);
    dizilim(z.r, yok([bEtiket(c, c.I.kategori), !z.fotoAlindi && bFoto(c, "gorsel", "kare"), bBaslik(c, c.I.baslik, "", 84, 2, 20), bMetin(c, c.I.metin, 32, 3, undefined, 16), bBilgiler(c, c.I.bilgiler, 2)]), z.hiza);
  },
};
const ozet: Sablon = {
  id: "ozet", ad: "Özet slaytı", grup: "Kaydırmalı",
  alanlar: [K.kategori, { k: "baslik", l: "Başlık" }, { k: "vurgu", l: "Başlık devamı (renkli)" }, { k: "bilgiler", l: "Dört kutu", tip: "uzun", yardim: "Her satır: Etiket | Değer. Tam 4 satır." }, ALT],
  gorseller: [{ k: "gorsel", l: "Görsel" }],
  ciz(c) {
    const z = c.S.zemin(c, c.S.id === "cam" ? undefined : "gorsel", 0.62);
    dizilim(z.r, yok([bEtiket(c, c.I.kategori), bBaslik(c, c.I.baslik, c.I.vurgu, 84, 2, 20), !z.fotoAlindi && bFoto(c, "gorsel", "kare", 1, 220), bBilgiler(c, c.I.bilgiler, 4)]), z.hiza);
  },
};

export const SABLONLAR: Record<SablonId, Sablon> = { haber, liste, yorum, puan, karsilastirma, madde, ozet };
export const SABLON_SIRA: SablonId[] = ["haber", "puan", "karsilastirma", "liste", "yorum", "madde", "ozet"];

// Bir slaytı verilen tuvale çizer; sürüklenebilir görsel alanlarını döndürür.
export function slaytCiz(cv: HTMLCanvasElement, format: FormatId, stil: StilId, sablon: SablonId, I: Icerik, cikti = false, olcek = 1): Slot[] {
  const F = FORMATLAR[format];
  const w = Math.round(F.w * olcek), h = Math.round(F.h * olcek);
  if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
  const ctx = cv.getContext("2d")!; ctx.save(); ctx.setTransform(olcek, 0, 0, olcek, 0, 0); ctx.clearRect(0, 0, F.w, F.h);
  const c: Ciz = { ctx, F, S: STILLER[stil], I, slotlar: [], cikti };
  SABLONLAR[sablon].ciz(c); ctx.restore();
  return c.slotlar;
}
export type { Rect };
