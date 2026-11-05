// Haber içi resmî görseller (4 Kasım 2026, kullanıcı onayı): kapak dışında en fazla 2 görsel, her biri bir ara başlığın altına, o bölümün
// konusuna uyan RESMÎ görsel (üretici, geliştirici, yayıncı). Birebir o sahne varsa o; yoksa konuyla ilgili resmî görsel de olur
// (GTA 6 haberinde rüzgârın uçakları etkilediği bölüm için Rockstar'ın resmî bir uçak görseli). Uygun yoksa hiç eklenmez; ajans ve
// yapay zekâ görseli asla. Adaylar: kaynak haberlerdeki üretici görselleri, markanın resmî sayfası, Brave görsel araması (yalnız markanın
// kendi alan adlarından; künye ile ortak aylık sayaç). Seçimi yapay zekâ görerek yapar (index.ts araGorselSec, ARA_SISTEM).
import { createClient } from "npm:@supabase/supabase-js@2";
import { kaynakGorselleri, resmiGorsel, type GorselAday } from "./gorsel.ts";

type Sb = ReturnType<typeof createClient>;
export type Bolum = { h2: string; metin: string };
const BRAVE_AY_SINIR = 1000; // 5 Kasım 2026: ücretsiz kotanın tamamı (kunye-otomatik ile aynı)
const sade = (s: string) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
const hostAl = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** Gövdedeki ara başlıklı bölümler (ilk bölüm hariç: girişte kapak zaten var) */
export function bolumler(govde: string): Bolum[] {
  const parcalar = govde.split(/^## /m).slice(1);
  return parcalar.map((p) => { const [h2, ...geri] = p.split("\n"); return { h2: h2.trim(), metin: geri.join(" ").replace(/\s+/g, " ").trim().slice(0, 500) }; }).slice(1);
}

/** Markanın alan adı mı (resmî kaynak sayılır) */
export function resmiAlan(host: string, marka: string): boolean {
  const h = sade(host).replace(/ /g, "");
  return sade(marka).split(" ").filter((w) => w.length >= 4).some((w) => h.includes(w));
}

export async function araAdaylar(sb: Sb, o: { linkler: string[]; marka: string; urun: string; baslik: string; basin: string[]; bolumler: Bolum[]; kapak?: string }, iz: string[]): Promise<GorselAday[]> {
  const [k, r] = await Promise.all([
    kaynakGorselleri({ linkler: o.linkler, marka: o.marka, urun: o.urun }, iz).catch(() => []),
    resmiGorsel({ linkler: o.linkler, marka: o.marka, basin: o.basin, urun: o.urun, baslik: o.baslik }, iz).catch(() => []),
  ]);
  let adaylar = [...r, ...k];
  // Kaynaklarda az resmî görsel varsa markanın kendi sitelerinde görsel araması (bölüm konularıyla)
  if (adaylar.length < 6 && o.marka) {
    const konu = o.bolumler.map((b) => b.h2).join(" ").split(/\s+/).filter((w) => w.length > 3).slice(0, 4).join(" ");
    adaylar = [...adaylar, ...(await braveGorsel(sb, `${o.marka} ${o.urun} ${konu}`.trim(), o.marka, iz))];
  }
  const kapak = (o.kapak ?? "").split("?")[0];
  const goruldu = new Set<string>();
  return adaylar.filter((a) => a.buyuk && a.buyuk.split("?")[0] !== kapak && !goruldu.has(a.buyuk) && goruldu.add(a.buyuk)).slice(0, 10);
}

async function braveGorsel(sb: Sb, q: string, marka: string, iz: string[]): Promise<GorselAday[]> {
  const { data } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", "brave_arama").maybeSingle();
  const anahtar = (data as { deger?: string } | null)?.deger;
  if (!anahtar) return [];
  const ay = new Date().toISOString().slice(0, 7);
  const { data: sy } = await sb.from("tr_settings").select("value").eq("key", "brave_sayac").maybeSingle();
  const sayac = (sy?.value as { ay?: string; adet?: number } | null)?.ay === ay ? Number((sy!.value as { adet?: number }).adet ?? 0) : 0;
  if (sayac >= BRAVE_AY_SINIR) { iz.push("Brave aylık sınır doldu"); return []; }
  await sb.from("tr_settings").upsert({ key: "brave_sayac", value: { ay, adet: sayac + 1 } });
  try {
    const r = await fetch("https://api.search.brave.com/res/v1/images/search?count=30&safesearch=strict&q=" + encodeURIComponent(q), { headers: { Accept: "application/json", "X-Subscription-Token": anahtar }, signal: AbortSignal.timeout(12_000) });
    if (!r.ok) { iz.push("Brave görsel " + r.status); await r.body?.cancel(); return []; }
    const j = await r.json();
    const out: GorselAday[] = [];
    for (const x of (j?.results ?? []) as { url?: string; title?: string; source?: string; thumbnail?: { src?: string }; properties?: { url?: string; width?: number; height?: number } }[]) {
      const resim = x.properties?.url, sayfa = x.url ?? "";
      if (!resim || !sayfa) continue;
      // Yalnız markanın kendi sitesindeki görsel (resmî): sayfa ya da görsel adresi markanın alan adında
      if (!resmiAlan(hostAl(sayfa), marka) && !resmiAlan(hostAl(resim), marka)) continue;
      const w = x.properties?.width ?? 1200, h = x.properties?.height ?? 675;
      if (w < 900 || h > w) continue;
      out.push({ kaynak: "Resmi basın", sayfa, buyuk: resim, thumb: x.thumbnail?.src || resim, yazar: marka, lisans: "Resmî görsel", dogrulandi: true, aciklama: `${hostAl(sayfa)} — ${x.title ?? ""}`.slice(0, 200), w, h });
      if (out.length >= 6) break;
    }
    iz.push(`Brave görsel: ${out.length} resmî`);
    return out;
  } catch { return []; }
}

export const ARA_SISTEM = `Bir Türkçe teknoloji/oyun haberinin ARA BAŞLIKLI BÖLÜMLERİNE yazı içi görsel seçiyorsun. Sana bölümler (numaralı, başlık ve kısa metin) ve numaralı görsel adayları (kaynak, künye, ekte resmin kendisi "Aday N:") verilecek.
KURALLAR:
1. Yalnız RESMÎ görsel: markanın, geliştiricinin, yayıncının ya da üreticinin kendi görseli (basın görseli, resmî ekran görüntüsü, ürün fotoğrafı, render). Haber sitesinin kendi çektiği fotoğraf, ajans fotoğrafı, hayran işi, yapay zekâ görseli SEÇİLMEZ.
2. Görsel bölümün konusunu anlatmalı. Birebir o sahne/o özellik varsa onu seç; yoksa aynı ürünün/oyunun o konuyla ilgili resmî görseli de olur (ör. "fırtına uçakları etkiliyor" bölümü için oyunun resmî bir uçak görseli). Konuyla ilgisi zayıfsa SEÇME.
3. Üzerinde büyük yazı, slogan, fiyat, logo baskın görsel; kolaj, infografik, düşük çözünürlüklü, dikey görsel seçilmez.
4. Aynı görsel iki bölüme konmaz. En fazla 2 bölüme görsel ver; uygun yoksa hiç verme. Emin değilsen verme.
5. Her seçim için kısa "alt" metni (Türkçe, görselde ne olduğu) yaz.
Sadece şu JSON'u döndür: {"secimler":[{"bolum": bölüm numarası, "gorsel": aday numarası, "alt": "kısa açıklama"}], "neden": "kısa"}`;
