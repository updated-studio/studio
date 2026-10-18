// Haber Masası: RSS kaynaklarını okur → gürültüyü kuralla eler → Gemini SADECE etiket çıkarır → editörlerin kuralları karar verir.
// Eski "Updated Triyaj" (Apps Script, Triyaj.gs) mantığının karşılığı; Enes'in isteğiyle ek olarak "tip" (haber türü) etiketi alınır.
// Öncelik puanı ekranda src/modules/haber-masasi/oncelik.ts ile hesaplanır (markadan bağımsız, haber türüne göre).
// Tetikleyici: pg_cron 15 dakikada bir (tr_kick) ve Stüdyo'daki "Şimdi topla" düğmesi.
// Gizli bilgi: GEMINI_API_KEY (Supabase > Edge Functions > Secrets). Koda yazılmaz.
// Not: "Verify JWT" kapalı; girdi almaz. 5 dakikada bir defadan sık çalışmaz.
import { createClient } from "npm:@supabase/supabase-js@2";

// Eski TR_AYAR
const SAAT = 24;          // bundan eski haberler alınmaz
const KAYNAK_MAX = 10;    // bir çalıştırmada kaynak başına en fazla yeni haber (fazlası sonraki çalıştırmaya kalır)
const MAX_HABER = 100;    // bir çalıştırmada yapay zekâya giden en fazla haber; fazlası ELENMEZ, sıraya girer (Enes, 13 Ekim: hiçbir haber kaybolmasın)
const PARTI = 50;         // tek istekte kaç haber
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

const TUR: Record<string, string> = { resmi: "Resmi", sizinti: "Sızıntı", soylenti: "Söylenti", inceleme: "İnceleme", sektor: "Sektör", kampanya: "Kampanya", rehber: "Rehber", diger: "Diğer" };

const SISTEM = `Sen Updated (updated.com.tr) adlı Türkçe teknoloji haber sitesinin haber masası asistanısın. Sana numaralı bir İngilizce haber listesi verilecek. Puan verme ve karar verme; sadece her haber için aşağıdaki etiketleri çıkar. Kararı editörlerin kuralları verecek.

Alanlar:
- id: haberin numarası (aynen).
- marka: haberin ana markası, yaygın yazımıyla (Apple, Samsung, Xiaomi, Google, OpenAI...). Yoksa "".
- urun: söz konusu ürün veya hizmet (örn. "iPhone 18 Pro", "Pixel 11", "ChatGPT"). Yoksa "".
- tur: "resmi" (şirketin resmi duyurusu veya lansmanı), "sizinti" (render, sertifika, benchmark, belge sızıntısı), "soylenti" (iddia, muhabir veya analist kulisi), "inceleme" (ürün incelemesi veya testi), "sektor" (şirket, dava, finans, düzenleme), "kampanya" (indirim, fırsat, satış), "rehber" (nasıl yapılır, liste yazısı), "diger".
- tip: haberin türü, şu listeden tam olarak biri: Ürün duyurusu (yeni ürün resmi tanıtıldı), Türkiye fiyatı (Türkiye fiyatı, satış tarihi ya da Türkiye'ye geliş), Lansman tarihi (etkinlik ya da lansman tarihi açıklandı), Güçlü sızıntı (güvenilir kaynaktan ayrıntılı sızıntı), Önemli güncelleme (çok kullanıcıyı etkileyen yazılım/özellik güncellemesi), Şirket ve sektör (şirket kararı, satış, dava, sektör gelişmesi), Söylenti (zayıf ya da tek kaynaklı iddia), İnceleme ve test (başka yayının incelemesi ya da testi), Küçük güncelleme (az kişiyi ilgilendiren güncelleme), Diğer.
- konu: şu listeden tam olarak biri: telefon, tablet, bilgisayar, bileşen, giyilebilir, ses, kamera, drone, video ekipmanı, ev aletleri, akıllı ev, oyun, yapay zeka, yazılım, otomobil, sektör, eğlence, diğer.
- turkiye: "var" (ürün veya hizmet Türkiye'de satılıyor ya da kullanılıyor, veya haber küresel önemde), "yok" (sadece belirli bir ülkeye özel operatör, hizmet, fiyat, lansman ya da yasa; Türkiye'de olmayan ürün), "global" (Türkiye'de satılmıyor veya Türkiye'ye özel değil, ancak dünya genelinde ilgi çekebilecek yeni teknoloji, yeni ürün kategorisi veya büyük bir yenilik; böyle haberlerde "yok" yerine "global" ver), "belirsiz".
- asil_kaynak: metinde geçen asıl kaynak (örn. "Mark Gurman / Bloomberg", "Digital Chat Station / Weibo", "Samsung resmi açıklama"). Metinde yoksa haberi yayınlayan site.
- olay: AYNI olayı anlatan haberlere AYNI kimliği ver; farklı olaylara farklı kimlik ver. Küçük harf, tireli, İngilizce, en fazla 5 kelime (örn. "iphone-18-pro-camera-leak").
- neden: haberin ne hakkında olduğunu anlatan en fazla 15 kelimelik Türkçe cümle.

Sadece şu biçimde geçerli JSON döndür, başka hiçbir şey yazma:
{"haberler":[{"id":1,"marka":"","urun":"","tur":"","tip":"","konu":"","turkiye":"","asil_kaynak":"","olay":"","neden":""}]}`;

const AYNI_SISTEM = `Sen bir haber masası asistanısın. Sana "mevcut kartlar" ve "yeni haberler" listesi verilecek. Her yeni haber için, AYNI OLAYI (aynı ürün, aynı duyuru, aynı sızıntı, aynı gelişme) anlatan bir mevcut kart varsa onun id'sini ver; yoksa null ver. Sadece aynı markadan ya da benzer konudan olması yetmez; olay birebir aynı olmalı. Emin değilsen null ver.
Sadece şu biçimde geçerli JSON döndür: {"eslesme":[{"yeni":0,"mevcut":123}]}`;

