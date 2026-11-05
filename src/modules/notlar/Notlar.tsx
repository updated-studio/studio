import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { useVeri } from "../../shared/veri";
import { araSira, useAgac, type Klasor, type Sayfa } from "./notVeri";
import NotSayfa from "./NotSayfa";
import "./notlar.css";

// Ekip notları (5 Kasım 2026, kullanıcı: "ekibin ortak çalışabileceği not sistemi; kimin ne eklediği görünecek, ne katkı sağladığı belli
// olacak; bir yorumun üstüne not veya yorum eklenebilecek; klasörleme ve sayfa açma; Craft notes gibi ufak çaplı"; "kilitleyebilme olsun").
// Solda klasör/sayfa ağacı, sağda açık sayfa (NotSayfa). Açık sayfa adreste: #/notlar?s=<id>. Veri ve kurallar: göç 0068, notVeri.ts.
export default function Notlar() {
  const agac = useAgac();
  const { klasorler, sayfalar, durum } = agac;
  const [sp, setSp] = useSearchParams();
  const secili = Number(sp.get("s")) || null;
  const sayfa = sayfalar.find((s) => s.id === secili) ?? null;
  const ac = (id: number | null) => setSp(id ? { s: String(id) } : {}, { replace: false });
  const [agacAcik, setAgacAcik] = useState(false); // telefonda sayfa açıkken ağaç
  useEffect(() => { setAgacAcik(false); }, [secili]);

  if (durum === "kurulmamis") return (
    <section className="nt-bos-ekran"><h1>Notlar</h1><p className="muted">Notlar kuruluyor: veritabanı güncellemesi (göç 0068) yönetici onayı bekliyor. Onaylanınca bu sayfa kendiliğinden açılır.</p></section>
  );
  if (durum === "hata") return <section className="nt-bos-ekran"><h1>Notlar</h1><p className="muted">Notlar yüklenemedi. <button className="linkbtn" onClick={agac.yukle}>Yeniden dene</button></p></section>;

  return (
    <div className={"nt" + (sayfa ? " sayfali" : "") + (agacAcik ? " agac-acik" : "")}>
      <Agac agac={agac} secili={secili} ac={ac} />
      <div className="nt-ana">
        {sayfa ? <>
          <button className="nt-tel-geri linkbtn" onClick={() => setAgacAcik(true)}>‹ Sayfalar</button>
          <NotSayfa key={sayfa.id} sayfa={sayfa} yol={yolu(sayfa, sayfalar, klasorler)} altlar={sayfalar.filter((s) => s.ust_id === sayfa.id)} ac={ac} klasorler={klasorler} />
        </> : durum === "yukleniyor" ? <p className="muted nt-bekle">Yükleniyor…</p>
          : <IlkEkran sayisi={sayfalar.length} yeni={() => yeniSayfa(null, null, sayfalar).then((id) => id && ac(id))} son={[...sayfalar].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8)} ac={ac} />}
      </div>
    </div>
  );
}

/** Sayfanın üst zinciri (klasörler ve üst sayfalar) */
function yolu(s: Sayfa, sayfalar: Sayfa[], klasorler: Klasor[]): string[] {
  const out: string[] = [];
  let p: Sayfa | undefined = s, kid: number | null = null;
  while (p) { kid = p.klasor_id; p = p.ust_id ? sayfalar.find((x) => x.id === p!.ust_id) : undefined; if (p) out.unshift(p.baslik || "Başlıksız"); }
  let k = klasorler.find((x) => x.id === kid);
  while (k) { out.unshift(k.ad); k = k.ust_id ? klasorler.find((x) => x.id === k!.ust_id) : undefined; }
  return out;
}

export async function yeniSayfa(klasor: number | null, ust: number | null, sayfalar: Sayfa[]): Promise<number | null> {
  const kardes = sayfalar.filter((s) => s.klasor_id === (ust ? null : klasor) && s.ust_id === ust);
  const { data: o } = await sb.auth.getUser();
  const { data, error } = await sb.from("not_sayfalar").insert({ klasor_id: ust ? null : klasor, ust_id: ust, baslik: "", sira: araSira(kardes.at(-1)?.sira), olusturan: o.user?.id }).select("id").single();
  return error ? null : (data as { id: number }).id;
}

