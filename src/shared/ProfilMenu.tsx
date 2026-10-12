import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "./auth";
import { Avatar } from "./Avatar";
import { Ikon } from "./Ikon";
import { sb } from "./supabase";
import type { Modul } from "../modules";

// Sağ üstteki profil menüsü. Dock'ta değil burada görünen modüller (yer: "profil") listelenir.
export default function ProfilMenu({ moduller }: { moduller: Modul[] }) {
  const { profile } = useAuth();
  const [acik, setAcik] = useState(false);
  const kutu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!acik) return;
    const kapat = (e: MouseEvent) => { if (!kutu.current?.contains(e.target as Node)) setAcik(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAcik(false); };
    document.addEventListener("mousedown", kapat); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", kapat); document.removeEventListener("keydown", esc); };
  }, [acik]);

  if (!profile) return null;
  return (
    <div className="profilmenu" ref={kutu}>
      <button className="profilbtn" aria-label="Profil menüsü" aria-expanded={acik} onClick={() => setAcik(!acik)}>
        <Avatar kisi={profile} boyut={36} />
      </button>
      {acik && (
        <div className="panel profilpanel" role="menu">
          <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
            <Avatar kisi={profile} boyut={44} />
            <div style={{ minWidth: 0 }}>
              <div className="bname">{profile.name}</div>
              <div className="muted kisa-metin">{profile.role || profile.email}</div>
            </div>
          </div>
          <div className="menuliste">
            {moduller.map((m) => (
              <NavLink key={m.id} to={"/" + m.id} role="menuitem" onClick={() => setAcik(false)}>
                <Ikon ad={m.ikon} />{m.ad}
              </NavLink>
            ))}
            <button role="menuitem" onClick={() => sb.auth.signOut()}><Ikon ad="cikis" />Çıkış</button>
          </div>
        </div>
      )}
    </div>
  );
}