type Kaynak = { id: number; name: string; url: string };
type Ham = { source: Kaynak; title: string; link: string; date: Date | null; ozet: string };
type Etiket = { id: number; marka?: string; urun?: string; tur?: string; tip?: string; konu?: string; turkiye?: string; asil_kaynak?: string; olay?: string; neden?: string };

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—" };
function temiz(s: string): string {
  const ent = (x: string) => x.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
  return ent(ent(String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}
function etiket(blok: string, ad: string): string {
  const m = blok.match(new RegExp(`<${ad}(?:\\s[^>]*)?>([\\s\\S]*?)</${ad}>`, "i"));
  return m ? m[1] : "";
}
// Türkiye gündemi (Fatih, 18 Ekim 2026; güncelleme 18 Ekim öğlen): Google Trends Türkiye RSS'i SADECE SİNYAL olarak okunur.
// Türkiye'deki haber sitelerinden haber metni ya da görsel ALINMAZ (telif; basın bültenleri hariç). Gündemdeki terimler saklanır
// (tr_settings.gundem, 24 saat) ve bu terim yabancı kaynaklı bir kartta geçiyorsa karta işaret konur (tr_items.trend) → öncelik puanına +.
// X, Instagram ve Ekşi Sözlük'ün herkese açık, kurallara uygun bir okuma yolu (API/RSS) yok; gündem bu kaynaktan izlenir.
const gundemMi = (k: Kaynak) => /trends\.google\./i.test(k.url);
const norm = (s: string) => " " + s.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim() + " ";

function gundemTerimleri(xml: string): string[] {
  return [...new Set((xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []).map((b) => temiz(etiket(b, "title"))).filter((t) => t.length >= 3 && t.length <= 60 && !/^\d+$/.test(t)))];
}

/** Gündem terimlerini saklar ve son 48 saatteki kartlardan bu terimi taşıyanları işaretler */
async function gundemIsaretle(sb: ReturnType<typeof createClient>, yeni: string[]) {
  const { data } = await sb.from("tr_settings").select("value").eq("key", "gundem").maybeSingle();
  const eski = ((data?.value as { terimler?: { t: string; z: string }[] } | null)?.terimler ?? []).filter((x) => Date.now() - Date.parse(x.z) < 24 * 3600_000);
  const simdi = new Date().toISOString();
  const terimler = [...eski.filter((x) => !yeni.includes(x.t)), ...yeni.map((t) => ({ t, z: simdi }))].slice(-200);
  await sb.from("tr_settings").upsert({ key: "gundem", value: { zaman: simdi, terimler } });
  const anahtarlar = terimler.map((x) => ({ t: x.t, n: norm(x.t) })).filter((x) => x.n.trim().length >= 4);
  if (!anahtarlar.length) return 0;
  const { data: kartlar } = await sb.from("tr_items").select("id,title,event,brand,product").in("status", ["aday", "belirsiz", "alindi"]).is("trend", null)
    .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString()).limit(800);
  let n = 0;
  for (const k of (kartlar ?? []) as { id: number; title: string; event: string; brand: string; product: string }[]) {
    const metin = norm(`${k.title} ${k.event} ${k.brand} ${k.product}`);
    const bulunan = anahtarlar.find((x) => metin.includes(x.n));
    if (bulunan) { await sb.from("tr_items").update({ trend: bulunan.t.slice(0, 60) }).eq("id", k.id); n++; }
  }
  return n;
}

// ---------- Anlamsal benzerlik (gömme / embedding), 18 Ekim 2026 (Fatih: "birebir aynı olduğundan emin olmadan birleştirme") ----------
// Kartlar Gemini gömme modeliyle vektöre çevrilir; iki kart ancak benzerliği eşiğin üstündeyse VE yapay zekâ "kesinlikle aynı olay"
// derse VE ortak marka/kelime varsa birleşir. Gömme alınamazsa birleştirme yapılmaz.
export const BENZERLIK_KUME = 0.86;   // 30 dk'lık kümelemede aday çift eşiği
export const BENZERLIK_BAGLA = 0.82;  // toplama sırasında yeni haberi mevcut karta bağlama eşiği
// Model sırası: ilk çalışan kullanılır. Vektörler modele göre farklı uzaydadır; sadece AYNI modelin vektörleri karşılaştırılır.
// Kota: ücretsiz katmanda toplu istekteki her metin ayrı istek sayılır; bu yüzden her kartın vektörü bir kez hesaplanıp saklanır
// (tr_gomme, haber bağlantısıyla; tr_items'a konmaz ki ekrana ve canlı güncellemeye büyük veri gitmesin).
const GOMME_MODELLER = ["gemini-embedding-2", "gemini-embedding-2-preview", "gemini-embedding-001"];
let GOMME_HATA = "";
async function gommeler(metinler: string[]): Promise<{ model: string; v: number[][] } | null> {
  GOMME_HATA = "";
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key || !metinler.length) return null;
  for (const model of GOMME_MODELLER) {
    const out: number[][] = [];
    let tamam = true;
    for (let i = 0; i < metinler.length; i += 50) {
      const parca = metinler.slice(i, i + 50);
      try {
        const istek = (boyut: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ requests: parca.map((t) => ({ model: "models/" + model, content: { parts: [{ text: t.slice(0, 1500) }] }, taskType: "SEMANTIC_SIMILARITY", ...(boyut ? { outputDimensionality: 768 } : {}) })) }),
        });
        let r = await istek(true);
        if (r.status === 400) r = await istek(false); // model boyut seçimini desteklemiyorsa
        if (!r.ok) { GOMME_HATA += `${model} ${r.status}: ${(await r.text()).slice(0, 120)} | `; tamam = false; break; }
        const j = await r.json();
        for (const e of j.embeddings ?? []) out.push(e.values as number[]);
        if ((j.embeddings ?? []).length !== parca.length) { tamam = false; break; }
      } catch (e) { GOMME_HATA += `${model} istek hatası: ${String(e).slice(0, 80)} | `; tamam = false; break; }
    }
    if (tamam && out.length === metinler.length) return { model, v: out.map((v) => { const n = Math.hypot(...v) || 1; return v.map((x) => Math.round(x / n * 1e5) / 1e5); }) };
  }
  return null;
}

/** Kartların vektörleri: saklı olanı (tr_gomme) kullanır, eksik olanı (en fazla `enFazla` kart) hesaplayıp saklar. Vektörü olmayan kart karşılaştırılmaz. */
async function kartGommeleri(sb: ReturnType<typeof createClient>, kartlar: { id: number; link: string; brand?: string; product?: string; title: string; event?: string }[], enFazla = 120) {
  const harita = new Map<number, number[]>();
  const saklı = new Map<string, { model: string; v: number[] }>();
  for (let i = 0; i < kartlar.length; i += 100) {
    const { data } = await sb.from("tr_gomme").select("link,model,v").in("link", kartlar.slice(i, i + 100).map((k) => k.link));
    for (const x of (data ?? []) as { link: string; model: string; v: number[] }[]) saklı.set(x.link, { model: x.model, v: x.v });
  }
  const modelSay = new Map<string, number>();
  saklı.forEach((x) => modelSay.set(x.model, (modelSay.get(x.model) ?? 0) + 1));
  let model = [...modelSay.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  kartlar.forEach((k) => { const x = saklı.get(k.link); if (x && x.model === model) harita.set(k.id, x.v); });
  const eksik = kartlar.filter((k) => !harita.has(k.id)).slice(0, enFazla);
  if (eksik.length) {
    const g = await gommeler(eksik.map(kartMetni));
    if (g && (!model || g.model === model)) {
      model = g.model;
      eksik.forEach((k, i) => harita.set(k.id, g.v[i]));
      await gommeYaz(sb, eksik.map((k, i) => ({ link: k.link, v: g.v[i] })), g.model);
    } else if (g && model && g.model !== model) GOMME_HATA += `Model değişti (${model} → ${g.model}) | `;
  }
  return { harita, model };
}
async function gommeYaz(sb: ReturnType<typeof createClient>, satirlar: { link: string; v: number[] }[], model: string) {
  for (let i = 0; i < satirlar.length; i += 100) await sb.from("tr_gomme").upsert(satirlar.slice(i, i + 100).map((x) => ({ link: x.link, model, v: x.v })), { onConflict: "link" });
}
const benzerlik = (a: number[], b: number[]) => { let t = 0; for (let i = 0; i < a.length; i++) t += a[i] * b[i]; return t; };
const kartMetni = (x: { brand?: string; product?: string; title: string; event?: string }) => `${x.brand ?? ""} ${x.product ?? ""}: ${x.title}. ${x.event ?? ""}`.trim();

// RSS 2.0, RSS 1.0 (RDF) ve Atom
function rssCoz(xml: string, k: Kaynak): Ham[] {
  const out: Ham[] = [];
  const bloklar = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of bloklar) {
    const title = temiz(etiket(b, "title"));
    let link = (b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i) ?? [])[1] ?? temiz(etiket(b, "link"));
    if (!link) link = (b.match(/<link[^>]*href=["']([^"']+)/i) ?? [])[1] ?? "";
    if (!link) link = temiz(etiket(b, "guid"));
    const ds = temiz(etiket(b, "pubDate") || etiket(b, "published") || etiket(b, "updated") || etiket(b, "dc:date"));
    const d = ds ? new Date(ds) : null;
    const ozet = temiz(etiket(b, "description") || etiket(b, "summary") || etiket(b, "content")).slice(0, 400);
    if (title && /^https?:\/\//.test(link.trim())) out.push({ source: k, title, link: link.trim(), date: d && !isNaN(+d) ? d : null, ozet });
  }
  return out;
}

async function getir(url: string, ms = 15000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, signal: c.signal, redirect: "follow" }); }
  finally { clearTimeout(t); }
}

