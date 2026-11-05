import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCanliNesne, useCanli } from "../../shared/canli";
import { Ikon } from "../../shared/Ikon";
import { useToast } from "../../shared/toast";
import * as api from "../site/api";
import type { Medya } from "../site/api";
import { degerlendir } from "../haber-masasi/oncelik";
import { MasaProvider, useMasa } from "../haber-masasi/veri";
import { SiteYetkisiYok, usePanelKullanici } from "./Taslaklarim";

// Taslağı oku (6 Kasım 2026, onaylı tasarım claude.ai/artifact/AHBvDdvU7gVcXunmXsZet2, ikinci ekran). Soru: "Bu metin yayına hazır mı?"
// Solda yazının sitede görüneceği hâli (panelin taslak önizlemesi), sağda karar: Yayınla, Düzenle ya da "Yayınlamıyoruz, sıradan çıkar";
// altında öne çıkan görsel ve denetimin notları. Metni değiştirmek isteyen "Düzenle" ile sitedeki editöre geçer (/yaz/:id).
// "Yayınlamıyoruz" haberi arşive alır (workflow.state "arsiv"): sıradan düşer, silinmez; Site › Haberler › Tümü'nde durur.
const YAYINCI = ["admin", "yayin-yonetmeni", "editor"];
type Tam = Omit<api.TamIcerik, "category" | "cover"> & { category?: number | { id: number; name?: string } | null; cover?: number | Medya | null };
const metinYap = (x: unknown): string => (typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x as Record<string, unknown>).map(metinYap).filter(Boolean).join(" — ") : String(x ?? ""));

