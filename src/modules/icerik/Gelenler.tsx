// Siteden gelenler (Otomasyon 3+4, 24 Ekim 2026): sitede yayınlanan her haber / inceleme / karşılaştırma buraya düşer
// (panel → Stüdyo göç 0031, public.icerik_gelen). Türü formatı ve şablonu seçer; "Aç" ile editöre bilgileri ve görseliyle yerleşir.
// Kural (Fatih onayladı): son dakika ve sızıntı Story, diğerleri Post; inceleme puan kartı, karşılaştırma karşılaştırma şablonu,
// rehber kapak + liste slaytı; sponsorlu hiç gelmez. Yazıyı hazırlayana (yoksa yayınlayana) İşler'de iş açılır.
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { sb } from "../../shared/supabase";
import { useVeri } from "../../shared/veri";
import type { GelenAc, Paket } from "./klasik/KlasikEditor";

export type Gelen = {
  id: number; kaynak: string; tur: "news" | "reviews" | "comparisons"; format: string; baslik: string; spot: string; kategori: string; etiket: string;
  yol: string; gorsel: string | null; ek: Record<string, any>; atanan: string | null; is_id: number | null; durum: "yeni" | "acildi" | "hazir"; created_at: string;
};

const TAG: Record<string, string> = { "son-dakika": "SON DAKİKA", sizinti: "SIZINTI", rehber: "REHBER" };
const TUR_AD: Record<Gelen["tur"], string> = { news: "Haber", reviews: "İnceleme", comparisons: "Karşılaştırma" };
const FORMAT_AD: Record<string, string> = { post: "Post", story: "Story", reels: "Reels kapağı" };
const DURUM: Record<Gelen["durum"], [string, string]> = { yeni: ["Yeni", "wait"], acildi: ["Açıldı", "off"], hazir: ["Görsel indirildi", "ok"] };

const kisalt = (s: string, n: number) => (!s || s.length <= n ? s || "" : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const ilkHarfBuyuk = (s: string) => s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1).toLocaleLowerCase("tr-TR");

/** Başlığı iki satıra böler: "Ön kısım: devamı" ise iki nokta yerinden, değilse ortaya en yakın boşluktan (şablonda 2. satır renkli) */
export function baslikBol(t: string): [string, string] {
  t = (t || "").trim();
  const m = /^(.{6,60}?)\s*[:–—]\s+(.+)$/.exec(t);
  if (m) return [m[1].trim(), m[2].trim()];
  if (t.length <= 26) return [t, ""];
  const orta = t.length / 2; let en = -1;
  for (let i = 0; i < t.length; i++) if (t[i] === " " && (en < 0 || Math.abs(i - orta) < Math.abs(en - orta))) en = i;
  return en < 0 ? [t, ""] : [t.slice(0, en), t.slice(en + 1)];
}

/** Yazıdan editör paketi (slaytlar + görseller) */
export function paketYap(g: Gelen): Paket {
  const [h1, h2] = baslikBol(g.baslik), ek = g.ek || {};
  const etiket = TAG[g.etiket] || (g.kategori || "Haber").toLocaleUpperCase("tr-TR");
  if (g.tur === "reviews") {
    const slides: Paket["slides"] = [{ t: "campuan", v: { cat: "İnceleme", name: kisalt(ek.urun || g.baslik, 30), score: ek.puan != null ? String(ek.puan) : "", of: "20 üzerinden", stats: "", verdict: kisalt(ek.karar || g.spot, 110) }, img: !!g.gorsel }];
    const artilar: string[] = ek.artilar || [], eksiler: string[] = ek.eksiler || [];
    if (artilar.length || eksiler.length) slides.push({ t: "camliste", v: { h1: "Artılar", h2: "ve eksiler.", items: [...artilar.slice(0, 2).map((x) => `${kisalt(x, 34)} | Artı`), ...eksiler.slice(0, 2).map((x) => `${kisalt(x, 34)} | Eksi`)].join("\n") } });
    return { slides, img: g.gorsel || "" };
  }
  if (g.tur === "comparisons") {
    const farklar: { buyuk: string; ad: string; kazanan: "a" | "b" | null }[] = ek.farklar || [];
    const rows = farklar.slice(0, 4).map((f) => `${kisalt(f.ad, 22)} | ${f.kazanan === "a" ? f.buyuk : f.kazanan ? "—" : f.buyuk} | ${f.kazanan === "b" ? f.buyuk : f.kazanan ? "—" : f.buyuk}`).join("\n");
    return { slides: [{ t: "camvs", v: { h1: "Hangisi", h2: "daha iyi?", na: kisalt(ek.a || "", 22), nb: kisalt(ek.b || "", 22), rows }, imgs: { imga: ek.aGorsel || "", imgb: ek.bGorsel || "" } }], img: "" };
  }
  const kapak: Paket["slides"][number] = g.gorsel
    ? { t: "vizorhaber", v: { tag: etiket, h1, h2, sub: kisalt(g.spot, 170), foot: "updated.com.tr" }, img: true }
    : { t: "camtext", v: { cat: ilkHarfBuyuk(etiket), h1, h2, sub: kisalt(g.spot, 150), facts: "", foot: "updated.com.tr" } };
  const slides = [kapak];
  const basliklar: string[] = ek.basliklar || [];
  if (g.etiket === "rehber" && basliklar.length) slides.push({ t: "camliste", v: { h1: "Bilmen gereken", h2: `${Math.min(4, basliklar.length)} şey.`, items: basliklar.slice(0, 4).map((b) => `${kisalt(b, 34)} | `).join("\n") } });
  return { slides, img: g.gorsel || "" };
}

