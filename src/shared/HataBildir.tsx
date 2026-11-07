// Hata bildir (7 Kasım 2026, kullanıcı: "Studio ya hata bildir butonu ekle bildirilen hatalara cevap verebilelim doğrudan içeriden
// yöneticiler"). Üst barda zil ve sohbetin yanında. Bildiren yalnız ne olduğunu yazar, istersen ekran görüntüsü ekler; sayfa, tarayıcı,
// ekran, Stüdyo sürümü ve sayfadaki son hata mesajları kendiliğinden eklenir. Konuşma ve cevaplar: Hatalar ekranı (#/hatalar). Veri: göç 0071.
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import { Ikon } from "./Ikon";
import { sb } from "./supabase";
import { useToast } from "./toast";

declare const __SURUM__: string;

// Sayfadaki son hatalar (en fazla 8): bildiren görmese de yöneticiye ipucu olur
type SonHata = { t: string; m: string };
const SON_HATALAR: SonHata[] = [];
const hataEkle = (m: string) => {
  const s = m.slice(0, 400);
  if (SON_HATALAR.some((x) => x.m === s)) return;
  SON_HATALAR.push({ t: new Date().toISOString(), m: s });
  if (SON_HATALAR.length > 8) SON_HATALAR.shift();
};
if (typeof window !== "undefined") {
  addEventListener("error", (e) => hataEkle(`${e.message}${e.filename ? ` (${e.filename.split("/").pop()}:${e.lineno})` : ""}`));
  addEventListener("unhandledrejection", (e) => hataEkle("Söz bozuldu: " + String((e.reason as Error)?.message ?? e.reason)));
  const ce = console.error.bind(console);
  console.error = (...a: unknown[]) => { try { hataEkle(a.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" ")); } catch { /* yok */ } ce(...a); };
}

export function ortamBilgisi() {
  return {
    surum: typeof __SURUM__ === "string" ? __SURUM__ : "",
    tarayici: navigator.userAgent,
    ekran: `${innerWidth}×${innerHeight}`,
    dil: navigator.language,
    son_hatalar: [...SON_HATALAR],
  };
}

/** Görseli küçültüp (uzun kenar 1920) WebP olarak kişinin klasörüne yükler; yolunu döner */
export async function hataGorseliYukle(dosya: Blob, uid: string): Promise<string> {
  let veri: Blob = dosya, uz = "png";
  try {
    const bmp = await createImageBitmap(dosya);
    const o = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * o); c.height = Math.round(bmp.height * o);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    veri = await new Promise<Blob>((ok, red) => c.toBlob((b) => (b ? ok(b) : red(new Error("küçültülemedi"))), "image/webp", 0.85));
    uz = "webp";
  } catch { /* küçültülemezse olduğu gibi */ }
  const yol = `${uid}/${crypto.randomUUID()}.${uz}`;
  const r = await sb.storage.from("hata").upload(yol, veri, { contentType: veri.type || "image/png" });
  if (r.error) throw new Error(r.error.message);
  return yol;
}

/** Yapıştırılan ya da seçilen görseller (en fazla 4), önizlemeleriyle */
export function useGorselSecimi() {
  const [gorseller, setGorseller] = useState<{ dosya: File; url: string }[]>([]);
  const ekle = (fs: File[]) => setGorseller((g) => [...g, ...fs.filter((f) => f.type.startsWith("image/")).map((f) => ({ dosya: f, url: URL.createObjectURL(f) }))].slice(0, 4));
  const cikar = (i: number) => setGorseller((g) => { URL.revokeObjectURL(g[i].url); return g.filter((_, j) => j !== i); });
  const temizle = () => setGorseller((g) => { g.forEach((x) => URL.revokeObjectURL(x.url)); return []; });
  const yapistir = (e: ClipboardEvent) => {
    const fs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (fs.length) { e.preventDefault(); ekle(fs); }
  };
  return { gorseller, ekle, cikar, temizle, yapistir };
}

