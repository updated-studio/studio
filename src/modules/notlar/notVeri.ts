import { useCallback, useEffect, useState } from "react";
import { sb } from "../../shared/supabase";

// Ekip notları verisi (5 Kasım 2026, göç 0068). Klasör ve sayfa listesi küçük, hepsi bir kerede gelir; açık sayfanın blokları ve yorumları
// ayrıca. Değişiklikler Realtime ile anında gelir (kilitli sayfa, erişimi olmayana veritabanı kuralıyla hiç gelmez).
export type Klasor = { id: number; ad: string; ust_id: number | null; sira: number; kilitli: boolean; izinli: string[]; olusturan: string | null; updated_at: string };
export type Sayfa = { id: number; klasor_id: number | null; ust_id: number | null; baslik: string; sira: number; kilitli: boolean; izinli: string[];
  olusturan: string | null; guncelleyen: string | null; created_at: string; updated_at: string };
export type BlokTur = "metin" | "baslik" | "altbaslik" | "madde" | "numara" | "yapilacak" | "alinti" | "kod" | "ayrac" | "gorsel";
export type Blok = { id: string; sayfa_id: number; sira: number; tur: BlokTur; metin: string; isaretli: boolean; ek: { url?: string; w?: number; h?: number };
  olusturan: string | null; guncelleyen: string | null; created_at: string; updated_at: string };
export type Yorum = { id: number; sayfa_id: number; blok_id: string | null; ust_id: number | null; alinti: string; metin: string; yazar: string | null; cozuldu: boolean; created_at: string };
export type Gecmis = { id: number; sayfa_id: number | null; blok_id: string | null; kim: string | null; islem: string; once: string | null; sonra: string | null; zaman: string };

/** Göç uygulanmadıysa tablo yok: ekran "kuruluyor" der */
export const kurulmamis = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));

export function useAgac() {
  const [klasorler, setKlasorler] = useState<Klasor[]>([]);
  const [sayfalar, setSayfalar] = useState<Sayfa[]>([]);
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "kurulmamis" | "hata">("yukleniyor");
  const yukle = useCallback(async () => {
    const [k, s] = await Promise.all([
      sb.from("not_klasorler").select("id,ad,ust_id,sira,kilitli,izinli,olusturan,updated_at").order("sira"),
      sb.from("not_sayfalar").select("id,klasor_id,ust_id,baslik,sira,kilitli,izinli,olusturan,guncelleyen,created_at,updated_at").order("sira"),
    ]);
    if (kurulmamis(k.error) || kurulmamis(s.error)) { setDurum("kurulmamis"); return; }
    if (k.error || s.error) { setDurum("hata"); return; }
    setKlasorler((k.data ?? []) as Klasor[]); setSayfalar((s.data ?? []) as Sayfa[]); setDurum("hazir");
  }, []);
  useEffect(() => {
    yukle();
    let z = 0;
    const tekrar = () => { window.clearTimeout(z); z = window.setTimeout(yukle, 300); };
    const k = sb.channel("notlar-agac")
      .on("postgres_changes", { event: "*", schema: "public", table: "not_klasorler" }, tekrar)
      .on("postgres_changes", { event: "*", schema: "public", table: "not_sayfalar" }, tekrar)
      .subscribe();
    return () => { window.clearTimeout(z); sb.removeChannel(k); };
  }, [yukle]);
  return { klasorler, sayfalar, durum, yukle, setSayfalar, setKlasorler };
}

/** Sıra: iki komşunun ortası (yeniden numaralamaya gerek kalmaz) */
export const araSira = (once?: number, sonra?: number) => once == null && sonra == null ? 1 : once == null ? sonra! - 1 : sonra == null ? once + 1 : (once + sonra) / 2;

export const TUR_AD: Record<BlokTur, string> = {
  metin: "Metin", baslik: "Başlık", altbaslik: "Alt başlık", madde: "Madde listesi", numara: "Numaralı liste",
  yapilacak: "Yapılacak", alinti: "Alıntı", kod: "Kod", ayrac: "Ayraç", gorsel: "Görsel",
};
// Satır başında yazılınca blok türü değişir (Craft/Notion alışkanlığı)
export const KISAYOL: [RegExp, BlokTur][] = [
  [/^##\s$/, "altbaslik"], [/^#\s$/, "baslik"], [/^[-*•]\s$/, "madde"], [/^1[.)]\s$/, "numara"], [/^\[\s?\]\s$/, "yapilacak"], [/^>\s$/, "alinti"], [/^```$/, "kod"],
];

/** Geçmiş satırını cümleye çevirir */
export function gecmisCumle(g: Gecmis): string {
  const kisa = (x: string | null) => { const t = (x ?? "").replace(/\s+/g, " ").trim(); return t.length > 70 ? t.slice(0, 70) + "…" : t; };
  switch (g.islem) {
    case "sayfa": return "sayfayı açtı";
    case "blok_ekle": return g.sonra?.trim() ? `ekledi: “${kisa(g.sonra)}”` : "boş satır ekledi";
    case "blok_degistir": return `değiştirdi: “${kisa(g.sonra)}”`;
    case "blok_sil": return g.once?.trim() ? `sildi: “${kisa(g.once)}”` : "boş satır sildi";
    case "yorum": return `yorum yazdı: “${kisa(g.sonra)}”`;
    default: return g.islem;
  }
}
