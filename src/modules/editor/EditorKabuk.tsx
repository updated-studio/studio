import { lazy, Suspense } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import Bildirimler from "../../shared/Bildirimler";
import { Ikon } from "../../shared/Ikon";
import ProfilMenu from "../../shared/ProfilMenu";
import SohbetDugme from "../../shared/SohbetDugme";
import SurumUyarisi from "../../shared/SurumUyarisi";
import Yenilikler from "../../shared/Yenilikler";
import { MODULLER } from "..";
import { gorevleri, ONIZLEME_ANAHTARI } from "./gorev";
import { rehberBaslat } from "./Rehber";
import "./editor.css";

// Editör görünümü (1 Kasım 2026, kullanıcı: "editörler ihtiyaçları hariç hiçbir şeyi görmesin; yöneticiler her şeyi görmeye devam etsin;
// düğmeler ikonlu; girip işini yapıp çıksın"). Yönetici olmayan herkes bunu görür; yönetici profil menüsünden deneyebilir.
// Masaüstünde solda menü, telefonda altta sekme çubuğu. Menüde yalnız kişinin işine (gorev.ts) göre bölümler.
const Bugun = lazy(() => import("./Bugun"));
const Taslaklarim = lazy(() => import("./Taslaklarim"));
const HaberYazSayfa = lazy(() => import("./Taslaklarim").then((m) => ({ default: () => <YazRota Yaz={m.HaberYaz} /> })));
const Cekim = lazy(() => import("./Cekim"));
const HaberMasasi = lazy(() => import("../haber-masasi/HaberMasasi"));
const Takvim = lazy(() => import("../takvim/Takvim"));
const Icerik = lazy(() => import("../icerik/Icerik"));
const Ekip = lazy(() => import("../ekip/Ekip"));

function YazRota({ Yaz }: { Yaz: (p: { id: number | "yeni" }) => React.ReactElement }) {
  const { id } = useParams();
  return <Yaz key={id} id={id === "yeni" || !id ? "yeni" : Number(id)} />;
}

type Oge = { yol: string; ad: string; ikon: string; esles?: string };

export default function EditorKabuk() {
  const { profile } = useAuth();
  const g = gorevleri(profile);
  const konum = useLocation(), git = useNavigate();
  const ogeler: Oge[] = [
    { yol: "/bugun", ad: "Bugün", ikon: "bugun" },
    ...(g.includes("haber") ? [{ yol: "/yaz/yeni", ad: "Haber yaz", ikon: "yaz", esles: "/yaz" }, { yol: "/taslaklarim", ad: "Taslaklarım", ikon: "taslak" }, { yol: "/masa", ad: "Haber Masası", ikon: "masa" }] : []),
    ...(g.includes("video") ? [{ yol: "/cekim", ad: "Çekim listesi", ikon: "liste" }, { yol: "/ekip", ad: "İşler ve hafta", ikon: "ekip" }] : []),
    ...(g.includes("tasarim") || g.includes("sosyal") ? [{ yol: "/icerik", ad: "İçerik", ikon: "icerik" }] : []),
    { yol: "/takvim", ad: "Takvim", ikon: "takvim" },
  ];
  // Telefonda alt çubukta en çok 5: "Haber yaz" Bugün'deki büyük düğmede
  const alt = ogeler.filter((o) => o.yol !== "/yaz/yeni").sort((a, b) => Number(a.yol === "/ekip") - Number(b.yol === "/ekip")).slice(0, 5); // sığmazsa İşler profil menüsünden
  const etkin = (o: Oge) => konum.pathname.startsWith(o.esles ?? o.yol);
  const rehber = () => {
    try { localStorage.removeItem("rehber-goruldu:haber-yaz"); } catch { /* depolama kapalı */ }
    if (konum.pathname.startsWith("/yaz/")) rehberBaslat("haber-yaz"); else git("/yaz/yeni");
  };
  const profilde = [...MODULLER.filter((m) => m.id === "profil"), ...(g.includes("video") ? MODULLER.filter((m) => m.id === "ekip").map((m) => ({ ...m, ad: "İşler ve hafta" })) : [])];

  return (
    <div className="ed">
      <nav className="ed-menu" aria-label="Stüdyo menüsü">
        <div className="ed-marka"><span className="logo" role="img" aria-label="Updated" /><i /><span>STÜDYO</span></div>
        {ogeler.map((o) => <NavLink key={o.yol} to={o.yol} className={etkin(o) ? "on" : ""} aria-current={etkin(o) ? "page" : undefined}><Ikon ad={o.ikon} />{o.ad}</NavLink>)}
        <div className="ed-menu-alt">
          {g.includes("haber") && <button onClick={rehber}><Ikon ad="yardim" />Rehberi yeniden göster</button>}
          {profile!.is_admin && <button onClick={() => { try { localStorage.removeItem(ONIZLEME_ANAHTARI); } catch { /* */ } location.hash = "#/site"; location.reload(); }}><Ikon ad="yonetim" />Yönetici görünümüne dön</button>}
        </div>
      </nav>

      <div className="ed-govde">
        <header className="ed-tepe">
          <div className="ed-marka ed-marka-tel"><span className="logo" role="img" aria-label="Updated" /><i /><span>STÜDYO</span></div>
          <span style={{ flex: 1 }} />
          <SohbetDugme />
          <Bildirimler />
          <ProfilMenu moduller={profilde} />
        </header>
        <SurumUyarisi />
        <Yenilikler />
        <main className="ed-ana-alan">
          <Suspense fallback={<div className="muted">Yükleniyor…</div>}>
            <Routes>
              <Route path="/bugun" element={<Bugun />} />
              <Route path="/yaz/:id" element={<HaberYazSayfa />} />
              <Route path="/taslaklarim" element={<Taslaklarim />} />
              <Route path="/masa" element={<HaberMasasi />} />
              <Route path="/cekim" element={<Cekim />} />
              <Route path="/cekim/:id" element={<Cekim />} />
              <Route path="/takvim" element={<Takvim />} />
              <Route path="/icerik" element={<Icerik />} />
              <Route path="/ekip" element={<Ekip />} />
              {MODULLER.filter((m) => m.id === "profil").map((m) => <Route key={m.id} path={"/" + m.id} element={<m.bilesen />} />)}
              <Route path="/haber-masasi" element={<Navigate to="/masa" replace />} />
              <Route path="*" element={<Navigate to="/bugun" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <nav className="ed-alt" aria-label="Alt menü">
        {alt.map((o) => <NavLink key={o.yol} to={o.yol} className={etkin(o) ? "on" : ""} aria-current={etkin(o) ? "page" : undefined}><Ikon ad={o.ikon} /><span>{o.ad.replace("Haber Masası", "Masa").replace("Çekim listesi", "Çekim").replace("Taslaklarım", "Taslaklar").replace("İşler ve hafta", "İşler")}</span></NavLink>)}
      </nav>
    </div>
  );
}
