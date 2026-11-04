import { useEffect, useState } from "react";
import { useAuth } from "../../shared/auth";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { Seviye, useKisi, zamanOnce } from "./ortak";
import { degerlendir } from "./oncelik";
import Bilgi from "../../shared/Bilgi";
import { useCanli, useCanliNesne } from "../../shared/canli";
import { AcikTutan } from "../../shared/CanliKisiler";
import { useMasa, type Taslak } from "./veri";

// Markdown → HTML ortak dosyada: ekrandaki önizleme ve "HTML kopyala" aynı çıktıyı kullanır (panele Markdown gider).
import { yaziHtml } from "../../../supabase/functions/triyaj-taslak/html.ts";
import { MODEL_AD } from "./gorselModel";

/** Yapay zekâ bazen liste öğesini metin yerine nesne döndürür ({iddia, kaynak} gibi): ekran çökmesin diye metne çevrilir */
const metinYap = (x: unknown): string => typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x as Record<string, unknown>).map((v) => metinYap(v)).filter(Boolean).join(" — ") : String(x ?? "");

/** Eski taslak dokümanının "GÖRSEL" bölümü: öneri, alt text, basın kiti, stok önerileri, yapay zekâ istemi */
function Gorsel({ t, marka }: { t: Taslak; marka: string }) {
  const toast = useToast();
  const g = t.image ?? {};
  // Yapay zekâ ile görsel (3 Kasım 2026): sunucu üretir (Cloudflare), Claude denetler (başka marka tasarımı, yazı, bozuk nesne reddedilir)
  const [uretiliyor, setUretiliyor] = useState(false);
  async function uret() {
    setUretiliyor(true);
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { gorsel_uret: t.id } });
    setUretiliyor(false);
    const hata = (data as { hata?: string } | null)?.hata;
    toast(hata ?? (error ? "Görsel üretilemedi: " + error.message : "Görsel üretildi ve denetlendi."));
  }
  const [seciliyor, setSeciliyor] = useState("");
  async function adaySec(model: string) {
    setSeciliyor(model);
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { gorsel_sec: t.id, model } });
    setSeciliyor("");
    const r = data as { hata?: string; site?: { ok: boolean; hata?: string } } | null;
    toast(r?.hata ?? (error ? error.message : r?.site && !r.site.ok ? "Kapak değişti; panele aktarılamadı: " + r.site.hata : "Kapak değişti."));
  }
  // Görseli beğenmeyen editör için (4 Kasım 2026): fotoğrafları yeniden tara, ücretsiz modellerle yeniden üret; ücretli modeller (GPT Image,
  // Nano Banana) yalnız yöneticide ve onaylı. Adaylar aşağıda yan yana, "Bunu kullan" ile kapak olur.
  const { profile } = useAuth();
  const [is_, setIs] = useState("");
  const [ucretliOnay, setUcretliOnay] = useState(false);
  async function cagir(ad: string, govde: Record<string, unknown>, basari: (r: Record<string, unknown>) => string) {
    setIs(ad);
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: govde });
    setIs(""); setUcretliOnay(false);
    const r = (data ?? {}) as Record<string, unknown>;
    toast((r.hata as string) ?? (error ? error.message : basari(r)));
  }
  // Haber içi resmî görseller (4 Kasım 2026): sistem ara başlıkların altına koyar; editör kaldırabilir
  async function araKaldir(i: number) {
    const ara = (g.ara ?? []).filter((_, j) => j !== i);
    const r = await sb.from("tr_drafts").update({ image: { ...g, ara } }).eq("id", t.id);
    if (r.error) return toast(r.error.message);
    if (t.site_id) await sb.functions.invoke("triyaj-taslak", { body: { site: true, draft_id: t.id, zorla: true } });
    toast(t.site_id ? "Görsel yazıdan çıkarıldı; paneldeki taslak güncellendi." : "Görsel yazıdan çıkarıldı.");
  }
  const araSatir = (g.ara?.length || g.ara_neden) ? <>
    <b>Yazı içi resmî görseller</b>
    {g.ara?.length ? <div className="yz-adaylar">
      {g.ara.map((a, i) => (
        <figure key={a.gorsel.buyuk}>
          <img src={a.gorsel.thumb || a.gorsel.buyuk} alt={a.alt} loading="lazy" />
          <figcaption><b>"{a.bolum}"</b> bölümünün altına · {a.gorsel.yazar}</figcaption>
          <button className="btn ghost sm" onClick={() => araKaldir(i)}>Kaldır</button>
        </figure>
      ))}
    </div> : <div className="muted">Eklenmedi: {g.ara_neden}</div>}
  </> : null;
  const fotolar = g.gorsel_adaylar ?? [];
  const adaylar = g.yz_adaylar ?? [];
  const islemler = <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
    <button className="btn ghost sm" disabled={!!is_} onClick={() => cagir("tara", { gorsel_tara: t.id }, (r) => `Tarandı: ${r.aday ?? 0} fotoğraf adayı.`)}>{is_ === "tara" ? "Taranıyor…" : "Fotoğrafları yeniden tara"}</button>
    <button className="btn ghost sm" disabled={!!is_} onClick={() => cagir("uret", { gorsel_uret: t.id, yeniden: true }, (r) => `Üretildi: ${r.toplam ?? 0} görselden ${r.gecen ?? 0}'i denetimden geçti.`)}>{is_ === "uret" ? "Üretiliyor…" : "Yapay zekâ ile yeniden üret (ücretsiz)"}</button>
    {profile?.is_admin && (ucretliOnay
      ? <><span className="muted">GPT Image ve Nano Banana da çalışır; görsel başına yaklaşık 4 sent.</span><button className="btn sm" disabled={!!is_} onClick={() => cagir("ucretli", { gorsel_uret: t.id, yeniden: true, ucretli: true }, (r) => `Üretildi: ${r.toplam ?? 0} görselden ${r.gecen ?? 0}'i denetimden geçti.`)}>{is_ === "ucretli" ? "Üretiliyor…" : "Onayla, üret"}</button><button className="btn ghost sm" onClick={() => setUcretliOnay(false)}>Vazgeç</button></>
      : <button className="btn ghost sm" disabled={!!is_} onClick={() => setUcretliOnay(true)}>Tüm modellerle üret (ücretli)</button>)}
  </div>;
  const fotoSatir = fotolar.length > 0 && <>
    <b>Fotoğraf adayları</b>
    <div className="yz-adaylar">
      {fotolar.map((f, i) => {
        const secili = !!g.secilen && g.secilen.buyuk === f.buyuk;
        return (
          <figure key={f.buyuk + i} className={secili ? "secili" : ""}>
            <img src={f.thumb || f.buyuk} alt="" loading="lazy" />
            <figcaption><b>{f.kaynak}</b> · {f.yazar}</figcaption>
            {secili ? <span className="pill ok">Kapak</span> : <button className="btn ghost sm" disabled={!!is_} onClick={() => cagir("foto" + i, { foto_sec: t.id, sira: i }, () => "Kapak değişti.")}>{is_ === "foto" + i ? "Seçiliyor…" : "Bunu kullan"}</button>}
          </figure>
        );
      })}
    </div>
  </>;
  const yzSatir = <>
    {g.yz_bekliyor && !g.secilen && <div className="muted">Yapay zekâ ile görsel üretiliyor ve denetleniyor…</div>}
    {g.yz_uretim && g.secilen && <div className="muted">Bu görsel yapay zekâ destekli üretildi. Bulabilirsen daha iyi bir görsel kullan.</div>}
    {adaylar.length > 0 && <>
      <b>Yapay zekâ adayları (model kıyası)</b>
      <div className="yz-adaylar">
        {adaylar.map((a) => {
          const secili = g.yz_model === a.model && !!g.secilen && g.secilen.buyuk === a.url;
          return (
            <figure key={a.model} className={secili ? "secili" : ""} title={a.katmanlar ? Object.entries(a.katmanlar).map(([k, v]) => `${k}: ${v}`).join("\n") : undefined}>
              {a.url ? <img src={a.url} alt="" loading="lazy" /> : <div className="yz-bos">{a.hata ? "Üretilemedi" : "Denetimden geçmedi"}</div>}
              <figcaption><b>{MODEL_AD[a.model] ?? a.model}</b> · {a.hata ? a.hata : `${a.puan}/10`}{!a.hata && a.neden && <span className="muted"> · {a.neden}</span>}</figcaption>
              {a.url && !secili && <button className="btn ghost sm" disabled={!!seciliyor} onClick={() => adaySec(a.model)}>{seciliyor === a.model ? "Seçiliyor…" : "Bunu kullan"}</button>}
              {secili && <span className="pill ok">Kapak</span>}
            </figure>
          );
        })}
      </div>
    </>}
    {!g.secilen && !g.yz_bekliyor && <div><button className="btn ghost sm" onClick={uret} disabled={uretiliyor}>{uretiliyor ? "Üretiliyor, denetleniyor…" : "Yapay zekâ ile görsel üret"}</button></div>}
    {fotoSatir}
    {araSatir}
    {islemler}
  </>;
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
            <div className="muted">{t.site_id ? "Panelde haberin kapağı oldu; künyede kaynak ve lisans yazıyor. Değiştirmek istersen paneldeki kapak alanını değiştir." : "Panele gönderilince haberin kapağı olarak eklenecek."}</div>
            {g.yukleme_hata && <div className="msg err">{g.yukleme_hata}</div>}
          </div>
        </div>
      ) : g.gorsel_neden ? <div className="muted">Öne çıkan görsel eklenmedi: {g.gorsel_neden}</div> : null}
      {yzSatir}
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

