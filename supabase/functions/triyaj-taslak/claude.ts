// Düşünme seviyesi (4 Kasım 2026, kullanıcı: "önemli bir iş, düşünme neden düşük, bana sormadan yapma"): varsayılan medium; taslak yazımı
// ve denetim medium (4 Kasım: kullanıcı "yüksek harcamasın"). Düşürmek kullanıcı kararıdır.
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
const say = (model: string, sonuc: string, fonk?: string) => { istemci().rpc("gemini_say", { p_fonk: fonk || FONK, p_model: model, p_sonuc: sonuc }).then(() => {}, () => {}); };

let onbellek: { anahtar: string | null; zaman: number } | null = null;
let krediYok = 0; // kredi bitti yanıtı alındıysa 30 dk boyunca Claude denenmez (her çağrıda boşuna beklenmesin)
async function claudeAnahtari(): Promise<string | null> {
  if (onbellek && Date.now() - onbellek.zaman < 60_000) return onbellek.anahtar;
  const { data } = await istemci().from("baglanti_anahtarlari").select("deger").eq("ad", "claude").maybeSingle();
  onbellek = { anahtar: (data as { deger?: string } | null)?.deger || null, zaman: Date.now() };
  return onbellek.anahtar;
}

/** Yanıttaki ilk JSON nesnesi (şemasız çağrılarda model açıklama eklerse diye) */
// 5 Kasım 2026: Opus denetimi JSON'dan sonra ikinci bir nesne/metin yazınca ("Unexpected non-whitespace character after JSON") ilk ile son
// süslü parantez arası okunamıyordu; 3-5 Kasım'da 90 denetimin 33'ü bu yüzden Gemini'ye düştü (Opus ücreti boşa). Artık metindeki bütün
// üst düzey JSON nesneleri (tırnak içi parantezler sayılmadan) ayrı ayrı okunur, en uzun geçerli olan alınır.
export function jsonAl(metin: string): Record<string, unknown> {
  try { return JSON.parse(metin); } catch { /* aşağıda */ }
  let en: Record<string, unknown> | null = null, enUzun = 0;
  for (let i = metin.indexOf("{"); i >= 0; i = metin.indexOf("{", i + 1)) {
    let d = 0, tirnak = false, kac = false, j = i;
    for (; j < metin.length; j++) {
      const c = metin[j];
      if (tirnak) { if (kac) kac = false; else if (c === "\\") kac = true; else if (c === '"') tirnak = false; continue; }
      if (c === '"') tirnak = true; else if (c === "{") d++; else if (c === "}" && --d === 0) break;
    }
    if (d !== 0) continue;
    try { const v = JSON.parse(metin.slice(i, j + 1)); if (v && typeof v === "object" && !Array.isArray(v) && j + 1 - i > enUzun) { en = v; enUzun = j + 1 - i; } i = j; } catch { /* sonraki { */ }
  }
  if (!en) throw new Error("Claude JSON döndürmedi");
  return en;
}

/** JSON döndüren tek çağrı. sema verilirse yanıt şemaya bağlanır; resimler "Aday N:" etiketiyle sırayla eklenir. */
// fonk: başka fonksiyondan çağrılınca kullanım sayacındaki ad (kıyaslar, 4 Kasım 2026)
export async function claudeJson(o: { sistem: string; kullanici: string; model: string; ms: number; sema?: Record<string, unknown>; resimler?: { mime: string; b64: string; etiket?: string }[]; maxTokens?: number; caba?: "low" | "medium" | "high"; fonk?: string }): Promise<{ veri: Record<string, any>; model: string } | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (Date.now() < krediYok) return null;
  const apiKey = await claudeAnahtari();
  if (!apiKey) return null;
  if (o.ms < 8_000) throw new Error("Claude için süre yetmedi");
  const bitis = Date.now() + o.ms;
  const icerik: Anthropic.ContentBlockParam[] = [];
  for (const r of o.resimler ?? []) {
    if (r.etiket) icerik.push({ type: "text", text: r.etiket + ":" });
    icerik.push({ type: "image", source: { type: "base64", media_type: r.mime as "image/jpeg" | "image/png" | "image/webp", data: r.b64 } });
  }
  icerik.push({ type: "text", text: o.kullanici });
  // Geçici hatada (aşırı yük 529, 5xx, 429) ve süre yetiyorsa bir kez yeniden dener; Gemini'ye ancak sonra düşülür (4 Kasım 2026)
  for (let deneme = 0; ; deneme++) {
    try { return await tekCagri(apiKey, o, icerik, bitis - Date.now()); }
    catch (e) {
      const st = (e as { status?: number }).status ?? 0;
      if (deneme === 0 && (st === 429 || st >= 500) && bitis - Date.now() > 45_000) { await new Promise((r) => setTimeout(r, 4_000)); continue; }
      throw e;
    }
  }
}

