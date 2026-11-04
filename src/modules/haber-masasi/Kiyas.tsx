import { useEffect, useState } from "react";
import { MODEL_AD, MODEL_UCRET } from "./gorselModel";
import { sb } from "../../shared/supabase";
import { hataMetni, useToast } from "../../shared/toast";
import { useMasa } from "./veri";
import { zamanOnce } from "./ortak";
import { Alan, Anahtar, Sayi, type AyarYaz } from "./ayarParcalari";

// Yapay zekâ kıyası bileşenleri (4 Kasım 2026, kullanıcı: "kıyasla ilgili her şeyi bir yere toplayalım; kolay erişip gözlemleyip karar
// verelim; hangi haberler girdi, sonuçları ne, bölüm bölüm"). Sayfa: src/modules/sistem/YzKiyas.tsx (#/yz-kiyas). Her bölüm özet tablo +
// tek tek giren işler; onde() o bölümde şu an önde olanı sayfanın özetine bildirir.
export type Onde = (is: string, metin: string) => void;
// İki haftalık kıyas (4 Kasım 2026, kullanıcı onayı): 18 Kasım akşamı kendiliğinden durur; Ayarlar'dan değiştirilebilir
export const KIYAS_BITIS_VARSAYILAN = "2026-11-18T23:59:00+03:00";

// Görsel model kıyası (3 Kasım 2026, kullanıcı: "birkaç gün birden çok modele ürettirsin, hangisi daha iyi sonuç veriyor bakalım").
// Fotoğraf bulunamayan taslaklarda (günlük sınır kadarında) bütün bağlı modeller aynı anda üretir; tablo son 30 günü sayar.
export function KiyasAyari({ ayar }: { ayar: AyarYaz }) {
  const { v } = useMasa();
  const k = { acik: true, gunluk: 3, ...((v.ayarlar.gorsel_kiyas ?? {}) as { acik?: boolean; gunluk?: number }) };
  const [acik, setAcik] = useState(k.acik);
  const [gunluk, setGunluk] = useState(String(k.gunluk));
  return (
    <>
      <div className="ay-alanlar">
        <Alan ad="Kıyas" not="Ücretsiz modellerin yanında anahtarı girilmiş GPT Image ve Nano Banana da üretir (ücretli)."><Anahtar ad="Kıyas" acik={acik} degis={setAcik} /></Alan>
        <Alan ad="Günlük sınır" not="Bu sayının dışındaki taslaklarda yalnız seçili model üretir."><Sayi ad="Günlük sınır" deger={gunluk} degis={setGunluk} birim="taslak" /></Alan>
      </div>
      <div className="ay-kaydet"><button className="btn sm" onClick={() => ayar("gorsel_kiyas", { acik, gunluk: Math.max(1, Math.min(50, Number(gunluk) || 3)) }, "Kıyas ayarı kaydedildi.")}>Kaydet</button></div>
    </>
  );
}

