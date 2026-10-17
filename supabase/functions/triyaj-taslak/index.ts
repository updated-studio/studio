// Haber Masası: seçilen haberin kaynağını okur; ham Türkçe çeviri ya da Updated standardında haber taslağı üretir.
// Eski "Updated Triyaj" (Kod.gs: taslakHazirla_, ceviriGetir, gorselYaz_) mantığının karşılığı. Taslak Google Docs yerine Stüdyo'da (tr_drafts) durur.
// Çağıranlar:
//   - Stüdyo (giriş yapmış ekip üyesi): {item_id, tur} taslak/çeviri; {wp:true, draft_id} WordPress'e gönder; {wp_dene:true} bağlantı denemesi (yönetici).
//   - Zamanlanmış görev (10 dk'da bir, tr_oto_kick): {oto:true} en güçlü haberden birine otomatik taslak + WordPress'e taslak.
// Gizli bilgi (Supabase Secrets): GEMINI_API_KEY; WordPress için WP_URL, WP_USER, WP_APP_PASSWORD;
// isteğe bağlı stok fotoğraf anahtarları UNSPLASH_ACCESS_KEY, PIXABAY_API_KEY, PEXELS_API_KEY.
// Dosyalar: uslup.ts (yazım üslubu, insanlaştırma), puan.ts (öncelik puanı, ekranla ortak), secim.ts (otomatik taslak: haber ve editör seçimi), gorsel.ts (öne çıkan görsel), html.ts (Markdown → HTML, ekranla ortak), wordpress.ts (WordPress REST).
// Panelden yayınlarken yedi dosya birlikte yüklenir. "Verify JWT" kapalı olmalı (üyelik kodda kontrol edilir; zamanlanmış görev anahtarsız çağırır).
import { createClient } from "npm:@supabase/supabase-js@2";
import { INSANLASTIR_SISTEM, USLUP_VARSAYILAN, yapayIzler } from "./uslup.ts";
import { ayniHaber, editorSec, turAdaylari, OTO_VARSAYILAN, type Aday, type OtoAyar, type Profil } from "./secim.ts";
import { wpAyar, wpDene, wpGonder, type Kategori } from "./wordpress.ts";
import { adayListesi, commons, kaynakDurumu, kuralSecim, openverse, resmiGorsel, SECIM_SISTEM, stokFoto, type GorselAday } from "./gorsel.ts";

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
// Toplam süre bütçesi: sunucu ~150 sn'de işi öldürür, ondan önce bitirip hata yazmalıyız
const BUTCE_MS = 115_000;

async function gemini(sistem: string, kullanici: string, modeller: string[], bitis = Date.now() + BUTCE_MS) {
  const kalan = () => bitis - Date.now();
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY yok (Supabase Secrets)");
  let son = "";
  let dusunme = true; // "düşünme" kısık: yanıt çok daha hızlı gelir; model desteklemezse kapatılır
  for (const model of modeller) {
    for (let deneme = 0; deneme < 2; deneme++) {
      const sure = Math.min(50_000, kalan());
      if (sure < 8_000) throw new Error("Zaman aşımı: yapay zekâ yavaş yanıt verdi. Tekrar dene. " + son);
      const c = new AbortController(); const t = setTimeout(() => c.abort(), sure);
      let r!: Response, govde = "";
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST", signal: c.signal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sistem }] },
            contents: [{ role: "user", parts: [{ text: kullanici }] }],
            generationConfig: { temperature: 0.4, responseMimeType: "application/json", ...(dusunme ? { thinkingConfig: { thinkingLevel: "low" } } : {}) },
          }),
        });
        govde = await r.text();
      } catch {
        son = model + " → " + Math.round(sure / 1000) + " sn içinde yanıt vermedi";
        break; // aynı modeli bekletmeden sonrakine geç
      } finally { clearTimeout(t); }
      if (r.ok) {
        const j = JSON.parse(govde);
        const metin = (j?.candidates?.[0]?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
        const veri = jsonOku(metin);
        if (veri) return { veri, model };
        son = model + " → geçersiz JSON döndü";
        continue;
      }
      if (r.status === 400 && dusunme && /thinking/i.test(govde)) { dusunme = false; deneme--; continue; }
      son = model + " → " + r.status + ": " + govde.slice(0, 200);
      break;
    }
    if (!/geçersiz JSON|yanıt vermedi|→ (429|500|503)/.test(son)) break;
  }
  // Gemini kotası dolduysa ya da yanıt vermiyorsa aynı işi Groq'a yaptır (GROQ_API_KEY, Supabase Secrets)
  if (Deno.env.get("GROQ_API_KEY") && /geçersiz JSON|yanıt vermedi|→ (429|500|503)/.test(son)) {
    try { return await groq(sistem, kullanici, bitis); }
    catch (e) { son += " | Yedek (Groq): " + String((e as Error).message ?? e).slice(0, 200); }
  }
  throw new Error("Yapay zeka yanıt vermedi. " + son);
}

