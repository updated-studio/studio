import { useEffect, useState } from "react";
import { useAuth } from "../../shared/auth";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { useKisi, zamanOnce } from "./ortak";
import { useMasa, type Taslak } from "./veri";

// Markdown → HTML ortak dosyada: WordPress'e giden metin ile "HTML kopyala" aynı olsun.
import { yaziHtml } from "../../../supabase/functions/triyaj-taslak/html.ts";

/** Eski taslak dokümanının "GÖRSEL" bölümü: öneri, alt text, basın kiti, stok önerileri, yapay zekâ istemi */
function Gorsel({ t, marka }: { t: Taslak; marka: string }) {
  const g = t.image ?? {};
  const stok = g.stok ?? [];
  if (!g.oneri && !t.image_note && !g.basin && !stok.length && !g.ai_istem && !g.secilen && !g.gorsel_neden) return null;
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
            <div className="muted">{g.wp_media_id ? "WordPress'e yüklendi; altyazıda kaynak ve lisans yazıyor. Değiştirmek istersen WordPress'te öne çıkan görseli değiştir." : "WordPress'e gönderilince öne çıkan görsel olarak eklenecek."}</div>
            {g.yukleme_hata && <div className="msg err">{g.yukleme_hata}</div>}
          </div>
        </div>
      ) : g.gorsel_neden ? <div className="muted">Öne çıkan görsel eklenmedi: {g.gorsel_neden}</div> : null}
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
            {x.wp_error && <span className="pill rose" title={x.wp_error}>WordPress hatası</span>}
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
      toast("Kopyalandı. WordPress düzenleyicisine yapıştırabilirsin.");
    } catch { toast("Kopyalanamadı; tarayıcı izin vermedi."); }
  }

  // WordPress'e taslak olarak gönder (yayına basma kararı WordPress'te editörde). Kaydedilmemiş değişiklik varsa önce kaydedilir.
  const [wpSuruyor, setWpSuruyor] = useState(false);
  async function wordpressGonder(zorla = false) {
    if (degisti) await kaydet();
    setWpSuruyor(true);
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { wp: true, draft_id: t.id, zorla } });
    setWpSuruyor(false);
    if (error) {
      let m = error.message;
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.hata) m = j.hata; } catch { /* yok */ }
      return toast(m);
    }
    setD({ ...d, status: "gonderildi" });
    toast(`WordPress'e taslak olarak gitti${data?.kategori ? " (" + data.kategori + ")" : ""}. Yayına WordPress'te sen basarsın.`);
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
      {t.wp_link && <div className="msg good">WordPress'te taslak olarak duruyor{t.wp_sent_at ? " (" + zamanOnce(t.wp_sent_at) + " önce gönderildi)" : ""}. <a href={t.wp_link} target="_blank" rel="noreferrer">WordPress'te aç ↗</a></div>}
      {t.wp_error && <div className="msg err">{t.wp_error}{/düzenlenmiş/.test(t.wp_error) && <> <button className="linkbtn" onClick={() => wordpressGonder(true)}>Üzerine yaz</button></>}</div>}
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
        {(t.questions ?? []).length > 0 && <><b>Senin katkın için sorular</b><div className="muted">Cevabını gövdede ilgili ara başlığın içine yerleştir.</div><ul>{t.questions.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
        {(t.checks ?? []).length > 0 && <><b>Yayından önce doğrula</b><ul>{t.checks.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
        <label>Notlar (yapay zekânın emin olmadıkları)<textarea className="alan" rows={3} value={d.editor_note} onChange={(e) => alan("editor_note", e.target.value)} /></label>
      </div>
      <div className="row">
        <span className="muted" style={{ marginRight: "auto" }}>Durum: {DURUM[d.status]}{t.model ? " · " + t.model : ""}</span>
        {d.status !== "hazir" && <button className="btn ok sm" onClick={() => kaydet("hazir")}>Yayına hazır</button>}
        {d.status === "hazir" && <button className="btn ghost sm" onClick={() => kaydet("taslak")}>Taslağa geri al</button>}
        <button className="btn sm" onClick={() => wordpressGonder()} disabled={wpSuruyor}>{wpSuruyor ? "Gönderiliyor…" : t.wp_post_id ? "WordPress'i güncelle" : "WordPress'e gönder"}</button>
        <button className="btn ghost sm" onClick={sil}>{silOnay ? "Emin misin? Tekrar bas" : "Sil"}</button>
      </div>
    </>
  );
}