type Aday = { model: string; url?: string; gecti: boolean; puan: number; hata?: string; sure: number };
type TaslakSatir = { id: number; title: string; created_at: string; image: Record<string, unknown> };
export function GorselTablo({ onde }: { onde?: Onde }) {
  const [satirlar, setSatirlar] = useState<TaslakSatir[] | null>(null);
  useEffect(() => {
    sb.from("tr_drafts").select("id,title,created_at,image").eq("deneme", false).order("created_at", { ascending: false }).not("image->yz_adaylar", "is", null).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(300)
      .then(({ data }) => setSatirlar((data ?? []) as TaslakSatir[]));
  }, []);
  const tablo = new Map<string, { uretildi: number; denendi: number; gecti: number; puan: number; otomatik: number; editor: number; sure: number }>();
  let payBitti = 0;
  for (const r of satirlar ?? []) {
    const img = (r.image ?? {}) as { yz_adaylar?: Aday[]; yz_model?: string; yz_secen?: string };
    for (const a of img.yz_adaylar ?? []) {
      const t = tablo.get(a.model) ?? { uretildi: 0, denendi: 0, gecti: 0, puan: 0, otomatik: 0, editor: 0, sure: 0 };
      if (a.hata && /4006|daily free allocation/i.test(a.hata)) payBitti++;
      t.denendi++; if (!a.hata) { t.uretildi++; t.puan += a.puan; t.sure += a.sure; } if (a.gecti) t.gecti++;
      if (img.yz_model === a.model) img.yz_secen === "editor" ? t.editor++ : t.otomatik++;
      tablo.set(a.model, t);
    }
  }
  const sirali = [...tablo.entries()].sort((a, b) => (b[1].editor + b[1].otomatik) - (a[1].editor + a[1].otomatik) || b[1].puan / Math.max(1, b[1].uretildi) - a[1].puan / Math.max(1, a[1].uretildi));
  // Önde: en az 3 görsel üretmiş modellerden ortalama denetim puanı en yüksek olan
  const lider = [...tablo.entries()].filter(([, t]) => t.uretildi >= 3).sort((a, b) => b[1].puan / b[1].uretildi - a[1].puan / a[1].uretildi)[0];
  useEffect(() => { if (satirlar) onde?.("gorsel", lider ? `${MODEL_AD[lider[0]] ?? lider[0]} (ort. ${(lider[1].puan / lider[1].uretildi).toLocaleString("tr", { maximumFractionDigits: 1 })}/10)` : "Yeterli veri yok"); }, [satirlar, lider?.[0]]); // eslint-disable-line react-hooks/exhaustive-deps
  const modelSirasi = [...tablo.keys()];
  if (!satirlar) return <p className="ay-not">Yükleniyor…</p>;
  if (!sirali.length) return <p className="ay-not">Henüz deneme yok; fotoğrafı bulunamayan ilk taslakta başlar.</p>;
  return (
    <>
      <div className="tbl"><table>
        <thead><tr><th>Model</th><th>Üretti</th><th>Denetimden geçti</th><th>Ort. puan</th><th>Kapak oldu</th><th>Ort. süre</th><th>Maliyet</th></tr></thead>
        <tbody>{sirali.map(([m, t]) => (
          <tr key={m}><td><b>{MODEL_AD[m] ?? m}</b></td><td>{t.uretildi}/{t.denendi}</td><td>{t.gecti}</td>
            <td>{t.uretildi ? (t.puan / t.uretildi).toLocaleString("tr", { maximumFractionDigits: 1 }) : "–"}</td>
            <td>{t.otomatik + t.editor}{t.editor ? <span className="muted"> ({t.editor} editör)</span> : null}</td>
            <td>{t.uretildi ? Math.round(t.sure / t.uretildi / 1000) + " sn" : "–"}</td><td>{(t.uretildi * (MODEL_UCRET[m] ?? 0)).toLocaleString("tr", { style: "currency", currency: "USD" })}</td></tr>
        ))}</tbody>
      </table></div>
      {payBitti > 0 && <p className="ay-not"><b>Cloudflare'in günlük ücretsiz payı {payBitti} denemede bitmişti</b>; bu denemeler "üretti" sayısına girmez. Pay her gün 03.00'te (Türkiye) yenilenir.</p>}
      <p className="ay-not">Puan 10 üzerinden, sekiz katmanlı denetimin verdiği. Cloudflare modelleri günlük ücretsiz payla çalışır; pay dolunca ücretli plan görsel başı ücret alır.</p>
      <details className="kiyas-ayrinti"><summary>Giren taslaklar ve sonuçları ({satirlar.length})</summary>
        <div className="tbl"><table>
          <thead><tr><th>Taslak</th>{modelSirasi.map((m) => <th key={m}>{MODEL_AD[m] ?? m}</th>)}</tr></thead>
          <tbody>{satirlar.slice(0, 40).map((r) => {
            const img = (r.image ?? {}) as { yz_adaylar?: Aday[]; yz_model?: string };
            return (
              <tr key={r.id}><td><b>{r.title || "başlıksız"}</b><div className="muted">{zamanOnce(r.created_at)} önce</div></td>
                {modelSirasi.map((m) => { const a = (img.yz_adaylar ?? []).find((x) => x.model === m); return (
                  <td key={m} title={a?.hata}>{!a ? <span className="muted">–</span> : a.hata ? <span className="pill off">{/4006|allocation/i.test(a.hata) ? "pay bitti" : "üretemedi"}</span>
                    : <span className={"pill " + (img.yz_model === m ? "ok" : a.gecti ? "blue" : "off")}>{a.puan}/10{img.yz_model === m ? " · kapak" : ""}</span>}</td>); })}
              </tr>);
          })}</tbody>
        </table></div>
      </details>
    </>
  );
}

