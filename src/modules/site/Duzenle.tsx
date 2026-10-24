import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../shared/toast";
import * as api from "./api";
import type { Koleksiyon, Medya, PanelKullanici, Secenek, Sema, TamIcerik } from "./api";
import { bilinmeyenTurler } from "./editor/dugumler";
import MetinEditoru from "./editor/MetinEditoru";
import MedyaSecici from "./MedyaSecici";
import { Alanlar } from "./Form";
import { alanlar, veriAlanlari, type Alan } from "./sema";

// Haber düzenleme (2. aşama). Kaydet = taslak (sitedeki sayfa değişmez); Yayınla = panelin kurallarıyla yayına alır.
// Grup alanları (seo, workflow) bütün olarak gönderilir ki alt alanlar silinmesin. Bu ekranda özel çizilmeyen bütün alanlar
// (kaynaklar, ürün künyesi, sızıntı, düzeltmeler, SEO/GEO'nun kalanı, hazırlayan…) panelin alan yapısından genel formla çizilir.
const OZEL = new Set(["title", "spot", "category", "label", "cover", "shortAnswer", "body", "author", "publishedAt", "seo", "workflow"]);
const YAYINCI = ["admin", "yayin-yonetmeni"];
type Form = {
  title: string; spot: string; category: number | null; label: string; cover: number | null; shortAnswer: string;
  author: number | null; publishedAt: string; seoTitle: string; seoDescription: string; checklist: Record<string, boolean>; body: unknown;
};

const formYap = (d: TamIcerik): Form => ({
  title: d.title ?? "", spot: d.spot ?? "", category: d.category ?? null, label: d.label ?? "yok", cover: d.cover ?? null,
  shortAnswer: d.shortAnswer ?? "", author: d.author ?? null, publishedAt: d.publishedAt ?? "",
  seoTitle: d.seo?.title ?? "", seoDescription: d.seo?.description ?? "", checklist: { ...(d.workflow?.checklist ?? {}) }, body: d.body,
});
// datetime-local alanı yerel saat ister
const yerel = (iso: string) => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function Sayac({ deger, sinir }: { deger: string; sinir: number }) {
  return <span className={deger.length > sinir ? "site-sayac asti" : "site-sayac"}>{deger.length} / {sinir}</span>;
}

