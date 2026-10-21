// Klasik şablonlar: eski Updated Post Aracı'nın bütün özellikleri, Stüdyo'nun içinde (21 Ekim 2026, Enes:
// "eskisinin özelliklerini yenisine getir, birebir tüm özellikler olsun").
// Çizim motoru eski araçtan birebir (motor.js). Bu dosya eski aracın arayüzünü kurar: şablon seçimi, öğe kartları
// (yazılar, yazı boyutu, görsel, çerçeve/fotoğraf, logo, katman sırası, boyut/konum/açı ayarları), önizlemede sürükleme,
// geri al / ileri al / tümünü geri al, önceki şablonun içeriğini getir, şablonu / tüm şablonları sıfırla,
// kayıtlı düzenler (ekipte ortak), kayıtları dosyaya aktarma, otomasyondan gelen postu açma, PNG indirme / paylaşma.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { sb } from "../../../shared/supabase";
import { klasik } from "./motor.js";
import OnizlemeKutu from "../OnizlemeKutu";

type Alan = { k: string; l: string; d?: string; max?: number; type?: string; help?: string; sz?: [string, string, number, number, number] };
type GorselTanim = { k: string; l: string; help?: string; in?: string; sample?: string };
type Sablon = { group: string; name: string; transparent?: boolean; fields: Alan[]; images?: GorselTanim[]; extras?: Record<string, string[]>; inner?: Record<string, [number, number]>; fixed?: { k: string; l: string }[] };
type Ayar = Record<string, number>;
type Durum = Record<string, unknown> & { _adj: Record<string, Ayar>; _order: string[]; _logo: string };
type Kayit = { n: string; s: Durum; _id?: string };
type Paket = { slides: { t: string; v: Record<string, string>; img?: boolean }[]; img: string };

const T = klasik.T as Record<string, Sablon>;
const SAKLA = "updated-post-araci-v4"; // eski araçla aynı anahtar: yazdıkların bu tarayıcıda kalır

const pct = (v: number) => Math.round(v * 100) + "%", pxf = (v: number) => (v > 0 ? "+" : "") + Math.round(v), deg = (v: number) => Math.round(v) + "°", oto = (v: number) => (v > 0 ? String(Math.round(v)) : "otomatik");
const SL: Record<string, { l: string; min: number; max: number; step: number; def: number; fmt: (v: number) => string }> = {
  s: { l: "Boyut", min: 0.3, max: 3, step: 0.01, def: 1, fmt: pct }, x: { l: "Yatay", min: -700, max: 700, step: 2, def: 0, fmt: pxf }, y: { l: "Dikey", min: -900, max: 900, step: 2, def: 0, fmt: pxf }, r: { l: "Açı", min: -180, max: 180, step: 1, def: 0, fmt: deg },
  w: { l: "Genişlik", min: 0, max: 1080, step: 4, def: 0, fmt: oto }, h: { l: "Yükseklik", min: 0, max: 1350, step: 4, def: 0, fmt: oto }, ls: { l: "Etiket yazısı", min: 0, max: 64, step: 1, def: 0, fmt: oto }, vs: { l: "Değer yazısı", min: 0, max: 160, step: 1, def: 0, fmt: oto },
  iz: { l: "Fotoğraf boyutu", min: 0.3, max: 5, step: 0.01, def: 1, fmt: pct }, ix: { l: "Fotoğraf yatay", min: -300, max: 300, step: 1, def: 0, fmt: pxf }, iy: { l: "Fotoğraf dikey", min: -300, max: 300, step: 1, def: 0, fmt: pxf }, ir: { l: "Fotoğraf açısı", min: -180, max: 180, step: 1, def: 0, fmt: deg },
};
const VARS = Object.fromEntries(Object.entries(SL).map(([k, c]) => [k, c.def]));
const IPUCU = "Önizlemede bir öğeye dokun: sürükleyerek taşı, mavi köşelerden büyüt ya da küçült, turuncu noktadan döndür.";

function sira(t: string) {
  const n = T[t].name; let r = 9;
  klasik.TORDER.forEach((p: string, i: number) => { if (n.indexOf(p) === 0 && r === 9) r = i; });
  return klasik.GORDER.indexOf(T[t].group) * 100 + r * 10;
}

