import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import AltyapiUyari from "../../shared/altyapi";
import Bildirimler from "../../shared/Bildirimler";
import { Ikon, SimgeTanimlari } from "../../shared/Ikon";
import IkonUyarisi from "../../shared/IkonUyarisi";
import ProfilMenu from "../../shared/ProfilMenu";
import Arama, { type AramaBolumu } from "../../shared/Arama";
import CanliKisiler from "../../shared/CanliKisiler";
import { CanliSaglayici } from "../../shared/canli";
import SohbetDugme from "../../shared/SohbetDugme";
import SurumUyarisi from "../../shared/SurumUyarisi";
import { sb } from "../../shared/supabase";
import Yenilikler from "../../shared/Yenilikler";
import { MODULLER } from "..";
import { editorGibi, ONIZLEME_ANAHTARI, yonetirMi } from "./gorev";
import { ALT_CUBUK, GRUPLAR, type Grup, type Oge } from "./menu";
import { rehberBaslat } from "./Rehber";
import "./editor.css";

// Stüdyo'nun kabuğu. 1 Kasım 2026'da kuruldu (solda menü, telefonda alt çubuk); 6 Kasım 2026'da yeni düzene geçti (onaylı düzen
// claude.ai/artifact/Mv3EEBjadgjSdnRiRCaLFF, tasarım claude.ai/artifact/AHBvDdvU7gVcXunmXsZet2): menü gruplar hâlinde (menu.ts), ana ekran Masam,
// "Bugün" /bugun adresinde eski ekran olarak duruyor. Tasarım herkeste aynı; Site içeriği ve Yönetim grupları yalnız yöneticide.
const Masam = lazy(() => import("./Masam"));
const Bugun = lazy(() => import("./Bugun"));
const Taslaklar = lazy(() => import("./Taslaklarim"));
const OnayBekleyenler = lazy(() => import("./Taslaklarim").then((m) => ({ default: m.OnayBekleyenler })));
const Yayindakiler = lazy(() => import("./Taslaklarim").then((m) => ({ default: m.Yayindakiler })));
const HaberYazSayfa = lazy(() => import("./Taslaklarim").then((m) => ({ default: () => <YazRota Yaz={m.HaberYaz} /> })));
const Cekim = lazy(() => import("./Cekim"));
const Oku = lazy(() => import("./Oku"));
const Yonetim = lazy(() => import("./Yonetim"));
const MenuSayfa = lazy(() => import("./Yonetim").then((m) => ({ default: m.MenuSayfa })));

function YazRota({ Yaz }: { Yaz: (p: { id: number | "yeni" }) => React.ReactElement }) {
  const { id } = useParams();
  return <Yaz key={id} id={id === "yeni" || !id ? "yeni" : Number(id)} />;
}

// Editörden gizlenen modüller (yönetim ekranları); Haber Masası kendi menü öğesiyle açılır
const YONETIM = new Set(["site", "sistem", "baglantilar", "yz-kiyas", "deneme-masasi", "hareketler", "yonetim", "panel-giris"]);

