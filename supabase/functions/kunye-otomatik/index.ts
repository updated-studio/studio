// Künye otomasyonu (25 Ekim 2026, kullanıcı: "kaynaklarından çekeceğimiz bir otomasyon"; 29 Ekim: resmî sayfadan sonra B&H Photo): her ürün için yapay zekâ Google aramasıyla
// resmî üretici sayfasını (yoksa güvenilir kaynağı) bulur, ürünün özellik şablonundaki değerleri kaynak bağlantısı ve kanıtıyla önerir.
// Öneriler public.kunye_oneriler'e yazılır (göç 0036); editör Stüdyo → Site → Künye onayı'ndan onaylayınca panele yazılır.
// POST { adet?: 1-3, urun_id?: number } · Giriş: Stüdyo oturumu. Ürünler panelin herkese açık API'sinden okunur.
// Zamanlayıcı (27 Ekim 2026, kullanıcı: "her gün otomatik"): günde 4 kez sunucu içinden 3'er ürün (göç 0042); oturumsuz çağrı yalnız
// sunucu içinden (X-Forwarded-For'suz) kabul edilir, arka planda çalışır. Kota dolunca durur, ürünü "hata" diye işaretlemez (ertesi tur yeniden dener).
import { createClient } from "npm:@supabase/supabase-js@2";
import { anahtarHatasi, anahtarlar as geminiAnahtarlari, isaretle } from "./anahtar.ts";
import { claudeJson } from "../triyaj-taslak/claude.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const yanit = (j: unknown, status = 200) => Response.json(j, { status, headers: CORS });
const PANEL = Deno.env.get("PANEL_URL") || "https://panel.updated.com.tr";
const ADRES = Deno.env.get("PUBLIC_SUPABASE_URL") || "https://panel.updated.com.tr";
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
function jsonOku(s: string) { try { return JSON.parse(s); } catch { const m = s.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } }

type Spec = { key: string; unit?: string | null; value?: string | null };
type Urun = { id: number; name: string; brand: string; type: string; specs?: Spec[] };

const SISTEM = `Sen bir teknoloji sitesinin ürün veritabanı editörüsün. Görevin bir ürünün teknik özelliklerini İNTERNETTE ARAYARAK bulmak.
KURALLAR:
- Önce üreticinin resmî ürün/teknik özellik sayfasını ara ve kullan. Orada yoksa ya da eksikse İKİNCİ KAYNAK B&H Photo'dur (bhphotovideo.com, ürünün "Specs" sekmesi). Orada da yoksa güvenilir bir kaynak (DPReview, GSMArena, üreticinin basın bülteni) kullan.
- Yalnız kaynakta açıkça yazan bilgiyi ver. Tahmin etme; emin değilsen o özelliği listeye koyma. Söylenti/sızıntı kullanma.
- "value": kısa Türkçe değer, birimiyle; ondalıkta virgül (ör. "24,2 MP", "658 g (pil ve kartla)", "4K 60p (10-bit)").
- "num": karşılaştırma için tek sayı, özelliğin birimi cinsinden (ör. 658), sayısal değilse null.
- "kaynak": değeri aldığın sayfanın TAM adresi (https://…). "kanit": o sayfadan kısa alıntı (en fazla 120 karakter).
- Fiyatı yalnız Türkiye fiyatı (TL) resmî kaynakta yazıyorsa doldur.
- "Boyutlar": genişlik × yükseklik × derinlik, milimetre (ör. "131 × 96 × 80 mm"); lensse çap × uzunluk (ör. "Ø 81 × 128 mm"). num: null.
- "urunSayfasi": üreticinin bu ürüne ait resmî ürün sayfasının TAM adresi (yoksa null).
- "resmiAd": ürünün kaynakta yazan tam ve ayırt edici model adı, markasız (ör. "MacBook Pro 14 inç (M6, 2026)", "Nikkor Z 120-300mm f/2.8 TC VR S"). Verilen ad zaten tam ve doğruysa ya da emin değilsen null.
- "gorselAdresi": üreticinin sitesindeki ya da basın kitindeki ürün fotoğrafının DOĞRUDAN adresi (.jpg/.png/.webp; tercihen düz zeminli, önden ya da 3/4 açı); bulamazsan null. Uydurma.
Yanıtı YALNIZ şu JSON olarak ver, başka metin yazma:
{"urunSayfasi":"https://...","resmiAd":null,"gorselAdresi":null,"ozellikler":[{"key":"...","value":"...","num":null,"kaynak":"https://...","kanit":"..."}]}`;

