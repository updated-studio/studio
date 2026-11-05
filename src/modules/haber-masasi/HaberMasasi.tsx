import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import Ayarlar from "./Ayarlar";
import Havuz from "./Havuz";
import Kaynaklar from "./Kaynaklar";
import { YapayZekaUyari } from "./ortak";
import Taslaklar from "./Taslaklar";
import { MasaProvider, useMasa } from "./veri";

// Haber Masası (eski adıyla Triyaj): kaynaklardan gelen haberler ve yapay zekânın yazım kayıtları.
// 6 Kasım 2026 (yeni düzen, kullanıcı: "aldım falan işaretlemeye gerek yok, işleri basitleştiriyoruz"): "Benim aldıklarım" ve haber aktarma
// kalktı; taslak doğrudan istenir, hazır olan Masam'da ve Taslaklar'da görünür. Sohbet üst çubukta (aynı kanal). Bölüm adreste tutulur
// (#/haber-masasi?b=rehber): menüdeki Gelen, Rehberler ve Yönetim'deki Kaynaklar/Otomasyon doğrudan o bölümü açar.
type Bolum = "havuz" | "pas" | "taslak" | "rehber" | "belirsiz" | "elenen" | "kaynak" | "ayar";
const BOLUMLER: Bolum[] = ["havuz", "pas", "taslak", "rehber", "belirsiz", "elenen", "kaynak", "ayar"];
function Masa() {
  const { v, yukleniyor, hata } = useMasa();
  const { profile } = useAuth();
  const [sp, setSp] = useSearchParams();
  const istenen = sp.get("b") as Bolum | null;
  const bolum: Bolum = istenen && BOLUMLER.includes(istenen) && (profile!.is_admin || (istenen !== "kaynak" && istenen !== "ayar")) ? istenen : "havuz";
  const taslak = Number(sp.get("t")) || null;
  const git = (b: Bolum, t?: number | null) => setSp({ ...(b === "havuz" ? {} : { b }), ...(t ? { t: String(t) } : {}) }, { replace: !!t || b === bolum });

  if (yukleniyor) return <div className="muted">Yükleniyor…</div>;
  if (hata) return <div className="empty">Haber Masası yüklenemedi: {hata}</div>;

  const say = (d: string) => v.haberler.filter((h) => h.status === d).length;
  // Gelen haberlerin dört hâli tek süzgeçte; her birinin ne olduğu altında yazar (6 Kasım 2026, kullanıcı: "belirsiz ne, neye göre belirsiz,
  // yazım kayıtları ne, kaynaklar neden orada"). Rehberler menüde kendi yerinde; Kaynaklar ve Ayarlar yalnız Yönetim'den, yazım kayıtları
  // Taslaklar'dan açılır: burada sekme olarak durmaz.
  const GELEN: [Bolum, string, string][] = [
    ["havuz", `Yeni ${say("aday")}`, "Kaynaklardan gelip elemeden geçen haberler. Önemlilerin taslağını sistem kendisi yazar; yazmadığı bir haber için \"Taslak hazırla\" de."],
    ["belirsiz", `Türkiye ilgisi belirsiz ${say("belirsiz")}`, "Yapay zekâ bu haberlerin Türkiye'deki okuru ilgilendirip ilgilendirmediğinden emin olamadı. \"Havuza al\" dersen Yeni'ye geçer, \"Ele\" dersen elenir."],
    ["pas", `Pas geçilen ${say("pas")}`, "Ekipten birinin \"Pas\" dediği haberler. \"Geri al\" ile Yeni'ye döner."],
    ["elenen", `Elenen ${say("elendi")}`, "Kurallara takılan haberler: reklam ve indirim, Türkiye ile ilgisi olmayan, hariç tutulan marka. Yanlış elenen varsa \"Havuza al\" de; kural buna göre düzeltilir."],
  ];
  const gelenMi = GELEN.some(([k]) => k === bolum);
  const BASLIK: Partial<Record<Bolum, [string, string, string, string]>> = {
    rehber: ["Rehberler", "Yabancı kaynakların rehber ve liste içerikleri (\"en iyi 10 kulaklık\", \"nasıl yapılır\"). Kendi rehberimiz için fikir; puanlanmaz.", "", ""],
    taslak: ["Yazım kayıtları", "Yapay zekânın yazdığı her taslağın kaydı: iki metin (A/B), denetim notları, görsel adayları ve yeniden üretme. Taslağın kendisi Taslaklar'da.", "/taslaklar", "Taslaklar"],
    kaynak: ["Kaynaklar ve eleme", "Haberlerin toplandığı kaynaklar ve durumları.", "/yonetim-merkezi", "Yönetim"],
    ayar: ["Otomasyon", "Otomatik taslak, yazım üslubu, görsel üretimi, eleme listeleri.", "/yonetim-merkezi", "Yönetim"],
  };
  const baslik = BASLIK[bolum];

  return (
    <>
      {gelenMi ? (
        <div className="hm-bas">
          <div className="segment" role="group" aria-label="Gelen haberler">
            {GELEN.map(([k, l]) => <button key={k} aria-pressed={bolum === k} onClick={() => git(k)}>{l}</button>)}
          </div>
          <p className="muted">{GELEN.find(([k]) => k === bolum)![2]}</p>
        </div>
      ) : baslik && (
        <div className="hm-bas">
          {baslik[2] && <Link className="linkbtn" to={baslik[2]}>← {baslik[3]}</Link>}
          <h2>{baslik[0]}</h2>
          <p className="muted">{baslik[1]}</p>
        </div>
      )}
      <YapayZekaUyari />
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