// Gürültü eşleşmesi: yalnız harf ve boşluktan oluşan kelimeler kelime sınırıyla aranır (eski tr_esle_)
const esle = (metin: string, k: string) => (/^[a-z ]+$/.test(k) ? new RegExp("\\b" + k + "\\b").test(metin) : metin.includes(k));

// Bozuk JSON'u (sondaki virgül, kontrol karakteri) onarmayı dener
function jsonOku(ham: string): unknown {
  const m = ham.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
  const s = m ? m[0] : ham;
  for (const f of [(x: string) => x, (x: string) => x.replace(/,\s*([}\]])/g, "$1"), (x: string) => x.replace(/[\u0000-\u001F]+/g, " ").replace(/,\s*([}\]])/g, "$1")]) {
    try { return JSON.parse(f(s)); } catch { /* sonraki */ }
  }
  return null;
}

// Eski tr_gemini_: 3 deneme, ilk sıcaklık 0; 429/500/503'te 5 sn bekleyip tekrar
// Yoğunlukta ya da kota dolunca (429/500/503) sıradaki yedek modele, Gemini tamamen tıkanırsa ücretsiz yedek servise (Groq) geçer.
let YEDEK_MODEL = "llama-3.3-70b-versatile"; // tr_settings.model_yedek ile değiştirilebilir
async function gemini(model: string, kullanici: string, sistem = SISTEM): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let son: unknown = GEMINI_TIKALI;
  // Bu çalıştırmada Gemini kotası dolduysa her partide yeniden denenmez (zaman sınırı için), doğrudan yedeğe geçilir
  if (!GEMINI_TIKALI) for (const m of [model, "gemini-3.5-flash", "gemini-3.6-flash"].filter((x, i, a) => a.indexOf(x) === i)) {
    try { return await geminiTek(m, kullanici, sistem); }
    catch (e) { son = e; if (!/ (429|500|503):/.test(String(e))) throw e; }
  }
  if (son && / 429:/.test(String(son))) GEMINI_TIKALI = String(son);
  if (Deno.env.get("GROQ_API_KEY")) {
    try { return await groq(kullanici, sistem); }
    catch (e) { throw new Error(String(son) + " | Yedek (Groq) da olmadı: " + String((e as Error).message ?? e).slice(0, 200)); }
  }
  throw son;
}

// Groq: OpenAI uyumlu, ücretsiz katmanı olan yedek servis. Gizli bilgi: GROQ_API_KEY (Supabase Secrets).
async function groq(kullanici: string, sistem: string): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + Deno.env.get("GROQ_API_KEY") },
    body: JSON.stringify({ model: YEDEK_MODEL, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: sistem }, { role: "user", content: kullanici }] }),
  });
  const govde = await r.text();
  if (!r.ok) throw new Error("Groq " + r.status + ": " + govde.slice(0, 200));
  const veri = jsonOku(JSON.parse(govde)?.choices?.[0]?.message?.content ?? "") as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!veri) throw new Error("Groq geçersiz JSON döndü");
  YEDEK_KULLANILDI = true;
  return veri;
}
let YEDEK_KULLANILDI = false;
let GEMINI_TIKALI = "";

async function geminiTek(model: string, kullanici: string, sistem: string): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY yok");
  let son = "";
  for (let deneme = 0; deneme < 3; deneme++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistem }] },
        contents: [{ role: "user", parts: [{ text: kullanici }] }],
        generationConfig: { temperature: deneme ? 0.3 : 0, responseMimeType: "application/json", maxOutputTokens: 16000 },
      }),
    });
    const govde = await r.text();
    if (r.ok) {
      const j = JSON.parse(govde);
      const metin = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
      const veri = jsonOku(metin) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (veri) return veri;
      son = "geçersiz JSON döndü";
      await new Promise((x) => setTimeout(x, 2000));
      continue;
    }
    son = r.status + ": " + govde.slice(0, 200);
    if (r.status === 429 || ![500, 503].includes(r.status) || deneme >= 1) break; // kota dolu: bekleme, hemen sonraki modele geç
    await new Promise((x) => setTimeout(x, 3000));
  }
  throw new Error("Gemini yanıt vermedi. " + son);
}

// Ücretsiz Google Çeviri (anahtarsız, resmi olmayan uç): yapay zekâya hiç gitmeyen (gürültüyle elenen) başlıkları Türkçeye çevirir.
// Yapay zekâ kotası harcanmaz. Çalışmazsa başlık İngilizce kalır.
async function cevir(basliklar: string[]): Promise<string[]> {
  const out = [...basliklar].map(() => "");
  for (let i = 0; i < basliklar.length; i += 25) {
    const parca = basliklar.slice(i, i + 25);
    try {
      const r = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=" + encodeURIComponent(parca.join("\n")));
      if (!r.ok) continue;
      const j = await r.json();
      const satirlar = (j?.[0] ?? []).map((x: unknown[]) => String(x?.[0] ?? "")).join("").split("\n");
      parca.forEach((_, k) => { out[i + k] = (satirlar[k] ?? "").trim(); });
    } catch { /* İngilizce kalır */ }
  }
  return out;
}

