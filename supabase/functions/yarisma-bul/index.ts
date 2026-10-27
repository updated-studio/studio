// Yarışma tarayıcısı (26 Ekim 2026, offocus yol haritası 3): yapay zekâ Google aramasıyla önümüzdeki aylarda son başvurusu olan
// fotoğraf, kısa film ve video yarışmalarını bulur; panele "öneri" olarak bırakır (site /api/yarisma/oneri, x-studio-key).
// Ekip Stüdyo → Site → Yarışmalar'da resmi sayfadan kontrol edip "Yayında" yapar. Haftada bir (göç 0038) ya da Stüdyo'dan elle.
// Kötüye kullanım: oturumsuz çağrı yalnız son başarılı tarama 6 günden eskiyse çalışır; her durumda en çok saatte bir.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const yanit = (j: unknown, status = 200) => Response.json(j, { status, headers: CORS });
const PANEL = Deno.env.get("PANEL_URL") || "https://panel.updated.com.tr";
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
function jsonOku(s: string) { try { return JSON.parse(s); } catch { const m = s.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } }

const SISTEM = `Sen bir fotoğraf ve video sitesinin yarışma takvimi editörüsün. Görevin İNTERNETTE ARAYARAK son başvuru tarihi henüz geçmemiş yarışmaları bulmak.
ARANACAKLAR:
- Türkiye'deki fotoğraf yarışmaları (TFSF onaylı yarışmalar, belediyeler, üniversiteler, dernekler, kurumlar), kısa film ve video yarışmaları/festivalleri.
- Türkiye'den katılıma açık önemli uluslararası yarışmalar (ör. FIAP/PSA onaylı salonlar, büyük fotoğraf ödülleri, kısa film festivalleri).
KURALLAR:
- Yalnız son başvuru tarihi BUGÜNDEN SONRA ve en geç 150 gün içinde olanlar.
- Her yarışmanın bilgisi düzenleyenin RESMİ sayfasından ya da şartnamesinden olmalı; tarih ve bağlantıyı orada doğrula. Emin olmadığını listeye koyma.
- "baglanti": yarışmanın resmi sayfası/şartnamesi (https://…). "kaynak": bilgiyi bulduğun sayfa.
- "aciklama": KENDİ cümlelerinle 1-2 kısa Türkçe cümle (kimler katılabilir, kaç eser, önemli koşul). Şartnameden kopyalama.
- "tur": fotograf | kisa-film | video | karma. "kapsam": turkiye | uluslararasi. Tarihler YYYY-AA-GG.
- "odul": kısa (ör. "Birinciye 30.000 TL"); "ucret": katılım ücreti varsa (ör. "250 TL", "25 USD"); ücretsizse "ucretsiz": true.
- En fazla 15 yarışma. Zaten bilinenler listesindekileri tekrar verme.
Yanıtı YALNIZ şu JSON olarak ver:
{"yarismalar":[{"ad":"...","duzenleyen":"...","tur":"fotograf","kapsam":"turkiye","sonTarih":"2026-12-01","sonucTarihi":null,"ucretsiz":true,"ucret":null,"odul":"...","konu":"...","baglanti":"https://...","kaynak":"https://...","aciklama":"..."}]}`;

/** Gemini anahtarları: önce sunucudaki ana anahtar; kotası dolunca Stüdyo → Bağlantı anahtarları'ndaki yedek (27 Ekim 2026).
 *  Kota proje başına sayılır: yedek anahtar başka bir Google hesabının ya da projesinin olmalı. */
async function geminiAnahtarlari(sb: ReturnType<typeof createClient>): Promise<string[]> {
  const l = [Deno.env.get("GEMINI_API_KEY") ?? ""];
  const { data } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", "gemini_yedek").maybeSingle();
  if (data?.deger) l.push(String(data.deger));
  return l.filter(Boolean);
}