export default function EditorKabuk() {
  const { profile } = useAuth();
  const yonetici = yonetirMi(profile) && !editorGibi(profile);
  const konum = useLocation(), git = useNavigate();
  const [sp] = useSearchParams();
  const izinli = MODULLER.filter((m) => (!m.sadeceYonetici || profile?.is_admin) && (yonetici || !YONETIM.has(m.id)) && m.id !== "haber-masasi");
  const gruplar = GRUPLAR.filter((g) => !g.yonetici || yonetici);
  const etkin = (o: Oge) => o.etkin(konum.pathname, sp);
  const rehber = () => {
    try { localStorage.removeItem("rehber-goruldu:haber-yaz"); } catch { /* depolama kapalı */ }
    if (konum.pathname.startsWith("/yaz/")) rehberBaslat("haber-yaz"); else git("/yaz/yeni");
  };
  // Profil menüsü: yalnız profil (ayar ekranları Yönetim'de, bölümler ve marka kiti menüde)
  const profilde = izinli.filter((m) => m.id === "profil");
  // Üst çubuktaki aramanın "Bölümler" listesi: kişinin menüsünde ne varsa
  const aramaBolumleri: AramaBolumu[] = [
    ...gruplar.flatMap((g) => g.ogeler.map((o) => ({ ad: o.ad, yol: o.yol, ikon: o.ikon, grup: g.ad || undefined }))),
    { ad: "Yeni yaz", yol: "/yaz/yeni", ikon: "yaz", grup: "Haberler" },
    { ad: "Profilim", yol: "/profil", ikon: "profil" },
  ];
  const onizleme = yonetirMi(profile) && editorGibi(profile);
  // Logoya basınca ana ekran (Masam); zaten oradaysa sayfa yenilenir (4 Kasım 2026, kullanıcı isteği)
  const anaSayfa = () => { if (konum.pathname.startsWith("/masam")) location.reload(); else git("/masam"); };
  // Onay bekleyen künye sayısı (yalnız yönetici): menüde Künyeler'in yanında
  const [kunye, setKunye] = useState(0);
  useEffect(() => {
    if (!yonetici) return;
    sb.from("kunye_oneriler").select("id", { count: "exact", head: true }).eq("durum", "bekliyor").then(({ count }) => setKunye(count ?? 0));
  }, [yonetici, konum.pathname]);
  const say = (o: Oge) => (o.ad === "Künyeler" && kunye ? kunye : 0);
  // Açılır grup (Yönetim): seçim tarayıcıda hatırlanır; içindeki bir sayfa açıkken hep açık görünür
  const [acikGrup, setAcikGrup] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem("menu-acik") || "{}"); } catch { return {}; } });
  const grupAcik = (g: Grup) => g.ogeler.some(etkin) || !!acikGrup[g.ad];
  const grupDegis = (g: Grup) => setAcikGrup((x) => { const y = { ...x, [g.ad]: !grupAcik(g) }; try { localStorage.setItem("menu-acik", JSON.stringify(y)); } catch { /* depolama kapalı */ } return y; });
  const bag = (o: Oge, kisa = false) => (
    <NavLink key={o.yol} to={o.yol} className={etkin(o) ? "on" : ""} aria-current={etkin(o) ? "page" : undefined}>
      <Ikon ad={o.ikon} /><span>{kisa ? o.kisa ?? o.ad : o.ad}</span>{!kisa && say(o) > 0 && <span className="ed-say">{say(o)}</span>}
    </NavLink>
  );

  return (
    <CanliSaglayici>
    <div className="ed">
      <SimgeTanimlari />
      <nav className="ed-menu simge" aria-label="Stüdyo menüsü">
        <button type="button" className="ed-marka" aria-label="Updated Stüdyo, Masam" onClick={anaSayfa}><span className="logo" aria-hidden="true" /><i /><span>STÜDYO</span></button>
        <div className="ed-gruplar">
          {gruplar.map((g, i) => g.acilir ? (
            // Açılır grup (yöneticiye özel): kapalıyken tek satır; içindeki bir sayfadayken kendiliğinden açık
            <div key={i} className={"ed-grup-m ed-acilir" + (grupAcik(g) ? " acik" : "")} role="group" aria-label={g.ad}>
              <button type="button" className="ed-grup-ac" aria-expanded={grupAcik(g)} onClick={() => grupDegis(g)}>
                <Ikon ad={g.ikon ?? "yonetim"} /><span>{g.ad}</span>
                {!grupAcik(g) && g.ogeler.reduce((n, o) => n + say(o), 0) > 0 && <span className="ed-say">{g.ogeler.reduce((n, o) => n + say(o), 0)}</span>}
                <span className="ed-ok" aria-hidden="true"><Ikon ad="ileri" /></span>
              </button>
              {grupAcik(g) && <div className="ed-acilir-ic">{g.ogeler.map((o) => bag(o))}</div>}
            </div>
          ) : (
            <div key={i} className="ed-grup-m" role="group" aria-label={g.ad || undefined}>
              {g.ad && <h2>{g.ad}</h2>}
              {g.ogeler.map((o) => bag(o))}
            </div>
          ))}
        </div>
        <div className="ed-menu-alt">
          <button onClick={rehber}><Ikon ad="yardim" />Yazım rehberini göster</button>
          <button onClick={() => git("/bugun")}><Ikon ad="saat" />Eski ana ekran</button>
          {onizleme && <button onClick={() => { try { localStorage.removeItem(ONIZLEME_ANAHTARI); } catch { /* */ } location.reload(); }}><Ikon ad="yonetim" />Yönetici görünümüne dön</button>}
        </div>
      </nav>

      <div className="ed-govde">
        <header className="ed-tepe">
          <button type="button" className="ed-marka ed-marka-tel" aria-label="Updated Stüdyo, Masam" onClick={anaSayfa}><span className="logo" aria-hidden="true" /><i /><span>STÜDYO</span></button>
          <span style={{ flex: 1 }} />
          <Arama bolumler={aramaBolumleri} />
          <CanliKisiler />
          <SohbetDugme />
          <Bildirimler />
          <ProfilMenu moduller={profilde} />
        </header>
        <div className="ed-uyarilar">
          <SurumUyarisi />
          {yonetici && <><AltyapiUyari /><IkonUyarisi /></>}
          <Yenilikler />
        </div>
        <main className="ed-ana-alan">
          <Suspense fallback={<div className="muted">Yükleniyor…</div>}>
            <Routes>
              <Route path="/masam" element={<Masam />} />
              <Route path="/bugun" element={<Bugun />} />
              <Route path="/oku/:id" element={<Oku />} />
              <Route path="/yaz/:id" element={<HaberYazSayfa />} />
              <Route path="/taslaklar" element={<Taslaklar />} />
              <Route path="/yayinda" element={<Yayindakiler />} />
              <Route path="/onay" element={<OnayBekleyenler />} />
              <Route path="/taslaklarim" element={<Navigate to="/taslaklar" replace />} />
              <Route path="/masa" element={<Navigate to="/haber-masasi" replace />} />
              <Route path="/cekim" element={<Cekim />} />
              <Route path="/menu" element={<MenuSayfa />} />
              {yonetici && <Route path="/yonetim-merkezi" element={<Yonetim />} />}
              {MODULLER.filter((m) => m.id === "haber-masasi" || izinli.includes(m)).map((m) => <Route key={m.id} path={"/" + m.id} element={<m.bilesen />} />)}
              <Route path="*" element={<Navigate to="/masam" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <nav className="ed-alt simge" aria-label="Alt menü">
        {ALT_CUBUK.map((o) => bag(o, true))}
      </nav>
    </div>
    </CanliSaglayici>
  );
}
