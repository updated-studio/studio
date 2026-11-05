// Çıkış radarı otomasyonu (30 Ekim 2026, kullanıcı: "çıkış radarlarını da otomatiğe bağlamak istiyorum", "hem bunlara hem interneti kontrol etmesi lazım",
// "bizim yapımıza uygun ürünler olacak, ileride otomotiv eklenince o da girilir"). Göç 0053.
// 1) Haber masasının son 30 gününden söylenti / sızıntı / çıkış duyurusu haberleri ürün ürün toplanır.
// 2) Yapay zekâ (aramasız) konu dışını eler: yalnız panelin ürün türlerinden birine giren, belirli bir donanım modeli kalır.
// 3) Seçilenler Brave aramasıyla bulunan sayfalardan (ücretsiz Gemini okur) doğrulanır: aşama, tahmini çıkış ayı, tek cümle tanım. Resmî duyuru dışında en az iki ayrı site şartı.
// 4) Sonuç public.radar_adaylari'na yazılır; panel 15 dakikada bir işler (site deposu apps/cms/src/lib/radar.ts).
// Günde bir tur, turda en çok ARAMA_MAX arama (Gemini kotası). Zamanlayıcı sunucu içinden çağırır; Stüdyo'dan yönetici elle başlatabilir.
import { createClient } from "npm:@supabase/supabase-js@2";
import { anahtarHatasi, anahtarlar as geminiAnahtarlari, isaretle } from "./anahtar.ts";
import { claudeAramali, claudeJson, CLAUDE_MODEL, jsonAl } from "../triyaj-taslak/claude.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const yanit = (j: unknown, status = 200) => Response.json(j, { status, headers: CORS });
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
function jsonOku(s: string) { try { return JSON.parse(s); } catch { const m = s.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } }
type Sb = ReturnType<typeof createClient>;

const GUN = 30;            // haber masasında geriye bakılan gün
const ARAMA_MAX = 8;       // turda en çok doğrulama araması
const TEKRAR_GUN = 3;      // radardaki ürün kaç günde bir yeniden doğrulanır
const DURUMLAR = ["soylenti", "sizinti", "test", "takvim", "duyuruldu", "satista"] as const;
type Durum = typeof DURUMLAR[number];
/** Çıkış haberi sayılacak resmî haber: tanıtım, duyuru, tarih, ön sipariş */
const CIKIS = /tanıt|duyur|çıkış|piyasaya|satışa|ön sipariş|lansman|etkinli|davetiye|launch|announce|release|pre-?order/i;
const sade = (x: string) => x.toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[^a-z0-9]/g, "");
/** Ad markayla başlıyorsa marka çıkarılır: "Samsung Galaxy S27" → "Galaxy S27" */
const markasiz = (marka: string, ad: string) => { const m = marka.trim(), a = ad.trim(); return a.toLocaleLowerCase("tr-TR").startsWith(m.toLocaleLowerCase("tr-TR") + " ") ? a.slice(m.length + 1) : a; };
const anahtarYap = (marka: string, ad: string) => sade(marka) + ":" + sade(markasiz(marka, ad));

