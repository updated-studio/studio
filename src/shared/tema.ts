// Tema seçimi (7 Kasım 2026, kullanıcı: "stüdyoya tema seçilebilir buton ekle"). Sistem (varsayılan) cihazın ayarına uyar;
// Açık ya da Koyu seçilirse <html data-tema="acik|koyu"> konur ve CSS'teki koyu bloklar buna göre açılır/kapanır
// (index.css, cam.css, simge.css, editor.css). Seçim bu cihazda saklanır; index.html ilk boyamadan önce uygular, göz kırpmaz.
export type Tema = "sistem" | "acik" | "koyu";
const ANAHTAR = "tema";

export const temaOku = (): Tema => {
  try { const t = localStorage.getItem(ANAHTAR); return t === "acik" || t === "koyu" ? t : "sistem"; } catch { return "sistem"; }
};

export function temaUygula(t: Tema) {
  const kok = document.documentElement;
  if (t === "sistem") delete kok.dataset.tema; else kok.dataset.tema = t;
}

export function temaSec(t: Tema) {
  try { if (t === "sistem") localStorage.removeItem(ANAHTAR); else localStorage.setItem(ANAHTAR, t); } catch { /* depolama kapalı */ }
  temaUygula(t);
}
