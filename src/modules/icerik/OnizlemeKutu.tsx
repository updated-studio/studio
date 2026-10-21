// Telefonda önizleme: yukarıda sabit duran bir kart (araç çubuğu + tasarım + ipucu birlikte), küçültülebilir.
// Enes (21 Ekim): "sadece önizlemenin görseli sabit kaldığı için insanlarda bozuk hissi uyandırdı". Geniş ekranda etkisi yok.
import { useState, type ReactNode } from "react";

const ANAHTAR = "icerik-onizleme-kucuk";

export default function OnizlemeKutu({ children }: { children: ReactNode }) {
  const [kucuk, setKucuk] = useState(() => { try { return localStorage.getItem(ANAHTAR) === "1"; } catch { return false; } });
  function degistir() {
    const v = !kucuk; setKucuk(v);
    try { localStorage.setItem(ANAHTAR, v ? "1" : "0"); } catch { /* depolama kapalı */ }
  }
  return (
    <div className="ie-onizleme" data-kucuk={kucuk || undefined}>
      {children}
      <button type="button" className="ie-kucult" onClick={degistir} aria-expanded={!kucuk} aria-label={kucuk ? "Önizlemeyi büyüt" : "Önizlemeyi küçült"}>
        <svg className="i" viewBox="0 0 24 24" aria-hidden="true">{kucuk ? <path d="M6 9l6 6 6-6" /> : <path d="M6 15l6-6 6 6" />}</svg>
        <span>{kucuk ? "Büyüt" : "Küçült"}</span>
      </button>
    </div>
  );
}
