// HABER MASASI ÖNCELİK KURALLARI: tek kaynak burası.
// Ekrandaki "Öncelik nasıl hesaplanır?" açıklaması ve kartlardaki gerekçeler bu dosyadan üretilir.
// Eleme kuralları (Hariç marka, kampanya/rehber, Türkiye ilgisi, gürültü) toplama sırasında supabase/functions/triyaj-topla'da uygulanır.
// Kural değişince: buradaki değerleri güncelle, ONCELIK_SURUMU tarihini değiştir, ARCHITECTURE.md karar günlüğüne yaz.
// Enes'in kararları: puan markadan bağımsız; Öncelikli marka listesi puanı etkilemez (sadece elemede kullanılır);
// oy sadece aynı markanın aynı türdeki haberleri arasında sırayı değiştirir; Al/Pas öğrenmede kullanılmaz.
import type { Haber, Oy } from "./veri";

export const ONCELIK_SURUMU = "13 Ekim 2026";

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
  { ad: "Hemen yaz", enAz: 70, sinif: "rose" },
  { ad: "Yazılabilir", enAz: 40, sinif: "blue" },
  { ad: "Beklet", enAz: 0, sinif: "off" },
] as const;

// 4) Ekip oyu ("Bunun gibi daha çok / az", herkes kendi oyunu verir, notlu): sadece AYNI MARKANIN kendi haberleri arasında sırayı değiştirir.
//    Markalar arası sıra oydan etkilenmez. Aynı marka + aynı türdeki her net oy: ±OY_ETKISI (en fazla ±OY_SINIRI), son OY_GUN gün.
export const OY_ETKISI = 6;
export const OY_SINIRI = 18;
export const OY_GUN = 60;

// 5) Çeşitlilik: havuzda aynı markadan art arda en fazla bu kadar haber gelir.
export const ART_ARDA_EN_FAZLA = 2;

export type Degerlendirme = { puan: number; seviye: (typeof SEVIYELER)[number]; tur: string; gerekce: string[] };

export function haberTuru(h: Pick<Haber, "news_type" | "kind">): string {
  if (h.news_type && HABER_TURLERI.some((t) => t.ad === h.news_type)) return h.news_type;
  return ESKI_TUR[h.kind] ?? "Diğer";
}

export function degerlendir(h: Haber): Degerlendirme {
  const tur = haberTuru(h);
  const gerekce: string[] = [tur];
  let puan = HABER_TURLERI.find((t) => t.ad === tur)!.puan;
  const kaynak = new Set(h.other_sources.map((o) => o.name).filter((n) => n && n !== h.source_name)).size;
  if (kaynak) { puan += Math.min(EK.kaynakEnFazla, kaynak * EK.kaynakBasina); gerekce.push(`${kaynak + 1} kaynak`); }
  const saat = (Date.now() - Date.parse(h.published_at ?? h.created_at)) / 3_600_000;
  const t = EK.taze.find(([s]) => saat < s);
  if (t) { puan += t[1]; gerekce.push(saat < 1 ? "yeni" : `${Math.round(saat)} sa önce`); }
  if (h.turkey === "yok") { puan += EK.turkiyeZayif; gerekce.push("Türkiye ilgisi zayıf"); }
  if (h.turkey === "global") gerekce.push("global ilgi");
  puan = Math.max(0, Math.round(puan));
  const seviye = SEVIYELER.find((s) => puan >= s.enAz)!;
  return { puan, seviye, tur, gerekce };
}

const marka = (b: string) => (b || "—").toLocaleLowerCase("tr");

/** Havuz sıralaması: tarafsız puan → marka içi oy düzeltmesi → art arda aynı marka sınırı. */
export function sirala(haberler: Haber[], oylar: Oy[], tumHaberler: Haber[]) {
  const d = new Map(haberler.map((h) => [h.id, degerlendir(h)]));

  // Marka + tür başına net ekip oyu (son OY_GUN gün). Haberi silinmiş oylarda marka oyla saklanır.
  const sinir = Date.now() - OY_GUN * 86_400_000;
  const haberOf = new Map(tumHaberler.map((h) => [h.id, h]));
  const net = new Map<string, number>();
  for (const o of oylar) {
    if (Date.parse(o.created_at) < sinir) continue;
    const h = o.item_id ? haberOf.get(o.item_id) : undefined;
    const k = marka(h?.brand ?? o.brand) + "|" + (h ? haberTuru(h) : "");
    net.set(k, (net.get(k) ?? 0) + o.value);
  }
  const oyDuzeltme = (h: Haber) => Math.max(-OY_SINIRI, Math.min(OY_SINIRI, (net.get(marka(h.brand) + "|" + haberTuru(h)) ?? 0) * OY_ETKISI));

  // Marka içinde: markanın puan "yerleri" aynı kalır, oya göre hangi haberin hangi yere oturacağı değişir.
  const gruplar = new Map<string, Haber[]>();
  for (const h of haberler) gruplar.set(marka(h.brand), [...(gruplar.get(marka(h.brand)) ?? []), h]);
  const sira = new Map<number, number>();
  for (const liste of gruplar.values()) {
    const yerler = liste.map((h) => d.get(h.id)!.puan).sort((a, b) => b - a);
    const oyla = [...liste].sort((a, b) => (d.get(b.id)!.puan + oyDuzeltme(b)) - (d.get(a.id)!.puan + oyDuzeltme(a)));
    oyla.forEach((h, i) => sira.set(h.id, yerler[i] - i * 1e-3));
  }
  const temel = [...haberler].sort((a, b) => sira.get(b.id)! - sira.get(a.id)!
    || Date.parse(b.published_at ?? b.created_at) - Date.parse(a.published_at ?? a.created_at));

  // Çeşitlilik: aynı markadan art arda en fazla N
  const sonuc: Haber[] = [];
  const kalan = [...temel];
  while (kalan.length) {
    const son = sonuc.slice(-ART_ARDA_EN_FAZLA).map((h) => marka(h.brand));
    const dolu = son.length === ART_ARDA_EN_FAZLA && son.every((m) => m === son[0]);
    const i = dolu ? kalan.findIndex((h) => marka(h.brand) !== son[0]) : 0;
    sonuc.push(kalan.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return { liste: sonuc, d, oyDuzeltme };
}
