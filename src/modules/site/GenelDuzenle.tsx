import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../shared/toast";
import * as api from "./api";
import type { Medya, PanelKullanici } from "./api";
import { Alanlar } from "./Form";
import { veriAlanlari, type GenelSema, type KoleksiyonSema } from "./sema";

// Panelin herhangi bir bölümü (koleksiyon kaydı ya da ayar sayfası) için düzenleme ekranı; alanlar panelin yapısından çizilir.
type Kayit = Record<string, unknown>;
export type Hedef = { koleksiyon: KoleksiyonSema; id: number | null } | { genel: GenelSema };

const rastgeleSifre = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");

export default function GenelDuzenle({ hedef, kullanici, kapat }: { hedef: Hedef; kullanici: PanelKullanici; kapat: () => void }) {
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

  useEffect(() => {
    if (k && !id) { setKayit({}); return; }
    api.istekYap<Kayit>(`${yol}?depth=0${taslak}`).then(setKayit).catch((e) => setHata((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!degisti) return;
    const uyar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", uyar);
    return () => window.removeEventListener("beforeunload", uyar);
  }, [degisti]);

  const alanlar = useMemo(() => veriAlanlari(sema.fields), [sema]);
  if (hata && !kayit) return <div className="empty">Açılamadı: {hata} <button className="linkbtn" onClick={kapat}>Geri dön</button></div>;
  if (!kayit) return <div className="muted">Yükleniyor…</div>;

  const yayinda = kayit._status === "published";
  const yonetici = kullanici.role === "admin";
  const baslik = g ? g.ad : String(kayit[k!.baslikAlani] ?? "") || (id ? `#${id}` : `Yeni ${k!.tekil.toLocaleLowerCase("tr-TR")}`);
  /** Gönderilecek veri: yalnız alan yapısındaki üst düzey alanlar (gruplar ve listeler bütün hâlde) */
  const veri = (): Kayit => Object.fromEntries(alanlar.filter((a) => !a.admin?.readOnly && a.name! in kayit).map((a) => [a.name!, kayit[a.name!]]));

  async function gonder(is: () => Promise<Kayit>, mesaj: string) {
    setMesgul(true); setHata("");
    try { const d = await is(); setKayit(d); setDegisti(false); setSurum((x) => x + 1); toast(mesaj); }
    catch (e) { setHata((e as Error).message); }
    finally { setMesgul(false); }
  }
  const kaydet = () => gonder(async () => {
    if (g) return api.istekYap<Kayit>(`${yol}?depth=0${taslak}`, { method: "POST", body: JSON.stringify(veri()) });
    if (!id) {
      const ek = k!.giris ? { password: rastgeleSifre() } : {}; // giriş Stüdyo'dan; panel şifresi kimseye verilmez
      const r = await api.istekYap<{ doc: Kayit }>(`/${k!.slug}?depth=0${taslak}`, { method: "POST", body: JSON.stringify({ ...veri(), ...ek }) });
      setId(r.doc.id as number); return r.doc;
    }
    return (await api.istekYap<{ doc: Kayit }>(`${yol}?depth=0${taslak}`, { method: "PATCH", body: JSON.stringify(veri()) })).doc;
  }, sema.taslak ? "Kaydedildi (taslak)." : "Kaydedildi.");
  const yayinla = () => confirm(yayinda ? "Değişiklikler sitede yayınlansın mı?" : "Yayınlansın mı?") && gonder(async () => {
    if (g) return api.istekYap<Kayit>(`${yol}?depth=0`, { method: "POST", body: JSON.stringify({ ...veri(), _status: "published" }) });
    return (await api.istekYap<{ doc: Kayit }>(`${yol}?depth=0`, { method: "PATCH", body: JSON.stringify({ ...veri(), _status: "published" }) })).doc;
  }, "Yayınlandı; site birkaç dakikada güncellenir.");
  const kaldir = () => confirm("Yayından kaldırılsın mı? İçerik taslak olarak kalır.") && gonder(async () =>
    (await api.istekYap<{ doc: Kayit }>(`${yol}?depth=0`, { method: "PATCH", body: JSON.stringify({ _status: "draft" }) })).doc, "Yayından kaldırıldı.");
  async function sil() {
    if (!confirm(`"${baslik}" kalıcı olarak silinsin mi? Bu geri alınamaz.`)) return;
    setMesgul(true);
    try { await api.istekYap(`${yol}`, { method: "DELETE" }); toast("Silindi."); kapat(); }
    catch (e) { setHata((e as Error).message); setMesgul(false); }
  }
  const geri = () => { if (!degisti || confirm("Kaydedilmemiş değişiklikler var. Çıkılsın mı?")) kapat(); };

  const ana = sema.fields.filter((a) => a.admin?.position !== "sidebar");
  const yan = sema.fields.filter((a) => a.admin?.position === "sidebar");
  const set = (v: Kayit) => { setKayit(v); setDegisti(true); };
  const medya = k?.gorsel ? (kayit as Medya) : null;

  return (
    <div className="site-duzen">
      <div className="row site-ust">
        <button className="btn ghost sm" onClick={geri}>← Geri</button>
        <b className="site-baslik-ust">{baslik}</b>
        {sema.taslak && <span className={`site-durum site-durum--${yayinda ? "yayinda" : "taslak"}`}>{yayinda ? api.DURUMLAR.yayinda : api.DURUMLAR.taslak}</span>}
        <span style={{ flex: 1 }} />
        {k && id && <a className="btn ghost sm" href={api.panelAdresi(k.slug as api.Koleksiyon, id)} target="_blank" rel="noreferrer">Panelde aç ↗</a>}
        {k && id && yonetici && <button className="btn ghost sm" disabled={mesgul} onClick={sil}>Sil</button>}
        {yayinda && <button className="btn ghost sm" disabled={mesgul} onClick={kaldir}>Yayından kaldır</button>}
        <button className={sema.taslak ? "btn ghost sm" : "btn sm"} disabled={mesgul || !degisti} onClick={kaydet}>{degisti ? "Kaydet" : "Kaydedildi"}</button>
        {sema.taslak && id !== null && <button className="btn sm" disabled={mesgul} onClick={yayinla}>{yayinda ? "Değişiklikleri yayınla" : "Yayınla"}</button>}
        {g && sema.taslak && <button className="btn sm" disabled={mesgul} onClick={yayinla}>Yayınla</button>}
      </div>
      {hata && <div className="msg err">{hata}</div>}
      {medya?.url && <img className="site-medya-buyuk" src={api.medyaAdres(medya.sizes?.card?.url || medya.url)} alt={medya.alt ?? ""} />}
      <div className={yan.length ? "site-izgara" : ""} key={surum}>
        <div className="site-form"><Alanlar fs={ana} deger={kayit} set={set} /></div>
        {yan.length > 0 && <div className="site-form site-yan"><Alanlar fs={yan} deger={kayit} set={set} /></div>}
      </div>
    </div>
  );
}