/** Künye görseli (27 Ekim 2026): üreticinin resmî ürün sayfasındaki paylaşım görseli (og:image / JSON-LD image).
 *  Yalnız marka alan adındaki sayfalardan alınır; arka planı sunucudaki işçi siler (scripts/kunye-gorsel), editör onaylar. */
const UA = "Mozilla/5.0 (compatible; UpdatedStudyo/1.0; +https://www.updated.com.tr; kunye gorseli)";
const sade = (x: string) => x.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/g, "");
const hostAl = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
type Gorsel = { url: string; sayfa: string; kaynak: string; yazar: string; lisans: string };
/** Adres gerçekten büyükçe bir görsel mi (içerik türü ve boyutu) */
async function gorselMi(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r?.ok || !/^image\/(jpe?g|png|webp)/i.test(r.headers.get("content-type") ?? "")) { await r?.body?.cancel().catch(() => {}); return false; }
  const uzunluk = Number(r.headers.get("content-length") ?? 0);
  if (uzunluk) { await r.body?.cancel().catch(() => {}); return uzunluk > 25_000; }
  return (await r.arrayBuffer()).byteLength > 25_000;
}
const duz = (x: string) => String(x ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
async function gorselBul(marka: string, ad: string, gemini: string | null | undefined, adaylar: (string | null | undefined)[]): Promise<Gorsel | null> {
  const m = sade(marka).slice(0, 5);
  // 1) Üreticinin resmî sayfalarındaki paylaşım görseli
  const sayfalar = [...new Set(adaylar.filter((u): u is string => !!u && /^https?:\/\//.test(u) && !!m && sade(hostAl(u)).includes(m)))].slice(0, 4);
  for (const sayfa of sayfalar) {
    const h = await fetch(sayfa, { headers: { "User-Agent": UA, "Accept-Language": "tr,en" }, signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
    if (!h) continue;
    const meta = (k: string) => h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ?? h.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${k}["']`, "i"))?.[1];
    const ham = meta("og:image(?::secure_url)?") ?? meta("twitter:image(?::src)?") ?? h.match(/"image"\s*:\s*(?:\[\s*)?"(https?:[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i)?.[1];
    if (!ham || /logo|favicon|default|placeholder|avatar|share-image|og-default/i.test(ham)) continue;
    let url = ""; try { url = new URL(ham.replace(/&amp;/g, "&"), sayfa).href; } catch { continue; }
    if (await gorselMi(url)) return { url, sayfa, kaynak: "Üretici", yazar: marka, lisans: "Basın görseli" };
  }
  // 2) Yapay zekânın bulduğu doğrudan görsel adresi (indirilip doğrulanır)
  if (gemini && /^https?:\/\//.test(gemini) && await gorselMi(gemini)) return { url: gemini, sayfa: gemini, kaynak: "Üretici", yazar: marka, lisans: "Basın görseli" };
  // 3) Wikimedia Commons: serbest lisanslı (CC0, kamu malı, CC BY, CC BY-SA) gerçek fotoğraf
  const q = `${marka} ${ad}`;
  const j = await fetch("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1600&iiextmetadatafilter=LicenseShortName|Artist&gsrsearch=" + encodeURIComponent(q + " filetype:bitmap"),
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => null);
  const ilk = sade(ad).slice(0, 6);
  for (const p of Object.values((j?.query?.pages ?? {}) as Record<string, { title: string; index?: number; imageinfo?: Record<string, any>[] }>).sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const i = p.imageinfo?.[0], lisans = duz(i?.extmetadata?.LicenseShortName?.value ?? "");
    if (!i || !/jpe?g|png|webp/i.test(i.mime ?? "") || (i.width ?? 0) < 800 || !/^(cc0|public domain|pd|cc[- ]by(-sa)?[- ]\d)/i.test(lisans) || !sade(p.title).includes(ilk)) continue;
    return { url: i.thumburl ?? i.url, sayfa: i.descriptionurl, kaynak: "Wikimedia Commons", yazar: duz(i.extmetadata?.Artist?.value ?? "").slice(0, 80) || "Bilinmiyor", lisans };
  }
  return null;
}

type Sayfa = { url: string; baslik: string; metin: string; resmi: boolean };

// ---------- Künye kıyası (4 Kasım 2026, kullanıcı: "künyeye de bir karşılaştırma ekleyelim"; göç 0065) ----------
// Örneklenen ürünlerde aynı sayfa metinleri ve aynı istemle Claude Haiku ve Sonnet de özellik çıkarır; sonuçları kullanılmaz, yalnız
// public.yz_kiyas'a yazılır (Gemini'ninkiyle birlikte). Nesnel ölçü: modelin verdiği alıntı ("kanit") kaynak sayfanın metninde gerçekten
// geçiyor mu (uydurma kontrolü). Oran: tr_settings.yz_kiyas.kunye_oran (yüzde).
type KunyeGirdi = { kullanici: string; sayfalar: Sayfa[]; model: string };
const KIYAS_CLAUDE = ["claude-haiku-5-5", "claude-sonnet-5-5"];
const duz = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
function kunyeSuz(v: Record<string, any> | null | undefined, adlar: Set<string>, sayfalar: Sayfa[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const metin = new Map(sayfalar.map((x) => [x.url, duz(x.metin)]));
  const oz = (Array.isArray(v?.ozellikler) ? v!.ozellikler : []).filter((o: { key?: string; value?: string; kaynak?: string }) => o?.key && adlar.has(o.key) && o.value && metin.has(String(o.kaynak ?? "")))
    .map((o: { key: string; value: string; kaynak: string; kanit?: string }) => {
      const k = duz(String(o.kanit ?? ""));
      return { key: o.key, value: String(o.value).slice(0, 120), kaynak: o.kaynak, kanit: String(o.kanit ?? "").slice(0, 160), dogru: k.length >= 3 && metin.get(o.kaynak)!.includes(k) };
    });
  return { ozellikler: oz, resmiAd: typeof v?.resmiAd === "string" ? v.resmiAd : null, bulunan: oz.length, dogrulanan: oz.filter((x: { dogru: boolean }) => x.dogru).length };
}
async function kunyeKiyas(sb: ReturnType<typeof createClient>, oneriId: string, g: KunyeGirdi, adlar: Set<string>, gemV: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const satirlar: Record<string, unknown>[] = [{ is_turu: "kunye", nesne: oneriId, model: "gemini:" + g.model, sonuc: kunyeSuz(gemV, adlar, g.sayfalar), sure_ms: 0 }];
  await Promise.all(KIYAS_CLAUDE.map(async (m) => {
    const t0 = Date.now();
    try {
      const c = await claudeJson({ sistem: OKU_SISTEM, kullanici: g.kullanici, model: m, ms: 150_000, maxTokens: 16_000, fonk: "kunye-otomatik" });
      satirlar.push({ is_turu: "kunye", nesne: oneriId, model: m, sonuc: c ? kunyeSuz(c.veri, adlar, g.sayfalar) : {}, sure_ms: Date.now() - t0, hata: c ? null : "Claude anahtarı yok" });
    } catch (e) { satirlar.push({ is_turu: "kunye", nesne: oneriId, model: m, sonuc: {}, sure_ms: Date.now() - t0, hata: String((e as Error).message ?? e).slice(0, 200) }); }
  }));
  await sb.from("yz_kiyas").insert(satirlar);
}
let SAYFA_TESHIS = "";
/** Ürünün özellik sayfaları: yalnız künyede kayıtlı bağlantılar (üretici sayfası, önceki önerilerin kaynakları) okunur; arama motoru
 *  kazınmaz (31 Ekim 2026: robot doğrulaması olan aramalar kullanılmaz). Sayfa kendi adımızla (UA) istenir; engelleyen site atlanır.
 *  Yeni ürünün sayfasını bulmak Groq'un web aramasına kalır (aşağıda); bir arama API'si eklenirse burası onu kullanır. */
const BRAVE_AY_SINIR = 700; // ücretsiz 1.000 aramanın güvenli altı
const ATLA = /youtube\.|amazon\.|reddit\.|facebook\.|instagram\.|tiktok\.|x\.com|twitter\.|pinterest\.|ebay\.|aliexpress\./i;
/** Brave Search API (göç 0057, Stüdyo → Bağlantı anahtarları "brave_arama"): ürünün özellik sayfası adayları. Anahtar yoksa boş döner. */
async function braveAra(sb: ReturnType<typeof createClient>, urun: Urun): Promise<string[]> {
  const { data } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", "brave_arama").maybeSingle();
  const anahtar = (data as { deger?: string } | null)?.deger;
  if (!anahtar) return [];
  // Aylık güvenlik sınırı (31 Ekim 2026, kullanıcı: "sınırı aşıp kartımdan çekmesin"): Brave ücretsiz hakkı ayda 5 $ ≈ 1.000 arama;
  // sistem ayda en çok BRAVE_AY_SINIR arama yapar, sayaç tr_settings.brave_sayac'ta (ay başında sıfırlanır).
  const ay = new Date().toISOString().slice(0, 7);
  const { data: sy } = await sb.from("tr_settings").select("value").eq("key", "brave_sayac").maybeSingle();
  const sayac = (sy?.value as { ay?: string; adet?: number } | null)?.ay === ay ? Number((sy!.value as { adet?: number }).adet ?? 0) : 0;
  if (sayac >= BRAVE_AY_SINIR) { SAYFA_TESHIS = `Brave aylık sınır doldu (${sayac}/${BRAVE_AY_SINIR})`; return []; }
  await sb.from("tr_settings").upsert({ key: "brave_sayac", value: { ay, adet: sayac + 1 } });
  const q = `${urun.brand} ${urun.name} ${urun.type === "lens" ? "lens " : ""}specifications`;
  const r = await fetch("https://api.search.brave.com/res/v1/web/search?count=8&q=" + encodeURIComponent(q), { headers: { Accept: "application/json", "X-Subscription-Token": anahtar }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) { SAYFA_TESHIS = `Brave ${r.status}`; await r.body?.cancel().catch(() => {}); return []; }
  const j = await r.json();
  const m = sade(urun.brand).slice(0, 5), puan = (u: string) => (sade(hostAl(u)).includes(m) ? 0 : /bhphotovideo|gsmarena|dpreview/.test(u) ? 1 : 2);
  return ((j?.web?.results ?? []) as { url: string }[]).map((x, i) => ({ u: x.url, i })).filter((x) => /^https?:\/\//.test(x.u) && !ATLA.test(x.u))
    .sort((a, b) => puan(a.u) - puan(b.u) || a.i - b.i).map((x) => x.u);
}
async function sayfaBul(adresler: string[]): Promise<Sayfa[]> {
  const cikan: Sayfa[] = [];
  SAYFA_TESHIS += `${SAYFA_TESHIS ? " · " : ""}${adresler.length} aday`;
  for (const url of [...new Set(adresler)].filter((u) => /^https?:\/\//.test(u)).slice(0, 5)) {
    if (cikan.length >= 2) break;
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en,tr" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r?.ok || !/html/i.test(r.headers.get("content-type") ?? "")) { SAYFA_TESHIS += ` · ${hostAl(url)} ${r?.status ?? "yok"}`; await r?.body?.cancel().catch(() => {}); continue; }
    const t = duz((await r.text()).replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " "));
    if (t.length < 1500) { SAYFA_TESHIS += ` · ${hostAl(url)} kısa`; continue; }
    cikan.push({ url, baslik: hostAl(url), metin: t.slice(0, 14_000), resmi: cikan.length === 0 });
  }
  return cikan;
}
const OKU_SISTEM = SISTEM.replace("Görevin bir ürünün teknik özelliklerini İNTERNETTE ARAYARAK bulmak.", "Görevin bir ürünün teknik özelliklerini SANA VERİLEN SAYFA METİNLERİNDEN çıkarmak. İnternette arama yapma; yalnız bu metinlerde açıkça yazanı kullan.")
  .replace(/"kaynak": [^\n]*/, '"kaynak": değeri aldığın sayfanın KAYNAK satırındaki adres, aynen. "kanit": o sayfadan kısa alıntı (en fazla 120 karakter).');

async function ara(sb: ReturnType<typeof createClient>, urun: Urun) {
  const anahtarlar = await geminiAnahtarlari();
  if (!anahtarlar.length) throw new Error("GEMINI_API_KEY yok");
  const liste = (urun.specs ?? []).some((s) => s.key === "Boyutlar") ? urun.specs ?? [] : [...(urun.specs ?? []), { key: "Boyutlar", unit: "mm" }];
  const ozellikler = liste.map((s) => `- ${s.key}${s.unit ? " · " + s.unit : ""}`).join("\n");
  const istem = `ÜRÜN: ${urun.brand} ${urun.name}\nDOLDURULACAK ÖZELLİKLER (ad · birim):\n${ozellikler}`;
  let son = "";
  // 1) Asıl yol (31 Ekim 2026): sayfayı sunucu kendisi bulur ve okur, ücretsiz Gemini (araçsız istek, kota içinde) yalnız okunan metinden
  //    değer çıkarır. Ücretsiz katmanda Gemini'nin Google arama aracı her istekte 429 veriyordu; aramasız istekler geçiyor.
  // Kayıtlı adresler: ürünün sourceUrl'leri (onaylanmış değerlerin kaynakları); varsa önce onlar okunur
  const kayitli = (urun.specs ?? []).map((x) => (x as Spec & { sourceUrl?: string | null }).sourceUrl ?? "").filter(Boolean) as string[];
  SAYFA_TESHIS = "";
  const bulunan = await braveAra(sb, urun).catch((e) => { SAYFA_TESHIS = "Brave hata: " + String(e).slice(0, 80); return [] as string[]; });
  const adaylar = [...kayitli, ...bulunan];
  const sayfalar = adaylar.length ? await sayfaBul(adaylar).catch(() => [] as Sayfa[]) : [];
  if (sayfalar.length) {
    const metin = sayfalar.map((x, i) => `[${i + 1}] KAYNAK: ${x.url}\n${x.metin}`).join("\n\n---\n\n");
    for (const a of anahtarlar) { let hepsiKota = true; for (const model of ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST", signal: AbortSignal.timeout(90_000), headers: { "Content-Type": "application/json", "x-goog-api-key": a.deger },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: OKU_SISTEM }] }, contents: [{ role: "user", parts: [{ text: `${istem}\n\nSAYFALAR:\n${metin}` }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
        });
        const g = await r.text();
        if (!r.ok) {
          son = `${a.etiket} · ${model} ${r.status} ${g.replace(/\s+/g, " ").slice(0, 300)}`;
          const ah = anahtarHatasi(r.status, g);
          if (ah === "gecersiz") { await isaretle(a, "gecersiz", son); hepsiKota = false; break; }
          if (ah !== "kota_dolu") hepsiKota = false;
          continue;
        }
        hepsiKota = false; await isaretle(a, "calisiyor");
        const c = JSON.parse(g)?.candidates?.[0];
        const v = jsonOku((c?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join(""));
        if (!v) { son = `${model} geçersiz yanıt`; continue; }
        // Kaynak yalnız okunan sayfalardan biri olabilir (model adres uyduramaz)
        const izinli = new Set(sayfalar.map((x) => x.url));
        if (Array.isArray(v.ozellikler)) v.ozellikler = v.ozellikler.filter((o: { kaynak?: string }) => izinli.has(String(o?.kaynak ?? "")));
        if (v.urunSayfasi && !izinli.has(v.urunSayfasi)) v.urunSayfasi = sayfalar.find((x) => x.resmi)?.url ?? null;
        SAYFA_TESHIS += ` → ${model}`;
        return { v, kaynaklar: sayfalar.map((x) => ({ baslik: x.baslik, url: x.url })), girdi: { kullanici: `${istem}\n\nSAYFALAR:\n${metin}`, sayfalar, model } };
      } catch { son = `${model} yanıt vermedi`; hepsiKota = false; }
    }
    if (hepsiKota) await isaretle(a, "kota_dolu", son); }
  } else son = adaylar.length ? `Sayfalar okunamadı (${SAYFA_TESHIS})` : `Sayfa adayı yok (${SAYFA_TESHIS || "Brave anahtarı girilmemiş"})`;
  // 2) Yedek: sayfa okunamadıysa ya da Gemini olmadıysa Groq kendi web aramasıyla dener.
  // Groq'ta gpt-oss modelleri yerleşik web aramasıyla (browser_search) aynı istemle denenir; kaynaklar modelin yaptığı aramalardan alınır.
  // ("groq/compound" bu hesapta yok: 404, 31 Ekim 2026)
  const groq = Deno.env.get("GROQ_API_KEY");
  if (groq) for (const model of ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(120_000), headers: { "Content-Type": "application/json", Authorization: "Bearer " + groq },
        body: JSON.stringify({ model, temperature: 0.1, tools: [{ type: "browser_search" }], tool_choice: "required", messages: [{ role: "system", content: SISTEM }, { role: "user", content: istem }] }),
      });
      const g = await r.text();
      if (!r.ok) { son += ` | Groq ${model} ${r.status} ${g.replace(/\s+/g, " ").slice(0, 200)}`; continue; }
      const m = JSON.parse(g)?.choices?.[0]?.message;
      const v = jsonOku(String(m?.content ?? ""));
      if (!v) { son += ` | Groq ${model} geçersiz yanıt`; continue; }
      // deno-lint-ignore no-explicit-any
      const arananlar = (m?.executed_tools ?? []).flatMap((t: any) => t?.search_results?.results ?? []).map((x: { title?: string; url?: string }) => ({ baslik: x.title ?? "", url: x.url ?? "" }));
      const ozKaynak = (Array.isArray(v?.ozellikler) ? v.ozellikler : []).map((o: { kaynak?: string }) => ({ baslik: "", url: String(o?.kaynak ?? "") }));
      const kaynaklar = [...arananlar, ...ozKaynak].filter((x) => /^https?:\/\//.test(x.url)).filter((x, i, l) => l.findIndex((y) => y.url === x.url) === i).slice(0, 12);
      SAYFA_TESHIS += ` → Groq ${model}`;
      return { v, kaynaklar };
    } catch (e) { son += ` | Groq ${model}: ${String(e).slice(0, 120)}`; }
  }
  throw new Error("Yapay zekâ yanıt vermedi (" + son + ")");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return yanit({ error: "POST gerekli" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: k } = jwt ? await sb.auth.getUser(jwt) : { data: null };
  const zamanlayici = !k?.user && !req.headers.get("x-forwarded-for");
  if (!k?.user && !zamanlayici) return yanit({ error: "Stüdyo girişi gerekli" }, 401);
  const b = await req.json().catch(() => ({}));
  const adet = Math.min(3, Math.max(1, Number(b.adet) || (zamanlayici ? 3 : 2)));
  if (zamanlayici) { EdgeRuntime.waitUntil(isle(sb, b, adet)); return yanit({ basladi: true }); }
  return yanit(await isle(sb, b, adet));
});

/** Arka plan silme Cloudflare'de (göç 0044, public/cloudflare/gorsel-worker.js): görsel indirilir, programa gönderilir,
 *  dönen 1600×900 şeffaf WebP "kunye" kovasına konur. Program kurulmamışsa satır "isleniyor" bekler; kurulunca sonraki turda işlenir. */
async function cfAyar(sb: ReturnType<typeof createClient>) {
  const { data } = await sb.from("baglanti_anahtarlari").select("ad,deger").in("ad", ["cloudflare_adres", "cloudflare_anahtar"]);
  const m = Object.fromEntries((data ?? []).map((x: { ad: string; deger: string }) => [x.ad, x.deger]));
  return m.cloudflare_adres && m.cloudflare_anahtar ? { adres: String(m.cloudflare_adres).replace(/\/$/, ""), anahtar: String(m.cloudflare_anahtar) } : null;
}
async function gorselIsle(sb: ReturnType<typeof createClient>, cf: { adres: string; anahtar: string }, s: { id: number; urun_id: number; gorsel_aday: { url: string } | null }) {
  const yaz = (x: Record<string, unknown>) => sb.from("kunye_oneriler").update(x).eq("id", s.id);
  try {
    if (!s.gorsel_aday?.url) { await yaz({ gorsel_durum: "yok" }); return; }
    const g = await fetch(s.gorsel_aday.url, { headers: { "User-Agent": UA, Accept: "image/*" }, signal: AbortSignal.timeout(30_000) });
    if (!g.ok) throw new Error(`görsel indirilemedi (${g.status})`);
    const veri = new Uint8Array(await g.arrayBuffer());
    if (veri.byteLength > 20e6) throw new Error("görsel 20 MB üstü");
    const r = await fetch(cf.adres, { method: "POST", headers: { "x-anahtar": cf.anahtar, "Content-Type": g.headers.get("content-type") || "image/jpeg" }, body: veri, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) {
      const h = `Cloudflare ${r.status}: ${(await r.text()).slice(0, 140)}`;
      if (r.status === 401 || r.status === 500) await sb.from("baglanti_anahtarlari").update({ ek: { hata: h } }).eq("ad", "cloudflare_adres");
      throw new Error(h);
    }
    const yol = `${s.urun_id}-${s.id}.webp`;
    const { error } = await sb.storage.from("kunye").upload(yol, new Uint8Array(await r.arrayBuffer()), { contentType: "image/webp", upsert: true });
    if (error) throw new Error("yükleme: " + error.message);
    await yaz({ gorsel: `${ADRES}/storage/v1/object/public/kunye/${yol}`, gorsel_durum: "hazir", gorsel_hata: null });
    await sb.from("baglanti_anahtarlari").update({ ek: { son_islem: new Date().toISOString(), hata: "" } }).eq("ad", "cloudflare_adres");
  } catch (e) { await yaz({ gorsel_durum: "hata", gorsel_hata: String((e as Error).message).slice(0, 200) }); }
}

const kotaDolu = (m: string) => /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(m);

async function isle(sb: ReturnType<typeof createClient>, b: { urun_id?: unknown }, adet: number) {
  // Önce bekleyen görseller (program sonradan kurulduysa ya da önceki tur yarım kaldıysa)
  const cf = await cfAyar(sb).catch(() => null);
  if (cf) {
    const { data: bekleyen } = await sb.from("kunye_oneriler").select("id,urun_id,gorsel_aday").eq("gorsel_durum", "isleniyor").order("id").limit(6);
    for (const x of bekleyen ?? []) await gorselIsle(sb, cf, x as { id: number; urun_id: number; gorsel_aday: { url: string } | null });
  }
  // Aday ürünler: tek ürün istendiyse o; yoksa değerlerinin yarısından azı dolu ve bekleyen önerisi olmayanlar
  let urunler: Urun[] = [];
  if (Number.isInteger(b.urun_id)) {
    const r = await fetch(`${PANEL}/api/products/${b.urun_id}?depth=0`); if (r.ok) urunler = [await r.json()];
  } else {
    const r = await fetch(`${PANEL}/api/products?limit=500&depth=0&sort=updatedAt&select[name]=true&select[brand]=true&select[type]=true&select[specs]=true`);
    const tum: Urun[] = r.ok ? (await r.json()).docs : [];
    const { data: bekleyen } = await sb.from("kunye_oneriler").select("urun_id").in("durum", ["bekliyor"]);
    const { data: denenen } = await sb.from("kunye_oneriler").select("urun_id").gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString());
    const atla = new Set([...(bekleyen ?? []), ...(denenen ?? [])].map((x) => x.urun_id));
    urunler = tum.filter((u) => !atla.has(u.id) && (u.specs?.length ?? 0) > 0 && (u.specs ?? []).filter((s) => s.value).length < (u.specs ?? []).length / 2);
  }
  const kalan = Math.max(0, urunler.length - adet);
  const { data: ky } = await sb.from("tr_settings").select("value").eq("key", "yz_kiyas").maybeSingle();
  const kiyasOran = Math.max(0, Math.min(100, Number((ky?.value as { kunye_oran?: number } | null)?.kunye_oran ?? 30)));
  const sonuc: { urun: string; durum: string; sayi?: number; hata?: string }[] = [];
  // Son tur Stüdyo'da görünsün (31 Ekim 2026: zamanlayıcı turları 4 gün hiç öneri yazmadı, neden görünmüyordu): her üründen sonra yazılır,
  // işçi süre dolduğu için yarıda kesilse de o ana kadarki sonuç kalır
  const baslangic = new Date().toISOString();
  const kaydet = (bitti: boolean) => sb.from("tr_settings").upsert({ key: "son_kunye", value: { zaman: baslangic, bitti, aday: urunler.length, islenen: sonuc, kalan } }).then(() => {}, () => {});
  await kaydet(false);
  for (const u of urunler.slice(0, adet)) {
    try {
      const { v, kaynaklar, girdi } = await ara(sb, u) as { v: Record<string, any>; kaynaklar: unknown; girdi?: KunyeGirdi }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const adlar = new Set([...(u.specs ?? []).map((s) => s.key), "Boyutlar"]);
      const oz = (Array.isArray(v?.ozellikler) ? v.ozellikler : []).filter((o: { key?: string; value?: string }) => o?.key && adlar.has(o.key) && o.value)
        .map((o: { key: string; value: string; num?: unknown; kaynak?: string; kanit?: string }) => ({ key: o.key, value: String(o.value).slice(0, 120), num: typeof o.num === "number" && isFinite(o.num) ? o.num : null, kaynak: /^https?:\/\//.test(String(o.kaynak ?? "")) ? String(o.kaynak).slice(0, 400) : null, kanit: String(o.kanit ?? "").slice(0, 160) }));
      const gorsel = await gorselBul(u.brand, u.name, v?.gorselAdresi, [v?.urunSayfasi, ...oz.map((o: { kaynak: string | null }) => o.kaynak)]).catch(() => null);
      // Resmî ad (göç 0060): yalnız gerçekten farklı ve makul uzunluktaysa; markayla başlıyorsa marka çıkarılır
      let resmiAd = typeof v?.resmiAd === "string" ? v.resmiAd.trim().slice(0, 90) : "";
      if (resmiAd.toLocaleLowerCase("tr-TR").startsWith(u.brand.toLocaleLowerCase("tr-TR") + " ")) resmiAd = resmiAd.slice(u.brand.length + 1);
      if (resmiAd.length < 2 || sade(resmiAd) === sade(u.name)) resmiAd = "";
      const kayit = { urun_id: u.id, urun_adi: `${u.brand} ${u.name}`, tur: u.type, ozellikler: oz, kaynaklar, durum: oz.length || resmiAd ? "bekliyor" : "hata", hata: oz.length || resmiAd ? null : "Kaynaklarda değer bulunamadı" };
      // Görsel sütunları göç 0043 ile geldi; uygulanmamışsa kayıt görselsiz yazılır
      const { data: yeni, error } = await sb.from("kunye_oneriler").insert({ ...kayit, ...(resmiAd ? { resmi_ad: resmiAd } : {}), gorsel_aday: gorsel, gorsel_durum: gorsel ? "isleniyor" : "yok" }).select("id").single();
      if (error) await sb.from("kunye_oneriler").insert(kayit);
      // Künye kıyası (göç 0065): arka planda, öneriyi bekletmez
      if (yeni && girdi && Math.random() * 100 < kiyasOran) {
        // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
        EdgeRuntime.waitUntil(kunyeKiyas(sb, String(yeni.id), girdi, adlar, v).catch((e) => console.error("künye kıyası", e)));
      }
      else if (gorsel && cf && yeni) await gorselIsle(sb, cf, { id: yeni.id as number, urun_id: u.id, gorsel_aday: gorsel });
      sonuc.push({ urun: `${u.brand} ${u.name}`, durum: oz.length ? "öneri hazır" : "bulunamadı", sayi: oz.length, hata: SAYFA_TESHIS }); await kaydet(false);
    } catch (e) {
      // Kota dolduysa ürün işaretlenmez (yoksa 7 gün atlanırdı); kalanlar bir sonraki turda
      if (kotaDolu(String((e as Error).message))) { sonuc.push({ urun: `${u.brand} ${u.name}`, durum: "kota dolu", hata: String((e as Error).message).slice(0, 600) }); break; }
      await sb.from("kunye_oneriler").insert({ urun_id: u.id, urun_adi: `${u.brand} ${u.name}`, tur: u.type, durum: "hata", hata: String((e as Error).message).slice(0, 300) });
      sonuc.push({ urun: `${u.brand} ${u.name}`, durum: "hata", hata: String((e as Error).message).slice(0, 200) }); await kaydet(false);
    }
  }
  await kaydet(true);
  return { islenen: sonuc, kalan };
}