async function gemini(sistem: string, istem: string, arama: boolean): Promise<{ v: any; kaynaklar: { baslik: string; url: string }[] }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const anahtarlar = await geminiAnahtarlari();
  if (!anahtarlar.length) throw new Error("GEMINI_API_KEY yok");
  const modeller = arama ? ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"] : ["gemini-3.5-flash-lite", "gemini-3.6-flash"];
  let son = "";
  for (const a of anahtarlar) { let hepsiKota = true; for (const model of modeller) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(90_000), headers: { "Content-Type": "application/json", "x-goog-api-key": a.deger },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sistem }] }, contents: [{ role: "user", parts: [{ text: istem }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
      });
      const g = await r.text();
      if (!r.ok) {
        son = `${a.etiket} · ${model} ${r.status} ${g.slice(0, 120)}`;
        const ah = anahtarHatasi(r.status, g);
        if (ah === "gecersiz") { await isaretle(a, "gecersiz", son); hepsiKota = false; break; }
        if (ah !== "kota_dolu") hepsiKota = false;
        continue;
      }
      hepsiKota = false; await isaretle(a, "calisiyor");
      const c = JSON.parse(g)?.candidates?.[0];
      const metin = (c?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
      const v = jsonOku(metin);
      if (!v) { son = `${model} geçersiz yanıt`; continue; }
      const kaynaklar = (c?.groundingMetadata?.groundingChunks ?? []).map((x: { web?: { uri?: string; title?: string } }) => ({ baslik: x.web?.title ?? "", url: x.web?.uri ?? "" })).filter((x: { url: string }) => x.url).slice(0, 12);
      return { v, kaynaklar };
    } catch { son = `${model} yanıt vermedi`; hepsiKota = false; }
  }
  if (hepsiKota) await isaretle(a, "kota_dolu", son); }
  // Yedek (5 Kasım 2026: o sabah tur ücretsiz Gemini kotası dolduğu için hiç çalışmadı): Claude Haiku aynı istemle
  const c = await claudeJson({ sistem, kullanici: istem, model: CLAUDE_MODEL.kucuk, ms: 90_000, maxTokens: 8_000, caba: "low", fonk: "radar-otomatik" }).catch((e) => { son += ` | Claude: ${String((e as Error).message ?? e).slice(0, 80)}`; return null; });
  if (c?.veri) return { v: c.veri, kaynaklar: [] };
  throw new Error("Yapay zekâ yanıt vermedi (" + son + ")");
}
const kotaDolu = (m: string) => /\b429\b|RESOURCE_EXHAUSTED|quota|kota/i.test(m);

const ELEME = (turler: string[]) => `Bir teknoloji ve ekipman sitesinin "çıkış radarı" editörüsün. Sana haber masasından ürün grupları geliyor: "n | marka | ürün | haber türleri | kaynak sayısı | örnek olay".
Görevin radara girebilecekleri seçmek. Radar: HENÜZ SATIŞA ÇIKMAMIŞ, belirli bir DONANIM MODELİ (adıyla anılan cihaz).
SİTENİN ÜRÜN TÜRLERİ (yalnız bunlar): ${turler.join(", ")}
KURALLAR:
- Yalnız bu türlerden birine giren ürünleri seç; türü listede yoksa (ör. otomobil, film, dizi, oyun, yazılım, uygulama, hizmet, şirket, yatırım, işlemci fiyatı) ALMA.
- Genel ifadeleri alma ("kamera", "yeni iPhone'lar", "katlanabilir telefon"); belirli model adı olmalı ("Galaxy S27 Ultra", "Sony A7 V").
- Haber ürünün satışa çıktığını, indirimini, incelemesini ya da kullanıcı sorununu anlatıyorsa ALMA.
- Aynı ürünü anlatan grupları tek üründe birleştir (n listesine hepsini yaz).
- "marka": üreticinin yaygın adı (Samsung, Apple, DJI, Sony). "ad": markasız model adı. "tur": yukarıdaki türlerden tam biri.
Yanıtı YALNIZ şu JSON olarak ver: {"urunler":[{"n":[0,3],"marka":"Samsung","ad":"Galaxy S27 Ultra","tur":"phone"}]}`;