type TaslakSuzgec = { kim: "benim" | "hepsi" | "oto"; sira: "yeni" | "guncel" | "onem" | "haber"; durum: "hepsi" | "taslak" | "hazir" | "panelde" | "eksik"; model: "hepsi" | "claude" | "gemini"; gorsel: "hepsi" | "var" | "yz" | "yok"; tarih: "hepsi" | "bugun" | "hafta"; anaSayfa: boolean; ara: string };
const SUZGEC_VARSAYILAN: TaslakSuzgec = { kim: "benim", sira: "yeni", durum: "hepsi", model: "hepsi", gorsel: "hepsi", tarih: "hepsi", anaSayfa: false, ara: "" };
const SUZGEC_ANAHTARI = "haber-masasi:taslak-suzgec";
const suzgecOku = (): TaslakSuzgec => { try { return { ...SUZGEC_VARSAYILAN, ...JSON.parse(localStorage.getItem(SUZGEC_ANAHTARI) || "{}") }; } catch { return SUZGEC_VARSAYILAN; } };

const DURUM: Record<Taslak["status"], string> = { taslak: "Taslak", hazir: "Yayına hazır", gonderildi: "Siteye gönderildi" };

export default function Taslaklar({ acik, setAcik }: { acik: number | null; setAcik: (id: number | null) => void }) {
  const { v } = useMasa();
  const kisi = useKisi();
  const { profile } = useAuth();
  const [f, setF] = useState<TaslakSuzgec>(suzgecOku);
  const [suzgecAcik, setSuzgecAcik] = useState(false);
  const canli = useCanli();
  const t = acik ? v.taslaklar.find((x) => x.id === acik) : undefined;
  useEffect(() => { try { localStorage.setItem(SUZGEC_ANAHTARI, JSON.stringify(f)); } catch { /* depolama kapalı */ } }, [f]);
  if (t) return <Duzenleyici key={t.id} t={t} kapat={() => setAcik(null)} />;

  // Sıralama ve süzgeç (3 Kasım 2026, kullanıcı: "son hazırlattığım en üste gelmiyor; detaylı filtreleme ve sıralama"); seçim tarayıcıda hatırlanır
  const haberOf = new Map(v.haberler.map((h) => [h.id, h]));
  const onemOf = (x: Taslak) => { const h = haberOf.get(x.item_id ?? -1); return h ? degerlendir(h).puan : -1; };
  const haberSaati = (x: Taslak) => { const h = haberOf.get(x.item_id ?? -1); return h ? Date.parse(h.published_at ?? h.created_at) : 0; };
  const kucuk = f.ara.trim().toLocaleLowerCase("tr");
  const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
  const liste = v.taslaklar.filter((x) =>
    (f.kim === "hepsi" || (f.kim === "benim" ? x.author === profile!.id : x.auto))
    && (f.durum === "hepsi" || (f.durum === "panelde" ? !!x.site_id : f.durum === "eksik" ? !!x.site_eksik?.eksikler?.length || !!x.site_hata : x.status === f.durum))
    && (f.model === "hepsi" || (f.model === "claude" ? /claude/.test(x.model ?? "") : !/claude/.test(x.model ?? "")))
    && (f.gorsel === "hepsi" || (f.gorsel === "yok" ? !x.image?.secilen : f.gorsel === "yz" ? !!x.image?.yz_uretim && !!x.image?.secilen : !!x.image?.secilen && !x.image?.yz_uretim))
    && (!f.anaSayfa || !!x.qc?.ana_sayfa)
    && (f.tarih === "hepsi" || Date.parse(x.created_at) >= (f.tarih === "bugun" ? +bugun : Date.now() - 7 * 864e5))
    && (!kucuk || (x.title ?? "").toLocaleLowerCase("tr").includes(kucuk)))
    .sort((a, b) => f.sira === "guncel" ? Date.parse(b.updated_at) - Date.parse(a.updated_at)
      : f.sira === "onem" ? onemOf(b) - onemOf(a)
      : f.sira === "haber" ? haberSaati(b) - haberSaati(a)
      : Date.parse(b.created_at) - Date.parse(a.created_at));
  const sec = <K extends keyof TaslakSuzgec>(k: K, deger: TaslakSuzgec[K]) => setF((x) => ({ ...x, [k]: deger }));
  const suzgecSayisi = [f.durum !== "hepsi", f.model !== "hepsi", f.gorsel !== "hepsi", f.anaSayfa, f.tarih !== "hepsi"].filter(Boolean).length;
  const suzgecli = suzgecSayisi > 0 || !!kucuk;
  return (
    <>
      <div className="taslak-suzgec">
        <div className="segment" role="group" aria-label="Kimin taslakları">
          {([["benim", "Benim"], ["hepsi", "Hepsi"], ["oto", "Otomatik"]] as const).map(([k, ad]) => <button key={k} aria-pressed={f.kim === k} onClick={() => sec("kim", k)}>{ad}</button>)}
        </div>
        <input type="search" placeholder="Başlıkta ara" aria-label="Başlıkta ara" value={f.ara} onChange={(e) => sec("ara", e.target.value)} />
        <label>Sırala<select value={f.sira} onChange={(e) => sec("sira", e.target.value as TaslakSuzgec["sira"])}>
          <option value="yeni">En yeni hazırlanan</option><option value="guncel">Son güncellenen</option><option value="onem">Önem (şu an)</option><option value="haber">Haberin saati</option>
        </select></label>
        <button type="button" className={"btn ghost sm" + (suzgecli ? " secili" : "")} aria-expanded={suzgecAcik} onClick={() => setSuzgecAcik((x) => !x)}>Süzgeç{suzgecSayisi ? ` (${suzgecSayisi})` : ""}</button>
        <span className="muted">{liste.length} taslak{suzgecli && <> · <button className="linkbtn" onClick={() => setF({ ...SUZGEC_VARSAYILAN, kim: f.kim, sira: f.sira })}>süzgeci temizle</button></>}</span>
      </div>
      {suzgecAcik && <div className="taslak-suzgec taslak-suzgec-ek">
        <label>Durum<select value={f.durum} onChange={(e) => sec("durum", e.target.value as TaslakSuzgec["durum"])}>
          <option value="hepsi">Hepsi</option><option value="taslak">Taslak</option><option value="hazir">Yayına hazır</option><option value="panelde">Panelde</option><option value="eksik">Eksiği ya da hatası var</option>
        </select></label>
        <label>Yazan<select value={f.model} onChange={(e) => sec("model", e.target.value as TaslakSuzgec["model"])}>
          <option value="hepsi">Hepsi</option><option value="claude">Claude</option><option value="gemini">Gemini / diğer</option>
        </select></label>
        <label>Görsel<select value={f.gorsel} onChange={(e) => sec("gorsel", e.target.value as TaslakSuzgec["gorsel"])}>
          <option value="hepsi">Hepsi</option><option value="var">Fotoğraf var</option><option value="yz">Yapay zekâ görseli</option><option value="yok">Görsel yok</option>
        </select></label>
        <label>Tarih<select value={f.tarih} onChange={(e) => sec("tarih", e.target.value as TaslakSuzgec["tarih"])}>
          <option value="hepsi">Hepsi</option><option value="bugun">Bugün</option><option value="hafta">Son 7 gün</option>
        </select></label>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={f.anaSayfa} onChange={(e) => sec("anaSayfa", e.target.checked)} /> Ana sayfa adayı</label>
      </div>}
      {!liste.length && <div className="empty">Taslak yok. Benim aldıklarım bölümünde "Taslak hazırla"ya bas.</div>}
      <div className="liste panel">
        {liste.map((x) => (
          <button key={x.id} className="satir linkbtn" style={{ color: "inherit", width: "100%" }} onClick={() => setAcik(x.id)}>
            <div className="ana"><b>{x.title || "(başlıksız)"}</b><div className="muted">{kisi(x.author)?.name ?? "?"} · {zamanOnce(x.updated_at)} önce</div></div>
            <AcikTutan kisiler={canli.kisiler.filter((k) => k.id !== canli.ben && k.nesne?.tur === "taslak" && k.nesne.id === x.id)} />
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
  useCanliNesne({ tur: "taslak", id: t.id, baslik: t.title, eylem: "düzenliyor" });

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
      <OnemSatiri t={t} haber={haber} />
      <Karsilastirma t={t} />
      <VideoAdaylari t={t} d={d} />
      {d.seo?.video?.url && <div className="panel">
        <h3 style={{ margin: 0 }}>Resmî video</h3>
        <div><a href={d.seo.video.url} target="_blank" rel="noreferrer">{d.seo.video.baslik || d.seo.video.url}</a> <span className="muted">· {d.seo.video.kanal}{d.seo.video.resmiSayfa ? " · resmî sayfa var" : ""}</span></div>
        <div className="muted">Sitede {d.seo.video.spotAltinda ? "metnin en başında (haber videonun kendisiyle ilgili)" : "ilk paragraftan sonra (önerilen yer)"} oynar. {t.site_id ? "Panele gitti; değiştirmek için paneldeki \"Gömülü video\" alanı." : "Panele gönderilince habere eklenir."}</div>
        {!t.site_id && <button className="btn ghost sm" onClick={() => alan("seo", { ...d.seo, video: null })}>Videoyu kaldır</button>}
      </div>}
      {t.qc?.ana_sayfa && <div className="msg good">Ana sayfa adayı: önem {t.qc.onem?.toLocaleString("tr")}/10.</div>}
      {t.site_id && <div className="msg good">Panelde taslak haber olarak duruyor{t.site_gonderim ? " (" + zamanOnce(t.site_gonderim) + " önce gönderildi)" : ""}. {t.site_onizleme && <a href={t.site_onizleme} target="_blank" rel="noreferrer">Son taslağı aç ↗</a>}{t.site_admin && <> · <a href={t.site_admin} target="_blank" rel="noreferrer">Panelde aç ↗</a></>}</div>}
      {!t.site_id && t.site_eksik?.kaldirildi && <div className="muted">Panelde {t.site_eksik.gun} gün kimse dokunmadığı için {zamanOnce(t.site_eksik.kaldirildi)} önce panelden kaldırıldı. Yeniden göndermek için "Panele gönder"e bas.</div>}
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
        <Duzeltmeler qc={t.qc} />
        {(t.qc?.sorunlar ?? []).length > 0 && <><b>Kalite kontrolünün çözemedikleri</b><ul>{t.qc!.sorunlar!.map((x, i) => <li key={i}>{metinYap(x)}</li>)}</ul></>}
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

// Kalite kontrolünün hangi turda neyi düzelttiği (2 Kasım 2026, kullanıcı: "nerelerin kaçıncı kontrolde düzeldiği belli olsun").
// Liste denetleyen modelin beyanı; "paragraf değişti" sayısı eski ve yeni metnin karşılaştırmasından (nesnel).
const DUZELTME_TUR: Record<string, string> = { rakam: "Rakam", ad: "Ad", iddia: "Dayanaksız bilgi", tutarsizlik: "Tutarsızlık", taraflilik: "Taraflılık", bicim: "Biçim", mantik: "Mantık", baslik: "Başlık", dil: "Dil" };
function Duzeltmeler({ qc }: { qc: Taslak["qc"] }) {
  const liste = qc?.duzeltmeler ?? [], degisen = qc?.degisen ?? {};
  const turlar = [1, 2].filter((n) => degisen[String(n)] !== undefined || liste.some((x) => x.kontrol === n));
  if (!turlar.length) return null;
  return (
    <>
      <b>Kalite kontrolünün düzelttikleri</b>
      {turlar.map((n) => {
        const l = liste.filter((x) => x.kontrol === n);
        return (
          <div key={n} className="dz-tur">
            <div className="muted">{n}. kontrol · {degisen[String(n)] ?? 0} paragraf değişti{l.length ? ` · ${l.length} düzeltme` : ""}</div>
            {l.length > 0 && <ul>{l.map((x, i) => <li key={i}><b>{DUZELTME_TUR[x.tur] ?? x.tur}:</b> {x.once && <del>{x.once}</del>}{x.once && " → "}{x.sonra || <i>metinden çıkarıldı</i>}{x.neden && <span className="muted"> ({x.neden})</span>}</li>)}</ul>}
          </div>
        );
      })}
    </>
  );
}

// Önem: şu an ve taslak anında (3 Kasım 2026, kullanıcı: "ikisi eşit görünsün, neden düşük olduğunu da bilsin, i balonu"). Haber Masası'ndaki
// puan o anki saate göre hesaplanır; taslaktaki kontrol anında sabitlenir. Fark tazelik payından gelir (puan.ts tazelik).
function OnemSatiri({ t, haber }: { t: Taslak; haber?: Parameters<typeof degerlendir>[0] }) {
  if (!haber) return null;
  const simdi = degerlendir(haber);
  const once = t.qc?.onem ?? null;
  const saat = Math.max(0, (Date.now() - Date.parse(haber.published_at ?? haber.created_at)) / 36e5);
  const fark = once != null ? Math.round((once - simdi.onem) * 10) / 10 : 0;
  return (
    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Seviye d={simdi} />
      <span className="muted">şu an{once != null && once !== simdi.onem ? ` · taslak hazırlanırken ${once.toLocaleString("tr")}` : ""}</span>
      <Bilgi baslik="Önem neden değişiyor?">
        Puanın bir kısmı tazelik payıdır: yeni haber +20 alır, bu pay 24 saatte düzgünce 0'a iner. Haber {Math.round(saat)} saat önce yayımlandı.
        {fark > 0 ? ` Taslak hazırlandığından bu yana önem ${fark.toLocaleString("tr")} düştü; bu yalnız zamandan, haberin kendisinden değil.` : ""}
        {" "}Gerekçe: {simdi.gerekce.join(", ")}.
      </Bilgi>
    </div>
  );
}

// Kör karşılaştırma (4 Kasım 2026, kullanıcı: "hazırlananların hepsi karşılaştırmalı olsun"): aynı haberi Claude ve Gemini yazdı, ikisi de
// kendi denetiminden geçti. Editör hangisinin kimden geldiğini bilmeden seçer; seçimden sonra açıklanır. Ana taslak Claude'unki.
function Karsilastirma({ t }: { t: Taslak }) {
  const toast = useToast();
  const [acik, setAcik] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  const ab = t.qc?.ab;
  if (!ab) return null;
  const claude = ab.secim === "gemini" && ab.claude ? ab.claude : { baslik: t.title, spot: t.spot, govde: t.body };
  const gemini = ab.gemini;
  const sira: ("claude" | "gemini")[] = t.id % 2 ? ["claude", "gemini"] : ["gemini", "claude"];
  const metin = (m: "claude" | "gemini") => (m === "claude" ? claude : gemini);
  async function sec(m: "claude" | "gemini") {
    setMesgul(true);
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { ab_sec: t.id, secim: m } });
    setMesgul(false);
    const r = data as { hata?: string; site?: { ok: boolean; hata?: string } | null } | null;
    toast(r?.hata ?? (error ? error.message : `Seçildi: Metin ${sira.indexOf(m) === 0 ? "A" : "B"} (${m === "claude" ? "Claude" : "Gemini"}).${r?.site && !r.site.ok ? " Panele aktarılamadı: " + r.site.hata : ""}`));
  }
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Karşılaştırma: Metin A · Metin B</h3>
        {ab.secim ? <span className="pill ok">Seçilen: {ab.secim === "claude" ? "Claude" : "Gemini"}{ab.secen ? ` · ${ab.secen}` : ""}</span> : <span className="pill off">Seçim bekliyor</span>}
      </div>
      <div className="muted">Aynı haberi iki yapay zekâ yazdı ve ikisi de denetlendi. Hangisinin hangi modelden geldiği seçene kadar gizli. Beğendiğini seç; seçtiğin metin taslak olur{t.site_id ? ", paneldeki taslak da güncellenir" : ""}.</div>
      <button type="button" className="btn ghost sm" onClick={() => setAcik((x) => !x)}>{acik ? "Metinleri gizle" : "Metinleri yan yana aç"}</button>
      {acik && <div className="ab-ikili">
        {sira.map((m, i) => (
          <div key={m} className={"ab-metin" + (ab.secim === m ? " secili" : "")}>
            <b>Metin {i ? "B" : "A"}{ab.secim ? ` · ${m === "claude" ? "Claude" : "Gemini"}` : ""}</b>
            <h4>{metin(m).baslik}</h4>
            <div className="onizleme" dangerouslySetInnerHTML={{ __html: yaziHtml(metin(m).spot, metin(m).govde) }} />
            {ab.secim !== m && <button className="btn sm" disabled={mesgul} onClick={() => sec(m)}>{mesgul ? "Seçiliyor…" : `Metin ${i ? "B" : "A"}'yı kullan`}</button>}
          </div>
        ))}
      </div>}
    </div>
  );
}

// Video adayları (4 Kasım 2026, kullanıcı: "emin değilse bile ihtimali olanların önizlemesini göstersin"): resmî olduğundan emin olunamayan
// videolar; editör izleyip uygun bulursa ekler. Panele gitmiş taslakta panelin "Gömülü video" alanı boşsa oraya da gider.
function VideoAdaylari({ t, d }: { t: Taslak; d: Taslak }) {
  const toast = useToast();
  const [mesgul, setMesgul] = useState("");
  const liste = d.seo?.video_adaylar ?? [];
  if (!liste.length) return null;
  async function ekle(v: (typeof liste)[number]) {
    setMesgul(v.url);
    const seo = { ...d.seo, video: { url: v.url, baslik: v.baslik, kanal: v.kanal, resmiSayfa: d.seo.video_resmi_sayfa ?? "", spotAltinda: false } };
    const r = await sb.from("tr_drafts").update({ seo }).eq("id", t.id);
    if (r.error) { setMesgul(""); return toast(r.error.message); }
    if (t.site_id) await sb.functions.invoke("triyaj-taslak", { body: { site: true, draft_id: t.id, zorla: true } });
    setMesgul("");
    toast(t.site_id ? "Video eklendi; paneldeki habere de gitti (orada video boşsa)." : "Video eklendi.");
  }
  return (
    <div className="panel">
      <h3 style={{ margin: 0 }}>Video adayları</h3>
      <div className="msg err">Dikkat: bu videoların resmî kanaldan olduğu doğrulanamadı. Haber sitesi, hayran ya da yeniden yükleme kanalı olabilir. Kanalı kontrol etmeden ekleme.</div>
      <div className="yz-adaylar">
        {liste.map((v) => (
          <figure key={v.url}>
            <a href={v.url} target="_blank" rel="noreferrer">{v.tur === "youtube" ? <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" /> : <div className="yz-bos">Vimeo</div>}</a>
            <figcaption><b>{v.baslik}</b> · {v.kanal}</figcaption>
            {d.seo?.video?.url === v.url ? <span className="pill ok">Eklendi</span> : <button className="btn ghost sm" disabled={!!mesgul} onClick={() => ekle(v)}>{mesgul === v.url ? "Ekleniyor…" : "Bunu ekle"}</button>}
          </figure>
        ))}
      </div>
    </div>
  );
}
