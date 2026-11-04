// Yapay zekâ ile görsel üretimi: modeller (3 Kasım 2026, kullanıcı: "birkaç gün birden çok modele ürettirsin, gpt ve banana'yı da dahil
// edelim, hangisi daha iyi sonuç veriyor bakalım"). Her model aynı istemle üretir; denetim ve seçim index.ts'te (yzGorselUret).
// - Cloudflare (Bağlantı anahtarları: cloudflare_adres + cloudflare_anahtar; program public/cloudflare/gorsel-worker.js "/uret"):
//   FLUX.2 [klein] 9B, FLUX.2 [dev], Leonardo Lucid Origin. Günlük ücretsiz pay biterse istek reddedilir (ücret çıkmaz).
// - OpenAI GPT Image (Bağlantı anahtarları "openai", göç 0062): hesaptaki en yeni gpt-image modeli kendiliğinden seçilir.
// - Google Nano Banana (Bağlantı anahtarları "gemini_gorsel", faturalandırması açık proje; ücretsiz Gemini anahtarları görsel üretemez):
//   hesaptaki en yeni "flash-image" modeli kendiliğinden seçilir.
import { createClient } from "npm:@supabase/supabase-js@2";

type Sb = ReturnType<typeof createClient>;
export type UretimModeli = "klein" | "dev" | "lucid" | "gpt" | "banana";
export const MODEL_AD: Record<string, string> = { klein: "FLUX.2 klein", dev: "FLUX.2 dev", lucid: "Lucid Origin", schnell: "FLUX.1 schnell", gpt: "GPT Image", banana: "Nano Banana" };
/** Görsel başına yaklaşık maliyet (dolar; Cloudflare günlük ücretsiz pay içindeyse 0). Kıyas tablosunda tahmini toplam için. */
export const MODEL_UCRET: Record<string, number> = { klein: 0.016, dev: 0.04, lucid: 0.045, schnell: 0.002, gpt: 0.04, banana: 0.04 };

export type Uretilen = { b64: string; mime: string; model: string; surum?: string };

async function anahtarlar(sb: Sb, adlar: string[]) {
  const { data } = await sb.from("baglanti_anahtarlari").select("ad,deger").in("ad", adlar);
  return Object.fromEntries(((data ?? []) as { ad: string; deger: string }[]).map((r) => [r.ad, r.deger])) as Record<string, string>;
}

/** Hangi modeller kullanılabilir (anahtarı girilmiş olanlar) */
export async function kullanilabilir(sb: Sb): Promise<UretimModeli[]> {
  const m = await anahtarlar(sb, ["cloudflare_adres", "cloudflare_anahtar", "openai", "gemini_gorsel"]);
  return [
    ...(m.cloudflare_adres && m.cloudflare_anahtar ? (["klein", "dev", "lucid"] as const) : []),
    ...(m.openai ? (["gpt"] as const) : []),
    ...(m.gemini_gorsel ? (["banana"] as const) : []),
  ];
}

const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

