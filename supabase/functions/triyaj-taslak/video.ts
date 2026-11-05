// Resmî video adayları (4 Kasım 2026, kullanıcı: "resmî fragman/tanıtım varsa doğrudan gömsün; kendi oynatıcısındaysa ama YouTube'a da
// yüklemişlerse YouTube'dakini gömsün"). Adaylar: kaynak haberlerdeki ve markanın sayfasındaki YouTube/Vimeo videoları; hiç yoksa ve konu
// uygunsa Brave'de YouTube araması (künye ile ortak aylık sayaç). Her YouTube adayının kanalı oEmbed'den alınır. Hangisinin resmî ve haberle
// ilgili olduğuna yapay zekâ karar verir (index.ts videoSec); resmî kanal değilse video konmaz.
import { createClient } from "npm:@supabase/supabase-js@2";
import { baglantilar, html } from "./gorsel.ts";

type Sb = ReturnType<typeof createClient>;
export type VideoAday = { url: string; id: string; tur: "youtube" | "vimeo"; baslik: string; kanal: string; kanalUrl: string; nereden: string };
export type SayfaAday = { url: string; metin: string };

const YT = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/g;
const VIMEO = /(?:player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})/g;
// Fragman ve tanıtım videosu en çok bu konularda olur; Brave araması yalnız bunlarda yapılır (aylık sınır ortak)
const VIDEO_KONU = /oyun|game|film|dizi|sinema|fragman|trailer|teaser|tanıtım|tanitim|reveal|launch|lansman|announce/i;
const BRAVE_AY_SINIR = 1000; // 5 Kasım 2026: ücretsiz kotanın tamamı (kunye-otomatik ile aynı)
const sade = (s: string) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const HABER_SITESI = /theverge|engadget|techcrunch|gsmarena|ign\.com|gamespot|polygon|eurogamer|pcgamer|kotaku|9to5|macrumors|androidauthority|wired|cnet|tomshardware|anandtech|arstechnica|reddit|twitter|x\.com|facebook|instagram|wikipedia/i;

export async function videoAdaylari(sb: Sb, o: { linkler: string[]; marka: string; urun: string; baslik: string; konu: string; basin: string[] }): Promise<{ videolar: VideoAday[]; sayfalar: SayfaAday[]; iz: string[] }> {
  const iz: string[] = [];
  const sayfalar = await Promise.all([...new Set([...o.linkler.slice(0, 5), ...o.basin.slice(0, 1)])].map(async (u) => ({ u, h: await html(u, 9_000) })));
  const videolar = new Map<string, VideoAday>();
  const resmi: SayfaAday[] = [];
  const m = sade(o.marka).slice(0, 6);
  for (const { u, h } of sayfalar) {
    if (!h) continue;
    for (const x of h.matchAll(YT)) if (!videolar.has(x[1])) videolar.set(x[1], { url: `https://www.youtube.com/watch?v=${x[1]}`, id: x[1], tur: "youtube", baslik: "", kanal: "", kanalUrl: "", nereden: hostAl(u) });
    for (const x of h.matchAll(VIMEO)) if (!videolar.has("v" + x[1])) videolar.set("v" + x[1], { url: `https://vimeo.com/${x[1]}`, id: x[1], tur: "vimeo", baslik: "", kanal: "", kanalUrl: "", nereden: hostAl(u) });
    // Resmî sayfa adayları: markanın alan adındaki, haber sitesi olmayan bağlantılar
    if (m.length >= 3) for (const [adres, metin] of baglantilar(h, u)) {
      const host = hostAl(adres);
      if (!host || HABER_SITESI.test(host) || !sade(host).includes(m)) continue;
      if (!resmi.some((r) => r.url === adres) && resmi.length < 12) resmi.push({ url: adres, metin: metin.slice(0, 80) });
    }
  }
  iz.push(`kaynaklarda ${videolar.size} video`);
  // Kaynaklarda video yoksa ve konu fragman/tanıtım türündeyse Brave'de resmî YouTube videosu aranır
  if (!videolar.size && VIDEO_KONU.test(`${o.konu} ${o.baslik}`)) {
    for (const u of await braveYoutube(sb, `${o.marka} ${o.urun} official trailer`.trim(), iz)) for (const x of u.matchAll(YT)) if (!videolar.has(x[1])) videolar.set(x[1], { url: `https://www.youtube.com/watch?v=${x[1]}`, id: x[1], tur: "youtube", baslik: "", kanal: "", kanalUrl: "", nereden: "Brave arama" });
  }
  // Kanal ve başlık (oEmbed; anahtar gerekmez)
  const liste = [...videolar.values()].slice(0, 8);
  await Promise.all(liste.map(async (v) => {
    const uc = v.tur === "youtube" ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(v.url)}` : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(v.url)}`;
    try { const r = await fetch(uc, { signal: AbortSignal.timeout(8_000) }); if (r.ok) { const j = await r.json(); v.baslik = String(j.title ?? ""); v.kanal = String(j.author_name ?? ""); v.kanalUrl = String(j.author_url ?? ""); } else await r.body?.cancel(); } catch { /* yok */ }
  }));
  return { videolar: liste.filter((v) => v.kanal), sayfalar: resmi, iz };
}

