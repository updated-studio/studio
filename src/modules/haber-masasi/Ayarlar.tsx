import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { MODEL_AD, MODEL_UCRET } from "./gorselModel";
import ModelSecici, { useModelKatalog, type Katalog } from "./ModelSecici";
import { sb } from "../../shared/supabase";
import { hataMetni, useToast } from "../../shared/toast";
import { ANA_SAYFA_ESIK, HABER_TURLERI, YAYIN_ESIK } from "./oncelik";
import { zamanOnce } from "./ortak";
import { useMasa } from "./veri";
import { OTO_VARSAYILAN, type OtoAyar } from "../../../supabase/functions/triyaj-taslak/secim.ts";
import { USLUP_VARSAYILAN } from "../../../supabase/functions/triyaj-taslak/uslup.ts";
import "../sistem/baglantilar.css";
import "./ayarlar.css";

// Sadece yöneticiler. Düzen (4 Kasım 2026, kullanıcı: "ayarlar kısmı çorba, okumakta zorlandım"): Bağlantı anahtarları sayfasının onaylı
// düzeni; gruplar solda başlık + açıklama, sağda açılır satırlar. Kapalı satır kayıtlı değeri tek satırda özetler; açılınca alanlar
// "ad + kısa not | değer" biçiminde sıralanır.
type AyarYaz = (key: string, value: unknown, mesaj: string) => Promise<void>;
type Ac = (id: string) => void;

