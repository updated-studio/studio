import { useState, type FormEvent } from "react";
import { useAuth } from "../../shared/auth";
import { sb } from "../../shared/supabase";
import { hataMetni, useToast } from "../../shared/toast";
import { zamanOnce } from "./ortak";
import { useMasa } from "./veri";

const RENK: Record<string, string> = { "Çalışıyor": "ok", "Yavaş": "wait", "Ölü": "rose", "Hata": "rose", "Tarihsiz": "off" };

export default function Kaynaklar() {
  const { v } = useMasa();
  const { profile } = useAuth();
  const toast = useToast();
  const yonetici = profile!.is_admin;
  const [calisiyor, setCalisiyor] = useState(false);
  const son = v.ayarlar.son_toplama as { zaman?: string; durum?: string; okunan?: number; yeni?: number; yapayZeka?: number; kural?: number; bekleyen?: number; hata?: string } | undefined;

  async function topla() {
    setCalisiyor(true);
    const { data, error } = await sb.functions.invoke("triyaj-topla", { body: { zorla: true } });
    setCalisiyor(false);
    if (error) return toast("Başlatılamadı: " + error.message);
    toast(data?.atlandi ?? "Toplama başladı. Yeni haberler bir iki dakika içinde havuza düşer.");
  }

  async function ekle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await sb.from("tr_sources").insert({ name: String(f.get("ad")).trim(), url: String(f.get("url")).trim(), category: String(f.get("kat")).trim() });
    if (r.error) return toast(hataMetni(r.error));
    e.currentTarget.reset(); toast("Kaynak eklendi; bir sonraki toplamada okunur.");
  }

  const saglik = ["Hata", "Ölü", "Yavaş", "Tarihsiz", "Çalışıyor"];
  const liste = [...v.kaynaklar].sort((a, b) => saglik.indexOf(a.status) - saglik.indexOf(b.status) || a.name.localeCompare(b.name, "tr"));

  return (
    <>
      <div className="panel">
        <div className="row">
          <div style={{ marginRight: "auto" }}>
            <b>Son toplama:</b> {son?.zaman ? zamanOnce(son.zaman) + " önce" : "henüz yok"}{son?.durum === "çalışıyor" ? " (sürüyor)" : ""}
            {son?.okunan !== undefined && <div className="muted">{son.okunan} haber okundu · {son.yeni} yeni · {son.kural} kuralla elendi · {son.yapayZeka} yapay zekâdan geçti{son.bekleyen ? ` · ${son.bekleyen} sırada` : ""}</div>}
            {son?.hata && <div className="msg err">{son.hata}</div>}
          </div>
          <button className="btn sm" onClick={topla} disabled={calisiyor}>Şimdi topla</button>
        </div>
        <div className="muted">Kendiliğinden 15 dakikada bir çalışır.</div>
      </div>
      <div className="panel tablo-kutu">
        <table>
          <thead><tr><th>Kaynak</th><th>Durum</th><th>Son haber</th><th>Okunan</th>{yonetici && <th>Açık</th>}</tr></thead>
          <tbody>
            {liste.map((k) => (
              <tr key={k.id}>
                <td><b>{k.name}</b><div className="muted">{k.category}</div>{k.error && <div className="muted" style={{ color: "var(--err)" }}>{k.error}</div>}</td>
                <td><span className={"pill " + (RENK[k.status] ?? "off")}>{k.status || "Bekliyor"}</span></td>
                <td className="muted">{k.last_item_at ? zamanOnce(k.last_item_at) + " önce" : "—"}</td>
                <td className="mono">{k.item_count ?? "—"}</td>
                {yonetici && <td><input type="checkbox" checked={k.active} aria-label={k.name + " açık"} onChange={async (e) => {
                  const r = await sb.from("tr_sources").update({ active: e.target.checked }).eq("id", k.id);
                  if (r.error) toast(hataMetni(r.error));
                }} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {yonetici && (
        <div className="panel">
          <h3>Kaynak ekle</h3>
          <form className="grid" onSubmit={ekle}>
            <label>Ad<input name="ad" type="text" required maxLength={60} /></label>
            <label>RSS adresi<input name="url" type="text" required placeholder="https://…/feed/" /></label>
            <label>Kategori<input name="kat" type="text" placeholder="Telefon ve Mobil" /></label>
            <button className="btn">Ekle</button>
          </form>
        </div>
      )}
    </>
  );
}
