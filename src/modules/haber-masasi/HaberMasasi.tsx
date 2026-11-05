import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import { sb } from "../../shared/supabase";
import Ayarlar from "./Ayarlar";
import Havuz from "./Havuz";
import Kaynaklar, { sorunluKaynaklar } from "./Kaynaklar";
import { tarihSaat, YapayZekaUyari } from "./ortak";
import Taslaklar from "./Taslaklar";
import { MasaProvider, useMasa, type Etkinlik } from "./veri";
import { useState } from "react";

// Haber Masası (eski adıyla Triyaj): kaynaklardan gelen haberler ve yapay zekânın yazım kayıtları.
// 6 Kasım 2026 (yeni düzen, kullanıcı: "aldım falan işaretlemeye gerek yok, işleri basitleştiriyoruz"): "Benim aldıklarım" ve haber aktarma
// kalktı; taslak doğrudan istenir, hazır olan Masam'da ve Taslaklar'da görünür. Sohbet üst çubukta (aynı kanal). Bölüm adreste tutulur
// (#/haber-masasi?b=rehber): menüdeki Gelen, Rehberler ve Yönetim'deki Kaynaklar/Otomasyon doğrudan o bölümü açar.
type Bolum = "havuz" | "pas" | "taslak" | "rehber" | "belirsiz" | "elenen" | "kaynak" | "ayar";
const BOLUMLER: Bolum[] = ["havuz", "pas", "taslak", "rehber", "belirsiz", "elenen", "kaynak", "ayar"];
const TUR: Record<string, string> = { "aldı": "haberi aldı", "yayında": "haberi yayına aldı", "pas": "haberi pas geçti", "bıraktı": "haberi bıraktı", "geri aldı": "haberi pastan geri aldı" };
const metin = (r: Etkinlik) => (r.kind === "oto" ? <><b>Stüdyo</b> otomatik taslak hazırladı</> : r.kind === "aktar" ? <><b>{r.actor_name}</b> → <b>{r.target_name}</b> haberi aktardı</> : <><b>{r.actor_name}</b> {TUR[r.kind] ?? r.kind}</>);

function Masa() {
  const { v, yukleniyor, hata, yenile } = useMasa();
  const { profile } = useAuth();
  const ben = profile!.id;
  const [sp, setSp] = useSearchParams();
  const istenen = sp.get("b") as Bolum | null;
  const bolum: Bolum = istenen && BOLUMLER.includes(istenen) && (profile!.is_admin || (istenen !== "kaynak" && istenen !== "ayar")) ? istenen : "havuz";
  const taslak = Number(sp.get("t")) || null;
  const git = (b: Bolum, t?: number | null) => setSp({ ...(b === "havuz" ? {} : { b }), ...(t ? { t: String(t) } : {}) }, { replace: !!t || b === bolum });
  const [zilAcik, setZilAcik] = useState(false);

  if (yukleniyor) return <div className="muted">Yükleniyor…</div>;
  if (hata) return <div className="empty">Haber Masası yüklenemedi: {hata}</div>;

  const say = (d: string) => v.haberler.filter((h) => h.status === d).length;
  const okunmamis = v.etkinlik.filter((r) => !r.read_by.includes(ben) && r.actor !== ben).length;
  const sorunlu = profile!.is_admin ? sorunluKaynaklar(v.kaynaklar).length : 0;
  const bolumler: [Bolum, string][] = [
    ["havuz", `Gelen ${say("aday")}`], ["rehber", `Rehberler ${say("rehber")}`], ["belirsiz", `Belirsiz ${say("belirsiz")}`], ["pas", `Pas ${say("pas")}`],
    ["elenen", `Elenenler ${say("elendi")}`], ["taslak", "Yazım kayıtları"],
  ];
  // Kaynaklar ve Ayarlar yönetim işi: yöneticide sekme olarak da durur (Yönetim sayfasından da açılır)
  if (profile!.is_admin) bolumler.push(["kaynak", `Kaynaklar${sorunlu ? " ⚠ " + sorunlu : ""}`], ["ayar", "Ayarlar"]);

  async function okunduYap() {
    await sb.rpc("tr_activity_read");
    yenile();
  }

  return (
    <>
      <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
        <div className="segment" role="group" aria-label="Haber Masası bölümleri" style={{ flex: 1 }}>
          {bolumler.map(([k, l]) => <button key={k} aria-pressed={bolum === k} onClick={() => git(k)}>{l}</button>)}
        </div>
        <button className="btn ghost sm" onClick={() => setZilAcik(!zilAcik)} aria-label="Bildirim havuzu" style={okunmamis ? { color: "var(--blue)" } : undefined}>Hareketler{okunmamis ? " · " + okunmamis : ""}</button>
      </div>
      <YapayZekaUyari />
      {zilAcik && (
        <div className="panel">
          <div className="row"><b style={{ marginRight: "auto" }}>Haber Masası hareketleri</b>{okunmamis > 0 && <button className="btn ghost sm" onClick={okunduYap}>Hepsini okundu yap</button>}<button className="btn ghost sm" onClick={() => setZilAcik(false)}>Kapat</button></div>
          {!v.etkinlik.length && <div className="muted">Henüz hareket yok.</div>}
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
      {bolum === "pas" && <Havuz durum="pas" />}
      {bolum === "taslak" && <Taslaklar acik={taslak} setAcik={(id) => git("taslak", id)} />}
      {bolum === "rehber" && <Havuz durum="rehber" />}
      {bolum === "belirsiz" && <Havuz durum="belirsiz" />}
      {bolum === "elenen" && <Havuz durum="elendi" />}
      {bolum === "kaynak" && <Kaynaklar />}
      {bolum === "ayar" && <Ayarlar />}
    </>
  );
}

export default function HaberMasasi() {
  return <MasaProvider><Masa /></MasaProvider>;
}
