import { useState } from "react";
import { useAuth } from "../../shared/auth";
import Ayarlar from "./Ayarlar";
import Benim from "./Benim";
import Havuz from "./Havuz";
import Kaynaklar from "./Kaynaklar";
import Sohbet from "./Sohbet";
import Taslaklar from "./Taslaklar";
import { MasaProvider, useMasa } from "./veri";

// Haber Masası (eski adıyla Triyaj): kaynaklardan gelen haberler, ekip iş akışı, taslaklar.
type Bolum = "havuz" | "benim" | "taslak" | "belirsiz" | "elenen" | "sohbet" | "kaynak" | "ayar";

function Masa() {
  const { v, yukleniyor, hata } = useMasa();
  const { profile } = useAuth();
  const [bolum, setBolum] = useState<Bolum>("havuz");
  const [taslak, setTaslak] = useState<number | null>(null);
  if (yukleniyor) return <div className="muted">Yükleniyor…</div>;
  if (hata) return <div className="empty">Haber Masası yüklenemedi: {hata}</div>;

  const say = (d: string) => v.haberler.filter((h) => h.status === d).length;
  const benim = v.haberler.filter((h) => h.status === "alindi" && h.taken_by === profile!.id);
  const yeniAktarim = benim.some((h) => !h.transfer_seen);
  const bolumler: [Bolum, string][] = [
    ["havuz", `Havuz ${say("aday")}`], ["benim", `Benim aldıklarım ${benim.length}${yeniAktarim ? " •" : ""}`], ["taslak", "Taslaklar"],
    ["belirsiz", `Belirsiz ${say("belirsiz")}`], ["elenen", "Elenenler"], ["sohbet", "Sohbet"], ["kaynak", "Kaynaklar"],
  ];
  if (profile!.is_admin) bolumler.push(["ayar", "Ayarlar"]);

  return (
    <>
      <div className="segment" role="group" aria-label="Haber Masası bölümleri">
        {bolumler.map(([k, l]) => <button key={k} aria-pressed={bolum === k} onClick={() => { setBolum(k); if (k !== "taslak") setTaslak(null); }}>{l}</button>)}
      </div>
      {bolum === "havuz" && <Havuz durum="aday" />}
      {bolum === "benim" && <Benim taslakAc={(id) => { setTaslak(id); setBolum("taslak"); }} />}
      {bolum === "taslak" && <Taslaklar acik={taslak} setAcik={setTaslak} />}
      {bolum === "belirsiz" && <Havuz durum="belirsiz" />}
      {bolum === "elenen" && <Havuz durum="elendi" />}
      {bolum === "sohbet" && <Sohbet />}
      {bolum === "kaynak" && <Kaynaklar />}
      {bolum === "ayar" && <Ayarlar />}
    </>
  );
}

export default function HaberMasasi() {
  return <MasaProvider><Masa /></MasaProvider>;
}