// Dosyayı indirir; telefonda paylaşım ekranını açar (eski aracın saveBlob'u)
async function dosyaVer(blob: Blob, ad: string, tur: string): Promise<string> {
  let f: File | null = null; try { f = new File([blob], ad, { type: tur }); } catch { /* eski tarayıcı */ }
  if (f && navigator.canShare && navigator.canShare({ files: [f] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [f] }); return "Paylaşım ekranı açıldı."; } catch (e) { return (e as Error).name === "AbortError" ? "Paylaşım iptal edildi." : "Paylaşılamadı; tekrar dene."; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = ad; document.body.appendChild(a); a.click(); a.remove();
  return "İndirme başlatıldı.";
}

// ---------- Kayıtlı düzenler: ekipte ortak (icerik_duzenler, sablon = "klasik:<şablon>") ----------
async function kayitlariAl(): Promise<Record<string, Kayit[]>> {
  const { data, error } = await sb.from("icerik_duzenler").select("id,ad,sablon,serbest,created_at").like("sablon", "klasik:%").order("created_at", { ascending: false }).limit(1000);
  if (error) throw error;
  const o: Record<string, Kayit[]> = {};
  for (const x of data ?? []) { const t = String(x.sablon).slice(7); (o[t] ??= []).push({ n: x.ad, s: x.serbest as Durum, _id: x.id }); }
  return o;
}

function Kaydirac({ ad, c, deger, degistir }: { ad: string; c: (typeof SL)[string]; deger: number; degistir: (v: number) => void }) {
  return (
    <label className="ie-kontrol"><span>{ad}</span>
      <input type="range" min={c.min} max={c.max} step={c.step} value={deger} onChange={(e) => degistir(parseFloat(e.target.value))} />
      <output>{c.fmt(deger)}</output>
    </label>
  );
}

export default function KlasikEditor() {
  const [hazir, setHazir] = useState(false);
  const [, yenile] = useReducer((x: number) => x + 1, 0);
  const [secim, setSecim] = useState<{ k: string | null; ic: boolean }>({ k: null, ic: false });
  const [acikAyar, setAcikAyar] = useState<Record<string, boolean>>({});
  const [mesaj, setMesaj] = useState("");
  const [sifirlaOnay, setSifirlaOnay] = useState(false);
  const [kayitlar, setKayitlar] = useState<Record<string, Kayit[]> | null>(null);
  const [kayitMesaj, setKayitMesaj] = useState("");
  const [kayitAd, setKayitAd] = useState("");
  const [paket, setPaket] = useState<Paket | null>(null);
  const [paketSlayt, setPaketSlayt] = useState(-1);
  const [kod, setKod] = useState("");
  const [aktarMesaj, setAktarMesaj] = useState("");
  const ana = useRef<HTMLCanvasElement>(null), ust = useRef<HTMLCanvasElement>(null);
  const kartlar = useRef<HTMLDivElement>(null);

  // Motoru hazırla, kayıtlı yazıları geri yükle, değişiklikleri dinle
  useEffect(() => {
    let iptal = false;
    klasik.dinle({
      kaydet: () => { try { localStorage.setItem(SAKLA, JSON.stringify(klasik.disari())); } catch { /* depolama kapalı */ } },
      degisti: () => yenile(),
      secim: (k: string | null, ic: boolean) => setSecim({ k, ic }),
    });
    klasik.hazirla().then(() => {
      if (iptal) return;
      try { klasik.yukle(JSON.parse(localStorage.getItem(SAKLA) || "null")); } catch { /* bozuk kayıt */ }
      setHazir(true);
      const fs = ["900 44px 'Big Shoulders Display'", "400 34px Inter", "500 26px Inter", "600 28px Inter", "700 88px Inter", "800 330px Inter", "500 26px 'IBM Plex Mono'", "600 28px 'IBM Plex Mono'"];
      Promise.all(fs.map((f) => document.fonts.load(f, "İğüşöç 0123"))).then(() => klasik.ciz(), () => klasik.ciz());
      document.fonts.ready.then(() => klasik.ciz());
    });
    return () => { iptal = true; klasik.dinle({ kaydet: null, degisti: null, secim: null }); };
  }, []);
  useEffect(() => {
    if (!hazir || !ana.current || !ust.current) return;
    return klasik.bagla(ana.current, ust.current);
  }, [hazir]);

  const kayitlariYenile = useCallback(() => {
    kayitlariAl().then(setKayitlar).catch((e) => { setKayitlar({}); setKayitMesaj("Ortak kayıtlar alınamadı: " + (e as Error).message); });
  }, []);
  useEffect(() => { kayitlariYenile(); }, [kayitlariYenile]);

  // Seçili öğenin kartını görünür yap
  useEffect(() => {
    if (!secim.k || !kartlar.current) return;
    const el = kartlar.current.querySelector<HTMLElement>(`[data-k="${CSS.escape(secim.k)}"]`);
    if (el && window.matchMedia("(min-width: 900px)").matches) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [secim.k]);

  const sablonlar = useMemo(() => Object.keys(T).sort((a, b) => sira(a) - sira(b)), []);
  if (!hazir) return <div className="muted">Post editörü yükleniyor…</div>;

  const t: string = klasik.cur, S = T[t], s = klasik.state[t] as Durum, im = klasik.images[t] as Record<string, unknown>;
  const prevT: string | null = klasik.prevT;

  // ---- Öğe kartları (eski buildFields ile aynı kurallar) ----
  const alanOf: Record<string, Alan> = {}; S.fields.forEach((f) => { alanOf[f.k] = f; });
  const katmanlar = klasik.probe(t) as { k: string; l: string; f?: string[] }[];
  const sahip: Record<string, 1> = {};
  type Mod = { k: string; l: string; fk: string[]; tasinir: boolean };
  const modlar: Mod[] = [];
  katmanlar.forEach((l) => { const fk = (l.f || [l.k]).filter((k) => alanOf[k] && !sahip[k]); fk.forEach((k) => { sahip[k] = 1; }); modlar.push({ k: l.k, l: l.l, fk, tasinir: true }); });
  (S.fixed || []).forEach((f) => modlar.push({ k: f.k, l: f.l, fk: [], tasinir: false }));
  const gorselli = (m: Mod) => (S.images || []).some((g) => (g.in || g.k) === m.k);
  const ilk = (m: Mod) => m.fk.reduce((i, k) => Math.min(i, S.fields.indexOf(alanOf[k])), 999);
  modlar.sort((a, b) => (gorselli(a) ? -1 : ilk(a)) - (gorselli(b) ? -1 : ilk(b)));
  const serbestAlanlar = S.fields.filter((f) => !sahip[f.k]);

  const ipucu = (() => {
    const m = modlar.find((x) => x.k === secim.k); if (!m) return IPUCU;
    if (secim.ic && klasik.hasInner(m.k)) return "Seçili: çerçevedeki fotoğraf. Sürükle: kadraj. Köşe: fotoğrafı büyüt. Tekrar dokun: çerçeveye dön.";
    return "Seçili: " + m.l + (klasik.hasInner(m.k) ? " (çerçeve). Sürükle, köşeden boyutlandır. Tekrar dokun: içindeki fotoğraf." : ". Sürükle, köşeden boyutlandır, turuncu noktadan döndür.");
  })();

  function alanEl(f: Alan, ciplak: boolean) {
    const v = String(s[f.k] ?? ""), sayac = f.max ? <span className={"muted" + (v.length > f.max ? " ie-asim" : "")}>{v.length} / {f.max}</span> : null;
    const giris = f.type === "area"
      ? <textarea rows={4} spellCheck={false} value={v} aria-label={ciplak ? f.l : undefined} onChange={(e) => klasik.alan(f.k, e.target.value)} />
      : <input type="text" autoComplete="off" value={v} aria-label={ciplak ? f.l : undefined} onChange={(e) => klasik.alan(f.k, e.target.value)} />;
    let boyut: ReactNode = null;
    if (f.sz && s._adj[f.sz[0]]) {
      const [kat, ank, vars, min, max] = f.sz, deger = s._adj[kat][ank] > 0 ? s._adj[kat][ank] : vars;
      boyut = (
        <label className="ie-kontrol"><span>Yazı boyutu</span>
          <input type="range" min={min} max={max} step={1} value={deger} onChange={(e) => klasik.ayar(kat, ank, parseFloat(e.target.value), "sz:" + f.k)} />
          <output>{deger}</output>
        </label>
      );
    }
    return (
      <div key={f.k} className="ie-grup ie-alan">
        {ciplak ? (sayac && <div className="row" style={{ justifyContent: "flex-end" }}>{sayac}</div>) : <div className="row" style={{ justifyContent: "space-between" }}><span>{f.l}</span>{sayac}</div>}
        {giris}{boyut}
        {f.help && <div className="muted">{f.help}</div>}
      </div>
    );
  }
  function gorselEl(g: GorselTanim) {
    return (
      <div key={"g-" + g.k} className="ie-grup">
        <span>{g.l}</span>
        <input type="file" accept="image/*" onChange={(e) => {
          const fl = e.target.files?.[0]; if (!fl) return;
          klasik.loadImg(URL.createObjectURL(fl)).then((i: HTMLImageElement) => { klasik.gorsel(g.k, i); setMesaj(""); }).catch(() => setMesaj("Görsel açılamadı; başka bir dosya dene."));
        }} />
        {g.help && <div className="muted">{g.help}</div>}
        <div><button type="button" className="btn ghost sm" disabled={!im[g.k]} onClick={() => klasik.gorsel(g.k, null)}>Görseli kaldır</button></div>
      </div>
    );
  }

  async function svgIndir() {
    setMesaj("Hazırlanıyor…");
    try {
      const { seffafSvg } = await import("./seffafSvg");
      const svg = await seffafSvg();
      setMesaj(await dosyaVer(new Blob([svg], { type: "image/svg+xml" }), "updated-" + t + ".svg", "image/svg+xml"));
    } catch (e) { setMesaj("SVG oluşturulamadı: " + (e as Error).message); }
  }

  async function pngIndir() {
    setMesaj("Hazırlanıyor…");
    klasik.hemenCiz(); // seçim çerçevesi ayrı tuvalde; ana tuval temiz
    const cv: HTMLCanvasElement = klasik.kanvas();
    cv.toBlob(async (b) => { if (!b) { setMesaj("Görsel oluşturulamadı."); return; } setMesaj(await dosyaVer(b, "updated-" + t + "-post.png", "image/png")); }, "image/png");
  }

  // ---- Kayıtlı düzenler ----
  async function kaydet() {
    const ad = (kayitAd.trim() || S.name + " " + new Date().toLocaleDateString("tr-TR")).slice(0, 40);
    const eski = (kayitlar?.[t] || []).filter((x) => x.n === ad && x._id).map((x) => x._id!);
    const { error } = await sb.from("icerik_duzenler").insert({ ad, sablon: "klasik:" + t, serbest: JSON.parse(JSON.stringify(s)) });
    if (error) { setKayitMesaj("Kaydedilemedi: " + error.message); return; }
    if (eski.length) await sb.from("icerik_duzenler").delete().in("id", eski); // aynı adlı eski kayıt yenisiyle değişir (eski araçtaki gibi)
    setKayitAd(""); setKayitMesaj(`"${ad}" kaydedildi. Ekipteki herkes görebilir.`); kayitlariYenile();
  }
  async function kayitSil(x: Kayit) {
    const { data, error } = await sb.from("icerik_duzenler").delete().eq("id", x._id!).select("id");
    if (error) setKayitMesaj("Silinemedi: " + error.message);
    else if (!data?.length) setKayitMesaj("Bu kaydı sadece oluşturan kişi ya da yönetici silebilir.");
    else setKayitMesaj("Kayıt silindi.");
    kayitlariYenile();
  }
  async function disaAktar() {
    const hepsi = kayitlar || {}, saves: Record<string, { n: string; s: Durum }[]> = {}; let n = 0;
    Object.keys(hepsi).forEach((k) => { saves[k] = hepsi[k].map((x) => ({ n: x.n, s: x.s })); n += saves[k].length; });
    if (!n) { setKayitMesaj("Dışa aktarılacak kayıt yok."); return; }
    const m = await dosyaVer(new Blob([JSON.stringify({ updatedKayitlar: 1, saves })], { type: "application/json" }), "updated-kayitli-duzenler.json", "application/json");
    setKayitMesaj(m === "İndirme başlatıldı." ? n + " kayıt dosyaya aktarıldı." : m);
  }
  function iceAktar(fl: File) {
    const rd = new FileReader();
    rd.onload = async () => {
      let o: { saves?: Record<string, { n: string; s: Durum }[]> } | null = null; try { o = JSON.parse(String(rd.result)); } catch { /* bozuk */ }
      if (!o || !o.saves || typeof o.saves !== "object") { setKayitMesaj('Bu dosya okunamadı. Panelden dışa aktarılan "updated-kayitli-duzenler.json" dosyasını seç.'); return; }
      const ekle: { ad: string; sablon: string; serbest: Durum }[] = [], silinecek: string[] = [];
      Object.keys(o.saves).forEach((k) => {
        if (!T[k] || !Array.isArray(o!.saves![k])) return;
        o!.saves![k].forEach((sv) => {
          if (!sv || typeof sv.n !== "string" || !sv.s || typeof sv.s !== "object") return;
          (kayitlar?.[k] || []).filter((x) => x.n === sv.n && x._id).forEach((x) => silinecek.push(x._id!));
          ekle.push({ ad: sv.n.slice(0, 40), sablon: "klasik:" + k, serbest: sv.s });
        });
      });
      if (!ekle.length) { setKayitMesaj("Dosyada bu panele uygun kayıt yok."); return; }
      const { error } = await sb.from("icerik_duzenler").insert(ekle);
      if (error) { setKayitMesaj("İçe aktarılamadı: " + error.message); return; }
      if (silinecek.length) await sb.from("icerik_duzenler").delete().in("id", silinecek);
      setKayitMesaj(ekle.length + " kayıt içe aktarıldı ve ekiple paylaşıldı. Aynı adlı kayıtların yerine yenisi geçti.");
      kayitlariYenile();
    };
    rd.onerror = () => setKayitMesaj("Dosya okunamadı.");
    rd.readAsText(fl);
  }

  // ---- Otomasyondan gelen post ----
  function slaytAc(p: Paket, i: number) {
    const sl = p.slides[i]; klasik.doldur(sl); setPaketSlayt(i);
    const resimli = sl.img && p.img && (T[klasik.cur].images || []).some((g) => g.k === "img");
    setAktarMesaj(`${i + 1}. slayt açıldı: ${T[klasik.cur].group}, ${T[klasik.cur].name}.` + (resimli ? " Haber fotoğrafı yüklendi." : ""));
    if (resimli) { const hedef = klasik.cur; klasik.loadImg(p.img).then((g: HTMLImageElement) => { if (klasik.cur === hedef) klasik.gorsel("img", g); }).catch(() => setAktarMesaj((x) => x + " Fotoğraf açılamadı; karttan ayrıca yükle.")); }
  }
  function paketAc(fl: File) {
    const rd = new FileReader();
    rd.onload = () => {
      let o: { slides?: Paket["slides"]; img?: string } | null = null; try { o = JSON.parse(String(rd.result)); } catch { /* bozuk */ }
      if (!o || !Array.isArray(o.slides)) { setAktarMesaj('Bu dosya okunamadı. Telegram\'a gelen ".updated.json" dosyasını seç.'); return; }
      const slides = o.slides.filter((x) => x && T[x.t] && x.v && typeof x.v === "object");
      if (!slides.length) { setAktarMesaj("Dosyada açılabilecek slayt yok."); return; }
      const p = { slides, img: typeof o.img === "string" && o.img.indexOf("data:image/") === 0 ? o.img : "" };
      setPaket(p); slaytAc(p, 0);
    };
    rd.onerror = () => setAktarMesaj("Dosya okunamadı.");
    rd.readAsText(fl);
  }
  function kodAc() {
    const o = klasik.kodCoz(kod);
    if (!o) { setAktarMesaj('Kod okunamadı. "UPD1:" ile başlayan kodun tamamını yapıştır.'); return; }
    klasik.doldur(o); setKod("");
    setAktarMesaj(`Açıldı: ${T[klasik.cur].group}, ${T[klasik.cur].name}.` + ((T[klasik.cur].images || []).length ? " Fotoğrafı ilgili karttan ayrıca yükle." : ""));
  }

  const gruplar = klasik.GORDER as string[];
  return (
    <div className="ie">
      <div className="ie-sahne">
        <OnizlemeKutu>
        <div className="ie-arac">
          <div className="row">
            <button type="button" className="ie-ikon" title="Geri al" aria-label="Geri al" disabled={!klasik.geriVar()} onClick={() => { klasik.geri(); setMesaj("Son adım geri alındı."); }}>↶</button>
            <button type="button" className="ie-ikon" title="İleri al" aria-label="İleri al" disabled={!klasik.ileriVar()} onClick={() => { klasik.ileri(); setMesaj("Adım yeniden uygulandı."); }}>↷</button>
            <button type="button" className="btn ghost sm" disabled={!klasik.geriVar()} onClick={() => { klasik.hepsiniGeri(); setMesaj('Bu şablondaki tüm değişiklikler geri alındı. "İleri al" ile dönebilirsin.'); }}>Tümünü geri al</button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn sm" onClick={pngIndir} title={S.transparent ? "Saydam zeminli PNG (alfa kanallı)" : undefined}>PNG indir</button>
            {S.transparent && <button type="button" className="btn ghost sm" onClick={svgIndir} title="Vektör SVG; yazı yola çevrilmiş">SVG indir</button>}
          </div>
        </div>
        <div className={"ie-tuval" + (S.transparent ? " ie-seffaf" : "")} style={{ aspectRatio: "1080 / 1350", ["--oran" as string]: String(1080 / 1350) }}>
          <canvas ref={ana} width={1080} height={1350} role="img" aria-label="Post önizlemesi" />
          <canvas ref={ust} width={1080} height={1350} className="ie-ust" aria-hidden="true" />
        </div>
        <p className="ie-ipucu" role="status">{mesaj || ipucu}</p>
        </OnizlemeKutu>
      </div>

      <div className="ie-yan">
        <section className="panel" aria-label="Şablon">
          <label className="ie-grup"><span>Şablon</span>
            <select value={t} onChange={(e) => { klasik.sablonSec(e.target.value); setMesaj(""); }}>
              {gruplar.map((g) => (
                <optgroup key={g} label={g}>{sablonlar.filter((k) => T[k].group === g).map((k) => <option key={k} value={k}>{T[k].name}</option>)}</optgroup>
              ))}
            </select>
          </label>
          <div className="row">
            <button type="button" className="btn ghost sm" disabled={!prevT || prevT === t} onClick={() => { const n = klasik.icerikGetir(); setMesaj(n ? 'İçerik ve fotoğraf bu şablona getirildi. "Geri al" ile vazgeçebilirsin.' : "Getirilecek içerik yok."); }}>
              {prevT && prevT !== t ? `İçeriği getir: ${T[prevT].group}, ${T[prevT].name}` : "Önceki şablonun içeriğini getir"}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => { klasik.sablonuSifirla(); setMesaj('Bu şablon ilk hâline döndü. "Geri al" ile vazgeçebilirsin.'); }}>Bu şablonu sıfırla</button>
            <button type="button" className={"btn sm" + (sifirlaOnay ? "" : " ghost")} style={sifirlaOnay ? { background: "var(--orange)", color: "var(--on-orange)" } : undefined}
              onClick={() => { if (!sifirlaOnay) { setSifirlaOnay(true); window.setTimeout(() => setSifirlaOnay(false), 12000); return; } setSifirlaOnay(false); klasik.hepsiniSifirla(); setMesaj("Tüm şablonlar ilk hâline döndü."); }}>
              {sifirlaOnay ? "Evet, hepsini sıfırla" : "Tüm şablonları sıfırla"}
            </button>
          </div>
          {sifirlaOnay && (
            <div className="msg err">
              <b>{Object.keys(T).length} şablonun hepsi ilk hâline dönecek.</b>
              <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
                <li>Silinecek: tüm şablonlarda yazdığın metinler, konum, boyut, açı ve katman ayarları, logo seçimleri.</li>
                <li>Geri gelmeyecek: yüklediğin fotoğraflar. Yeniden yüklemen gerekir.</li>
                <li>Kalacak: "Kayıtlı düzenler" altındaki kayıtlar.</li>
                <li>Metin ve ayarları her şablonda "Geri al" ile tek tek geri getirebilirsin.</li>
              </ul>
              Devam etmek için turuncu düğmeye bas. <button type="button" className="btn ghost sm" onClick={() => setSifirlaOnay(false)}>Vazgeç</button>
            </div>
          )}
        </section>

        <section className="panel" aria-label="Öğeler">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 18 }}>Öğeler</h2>
            <button type="button" className="btn ghost sm" onClick={() => setAcikAyar({})}>Ayarları kapat</button>
          </div>
          <div ref={kartlar} className="ie-yan">
            {serbestAlanlar.length > 0 && (
              <div className="panel" data-k=""><b>Genel</b>{serbestAlanlar.map((f) => alanEl(f, false))}</div>
            )}
            {modlar.map((m) => {
              const pos = s._order.indexOf(m.k), n = s._order.length, acik = !!acikAyar[t + m.k];
              const tek = m.fk.length === 1 && !gorselli(m);
              const satirIci = S.fields.filter((f) => f.sz && f.sz[0] === m.k).map((f) => f.sz![1]);
              const ek = (S.extras || {})[m.k] || [];
              const anahtarlar = ["s", "x", "y", "r", ...ek.filter((k) => !satirIci.includes(k))];
              const gizliAnahtar = ek.filter((k) => satirIci.includes(k));
              const ayar = s._adj[m.k];
              return (
                <div key={m.k} data-k={m.k} className={"panel" + (secim.k === m.k ? " ie-oge" : "")} onPointerDown={() => { if (secim.k !== m.k) klasik.sec(m.k); }} onFocus={() => { if (secim.k !== m.k) klasik.sec(m.k); }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <b>{m.l}</b>
                    <span className="row" style={{ gap: 4 }}>
                      <span className="pill" title={m.tasinir ? `Katman sırası: ${pos + 1} / ${n} (büyük sayı önde)` : "Zemin katmanı"}>{m.tasinir ? `katman ${pos + 1}` : "zemin"}</span>
                      {m.tasinir && <>
                        <button type="button" className="ie-mini-btn" aria-label={m.l + ": arkaya gönder"} title="Arkaya gönder" disabled={pos === 0} onClick={() => klasik.sirala(m.k, -1)}>↓</button>
                        <button type="button" className="ie-mini-btn" aria-label={m.l + ": öne getir"} title="Öne getir" disabled={pos === n - 1} onClick={() => klasik.sirala(m.k, 1)}>↑</button>
                      </>}
                      <button type="button" className="ie-mini-btn" aria-label={m.l + ": boyut, konum ve açı"} title="Boyut, konum ve açı" aria-expanded={acik} onClick={() => setAcikAyar((o) => ({ ...o, [t + m.k]: !acik }))}>⚙</button>
                    </span>
                  </div>
                  {m.fk.map((k) => alanEl(alanOf[k], tek))}
                  {(S.images || []).filter((g) => (g.in || g.k) === m.k).map(gorselEl)}
                  {S.inner && S.inner[m.k] && (
                    <div className="ie-grup"><span className="muted">Önizlemede neyi hareket ettireyim?</span>
                      <div className="segment" role="group" aria-label="Düzenlenecek parça">
                        <button type="button" aria-pressed={secim.k === m.k && !secim.ic} onClick={(e) => { e.stopPropagation(); if (secim.k !== m.k) klasik.sec(m.k); klasik.icSec(false); }}>Çerçeve</button>
                        <button type="button" aria-pressed={secim.k === m.k && secim.ic} onClick={(e) => { e.stopPropagation(); if (secim.k !== m.k) klasik.sec(m.k); if (!klasik.hasInner(m.k)) { setMesaj("Önce bu karta bir fotoğraf yükle."); return; } klasik.icSec(true); }}>Fotoğraf</button>
                      </div>
                    </div>
                  )}
                  {(m.k === "logo" || m.k === "mast") && (
                    <label className="ie-grup"><span>Logo çeşidi</span>
                      <select value={s._logo || klasik.defLogo(t)} onChange={(e) => klasik.logoSec(e.target.value)}>
                        {(klasik.LOGOS as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </label>
                  )}
                  {acik && ayar && (
                    <div className="ie-secili">
                      {anahtarlar.map((k) => <Kaydirac key={k} ad={SL[k].l} c={SL[k]} deger={ayar[k] ?? SL[k].def} degistir={(v) => klasik.ayar(m.k, k, v)} />)}
                      <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => klasik.ayarSifirla(m.k, [...anahtarlar, ...gizliAnahtar], VARS)}>Sıfırla</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel" aria-label="Kayıtlı düzenler">
          <h2 style={{ fontSize: 18 }}>Kayıtlı düzenler</h2>
          <div className="muted">Ekipteki herkesin kaydettiği düzenler burada; bu şablonunkiler listeleniyor.</div>
          {kayitlar === null ? <div className="muted">Yükleniyor…</div>
            : !(kayitlar[t] || []).length ? <div className="muted">Bu şablon için kayıt yok.</div>
            : (kayitlar[t] || []).map((x) => (
              <div key={x._id} className="row" style={{ justifyContent: "space-between" }}>
                <span>{x.n}</span>
                <span className="row" style={{ gap: 4 }}>
                  <button type="button" className="btn ghost sm" onClick={() => { klasik.kayitUygula(x.s, false); setKayitMesaj(`"${x.n}" düzeni uygulandı; yazıların korundu.`); }}>Düzeni uygula</button>
                  <button type="button" className="btn ghost sm" onClick={() => { klasik.kayitUygula(x.s, true); setKayitMesaj(`"${x.n}" içeriğiyle açıldı.`); }}>İçerikle aç</button>
                  <button type="button" className="btn ghost sm" aria-label={x.n + " kaydını sil"} onClick={() => kayitSil(x)}>Sil</button>
                </span>
              </div>
            ))}
          <label className="ie-grup ie-alan"><span>Şu anki düzeni kaydet</span>
            <span className="row"><input type="text" maxLength={40} placeholder="Örnek: Fiyat haberi düzeni" autoComplete="off" value={kayitAd} onChange={(e) => setKayitAd(e.target.value)} style={{ flex: 1 }} />
              <button type="button" className="btn sm" onClick={kaydet}>Kaydet</button></span>
          </label>
          <div className="muted">Konum, boyut, açı, katman sırası, logo ve yazılar bu şablon için saklanır.</div>
          <details>
            <summary className="muted" style={{ cursor: "pointer" }}>Dosyaya aktarma (eski adresteki kayıtlar için)</summary>
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" className="btn ghost sm" onClick={disaAktar}>Tüm kayıtları dışa aktar</button>
              <label className="btn ghost sm" style={{ cursor: "pointer" }}>İçe aktar<input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) iceAktar(f); e.target.value = ""; }} /></label>
            </div>
            <div className="muted" style={{ marginTop: 6 }}>Eski adreste (eneshsahin.github.io) "Tüm kayıtları dışa aktar" de, buradan içe aktar; kayıtlar ekiple ortak olur.</div>
          </details>
          {kayitMesaj && <div className="muted" role="status">{kayitMesaj}</div>}
        </section>

        <section className="panel" aria-label="Otomasyondan gelen postu aç">
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Otomasyondan gelen postu aç</summary>
            <div className="ie-grup" style={{ marginTop: 8 }}>
              <span>Telegram'a gelen dosya (.updated.json)</span>
              <input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) paketAc(f); e.target.value = ""; }} />
              <div className="muted">Tüm slaytlar ve haber fotoğrafı birlikte açılır.</div>
              {paket && <div className="row">{paket.slides.map((_, i) => <button key={i} type="button" className="chip" aria-pressed={paketSlayt === i} onClick={() => slaytAc(paket, i)}>{i + 1}. slayt</button>)}</div>}
            </div>
            <label className="ie-grup ie-alan" style={{ marginTop: 10 }}><span>Ya da tek slayt kodu</span>
              <textarea rows={2} spellCheck={false} placeholder="UPD1:..." value={kod} onChange={(e) => setKod(e.target.value)} />
            </label>
            <button type="button" className="btn ghost sm" onClick={kodAc}>Kodu aç</button>
            {aktarMesaj && <div className="muted" role="status" style={{ marginTop: 6 }}>{aktarMesaj}</div>}
          </details>
        </section>
        <div className="muted">Yazdıkların bu tarayıcıda saklanır; görseller saklanmaz.</div>
      </div>
    </div>
  );
}