export default function Ayarlar() {
  const { v } = useMasa();
  const toast = useToast();
  const [acik, setAcik] = useState("");
  const katalog = useModelKatalog();

  async function ayar(key: string, value: unknown, mesaj: string) {
    const r = await sb.from("tr_settings").upsert({ key, value });
    toast(r.error ? hataMetni(r.error) : mesaj);
  }

  const a = v.ayarlar;
  const oto = { ...OTO_VARSAYILAN, ...((a.oto_taslak ?? {}) as Partial<OtoAyar>) };
  const kiyas = { acik: true, gunluk: 3, ...((a.gorsel_kiyas ?? {}) as { acik?: boolean; gunluk?: number }) };
  const uslupOzel = typeof a.yazim_uslubu === "string" && !!(a.yazim_uslubu as string).trim();
  const gurultu = ((a.gurultu_kelimeleri as string[]) ?? []).length;
  const kategoriler = ((a.site_kategoriler ?? {}) as { liste?: { slug: string; name: string }[] }).liste ?? [];
  const varsKat = kategoriler.find((k) => k.slug === String(a.site_varsayilan_kategori ?? ""));
  const kiyasA = { eleme_oran: 10, kunye_oran: 20, ...((a.yz_kiyas ?? {}) as { eleme_oran?: number; kunye_oran?: number }) };
  const acikPill = (x: boolean) => <span className={"pill " + (x ? "blue" : "off")}>{x ? "Açık" : "Kapalı"}</span>;
  const p = { acik, ac: setAcik };

  return (
    <section className="bg ay">
      <p className="bg-ozet">
        <b>Otomatik taslak {oto.acik ? "açık" : "kapalı"}{oto.acik ? `, günde en çok ${oto.gunluk}, en az ${oto.esik} puan.` : "."}</b>{" "}
        Görsel: {modelOzet(katalog, a.gorsel_modeller)}. Satıra tıklayınca ayarları açılır; değişiklik Kaydet'e basınca geçerli olur.
      </p>

      <Grup id="yazim" ad="Otomatik yazım" ne="Hangi haberin kendiliğinden taslağa döneceği ve taslağın nasıl yazılacağı.">
        <Satir {...p} id="oto" ad="Otomatik taslak" ne="Güçlü haberlere düğmeye basılmadan taslak yazılır." durum={acikPill(oto.acik)}
          deger={oto.acik ? `günde ${oto.gunluk} · ${oto.esik}+ puan` : undefined}><OtomatikTaslak ayar={ayar} /></Satir>
        <Satir {...p} id="uslup" ad="Yazım üslubu" ne="Taslakların uyduğu dil ve biçim kuralları." deger={uslupOzel ? "Özelleştirilmiş" : "Varsayılan"}>
          <YazimUslubu ayar={ayar} /></Satir>
      </Grup>

      <Grup id="gorsel" ad="Görseller" ne="Uygun fotoğraf bulunamayınca kapağı yapay zekâ çizer. Sitede “Temsili görsel” etiketiyle çıkar.">
        <Satir {...p} id="modeller" ad="Üretimde kullanılan modeller" ne="Önce ücretsiz Cloudflare dener; payı biterse ya da görsel reddedilirse sırayla Nano Banana, GPT Image."
          deger={modelOzet(katalog, a.gorsel_modeller)}>
          <ModelSecici mod="varsayilan" gomulu katalog={katalog} kaydet={(s) => ayar("gorsel_modeller", s, "Görsel modelleri kaydedildi.")} />
        </Satir>
        <Satir {...p} id="kiyas" ad="Model kıyası" ne="Bazı taslaklarda bütün modeller birlikte üretir; en yüksek puanlı kapak olur." durum={acikPill(kiyas.acik)}
          deger={kiyas.acik ? `günde ${kiyas.gunluk} taslak` : undefined}><KiyasAyari ayar={ayar} /></Satir>
      </Grup>

      <Grup id="olcum" ad="Ölçümler" ne="Hangi model daha iyi iş çıkarıyor? Son 30 günün sayıları.">
        <Satir {...p} id="gtablo" ad="Görsel modelleri" ne="Her deneme: kaç kez üretti, denetimden geçti, kapak oldu; süre ve maliyet."><GorselTablo /></Satir>
        <Satir {...p} id="ytablo" ad="Yazı: Claude ve Gemini" ne="Editörün kör seçimi ve denetimin yaptığı düzeltme sayısı."><YaziKiyas /></Satir>
        <Satir {...p} id="etablo" ad="Haber eleme: 7 model" ne="Aynı haberleri hepsi etiketler; kararlar birbiriyle, editörle ve senin hakem kararınla karşılaştırılır."><ElemeKiyas /></Satir>
        <Satir {...p} id="ktablo" ad="Künye: 7 model" ne="Aynı sayfalardan ürün özelliği çıkarırlar; alıntının sayfada gerçekten geçip geçmediği ölçülür."><KunyeKiyas /></Satir>
        <Satir {...p} id="kiyasayar" ad="Kıyas oranı" ne="Kıyasa giren haber ve ürün payı; Claude'un ek maliyeti buna göre." deger={`eleme %${kiyasA.eleme_oran} · künye %${kiyasA.kunye_oran}`}><KiyasOrani ayar={ayar} /></Satir>
      </Grup>

      <Grup id="kaynak" ad="Haber kaynakları" ne="Havuza ne gireceği, neyin öne çıkacağı ve ne kadar duracağı.">
        <Satir {...p} id="gurultu" ad="Gürültü kelimeleri" ne="Başlığında bunlardan biri geçen haber baştan elenir." deger={`${gurultu} kelime`}><Gurultu ayar={ayar} /></Satir>
        <Satir {...p} id="marka" ad="Türkiye pazarı markaları" ne="Öncelikli markalar öne çıkar; Türkiye'de satılmayanlar geride kalır." deger={`${v.markalar.length} marka`}><Markalar /></Satir>
        <Satir {...p} id="basin" ad="Basın sayfaları" ne="Görsel ve bilgi aranırken markanın resmî basın sayfasına bakılır." deger={`${v.basin.length} sayfa`}><Basin /></Satir>
        <Satir {...p} id="saklama" ad="Saklama süresi" ne="Kimsenin dokunmadığı haber bu süre sonunda havuzdan silinir." deger={`${a.saklama_gun ?? 3} gün`}><Saklama ayar={ayar} /></Satir>
      </Grup>

      <Grup id="baglanti" ad="Site" ne="Taslakların gittiği updated.com.tr paneli.">
        <Satir {...p} id="site" ad="Site paneli" ne="Bağlantıyı dene; yapay zekâ kategori bulamazsa kullanılacak kategori."
          deger={varsKat ? varsKat.name : "Kategori seçilmedi"}><SitePaneli ayar={ayar} /></Satir>
      </Grup>
    </section>
  );
}

