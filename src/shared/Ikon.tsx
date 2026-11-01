import { useEffect, useState } from "react";
import { SOLAR } from "./solar";

// Ortak ikon seti. 1 Kasım 2026'dan beri Solar kalın iki tonlu (kullanıcı seçimi; marka kiti ikon bölümü). Seçili menü öğesinde dolgulu hâl.
// Simge kitleri (kullanıcı: "temalar kısmında simge kitlerimiz olarak birden çok seçenek"): Profilim → Simge kiti; kit yalnız menülerde ve
// büyük simgelerde (".simge" içinde) uygulanır, düğme içi küçük ikonlar yazı renginde kalır. Kit stilleri shared/simge.css.
// Eski çizgi set (marka kiti 1.4, 2 px düz uç) yalnız Solar karşılığı olmayan ada yedek.
const P: Record<string, string> = {
  hafta: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M8 15l2 2 4-4",
  takvim: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  isler: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
};
export const IKONLAR = SOLAR;

// İki tonlu gövdeden türetilenler: ana katmanın parlama kopyası ve kabartma kitinin arka kalınlığı
const ANA = /<path(?![^>]*opacity)[^>]*\/>/g;
const parlama = (d: string) => (d.match(ANA) ?? []).map((y) => y.replace("<path", '<path class="sp"')).join("");
const kalinlik = (d: string) => [3, 2, 1].map((k) => `<g class="sk" transform="translate(0 ${k * 0.45})">${d}</g>`).join("");
const hazir = new Map<string, string>();
function govde(ad: string) {
  let h = hazir.get(ad);
  if (!h) { const s = SOLAR[ad]; h = `${kalinlik(s.d)}<g class="sd">${s.d}${parlama(s.d)}</g><g class="sb">${s.b}${parlama(s.b)}</g>`; hazir.set(ad, h); }
  return h;
}

export function Ikon({ ad }: { ad: string }) {
  const s = SOLAR[ad];
  if (!s) return <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d={P[ad] ?? P.isler} /></svg>;
  return <svg className="i s" viewBox="0 0 24 24" aria-hidden="true" style={{ "--r": s.r } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: govde(ad) }} />;
}

/* ---------- simge kitleri ---------- */
export const SIMGE_KITLERI: [string, string, string][] = [
  ["e2", "Renkli", "Her bölüm kendi renginde; göz bölümleri renginden tanır."],
  ["e3", "Kabartma", "Arkasında kalınlık olan, eline alınacak nesne gibi simgeler."],
  ["e4", "Gece camı", "Gece mavisi gövde, buzlu mavi cam."],
  ["a1", "Sade", "Tek renk, iki tonlu; en derin ışık ve gölge."],
  ["a2", "Marka mavisi", "İkinci katman marka mavisinde."],
  ["a3", "Cam", "İkinci katman buzlu mavi cam."],
];
const ANAHTAR = "simge-kiti";
export const simgeKiti = () => { try { return localStorage.getItem(ANAHTAR) || "e2"; } catch { return "e2"; } };
export function simgeKitiSec(k: string) {
  try { localStorage.setItem(ANAHTAR, k); } catch { /* depolama kapalı */ }
  document.documentElement.dataset.simge = k;
  window.dispatchEvent(new Event("simge-kiti"));
}
export function useSimgeKiti() {
  const [k, setK] = useState(simgeKiti);
  useEffect(() => { const f = () => setK(simgeKiti()); addEventListener("simge-kiti", f); return () => removeEventListener("simge-kiti", f); }, []);
  return k;
}

/** Kitlerin geçiş tanımları (sayfada bir kez) ve seçili kitin <html>'e yazılması */
export function SimgeTanimlari() {
  useEffect(() => { document.documentElement.dataset.simge = simgeKiti(); }, []);
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <linearGradient id="s-ana" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: "var(--s-ana-ust)" }} /><stop offset="1" style={{ stopColor: "var(--s-ana-alt)" }} /></linearGradient>
        <linearGradient id="s-mavi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7FA8FF" /><stop offset="1" stopColor="#1D4ED8" /></linearGradient>
        <linearGradient id="s-cam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D6E4FF" /><stop offset="1" stopColor="#5B8DEF" /></linearGradient>
        <linearGradient id="s-gece" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: "var(--s-gece-ust)" }} /><stop offset="1" style={{ stopColor: "var(--s-gece-alt)" }} /></linearGradient>
        <linearGradient id="s-parlak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" stopOpacity=".55" /><stop offset=".45" stopColor="#FFFFFF" stopOpacity=".08" /><stop offset=".5" stopColor="#FFFFFF" stopOpacity="0" /></linearGradient>
        <linearGradient id="s-beyaz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#DCE6FF" /></linearGradient>
      </defs>
    </svg>
  );
}
