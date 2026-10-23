import { useEffect, useState } from "react";
import { PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase";

// Altyapı durumu: 23 Ekim 2026'dan beri Stüdyo kendi sunucumuzda (Natro). Sunucunun giriş, veri ve dosya servisleri
// 3 dakikada bir yoklanır; biri yanıt vermezse ekip "sorun sunucuda, iş bizden değil" diye bilsin.
// (Öncesinde Supabase bulutunun durum sayfası okunuyordu.)

export type AltyapiOlayi = { ad: string; durum: string; etki: string; not: string; link: string };

const SERVISLER: [string, string][] = [
  ["giriş", "/auth/v1/health"],
  ["dosya depolama", "/storage/v1/status"],
];
export const adTr = (ad: string) => ad;

let onbellek: { zaman: number; olaylar: AltyapiOlayi[] } | null = null;
let istek: Promise<AltyapiOlayi[]> | null = null;

async function yokla(yol: string): Promise<boolean> {
  try {
    const c = new AbortController(); const t = window.setTimeout(() => c.abort(), 8000);
    const r = await fetch(SUPABASE_URL + yol, { cache: "no-store", signal: c.signal, headers: { apikey: PUBLISHABLE_KEY } }).finally(() => window.clearTimeout(t));
    return r.ok;
  } catch { return false; }
}

async function oku(): Promise<AltyapiOlayi[]> {
  if (onbellek && Date.now() - onbellek.zaman < 180_000) return onbellek.olaylar;
  // Kullanıcının kendi interneti yoksa sunucuyu suçlama
  if (typeof navigator !== "undefined" && !navigator.onLine) return onbellek?.olaylar ?? [];
  istek ??= (async () => {
    try {
      const sonuc = await Promise.all(SERVISLER.map(async ([ad, yol]) => ({ ad, ok: await yokla(yol) })));
      const olaylar = sonuc.filter((x) => !x.ok).map((x) => ({ ad: x.ad, durum: "yanıt vermiyor", etki: "major", not: "", link: SUPABASE_URL }));
      onbellek = { zaman: Date.now(), olaylar };
      return olaylar;
    } finally { istek = null; }
  })();
  return istek;
}

/** Sunucumuzda yanıt vermeyen servisler (3 dakikada bir yenilenir) */
export function useAltyapi() {
  const [olaylar, setOlaylar] = useState<AltyapiOlayi[]>(onbellek?.olaylar ?? []);
  useEffect(() => {
    let iptal = false;
    const yenile = () => oku().then((o) => { if (!iptal) setOlaylar(o); });
    yenile();
    const t = window.setInterval(yenile, 180_000);
    return () => { iptal = true; window.clearInterval(t); };
  }, []);
  return olaylar;
}

/** Bir işin hata metninden kaynağını çıkarır: ekip "kimden kaynaklı" görsün */
export function hataKaynagi(hata: string, altyapiSorunu: boolean): { etiket: string; aciklama: string } {
  const h = hata || "";
  const altyapi = altyapiSorunu
    ? { etiket: "Altyapı (sunucu)", aciklama: "Sunucunun bir servisi şu an yanıt vermiyor. Biraz sonra tekrar dene; sürmesi hâlinde Fatih'e haber ver." }
    : { etiket: "Altyapı", aciklama: "Sunucu işi zamanında bitiremedi. Tekrar dene; sürekli oluyorsa Enes'e haber ver." };
  if (!h || /yarıda bıraktı|yarıda kal|takıldı|shutdown|WORKER|FunctionsFetchError|FunctionsRelayError|Failed to (send|fetch)|Zaman aşımı: kaynak site ya da/i.test(h)) return altyapi;
  if (/yapay zek|gemini|429|quota|kota|geçersiz JSON|GEMINI_API_KEY/i.test(h))
    return { etiket: "Yapay zekâ (Gemini)", aciklama: /429|quota|kota/i.test(h) ? "Yapay zekâ kotası dolmuş olabilir; kota yenilenince düzelir." : "Yapay zekâ servisi yavaş ya da yoğun. Tekrar dene." };
  if (/kaynak site|metni otomatik alınamadı/i.test(h))
    return { etiket: "Kaynak site", aciklama: "Haberin yayınlandığı site metni vermedi." };
  if (/\b50[0234]\b|non-2xx/i.test(h)) return altyapi;
  return { etiket: "Sistem", aciklama: "" };
}

/** Uygulamanın üstünde: sunucumuzda bir servis yanıt vermiyorsa herkese görünür uyarı */
export default function AltyapiUyari() {
  const olaylar = useAltyapi();
  if (!olaylar.length) return null;
  return (
    <div className="msg err" role="status">
      <b>Altyapı sorunu (sunucu):</b>{" "}
      {olaylar.map((o, i) => (
        <span key={i}>{i > 0 && " · "}{adTr(o.ad)} — {o.durum}. </span>
      ))}
      Taslak hazırlama ve haber toplama gecikebilir ya da yarıda kalabilir; servis geri gelince kendiliğinden normale döner.
    </div>
  );
}