function modelOzet(k: Katalog | null, kayit: unknown) {
  const s = (kayit ?? {}) as { gpt?: string; banana?: string; gpt_kalite?: string };
  const ad = (sg: "gpt" | "banana", id?: string) => {
    const m = k?.modeller.find((x) => (id ? x.id === id : x.saglayici === sg && x.varsayilan));
    return m?.ad ?? id ?? (sg === "gpt" ? "GPT Image (en yeni)" : "Nano Banana (en yeni)");
  };
  return `${ad("gpt", s.gpt)} · ${ad("banana", s.banana)}`;
}

function Grup({ id, ad, ne, children }: { id: string; ad: string; ne: string; children: ReactNode }) {
  return (
    <section className="bg-grup" aria-labelledby={"ay-" + id}>
      <div className="bg-grup-sol"><h2 id={"ay-" + id}>{ad}</h2><p>{ne}</p></div>
      <div className="bg-liste">{children}</div>
    </section>
  );
}

function Satir({ id, ad, ne, durum, deger, acik, ac, children }: { id: string; ad: string; ne: string; durum?: ReactNode; deger?: string; acik: string; ac: Ac; children: ReactNode }) {
  const a = acik === id;
  return (
    <div className={"bg-srv" + (a ? " acik" : "")}>
      <div className="bg-bas">
        <button type="button" className="bg-ac ay-ac" aria-expanded={a} onClick={() => ac(a ? "" : id)}>
          <span className="bg-ad"><b>{ad}</b><span>{ne}</span></span>
          <span className="ay-durum">{durum}{deger && <span className="ay-deger">{deger}</span>}</span>
        </button>
        <button type="button" className="bg-ok" aria-label={a ? "Kapat" : "Aç"} onClick={() => ac(a ? "" : id)}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg></button>
      </div>
      {a && <div className="ay-ic">{children}</div>}
    </div>
  );
}

/** Ayar satırı: solda ad + kısa not, sağda değer */
function Alan({ ad, not, children }: { ad: string; not?: ReactNode; children: ReactNode }) {
  return <div className="ay-alan"><div className="ay-alan-ad"><b>{ad}</b>{not && <span>{not}</span>}</div><div className="ay-alan-deger">{children}</div></div>;
}
function Anahtar({ acik, degis, ad }: { acik: boolean; degis: (x: boolean) => void; ad: string }) {
  return <input type="checkbox" role="switch" className="ay-anahtar" checked={acik} aria-label={ad} onChange={(e) => degis(e.target.checked)} />;
}
function Sayi({ deger, degis, birim, ad }: { deger: number | string; degis: (x: string) => void; birim?: string; ad: string }) {
  return <span className="ay-sayi"><input type="text" inputMode="numeric" value={String(deger)} aria-label={ad} onChange={(e) => degis(e.target.value.replace(/\D/g, ""))} />{birim && <span>{birim}</span>}</span>;
}

