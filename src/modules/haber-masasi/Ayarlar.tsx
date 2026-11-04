import { useEffect, useState, type FormEvent } from "react";
import { MODEL_AD, MODEL_UCRET } from "./gorselModel";
import { sb } from "../../shared/supabase";
import { hataMetni, useToast } from "../../shared/toast";
import { ANA_SAYFA_ESIK, HABER_TURLERI, YAYIN_ESIK } from "./oncelik";
import { zamanOnce } from "./ortak";
import { useMasa } from "./veri";
import { OTO_VARSAYILAN, type OtoAyar } from "../../../supabase/functions/triyaj-taslak/secim.ts";
import { USLUP_VARSAYILAN } from "../../../supabase/functions/triyaj-taslak/uslup.ts";

// Sadece yöneticiler: otomatik taslak ve site paneli bağlantısı, saklama süresi, gürültü kelimeleri, Türkiye pazarı markaları, basın kiti.
export default function Ayarlar() {
  const { v } = useMasa();
  const toast = useToast();
  const [gun, setGun] = useState(String(v.ayarlar.saklama_gun ?? 3));
  const [kelimeler, setKelimeler] = useState(((v.ayarlar.gurultu_kelimeleri as string[]) ?? []).join("\n"));

  async function ayar(key: string, value: unknown, mesaj: string) {
    const r = await sb.from("tr_settings").upsert({ key, value });
    toast(r.error ? hataMetni(r.error) : mesaj);
  }
  async function markaEkle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await sb.from("tr_brands").upsert({ name: String(f.get("ad")).trim(), grp: String(f.get("grup")), note: String(f.get("not")).trim() });
    if (r.error) return toast(hataMetni(r.error));
    e.currentTarget.reset();
  }
  async function basinEkle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await sb.from("tr_press").insert({ brand: String(f.get("marka")).trim(), url: String(f.get("url")).trim(), note: String(f.get("not")).trim() });
    if (r.error) return toast(hataMetni(r.error));
    e.currentTarget.reset();
  }

  return (
    <>
      <OtomatikTaslak ayar={ayar} />
      <YazimUslubu ayar={ayar} />
      <GorselKiyas ayar={ayar} />
      <YaziKiyas />
      <SitePaneli ayar={ayar} />
      <div className="panel">
        <h3>Saklama</h3>
        <div className="muted">Havuzda kimsenin dokunmadığı (alınmamış, oylanmamış, pas geçilmemiş) haberler bu kadar gün sonra silinir. İşlem görmüş haberler kalır.</div>
        <div className="row">
          <input type="text" inputMode="numeric" value={gun} onChange={(e) => setGun(e.target.value.replace(/\D/g, ""))} style={{ width: 90 }} aria-label="Gün" /> gün
          <button className="btn sm" onClick={() => ayar("saklama_gun", Math.max(1, Math.min(60, Number(gun) || 3)), "Saklama süresi kaydedildi.")}>Kaydet</button>
        </div>
      </div>
      <div className="panel">
        <h3>Gürültü kelimeleri</h3>
        <div className="muted">Başlığında bunlardan biri geçen haber yapay zekâya gitmeden elenir. Her satıra bir tane.</div>
        <textarea className="alan" rows={8} value={kelimeler} onChange={(e) => setKelimeler(e.target.value)} />
        <div><button className="btn sm" onClick={() => ayar("gurultu_kelimeleri", kelimeler.split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean), "Gürültü kelimeleri kaydedildi.")}>Kaydet</button></div>
      </div>
      <div className="panel">
        <h3>Türkiye pazarı markaları</h3>
        <div className="muted">Öncelikli markaların haberleri öne çıkar; Hariç olanlar (Türkiye'de satılmayanlar) geride kalır.</div>
        <div className="row">
          {v.markalar.map((m) => (
            <span key={m.name} className="chip" title={m.note}>{m.name} <span className="muted">{m.grp}</span>
              <button className="linkbtn" aria-label={m.name + " sil"} onClick={async () => { const r = await sb.from("tr_brands").delete().eq("name", m.name); if (r.error) toast(hataMetni(r.error)); }}>×</button>
            </span>
          ))}
        </div>
        <form className="grid" onSubmit={markaEkle}>
          <label>Marka<input name="ad" type="text" required maxLength={40} /></label>
          <label>Grup<select name="grup"><option>Öncelikli</option><option>Normal</option><option>Hariç</option></select></label>
          <label>Not<input name="not" type="text" maxLength={60} /></label>
          <button className="btn">Ekle</button>
        </form>
      </div>
      <div className="panel">
        <h3>Basın kiti</h3>
        <div className="liste">
          {v.basin.map((b) => (
            <div key={b.id} className="satir">
              <div className="ana"><b>{b.brand}</b> <a href={b.url} target="_blank" rel="noreferrer">{b.url}</a>{b.note && <div className="muted">{b.note}</div>}</div>
              <button className="btn ghost sm" onClick={async () => { const r = await sb.from("tr_press").delete().eq("id", b.id); if (r.error) toast(hataMetni(r.error)); }}>Sil</button>
            </div>
          ))}
        </div>
        <form className="grid" onSubmit={basinEkle}>
          <label>Marka<input name="marka" type="text" required maxLength={40} /></label>
          <label>Basın sayfası<input name="url" type="text" required placeholder="https://" /></label>
          <label>Not<input name="not" type="text" maxLength={80} /></label>
          <button className="btn">Ekle</button>
        </form>
      </div>
    </>
  );
}

