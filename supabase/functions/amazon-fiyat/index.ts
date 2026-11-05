// Amazon fiyatları (5 Kasım 2026, kullanıcı: "Amazon API'si geldi, ekleyelim" → seçenek a: ürün sayfasında fiyat ve ortaklık bağlantısı).
// Amazon Creators API (PA-API 5'in yerini aldı; https://affiliate-program.amazon.com/creatorsapi/docs): OAuth istemci kimliğiyle belirteç alınır,
// creatorsapi.amazon/catalog/v1 uçlarına Türkiye pazarı (www.amazon.com.tr) ve ortaklık etiketiyle istek atılır.
// Zamanlayıcı günde iki kez (göç 0069, Amazon kuralı: gösterilen fiyat en geç 24 saatte bir yenilenir): çıkmış ürünlerin ASIN'i varsa fiyatı
// yenilenir; yoksa Amazon'da aranır, yapay zekâ (Claude Haiku) tam modeli seçer (kılıf, aksesuar, başka model değil), emin değilse eşleştirmez.
// Sonuç panelde ürünün Amazon alanlarına yazılır (/api/studyo/amazon-yaz); site ürün sayfasında fiyat + bağlantı gösterir.
// POST {} (zamanlayıcı, sunucu içinden) · POST { dene: true } (Stüdyo → Bağlantı anahtarları, yönetici).
import { createClient } from "npm:@supabase/supabase-js@2";
import { claudeJson, CLAUDE_MODEL } from "../triyaj-taslak/claude.ts";

type Sb = ReturnType<typeof createClient>;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const yanit = (j: unknown, status = 200) => Response.json(j, { status, headers: CORS });
const PANEL = (Deno.env.get("PANEL_URL") ?? "https://panel.updated.com.tr").replace(/\/+$/, "");
const PAZAR = "www.amazon.com.tr";
const API = "https://creatorsapi.amazon/catalog/v1";
const CIKMIS = new Set(["satista", "duyuruldu", "eol"]);
const ARAMA_TUR = 12;          // bir turda en çok bu kadar ürün aranır (Amazon'un başlangıç sınırı saniyede 1 istek)
const ARAMA_ARALIK_GUN = 7;    // bulunamayan ürün bu kadar gün sonra yeniden aranır
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Kimlik = { id: string; gizli: string; surum: string; etiket: string };
async function kimlik(sb: Sb): Promise<Kimlik | null> {
  const { data } = await sb.from("baglanti_anahtarlari").select("ad,deger").in("ad", ["amazon_kimlik", "amazon_gizli", "amazon_surum", "amazon_etiket"]);
  const m = Object.fromEntries(((data ?? []) as { ad: string; deger: string }[]).map((x) => [x.ad, x.deger]));
  return m.amazon_kimlik && m.amazon_gizli && m.amazon_etiket ? { id: m.amazon_kimlik, gizli: m.amazon_gizli, surum: m.amazon_surum || "3.2", etiket: m.amazon_etiket } : null;
}

// Kimlik sürümüne göre belirteç ucu (Amazon belgesi + açık kaynak istemciler): 3.x Login with Amazon, 2.x Cognito.
// Türkiye Avrupa bölgesinde: 3.2 (ya da eski kimlikse 2.2).
const LWA: Record<string, string> = { "3.1": "https://api.amazon.com/auth/o2/token", "3.2": "https://api.amazon.co.uk/auth/o2/token", "3.3": "https://api.amazon.co.jp/auth/o2/token" };
const COGNITO: Record<string, string> = {
  "2.1": "https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token",
  "2.2": "https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token",
  "2.3": "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token",
};
let belirtec: { deger: string; bitis: number } | null = null;
async function yetki(k: Kimlik): Promise<string> {
  if (belirtec && Date.now() < belirtec.bitis) return belirtec.deger;
  let r: Response;
  if (LWA[k.surum]) {
    r = await fetch(LWA[k.surum], { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ grant_type: "client_credentials", client_id: k.id, client_secret: k.gizli, scope: "creatorsapi::default" }) });
  } else if (COGNITO[k.surum]) {
    r = await fetch(COGNITO[k.surum], { method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + btoa(`${k.id}:${k.gizli}`) },
      body: "grant_type=client_credentials&scope=creatorsapi/default" });
  } else throw new Error(`Bilinmeyen kimlik sürümü: ${k.surum}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Amazon girişi reddetti (${r.status}${j.error ? ": " + j.error : ""}${j.error_description ? " · " + String(j.error_description).slice(0, 120) : ""})`);
  const t = String(j.access_token);
  belirtec = { deger: LWA[k.surum] ? `Bearer ${t}` : `Bearer ${t}, Version ${k.surum}`, bitis: Date.now() + (Number(j.expires_in ?? 3600) - 60) * 1000 };
  return belirtec.deger;
}

