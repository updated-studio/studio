import type { Profile } from "../../shared/supabase";

// Kişinin Stüdyo'daki işleri (1 Kasım 2026, göç 0061): bir kişi birden çok iş yapabilir (haber + video gibi).
// profiles.gorevler boşsa site rolünden çıkarılır: video → video, tasarımcı → tasarim, sosyal medya → sosyal, diğerleri → haber.
export type Gorev = "haber" | "video" | "tasarim" | "sosyal";
export const GOREVLER: [Gorev, string][] = [["haber", "Haber"], ["video", "Video çekimi"], ["tasarim", "Tasarım"], ["sosyal", "Sosyal medya"]];

export function gorevleri(p: Profile | null | undefined): Gorev[] {
  if (!p) return [];
  if (p.gorevler?.length) return p.gorevler as Gorev[];
  const r = p.site_rol;
  return r === "video" ? ["video"] : r === "tasarimci" ? ["tasarim"] : r === "sosyal" ? ["sosyal"] : ["haber"];
}

/** Yönetici kendi ekranında editör görünümünü deneyebilir (yalnız o tarayıcıda) */
export const ONIZLEME_ANAHTARI = "editor-gorunumu";
// Yayın yönetmeni onay kuyruğunu ve bütün site içeriğini gördüğü için tam görünümde kalır
export function editorGorunumu(p: Profile | null | undefined): boolean {
  if (!p) return false;
  if (!p.is_admin && p.site_rol !== "yayin-yonetmeni") return true;
  try { return localStorage.getItem(ONIZLEME_ANAHTARI) === "1"; } catch { return false; }
}
