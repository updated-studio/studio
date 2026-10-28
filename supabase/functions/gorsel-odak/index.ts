// Görselde konunun yeri (28 Ekim 2026): Stüdyo'daki "Odağı otomatik bul" düğmesi. Görsel indirilir, Gemini'ye "haberin konusu nerede?"
// diye sorulur; cevap soldan/üstten yüzde olarak döner. Stüdyo bunu paneldeki görselin odak noktası yapar (focalX/focalY);
// panel küçük boyutları, site de kendi kırpmalarını bu noktaya göre yapar. Yalnız Stüdyo üyesi çağırır. Anahtar: GEMINI_API_KEY,
// kotası dolunca Bağlantı anahtarları'ndaki yedek Google anahtarı.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const yanit = (j: unknown, status = 200) => Response.json(j, { status, headers: CORS });
const MODELLER = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"];
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
const SISTEM = `Sana bir haber görseli verilecek. Görselin ANA KONUSUNU (ürün, cihaz, araç, nesne; kişi haberiyse kişi) bul ve konunun merkezinin yerini yüzde olarak ver: x soldan, y üstten, 0-100 arası tam sayı.
Görsel sitede kenarlardan kırpılacak; bu nokta görünür kalacak. Konu birden fazlaysa en önemlisini ya da grubun ortasını ver. Belirgin konu yoksa 50/50.
Sadece şu JSON'u döndür: {"x": 50, "y": 50, "neden": "en çok 8 kelime"}`;

async function gemini(anahtar: string, model: string, mime: string, b64: string) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 25_000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": anahtar }, signal: c.signal,
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SISTEM }] }, contents: [{ role: "user", parts: [{ text: "Görsel:" }, { inline_data: { mime_type: mime, data: b64 } }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }),
    });
    if (!r.ok) return { durum: r.status };
    const j = await r.json();
    const metin = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    return { durum: 200, veri: JSON.parse(metin.replace(/^```json\s*|```$/g, "").trim()) };
  } catch { return { durum: 0 }; } finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return yanit({ hata: "POST gerekli" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: k } = jwt ? await sb.auth.getUser(jwt) : { data: null };
  if (!k?.user) return yanit({ hata: "Stüdyo girişi gerekli" }, 401);
  const b = await req.json().catch(() => ({}));
  const url = String(b.url ?? "");
  if (!/^https:\/\//.test(url)) return yanit({ hata: "Görsel adresi gerekli" }, 400);
  // Görsel: yalnız kendi panelimizden (medya kovası); küçük boyut yeter
  let mime = "", b64 = "";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    mime = (r.headers.get("content-type") ?? "").split(";")[0];
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(mime)) return yanit({ hata: `Görsel indirilemedi (${r.status})` }, 502);
    const u = new Uint8Array(await r.arrayBuffer());
    if (u.byteLength > 2_500_000) return yanit({ hata: "Görsel çok büyük" }, 413);
    let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    b64 = btoa(s);
  } catch (e) { return yanit({ hata: "Görsel indirilemedi: " + String((e as Error).message ?? e).slice(0, 80) }, 502); }
  const anahtarlar = [Deno.env.get("GEMINI_API_KEY") ?? ""];
  const { data: y } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", "gemini_yedek").maybeSingle();
  if (y?.deger) anahtarlar.push(String(y.deger));
  for (const anahtar of anahtarlar.filter(Boolean)) {
    for (const model of MODELLER) {
      const r = await gemini(anahtar, model, mime, b64);
      if (r.durum === 200 && r.veri) {
        const yz = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50; };
        return yanit({ x: yz(r.veri.x), y: yz(r.veri.y), neden: String(r.veri.neden ?? "").slice(0, 80) });
      }
      if (r.durum === 429) break; // bu anahtarın kotası dolu: yedek anahtara geç
    }
  }
  return yanit({ hata: "Yapay zekâ yanıt vermedi (kota dolmuş olabilir)" }, 503);
});
