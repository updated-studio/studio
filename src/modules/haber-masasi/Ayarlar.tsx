import { useState, type FormEvent } from "react";
import ModelSecici, { useModelKatalog, type Katalog } from "./ModelSecici";
import { sb } from "../../shared/supabase";
import { hataMetni, useToast } from "../../shared/toast";
import { ANA_SAYFA_ESIK, HABER_TURLERI, YAYIN_ESIK } from "./oncelik";
import { zamanOnce } from "./ortak";
import { useMasa } from "./veri";
import { OTO_VARSAYILAN, type OtoAyar } from "../../../supabase/functions/triyaj-taslak/secim.ts";
import { USLUP_VARSAYILAN } from "../../../supabase/functions/triyaj-taslak/uslup.ts";
import { Alan, Anahtar, GitSatir, Grup, Satir, Sayi, type AyarYaz } from "./ayarParcalari";

// Sadece yöneticiler. Düzen (4 Kasım 2026, kullanıcı: "ayarlar kısmı çorba, okumakta zorlandım"): Bağlantı anahtarları sayfasının onaylı
// düzeni; gruplar solda başlık + açıklama, sağda açılır satırlar. Kapalı satır kayıtlı değeri tek satırda özetler; açılınca alanlar
// "ad + kısa not | değer" biçiminde sıralanır.

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
  const uslupOzel = typeof a.yazim_uslubu === "string" && !!(a.yazim_uslubu as string).trim();
  const gurultu = ((a.gurultu_kelimeleri as string[]) ?? []).length;
  const kategoriler = ((a.site_kategoriler ?? {}) as { liste?: { slug: string; name: string }[] }).liste ?? [];
  const varsKat = kategoriler.find((k) => k.slug === String(a.site_varsayilan_kategori ?? ""));
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
        <GitSatir ad="Görsel kıyası" ne="Günde birkaç taslakta bütün modeller birlikte üretir; ayarı ve sonuçları kıyas sayfasında." href="#/yz-kiyas" />
      </Grup>

      <Grup id="olcum" ad="Ölçümler" ne="Hangi işte hangi yapay zekâ daha iyi; kıyasların hepsi tek sayfada.">
        <GitSatir ad="Yapay zekâ kıyası" ne="Yazı, görsel, haber eleme ve künye: özet, giren işler, hakem, ayarlar ve fiyatlar." href="#/yz-kiyas" />
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