/** Otomatik taslak (ARCHITECTURE.md, 15 Ekim 2026): en güçlü haberlere taslak + panele taslak haber olarak gönderim. */
function OtomatikTaslak({ ayar }: { ayar: AyarYaz }) {
  const { v } = useMasa();
  const kayitli = (v.ayarlar.oto_taslak ?? {}) as Partial<OtoAyar> & { wordpress?: boolean };
  // Eski kayıtta "wordpress" adıyla durur (23 Ekim 2026'ya kadar)
  const [a, setA] = useState<OtoAyar>({ ...OTO_VARSAYILAN, ...kayitli, site: kayitli.site ?? kayitli.wordpress ?? OTO_VARSAYILAN.site });
  const son = (v.ayarlar.oto_son ?? {}) as { zaman?: string; durum?: string; haber?: string; editor?: string; puan?: number; bugun?: number };
  const sinir = { gunluk: [1, 200], esik: [40, 150], bekle_dk: [0, 240], tur_basina: [1, 3], panel_sure_gun: [0, 30] } as const;
  const sayi = (k: keyof typeof sinir, birim: string) => <Sayi ad={k} deger={a[k]} birim={birim} degis={(x) => setA({ ...a, [k]: Number(x) || 0 } as OtoAyar)} />;
  return (
    <>
      <div className="ay-alanlar">
        <Alan ad="Çalışsın" not="Kapalıyken taslak yalnız düğmeyle hazırlanır."><Anahtar ad="Otomatik taslak çalışsın" acik={a.acik} degis={(x) => setA({ ...a, acik: x })} /></Alan>
        <Alan ad="Editöre ata" not="İlgi alanı en uygun editöre verilir. Kapalıyken taslak sahipsiz kalır, bildirim gitmez."><Anahtar ad="Editöre ata" acik={a.ata} degis={(x) => setA({ ...a, ata: x })} /></Alan>
        <Alan ad="Panele gönder" not="Hazırlanan her taslak panelde incelemede bir haber olur. Yayına panelde basılır."><Anahtar ad="Panele gönder" acik={a.site} degis={(x) => setA({ ...a, site: x })} /></Alan>
        <Alan ad="En az puan" not={<>Önem {(a.esik / 10).toLocaleString("tr")}/10. {YAYIN_ESIK} = yayına değer, {ANA_SAYFA_ESIK} = ana sayfa adayı.</>}>{sayi("esik", "puan")}</Alan>
        <Alan ad="Günlük sınır" not="Bir günde yazılacak en çok taslak.">{sayi("gunluk", "taslak")}</Alan>
        <Alan ad="Bekleme" not="Haber düştükten sonra beklenir; diğer kaynaklar aynı habere eklensin diye.">{sayi("bekle_dk", "dk")}</Alan>
        <Alan ad="Tur başına" not="10 dakikada bir tur; aynı haberin diğer kartları yazılmaz.">{sayi("tur_basina", "haber")}</Alan>
        <Alan ad="Panelden kaldır" not="Kimsenin dokunmadığı otomatik taslak bu süre sonunda panelden çıkar. 0 = kapalı.">{sayi("panel_sure_gun", "gün")}</Alan>
      </div>
      <div className="ay-blok">
        <b>Otomatik yazılmayan türler</b>
        <div className="row">
          {HABER_TURLERI.map((t) => (
            <label key={t.ad} className={"ay-cip" + (a.haric_turler.includes(t.ad) ? " secili" : "")}><input type="checkbox" checked={a.haric_turler.includes(t.ad)}
              onChange={(e) => setA({ ...a, haric_turler: e.target.checked ? [...a.haric_turler, t.ad] : a.haric_turler.filter((x) => x !== t.ad) })} />{t.ad}</label>
          ))}
        </div>
      </div>
      <div className="ay-kaydet">
        <button className="btn sm" onClick={() => {
          const temiz = { ...a } as OtoAyar;
          for (const k of Object.keys(sinir) as (keyof typeof sinir)[]) temiz[k] = Math.max(sinir[k][0], Math.min(sinir[k][1], a[k]));
          const { wordpress: _eski, ...kayit } = temiz as OtoAyar & { wordpress?: boolean };
          setA(temiz); ayar("oto_taslak", kayit, "Otomatik taslak ayarları kaydedildi.");
        }}>Kaydet</button>
        {son.zaman && (
          <span className="muted">Son çalışma {zamanOnce(son.zaman)} önce: {son.durum}{son.haber ? ` · "${son.haber}"${son.puan ? ` (${son.puan} puan)` : ""} → ${son.editor || "sahipsiz"}` : ""}{son.bugun !== undefined ? ` · bugün ${son.bugun}/${a.gunluk}` : ""}</span>
        )}
      </div>
    </>
  );
}

