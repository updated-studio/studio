import { lazy, Suspense } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import AltyapiUyari from "../../shared/altyapi";
import Bildirimler from "../../shared/Bildirimler";
import { Ikon, SimgeTanimlari } from "../../shared/Ikon";
import IkonUyarisi from "../../shared/IkonUyarisi";
import ProfilMenu from "../../shared/ProfilMenu";
import CanliKisiler from "../../shared/CanliKisiler";
import { CanliSaglayici } from "../../shared/canli";
import SohbetDugme from "../../shared/SohbetDugme";
import SurumUyarisi from "../../shared/SurumUyarisi";
import YayinKuyrugu from "../../shared/YayinKuyrugu";
import Yenilikler from "../../shared/Yenilikler";
import { MODULLER, type Modul } from "..";
import { editorGibi, ONIZLEME_ANAHTARI, yonetirMi } from "./gorev";
import { rehberBaslat } from "./Rehber";
import "./editor.css";

// Stüdyo'nun kabuğu (1 Kasım 2026, onaylı tasarım claude.ai/artifact/MHuFqWTFFZuDfzfoiGxsNE). Tasarım herkeste aynı; her editör haber yazar
// ve çekim listesini kullanır. Yönetim bölümleri (site içeriğinin tamamı, sistem, bağlantılar, hareket geçmişi, yönetim) yalnız yönetici ve
// yayın yönetmeninde. Masaüstünde solda menü, telefonda altta sekme çubuğu; sığmayanlar profil menüsünde.
const Bugun = lazy(() => import("./Bugun"));
const Taslaklar = lazy(() => import("./Taslaklarim"));
const OnayBekleyenler = lazy(() => import("./Taslaklarim").then((m) => ({ default: m.OnayBekleyenler })));
const Yayindakiler = lazy(() => import("./Taslaklarim").then((m) => ({ default: m.Yayindakiler })));
const HaberYazSayfa = lazy(() => import("./Taslaklarim").then((m) => ({ default: () => <YazRota Yaz={m.HaberYaz} /> })));
const Cekim = lazy(() => import("./Cekim"));

function YazRota({ Yaz }: { Yaz: (p: { id: number | "yeni" }) => React.ReactElement }) {
  const { id } = useParams();
  return <Yaz key={id} id={id === "yeni" || !id ? "yeni" : Number(id)} />;
}

type Oge = { yol: string; ad: string; ikon: string; esles?: string; kisa?: string };
// Editörden gizlenen modüller (yönetim ekranları); Haber Masası kendi menü öğesiyle açılır
const YONETIM = new Set(["site", "sistem", "baglantilar", "yz-kiyas", "deneme-masasi", "hareketler", "yonetim", "panel-giris"]);

