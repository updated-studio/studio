import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import { Avatar } from "../../shared/Avatar";
import { BU_HAFTA, GUN, iso } from "../../shared/tarih";
import { useVeri } from "../../shared/veri";
import { KisiProfil, Siralama } from "./Katki";
import { bosGunler } from "./ortak";

export default function Uyeler() {
  const { veri } = useVeri();
  const { profile } = useAuth();
  const [ara, setAra] = useState("");
  const [acik, setAcik] = useState<string | null>(null);
  const q = ara.trim().toLocaleLowerCase("tr");
  const liste = veri.profiles.filter((m) => !q || [m.name, m.role, m.org].join(" ").toLocaleLowerCase("tr").includes(q));

  const secili = acik ? veri.profiles.find((p) => p.id === acik) : undefined;
  if (secili) return <KisiProfil p={secili} kapat={() => setAcik(null)} />;

  return (
    <>
      <Siralama ac={setAcik} />
      <div className="row">
        <h2 style={{ marginRight: "auto" }}>Ekip <span className="muted" style={{ fontSize: 15 }}>{veri.profiles.length} kişi</span></h2>
        <Link className="btn ghost sm" to="/profil">Profilimi düzenle</Link>
      </div>
      {veri.profiles.length > 8 && (
        <input type="search" placeholder="İsim, rol veya kurum ara…" value={ara} onChange={(e) => setAra(e.target.value)} aria-label="Ekipte ara" />
      )}
      <div className="cards">
        {liste.map((m) => (
          <div className="kart" key={m.id} role="button" tabIndex={0} style={{ cursor: "pointer" }}
            onClick={() => setAcik(m.id)} onKeyDown={(e) => { if (e.key === "Enter") setAcik(m.id); }}>
            <div className="ust"><Avatar kisi={m} boyut={44} />
              <div><div className="bname">{m.name}{m.id === profile?.id && <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}> (sen)</span>}</div>
                <div className="muted">{m.role || "Rol girilmedi"}</div></div></div>
            {m.org && <div className="row"><span className="pill blue">{m.org}</span></div>}
            <div className="muted">
              Bu hafta boş: {bosGunler(veri, m.id, BU_HAFTA, GUN, iso) || "işaretlemedi"}<br />
              Üzerindeki iş: {veri.jobs.filter((j) => j.status === "atandi" && j.assignee === m.id).length}
            </div>
          </div>
        ))}
        {!liste.length && <div className="muted">Eşleşen kişi yok.</div>}
      </div>
    </>
  );
}