function Icerik({ id }: { id: number }) {
  const { kullanici, hata: panelHata } = usePanelKullanici();
  const { v } = useMasa();
  const canli = useCanli();
  const toast = useToast(), git = useNavigate();
  const [doc, setDoc] = useState<Tam | null>(null);
  const [hata, setHata] = useState("");
  const [adres, setAdres] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState("");
  const [boy, setBoy] = useState<"masaustu" | "telefon">("masaustu");

  useEffect(() => {
    if (!kullanici) return;
    setDoc(null); setHata(""); setAdres(null);
    api.istekYap<Tam>(`/news/${id}?draft=true&depth=1`).then(setDoc).catch((e) => setHata((e as Error).message));
    api.onizlemeAdresi("news", id).then(setAdres).catch(() => setAdres(""));
  }, [kullanici, id]);
  useCanliNesne(doc ? { tur: "haber", id, baslik: doc.title ?? "", eylem: "bakıyor" } : null);

  const t = useMemo(() => v.taslaklar.find((x) => x.site_id === id), [v.taslaklar, id]);
  const h = useMemo(() => (t?.item_id ? v.haberler.find((x) => x.id === t.item_id) : undefined), [v.haberler, t]);
  const baskalari = canli.kisiler.filter((k) => k.id !== canli.ben && k.nesne?.tur === "haber" && k.nesne.id === id);

  if (panelHata) return <div className="empty">Site paneline bağlanılamadı: {panelHata}</div>;
  if (kullanici === null) return <SiteYetkisiYok />;
  if (hata) return <div className="empty">Taslak açılamadı: {hata} <Link to="/masam">Masam'a dön</Link></div>;
  if (!doc || !kullanici) return <div className="muted">Açılıyor…</div>;

  const yayinda = doc._status === "published";
  const yayinci = YAYINCI.includes(kullanici.role);
  const kapak = doc.cover && typeof doc.cover === "object" ? doc.cover : null;
  const kaynaklar = h ? [{ ad: h.source_name, link: h.link }, ...(h.other_sources ?? []).map((o) => ({ ad: o.name, link: o.link }))].filter((x, i, l) => x.ad && l.findIndex((y) => y.ad === x.ad) === i) : [];
  const duzeltme = t?.qc?.duzeltmeler?.length ?? 0;
  const uyarilar = [...(t?.qc?.sorunlar ?? []), ...(t?.checks ?? []), ...(t?.site_eksik?.eksikler ?? [])].map(metinYap).filter(Boolean);
  const is_ = async (ad: string, f: () => Promise<unknown>, mesaj: string) => {
    setMesgul(ad);
    try { await f(); toast(mesaj); git("/masam"); }
    catch (e) { toast((e as Error).message); setMesgul(""); }
  };
  const yayinla = () => { if (confirm("Haber yayınlansın mı?")) is_("yayin", () => api.yayinla("news", id), "Yayınlandı; site birkaç dakikada güncellenir."); };
  const cikar = () => { if (confirm("Bu taslak yayınlanmayacak ve sıradan çıkacak. Silinmez; Site › Haberler'de arşivde durur.")) is_("cikar", () => api.durumYap("news", id, "arsiv"), "Sıradan çıkarıldı."); };

  return (
    <div className="mas mas-oku">
      <div className="mas-oku-ust">
        <Link className="linkbtn" to="/masam">← Masam</Link>
        <span className="mas-oku-ad">{doc.title || "Başlıksız taslak"}</span>
      </div>
      <div className="mas-izgara">
        <section className="mas-kart mas-onizleme" aria-label="Yazının sitedeki görünümü">
          <div className="mas-kart-bas">
            <h2>Sitede böyle görünecek</h2>
            <div className="segment" role="group" aria-label="Ekran">
              <button aria-pressed={boy === "masaustu"} onClick={() => setBoy("masaustu")}>Masaüstü</button>
              <button aria-pressed={boy === "telefon"} onClick={() => setBoy("telefon")}>Telefon</button>
            </div>
          </div>
          <div className="mas-sahne">
            {adres === null ? <div className="mas-bos">Önizleme hazırlanıyor…</div>
              : adres ? <iframe key={adres} title="Taslak önizlemesi" src={adres} style={{ width: boy === "telefon" ? 390 : "100%" }} />
              : <div className="mas-bos">Önizleme açılamadı. Metni görmek için <Link to={`/yaz/${id}`}>düzenleme ekranını</Link> aç.</div>}
          </div>
        </section>

        <div className="mas-sutun">
          <section className="mas-kart mas-karar" aria-label="Karar">
            <span className={"mas-durum" + (yayinda ? " yayinda" : "")}>{yayinda ? "Yayında" : "Taslak hazır"}</span>
            {baskalari.length > 0 && <div className="msg good">{baskalari.map((k) => k.ad.split(" ")[0]).join(", ")} de bu taslağı açtı{baskalari.some((k) => k.nesne?.eylem === "düzenliyor") ? " ve düzenliyor" : ""}.</div>}
            <dl className="mas-alanlar">
              {h && <><dt>Önem</dt><dd>{degerlendir(h).onem.toLocaleString("tr")} / 10</dd></>}
              <dt>Kategori</dt><dd>{api.ad(doc.category as never) || "Seçilmedi"}</dd>
              <dt>Yazan</dt><dd>{!t ? "Elle yazıldı" : t.auto ? "Sistem" : "Sistem (istekle)"}</dd>
              {kaynaklar.length > 0 && <><dt>Kaynaklar</dt><dd>{kaynaklar.map((k, i) => <span key={k.ad}>{i > 0 && ", "}<a href={k.link} target="_blank" rel="noreferrer">{k.ad}</a></span>)}</dd></>}
            </dl>
            {yayinci && !yayinda && <button className="btn" disabled={!!mesgul} onClick={yayinla}>{mesgul === "yayin" ? "Yayınlanıyor…" : "Yayınla"}</button>}
            <button className="btn ghost" disabled={!!mesgul} onClick={() => git(`/yaz/${id}`)}><Ikon ad="yaz" />Düzenle</button>
            {!yayinda && <button type="button" className="mas-metin-btn" disabled={!!mesgul} onClick={cikar}>{mesgul === "cikar" ? "Çıkarılıyor…" : "Yayınlamıyoruz, sıradan çıkar"}</button>}
          </section>

          <section className="mas-kart" aria-labelledby="oku-gorsel">
            <div className="mas-kart-bas"><h2 id="oku-gorsel">Öne çıkan görsel</h2><Link to={`/yaz/${id}`}>Değiştir</Link></div>
            {kapak?.url ? <>
              <img className="mas-kapak" src={api.medyaAdres(api.medyaKucuk(kapak))} alt={kapak.alt ?? ""} />
              <div className="mas-kapak-alt"><span>{kapak.credit || "Kaynak yazılmamış"}</span>{kapak.width && kapak.height ? <span>{kapak.width} × {kapak.height}</span> : null}</div>
            </> : <div className="mas-bos">Görsel seçilmemiş. "Değiştir" ile ekle.</div>}
          </section>

          <section className="mas-kart" aria-labelledby="oku-not">
            <div className="mas-kart-bas"><h2 id="oku-not">Denetimin notları</h2>{t && <Link to={`/haber-masasi?b=taslak&t=${t.id}`}>Yazım kaydı</Link>}</div>
            {!t ? <div className="mas-bos">Bu taslağı sistem yazmadı; denetim kaydı yok.</div> : (
              <ul className="mas-notlar">
                <li className={t.qc_state === "tamam" ? "tamam" : ""}><Ikon ad={t.qc_state === "tamam" ? "check" : "saat"} /><span>{t.qc_state === "tamam" ? `Denetim tamam${duzeltme ? ` · ${duzeltme} düzeltme yapıldı` : ""}` : t.qc_state === "hata" ? "Denetim tamamlanamadı; metni kaynakla karşılaştır." : "Denetim sürüyor."}</span></li>
                {t.site_eksik?.duzeltmeler?.length ? <li className="tamam"><Ikon ad="check" /><span>Yayın kuralı için düzeltildi: {t.site_eksik.duzeltmeler.join(" ")}</span></li> : null}
                {uyarilar.map((u, i) => <li key={i} className="uyari"><Ikon ad="uyari" /><span>{u}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function Oku() {
  const { id } = useParams();
  const no = Number(id);
  if (!Number.isInteger(no) || no <= 0) return <div className="empty">Taslak bulunamadı. <Link to="/masam">Masam'a dön</Link></div>;
  return <MasaProvider><Icerik key={no} id={no} /></MasaProvider>;
}
