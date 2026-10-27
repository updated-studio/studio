// Künye otomasyonu (25 Ekim 2026, kullanıcı: "kaynaklarından çekeceğimiz bir otomasyon"): her ürün için yapay zekâ Google aramasıyla
// resmî üretici sayfasını (yoksa güvenilir kaynağı) bulur, ürünün özellik şablonundaki değerleri kaynak bağlantısı ve kanıtıyla önerir.
// Öneriler public.kunye_oneriler'e yazılır (göç 0036); editör Stüdyo → Site → Künye onayı'ndan onaylayınca panele yazılır.
// POST { adet?: 1-3, urun_id?: number } · Giriş: Stüdyo oturumu. Ürünler panelin herkese açık API'sinden okunur.
// Zamanlayıcı (27 Ekim 2026, kullanıcı: "her gün otomatik"): günde 4 kez sunucu içinden 3'er ürün (göç 0042); oturumsuz çağrı yalnız
// sunucu içinden (X-Forwarded-For'suz) kabul edilir, arka planda çalışır. Kota dolunca durur, ürünü "hata" diye işaretlemez (ertesi tur yeniden dener).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const yanit = (j: unknown, status = 200) => Response.json(j, { status, headers: CORS });
const PANEL = Deno.env.get("PANEL_URL") || "https://panel.updated.com.tr";
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
- Önce üreticinin resmî ürün/teknik özellik sayfasını ara ve kullan. Orada yoksa güvenilir bir kaynak (DPReview, GSMArena, B&H, üreticinin basın bülteni) kullan.
- Yalnız kaynakta açıkça yazan bilgiyi ver. Tahmin etme; emin değilsen o özelliği listeye koyma. Söylenti/sızıntı kullanma.
- "value": kısa Türkçe değer, birimiyle; ondalıkta virgül (ör. "24,2 MP", "658 g (pil ve kartla)", "4K 60p (10-bit)").
- "num": karşılaştırma için tek sayı, özelliğin birimi cinsinden (ör. 658), sayısal değilse null.
- "kaynak": değeri aldığın sayfanın TAM adresi (https://…). "kanit": o sayfadan kısa alıntı (en fazla 120 karakter).
- Fiyatı yalnız Türkiye fiyatı (TL) resmî kaynakta yazıyorsa doldur.
- "Boyutlar": genişlik × yükseklik × derinlik, milimetre (ör. "131 × 96 × 80 mm"); lensse çap × uzunluk (ör. "Ø 81 × 128 mm"). num: null.
- "urunSayfasi": üreticinin bu ürüne ait resmî ürün sayfasının TAM adresi (yoksa null).
Yanıtı YALNIZ şu JSON olarak ver, başka metin yazma:
{"urunSayfasi":"https://...","ozellikler":[{"key":"...","value":"...","num":null,"kaynak":"https://...","kanit":"..."}]}`;

/** Künye görseli (27 Ekim 2026): üreticinin resmî ürün sayfasındaki paylaşım görseli (og:image / JSON-LD image).
 *  Yalnız marka alan adındaki sayfalardan alınır; arka planı sunucudaki işçi siler (scripts/kunye-gorsel), editör onaylar. */
const UA = "Mozilla/5.0 (compatible; UpdatedStudyo/1.0; +https://www.updated.com.tr; kunye gorseli)";
const sade = (x: string) => x.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/g, "");
const hostAl = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
async function resmiGorsel(marka: string, adaylar: (string | null | undefined)[]): Promise<{ url: string; sayfa: string } | null> {
  const m = sade(marka).slice(0, 5);
  const sayfalar = [...new Set(adaylar.filter((u): u is string => !!u && /^https?:\/\//.test(u) && !!m && sade(hostAl(u)).includes(m)))].slice(0, 4);
  for (const sayfa of sayfalar) {
    const h = await fetch(sayfa, { headers: { "User-Agent": UA, "Accept-Language": "tr,en" }, signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
    if (!h) continue;
    const meta = (ad: string) => h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${ad}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ?? h.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${ad}["']`, "i"))?.[1];
    const ham = meta("og:image(?::secure_url)?") ?? meta("twitter:image(?::src)?") ?? h.match(/"image"\s*:\s*(?:\[\s*)?"(https?:[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i)?.[1];
    if (!ham || /logo|favicon|default|placeholder|avatar|share-image|og-default/i.test(ham)) continue;
    try { return { url: new URL(ham.replace(/&amp;/g, "&"), sayfa).href, sayfa }; } catch { /* sonraki */ }
  }
  return null;
}

/** Gemini anahtarları: önce sunucudaki ana anahtar; kotası dolunca Stüdyo → Bağlantı anahtarları'ndaki yedek (27 Ekim 2026).
 *  Kota proje başına sayılır: yedek anahtar başka bir Google hesabının ya da projesinin olmalı. */
