import { useCallback, useEffect, useState } from "react";
import { istekYap } from "./api";

// Zamanlanmış yayın / yayından kaldırma (panelin kendi iş kuyruğu; site deposu endpoints/studyo.ts studyoZamanla).
// Saat gelince panel, zamanlayan kişinin yetkisiyle yayınlar; yayın kuralları (kontrol listesi, başlık kuralları) o an yeniden denetlenir.
export type Is = { id: number | string; tur: "publish" | "unpublish"; zaman: string; hata: string | null };
type Hedef = { koleksiyon: string; id: number } | { genel: string };

const sorgu = (h: Hedef) => ("genel" in h ? `genel=${encodeURIComponent(h.genel)}` : `koleksiyon=${h.koleksiyon}&id=${h.id}`);
export const tarihSaat = (s: string) => new Date(s).toLocaleString("tr-TR", { day: "numeric", month: "long", weekday: "short", hour: "2-digit", minute: "2-digit" });
const yerel = (d: Date) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

/** Kayda ait bekleyen ve başarısız zamanlamalar */
export function useZamanlamalar(hedef: Hedef | null, etkin: boolean) {
  const [isler, setIsler] = useState<Is[]>([]);
  const anahtar = hedef ? sorgu(hedef) : "";
  const yenile = useCallback(async () => {
    if (!anahtar || !etkin) return setIsler([]);
    try { setIsler((await istekYap<{ isler: Is[] }>(`/studyo/zamanla?${anahtar}`)).isler); } catch { setIsler([]); }
  }, [anahtar, etkin]);
  useEffect(() => { yenile(); }, [yenile]);
  return { isler, yenile };
}

/** Üst çubukta: bekleyen ilk zamanlama ya da son hata */
export function ZamanlamaEtiketi({ isler, ac }: { isler: Is[]; ac: () => void }) {
  const hata = isler.find((x) => x.hata);
  const ilk = isler.find((x) => !x.hata);
  if (hata) return <button className="site-durum site-durum--incelemede" onClick={ac} title={hata.hata!}>Zamanlanmış yayın olmadı</button>;
  if (!ilk) return null;
  return <button className="site-durum site-durum--planlandi" onClick={ac}>{ilk.tur === "publish" ? "Yayın" : "Kaldırma"}: {tarihSaat(ilk.zaman)}</button>;
}

export default function Zamanlama({ hedef, isler, yayinda, hazirlik, kapat, degisti }: {
  hedef: Hedef;
  isler: Is[];
  yayinda: boolean;
  /** Zamanlamadan önce: kaydedilmemiş değişikliği kaydeder, yayın kurallarını denetler; hata metni döndürürse zamanlanmaz */
  hazirlik: (tur: "publish" | "unpublish") => Promise<string | null>;
  kapat: () => void;
  degisti: () => void;
}) {
  const yarin = new Date(); yarin.setDate(yarin.getDate() + 1); yarin.setHours(9, 0, 0, 0);
  const [tur, setTur] = useState<"publish" | "unpublish">(yayinda ? "unpublish" : "publish");
  const [zaman, setZaman] = useState(yerel(yarin));
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState("");

  async function ekle() {
    setMesgul(true); setHata("");
    try {
      const engel = await hazirlik(tur);
      if (engel) { setHata(engel); return; }
      await istekYap("/studyo/zamanla", { method: "POST", body: JSON.stringify({ ...hedef, tur, zaman: new Date(zaman).toISOString() }) });
      degisti(); kapat();
    } catch (e) { setHata((e as Error).message); }
    finally { setMesgul(false); }
  }
  async function sil(is: Is) {
    if (!confirm("Bu zamanlama iptal edilsin mi?")) return;
    try { await istekYap(`/studyo/zamanla?is=${is.id}`, { method: "DELETE" }); degisti(); } catch (e) { setHata((e as Error).message); }
  }

  return (
    <div className="perde" onClick={kapat}>
      <div className="pencere" role="dialog" aria-label="Zamanla" onClick={(e) => e.stopPropagation()}>
        <h3>Zamanla</h3>
        {isler.length > 0 && (
          <div className="liste">
            {isler.map((x) => (
              <div key={x.id} className="satir">
                <div className="ana">
                  <b>{x.tur === "publish" ? "Yayınla" : "Yayından kaldır"}</b> <span className="muted">{tarihSaat(x.zaman)}</span>
                  {x.hata && <div className="site-uyari">Olmadı: {x.hata}</div>}
                </div>
                {!x.hata && <button className="btn ghost sm" onClick={() => sil(x)}>İptal</button>}
              </div>
            ))}
          </div>
        )}
        <label>Ne yapılsın
          <select value={tur} onChange={(e) => setTur(e.target.value as "publish" | "unpublish")}>
            <option value="publish">{yayinda ? "Değişiklikleri yayınla" : "Yayınla"}</option>
            {yayinda && <option value="unpublish">Yayından kaldır</option>}
          </select>
        </label>
        <label>Ne zaman<input type="datetime-local" value={zaman} min={yerel(new Date())} onChange={(e) => setZaman(e.target.value)} /></label>
        <span className="muted">Saat gelince panel bunu senin adına yapar. Yayın kuralları (kontrol listesi, başlık) o an yeniden denetlenir.</span>
        {hata && <div className="msg err">{hata}</div>}
        <div className="row"><span style={{ flex: 1 }} /><button className="btn ghost" onClick={kapat}>Vazgeç</button><button className="btn" disabled={mesgul || !zaman} onClick={ekle}>Zamanla</button></div>
      </div>
    </div>
  );
}
