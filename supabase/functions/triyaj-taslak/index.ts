// Haber Masası: seçilen haberin kaynağını okur; ham Türkçe çeviri ya da Updated standardında haber taslağı üretir.
// Eski "Updated Triyaj" (Kod.gs: taslakHazirla_, ceviriGetir, gorselYaz_) mantığının karşılığı. Taslak Google Docs yerine Stüdyo'da (tr_drafts) durur.
// Çağıran: Stüdyo (giriş yapmış ekip üyesi). Üyelik burada kontrol edilir.
// Gizli bilgi (Supabase Secrets): GEMINI_API_KEY; isteğe bağlı stok fotoğraf anahtarları UNSPLASH_ACCESS_KEY, PIXABAY_API_KEY, PEXELS_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const MODELLER = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]; // sırayla denenir (eski GEMINI_MODELLER)

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

// Eski htmlMetin_: makale gövdesindeki p/h2/h3/li, 40 karakterden kısa parçalar atılır
function htmlMetin(html: string): string {
  let h = String(html || "").replace(/<(script|style|noscript|svg|aside|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ");
  const art = h.match(/<article[\s\S]*<\/article>/i);
  if (art) h = art[0];
  return (h.match(/<(p|h2|h3|li)[^>]*>[\s\S]*?<\/\1>/gi) ?? [])
    .map((p) => coz(p.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 40).join("\n");
}

// Eski makaleCek_ + okuma servisi yedeği (site doğrudan okumayı engellerse)
async function makaleCek(url: string, sinir: number): Promise<string> {
  const zamanli = async (u: string, h: Record<string, string>) => {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000);
    try { const r = await fetch(u, { headers: h, signal: c.signal, redirect: "follow" }); return r.ok ? await r.text() : ""; }
    catch { return ""; } finally { clearTimeout(t); }
  };
  const dogrudan = htmlMetin(await zamanli(url, { "User-Agent": UA, Accept: "text/html" }));
  if (dogrudan.length >= 600) return dogrudan.slice(0, sinir);
  const okunan = await zamanli("https://r.jina.ai/" + url, { Accept: "text/plain" });
  if (okunan.length >= 600) return okunan.slice(0, sinir);
  return dogrudan.slice(0, sinir);
}

function jsonOku(ham: string): Record<string, any> | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  const m = ham.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
  const s = m ? m[0] : ham;
  for (const f of [(x: string) => x, (x: string) => x.replace(/,\s*([}\]])/g, "$1"), (x: string) => x.replace(/[\u0000-\u001F]+/g, " ").replace(/,\s*([}\]])/g, "$1")]) {
    try { return JSON.parse(f(s)); } catch { /* sonraki */ }
  }
  return null;
}

// Eski gemini_: modeller sırayla; geçersiz JSON'da aynı modeli 2 kez daha dener; 429/500/503'te sonraki modele geçer
async function gemini(sistem: string, kullanici: string, modeller: string[]) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY yok (Supabase Secrets)");
  let son = "";
  for (const model of modeller) {
    for (let deneme = 0; deneme < 2; deneme++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistem }] },
          contents: [{ role: "user", parts: [{ text: kullanici }] }],
          generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
        }),
      });
      const govde = await r.text();
      if (r.ok) {
        const j = JSON.parse(govde);
        const metin = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
        const veri = jsonOku(metin);
        if (veri) return { veri, model };
        son = model + " → geçersiz JSON döndü";
        continue;
      }
      son = model + " → " + r.status + ": " + govde.slice(0, 200);
      break;
    }
    if (!/geçersiz JSON|→ (429|500|503)/.test(son)) break;
  }
  throw new Error("Yapay zeka yanıt vermedi. " + son);
}

