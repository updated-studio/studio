// HABER MASASI ÖNCELİK: ekip oyu, çeşitlilik ve havuz sıralaması. Puanın çekirdeği supabase/functions/triyaj-taslak/puan.ts'te.
// Ekrandaki "Öncelik nasıl hesaplanır?" açıklaması ve kartlardaki gerekçeler bu dosyadan üretilir.
// Eleme kuralları (Hariç marka, kampanya/rehber, Türkiye ilgisi, gürültü) toplama sırasında supabase/functions/triyaj-topla'da uygulanır.
// Kural değişince: ilgili dosyadaki değerleri güncelle, ONCELIK_SURUMU tarihini (puan.ts) değiştir, ARCHITECTURE.md karar günlüğüne yaz.
// Enes'in kararları: puan markadan bağımsız; Öncelikli marka listesi puanı etkilemez (sadece elemede kullanılır);
// oy sadece aynı markanın aynı türdeki haberleri arasında sırayı değiştirir; Al/Pas öğrenmede kullanılmaz.
import type { Haber, Oy } from "./veri";
import { degerlendir, haberTuru } from "../../../supabase/functions/triyaj-taslak/puan.ts";

// Puanın çekirdeği (haber türleri, ek puanlar, seviyeler, degerlendir) ortak dosyada: sunucudaki otomatik taslak seçimi de onu kullanır.
export { ONCELIK_SURUMU, HABER_TURLERI, EK, SEVIYELER, degerlendir, haberTuru, ilgiEslesme, type Degerlendirme } from "../../../supabase/functions/triyaj-taslak/puan.ts";

// 4) Ekip oyu ("Bunun gibi daha çok / az", herkes kendi oyunu verir, notlu): sadece AYNI MARKANIN kendi haberleri arasında sırayı değiştirir.
//    Markalar arası sıra oydan etkilenmez. Aynı marka + aynı türdeki her net oy: ±OY_ETKISI (en fazla ±OY_SINIRI), son OY_GUN gün.
export const OY_ETKISI = 6;
export const OY_SINIRI = 18;
export const OY_GUN = 60;

// 5) Çeşitlilik: havuzda aynı markadan art arda en fazla bu kadar haber gelir.
export const ART_ARDA_EN_FAZLA = 2;

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