// Groq (OpenAI uyumlu). Modeller sırayla denenir; her modelin kotası ayrıdır. Model kalkmışsa (404/400) sonrakine geçer.
const GROQ_MODELLER = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b", "llama-3.1-8b-instant"];
async function groq(sistem: string, kullanici: string, bitis: number) {
  let son = "";
  for (const model of GROQ_MODELLER) {
    const sure = Math.min(40_000, bitis - Date.now());
    if (sure < 6_000) break;
    const c = new AbortController(); const t = setTimeout(() => c.abort(), sure);
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: c.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + Deno.env.get("GROQ_API_KEY") },
        body: JSON.stringify({ model, temperature: 0.4, response_format: { type: "json_object" }, messages: [{ role: "system", content: sistem }, { role: "user", content: kullanici.slice(0, 24_000) }] }),
      });
      const govde = await r.text();
      if (!r.ok) { son = model + " → " + r.status + ": " + govde.slice(0, 120); continue; }
      const veri = jsonOku(JSON.parse(govde)?.choices?.[0]?.message?.content ?? "");
      if (veri) return { veri, model: "groq/" + model };
      son = model + " → geçersiz JSON";
    } catch { son = model + " → yanıt vermedi"; }
    finally { clearTimeout(t); }
  }
  throw new Error(son || "süre yetmedi");
}

