// Künye doldurma (25 Ekim 2026, offocus yol haritası 2): editör üreticinin ürün sayfası bağlantısını verir; sayfa okunur,
// yapay zekâ YALNIZ sayfada açıkça yazan değerleri ürünün özellik adlarına (site lib/urunSablon.ts şablonu) yerleştirir.
// Tahmin yok; her değerin yanında sayfadan kısa kanıt döner. Editör Stüdyo'da tek tek onaylar, kaynak = üretici + bağlantı.
// Giriş: Stüdyo oturumu (Authorization: Bearer). Gizli: GEMINI_API_KEY, GROQ_API_KEY (functions.env).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const yanit = (j: unknown, status = 200) => Response.json(j, { status, headers: CORS });
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/** Sayfayı düz metne çevirir; ürün şeması (JSON-LD) ve tablo satırları korunur */
function metin(html: string) {
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n").slice(0, 6000);
  const govde = html.replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(tr|p|li|h\d|div|dt|dd|br)>/gi, "\n").replace(/<(td|th)[^>]*>/gi, " | ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return (ld ? "ÜRÜN ŞEMASI:\n" + ld + "\n\nSAYFA:\n" : "") + govde.slice(0, 45_000);
}

function jsonOku(s: string) { try { return JSON.parse(s); } catch { const m = s.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } }

async function yz(sistem: string, kullanici: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  let son = "";
  for (const model of ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]) {
    if (!key) break;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(60_000), headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sistem }] }, contents: [{ role: "user", parts: [{ text: kullanici }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
      });
      const g = await r.text();
      if (!r.ok) { son = `${model} ${r.status}`; continue; }
      const t = (JSON.parse(g)?.candidates?.[0]?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
      const v = jsonOku(t); if (v) return v; son = `${model} geçersiz yanıt`;
    } catch { son = `${model} yanıt vermedi`; }
  }
  const gk = Deno.env.get("GROQ_API_KEY");
  if (gk) for (const model of ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", signal: AbortSignal.timeout(45_000), headers: { "Content-Type": "application/json", Authorization: "Bearer " + gk },
        body: JSON.stringify({ model, temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "system", content: sistem }, { role: "user", content: kullanici.slice(0, 24_000) }] }) });
      if (!r.ok) { son += ` | groq ${r.status}`; continue; }
      const v = jsonOku((await r.json())?.choices?.[0]?.message?.content ?? ""); if (v) return v;
    } catch { son += " | groq yanıt vermedi"; }
  }
  throw new Error("Yapay zekâ yanıt vermedi (" + son + ")");
}

const SISTEM = `Sen bir teknoloji sitesinin ürün veritabanı editörüsün. Sana bir ürünün üretici (ya da güvenilir kaynak) sayfasının metni ve doldurulacak özellik adları verilecek.
KURALLAR:
- YALNIZ sayfada açıkça yazan bilgiyi kullan. Tahmin etme, genel bilgini ekleme. Sayfada yoksa o özelliği listeye koyma.
- "value": kısa Türkçe değer, birimiyle (ör. "24,2 MP", "Tam kare (35,9 × 23,9 mm)", "4K 60p (10-bit 4:2:2)", "658 g (pil ve kartla)"). Ondalıkta virgül kullan. Marka/model adlarını çevirme.
- "num": değerin karşılaştırmada kullanılacak tek sayısı (özelliğin birimi cinsinden; ör. "658 g" → 658, "24,2 MP" → 24.2). Sayısal değilse null.
- "kanit": değeri aldığın yerden sayfadaki kısa alıntı (en fazla 120 karakter, sayfadaki diliyle).
- Birden fazla değer varsa (ör. iki pil) ana/varsayılan olanı yaz, diğerini value içinde parantezle belirt.
- Fiyatı yalnız Türkiye fiyatı (TL) açıkça yazıyorsa doldur.
Yanıt yalnız JSON: {"ozellikler":[{"key":"...","value":"...","num":null,"kanit":"..."}], "urun_adi":"sayfadaki tam ürün adı"}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return yanit({ error: "POST gerekli" }, 405);
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const { data: k } = await sb.auth.getUser(jwt);
  if (!k?.user) return yanit({ error: "Stüdyo girişi gerekli" }, 401);
  const b = await req.json().catch(() => ({}));
  const url = String(b.url ?? "").trim(), urun = String(b.urun ?? "").slice(0, 120);
  const ozellikler = (Array.isArray(b.ozellikler) ? b.ozellikler : []).slice(0, 60).map((o: { key?: string; unit?: string }) => ({ key: String(o.key ?? "").slice(0, 80), unit: String(o.unit ?? "").slice(0, 20) })).filter((o: { key: string }) => o.key);
  if (!/^https?:\/\/[^\s]+$/.test(url)) return yanit({ error: "Geçerli bir bağlantı yaz (https://…)" }, 400);
  if (!ozellikler.length) return yanit({ error: "Önce ürünün türünü seçip kaydet; özellik şablonu dolsun." }, 400);
  let html = "";
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8", Accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return yanit({ error: `Sayfa açılmadı (${r.status}). Site botları engelliyor olabilir; üreticinin "teknik özellikler" sayfasını ya da başka bir kaynağı dene.` }, 422);
    html = await r.text();
  } catch { return yanit({ error: "Sayfaya ulaşılamadı (zaman aşımı). Başka bir kaynak dene." }, 422); }
  const m = metin(html);
  if (m.length < 400) return yanit({ error: "Sayfada okunacak metin bulunamadı (sayfa yalnız JavaScript ile yükleniyor olabilir). Üreticinin teknik özellikler sayfasını ya da bir PDF/özellik tablosu bağlantısını dene." }, 422);
  try {
    const v = await yz(SISTEM, `ÜRÜN: ${urun}\nKAYNAK: ${url}\n\nDOLDURULACAK ÖZELLİKLER (ad · birim):\n${ozellikler.map((o: { key: string; unit: string }) => `- ${o.key}${o.unit ? " · " + o.unit : ""}`).join("\n")}\n\nSAYFA METNİ:\n${m}`);
    const adlar = new Set(ozellikler.map((o: { key: string }) => o.key));
    const sonuc = (Array.isArray(v?.ozellikler) ? v.ozellikler : []).filter((o: { key?: string; value?: string }) => o?.key && adlar.has(o.key) && o.value)
      .map((o: { key: string; value: string; num?: unknown; kanit?: string }) => ({ key: o.key, value: String(o.value).slice(0, 120), num: typeof o.num === "number" && isFinite(o.num) ? o.num : null, kanit: String(o.kanit ?? "").slice(0, 160) }));
    return yanit({ ozellikler: sonuc, urun_adi: v?.urun_adi ?? null, kaynak: url });
  } catch (e) { return yanit({ error: (e as Error).message }, 502); }
});
