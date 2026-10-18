// HABER MASASI ÖNCELİK PUANI: tek kaynak burası.
// Bu dosyayı hem ekran (src/modules/haber-masasi/oncelik.ts üzerinden) hem sunucu (otomatik taslak seçimi) kullanır.
// Bu yüzden saf TypeScript'tir: Deno'ya da tarayıcıya da özgü hiçbir şey kullanmaz, başka dosya içe aktarmaz.
// Ekrandaki "Öncelik nasıl hesaplanır?" açıklaması ve kartlardaki gerekçeler buradan üretilir.
// Kural değişince: değerleri güncelle, ONCELIK_SURUMU tarihini değiştir, ARCHITECTURE.md karar günlüğüne yaz (CLAUDE.md kural 10).
// Enes'in kararları: puan markadan bağımsız; Öncelikli marka listesi puanı etkilemez (sadece elemede kullanılır).

export const ONCELIK_SURUMU = "18 Ekim 2026 (2)";

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

// 1b) Konunun Türkiye'deki genel ilgisi (Fatih, 18 Ekim 2026: "ülkemizdeki genel izlenmeye sahip teknoloji kategorileri, genele hitap eden").
//     Haber türüne eklenir; markadan bağımsızdır. Telefon ve yapay zekâ en geniş kitle; kamera/drone Updated'ın uzman kitlesi.
export const KONU_ILGI: Record<string, number> = {
  telefon: 10, "yapay zeka": 8, oyun: 6, otomobil: 5, bilgisayar: 5, kamera: 5, giyilebilir: 3, drone: 3,
  "video ekipmanı": 3, tablet: 3, ses: 2, bileşen: 2, yazılım: 2, eğlence: 1, "akıllı ev": 0, "ev aletleri": 0, sektör: -2, diğer: -4,
};

// 2) Ek puanlar
export const EK = {
  kaynakBasina: 8, kaynakEnFazla: 24,                        // aynı haberi yazan her ek kaynak
  taze: [[3, 20], [12, 12], [24, 6]] as [number, number][],   // [saatten yeni, puan]
  turkiyeZayif: -16,                                          // Öncelikli marka olduğu için elenmeyen "Türkiye'de yok" haberi
  gundem: 10,                                                 // konusu Türkiye gündeminde (Google Trends TR terimi haberde geçiyor; sadece sinyal, içerik alınmaz)
};

// 3) Seviyeler ve 10'luk önem (Fatih, 18 Ekim 2026). Önem = puan / 10 (en az 1, en fazla 10, bir ondalık).
//    Öncelik 1 = ana sayfa adayı (önem 8+), Öncelik 2 = yayına değer (5,5+; otomatik taslak varsayılan eşiği), Öncelik 3 = beklet.
export const SEVIYELER = [
  { ad: "Öncelik 1", enAz: 80, sinif: "rose", aciklama: "Ana sayfa adayı" },
  { ad: "Öncelik 2", enAz: 55, sinif: "blue", aciklama: "Yayına değer" },
  { ad: "Öncelik 3", enAz: 0, sinif: "off", aciklama: "Beklet" },
] as const;
export const ANA_SAYFA_ESIK = 80;
export const YAYIN_ESIK = 55;
/** 0-100+ puanı 1-10 önem ölçeğine çevirir */
export const onem = (puan: number) => Math.min(10, Math.max(1, Math.round(puan) / 10));

/** Puan için gereken haber alanları (ekrandaki Haber tipi ve veritabanı satırı bununla uyumludur). */
export type PuanHaber = {
  news_type: string | null; kind: string; topic?: string | null; trend?: string | null; source_name: string; turkey: string;
  other_sources: { name: string; link: string }[] | null; published_at: string | null; created_at: string;
};
export type Degerlendirme = { puan: number; onem: number; seviye: (typeof SEVIYELER)[number]; tur: string; gerekce: string[] };

export function haberTuru(h: Pick<PuanHaber, "news_type" | "kind">): string {
  if (h.news_type && HABER_TURLERI.some((t) => t.ad === h.news_type)) return h.news_type;
  return ESKI_TUR[h.kind] ?? "Diğer";
}

export function degerlendir(h: PuanHaber, simdi = Date.now()): Degerlendirme {
  const tur = haberTuru(h);
  const gerekce: string[] = [tur];
  let puan = HABER_TURLERI.find((t) => t.ad === tur)!.puan;
  const konu = (h.topic ?? "").toLocaleLowerCase("tr").trim();
  const ilgi = KONU_ILGI[konu] ?? 0;
  if (ilgi) { puan += ilgi; gerekce.push(`${konu} ${ilgi > 0 ? "+" : ""}${ilgi}`); }
  const kaynak = new Set((h.other_sources ?? []).map((o) => o.name).filter((n) => n && n !== h.source_name)).size;
  if (kaynak) { puan += Math.min(EK.kaynakEnFazla, kaynak * EK.kaynakBasina); gerekce.push(`${kaynak + 1} kaynak`); }
  const saat = (simdi - Date.parse(h.published_at ?? h.created_at)) / 3_600_000;
  const t = EK.taze.find(([s]) => saat < s);
  if (t) { puan += t[1]; gerekce.push(saat < 1 ? "yeni" : `${Math.round(saat)} sa önce`); }
  if (h.trend) { puan += EK.gundem; gerekce.push(`gündemde: ${h.trend}`); }
  if (h.turkey === "yok") { puan += EK.turkiyeZayif; gerekce.push("Türkiye ilgisi zayıf"); }
  if (h.turkey === "global") gerekce.push("global ilgi");
  puan = Math.max(0, Math.round(puan));
  const seviye = SEVIYELER.find((s) => puan >= s.enAz)!;
  return { puan, onem: onem(puan), seviye, tur, gerekce };
}

/** Editörün ilgi alanlarından kaçı haberin konu/ürün/marka metninde geçiyor (eski "Önerilen Editör").
 *  Ekrandaki "Önerilen" ve otomatik taslağın kime atanacağı bununla belirlenir. */
export function ilgiEslesme(h: { topic: string; product: string; brand: string }, ilgiler: string | null | undefined): number {
  const metin = `${h.topic} ${h.product} ${h.brand}`.toLocaleLowerCase("tr");
  return (ilgiler ?? "").split(/[,;]+/).map((x) => x.trim().toLocaleLowerCase("tr")).filter(Boolean)
    .filter((x) => metin.includes(x)).length;
}