export default function Duzenle({ k, id, kullanici, kapat }: { k: Koleksiyon; id: number; kullanici: PanelKullanici; kapat: () => void }) {
  const toast = useToast();
  const [doc, setDoc] = useState<TamIcerik | null>(null);
  const [sema, setSema] = useState<Sema | null>(null);
  const [kategoriler, setKategoriler] = useState<Secenek[]>([]);
  const [yazarlar, setYazarlar] = useState<Secenek[]>([]);
  const [f, setF] = useState<Form | null>(null);
  const [kapak, setKapak] = useState<Medya | null>(null);
  const [kapakSec, setKapakSec] = useState(false);
  const [degisti, setDegisti] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState("");
  const [metinSurum, setMetinSurum] = useState(0); // kayıttan sonra editörü sunucudaki metinle yeniden kurar
  const [ek, setEk] = useState<Record<string, unknown> | null>(null); // genel formla düzenlenen alanlar
  const [alanYapisi, setAlanYapisi] = useState<Alan[]>([]);

  useEffect(() => {
    Promise.all([api.getirTam(k, id), api.sema(), api.kategoriler(), api.yazarlar(), alanlar()])
      .then(([d, s, kt, yz, ps]) => { setDoc(d); setF(formYap(d)); setEk(d); setSema(s); setKategoriler(kt); setYazarlar(yz); setAlanYapisi(ps.koleksiyonlar.find((c) => c.slug === k)?.fields ?? []); })
      .catch((e) => setHata((e as Error).message));
  }, [k, id]);
  useEffect(() => { if (f?.cover) api.medyaGetir(f.cover).then(setKapak).catch(() => setKapak(null)); else setKapak(null); }, [f?.cover]);
  useEffect(() => {
    if (!degisti) return;
    const uyar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", uyar);
    return () => window.removeEventListener("beforeunload", uyar);
  }, [degisti]);

  const bilinmeyen = useMemo(() => (doc ? bilinmeyenTurler(doc.body) : []), [doc]);
  if (hata && !f) return <div className="empty">Açılamadı: {hata} <button className="linkbtn" onClick={kapat}>Listeye dön</button></div>;
  if (!doc || !f || !sema || !ek) return <div className="muted">Yükleniyor…</div>;

  const yayinda = doc._status === "published";
  const yayinci = YAYINCI.includes(kullanici.role);
  const yasak = sema.yasakKelimeler.find((w) => f.title.toLocaleLowerCase("tr-TR").includes(w)) || (f.title.includes("!") ? "!" : "");
  const eksik = sema.checklist.filter(([a]) => !f.checklist[a]).length;
  const set = <K extends keyof Form>(a: K, v: Form[K]) => { setF({ ...f, [a]: v }); setDegisti(true); };

  /** Sunucuya gidecek veri: değişen alanlar + grup alanları bütün hâlde */
  const genelVeri = Object.fromEntries(veriAlanlari(alanYapisi).filter((a) => !OZEL.has(a.name!) && !a.admin?.readOnly && a.name! in ek).map((a) => [a.name!, ek[a.name!]]));
  const veri = (durum?: string): Record<string, unknown> => ({
    ...genelVeri,
    title: f.title, spot: f.spot, category: f.category, label: f.label, cover: f.cover, shortAnswer: f.shortAnswer,
    author: f.author, publishedAt: f.publishedAt || null,
    ...(bilinmeyen.length ? {} : { body: f.body }),
    seo: { ...(ek.seo as object), title: f.seoTitle, description: f.seoDescription },
    workflow: { ...(ek.workflow as object), checklist: f.checklist, ...(durum ? { state: durum } : {}) },
  });

  async function calistir(is: () => Promise<TamIcerik>, tamam: string) {
    setMesgul(true); setHata("");
    try {
      const d = await is();
      setDoc(d); setF(formYap(d)); setEk(d); setDegisti(false); setMetinSurum((x) => x + 1); toast(tamam);
    } catch (e) { setHata((e as Error).message); }
    finally { setMesgul(false); }
  }
  const kaydet = (durum?: string, mesaj = "Kaydedildi (taslak).") => calistir(() => api.kaydet(k, id, veri(durum)), mesaj);
  const yayinla = () => { if (confirm(yayinda ? "Değişiklikler sitede yayınlansın mı?" : "Haber yayınlansın mı?")) calistir(() => api.kaydetVeYayinla(k, id, veri()), "Yayınlandı; site birkaç dakikada güncellenir."); };
  async function onizle() {
    if (degisti) await kaydet(undefined, "Kaydedildi, önizleme açılıyor.");
    const pencere = window.open("about:blank", "_blank");
    try { const url = await api.onizlemeAdresi(k, id); if (pencere) pencere.location.href = url; }
    catch (e) { pencere?.close(); toast((e as Error).message); }
  }
  const geri = () => { if (!degisti || confirm("Kaydedilmemiş değişiklikler var. Çıkılsın mı?")) kapat(); };

  return (
    <div className="site-duzen">
      <div className="row site-ust">
        <button className="btn ghost sm" onClick={geri}>← Liste</button>
        <span className={`site-durum site-durum--${yayinda ? "yayinda" : doc.workflow?.state ?? "taslak"}`}>{api.DURUMLAR[yayinda ? "yayinda" : doc.workflow?.state ?? "taslak"]}</span>
        {yayinda && <span className="muted">Kaydettiğin değişiklikler, yayınlayana kadar sitede görünmez.</span>}
        <span style={{ flex: 1 }} />
        <button className="btn ghost sm" disabled={mesgul} onClick={onizle}>Önizle ↗</button>
        {kullanici.role === "admin" && <a className="btn ghost sm" href={api.panelAdresi(k, id)} target="_blank" rel="noreferrer">Panelde aç ↗</a>}
        <button className="btn ghost sm" disabled={mesgul || !degisti} onClick={() => kaydet()}>{degisti ? "Kaydet" : "Kaydedildi"}</button>
        {!yayinda && !yayinci && doc.workflow?.state !== "incelemede" && <button className="btn sm" disabled={mesgul} onClick={() => kaydet("incelemede", "İncelemeye gönderildi.")}>İncelemeye gönder</button>}
        {yayinci && <button className="btn sm" disabled={mesgul} onClick={yayinla}>{yayinda ? "Değişiklikleri yayınla" : "Yayınla"}</button>}
      </div>
      {hata && <div className="msg err">{hata}</div>}

      <div className="site-izgara">
        <div className="site-form">
          <label>Başlık <Sayac deger={f.title} sinir={sema.limit.title} />
            <input type="text" value={f.title} onChange={(e) => set("title", e.target.value)} />
            <span className="muted">Kim/ne + ne oldu + neden önemli.{yasak && <b className="site-uyari"> Başlıkta "{yasak}" kullanılmaz.</b>}</span>
          </label>
          <label>Spot <Sayac deger={f.spot} sinir={sema.limit.spot} />
            <textarea rows={2} value={f.spot} onChange={(e) => set("spot", e.target.value)} />
            <span className="muted">Tek cümle.</span>
          </label>
          <div className="site-kapak">
            <span className="site-etiket">Kapak (16:9)</span>
            {kapak ? <img src={api.medyaAdres(kapak.sizes?.card?.url || kapak.url || "")} alt={kapak.alt ?? ""} /> : <div className="empty">Kapak yok</div>}
            {kapak && <span className="muted">{api.duzMetin(kapak.credit)}</span>}
            <button type="button" className="btn ghost sm" onClick={() => setKapakSec(true)}>{kapak ? "Kapağı değiştir" : "Kapak seç"}</button>
          </div>
          <label>Kısa cevap <span className="muted">(2–3 cümle; arama ve yapay zekâ yanıtları için)</span>
            <textarea rows={3} value={f.shortAnswer} onChange={(e) => set("shortAnswer", e.target.value)} />
          </label>
          <div>
            <span className="site-etiket">Metin</span>
            {bilinmeyen.length ? (
              <div className="msg err">Bu haberin metninde Stüdyo editörünün henüz tanımadığı öğe var ({bilinmeyen.join(", ")}); bozulmasın diye metni <a href={api.panelAdresi(k, id)} target="_blank" rel="noreferrer">panelde düzenle ↗</a>. Diğer alanlar burada düzenlenebilir.</div>
            ) : (
              <MetinEditoru key={metinSurum} baslangic={doc.body} altSinir={sema.limit.alt} degisti={(j) => { setF((o) => (o ? { ...o, body: j } : o)); setDegisti(true); }} />
            )}
          </div>
          <Alanlar fs={alanYapisi.filter((x) => x.admin?.position !== "sidebar")} deger={ek} set={(v) => { setEk(v); setDegisti(true); }} haric={OZEL} />
        </div>

        <div className="site-form site-yan">
          <label>Kategori
            <select value={f.category ?? ""} onChange={(e) => set("category", e.target.value ? Number(e.target.value) : null)}>
              <option value="">Seç…</option>
              {kategoriler.map((x) => <option key={x.id} value={x.id}>{x.ad}</option>)}
            </select>
          </label>
          <label>İçerik etiketi
            <select value={f.label} onChange={(e) => set("label", e.target.value)}>
              {sema.labels.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
          <label>Yazar
            <select value={f.author ?? ""} onChange={(e) => set("author", e.target.value ? Number(e.target.value) : null)}>
              <option value="">Seç…</option>
              {yazarlar.map((x) => <option key={x.id} value={x.id}>{x.ad}</option>)}
            </select>
          </label>
          <label>Yayın zamanı <span className="muted">(boşsa yayınlandığı an)</span>
            <input type="datetime-local" value={yerel(f.publishedAt)} onChange={(e) => set("publishedAt", e.target.value ? new Date(e.target.value).toISOString() : "")} />
          </label>
          <details>
            <summary>SEO <span className="muted">(boş bırakılırsa otomatik)</span></summary>
            <label>SEO başlığı <Sayac deger={f.seoTitle} sinir={sema.limit.seoTitle} /><input type="text" value={f.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} /></label>
            <label>Açıklama <Sayac deger={f.seoDescription} sinir={sema.limit.spot} /><textarea rows={3} value={f.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} /></label>
            {(() => { const a = alanYapisi.find((x) => x.name === "seo"); return a ? <Alanlar fs={a.fields ?? []} deger={(ek.seo as Record<string, unknown>) ?? {}} set={(v) => { setEk({ ...ek, seo: v }); setDegisti(true); }} haric={new Set(["title", "description"])} /> : null; })()}
          </details>
          <div className="site-kontrol">
            <span className="site-etiket">Yayın öncesi kontrol {eksik ? <span className="muted">· {eksik} eksik</span> : <span className="muted">· tamam</span>}</span>
            {sema.checklist.map(([a, metin]) => (
              <label key={a} className="site-kutu"><input type="checkbox" checked={!!f.checklist[a]} onChange={(e) => set("checklist", { ...f.checklist, [a]: e.target.checked })} /> {metin}</label>
            ))}
          </div>
          {(() => {
            const grup = (ad: string, cikar: string[]) => { const a = alanYapisi.find((x) => x.name === ad); return a ? [{ ...a, fields: (a.fields ?? []).filter((x) => !cikar.includes(x.name ?? "")) }] : []; };
            const setEk_ = (v: Record<string, unknown>) => { setEk(v); setDegisti(true); };
            return <>
              <Alanlar fs={grup("workflow", ["state", "checklist", "approvedBy"])} deger={ek} set={setEk_} />
              <Alanlar fs={alanYapisi.filter((a) => a.admin?.position === "sidebar")} deger={ek} set={setEk_} haric={OZEL} />
            </>;
          })()}
        </div>
      </div>
      {kapakSec && <MedyaSecici altSinir={sema.limit.alt} kapat={() => setKapakSec(false)} sec={(m) => { set("cover", m.id); setKapak(m); setKapakSec(false); }} />}
    </div>
  );
}