async function topla(sb: ReturnType<typeof createClient>) {
  const bas = Date.now();
  const ayarlar = Object.fromEntries(((await sb.from("tr_settings").select("key,value")).data ?? []).map((r) => [r.key, r.value]));
  const gurultu: string[] = (ayarlar.gurultu_kelimeleri ?? []).map((s: string) => String(s).toLowerCase()).filter(Boolean);
  const model = String(ayarlar.model_eleme ?? "gemini-3.5-flash-lite");
  if (ayarlar.model_yedek) YEDEK_MODEL = String(ayarlar.model_yedek);
  YEDEK_KULLANILDI = false;
  GEMINI_TIKALI = "";

  const [{ data: kaynaklar }, { data: markalar }] = await Promise.all([
    sb.from("tr_sources").select("id,name,url").eq("active", true).order("id"),
    sb.from("tr_brands").select("name,grp"),
  ]);
  const pazar = (markalar ?? []).map((m: { name: string; grp: string }) => ({ orj: m.name.trim(), ad: m.name.trim().toLowerCase(), grup: m.grp.trim() }));
  const sinir = Date.now() - SAAT * 3600_000;

  // --- RSS'leri çek (kaynak sırası korunur; kaynak başına sınır sırayla uygulanır) ---
  const gundemTerim: string[] = [];
  const okunan: (Ham[] | null)[] = await Promise.all((kaynaklar ?? []).map(async (k: Kaynak) => {
    try {
      let r = await getir(k.url);
      if (r.status === 429) { await new Promise((x) => setTimeout(x, 5000)); r = await getir(k.url); }
      if (!r.ok) throw new Error("Hata " + r.status);
      const xml = await r.text();
      // Gündem kaynağı haber üretmez, sadece terim verir (Türk haber sitelerinden içerik alınmaz)
      if (gundemMi(k)) {
        const t = gundemTerimleri(xml); gundemTerim.push(...t);
        await sb.from("tr_sources").update({ last_check: new Date().toISOString(), item_count: t.length, last_item_at: new Date().toISOString(), error: "", status: t.length ? "Çalışıyor" : "Boş" }).eq("id", k.id);
        return [];
      }
      const liste = rssCoz(xml, k);
      const son = liste.reduce((m, h) => (h.date && +h.date > m ? +h.date : m), 0);
      const gun = son ? Math.floor((Date.now() - son) / 86_400_000) : null;
      // Eski durum adları: Çalışıyor / Yavaş (3+ gün) / Ölü (7+ gün) / Boş / Hata NNN
      await sb.from("tr_sources").update({
        last_check: new Date().toISOString(), item_count: liste.length,
        last_item_at: son ? new Date(son).toISOString() : null, error: "",
        status: !liste.length ? "Boş" : gun === null ? "Çalışıyor" : gun >= 7 ? "Ölü" : gun >= 3 ? "Yavaş" : "Çalışıyor",
      }).eq("id", k.id);
      return liste;
    } catch (e) {
      const m = String((e as Error).message ?? e);
      await sb.from("tr_sources").update({ last_check: new Date().toISOString(), status: /^Hata \d+/.test(m) ? m.slice(0, 20) : "Hata", error: m.slice(0, 200) }).eq("id", k.id);
      return null;
    }
  }));

  // --- Daha önce görülenleri ayıkla (tr_items + aynı olaya bağlanmış bağlantılar) ---
  const tumLinkler = [...new Set(okunan.flat().filter(Boolean).map((h) => (h as Ham).link))];
  const bilinen = new Set<string>();
  for (let i = 0; i < tumLinkler.length; i += 200) {
    const parca = tumLinkler.slice(i, i + 200);
    const [a, b] = await Promise.all([
      sb.from("tr_items").select("link").in("link", parca),
      sb.from("tr_seen").select("link").in("link", parca),
    ]);
    (a.data ?? []).forEach((r: { link: string }) => bilinen.add(r.link));
    (b.data ?? []).forEach((r: { link: string }) => bilinen.add(r.link));
  }

  const satir = (h: Ham, ek: Record<string, unknown>) => ({
    link: h.link, title: h.title.slice(0, 500), source_id: h.source.id, source_name: h.source.name,
    published_at: h.date?.toISOString() ?? null,
    status: "elendi", reason: "", model: "", event: "", brand: "", product: "", kind: "", topic: "", news_type: "", priority: 0,
    origin: "", turkey: "", event_key: "", other_sources: [] as { name: string; link: string }[],
    ...ek,
  });

  const gorulen = new Set<string>();
  const sayac = new Map<string, number>();
  const onElenen: Record<string, unknown>[] = [];
  let adaylar: Ham[] = [];
  okunan.forEach((liste) => {
    for (const h of liste ?? []) {
      if (gorulen.has(h.link) || bilinen.has(h.link)) continue;
      if (h.date && +h.date < sinir) continue;
      gorulen.add(h.link);
      const metin = (h.title + " " + h.ozet).toLowerCase();
      const g = gurultu.find((x) => esle(metin, x));
      if (g) { onElenen.push(satir(h, { reason: "Gürültü kelimesi: " + g, model: "kural (yapay zeka öncesi)" })); continue; }
      const n = (sayac.get(h.source.name) ?? 0) + 1;
      sayac.set(h.source.name, n);
      if (n > KAYNAK_MAX) continue; // en eskiler sessizce sonraki çalıştırmaya kalır
      adaylar.push(h);
    }
  });

  adaylar.sort((a, b) => +(b.date ?? 0) - +(a.date ?? 0));
  const sirada = adaylar.length - Math.min(adaylar.length, MAX_HABER); // yazılmaz; bir sonraki turda en yeniler önce işlenir
  adaylar = adaylar.slice(0, MAX_HABER);

  const yaz = async (satirlar: Record<string, unknown>[]) => {
    for (let i = 0; i < satirlar.length; i += 200) {
      const { error } = await sb.from("tr_items").upsert(satirlar.slice(i, i + 200), { onConflict: "link", ignoreDuplicates: true });
      if (error) throw new Error("Yazma hatası: " + error.message);
    }
  };

  // --- Yapay zekâ: sadece etiket ---
  let hata = Deno.env.get("GEMINI_API_KEY") ? "" : "GEMINI_API_KEY tanımlı değil; haberler yapay zekâ olmadan işlenmiyor.";
  const etiketler = new Map<number, Etiket>();
  const islenen = new Set<number>();
  if (!hata && adaylar.length) {
    const partiler: Ham[][] = [];
    for (let i = 0; i < adaylar.length; i += PARTI) partiler.push(adaylar.slice(i, i + PARTI));
    await Promise.all(partiler.map(async (p, pi) => {
      const ilk = pi * PARTI;
      const liste = p.map((h, i) => `${ilk + i + 1}. [${h.source.name}] ${h.title}\n Özet: ${h.ozet}`).join("\n\n");
      try {
        const v = await gemini(model, liste);
        ((v.haberler ?? []) as Etiket[]).forEach((e) => etiketler.set(Number(e.id), e));
        p.forEach((_, i) => islenen.add(ilk + i + 1));
      } catch (e) { hata = String((e as Error).message ?? e).slice(0, 300); }
    }));
  }

  // --- Kurallar (eski triyajIs_) ---
  const MODEL = model + " · Stüdyo";
  const elenen: Record<string, unknown>[] = [...onElenen];
  const belirsiz: Record<string, unknown>[] = [];
  const rehber: Record<string, unknown>[] = [];
  const kalan: { h: Ham; e: Etiket }[] = [];
  adaylar.forEach((h, i) => {
    const id = i + 1;
    if (!islenen.has(id)) return; // yanıt alınamadı: sonraki çalıştırmada yeniden denenir
    const e = etiketler.get(id);
    if (!e) { elenen.push(satir(h, { reason: "Model etiket vermedi", model: MODEL })); return; }
    const markaK = String(e.marka ?? "").toLowerCase(), urunK = String(e.urun ?? "").toLowerCase();
    const ortak = { model: MODEL, brand: String(e.marka ?? "").slice(0, 60), product: String(e.urun ?? "").slice(0, 80), topic: String(e.konu ?? "").slice(0, 40), kind: TUR[String(e.tur)] ?? String(e.tur ?? "").slice(0, 30), news_type: String(e.tip ?? "").slice(0, 30), event: String(e.neden ?? "").slice(0, 400) }; // Türkçe olay özeti elenen/rehber kartlarda da görünsün
    const haric = pazar.find((p) => p.grup === "Hariç" && (markaK === p.ad || urunK.includes(p.ad)));
    const kayit = pazar.find((p) => p.grup !== "Hariç" && (markaK === p.ad || urunK.includes(p.ad)));
    const grup = haric ? "Hariç" : kayit ? kayit.grup : "Listede yok";
    if (haric) { elenen.push(satir(h, { ...ortak, reason: "Hariç listesinde: " + haric.orj })); return; }
    if (e.tur === "rehber") { rehber.push(satir(h, { ...ortak, status: "rehber", event: String(e.neden ?? "").slice(0, 400) })); return; } // Enes: rehber/liste içerik elenmez, "Rehber fikirleri"ne düşer
    if (e.tur === "kampanya") { elenen.push(satir(h, { ...ortak, reason: "Tür: " + TUR[String(e.tur)] })); return; }
    if (e.turkiye === "belirsiz") { belirsiz.push(satir(h, { ...ortak, status: "belirsiz", reason: String(e.neden ?? "").slice(0, 300), event: String(e.neden ?? "").slice(0, 400), turkey: "belirsiz" })); return; }
    if (e.turkiye === "yok" && grup !== "Öncelikli") { elenen.push(satir(h, { ...ortak, reason: "Türkiye ile ilgisi yok: " + String(e.neden ?? "") })); return; }
    kalan.push({ h, e });
  });

  // --- Aynı olayı tek satırda birleştir ---
  const olaylar = new Map<string, { h: Ham; e: Etiket }[]>();
  kalan.forEach((k, i) => {
    const anahtar = String(k.e.olay || "tekil-" + i).toLowerCase().trim();
    olaylar.set(anahtar, [...(olaylar.get(anahtar) ?? []), k]);
  });
  type MevcutKart = { id: number; other_sources: { name: string; link: string }[]; source_name: string; brand: string; event: string; title: string; product?: string };
  // Bağlantı ADAYLARI (aynı olay kimliği ya da yapay zekâ eşleştirmesi); kesinleşmesi için gömme benzerliği şart (aşağıda)
  const bagAday = new Map<string, MevcutKart>();
  // Önceki çalıştırmalarda aynı olay kimliğiyle gelmiş haber varsa ona bağla
  const anahtarlar = [...olaylar.keys()].filter((a) => !a.startsWith("tekil-"));
  if (anahtarlar.length) {
    const { data } = await sb.from("tr_items").select("id,event_key,other_sources,source_name,brand,event,title,product").in("event_key", anahtarlar)
      .neq("status", "elendi").gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString());
    (data ?? []).forEach((r: MevcutKart & { event_key: string }) => { if (!bagAday.has(r.event_key)) bagAday.set(r.event_key, r); });
  }
  // Olay kimliği tutmayanlar için: yapay zekâ yeni haberi son 48 saatteki kartlarla karşılaştırır (aynı olay farklı turda gelmesin)
  const eslesmeyen = [...olaylar.entries()].filter(([a]) => !bagAday.has(a));
  if (eslesmeyen.length && !hata) {
    try {
      const { data: son } = await sb.from("tr_items").select("id,brand,event,title,product,other_sources,source_name,event_key")
        .in("status", ["aday", "alindi", "yayinda", "pas", "belirsiz"]).gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
        .order("created_at", { ascending: false }).limit(250);
      const liste = (son ?? []) as (MevcutKart & { event_key: string })[];
      if (liste.length) {
        const istem = `MEVCUT KARTLAR (id | marka | olay):\n${liste.map((x) => `${x.id} | ${x.brand} | ${x.event || x.title}`).join("\n")}\n\nYENİ HABERLER (n | marka | olay | başlık):\n${eslesmeyen.map(([, g], n) => `${n} | ${g[0].e.marka ?? ""} | ${g[0].e.neden ?? ""} | ${g[0].h.title}`).join("\n")}`;
        const v = await gemini(model, istem, AYNI_SISTEM);
        for (const e of (v.eslesme ?? []) as { yeni: number; mevcut: number | null }[]) {
          const kart = liste.find((x) => x.id === Number(e.mevcut));
          const grup = eslesmeyen[Number(e.yeni)];
          // Güvenlik (18 Ekim): ortak marka ya da en az iki ortak kelime
          if (kart && grup && benzer({ brand: String(grup[1][0].e.marka ?? ""), title: grup[1][0].h.title, event: String(grup[1][0].e.neden ?? "") }, kart)) bagAday.set(grup[0], kart);
        }
      }
    } catch (e) { console.error("eşleştirme hatası", e); }
  }
  // Gömme doğrulaması (18 Ekim, Fatih: "emin olmadan birleştirme"): (1) mevcut karta bağlanacak her yeni olay, (2) bu turda aynı olay
  // kimliğini almış haberler birbirine anlamca yeterince yakın olmalı. Gömme alınamazsa hiçbir bağlama/gruplama yapılmaz.
  const yeniMetin = (k: { h: Ham; e: Etiket }) => kartMetni({ brand: String(k.e.marka ?? ""), product: String(k.e.urun ?? ""), title: k.h.title, event: String(k.e.neden ?? "") });
  // Bu turun BÜTÜN yeni haberlerinin vektörü tek seferde alınır (sonra karta yazılır, kümelemede yeniden hesaplanmaz)
  const tumYeni = [...olaylar.values()].flat();
  const G = tumYeni.length ? await gommeler(tumYeni.map(yeniMetin)) : null;
  const vek = new Map<{ h: Ham; e: Etiket }, number[]>();
  if (G) tumYeni.forEach((x, i) => vek.set(x, G.v[i]));
  const ciftler = [...bagAday.entries()].filter(([a]) => olaylar.has(a));
  // Mevcut kartların vektörleri (saklıysa okunur, yoksa hesaplanır); yeni haberlerle aynı model olmalı
  const kartV = new Map<number, number[]>();
  if (G && ciftler.length) {
    const ids = [...new Set(ciftler.map(([, k]) => k.id))];
    const { data: kv } = await sb.from("tr_items").select("id,link,brand,product,title,event").in("id", ids);
    const { harita, model: km } = await kartGommeleri(sb, (kv ?? []) as { id: number; link: string; brand: string; product: string; title: string; event: string }[], 40);
    if (km === G.model) harita.forEach((v, id) => kartV.set(id, v));
  }
  const mevcut = new Map<string, MevcutKart>();
  let reddedilen = 0;
  for (const [a, k] of ciftler) {
    const yv = vek.get(olaylar.get(a)![0]), kvv = kartV.get(k.id);
    if (yv && kvv && benzerlik(yv, kvv) >= BENZERLIK_BAGLA) mevcut.set(a, k); else reddedilen++;
  }
  for (const [a, g] of [...olaylar.entries()].filter(([, g]) => g.length > 1)) {
    const ilk = vek.get(g[0]);
    const ayri = g.filter((x, j) => { const v = vek.get(x); return j > 0 && !(ilk && v && benzerlik(ilk, v) >= BENZERLIK_BAGLA); });
    if (!ayri.length) continue;
    olaylar.set(a, g.filter((x) => !ayri.includes(x)));
    ayri.forEach((x, j) => olaylar.set(`tekil-ayri-${a}-${j}`, [x]));
    reddedilen += ayri.length;
  }
  // Yeni haberlerin vektörleri saklanır (kümeleme yeniden hesaplamasın)
  if (G) await gommeYaz(sb, tumYeni.map((x) => ({ link: x.h.link, v: vek.get(x)! })), G.model).catch(() => null);
  if (reddedilen || !G) console.log(JSON.stringify({ gomme_reddi: reddedilen, gomme: !!G, hata: GOMME_HATA }));
  const yeniAday: Record<string, unknown>[] = [];
  const goruldu: string[] = [];
  for (const [anahtar, g] of olaylar) {
    g.sort((x, y) => +(x.h.date ?? 0) - +(y.h.date ?? 0));
    const eski = mevcut.get(anahtar);
    if (eski) {
      const ek = g.map((x) => ({ name: x.h.source.name, link: x.h.link })).filter((x) => !eski.other_sources.some((o) => o.link === x.link));
      if (ek.length) { eski.other_sources = [...eski.other_sources, ...ek]; await sb.from("tr_items").update({ other_sources: eski.other_sources }).eq("id", eski.id); }
      goruldu.push(...g.map((x) => x.h.link));
      continue;
    }
    const ilk = g[0];
    const asil = g.map((x) => x.e.asil_kaynak).find(Boolean) || ilk.h.source.name;
    yeniAday.push(satir(ilk.h, {
      status: "aday", model: MODEL,
      event: String(ilk.e.neden || ilk.h.title).slice(0, 400),
      brand: String(ilk.e.marka ?? "").slice(0, 60), product: String(ilk.e.urun ?? "").slice(0, 80),
      kind: TUR[String(ilk.e.tur)] ?? String(ilk.e.tur ?? ""), topic: String(ilk.e.konu ?? "").slice(0, 40),
      news_type: String(ilk.e.tip ?? "").slice(0, 30),
      turkey: String(ilk.e.turkiye ?? ""), origin: String(asil).slice(0, 120),
      event_key: anahtar.startsWith("tekil-") ? "" : anahtar.slice(0, 80),
      other_sources: g.slice(1).map((x) => ({ name: x.h.source.name, link: x.h.link })),
    }));
    goruldu.push(...g.slice(1).map((x) => x.h.link));
  }

  // Yapay zekâdan geçmeyen elenenlerin başlığı ücretsiz çeviriyle Türkçeleşir (elenenlere bakan ekip anlasın)
  const cevrilecek = elenen.filter((x) => !x.event);
  if (cevrilecek.length) {
    const tr = await cevir(cevrilecek.map((x) => String(x.title)));
    cevrilecek.forEach((x, k) => { if (tr[k]) x.event = tr[k].slice(0, 400); });
  }
  try {
    await yaz([...yeniAday, ...elenen, ...belirsiz, ...rehber]);
    if (goruldu.length) await sb.from("tr_seen").upsert(goruldu.map((link) => ({ link })), { onConflict: "link", ignoreDuplicates: true });
  } catch (e) { hata = String((e as Error).message ?? e).slice(0, 300); }

  let gundemIsaret = 0;
  try { if (gundemTerim.length) gundemIsaret = await gundemIsaretle(sb, gundemTerim); } catch (e) { console.error("gündem", e); }

  const ozet = {
    gundem: gundemTerim.length, gundemIsaret,
    kaynak: kaynaklar?.length ?? 0, okunan: tumLinkler.length, yeni: gorulen.size, kural: onElenen.length, sirada,
    yapayZeka: islenen.size, aday: yeniAday.length, elenen: elenen.length, belirsiz: belirsiz.length, rehber: rehber.length,
    bekleyen: sirada + adaylar.length - islenen.size, hata, yedek: YEDEK_KULLANILDI, sure: Date.now() - bas,
  };
  await sb.from("tr_settings").upsert({ key: "son_toplama", value: { ...ozet, durum: "bitti", zaman: new Date().toISOString() } });
  console.log(JSON.stringify(ozet));
  return ozet;
}