// Yazı karşılaştırması (4 Kasım 2026): her taslakta Claude ve Gemini aynı haberi yazar; editörün kör seçimi ve denetimin düzeltme sayısı.
export function YaziKiyas({ onde }: { onde?: Onde }) {
  const [satirlar, setSatirlar] = useState<{ id: number; title: string; created_at: string; qc: Record<string, unknown> | null }[] | null>(null);
  useEffect(() => {
    sb.from("tr_drafts").select("id,title,created_at,qc").eq("deneme", false).order("created_at", { ascending: false }).not("qc->ab", "is", null).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(500)
      .then(({ data }) => setSatirlar((data ?? []) as { id: number; title: string; created_at: string; qc: Record<string, unknown> | null }[]));
  }, []);
  const s = { toplam: 0, claude: 0, gemini: 0, bekliyor: 0, cDuz: 0, gDuz: 0, cPar: 0, gPar: 0, n: 0 };
  for (const r of satirlar ?? []) {
    const q = r.qc as { ab?: { secim?: string; gemini?: { duzeltme?: number; degisen?: number } }; duzeltmeler?: { kontrol: number }[]; degisen?: Record<string, number> } | null;
    if (!q?.ab) continue;
    s.toplam++;
    if (q.ab.secim === "claude") s.claude++; else if (q.ab.secim === "gemini") s.gemini++; else s.bekliyor++;
    if (q.ab.gemini?.duzeltme != null) { s.n++; s.gDuz += q.ab.gemini.duzeltme; s.gPar += q.ab.gemini.degisen ?? 0; s.cDuz += (q.duzeltmeler ?? []).filter((x) => x.kontrol === 1).length; s.cPar += q.degisen?.["1"] ?? 0; }
  }
  const ort = (x: number) => (s.n ? (x / s.n).toLocaleString("tr", { maximumFractionDigits: 1 }) : "–");
  const secilen = s.claude + s.gemini;
  useEffect(() => { if (satirlar) onde?.("yazi", secilen >= 5 ? (s.claude >= s.gemini ? `Claude (editör %${Math.round((s.claude / secilen) * 100)} seçti)` : `Gemini (editör %${Math.round((s.gemini / secilen) * 100)} seçti)`) : `Yeterli veri yok (${secilen} seçim)`); }, [satirlar, secilen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!satirlar) return <p className="ay-not">Yükleniyor…</p>;
  if (!s.toplam) return <p className="ay-not">Henüz karşılaştırma yok; ilk taslakla başlar.</p>;
  return (
    <>
      <div className="tbl"><table>
        <thead><tr><th>Model</th><th>Editör seçti</th><th>Seçim oranı</th><th>Düzeltme (ort.)</th><th>Değişen paragraf (ort.)</th></tr></thead>
        <tbody>
          <tr><td><b>Claude</b></td><td>{s.claude}</td><td>{secilen ? Math.round((s.claude / secilen) * 100) + "%" : "–"}</td><td>{ort(s.cDuz)}</td><td>{ort(s.cPar)}</td></tr>
          <tr><td><b>Gemini</b></td><td>{s.gemini}</td><td>{secilen ? Math.round((s.gemini / secilen) * 100) + "%" : "–"}</td><td>{ort(s.gDuz)}</td><td>{ort(s.gPar)}</td></tr>
        </tbody>
      </table></div>
      <p className="ay-not">{s.toplam} karşılaştırma, {s.bekliyor} tanesi seçim bekliyor. Editör hangisinin kimden geldiğini bilmeden seçer; ana taslak Claude'unki. Düzeltmesi az olan, denetime daha temiz metin teslim etmiştir.</p>
      <details className="kiyas-ayrinti"><summary>Giren taslaklar ve sonuçları ({s.toplam})</summary>
        <div className="tbl"><table>
          <thead><tr><th>Taslak</th><th>Editörün seçimi</th><th>Claude düzeltme</th><th>Gemini düzeltme</th></tr></thead>
          <tbody>{satirlar.filter((r) => (r.qc as { ab?: unknown } | null)?.ab).slice(0, 40).map((r) => {
            const q = r.qc as { ab: { secim?: string; secen?: string; gemini?: { duzeltme?: number } }; duzeltmeler?: { kontrol: number }[] };
            return (
              <tr key={r.id}><td><b>{r.title || "başlıksız"}</b><div className="muted">{zamanOnce(r.created_at)} önce</div></td>
                <td>{q.ab.secim ? <span className="pill blue">{q.ab.secim === "claude" ? "Claude" : "Gemini"}{q.ab.secen ? ` · ${q.ab.secen}` : ""}</span> : <span className="muted">bekliyor</span>}</td>
                <td>{(q.duzeltmeler ?? []).filter((x) => x.kontrol === 1).length}</td><td>{q.ab.gemini?.duzeltme ?? "–"}</td></tr>);
          })}</tbody>
        </table></div>
      </details>
    </>
  );
}

// ---------- Yapay zekâ iş kıyasları (4 Kasım 2026, kullanıcı: "her yapay zekâyı en iyi olduğu işte kullanalım; yöneticiler 3 sonucu
// kıyaslasın"; göç 0065, public.yz_kiyas). Asıl işi Gemini yapar; Claude Haiku ve Sonnet aynı girdiyle gölgede çalışır. ----------
type KiyasSatir = { nesne: string; model: string; sonuc: Record<string, unknown>; karar: string | null; sure_ms: number | null; hata: string | null };
// Kıyas modelleri sunucuda triyaj-taslak/kiyas.ts KIYAS_MODELLERI; "gemini:…" asıl işi yapan ücretsiz Gemini
const KIYAS_AD: Record<string, string> = { "claude-haiku-5-5": "Claude Haiku 5.5", "claude-sonnet-5-5": "Claude Sonnet 5.5", "claude-opus-5-5": "Claude Opus 5.5", "gpt-6-luna": "GPT-6 Luna", "gpt-6.1-sol": "GPT-6.1 Sol", "gemini-4-argon": "Gemini 4 Argon", "gemini-3.8-flash": "Gemini 3.8 Flash (ücretsiz)" };
const MODEL_ADI = (m: string) => (m.startsWith("gemini:") ? `Gemini ${m.slice(7).replace(/^gemini-/, "")} (asıl, ücretsiz)` : KIYAS_AD[m] ?? m);
const yuzde = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "–");
function useKiyas(is: "eleme" | "kunye") {
  const [satirlar, setSatirlar] = useState<KiyasSatir[] | null>(null);
  useEffect(() => {
    sb.from("yz_kiyas").select("nesne,model,sonuc,karar,sure_ms,hata").eq("is_turu", is).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).order("id", { ascending: false }).limit(6000)
      .then(({ data }) => setSatirlar((data ?? []) as KiyasSatir[]));
  }, [is]);
  return satirlar;
}
const gruplaNesne = (l: KiyasSatir[]) => { const m = new Map<string, KiyasSatir[]>(); for (const s of l) m.set(s.nesne, [...(m.get(s.nesne) ?? []), s]); return m; };
const modeller = (l: KiyasSatir[]) => [...new Set(l.map((s) => s.model).filter((m) => m !== "editor"))].sort((a, b) => (a.startsWith("gemini:") ? -1 : b.startsWith("gemini:") ? 1 : a.localeCompare(b)));
const kisaAd = (m: string) => MODEL_ADI(m).replace(" (asıl, ücretsiz)", " (asıl)").replace("Claude ", "").replace(" (ücretsiz)", "");