// Üslup (uslup.ts / Ayarlar → Yazım üslubu) istemin içine eklenir
const taslakSistem = (uslup: string) => `Sen Updated (updated.com.tr) adlı Türkçe teknoloji haber sitesinin haber editörüsün. Sana bir teknoloji haberinin İngilizce kaynak metinleri verilecek. Bunlardan yayına hazırlanacak, sitenin kendi üslubuyla yazılmış Türkçe bir haber taslağı yaz.

KURALLAR:
- Çeviri yapma; bilgiyi tamamen kendi cümlelerinle, sade ve akıcı haber Türkçesiyle yeniden yaz. Kaynak cümlesini kopyalama.
- Ters piramit: en önemli bilgi ilk paragrafta. 3-4 adet H2 ara başlık, toplam 300-450 kelime, kısa paragraflar.
- Başlık merak uyandırsın ama her iddiasının kaynakta birebir karşılığı olsun; abartı, "şok", tık tuzağı yok.
- Doğrulanmamış bilgiyi "iddiaya göre" veya "sızıntıya göre" diye açıkça işaretle.
- Fiyatları kaynaktaki para biriminde ver, TL'ye çevirme.
- Kaynakta olmayan bilgi, rakam veya tarih ekleme. Emin olmadığın şeyi editor_notlari'na yaz.
- Haber resmi değilse (sızıntı, söylenti, mod) dikkat_edilmesi_gerekenler alanını doldur; resmi ise boş dizi bırak.
- editor_sorulari: editörün habere kendi uzmanlığını ve Türkiye bağlamını katabilmesi için 2-3 somut soru (örn. Türkiye'de satış durumu, önceki modelle kendi deneyimi, sahada kullanım).
- dogrulama: editörün yayından önce kontrol etmesi gereken iddialar; her biri için hangi kaynakta geçtiği.
- gorsel: oneri = telif riski olmayan resmi görsel öner (üreticinin basın sayfası veya basın kiti); URL uydurma, sadece nereden bulunacağını yaz. alt_text = Türkçe alt text. aramalar = stok fotoğraf sitesinde aranacak TAM 3 farklı İngilizce arama dizisi, her biri 2-4 kelime: (1) haberin konusunu temsil eden somut ürün kategorisi/sahne (örn. mirrorless camera on tripod), (2) kullanım sahnesi (örn. videographer filming outdoors), (3) detay/atmosfer (örn. camera sensor close up). Marka veya model adı yazma, haberin konusuyla doğrudan ilgili ol, genel "technology" gibi boş kelimelerden kaçın. ai_istem = yapay zekâ görsel üreticisi için 1-2 cümlelik İngilizce istem; gerçek ürünü birebir çizmeye çalışma, konsept veya atmosfer tarif et.
- Teknik terimler gerektiğinde İngilizce kalabilir.
- dikkat_edilmesi_gerekenler editöre gider, metne girmez; metnin kendisinde de doğrulanmamış bilgiyi açıkça işaretle.

SİTENİN ÜSLUBU (buna birebir uy):
${uslup}

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

type Sb = ReturnType<typeof createClient>;
type IsSecenek = { oto?: boolean };

const istanbulGun = () => new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 10);
const istanbulZaman = () => new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 16);

/** Sitedeki kategoriler (WordPress'ten okunmuş ve saklanmış liste); yoksa boş. Yapay zekâ kategoriyi bu listeden seçer. */
async function kayitliKategoriler(sb: Sb): Promise<Kategori[]> {
  const { data } = await sb.from("tr_settings").select("value").eq("key", "wp_kategoriler").maybeSingle();
  return ((data?.value as { liste?: Kategori[] } | null)?.liste ?? []).filter((k) => k.slug !== "uncategorized");
}

/** Yapay zekânın önerdiği kategori sitede yoksa: listeden en uygununu ucuz modelle seçtir. */
const kategoriSec = async (baslik: string, oneri: string, liste: Kategori[]) => {
  const { veri } = await gemini(
    'Bir Türkçe teknoloji haberi için verilen kategori listesinden en uygun TEK kategoriyi seç. Listede olmayan ad yazma. Sadece {"kategori":"listedeki ad aynen"} döndür.',
    `Haber başlığı: ${baslik}\nÖnerilen: ${oneri}\nKategoriler: ${liste.map((k) => k.name).join(" | ")}`,
    ["gemini-3.5-flash-lite", "gemini-3.5-flash"], Date.now() + 25_000);
  return String(veri.kategori ?? "");
};

/** Öne çıkan görsel adayları toplanır, yapay zekâ en doğrusunu seçer. Süre azsa ya da hata olursa görselsiz devam edilir. */
async function gorselSec(sb: Sb, it: { brand: string; product: string; title: string; link: string; other_sources: { name: string; link: string }[] | null }, baslik: string, aramalar: string[], bitis: number) {
  const bos = { secilen: null as GorselAday | null, adaylar: [] as GorselAday[], neden: "" };
  try {
    if (bitis - Date.now() < 45_000) return { ...bos, neden: "Süre yetmedi, görsel seçilmedi." };
    const urun = [it.brand, it.product].filter(Boolean).join(" ").trim();
    const anahtar = { pexels: Deno.env.get("PEXELS_API_KEY"), pixabay: Deno.env.get("PIXABAY_API_KEY") };
    const { data: bk } = it.brand ? await sb.from("tr_press").select("url").ilike("brand", it.brand) : { data: [] };
    const linkler = [it.link, ...((it.other_sources ?? []).map((o) => o.link))].filter(Boolean);
    const iz: string[] = [];
    // Commons ve Openverse: önce marka + ürün, sonra konu aramaları (ilk ikisi). Alakasız olanları seçim adımı eler.
    const [r1, c1, o1, o2, s1, s2, c2, o3] = await Promise.all([
      resmiGorsel({ linkler, marka: it.brand, basin: ((bk ?? []) as { url: string }[]).map((x) => x.url), urun: it.product, baslik: it.title }),
      commons(urun, 6, iz), openverse(urun, 4, iz), aramalar[0] ? openverse(aramalar[0], 3, iz) : Promise.resolve([]),
      aramalar[0] ? stokFoto(aramalar[0], 3, anahtar) : Promise.resolve([]), aramalar[1] ? stokFoto(aramalar[1], 2, anahtar) : Promise.resolve([]),
      aramalar[0] ? commons(aramalar[0], 3, iz) : Promise.resolve([]), aramalar[1] ? openverse(aramalar[1], 2, iz) : Promise.resolve([]),
    ]);
    const goruldu = new Set<string>();
    const adaylar = [...r1, ...c1, ...o1, ...o2, ...c2, ...o3, ...s1, ...s2].filter((a) => a.buyuk && !goruldu.has(a.buyuk) && goruldu.add(a.buyuk)).slice(0, 12);
    if (!adaylar.length) {
      const durum = Object.entries(kaynakDurumu).map(([k, v]) => `${k}: ${v}`).join(", ");
      return { ...bos, neden: `Uygun fotoğraf bulunamadı (resmi ${r1.length} aday; ${iz.join("; ")}${durum ? "; " + durum : ""}).` };
    }
    let veri: Record<string, unknown>;
    try {
      // Küçük modelden başlar; kotası dolmuşsa taslağı yazan büyük modellere geçer
      ({ veri } = await gemini(SECIM_SISTEM, `Haber başlığı: ${baslik}\nÜrün: ${urun || "-"}\nOrijinal başlık: ${it.title}\n\nAdaylar:\n${adayListesi(adaylar)}`,
        ["gemini-3.5-flash-lite", ...MODELLER], Math.min(bitis - 30_000, Date.now() + 25_000)));
    } catch {
      const k = kuralSecim(adaylar, urun);
      return { secilen: k, adaylar: adaylar.slice(0, 8), neden: k ? "Yapay zekâ yanıt vermedi; ürün adıyla birebir eşleşen serbest lisanslı fotoğraf seçildi." : "Yapay zekâ yanıt vermedi ve ürün adıyla eşleşen fotoğraf yok; görsel eklenmedi." };
    }
    const i = Number(veri.secim);
    const secilen = Number.isInteger(i) && i >= 0 && i < adaylar.length ? adaylar[i] : null;
    return { secilen, adaylar: adaylar.slice(0, 8), neden: (String(veri.neden ?? "").slice(0, 200) || (secilen ? "" : "Uygun görsel yok.")) + (secilen ? "" : ` (${iz.join("; ")})`) };
  } catch (e) {
    return { ...bos, neden: "Görsel seçilemedi: " + String((e as Error).message ?? e).slice(0, 120) };
  }
}

/** Yapay zekâ listeleri bazen nesne döndürür ({iddia, kaynak}); hepsi düz metne çevrilir */
function metinListe(x: unknown): string[] {
  const duz = (v: unknown): string => typeof v === "string" ? v : v && typeof v === "object" ? Object.values(v as Record<string, unknown>).map(duz).filter(Boolean).join(" — ") : String(v ?? "");
  return (Array.isArray(x) ? x : x ? [x] : []).map(duz).map((s) => s.trim()).filter(Boolean);
}

async function isle(sb: Sb, itemId: number, tur: "ceviri" | "taslak", kullanici: string | null, ad: string, sec: IsSecenek = {}) {
  const bitis = Date.now() + BUTCE_MS;
  // Nabız: iş sürdükçe updated_at tazelenir; 2 dk nabız gelmezse zamanlanmış görev işi "hata"ya çeker (0013)
  const nabiz = () => sb.from("tr_items").update({ work_state: tur }).eq("id", itemId).eq("work_state", tur);
  const { data: it } = await sb.from("tr_items").select("*").eq("id", itemId).single();
  if (!it) return;
  try {
    if (tur === "ceviri") {
      const metin = await makaleCek(it.link, 10000);
      if (metin.length < 300) throw new Error("Kaynak sitenin metni otomatik alınamadı. Linke tıklayıp tarayıcının çeviri özelliğini kullan.");
      await nabiz();
      const { veri } = await gemini(CEVIRI_SISTEM, metin, ["gemini-3.5-flash-lite", "gemini-3.5-flash"], bitis);
      await sb.from("tr_items").update({ translation: String(veri.ceviri ?? "").slice(0, 45000), work_state: "", work_error: "" }).eq("id", itemId);
      return;
    }

    // İki kaynak: asıl haber + ilk "diğer kaynak"
    const diger = ((it.other_sources ?? []) as { name: string; link: string }[]).filter((o) => o.link && o.link !== it.link);
    const [ana, ek] = await Promise.all([makaleCek(it.link, 12000), diger[0] ? makaleCek(diger[0].link, 6000) : Promise.resolve("")]);
    const metinler = [`KAYNAK 1 (${it.source_name}) ${it.link}\n` + (ana.length >= 300 ? ana : `(Tam metin alınamadı. Başlık: ${it.title})`)];
    if (ek.length >= 300) metinler.push(`KAYNAK 2 ${diger[0].link}\n` + ek);
    // Kategori sitedeki listeden seçilsin (liste WordPress'ten okununca saklanır; yoksa serbest yazar)
    const kategoriler = await kayitliKategoriler(sb);
    const katSatiri = kategoriler.length ? `\nKATEGORİ: "kategori" alanına SADECE şu listeden birini aynen yaz: ${kategoriler.map((k) => k.name).join(" | ")}\n` : "";
    const istem = `UYARI: Aşağıdaki özet ve tür etiketi otomatik üretildi, hatalı olabilir. Haberin resmi mi, sızıntı mı, söylenti mi olduğunu ve ürünün piyasada olup olmadığını SADECE kaynak metne bakarak kendin belirle.
