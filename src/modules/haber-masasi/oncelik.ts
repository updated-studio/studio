// HABER MASASI ÖNCELİK KURALLARI: tek kaynak burası (eski "Updated Triyaj" formülü, Triyaj.gs).
// Ekrandaki "Öncelik nasıl hesaplanır?" açıklaması ve kartlardaki gerekçeler bu dosyadan üretilir.
// Eleme kuralları (Hariç, kampanya/rehber, Türkiye ilgisi) toplama sırasında supabase/functions/triyaj-topla'da uygulanır.
// Kural değişince: buradaki değerleri güncelle, ONCELIK_SURUMU tarihini değiştir, ARCHITECTURE.md karar günlüğüne yaz.
import type { Haber, Marka, Oy } from "./veri";

export const ONCELIK_SURUMU = "13 Ekim 2026";

// 1) Marka grubu (Ayarlar > Türkiye pazarı markaları). Marka adı haberin markası ya da ürün adında geçerse eşleşir.
export const GRUP_PUANI: Record<string, number> = { "Öncelikli": 3, "Normal": 2, "Listede yok": 1 };
// Bu markalarda "Öncelikli" sadece listedeki konularda geçerli; diğer konularda "Normal" sayılır.
export const KONU_ODAKLI: Record<string, string[]> = { sony: ["kamera", "video ekipmanı"] };

// 2) Ek puanlar
export const EK = {
  turler: ["Resmi", "Sızıntı", "Söylenti"], tur: 1,  // resmi duyuru, sızıntı ya da söylenti
  kaynakEnAz: 2, kaynak: 1,                         // en az 2 farklı kaynak yazdıysa
  kamera: 1, sonyKamera: 2,                          // konu "kamera" ise; Sony kamera ise
  turkiyeYokCeza: 2,                                 // Öncelikli marka ama "Türkiye'de yok": elenmez, puanı düşer
};

// 3) Editör oyu (▲ Önemli / ▼ Önemsiz): haberin markasındaki (marka yoksa konusundaki) oyların toplamı, en fazla ±2.
//    Oy, kendisinden SONRA gelen haberleri etkiler (eski sistemde puan haber gelirken hesaplanırdı).
export const OY_SINIRI = 2;

// 4) Seviyeler
export const SEVIYELER = [
  { ad: "Yüksek", enAz: 4, sinif: "rose" },
  { ad: "Orta", enAz: 3, sinif: "blue" },
  { ad: "Düşük", enAz: -Infinity, sinif: "off" },
] as const;

export type Degerlendirme = { puan: number; seviye: (typeof SEVIYELER)[number]; grup: string; gerekce: string[] };

/** Haberin marka grubu (eski "Türkiye Pazarı" eşleşmesi) */
export function markaGrubu(h: Haber, markalar: Marka[]): string {
  const mk = h.brand.toLowerCase().trim(), ur = h.product.toLowerCase();
  const k = markalar.find((m) => m.grp !== "Hariç" && (mk === m.name.toLowerCase().trim() || (!!m.name && ur.includes(m.name.toLowerCase().trim()))));
  return k ? k.grp : "Listede yok";
}

/** Oy toplamı: marka (yoksa konu) başına, sadece bu haberden önce verilmiş oylar */
export function oyNet(h: Haber, oylar: Oy[]): number {
  const mk = h.brand.toLowerCase().trim(), kn = h.topic.toLowerCase().trim();
  const once = Date.parse(h.created_at);
  return oylar.reduce((t, o) => {
    if (Date.parse(o.created_at) >= once) return t;
    const omk = o.brand.toLowerCase().trim(), okn = o.topic.toLowerCase().trim();
    if (mk ? omk === mk : !omk && okn === kn) return t + o.value;
    return t;
  }, 0);
}

export function degerlendir(h: Haber, markalar: Marka[], oylar: Oy[]): Degerlendirme {
  const grupHam = markaGrubu(h, markalar);
  const mk = h.brand.toLowerCase().trim(), kn = h.topic.toLowerCase().trim();
  let grup = grupHam;
  if (grup === "Öncelikli" && KONU_ODAKLI[mk] && !KONU_ODAKLI[mk].includes(kn)) grup = "Normal";
  let puan = GRUP_PUANI[grup] ?? 1;
  const gerekce: string[] = [(grup === "Listede yok" ? "marka listede yok" : grup === "Normal" && grupHam === "Öncelikli" ? `${h.brand}: bu konu öncelik dışı` : `${grup} marka`) + ` ${puan}`];
  if (EK.turler.includes(h.kind)) { puan += EK.tur; gerekce.push(h.kind.toLocaleLowerCase("tr") + ` +${EK.tur}`); }
  const kaynak = new Set([h.source_name, ...h.other_sources.map((o) => o.name)].filter(Boolean)).size;
  if (kaynak >= EK.kaynakEnAz) { puan += EK.kaynak; gerekce.push(`${kaynak} kaynak +${EK.kaynak}`); }
  if (h.turkey === "yok" && grupHam === "Öncelikli") { puan -= EK.turkiyeYokCeza; gerekce.push(`Türkiye ilgisi zayıf -${EK.turkiyeYokCeza}`); }
  const oy = Math.max(-OY_SINIRI, Math.min(OY_SINIRI, oyNet(h, oylar)));
  if (oy) { puan += oy; gerekce.push(`editör ${oy > 0 ? "+" : ""}${oy}`); }
  if (kn === "kamera") { const kb = /sony/.test(mk) ? EK.sonyKamera : EK.kamera; puan += kb; gerekce.push(`kamera +${kb}`); }
  if (h.turkey === "global") gerekce.push("global ilgi");
  const seviye = SEVIYELER.find((s) => puan >= s.enAz)!;
  return { puan, seviye, grup, gerekce };
}

/** Havuz sıralaması (eski "Yeni" sekmesi): puan yüksekten düşüğe, eşitse yeni olan önce. */
export function sirala(haberler: Haber[], markalar: Marka[], oylar: Oy[]) {
  const d = new Map(haberler.map((h) => [h.id, degerlendir(h, markalar, oylar)]));
  const liste = [...haberler].sort((a, b) => d.get(b.id)!.puan - d.get(a.id)!.puan
    || Date.parse(b.published_at ?? b.created_at) - Date.parse(a.published_at ?? a.created_at));
  return { liste, d };
}
