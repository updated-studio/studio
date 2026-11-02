// Claude (Anthropic API) çağrıları (2 Kasım 2026, kullanıcı: "geminiden alıp claude'a devredelim; claude'un kendi modelleri arasında,
// biri yazar daha akıllısı denetler"). Anahtar Stüdyo → Bağlantı anahtarları "claude" (göç 0061).
// Kim ne yapar: CLAUDE_MODEL'de. Anahtar yoksa null döner; hata (kredi bitti, kota, ağ, süre) fırlatılır. İkisinde de çağıran Gemini'ye döner,
// yani kredi bitince sistem kendiliğinden ücretsiz Gemini ile devam eder. Her çağrı Gemini kullanım sayacına (göç 0055) model adıyla yazılır.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

export const CLAUDE_MODEL = {
  taslak: "claude-sonnet-5-5", // taslağı yazar
  kontrol: "claude-opus-5-5", // taslağı kaynaklara karşı denetler, mantık ve bütünlüğe bakar, insanlaştırır (yazandan bir üst model)
  gorsel: "claude-sonnet-5-5", // öne çıkan görseli görerek seçer
  kucuk: "claude-haiku-5-5", // çeviri, kategori seçimi gibi kısa işler
};

let sb: ReturnType<typeof createClient> | null = null;
function istemci() {
  if (sb) return sb;
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  sb = createClient(Deno.env.get("SUPABASE_URL")!, legacy || ((dict.default ?? Object.values(dict)[0]) as string));
  return sb;
}
const FONK = (() => { try { return new URL(import.meta.url).pathname.split("/").slice(-2, -1)[0] || "?"; } catch { return "?"; } })();
const say = (model: string, sonuc: string) => { istemci().rpc("gemini_say", { p_fonk: FONK, p_model: model, p_sonuc: sonuc }).then(() => {}, () => {}); };

let onbellek: { anahtar: string | null; zaman: number } | null = null;
let krediYok = 0; // kredi bitti yanıtı alındıysa 30 dk boyunca Claude denenmez (her çağrıda boşuna beklenmesin)
async function claudeAnahtari(): Promise<string | null> {
  if (onbellek && Date.now() - onbellek.zaman < 60_000) return onbellek.anahtar;
  const { data } = await istemci().from("baglanti_anahtarlari").select("deger").eq("ad", "claude").maybeSingle();
  onbellek = { anahtar: (data as { deger?: string } | null)?.deger || null, zaman: Date.now() };
  return onbellek.anahtar;
}

/** Yanıttaki ilk JSON nesnesi (şemasız çağrılarda model açıklama eklerse diye) */
function jsonAl(metin: string): Record<string, unknown> {
  try { return JSON.parse(metin); } catch { /* aşağıda */ }
  const a = metin.indexOf("{"), b = metin.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("Claude JSON döndürmedi");
  return JSON.parse(metin.slice(a, b + 1));
}

/** JSON döndüren tek çağrı. sema verilirse yanıt şemaya bağlanır; resimler "Aday N:" etiketiyle sırayla eklenir. */
export async function claudeJson(o: { sistem: string; kullanici: string; model: string; ms: number; sema?: Record<string, unknown>; resimler?: { mime: string; b64: string; etiket?: string }[]; maxTokens?: number; caba?: "low" | "medium" | "high" }): Promise<{ veri: Record<string, any>; model: string } | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (Date.now() < krediYok) return null;
  const apiKey = await claudeAnahtari();
  if (!apiKey) return null;
  if (o.ms < 8_000) throw new Error("Claude için süre yetmedi");
  const client = new Anthropic({ apiKey, timeout: o.ms, maxRetries: 0 });
  const icerik: Anthropic.ContentBlockParam[] = [];
  for (const r of o.resimler ?? []) {
    if (r.etiket) icerik.push({ type: "text", text: r.etiket + ":" });
    icerik.push({ type: "image", source: { type: "base64", media_type: r.mime as "image/jpeg" | "image/png" | "image/webp", data: r.b64 } });
  }
  icerik.push({ type: "text", text: o.kullanici });
  try {
    const m = await client.messages.create({
      model: o.model, max_tokens: o.maxTokens ?? 2048, system: o.sistem,
      messages: [{ role: "user", content: icerik }],
      output_config: { effort: o.caba ?? "low", ...(o.sema ? { format: { type: "json_schema", schema: o.sema } } : {}) },
    } as Anthropic.MessageCreateParamsNonStreaming);
    if (m.stop_reason === "refusal") throw new Error("Claude yanıt vermeyi reddetti");
    if (m.stop_reason === "max_tokens") throw new Error("Claude yanıtı yarıda kesildi");
    const veri = jsonAl(m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""));
    say(o.model, "basarili");
    return { veri, model: o.model };
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    const kredi = /credit balance|billing|insufficient/i.test(msg);
    if (kredi) krediYok = Date.now() + 30 * 60_000;
    if ((e as { status?: number }).status === 401) onbellek = null;
    say(o.model, kredi || (e as { status?: number }).status === 429 ? "kota" : "hata");
    throw new Error(kredi ? "Claude kredisi bitti" : msg.slice(0, 120));
  }
}

/** Görsel seçimi yanıt şeması (SECIM_SISTEM ile aynı alanlar) */
export const SECIM_SEMA = {
  type: "object",
  properties: {
    secim: { type: "integer" },
    neden: { type: "string" },
    odak: { type: "object", properties: { x: { type: "integer" }, y: { type: "integer" } }, required: ["x", "y"], additionalProperties: false },
  },
  required: ["secim", "neden", "odak"],
  additionalProperties: false,
};
