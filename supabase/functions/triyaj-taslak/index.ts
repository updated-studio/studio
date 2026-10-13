// Haber Masası: seçilen haberin kaynağını okur; Türkçe çeviri ya da Updated standardında haber taslağı üretir.
// Çağıran: Stüdyo (giriş yapmış ekip üyesi). "Verify JWT" açık kalabilir; ayrıca üyelik burada kontrol edilir.
// Gizli bilgi: GEMINI_API_KEY (Supabase Secrets).
import { createClient } from "npm:@supabase/supabase-js@2";

const UA = "Mozilla/5.0 (compatible; UpdatedHaberMasasi/1.0; +https://www.updated.com.tr)";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—" };
const coz = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);

// Sayfadan haber metnini çıkarır: başlıklar, paragraflar, listeler.
function metinCikar(html: string): string {
  let h = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)[\s\S]*?<\/\1>/gi, " ");
  const art = h.match(/<article[\s\S]*?<\/article>/i);
  if (art && art[0].length > 1500) h = art[0];
  const parca = h.match(/<(h1|h2|h3|p|li|blockquote)[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
  const satirlar = parca.map((p) => {
    const tag = (p.match(/^<(\w+)/) ?? [])[1]?.toLowerCase();
    const t = coz(p.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    if (!t || t.length < 3) return "";
    return tag && /^h\d$/.test(tag) ? `## ${t}` : tag === "li" ? `- ${t}` : t;
  }).filter((t) => t && !/cookie|subscribe|newsletter|sign up|advertisement|related articles/i.test(t));
  return satirlar.join("\n\n").slice(0, 16000);
}

async function gemini(model: string, istem: string, json: boolean): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY yok (Supabase Secrets)");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: istem }] }], generationConfig: { temperature: 0.4, ...(json ? { responseMimeType: "application/json" } : {}) } }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}

const CEVIRI = (baslik: string, metin: string) => `Aşağıdaki teknoloji haberini akıcı, doğal haber Türkçesine çevir. Anlamı değiştirme, ekleme yapma, özetleme. Teknik terimler gerektiğinde İngilizce kalabilir. Ara başlıkları "## " ile koru. Yalnızca çeviriyi döndür.

BAŞLIK: ${baslik}

METİN:
${metin}`;

const TASLAK = (it: Record<string, unknown>, metin: string, digerleri: string) => `Sen Updated (updated.com.tr) için Türkçe teknoloji haberi yazan editörsün. Aşağıdaki kaynak metinden yayına hazır bir haber taslağı üret.

KURALLAR:
- Başlık (H1): Merak uyandırıcı ama her iddiasının kaynakta birebir karşılığı olsun. Abartı, soru tuzağı, "şok" gibi ifadeler yok.
- Spot: 1-2 cümle, haberin özü.
- Gövde: Ters piramit (en önemli bilgi ilk paragrafta). 2-4 adet "## " ara başlık. Toplam 250-450 kelime. Kısa paragraflar. Markdown.
- Gövdenin sonuna şu satırı aynen koy, asla doldurma: [EDİTÖR YORUMU: Buraya kendi değerlendirmeni ekle]
- Resmi olmayan ürün, sızıntı veya söylentide gövdenin sonuna "## Dikkat edilmesi gerekenler" bölümü ekle.
- Doğrulanmamış bilgileri "iddiaya göre" veya "sızıntıya göre" diye açıkça işaretle.
- Fiyatları kaynaktaki para biriminde ver, TL çevirisi yapma.
- Kaynak metinden cümle kopyalama; tamamen kendi cümlelerinle yeniden yaz.
- Kaynakta olmayan bilgi, rakam ya da tarih ekleme. Emin olmadığın noktaları "editor_notu" alanına yaz.
- Dil: sade, akıcı haber Türkçesi.
- Görsel: telif riski olmayan bir görsel öner (üretici basın kiti, resmi görsel) ve alt metin yaz.

HABER: ${it.event || it.title}
KAYNAK: ${it.source_name} — ${it.link}
${digerleri ? "DİĞER KAYNAKLAR: " + digerleri : ""}

KAYNAK METİN:
${metin}

Yalnızca şu JSON nesnesini döndür:
{"seo":{"focus":"","title_tag":"(en fazla 60 karakter)","slug":"(Türkçe karaktersiz, tireli)","meta":"(en fazla 155 karakter)","kategori":"","etiketler":["",""]},"baslik":"","spot":"","govde":"(Markdown)","kaynaklar":"","gorsel":"","editor_notu":""}`;

async function isle(sb: ReturnType<typeof createClient>, itemId: number, tur: "ceviri" | "taslak", kullanici: string) {
  const { data: it } = await sb.from("tr_items").select("*").eq("id", itemId).single();
  if (!it) return;
  try {
    const ayar = Object.fromEntries(((await sb.from("tr_settings").select("key,value")).data ?? []).map((r) => [r.key, r.value]));
    const model = String(ayar.model_taslak ?? "gemini-3.6-flash");
    const r = await fetch(it.link, { headers: { "User-Agent": UA, Accept: "text/html" } });
    if (!r.ok) throw new Error(`Kaynak sayfa açılmadı (HTTP ${r.status}). Site botları engelliyor olabilir.`);
    const metin = metinCikar(await r.text());
    if (metin.length < 300) throw new Error("Kaynak sayfadan haber metni okunamadı.");

    if (tur === "ceviri") {
      const ceviri = (await gemini(model, CEVIRI(it.title, metin), false)).trim();
      await sb.from("tr_items").update({ translation: ceviri, work_state: "", work_error: "" }).eq("id", itemId);
    } else {
      const digerleri = (it.other_sources ?? []).map((o: { name: string; link: string }) => `${o.name}: ${o.link}`).join(", ");
      const ham = await gemini(model, TASLAK(it, metin, digerleri), true);
      // Önce olduğu gibi oku; model metne çıplak kontrol karakteri koyduysa onları boşluğa çevirip yeniden dene.
      let t: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { t = JSON.parse(ham); } catch { t = JSON.parse(ham.replace(/[\u0000-\u001F]+/g, " ")); }
      await sb.from("tr_drafts").insert({
        item_id: itemId, author: kullanici, model,
        title: String(t.baslik ?? ""), spot: String(t.spot ?? ""), body: String(t.govde ?? ""),
        seo: t.seo ?? {}, sources: String(t.kaynaklar ?? it.source_name), image_note: String(t.gorsel ?? ""), editor_note: String(t.editor_notu ?? ""),
      });
      await sb.from("tr_items").update({ work_state: "", work_error: "" }).eq("id", itemId);
    }
  } catch (e) {
    await sb.from("tr_items").update({ work_state: "hata", work_error: String((e as Error).message ?? e).slice(0, 300) }).eq("id", itemId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(url, serviceKey());
  const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return Response.json({ hata: "Giriş gerekli" }, { status: 401, headers: CORS });
  const { data: p } = await sb.from("profiles").select("id").eq("id", u.user.id).maybeSingle();
  if (!p) return Response.json({ hata: "Ekip üyesi değil" }, { status: 403, headers: CORS });

  const { item_id, tur } = await req.json().catch(() => ({}));
  if (!item_id || !["ceviri", "taslak"].includes(tur)) return Response.json({ hata: "item_id ve tur (ceviri|taslak) gerekli" }, { status: 400, headers: CORS });

  // Kilit: aynı haber için iş sürüyorsa ikinciyi başlatma (iki kişi aynı anda basarsa)
  const { data: kilit } = await sb.from("tr_items").update({ work_state: tur, work_error: "", touched: true })
    .eq("id", item_id).not("work_state", "in", "(ceviri,taslak)").select("id");
  if (!kilit?.length) return Response.json({ hata: "Bu haber için zaten bir iş sürüyor" }, { status: 409, headers: CORS });

  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  EdgeRuntime.waitUntil(isle(sb, Number(item_id), tur, u.user.id));
  return Response.json({ basladi: true }, { status: 202, headers: CORS });
});
