import { useState } from "react";
import { useToast } from "../../shared/toast";
import { istekYap } from "./api";

// Kullanıcının panel API anahtarı (panelin "Enable API Key"i): dış araçlar panele bu anahtarla, kişinin yetkileriyle bağlanır.
// Anahtar Stüdyo'da üretilir, yalnız bir kez gösterilir (panel saklarken şifreler, geri okutmaz). Site rolü "yok" olunca anahtar kendiliğinden kapanır (Stüdyo göçü 0026).
type Kayit = Record<string, unknown>;

export default function ApiAnahtari({ yol, kayit, degisti }: { yol: string; kayit: Kayit; degisti: (d: Kayit) => void }) {
  const toast = useToast();
  const [yeni, setYeni] = useState("");
  const [mesgul, setMesgul] = useState(false);
  const acik = !!kayit.enableAPIKey && kayit.hasAPIKey !== false;

  async function yaz(govde: Kayit, mesaj: string) {
    setMesgul(true);
    try { const r = await istekYap<{ doc: Kayit }>(`${yol}?depth=0`, { method: "PATCH", body: JSON.stringify(govde) }); degisti(r.doc); toast(mesaj); return true; }
    catch (e) { toast((e as Error).message); return false; }
    finally { setMesgul(false); }
  }
  async function uret() {
    if (acik && !confirm("Yeni anahtar üretilince eskisi hemen çalışmaz olur. Devam edilsin mi?")) return;
    const anahtar = crypto.randomUUID();
    if (await yaz({ enableAPIKey: true, apiKey: anahtar }, "API anahtarı üretildi.")) setYeni(anahtar);
  }
  async function kapat() {
    if (!confirm("API anahtarı kapatılsın mı? Bu anahtarı kullanan araçlar panele bağlanamaz.")) return;
    if (await yaz({ enableAPIKey: false, apiKey: null }, "API anahtarı kapatıldı.")) setYeni("");
  }

  return (
    <fieldset className="site-grup">
      <legend>API anahtarı</legend>
      <span className="muted">Dış araçların panele bu kişinin yetkileriyle bağlanması için. Gerekmedikçe kapalı kalsın.</span>
      <div className="row">
        <span className={`site-durum site-durum--${acik ? "yayinda" : "taslak"}`}>{acik ? "● Açık" : "○ Kapalı"}</span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost sm" disabled={mesgul} onClick={uret}>{acik ? "Yenisini üret" : "Anahtar üret"}</button>
        {acik && <button className="btn ghost sm" disabled={mesgul} onClick={kapat}>Kapat</button>}
      </div>
      {yeni && (
        <div className="msg site-anahtar">
          <b>Anahtarı şimdi kopyala; bir daha gösterilmez.</b>
          <code>{yeni}</code>
          <span className="muted">İsteklerde başlık: <code>Authorization: users API-Key {"<anahtar>"}</code></span>
          <div className="row"><button className="btn sm" onClick={() => navigator.clipboard.writeText(yeni).then(() => toast("Kopyalandı."), () => toast("Kopyalanamadı; elle seç."))}>Kopyala</button><button className="btn ghost sm" onClick={() => setYeni("")}>Tamam</button></div>
        </div>
      )}
    </fieldset>
  );
}