Haber özeti (sistemden): ${it.event}
Marka: ${it.brand} · Tür: ${it.kind} · Asıl kaynak: ${it.origin || it.source_name}
Orijinal başlık: ${it.title}
${katSatiri}
${metinler.join("\n\n---\n\n")}`;

    const { data: us } = await sb.from("tr_settings").select("value").eq("key", "yazim_uslubu").maybeSingle();
    const uslup = typeof us?.value === "string" && us.value.trim().length > 50 ? us.value : USLUP_VARSAYILAN;
    await nabiz();
    const { veri: t, model } = await gemini(taslakSistem(uslup), istem, MODELLER, bitis);
    await nabiz();
    const notlar: string[] = metinListe(t.editor_notlari);
    if (ana.length < 300) notlar.push("Kaynak sitenin tam metni otomatik alınamadı; taslak kısıtlı bilgiyle yazıldı. Kaynağı mutlaka oku.");

    // Gövde: ara başlıklar + "Dikkat edilmesi gerekenler" + editör yorumu yeri
    const parcalar: string[] = [];
    for (const b of t.govde ?? []) {
      if (b?.h2) parcalar.push("## " + b.h2);
      for (const p of b?.paragraflar ?? []) if (p) parcalar.push(String(p));
    }
    // "Dikkat edilmesi gerekenler" sitedeki yazılarda yok: editör notlarına gider, metne girmez
    const dikkat = metinListe(t.dikkat_edilmesi_gerekenler);
    if (dikkat.length) notlar.unshift(...dikkat.map((x: string) => "Dikkat: " + x));
    parcalar.push("**[EDİTÖR YORUMU: Buraya kendi değerlendirmeni ekle]**");

    // İnsanlaştırma (uslup.ts): metinde yapay zekâ izi kaldıysa üsluba göre yeniden ifade ettirilir; bilgi ve yapı korunur
    let baslik = String(t.baslik ?? ""), spot = String(t.spot ?? ""), govdeMd = parcalar.join("\n\n");
    const izler = yapayIzler([baslik, spot, govdeMd].join("\n"));
    if (izler.length && bitis - Date.now() > 70_000) {
      try {
        const { veri: h } = await gemini(INSANLASTIR_SISTEM(uslup), JSON.stringify({ izler, baslik, spot, govde: govdeMd }),
          ["gemini-3.5-flash-lite", ...MODELLER], Math.min(bitis - 50_000, Date.now() + 30_000));
        const yeniGovde = String(h.govde ?? "");
        const araBaslik = (x: string) => (x.match(/^## /gm) ?? []).length;
        // Güvenlik: ara başlık sayısı ve editör yorumu yeri korunmuşsa ve metin kısalmadıysa kabul edilir
        if (yeniGovde.includes("[EDİTÖR YORUMU") && araBaslik(yeniGovde) === araBaslik(govdeMd) && yeniGovde.length > govdeMd.length * 0.8) {
          govdeMd = yeniGovde; baslik = String(h.baslik ?? "") || baslik; spot = String(h.spot ?? "") || spot;
          const kalan = yapayIzler([baslik, spot, govdeMd].join("\n"));
          if (kalan.length) notlar.push("Metinde hâlâ yapay zekâ kokan ifadeler var: " + kalan.join(", "));
        }
      } catch { notlar.push("İnsanlaştırma adımı çalışmadı (yapay zekâ yanıt vermedi); şu ifadeleri elle düzelt: " + izler.join(", ")); }
    } else if (izler.length) notlar.push("Şu ifadeleri elle düzelt (yapay zekâ izi): " + izler.join(", "));

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

    // Öne çıkan görsel (gorsel.ts): Commons'ta ürünün kendisi, yoksa Pexels/Pixabay; yapay zekâ en uygununu seçer ya da hiçbirini
    const oneCikan = await gorselSec(sb, it, baslik || it.title, aramalar, bitis);
    await nabiz();

    const { data: yeni } = await sb.from("tr_drafts").insert({
      item_id: itemId, author: kullanici, model, auto: !!sec.oto,
      title: baslik, spot, body: govdeMd,
      seo: { focus: t.focus_keyword ?? "", title_tag: t.title_tag ?? "", slug: t.slug ?? "", meta: t.meta_description ?? "", kategori: t.kategori ?? "", etiketler: t.etiketler ?? [] },
      sources: kaynaklar.join("\n"), image_note: String(g.oneri ?? ""), editor_note: notlar.join("\n"),
      questions: metinListe(t.editor_sorulari), checks: metinListe(t.dogrulama), notes: notlar,
      image: { oneri: g.oneri ?? "", alt_text: g.alt_text ?? "", aramalar, ai_istem: g.ai_istem ?? "", basin, stok: secilen.slice(0, 6), secilen: oneCikan.secilen, gorsel_adaylar: oneCikan.adaylar, gorsel_neden: oneCikan.neden, stok_anahtar: !!(Deno.env.get("UNSPLASH_ACCESS_KEY") || Deno.env.get("PIXABAY_API_KEY") || Deno.env.get("PEXELS_API_KEY")) },
    }).select("id").single();

    const zaman = istanbulZaman();
    const ek2: Record<string, unknown> = { work_state: "", work_error: "" };
    if (sec.oto) {
      // Otomatik taslak: ilgi alanı en uygun editöre atanır; eşleşen yoksa havuzda sahipsiz kalır
      ek2.last_action = kullanici ? `${zaman} · Otomatik taslak → ${ad}` : `${zaman} · Otomatik taslak hazır (sahipsiz)`;
      if (kullanici) Object.assign(ek2, { status: "alindi", taken_by: kullanici, taken_at: new Date().toISOString(), last_dropped_by: null });
    } else {
      // Taslak hazırlayan haberi henüz kimse almadıysa otomatik alır (eski davranış)
      ek2.last_action = `${zaman} · ${ad} · taslak`;
      if (!it.taken_by || !["alindi", "yayinda"].includes(it.status)) Object.assign(ek2, { status: "alindi", taken_by: kullanici, taken_at: new Date().toISOString(), last_dropped_by: null });
    }
    await sb.from("tr_items").update(ek2).eq("id", itemId);

    if (sec.oto) {
      const kartBaslik = baslik || it.event || it.title;
      await sb.from("tr_activity").insert({ kind: "oto", actor: null, actor_name: "Stüdyo", target: kullanici, target_name: kullanici ? ad : "", item_id: itemId, title: kartBaslik, link: it.link, note: "" });
      if (kullanici) await sb.from("notifications").insert({ user_id: kullanici, body: `Otomatik taslak sana atandı: ${kartBaslik} (Haber Masası → Taslaklar)` });

      // WordPress'e taslak: bağlantı kuruluysa, ayar açıksa ve kaynağın tam metni okunabildiyse
      const ayar = await otoAyar(sb);
      if (yeni?.id && ayar.wordpress && wpAyar()) {
        if (ana.length < 300) await sb.from("tr_drafts").update({ wp_error: "Kaynağın tam metni alınamadığı için WordPress'e otomatik gönderilmedi. Kontrol edip elle gönder." }).eq("id", yeni.id);
        else if (bitis - Date.now() < 40_000) await sb.from("tr_drafts").update({ wp_pending: true }).eq("id", yeni.id); // süre yetmedi: sonraki turda gönderilir
        else await wpGonder(sb, yeni.id, { kategoriSec });
      }
      const { data: son } = await sb.from("tr_drafts").select("wp_post_id,wp_error,wp_pending,image").eq("id", yeni?.id ?? 0).maybeSingle();
      const wpDurum = son?.wp_post_id ? "WordPress'e taslak olarak gitti" : son?.wp_pending ? "WordPress'e sonraki turda gidecek" : son?.wp_error ? "WordPress hatası: " + son.wp_error : "Sadece Stüdyo'da";
      const gDurum = (son?.image as { wp_media_id?: number; secilen?: unknown } | null)?.wp_media_id ? "görsel eklendi" : (son?.image as { secilen?: unknown } | null)?.secilen ? "görsel seçildi" : "görselsiz";
      await otoOzet(sb, { durum: `Taslak hazır · ${wpDurum} · ${gDurum}`, haber: kartBaslik, editor: kullanici ? ad : "" });
    }
  } catch (e) {
    const mesaj = String((e as Error).message ?? e);
    // Otomatik taslakta kota/servis hatası haberin suçu değil: haberi serbest bırak, sonraki turda yeniden denensin
    if (sec.oto && /→ (429|500|503)/.test(mesaj)) {
      await sb.from("tr_items").update({ work_state: "", work_error: "", auto_draft_at: null }).eq("id", itemId);
      // Kota dolduysa (429) bir saat beklenir; her 10 dakikada aynı haberi boşuna denemesin
      const kota = /→ 429/.test(mesaj);
      await otoOzet(sb, { durum: kota ? "Yapay zekâ kotası doldu; 1 saat sonra yeniden denenecek" : "Yapay zekâ geçici hata verdi; sonraki turda yeniden denenecek", haber: it.event || it.title, ...(kota ? { bekle: new Date(Date.now() + 60 * 60_000).toISOString() } : {}) });
      return;
    }
    if (sec.oto) await otoOzet(sb, { durum: "Hata: " + mesaj.slice(0, 160), haber: it.event || it.title });
    await sb.from("tr_items").update({ work_state: "hata", work_error: mesaj.slice(0, 300) }).eq("id", itemId);
  }
}

// ---------- Otomatik taslak (ARCHITECTURE.md, 15 Ekim 2026) ----------
/** Ayarlar ekranındaki "Son çalışma" satırı (tr_settings.oto_son); günün sayacı korunur */
async function otoOzet(sb: Sb, o: Record<string, unknown>) {
  const { data } = await sb.from("tr_settings").select("value").eq("key", "oto_son").maybeSingle();
  const eski = (data?.value ?? {}) as Record<string, unknown>;
  await sb.from("tr_settings").upsert({ key: "oto_son", value: { zaman: eski.zaman ?? new Date().toISOString(), bugun: eski.bugun, ...o, bitti: new Date().toISOString() } });
}

async function otoAyar(sb: Sb): Promise<OtoAyar> {
  const { data } = await sb.from("tr_settings").select("value").eq("key", "oto_taslak").maybeSingle();
  return { ...OTO_VARSAYILAN, ...((data?.value ?? {}) as Partial<OtoAyar>) };
}

async function otoCalistir(sb: Sb) {
  const ayar = await otoAyar(sb);
  if (!ayar.acik) return { atlandi: "Otomatik taslak kapalı" };
  const { data: son } = await sb.from("tr_settings").select("value").eq("key", "oto_son").maybeSingle();
  const onceki = (son?.value ?? {}) as Record<string, unknown>;
  if (onceki.zaman && Date.now() - Date.parse(String(onceki.zaman)) < 8 * 60_000) return { atlandi: "Son 8 dakikada çalıştı" };
  if (onceki.bekle && Date.now() < Date.parse(String(onceki.bekle))) return { atlandi: "Yapay zekâ kotası için bekleniyor" };
  const ozet = (o: Record<string, unknown>) => sb.from("tr_settings").upsert({ key: "oto_son", value: { zaman: new Date().toISOString(), ...o } });
  await ozet({ durum: "çalışıyor" });

  // 1) Önceki turda süre yetmediği için WordPress'e gidemeyen otomatik taslaklar
  if (ayar.wordpress && wpAyar()) {
    const { data: bekleyen } = await sb.from("tr_drafts").select("id").eq("wp_pending", true).is("wp_post_id", null).limit(3);
    for (const b of bekleyen ?? []) { await sb.from("tr_drafts").update({ wp_pending: false }).eq("id", b.id); await wpGonder(sb, b.id, { kategoriSec }); }
  }

  // 2) Günlük sınır (İstanbul günü; Türkiye yıl boyu UTC+3)
  const gunBasi = istanbulGun() + "T00:00:00+03:00";
  const { count: bugun } = await sb.from("tr_drafts").select("id", { count: "exact", head: true }).eq("auto", true).gte("created_at", gunBasi);
  if ((bugun ?? 0) >= ayar.gunluk) { await ozet({ durum: `Günlük sınır doldu (${bugun}/${ayar.gunluk})`, bugun }); return { atlandi: "Günlük sınır" }; }

  // 3) Aday: havuzda, kimse almamış, daha önce otomatik denenmemiş, iş sürmüyor, son 24 saatte düşmüş
  const { data: havuz } = await sb.from("tr_items")
    .select("id,brand,topic,product,news_type,kind,source_name,turkey,other_sources,published_at,created_at,title,event,event_key")
    .eq("status", "aday").is("taken_by", null).is("auto_draft_at", null).eq("work_state", "")
    .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString()).limit(1000);
  const liste = (havuz ?? []) as Aday[];
  if (!liste.length) { await ozet({ durum: "Uygun haber yok", bugun }); return { bos: true }; }
  const { data: taslakli } = await sb.from("tr_drafts").select("item_id").in("item_id", liste.map((h) => h.id));
  // Aynı olay farklı kartlara bölünmüş olabilir: son 3 günde taslağı yazılmış ya da bir editörün aldığı haberlerle aynı olanlar atlanır
  const ucGun = new Date(Date.now() - 72 * 3_600_000).toISOString();
  const [{ data: sonTaslak }, { data: alinan }] = await Promise.all([
    sb.from("tr_drafts").select("item_id").gte("created_at", ucGun).not("item_id", "is", null).limit(500),
    // alınmış/yayında olanlar + şu an otomatik taslağı yazılmakta olanlar (son 30 dk; yarıda kalan aynı olayı 3 gün kilitlemesin)
    sb.from("tr_items").select("id,brand,product,event_key").or(`status.in.(alindi,yayinda),auto_draft_at.gte.${new Date(Date.now() - 30 * 60_000).toISOString()}`).gte("updated_at", ucGun).limit(1000),
  ]);
  const taslakIdleri = ((sonTaslak ?? []) as { item_id: number }[]).map((x) => x.item_id);
  const { data: taslakHaber } = taslakIdleri.length ? await sb.from("tr_items").select("id,brand,product,event_key").in("id", taslakIdleri) : { data: [] };
  const yazilmis = [...((taslakHaber ?? []) as { brand: string; product: string; event_key: string }[]), ...((alinan ?? []) as { brand: string; product: string; event_key: string }[])];
  // Aynı olayın sonraki kartları yapay zekâya hiç gitmez (kota harcamaz); turda birbirinin tekrarı olmayan en fazla `tur_basina` haber
  const kalanHak = Math.max(0, ayar.gunluk - (bugun ?? 0));
  const secimler = turAdaylari(liste.filter((h) => !ayniHaber(h, yazilmis)), new Set((taslakli ?? []).map((x: { item_id: number }) => x.item_id)), ayar,
    Math.min(Math.max(1, ayar.tur_basina ?? 1), 3, kalanHak));
  if (!secimler.length) { await ozet({ durum: `Eşiği (${ayar.esik}) geçen yeni haber yok`, bugun }); return { bos: true }; }

  // 5) Editör verisi: ilgi alanı → bugün müsait → elinde en az iş
  const [{ data: prof }, { data: gun }, { data: isler }, { data: otolar }] = await Promise.all([
    sb.from("profiles").select("id,name,interests"),
    sb.from("availability").select("user_id,status").eq("day", istanbulGun()),
    sb.from("tr_items").select("taken_by").eq("status", "alindi").gte("taken_at", new Date(Date.now() - 48 * 3_600_000).toISOString()),
    sb.from("tr_drafts").select("author").eq("auto", true).gte("created_at", gunBasi),
  ]);
  const musait = new Map(((gun ?? []) as { user_id: string; status: string }[]).map((g) => [g.user_id, g.status]));
  const yuk = new Map<string, number>();
  for (const x of [...((isler ?? []) as { taken_by: string | null }[]).map((i) => i.taken_by), ...((otolar ?? []) as { author: string | null }[]).map((o) => o.author)]) if (x) yuk.set(x, (yuk.get(x) ?? 0) + 1);

  const isler2: Promise<unknown>[] = [];
  const baslayan: { id: number; puan: number; editor: string | null }[] = [];
  for (const secim of secimler) {
    // 4) Kilit (aynı haber iki kez seçilmesin; elle "Taslak hazırla" ile çakışmasın)
    const { data: kilit } = await sb.from("tr_items").update({ work_state: "taslak", work_error: "", touched: true, auto_draft_at: new Date().toISOString() })
      .eq("id", secim.h.id).eq("work_state", "").is("taken_by", null).select("id");
    if (!kilit?.length) continue;
    const editor = editorSec(secim.h, (prof ?? []) as Profil[], musait, yuk);
    if (editor) yuk.set(editor.id, (yuk.get(editor.id) ?? 0) + 1);
    baslayan.push({ id: secim.h.id, puan: secim.d.puan, editor: editor?.name ?? null });
    const sure = new Promise<void>((r) => setTimeout(async () => {
      await sb.from("tr_items").update({ work_state: "hata", work_error: "Zaman aşımı: kaynak site ya da yapay zekâ çok yavaş yanıt verdi. Tekrar dene." })
        .eq("id", secim.h.id).eq("work_state", "taslak");
      r();
    }, 135_000));
    isler2.push(Promise.race([isle(sb, secim.h.id, "taslak", editor?.id ?? null, editor?.name ?? "", { oto: true }), sure]));
  }
  if (!baslayan.length) return { atlandi: "Haberler bu arada alındı" };
  await ozet({ durum: `Taslak yazılıyor (${baslayan.length} haber)`, haber: secimler.map((s) => s.h.event || s.h.title).slice(0, baslayan.length).join(" | ").slice(0, 300), puan: baslayan[0].puan, editor: "", bugun: (bugun ?? 0) + baslayan.length });
  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  EdgeRuntime.waitUntil(Promise.all(isler2));
  return { basladi: baslayan };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const govde = await req.json().catch(() => ({}));

  // Zamanlanmış görev: kullanıcı girdisi almaz, seçimi kendisi yapar; sınırlar ayarlardan (sık çağrılsa da 8 dk'da bir çalışır)
  if (govde?.oto) {
    try { return Response.json(await otoCalistir(sb), { headers: CORS }); }
    catch (e) { await sb.from("tr_settings").upsert({ key: "oto_son", value: { zaman: new Date().toISOString(), durum: "Hata: " + String((e as Error).message ?? e).slice(0, 200) } }); return Response.json({ hata: String(e) }, { status: 500, headers: CORS }); }
  }

  const auth = req.headers.get("Authorization") ?? "";
  const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return Response.json({ hata: "Giriş gerekli" }, { status: 401, headers: CORS });
  const { data: p } = await sb.from("profiles").select("id,name,is_admin").eq("id", u.user.id).maybeSingle();
  if (!p) return Response.json({ hata: "Ekip üyesi değil" }, { status: 403, headers: CORS });

  // WordPress bağlantısını dene (yönetici)
  if (govde?.wp_dene) {
    if (!p.is_admin) return Response.json({ hata: "Sadece yönetici" }, { status: 403, headers: CORS });
    return Response.json(await wpDene(sb), { headers: CORS });
  }
  // Taslağı WordPress'e gönder (ekip üyesi)
  if (govde?.wp) {
    if (!govde.draft_id) return Response.json({ hata: "draft_id gerekli" }, { status: 400, headers: CORS });
    const r = await wpGonder(sb, Number(govde.draft_id), { zorla: !!govde.zorla, kategoriSec });
    return Response.json(r, { status: r.ok ? 200 : 422, headers: CORS });
  }

  const { item_id, tur } = govde ?? {};
  if (!item_id || !["ceviri", "taslak"].includes(tur)) return Response.json({ hata: "item_id ve tur (ceviri|taslak) gerekli" }, { status: 400, headers: CORS });

  if (tur === "taslak") {
    const { data: it } = await sb.from("tr_items").select("taken_by,status").eq("id", item_id).single();
    if (it?.taken_by && it.taken_by !== u.user.id && ["alindi", "yayinda"].includes(it.status)) {
      const { data: kim } = await sb.from("profiles").select("name").eq("id", it.taken_by).maybeSingle();
      return Response.json({ hata: "Bu haberi " + (kim?.name ?? "başkası") + " aldı." }, { status: 409, headers: CORS });
    }
  }

  // Kilit: aynı haber için iş sürüyorsa ikinciyi başlatma
  // 2 dakikadır nabız gelmeyen iş yarıda kalmış sayılır, yeniden başlatılabilir
  const eski = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: kilit } = await sb.from("tr_items").update({ work_state: tur, work_error: "", touched: true })
    .eq("id", item_id).or(`work_state.not.in.(ceviri,taslak),updated_at.lt.${eski}`).select("id");
  if (!kilit?.length) return Response.json({ hata: "Bu haber için zaten bir iş sürüyor" }, { status: 409, headers: CORS });

  // Sunucu süre sınırına (yaklaşık 150 sn) takılmadan önce işi kesip hatayı yaz; "yazılıyor"da asılı kalmasın
  const sure = new Promise<void>((r) => setTimeout(async () => {
    await sb.from("tr_items").update({ work_state: "hata", work_error: "Zaman aşımı: kaynak site ya da yapay zekâ çok yavaş yanıt verdi. Tekrar dene." })
      .eq("id", Number(item_id)).eq("work_state", tur);
    r();
  }, 135_000));
  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  EdgeRuntime.waitUntil(Promise.race([isle(sb, Number(item_id), tur, u.user.id, p.name), sure]));
  return Response.json({ basladi: true }, { status: 202, headers: CORS });
});
