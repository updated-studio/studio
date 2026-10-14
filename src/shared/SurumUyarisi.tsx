import { useEffect, useState } from "react";
import { yenilikleriOku } from "./Yenilikler";

// Yeni sürüm yayınlanınca açık sayfada "yenile" uyarısı gösterir.
// Derleme sırasında dist/surum.json yazılır (vite.config.ts); sayfa dakikada bir karşılaştırır.
declare const __SURUM__: string;

export default function SurumUyarisi() {
  const [yeni, setYeni] = useState(false);
  const [baslik, setBaslik] = useState("");
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const kontrol = async () => {
      try {
        const r = await fetch("./surum.json?t=" + Date.now(), { cache: "no-store" });
        const j = await r.json();
        if (j.surum && j.surum !== __SURUM__) { setYeni(true); const y = await yenilikleriOku(); if (y[0]) setBaslik(y[0].baslik); }
      } catch { /* çevrimdışı */ }
    };
    const id = window.setInterval(kontrol, 60_000);
    document.addEventListener("visibilitychange", kontrol);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", kontrol); };
  }, []);
  if (!yeni) return null;
  return (
    <div className="surum" role="status">
      <span>Stüdyo güncellendi{baslik ? `: ${baslik}` : ""}. Yenileyince neler değiştiğini görürsün.</span>
      <button className="btn sm" onClick={() => window.location.reload()}>Yenile</button>
    </div>
  );
}