/** Yapay zekânın taslak yazarken uyduğu üslup (uslup.ts varsayılanı; burada değiştirilir, tr_settings.yazim_uslubu) */
function YazimUslubu({ ayar }: { ayar: AyarYaz }) {
  const { v } = useMasa();
  const kayitli = typeof v.ayarlar.yazim_uslubu === "string" && (v.ayarlar.yazim_uslubu as string).trim() ? (v.ayarlar.yazim_uslubu as string) : "";
  const [metin, setMetin] = useState(kayitli || USLUP_VARSAYILAN);
  return (
    <>
      <p className="ay-not">Sitedeki yazılardan, Nerdesin Fatih YouTube kanalından ve Instagram gönderilerinden çıkarıldı. Değişiklik yeni taslaklarda geçerli olur.</p>
      <textarea className="alan" rows={16} value={metin} onChange={(e) => setMetin(e.target.value)} aria-label="Yazım üslubu" />
      <div className="ay-kaydet">
        <button className="btn sm" onClick={() => ayar("yazim_uslubu", metin.trim() === USLUP_VARSAYILAN.trim() ? "" : metin, "Yazım üslubu kaydedildi.")}>Kaydet</button>
        {kayitli && <button className="btn ghost sm" onClick={() => { setMetin(USLUP_VARSAYILAN); ayar("yazim_uslubu", "", "Varsayılan üsluba dönüldü."); }}>Varsayılana dön</button>}
      </div>
    </>
  );
}

// Görsel model kıyası (3 Kasım 2026, kullanıcı: "birkaç gün birden çok modele ürettirsin, hangisi daha iyi sonuç veriyor bakalım").
// Fotoğraf bulunamayan taslaklarda (günlük sınır kadarında) bütün bağlı modeller aynı anda üretir; tablo son 30 günü sayar.
function KiyasAyari({ ayar }: { ayar: AyarYaz }) {
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
function GorselTablo() {
  const [satirlar, setSatirlar] = useState<{ image: Record<string, unknown> }[] | null>(null);
  useEffect(() => {
    sb.from("tr_drafts").select("image").eq("deneme", false).not("image->yz_adaylar", "is", null).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(300)
      .then(({ data }) => setSatirlar((data ?? []) as { image: Record<string, unknown> }[]));
  }, []);
  const tablo = new Map<string, { uretildi: number; denendi: number; gecti: number; puan: number; otomatik: number; editor: number; sure: number }>();
  let payBitti = 0;
  for (const r of satirlar ?? []) {
    const img = r.image as { yz_adaylar?: Aday[]; yz_model?: string; yz_secen?: string };
    for (const a of img.yz_adaylar ?? []) {
      const t = tablo.get(a.model) ?? { uretildi: 0, denendi: 0, gecti: 0, puan: 0, otomatik: 0, editor: 0, sure: 0 };
      if (a.hata && /4006|daily free allocation/i.test(a.hata)) payBitti++;
      t.denendi++; if (!a.hata) { t.uretildi++; t.puan += a.puan; t.sure += a.sure; } if (a.gecti) t.gecti++;
      if (img.yz_model === a.model) img.yz_secen === "editor" ? t.editor++ : t.otomatik++;
      tablo.set(a.model, t);
    }
  }
  const sirali = [...tablo.entries()].sort((a, b) => (b[1].editor + b[1].otomatik) - (a[1].editor + a[1].otomatik) || b[1].puan / Math.max(1, b[1].uretildi) - a[1].puan / Math.max(1, a[1].uretildi));
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
      <p className="ay-not">Puan 10 üzerinden, yedi katmanlı denetimin verdiği. Cloudflare modelleri ücretsiz günlük payla çalışır; maliyet üst sınırdır.</p>
    </>
  );
}

// Yazı karşılaştırması (4 Kasım 2026): her taslakta Claude ve Gemini aynı haberi yazar; editörün kör seçimi ve denetimin düzeltme sayısı.
function YaziKiyas() {
  const [satirlar, setSatirlar] = useState<{ qc: Record<string, unknown> | null }[] | null>(null);
  useEffect(() => {
    sb.from("tr_drafts").select("qc").eq("deneme", false).not("qc->ab", "is", null).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(500)
      .then(({ data }) => setSatirlar((data ?? []) as { qc: Record<string, unknown> | null }[]));
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
    </>
  );
}

function Gurultu({ ayar }: { ayar: AyarYaz }) {
  const { v } = useMasa();
  const [kelimeler, setKelimeler] = useState(((v.ayarlar.gurultu_kelimeleri as string[]) ?? []).join("\n"));
  return (
    <>
      <p className="ay-not">Her satıra bir kelime. Bu haberler yapay zekâya hiç gitmez.</p>
      <textarea className="alan" rows={8} value={kelimeler} onChange={(e) => setKelimeler(e.target.value)} aria-label="Gürültü kelimeleri" />
      <div className="ay-kaydet"><button className="btn sm" onClick={() => ayar("gurultu_kelimeleri", kelimeler.split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean), "Gürültü kelimeleri kaydedildi.")}>Kaydet</button></div>
    </>
  );
}

