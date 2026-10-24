import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../shared/toast";
import * as api from "./api";
import type { Medya, PanelKullanici } from "./api";
import { Alanlar } from "./Form";
import { veriAlanlari, type GenelSema, type KoleksiyonSema } from "./sema";
import { kilitHatasi, otoMetni, useKilit, useOtoKayit } from "./kayit";
import Surumler from "./Surumler";
import Zamanlama, { useZamanlamalar, ZamanlamaEtiketi } from "./Zamanlama";
import CanliOnizleme, { useCanliAcik } from "./CanliOnizleme";
import ApiAnahtari from "./ApiAnahtari";
import GorselDuzen from "./GorselDuzen";
import { KayitCtx } from "./baglam";

const ONIZLEMELI = new Set(["news", "reviews", "comparisons"]); // sitenin önizleme sayfası olan bölümler

// Panelin herhangi bir bölümü (koleksiyon kaydı ya da ayar sayfası) için düzenleme ekranı; alanlar panelin yapısından çizilir.
type Kayit = Record<string, unknown>;
export type Hedef = { koleksiyon: KoleksiyonSema; id: number | null } | { genel: GenelSema };

const rastgeleSifre = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");

export default function GenelDuzenle({ hedef, kullanici, kapat, ac }: { hedef: Hedef; kullanici: PanelKullanici; kapat: () => void; ac?: (id: number) => void }) {
  const toast = useToast();
  const k = "koleksiyon" in hedef ? hedef.koleksiyon : null;
  const g = "genel" in hedef ? hedef.genel : null;
  const sema = (k ?? g)!;
  const [id, setId] = useState<number | null>(k ? (hedef as { id: number | null }).id : null);
  const [kayit, setKayit] = useState<Kayit | null>(null);
  const [degisti, setDegisti] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState("");
  const [surum, setSurum] = useState(0);
  const taslak = sema.taslak ? "&draft=true" : "";
  const yol = g ? `/globals/${g.slug}` : `/${k!.slug}${id ? `/${id}` : ""}`;
  const [yayinda, setYayinda] = useState(false); // sitede yayında mı (taslak kaydı bunu değiştirmez)
  const [no, setNo] = useState(0);
  const noRef = useRef(0);
  const veriRef = useRef<() => Kayit>(() => ({}));
  const [surumAcik, setSurumAcik] = useState(false);
  const [zamanAcik, setZamanAcik] = useState(false);
  const zamanHedef = g ? { genel: g.slug } : id ? { koleksiyon: k!.slug, id } : null;
  const zam = useZamanlamalar(zamanHedef, ["admin", "yayin-yonetmeni"].includes(kullanici.role) && !!sema.zamanlama);
  const kilit = useKilit(g ? { genel: g.slug } : id ? { koleksiyon: k!.slug, id } : null, kullanici, sema.kilit !== false);
  const kilitli = kilit.durum.tur === "baskasi";
  const oto = useOtoKayit(kilit.durum.tur === "bende" && (g || id) ? sema.otoKayit ?? 0 : 0, no, async () => {
    const n = noRef.current;
    const d = await api.otoKaydet(yol, veriRef.current());
    setKayit((o) => (o ? { ...o, updatedAt: d.updatedAt, _status: d._status } : o));
    if (noRef.current === n) setDegisti(false);
    kilit.tazele(); // panel her kayıtta kilidi siler
  });

  const yukle = () => Promise.all([api.istekYap<Kayit>(`${yol}?depth=0${taslak}`), sema.taslak ? api.yayindaMi(yol) : Promise.resolve(false)])
    .then(([d, y]) => { setKayit(d); setYayinda(y); setDegisti(false); setSurum((x) => x + 1); });
  useEffect(() => {
    if (k && !id) { setKayit({}); return; }
    yukle().catch((e) => setHata((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!degisti) return;
    const uyar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", uyar);
    return () => window.removeEventListener("beforeunload", uyar);
  }, [degisti]);
  const onizlemeli = !!k && !!id && ONIZLEMELI.has(k.slug);
  const [canliAcik, setCanli] = useCanliAcik();
  const canli = onizlemeli && canliAcik;
  const [canliAdres, setCanliAdres] = useState<string | null>(null);
  useEffect(() => { if (canli && !canliAdres) api.onizlemeAdresi(k!.slug as api.Koleksiyon, id!).then(setCanliAdres).catch((e) => toast((e as Error).message)); }, [canli, canliAdres, k, id, toast]);

  const alanlar = useMemo(() => veriAlanlari(sema.fields), [sema]);
  if (hata && !kayit) return <div className="empty">Açılamadı: {hata} <button className="linkbtn" onClick={kapat}>Geri dön</button></div>;
  if (!kayit) return <div className="muted">Yükleniyor…</div>;

  const bekleyen = yayinda && kayit._status !== "published"; // yayında, ama kaydedilmiş yayınlanmamış değişiklik var
  const yonetici = kullanici.role === "admin";
  const baslik = g ? g.ad : String(kayit[k!.baslikAlani] ?? "") || (id ? `#${id}` : `Yeni ${k!.tekil.toLocaleLowerCase("tr-TR")}`);
  /** Gönderilecek veri: yalnız alan yapısındaki üst düzey alanlar (gruplar ve listeler bütün hâlde) */
  const veri = (): Kayit => Object.fromEntries(alanlar.filter((a) => !a.admin?.readOnly && a.name! in kayit).map((a) => [a.name!, kayit[a.name!]]));
  veriRef.current = veri;

  /** Ayar sayfası (global) kaydı: panel kaydı { message, result } içinde döndürür */
  const genelKaydet = (url: string, govde: string) => api.istekYap<{ result?: Kayit } & Kayit>(url, { method: "POST", body: govde }).then((x) => x.result ?? x);
  async function gonder(is: () => Promise<Kayit>, mesaj: string, yayin?: boolean) {
    setMesgul(true); setHata("");
    try {
      const d = await is(); setKayit(d); setDegisti(false); setSurum((x) => x + 1); toast(mesaj);
      if (yayin !== undefined) setYayinda(yayin);
      kilit.tazele();
    }
    catch (e) { setHata(kilitHatasi(e)); }
    finally { setMesgul(false); }
  }
  const kaydet = () => gonder(async () => {
    if (g) return genelKaydet(`${yol}?depth=0${taslak}`, JSON.stringify(veri()));
    if (!id) {
      const ek = k!.giris ? { password: rastgeleSifre() } : {}; // giriş Stüdyo'dan; panel şifresi kimseye verilmez
      const r = await api.istekYap<{ doc: Kayit }>(`/${k!.slug}?depth=0${taslak}`, { method: "POST", body: JSON.stringify({ ...veri(), ...ek }) });
      setId(r.doc.id as number); return r.doc;
    }
    return (await api.istekYap<{ doc: Kayit }>(`${yol}?depth=0${taslak}`, { method: "PATCH", body: JSON.stringify(veri()) })).doc;
  }, sema.taslak ? "Kaydedildi (taslak)." : "Kaydedildi.");
  const yayinla = () => confirm(yayinda ? "Değişiklikler sitede yayınlansın mı?" : "Yayınlansın mı?") && gonder(async () => {
    if (g) return genelKaydet(`${yol}?depth=0`, JSON.stringify({ ...veri(), _status: "published" }));
    return (await api.istekYap<{ doc: Kayit }>(`${yol}?depth=0`, { method: "PATCH", body: JSON.stringify({ ...veri(), _status: "published" }) })).doc;
  }, "Yayınlandı; site birkaç dakikada güncellenir.", true);
  const kaldir = () => confirm("Yayından kaldırılsın mı? İçerik taslak olarak kalır.") && gonder(async () =>
    (await api.istekYap<{ doc: Kayit }>(`${yol}?depth=0`, { method: "PATCH", body: JSON.stringify({ _status: "draft" }) })).doc, "Yayından kaldırıldı.", false);
  async function sil() {
    if (!confirm(`"${baslik}" kalıcı olarak silinsin mi? Bu geri alınamaz.`)) return;
    setMesgul(true);
    try { await api.istekYap(`${yol}`, { method: "DELETE" }); toast("Silindi."); kapat(); }
    catch (e) { setHata((e as Error).message); setMesgul(false); }
  }
  /** Zamanlamadan önce değişiklikler kaydedilir; yayın akışı olan kayıtta durum "Planlandı" olur */
  async function zamanlamaHazirlik(tur: "publish" | "unpublish") {
    const akis = kayit!.workflow as Record<string, unknown> | undefined;
    const planla = tur === "publish" && akis && !yayinda ? { workflow: { ...akis, state: "planlandi" } } : null;
    if (degisti || planla) {
      const govde = JSON.stringify({ ...veri(), ...planla });
      const d = g ? await genelKaydet(`${yol}?depth=0${taslak}`, govde)
        : (await api.istekYap<{ doc: Kayit }>(`${yol}?depth=0${taslak}`, { method: "PATCH", body: govde })).doc;
      setKayit(d); setDegisti(false); setSurum((x) => x + 1); kilit.tazele();
    }
    return null;
  }
  async function kopyala() {
    if (!k || !id || !ac) return;
    if (degisti && !confirm("Kaydedilmemiş değişiklikler kopyaya girmez (son kaydedilen hâl kopyalanır). Devam edilsin mi?")) return;
    setMesgul(true);
    try { const yeni = await api.kopyala(k.slug, id); toast("Kopyası oluşturuldu."); ac(yeni); }
    catch (e) { setHata((e as Error).message); setMesgul(false); }
  }
  const geri = () => { if (!degisti || confirm("Kaydedilmemiş değişiklikler var. Çıkılsın mı?")) kapat(); };

  const ana = sema.fields.filter((a) => a.admin?.position !== "sidebar");
  const yan = sema.fields.filter((a) => a.admin?.position === "sidebar");
  const set = (v: Kayit) => { setKayit(v); setDegisti(true); noRef.current += 1; setNo(noRef.current); };
  const medya = k?.gorsel ? (kayit as Medya) : null;

  return (
    <div className={`site-duzen${canli ? " canli" : ""}`}>
      <div className="row site-ust">
        <button className="btn ghost sm" onClick={geri}>← Geri</button>
        <b className="site-baslik-ust">{baslik}</b>
        {sema.taslak && <span className={`site-durum site-durum--${yayinda ? "yayinda" : "taslak"}`}>{yayinda ? api.DURUMLAR.yayinda : api.DURUMLAR.taslak}</span>}
        {bekleyen && <span className="site-durum site-durum--incelemede">Yayınlanmamış değişiklik</span>}
        <span style={{ flex: 1 }} />
        {oto.tur && <span className={oto.tur === "hata" ? "site-oto site-uyari" : "site-oto muted"}>{otoMetni(oto)}</span>}
        <ZamanlamaEtiketi isler={zam.isler} ac={() => setZamanAcik(true)} />
        {sema.surumler && (g || id) && <button className="btn ghost sm" onClick={() => setSurumAcik(true)}>Sürümler</button>}
        {zamanHedef && sema.zamanlama && ["admin", "yayin-yonetmeni"].includes(kullanici.role) && <button className="btn ghost sm" disabled={mesgul || kilitli} onClick={() => setZamanAcik(true)}>Zamanla</button>}
        {k && id && ac && !k.gorsel && !k.giris && <button className="btn ghost sm" disabled={mesgul} onClick={kopyala}>Kopyala</button>}
        {onizlemeli && <button className="btn ghost sm" aria-pressed={canli} onClick={() => setCanli(!canli)}>{canli ? "Önizlemeyi kapat" : "Canlı önizleme"}</button>}
        {k && id && yonetici && <a className="btn ghost sm" href={api.panelAdresi(k.slug as api.Koleksiyon, id)} target="_blank" rel="noreferrer">Panelde aç ↗</a>}
        {k && id && yonetici && <button className="btn ghost sm" disabled={mesgul || kilitli} onClick={sil}>Sil</button>}
        {yayinda && <button className="btn ghost sm" disabled={mesgul || kilitli} onClick={kaldir}>Yayından kaldır</button>}
        <button className={sema.taslak ? "btn ghost sm" : "btn sm"} disabled={mesgul || kilitli || !degisti} onClick={kaydet}>{degisti ? "Kaydet" : "Kaydedildi"}</button>
        {sema.taslak && id !== null && <button className="btn sm" disabled={mesgul || kilitli} onClick={yayinla}>{yayinda ? "Değişiklikleri yayınla" : "Yayınla"}</button>}
        {g && sema.taslak && <button className="btn sm" disabled={mesgul || kilitli} onClick={yayinla}>Yayınla</button>}
      </div>
      {kilit.durum.tur === "baskasi" && (
        <div className="msg err site-kilit">
          <span><b>{kilit.durum.kim}</b> bunu şu an düzenliyor (son işlem {kilit.durum.ne}). Aynı anda kaydedilirse biri diğerinin değişikliğini siler; bu yüzden kaydetme kapalı.</span>
          <button className="btn ghost sm" onClick={() => confirm("Diğer kişi kaydedemeyecek. Düzenlemeyi devralmak istiyor musun?") && kilit.devral()}>Düzenlemeyi devral</button>
        </div>
      )}
      {hata && <div className="msg err">{hata}</div>}
      {medya?.url && (id
        ? <GorselDuzen yol={yol} m={kayit} degisti={(d) => { setKayit(d); setSurum((x) => x + 1); kilit.tazele(); }} />
        : <img className="site-medya-buyuk" src={api.medyaAdres(medya.sizes?.card?.url || medya.url)} alt={medya.alt ?? ""} />)}
      <KayitCtx.Provider value={{ id }}>
      <div className={canli ? "site-canli-duzen" : "site-canli-yok"}>
      <div className={yan.length ? "site-izgara" : ""} key={surum}>
        <div className="site-form"><Alanlar fs={ana} deger={kayit} set={set} /></div>
        {yan.length > 0 && <div className="site-form site-yan"><Alanlar fs={yan} deger={kayit} set={set} /></div>}
      </div>
      {canli && <CanliOnizleme adres={canliAdres} surum={String(kayit?.updatedAt ?? "")} kapat={() => setCanli(false)} />}
      </div>
      </KayitCtx.Provider>
      {k?.giris && k.apiAnahtari && id && yonetici && <ApiAnahtari yol={yol} kayit={kayit} degisti={(d) => setKayit((o) => ({ ...o, enableAPIKey: d.enableAPIKey, hasAPIKey: d.hasAPIKey, updatedAt: d.updatedAt }))} />}
      {zamanAcik && zamanHedef && <Zamanlama hedef={zamanHedef} isler={zam.isler} yayinda={yayinda} hazirlik={zamanlamaHazirlik} kapat={() => setZamanAcik(false)} degisti={() => { zam.yenile(); if (!degisti) yukle().then(() => kilit.tazele()); toast("Zamanlama güncellendi."); }} />}
      {surumAcik && <Surumler yol={yol} alanlar={sema.fields} simdiki={kayit} kapat={() => setSurumAcik(false)} geriYuklendi={() => { setSurumAcik(false); yukle().then(() => { toast("Sürüm geri yüklendi (taslak)."); kilit.tazele(); }); }} />}
    </div>
  );
}