let sonIstek = 0;
async function istek(k: Kimlik, yol: "getItems" | "searchItems", govde: Record<string, unknown>) {
  // Saniyede en çok bir istek
  const bos = 1100 - (Date.now() - sonIstek); if (bos > 0) await bekle(bos);
  sonIstek = Date.now();
  const r = await fetch(`${API}/${yol}`, {
    method: "POST", signal: AbortSignal.timeout(20_000),
    headers: { Authorization: await yetki(k), "Content-Type": "application/json", "x-marketplace": PAZAR },
    body: JSON.stringify({ marketplace: PAZAR, partnerTag: k.etiket, ...govde }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Amazon ${yol} ${r.status}: ${JSON.stringify(j.errors ?? j.message ?? j).slice(0, 220)}`);
  return j;
}

type Oge = { asin: string; detailPageURL?: string; itemInfo?: { title?: { displayValue?: string } }; offersV2?: { listings?: { price?: { money?: { amount?: number; currency?: string; displayAmount?: string } }; condition?: { value?: string }; isBuyBoxWinner?: boolean }[] } };
const KAYNAKLAR = ["itemInfo.title", "offersV2.listings.price", "offersV2.listings.condition", "offersV2.listings.isBuyBoxWinner", "offersV2.listings.availability"];
/** Satış fiyatı: önce sepet kazanan yeni ürün teklifi */
function fiyat(o: Oge) {
  const l = o.offersV2?.listings ?? [];
  const s = l.find((x) => x.isBuyBoxWinner && (!x.condition?.value || /new/i.test(x.condition.value))) ?? l.find((x) => !x.condition?.value || /new/i.test(x.condition.value)) ?? l[0];
  const m = s?.price?.money;
  return m?.amount != null ? { fiyat: Number(m.amount), metin: m.displayAmount ?? `${Number(m.amount).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL` } : null;
}
const ogeler = (j: Record<string, any>): Oge[] => (j?.itemsResult?.items ?? j?.searchResult?.items ?? j?.items ?? []) as Oge[]; // eslint-disable-line @typescript-eslint/no-explicit-any

const ESLE_SEMA = { type: "object", properties: { asin: { anyOf: [{ type: "string" }, { type: "null" }] }, neden: { type: "string" } }, required: ["asin", "neden"], additionalProperties: false };
const ESLE_SISTEM = `Bir teknoloji sitesinin ürün künyesini Amazon Türkiye'deki ürünle eşleştiriyorsun. Sana künyedeki ürün ve Amazon arama sonuçları (ASIN ve başlık) verilecek.
Yalnız TAM OLARAK aynı modelin, yeni ve ürünün kendisini satan ilanını seç. Seçme: kılıf, ekran koruyucu, yedek parça, pil, şarj aleti, aksesuar, kit içinde başka ürün, kardeş model (Pro/Max/Mini/Plus/FE/Lite, farklı nesil), farklı lens yuvası ya da odak uzaklığı, ikinci el/yenilenmiş.
Aynı modelin renk ya da depolama seçenekleri farkı önemli değil; en temel seçeneği seç. Emin değilsen asin null.
Yanıt yalnız JSON: {"asin":"B0..." ya da null,"neden":"kısa gerekçe"}`;
async function esle(u: Urun, sonuc: Oge[]): Promise<{ asin: string | null; neden: string }> {
  const aday = sonuc.filter((x) => x.asin && x.itemInfo?.title?.displayValue).slice(0, 10);
  if (!aday.length) return { asin: null, neden: "Amazon'da sonuç yok" };
  const liste = aday.map((x) => `${x.asin}: ${x.itemInfo!.title!.displayValue}${fiyat(x) ? ` (${fiyat(x)!.metin})` : ""}`).join("\n");
  const c = await claudeJson({ sistem: ESLE_SISTEM, kullanici: `KÜNYE: ${u.brand} ${u.name} (${u.type})\nAMAZON SONUÇLARI:\n${liste}`, model: CLAUDE_MODEL.kucuk, ms: 40_000, sema: ESLE_SEMA, maxTokens: 2000, caba: "low", fonk: "amazon-fiyat" }).catch(() => null);
  if (c) { const a = c.veri.asin; return { asin: typeof a === "string" && aday.some((x) => x.asin === a) ? a : null, neden: String(c.veri.neden ?? "").slice(0, 160) }; }
  // Claude yoksa sıkı kural: başlıkta marka ve modelin bütün parçaları geçen ve aksesuar sözcüğü olmayan tek sonuç
  const sade = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9çğıöşü]+/g, " ");
  const parca = sade(`${u.brand} ${u.name}`).split(" ").filter(Boolean);
  const uyan = aday.filter((x) => { const t = " " + sade(x.itemInfo!.title!.displayValue!) + " "; return parca.every((p) => t.includes(" " + p + " ")) && !/kılıf|kilif|koruyucu|case|cover|batarya|pil |şarj|aksesuar|uyumlu/i.test(t); });
  return uyan.length === 1 ? { asin: uyan[0].asin, neden: "Başlıktaki model adı birebir (kural)" } : { asin: null, neden: uyan.length ? "Birden çok olası ilan" : "Birebir eşleşen ilan yok" };
}

type Urun = { id: number; name: string; brand: string; type: string; status?: string; amazonAsin?: string | null; amazonGizle?: boolean };
async function panelYaz(urunler: Record<string, unknown>[]) {
  const anahtar = (Deno.env.get("STUDIO_IMPORT_KEY") ?? "").trim();
  if (!anahtar) throw new Error("STUDIO_IMPORT_KEY yok");
  for (let i = 0; i < urunler.length; i += 50) {
    const r = await fetch(`${PANEL}/api/studyo/amazon-yaz`, { method: "POST", signal: AbortSignal.timeout(60_000), headers: { "x-studio-key": anahtar, "Content-Type": "application/json" }, body: JSON.stringify({ urunler: urunler.slice(i, i + 50) }) });
    if (!r.ok) throw new Error(`Panel ${r.status}: ${(await r.text()).slice(0, 160)}`);
  }
}

async function calis(sb: Sb) {
  const k = await kimlik(sb);
  if (!k) return { atlandi: "Amazon anahtarları girilmemiş" };
  const r = await fetch(`${PANEL}/api/products?limit=1000&depth=0&select[name]=true&select[brand]=true&select[type]=true&select[status]=true&select[amazonAsin]=true&select[amazonGizle]=true`, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`Ürün listesi alınamadı (${r.status})`);
  const tum = ((await r.json()).docs as Urun[]).filter((u) => CIKMIS.has(u.status ?? "satista") && !u.amazonGizle);
  const yaz: Record<string, unknown>[] = [];
  const iz: string[] = [];
  // 1) ASIN'i olanların fiyatı (10'arlı)
  const asinli = tum.filter((u) => u.amazonAsin && /^[A-Z0-9]{10}$/.test(u.amazonAsin));
  for (let i = 0; i < asinli.length; i += 10) {
    const parti = asinli.slice(i, i + 10);
    try {
      const j = await istek(k, "getItems", { itemIds: parti.map((u) => u.amazonAsin), itemIdType: "ASIN", resources: KAYNAKLAR });
      const bulunan = new Map(ogeler(j).map((o) => [o.asin, o]));
      for (const u of parti) {
        const o = bulunan.get(u.amazonAsin!), f = o ? fiyat(o) : null;
        yaz.push({ id: u.id, asin: u.amazonAsin, url: o?.detailPageURL ?? null, fiyat: f?.fiyat ?? null, fiyatMetni: f?.metin ?? null, durum: !o ? "Amazon'da bulunamadı (ASIN'i kontrol et)" : f ? "eşleşti" : "fiyat yok (stokta değil)" });
      }
    } catch (e) { iz.push(String((e as Error).message)); }
  }
  // 2) ASIN'i olmayanlar: arama (bulunamayan 7 gün sonra yeniden)
  const { data: ar } = await sb.from("tr_settings").select("value").eq("key", "amazon_aranan").maybeSingle();
  const aranan = ((ar?.value ?? {}) as Record<string, string>);
  const sinir = Date.now() - ARAMA_ARALIK_GUN * 864e5;
  const aranacak = tum.filter((u) => !u.amazonAsin && !(aranan[u.id] && Date.parse(aranan[u.id]) > sinir)).slice(0, ARAMA_TUR);
  for (const u of aranacak) {
    try {
      const j = await istek(k, "searchItems", { keywords: `${u.brand} ${u.name}`, searchIndex: "All", itemCount: 10, resources: KAYNAKLAR });
      const sonuc = ogeler(j);
      const e = await esle(u, sonuc);
      aranan[u.id] = new Date().toISOString();
      if (e.asin) {
        const o = sonuc.find((x) => x.asin === e.asin)!, f = fiyat(o);
        yaz.push({ id: u.id, asin: e.asin, url: o.detailPageURL ?? null, fiyat: f?.fiyat ?? null, fiyatMetni: f?.metin ?? null, durum: f ? "eşleşti (sistem buldu)" : "eşleşti, fiyat yok" });
      } else yaz.push({ id: u.id, asin: null, url: null, fiyat: null, fiyatMetni: null, durum: "bulunamadı: " + e.neden });
    } catch (e) { iz.push(`${u.brand} ${u.name}: ${String((e as Error).message).slice(0, 160)}`); if (/\b(401|403)\b/.test(String(e))) break; }
  }
  await sb.from("tr_settings").upsert({ key: "amazon_aranan", value: aranan });
  if (yaz.length) await panelYaz(yaz);
  const ozet = { zaman: new Date().toISOString(), fiyat: yaz.filter((x) => x.fiyat != null).length, eslesen: yaz.filter((x) => x.asin).length, aranan: aranacak.length, hata: iz.slice(0, 8) };
  await sb.from("tr_settings").upsert({ key: "son_amazon", value: ozet });
  await sb.from("baglanti_anahtarlari").update({ ek: { son_islem: ozet.zaman, hata: iz[0] ?? "" } }).eq("ad", "amazon_kimlik");
  return ozet;
}

/** Bağlantı anahtarları → "Dene": giriş + tek arama */
async function dene(sb: Sb) {
  const k = await kimlik(sb);
  if (!k) return { ok: false, mesaj: "Kimlik, gizli anahtar ve ortaklık etiketi girilmeli." };
  try {
    belirtec = null;
    await yetki(k);
    const j = await istek(k, "searchItems", { keywords: "Sony kamera", itemCount: 3, resources: KAYNAKLAR });
    const o = ogeler(j)[0], f = o ? fiyat(o) : null;
    await sb.from("baglanti_anahtarlari").update({ ek: { son_islem: new Date().toISOString(), hata: "" } }).eq("ad", "amazon_kimlik");
    return { ok: true, mesaj: o ? `Çalışıyor: "${o.itemInfo?.title?.displayValue?.slice(0, 60) ?? o.asin}"${f ? ` · ${f.metin}` : ""}` : "Giriş başarılı; aramada sonuç gelmedi." };
  } catch (e) {
    const m = String((e as Error).message);
    await sb.from("baglanti_anahtarlari").update({ ek: { hata: m.slice(0, 200) } }).eq("ad", "amazon_kimlik");
    return { ok: false, mesaj: m };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return yanit({ error: "POST gerekli" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: k } = jwt ? await sb.auth.getUser(jwt) : { data: null };
  const zamanlayici = !k?.user && !req.headers.get("x-forwarded-for");
  if (!k?.user && !zamanlayici) return yanit({ error: "Stüdyo girişi gerekli" }, 401);
  if (k?.user) {
    const { data: p } = await sb.from("profiles").select("is_admin").eq("id", k.user.id).maybeSingle();
    if (!(p as { is_admin?: boolean } | null)?.is_admin) return yanit({ error: "Yalnız yöneticiler" }, 403);
  }
  const b = await req.json().catch(() => ({}));
  if (b.dene) return yanit(await dene(sb));
  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  if (zamanlayici) { EdgeRuntime.waitUntil(calis(sb).catch((e) => sb.from("tr_settings").upsert({ key: "son_amazon", value: { zaman: new Date().toISOString(), hata: [String(e)] } }))); return yanit({ basladi: true }); }
  try { return yanit(await calis(sb)); } catch (e) { return yanit({ error: String((e as Error).message) }, 500); }
});