async function ara(sb: ReturnType<typeof createClient>, bilinen: string[]) {
  const anahtarlar = await geminiAnahtarlari(sb);
  if (!anahtarlar.length) throw new Error("GEMINI_API_KEY yok");
  const bugun = new Date().toISOString().slice(0, 10);
  const istem = `BUGÜN: ${bugun}\nZATEN BİLİNENLER:\n${bilinen.slice(0, 120).map((x) => "- " + x).join("\n") || "(yok)"}`;
  let son = "";
  for (const [ai, key] of anahtarlar.entries()) for (const model of ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(120_000), headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SISTEM }] }, contents: [{ role: "user", parts: [{ text: istem }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2 } }),
      });
      const g = await r.text();
      if (!r.ok) { son = `${ai ? "yedek anahtar · " : ""}${model} ${r.status} ${g.slice(0, 120)}`; continue; }
      const c = JSON.parse(g)?.candidates?.[0];
      const v = jsonOku((c?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join(""));
      if (!v?.yarismalar) { son = `${model} geçersiz yanıt`; continue; }
      return v.yarismalar as Record<string, unknown>[];
    } catch { son = `${model} yanıt vermedi`; }
  }
  throw new Error("Yapay zekâ yanıt vermedi (" + son + ")");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return yanit({ error: "POST gerekli" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: k } = jwt ? await sb.auth.getUser(jwt) : { data: null };
  const kisi = k?.user ?? null;
  // Zamanlayıcı her gün çağırır; son BAŞARILI tarama 6 günden yeniyse atlar (yapay zekâ kotası dolduğu gün ertesi gün yeniden dener)
  const { data: sonTarama } = await sb.from("yarisma_tarama").select("at").order("at", { ascending: false }).limit(1);
  const { data: sonBasarili } = await sb.from("yarisma_tarama").select("at").is("hata", null).order("at", { ascending: false }).limit(1);
  const once = sonTarama?.[0]?.at ? Date.now() - +new Date(sonTarama[0].at) : Infinity;
  const basariliOnce = sonBasarili?.[0]?.at ? Date.now() - +new Date(sonBasarili[0].at) : Infinity;
  // Oturumsuz çağrı yalnız sunucu içindeki zamanlayıcıdan (functions:9000, X-Forwarded-For'suz) kabul edilir (27 Ekim 2026)
  if (!kisi && req.headers.get("x-forwarded-for")) return yanit({ error: "Stüdyo girişi gerekli" }, 401);
  if (!kisi && (basariliOnce < 6 * 864e5 || once < 3600e3)) return yanit({ atlandi: "Son tarama yeni" });
  if (kisi && once < 3600e3) return yanit({ error: "Son tarama bir saatten yeni; biraz sonra yeniden dene." }, 429);

  // Kayıt hemen yazılır (aynı anda ikinci tarama başlamasın); tarama arka planda sürer, sonuç kayda ve bildirime düşer
  const { data: satir } = await sb.from("yarisma_tarama").insert({ kim: kisi?.email ?? "zamanlayici" }).select("id").single();
  EdgeRuntime.waitUntil(tara(sb, satir?.id));
  return yanit({ basladi: true, bilgi: "Tarama başladı; birkaç dakika içinde öneriler Site → Yarışmalar'a düşer." });
});

async function tara(sb: ReturnType<typeof createClient>, id?: number) {
  const kayit = { eklenen: 0, hata: null as string | null };
  try {
    const r = await fetch(`${PANEL}/api/yarismalar?limit=300&depth=0&where[sonTarih][greater_than]=${new Date().toISOString()}`);
    const bilinen: string[] = r.ok ? (await r.json()).docs.map((d: { ad: string; sonTarih: string }) => `${d.ad} (${String(d.sonTarih).slice(0, 10)})`) : [];
    const bulunan = await ara(sb, bilinen);
    const p = await fetch(`${PANEL}/api/yarisma/oneri`, { method: "POST", headers: { "Content-Type": "application/json", "x-studio-key": Deno.env.get("STUDIO_IMPORT_KEY") ?? "" }, body: JSON.stringify({ yarismalar: bulunan }) });
    if (!p.ok) throw new Error(`Panel ${p.status}`);
    const s = await p.json();
    kayit.eklenen = s.eklenen?.length ?? 0;
    if (kayit.eklenen) {
      const { data: kisiler } = await sb.from("profiles").select("id").in("site_rol", ["admin", "yayin-yonetmeni", "editor"]);
      if (kisiler?.length) await sb.from("notifications").insert(kisiler.map((x: { id: string }) => ({ user_id: x.id, body: `${kayit.eklenen} yeni yarışma önerisi var: resmi sayfadan kontrol edip "Yayında" yap.`, link: "#/site?bolum=yarismalar" })));
    }
  } catch (e) {
    kayit.hata = String((e as Error).message ?? e).slice(0, 300);
  }
  if (id) await sb.from("yarisma_tarama").update(kayit).eq("id", id);
}