export default function EditorKabuk() {
  const { profile } = useAuth();
  const yonetici = yonetirMi(profile) && !editorGibi(profile);
  const konum = useLocation(), git = useNavigate();
  const izinli = MODULLER.filter((m) => (!m.sadeceYonetici || profile?.is_admin) && (yonetici || !YONETIM.has(m.id)) && m.id !== "haber-masasi");
  const modulOge = (m: Modul): Oge => ({ yol: "/" + m.id, ad: m.ad, ikon: m.ikon });
  const ogeler: Oge[] = [
    { yol: "/bugun", ad: "Bugün", ikon: "bugun" },
    { yol: "/yaz/yeni", ad: "Haber yaz", ikon: "yaz", esles: "/yaz" },
    { yol: "/taslaklar", ad: "Taslaklar", ikon: "taslak" },
    { yol: "/onay", ad: "Onay bekleyenler", ikon: "check" },
    { yol: "/yayinda", ad: "Yayındakiler", ikon: "site" },
    { yol: "/haber-masasi", ad: "Haber Masası", ikon: "masa", kisa: "Masa" },
    { yol: "/cekim", ad: "Çekim listesi", ikon: "liste", kisa: "Çekim" },
    ...izinli.filter((m) => (m.yer ?? "dock") === "dock").map(modulOge),
  ];
  const alt = ["/bugun", "/taslaklar", "/haber-masasi", "/cekim", "/takvim"].map((y) => ogeler.find((o) => o.yol === y)).filter((o): o is Oge => !!o);
  const etkin = (o: Oge) => konum.pathname.startsWith(o.esles ?? o.yol);
  const rehber = () => {
    try { localStorage.removeItem("rehber-goruldu:haber-yaz"); } catch { /* depolama kapalı */ }
    if (konum.pathname.startsWith("/yaz/")) rehberBaslat("haber-yaz"); else git("/yaz/yeni");
  };
  // Profil menüsü: profil ve yönetim sayfaları + telefonda alt çubuğa sığmayan bölümler
  const profilde = izinli.filter((m) => m.yer === "profil" || ((m.yer ?? "dock") === "dock" && m.id !== "takvim"));
  const onizleme = yonetirMi(profile) && editorGibi(profile);
  // Logoya basınca ana ekran (Bugün); zaten oradaysa sayfa yenilenir (4 Kasım 2026, kullanıcı isteği)
  const anaSayfa = () => { if (konum.pathname.startsWith("/bugun")) location.reload(); else git("/bugun"); };

  return (
    <CanliSaglayici>
    <div className="ed">
      <SimgeTanimlari />
      <nav className="ed-menu simge" aria-label="Stüdyo menüsü">
        <button type="button" className="ed-marka" aria-label="Updated Stüdyo, Bugün" onClick={anaSayfa}><span className="logo" aria-hidden="true" /><i /><span>STÜDYO</span></button>
        {ogeler.map((o) => <NavLink key={o.yol} to={o.yol} className={etkin(o) ? "on" : ""} aria-current={etkin(o) ? "page" : undefined}><Ikon ad={o.ikon} />{o.ad}</NavLink>)}
        <div className="ed-menu-alt">
          <button onClick={rehber}><Ikon ad="yardim" />Rehberi yeniden göster</button>
          {onizleme && <button onClick={() => { try { localStorage.removeItem(ONIZLEME_ANAHTARI); } catch { /* */ } location.reload(); }}><Ikon ad="yonetim" />Yönetici görünümüne dön</button>}
        </div>
      </nav>

      <div className="ed-govde">
        <header className="ed-tepe">
          <button type="button" className="ed-marka ed-marka-tel" aria-label="Updated Stüdyo, Bugün" onClick={anaSayfa}><span className="logo" aria-hidden="true" /><i /><span>STÜDYO</span></button>
          <span style={{ flex: 1 }} />
          <CanliKisiler />
          <SohbetDugme />
          <Bildirimler />
          <ProfilMenu moduller={profilde} />
        </header>
        <div className="ed-uyarilar">
          <SurumUyarisi />
          {yonetici && <><AltyapiUyari /><IkonUyarisi /><YayinKuyrugu /></>}
          <Yenilikler />
        </div>
        <main className="ed-ana-alan">
          <Suspense fallback={<div className="muted">Yükleniyor…</div>}>
            <Routes>
              <Route path="/bugun" element={<Bugun />} />
              <Route path="/yaz/:id" element={<HaberYazSayfa />} />
              <Route path="/taslaklar" element={<Taslaklar />} />
              <Route path="/yayinda" element={<Yayindakiler />} />
              <Route path="/onay" element={<OnayBekleyenler />} />
              <Route path="/taslaklarim" element={<Navigate to="/taslaklar" replace />} />
              <Route path="/masa" element={<Navigate to="/haber-masasi" replace />} />
              <Route path="/cekim" element={<Cekim />} />
              {MODULLER.filter((m) => m.id === "haber-masasi" || izinli.includes(m)).map((m) => <Route key={m.id} path={"/" + m.id} element={<m.bilesen />} />)}
              <Route path="*" element={<Navigate to="/bugun" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <nav className="ed-alt simge" aria-label="Alt menü">
        {alt.map((o) => <NavLink key={o.yol} to={o.yol} className={etkin(o) ? "on" : ""} aria-current={etkin(o) ? "page" : undefined}><Ikon ad={o.ikon} /><span>{o.kisa ?? o.ad}</span></NavLink>)}
      </nav>
    </div>
    </CanliSaglayici>
  );
}