type AyarYaz = (key: string, value: unknown, mesaj: string) => Promise<void>;

/** Otomatik taslak (ARCHITECTURE.md, 15 Ekim 2026): en güçlü haberlere taslak + panele taslak haber olarak gönderim. */
function OtomatikTaslak({ ayar }: { ayar: AyarYaz }) {
  const { v } = useMasa();
  const kayitli = (v.ayarlar.oto_taslak ?? {}) as Partial<OtoAyar> & { wordpress?: boolean };
  // Eski kayıtta "wordpress" adıyla durur (23 Ekim 2026'ya kadar)
  const [a, setA] = useState<OtoAyar>({ ...OTO_VARSAYILAN, ...kayitli, site: kayitli.site ?? kayitli.wordpress ?? OTO_VARSAYILAN.site });
  const son = (v.ayarlar.oto_son ?? {}) as { zaman?: string; durum?: string; haber?: string; editor?: string; puan?: number; bugun?: number };
  const sinir = { gunluk: [1, 200], esik: [40, 150], bekle_dk: [0, 240], tur_basina: [1, 3], panel_sure_gun: [0, 30] } as const;
  const sayi = (k: keyof typeof sinir) => (
    <input type="text" inputMode="numeric" value={String(a[k])} style={{ width: 80 }} aria-label={k}
      onChange={(e) => setA({ ...a, [k]: Number(e.target.value.replace(/\D/g, "")) || 0 } as OtoAyar)} />
  );
  return (
    <div className="panel">
      <h3>Otomatik taslak</h3>
      <div className="muted">Öncelik puanı eşiği geçen haberlere (en yüksek puandan başlayarak) taslak, düğmeye basılmadan hazırlanır ve (atama açıksa) ilgi alanı en uygun editöre verilir; atama kapalıysa ya da eşleşen editör yoksa haber havuzda sahipsiz kalır. Taslak sitenin paneline de <b>incelemede</b> bir haber olarak gider; yayına panelde yayın yönetmeni basar.</div>
      <label className="row"><input type="checkbox" checked={a.acik} onChange={(e) => setA({ ...a, acik: e.target.checked })} /> Otomatik taslak açık</label>
      <label className="row"><input type="checkbox" checked={a.ata} onChange={(e) => setA({ ...a, ata: e.target.checked })} /> Taslağı ilgi alanı en uygun editöre ata <span className="muted">(kapalıyken taslak havuzda sahipsiz kalır, kimseye bildirim gitmez)</span></label>
      <label className="row"><input type="checkbox" checked={a.site} onChange={(e) => setA({ ...a, site: e.target.checked })} /> Hazırlanan taslakları (otomatik ve elle) panele (updated.com.tr) taslak olarak gönder</label>
      <div className="row">Günde en fazla {sayi("gunluk")} taslak</div>
      <div className="row">En az {sayi("esik")} puan <span className="muted">(= önem {(a.esik / 10).toLocaleString("tr")}/10 · {YAYIN_ESIK} = Öncelik 2 "yayına değer", {ANA_SAYFA_ESIK} = Öncelik 1 "ana sayfa adayı")</span></div>
      <div className="row">Haber düştükten {sayi("bekle_dk")} dk sonra <span className="muted">(diğer kaynaklar aynı karta birleşsin diye)</span></div>
      <div className="row">Her turda (10 dk) en fazla {sayi("tur_basina")} farklı haber <span className="muted">(aynı haberin diğer kartları yazılmaz)</span></div>
      <div className="row">Panelde {sayi("panel_sure_gun")} gün kimsenin dokunmadığı otomatik taslak panelden kaldırılır <span className="muted">(0 = kapalı; Stüdyo'daki taslak kalır, yeniden gönderilebilir)</span></div>
      <div className="muted">Bu türler otomatik yazılmaz:</div>
      <div className="row">
        {HABER_TURLERI.map((t) => (
          <label key={t.ad} className="chip"><input type="checkbox" checked={a.haric_turler.includes(t.ad)}
            onChange={(e) => setA({ ...a, haric_turler: e.target.checked ? [...a.haric_turler, t.ad] : a.haric_turler.filter((x) => x !== t.ad) })} /> {t.ad}</label>
        ))}
      </div>
      <div><button className="btn sm" onClick={() => {
        const temiz = { ...a } as OtoAyar;
        for (const k of Object.keys(sinir) as (keyof typeof sinir)[]) temiz[k] = Math.max(sinir[k][0], Math.min(sinir[k][1], a[k]));
        const { wordpress: _eski, ...kayit } = temiz as OtoAyar & { wordpress?: boolean };
        setA(temiz); ayar("oto_taslak", kayit, "Otomatik taslak ayarları kaydedildi.");
      }}>Kaydet</button></div>
      {son.zaman && (
        <div className="muted">Son çalışma: {zamanOnce(son.zaman)} önce · {son.durum}{son.haber ? ` · "${son.haber}"${son.puan ? ` (${son.puan} puan)` : ""} → ${son.editor || "sahipsiz"}` : ""}{son.bugun !== undefined ? ` · bugün ${son.bugun}/${a.gunluk}` : ""}</div>
      )}
    </div>
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
    <div className="panel">
      <h3>Site paneli bağlantısı</h3>
      <div className="muted">Taslaklar updated.com.tr'nin paneline (panel.updated.com.tr) gider. Bağlantı anahtarı burada değil, Supabase'in gizli bilgiler bölümünde durur.</div>
      <div><button className="btn sm" onClick={dene} disabled={suruyor}>{suruyor ? "Deneniyor…" : "Bağlantıyı dene"}</button></div>
      {sonuc && (sonuc.ok
        ? <div className="msg good">Bağlandı: {sonuc.panel} · {sonuc.kategori} kategori okundu · {sonuc.yazar} yazar.{sonuc.uyari ? " " + sonuc.uyari : ""}</div>
        : <div className="msg err">{sonuc.hata}</div>)}
      {kategoriler.length > 0 && (
        <label>Yapay zekâ uygun kategori bulamazsa
          <select value={String(v.ayarlar.site_varsayilan_kategori ?? "")} onChange={(e) => ayar("site_varsayilan_kategori", e.target.value, "Varsayılan kategori kaydedildi.")}>
            <option value="">Seçilmedi (taslak gönderilmez, uyarı verir)</option>
            {kategoriler.map((k) => <option key={k.slug} value={k.slug}>{k.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

/** Yapay zekânın taslak yazarken uyduğu üslup (uslup.ts varsayılanı; burada değiştirilir, tr_settings.yazim_uslubu) */
function YazimUslubu({ ayar }: { ayar: AyarYaz }) {
  const { v } = useMasa();
  const kayitli = typeof v.ayarlar.yazim_uslubu === "string" && (v.ayarlar.yazim_uslubu as string).trim() ? (v.ayarlar.yazim_uslubu as string) : "";
  const [metin, setMetin] = useState(kayitli || USLUP_VARSAYILAN);
  return (
    <div className="panel">
      <h3>Yazım üslubu</h3>
      <div className="muted">Taslaklar bu kurallara göre yazılır; ardından metinde yapay zekâ kokan ifade kalırsa bir kez daha "insanlaştırılır". Sitedeki yazılar, Nerdesin Fatih YouTube kanalı ve Instagram gönderilerinden çıkarıldı. Değiştirip kaydedebilirsin; yeni taslaklarda geçerli olur.</div>
      <textarea className="alan" rows={16} value={metin} onChange={(e) => setMetin(e.target.value)} aria-label="Yazım üslubu" />
      <div className="row">
        <button className="btn sm" onClick={() => ayar("yazim_uslubu", metin.trim() === USLUP_VARSAYILAN.trim() ? "" : metin, "Yazım üslubu kaydedildi.")}>Kaydet</button>
        <button className="btn ghost sm" onClick={() => { setMetin(USLUP_VARSAYILAN); ayar("yazim_uslubu", "", "Varsayılan üsluba dönüldü."); }}>Varsayılana dön</button>
        <span className="muted">{kayitli ? "Özelleştirilmiş üslup kullanılıyor." : "Varsayılan üslup kullanılıyor."}</span>
      </div>
    </div>
  );
}

// Görsel model kıyası (3 Kasım 2026, kullanıcı: "birkaç gün birden çok modele ürettirsin, hangisi daha iyi sonuç veriyor bakalım").
// Fotoğraf bulunamayan taslaklarda (günlük sınır kadarında) bütün bağlı modeller aynı anda üretir; tablo son 30 günü sayar.
type Aday = { model: string; url?: string; gecti: boolean; puan: number; hata?: string; sure: number };
function GorselKiyas({ ayar }: { ayar: (k: string, v: unknown, m: string) => Promise<void> }) {
  const { v } = useMasa();
  const k = { acik: true, gunluk: 3, ...((v.ayarlar.gorsel_kiyas ?? {}) as { acik?: boolean; gunluk?: number }) };
  const [gunluk, setGunluk] = useState(String(k.gunluk));
  const [satirlar, setSatirlar] = useState<{ image: Record<string, unknown> }[] | null>(null);
  useEffect(() => {
    sb.from("tr_drafts").select("image").eq("image->>yz_kiyas", "true").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(300)
      .then(({ data }) => setSatirlar((data ?? []) as { image: Record<string, unknown> }[]));
  }, []);
  const tablo = new Map<string, { uretildi: number; denendi: number; gecti: number; puan: number; otomatik: number; editor: number; sure: number }>();
  for (const r of satirlar ?? []) {
    const img = r.image as { yz_adaylar?: Aday[]; yz_model?: string; yz_secen?: string };
    for (const a of img.yz_adaylar ?? []) {
      const t = tablo.get(a.model) ?? { uretildi: 0, denendi: 0, gecti: 0, puan: 0, otomatik: 0, editor: 0, sure: 0 };
      t.denendi++; if (!a.hata) { t.uretildi++; t.puan += a.puan; t.sure += a.sure; } if (a.gecti) t.gecti++;
      if (img.yz_model === a.model) img.yz_secen === "editor" ? t.editor++ : t.otomatik++;
      tablo.set(a.model, t);
    }
  }
  const sirali = [...tablo.entries()].sort((a, b) => (b[1].editor + b[1].otomatik) - (a[1].editor + a[1].otomatik) || b[1].puan / Math.max(1, b[1].uretildi) - a[1].puan / Math.max(1, a[1].uretildi));
  return (
    <div className="panel">
      <h3>Görsel model kıyası</h3>
      <div className="muted">Uygun fotoğraf bulunamayan taslaklarda bağlı bütün modeller (Cloudflare FLUX.2 klein ve dev, Lucid Origin; anahtar girilmişse GPT Image ve Nano Banana) aynı anda görsel üretir. Her görsel yedi katmanlı denetimden geçer; en yüksek puanlı kapak olur, editör taslakta başkasını seçebilir. Günlük sınırın dışındaki taslaklarda tek model çalışır.</div>
      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={k.acik} onChange={(e) => ayar("gorsel_kiyas", { ...k, acik: e.target.checked }, e.target.checked ? "Kıyas açıldı." : "Kıyas kapatıldı.")} /> Kıyas açık</label>
        <label className="row" style={{ gap: 6 }}>Günde en çok <input type="number" min={1} max={50} value={gunluk} onChange={(e) => setGunluk(e.target.value)} style={{ width: 70 }} /> taslak</label>
        <button className="btn sm" onClick={() => ayar("gorsel_kiyas", { ...k, gunluk: Math.max(1, Math.min(50, Number(gunluk) || 3)) }, "Günlük sınır kaydedildi.")}>Kaydet</button>
      </div>
      {!satirlar ? <div className="muted">Yükleniyor…</div> : !sirali.length ? <div className="muted">Henüz kıyas yok; ilk görselsiz taslakta başlar.</div> : (
        <div className="tbl"><table>
          <thead><tr><th>Model</th><th>Denendi</th><th>Üretti</th><th>Denetimden geçti</th><th>Ort. puan</th><th>Kapak oldu</th><th>Editör seçti</th><th>Ort. süre</th><th>Tahmini maliyet</th></tr></thead>
          <tbody>{sirali.map(([m, t]) => (
            <tr key={m}><td><b>{MODEL_AD[m] ?? m}</b></td><td>{t.denendi}</td><td>{t.uretildi}</td><td>{t.gecti}</td>
              <td>{t.uretildi ? (t.puan / t.uretildi).toLocaleString("tr", { maximumFractionDigits: 1 }) : "–"}</td><td>{t.otomatik + t.editor}</td><td>{t.editor}</td>
              <td>{t.uretildi ? Math.round(t.sure / t.uretildi / 1000) + " sn" : "–"}</td><td>{(t.uretildi * (MODEL_UCRET[m] ?? 0)).toLocaleString("tr", { style: "currency", currency: "USD" })}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      <div className="muted">Cloudflare modelleri günlük ücretsiz payla çalışır; pay biterse o gün "üretilemedi" görünür ve ücret çıkmaz. Maliyet sütunu bu durumda üst sınırdır.</div>
    </div>
  );
}

// Yazı karşılaştırması (4 Kasım 2026): her taslakta Claude ve Gemini aynı haberi yazar; editörün kör seçimi ve denetimin düzeltme sayısı.
function YaziKiyas() {
  const [satirlar, setSatirlar] = useState<{ qc: Record<string, unknown> | null }[] | null>(null);
  useEffect(() => {
    sb.from("tr_drafts").select("qc").not("qc->ab", "is", null).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()).limit(500)
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
  return (
    <div className="panel">
      <h3>Yazı karşılaştırması (Claude · Gemini)</h3>
      <div className="muted">Her taslakta iki model aynı haberi yazar ve kendi denetiminden geçer. Editör hangisinin kimden geldiğini bilmeden seçer. Ana taslak Claude'unki. Son 30 gün.</div>
      {!satirlar ? <div className="muted">Yükleniyor…</div> : !s.toplam ? <div className="muted">Henüz karşılaştırma yok; ilk taslakla başlar.</div> : (
        <div className="tbl"><table>
          <thead><tr><th>Model</th><th>Editör seçti</th><th>Seçim oranı</th><th>Denetimin düzeltmesi (ort.)</th><th>Değişen paragraf (ort.)</th></tr></thead>
          <tbody>
            <tr><td><b>Claude</b></td><td>{s.claude}</td><td>{secilen ? Math.round((s.claude / secilen) * 100) + "%" : "–"}</td><td>{ort(s.cDuz)}</td><td>{ort(s.cPar)}</td></tr>
            <tr><td><b>Gemini</b></td><td>{s.gemini}</td><td>{secilen ? Math.round((s.gemini / secilen) * 100) + "%" : "–"}</td><td>{ort(s.gDuz)}</td><td>{ort(s.gPar)}</td></tr>
          </tbody>
        </table></div>
      )}
      {!!s.toplam && <div className="muted">{s.toplam} karşılaştırma · {s.bekliyor} seçim bekliyor. Düzeltme sayısı az olan, denetime daha temiz metin teslim etmiş demektir.</div>}
    </div>
  );
}
