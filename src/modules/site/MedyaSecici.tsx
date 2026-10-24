import { useEffect, useState } from "react";
import * as api from "./api";
import type { Medya } from "./api";

/** Görsel seç: sitenin görsel arşivinden ya da yeni yükleyerek. Yüklemede alt metin ve künye zorunlu (kit §2, §11). */
export default function MedyaSecici({ sec, kapat, altSinir }: { sec: (m: Medya) => void; kapat: () => void; altSinir: number }) {
  const [sekme, setSekme] = useState<"arsiv" | "yukle">("arsiv");
  const [ara, setAra] = useState("");
  const [liste, setListe] = useState<Medya[] | null>(null);
  const [sayfa, setSayfa] = useState(1);
  const [devam, setDevam] = useState(false);
  const [hata, setHata] = useState("");
  const [dosya, setDosya] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [kunye, setKunye] = useState("");
  const [temsili, setTemsili] = useState(false);
  const [mesgul, setMesgul] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api.medyaListe(ara, sayfa)
        .then((r) => { setListe((o) => (sayfa > 1 && o ? [...o, ...r.docs] : r.docs)); setDevam(r.hasNextPage); })
        .catch((e) => setHata((e as Error).message));
    }, ara ? 300 : 0);
    return () => clearTimeout(t);
  }, [ara, sayfa]);

  async function yukle() {
    if (!dosya || !alt.trim() || !kunye.trim()) return;
    setMesgul(true); setHata("");
    try { sec(await api.medyaYukle(dosya, alt.trim(), kunye.trim(), temsili)); }
    catch (e) { setHata((e as Error).message); }
    finally { setMesgul(false); }
  }

  return (
    <div className="perde" onClick={kapat}>
      <div className="pencere site-medya" role="dialog" aria-label="Görsel seç" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <div className="segment" role="group">
            <button aria-pressed={sekme === "arsiv"} onClick={() => setSekme("arsiv")}>Arşivden seç</button>
            <button aria-pressed={sekme === "yukle"} onClick={() => setSekme("yukle")}>Yeni yükle</button>
          </div>
          <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={kapat}>Kapat</button>
        </div>
        {hata && <div className="msg err">{hata}</div>}
        {sekme === "arsiv" ? (
          <>
            <div className="filtre"><input type="search" placeholder="Alt metinde ya da dosya adında ara…" value={ara} onChange={(e) => { setAra(e.target.value); setSayfa(1); }} /></div>
            {!liste ? <div className="muted">Yükleniyor…</div> : !liste.length ? <div className="empty">Görsel bulunamadı.</div> : (
              <div className="site-medya-izgara">
                {liste.map((m) => (
                  <button key={m.id} className="site-medya-oge" onClick={() => sec(m)} title={m.alt}>
                    <img src={api.medyaAdres(api.medyaKucuk(m))} alt={m.alt ?? ""} loading="lazy" />
                    <span>{m.alt || m.filename}</span>
                  </button>
                ))}
              </div>
            )}
            {devam && <button className="btn ghost" onClick={() => setSayfa(sayfa + 1)}>Daha fazla</button>}
          </>
        ) : (
          <div className="site-form">
            <label>Dosya<input type="file" accept="image/*" onChange={(e) => setDosya(e.target.files?.[0] ?? null)} /></label>
            <label>Alt metin <span className="muted">(ne + önemli detay, tek cümle · {alt.length}/{altSinir})</span>
              <input type="text" value={alt} maxLength={altSinir} onChange={(e) => setAlt(e.target.value)} /></label>
            <label>Künye <span className="muted">(ör. Görsel: Apple · Fotoğraf: Ad Soyad / UPDATED)</span>
              <input type="text" value={kunye} onChange={(e) => setKunye(e.target.value)} /></label>
            <label className="row"><input type="checkbox" checked={temsili} onChange={(e) => setTemsili(e.target.checked)} /> Temsili görsel</label>
            <button className="btn" disabled={mesgul || !dosya || !alt.trim() || !kunye.trim()} onClick={yukle}>{mesgul ? "Yükleniyor…" : "Yükle ve seç"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
