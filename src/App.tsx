import { lazy, Suspense } from "react";
import { HashRouter } from "react-router-dom";
import { AuthGate } from "./shared/auth";
import { ToastProvider } from "./shared/toast";
import { VeriProvider } from "./shared/veri";

// Tek kabuk (1 Kasım 2026, kullanıcı: "tüm tasarım herkeste aynı; editörlerde bazı ayarlar, ekranlar, menüler görünmeyecek"):
// modules/editor/EditorKabuk.tsx. Yönetici ve yayın yönetmeni menüde yönetim bölümlerini de görür. Eski dock'lu kabuk kalktı.
const Kabuk = lazy(() => import("./modules/editor/EditorKabuk"));

export default function App() {
  return (
    <ToastProvider>
      <AuthGate>
        <VeriProvider>
          <HashRouter>
            <Suspense fallback={<div className="wrap muted">Yükleniyor…</div>}><Kabuk /></Suspense>
          </HashRouter>
        </VeriProvider>
      </AuthGate>
    </ToastProvider>
  );
}
