import { useEffect, useState } from "react";
import * as api from "./api";

// Toplu görsel yükleme (panelin "Bulk Upload"u): birden çok dosya seçilir, her birine alt metin ve künye yazılır (kit §2, §11),
// sırayla yüklenir; olmayanın nedeni satırında görünür.
type Satir = { dosya: File; onizleme: string; alt: string; kunye: string; temsili: boolean; durum: "" | "yukleniyor" | "tamam" | string };

export default function TopluYukle({ altSinir, kapat, bitti }: { altSinir: number; kapat: () => void; bitti: (n: number) => void }) {
  const [satirlar, setSatirlar] = useState<Satir[]>([]);
  const [ortakKunye, setOrtakKunye] = useState("");
  const [mesgul, setMesgul] = useState(false);
  useEffect(() => () => satirlar.forEach((s) => URL.revokeObjectURL(s.onizleme)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const ekle = (fs: FileList | null) => {
    const yeni = [...(fs ?? [])].filter((f) => f.type.startsWith("image/"))
      .map((dosya) => ({ dosya, onizleme: URL.createObjectURL(dosya), alt: "", kunye: ortakKunye, temsili: false, durum: "" }));
    setSatirlar((o) => [...o, ...yeni]);
  };
  const yaz = (i: number, y: Partial<Satir>) => setSatirlar((o) => o.map((s, j) => (j === i ? { ...s, ...y } : s)));
  const bekleyen = satirlar.filter((s) => s.durum !== "tamam");
  const eksik = bekleyen.filter((s) => !s.alt.trim() || !s.kunye.trim()).length;

  async function yukle() {
    setMesgul(true);
    let n = 0;
    for (const [i, s] of satirlar.entries()) {
      if (s.durum === "tamam") continue;
      yaz(i, { durum: "yukleniyor" });
      try { await api.medyaYukle(s.dosya, s.alt.trim(), s.kunye.trim(), s.temsili); yaz(i, { durum: "tamam" }); n++; }
      catch (e) { yaz(i, { durum: (e as Error).message }); }
    }
    setMesgul(false);
    if (n) bitti(n);
  }
  const hepsiTamam = satirlar.length > 0 && !bekleyen.length;

  return (
    <div className="perde" onClick={() => !mesgul && kapat()}>
      <div className="pencere site-medya" role="dialog" aria-label="Toplu yükle" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h3>Toplu görsel yükle</h3><button className="btn ghost sm" style={{ marginLeft: "auto" }} disabled={mesgul} onClick={kapat}>Kapat</button></div>
        <label className="site-birak" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); ekle(e.dataTransfer.files); }}>
          <input type="file" accept="image/*" multiple aria-label="Dosyalar" onChange={(e) => { ekle(e.target.files); e.target.value = ""; }} />
          <span className="muted">Dosyaları seç ya da buraya bırak.</span>
        </label>
        {satirlar.length > 0 && (
          <label>Ortak künye <span className="muted">(boş künyelere yazılır)</span>
            <input type="text" value={ortakKunye} onChange={(e) => { const v = e.target.value; setOrtakKunye(v); setSatirlar((o) => o.map((s) => (s.durum !== "tamam" && (!s.kunye || s.kunye === ortakKunye) ? { ...s, kunye: v } : s))); }} placeholder="Görsel: Apple" />
          </label>
        )}
        <div className="site-toplu-yukle">
          {satirlar.map((s, i) => (
            <div key={s.onizleme} className="site-toplu-yukle-satir">
              <img src={s.onizleme} alt="" />
              <div className="site-form">
                <span className="muted">{s.dosya.name}</span>
                <input type="text" aria-label="Alt metin" placeholder={`Alt metin (ne + önemli detay) · ${s.alt.length}/${altSinir}`} maxLength={altSinir} value={s.alt} disabled={s.durum === "tamam"} onChange={(e) => yaz(i, { alt: e.target.value })} />
                <input type="text" aria-label="Künye" placeholder="Künye" value={s.kunye} disabled={s.durum === "tamam"} onChange={(e) => yaz(i, { kunye: e.target.value })} />
                <div className="row">
                  <label className="site-kutu"><input type="checkbox" checked={s.temsili} disabled={s.durum === "tamam"} onChange={(e) => yaz(i, { temsili: e.target.checked })} /> Temsili görsel</label>
                  <span style={{ flex: 1 }} />
                  {s.durum === "tamam" ? <span className="site-durum site-durum--yayinda">✓ Yüklendi</span>
                    : s.durum === "yukleniyor" ? <span className="muted">Yükleniyor…</span>
                    : <button className="btn ghost sm" disabled={mesgul} onClick={() => setSatirlar((o) => o.filter((_, j) => j !== i))}>Çıkar</button>}
                </div>
                {s.durum && !["tamam", "yukleniyor"].includes(s.durum) && <div className="msg err">{s.durum}</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="row">
          {eksik > 0 && <span className="muted">{eksik} görselde alt metin ya da künye eksik.</span>}
          <span style={{ flex: 1 }} />
          {hepsiTamam ? <button className="btn" onClick={kapat}>Tamam</button>
            : <button className="btn" disabled={mesgul || !bekleyen.length || eksik > 0} onClick={yukle}>{mesgul ? "Yükleniyor…" : `${bekleyen.length} görseli yükle`}</button>}
        </div>
      </div>
    </div>
  );
}
