import { useEffect, useRef, useState } from "react";
import { sb } from "../../shared/supabase";
import { useAuth } from "../../shared/auth";
import { PANEL } from "./api";

// #/panel-giris: Payload'un kendi paneline (yedek kapı, yalnız yöneticiler) Stüdyo hesabıyla giriş.
// Oturum anahtarı form gövdesiyle gider (adres çubuğuna ve geçmişe yazılmaz); panel doğrulayıp kendi oturumunu açar
// (site deposu apps/cms/src/endpoints/studyo.ts studyoGiris).
export default function PanelGiris() {
  const { profile } = useAuth();
  const form = useRef<HTMLFormElement>(null);
  const [anahtar, setAnahtar] = useState("");
  const [rol, setRol] = useState<string | null>(null); // taze okunur: rol Stüdyo açıkken değişmiş olabilir
  useEffect(() => { sb.from("profiles").select("site_rol").eq("id", profile!.id).single().then(({ data }) => setRol(data?.site_rol ?? "yok")); }, [profile]);
  const yetkili = rol === "admin";
  useEffect(() => { if (yetkili) sb.auth.getSession().then(({ data }) => setAnahtar(data.session?.access_token ?? "")); }, [yetkili]);
  useEffect(() => { if (anahtar) form.current?.submit(); }, [anahtar]);
  if (rol === null) return <div className="muted">Yükleniyor…</div>;
  if (!yetkili) return <div className="empty">Site panelinin kendisi yalnız yöneticilere açık. Sitedeki her şeyi Stüdyo'nun <a href="#/site">Site</a> modülünden yönetebilirsin.</div>;
  return (
    <form ref={form} method="post" action={`${PANEL}/api/studyo/giris`}>
      <input type="hidden" name="anahtar" value={anahtar} />
      <div className="muted">Site paneline geçiliyor…</div>
    </form>
  );
}