// Tek seferlik / yönetici: havuzdaki (son 48 saat, kimsenin dokunmadığı) aynı olaya ait kartları birleştirir.
async function birlestir(sb: ReturnType<typeof createClient>, model: string, sadeceMarka?: string) {
  const { data } = await sb.from("tr_items").select("id,brand,event,title,link,source_name,other_sources,touched,published_at")
    .eq("status", "aday").gte("created_at", new Date(Date.now() - 72 * 3600_000).toISOString()).order("published_at").limit(600);
  const liste = (data ?? []) as { id: number; brand: string; event: string; title: string; link: string; source_name: string; other_sources: { name: string; link: string }[]; touched: boolean }[];
  const markalar = new Map<string, typeof liste>();
  liste.forEach((x) => { const m = (x.brand || "—").toLowerCase(); markalar.set(m, [...(markalar.get(m) ?? []), x]); });
  let birlesen = 0;
  if (!sadeceMarka) return { markalar: [...markalar.entries()].filter(([, g]) => g.length >= 2).map(([m, g]) => [m, g.length]) };
  const gruplar = [markalar.get(sadeceMarka.toLowerCase()) ?? []].filter((g) => g.length >= 2).map((g) => g.slice(0, 120));
  // Markalar 6'şar paralel işlenir (zaman sınırına takılmamak için)
  for (let i = 0; i < gruplar.length; i += 6) {
    await Promise.all(gruplar.slice(i, i + 6).map(async (grup) => {
      let v: Record<string, unknown> = {};
      v = await gemini(model, grup.map((x) => `${x.id} | ${x.event || x.title}`).join("\n"), GRUP_SISTEM);
      for (const kume of (v.gruplar ?? []) as number[][]) {
        const kartlar = kume.map((id) => grup.find((x) => x.id === Number(id))).filter(Boolean) as typeof liste;
        if (kartlar.length < 2) continue;
        const tutulan = kartlar.find((x) => x.touched) ?? kartlar[0];
        const digerleri = kartlar.filter((x) => x !== tutulan && !x.touched);
        if (!digerleri.length) continue;
        const tum = [...tutulan.other_sources];
        digerleri.flatMap((x) => [{ name: x.source_name, link: x.link }, ...x.other_sources])
          .forEach((o) => { if (o.link !== tutulan.link && !tum.some((t) => t.link === o.link)) tum.push(o); });
        await sb.from("tr_items").update({ other_sources: tum }).eq("id", tutulan.id);
        await sb.from("tr_seen").upsert(digerleri.map((x) => ({ link: x.link })), { onConflict: "link", ignoreDuplicates: true });
        await sb.from("tr_items").delete().in("id", digerleri.map((x) => x.id)).eq("touched", false);
        birlesen += digerleri.length;
      }
    }));
  }
  return { kart: liste.length, birlesen };
}

