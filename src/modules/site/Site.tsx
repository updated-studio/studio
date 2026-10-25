import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "../../shared/toast";
import * as api from "./api";
import type { Durum, Icerik, Koleksiyon, PanelKullanici } from "./api";
import Duzenle from "./Duzenle";
import GenelDuzenle from "./GenelDuzenle";
import GenelListe from "./GenelListe";
import { alanlar, type KoleksiyonSema, type PanelSema } from "./sema";
import { SemaCtx } from "./Form";
import TopluCubuk, { Secim, TumunuSec } from "./Toplu";
import ListeAraclari, { aracAlanlari, hucre, kosullariEkle, sorguAnahtari, useAraclar, type AracAlan } from "./ListeAraclari";
import "./site.css";

// Site: updated.com.tr'deki haberler, incelemeler ve karşılaştırmalar (yayın paneli Payload'a Stüdyo girişiyle bağlanır).
// Panelin bütün bölümleri Stüdyo'da: haberler özel ekranda (Duzenle.tsx), diğer her bölüm panelin alan yapısından çizilen
// genel ekranda (GenelListe/GenelDuzenle). Payload'un kendi paneli yedek olarak açık kalır.
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

function DurumEtiket({ x, yayinda }: { x: Icerik; yayinda: boolean }) {
  const d: Durum = yayinda ? "yayinda" : x.workflow?.state ?? "taslak";
  return <>
    <span className={`site-durum site-durum--${d}`}>{api.DURUMLAR[d]}</span>
    {yayinda && x._status !== "published" && <span className="site-durum site-durum--incelemede" title="Kaydedilmiş ama sitede henüz görünmeyen değişiklik var">Değişiklik var</span>}
  </>;
}

function Satir({ k, x, yayinda, kullanici, yenile, ac, secim, sutunlar }: { k: Koleksiyon; x: Icerik; yayinda: boolean; kullanici: PanelKullanici; yenile: () => void; ac: (id: number) => void; secim: React.ReactNode; sutunlar: AracAlan[] }) {
  const toast = useToast();
  const [mesgul, setMesgul] = useState(false);
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
      {secim}
      <div className="ana">
        <div className="site-baslik"><button className="linkbtn" onClick={() => ac(x.id)}>{x.title || "(başlıksız)"}</button></div>
        <div className="muted">
          {[api.ad(x.category), api.ad(x.author), zaman(x.updatedAt), ...sutunlar.map((s) => `${s.ad}: ${hucre(x as unknown as Record<string, unknown>, s, s.yol)}`)].filter(Boolean).join(" · ")}
        </div>
      </div>
      <DurumEtiket x={x} yayinda={yayinda} />
      <div className="row site-eylem">
        {!yayinda && durum === "taslak" && <button className="btn ghost sm" disabled={mesgul} onClick={() => yap(() => api.durumYap(k, x.id, "incelemede"), "İncelemeye gönderildi.")}>İncelemeye gönder</button>}
        {!yayinda && durum === "incelemede" && <button className="btn ghost sm" disabled={mesgul} onClick={() => yap(() => api.durumYap(k, x.id, "taslak"), "Taslağa geri alındı.")}>Taslağa al</button>}
        {!yayinda && yayinci && <button className="btn sm" disabled={mesgul} onClick={() => yap(() => api.yayinla(k, x.id), "Yayınlandı; site birkaç dakikada güncellenir.")}>Yayınla</button>}
        {yayinda && yayinci && <button className="btn ghost sm" disabled={mesgul} onClick={() => { if (confirm("Sitedeki sayfa kaldırılsın mı? İçerik taslak olarak kalır.")) yap(() => api.yayindanKaldir(k, x.id), "Yayından kaldırıldı."); }}>Yayından kaldır</button>}
        {site && <a className="btn ghost sm" href={site} target="_blank" rel="noreferrer">Sitede gör ↗</a>}
        <button className="btn ghost sm" onClick={() => ac(x.id)}>Düzenle</button>
      </div>
    </div>
  );
}

