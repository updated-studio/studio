import { useState, type FormEvent } from "react";
import { sb } from "../../shared/supabase";
import { hataMetni, useToast } from "../../shared/toast";
import { useMasa } from "./veri";

// Sadece yöneticiler: saklama süresi, gürültü kelimeleri, Türkiye pazarı markaları, basın kiti.
export default function Ayarlar() {
  const { v } = useMasa();
  const toast = useToast();
  const [gun, setGun] = useState(String(v.ayarlar.saklama_gun ?? 3));
  const [kelimeler, setKelimeler] = useState(((v.ayarlar.gurultu_kelimeleri as string[]) ?? []).join("\n"));

  async function ayar(key: string, value: unknown, mesaj: string) {
    const r = await sb.from("tr_settings").upsert({ key, value });
    toast(r.error ? hataMetni(r.error) : mesaj);
  }
  async function markaEkle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await sb.from("tr_brands").upsert({ name: String(f.get("ad")).trim(), grp: String(f.get("grup")), note: String(f.get("not")).trim() });
    if (r.error) return toast(hataMetni(r.error));
    e.currentTarget.reset();
  }
  async function basinEkle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await sb.from("tr_press").insert({ brand: String(f.get("marka")).trim(), url: String(f.get("url")).trim(), note: String(f.get("not")).trim() });
    if (r.error) return toast(hataMetni(r.error));
    e.currentTarget.reset();
  }

  return (
    <>
      <div className="panel">
        <h3>Saklama</h3>
        <div className="muted">Havuzda kimsenin dokunmadığı (alınmamış, oylanmamış, pas geçilmemiş) haberler bu kadar gün sonra silinir. İşlem görmüş haberler kalır.</div>
        <div className="row">
          <input type="text" inputMode="numeric" value={gun} onChange={(e) => setGun(e.target.value.replace(/\D/g, ""))} style={{ width: 90 }} aria-label="Gün" /> gün
          <button className="btn sm" onClick={() => ayar("saklama_gun", Math.max(1, Math.min(60, Number(gun) || 3)), "Saklama süresi kaydedildi.")}>Kaydet</button>
        </div>
      </div>
      <div className="panel">
        <h3>Gürültü kelimeleri</h3>
        <div className="muted">Başlığında bunlardan biri geçen haber yapay zekâya gitmeden elenir. Her satıra bir tane.</div>
        <textarea className="alan" rows={8} value={kelimeler} onChange={(e) => setKelimeler(e.target.value)} />
        <div><button className="btn sm" onClick={() => ayar("gurultu_kelimeleri", kelimeler.split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean), "Gürültü kelimeleri kaydedildi.")}>Kaydet</button></div>
      </div>
      <div className="panel">
        <h3>Türkiye pazarı markaları</h3>
        <div className="muted">Öncelikli markaların haberleri öne çıkar; Hariç olanlar (Türkiye'de satılmayanlar) geride kalır.</div>
        <div className="row">
          {v.markalar.map((m) => (
            <span key={m.name} className="chip" title={m.note}>{m.name} <span className="muted">{m.grp}</span>
              <button className="linkbtn" aria-label={m.name + " sil"} onClick={async () => { const r = await sb.from("tr_brands").delete().eq("name", m.name); if (r.error) toast(hataMetni(r.error)); }}>×</button>
            </span>
          ))}
        </div>
        <form className="grid" onSubmit={markaEkle}>
          <label>Marka<input name="ad" type="text" required maxLength={40} /></label>
          <label>Grup<select name="grup"><option>Öncelikli</option><option>Normal</option><option>Hariç</option></select></label>
          <label>Not<input name="not" type="text" maxLength={60} /></label>
          <button className="btn">Ekle</button>
        </form>
      </div>
      <div className="panel">
        <h3>Basın kiti</h3>
        <div className="liste">
          {v.basin.map((b) => (
            <div key={b.id} className="satir">
              <div className="ana"><b>{b.brand}</b> <a href={b.url} target="_blank" rel="noreferrer">{b.url}</a>{b.note && <div className="muted">{b.note}</div>}</div>
              <button className="btn ghost sm" onClick={async () => { const r = await sb.from("tr_press").delete().eq("id", b.id); if (r.error) toast(hataMetni(r.error)); }}>Sil</button>
            </div>
          ))}
        </div>
        <form className="grid" onSubmit={basinEkle}>
          <label>Marka<input name="marka" type="text" required maxLength={40} /></label>
          <label>Basın sayfası<input name="url" type="text" required placeholder="https://" /></label>
          <label>Not<input name="not" type="text" maxLength={80} /></label>
          <button className="btn">Ekle</button>
        </form>
      </div>
    </>
  );
}
