// Claude (Anthropic API) çağrısı (2 Kasım 2026, kullanıcı: "geminileri claude'un kredisiyle değiştirmeyi düşünüyorum"). İlk iş öne çıkan
// görsel seçimi: Claude adayların kendisini görür, haberdeki ürünle karşılaştırır. Anahtar Stüdyo → Bağlantı anahtarları "claude" (göç 0061).
// Anahtar yoksa null döner; hata (kredi bitti, kota, ağ) fırlatılır. İkisinde de çağıran Gemini'ye döner.
import Anthropic from "npm:@anthropic-ai/sdk";
import type { createClient } from "npm:@supabase/supabase-js@2";

type Sb = ReturnType<typeof createClient>;
export const CLAUDE_GORSEL_MODEL = "claude-sonnet-5-5";

let onbellek: { anahtar: string | null; zaman: number } | null = null;
async function claudeAnahtari(sb: Sb): Promise<string | null> {
  if (onbellek && Date.now() - onbellek.zaman < 60_000) return onbellek.anahtar;
  const { data } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", "claude").maybeSingle();
  onbellek = { anahtar: (data as { deger?: string } | null)?.deger || null, zaman: Date.now() };
  return onbellek.anahtar;
}

/** JSON şemalı tek çağrı; resimler "Aday N:" etiketiyle sırayla eklenir. */
export async function claudeJson(sb: Sb, o: { sistem: string; kullanici: string; sema: Record<string, unknown>; resimler?: { mime: string; b64: string; etiket?: string }[]; ms: number; model?: string }): Promise<{ veri: Record<string, unknown>; model: string } | null> {
  const apiKey = await claudeAnahtari(sb);
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, timeout: Math.max(5_000, o.ms), maxRetries: 1 });
  const icerik: Anthropic.ContentBlockParam[] = [];
  for (const r of o.resimler ?? []) {
    if (r.etiket) icerik.push({ type: "text", text: r.etiket + ":" });
    icerik.push({ type: "image", source: { type: "base64", media_type: r.mime as "image/jpeg" | "image/png" | "image/webp", data: r.b64 } });
  }
  icerik.push({ type: "text", text: o.kullanici });
  const model = o.model ?? CLAUDE_GORSEL_MODEL;
  const m = await client.messages.create({
    model, max_tokens: 1024, system: o.sistem,
    messages: [{ role: "user", content: icerik }],
    output_config: { effort: "low", format: { type: "json_schema", schema: o.sema } },
  } as Anthropic.MessageCreateParamsNonStreaming);
  if (m.stop_reason === "refusal") throw new Error("Claude yanıt vermeyi reddetti");
  const metin = m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { veri: JSON.parse(metin), model };
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
