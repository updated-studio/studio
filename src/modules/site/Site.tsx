import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../shared/toast";
import * as api from "./api";
import type { Durum, Icerik, Koleksiyon, PanelKullanici } from "./api";
import Duzenle from "./Duzenle";
import "./site.css";

// Site: updated.com.tr'deki haberler, incelemeler ve karşılaştırmalar (yayın paneli Payload'a Stüdyo girişiyle bağlanır).
// Listeler, arama, yayınla / yayından kaldır / incelemeye gönder; haberler Stüdyo'da düzenlenir (Duzenle.tsx),
// incelemeler ve karşılaştırmalar şimdilik panelde (kendilerine özgü alanları 3. aşamada gelecek).
type Sekme = "taslak" | "incelemede" | "planlandi" | "yayinda" | "hepsi";
const SEKMELER: [Sekme, string][] = [["taslak", "Taslaklar"], ["incelemede", "İncelemede"], ["planlandi", "Planlandı"], ["yayinda", "Yayında"], ["hepsi", "Tümü"]];
const YAYINCI = ["admin", "yayin-yonetmeni"];

const zaman = (s?: string) => {
  if (!s) return "";
  const d = new Date(s), fark = (Date.now() - d.getTime()) / 6e4;
  if (fark < 1) return "az önce";
  if (fark < 60) return `${Math.round(fark)} dk önce`;
  if (fark < 60 * 24) return `${Math.round(fark / 60)} sa önce`;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

function DurumEtiket({ x }: { x: Icerik }) {
  const d: Durum = x._status === "published" ? "yayinda" : x.workflow?.state ?? "taslak";
  return <span className={`site-durum site-durum--${d}`}>{api.DURUMLAR[d]}</span>;
}

function Satir({ k, x, kullanici, yenile, ac }: { k: Koleksiyon; x: Icerik; kullanici: PanelKullanici; yenile: () => void; ac: (id: number) => void }) {
  const toast = useToast();
  const [mesgul, setMesgul] = useState(false);
  const yayinda = x._status === "published";
  const durum = x.workflow?.state ?? "taslak";
  const yayinci = YAYINCI.includes(kullanici.role);
  const site = yayinda ? api.siteAdresi(k, x) : null;

  async function yap(is: () => Promise<unknown>, tamam: string) {
    setMesgul(true);
    try { await is(); toast(tamam); yenile(); }
    catch (e) { toast((e as Error).message); }
    finally { setMesgul(false); }
  }

  return (
    <div className="satir site-satir">
      <div className="ana">
        <div className="site-baslik">{k === "news" ? <button className="linkbtn" onClick={() => ac(x.id)}>{x.title || "(başlıksız)"}</button> : x.title || <span className="muted">(başlıksız)</span>}</div>
        <div className="muted">
          {[api.ad(x.category), api.ad(x.author), zaman(x.updatedAt)].filter(Boolean).join(" · ")}
        </div>
      </div>
      <DurumEtiket x={x} />
      <div className="row site-eylem">
        {!yayinda && durum === "taslak" && <button className="btn ghost sm" disabled={mesgul} onClick={() => yap(() => api.durumYap(k, x.id, "incelemede"), "İncelemeye gönderildi.")}>İncelemeye gönder</button>}
        {!yayinda && durum === "incelemede" && <button className="btn ghost sm" disabled={mesgul} onClick={() => yap(() => api.durumYap(k, x.id, "taslak"), "Taslağa geri alındı.")}>Taslağa al</button>}
        {!yayinda && yayinci && <button className="btn sm" disabled={mesgul} onClick={() => yap(() => api.yayinla(k, x.id), "Yayınlandı; site birkaç dakikada güncellenir.")}>Yayınla</button>}
        {yayinda && yayinci && <button className="btn ghost sm" disabled={mesgul} onClick={() => { if (confirm("Sitedeki sayfa kaldırılsın mı? İçerik taslak olarak kalır.")) yap(() => api.yayindanKaldir(k, x.id), "Yayından kaldırıldı."); }}>Yayından kaldır</button>}
        {site && <a className="btn ghost sm" href={site} target="_blank" rel="noreferrer">Sitede gör ↗</a>}
        {k === "news" ? <button className="btn ghost sm" onClick={() => ac(x.id)}>Düzenle</button>
          : <a className="btn ghost sm" href={api.panelAdresi(k, x.id)} target="_blank" rel="noreferrer">Düzenle ↗</a>}
      </div>
    </div>
  );
}

function Liste({ kullanici }: { kullanici: PanelKullanici }) {
  const [k, setK] = useState<Koleksiyon>("news");
  const [sekme, setSekme] = useState<Sekme>("incelemede");
  const [ara, setAra] = useState("");
  const [veri, setVeri] = useState<{ docs: Icerik[]; toplam: number; sonraki: boolean; sayfa: number } | null>(null);
  const [sayilar, setSayilar] = useState<Partial<Record<Sekme, number>>>({});
  const [hata, setHata] = useState("");
  const [acik, setAcik] = useState<number | null>(null);
  const toast = useToast();

  const yukle = useCallback(async (sayfa = 1) => {
    setHata("");
    try {
      const r = await api.liste(k, sekme, ara, sayfa);
      setVeri((o) => ({ docs: sayfa > 1 && o ? [...o.docs, ...r.docs] : r.docs, toplam: r.totalDocs, sonraki: r.hasNextPage, sayfa }));
    } catch (e) { setHata((e as Error).message); }
  }, [k, sekme, ara]);

  const say = useCallback(async () => {
    const s = await Promise.all(SEKMELER.filter(([x]) => x !== "hepsi").map(([x]) => api.sayi(k, x).then((n) => [x, n] as const).catch(() => [x, 0] as const)));
    setSayilar(Object.fromEntries(s));
  }, [k]);

  useEffect(() => { const t = setTimeout(() => yukle(1), ara ? 300 : 0); return () => clearTimeout(t); }, [yukle, ara]);
  useEffect(() => { say(); }, [say]);
  const yenile = () => { yukle(1); say(); };
  async function yeni() {
    try { setAcik((await api.yeniTaslak(k)).id); } catch (e) { toast((e as Error).message); }
  }

  if (acik) return <Duzenle k={k} id={acik} kullanici={kullanici} kapat={() => { setAcik(null); yenile(); }} />;

  return (
    <>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="segment" role="group" aria-label="İçerik türü">
          {api.KOLEKSIYONLAR.map((c) => <button key={c.id} aria-pressed={k === c.id} onClick={() => { setK(c.id); setVeri(null); }}>{c.ad}</button>)}
        </div>
        {k === "news" ? <button className="btn sm" style={{ marginLeft: "auto" }} onClick={yeni}>+ Yeni haber</button>
          : <a className="btn sm" style={{ marginLeft: "auto" }} href={api.panelAdresi(k)} target="_blank" rel="noreferrer">+ Yeni ↗</a>}
      </div>
      <div className="segment" role="group" aria-label="Durum">
        {SEKMELER.map(([s, l]) => <button key={s} aria-pressed={sekme === s} onClick={() => { setSekme(s); setVeri(null); }}>{l}{sayilar[s] !== undefined ? ` ${sayilar[s]}` : ""}</button>)}
      </div>
      <div className="filtre"><input type="search" placeholder="Başlıkta ara…" value={ara} onChange={(e) => setAra(e.target.value)} aria-label="Başlıkta ara" /></div>
      <div className="panel">
        {hata && <div className="msg err">{hata}</div>}
        {!veri && !hata && <div className="muted">Yükleniyor…</div>}
        {veri && !veri.docs.length && <div className="empty">Bu bölümde içerik yok.</div>}
        {veri && veri.docs.length > 0 && (
          <div className="liste">
            {veri.docs.map((x) => <Satir key={x.id} k={k} x={x} kullanici={kullanici} yenile={yenile} ac={setAcik} />)}
          </div>
        )}
        {veri?.sonraki && <button className="btn ghost" onClick={() => yukle(veri.sayfa + 1)}>Daha fazla ({veri.toplam - veri.docs.length})</button>}
      </div>
    </>
  );
}

export default function Site() {
  const [kullanici, setKullanici] = useState<PanelKullanici | null | undefined>(undefined);
  const [hata, setHata] = useState("");
  useEffect(() => { api.ben().then(setKullanici).catch((e) => setHata((e as Error).message)); }, []);

  if (hata) return <div className="empty">Site paneline bağlanılamadı: {hata}</div>;
  if (kullanici === undefined) return <div className="muted">Yükleniyor…</div>;
  if (!kullanici) return (
    <div className="empty">
      Site panelinde hesabın yok. Yöneticiden panelin <b>Kullanıcılar</b> bölümüne seni Stüdyo'daki e-postanla eklemesini iste;
      eklenince bu sayfa kendiliğinden açılır.
    </div>
  );
  return <Liste kullanici={kullanici} />;
}
