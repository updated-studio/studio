// Gemini anahtarlarını dene (30 Ekim 2026, Stüdyo → Bağlantı anahtarları → "Anahtarları dene"): havuzdaki her anahtara (göç 0052)
// çok küçük bir istek gönderir, durumu yazar (çalışıyor / kota dolu / geçersiz). Yalnız yönetici çağırır. Anahtarlar yanıtta dönmez.
import { createClient } from "npm:@supabase/supabase-js@2";
import { anahtarHatasi } from "./anahtar.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const yanit = (j: unknown, status = 200) => Response.json(j, { status, headers: CORS });
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
const MODELLER = ["gemini-3.5-flash-lite", "gemini-3.5-flash"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return yanit({ hata: "POST gerekli" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: k } = jwt ? await sb.auth.getUser(jwt) : { data: null };
  if (!k?.user) return yanit({ hata: "Stüdyo girişi gerekli" }, 401);
  const { data: p } = await sb.from("profiles").select("is_admin").eq("id", k.user.id).maybeSingle();
  if (!p?.is_admin) return yanit({ hata: "Yalnız yöneticiler" }, 403);
  const { data: liste, error } = await sb.from("gemini_anahtarlari").select("id,deger,etiket").order("sira").order("id");
  if (error) return yanit({ hata: "Anahtar listesi okunamadı (göç 0052 uygulanmış mı?)" }, 500);
  const ana = Deno.env.get("GEMINI_API_KEY") ?? "";
  const sonuc: { id: number; durum: string; not: string }[] = [];
  for (const a of liste ?? []) {
    const key = a.deger || ana;
    let durum = "gecersiz", not = "Anahtar yok";
    if (key) for (const model of MODELLER) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Sadece 'tamam' yaz." }] }], generationConfig: { maxOutputTokens: 8, temperature: 0 } }),
        });
        const g = await r.text();
        if (r.ok) { durum = "calisiyor"; not = model; break; }
        const ah = anahtarHatasi(r.status, g);
        durum = ah ?? "bilinmiyor";
        not = `${model} ${r.status}: ${(g.match(/"message":\s*"([^"]{0,160})/)?.[1] ?? "").replaceAll(key, "…")}`;
        if (ah === "gecersiz") break;
      } catch { durum = "bilinmiyor"; not = `${model} yanıt vermedi`; }
    }
    const simdi = new Date().toISOString();
    await sb.from("gemini_anahtarlari").update({ durum, durum_zaman: simdi, son_hata: durum === "calisiyor" ? null : not.slice(0, 300), ...(durum === "calisiyor" ? { son_kullanim: simdi } : {}) }).eq("id", a.id);
    sonuc.push({ id: a.id, durum, not });
  }
  return yanit({ sonuc });
});
