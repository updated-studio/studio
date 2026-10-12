import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useVeri } from "../../shared/veri";
import EkipmanSayfa from "./EkipmanSayfa";
import Hafta from "./Hafta";
import Isler from "./Isler";
import Uyeler from "./Uyeler";

type Bolum = "hafta" | "isler" | "ekipman" | "uyeler";
const BOLUMLER: [Bolum, string][] = [["hafta", "Bu Hafta"], ["isler", "İşler"], ["ekipman", "Ekipman"], ["uyeler", "Ekip"]];

export default function Ekip() {
  const { yukleniyor, hata } = useVeri();
  const [sp, setSp] = useSearchParams();
  const ilk = sp.get("b") as Bolum | null;
  const [bolum, setBolum] = useState<Bolum>(ilk && BOLUMLER.some(([k]) => k === ilk) ? ilk : "hafta");
  useEffect(() => { if (ilk) setSp({}, { replace: true }); }, [ilk, setSp]);

  if (yukleniyor) return <div className="muted">Yükleniyor…</div>;
  if (hata) return <div className="empty">Veri yüklenemedi: {hata}</div>;

  return (
    <>
      <div className="segment" role="group">
        {BOLUMLER.map(([k, l]) => <button key={k} aria-pressed={bolum === k} onClick={() => setBolum(k)}>{l}</button>)}
      </div>
      {bolum === "hafta" && <Hafta />}
      {bolum === "isler" && <Isler />}
      {bolum === "ekipman" && <EkipmanSayfa />}
      {bolum === "uyeler" && <Uyeler />}
    </>
  );
}
