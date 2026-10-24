import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api";
import type { Medya } from "./api";
import MedyaSecici from "./MedyaSecici";
import { veriAlanlari, type KoleksiyonSema } from "./sema";

// Panelin herhangi bir bölümünün listesi: sütunlar panelin varsayılan sütunlarından, arama başlık alanında.
type Kayit = Record<string, unknown>;

const goster = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "✓" : "—";
  if (Array.isArray(v)) return v.length ? `${v.length} öğe` : "—";
  if (typeof v === "object") { const o = v as Kayit; return String(o.name ?? o.title ?? o.alt ?? o.filename ?? `#${o.id}`); }
  if (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v)) return new Date(v).toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return String(v);
};

export default function GenelListe({ k, ac }: { k: KoleksiyonSema; ac: (id: number | null) => void }) {
  const [ara, setAra] = useState("");
  const [veri, setVeri] = useState<{ docs: Kayit[]; sonraki: boolean; sayfa: number; toplam: number } | null>(null);
  const [hata, setHata] = useState("");
  const [yukleAcik, setYukleAcik] = useState(false);
  const alanAd = new Map(veriAlanlari(k.fields).map((a) => [a.name!, a.label ?? a.name!]));
  const sutunlar = k.sutunlar.filter((s) => s !== k.baslikAlani && s !== "id").slice(0, 3);

  const istekNo = useRef(0); // geç gelen eski yanıt yok sayılır
  const yukle = useCallback(async (sayfa = 1) => {
    setHata("");
    const no = ++istekNo.current;
    const p = new URLSearchParams({ depth: "1", limit: k.gorsel ? "48" : "25", page: String(sayfa), sort: "-updatedAt" });
    if (k.taslak) p.set("draft", "true");
    if (ara.trim()) p.set(`where[${k.baslikAlani}][like]`, ara.trim());
    try {
      const r = await api.istekYap<{ docs: Kayit[]; hasNextPage: boolean; totalDocs: number }>(`/${k.slug}?${p}`);
      if (no !== istekNo.current) return;
      setVeri((o) => ({ docs: sayfa > 1 && o ? [...o.docs, ...r.docs] : r.docs, sonraki: r.hasNextPage, sayfa, toplam: r.totalDocs }));
    } catch (e) { setHata((e as Error).message); }
  }, [k, ara]);
  useEffect(() => { setVeri(null); const t = setTimeout(() => yukle(1), ara ? 300 : 0); return () => clearTimeout(t); }, [yukle, ara]);

  return (
    <>
      <div className="row">
        <div className="filtre" style={{ flex: 1 }}><input type="search" placeholder={`${k.cogul} içinde ara…`} value={ara} onChange={(e) => setAra(e.target.value)} /></div>
        {k.gorsel
          ? <button className="btn sm" onClick={() => setYukleAcik(true)}>+ Görsel yükle</button>
          : k.giris
            ? <a className="btn ghost sm" href="#/yonetim">Yeni kişi: Ekip → Yönetim'den davet et</a> /* hesaplar Stüdyo'dan (tek giriş) */
            : <button className="btn sm" onClick={() => ac(null)}>+ Yeni {k.tekil.toLocaleLowerCase("tr-TR")}</button>}
      </div>
      <div className="panel">
        {hata && <div className="msg err">{hata}</div>}
        {!veri && !hata && <div className="muted">Yükleniyor…</div>}
        {veri && !veri.docs.length && <div className="empty">Henüz {k.cogul.toLocaleLowerCase("tr-TR")} yok.</div>}
        {veri && veri.docs.length > 0 && (k.gorsel ? (
          <div className="site-medya-izgara">
            {veri.docs.map((m) => (
              <button key={m.id as number} className="site-medya-oge" onClick={() => ac(m.id as number)} title={String(m.alt ?? "")}>
                <img src={api.medyaAdres(api.medyaKucuk(m as Medya))} alt={String(m.alt ?? "")} loading="lazy" />
                <span>{String(m.alt || m.filename || "")}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="liste">
            {veri.docs.map((d) => (
              <div key={d.id as number} className="satir">
                <div className="ana">
                  <button className="linkbtn site-baslik" onClick={() => ac(d.id as number)}>{goster(d[k.baslikAlani]) === "—" ? `#${d.id}` : goster(d[k.baslikAlani])}</button>
                  <div className="muted">{sutunlar.map((s) => `${alanAd.get(s) ?? s}: ${goster(d[s])}`).join(" · ")}</div>
                </div>
                {k.taslak && <span className={`site-durum site-durum--${d._status === "published" ? "yayinda" : "taslak"}`}>{d._status === "published" ? api.DURUMLAR.yayinda : api.DURUMLAR.taslak}</span>}
              </div>
            ))}
          </div>
        ))}
        {veri?.sonraki && <button className="btn ghost" onClick={() => yukle(veri.sayfa + 1)}>Daha fazla ({veri.toplam - veri.docs.length})</button>}
      </div>
      {yukleAcik && <MedyaSecici ilk="yukle" altSinir={125} kapat={() => setYukleAcik(false)} sec={(m) => { setYukleAcik(false); ac(m.id); }} />}
    </>
  );
}