const DOGRULA = `Bir teknoloji sitesinin "çıkış radarı" editörüsün. Verilen ürünün bugünkü durumunu YALNIZ SANA VERİLEN SAYFA METİNLERİNDEN çıkar (internette arama yapma). Bugünün tarihi: ${new Date().toISOString().slice(0, 10)}.
AŞAMALAR (en ileri olanı seç):
- "soylenti": yalnız iddia, analist ya da tedarik zinciri söylentisi
- "sizinti": görseller, kılıf, teknik özellikler ya da kutu sızdı
- "test": sertifika ya da test kaydı görüldü (FCC, TENAA, Bluetooth SIG, Geekbench vb.)
- "takvim": üretici tanıtım etkinliğinin tarihini açıkladı ama ürün henüz tanıtılmadı
- "duyuruldu": üretici ürünü resmî olarak tanıttı, henüz satışta değil (ön sipariş dahil)
- "satista": ürün herhangi bir ülkede satışa çıktı
KURALLAR:
- Ürün gerçekten konuşulan belirli bir model değilse ya da metinlerde güvenilir bilgi yoksa "gercek": false ver.
- "kaynak_sayisi": metinlerden kaç tanesi bu ürünü açıkça anlatıyor (sayı).
- "tahmini_ay": beklenen ya da açıklanan çıkış ayı "YYYY-MM"; kaynaklarda hiç ipucu yoksa null. Uydurma.
- "tarih_notu": kısa Türkçe not, en çok 40 karakter (ör. "Eylül etkinliği", "CES 2027", "Aralık başı"); yoksa "".
- "ozet": ürünü tanıtan tek Türkçe cümle, en çok 140 karakter, iddia ise "iddiaya göre" de.
- "ad": metinlerdeki tam ve ayırt edici model adı, markasız; nesil, boyut ya da yıl varsa ekle (ör. "MacBook Pro 14 inç (M6)", "Galaxy S27 Ultra"). "marka": üretici.
Yanıtı YALNIZ şu JSON olarak ver: {"gercek":true,"marka":"...","ad":"...","durum":"sizinti","tahmini_ay":"2027-02","tarih_notu":"","ozet":"...","kaynak_sayisi":2}`;