const MARKA_GRUP: [string, string][] = [["Öncelikli", "Öne çıkar"], ["Normal", "Etkisiz"], ["Hariç", "Türkiye'de satılmıyor, geride kalır"]];
function Markalar() {
  const { v } = useMasa();
  const toast = useToast();
  async function ekle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await sb.from("tr_brands").upsert({ name: String(f.get("ad")).trim(), grp: String(f.get("grup")), note: String(f.get("not")).trim() });
    if (r.error) return toast(hataMetni(r.error));
    e.currentTarget.reset();
  }
  return (
    <>
      <div className="ay-alanlar">
        {MARKA_GRUP.map(([g, not]) => {
          const l = v.markalar.filter((m) => m.grp === g);
          return (
            <Alan key={g} ad={g} not={not}>
              <span className="ay-markalar">{l.length ? l.map((m) => (
                <span key={m.name} className="ay-cip" title={m.note || undefined}>{m.name}
                  <button className="ay-sil" aria-label={m.name + " sil"} onClick={async () => { const r = await sb.from("tr_brands").delete().eq("name", m.name); if (r.error) toast(hataMetni(r.error)); }}>×</button>
                </span>
              )) : <span className="muted">Yok</span>}</span>
            </Alan>
          );
        })}
      </div>
      <form className="ay-form" onSubmit={ekle}>
        <label>Marka<input name="ad" type="text" required maxLength={40} /></label>
        <label>Grup<select name="grup">{MARKA_GRUP.map(([g]) => <option key={g}>{g}</option>)}</select></label>
        <label>Not<input name="not" type="text" maxLength={60} /></label>
        <button className="btn">Ekle</button>
      </form>
    </>
  );
}

function Basin() {
  const { v } = useMasa();
  const toast = useToast();
  async function ekle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await sb.from("tr_press").insert({ brand: String(f.get("marka")).trim(), url: String(f.get("url")).trim(), note: String(f.get("not")).trim() });
    if (r.error) return toast(hataMetni(r.error));
    e.currentTarget.reset();
  }
  return (
    <>
      {v.basin.length ? (
        <div className="ay-alanlar">
          {v.basin.map((b) => (
            <Alan key={b.id} ad={b.brand} not={<><a href={b.url} target="_blank" rel="noreferrer">{b.url.replace(/^https?:\/\/(www\.)?/, "")}</a>{b.note ? ` · ${b.note}` : ""}</>}>
              <button className="btn ghost sm" onClick={async () => { const r = await sb.from("tr_press").delete().eq("id", b.id); if (r.error) toast(hataMetni(r.error)); }}>Sil</button>
            </Alan>
          ))}
        </div>
      ) : <p className="ay-not">Henüz basın sayfası yok.</p>}
      <form className="ay-form" onSubmit={ekle}>
        <label>Marka<input name="marka" type="text" required maxLength={40} /></label>
        <label>Basın sayfası<input name="url" type="text" required placeholder="https://" /></label>
        <label>Not<input name="not" type="text" maxLength={80} /></label>
        <button className="btn">Ekle</button>
      </form>
    </>
  );
}

function Saklama({ ayar }: { ayar: AyarYaz }) {
  const { v } = useMasa();
  const [gun, setGun] = useState(String(v.ayarlar.saklama_gun ?? 3));
  return (
    <>
      <div className="ay-alanlar">
        <Alan ad="Saklama süresi" not="Alınmamış, oylanmamış, pas geçilmemiş haberler silinir. İşlem görenler kalır. 1–60 gün."><Sayi ad="Gün" deger={gun} degis={setGun} birim="gün" /></Alan>
      </div>
      <div className="ay-kaydet"><button className="btn sm" onClick={() => ayar("saklama_gun", Math.max(1, Math.min(60, Number(gun) || 3)), "Saklama süresi kaydedildi.")}>Kaydet</button></div>
    </>
  );
}

