import { HashRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { AuthGate, useAuth } from "./shared/auth";
import { Ikon } from "./shared/Ikon";
import ProfilMenu from "./shared/ProfilMenu";
import { MODULLER } from "./modules";
import Bildirimler from "./shared/Bildirimler";
import SohbetDugme from "./shared/SohbetDugme";
import SurumUyarisi from "./shared/SurumUyarisi";
import AltyapiUyari from "./shared/altyapi";
import IkonUyarisi from "./shared/IkonUyarisi";
import Yenilikler from "./shared/Yenilikler";
import { ToastProvider } from "./shared/toast";
import { VeriProvider } from "./shared/veri";

function Kabuk() {
  const { profile } = useAuth();
  const gorunen = MODULLER.filter((m) => !m.sadeceYonetici || profile?.is_admin);
  const dock = gorunen.filter((m) => (m.yer ?? "dock") === "dock");
  const profilde = gorunen.filter((m) => m.yer === "profil");
  return (
    <div className="wrap">
      <header className="row" style={{ gap: 12 }}>
        <div className="brand" style={{ marginRight: "auto" }}><span className="logo" role="img" aria-label="Updated" /><span>Stüdyo</span></div>
        <SohbetDugme />
        <Bildirimler />
        <ProfilMenu moduller={profilde} />
      </header>
      <SurumUyarisi />
      <AltyapiUyari />
      <IkonUyarisi />
      <Yenilikler />
      <nav className="dock" aria-label="Ana menü">
        {dock.map((m) => (
          <NavLink key={m.id} to={"/" + m.id} title={m.ad} style={{ "--k": `var(--${m.renk ?? "blue"})` } as React.CSSProperties}>
            <span className="kare"><Ikon ad={m.ikon} /></span><span className="ad">{m.ad}</span>
          </NavLink>
        ))}
      </nav>
      <main style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Routes>
          {gorunen.map((m) => <Route key={m.id} path={"/" + m.id} element={<m.bilesen />} />)}
          <Route path="*" element={<Navigate to={"/" + dock[0].id} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthGate>
        <VeriProvider>
          <HashRouter>
            <Kabuk />
          </HashRouter>
        </VeriProvider>
      </AuthGate>
    </ToastProvider>
  );
}
