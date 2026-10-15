// HABER MASASI ÖNCELİK PUANI: tek kaynak burası.
// Bu dosyayı hem ekran (src/modules/haber-masasi/oncelik.ts üzerinden) hem sunucu (otomatik taslak seçimi) kullanır.
// Bu yüzden saf TypeScript'tir: Deno'ya da tarayıcıya da özgü hiçbir şey kullanmaz, başka dosya içe aktarmaz.
// Ekrandaki "Öncelik nasıl hesaplanır?" açıklaması ve kartlardaki gerekçeler buradan üretilir.
// Kural değişince: değerleri güncelle, ONCELIK_SURUMU tarihini değiştir, ARCHITECTURE.md karar günlüğüne yaz (CLAUDE.md kural 10).
// Enes'in kararları: puan markadan bağımsız; Öncelikli marka listesi puanı etkilemez (sadece elemede kullanılır).

export const ONCELIK_SURUMU = "14 Ekim 2026";

// 1) Haberin türü: markadan bağımsız temel değer. Yapay zekâ her haberi bu listeden birine koyar ("tip" etiketi).
export const HABER_TURLERI: { ad: string; puan: number; aciklama: string }[] = [
  { ad: "Ürün duyurusu", puan: 40, aciklama: "Yeni ürün resmi olarak tanıtıldı." },
  { ad: "Türkiye fiyatı", puan: 40, aciklama: "Türkiye fiyatı, satış tarihi ya da Türkiye'ye geliş." },
  { ad: "Lansman tarihi", puan: 32, aciklama: "Etkinlik ya da lansman tarihi açıklandı." },
  { ad: "Güçlü sızıntı", puan: 28, aciklama: "Güvenilir kaynaktan, ayrıntılı sızıntı." },
  { ad: "Önemli güncelleme", puan: 24, aciklama: "Çok kullanıcıyı etkileyen yazılım/özellik güncellemesi." },
  { ad: "Şirket ve sektör", puan: 20, aciklama: "Şirket kararı, satış, dava, sektör gelişmesi." },
  { ad: "Söylenti", puan: 16, aciklama: "Zayıf ya da tek kaynaklı iddia." },
  { ad: "İnceleme ve test", puan: 16, aciklama: "Başka yayının incelemesi ya da testi." },
  { ad: "Küçük güncelleme", puan: 10, aciklama: "Az kişiyi ilgilendiren güncelleme." },
  { ad: "Diğer", puan: 8, aciklama: "Yukarıdakilere uymayanlar." },
];
// Haber türü olmayan (eski) haberler için "tür" etiketinden yaklaşık karşılık
const ESKI_TUR: Record<string, string> = { Resmi: "Önemli güncelleme", Sızıntı: "Güçlü sızıntı", Söylenti: "Söylenti", İnceleme: "İnceleme ve test", Sektör: "Şirket ve sektör", Analiz: "Şirket ve sektör", Etkinlik: "Lansman tarihi" };

// 2) Ek puanlar
export const EK = {
  kaynakBasina: 8, kaynakEnFazla: 24,                        // aynı haberi yazan her ek kaynak
  taze: [[3, 20], [12, 12], [24, 6]] as [number, number][],   // [saatten yeni, puan]
  turkiyeZayif: -16,                                          // Öncelikli marka olduğu için elenmeyen "Türkiye'de yok" haberi
};

// 3) Seviyeler
export const SEVIYELER = [
  { ad: "Öncelik 1", enAz: 70, sinif: "rose" },
  { ad: "Öncelik 2", enAz: 40, sinif: "blue" },
  { ad: "Öncelik 3", enAz: 0, sinif: "off" },
] as const;

/** Puan için gereken haber alanları (ekrandaki Haber tipi ve veritabanı satırı bununla uyumludur). */
export type PuanHaber = {
  news_type: string | null; kind: string; source_name: string; turkey: string;
  other_sources: { name: string; link: string }[] | null; published_at: string | null; created_at: string;
};
export type Degerlendirme = { puan: number; seviye: (typeof SEVIYELER)[number]; tur: string; gerekce: string[] };

export function haberTuru(h: Pick<PuanHaber, "news_type" | "kind">): string {
  if (h.news_type && HABER_TURLERI.some((t) => t.ad === h.news_type)) return h.news_type;
  return ESKI_TUR[h.kind] ?? "Diğer";
}

export function degerlendir(h: PuanHaber, simdi = Date.now()): Degerlendirme {
  const tur = haberTuru(h);
  const gerekce: string[] = [tur];
  let puan = HABER_TURLERI.find((t) => t.ad === tur)!.puan;
  const kaynak = new Set((h.other_sources ?? []).map((o) => o.name).filter((n) => n && n !== h.source_name)).size;
  if (kaynak) { puan += Math.min(EK.kaynakEnFazla, kaynak * EK.kaynakBasina); gerekce.push(`${kaynak + 1} kaynak`); }
  const saat = (simdi - Date.parse(h.published_at ?? h.created_at)) / 3_600_000;
  const t = EK.taze.find(([s]) => saat < s);
  if (t) { puan += t[1]; gerekce.push(saat < 1 ? "yeni" : `${Math.round(saat)} sa önce`); }
  if (h.turkey === "yok") { puan += EK.turkiyeZayif; gerekce.push("Türkiye ilgisi zayıf"); }
  if (h.turkey === "global") gerekce.push("global ilgi");
  puan = Math.max(0, Math.round(puan));
  const seviye = SEVIYELER.find((s) => puan >= s.enAz)!;
  return { puan, seviye, tur, gerekce };
}

/** Editörün ilgi alanlarından kaçı haberin konu/ürün/marka metninde geçiyor (eski "Önerilen Editör").
 *  Ekrandaki "Önerilen" ve otomatik taslağın kime atanacağı bununla belirlenir. */
export function ilgiEslesme(h: { topic: string; product: string; brand: string }, ilgiler: string | null | undefined): number {
  const metin = `${h.topic} ${h.product} ${h.brand}`.toLocaleLowerCase("tr");
  return (ilgiler ?? "").split(/[,;]+/).map((x) => x.trim().toLocaleLowerCase("tr")).filter(Boolean)
    .filter((x) => metin.includes(x)).length;
}