export function ElemeKiyas({ onde }: { onde?: Onde }) {
  const satirlar = useKiyas("eleme");
  const [dogru, setDogru] = useState<Map<string, string> | null>(null);
  const [basliklar, setBasliklar] = useState<Map<string, string>>(new Map());
  const [hakemler, setHakemler] = useState<Map<string, string>>(new Map());
  const toast = useToast();
  // Editörün kararı (doğruluk ölçüsü): haberi aldıysa ya da yanlış eleme işaretiyle havuza aldıysa "havuza girmeliydi"; yanlış işaretiyle
  // havuzdan elediyse "elenmeliydi". Pas geçilen ve dokunulmayanlar ölçüye girmez.
  useEffect(() => {
    if (!satirlar) return;
    const linkler = [...new Set(satirlar.map((s) => s.nesne))];
    (async () => {
      const m = new Map<string, string>();
      for (let i = 0; i < linkler.length; i += 150) {
        const { data } = await sb.from("tr_items").select("link,title,event,status,wrong_by,taken_by").eq("deneme", false).in("link", linkler.slice(i, i + 150));
        for (const h of (data ?? []) as { link: string; title: string; event: string; status: string; wrong_by: string | null; taken_by: string | null }[]) {
          basliklar.set(h.link, h.event || h.title);
          if (h.wrong_by) m.set(h.link, h.status === "elendi" ? "elendi" : "aday");
          else if (h.taken_by && ["alindi", "yayinda"].includes(h.status)) m.set(h.link, "aday");
        }
      }
      // Yöneticinin hakem kararı editör kararının önüne geçer
      for (const s of satirlar) if (s.model === "editor" && s.karar) m.set(s.nesne, s.karar);
      setBasliklar(new Map(basliklar)); setDogru(m);
    })();
  }, [satirlar]); // eslint-disable-line react-hooks/exhaustive-deps
  async function hakem(link: string, karar: "aday" | "elendi") {
    const r = await sb.from("yz_kiyas").insert({ is_turu: "eleme", nesne: link, model: "editor", karar });
    if (r.error) return toast(hataMetni(r.error));
    setHakemler((x) => new Map(x).set(link, karar));
    setDogru((x) => new Map(x ?? []).set(link, karar));
  }
  const nesneler = gruplaNesne(satirlar ?? []);
  const havuz = (k: string | null) => k === "aday" || k === "belirsiz";
  const ms = modeller(satirlar ?? []);
  const gemAd = ms.find((m) => m.startsWith("gemini:")) ?? "";
  const ozet = ms.map((m) => {
    let n = 0, hata = 0, aday = 0, uyum = 0, uyumN = 0, alan = 0, alanN = 0, dN = 0, dOk = 0, sure = 0, sureN = 0;
    for (const [link, l] of nesneler) {
      const s = l.find((x) => x.model === m); if (!s) continue;
      n++; if (s.hata) { hata++; continue; }
      if (havuz(s.karar)) aday++;
      if (s.sure_ms) { sure += s.sure_ms; sureN++; }
      const g = l.find((x) => x.model === gemAd);
      if (g && !g.hata && m !== gemAd) {
        uyumN++; if (havuz(g.karar) === havuz(s.karar)) uyum++;
        for (const k of ["marka", "tur", "turkiye", "konu"]) { alanN++; if (String(g.sonuc[k] ?? "").toLocaleLowerCase("tr") === String(s.sonuc[k] ?? "").toLocaleLowerCase("tr")) alan++; }
      }
      const d = dogru?.get(link);
      if (d) { dN++; if ((d === "aday") === havuz(s.karar)) dOk++; }
    }
    return { m, n, hata, aday, uyum, uyumN, alan, alanN, dN, dOk, sure: sureN ? Math.round(sure / sureN / 1000) : 0 };
  });
  // Önde: doğrusu bilinen en az 20 haberde editörle/hakemle en çok uyan
  const lider = [...ozet].filter((o) => o.dN >= 20).sort((a, b) => b.dOk / b.dN - a.dOk / a.dN)[0];
  const olculen = Math.max(0, ...ozet.map((o) => o.dN));
  useEffect(() => { if (dogru) onde?.("eleme", lider ? `${MODEL_ADI(lider.m)} (%${Math.round((lider.dOk / lider.dN) * 100)} doğru)` : `Yeterli veri yok (${olculen}/20 haberin doğrusu belli)`); }, [dogru, lider?.m, olculen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!satirlar) return <p className="ay-not">Yükleniyor…</p>;
  if (!satirlar.length) return <p className="ay-not">Henüz kıyas yok; örneklenen ilk toplamada (15 dakikada bir) başlar.</p>;
  const sonHaberler = [...nesneler].slice(0, 40);
  // Modellerin anlaşamadığı, henüz doğrusu bilinmeyen haberler: yönetici hakem olur (birkaç dakikada en değerli ölçü)
  const anlasmazlik = [...nesneler].filter(([link, l]) => {
    if (dogru?.has(link) || hakemler.has(link)) return false;
    const k = l.filter((x) => x.model !== "editor" && !x.hata).map((x) => havuz(x.karar));
    return k.length >= 3 && k.some(Boolean) && k.some((x) => !x);
  }).slice(0, 15);
  return (
    <>
      <div className="tbl"><table>
        <thead><tr><th>Model</th><th>Haber</th><th>Havuza aldı</th><th>Gemini ile aynı karar</th><th>Etiket uyumu</th><th>Editörle uyum</th><th>Ort. süre</th></tr></thead>
        <tbody>{ozet.map((o) => (
          <tr key={o.m}><td><b>{MODEL_ADI(o.m)}</b>{o.hata ? <span className="muted"> ({o.hata} hata)</span> : null}</td><td>{o.n}</td><td>{yuzde(o.aday, o.n - o.hata)}</td>
            <td>{o.m === gemAd ? "–" : yuzde(o.uyum, o.uyumN)}</td><td>{o.m === gemAd ? "–" : yuzde(o.alan, o.alanN)}</td>
            <td>{dogru ? <>{yuzde(o.dOk, o.dN)} <span className="muted">({o.dN})</span></> : "…"}</td><td>{o.sure ? o.sure + " sn" : "–"}</td></tr>
        ))}</tbody>
      </table></div>
      <p className="ay-not">Son 30 gün. "Editörle uyum": editörün aldığı, "yanlış eleme" diye düzelttiği ya da aşağıda hakem olarak işaretlediğin haberlerde modelin kararı doğruyla aynı mı (parantezde ölçülen haber). Asıl kararı ücretsiz Gemini veriyor; diğerlerinin sonuçları yalnız burada.</p>
      <details className="kiyas-ayrinti"><summary>Giren haberler ve kararları ({nesneler.size})</summary>
        <div className="tbl"><table>
          <thead><tr><th>Haber</th>{ms.map((m) => <th key={m}>{kisaAd(m)}</th>)}<th>Doğrusu</th></tr></thead>
          <tbody>{sonHaberler.map(([link, l]) => {
            const d = dogru?.get(link);
            return (
              <tr key={link}><td><a href={link} target="_blank" rel="noreferrer">{(basliklar.get(link) || link.replace(/^https?:\/\/(www\.)?/, "")).slice(0, 90)}</a></td>
                {ms.map((m) => { const s = l.find((x) => x.model === m); return (
                  <td key={m} title={s?.hata ?? String(s?.sonuc?.neden ?? "")}>{!s ? <span className="muted">–</span> : s.hata ? <span className="pill off">hata</span>
                    : <span className={"pill " + (havuz(s.karar) ? "blue" : "off")}>{havuz(s.karar) ? "havuz" : s.karar === "rehber" ? "rehber" : "elen"}</span>}</td>); })}
                <td>{d ? <span className="pill ok">{d === "aday" ? "havuz" : "elen"}</span> : <span className="muted">?</span>}</td>
              </tr>);
          })}</tbody>
        </table></div>
      </details>
      {anlasmazlik.length > 0 && <div className="ay-blok">
        <b>Hakem ol: modellerin anlaşamadığı haberler</b>
        <p className="ay-not">Her biri için doğrusunu seç; editörler henüz denetlemediği için en değerli ölçü bu. Kimin ne dediğini görmeden karar ver.</p>
        <div className="ay-alanlar">
          {anlasmazlik.map(([link]) => (
            <Alan key={link} ad={basliklar.get(link) || link.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80)} not={<a href={link} target="_blank" rel="noreferrer">Haberi aç ↗</a>}>
              <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                <button className="btn ghost sm" onClick={() => hakem(link, "aday")}>Havuza girmeli</button>
                <button className="btn ghost sm" onClick={() => hakem(link, "elendi")}>Elenmeli</button>
              </span>
            </Alan>
          ))}
        </div>
      </div>}
    </>
  );
}