async function geminiAnahtarlari(sb: ReturnType<typeof createClient>): Promise<string[]> {
  const l = [Deno.env.get("GEMINI_API_KEY") ?? ""];
  const { data } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", "gemini_yedek").maybeSingle();
  if (data?.deger) l.push(String(data.deger));
  return l.filter(Boolean);
}

async function ara(sb: ReturnType<typeof createClient>, urun: Urun) {
  const anahtarlar = await geminiAnahtarlari(sb);
  if (!anahtarlar.length) throw new Error("GEMINI_API_KEY yok");
  const liste = (urun.specs ?? []).some((s) => s.key === "Boyutlar") ? urun.specs ?? [] : [...(urun.specs ?? []), { key: "Boyutlar", unit: "mm" }];
  const ozellikler = liste.map((s) => `- ${s.key}${s.unit ? " · " + s.unit : ""}`).join("\n");
  const istem = `ÜRÜN: ${urun.brand} ${urun.name}\nDOLDURULACAK ÖZELLİKLER (ad · birim):\n${ozellikler}`;
  let son = "";
  for (const [ai, key] of anahtarlar.entries()) for (const model of ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(90_000), headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SISTEM }] }, contents: [{ role: "user", parts: [{ text: istem }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.1 } }),
      });
      const g = await r.text();
      if (!r.ok) { son = `${ai ? "yedek anahtar · " : ""}${model} ${r.status} ${g.slice(0, 120)}`; continue; }
      const j = JSON.parse(g), c = j?.candidates?.[0];
      const metin = (c?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
      const v = jsonOku(metin);
      if (!v) { son = `${model} geçersiz yanıt`; continue; }
      const kaynaklar = (c?.groundingMetadata?.groundingChunks ?? []).map((x: { web?: { uri?: string; title?: string } }) => ({ baslik: x.web?.title ?? "", url: x.web?.uri ?? "" })).filter((x: { url: string }) => x.url).slice(0, 12);
      return { v, kaynaklar };
    } catch { son = `${model} yanıt vermedi`; }
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

const kotaDolu = (m: string) => /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(m);

async function isle(sb: ReturnType<typeof createClient>, b: { urun_id?: unknown }, adet: number) {
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
  const sonuc: { urun: string; durum: string; sayi?: number }[] = [];
  for (const u of urunler.slice(0, adet)) {
    try {
      const { v, kaynaklar } = await ara(sb, u);
      const adlar = new Set([...(u.specs ?? []).map((s) => s.key), "Boyutlar"]);
      const oz = (Array.isArray(v?.ozellikler) ? v.ozellikler : []).filter((o: { key?: string; value?: string }) => o?.key && adlar.has(o.key) && o.value)
        .map((o: { key: string; value: string; num?: unknown; kaynak?: string; kanit?: string }) => ({ key: o.key, value: String(o.value).slice(0, 120), num: typeof o.num === "number" && isFinite(o.num) ? o.num : null, kaynak: /^https?:\/\//.test(String(o.kaynak ?? "")) ? String(o.kaynak).slice(0, 400) : null, kanit: String(o.kanit ?? "").slice(0, 160) }));
      const gorsel = await resmiGorsel(u.brand, [v?.urunSayfasi, ...oz.map((o: { kaynak: string | null }) => o.kaynak)]).catch(() => null);
      const kayit = { urun_id: u.id, urun_adi: `${u.brand} ${u.name}`, tur: u.type, ozellikler: oz, kaynaklar, durum: oz.length ? "bekliyor" : "hata", hata: oz.length ? null : "Kaynaklarda değer bulunamadı" };
      // Görsel sütunları göç 0043 ile geldi; uygulanmamışsa kayıt görselsiz yazılır
      const { error } = await sb.from("kunye_oneriler").insert({ ...kayit, gorsel_aday: gorsel, gorsel_durum: gorsel ? "isleniyor" : "yok" });
      if (error) await sb.from("kunye_oneriler").insert(kayit);
      sonuc.push({ urun: `${u.brand} ${u.name}`, durum: oz.length ? "öneri hazır" : "bulunamadı", sayi: oz.length });
    } catch (e) {
      // Kota dolduysa ürün işaretlenmez (yoksa 7 gün atlanırdı); kalanlar bir sonraki turda
      if (kotaDolu(String((e as Error).message))) { sonuc.push({ urun: `${u.brand} ${u.name}`, durum: "kota dolu" }); break; }
      await sb.from("kunye_oneriler").insert({ urun_id: u.id, urun_adi: `${u.brand} ${u.name}`, tur: u.type, durum: "hata", hata: String((e as Error).message).slice(0, 300) });
      sonuc.push({ urun: `${u.brand} ${u.name}`, durum: "hata" });
    }
  }
  return { islenen: sonuc, kalan };
}
