import type { Profile } from "../../shared/supabase";

// Stüdyo herkeste aynı tasarımda (1 Kasım 2026, kullanıcı: "tüm tasarım herkeste aynı; editörlerde bazı ayarlar, ekranlar, menüler görünmeyecek;
// video rolü yok, editörler hem video çekebiliyor hem haber girebiliyor"). Yönetim bölümlerini yönetici ve yayın yönetmeni görür.
export const yonetirMi = (p: Profile | null | undefined) => !!p && (p.is_admin || p.site_rol === "yayin-yonetmeni");

/** Yönetici kendi ekranında editörün gördüğünü deneyebilir (yalnız o tarayıcıda) */
export const ONIZLEME_ANAHTARI = "editor-gorunumu";
export function editorGibi(p: Profile | null | undefined): boolean {
  if (!yonetirMi(p)) return true;
  try { return localStorage.getItem(ONIZLEME_ANAHTARI) === "1"; } catch { return false; }
}
