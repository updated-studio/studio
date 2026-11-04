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
const surumOnbellek: Record<string, string> = {};
const surumSirala = (a: string, b: string) => b.localeCompare(a, "en", { numeric: true });

/** Yöneticinin seçtiği model ve kalite (Haber Masası → Ayarlar → Görsel model kıyası; tr_settings.gorsel_modeller). Boşsa en yeni standart. */
async function secim(sb: Sb): Promise<{ gpt?: string; gpt_kalite?: "medium" | "high" | "low"; banana?: string }> {
  const { data } = await sb.from("tr_settings").select("value").eq("key", "gorsel_modeller").maybeSingle();
  return (data?.value ?? {}) as { gpt?: string; gpt_kalite?: "medium" | "high" | "low"; banana?: string };
}

async function openai(sb: Sb, istem: string, ms: number): Promise<Uretilen> {
  const { openai: key } = await anahtarlar(sb, ["openai"]);
  const h = { Authorization: "Bearer " + key, "Content-Type": "application/json" };
  const sc = await secim(sb);
  if (sc.gpt) surumOnbellek.gpt = sc.gpt;
  else if (!surumOnbellek.gpt) {
    const l = await fetch("https://api.openai.com/v1/models", { headers: h, signal: AbortSignal.timeout(10_000) });
    if (!l.ok) throw new Error("OpenAI: " + (await l.text()).slice(0, 120));
    const ids = ((await l.json()).data as { id: string }[]).map((x) => x.id).filter((x) => /^gpt-image/.test(x) && !/mini/.test(x)).sort(surumSirala);
    if (!ids.length) throw new Error("OpenAI hesabında gpt-image modeli yok");
    surumOnbellek.gpt = ids[0];
  }
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST", headers: h, signal: AbortSignal.timeout(ms),
    body: JSON.stringify({ model: surumOnbellek.gpt, prompt: istem, size: "1536x1024", quality: sc.gpt_kalite ?? "medium", n: 1 }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("OpenAI: " + String(j?.error?.message ?? r.status).slice(0, 140));
  const d = j?.data?.[0]?.b64_json;
  if (!d) throw new Error("OpenAI görsel döndürmedi");
  return { b64: d, mime: "image/png", model: "gpt", surum: surumOnbellek.gpt };
}

async function nanoBanana(sb: Sb, istem: string, ms: number): Promise<Uretilen> {
  const { gemini_gorsel: key } = await anahtarlar(sb, ["gemini_gorsel"]);
  const kok = "https://generativelanguage.googleapis.com/v1beta";
  const sc = await secim(sb);
  if (sc.banana) surumOnbellek.banana = sc.banana;
  else if (!surumOnbellek.banana) {
    const l = await fetch(`${kok}/models?pageSize=200&key=${key}`, { signal: AbortSignal.timeout(10_000) });
    if (!l.ok) throw new Error("Google: " + (await l.text()).slice(0, 120));
    const ad = ((await l.json()).models as { name: string; supportedGenerationMethods?: string[] }[])
      .filter((x) => /flash-image/.test(x.name) && (x.supportedGenerationMethods ?? []).includes("generateContent")).map((x) => x.name.replace(/^models\//, "")).sort(surumSirala);
    if (!ad.length) throw new Error("Google hesabında flash-image modeli yok");
    surumOnbellek.banana = ad[0];
  }
  const r = await fetch(`${kok}/models/${surumOnbellek.banana}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(ms),
    body: JSON.stringify({ contents: [{ parts: [{ text: istem }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Google: " + String(j?.error?.message ?? r.status).slice(0, 140));
  const p = (j?.candidates?.[0]?.content?.parts ?? []).find((x: { inlineData?: { data?: string } }) => x.inlineData?.data);
  if (!p) throw new Error("Nano Banana görsel döndürmedi");
  return { b64: p.inlineData.data, mime: p.inlineData.mimeType || "image/png", model: "banana", surum: surumOnbellek.banana };
}

export function uret(sb: Sb, model: UretimModeli, istem: string, ms: number): Promise<Uretilen> {
  if (model === "gpt") return openai(sb, istem, ms);
  if (model === "banana") return nanoBanana(sb, istem, ms);
  return cloudflare(sb, model, istem, ms);
}

/** Seçilebilir modeller (yönetici ekranı): sağlayıcının listesinden, gücü, yeniliği ve görsel başına tahmini ücretiyle.
 *  Ücretler yaklaşık (Kasım 2026 fiyat sayfaları); sağlayıcı fiyat değiştirirse burası güncellenir. */
export type ModelBilgi = { saglayici: "gpt" | "banana"; id: string; guc: string; ucret: string; tarih?: string; enYeni?: boolean };
export async function modelListesi(sb: Sb): Promise<{ modeller: ModelBilgi[]; hata: string[] }> {
  const m = await anahtarlar(sb, ["openai", "gemini_gorsel"]);
  const out: ModelBilgi[] = [], hata: string[] = [];
  if (m.openai) {
    try {
      const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: "Bearer " + m.openai }, signal: AbortSignal.timeout(10_000) });
      const l = ((await r.json()).data ?? []) as { id: string; created: number }[];
      const gi = l.filter((x) => /^gpt-image/.test(x.id)).sort((a, b) => surumSirala(a.id, b.id));
      gi.forEach((x, i) => out.push({ saglayici: "gpt", id: x.id, enYeni: i === 0 && !/mini/.test(x.id),
        guc: /mini/.test(x.id) ? "Ekonomik (daha düşük kalite)" : "Standart", ucret: /mini/.test(x.id) ? "~1 sent (orta), ~4 sent (yüksek)" : "~4 sent (orta), ~13 sent (yüksek)",
        tarih: x.created ? new Date(x.created * 1000).toISOString().slice(0, 10) : undefined }));
    } catch (e) { hata.push("OpenAI: " + String((e as Error).message).slice(0, 80)); }
  }
  if (m.gemini_gorsel) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${m.gemini_gorsel}`, { signal: AbortSignal.timeout(10_000) });
      const l = ((await r.json()).models ?? []) as { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
      const gi = l.filter((x) => /image/.test(x.name) && !/imagen/.test(x.name) && (x.supportedGenerationMethods ?? []).includes("generateContent")).map((x) => x.name.replace(/^models\//, "")).sort(surumSirala);
      const ilkFlash = gi.find((x) => /flash-image/.test(x));
      gi.forEach((id) => out.push({ saglayici: "banana", id, enYeni: id === ilkFlash || id === gi.find((x) => /pro-image/.test(x)),
        guc: /pro-image/.test(id) ? "En güçlü (Pro)" : /flash-image/.test(id) ? "Standart (hızlı)" : "Diğer", ucret: /pro-image/.test(id) ? "~13 sent (2K), ~24 sent (4K)" : "~4 sent" }));
    } catch (e) { hata.push("Google: " + String((e as Error).message).slice(0, 80)); }
  }
  return { modeller: out, hata };
}
