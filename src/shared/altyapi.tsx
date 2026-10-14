import { useEffect, useState } from "react";

// Altyapı durumu: Supabase'in kendi durum sayfasından (status.supabase.com) canlı okunur.
// Sorun Supabase'teyse ekip "bizden değil, beklemek gerek" diye bilsin; Enes'e yazmak gerekmesin.
// Sadece bizi etkileyen bölümler sayılır: sunucu fonksiyonları, veritabanı, giriş, canlı güncelleme, API.

export type AltyapiOlayi = { ad: string; durum: string; etki: string; not: string; link: string };

const ILGILI = /edge function|function|database|postgres|auth|realtime|api|rest|pooler|supavisor|cron|eu-central|eu-west|global/i;
const DURUM_TR: Record<string, string> = { investigating: "inceleniyor", identified: "neden bulundu", monitoring: "düzeldi, izleniyor", scheduled: "planlı bakım", in_progress: "bakım sürüyor", verifying: "doğrulanıyor" };
const ADLAR_TR: [RegExp, string][] = [
  [/edge function/i, "sunucu fonksiyonları (taslak, haber toplama)"],
  [/realtime/i, "canlı güncelleme"],
  [/database|postgres|pooler|supavisor/i, "veritabanı"],
  [/auth/i, "giriş"],
  [/storage/i, "dosya depolama"],
  [/api|rest/i, "veri bağlantısı"],
];
export const adTr = (ad: string) => ADLAR_TR.find(([r]) => r.test(ad))?.[1] ?? ad;

let onbellek: { zaman: number; olaylar: AltyapiOlayi[] } | null = null;
let istek: Promise<AltyapiOlayi[]> | null = null;

async function oku(): Promise<AltyapiOlayi[]> {
  if (onbellek && Date.now() - onbellek.zaman < 180_000) return onbellek.olaylar;
  istek ??= (async () => {
    try {
      const r = await fetch("https://status.supabase.com/api/v2/summary.json", { cache: "no-store" });
      const d = await r.json();
      type Ham = { name: string; status: string; impact: string; shortlink?: string; components?: { name: string }[]; incident_updates?: { body: string }[] };
      const hamlar: Ham[] = [...(d.incidents ?? []), ...(d.scheduled_maintenances ?? []).filter((m: Ham) => m.status === "in_progress")];
      const olaylar = hamlar
        .filter((i) => !["resolved", "postmortem", "completed"].includes(i.status))
        // "düzeldi, izleniyor" aşamasındaki küçük olaylar gürültü yapmasın
        .filter((i) => i.status !== "monitoring" || ["major", "critical"].includes(i.impact))
        .filter((i) => ILGILI.test(i.name) || (i.components ?? []).some((c) => ILGILI.test(c.name)) || ["major", "critical"].includes(i.impact))
        .map((i) => ({ ad: i.name, durum: DURUM_TR[i.status] ?? i.status, etki: i.impact, not: i.incident_updates?.[0]?.body ?? "", link: i.shortlink || "https://status.supabase.com" }));
      onbellek = { zaman: Date.now(), olaylar };
      return olaylar;
    } catch {
      return onbellek?.olaylar ?? []; // durum sayfasına ulaşılamazsa sessiz kal
    } finally { istek = null; }
  })();
  return istek;
}

/** Supabase'te süren, bizi etkileyen olaylar (3 dakikada bir yenilenir) */
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
    ? { etiket: "Altyapı (Supabase)", aciklama: "Supabase'te şu an bilinen bir arıza var; bizden kaynaklı değil. Biraz sonra tekrar dene." }
    : { etiket: "Altyapı", aciklama: "Sunucu işi zamanında bitiremedi. Tekrar dene; sürekli oluyorsa Enes'e haber ver." };
  if (!h || /yarıda bıraktı|yarıda kal|takıldı|shutdown|WORKER|FunctionsFetchError|FunctionsRelayError|Failed to (send|fetch)|Zaman aşımı: kaynak site ya da/i.test(h)) return altyapi;
  if (/yapay zek|gemini|429|quota|kota|geçersiz JSON|GEMINI_API_KEY/i.test(h))
    return { etiket: "Yapay zekâ (Gemini)", aciklama: /429|quota|kota/i.test(h) ? "Yapay zekâ kotası dolmuş olabilir; kota yenilenince düzelir." : "Yapay zekâ servisi yavaş ya da yoğun. Tekrar dene." };
  if (/kaynak site|metni otomatik alınamadı/i.test(h))
    return { etiket: "Kaynak site", aciklama: "Haberin yayınlandığı site metni vermedi." };
  if (/\b50[0234]\b|non-2xx/i.test(h)) return altyapi;
  return { etiket: "Sistem", aciklama: "" };
}

/** Uygulamanın üstünde: Supabase'te bizi etkileyen bir arıza varsa herkese görünür uyarı */
export default function AltyapiUyari() {
  const olaylar = useAltyapi();
  if (!olaylar.length) return null;
  return (
    <div className="msg err" role="status">
      <b>Altyapı sorunu (Supabase, bizden kaynaklı değil):</b>{" "}
      {olaylar.map((o, i) => (
        <span key={i}>{i > 0 && " · "}{adTr(o.ad)} — {o.durum}. </span>
      ))}
      Taslak hazırlama ve haber toplama gecikebilir ya da yarıda kalabilir; Supabase düzeltince kendiliğinden normale döner.{" "}
      <a href={olaylar[0].link} target="_blank" rel="noreferrer">Ayrıntı ↗</a>
    </div>
  );
}
