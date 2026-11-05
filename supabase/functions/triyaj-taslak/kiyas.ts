// Yapay zekâ iş kıyası modelleri (4 Kasım 2026, kullanıcı: "her yapay zekâyı en iyi olduğu işte kullanalım; tarafsız ol; yeni modellere
// güncel kalalım"). Asıl işi yapan model (ücretsiz Gemini) dışında, her sağlayıcıdan bir ucuz bir güçlü model aynı girdiyle gölgede çalışır.
// Fiyatlar firmaların fiyat sayfalarından (4 Kasım 2026; Gemini 4 Argon 1 Aralık'ta iki katına çıkıyor), dolar / 1M jeton (girdi, çıktı).
// Gemini 4 Argon'un ücretsiz katmanı yok: görsel için açılan ücretli projenin anahtarıyla (gemini_gorsel) çağrılır; asıl metin işleri
// ücretsiz Gemini anahtar havuzunda kalır (kullanıcı: "ikisi birbirine girmesin").
import { claudeJson, jsonAl } from "./claude.ts";
import { anahtarlar as havuzAnahtarlari } from "./anahtar.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Sb = ReturnType<typeof createClient>;
// ucretsiz: Gemini'nin ücretsiz katmanı olan modeli, metin işlerinin ücretsiz anahtar havuzuyla çağrılır (kazanırsa bedava yükseltme)
export type KiyasModel = { id: string; ad: string; saglayici: "claude" | "openai" | "gemini"; sinif: "ucuz" | "guclu"; fiyat: [number, number]; ucretsiz?: boolean };
export const KIYAS_MODELLERI: KiyasModel[] = [
  { id: "claude-haiku-5-5", ad: "Claude Haiku 5.5", saglayici: "claude", sinif: "ucuz", fiyat: [0.1, 0.5] },
  { id: "claude-sonnet-5-5", ad: "Claude Sonnet 5.5", saglayici: "claude", sinif: "guclu", fiyat: [2, 10] },
  // En güçlü metin modeli (kullanıcı: "metinde Claude birinci, onu da kıyasa al"): tavan ölçüsü, pahalı
  { id: "claude-opus-5-5", ad: "Claude Opus 5.5", saglayici: "claude", sinif: "guclu", fiyat: [4, 20] },
  { id: "gpt-6-luna", ad: "GPT-6 Luna", saglayici: "openai", sinif: "ucuz", fiyat: [0.1, 0.5] },
  { id: "gpt-6.1-sol", ad: "GPT-6.1 Sol", saglayici: "openai", sinif: "guclu", fiyat: [2, 10] },
  { id: "gemini-4-argon", ad: "Gemini 4 Argon", saglayici: "gemini", sinif: "guclu", fiyat: [2, 10] },
  { id: "gemini-3.8-flash", ad: "Gemini 3.8 Flash (ücretsiz)", saglayici: "gemini", sinif: "ucuz", fiyat: [0, 0], ucretsiz: true },
];

const say = (sb: Sb, fonk: string, model: string, sonuc: string) => { sb.rpc("gemini_say", { p_fonk: fonk, p_model: model, p_sonuc: sonuc }).then(() => {}, () => {}); };
async function anahtar(sb: Sb, ad: string) {
  const { data } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", ad).maybeSingle();
  return (data as { deger?: string } | null)?.deger || null;
}

/** Kıyas modelini aynı sistem istemi ve girdiyle çağırır; anahtarı yoksa null, hata olursa fırlatır */
export async function kiyasCagir(sb: Sb, m: KiyasModel, sistem: string, kullanici: string, ms: number, fonk: string): Promise<Record<string, any> | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (m.saglayici === "claude") return (await claudeJson({ sistem, kullanici, model: m.id, ms, maxTokens: 20_000, fonk }))?.veri ?? null;
  if (m.saglayici === "openai") {
    const key = await anahtar(sb, "openai");
    if (!key) return null;
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, signal: AbortSignal.timeout(ms),
      body: JSON.stringify({ model: m.id, instructions: sistem, input: kullanici, text: { format: { type: "json_object" } } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { say(sb, fonk, m.id, r.status === 429 ? "kota" : "hata"); throw new Error("OpenAI: " + String(j?.error?.message ?? r.status).slice(0, 160)); }
    const metin = typeof j.output_text === "string" ? j.output_text
      : ((j.output ?? []) as { content?: { type: string; text?: string }[] }[]).flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
    say(sb, fonk, m.id, "basarili");
    return jsonAl(metin);
  }
  // Ücretli Gemini yalnız ücretli projenin anahtarıyla; ücretsiz model ücretsiz havuzun ilk uygun anahtarıyla (ikisi karışmaz)
  const key = m.ucretsiz ? (await havuzAnahtarlari())[0]?.deger ?? null : await anahtar(sb, "gemini_gorsel");
  if (!key) return null;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m.id}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(ms),
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sistem }] }, contents: [{ role: "user", parts: [{ text: kullanici }] }], generationConfig: { responseMimeType: "application/json" } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { say(sb, fonk, m.id, r.status === 429 ? "kota" : "hata"); throw new Error("Google: " + String(j?.error?.message ?? r.status).slice(0, 160)); }
  const metin = ((j?.candidates?.[0]?.content?.parts ?? []) as { text?: string; thought?: boolean }[]).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  say(sb, fonk, m.id, "basarili");
  return jsonAl(metin);
}