type Oz = { key: string; value: string; dogru?: boolean };
const deger = (v: string) => v.toLocaleLowerCase("tr").replace(/\s+/g, "").replace(",", ".");
/** Modellerin farklı değer verdiği özellikler (açılır): hangisi ne demiş */
function KunyeFark({ l, ms }: { l: KiyasSatir[]; ms: string[] }) {
  const anahtarlar = new Map<string, Map<string, string>>();
  for (const s of l) for (const x of (s.sonuc?.ozellikler ?? []) as Oz[]) { const m = anahtarlar.get(x.key) ?? new Map(); m.set(s.model, x.value); anahtarlar.set(x.key, m); }
  const farkli = [...anahtarlar].filter(([, m]) => new Set([...m.values()].map(deger)).size > 1);
  if (!farkli.length) return null;
  return (
    <details><summary className="muted">{farkli.length} özellikte farklı değer</summary>
      <ul className="kiyas-fark">{farkli.map(([k, m]) => <li key={k}><b>{k}:</b> {ms.filter((x) => m.has(x)).map((x) => `${kisaAd(x)}: ${m.get(x)}`).join(" · ")}</li>)}</ul>
    </details>
  );
}

export function KunyeKiyas({ onde }: { onde?: Onde }) {
  const satirlar = useKiyas("kunye");
  const [urunler, setUrunler] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!satirlar?.length) return;
    const idler = [...new Set(satirlar.map((s) => Number(s.nesne)).filter(Boolean))].slice(0, 300);
    sb.from("kunye_oneriler").select("id,urun_adi").in("id", idler).then(({ data }) => setUrunler(new Map(((data ?? []) as { id: number; urun_adi: string }[]).map((x) => [String(x.id), x.urun_adi]))));
  }, [satirlar]);
  const nesneler = gruplaNesne(satirlar ?? []);
  const ms = modeller(satirlar ?? []);
  const gemAd = ms.find((m) => m.startsWith("gemini:")) ?? "";

  const ozet = ms.map((m) => {
    let n = 0, hata = 0, bulunan = 0, dogrulanan = 0, ayni = 0, ortak = 0, sure = 0, sureN = 0;
    for (const [, l] of nesneler) {
      const s = l.find((x) => x.model === m); if (!s) continue;
      n++; if (s.hata) { hata++; continue; }
      const oz = (s.sonuc.ozellikler ?? []) as Oz[];
      bulunan += oz.length; dogrulanan += oz.filter((x) => x.dogru).length;
      if (s.sure_ms) { sure += s.sure_ms; sureN++; }
      const g = l.find((x) => x.model === gemAd);
      if (g && !g.hata && m !== gemAd) {
        const gm = new Map(((g.sonuc.ozellikler ?? []) as Oz[]).map((x) => [x.key, deger(x.value)]));
        for (const x of oz) if (gm.has(x.key)) { ortak++; if (gm.get(x.key) === deger(x.value)) ayni++; }
      }
    }
    const basarili = n - hata;
    return { m, n, hata, ort: basarili ? (bulunan / basarili).toLocaleString("tr", { maximumFractionDigits: 1 }) : "–", dogrulanan, bulunan, ayni, ortak, sure: sureN ? Math.round(sure / sureN / 1000) : 0 };
  });
  // Önde: en az 5 üründe, alıntısı sayfada geçen oranı en yüksek (eşitse daha çok özellik bulan)
  const lider = [...ozet].filter((o) => o.n - o.hata >= 5 && o.bulunan).sort((a, b) => b.dogrulanan / b.bulunan - a.dogrulanan / a.bulunan || b.bulunan - a.bulunan)[0];
  useEffect(() => { if (satirlar) onde?.("kunye", lider ? `${MODEL_ADI(lider.m)} (%${Math.round((lider.dogrulanan / lider.bulunan) * 100)} kanıtlı)` : `Yeterli veri yok (${nesneler.size}/5 ürün)`); }, [satirlar, lider?.m, nesneler.size]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!satirlar) return <p className="ay-not">Yükleniyor…</p>;
  if (!satirlar.length) return <p className="ay-not">Henüz kıyas yok; künye otomasyonunun örneklenen ilk ürününde başlar.</p>;
  return (
    <>
      <div className="tbl"><table>
        <thead><tr><th>Model</th><th>Ürün</th><th>Ürün başına özellik</th><th>Alıntısı sayfada geçen</th><th>Gemini ile aynı değer</th><th>Ort. süre</th></tr></thead>
        <tbody>{ozet.map((o) => (
          <tr key={o.m}><td><b>{MODEL_ADI(o.m)}</b>{o.hata ? <span className="muted"> ({o.hata} hata)</span> : null}</td><td>{o.n}</td><td>{o.ort}</td>
            <td>{yuzde(o.dogrulanan, o.bulunan)}</td><td>{o.m === gemAd ? "–" : yuzde(o.ayni, o.ortak)}</td><td>{o.sure ? o.sure + " sn" : "–"}</td></tr>
        ))}</tbody>
      </table></div>
      <p className="ay-not">Son 30 gün. "Alıntısı sayfada geçen": modelin kanıt diye gösterdiği cümle kaynak sayfada birebir var mı (uydurma ölçüsü). Asıl öneriyi ücretsiz Gemini veriyor; diğerlerinin sonuçları yalnız burada.</p>
      <details className="kiyas-ayrinti"><summary>Giren ürünler ve sonuçları ({nesneler.size})</summary>
        <div className="tbl"><table>
          <thead><tr><th>Ürün</th>{ms.map((m) => <th key={m}>{kisaAd(m)}</th>)}</tr></thead>
          <tbody>{[...nesneler].slice(0, 40).map(([id, l]) => (
            <tr key={id}><td><b>{urunler.get(id) ?? "#" + id}</b>
              <KunyeFark l={l} ms={ms} /></td>
              {ms.map((m) => { const s = l.find((x) => x.model === m); const oz = (s?.sonuc?.ozellikler ?? []) as Oz[]; return (
                <td key={m} title={s?.hata ?? undefined}>{!s ? <span className="muted">–</span> : s.hata ? <span className="pill off">hata</span> : <>{oz.length} <span className="muted">· {oz.filter((x) => x.dogru).length} kanıtlı</span></>}</td>); })}
            </tr>))}</tbody>
        </table></div>
      </details>
    </>
  );
}

