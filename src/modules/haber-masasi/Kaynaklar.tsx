import { useState, type FormEvent } from "react";
import { useAuth } from "../../shared/auth";
import { sb } from "../../shared/supabase";
import { hataMetni, useToast } from "../../shared/toast";
import { zamanOnce } from "./ortak";
import { useMasa, type Kaynak } from "./veri";

const RENK: Record<string, string> = { "Çalışıyor": "ok", "Yavaş": "wait", "Ölü": "rose", "Boş": "wait", "Tarihsiz": "off" };

// Eski paneldeki hata kodu açıklamaları
const KOD: Record<string, string> = {
  "401": "Giriş veya abonelik istiyor; RSS herkese açık değil.",
  "403": "Site otomatik okumayı engelliyor (erişim reddedildi). Bizim tarafta çözülmez; kaynağı kapat ya da başka RSS bul.",
  "404": "RSS adresi bulunamadı. Adres değişmiş ya da silinmiş olabilir; yeni RSS linki lazım.",
  "410": "Adres kalıcı olarak kaldırılmış.",
  "429": "Site kısa sürede çok istek aldığını söyledi. Genelde kendiliğinden düzelir.",
  "500": "Sitenin kendi sunucusunda hata. Genelde geçici.",
  "502": "Sitenin sunucusu yanıt vermedi. Genelde geçici.",
  "503": "Site geçici olarak hizmet vermiyor. Genelde geçici.",
};
export function durumAcikla(k: Kaynak): string {
  const d = k.status || "";
  const m = d.match(/Hata\s+(\d+)/) ?? k.error.match(/(?:HTTP|Hata)\s+(\d+)/);
  if (m) return KOD[m[1]] ?? `Beklenmeyen hata kodu (${m[1]}).`;
  if (/^Hata/.test(d)) return "Kaynağa ulaşılamadı: " + k.error;
  if (d === "Ölü") return "7+ gündür yeni haber yok; kaynak durmuş olabilir.";
  if (d === "Yavaş") return "3+ gündür yeni haber yok; niş kaynaklarda normal olabilir.";
  if (d === "Boş") return "Kaynak okundu ama içinde haber yok.";
  return "";
}
/** Yöneticiye uyarı gösterilecek kaynaklar (açık olup "Çalışıyor" olmayanlar) */
export const sorunluKaynaklar = (l: Kaynak[]) => l.filter((k) => k.active && k.status && k.status !== "Çalışıyor");

export default function Kaynaklar() {
  const { v } = useMasa();
  const { profile } = useAuth();
  const toast = useToast();
  const yonetici = profile!.is_admin;
  const [calisiyor, setCalisiyor] = useState(false);
  const son = v.ayarlar.son_toplama as { zaman?: string; durum?: string; okunan?: number; yeni?: number; yapayZeka?: number; kural?: number; bekleyen?: number; hata?: string; aday?: number; elenen?: number; belirsiz?: number } | undefined;

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

  const sira = (d: string) => (d === "Çalışıyor" ? 3 : d === "Yavaş" ? 2 : d === "Boş" ? 1 : 0);
  const liste = [...v.kaynaklar].sort((a, b) => Number(b.active) - Number(a.active) || sira(a.status) - sira(b.status) || a.name.localeCompare(b.name, "tr"));

  return (
    <>
      <div className="panel">
        <div className="row">
          <div style={{ marginRight: "auto" }}>
            <b>Son toplama:</b> {son?.zaman ? zamanOnce(son.zaman) + " önce" : "henüz yok"}{son?.durum === "çalışıyor" ? " (sürüyor)" : ""}
            {son?.okunan !== undefined && <div className="muted">{son.okunan} haber okundu · {son.yeni} yeni · {son.yapayZeka} yapay zekâ etiketledi → {son.aday ?? 0} aday, {son.elenen ?? 0} elenen, {son.belirsiz ?? 0} belirsiz{son.bekleyen ? ` · ${son.bekleyen} sırada` : ""}</div>}
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
                <td><b>{k.name}</b><div className="muted">{k.category}</div>{durumAcikla(k) && <div className="muted" style={{ color: k.status === "Yavaş" || k.status === "Boş" ? undefined : "var(--err)" }}>{durumAcikla(k)}</div>}</td>
                <td><span className={"pill " + (RENK[k.status] ?? (k.status.startsWith("Hata") ? "rose" : "off"))}>{k.status || "Bekliyor"}</span></td>
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
