import { HashRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { AuthGate, useAuth } from "./shared/auth";
import { Ikon } from "./shared/Ikon";
import { sb } from "./shared/supabase";
import { MODULLER } from "./modules";
import Bildirimler from "./shared/Bildirimler";
import SurumUyarisi from "./shared/SurumUyarisi";
import { ToastProvider } from "./shared/toast";
import { VeriProvider } from "./shared/veri";

function Kabuk() {
  const { profile } = useAuth();
  const gorunen = MODULLER.filter((m) => !m.sadeceYonetici || profile?.is_admin);
  return (
    <div className="wrap">
      <header className="row" style={{ gap: 12 }}>
        <div className="brand" style={{ marginRight: "auto" }}><b>UP</b>DATED<span>Stüdyo</span></div>
        <span className="muted">{profile?.name}</span>
        <Bildirimler />
        <button className="btn ghost sm" onClick={() => sb.auth.signOut()}><Ikon ad="cikis" />Çıkış</button>
      </header>
      <SurumUyarisi />
      <nav className="altmenu" aria-label="Ana menü">
        {gorunen.map((m) => (
          <NavLink key={m.id} to={"/" + m.id}>
            <Ikon ad={m.ikon} />{m.ad}
          </NavLink>
        ))}
      </nav>
      <main style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Routes>
          {gorunen.map((m) => <Route key={m.id} path={"/" + m.id} element={<m.bilesen />} />)}
          <Route path="*" element={<Navigate to={"/" + gorunen[0].id} replace />} />
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