// 30 dakikada bir (Fatih, 18 Ekim 2026): son 48 saatteki kartlardan AYNI OLAYI anlatanlar markadan bağımsız tek karta birleşir.
// "Emin olmadan birleştirme" (Fatih, 18 Ekim öğlen): üç kapı birden geçilmeli:
//   1) gömme (embedding) benzerliği ≥ BENZERLIK_KUME, 2) yapay zekâ o çift için "kesinlikle aynı olay" der, 3) ortak marka ya da en az iki ortak kelime.
// Zincirleme yok: bir kart ancak tutulan kartla DOĞRUDAN onaylanmışsa ona katılır. Ekibin dokunduğu kart her zaman tutulan karttır;
// dokunulmamışlar onun "diğer kaynakları"na eklenir ve silinir (bağlantıları tr_seen'e yazılır, tekrar gelmez).
const CIFT_SISTEM = `Sana numaralı haber çiftleri verilecek. Her çift için iki haberin BİREBİR AYNI OLAYI anlatıp anlatmadığına karar ver.
AYNI OLAY: aynı ürünün aynı duyurusu, aynı sızıntı, aynı açıklama, aynı dava kararı, aynı güncelleme (başlık ve dil farklı olabilir).
AYNI DEĞİL: aynı şirketin farklı ürünü ya da farklı haberi; aynı ürünle ilgili farklı gelişmeler (ör. tanıtım ile fiyat ayrı haberdir; sızıntı ile resmi duyuru ayrıdır; inceleme ile duyuru ayrıdır); benzer konu.
Kesin emin değilsen "hayir" de.
Sadece şu JSON'u döndür: {"kararlar":[{"n":0,"karar":"evet|hayir"}]}`;

