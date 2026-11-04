import { useEffect, useState } from "react";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { MasaProvider, useMasa } from "../haber-masasi/veri";
import Taslaklar from "../haber-masasi/Taslaklar";
import { zamanOnce } from "../haber-masasi/ortak";
import "./baglantilar.css";
import "../haber-masasi/ayarlar.css";

// Deneme masası (yönetici; 4 Kasım 2026, kullanıcı: "taslak bozulmasın diye yöneticiye özel deneme sayfası; gerçek haberlerle").
// Havuzdan gerçek bir haber seçilir; kopyası (tr_items.deneme) üzerinde taslak akışının tamamı çalışır. Kopya ve taslağı Haber Masası'nda,
// otomatik taslakta, kümelemede, panelde, ölçümlerde ve katkı puanında görünmez (göç 0063; sunucu: triyaj-taslak "deneme" ucu).
export default function DenemeMasasi() {
  return <MasaProvider deneme><Masa /></MasaProvider>;
}

type Kart = { id: number; title: string; event: string; brand: string; source_name: string; published_at: string | null; created_at: string };

function Masa() {
  const { v, yukleniyor } = useMasa();
  const toast = useToast();
  const [acik, setAcik] = useState<number | null>(null);
  const [silOnay, setSilOnay] = useState(false);
  const surenler = v.haberler.filter((h) => h.work_state === "taslak" && !v.taslaklar.some((t) => t.item_id === h.id));
  const hatalar = v.haberler.filter((h) => h.work_state === "hata" && !v.taslaklar.some((t) => t.item_id === h.id));

  if (acik && v.taslaklar.some((t) => t.id === acik)) return <Taslaklar acik={acik} setAcik={setAcik} />;

  async function temizle() {
    if (!silOnay) { setSilOnay(true); window.setTimeout(() => setSilOnay(false), 4000); return; }
    setSilOnay(false);
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { deneme: { temizle: true } } });
    toast(error || data?.hata ? (data?.hata ?? error!.message) : `${data?.silinen ?? 0} deneme silindi.`);
  }

  return (
    <section className="bg ay">
      <header>
        <h1 className="bg-h1">Deneme masası</h1>
        <p className="bg-ozet"><b>Gerçek bir haberin kopyasıyla taslak akışının tamamı denenir; gerçek taslaklara dokunulmaz.</b> Deneme taslakları panele gitmez; Haber Masası'nda, ölçümlerde ve katkı puanında görünmez. Yapay zekâ çağrıları gerçektir: taslak başına yaklaşık 0,17 $, ücretli görsel başına 0,03–0,05 $.</p>
      </header>

      <section className="bg-grup" aria-labelledby="dm-yeni">
        <div className="bg-grup-sol"><h2 id="dm-yeni">Yeni deneme</h2><p>Havuzdan bir haber seç. Kopyası üzerinde yazım, kör karşılaştırma, denetim, video ve görseller çalışır; 2–4 dakika sürer.</p></div>
        <div className="bg-liste"><HaberSec /></div>
      </section>

      <section className="bg-grup" aria-labelledby="dm-liste">
        <div className="bg-grup-sol"><h2 id="dm-liste">Denemeler</h2><p>Açınca taslak ekranı gelir: metin A/B, düzeltmeler, görsel modelleri, video. Silince haberin kopyası da silinir.</p></div>
        <div className="dm-sag">
          {(surenler.length > 0 || hatalar.length > 0) && (
            <div className="bg-liste">
              {surenler.map((h) => <div key={h.id} className="dm-satir"><span className="bg-ad"><b>{h.event || h.title}</b><span>{h.source_name} · {zamanOnce(h.updated_at)} önce başladı</span></span><span className="pill blue">Yazılıyor</span></div>)}
              {hatalar.map((h) => <div key={h.id} className="dm-satir"><span className="bg-ad"><b>{h.event || h.title}</b><span>{h.work_error || "Hata"}</span></span><span className="pill rose">Hata</span></div>)}
            </div>
          )}
          {yukleniyor ? <p className="ay-not">Yükleniyor…</p>
            : v.taslaklar.length ? <Taslaklar acik={null} setAcik={setAcik} sade />
            : !surenler.length && <p className="ay-not">Henüz deneme yok. Soldan bir haber seçip "Dene"ye bas.</p>}
          {(v.taslaklar.length > 0 || v.haberler.length > 0) && (
            <div className="ay-kaydet"><button className="btn ghost sm" onClick={temizle}>{silOnay ? "Emin misin? Tekrar bas" : "Bütün denemeleri sil"}</button></div>
          )}
        </div>
      </section>
    </section>
  );
}

/** Gerçek havuzdan haber arama (en yeni 30); "Dene" kopyayı oluşturup taslağı başlatır */
function HaberSec() {
  const toast = useToast();
  const [ara, setAra] = useState("");
  const [liste, setListe] = useState<Kart[] | null>(null);
  const [mesgul, setMesgul] = useState<number | null>(null);
  useEffect(() => {
    const z = window.setTimeout(async () => {
      let q = sb.from("tr_items").select("id,title,event,brand,source_name,published_at,created_at").eq("deneme", false)
        .in("status", ["aday", "alindi", "yayinda", "belirsiz", "pas"]).order("published_at", { ascending: false, nullsFirst: false }).limit(30);
      // PostgREST "or" sözdizimini bozan karakterler aramadan çıkarılır
      const k = ara.replace(/[,()%*\\]/g, " ").trim();
      if (k) q = q.or(`title.ilike.%${k}%,event.ilike.%${k}%,brand.ilike.%${k}%`);
      const { data } = await q;
      setListe((data ?? []) as Kart[]);
    }, 300);
    return () => window.clearTimeout(z);
  }, [ara]);

  async function dene(h: Kart) {
    setMesgul(h.id);
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { deneme: { kopyala: h.id } } });
    setMesgul(null);
    toast(error || data?.hata ? (data?.hata ?? error!.message) : "Deneme başladı; taslak 2–4 dakika içinde Denemeler'de görünür.");
  }

  return (
    <>
      <div className="dm-ara"><input type="search" placeholder="Başlıkta, markada ara" aria-label="Haber ara" value={ara} onChange={(e) => setAra(e.target.value)} /></div>
      {!liste ? <p className="ay-not dm-bos">Yükleniyor…</p> : !liste.length ? <p className="ay-not dm-bos">Eşleşen haber yok.</p> : (
        <div className="dm-haberler">
          {liste.map((h) => (
            <div key={h.id} className="dm-satir">
              <span className="bg-ad"><b>{h.event || h.title}</b><span>{[h.brand, h.source_name, zamanOnce(h.published_at || h.created_at) + " önce"].filter(Boolean).join(" · ")}</span></span>
              <button className="btn ghost sm" disabled={mesgul !== null} onClick={() => dene(h)}>{mesgul === h.id ? "Başlıyor…" : "Dene"}</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
