import { type FormEvent } from "react";
import { useAuth } from "../../shared/auth";
import { sb } from "../../shared/supabase";
import { BU_HAFTA, GUN, iso } from "../../shared/tarih";
import { hataMetni, useToast } from "../../shared/toast";
import { useVeri } from "../../shared/veri";
import { bosGunler } from "./ortak";

export default function Uyeler() {
  const { veri, yenile } = useVeri();
  const { profile, reloadProfile } = useAuth();
  const toast = useToast();
  const ben = profile!;

  async function kaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await sb.from("profiles").update({
      name: String(f.get("ad")).trim(), role: String(f.get("rol")).trim(),
      org: String(f.get("yer")).trim(), notify_email: f.get("eposta") === "1",
    }).eq("id", ben.id);
    if (r.error) return toast(hataMetni(r.error));
    toast("Kaydedildi."); reloadProfile(); yenile();
  }

  return (
    <>
      <h2>Ekip</h2>
      <div className="cards">
        {veri.profiles.map((m) => (
          <div className="kart" key={m.id}>
            <div className="ust"><div className="avatar">{(m.name || "?")[0]}</div>
              <div><div className="bname">{m.name}</div><div className="muted">{m.role || "Rol girilmedi"}</div></div></div>
            {m.org && <div className="row"><span className="pill blue">{m.org}</span></div>}
            <div className="muted">
              Bu hafta boş: {bosGunler(veri, m.id, BU_HAFTA, GUN, iso) || "işaretlemedi"}<br />
              Üzerindeki iş: {veri.jobs.filter((j) => j.status === "atandi" && j.assignee === m.id).length}
            </div>
          </div>
        ))}
      </div>
      <h3>Profilim</h3>
      <div className="panel">
        <form className="grid" onSubmit={kaydet} key={ben.id + ben.name}>
          <label htmlFor="p-ad">Ad<input id="p-ad" name="ad" type="text" required maxLength={40} defaultValue={ben.name} /></label>
          <label htmlFor="p-rol">Rol<input id="p-rol" name="rol" type="text" maxLength={40} placeholder="Editör, lens uzmanı…" defaultValue={ben.role} /></label>
          <label htmlFor="p-yer">Çalıştığın yer<input id="p-yer" name="yer" type="text" maxLength={40} placeholder="GZT, Sigma…" defaultValue={ben.org} /></label>
          <label htmlFor="p-eposta">E-posta bildirimi
            <select id="p-eposta" name="eposta" defaultValue={ben.notify_email ? "1" : ""}><option value="1">Açık</option><option value="">Kapalı</option></select>
          </label>
          <button className="btn">Kaydet</button>
        </form>
      </div>
    </>
  );
}
