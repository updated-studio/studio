// İçerik modülü: tek editör (24 Ekim 2026, Enes: "iki editör birleşsin, ayrı editörlere gerek yok, en iyisini yap").
// Eski post aracının bütün özellikleri ve 29 şablonu; her şablon Post, Story ve Reels kapağında (klasik/motor.js, formatlar).
// Üstte "Siteden gelenler": sitede yayınlanan yazılar türüne göre format ve şablonla editöre yerleşir (Gelenler.tsx).
// Eski Story/Reels editörü (7 şablonlu ayrı motor) bu birleşmeyle kaldırıldı; kayıtlı tasarımı yoktu.
import { lazy, Suspense, useState } from "react";
import { sb } from "../../shared/supabase";
import Gelenler from "./Gelenler";
import type { GelenAc } from "./klasik/KlasikEditor";
import "./icerik.css";
// Şablonlar ~700 KB (gömülü logolar ve örnek görseller); yalnız açılınca yüklenir
const KlasikEditor = lazy(() => import("./klasik/KlasikEditor"));

export default function Icerik() {
  const [gelen, setGelen] = useState<GelenAc | null>(null);
  const [surum, setSurum] = useState(0);
  // Açık yazının görseli indirilince listede "Görsel indirildi" olur
  const indirildi = () => { if (gelen) sb.from("icerik_gelen").update({ durum: "hazir" }).eq("id", gelen.id).then(() => setSurum((x) => x + 1)); };
  return (
    <>
      <Gelenler ac={setGelen} acik={gelen?.id ?? null} surum={surum} />
      <Suspense fallback={<div className="muted">Editör yükleniyor…</div>}><KlasikEditor gelen={gelen} indirildi={indirildi} /></Suspense>
    </>
  );
}
