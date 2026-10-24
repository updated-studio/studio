import { useState } from "react";
import { useAuth } from "./auth";
import { Ikon } from "./Ikon";
import { sb } from "./supabase";
import { useVeri } from "./veri";

export default function Bildirimler() {
  const { veri, setVeri } = useVeri();
  const { profile } = useAuth();
  const [acik, setAcik] = useState(false);
  const okunmamis = veri.notifs.filter((n) => !n.read).length;

  async function ac() {
    const yeni = !acik;
    setAcik(yeni);
    if (yeni && okunmamis) {
      await sb.from("notifications").update({ read: true }).eq("user_id", profile!.id).eq("read", false);
      window.setTimeout(() => setVeri((v) => ({ ...v, notifs: v.notifs.map((n) => ({ ...n, read: true })) })), 1500);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button className="btn ghost sm zil" aria-label="Bildirimler" onClick={ac}>
        <Ikon ad="zil" />{okunmamis > 0 && <em>{okunmamis}</em>}
      </button>
      {acik && (
        <div className="panel bildirimler">
          <h3>Bildirimler</h3>
          <div className="liste">
            {veri.notifs.length ? veri.notifs.map((n) => (
              <div className="satir" key={n.id}><div className="ana">
                {!n.read && <span className="pill wait">Yeni</span>} {n.link ? <a href={n.link} onClick={() => setAcik(false)}>{n.body}</a> : n.body}
                <div className="muted">{new Date(n.created_at).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              </div></div>
            )) : <div className="muted">Bildirim yok.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