export default function Gelenler({ ac, acik, surum }: { ac: (g: GelenAc) => void; acik: number | null; surum: number }) {
  const { veri } = useVeri();
  const [liste, setListe] = useState<Gelen[] | null>(null);
  const [hata, setHata] = useState("");
  const [hepsi, setHepsi] = useState(false);
  const [kapali, setKapali] = useState(() => { try { return localStorage.getItem("icerik-gelenler-kapali") === "1"; } catch { return false; } });
  const [sp, setSp] = useSearchParams();

  const yukle = useCallback(async () => {
    const { data, error } = await sb.from("icerik_gelen").select("*").order("created_at", { ascending: false }).limit(50);
    if (error) { setHata(/icerik_gelen|relation/i.test(error.message) ? "Siteden gelenler henüz kurulmadı (veritabanı güncellemesi bekleniyor)." : error.message); setListe([]); return; }
    setHata(""); setListe(data as Gelen[]);
  }, []);
  useEffect(() => { yukle(); const t = window.setInterval(yukle, 60_000); return () => window.clearInterval(t); }, [yukle, surum]);

  const acGelen = useCallback(async (g: Gelen) => {
    ac({ id: g.id, format: g.format, paket: paketYap(g), ad: kisalt(g.baslik, 60) });
    if (g.durum === "yeni") { await sb.from("icerik_gelen").update({ durum: "acildi" }).eq("id", g.id); yukle(); }
    if (window.matchMedia("(max-width: 899px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [ac, yukle]);

  // Bildirimden gelince (#/icerik?gelen=12) o yazı açılır
  useEffect(() => {
    const id = Number(sp.get("gelen"));
    if (!id || !liste) return;
    const g = liste.find((x) => x.id === id);
    if (g) acGelen(g);
    setSp({}, { replace: true });
  }, [sp, liste, acGelen, setSp]);

  const kapat = () => { const v = !kapali; setKapali(v); try { localStorage.setItem("icerik-gelenler-kapali", v ? "1" : "0"); } catch { /* depolama kapalı */ } };
  const yeniSayi = (liste || []).filter((g) => g.durum === "yeni").length;
  const gorunen = (liste || []).slice(0, hepsi ? 50 : 6);
  const kisi = (id: string | null) => (id ? veri.profiles.find((p) => p.id === id)?.name ?? "—" : "Havuzda");

  return (
    <section className="panel ie-gelen" aria-label="Siteden gelenler">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 18 }}>Siteden gelenler {yeniSayi > 0 && <span className="pill wait">{yeniSayi} yeni</span>}</h2>
        <button type="button" className="btn ghost sm" onClick={kapat} aria-expanded={!kapali}>{kapali ? "Göster" : "Gizle"}</button>
      </div>
      {!kapali && <>
        <div className="muted">Sitede yayınlanan yazılar buraya düşer; "Aç" ile şablona bilgileri ve görseliyle yerleşir. Son dakika ve sızıntı Story, diğerleri Post olarak gelir.</div>
        {hata && <div className="msg err">{hata}</div>}
        {liste === null ? <div className="muted">Yükleniyor…</div> : !liste.length && !hata ? <div className="muted">Henüz gelen yazı yok. Sitede yeni bir yazı yayınlanınca burada görünür.</div> : (
          <ul className="ie-gelen-l">
            {gorunen.map((g) => (
              <li key={g.id} className={acik === g.id ? "on" : undefined}>
                <div className="ana">
                  <a href={"https://updated.com.tr" + g.yol} target="_blank" rel="noreferrer"><b>{g.baslik}</b></a>
                  <div className="muted">{TUR_AD[g.tur]} · {FORMAT_AD[g.format] || g.format}{TAG[g.etiket] ? " · " + ilkHarfBuyuk(TAG[g.etiket]) : ""} · {kisi(g.atanan)} · {new Date(g.created_at).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
                <span className={"pill " + DURUM[g.durum][1]}>{DURUM[g.durum][0]}</span>
                <button type="button" className={"btn sm" + (acik === g.id ? "" : " ghost")} onClick={() => acGelen(g)}>{acik === g.id ? "Açık" : "Aç"}</button>
              </li>
            ))}
          </ul>
        )}
        {(liste?.length ?? 0) > 6 && <button type="button" className="btn ghost sm" onClick={() => setHepsi(!hepsi)}>{hepsi ? "Daha az göster" : `Hepsini göster (${liste!.length})`}</button>}
      </>}
    </section>
  );
}