export function GorselSecici({ s }: { s: ReturnType<typeof useGorselSecimi> }) {
  return (
    <div className="hata-gorseller">
      {s.gorseller.map((g, i) => (
        <span key={g.url} className="hata-kucuk"><img src={g.url} alt={`Ekran görüntüsü ${i + 1}`} /><button type="button" aria-label="Görseli çıkar" onClick={() => s.cikar(i)}><Ikon ad="sil" /></button></span>
      ))}
      {s.gorseller.length < 4 && (
        <label className="btn ghost sm hata-ekle"><Ikon ad="foto" />Ekran görüntüsü ekle
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { s.ekle(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </label>
      )}
    </div>
  );
}

export default function HataBildir() {
  const { profile } = useAuth();
  const toast = useToast();
  const git = useNavigate();
  const [acik, setAcik] = useState(false);
  const [metin, setMetin] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [bitti, setBitti] = useState<number | null>(null);
  const kutu = useRef<HTMLDivElement>(null);
  const g = useGorselSecimi();

  useEffect(() => {
    if (!acik) return;
    const disari = (e: PointerEvent) => { if (kutu.current && !kutu.current.contains(e.target as Node)) setAcik(false); };
    document.addEventListener("pointerdown", disari);
    return () => document.removeEventListener("pointerdown", disari);
  }, [acik]);

  async function gonder(e: FormEvent) {
    e.preventDefault();
    const body = metin.trim(); if (!body || gonderiliyor || !profile) return;
    setGonderiliyor(true);
    try {
      const yollar: string[] = [];
      for (const x of g.gorseller) yollar.push(await hataGorseliYukle(x.dosya, profile.id));
      const r = await sb.from("hata_bildirimleri").insert({ metin: body, sayfa: location.hash.replace(/^#/, "") || "/", ortam: ortamBilgisi(), gorseller: yollar }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      setMetin(""); g.temizle(); setBitti((r.data as { id: number }).id);
    } catch (er) { toast("Gönderilemedi: " + (er as Error).message); }
    finally { setGonderiliyor(false); }
  }

  return (
    <div style={{ position: "relative" }} ref={kutu}>
      <button className="btn ghost sm zil" aria-label="Hata bildir" title="Hata bildir" aria-expanded={acik} onClick={() => { setAcik(!acik); setBitti(null); }}>
        <Ikon ad="uyari" />
      </button>
      {acik && (
        <div className="panel bildirimler hata-panel">
          {bitti ? (
            <div className="hata-tamam">
              <h3>Bildirimin yöneticilere gitti</h3>
              <p className="muted">Cevap yazılınca ve hata çözülünce zile bildirim gelir.</p>
              <div className="row">
                <button className="btn sm" onClick={() => { setAcik(false); git(`/hatalar?h=${bitti}`); }}>Konuşmayı aç</button>
                <button className="btn ghost sm" onClick={() => setBitti(null)}>Bir hata daha bildir</button>
              </div>
            </div>
          ) : (
            <form onSubmit={gonder} className="hata-form">
              <h3>Hata bildir</h3>
              <textarea value={metin} onChange={(e) => setMetin(e.target.value)} onPaste={g.yapistir} rows={4} maxLength={4000} autoFocus
                placeholder="Ne yapıyordun, ne oldu? Ekran görüntüsünü buraya yapıştırabilirsin." aria-label="Hatanın açıklaması" />
              <GorselSecici s={g} />
              <p className="muted hata-not">Bulunduğun sayfa, tarayıcı ve Stüdyo sürümü kendiliğinden eklenir.</p>
              <div className="row hata-alt">
                <button type="button" className="btn ghost sm" onClick={() => { setAcik(false); git("/hatalar"); }}>Bildirdiklerim</button>
                <button className="btn sm" disabled={!metin.trim() || gonderiliyor}>{gonderiliyor ? "Gönderiliyor…" : "Gönder"}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
