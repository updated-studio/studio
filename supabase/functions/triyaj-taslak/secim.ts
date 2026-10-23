// Otomatik taslak: hangi haber, kime (ARCHITECTURE.md, 15 Ekim 2026). Saf TypeScript, veritabanına dokunmaz; test edilebilir.
import { degerlendir, ilgiEslesme } from "./puan.ts";

// Varsayılanlar; Haber Masası → Ayarlar'dan (tr_settings.oto_taslak) değiştirilir.
export const OTO_VARSAYILAN = {
  acik: false,              // otomatik taslak çalışsın mı (kapalı başlar; Ayarlar'dan açılır)
  site: true,               // hazırlanan taslak yeni sitenin paneline taslak haber olarak gitsin mi (23 Ekim 2026'ya kadar "wordpress")
  ata: false,               // taslak ilgi alanına göre editöre atansın mı (Fatih, 23 Ekim: uzmanlık alanları belirlenene kadar kapalı; taslak havuzda sahipsiz kalır)
  gunluk: 100,              // günde en fazla kaç otomatik taslak (İstanbul saatiyle gün)
  esik: 55,                 // en az bu öncelik puanı = önem 5,5/10 (Öncelik 2 "yayına değer"; 80 = Öncelik 1 "ana sayfa adayı")
  bekle_dk: 10,             // haber düştükten sonra bekleme (diğer kaynaklar aynı karta birleşsin)
  tur_basina: 2,            // 10 dakikalık her turda en fazla kaç farklı habere aynı anda taslak yazılır
  haric_turler: ["Söylenti"] as string[],
};
export type OtoAyar = typeof OTO_VARSAYILAN;

export type Aday = { event_key?: string; trend?: string | null; id: number; brand: string; topic: string; product: string; news_type: string; kind: string; source_name: string; turkey: string; other_sources: { name: string; link: string }[]; published_at: string | null; created_at: string; title: string; event: string };
export type Profil = { id: string; name: string; interests: string };

/** Editör seçimi: ilgi alanı eşleşmesi en çok olan; eşitlikte bugün müsait olan, sonra elinde en az iş olan. Eşleşen yoksa null. */
export function editorSec(h: Aday, profiller: Profil[], musait: Map<string, string>, yuk: Map<string, number>): Profil | null {
  const sira = { bos: 0, "": 1, dolu: 2 } as Record<string, number>;
  const adaylar = profiller.map((p) => ({ p, e: ilgiEslesme(h, p.interests) })).filter((x) => x.e > 0);
  adaylar.sort((a, b) => b.e - a.e
    || (sira[musait.get(a.p.id) ?? ""] ?? 1) - (sira[musait.get(b.p.id) ?? ""] ?? 1)
    || (yuk.get(a.p.id) ?? 0) - (yuk.get(b.p.id) ?? 0)
    || a.p.name.localeCompare(b.p.name, "tr"));
  return adaylar[0]?.p ?? null;
}

/** Havuzdaki uygun adaylar, en yüksek puandan başlayarak (saf: test edilebilir). */
export function adaySirala(haberler: Aday[], taslakliIdler: Set<number>, ayar: OtoAyar, simdi = Date.now()) {
  return haberler
    .filter((h) => !taslakliIdler.has(h.id))
    .filter((h) => simdi - Date.parse(h.created_at) >= ayar.bekle_dk * 60_000)
    .map((h) => ({ h, d: degerlendir(h, simdi) }))
    .filter(({ d }) => d.puan >= ayar.esik && !ayar.haric_turler.includes(d.tur))
    .sort((a, b) => b.d.puan - a.d.puan || Date.parse(b.h.published_at ?? b.h.created_at) - Date.parse(a.h.published_at ?? a.h.created_at));
}

/** Turun adayları: en güçlüler, birbirinin tekrarı olmayan en fazla `adet` haber (aynı olayın ikinci kartı seçilmez). */
export function turAdaylari(haberler: Aday[], taslakliIdler: Set<number>, ayar: OtoAyar, adet: number, simdi = Date.now()) {
  const secilen: ReturnType<typeof adaySirala> = [];
  for (const a of adaySirala(haberler, taslakliIdler, ayar, simdi)) {
    if (secilen.length >= adet) break;
    if (!ayniHaber(a.h, secilen.map((x) => x.h))) secilen.push(a);
  }
  return secilen;
}

/** Geriye uyum: tek aday */
export function adaySec(haberler: Aday[], taslakliIdler: Set<number>, ayar: OtoAyar, simdi = Date.now()) {
  return adaySirala(haberler, taslakliIdler, ayar, simdi)[0] ?? null;
}


const anahtar = (s: string) => (s ?? "").toLocaleLowerCase("tr").replace(/[^a-z0-9ğüşıöç]+/g, "");

/** Aynı olay mı? Aynı olay anahtarı, ya da aynı marka + aynı ürün (biri diğerini içeriyorsa). Ürün adı yoksa sadece olay anahtarına bakılır. */
export function ayniHaber(h: { brand: string; product: string; event_key?: string }, oncekiler: { brand: string; product: string; event_key?: string }[]): boolean {
  const m = anahtar(h.brand), u = anahtar(h.product);
  return oncekiler.some((o) => {
    if (h.event_key && o.event_key && h.event_key === o.event_key) return true;
    if (!m || !u || u.length < 3 || anahtar(o.brand) !== m) return false;
    const ou = anahtar(o.product);
    return ou.length >= 3 && (ou === u || ou.includes(u) || u.includes(ou));
  });
}
