import { useRef, useState } from "react";
import { useToast } from "../../shared/toast";
import * as api from "./api";

// Görselin odak noktası ve kırpma (panelin görsel düzenleyicisi). Odak noktası değişince panel küçük boyutları
// (kart, manşet, paylaşım, reel) o noktaya göre yeniden üretir. Kırpma panelde olduğu gibi orijinal dosyayı değiştirir.
type Kayit = Record<string, unknown>;
type Kutu = { x: number; y: number; w: number; h: number }; // yüzde
const ORANLAR: [string, number | null][] = [["Serbest", null], ["16:9", 16 / 9], ["1:1", 1], ["9:16", 9 / 16], ["Paylaşım 1200×630", 1200 / 630]];
const ONIZLEMELER: [string, string][] = [["Kart · manşet 16:9", "16 / 9"], ["Kare", "1 / 1"], ["Reel 9:16", "9 / 16"]];
const sinirla = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export default function GorselDuzen({ yol, m, degisti }: { yol: string; m: Kayit; degisti: (d: Kayit) => void }) {
  const toast = useToast();
  const W = Number(m.width) || 0, H = Number(m.height) || 0;
  const adres = `${api.medyaAdres(String(m.url ?? ""))}?v=${encodeURIComponent(String(m.updatedAt ?? ""))}`; // kırpınca aynı ad: önbellek atlanır
  const [mod, setMod] = useState<"odak" | "kirp">("odak");
  const kayitli = { x: Number(m.focalX ?? 50), y: Number(m.focalY ?? 50) };
  const [odak, setOdak] = useState(kayitli);
  const [oran, setOran] = useState<number | null>(null);
  const [kutu, setKutu] = useState<Kutu | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const alan = useRef<HTMLDivElement>(null);
  const surukle = useRef<{ x: number; y: number } | null>(null);
  const odakDegisti = Math.round(odak.x) !== Math.round(kayitli.x) || Math.round(odak.y) !== Math.round(kayitli.y);

  const yuzde = (e: React.PointerEvent) => {
    const r = alan.current!.getBoundingClientRect();
    return { x: sinirla(((e.clientX - r.left) / r.width) * 100, 0, 100), y: sinirla(((e.clientY - r.top) / r.height) * 100, 0, 100) };
  };
  /** Sürüklenen kutu; oran seçiliyse yükseklik genişlikten (piksel oranı korunur) */
  const kutuYap = (a: { x: number; y: number }, b: { x: number; y: number }): Kutu => {
    let w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (oran && W && H) { h = (w * W) / oran / H; if (h > 100) { h = 100; w = (h * H * oran) / W; } }
    const x = b.x >= a.x ? a.x : a.x - w, y = b.y >= a.y ? a.y : a.y - h;
    return { x: sinirla(x, 0, 100 - w), y: sinirla(y, 0, 100 - h), w, h };
  };
  const pikselde = (k: Kutu) => ({ w: Math.round((k.w / 100) * W), h: Math.round((k.h / 100) * H) });

  async function yaz(sorgu: string, govde: Kayit, mesaj: string) {
    setMesgul(true);
    try {
      const r = await api.istekYap<{ doc: Kayit }>(`${yol}?depth=0${sorgu}`, { method: "PATCH", body: JSON.stringify(govde) });
      degisti(r.doc); toast(mesaj); return r.doc;
    } catch (e) { toast((e as Error).message); return null; }
    finally { setMesgul(false); }
  }
  async function dosyaDegistir(f: File | undefined) {
    if (!f || !confirm(`Görselin dosyası "${f.name}" ile değişsin mi? Alt metin ve künye aynı kalır; bu görseli kullanan her yerde yeni dosya görünür.`)) return;
    const fd = new FormData(); fd.append("file", f); fd.append("_payload", "{}");
    setMesgul(true);
    try { const r = await api.istekYap<{ doc: Kayit }>(`${yol}?depth=0`, { method: "PATCH", body: fd }); degisti(r.doc); toast("Dosya değişti."); setOdak({ x: 50, y: 50 }); setKutu(null); }
    catch (e) { toast((e as Error).message); }
    finally { setMesgul(false); }
  }
  const odakKaydet = () => yaz("", { focalX: Math.round(odak.x), focalY: Math.round(odak.y) }, "Odak noktası kaydedildi; küçük boyutlar yeniden üretildi.");
  async function kirp() {
    if (!kutu) return;
    const p = pikselde(kutu);
    if (!confirm(`Görsel ${p.w}×${p.h} piksel olarak kırpılsın mı? Orijinal dosya kırpılmış hâliyle değişir; geri alınamaz. Bu görseli kullanan her yerde yeni hâli görünür.`)) return;
    const q = new URLSearchParams({
      "uploadEdits[crop][x]": String(kutu.x), "uploadEdits[crop][y]": String(kutu.y),
      "uploadEdits[crop][width]": String(kutu.w), "uploadEdits[crop][height]": String(kutu.h), "uploadEdits[crop][unit]": "%",
      "uploadEdits[widthInPixels]": String(p.w), "uploadEdits[heightInPixels]": String(p.h),
      "uploadEdits[focalPoint][x]": "50", "uploadEdits[focalPoint][y]": "50",
    });
    if (await yaz(`&${q}`, {}, "Görsel kırpıldı.")) { setKutu(null); setOdak({ x: 50, y: 50 }); setMod("odak"); }
  }

  if (!m.url) return null;
  return (
    <div className="site-gorsel-duzen">
      <div className="row">
        <div className="segment" role="group" aria-label="Görsel düzeni">
          <button aria-pressed={mod === "odak"} onClick={() => setMod("odak")}>Odak noktası</button>
          <button aria-pressed={mod === "kirp"} onClick={() => setMod("kirp")}>Kırp</button>
        </div>
        <span className="muted">{W}×{H} piksel</span>
        <span style={{ flex: 1 }} />
        <label className="btn ghost sm">Dosyayı değiştir<input type="file" accept="image/*" hidden disabled={mesgul} onChange={(e) => { dosyaDegistir(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>
      <div ref={alan} className={`site-gorsel-alan site-gorsel-alan--${mod}`}
        onPointerDown={(e) => {
          if (mod === "odak") { setOdak(yuzde(e)); return; }
          alan.current!.setPointerCapture(e.pointerId); surukle.current = yuzde(e); setKutu(null);
        }}
        onPointerMove={(e) => { if (mod === "kirp" && surukle.current) setKutu(kutuYap(surukle.current, yuzde(e))); }}
        onPointerUp={() => { surukle.current = null; }}>
        <img src={adres} alt={String(m.alt ?? "")} draggable={false} />
        {mod === "odak" && <span className="site-odak" style={{ left: `${odak.x}%`, top: `${odak.y}%` }} />}
        {mod === "kirp" && kutu && <span className="site-kirp-kutu" style={{ left: `${kutu.x}%`, top: `${kutu.y}%`, width: `${kutu.w}%`, height: `${kutu.h}%` }} />}
      </div>
      {mod === "odak" ? <>
        <span className="muted">Görselin önemli yerine tıkla: kart, manşet ve reel kırpımları o noktayı ortalar.</span>
        <div className="site-odak-onizleme">
          {ONIZLEMELER.map(([ad, ar]) => (
            <figure key={ad}><img src={adres} alt="" style={{ aspectRatio: ar, objectPosition: `${odak.x}% ${odak.y}%` }} /><figcaption className="muted">{ad}</figcaption></figure>
          ))}
        </div>
        <div className="row">
          <span style={{ flex: 1 }} />
          {odakDegisti && <button className="btn ghost sm" onClick={() => setOdak(kayitli)}>Vazgeç</button>}
          <button className="btn sm" disabled={!odakDegisti || mesgul} onClick={odakKaydet}>Odak noktasını kaydet</button>
        </div>
      </> : <>
        <div className="row">
          {ORANLAR.map(([ad, o]) => <button key={ad} className={`btn ${oran === o ? "" : "ghost"} sm`} onClick={() => { setOran(o); setKutu(null); }}>{ad}</button>)}
        </div>
        <span className="muted">Görselin üstünde sürükleyerek alanı seç.{kutu && ` Seçilen: ${pikselde(kutu).w}×${pikselde(kutu).h} piksel.`}{kutu && pikselde(kutu).w < 1200 && <b className="site-uyari"> Kapak için en az 1200 piksel genişlik önerilir.</b>}</span>
        <div className="row">
          <span style={{ flex: 1 }} />
          {kutu && <button className="btn ghost sm" onClick={() => setKutu(null)}>Temizle</button>}
          <button className="btn sm" disabled={!kutu || kutu.w < 1 || kutu.h < 1 || mesgul} onClick={kirp}>Kırp ve kaydet</button>
        </div>
      </>}
    </div>
  );
}