async function cloudflare(sb: Sb, model: string, istem: string, ms: number): Promise<Uretilen> {
  const m = await anahtarlar(sb, ["cloudflare_adres", "cloudflare_anahtar"]);
  const r = await fetch(String(m.cloudflare_adres).replace(/\/$/, "") + "/uret", {
    method: "POST", headers: { "x-anahtar": m.cloudflare_anahtar, "Content-Type": "application/json" },
    body: JSON.stringify({ istem, model }), signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error((await r.text()).slice(0, 140) || "HTTP " + r.status);
  return { b64: b64(new Uint8Array(await r.arrayBuffer())), mime: (r.headers.get("content-type") ?? "image/webp").split(";")[0], model: r.headers.get("x-model") || model };
}

// Hesaptaki en yeni model adı (bir kez bakılır): sürüm adlarını tahmin etmek yerine sağlayıcının listesinden seçilir
/** Model kataloğu: firmaların KENDİ adları, açıklamaları ve resmî fiyatları (4 Kasım 2026, kullanıcı: "verileri doğrudan firmalardan çek").
 *  Kaynak: OpenAI görsel üretim rehberi fiyat tablosu (developers.openai.com/api/docs/guides/image-generation) ve Google AI Studio fiyat
 *  sayfası (aistudio.google.com/docs/pricing). Fiyatlar görsel başına, bizim boyutumuzda (OpenAI 1536×1024; Google 16:9, 1K). API model listesi
 *  fiyat vermiyor; firma fiyat değiştirirse bu tablo güncellenir. "Jeton fiyatından" yazanlar için OpenAI görsel başı fiyat yayımlamıyor; çıktı jetonu fiyatı ($30/1M) GPT Image 2 ile aynı, o yüzden onun orta kalitesi yazıldı. */
export type KatalogModel = { saglayici: "gpt" | "banana"; id: string; ad: string; aciklama: string; fiyat: string; varsayilan?: boolean; kapaniyor?: string };
export const MODEL_KATALOG: KatalogModel[] = [
  { saglayici: "gpt", id: "gpt-image-2.5-flare", ad: "GPT Image 2.5 Flare", aciklama: "OpenAI: \"hızlı, yüksek kaliteli günlük görsel üretimi\"", fiyat: "≈ $0,041 (orta) · jeton fiyatından", varsayilan: true },
  { saglayici: "gpt", id: "gpt-image-2.5-sunburst", ad: "GPT Image 2.5 Sunburst", aciklama: "OpenAI: \"düzenleme hassasiyetinin en önemli olduğu işler\"", fiyat: "≈ $0,041 (orta) · jeton fiyatından" },
  { saglayici: "gpt", id: "gpt-image-2", ad: "GPT Image 2", aciklama: "OpenAI'ın önceki nesil görsel modeli", fiyat: "düşük $0,005 · orta $0,041 · yüksek $0,165" },
  { saglayici: "gpt", id: "gpt-image-1.5", ad: "GPT Image 1.5", aciklama: "OpenAI'ın eski görsel modeli", fiyat: "düşük $0,013 · orta $0,05 · yüksek $0,20" },
  { saglayici: "gpt", id: "gpt-image-1-mini", ad: "GPT Image 1 Mini", aciklama: "OpenAI'ın küçük, ucuz görsel modeli", fiyat: "düşük $0,006 · orta $0,015 · yüksek $0,052" },
  { saglayici: "banana", id: "gemini-nano-banana-2.1", ad: "Nano Banana 2.1", aciklama: "Google'ın en yeni görsel modeli", fiyat: "$0,0336 (1K) · $0,0504 (2K)", varsayilan: true },
  { saglayici: "banana", id: "gemini-3.1-flash-image", ad: "Nano Banana 2 (Gemini 3.1 Flash Image)", aciklama: "Google'ın önceki nesil hızlı görsel modeli", fiyat: "$0,067 (1K) · $0,101 (2K)" },
  { saglayici: "banana", id: "gemini-3.1-flash-lite-image", ad: "Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image)", aciklama: "Google'ın hafif, ucuz görsel modeli; eski Nano Banana'nın önerilen yerine geçeni", fiyat: "$0,0336 (1K)" },
  { saglayici: "banana", id: "gemini-3-pro-image", ad: "Nano Banana Pro (Gemini 3 Pro Image)", aciklama: "Google'ın en güçlü görsel modeli", fiyat: "$0,134 (1K/2K) · $0,24 (4K)" },
  { saglayici: "banana", id: "gemini-2.5-flash-image", ad: "Nano Banana (Gemini 2.5 Flash Image)", aciklama: "Google'ın ilk Nano Banana'sı", fiyat: "$0,039", kapaniyor: "15 Mart 2027'de kapanıyor" },
];

/** Yöneticinin seçtiği varsayılan model ve kalite (Haber Masası → Ayarlar; tr_settings.gorsel_modeller). Boşsa katalogdaki varsayılan. */
type Secim = { gpt?: string; gpt_kalite?: "medium" | "high" | "low"; banana?: string };
async function secim(sb: Sb): Promise<Secim> {
  const { data } = await sb.from("tr_settings").select("value").eq("key", "gorsel_modeller").maybeSingle();
  return (data?.value ?? {}) as Secim;
}
const varsayilan = (sg: "gpt" | "banana") => MODEL_KATALOG.find((m) => m.saglayici === sg && m.varsayilan)!.id;

async function openai(sb: Sb, istem: string, ms: number, surum?: string, kalite?: string): Promise<Uretilen> {
  const { openai: key } = await anahtarlar(sb, ["openai"]);
  const sc = await secim(sb);
  const model = surum || sc.gpt || varsayilan("gpt");
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, signal: AbortSignal.timeout(ms),
    body: JSON.stringify({ model, prompt: istem, size: "1536x1024", quality: kalite || sc.gpt_kalite || "medium", n: 1 }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("OpenAI: " + String(j?.error?.message ?? r.status).slice(0, 140));
  const d = j?.data?.[0]?.b64_json;
  if (!d) throw new Error("OpenAI görsel döndürmedi");
  return { b64: d, mime: "image/png", model: "gpt", surum: model };
}

async function nanoBanana(sb: Sb, istem: string, ms: number, surum?: string): Promise<Uretilen> {
  const { gemini_gorsel: key } = await anahtarlar(sb, ["gemini_gorsel"]);
  const sc = await secim(sb);
  const model = surum || sc.banana || varsayilan("banana");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(ms),
    body: JSON.stringify({ contents: [{ parts: [{ text: istem }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Google: " + String(j?.error?.message ?? r.status).slice(0, 140));
  const p = (j?.candidates?.[0]?.content?.parts ?? []).find((x: { inlineData?: { data?: string } }) => x.inlineData?.data);
  if (!p) throw new Error("Nano Banana görsel döndürmedi");
  return { b64: p.inlineData.data, mime: p.inlineData.mimeType || "image/png", model: "banana", surum: model };
}

/** surum: belirli bir model (taslaktaki seçiciden); kalite: GPT için düşük/orta/yüksek */
export function uret(sb: Sb, model: UretimModeli, istem: string, ms: number, surum?: string, kalite?: string): Promise<Uretilen> {
  if (model === "gpt") return openai(sb, istem, ms, surum, kalite);
  if (model === "banana") return nanoBanana(sb, istem, ms, surum);
  return cloudflare(sb, model, istem, ms);
}

/** Seçici için: katalogdaki modellerden hesabımızın gerçekten erişebildikleri (firmanın model listesinden doğrulanır) */
export type ModelBilgi = KatalogModel & { erisim: boolean };
export async function modelListesi(sb: Sb): Promise<{ modeller: ModelBilgi[]; secim: Secim; hata: string[] }> {
  const m = await anahtarlar(sb, ["openai", "gemini_gorsel"]);
  const var_ = new Set<string>(), hata: string[] = [];
  if (m.openai) try {
    const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: "Bearer " + m.openai }, signal: AbortSignal.timeout(10_000) });
    ((await r.json()).data ?? []).forEach((x: { id: string }) => var_.add(x.id));
  } catch (e) { hata.push("OpenAI listesi alınamadı: " + String((e as Error).message).slice(0, 60)); }
  if (m.gemini_gorsel) try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=300&key=${m.gemini_gorsel}`, { signal: AbortSignal.timeout(10_000) });
    ((await r.json()).models ?? []).forEach((x: { name: string }) => var_.add(x.name.replace(/^models\//, "")));
  } catch (e) { hata.push("Google listesi alınamadı: " + String((e as Error).message).slice(0, 60)); }
  return { modeller: MODEL_KATALOG.map((k) => ({ ...k, erisim: var_.has(k.id) })), secim: await secim(sb), hata };
}