// Güvenlik: kartların başlık/özetinde ortak anlamlı kelime ya da aynı marka aranır.
const DOLGU = new Set(["the", "and", "for", "with", "that", "this", "from", "your", "will", "have", "has", "new", "its", "are", "after", "about", "into", "over", "more", "than", "yeni", "için", "ile", "olan", "daha", "gibi", "bir", "ve", "da", "de", "en"]);
const kelimeler = (s: string) => new Set(s.toLocaleLowerCase("tr").replace(/[^a-z0-9ğüşıöç]+/g, " ").split(" ").filter((w) => w.length >= 3 && !DOLGU.has(w)));
function benzer(a: { brand: string; title: string; event: string }, b: { brand: string; title: string; event: string }) {
  if (a.brand && b.brand && a.brand.toLocaleLowerCase("tr") === b.brand.toLocaleLowerCase("tr")) return true;
  const x = kelimeler(a.title + " " + a.event), y = kelimeler(b.title + " " + b.event);
  return [...x].filter((w) => y.has(w)).length >= 2;
}

async function kumele(sb: ReturnType<typeof createClient>, model: string) {
  const bas = Date.now();
  const { data } = await sb.from("tr_items").select("id,brand,product,event,title,link,source_name,other_sources,touched,status,auto_draft_at,created_at")
    .in("status", ["aday", "belirsiz", "alindi"]).gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .order("created_at", { ascending: false }).limit(300);
  type K = { id: number; brand: string; product: string; event: string; title: string; link: string; source_name: string; other_sources: { name: string; link: string }[]; touched: boolean; status: string; auto_draft_at: string | null; created_at: string };
  const liste = (data ?? []) as K[];
  const ozet: Record<string, unknown> = { zaman: new Date().toISOString(), kart: liste.length, aday_cift: 0, onaylanan: 0, grup: 0, birlesen: 0 };
  if (liste.length >= 2) {
    // 1) Gömme benzerliği (saklı vektörler; eksikler en fazla 120 kart hesaplanır, vektörü olmayan kart bu tur birleşmez)
    const { harita, model: gm } = await kartGommeleri(sb, liste);
    const E = liste.map((k) => harita.get(k.id) ?? null);
    ozet.gomme_model = gm; ozet.vektorlu = E.filter(Boolean).length;
    if (!harita.size) {
      // Teşhis: hangi gömme modelleri açık?
      let modeller = "";
      try { const m = await (await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": Deno.env.get("GEMINI_API_KEY") ?? "" } })).json(); modeller = (m.models ?? []).filter((x: { name: string; supportedGenerationMethods?: string[] }) => (x.supportedGenerationMethods ?? []).some((g) => /embed/i.test(g))).map((x: { name: string }) => x.name).join(", "); } catch { /* yok */ }
      ozet.hata = "Gömme (embedding) alınamadı; emin olunamadığı için birleştirme yapılmadı. " + GOMME_HATA + (modeller ? " Açık gömme modelleri: " + modeller : "");
    }
    else {
      if (GOMME_HATA) ozet.uyari = GOMME_HATA.slice(0, 300);
      const dagilim = { "0.80": 0, "0.86": 0, "0.90": 0 };
      const ciftler: { i: number; j: number; b: number }[] = [];
      for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++) {
        const ei = E[i], ej = E[j];
        if (!ei || !ej) continue;
        const b = benzerlik(ei, ej);
        if (b >= 0.80) dagilim["0.80"]++; if (b >= 0.86) dagilim["0.86"]++; if (b >= 0.90) dagilim["0.90"]++;
        if (b >= BENZERLIK_KUME && benzer(liste[i], liste[j])) ciftler.push({ i, j, b });
      }
      ciftler.sort((x, y) => y.b - x.b);
      const sorulan = ciftler.slice(0, 80);
      ozet.aday_cift = ciftler.length; ozet.dagilim = dagilim;
      // 2) Yapay zekâ her çifti ayrı onaylar
      const onay = new Set<string>();
      if (sorulan.length) {
        const v = await gemini(model, sorulan.map((c, n) => `${n}) A: ${liste[c.i].title} [${liste[c.i].brand}] — ${liste[c.i].event}\n   B: ${liste[c.j].title} [${liste[c.j].brand}] — ${liste[c.j].event}`).join("\n"), CIFT_SISTEM);
        for (const k of (v.kararlar ?? []) as { n: number; karar: string }[]) {
          const c = sorulan[Number(k.n)];
          if (c && String(k.karar).toLowerCase() === "evet") onay.add(`${liste[c.i].id}-${liste[c.j].id}`);
        }
      }
      ozet.onaylanan = onay.size;
      const onayli = (a: number, b: number) => onay.has(`${a}-${b}`) || onay.has(`${b}-${a}`);
      // 3) Gruplar: onaylı çiftlerden bağlantılı kümeler; her kümede tutulan karta DOĞRUDAN onaylı olanlar katılır
      const bag = new Map<number, Set<number>>();
      for (const key of onay) { const [a, b] = key.split("-").map(Number); (bag.get(a) ?? bag.set(a, new Set()).get(a)!).add(b); (bag.get(b) ?? bag.set(b, new Set()).get(b)!).add(a); }
      const islendi = new Set<number>();
      let birlesen = 0, grup = 0;
      const benzerlikler: number[] = [];
      for (const kok of bag.keys()) {
        if (islendi.has(kok)) continue;
        const kume: number[] = []; const yigin = [kok];
        while (yigin.length) { const x = yigin.pop()!; if (islendi.has(x)) continue; islendi.add(x); kume.push(x); yigin.push(...(bag.get(x) ?? [])); }
        const kartlar = kume.map((id) => liste.find((x) => x.id === id)!).filter(Boolean);
        const tutulan = [...kartlar].sort((a, b) => Number(b.touched || b.status === "alindi") - Number(a.touched || a.status === "alindi")
          || b.other_sources.length - a.other_sources.length || Date.parse(a.created_at) - Date.parse(b.created_at))[0];
        const digerleri = kartlar.filter((x) => x !== tutulan && onayli(x.id, tutulan.id) && !x.touched && x.status !== "alindi" && !x.auto_draft_at);
        if (!digerleri.length) continue;
        digerleri.forEach((x) => benzerlikler.push(Math.round(benzerlik(E[liste.indexOf(x)]!, E[liste.indexOf(tutulan)]!) * 1000) / 1000));
        const tum = [...tutulan.other_sources];
        digerleri.flatMap((x) => [{ name: x.source_name, link: x.link }, ...x.other_sources])
          .forEach((o) => { if (o.link !== tutulan.link && !tum.some((t) => t.link === o.link)) tum.push(o); });
        await sb.from("tr_items").update({ other_sources: tum }).eq("id", tutulan.id);
        await sb.from("tr_seen").upsert(digerleri.map((x) => ({ link: x.link })), { onConflict: "link", ignoreDuplicates: true });
        await sb.from("tr_items").delete().in("id", digerleri.map((x) => x.id)).eq("touched", false).is("auto_draft_at", null);
        birlesen += digerleri.length; grup++;
      }
      Object.assign(ozet, { grup, birlesen, en_dusuk_benzerlik: benzerlikler.length ? Math.min(...benzerlikler) : null });
    }
  }
  ozet.sure = Date.now() - bas;
  await sb.from("tr_settings").upsert({ key: "son_kumeleme", value: ozet });
  return ozet;
}

const GRUP_SISTEM = `Sana aynı markaya ait numaralı haber kartları verilecek (id | olay). AYNI OLAYI anlatan kartları gruplandır (aynı ürün duyurusu, aynı sızıntı, aynı gelişme). Sadece birebir aynı olaylar bir gruba girer; emin değilsen gruplama. Tek kartlık grupları yazma.
Sadece şu biçimde geçerli JSON döndür: {"gruplar":[[12,15],[20,31,33]]}`;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const govde = await req.json().catch(() => ({}));
  if (govde?.eskiCeviri) {
    // Tek seferlik: Türkçe özeti olmayan elenen/rehber/belirsiz haberlerin başlığını ücretsiz çeviriyle doldurur (yapay zekâ kullanmaz)
    const { data } = await sb.from("tr_items").select("id,title").in("status", ["elendi", "rehber", "belirsiz"]).eq("event", "").limit(400);
    const l = (data ?? []) as { id: number; title: string }[];
    const tr = await cevir(l.map((x) => x.title));
    let n = 0;
    for (let i = 0; i < l.length; i++) if (tr[i]) { await sb.from("tr_items").update({ event: tr[i].slice(0, 400) }).eq("id", l[i].id); n++; }
    return Response.json({ bulunan: l.length, cevrilen: n }, { headers: CORS });
  }
  // Zamanlanmış kümeleme (30 dk'da bir, tr_kumele_kick); girdi almaz, 20 dakikadan sık çalışmaz
  if (govde?.kumele) {
    const { data: k } = await sb.from("tr_settings").select("value").eq("key", "son_kumeleme").maybeSingle();
    if (!govde.zorla && k?.value?.zaman && Date.now() - Date.parse(k.value.zaman) < 20 * 60_000) return Response.json({ atlandi: "Son 20 dakikada çalıştı" }, { headers: CORS });
    const ay = Object.fromEntries(((await sb.from("tr_settings").select("key,value")).data ?? []).map((r) => [r.key, r.value]));
    if (ay.model_yedek) YEDEK_MODEL = String(ay.model_yedek);
    // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
    // Gruplama hatası taslağı bozar (yanlış kaynak okunur): eleme modelinden güçlü olan taslak modeli kullanılır, saatte 2 istek
    EdgeRuntime.waitUntil(kumele(sb, String(ay.model_taslak ?? ay.model_eleme ?? "gemini-3.5-flash-lite")).catch((e) => sb.from("tr_settings").upsert({ key: "son_kumeleme", value: { zaman: new Date().toISOString(), hata: String(e).slice(0, 200) } })));
    return Response.json({ basladi: true }, { status: 202, headers: CORS });
  }
  if (govde?.birlestir) {
    const { data: u } = await sb.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""));
    const { data: p } = u?.user ? await sb.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle() : { data: null };
    if (!p?.is_admin) return Response.json({ hata: "Sadece yönetici" }, { status: 403, headers: CORS });
    const ay = Object.fromEntries(((await sb.from("tr_settings").select("key,value")).data ?? []).map((r) => [r.key, r.value]));
    // Önce marka listesi istenir (marka yok), sonra her marka ayrı istekle birleştirilir (zaman/işlemci sınırına takılmamak için)
    try { return Response.json(await birlestir(sb, String(ay.model_eleme ?? "gemini-3.5-flash-lite"), govde.marka), { headers: CORS }); }
    catch (e) { return Response.json({ hata: String((e as Error).message ?? e).slice(0, 300) }, { status: 500, headers: CORS }); }
  }
  const { data } = await sb.from("tr_settings").select("value").eq("key", "son_toplama").maybeSingle();
  const son = data?.value?.zaman ? Date.parse(data.value.zaman) : 0;
  if (Date.now() - son < 5 * 60_000 && !govde?.zorla) return Response.json({ atlandi: "Son 5 dakikada çalıştı" }, { headers: CORS });
  if (govde?.zorla && Date.now() - son < 60_000) return Response.json({ atlandi: "Az önce çalıştı, 1 dakika bekle" }, { headers: CORS });
  await sb.from("tr_settings").upsert({ key: "son_toplama", value: { ...(data?.value ?? {}), zaman: new Date().toISOString(), durum: "çalışıyor" } });
  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  EdgeRuntime.waitUntil(topla(sb).catch((e) => console.error("toplama hatası", e)));
  return Response.json({ basladi: true }, { status: 202, headers: CORS });
});
