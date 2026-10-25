import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./api";
import type { Medya } from "./api";
import MedyaSecici from "./MedyaSecici";
import TopluYukle from "./TopluYukle";
import { veriAlanlari, type KoleksiyonSema } from "./sema";
import type { PanelKullanici } from "./api";
import TopluCubuk, { Secim, TumunuSec } from "./Toplu";
import { useToast } from "../../shared/toast";
import ListeAraclari, { aracAlanlari, goster, hucre, kosullariEkle, sorguAnahtari, useAraclar } from "./ListeAraclari";

// Panelin herhangi bir bölümünün listesi: sütunlar panelin varsayılan sütunlarından (kişi değiştirebilir), arama başlık alanında, filtre ve sıralama ListeAraclari'ndan.
type Kayit = Record<string, unknown>;

export default function GenelListe({ k, ac, kullanici }: { k: KoleksiyonSema; ac: (id: number | null) => void; kullanici: PanelKullanici }) {
  const toast = useToast();
  const [secili, setSecili] = useState<Set<number>>(new Set());
  const [ara, setAra] = useState("");
  const [veri, setVeri] = useState<{ docs: Kayit[]; sonraki: boolean; sayfa: number; toplam: number } | null>(null);
  const [hata, setHata] = useState("");
  const [yukleAcik, setYukleAcik] = useState(false);
  const [topluAcik, setTopluAcik] = useState(false);
  const alanAd = new Map(veriAlanlari(k.fields).map((a) => [a.name!, a.label ?? a.name!]));
  const aracAlan = useMemo(() => aracAlanlari(k.fields), [k]);
  const [arac, setArac] = useAraclar(k.slug, aracAlan, { sirala: "-updatedAt", sutunlar: k.sutunlar.filter((s) => s !== k.baslikAlani && s !== "id").slice(0, 3) });
  const anahtar = sorguAnahtari(arac);
  const aracRef = useRef(arac); aracRef.current = arac;
  const sutunAd = (s: string) => aracAlan.find((a) => a.yol === s)?.ad ?? alanAd.get(s) ?? s;

  const istekNo = useRef(0); // geç gelen eski yanıt yok sayılır
  const yukle = useCallback(async (sayfa = 1) => {
    setHata("");
    const no = ++istekNo.current;
    const p = new URLSearchParams({ depth: "1", limit: k.gorsel ? "48" : "25", page: String(sayfa), sort: aracRef.current.sirala || "-updatedAt" });
    if (k.taslak) p.set("draft", "true");
    if (ara.trim()) p.set(`where[and][0][${k.baslikAlani}][like]`, ara.trim());
    kosullariEkle(p, "where[and][1]", aracRef.current);
    try {
      const r = await api.istekYap<{ docs: Kayit[]; hasNextPage: boolean; totalDocs: number }>(`/${k.slug}?${p}`);
      if (no !== istekNo.current) return;
      setVeri((o) => ({ docs: sayfa > 1 && o ? [...o.docs, ...r.docs] : r.docs, sonraki: r.hasNextPage, sayfa, toplam: r.totalDocs }));
    } catch (e) { setHata((e as Error).message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, ara, anahtar]);
  // Onay bekleyen yorum: listeden tek tıkla yayına al ya da gizle
  const yorumDurum = async (id: number, durum: "yayinda" | "gizli") => {
    try { await api.istekYap(`/yorumlar/${id}?depth=0`, { method: "PATCH", body: JSON.stringify({ durum }) }); toast(durum === "yayinda" ? "Yorum yayında." : "Yorum gizlendi."); yukle(1); }
    catch (e) { toast((e as Error).message); }
  };
  const ilk = useRef(true); // açılışta hemen, yazarken 300 ms bekleyerek
  useEffect(() => { const t = setTimeout(() => yukle(1), ilk.current ? 0 : 300); ilk.current = false; return () => clearTimeout(t); }, [yukle]);

  return (
    <>
      <div className="row">
        <div className="filtre" style={{ flex: 1 }}><input type="search" placeholder={`${k.cogul} içinde ara…`} value={ara} onChange={(e) => setAra(e.target.value)} /></div>
        {k.gorsel
          ? <><button className="btn ghost sm" onClick={() => setTopluAcik(true)}>Toplu yükle</button><button className="btn sm" onClick={() => setYukleAcik(true)}>+ Görsel yükle</button></>
          : k.giris
            ? <a className="btn ghost sm" href="#/yonetim">Yeni kişi: Ekip → Yönetim'den davet et</a> /* hesaplar Stüdyo'dan (tek giriş) */
            : <button className="btn sm" onClick={() => ac(null)}>+ Yeni {k.tekil.toLocaleLowerCase("tr-TR")}</button>}
      </div>
      <ListeAraclari alanlar={aracAlan} d={arac} setD={(d) => { setArac(d); setSecili(new Set()); }} sutunlu={!k.gorsel} sabitSirala={[["updatedAt", "Güncellenme"], ["createdAt", "Oluşturulma"]]} />
      <div className="panel">
        {hata && <div className="msg err">{hata}</div>}
        {!veri && !hata && <div className="muted">Yükleniyor…</div>}
        {veri && !veri.docs.length && <div className="empty">Henüz {k.cogul.toLocaleLowerCase("tr-TR")} yok.</div>}
        {veri && veri.docs.length > 0 && !k.giris && <>
          <div className="row"><TumunuSec secili={secili} idler={veri.docs.map((d) => d.id as number)} degis={setSecili} /></div>
          <TopluCubuk k={k} secili={secili} kullanici={kullanici} bitti={(m) => { toast(m); setSecili(new Set()); yukle(1); }} />
        </>}
        {veri && veri.docs.length > 0 && (k.gorsel ? (
          <div className="site-medya-izgara">
            {veri.docs.map((m) => (
              <div key={m.id as number} className="site-medya-kutu">
                <Secim secili={secili} id={m.id as number} degis={setSecili} />
                <button className="site-medya-oge" onClick={() => ac(m.id as number)} title={String(m.alt ?? "")}>
                  <img src={api.medyaAdres(api.medyaKucuk(m as Medya))} alt={String(m.alt ?? "")} loading="lazy" />
                  <span>{String(m.alt || m.filename || "")}</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="liste">
            {veri.docs.map((d) => (
              <div key={d.id as number} className="satir">
                {!k.giris && <Secim secili={secili} id={d.id as number} degis={setSecili} />}
                <div className="ana">
                  <button className="linkbtn site-baslik" onClick={() => ac(d.id as number)}>{goster(d[k.baslikAlani]) === "—" ? `#${d.id}` : goster(d[k.baslikAlani])}</button>
                  <div className="muted">{arac.sutunlar.map((s) => `${sutunAd(s)}: ${hucre(d, aracAlan.find((a) => a.yol === s), s)}`).join(" · ")}</div>
                </div>
                {k.slug === "yorumlar" && d.durum === "onay-bekliyor" && <>
                  <button className="btn sm" onClick={() => yorumDurum(d.id as number, "yayinda")}>Onayla</button>
                  <button className="btn ghost sm" onClick={() => yorumDurum(d.id as number, "gizli")}>Gizle</button>
                </>}
                {k.taslak && <span className={`site-durum site-durum--${d._status === "published" ? "yayinda" : "taslak"}`}>{d._status === "published" ? api.DURUMLAR.yayinda : api.DURUMLAR.taslak}</span>}
              </div>
            ))}
          </div>
        ))}
        {veri?.sonraki && <button className="btn ghost" onClick={() => yukle(veri.sayfa + 1)}>Daha fazla ({veri.toplam - veri.docs.length})</button>}
      </div>
      {topluAcik && <TopluYukle altSinir={125} kapat={() => setTopluAcik(false)} bitti={(n) => { toast(`${n} görsel yüklendi.`); yukle(1); }} />}
      {yukleAcik && <MedyaSecici ilk="yukle" altSinir={125} kapat={() => setYukleAcik(false)} sec={(m) => { setYukleAcik(false); ac(m.id); }} />}
    </>
  );
}
