import { Link } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import { Ikon } from "../../shared/Ikon";
import { GRUPLAR } from "./menu";
import { editorGibi, yonetirMi } from "./gorev";

// Ayarlar sayfası (menüde Yönetim › Ayarlar; 6 Kasım 2026, yeni düzen): ayarların hepsi tek yerde, profil menüsünde ayar kalmaz. Her satır var olan ekranı açar.
type Satir = { yol: string; ad: string; aciklama: string; admin?: boolean };
const BOLUMLER: { ad: string; satirlar: Satir[] }[] = [
  { ad: "Haberler", satirlar: [
    { yol: "/haber-masasi?b=kaynak", ad: "Kaynaklar ve eleme", aciklama: "Haber kaynakları, marka listesi, basın sayfaları", admin: true },
    { yol: "/haber-masasi?b=ayar", ad: "Otomasyon", aciklama: "Otomatik taslak eşiği ve günlük sınırı, yazım üslubu, gürültü kelimeleri, modeller", admin: true },
  ] },
  { ad: "Ekip", satirlar: [
    { yol: "/yonetim", ad: "Ekip ve roller", aciklama: "Kim neyi görür, davet, site rolleri", admin: true },
  ] },
  { ad: "Sistem", satirlar: [
    { yol: "/baglantilar", ad: "Bağlantı anahtarları", aciklama: "Claude, Gemini, Cloudflare, Amazon, Brave", admin: true },
    { yol: "/sistem", ad: "Sistem durumu", aciklama: "Zamanlanmış işler, altyapı, son çalışmalar", admin: true },
    { yol: "/hareketler", ad: "Hareket geçmişi", aciklama: "Kim, ne zaman, neyi değiştirdi", admin: true },
    { yol: "/yz-kiyas", ad: "Yapay zekâ kıyası", aciklama: "Modellerin eleme, taslak ve künyedeki karşılaştırması", admin: true },
    { yol: "/deneme-masasi", ad: "Deneme masası", aciklama: "Yayına dokunmadan taslak ve görsel denemesi", admin: true },
  ] },
];

export default function Yonetim() {
  const { profile } = useAuth();
  const acik = BOLUMLER.map((b) => ({ ...b, satirlar: b.satirlar.filter((s) => !s.admin || profile?.is_admin) })).filter((b) => b.satirlar.length);
  return (
    <div className="mas">
      <div className="mas-bas"><div><h1>Ayarlar</h1><p className="mas-bulgu">Yönetim ayarlarının hepsi burada. Bir satıra basınca ilgili ekran açılır.</p></div></div>
      {!acik.length && <div className="mas-kart"><div className="mas-bos">Bu bölümleri yalnız yönetici açabilir.</div></div>}
      {acik.map((b) => (
        <section key={b.ad} className="mas-kart" aria-label={b.ad}>
          <div className="mas-kart-bas"><h2>{b.ad}</h2></div>
          <ul className="mas-baglar">
            {b.satirlar.map((s) => <li key={s.yol}><Link to={s.yol}><span><b>{s.ad}</b><span>{s.aciklama}</span></span><Ikon ad="ileri" /></Link></li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Telefonda alt çubuktaki "Menü": menünün tamamı liste olarak (masaüstünde sol menü zaten açık) */
export function MenuSayfa() {
  const { profile } = useAuth();
  const yonetici = yonetirMi(profile) && !editorGibi(profile);
  return (
    <div className="mas">
      <div className="mas-bas"><div><h1>Menü</h1></div></div>
      {GRUPLAR.filter((g) => !g.yonetici || yonetici).map((g, i) => (
        <section key={i} className="mas-kart" aria-label={g.ad || g.ogeler[0].ad}>
          {g.ad && <div className="mas-kart-bas"><h2>{g.ad}</h2></div>}
          <ul className="mas-baglar simge">
            {g.ogeler.map((o) => <li key={o.yol}><Link to={o.yol}><span className="mas-bag-ikon"><Ikon ad={o.ikon} /><b>{o.ad}</b></span><Ikon ad="ileri" /></Link></li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