const TASLAK_SISTEM = `Sen Updated (updated.com.tr) adlı Türkçe teknoloji haber sitesinin haber editörü asistanısın. Sana bir teknoloji haberinin İngilizce kaynak metinleri verilecek. Bunlardan yayına hazırlanacak Türkçe bir haber taslağı yaz.

KURALLAR:
- Çeviri yapma; bilgiyi tamamen kendi cümlelerinle, sade ve akıcı haber Türkçesiyle yeniden yaz. Kaynak cümlesini kopyalama.
- Ters piramit: en önemli bilgi ilk paragrafta. 2-4 adet H2 ara başlık, toplam 250-450 kelime, kısa paragraflar.
- Başlık merak uyandırsın ama her iddiasının kaynakta birebir karşılığı olsun; abartı, "şok", soru-cevap tuzağı yok.
- Doğrulanmamış bilgiyi "iddiaya göre" veya "sızıntıya göre" diye açıkça işaretle.
- Fiyatları kaynaktaki para biriminde ver, TL'ye çevirme.
- Kaynakta olmayan bilgi, rakam veya tarih ekleme. Emin olmadığın şeyi editor_notlari'na yaz.
- Haber resmi değilse (sızıntı, söylenti, mod) dikkat_edilmesi_gerekenler alanını doldur; resmi ise boş dizi bırak.
- editor_sorulari: editörün habere kendi uzmanlığını ve Türkiye bağlamını katabilmesi için 2-3 somut soru (örn. Türkiye'de satış durumu, önceki modelle kendi deneyimi, sahada kullanım).
- dogrulama: editörün yayından önce kontrol etmesi gereken iddialar; her biri için hangi kaynakta geçtiği.
- gorsel: oneri = telif riski olmayan resmi görsel öner (üreticinin basın sayfası veya basın kiti); URL uydurma, sadece nereden bulunacağını yaz. alt_text = Türkçe alt text. aramalar = stok fotoğraf sitesinde aranacak TAM 3 farklı İngilizce arama dizisi, her biri 2-4 kelime: (1) haberin konusunu temsil eden somut ürün kategorisi/sahne (örn. mirrorless camera on tripod), (2) kullanım sahnesi (örn. videographer filming outdoors), (3) detay/atmosfer (örn. camera sensor close up). Marka veya model adı yazma, haberin konusuyla doğrudan ilgili ol, genel "technology" gibi boş kelimelerden kaçın. ai_istem = yapay zekâ görsel üreticisi için 1-2 cümlelik İngilizce istem; gerçek ürünü birebir çizmeye çalışma, konsept veya atmosfer tarif et.
- Teknik terimler gerektiğinde İngilizce kalabilir.

Sadece şu biçimde geçerli JSON döndür:
{"focus_keyword":"","title_tag":"(en fazla 60 karakter)","slug":"turkce-karaktersiz-tireli","meta_description":"(en fazla 155 karakter)","kategori":"","etiketler":["5-7 adet"],"baslik":"","spot":"1-2 cümle","govde":[{"h2":"","paragraflar":[""]}],"dikkat_edilmesi_gerekenler":[""],"editor_sorulari":[""],"dogrulama":[""],"kaynaklar":["kaynak adı"],"gorsel":{"oneri":"","alt_text":"","aramalar":["","",""],"ai_istem":""},"editor_notlari":[""]}`;

const CEVIRI_SISTEM = 'Sen bir çevirmensin. Verilen İngilizce teknoloji haberini paragraf yapısını koruyarak eksiksiz ve sadık biçimde Türkçeye çevir. Yorum, özet veya ekleme yapma. Sadece şu JSON\'u döndür: {"ceviri":"paragraflar arasında \\n\\n olan metin"}';

type Stok = { kaynak: string; url: string; thumb: string; yazar: string; w: number; h: number };
// Eski tr_stok_: Unsplash, Pixabay, Pexels (anahtarı olanlar), her aramadan 3'er
async function stok(q: string): Promise<Stok[]> {
  const out: Stok[] = [];
  const uk = Deno.env.get("UNSPLASH_ACCESS_KEY"), bk = Deno.env.get("PIXABAY_API_KEY"), pk = Deno.env.get("PEXELS_API_KEY");
  const al = async (url: string, h: Record<string, string> = {}) => { try { const r = await fetch(url, { headers: h }); return r.ok ? await r.json() : null; } catch { return null; } };
  const [u, b, p] = await Promise.all([
    uk ? al("https://api.unsplash.com/search/photos?per_page=3&orientation=landscape&query=" + encodeURIComponent(q), { Authorization: "Client-ID " + uk }) : null,
    bk ? al("https://pixabay.com/api/?key=" + encodeURIComponent(bk) + "&per_page=3&orientation=horizontal&image_type=photo&safesearch=true&q=" + encodeURIComponent(q)) : null,
    pk ? al("https://api.pexels.com/v1/search?per_page=3&orientation=landscape&query=" + encodeURIComponent(q), { Authorization: pk }) : null,
  ]);
  (u?.results ?? []).forEach((x: any) => out.push({ kaynak: "Unsplash", url: x.links.html, thumb: x.urls.small, yazar: x.user.name, w: x.width, h: x.height })); // eslint-disable-line @typescript-eslint/no-explicit-any
  (b?.hits ?? []).forEach((x: any) => out.push({ kaynak: "Pixabay", url: x.pageURL, thumb: x.webformatURL, yazar: x.user, w: x.imageWidth, h: x.imageHeight })); // eslint-disable-line @typescript-eslint/no-explicit-any
  (p?.photos ?? []).forEach((x: any) => out.push({ kaynak: "Pexels", url: x.url, thumb: x.src.medium, yazar: x.photographer, w: x.width, h: x.height })); // eslint-disable-line @typescript-eslint/no-explicit-any
  return out;
}