async function braveYoutube(sb: Sb, q: string, iz: string[]): Promise<string[]> {
  const { data } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", "brave_arama").maybeSingle();
  const anahtar = (data as { deger?: string } | null)?.deger;
  if (!anahtar) return [];
  const ay = new Date().toISOString().slice(0, 7);
  const { data: sy } = await sb.from("tr_settings").select("value").eq("key", "brave_sayac").maybeSingle();
  const sayac = (sy?.value as { ay?: string; adet?: number } | null)?.ay === ay ? Number((sy!.value as { adet?: number }).adet ?? 0) : 0;
  if (sayac >= BRAVE_AY_SINIR) { iz.push("Brave aylık sınır doldu"); return []; }
  await sb.from("tr_settings").upsert({ key: "brave_sayac", value: { ay, adet: sayac + 1 } });
  try {
    const r = await fetch("https://api.search.brave.com/res/v1/web/search?count=8&q=" + encodeURIComponent(q + " site:youtube.com"), { headers: { Accept: "application/json", "X-Subscription-Token": anahtar }, signal: AbortSignal.timeout(12_000) });
    if (!r.ok) { iz.push("Brave " + r.status); await r.body?.cancel(); return []; }
    return ((await r.json())?.web?.results ?? []).map((x: { url: string }) => x.url);
  } catch { return []; }
}

const hostAl = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** Yapay zekâya: hangi video resmî ve haberle ilgili, hangi sayfa resmî */
export const VIDEO_SISTEM = `Bir Türkçe teknoloji/oyun haberi için resmî video ve resmî sayfa seçiyorsun. Sana haber başlığı, marka/ürün ve numaralı video adayları (başlık, YAYINLAYAN KANAL) ile resmî sayfa adayları verilecek.
VİDEO SEÇ yalnız şu ikisi birden doğruysa:
1. Kanal RESMÎ: haberdeki markanın, geliştiricinin, yayıncının, stüdyonun ya da platformun kendi kanalı (ör. Bethesda, Xbox, PlayStation, Nintendo, Apple, Samsung, DJI). Haber sitesi, inceleme, tepki, hayran, sızıntı ya da yeniden yükleme kanalı SEÇİLMEZ.
2. Video bu haberin konusu: aynı ürün/oyun ve bu habere konu olan duyuru, fragman ya da tanıtım. Eski ya da başka bir ürünün videosu seçilmez.
Aynı video hem markanın kendi oynatıcısında hem YouTube'da varsa YouTube'dakini seç. Emin değilsen -1.
"en_ustte": haber videonun kendisiyle ilgiliyse (fragman/tanıtım videosu yayınlandı) true, değilse false.
"sayfa": resmî sayfa adaylarından ürünün ya da oyunun RESMÎ sayfası (ana sayfa değil, ürüne ait sayfa tercih); yoksa -1.
Sadece şu JSON'u döndür: {"video": numara ya da -1, "en_ustte": false, "sayfa": numara ya da -1, "neden": "kısa gerekçe"}`;
