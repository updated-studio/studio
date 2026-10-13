import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../shared/auth";
import { sb } from "../../shared/supabase";
import Ayarlar from "./Ayarlar";
import Benim from "./Benim";
import Havuz from "./Havuz";
import Kaynaklar, { sorunluKaynaklar } from "./Kaynaklar";
import { tarihSaat } from "./ortak";
import Sohbet from "./Sohbet";
import Taslaklar from "./Taslaklar";
import { MasaProvider, useMasa, type Etkinlik } from "./veri";

// Haber Masası (eski adıyla Triyaj): kaynaklardan gelen haberler, ekip iş akışı, taslaklar.
type Bolum = "havuz" | "benim" | "pas" | "taslak" | "belirsiz" | "elenen" | "sohbet" | "kaynak" | "ayar";

const TUR: Record<string, string> = { "aldı": "haberi aldı", "yayında": "haberi yayına aldı", "pas": "haberi pas geçti", "bıraktı": "haberi bıraktı", "geri aldı": "haberi pastan geri aldı" };
const metin = (r: Etkinlik) => (r.kind === "aktar" ? <><b>{r.actor_name}</b> → <b>{r.target_name}</b> haberi aktardı</> : <><b>{r.actor_name}</b> {TUR[r.kind] ?? r.kind}</>);

function Masa() {
  const { v, yukleniyor, hata, yenile } = useMasa();
  const { profile } = useAuth();
  const ben = profile!.id;
  const [bolum, setBolum] = useState<Bolum>("havuz");
  const [taslak, setTaslak] = useState<number | null>(null);
  const [zilAcik, setZilAcik] = useState(false);
  const [popup, setPopup] = useState<Etkinlik | null>(null);
  const sonId = useRef<number | null>(null);

  // Yeni aktarım gelince açılır pencere (eski bildPopup)
  useEffect(() => {
    if (yukleniyor) return;
    const enBuyuk = v.etkinlik.reduce((m, r) => Math.max(m, r.id), 0);
    if (sonId.current === null) { sonId.current = enBuyuk; return; }
    const yeni = v.etkinlik.find((r) => r.id > sonId.current! && r.kind === "aktar" && r.target === ben && r.actor !== ben && !r.read_by.includes(ben));
    sonId.current = Math.max(sonId.current, enBuyuk);
    if (yeni) setPopup(yeni);
  }, [v.etkinlik, yukleniyor, ben]);

  if (yukleniyor) return <div className="muted">Yükleniyor…</div>;
  if (hata) return <div className="empty">Haber Masası yüklenemedi: {hata}</div>;

  const say = (d: string) => v.haberler.filter((h) => h.status === d).length;
  const benim = v.haberler.filter((h) => h.status === "alindi" && h.taken_by === ben);
  const yeniAktarim = benim.some((h) => !h.transfer_seen);
  const okunmamis = v.etkinlik.filter((r) => !r.read_by.includes(ben) && r.actor !== ben).length;
  const sorunlu = profile!.is_admin ? sorunluKaynaklar(v.kaynaklar).length : 0;
  const bolumler: [Bolum, string][] = [
    ["havuz", `Yeni ${say("aday")}`], ["benim", `Benim aldıklarım ${benim.length}${yeniAktarim ? " •" : ""}`], ["pas", `Pas ${say("pas")}`],
    ["taslak", "Taslaklar"], ["belirsiz", `Belirsiz ${say("belirsiz")}`], ["elenen", `Elenenler ${say("elendi")}`], ["sohbet", "Sohbet"],
    ["kaynak", `Kaynaklar${sorunlu ? " ⚠ " + sorunlu : ""}`],
  ];
  if (profile!.is_admin) bolumler.push(["ayar", "Ayarlar"]);

  async function okunduYap() {
    await sb.rpc("tr_activity_read");
    const gelen = benim.filter((h) => !h.transfer_seen).map((h) => h.id);
    if (gelen.length) await sb.from("tr_items").update({ transfer_seen: true }).in("id", gelen);
    yenile();
  }

  return (
    <>
      <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
        <div className="segment" role="group" aria-label="Haber Masası bölümleri" style={{ flex: 1 }}>
          {bolumler.map(([k, l]) => <button key={k} aria-pressed={bolum === k} onClick={() => { setBolum(k); if (k !== "taslak") setTaslak(null); }}>{l}</button>)}
        </div>
        <button className="btn ghost sm" onClick={() => setZilAcik(!zilAcik)} aria-label="Bildirim havuzu" style={okunmamis ? { color: "var(--orange)" } : undefined}>🔔{okunmamis ? " " + okunmamis : ""}</button>
      </div>
      {zilAcik && (
        <div className="panel">
          <div className="row"><b style={{ marginRight: "auto" }}>Bildirim havuzu</b>{okunmamis > 0 && <button className="btn ghost sm" onClick={okunduYap}>Hepsini okundu yap</button>}<button className="btn ghost sm" onClick={() => setZilAcik(false)}>Kapat</button></div>
          {!v.etkinlik.length && <div className="muted">Henüz bildirim yok.</div>}
          {v.etkinlik.map((r) => (
            <div key={r.id} className={"bildirim" + (!r.read_by.includes(ben) && r.actor !== ben ? " yeni" : "")}>
              <div>{metin(r)} <span className="muted" style={{ fontSize: 12 }}>{tarihSaat(r.created_at)}</span></div>
              <div className="muted">{r.title}</div>
              {r.note && <div style={{ fontStyle: "italic" }}>“{r.note}”</div>}
            </div>
          ))}
        </div>
      )}
      {bolum === "havuz" && <Havuz durum="aday" />}
      {bolum === "benim" && <Benim taslakAc={(id) => { setTaslak(id); setBolum("taslak"); }} />}
      {bolum === "pas" && <Havuz durum="pas" />}
      {bolum === "taslak" && <Taslaklar acik={taslak} setAcik={setTaslak} />}
      {bolum === "belirsiz" && <Havuz durum="belirsiz" />}
      {bolum === "elenen" && <Havuz durum="elendi" />}
      {bolum === "sohbet" && <Sohbet />}
      {bolum === "kaynak" && <Kaynaklar />}
      {bolum === "ayar" && <Ayarlar />}
      {popup && (
        <div className="perde">
          <div className="pencere" role="dialog" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36 }}>↪</div>
            <h3>{popup.actor_name} sana bir haber aktardı</h3>
            <p className="muted">{popup.title}</p>
            {popup.note && <p style={{ fontStyle: "italic" }}>“{popup.note}”</p>}
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn" onClick={() => { setPopup(null); okunduYap(); setBolum("benim"); }}>Haberlere git</button>
              <button className="btn ghost" onClick={() => { setPopup(null); okunduYap(); }}>Tamam</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function HaberMasasi() {
  return <MasaProvider><Masa /></MasaProvider>;
}
