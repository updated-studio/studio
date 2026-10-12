import { useState } from "react";
import { useAuth } from "../../shared/auth";
import { useVeri } from "../../shared/veri";
import EkipmanSayfa from "./EkipmanSayfa";
import Hafta from "./Hafta";
import Isler from "./Isler";
import Uyeler from "./Uyeler";
import Yonetim from "./Yonetim";

type Bolum = "hafta" | "isler" | "ekipman" | "uyeler" | "yonetim";

export default function Ekip() {
  const { profile } = useAuth();
  const { yukleniyor, hata } = useVeri();
  const [bolum, setBolum] = useState<Bolum>("hafta");
  const [duzenlenen, setDuzenlenen] = useState<number | null>(null);

  const bolumler: [Bolum, string][] = [["hafta", "Bu Hafta"], ["isler", "İşler"], ["ekipman", "Ekipman"], ["uyeler", "Ekip"]];
  if (profile!.is_admin) bolumler.push(["yonetim", "Yönetim"]);

  if (yukleniyor) return <div className="muted">Yükleniyor…</div>;
  if (hata) return <div className="empty">Veri yüklenemedi: {hata}</div>;

  return (
    <>
      <div className="row">
        {bolumler.map(([k, l]) => <button key={k} className="chip" aria-pressed={bolum === k} onClick={() => { setBolum(k); if (k !== "yonetim") setDuzenlenen(null); }}>{l}</button>)}
      </div>
      {bolum === "hafta" && <Hafta />}
      {bolum === "isler" && <Isler duzenle={(id) => { setDuzenlenen(id); setBolum("yonetim"); }} />}
      {bolum === "ekipman" && <EkipmanSayfa />}
      {bolum === "uyeler" && <Uyeler />}
      {bolum === "yonetim" && <Yonetim duzenlenen={duzenlenen} bitti={(isler) => { setDuzenlenen(null); if (isler) setBolum("isler"); }} />}
    </>
  );
}