/** Yeni model takibi (4 Kasım 2026, kullanıcı: "yeni modellere hep güncel kalmalıyız, sıçramalar oluyor"): günde bir kez Anthropic, OpenAI
 *  ve Google'ın model listesine bakılır; daha önce görülmemiş bir model çıkınca yöneticilere Stüdyo bildirimi gider. İlk çalışmada
 *  yalnız liste kaydedilir (tr_settings.model_takip). */
export async function modelTakip(sb: Sb) {
  const bugun = new Date().toISOString().slice(0, 10);
  const { data } = await sb.from("tr_settings").select("value").eq("key", "model_takip").maybeSingle();
  const eski = (data?.value ?? {}) as { gun?: string; bilinen?: string[] };
  if (eski.gun === bugun) return;
  const [claude, openai, gemini] = await Promise.all([anahtar(sb, "claude"), anahtar(sb, "openai"), anahtar(sb, "gemini_gorsel")]);
  const al = async (url: string, h: Record<string, string>, yol: (j: any) => string[]) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    try { const r = await fetch(url, { headers: h, signal: AbortSignal.timeout(15_000) }); return r.ok ? yol(await r.json()) : null; } catch { return null; }
  };
  const listeler = await Promise.all([
    claude ? al("https://api.anthropic.com/v1/models?limit=100", { "x-api-key": claude, "anthropic-version": "2023-06-01" }, (j) => (j.data ?? []).map((x: { id: string }) => "Anthropic · " + x.id)) : null,
    openai ? al("https://api.openai.com/v1/models", { Authorization: "Bearer " + openai }, (j) => (j.data ?? []).map((x: { id: string }) => x.id).filter((id: string) => /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|transcribe|tts|search|\d{4}-\d{2}-\d{2})/.test(id)).map((id: string) => "OpenAI · " + id)) : null,
    gemini ? al("https://generativelanguage.googleapis.com/v1beta/models?pageSize=300", { "x-goog-api-key": gemini }, (j) => (j.models ?? []).map((x: { name: string }) => x.name.replace(/^models\//, "")).filter((id: string) => /^gemini/.test(id) && !/(embedding|tts|live|-\d{3}$|exp)/.test(id)).map((id: string) => "Google · " + id)) : null,
  ]);
  // Bir firmanın listesi alınamadıysa o firmanın eski modelleri korunur (yanlışlıkla "yeni" sayılmasın)
  const simdi = new Set<string>(eski.bilinen ?? []);
  const yeniler: string[] = [];
  for (const l of listeler) for (const m of l ?? []) if (!simdi.has(m)) { simdi.add(m); yeniler.push(m); }
  await sb.from("tr_settings").upsert({ key: "model_takip", value: { gun: bugun, bilinen: [...simdi].sort() } });
  if (!eski.bilinen || !yeniler.length) return;
  const { data: yon } = await sb.from("profiles").select("id").eq("is_admin", true);
  const metin = `Yeni yapay zekâ modeli çıktı: ${yeniler.slice(0, 6).join(", ")}${yeniler.length > 6 ? ` ve ${yeniler.length - 6} model daha` : ""}. Kıyasa eklemek için Claude'a söyle.`;
  const satirlar = ((yon ?? []) as { id: string }[]).map((x) => ({ user_id: x.id, body: metin.slice(0, 480) }));
  if (satirlar.length) await sb.from("notifications").insert(satirlar);
}
