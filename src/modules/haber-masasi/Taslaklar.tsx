import { useEffect, useState } from "react";
import { useAuth } from "../../shared/auth";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { useKisi, zamanOnce } from "./ortak";
import { useMasa, type Taslak } from "./veri";

// Markdown → HTML ortak dosyada: ekrandaki önizleme ve "HTML kopyala" aynı çıktıyı kullanır (panele Markdown gider).
import { yaziHtml } from "../../../supabase/functions/triyaj-taslak/html.ts";
import { fluxIstem } from "../../../supabase/functions/triyaj-taslak/gorsel.ts";

/** Yapay zekâ bazen liste öğesini metin yerine nesne döndürür ({iddia, kaynak} gibi): ekran çökmesin diye metne çevrilir */
const metinYap = (x: unknown): string => typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x as Record<string, unknown>).map((v) => metinYap(v)).filter(Boolean).join(" — ") : String(x ?? "");

/** Eski taslak dokümanının "GÖRSEL" bölümü: öneri, alt text, basın kiti, stok önerileri, yapay zekâ istemi */
function Gorsel({ t, marka }: { t: Taslak; marka: string }) {
  const toast = useToast();
  const g = t.image ?? {};
  // Flux: Fatih'in bilgisayarındaki işçi bekleyen istekleri alır, üretip yükler (bilgisayar açık ve işçi çalışıyorsa)
  async function fluxIste() {
    const r = await sb.from("tr_drafts").update({ image: { ...g, flux: { durum: "bekliyor", istem: fluxIstem(g.ai_istem || t.title), istendi: new Date().toISOString() } } }).eq("id", t.id);
    toast(r.error ? r.error.message : "Flux isteği sıraya alındı; bilgisayar açıkken üretilir ve buraya gelir.");
  }
  const flux = g.flux;
  const fluxSatir = flux?.durum === "bekliyor" ? <div className="muted">🎨 Flux ile yazısız bir görsel üretilecek (Fatih'in bilgisayarı açıkken). İstem: {flux.istem}</div>
    : flux?.durum === "hata" ? <div className="msg err">Flux görseli üretilemedi: {flux.hata} <button className="linkbtn" onClick={fluxIste}>Tekrar dene</button></div>
    : !g.secilen ? <div><button className="btn ghost sm" onClick={fluxIste}>Flux ile görsel üret</button></div> : null;
  const stok = g.stok ?? [];
  if (!g.oneri && !t.image_note && !g.basin && !stok.length && !g.ai_istem && !g.secilen && !g.gorsel_neden && !flux) return null;
  const sec = g.secilen;
  return (
    <div className="panel">
      <h3>Görsel</h3>
      {sec ? (
        <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
          <a href={sec.sayfa} target="_blank" rel="noreferrer"><img src={sec.thumb} alt={g.alt_text ?? ""} style={{ width: 200, borderRadius: 8 }} /></a>
          <div>
            <b>Öne çıkan görsel (otomatik seçildi)</b>
            <div className="muted">Fotoğraf: {sec.yazar} / {sec.kaynak} · {sec.lisans}</div>
            {g.gorsel_neden && <div className="muted">Neden: {g.gorsel_neden}</div>}
            <div className="muted">{t.site_id ? "Panelde haberin kapağı oldu; künyede kaynak ve lisans yazıyor. Değiştirmek istersen paneldeki kapak alanını değiştir." : "Panele gönderilince haberin kapağı olarak eklenecek."}</div>
            {g.yukleme_hata && <div className="msg err">{g.yukleme_hata}</div>}
          </div>
        </div>
      ) : g.gorsel_neden ? <div className="muted">Öne çıkan görsel eklenmedi: {g.gorsel_neden}</div> : null}
      {fluxSatir}
      <ul>
        <li>Öneri: {g.oneri || t.image_note}</li>
        {g.alt_text && <li>Alt text: {g.alt_text}</li>}
        {g.basin && <li><a href={g.basin.url} target="_blank" rel="noreferrer">{g.basin.kesin ? `Resmi basın sayfası (${marka}) ↗` : `Resmi basın görseli ara (${marka}) ↗`}</a>{!g.basin.kesin && <span className="muted"> (arama bağlantısı, resmi sayfayı kendin doğrula)</span>}</li>}
        {(g.aramalar ?? []).length > 0 && !stok.length && <li>Stok fotoğraf aramaları: {g.aramalar!.join(" / ")} <span className="muted">({g.stok_anahtar ? "sonuç çıkmadı" : "stok fotoğraf anahtarı tanımlı değil"})</span></li>}
      </ul>
      {stok.length > 0 && <>
        <div className="muted">Stok önerileri (aramalar: {(g.aramalar ?? []).join(" · ")}). Kullanırken kaynak göster.</div>
        <div className="stok">
          {stok.map((p) => <a key={p.url} href={p.url} target="_blank" rel="noreferrer"><img src={p.thumb} alt="" loading="lazy" />{p.kaynak} · {p.yazar}</a>)}
        </div>
      </>}
      {g.ai_istem && <>
        <div><b>Yapay zekâ görseli için istem (İngilizce):</b> {g.ai_istem}</div>
        <div className="muted">Uyarı: Gerçek veya henüz çıkmamış bir ürünü yapay zekâyla birebir çizme; konsept/atmosfer görseli olarak kullan ve "yapay zekâ ile üretilmiştir" diye belirt.</div>
      </>}
    </div>
  );
}

const DURUM: Record<Taslak["status"], string> = { taslak: "Taslak", hazir: "Yayına hazır", gonderildi: "Siteye gönderildi" };

export default function Taslaklar({ acik, setAcik }: { acik: number | null; setAcik: (id: number | null) => void }) {
  const { v } = useMasa();
  const kisi = useKisi();
  const { profile } = useAuth();
  const [filtre, setFiltre] = useState<"benim" | "hepsi">("benim");
  const t = acik ? v.taslaklar.find((x) => x.id === acik) : undefined;
  if (t) return <Duzenleyici key={t.id} t={t} kapat={() => setAcik(null)} />;

  const liste = v.taslaklar.filter((x) => filtre === "hepsi" || x.author === profile!.id);
  return (
    <>
      <div className="segment" role="group">
        <button aria-pressed={filtre === "benim"} onClick={() => setFiltre("benim")}>Benim</button>
        <button aria-pressed={filtre === "hepsi"} onClick={() => setFiltre("hepsi")}>Hepsi</button>
      </div>
      {!liste.length && <div className="empty">Taslak yok. Benim aldıklarım bölümünde "Taslak hazırla"ya bas.</div>}
      <div className="liste panel">
        {liste.map((x) => (
          <button key={x.id} className="satir linkbtn" style={{ color: "inherit", width: "100%" }} onClick={() => setAcik(x.id)}>
            <div className="ana"><b>{x.title || "(başlıksız)"}</b><div className="muted">{kisi(x.author)?.name ?? "?"} · {zamanOnce(x.updated_at)} önce</div></div>
            {x.auto && <span className="pill purple" title="Stüdyo kendisi hazırladı">🤖</span>}
            {x.qc?.ana_sayfa && <span className="pill rose" title={`Önem ${x.qc.onem ?? ""}/10`}>Ana sayfa adayı</span>}
            {(x.qc_state === "bekliyor" || x.qc_state === "calisiyor") && <span className="pill off" title="Kaynaklara karşı son kontrol, görsel ve panele gönderim">Kontrol ediliyor</span>}
            {x.site_hata && <span className="pill rose" title={x.site_hata}>Panel hatası</span>}
            {x.site_id && !x.site_hata && x.site_eksik && (x.site_eksik.eksikler?.length
              ? <span className="pill wait" title={x.site_eksik.eksikler.join(" · ")}>Eksik: {x.site_eksik.eksikler.length}</span>
              : <span className="pill ok" title="Panelde ölçülebilen kurallar tamam; editör okuyup onaylar">Panelde hazır</span>)}
            <span className={"pill " + (x.status === "hazir" ? "ok" : x.status === "gonderildi" ? "blue" : "off")}>{DURUM[x.status]}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function Duzenleyici({ t, kapat }: { t: Taslak; kapat: () => void }) {
  const toast = useToast();
  const { v } = useMasa();
  const [d, setD] = useState(t);
  const [degisti, setDegisti] = useState(false);
  const [gorunum, setGorunum] = useState<"duzen" | "onizle">("duzen");
  const haber = v.haberler.find((h) => h.id === t.item_id);
  useEffect(() => { if (!degisti) setD(t); }, [t, degisti]);

  const alan = <K extends keyof Taslak>(k: K, deger: Taslak[K]) => { setD({ ...d, [k]: deger }); setDegisti(true); };
  const seo = (k: keyof Taslak["seo"], deger: string) => alan("seo", { ...d.seo, [k]: k === "etiketler" ? deger.split(",").map((s) => s.trim()).filter(Boolean) : deger });

  async function kaydet(durum?: Taslak["status"]) {
    const kayit = { title: d.title, spot: d.spot, body: d.body, seo: d.seo, sources: d.sources, image_note: d.image_note, editor_note: d.editor_note, status: durum ?? d.status, updated_at: new Date().toISOString() };
    const r = await sb.from("tr_drafts").update(kayit).eq("id", t.id);
    if (r.error) return toast(r.error.message);
    setDegisti(false); if (durum) setD({ ...d, status: durum });
    toast("Kaydedildi.");
  }

  async function kopyala() {
    const html = yaziHtml(d.spot, d.body);
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([d.spot + "\n\n" + d.body], { type: "text/plain" }) })]);
      toast("Kopyalandı.");
    } catch { toast("Kopyalanamadı; tarayıcı izin vermedi."); }
  }

  // Panele (updated.com.tr) taslak haber olarak gönder; yayına panelde yayın yönetmeni basar. Kaydedilmemiş değişiklik varsa önce kaydedilir.
  const [siteSuruyor, setSiteSuruyor] = useState(false);
  async function siteGonder(zorla = false) {
    if (degisti) await kaydet();
    setSiteSuruyor(true);
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { site: true, draft_id: t.id, zorla } });
    setSiteSuruyor(false);
    if (error) {
      let m = error.message;
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.hata) m = j.hata; } catch { /* yok */ }
      return toast(m);
    }
    setD({ ...d, status: "gonderildi" });
    toast(`Panele taslak olarak gitti${data?.kategori ? " (" + data.kategori + ")" : ""}. Yayına panelde yayın yönetmeni basar.`);
  }

  const [silOnay, setSilOnay] = useState(false);
  async function sil() {
    if (!silOnay) { setSilOnay(true); window.setTimeout(() => setSilOnay(false), 4000); return; }
    const r = await sb.from("tr_drafts").delete().eq("id", t.id);
    if (r.error) return toast(r.error.message);
    toast("Taslak silindi."); kapat();
  }

  const kelime = d.body.split(/\s+/).filter(Boolean).length;
  return (
    <>
      <div className="row">
        <button className="btn ghost sm" onClick={kapat}>← Taslaklar</button>
        <span className="muted" style={{ marginRight: "auto" }}>{kelime} kelime{degisti ? " · kaydedilmedi" : ""}</span>
        <button className="btn ghost sm" onClick={kopyala}>HTML kopyala</button>
        <button className="btn sm" onClick={() => kaydet()} disabled={!degisti}>Kaydet</button>
      </div>
      {haber && <div className="muted">Haber: <a href={haber.link} target="_blank" rel="noreferrer">{haber.event || haber.title}</a></div>}
      {t.auto && <div className="muted">🤖 Bu taslağı Stüdyo en güçlü haberlerden otomatik hazırladı{t.author ? " ve ilgi alanına göre sana verdi" : ""}. Yayından önce doğrulama listesine bak.</div>}
      {(t.qc_state === "bekliyor" || t.qc_state === "calisiyor") && <div className="msg">Son kalite kontrolü sürüyor (rakamlar, adlar, tutarlılık kaynaklara karşı; ardından görsel ve panele gönderim). Bitince metin kendiliğinden güncellenir; bu arada değiştirirsen düzeltmeler metne uygulanmaz, notlara yazılır.</div>}
      {t.qc?.ana_sayfa && <div className="msg good">Ana sayfa adayı: önem {t.qc.onem?.toLocaleString("tr")}/10.</div>}
      {t.site_id && <div className="msg good">Panelde taslak haber olarak duruyor{t.site_gonderim ? " (" + zamanOnce(t.site_gonderim) + " önce gönderildi)" : ""}. {t.site_onizleme && <a href={t.site_onizleme} target="_blank" rel="noreferrer">Son taslağı aç ↗</a>}{t.site_admin && <> · <a href={t.site_admin} target="_blank" rel="noreferrer">Panelde aç ↗</a></>}</div>}
      {t.site_id && t.site_eksik?.eksikler?.length ? <div className="msg">Panelde tamamlanacaklar: {t.site_eksik.eksikler.join(" · ")}.</div> : null}
      {t.site_id && t.site_eksik?.duzeltmeler?.length ? <div className="muted">Panel yayın kuralı için düzeltti: {t.site_eksik.duzeltmeler.join(" ")}</div> : null}
      {t.site_hata && <div className="msg err">{t.site_hata}{/düzenlenmiş/.test(t.site_hata) && <> <button className="linkbtn" onClick={() => siteGonder(true)}>Üzerine yaz</button></>}</div>}
      <div className="panel">
        <label>Başlık (H1)<input type="text" value={d.title} onChange={(e) => alan("title", e.target.value)} /></label>
        <label>Spot<textarea className="alan" rows={2} value={d.spot} onChange={(e) => alan("spot", e.target.value)} /></label>
        <div className="segment" role="group">
          <button aria-pressed={gorunum === "duzen"} onClick={() => setGorunum("duzen")}>Düzenle</button>
          <button aria-pressed={gorunum === "onizle"} onClick={() => setGorunum("onizle")}>Önizle</button>
        </div>
        {gorunum === "duzen"
          ? <textarea className="alan" rows={22} value={d.body} onChange={(e) => alan("body", e.target.value)} aria-label="Haber metni" />
          // Önizleme kendi ürettiğimiz kaçışlı HTML'dir.
          : <div className="onizleme" dangerouslySetInnerHTML={{ __html: yaziHtml(d.spot, d.body) }} />}
        {d.body.includes("[EDİTÖR YORUMU") && <div className="msg err">Yayınlamadan önce "Editör yorumu" alanını doldur.</div>}
      </div>
      <div className="panel">
        <h3>SEO</h3>
        <div className="grid">
          <label>Odak kelime<input type="text" value={d.seo.focus ?? ""} onChange={(e) => seo("focus", e.target.value)} /></label>
          <label>Title ({(d.seo.title_tag ?? "").length}/60)<input type="text" value={d.seo.title_tag ?? ""} onChange={(e) => seo("title_tag", e.target.value)} /></label>
          <label>Slug<input type="text" value={d.seo.slug ?? ""} onChange={(e) => seo("slug", e.target.value)} /></label>
          <label>Kategori<input type="text" value={d.seo.kategori ?? ""} onChange={(e) => seo("kategori", e.target.value)} /></label>
        </div>
        <label>Meta açıklama ({(d.seo.meta ?? "").length}/155)<textarea className="alan" rows={2} value={d.seo.meta ?? ""} onChange={(e) => seo("meta", e.target.value)} /></label>
        <label>Etiketler (virgülle)<input type="text" value={(d.seo.etiketler ?? []).join(", ")} onChange={(e) => seo("etiketler", e.target.value)} /></label>
      </div>
      <div className="panel">
        <label>Kaynaklar<textarea className="alan" rows={3} value={d.sources} onChange={(e) => alan("sources", e.target.value)} /></label>
      </div>
      <Gorsel t={t} marka={haber?.brand ?? ""} />
      <div className="panel">
        <h3>Editör için (yayına girmez)</h3>
        {(t.questions ?? []).length > 0 && <><b>Senin katkın için sorular</b><div className="muted">Cevabını gövdede ilgili ara başlığın içine yerleştir.</div><ul>{t.questions.map((x, i) => <li key={i}>{metinYap(x)}</li>)}</ul></>}
        {(t.qc?.sorunlar ?? []).length > 0 && <><b>Kalite kontrolünün bulduğu</b><ul>{t.qc!.sorunlar!.map((x, i) => <li key={i}>{metinYap(x)}</li>)}</ul></>}
        {(t.checks ?? []).length > 0 && <><b>Yayından önce doğrula</b><ul>{t.checks.map((x, i) => <li key={i}>{metinYap(x)}</li>)}</ul></>}
        <label>Notlar (yapay zekânın emin olmadıkları)<textarea className="alan" rows={3} value={d.editor_note} onChange={(e) => alan("editor_note", e.target.value)} /></label>
      </div>
      <div className="row">
        <span className="muted" style={{ marginRight: "auto" }}>Durum: {DURUM[d.status]}{t.model ? " · " + t.model : ""}</span>
        {d.status !== "hazir" && <button className="btn ok sm" onClick={() => kaydet("hazir")}>Yayına hazır</button>}
        {d.status === "hazir" && <button className="btn ghost sm" onClick={() => kaydet("taslak")}>Taslağa geri al</button>}
        <button className="btn sm" onClick={() => siteGonder()} disabled={siteSuruyor}>{siteSuruyor ? "Gönderiliyor…" : t.site_id ? "Paneldeki taslağı güncelle" : "Panele gönder"}</button>
        <button className="btn ghost sm" onClick={sil}>{silOnay ? "Emin misin? Tekrar bas" : "Sil"}</button>
      </div>
    </>
  );
}
