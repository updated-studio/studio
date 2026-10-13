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
const MAX_HABER = 100;    // bir çalıştırmada yapay zekâya giden en fazla haber; fazlası "Toplu istek limiti" ile elenir
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
async function gemini(model: string, kullanici: string): Promise<{ haberler?: Etiket[] }> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY yok");
  let son = "";
  for (let deneme = 0; deneme < 3; deneme++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SISTEM }] },
        contents: [{ role: "user", parts: [{ text: kullanici }] }],
        generationConfig: { temperature: deneme ? 0.3 : 0, responseMimeType: "application/json", maxOutputTokens: 16000 },
      }),
    });
    const govde = await r.text();
    if (r.ok) {
      const j = JSON.parse(govde);
      const metin = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
      const veri = jsonOku(metin) as { haberler?: Etiket[] } | null;
      if (veri) return veri;
      son = "geçersiz JSON döndü";
      await new Promise((x) => setTimeout(x, 2000));
      continue;
    }
    son = r.status + ": " + govde.slice(0, 200);
    if (![429, 500, 503].includes(r.status)) break;
    await new Promise((x) => setTimeout(x, 5000));
  }
  throw new Error("Gemini yanıt vermedi. " + son);
}

async function topla(sb: ReturnType<typeof createClient>) {
  const bas = Date.now();
  const ayarlar = Object.fromEntries(((await sb.from("tr_settings").select("key,value")).data ?? []).map((r) => [r.key, r.value]));
  const gurultu: string[] = (ayarlar.gurultu_kelimeleri ?? []).map((s: string) => String(s).toLowerCase()).filter(Boolean);
  const model = String(ayarlar.model_eleme ?? "gemini-3.5-flash-lite");

  const [{ data: kaynaklar }, { data: markalar }] = await Promise.all([
    sb.from("tr_sources").select("id,name,url").eq("active", true).order("id"),
    sb.from("tr_brands").select("name,grp"),
  ]);
  const pazar = (markalar ?? []).map((m: { name: string; grp: string }) => ({ orj: m.name.trim(), ad: m.name.trim().toLowerCase(), grup: m.grp.trim() }));
  const sinir = Date.now() - SAAT * 3600_000;

  // --- RSS'leri çek (kaynak sırası korunur; kaynak başına sınır sırayla uygulanır) ---
  const okunan: (Ham[] | null)[] = await Promise.all((kaynaklar ?? []).map(async (k: Kaynak) => {
    try {
      let r = await getir(k.url);
      if (r.status === 429) { await new Promise((x) => setTimeout(x, 5000)); r = await getir(k.url); }
      if (!r.ok) throw new Error("Hata " + r.status);
      const liste = rssCoz(await r.text(), k);
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
  const fazla = adaylar.slice(MAX_HABER).map((h) => satir(h, { reason: `Toplu istek limiti (${MAX_HABER}) aşıldı`, model: "kural (yapay zeka öncesi)" }));
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
        (v.haberler ?? []).forEach((e) => etiketler.set(Number(e.id), e));
        p.forEach((_, i) => islenen.add(ilk + i + 1));
      } catch (e) { hata = String((e as Error).message ?? e).slice(0, 300); }
    }));
  }

  // --- Kurallar (eski triyajIs_) ---
  const MODEL = model + " · Stüdyo";
  const elenen: Record<string, unknown>[] = [...onElenen, ...fazla];
  const belirsiz: Record<string, unknown>[] = [];
  const kalan: { h: Ham; e: Etiket }[] = [];
  adaylar.forEach((h, i) => {
    const id = i + 1;
    if (!islenen.has(id)) return; // yanıt alınamadı: sonraki çalıştırmada yeniden denenir
    const e = etiketler.get(id);
    if (!e) { elenen.push(satir(h, { reason: "Model etiket vermedi", model: MODEL })); return; }
    const markaK = String(e.marka ?? "").toLowerCase(), urunK = String(e.urun ?? "").toLowerCase();
    const ortak = { model: MODEL, brand: String(e.marka ?? "").slice(0, 60), product: String(e.urun ?? "").slice(0, 80), topic: String(e.konu ?? "").slice(0, 40), kind: TUR[String(e.tur)] ?? String(e.tur ?? "").slice(0, 30), news_type: String(e.tip ?? "").slice(0, 30) };
    const haric = pazar.find((p) => p.grup === "Hariç" && (markaK === p.ad || urunK.includes(p.ad)));
    const kayit = pazar.find((p) => p.grup !== "Hariç" && (markaK === p.ad || urunK.includes(p.ad)));
    const grup = haric ? "Hariç" : kayit ? kayit.grup : "Listede yok";
    if (haric) { elenen.push(satir(h, { ...ortak, reason: "Hariç listesinde: " + haric.orj })); return; }
    if (["kampanya", "rehber"].includes(String(e.tur))) { elenen.push(satir(h, { ...ortak, reason: "Tür: " + TUR[String(e.tur)] })); return; }
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
  // Önceki çalıştırmalarda aynı olay kimliğiyle gelmiş haber varsa ona bağla
  const anahtarlar = [...olaylar.keys()].filter((a) => !a.startsWith("tekil-"));
  const mevcut = new Map<string, { id: number; other_sources: { name: string; link: string }[]; source_name: string }>();
  if (anahtarlar.length) {
    const { data } = await sb.from("tr_items").select("id,event_key,other_sources,source_name").in("event_key", anahtarlar)
      .neq("status", "elendi").gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString());
    (data ?? []).forEach((r: { id: number; event_key: string; other_sources: { name: string; link: string }[]; source_name: string }) => { if (!mevcut.has(r.event_key)) mevcut.set(r.event_key, r); });
  }
  const yeniAday: Record<string, unknown>[] = [];
  const goruldu: string[] = [];
  for (const [anahtar, g] of olaylar) {
    g.sort((x, y) => +(x.h.date ?? 0) - +(y.h.date ?? 0));
    const eski = mevcut.get(anahtar);
    if (eski) {
      const ek = g.map((x) => ({ name: x.h.source.name, link: x.h.link })).filter((x) => !eski.other_sources.some((o) => o.link === x.link));
      if (ek.length) await sb.from("tr_items").update({ other_sources: [...eski.other_sources, ...ek] }).eq("id", eski.id);
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

  try {
    await yaz([...yeniAday, ...elenen, ...belirsiz]);
    if (goruldu.length) await sb.from("tr_seen").upsert(goruldu.map((link) => ({ link })), { onConflict: "link", ignoreDuplicates: true });
  } catch (e) { hata = String((e as Error).message ?? e).slice(0, 300); }

  const ozet = {
    kaynak: kaynaklar?.length ?? 0, okunan: tumLinkler.length, yeni: gorulen.size, kural: onElenen.length + fazla.length,
    yapayZeka: islenen.size, aday: yeniAday.length, elenen: elenen.length, belirsiz: belirsiz.length,
    bekleyen: adaylar.length - islenen.size, hata, sure: Date.now() - bas,
  };
  await sb.from("tr_settings").upsert({ key: "son_toplama", value: { ...ozet, durum: "bitti", zaman: new Date().toISOString() } });
  console.log(JSON.stringify(ozet));
  return ozet;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const govde = await req.json().catch(() => ({}));
  const { data } = await sb.from("tr_settings").select("value").eq("key", "son_toplama").maybeSingle();
  const son = data?.value?.zaman ? Date.parse(data.value.zaman) : 0;
  if (Date.now() - son < 5 * 60_000 && !govde?.zorla) return Response.json({ atlandi: "Son 5 dakikada çalıştı" }, { headers: CORS });
  if (govde?.zorla && Date.now() - son < 60_000) return Response.json({ atlandi: "Az önce çalıştı, 1 dakika bekle" }, { headers: CORS });
  await sb.from("tr_settings").upsert({ key: "son_toplama", value: { ...(data?.value ?? {}), zaman: new Date().toISOString(), durum: "çalışıyor" } });
  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  EdgeRuntime.waitUntil(topla(sb).catch((e) => console.error("toplama hatası", e)));
  return Response.json({ basladi: true }, { status: 202, headers: CORS });
});
