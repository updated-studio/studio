// Instagram Reels (27 Ekim 2026): @updated.tr'nin son Reels'lerini sitedeki "Son videolar" sütunu için çeker.
// - Anahtar: Stüdyo → Bağlantı anahtarları (tablo baglanti_anahtarlari, ad "instagram"); yalnız bu fonksiyon okur.
// - POST: zamanlayıcı (sunucu içinden, 6 saatte bir) ya da Stüdyo yöneticisi çağırır. Anahtar 7 günden eskiyse yenilenir
//   (Instagram uzun süreli anahtarı 60 gün geçerli; yenilenmezse ölür). Kapaklar "instagram" kovasına kopyalanır.
// - GET: herkese açık liste (site derlemesi okur); anahtar ya da gizli bilgi içermez.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const yanit = (j: unknown, status = 200) => Response.json(j, { status, headers: CORS });
const GRAPH = "https://graph.instagram.com";
const KOVA = "instagram";
const ADRES = Deno.env.get("PUBLIC_SUPABASE_URL") || "https://panel.updated.com.tr";
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
type Sb = ReturnType<typeof createClient>;
type Medya = { id: string; caption?: string; media_type?: string; media_product_type?: string; permalink: string; thumbnail_url?: string; media_url?: string; timestamp: string };

async function ekYaz(sb: Sb, ek: Record<string, unknown>) {
  const { data } = await sb.from("baglanti_anahtarlari").select("ek").eq("ad", "instagram").maybeSingle();
  await sb.from("baglanti_anahtarlari").update({ ek: { ...((data?.ek as Record<string, unknown>) ?? {}), ...ek } }).eq("ad", "instagram");
}

async function cek(sb: Sb) {
  const { data: a } = await sb.from("baglanti_anahtarlari").select("deger,ek,updated_at").eq("ad", "instagram").maybeSingle();
  if (!a?.deger) return { hata: "Instagram anahtarı girilmemiş (Stüdyo → Bağlantı anahtarları)." };
  let anahtar = String(a.deger);
  const ek = (a.ek ?? {}) as Record<string, string>;
  // Yenileme: anahtar en az 24 saatlik olmalı; 7 günde bir yenilenir
  const yas = Date.now() - Date.parse(ek.yenilendi || a.updated_at);
  if (yas > 7 * 864e5 || !ek.bitis) {
    const r = await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(anahtar)}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.access_token) {
      anahtar = j.access_token;
      await sb.from("baglanti_anahtarlari").update({ deger: anahtar, son4: anahtar.slice(-4) }).eq("ad", "instagram");
      await ekYaz(sb, { yenilendi: new Date().toISOString(), bitis: new Date(Date.now() + (Number(j.expires_in) || 5184000) * 1000).toISOString() });
    } else if (yas > 864e5) await ekYaz(sb, { yenileme_hatasi: String(j?.error?.message ?? r.status).slice(0, 200) });
  }
  const ben = await fetch(`${GRAPH}/me?fields=username&access_token=${encodeURIComponent(anahtar)}`).then((r) => r.json()).catch(() => ({}));
  if (ben?.error) { const h = "Instagram anahtarı geçersiz: " + String(ben.error.message ?? "").slice(0, 160); await ekYaz(sb, { hata: h }); return { hata: h }; }
  const r = await fetch(`${GRAPH}/me/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp&limit=40&access_token=${encodeURIComponent(anahtar)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const h = "Instagram listesi alınamadı: " + String(j?.error?.message ?? r.status).slice(0, 160); await ekYaz(sb, { hata: h }); return { hata: h }; }
  const reels = ((j.data ?? []) as Medya[]).filter((m) => m.media_product_type === "REELS" || m.media_type === "VIDEO").slice(0, 12);
  const { data: var_ } = await sb.from("instagram_reels").select("id,kapak").in("id", reels.map((m) => m.id));
  const kapakli = new Map((var_ ?? []).map((x) => [x.id as string, x.kapak as string | null]));
  for (const m of reels) {
    let kapak = kapakli.get(m.id) ?? null;
    if (!kapak && m.thumbnail_url) {
      const g = await fetch(m.thumbnail_url).catch(() => null);
      if (g?.ok) {
        const yol = `${m.id}.jpg`;
        const { error } = await sb.storage.from(KOVA).upload(yol, new Uint8Array(await g.arrayBuffer()), { contentType: g.headers.get("content-type") || "image/jpeg", upsert: true });
        if (!error) kapak = `${ADRES}/storage/v1/object/public/${KOVA}/${yol}`;
      }
    }
    await sb.from("instagram_reels").upsert({ id: m.id, aciklama: (m.caption ?? "").slice(0, 300), baglanti: m.permalink, kapak, zaman: m.timestamp, updated_at: new Date().toISOString() });
  }
  await ekYaz(sb, { hesap: ben.username ?? "", son_cekim: new Date().toISOString(), hata: "" });
  return { reels: reels.length, hesap: ben.username };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  if (req.method === "GET") {
    const { data } = await sb.from("instagram_reels").select("aciklama,baglanti,kapak,zaman").not("kapak", "is", null).order("zaman", { ascending: false }).limit(12);
    return Response.json({ reels: data ?? [] }, { headers: { ...CORS, "Cache-Control": "public, max-age=600" } });
  }
  if (req.method !== "POST") return yanit({ hata: "GET ya da POST" }, 405);
  // Dışarıdan (Caddy üzerinden) gelen çağrı yönetici olmalı; zamanlayıcı sunucu içinden çağırır
  if (req.headers.get("x-forwarded-for")) {
    const { data: u } = await sb.auth.getUser((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
    const { data: p } = u?.user ? await sb.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle() : { data: null };
    if (!p?.is_admin) return yanit({ hata: "Yalnız yöneticiler" }, 401);
  }
  try { return yanit(await cek(sb)); } catch (e) { return yanit({ hata: String((e as Error).message ?? e).slice(0, 300) }, 500); }
});