/** Yayın akışı olan bölümler (haber, inceleme, karşılaştırma): durum sekmeleriyle */
function Liste({ kullanici, k, ks, ilkSekme }: { kullanici: PanelKullanici; k: Koleksiyon; ks: KoleksiyonSema; ilkSekme?: Sekme }) {
  const [sekme, setSekme] = useState<Sekme>(ilkSekme ?? "incelemede");
  const [ara, setAra] = useState("");
  const [veri, setVeri] = useState<{ docs: Icerik[]; yayinda: Set<number>; toplam: number; sonraki: boolean; sayfa: number } | null>(null);
  const [sayilar, setSayilar] = useState<Partial<Record<Sekme, number>>>({});
  const [hata, setHata] = useState("");
  const [acik, setAcik] = useState<number | null | "yeni">(null);
  const [secili, setSecili] = useState<Set<number>>(new Set());
  const toast = useToast();
  const aracAlan = useMemo(() => aracAlanlari(ks.fields), [ks]);
  const [arac, setArac] = useAraclar(k, aracAlan, { sirala: "-updatedAt", sutunlar: [] });
  const anahtar = sorguAnahtari(arac);
  const aracRef = useRef(arac); aracRef.current = arac;
  const ek = useCallback((): api.ListeEki => ({ ekle: (p, o) => kosullariEkle(p, o, aracRef.current), sirala: aracRef.current.sirala }), []);
  const sutunlar = arac.sutunlar.map((y) => aracAlan.find((a) => a.yol === y)).filter((a): a is AracAlan => !!a);

  // Sekmeler arasında hızlı geçişte geç gelen eski yanıt yeni listenin üstüne yazmasın
  const istekNo = useRef(0);
  const yukle = useCallback(async (sayfa = 1) => {
    setHata("");
    const no = ++istekNo.current;
    try {
      const r = await api.liste(k, sekme, ara, sayfa, ek());
      const y = sekme === "yayinda" ? new Set(r.docs.map((d) => d.id)) : await api.yayindakiler(k, r.docs.map((d) => d.id));
      if (no !== istekNo.current) return;
      setVeri((o) => sayfa > 1 && o
        ? { docs: [...o.docs, ...r.docs], yayinda: new Set([...o.yayinda, ...y]), toplam: r.totalDocs, sonraki: r.hasNextPage, sayfa }
        : { docs: r.docs, yayinda: y, toplam: r.totalDocs, sonraki: r.hasNextPage, sayfa });
    } catch (e) { setHata((e as Error).message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, sekme, ara, anahtar]);

  const say = useCallback(async () => {
    const s = await Promise.all(SEKMELER.filter(([x]) => x !== "hepsi").map(([x]) => api.sayi(k, x, ek()).then((n) => [x, n] as const).catch(() => [x, 0] as const)));
    setSayilar(Object.fromEntries(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, anahtar]);

  // Arama ya da filtre yazılırken 300 ms beklenir; sekme değişince hemen
  const sonYazi = useRef(ara + anahtar);
  useEffect(() => {
    const yazildi = sonYazi.current !== ara + anahtar; sonYazi.current = ara + anahtar;
    const t = setTimeout(() => yukle(1), yazildi ? 300 : 0); return () => clearTimeout(t);
  }, [yukle, ara, anahtar]);
  useEffect(() => { say(); }, [say]);
  const yenile = () => { yukle(1); say(); };
  async function yeni() {
    if (k !== "news") { setAcik("yeni"); return; }
    try { setAcik((await api.yeniTaslak(k)).id); } catch (e) { toast((e as Error).message); }
  }
  const kapat = () => { setAcik(null); yenile(); };

  if (acik !== null && k === "news" && acik !== "yeni") return <Duzenle key={acik} k={k} id={acik} kullanici={kullanici} kapat={kapat} ac={setAcik} />;
  if (acik !== null) return <GenelDuzenle key={acik} hedef={{ koleksiyon: ks, id: acik === "yeni" ? null : acik }} kullanici={kullanici} kapat={kapat} ac={setAcik} />;

  return (
    <>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="segment" role="group" aria-label="Durum">
        {SEKMELER.map(([s, l]) => <button key={s} aria-pressed={sekme === s} onClick={() => { if (s !== sekme) { setSekme(s); setVeri(null); setSecili(new Set()); } }}>{l}{sayilar[s] !== undefined ? ` ${sayilar[s]}` : ""}</button>)}
        </div>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={yeni}>+ Yeni {ks.tekil.toLocaleLowerCase("tr-TR")}</button>
      </div>
      <div className="filtre"><input type="search" placeholder="Başlıkta ara…" value={ara} onChange={(e) => setAra(e.target.value)} aria-label="Başlıkta ara" /></div>
      <ListeAraclari alanlar={aracAlan} d={arac} setD={(d) => { setArac(d); setSecili(new Set()); }} sabitSirala={[["updatedAt", "Güncellenme"], ["createdAt", "Oluşturulma"]]} />
      <div className="panel">
        {hata && <div className="msg err">{hata}</div>}
        {!veri && !hata && <div className="muted">Yükleniyor…</div>}
        {veri && !veri.docs.length && <div className="empty">Bu bölümde içerik yok.</div>}
        {veri && veri.docs.length > 0 && <>
          <div className="row"><TumunuSec secili={secili} idler={veri.docs.map((x) => x.id)} degis={setSecili} /></div>
          <TopluCubuk k={ks} secili={secili} kullanici={kullanici} bitti={(m) => { toast(m); setSecili(new Set()); yenile(); }} />
          <div className="liste">
            {veri.docs.map((x) => <Satir key={x.id} k={k} x={x} yayinda={veri.yayinda.has(x.id)} kullanici={kullanici} yenile={yenile} ac={setAcik} secim={<Secim secili={secili} id={x.id} degis={setSecili} />} sutunlar={sutunlar} />)}
          </div>
        </>}
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
      Sitede yetkin yok. Yöneticiden Stüdyo'da <b>Ekip → Yönetim</b> bölümünde sana bir site rolü vermesini iste;
      verilince bu sayfa kendiliğinden açılır.
    </div>
  );
  return <Gezinme kullanici={kullanici} />;
}

const GRUP_SIRASI = ["İçerik", "Topluluk", "Künye", "Kanallar", "Gelir", "Kulüp", "Ekip", "Ayarlar"];
const AKIS: Koleksiyon[] = ["news", "reviews", "comparisons"];
type Bolum = { tur: "k"; s: KoleksiyonSema } | { tur: "g"; s: PanelSema["genel"][number] };

/** Panelin bölümleri gruplar hâlinde (gruplar ve sıra panelin kendi menüsüyle aynı) */
function Gezinme({ kullanici }: { kullanici: PanelKullanici }) {
  const [sema, setSema] = useState<PanelSema | null>(null);
  const [hata, setHata] = useState("");
  const [grup, setGrup] = useState("İçerik");
  const [secili, setSecili] = useState("news");
  const [genelAcik, setGenelAcik] = useState(false);
  const [ilkSekme, setIlkSekme] = useState<{ s: Sekme; n: number } | null>(null);
  // Bildirimden gelince (#/site?bolum=yorumlar) o bölüm açılır; yayın kuyruğundan gelince (&sekme=incelemede) o sekme
  const [sp, setSp] = useSearchParams();
  useEffect(() => { alanlar().then(setSema).catch((e) => setHata((e as Error).message)); }, []);
  useEffect(() => {
    const istenen = sp.get("bolum");
    if (!sema || !istenen) return;
    const x = [...sema.koleksiyonlar, ...sema.genel].find((s) => s.slug === istenen);
    if (x) { setGrup(x.grup); setSecili(x.slug); setGenelAcik(false); }
    const sk = sp.get("sekme") as Sekme | null;
    if (sk && SEKMELER.some(([a]) => a === sk)) setIlkSekme((o) => ({ s: sk, n: (o?.n ?? 0) + 1 }));
    setSp({}, { replace: true });
  }, [sema, sp, setSp]);
  if (hata) return <div className="empty">Bölümler alınamadı: {hata}</div>;
  if (!sema) return <div className="muted">Yükleniyor…</div>;

  const bolumler: Bolum[] = [...sema.koleksiyonlar.map((s) => ({ tur: "k" as const, s })), ...sema.genel.map((s) => ({ tur: "g" as const, s }))];
  const gruplar = [...new Set(bolumler.map((b) => b.s.grup))].sort((a, b) => (GRUP_SIRASI.indexOf(a) + 99) % 99 - (GRUP_SIRASI.indexOf(b) + 99) % 99);
  const gruptakiler = bolumler.filter((b) => b.s.grup === grup);
  const b = bolumler.find((x) => x.s.slug === secili) ?? gruptakiler[0];
  const ad = (x: Bolum) => (x.tur === "k" ? x.s.cogul : x.s.ad);

  return (
    <SemaCtx.Provider value={sema}>
      <div className="segment" role="group" aria-label="Bölüm grubu">
        {gruplar.map((g) => <button key={g} aria-pressed={grup === g} onClick={() => { setGrup(g); setSecili(bolumler.find((x) => x.s.grup === g)!.s.slug); setGenelAcik(false); }}>{g}</button>)}
      </div>
      {gruptakiler.length > 1 && (
        <div className="segment" role="group" aria-label="Bölüm">
          {gruptakiler.map((x) => <button key={x.s.slug} aria-pressed={b.s.slug === x.s.slug} onClick={() => { setSecili(x.s.slug); setGenelAcik(false); }}>{ad(x)}</button>)}
        </div>
      )}
      {kullanici.role === "admin" && <a className="linkbtn muted" style={{ alignSelf: "flex-end" }} href="#/panel-giris" target="_blank" rel="noreferrer">Site panelinin kendisini aç (yedek) ↗</a>}
      {b.tur === "g" ? (
        genelAcik ? <GenelDuzenle key={b.s.slug} hedef={{ genel: b.s }} kullanici={kullanici} kapat={() => setGenelAcik(false)} />
          : <div className="panel"><b>{b.s.ad}</b><span className="muted">Sitenin genel ayarları.</span><button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setGenelAcik(true)}>Düzenle</button></div>
      ) : AKIS.includes(b.s.slug as Koleksiyon)
        ? <Liste key={`${b.s.slug}-${ilkSekme?.n ?? 0}`} kullanici={kullanici} k={b.s.slug as Koleksiyon} ks={b.s} ilkSekme={ilkSekme?.s} />
        : <GenelBolum key={b.s.slug} k={b.s} kullanici={kullanici} />}
    </SemaCtx.Provider>
  );
}

function GenelBolum({ k, kullanici }: { k: KoleksiyonSema; kullanici: PanelKullanici }) {
  const [acik, setAcik] = useState<number | null | undefined>(undefined);
  if (acik !== undefined) return <GenelDuzenle key={acik ?? "yeni"} hedef={{ koleksiyon: k, id: acik }} kullanici={kullanici} kapat={() => setAcik(undefined)} ac={setAcik} />;
  return <GenelListe k={k} ac={setAcik} kullanici={kullanici} />;
}