async function tekCagri(apiKey: string, o: Parameters<typeof claudeJson>[0], icerik: Anthropic.ContentBlockParam[], ms: number): Promise<{ veri: Record<string, any>; model: string }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const client = new Anthropic({ apiKey, timeout: Math.max(8_000, ms), maxRetries: 0 });
  try {
    const m = await client.messages.create({
      // Sistem istemi önbelleğe alınır (aynı üslup ve kontrol yönergesi her taslakta tekrar gider; tekrar okunması %90 ucuz).
      // 5 Kasım 2026: önbellek 1 saat tutulur (5 dakikalıkta isabet %15'ti; taslaklar ve künye turları 20-40 dakika arayla geliyor)
      model: o.model, max_tokens: o.maxTokens ?? 8000, system: [{ type: "text", text: o.sistem, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: icerik }],
      output_config: { effort: o.caba ?? "medium", ...(o.sema ? { format: { type: "json_schema", schema: o.sema } } : {}) },
    } as Anthropic.MessageCreateParamsNonStreaming);
    if (m.stop_reason === "refusal") throw new Error("Claude yanıt vermeyi reddetti");
    if (m.stop_reason === "max_tokens") throw new Error("Claude yanıtı yarıda kesildi");
    const veri = jsonAl(m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""));
    say(o.model, "basarili", o.fonk);
    return { veri, model: o.model };
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    const kredi = /credit balance|billing|insufficient/i.test(msg);
    if (kredi) krediYok = Date.now() + 30 * 60_000;
    if ((e as { status?: number }).status === 401) onbellek = null;
    say(o.model, kredi || (e as { status?: number }).status === 429 ? "kota" : "hata", o.fonk);
    throw Object.assign(new Error(kredi ? "Claude kredisi bitti" : msg.slice(0, 120)), { status: kredi ? 0 : (e as { status?: number }).status });
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

/** Web aramalı tek iş (5 Kasım 2026, künye görselleri: "hangi yapay zekâ buluyorsa onu zekileştirelim"): Claude, Anthropic'in sunucuda çalışan
 *  web_search aracıyla arar (arama başına 0,01 $ + jeton). Uzun arama "pause_turn" ile dönerse kaldığı yerden sürdürülür.
 *  Dönen: son metin ve aramalarda görülen sonuç adresleri. Anahtar yoksa null; hata fırlatılır. */
export async function claudeAramali(o: { sistem: string; kullanici: string; model: string; ms: number; maxArama: number; fonk?: string }): Promise<{ metin: string; adresler: string[] } | null> {
  if (Date.now() < krediYok) return null;
  const apiKey = await claudeAnahtari();
  if (!apiKey) return null;
  const bitis = Date.now() + o.ms;
  const client = new Anthropic({ apiKey, timeout: Math.max(8_000, o.ms), maxRetries: 0 });
  const mesajlar: Anthropic.MessageParam[] = [{ role: "user", content: o.kullanici }];
  const adresler: string[] = [];
  try {
    for (let tur = 0; tur < 4; tur++) {
      if (bitis - Date.now() < 8_000) throw new Error("Claude araması için süre yetmedi");
      const m = await client.messages.create({
        model: o.model, max_tokens: 8000, system: o.sistem, messages: mesajlar,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: o.maxArama }],
        output_config: { effort: "medium" },
      } as Anthropic.MessageCreateParamsNonStreaming, { timeout: Math.max(8_000, bitis - Date.now()) });
      for (const b of m.content as unknown as { type: string; content?: unknown }[]) {
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content as { url?: string }[]) if (r.url) adresler.push(r.url);
      }
      if (m.stop_reason === "pause_turn") { mesajlar.push({ role: "assistant", content: m.content as Anthropic.ContentBlockParam[] }); continue; }
      if (m.stop_reason === "refusal") throw new Error("Claude yanıt vermeyi reddetti");
      say(o.model, "basarili", o.fonk);
      return { metin: m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""), adresler };
    }
    throw new Error("Claude araması bitmedi");
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    const kredi = /credit balance|billing|insufficient/i.test(msg);
    if (kredi) krediYok = Date.now() + 30 * 60_000;
    if ((e as { status?: number }).status === 401) onbellek = null;
    say(o.model, kredi || (e as { status?: number }).status === 429 ? "kota" : "hata", o.fonk);
    throw new Error(kredi ? "Claude kredisi bitti" : msg.slice(0, 120));
  }
}