/** Site paneli (Payload, panel.updated.com.tr) bağlantısı: anahtar Supabase Secrets'ta (STUDIO_IMPORT_KEY); burada sadece denenir.
 *  WordPress bağlantısı 23 Ekim 2026'da kaldırıldı (ARCHITECTURE.md karar günlüğü). */
function SitePaneli({ ayar }: { ayar: AyarYaz }) {
  const { v } = useMasa();
  const [sonuc, setSonuc] = useState<{ ok: boolean; hata?: string; panel?: string; kategori?: number; yazar?: number; uyari?: string } | null>(null);
  const [suruyor, setSuruyor] = useState(false);
  const kategoriler = ((v.ayarlar.site_kategoriler ?? {}) as { liste?: { id: number | string; name: string; slug: string }[] }).liste ?? [];
  async function dene() {
    setSuruyor(true);
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { site_dene: true } });
    setSuruyor(false);
    setSonuc(error ? { ok: false, hata: error.message } : data);
  }
  return (
    <>
      <div className="ay-alanlar">
        <Alan ad="Bağlantı" not="Anahtar sunucuda durur; burada yalnız denenir."><button className="btn ghost sm" onClick={dene} disabled={suruyor}>{suruyor ? "Deneniyor…" : "Dene"}</button></Alan>
        {kategoriler.length > 0 && (
          <Alan ad="Yedek kategori" not="Yapay zekâ uygun kategori bulamazsa. Seçilmezse taslak gönderilmez, uyarı verir.">
            <select value={String(v.ayarlar.site_varsayilan_kategori ?? "")} aria-label="Yedek kategori" onChange={(e) => ayar("site_varsayilan_kategori", e.target.value, "Yedek kategori kaydedildi.")}>
              <option value="">Seçilmedi</option>
              {kategoriler.map((k) => <option key={k.slug} value={k.slug}>{k.name}</option>)}
            </select>
          </Alan>
        )}
      </div>
      {sonuc && (sonuc.ok
        ? <div className="msg good">Bağlandı: {sonuc.panel} · {sonuc.kategori} kategori · {sonuc.yazar} yazar.{sonuc.uyari ? " " + sonuc.uyari : ""}</div>
        : <div className="msg err">{sonuc.hata}</div>)}
    </>
  );
}

// ---------- Yapay zekâ iş kıyasları (4 Kasım 2026, kullanıcı: "her yapay zekâyı en iyi olduğu işte kullanalım; yöneticiler 3 sonucu
// kıyaslasın"; göç 0065, public.yz_kiyas). Asıl işi Gemini yapar; Claude Haiku ve Sonnet aynı girdiyle gölgede çalışır. ----------
type KiyasSatir = { nesne: string; model: string; sonuc: Record<string, unknown>; karar: string | null; sure_ms: number | null; hata: string | null };
// Kıyas modelleri sunucuda triyaj-taslak/kiyas.ts KIYAS_MODELLERI; "gemini:…" asıl işi yapan ücretsiz Gemini
const KIYAS_AD: Record<string, string> = { "claude-haiku-5-5": "Claude Haiku 5.5", "claude-sonnet-5-5": "Claude Sonnet 5.5", "gpt-6-luna": "GPT-6 Luna", "gpt-6.1-sol": "GPT-6.1 Sol", "gemini-4-argon": "Gemini 4 Argon", "gemini-3.8-flash": "Gemini 3.8 Flash (ücretsiz)" };
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
const modeller = (l: KiyasSatir[]) => [...new Set(l.map((s) => s.model).filter((m) => m !== "editor"))].sort((a, b) => (a.startsWith("gemini") ? -1 : b.startsWith("gemini") ? 1 : a.localeCompare(b)));

