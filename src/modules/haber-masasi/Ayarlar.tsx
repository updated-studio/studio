import { useState, type FormEvent } from "react";
import { sb } from "../../shared/supabase";
import { hataMetni, useToast } from "../../shared/toast";
import { HABER_TURLERI } from "./oncelik";
import { zamanOnce } from "./ortak";
import { useMasa } from "./veri";
import { OTO_VARSAYILAN, type OtoAyar } from "../../../supabase/functions/triyaj-taslak/secim.ts";
import { USLUP_VARSAYILAN } from "../../../supabase/functions/triyaj-taslak/uslup.ts";

// Sadece yöneticiler: otomatik taslak ve WordPress, saklama süresi, gürültü kelimeleri, Türkiye pazarı markaları, basın kiti.
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
      <WordPress ayar={ayar} />
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

/** Otomatik taslak (ARCHITECTURE.md, 15 Ekim 2026): en güçlü haberlere taslak + WordPress'e taslak gönderimi. */
function OtomatikTaslak({ ayar }: { ayar: AyarYaz }) {
  const { v } = useMasa();
  const [a, setA] = useState<OtoAyar>({ ...OTO_VARSAYILAN, ...((v.ayarlar.oto_taslak ?? {}) as Partial<OtoAyar>) });
  const son = (v.ayarlar.oto_son ?? {}) as { zaman?: string; durum?: string; haber?: string; editor?: string; puan?: number; bugun?: number };
  const sinir = { gunluk: [1, 200], esik: [40, 150], bekle_dk: [0, 240], tur_basina: [1, 3] } as const;
  const sayi = (k: keyof typeof sinir) => (
    <input type="text" inputMode="numeric" value={String(a[k])} style={{ width: 80 }} aria-label={k}
      onChange={(e) => setA({ ...a, [k]: Number(e.target.value.replace(/\D/g, "")) || 0 } as OtoAyar)} />
  );
  return (
    <div className="panel">
      <h3>Otomatik taslak</h3>
      <div className="muted">Öncelik puanı eşiği geçen haberlere (en yüksek puandan başlayarak) taslak, düğmeye basılmadan hazırlanır ve ilgi alanı en uygun editöre verilir. Eşleşen editör yoksa haber havuzda sahipsiz kalır. Taslak WordPress'e de <b>taslak</b> olarak gider; yayına basma kararı editörde.</div>
      <label className="row"><input type="checkbox" checked={a.acik} onChange={(e) => setA({ ...a, acik: e.target.checked })} /> Otomatik taslak açık</label>
      <label className="row"><input type="checkbox" checked={a.wordpress} onChange={(e) => setA({ ...a, wordpress: e.target.checked })} /> Hazırlanan taslağı WordPress'e taslak olarak gönder</label>
      <div className="row">Günde en fazla {sayi("gunluk")} taslak</div>
      <div className="row">En az {sayi("esik")} puan <span className="muted">(70 = Öncelik 1, 40 = Öncelik 2)</span></div>
      <div className="row">Haber düştükten {sayi("bekle_dk")} dk sonra <span className="muted">(diğer kaynaklar aynı karta birleşsin diye)</span></div>
      <div className="row">Her turda (10 dk) en fazla {sayi("tur_basina")} farklı haber <span className="muted">(aynı haberin diğer kartları yazılmaz)</span></div>
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
        setA(temiz); ayar("oto_taslak", temiz, "Otomatik taslak ayarları kaydedildi.");
      }}>Kaydet</button></div>
      {son.zaman && (
        <div className="muted">Son çalışma: {zamanOnce(son.zaman)} önce · {son.durum}{son.haber ? ` · "${son.haber}" (${son.puan} puan) → ${son.editor || "sahipsiz"}` : ""}{son.bugun !== undefined ? ` · bugün ${son.bugun}/${a.gunluk}` : ""}</div>
      )}
    </div>
  );
}

/** WordPress bağlantısı: bilgiler Supabase Secrets'ta (WP_URL, WP_USER, WP_APP_PASSWORD); burada sadece denenir. */
function WordPress({ ayar }: { ayar: AyarYaz }) {
  const { v } = useMasa();
  const [sonuc, setSonuc] = useState<{ ok: boolean; hata?: string; kullanici?: string; roller?: string[]; kategori?: number; site?: string; uyari?: string } | null>(null);
  const [suruyor, setSuruyor] = useState(false);
  const kategoriler = ((v.ayarlar.wp_kategoriler ?? {}) as { liste?: { id: number; name: string; slug: string }[] }).liste ?? [];
  async function dene() {
    setSuruyor(true);
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { wp_dene: true } });
    setSuruyor(false);
    setSonuc(error ? { ok: false, hata: error.message } : data);
  }
  return (
    <div className="panel">
      <h3>WordPress bağlantısı</h3>
      <div className="muted">Stüdyo, WordPress'teki ayrı bir "Stüdyo" kullanıcısıyla (rolü Editör) ve onun uygulama şifresiyle bağlanır. Şifre burada değil, sadece Supabase'in gizli bilgiler bölümünde durur.</div>
      <div><button className="btn sm" onClick={dene} disabled={suruyor}>{suruyor ? "Deneniyor…" : "Bağlantıyı dene"}</button></div>
      {sonuc && (sonuc.ok
        ? <div className="msg good">Bağlandı: {sonuc.site} · kullanıcı {sonuc.kullanici} ({(sonuc.roller ?? []).join(", ")}) · {sonuc.kategori} kategori okundu.{sonuc.uyari ? " " + sonuc.uyari : ""}</div>
        : <div className="msg err">{sonuc.hata}</div>)}
      {kategoriler.length > 0 && (
        <label>Yapay zekâ uygun kategori bulamazsa
          <select value={String(v.ayarlar.wp_varsayilan_kategori ?? "")} onChange={(e) => ayar("wp_varsayilan_kategori", Number(e.target.value) || 0, "Varsayılan kategori kaydedildi.")}>
            <option value="">WordPress'in varsayılanı</option>
            {kategoriler.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
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
