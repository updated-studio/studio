import { useState } from "react";

// Ana ekran ikonu değişince telefondan uygulama olarak açanlara bir kez gösterilir.
// iPhone ikonu kendiliğinden güncellemez; Android birkaç gün içinde günceller.
// İkon yeniden değişirse IKON_SURUMU tarihini güncelle.
const IKON_SURUMU = "2026-10-14";

export default function IkonUyarisi() {
  const uygulamada = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
  const [gor, setGor] = useState(() => { try { return uygulamada && localStorage.getItem("ikon-surum") !== IKON_SURUMU; } catch { return false; } });
  if (!gor) return null;
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  const kapat = () => { try { localStorage.setItem("ikon-surum", IKON_SURUMU); } catch { /* yok */ } setGor(false); };
  return (
    <div className="surum" role="status">
      <span>
        Uygulama ikonu yenilendi.{" "}
        {ios
          ? "Yeni ikonu görmek için ana ekrandaki Stüdyo'yu sil, Safari'den siteyi açıp Paylaş → Ana Ekrana Ekle ile yeniden ekle."
          : "Telefonun birkaç gün içinde kendiliğinden günceller; hemen görmek istersen uygulamayı silip yeniden ekle."}
      </span>
      <button className="btn sm" onClick={kapat}>Tamam</button>
    </div>
  );
}