export function KiyasOrani({ ayar }: { ayar: AyarYaz }) {
  const { v } = useMasa();
  const k = { eleme_oran: 10, kunye_oran: 20, bitis: KIYAS_BITIS_VARSAYILAN, ...((v.ayarlar.yz_kiyas ?? {}) as { eleme_oran?: number; kunye_oran?: number; bitis?: string }) };
  const [eleme, setEleme] = useState(String(k.eleme_oran));
  const [kunye, setKunye] = useState(String(k.kunye_oran));
  const [bitis, setBitis] = useState(k.bitis.slice(0, 10));
  const sinirla = (x: string, y: number) => Math.max(0, Math.min(100, Number(x) || 0)) || (x.trim() === "0" ? 0 : y);
  return (
    <>
      <div className="ay-alanlar">
        <Alan ad="Haber eleme" not="Toplanan haber partilerinin bu kadarı kıyasa girer; giren her haberi 8 model de etiketler. %10 ≈ ayda 50 $ (çoğu güçlü modeller, en çok Opus). 0 = kapalı."><Sayi ad="Eleme oranı" deger={eleme} degis={setEleme} birim="%" /></Alan>
        <Alan ad="Künye" not="Künye otomasyonunun ürünlerinden bu kadarı kıyasa girer. %20 ≈ ayda 45 $. 0 = kapalı."><Sayi ad="Künye oranı" deger={kunye} degis={setKunye} birim="%" /></Alan>
        <Alan ad="Bitiş" not="Bu günden sonra eleme ve künye kıyası kendiliğinden durur (görsel kıyası ayrı). Kıyas kalıcı bir masraf değil, karar vermek için."><input type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} aria-label="Kıyas bitişi" /></Alan>
      </div>
      <div className="ay-kaydet"><button className="btn sm" onClick={() => ayar("yz_kiyas", { eleme_oran: sinirla(eleme, 10), kunye_oran: sinirla(kunye, 20), bitis: bitis ? bitis + "T23:59:00+03:00" : KIYAS_BITIS_VARSAYILAN }, "Kıyas oranları kaydedildi.")}>Kaydet</button></div>
    </>
  );
}