function ElemeKiyas() {
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
  if (!satirlar) return <p className="ay-not">Yükleniyor…</p>;
  if (!satirlar.length) return <p className="ay-not">Henüz kıyas yok; örneklenen ilk toplamada (15 dakikada bir) başlar.</p>;
  const nesneler = gruplaNesne(satirlar);
  const havuz = (k: string | null) => k === "aday" || k === "belirsiz";
  const ms = modeller(satirlar);
  const gemAd = ms.find((m) => m.startsWith("gemini")) ?? "";
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

function KunyeKiyas() {
  const satirlar = useKiyas("kunye");
  if (!satirlar) return <p className="ay-not">Yükleniyor…</p>;
  if (!satirlar.length) return <p className="ay-not">Henüz kıyas yok; künye otomasyonunun örneklenen ilk ürününde başlar.</p>;
  const nesneler = gruplaNesne(satirlar);
  const ms = modeller(satirlar);
  const gemAd = ms.find((m) => m.startsWith("gemini")) ?? "";
  type Oz = { key: string; value: string; dogru?: boolean };
  const deger = (v: string) => v.toLocaleLowerCase("tr").replace(/\s+/g, "").replace(",", ".");
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
  return (
    <>
      <div className="tbl"><table>
        <thead><tr><th>Model</th><th>Ürün</th><th>Ürün başına özellik</th><th>Alıntısı sayfada geçen</th><th>Gemini ile aynı değer</th><th>Ort. süre</th></tr></thead>
        <tbody>{ozet.map((o) => (
          <tr key={o.m}><td><b>{MODEL_ADI(o.m)}</b>{o.hata ? <span className="muted"> ({o.hata} hata)</span> : null}</td><td>{o.n}</td><td>{o.ort}</td>
            <td>{yuzde(o.dogrulanan, o.bulunan)}</td><td>{o.m === gemAd ? "–" : yuzde(o.ayni, o.ortak)}</td><td>{o.sure ? o.sure + " sn" : "–"}</td></tr>
        ))}</tbody>
      </table></div>
      <p className="ay-not">Son 30 gün. "Alıntısı sayfada geçen": modelin kanıt diye gösterdiği cümle kaynak sayfada birebir var mı (uydurma ölçüsü). Asıl öneriyi Gemini veriyor; Claude'un sonuçları yalnız burada.</p>
    </>
  );
}

function KiyasOrani({ ayar }: { ayar: AyarYaz }) {
  const { v } = useMasa();
  const k = { eleme_oran: 10, kunye_oran: 20, ...((v.ayarlar.yz_kiyas ?? {}) as { eleme_oran?: number; kunye_oran?: number }) };
  const [eleme, setEleme] = useState(String(k.eleme_oran));
  const [kunye, setKunye] = useState(String(k.kunye_oran));
  const sinirla = (x: string, y: number) => Math.max(0, Math.min(100, Number(x) || 0)) || (x.trim() === "0" ? 0 : y);
  return (
    <>
      <div className="ay-alanlar">
        <Alan ad="Haber eleme" not="Toplanan haber partilerinin bu kadarı kıyasa girer; giren her haberi 7 model de etiketler. %10 ≈ ayda 30 $ (çoğu üç güçlü model). 0 = kapalı."><Sayi ad="Eleme oranı" deger={eleme} degis={setEleme} birim="%" /></Alan>
        <Alan ad="Künye" not="Künye otomasyonunun ürünlerinden bu kadarı kıyasa girer. %20 ≈ ayda 25 $. 0 = kapalı."><Sayi ad="Künye oranı" deger={kunye} degis={setKunye} birim="%" /></Alan>
        <Alan ad="Öneri" not="İki hafta açık tut, Ölçümler'de kazananı seç, sonra 0 yap. Kıyas kalıcı bir masraf değil, karar vermek için."><span className="muted">–</span></Alan>
      </div>
      <div className="ay-kaydet"><button className="btn sm" onClick={() => ayar("yz_kiyas", { eleme_oran: sinirla(eleme, 10), kunye_oran: sinirla(kunye, 20) }, "Kıyas oranları kaydedildi.")}>Kaydet</button></div>
    </>
  );
}
