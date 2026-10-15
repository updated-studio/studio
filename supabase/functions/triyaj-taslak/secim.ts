// Otomatik taslak: hangi haber, kime (ARCHITECTURE.md, 15 Ekim 2026). Saf TypeScript, veritabanına dokunmaz; test edilebilir.
import { degerlendir, ilgiEslesme } from "./puan.ts";

// Varsayılanlar; Haber Masası → Ayarlar'dan (tr_settings.oto_taslak) değiştirilir.
export const OTO_VARSAYILAN = {
  acik: true,               // otomatik taslak çalışsın mı
  wordpress: true,          // hazırlanan taslak WordPress'e taslak olarak gitsin mi
  gunluk: 50,               // günde en fazla kaç otomatik taslak (İstanbul saatiyle gün)
  esik: 70,                 // en az bu öncelik puanı (70 = Öncelik 1)
  bekle_dk: 30,             // haber düştükten sonra bekleme (diğer kaynaklar aynı karta birleşsin)
  haric_turler: ["Söylenti"] as string[],
};
export type OtoAyar = typeof OTO_VARSAYILAN;

export type Aday = { id: number; brand: string; topic: string; product: string; news_type: string; kind: string; source_name: string; turkey: string; other_sources: { name: string; link: string }[]; published_at: string | null; created_at: string; title: string; event: string };
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

/** Havuzdan sıradaki otomatik taslak adayını seçer (saf: test edilebilir). */
export function adaySec(haberler: Aday[], taslakliIdler: Set<number>, ayar: OtoAyar, simdi = Date.now()) {
  return haberler
    .filter((h) => !taslakliIdler.has(h.id))
    .filter((h) => simdi - Date.parse(h.created_at) >= ayar.bekle_dk * 60_000)
    .map((h) => ({ h, d: degerlendir(h, simdi) }))
    .filter(({ d }) => d.puan >= ayar.esik && !ayar.haric_turler.includes(d.tur))
    .sort((a, b) => b.d.puan - a.d.puan || Date.parse(b.h.published_at ?? b.h.created_at) - Date.parse(a.h.published_at ?? a.h.created_at))[0] ?? null;
}