// Arama ve okuma (31 Ekim 2026): ücretsiz Gemini'de Google arama aracı her istekte 429 veriyor; ürün haberleri Brave Search API ile
// bulunur (Stüdyo → Bağlantı anahtarları "brave_arama", künye otomasyonuyla ortak aylık sayaç ve sınır), sayfalar sunucuda okunur.
const UA = "Mozilla/5.0 (compatible; UpdatedStudyo/1.0; +https://www.updated.com.tr; cikis radari)";
const BRAVE_AY_SINIR = 700;
const duz = (x: string) => String(x ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const hostAl = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const ATLA = /youtube\.|amazon\.|reddit\.|facebook\.|instagram\.|tiktok\.|x\.com|twitter\.|pinterest\.|ebay\.|aliexpress\./i;
async function braveAra(sb: Sb, q: string): Promise<{ url: string; baslik: string }[]> {
  const { data } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", "brave_arama").maybeSingle();
  const anahtar = (data as { deger?: string } | null)?.deger;
  if (!anahtar) throw new Error("Brave arama anahtarı girilmemiş (Stüdyo → Bağlantı anahtarları)");
  const ay = new Date().toISOString().slice(0, 7);
  const { data: sy } = await sb.from("tr_settings").select("value").eq("key", "brave_sayac").maybeSingle();
  const sayac = (sy?.value as { ay?: string; adet?: number } | null)?.ay === ay ? Number((sy!.value as { adet?: number }).adet ?? 0) : 0;
  if (sayac >= BRAVE_AY_SINIR) throw new Error(`Brave aylık sınır doldu (${sayac}/${BRAVE_AY_SINIR}) kota`);
  await sb.from("tr_settings").upsert({ key: "brave_sayac", value: { ay, adet: sayac + 1 } });
  const r = await fetch("https://api.search.brave.com/res/v1/web/search?count=8&freshness=pm&q=" + encodeURIComponent(q), { headers: { Accept: "application/json", "X-Subscription-Token": anahtar }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Brave ${r.status}`);
  const j = await r.json();
  return ((j?.web?.results ?? []) as { url: string; title?: string }[]).filter((x) => /^https?:\/\//.test(x.url) && !ATLA.test(x.url)).map((x) => ({ url: x.url, baslik: duz(x.title ?? "") }));
}
async function sayfalariOku(adaylar: { url: string; baslik: string }[]) {
  const cikan: { url: string; baslik: string; metin: string }[] = [];
  for (const x of adaylar.slice(0, 6)) {
    if (cikan.length >= 3) break;
    const r = await fetch(x.url, { headers: { "User-Agent": UA, "Accept-Language": "en,tr" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r?.ok || !/html/i.test(r.headers.get("content-type") ?? "")) { await r?.body?.cancel().catch(() => {}); continue; }
    const t = duz((await r.text()).replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " "));
    if (t.length < 800) continue;
    cikan.push({ url: x.url, baslik: x.baslik || hostAl(x.url), metin: t.slice(0, 9_000) });
  }
  return cikan;
}

type Haber = { id: number; source_name: string; brand: string; product: string; kind: string; event: string; other_sources: { name?: string }[] | null };
type Grup = { marka: string; ad: string; turler: Set<string>; kaynaklar: Set<string>; haberler: number[]; olay: string };
type Mevcut = { id: number; ad: string; marka: string; tur: string; durum: string; radarda: boolean; radar_oto: boolean; tarih: string | null };
type Satir = { anahtar: string; marka: string; ad: string; tur: string; durum: string; tarih: string | null; tarih_notu: string; kontrol_zamani: string; haberler: number[]; islem: string };

async function isle(sb: Sb, hizli = false) {
  const turler = ((await sb.rpc("radar_turler")).data as string[] | null ?? []).filter((t) => t !== "other");
  if (!turler.length) throw new Error("Ürün türleri okunamadı (göç 0053)");
  const mevcut = ((await sb.rpc("radar_urunler")).data as Mevcut[] | null) ?? [];
  const urunHarita = new Map(mevcut.map((u) => [anahtarYap(u.marka, u.ad), u]));
  const { data: satirlar } = await sb.from("radar_adaylari").select("anahtar,marka,ad,tur,durum,tarih,tarih_notu,kontrol_zamani,haberler,islem");
  const kayit = new Map(((satirlar ?? []) as Satir[]).map((s) => [s.anahtar, s]));

  // 1) Haber masası: söylenti, sızıntı ve çıkışla ilgili resmî haberler, ürün ürün
  const { data: haberler } = await sb.from("tr_items").select("id,source_name,brand,product,kind,event,other_sources")
    .eq("deneme", false).gte("created_at", new Date(Date.now() - GUN * 864e5).toISOString()).neq("product", "").in("kind", ["Söylenti", "Sızıntı", "Resmi"]).limit(5000);
  const gruplar = new Map<string, Grup>();
  for (const h of (haberler ?? []) as Haber[]) {
    if (h.kind === "Resmi" && !CIKIS.test(h.event)) continue;
    if (!h.brand || !h.product) continue;
    const k = anahtarYap(h.brand, h.product);
    const g = gruplar.get(k) ?? { marka: h.brand, ad: markasiz(h.brand, h.product), turler: new Set(), kaynaklar: new Set(), haberler: [], olay: h.event };
    g.turler.add(h.kind); g.kaynaklar.add(h.source_name); (h.other_sources ?? []).forEach((o) => o?.name && g.kaynaklar.add(o.name)); g.haberler.push(h.id);
    if (h.kind !== "Resmi") g.olay = h.event;
    gruplar.set(k, g);
  }
  // Zaten satışta olan ve yakın zamanda doğrulanmış ürünler elemeye hiç girmez
  const yakin = (k: string) => { const s = kayit.get(k); return !!s && Date.now() - Date.parse(s.kontrol_zamani) < TEKRAR_GUN * 864e5; };
  const liste = [...gruplar.entries()].filter(([k]) => { const u = urunHarita.get(k); return !yakin(k) && !(u && (u.durum === "satista" || u.durum === "eol")); })
    .filter(([k]) => !hizli || (!kayit.has(k) && !urunHarita.has(k))) // hızlı tur: yalnız ilk kez görülen ürünler
    .sort((a, b) => b[1].kaynaklar.size - a[1].kaynaklar.size || b[1].haberler.length - a[1].haberler.length).slice(0, hizli ? 40 : 150);
  if (hizli && !liste.length) return { zaman: new Date().toISOString(), hizli: true, yeni: 0 }; // yeni ürün yok: yapay zekâ ve arama harcanmaz
  const sinir = hizli ? 3 : ARAMA_MAX;

  // 2) Eleme (aramasız, ucuz model)
  type Secilen = { marka: string; ad: string; tur: string; haberler: number[]; kaynak: number };
  const secilen: Secilen[] = [];
  if (liste.length) {
    const istem = liste.map(([, g], n) => `${n} | ${g.marka} | ${g.ad} | ${[...g.turler].join("/")} | ${g.kaynaklar.size} | ${g.olay.slice(0, 140)}`).join("\n");
    const { v } = await gemini(ELEME(turler), istem, false);
    for (const u of Array.isArray(v?.urunler) ? v.urunler : []) {
      const nler = (Array.isArray(u?.n) ? u.n : []).filter((n: unknown) => Number.isInteger(n) && liste[n as number]) as number[];
      if (!nler.length || !u.marka || !u.ad || !turler.includes(u.tur)) continue;
      const gs = nler.map((n) => liste[n][1]);
      secilen.push({ marka: String(u.marka).slice(0, 60), ad: markasiz(String(u.marka), String(u.ad)).slice(0, 80), tur: u.tur, haberler: [...new Set(gs.flatMap((g) => g.haberler))].slice(0, 30), kaynak: new Set(gs.flatMap((g) => [...g.kaynaklar])).size });
    }
  }

  // 3) Doğrulanacaklar: yeni adaylar (çok kaynaklı önce), sonra radardaki ürünlerin yeniden kontrolü (en eski kontrol önce)
  type Is = { marka: string; ad: string; tur: string; haberler: number[] };
  const isler: Is[] = [], alinan = new Set<string>();
  const ekle = (x: Is) => { const k = anahtarYap(x.marka, x.ad); if (alinan.has(k) || yakin(k)) return; const u = urunHarita.get(k);
    if (u && u.radar_oto && !u.radarda && u.durum !== "satista") return; // editör radardan çıkarmış: dokunma
    alinan.add(k); isler.push(x); };
  secilen.sort((a, b) => b.kaynak - a.kaynak).forEach((s) => ekle(s));
  const yeniSinir = hizli ? sinir : Math.max(ARAMA_MAX - 3, 1); // tam turda en az 3 yer yeniden kontrole kalır; hızlı turda yeniden kontrol yok
  const yeniler = isler.splice(0, yeniSinir); isler.length = 0; yeniler.forEach((x) => isler.push(x));
  const radardakiler = mevcut.filter((u) => u.radarda && u.durum !== "satista").map((u) => ({ u, s: kayit.get(anahtarYap(u.marka, u.ad)) }))
    .sort((a, b) => Date.parse(a.s?.kontrol_zamani ?? "1970") - Date.parse(b.s?.kontrol_zamani ?? "1970"));
  if (!hizli) for (const { u } of radardakiler) if (isler.length < ARAMA_MAX) ekle({ marka: u.marka, ad: u.ad, tur: u.tur, haberler: kayit.get(anahtarYap(u.marka, u.ad))?.haberler ?? [] });
  for (const s of secilen) if (isler.length < sinir) ekle(s);

  // 4) İnternetten doğrulama ve yazma
  const sonuc: { urun: string; sonuc: string }[] = [];
  for (const x of isler) {
    const ad = `${x.marka} ${x.ad}`;
    try {
      const bulunan = await braveAra(sb, `${ad} release date leak announced`);
      const sayfalar = await sayfalariOku(bulunan);
      if (!sayfalar.length) { sonuc.push({ urun: ad, sonuc: `sayfa okunamadı (${bulunan.length} aday)` }); continue; }
      const metin = sayfalar.map((y, i) => `[${i + 1}] KAYNAK: ${y.url}\n${y.metin}`).join("\n\n---\n\n");
      const { v } = await gemini(DOGRULA, `ÜRÜN: ${ad}\nTÜR: ${x.tur}\n\nSAYFALAR:\n${metin}`, true);
      const kaynaklar = sayfalar.map((y) => ({ baslik: y.baslik, url: y.url }));
      const durum = DURUMLAR.includes(v?.durum) ? v.durum as Durum : null;
      const siteler = new Set([...sayfalar.map((y) => hostAl(y.url))].slice(0, Math.max(1, Number(v?.kaynak_sayisi) || 0)));
      const k = anahtarYap(x.marka, x.ad), eski = kayit.get(k), u = urunHarita.get(k);
      const simdi = new Date().toISOString();
      if (!v?.gercek || !durum) { if (eski) await sb.from("radar_adaylari").update({ kontrol_zamani: simdi }).eq("anahtar", k); sonuc.push({ urun: ad, sonuc: "doğrulanamadı" }); continue; }
      // Tek bir sitenin iddiasıyla radara girilmez; resmî duyuru ya da satış bilgisi tek kaynakla da yeter
      if (siteler.size < 2 && !["duyuruldu", "satista"].includes(durum) && !u) { sonuc.push({ urun: ad, sonuc: "tek kaynak" }); continue; }
      if (durum === "satista" && !u) { sonuc.push({ urun: ad, sonuc: "zaten satışta, künyesi yok" }); continue; }
      const ay = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v.tahmini_ay ?? "")) ? `${v.tahmini_ay}-01` : null;
      const tarihNotu = String(v.tarih_notu ?? "").slice(0, 40);
      const degisti = !eski || eski.durum !== durum || (eski.tarih ?? null) !== ay || eski.tarih_notu !== tarihNotu;
      const satir = {
        anahtar: k, marka: x.marka, ad: (eski?.ad && u ? eski.ad : markasiz(x.marka, String(v.ad || x.ad))).slice(0, 80), tur: x.tur, durum, tarih: ay, tarih_notu: tarihNotu, ozet: String(v.ozet ?? "").slice(0, 160),
        kaynaklar, haberler: [...new Set([...(eski?.haberler ?? []), ...x.haberler])].slice(-40), kontrol_zamani: simdi, updated_at: simdi,
        ...(degisti || eski?.islem === "hata" ? { islem: "bekliyor", islem_notu: "" } : {}),
      };
      const { error } = await sb.from("radar_adaylari").upsert(satir, { onConflict: "anahtar" });
      if (error) throw new Error(error.message);
      sonuc.push({ urun: ad, sonuc: degisti ? `${durum}${ay ? " · " + ay.slice(0, 7) : ""}` : "değişiklik yok" });
    } catch (e) {
      if (kotaDolu(String((e as Error).message))) { sonuc.push({ urun: ad, sonuc: "kota dolu" }); break; }
      sonuc.push({ urun: ad, sonuc: "hata: " + String((e as Error).message).slice(0, 120) });
    }
  }
  const ozet = { zaman: new Date().toISOString(), ...(hizli ? { hizli: true } : {}), haber_grubu: gruplar.size, elemeye_giren: liste.length, secilen: secilen.length, dogrulanan: sonuc };
  await sb.from("tr_settings").upsert({ key: "son_radar", value: ozet });
  return ozet;
}

// ---------- Katalog (5 Kasım 2026, kullanıcı: "künyeye güncel markaların son ürünlerini ekle") ----------
// Künyedeki markaların, künyedeki türlerinde son 12 ayda resmî duyurduğu ya da satışa çıkardığı ürünleri Claude web aramasıyla bulunur;
// künyede olmayanlar radar_adaylari'na islem_notu 'katalog' ile yazılır. Panel (site deposu lib/radar.ts) künyeyi açar, künye otomasyonu doldurur.
// Bir turda en çok KATALOG_SINIR yeni ürün (Brave aylık sınırı künyeyle ortak: ürün başına ~3 arama). Marka 30 günde bir taranır
// (tr_settings.katalog_v2; ilk sürüm kaynak adresini birebir aradığı için DJI'de hiç ürün eklememişti); süre biterse kalan markalar için kendini yeniden çağırır.
const KATALOG_SINIR = 40;
const KATALOG_SISTEM = `Bir Türkçe teknoloji sitesinin ürün künyesi editörüsün. Verilen markanın, verilen ürün türlerinde SON 12 AYDA resmî olarak duyurduğu ya da satışa çıkardığı ürünleri web'de arayarak bul (bugün: ${new Date().toISOString().slice(0, 10)}).
Kurallar:
- Yalnız markanın resmî duyurusu yapılmış, belirli model adı olan donanımlar. Söylenti, sızıntı, sertifika kaydı OLMAZ.
- Aksesuar, kılıf, kit/paket, yazılım, renk ya da depolama seçeneği ayrı ürün sayılmaz.
- "ad": tam resmî model adı, marka adı olmadan (ör. "Osmo Pocket 4", "FE 50mm F1.4 GM", "Galaxy S26 Ultra").
- "tur": verilen türlerden biri. "durum": satışa çıktıysa "satista", yalnız duyurulduysa "duyuruldu". "ay": çıkış ya da duyuru ayı "YYYY-AA".
- "kaynak": bunu doğrulayan sayfa (tercihen markanın kendi sitesi ya da basın bülteni), aramada gördüğün adres.
- Künyede zaten olanları tekrar yazma. Türkiye'de satılmayan bölgeye özel modelleri yazma.
Önce ara: türlere göre birkaç arama yap (ör. "<marka> new <tür> announced 2026", "<marka> launches"); bilgine değil arama sonuçlarına dayan. Arama hakkın sınırlıdır; hak bitince ("arama sınırı" uyarısı) yeni arama isteme, o ana kadarki sonuçlarda doğrulanan ürünleri yaz. Emin olmadığını yazma.
En önemli en çok 8 ürün. Yanıtın sonunda YALNIZ şu JSON: {"urunler":[{"ad":"","tur":"","durum":"satista","ay":"2026-03","kaynak":"https://..."}]}`;
async function katalog(sb: Sb, sira: number) {
  const t0 = Date.now();
  const turler = ((await sb.rpc("radar_turler")).data as string[] | null ?? []).filter((t) => !["other", "accessory"].includes(t));
  const mevcut = ((await sb.rpc("radar_urunler")).data as Mevcut[] | null) ?? [];
  const { data: satirlar } = await sb.from("radar_adaylari").select("anahtar");
  const var_ = new Set([...mevcut.map((u) => anahtarYap(u.marka, u.ad)), ...((satirlar ?? []) as { anahtar: string }[]).map((x) => x.anahtar)]);
  const { data: ky } = await sb.from("tr_settings").select("value").eq("key", "katalog_v3").maybeSingle();
  const kayit = (ky?.value ?? {}) as { markalar?: Record<string, string>; eklenen?: number; ay?: string };
  const ay = new Date().toISOString().slice(0, 7);
  const markalar: Record<string, string> = kayit.markalar ?? {};
  let eklenen = kayit.ay === ay ? Number(kayit.eklenen ?? 0) : 0;
  // Markalar: künyedeki ürün sayısına göre; türleri künyedeki türleri
  const grup = new Map<string, { turler: Set<string>; adlar: string[] }>();
  for (const u of mevcut) { const g = grup.get(u.marka) ?? { turler: new Set(), adlar: [] }; if (turler.includes(u.tur)) g.turler.add(u.tur); g.adlar.push(u.ad); grup.set(u.marka, g); }
  const sirali = [...grup.entries()].filter(([m, g]) => g.turler.size && Date.now() - Date.parse(markalar[m] ?? "1970") > 30 * 864e5).sort((a, b) => b[1].adlar.length - a[1].adlar.length);
  const sonuc: { marka: string; eklenen: string[]; reddedilen?: string[] }[] = [];
  for (const [marka, g] of sirali) {
    if (eklenen >= KATALOG_SINIR || Date.now() - t0 > 250_000) break;
    const c = await claudeAramali({ sistem: KATALOG_SISTEM, kullanici: `MARKA: ${marka}\nTÜRLER: ${[...g.turler].join(", ")}\nKÜNYEDE ZATEN OLANLAR: ${g.adlar.join(", ")}`, model: CLAUDE_MODEL.taslak, ms: 120_000, maxArama: 8, fonk: "radar-otomatik" }).catch((e) => { console.error("katalog", marka, e); return null; });
    if (!c) break; // Claude yok ya da hata: sonraki tur dener
    let v: { urunler?: { ad?: string; tur?: string; durum?: string; ay?: string; kaynak?: string }[] } = {};
    try { v = jsonAl(c.metin) as typeof v; } catch { /* boş */ }
    const gorulen = new Set(c.adresler.map(hostAl)); // kaynak sitesi aramada görülmüş olmalı (adres birebir aynı olmayabilir)
    const yeni: string[] = [], reddedilen: string[] = [];
    if (!Array.isArray(v.urunler) || !v.urunler.length) { // boş ya da okunamayan yanıt: marka işaretlenmez, sonraki tur yine dener; yanıtın sonu teşhis için kaydedilir
      sonuc.push({ marka, eklenen: [], reddedilen: [`${Array.isArray(v.urunler) ? "boş liste" : "yanıt okunamadı"} (${c.adresler.length} arama sonucu): ${c.metin.slice(-240)}`] });
      await sb.from("tr_settings").upsert({ key: "katalog_v3", value: { markalar, eklenen, ay, son: { zaman: new Date().toISOString(), sonuc } } });
      continue;
    }
    for (const u of Array.isArray(v.urunler) ? v.urunler : []) {
      if (eklenen >= KATALOG_SINIR) break;
      const ad = markasiz(marka, String(u?.ad ?? "")).trim().slice(0, 80);
      if (!ad || !g.turler.has(String(u?.tur)) || !["satista", "duyuruldu"].includes(String(u?.durum))) { reddedilen.push(`${ad}: tür/durum`); continue; }
      if (!gorulen.has(hostAl(String(u?.kaynak ?? "")))) { reddedilen.push(`${ad}: kaynak aramada yok`); continue; } // kaynak uydurulmasın
      const k = anahtarYap(marka, ad);
      if (var_.has(k)) { reddedilen.push(`${ad}: zaten var`); continue; }
      const simdi = new Date().toISOString();
      const ayx = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(u.ay ?? "")) ? `${u.ay}-01` : null;
      const { error } = await sb.from("radar_adaylari").upsert({ anahtar: k, marka, ad, tur: u.tur, durum: u.durum, tarih: ayx, tarih_notu: "", ozet: "", kaynaklar: [{ baslik: hostAl(String(u.kaynak)), url: u.kaynak }], haberler: [], kontrol_zamani: simdi, updated_at: simdi, islem: "bekliyor", islem_notu: "katalog" }, { onConflict: "anahtar" });
      if (error) { console.error("katalog yaz", error.message); continue; }
      var_.add(k); eklenen++; yeni.push(ad);
    }
    markalar[marka] = new Date().toISOString();
    sonuc.push({ marka, eklenen: yeni, reddedilen: reddedilen.slice(0, 10) });
    await sb.from("tr_settings").upsert({ key: "katalog_v3", value: { markalar, eklenen, ay, son: { zaman: new Date().toISOString(), sonuc } } });
  }
  const kalan = sirali.filter(([m]) => !sonuc.some((x) => x.marka === m)).length;
  if (kalan && eklenen < KATALOG_SINIR && sonuc.length && sira < 10) {
    await fetch("http://functions:9000/radar-otomatik", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ katalog: true, sira: sira + 1 }), signal: AbortSignal.timeout(15_000) }).catch(() => {});
  }
  return { katalog: true, sonuc, eklenen, kalan };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return yanit({ error: "POST gerekli" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: k } = jwt ? await sb.auth.getUser(jwt) : { data: null };
  const zamanlayici = !k?.user && !req.headers.get("x-forwarded-for");
  if (!zamanlayici) {
    if (!k?.user) return yanit({ error: "Stüdyo girişi gerekli" }, 401);
    const { data: p } = await sb.from("profiles").select("is_admin").eq("id", k.user.id).maybeSingle();
    if (!p?.is_admin) return yanit({ error: "Yalnız yöneticiler" }, 403);
  }
  const b = await req.json().catch(() => ({}));
  const is = (b?.katalog === true ? katalog(sb, Number(b.sira) || 0) : isle(sb, b?.hizli === true && zamanlayici)).catch(async (e) => { const v = { zaman: new Date().toISOString(), hata: String((e as Error).message).slice(0, 300) }; await sb.from("tr_settings").upsert({ key: "son_radar", value: v }); return v; });
  if (zamanlayici) { EdgeRuntime.waitUntil(is); return yanit({ basladi: true }); }
  return yanit(await is);
});