function IlkEkran({ sayisi, yeni, son, ac }: { sayisi: number; yeni: () => void; son: Sayfa[]; ac: (id: number) => void }) {
  const { veri } = useVeri();
  const ad = (id: string | null) => veri.profiles.find((p) => p.id === id)?.name ?? "Biri";
  return (
    <section className="nt-ilk">
      <p className="muted">Ekibin ortak defteri. Her satırın kimden geldiği görünür; satırlara yorum yazılır, yorumlara cevap verilir. Klasör ya da sayfa kilitlenebilir.</p>
      <div><button className="btn" onClick={yeni}>Yeni sayfa</button></div>
      {sayisi > 0 && <>
        <h2>Son değişenler</h2>
        <ul className="nt-son">{son.map((s) => <li key={s.id}><button className="linkbtn" onClick={() => ac(s.id)}><b>{s.baslik || "Başlıksız"}</b></button><span className="muted">{ad(s.guncelleyen)} · {new Date(s.updated_at).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></li>)}</ul>
      </>}
    </section>
  );
}

const ACIK_ANAHTAR = "notlar-acik-klasorler";
function Agac({ agac, secili, ac }: { agac: ReturnType<typeof useAgac>; secili: number | null; ac: (id: number | null) => void }) {
  const { klasorler, sayfalar } = agac;
  const toast = useToast();
  const [acik, setAcik] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(ACIK_ANAHTAR) ?? "[]")); } catch { return new Set(); } });
  const degis = (k: string, ac?: boolean) => setAcik((x) => {
    const y = new Set(x); if (ac ?? !y.has(k)) y.add(k); else y.delete(k);
    try { localStorage.setItem(ACIK_ANAHTAR, JSON.stringify([...y])); } catch { /* depolama kapalı */ }
    return y;
  });
  // Seçili sayfanın üstleri açık olsun
  useEffect(() => {
    let p = sayfalar.find((s) => s.id === secili);
    const ekle: string[] = [];
    while (p) { if (p.ust_id) ekle.push("s" + p.ust_id); else if (p.klasor_id) { let k = klasorler.find((x) => x.id === p!.klasor_id); while (k) { ekle.push("k" + k.id); k = klasorler.find((x) => x.id === k!.ust_id); } } p = sayfalar.find((s) => s.id === p!.ust_id); }
    ekle.forEach((k) => degis(k, true));
  }, [secili, sayfalar.length, klasorler.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const [duzenle, setDuzenle] = useState<number | null>(null);
  async function yeniKlasor(ust: number | null) {
    const { data: o } = await sb.auth.getUser();
    const kardes = klasorler.filter((k) => k.ust_id === ust);
    const { data, error } = await sb.from("not_klasorler").insert({ ad: "Yeni klasör", ust_id: ust, sira: araSira(kardes.at(-1)?.sira), olusturan: o.user?.id }).select("id").single();
    if (error) { toast("Klasör açılamadı: " + error.message); return; }
    if (ust) degis("k" + ust, true);
    await agac.yukle(); setDuzenle((data as { id: number }).id);
  }
  async function sayfaEkle(klasor: number | null, ust: number | null) {
    const id = await yeniSayfa(klasor, ust, sayfalar);
    if (!id) { toast("Sayfa açılamadı."); return; }
    if (klasor) degis("k" + klasor, true); if (ust) degis("s" + ust, true);
    await agac.yukle(); ac(id);
  }

  const sayfaSatiri = (s: Sayfa, derinlik: number): React.ReactNode => {
    const altlar = sayfalar.filter((x) => x.ust_id === s.id);
    const a = acik.has("s" + s.id);
    return (
      <li key={"s" + s.id}>
        <div className={"nt-satir" + (s.id === secili ? " on" : "")} style={{ paddingLeft: 8 + derinlik * 14 }}>
          <button className="nt-ok" aria-label={a ? "Kapat" : "Aç"} aria-expanded={a} disabled={!altlar.length} onClick={() => degis("s" + s.id)}>{altlar.length ? <Ok acik={a} /> : <Nokta />}</button>
          <button className="nt-ad" onClick={() => ac(s.id)}>{s.baslik || <span className="muted">Başlıksız</span>}</button>
          {s.kilitli && <Kilit />}
          <button className="nt-ekle" aria-label="Alt sayfa ekle" title="Alt sayfa ekle" onClick={() => sayfaEkle(null, s.id)}>+</button>
        </div>
        {a && altlar.length > 0 && <ul>{altlar.map((x) => sayfaSatiri(x, derinlik + 1))}</ul>}
      </li>
    );
  };
  const klasorSatiri = (k: Klasor, derinlik: number): React.ReactNode => {
    const a = acik.has("k" + k.id);
    const icindekiler = sayfalar.filter((s) => s.klasor_id === k.id && !s.ust_id);
    const altKlasor = klasorler.filter((x) => x.ust_id === k.id);
    return (
      <li key={"k" + k.id}>
        <div className="nt-satir klasor" style={{ paddingLeft: 8 + derinlik * 14 }}>
          <button className="nt-ok" aria-label={a ? "Kapat" : "Aç"} aria-expanded={a} onClick={() => degis("k" + k.id)}><Ok acik={a} /></button>
          {duzenle === k.id
            ? <input className="nt-ad-gir" autoFocus defaultValue={k.ad} aria-label="Klasör adı" onBlur={(e) => { klasorAdi(k, e.target.value); setDuzenle(null); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setDuzenle(null); }} />
            : <button className="nt-ad" onClick={() => degis("k" + k.id)} onDoubleClick={() => setDuzenle(k.id)}>{k.ad}</button>}
          {k.kilitli && <Kilit />}
          <KlasorMenu k={k} sayfaSayisi={icindekiler.length + altKlasor.length} adlandir={() => setDuzenle(k.id)} sayfa={() => sayfaEkle(k.id, null)} klasor={() => yeniKlasor(k.id)} yenile={agac.yukle} />
        </div>
        {a && <ul>
          {altKlasor.map((x) => klasorSatiri(x, derinlik + 1))}
          {icindekiler.map((s) => sayfaSatiri(s, derinlik + 1))}
          {!altKlasor.length && !icindekiler.length && <li className="nt-bos" style={{ paddingLeft: 36 + derinlik * 14 }}><button className="linkbtn" onClick={() => sayfaEkle(k.id, null)}>Bu klasöre sayfa ekle</button></li>}
        </ul>}
      </li>
    );
  };
  async function klasorAdi(k: Klasor, ad: string) {
    const t = ad.trim();
    if (!t || t === k.ad) return;
    agac.setKlasorler((l) => l.map((x) => (x.id === k.id ? { ...x, ad: t } : x)));
    const { error } = await sb.from("not_klasorler").update({ ad: t }).eq("id", k.id);
    if (error) toast("Ad kaydedilemedi: " + error.message);
  }

  const kokSayfalar = useMemo(() => sayfalar.filter((s) => !s.klasor_id && !s.ust_id), [sayfalar]);
  return (
    <nav className="nt-agac" aria-label="Not sayfaları">
      <div className="nt-agac-bas">
        <button className="linkbtn nt-baslik" onClick={() => ac(null)}>Notlar</button>
        <span className="nt-agac-eylem"><button className="btn ghost sm" onClick={() => yeniKlasor(null)}>Klasör</button><button className="btn sm" onClick={() => sayfaEkle(null, null)}>Sayfa</button></span>
      </div>
      <ul className="nt-liste">
        {klasorler.filter((k) => !k.ust_id).map((k) => klasorSatiri(k, 0))}
        {kokSayfalar.map((s) => sayfaSatiri(s, 0))}
        {!klasorler.length && !sayfalar.length && <li className="nt-bos muted">Henüz not yok.</li>}
      </ul>
    </nav>
  );
}

function KlasorMenu({ k, sayfaSayisi, adlandir, sayfa, klasor, yenile }: { k: Klasor; sayfaSayisi: number; adlandir: () => void; sayfa: () => void; klasor: () => void; yenile: () => void }) {
  const [acik, setAcik] = useState<"" | "menu" | "kilit" | "sil">("");
  const toast = useToast();
  async function sil() {
    const { error } = await sb.from("not_klasorler").delete().eq("id", k.id);
    if (error) toast("Silinemedi: " + error.message); else { toast(`"${k.ad}" silindi.`); yenile(); }
    setAcik("");
  }
  return (
    <span className="nt-menu-kap">
      <button className="nt-ekle" aria-label="Klasör işlemleri" aria-expanded={!!acik} onClick={() => setAcik(acik ? "" : "menu")}>⋯</button>
      {acik === "menu" && <div className="nt-acilir" role="menu" onMouseLeave={() => setAcik("")}>
        <button role="menuitem" onClick={() => { setAcik(""); sayfa(); }}>Sayfa ekle</button>
        <button role="menuitem" onClick={() => { setAcik(""); klasor(); }}>Alt klasör ekle</button>
        <button role="menuitem" onClick={() => { setAcik(""); adlandir(); }}>Yeniden adlandır</button>
        <button role="menuitem" onClick={() => setAcik("kilit")}>{k.kilitli ? "Kilit ve izinler" : "Kilitle"}</button>
        <button role="menuitem" className="tehlike" onClick={() => setAcik("sil")}>Sil</button>
      </div>}
      {acik === "kilit" && <div className="nt-acilir genis"><KilitAyari tablo="not_klasorler" nesne={k} kapat={() => setAcik("")} /></div>}
      {acik === "sil" && <div className="nt-acilir genis">
        <p>{sayfaSayisi ? <>“{k.ad}” ve içindeki <b>{sayfaSayisi}</b> sayfa/klasör kalıcı olarak silinir.</> : <>“{k.ad}” silinir.</>}</p>
        <div className="row" style={{ gap: 8 }}><button className="btn sm tehlike" onClick={sil}>Sil</button><button className="btn ghost sm" onClick={() => setAcik("")}>Vazgeç</button></div>
      </div>}
    </span>
  );
}

/** Kilit: yalnız açan ve seçilen kişiler (yöneticiler her zaman) görür; alt klasör ve sayfalar da kilitli olur */
export function KilitAyari({ tablo, nesne, kapat }: { tablo: "not_klasorler" | "not_sayfalar"; nesne: { id: number; kilitli: boolean; izinli: string[]; olusturan: string | null }; kapat: () => void }) {
  const { profile } = useAuth();
  const { veri } = useVeri();
  const toast = useToast();
  const [kilitli, setKilitli] = useState(nesne.kilitli);
  const [izinli, setIzinli] = useState<string[]>(nesne.izinli ?? []);
  const yetkili = nesne.olusturan === profile?.id || !!profile?.is_admin;
  const acan = veri.profiles.find((p) => p.id === nesne.olusturan);
  async function kaydet() {
    const { error } = await sb.from(tablo).update({ kilitli, izinli }).eq("id", nesne.id);
    if (error) toast("Kaydedilemedi: " + error.message); else { toast(kilitli ? "Kilitlendi." : "Kilit açıldı."); kapat(); }
  }
  return (
    <div className="nt-kilit">
      <label className="nt-kilit-ana"><input type="checkbox" checked={kilitli} disabled={!yetkili} onChange={(e) => setKilitli(e.target.checked)} /><span><b>Kilitli</b><span className="muted">Yalnız {acan?.name ?? "açan kişi"}, aşağıda seçilenler ve yöneticiler görür. İçindekiler de kilitlenir.</span></span></label>
      {kilitli && <div className="nt-kisiler">
        {veri.profiles.filter((p) => p.id !== nesne.olusturan && !p.is_admin).map((p) => (
          <label key={p.id}><input type="checkbox" disabled={!yetkili} checked={izinli.includes(p.id)} onChange={(e) => setIzinli((x) => e.target.checked ? [...x, p.id] : x.filter((y) => y !== p.id))} />{p.name}</label>
        ))}
      </div>}
      {yetkili
        ? <div className="row" style={{ gap: 8 }}><button className="btn sm" onClick={kaydet}>Kaydet</button><button className="btn ghost sm" onClick={kapat}>Vazgeç</button></div>
        : <p className="muted">Kilidi yalnız {acan?.name ?? "açan kişi"} ya da bir yönetici değiştirebilir. <button className="linkbtn" onClick={kapat}>Kapat</button></p>}
    </div>
  );
}

const Ok = ({ acik }: { acik: boolean }) => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ transform: acik ? "rotate(90deg)" : undefined }}><path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Nokta = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="1.6" fill="currentColor" /></svg>;
export const Kilit = () => <svg className="nt-kilit-i" width="13" height="13" viewBox="0 0 16 16" aria-label="Kilitli" role="img"><rect x="3" y="7" width="10" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>;