async function isle(sb: ReturnType<typeof createClient>, itemId: number, tur: "ceviri" | "taslak", kullanici: string, ad: string) {
  const { data: it } = await sb.from("tr_items").select("*").eq("id", itemId).single();
  if (!it) return;
  try {
    if (tur === "ceviri") {
      const metin = await makaleCek(it.link, 10000);
      if (metin.length < 300) throw new Error("Kaynak sitenin metni otomatik alınamadı. Linke tıklayıp tarayıcının çeviri özelliğini kullan.");
      const { veri } = await gemini(CEVIRI_SISTEM, metin, ["gemini-3.5-flash-lite", "gemini-3.5-flash"]);
      await sb.from("tr_items").update({ translation: String(veri.ceviri ?? "").slice(0, 45000), work_state: "", work_error: "" }).eq("id", itemId);
      return;
    }

    // İki kaynak: asıl haber + ilk "diğer kaynak"
    const diger = ((it.other_sources ?? []) as { name: string; link: string }[]).filter((o) => o.link && o.link !== it.link);
    const [ana, ek] = await Promise.all([makaleCek(it.link, 12000), diger[0] ? makaleCek(diger[0].link, 6000) : Promise.resolve("")]);
    const metinler = [`KAYNAK 1 (${it.source_name}) ${it.link}\n` + (ana.length >= 300 ? ana : `(Tam metin alınamadı. Başlık: ${it.title})`)];
    if (ek.length >= 300) metinler.push(`KAYNAK 2 ${diger[0].link}\n` + ek);
    const istem = `UYARI: Aşağıdaki özet ve tür etiketi otomatik üretildi, hatalı olabilir. Haberin resmi mi, sızıntı mı, söylenti mi olduğunu ve ürünün piyasada olup olmadığını SADECE kaynak metne bakarak kendin belirle.
Haber özeti (sistemden): ${it.event}
Marka: ${it.brand} · Tür: ${it.kind} · Asıl kaynak: ${it.origin || it.source_name}
Orijinal başlık: ${it.title}

${metinler.join("\n\n---\n\n")}`;

    const { veri: t, model } = await gemini(TASLAK_SISTEM, istem, MODELLER);
    const notlar: string[] = (t.editor_notlari ?? []).filter(Boolean).map(String);
    if (ana.length < 300) notlar.push("Kaynak sitenin tam metni otomatik alınamadı; taslak kısıtlı bilgiyle yazıldı. Kaynağı mutlaka oku.");

    // Gövde: ara başlıklar + "Dikkat edilmesi gerekenler" + editör yorumu yeri
    const parcalar: string[] = [];
    for (const b of t.govde ?? []) {
      if (b?.h2) parcalar.push("## " + b.h2);
      for (const p of b?.paragraflar ?? []) if (p) parcalar.push(String(p));
    }
    const dikkat = (t.dikkat_edilmesi_gerekenler ?? []).filter(Boolean);
    if (dikkat.length) parcalar.push("## Dikkat edilmesi gerekenler", dikkat.map((x: string) => "- " + x).join("\n"));
    parcalar.push("**[EDİTÖR YORUMU: Buraya kendi değerlendirmeni ekle]**");

    // Kaynaklar: ilk yazan + diğerleri + asıl kaynak
    const kaynaklar = [`${it.source_name} — ${it.link}`, ...diger.map((o) => `${o.name} — ${o.link}`)];
    if (it.origin) kaynaklar.push("Asıl kaynak: " + it.origin);

    // Görsel: basın kiti, stok önerileri (3 aramadan sırayla en fazla 6), yapay zekâ istemi
    const g = t.gorsel ?? {};
    let basin: { url: string; kesin: boolean } | null = null;
    if (it.brand) {
      const { data: bk } = await sb.from("tr_press").select("url").ilike("brand", it.brand).limit(1);
      basin = bk?.[0]?.url ? { url: bk[0].url, kesin: true } : { url: "https://www.google.com/search?q=" + encodeURIComponent(it.brand + " official newsroom press images"), kesin: false };
    }
    const aramalar: string[] = [].concat(g.aramalar ?? g.arama ?? []).filter(Boolean).slice(0, 3);
    const sonuc = await Promise.all(aramalar.map(stok));
    const secilen: Stok[] = []; const goruldu = new Set<string>();
    for (let n = 0; n < 4; n++) for (const s of sonuc) { const p = s[n]; if (p && !goruldu.has(p.url)) { goruldu.add(p.url); secilen.push(p); } }

    await sb.from("tr_drafts").insert({
      item_id: itemId, author: kullanici, model,
      title: String(t.baslik ?? ""), spot: String(t.spot ?? ""), body: parcalar.join("\n\n"),
      seo: { focus: t.focus_keyword ?? "", title_tag: t.title_tag ?? "", slug: t.slug ?? "", meta: t.meta_description ?? "", kategori: t.kategori ?? "", etiketler: t.etiketler ?? [] },
      sources: kaynaklar.join("\n"), image_note: String(g.oneri ?? ""), editor_note: notlar.join("\n"),
      questions: (t.editor_sorulari ?? []).filter(Boolean), checks: (t.dogrulama ?? []).filter(Boolean), notes: notlar,
      image: { oneri: g.oneri ?? "", alt_text: g.alt_text ?? "", aramalar, ai_istem: g.ai_istem ?? "", basin, stok: secilen.slice(0, 6), stok_anahtar: !!(Deno.env.get("UNSPLASH_ACCESS_KEY") || Deno.env.get("PIXABAY_API_KEY") || Deno.env.get("PEXELS_API_KEY")) },
    });

    // Taslak hazırlayan haberi henüz kimse almadıysa otomatik alır (eski davranış)
    const zaman = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 16);
    const ek2: Record<string, unknown> = { work_state: "", work_error: "", last_action: `${zaman} · ${ad} · taslak` };
    if (!it.taken_by || !["alindi", "yayinda"].includes(it.status)) Object.assign(ek2, { status: "alindi", taken_by: kullanici, taken_at: new Date().toISOString(), last_dropped_by: null });
    await sb.from("tr_items").update(ek2).eq("id", itemId);
  } catch (e) {
    await sb.from("tr_items").update({ work_state: "hata", work_error: String((e as Error).message ?? e).slice(0, 300) }).eq("id", itemId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return Response.json({ hata: "Giriş gerekli" }, { status: 401, headers: CORS });
  const { data: p } = await sb.from("profiles").select("id,name").eq("id", u.user.id).maybeSingle();
  if (!p) return Response.json({ hata: "Ekip üyesi değil" }, { status: 403, headers: CORS });

  const { item_id, tur } = await req.json().catch(() => ({}));
  if (!item_id || !["ceviri", "taslak"].includes(tur)) return Response.json({ hata: "item_id ve tur (ceviri|taslak) gerekli" }, { status: 400, headers: CORS });

  if (tur === "taslak") {
    const { data: it } = await sb.from("tr_items").select("taken_by,status").eq("id", item_id).single();
    if (it?.taken_by && it.taken_by !== u.user.id && ["alindi", "yayinda"].includes(it.status)) {
      const { data: kim } = await sb.from("profiles").select("name").eq("id", it.taken_by).maybeSingle();
      return Response.json({ hata: "Bu haberi " + (kim?.name ?? "başkası") + " aldı." }, { status: 409, headers: CORS });
    }
  }

  // Kilit: aynı haber için iş sürüyorsa ikinciyi başlatma
  // 3 dakikadan eski iş yarıda kalmış sayılır, yeniden başlatılabilir
  const eski = new Date(Date.now() - 3 * 60_000).toISOString();
  const { data: kilit } = await sb.from("tr_items").update({ work_state: tur, work_error: "", touched: true })
    .eq("id", item_id).or(`work_state.not.in.(ceviri,taslak),updated_at.lt.${eski}`).select("id");
  if (!kilit?.length) return Response.json({ hata: "Bu haber için zaten bir iş sürüyor" }, { status: 409, headers: CORS });

  // Sunucu süre sınırına (yaklaşık 150 sn) takılmadan önce işi kesip hatayı yaz; "yazılıyor"da asılı kalmasın
  const sure = new Promise<void>((r) => setTimeout(async () => {
    await sb.from("tr_items").update({ work_state: "hata", work_error: "Zaman aşımı: kaynak site ya da yapay zekâ çok yavaş yanıt verdi. Tekrar dene." })
      .eq("id", Number(item_id)).eq("work_state", tur);
    r();
  }, 130_000));
  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  EdgeRuntime.waitUntil(Promise.race([isle(sb, Number(item_id), tur, u.user.id, p.name), sure]));
  return Response.json({ basladi: true }, { status: 202, headers: CORS });
});
