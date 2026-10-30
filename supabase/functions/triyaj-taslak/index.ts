// Haber Masası: seçilen haberin kaynağını okur; ham Türkçe çeviri ya da Updated standardında haber taslağı üretir.
// Eski "Updated Triyaj" (Kod.gs: taslakHazirla_, ceviriGetir, gorselYaz_) mantığının karşılığı. Taslak Google Docs yerine Stüdyo'da (tr_drafts) durur.
// Çağıranlar:
//   - Stüdyo (giriş yapmış ekip üyesi): {item_id, tur} taslak/çeviri; {site:true, draft_id} panele (yeni site) gönder; {site_dene:true} bağlantı denemesi (yönetici).
//   - Zamanlanmış görev (10 dk'da bir, tr_oto_kick): {oto:true} en güçlü haberden birine otomatik taslak + panele taslak haber.
// Gizli bilgi (Supabase Secrets): GEMINI_API_KEY; panel (yeni site) için STUDIO_IMPORT_KEY (isteğe bağlı PANEL_URL, SITE_URL);
// isteğe bağlı stok fotoğraf anahtarları UNSPLASH_ACCESS_KEY, PIXABAY_API_KEY, PEXELS_API_KEY.
// Dosyalar: uslup.ts (yazım üslubu, insanlaştırma), puan.ts (öncelik puanı, ekranla ortak), secim.ts (otomatik taslak: haber ve editör seçimi), gorsel.ts (öne çıkan görsel), html.ts (Markdown → HTML, ekranla ortak), site.ts (yeni sitenin paneline gönderim; WordPress 23 Ekim 2026'da devreden çıktı).
// Yayın: main'e gelince Natro sunucusu kendiliğinden yükler (site deposu deploy/altyapi/studyo); dosyalar birlikte yüklenir. "Verify JWT" kapalı olmalı (üyelik kodda kontrol edilir; zamanlanmış görev anahtarsız çağırır).
import { createClient } from "npm:@supabase/supabase-js@2";
import { anahtarHatasi, anahtarlar, isaretle } from "./anahtar.ts";
import { KONTROL_SISTEM, USLUP_VARSAYILAN, yapayIzler } from "./uslup.ts";
import { ANA_SAYFA_ESIK, degerlendir } from "./puan.ts";
import { ayniHaber, editorSec, turAdaylari, OTO_VARSAYILAN, type Aday, type OtoAyar, type Profil } from "./secim.ts";
import { siteAyar, siteDene, siteGonder, siteIlgili, siteKapakEkle, siteTemizle, type Kategori } from "./site.ts";
import { adayListesi, commons, fluxIstem, kaynakDurumu, kucukResim, kuralSecim, openverse, resmiGorsel, SECIM_SISTEM, stokFoto, type GorselAday } from "./gorsel.ts";

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

/** Kaynak sitenin kendi etiketleri (article:tag, news_keywords, keywords) */
function metaEtiketler(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:article:tag|news_keywords|keywords|parsely-tags|sailthru\.tags)["'][^>]*>/gi)) {
    const c = m[0].match(/content=["']([^"']+)["']/i)?.[1];
    if (c) out.push(...coz(c).split(/[,;|]/).map((x) => x.trim()).filter((x) => x.length >= 2 && x.length <= 40));
  }
  return [...new Set(out)].slice(0, 15);
}

/** Makale metni + kaynak etiketleri (Fatih, 18 Ekim: kaynak meta verisinden etiket) */
async function kaynakOku(url: string, sinir: number): Promise<{ metin: string; etiketler: string[] }> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000);
  let ham = "";
  try { const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: c.signal, redirect: "follow" }); ham = r.ok ? await r.text() : ""; }
  catch { /* yedek okuma servisi */ } finally { clearTimeout(t); }
  const etiketler = metaEtiketler(ham.slice(0, 200_000));
  const dogrudan = htmlMetin(ham);
  if (dogrudan.length >= 600) return { metin: dogrudan.slice(0, sinir), etiketler };
  return { metin: await makaleCek(url, sinir), etiketler };
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

// Anahtar havuzu (30 Ekim 2026, göç 0052): anahtarlar sırayla; bir anahtarda bütün modeller kota (429) verirse o anahtar "kota dolu"
// işaretlenir ve aynı iş sıradaki anahtarla denenir. Hepsi biterse Groq yedeği. Anahtar seçimi anahtar.ts'te (bütün Gemini fonksiyonlarında aynı).
async function gemini(sistem: string, kullanici: string, modeller: string[], bitis = Date.now() + BUTCE_MS, resimler: { mime: string; b64: string; etiket?: string }[] = []) {
  const liste = await anahtarlar();
  if (!liste.length) throw new Error("GEMINI_API_KEY yok (Supabase Secrets)");
  let son = "";
  for (const a of liste) {
    const s = await geminiAnahtarla(a.deger, sistem, kullanici, modeller, bitis, resimler);
    if (s.sonuc) { await isaretle(a, "calisiyor"); return s.sonuc; }
    son = (liste.length > 1 ? a.etiket + " · " : "") + s.son;
    const ah = /→ 429/.test(s.son) && s.hepsiKota ? "kota_dolu" : s.gecersiz ? "gecersiz" : null;
    if (!ah) break;
    await isaretle(a, ah, s.son);
  }
  // Gemini kotası dolduysa ya da yanıt vermiyorsa aynı işi Groq'a yaptır (GROQ_API_KEY, Supabase Secrets)
  if (Deno.env.get("GROQ_API_KEY") && /geçersiz JSON|yanıt vermedi|→ (429|500|503)/.test(son)) {
    try { return await groq(sistem, kullanici, bitis); }
    catch (e) { son += " | Yedek (Groq): " + String((e as Error).message ?? e).slice(0, 200); }
  }
  throw new Error("Yapay zeka yanıt vermedi. " + son);
}

async function geminiAnahtarla(key: string, sistem: string, kullanici: string, modeller: string[], bitis: number, resimler: { mime: string; b64: string; etiket?: string }[]): Promise<{ sonuc?: { veri: Record<string, any>; model: string }; son: string; hepsiKota: boolean; gecersiz: boolean }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const kalan = () => bitis - Date.now();
  let son = "", hepsiKota = true, gecersiz = false;
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
            contents: [{ role: "user", parts: [{ text: kullanici }, ...resimler.flatMap((g, i) => [{ text: (g.etiket ?? `Resim ${i}`) + ":" }, { inline_data: { mime_type: g.mime, data: g.b64 } }])] }],
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
        if (veri) return { sonuc: { veri, model }, son, hepsiKota: false, gecersiz };
        son = model + " → geçersiz JSON döndü"; hepsiKota = false;
        continue;
      }
      if (r.status === 400 && dusunme && /thinking/i.test(govde)) { dusunme = false; deneme--; continue; }
      son = model + " → " + r.status + ": " + govde.slice(0, 200);
      const ah = anahtarHatasi(r.status, govde);
      if (ah !== "kota_dolu") hepsiKota = false;
      if (ah === "gecersiz") { gecersiz = true; return { son, hepsiKota, gecersiz }; }
      break;
    }
    if (/yanıt vermedi/.test(son)) hepsiKota = false;
    if (!/geçersiz JSON|yanıt vermedi|→ (429|500|503)/.test(son)) break;
  }
  return { son, hepsiKota, gecersiz };
}

// Groq (OpenAI uyumlu). Modeller sırayla denenir; her modelin kotası ayrıdır. Model kalkmışsa (404/400) sonrakine geçer.
const GROQ_MODELLER = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"]; // 28 Ekim 2026: Groq'un güncel listesi (llama ve qwen3-32b kalktı)
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
- Ters piramit: en önemli bilgi ilk paragrafta. TAM 3 adet H2 ara başlık, kısa paragraflar. Uzunluğu kaynakların zenginliği belirler (üsluptaki UZUNLUK kuralı): özet değil, gerektiği kadar ayrıntı.
- Birden fazla kaynak verildiyse hepsini oku ve birleştir: her kaynaktaki farklı ayrıntıyı kullan, tekrar etme; kaynaklar çelişiyorsa bunu belirt ve editor_notlari'na yaz. Kaynaklardan biri BAŞKA bir olayı anlatıyorsa (yanlış eşleşmiş) onu tamamen yok say ve editor_notlari'na "Kaynak N bu haberle ilgisiz" yaz.
- Spot en fazla 160 karakter.
- Başlık en fazla 70 karakter; ünlem (!) ve "şok", "flaş", "inanılmaz" kelimeleri yok. Sızıntı ya da söylenti haberinin başlığında "sızıntı", "sızdı" ya da "iddia" kelimelerinden biri geçer (sitenin yayın kuralı).
- kisa_cevap: okurun "ne oldu?" sorusuna 2-3 cümlelik doğrudan cevap (sitede "Kısa cevap" kutusu; arama motorları ve yapay zekâ özetleri bunu alır). Spotu tekrar etme.
- sizinti: yalnız haber sızıntı ya da söylentiyse doldur (resmi haberde boş bırak): bilinenler = kaynakta açıkça geçen bilgiler, bilinmeyenler = henüz belli olmayanlar (her biri kısa madde), kesinlik = "1" (zayıf söylenti) … "4" (çok güvenilir kaynak, birden fazla doğrulama).
- Etiketler: 2-4 adet, en önemliden başlayarak: önce markanın adı (Apple, Samsung, DJI…), sonra ürün ailesi (iPhone, Galaxy, PlayStation…), sonra ana konu (Yapay Zeka, Elektrikli Araç, Katlanabilir Telefon…). Model numarası, tek seferlik terim, özellik adı etiket olmaz (ör. "10000mAh", "M6", "Bokeh" olmaz). "haber", "teknoloji", "son dakika" gibi genel etiketleri ve kaynak sitenin/ajansın adını etiket yapma.
- Başlık merak uyandırsın ama her iddiasının kaynakta birebir karşılığı olsun; abartı, "şok", tık tuzağı yok.
- Haber ajansı titizliği: rakamları, özel adları, tarihleri kaynaktaki gibi aktar; tarafsız yaz, reklam dili kullanma.
- Doğrulanmamış bilgiyi "iddiaya göre" veya "sızıntıya göre" diye açıkça işaretle.
- Fiyatları kaynaktaki para biriminde ver, TL'ye çevirme.
- Kaynakta olmayan bilgi, rakam veya tarih ekleme. Emin olmadığın şeyi editor_notlari'na yaz.
- Haber resmi değilse (sızıntı, söylenti, mod) dikkat_edilmesi_gerekenler alanını doldur; resmi ise boş dizi bırak.
- editor_sorulari: editörün habere kendi uzmanlığını ve Türkiye bağlamını katabilmesi için 2-3 somut soru (örn. Türkiye'de satış durumu, önceki modelle kendi deneyimi, sahada kullanım).
- dogrulama: editörün yayından önce kontrol etmesi gereken iddialar; her biri için hangi kaynakta geçtiği.
- gorsel: oneri = telif riski olmayan resmi görsel öner (üreticinin basın sayfası veya basın kiti); URL uydurma, sadece nereden bulunacağını yaz. alt_text = Türkçe alt text. aramalar = stok fotoğraf sitesinde aranacak TAM 3 farklı İngilizce arama dizisi, her biri 2-4 kelime: (1) haberin konusunu temsil eden somut ürün kategorisi/sahne (örn. mirrorless camera on tripod), (2) kullanım sahnesi (örn. videographer filming outdoors), (3) detay/atmosfer (örn. camera sensor close up). Marka veya model adı yazma, haberin konusuyla doğrudan ilgili ol, genel "technology" gibi boş kelimelerden kaçın. ai_istem = yapay zekâ görsel üreticisi (Flux) için 1-2 cümlelik İngilizce istem: haberin konusunu gösteren gerçekçi bir sahne/nesne; gerçek ürünü birebir çizmeye çalışma, marka/logo/yazı isteme.
- Teknik terimler gerektiğinde İngilizce kalabilir.
- dikkat_edilmesi_gerekenler editöre gider, metne girmez; metnin kendisinde de doğrulanmamış bilgiyi açıkça işaretle.

SİTENİN ÜSLUBU (buna birebir uy):
${uslup}

Sadece şu biçimde geçerli JSON döndür:
{"focus_keyword":"","title_tag":"(en fazla 60 karakter)","slug":"turkce-karaktersiz-tireli","meta_description":"(en fazla 155 karakter)","kategori":"","etiketler":["2-4 adet"],"baslik":"","spot":"1-2 cümle","kisa_cevap":"2-3 cümle","sizinti":{"bilinenler":[""],"bilinmeyenler":[""],"kesinlik":"1-4"},"govde":[{"h2":"","paragraflar":[""]}],"dikkat_edilmesi_gerekenler":[""],"editor_sorulari":[""],"dogrulama":[""],"kaynaklar":["kaynak adı"],"gorsel":{"oneri":"","alt_text":"","aramalar":["","",""],"ai_istem":""},"editor_notlari":[""]}`;

const CEVIRI_SISTEM = 'Sen bir çevirmensin. Verilen İngilizce teknoloji haberini paragraf yapısını koruyarak eksiksiz ve sadık biçimde Türkçeye çevir. Yorum, özet veya ekleme yapma. Sadece şu JSON\'u döndür: {"ceviri":"paragraflar arasında \\n\\n olan metin"}';

type Sb = ReturnType<typeof createClient>;
type IsSecenek = { oto?: boolean };

const istanbulGun = () => new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 10);
const istanbulZaman = () => new Date().toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 16);

/** Sitedeki kategoriler (panelden okunmuş ve saklanmış liste); yoksa boş. Yapay zekâ kategoriyi bu listeden seçer. */
async function kayitliKategoriler(sb: Sb): Promise<Kategori[]> {
  const { data } = await sb.from("tr_settings").select("value").eq("key", "site_kategoriler").maybeSingle();
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
      resmiGorsel({ linkler, marka: it.brand, basin: ((bk ?? []) as { url: string }[]).map((x) => x.url), urun: it.product, baslik: it.title }, iz),
      commons(urun, 6, iz), openverse(urun, 4, iz), aramalar[0] ? openverse(aramalar[0], 3, iz) : Promise.resolve([]),
      aramalar[0] ? stokFoto(aramalar[0], 3, anahtar) : Promise.resolve([]), aramalar[1] ? stokFoto(aramalar[1], 2, anahtar) : Promise.resolve([]),
      aramalar[0] ? commons(aramalar[0], 3, iz) : Promise.resolve([]), aramalar[1] ? openverse(aramalar[1], 2, iz) : Promise.resolve([]),
    ]);
    const goruldu = new Set<string>();
    const adaylar = [...r1, ...c1, ...o1, ...o2, ...c2, ...o3, ...s1, ...s2].filter((a) => a.buyuk && !goruldu.has(a.buyuk) && goruldu.add(a.buyuk)).slice(0, 10);
    if (!adaylar.length) {
      const durum = Object.entries(kaynakDurumu).map(([k, v]) => `${k}: ${v}`).join(", ");
      return { ...bos, neden: `Uygun fotoğraf bulunamadı (resmi ${r1.length} aday; ${iz.join("; ")}${durum ? "; " + durum : ""}).` };
    }
    let veri: Record<string, unknown>;
    try {
      // Küçük modelden başlar; kotası dolmuşsa taslağı yazan büyük modellere geçer
      // Yapay zekâ adayların kendisini de görür (yazılı banner, logo, kolaj elensin; Fatih 18 Ekim). Küçük kopya alınamayan aday sadece açıklamayla değerlendirilir.
      const resimler = await Promise.all(adaylar.map((a) => kucukResim(a.thumb || a.buyuk)));
      const gorunen = resimler.map((g, i) => g ? i : -1).filter((i) => i >= 0);
      ({ veri } = await gemini(SECIM_SISTEM, `Haber başlığı: ${baslik}\nÜrün: ${urun || "-"}\nOrijinal başlık: ${it.title}\n\nAdaylar:\n${adayListesi(adaylar)}\n\nResmi gösterilen adaylar: ${gorunen.join(", ") || "yok"} (resimler sırayla "Aday N:" etiketiyle ekte).`,
        ["gemini-3.5-flash-lite", ...MODELLER], Math.min(bitis - 30_000, Date.now() + 30_000), gorunen.map((i) => ({ ...resimler[i]!, etiket: `Aday ${i}` }))));
    } catch {
      const k = kuralSecim(adaylar, urun);
      return { secilen: k, adaylar: adaylar.slice(0, 8), neden: k ? "Yapay zekâ yanıt vermedi; ürün adıyla birebir eşleşen serbest lisanslı fotoğraf seçildi." : "Yapay zekâ yanıt vermedi ve ürün adıyla eşleşen fotoğraf yok; görsel eklenmedi." };
    }
    const i = Number(veri.secim);
    const o = veri.odak as { x?: unknown; y?: unknown } | undefined;
    const yz = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50; };
    const odak = o && typeof o === "object" ? { x: yz(o.x), y: yz(o.y) } : undefined;
    const secilen = Number.isInteger(i) && i >= 0 && i < adaylar.length ? { ...adaylar[i], ...(odak ? { odak } : {}) } : null;
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

    // Kümedeki bütün kaynaklar (Fatih, 18 Ekim): asıl haber + en fazla 4 diğer kaynak, paralel okunur
    // Türkiye'deki haber sitelerinden metin alınmaz (Fatih, 18 Ekim: telif; basın bültenleri hariç)
    const diger = ((it.other_sources ?? []) as { name: string; link: string }[]).filter((o) => o.link && o.link !== it.link && !turkHaberSitesi(o.link)).slice(0, 4);
    const [ana, ...ekler] = await Promise.all([kaynakOku(it.link, 14000), ...diger.map((o) => kaynakOku(o.link, 8000))]);
    const metinler = [`KAYNAK 1 (${it.source_name}) ${it.link}\n` + (ana.metin.length >= 300 ? ana.metin : `(Tam metin alınamadı. Başlık: ${it.title})`)];
    ekler.forEach((e, i) => { if (e.metin.length >= 300) metinler.push(`KAYNAK ${metinler.length + 1} (${diger[i].name}) ${diger[i].link}\n` + e.metin); });
    // Kaynak sitelerin kendi etiketleri (meta: article:tag, news_keywords, keywords): etiket (panelde varlık) adayı
    const kaynakEtiket = [...new Set([ana, ...ekler].flatMap((e) => e.etiketler))].slice(0, 25);
    // Sitemizin arşivinden ilgili yazılar (iç link adayı)
    const ilgili = await siteIlgili([[it.brand, it.product].filter(Boolean).join(" "), it.product, it.brand].filter(Boolean)).catch(() => []);
    await nabiz();
    // Kategori sitedeki listeden seçilsin (liste panelden okununca saklanır; yoksa serbest yazar)
    const kategoriler = await kayitliKategoriler(sb);
    const katSatiri = kategoriler.length ? `\nKATEGORİ: "kategori" alanına SADECE şu listeden birini aynen yaz: ${kategoriler.map((k) => k.name).join(" | ")}\n` : "";
    const istem = `UYARI: Aşağıdaki özet ve tür etiketi otomatik üretildi, hatalı olabilir. Haberin resmi mi, sızıntı mı, söylenti mi olduğunu ve ürünün piyasada olup olmadığını SADECE kaynak metne bakarak kendin belirle.
Haber özeti (sistemden): ${it.event}
Marka: ${it.brand} · Tür: ${it.kind} · Asıl kaynak: ${it.origin || it.source_name}
Orijinal başlık: ${it.title}
${katSatiri}
KAYNAK SİTELERİN ETİKETLERİ (etiket seçerken öncelik ver; Türkçe yaygın karşılığı varsa onu yaz): ${kaynakEtiket.join(", ") || "-"}

SİTEMİZDEN İLGİLİ YAZILAR (iç link için; sadece bunlar):
${ilgili.length ? ilgili.map((x) => `- ${x.baslik} — ${x.link}`).join("\n") : "- yok (iç link verme)"}

${metinler.join("\n\n---\n\n")}`;

    const uslup = await uslupAl(sb);
    await nabiz();
    const { veri: t, model } = await gemini(taslakSistem(uslup), istem, MODELLER, bitis);
    await nabiz();
    const notlar: string[] = metinListe(t.editor_notlari);
    if (ana.metin.length < 300) notlar.push("Kaynak sitenin tam metni otomatik alınamadı; taslak kısıtlı bilgiyle yazıldı. Kaynağı mutlaka oku.");
    const okunan = 1 + ekler.filter((e) => e.metin.length >= 300).length;
    if (diger.length) notlar.push(`${okunan}/${diger.length + 1} kaynak okunarak yazıldı.`);

    // Gövde: ara başlıklar + editör yorumu yeri
    const parcalar: string[] = [];
    for (const b of t.govde ?? []) {
      if (b?.h2) parcalar.push("## " + b.h2);
      for (const p of b?.paragraflar ?? []) if (p) parcalar.push(String(p));
    }
    // "Dikkat edilmesi gerekenler" sitedeki yazılarda yok: editör notlarına gider, metne girmez
    const dikkat = metinListe(t.dikkat_edilmesi_gerekenler);
    if (dikkat.length) notlar.unshift(...dikkat.map((x: string) => "Dikkat: " + x));
    parcalar.push("**[EDİTÖR YORUMU: Buraya kendi değerlendirmeni ekle]**");
    const baslik = String(t.baslik ?? "");
    const spot = spotKisalt(String(t.spot ?? ""));
    const govdeMd = linkTemizle(parcalar.join("\n\n"), ilgili.map((x) => x.link));

    // Kaynaklar (panelde haberin "Kaynaklar" listesine gider; ilk satır birincil): ilk yazan + diğerleri + asıl kaynak
    const kaynaklar = [`${it.source_name} — ${it.link}`, ...((it.other_sources ?? []) as { name: string; link: string }[]).filter((o) => o.link !== it.link).map((o) => `${o.name} — ${o.link}`)];
    if (it.origin) kaynaklar.push("Asıl kaynak: " + it.origin);

    // Görsel önerisi (basın sayfası bağlantısı, aramalar, yapay zekâ istemi); öne çıkan görseli kalite kontrol aşaması seçer
    const g = t.gorsel ?? {};
    let basin: { url: string; kesin: boolean } | null = null;
    if (it.brand) {
      const { data: bk } = await sb.from("tr_press").select("url").ilike("brand", it.brand).limit(1);
      basin = bk?.[0]?.url ? { url: bk[0].url, kesin: true } : { url: "https://www.google.com/search?q=" + encodeURIComponent(it.brand + " official newsroom press images"), kesin: false };
    }
    const aramalar: string[] = [].concat(g.aramalar ?? g.arama ?? []).filter(Boolean).slice(0, 3);

    const { data: yeni } = await sb.from("tr_drafts").insert({
      item_id: itemId, author: kullanici, model, auto: !!sec.oto,
      title: baslik, spot, body: govdeMd,
      seo: { focus: t.focus_keyword ?? "", title_tag: t.title_tag ?? "", slug: t.slug ?? "", meta: t.meta_description ?? "", kategori: t.kategori ?? "", etiketler: etiketSuz(metinListe(t.etiketler), [it.source_name, ...diger.map((o) => o.name)]),
        kisa_cevap: String(t.kisa_cevap ?? "").trim(),
        sizinti: { bilinenler: metinListe(t.sizinti?.bilinenler), bilinmeyenler: metinListe(t.sizinti?.bilinmeyenler), kesinlik: String(t.sizinti?.kesinlik ?? "").replace(/\D/g, "").slice(0, 1) } },
      sources: kaynaklar.join("\n"), image_note: String(g.oneri ?? ""), editor_note: notlar.join("\n"),
      questions: metinListe(t.editor_sorulari), checks: metinListe(t.dogrulama), notes: notlar,
      image: { oneri: g.oneri ?? "", alt_text: g.alt_text ?? "", aramalar, ai_istem: g.ai_istem ?? "", basin, stok: [] },
      // Son kalite kontrolü ayrı çağrıda (süre sınırı): kaynak metinleri ve iç link adayları onun için saklanır
      qc_state: "bekliyor", qc_at: new Date().toISOString(),
      qc: { kaynak: metinler.join("\n\n---\n\n").slice(0, 30000), ilgili, tam_metin: ana.metin.length >= 300, ilk_govde: govdeMd },
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
      await otoOzet(sb, { durum: "Taslak yazıldı · kalite kontrolü sürüyor", haber: kartBaslik, editor: kullanici ? ad : "" });
    }
    // Kalite kontrolü + görsel + (otomatikse) panele gönderim: ayrı çağrı, kendi süre bütçesiyle
    if (yeni?.id) await kontrolBaslat(yeni.id);
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

// ---------- Son kalite kontrolü (ARCHITECTURE.md, 18 Ekim 2026) ----------
// Taslak yazıldıktan hemen sonra ayrı bir çağrıyla çalışır (her çağrının kendi ~150 sn sınırı var):
// 1) kaynaklara karşı doğrulama + düzeltme + insanlaştırma (uslup.ts KONTROL_SISTEM), 2) öne çıkan görsel (yoksa Flux isteği),
// 3) panele taslak haber olarak gönderim (otomatik ve elle hazırlanan taslaklar). Editör bu arada metni değiştirdiyse düzeltme metne uygulanmaz, notlara yazılır.

const spotKisalt = (s: string, n = 160) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const kes = t.slice(0, n);
  const son = Math.max(kes.lastIndexOf(". "), kes.lastIndexOf("! "), kes.lastIndexOf("? "));
  return son > 120 ? kes.slice(0, son + 1) : kes.slice(0, kes.lastIndexOf(" ")).replace(/[,;:]$/, "") + "…";
};

/** Türkiye'deki haber siteleri (alan adı .tr ya da bilinen yayınlar). Basın bülteni sayfaları (marka siteleri) bu kapsamda değil. */
const TURK_HABER = /^(https?:\/\/)?([a-z0-9-]+\.)*(haberturk|cnnturk|trthaber|ensonhaber|haberler|mynet|webtekno|shiftdelete|donanimhaber|technopat|onedio|internethaber|haber7|bloomberght|t24|odatv|sozcu|aksam|yenisafak|sabah|milliyet|hurriyet|ntv|aa|chip|log|teknoblog|megabayt)\.(com|net|org|tv|com\.tr)(\/|$|\?)/i;
const turkHaberSitesi = (u: string) => { try { const h = new URL(u).hostname; return /\.tr$/i.test(h) && !/\.(gov|edu)\.tr$/i.test(h) && !/news\.|newsroom|basin|press/i.test(u) || TURK_HABER.test(u); } catch { return false; } };

/** Genel etiketler ve kaynak site/ajans adları etiket olmaz */
const GENEL_ETIKET = /^(haber|haberler|son dakika|gündem|teknoloji|teknoloji haberleri|news|tech|technology|güncel|bilim|bilim-teknoloji|bilim teknoloji)$/i;
function etiketSuz(etiketler: string[], kaynaklar: string[]): string[] {
  const k = kaynaklar.map((x) => x.toLocaleLowerCase("tr").replace(/^gündem · /, "").replace(/\s*(bilim-teknoloji|bilim teknoloji)$/, "").trim()).filter(Boolean);
  return etiketler.map((e) => e.trim()).filter((e) => e && !GENEL_ETIKET.test(e) && !k.some((x) => { const l = e.toLocaleLowerCase("tr"); return l === x || x.includes(l) && l.length >= 4; })).slice(0, 7);
}

/** Sadece izin verilen (sitemizin arşivinden gelen) bağlantılar kalır; diğerleri düz metne çevrilir */
function linkTemizle(md: string, izinli: string[]): string {
  return md.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, metin, adres) => izinli.includes(adres) ? m : metin);
}

async function uslupAl(sb: Sb): Promise<string> {
  const { data: us } = await sb.from("tr_settings").select("value").eq("key", "yazim_uslubu").maybeSingle();
  return typeof us?.value === "string" && us.value.trim().length > 50 ? us.value : USLUP_VARSAYILAN;
}

/** Kalite kontrol çağrısını başlatır (fonksiyon kendini çağırır; yanıtı beklemez). Ulaşamazsa otomatik tur 3 dk sonra devralır. */
async function kontrolBaslat(id: number) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 4_000);
  try {
    await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/triyaj-taslak", {
      method: "POST", signal: c.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kontrol: id }),
    });
  } catch { /* zamanlanmış tur devralır */ } finally { clearTimeout(t); }
}

async function kontrol(sb: Sb, id: number) {
  const bitis = Date.now() + BUTCE_MS;
  // Kilit: sadece bekleyen ya da 4 dakikadır asılı kalmış kontrol alınır
  const asili = new Date(Date.now() - 4 * 60_000).toISOString();
  const { data: kilit } = await sb.from("tr_drafts").update({ qc_state: "calisiyor", qc_at: new Date().toISOString() })
    .eq("id", id).or(`qc_state.eq.bekliyor,and(qc_state.eq.calisiyor,qc_at.lt.${asili})`).select("*");
  const t = kilit?.[0];
  if (!t) return { atlandi: "Kontrol beklemiyor" };
  const qc = (t.qc ?? {}) as { kaynak?: string; ilgili?: { baslik: string; link: string }[]; tam_metin?: boolean; ilk_govde?: string };
  const { data: it } = await sb.from("tr_items").select("*").eq("id", t.item_id ?? 0).maybeSingle();
  const notlar: string[] = [];
  let durum = "";
  try {
    // 1) Doğrulama + düzeltme + insanlaştırma
    let { title: baslik, spot, body: govde } = t as { title: string; spot: string; body: string };
    let sorunlar: string[] = [];
    if (qc.kaynak && bitis - Date.now() > 60_000) {
      try {
        const uslup = await uslupAl(sb);
        const { veri: k } = await gemini(KONTROL_SISTEM(uslup),
          `KAYNAK METİNLER:\n${qc.kaynak}\n\n===\n\nTASLAK:\n${JSON.stringify({ baslik, spot, govde })}`,
          MODELLER, Math.min(bitis - 45_000, Date.now() + 55_000));
        sorunlar = metinListe(k.sorunlar);
        const yeniGovde = linkTemizle(String(k.govde ?? ""), (qc.ilgili ?? []).map((x) => x.link));
        const araBaslik = (x: string) => (x.match(/^## /gm) ?? []).length;
        // Güvenlik: editör yorumu yeri duruyor, ara başlık sayısı 2-4, metin özetlenmemiş
        if (yeniGovde.includes("[EDİTÖR YORUMU") && araBaslik(yeniGovde) >= 2 && araBaslik(yeniGovde) <= 4 && yeniGovde.length > govde.length * 0.75) {
          govde = yeniGovde; baslik = String(k.baslik ?? "") || baslik; spot = spotKisalt(String(k.spot ?? "") || spot);
          durum = "kontrol edildi";
        } else { notlar.push("Kalite kontrolünün önerdiği metin güvenlik denetiminden geçmedi (yapı bozuldu ya da kısaldı); ilk taslak korundu."); durum = "kontrol uygulanmadı"; }
        if (k.guven === "dusuk") notlar.push("Kalite kontrolü: güven DÜŞÜK, kaynakları mutlaka oku.");
      } catch (e) { notlar.push("Kalite kontrolü çalışmadı (" + String((e as Error).message ?? e).slice(0, 100) + "); metni kaynaklarla sen karşılaştır."); durum = "kontrol çalışmadı"; }
    }
    // Önem (10'luk) ve ana sayfa adaylığı editöre not olarak
    const d = it ? degerlendir(it) : null;
    if (d && d.puan >= ANA_SAYFA_ESIK) notlar.unshift(`Ana sayfa adayı: önem ${d.onem.toLocaleString("tr")}/10 (${d.gerekce.join(", ")}).`);
    const kalanIz = yapayIzler([baslik, spot, govde].join("\n"));
    if (kalanIz.length) notlar.push("Metinde hâlâ yapay zekâ kokan ifadeler var: " + kalanIz.join(", "));
    // Editör bu arada metni değiştirdiyse üzerine yazma
    const { data: simdi } = await sb.from("tr_drafts").select("body,editor_note,notes").eq("id", id).single();
    const degismedi = simdi?.body === t.body;
    const kontrolNot = [...sorunlar.map((x) => "Kontrol: " + x), ...notlar];
    if (!degismedi && durum === "kontrol edildi") kontrolNot.unshift("Kalite kontrolü bittiğinde metni sen değiştirmiştin; düzeltmeler metne uygulanmadı, aşağıdaki sorunlara bak.");
    await sb.from("tr_drafts").update({
      ...(degismedi ? { title: baslik, spot, body: govde } : {}),
      editor_note: [String(simdi?.editor_note ?? ""), ...kontrolNot].filter(Boolean).join("\n"),
      notes: [...((simdi?.notes ?? []) as string[]), ...kontrolNot],
      qc: { ...qc, kaynak: undefined, sorunlar, durum, onem: d?.onem ?? null, ana_sayfa: !!d && d.puan >= ANA_SAYFA_ESIK, bitti: new Date().toISOString() },
    }).eq("id", id);

    // 2) Öne çıkan görsel (yoksa Flux isteği)
    const img = (t.image ?? {}) as Record<string, unknown> & { aramalar?: string[]; ai_istem?: string; secilen?: GorselAday | null };
    if (it && !img.secilen) {
      const oneCikan = await gorselSec(sb, it, baslik || it.title, img.aramalar ?? [], bitis);
      const flux = !oneCikan.secilen ? { durum: "bekliyor", istem: fluxIstem(String(img.ai_istem || baslik)), istendi: new Date().toISOString() } : null;
      await sb.from("tr_drafts").update({ image: { ...img, secilen: oneCikan.secilen, gorsel_adaylar: oneCikan.adaylar, gorsel_neden: oneCikan.neden, ...(flux ? { flux } : {}) } }).eq("id", id);
    }

    // 3) Panele taslak haber olarak: otomatik ve elle hazırlanan bütün taslaklar (Fatih, 23 Ekim 2026: "hazırlayınca panelde görünsün").
    //    Bağlantı kuruluysa, ayar açıksa, kaynağın tam metni okunduysa. Sonradan Stüdyo'da düzeltilirse "Paneldeki taslağı güncelle".
    let siteDurum = "Sadece Stüdyo'da";
    const ayar = await otoAyar(sb);
    if (ayar.site && siteAyar()) {
      if (!qc.tam_metin) { await sb.from("tr_drafts").update({ site_hata: "Kaynağın tam metni alınamadığı için panele otomatik gönderilmedi. Kontrol edip elle gönder." }).eq("id", id); siteDurum = "tam metin yok, gönderilmedi"; }
      else if (bitis - Date.now() < 35_000) { await sb.from("tr_drafts").update({ site_bekliyor: true }).eq("id", id); siteDurum = "panele sonraki turda gidecek"; }
      else { const r = await siteGonder(sb, id, { kategoriSec }); siteDurum = r.ok ? "panele taslak olarak gitti" : "Panel hatası: " + r.hata; }
    }
    if (t.auto) {
      const { data: son } = await sb.from("tr_drafts").select("image,site_id").eq("id", id).maybeSingle();
      const im = (son?.image ?? {}) as { secilen?: unknown; flux?: unknown };
      const gDurum = im.secilen ? (son?.site_id ? "görsel kapak oldu" : "görsel seçildi") : im.flux ? "görsel Flux'ta üretilecek" : "görselsiz";
      await otoOzet(sb, { durum: `Taslak hazır · ${durum || "kontrolsüz"} · ${siteDurum} · ${gDurum}`, haber: baslik });
    }
    await sb.from("tr_drafts").update({ qc_state: "tamam" }).eq("id", id);
    return { ok: true, durum };
  } catch (e) {
    await sb.from("tr_drafts").update({ qc_state: "hata", editor_note: [String(t.editor_note ?? ""), "Kalite kontrolü hata verdi: " + String((e as Error).message ?? e).slice(0, 200)].filter(Boolean).join("\n") }).eq("id", id);
    return { hata: String(e) };
  }
}

// ---------- Flux (Fatih'in bilgisayarında çevrimdışı görsel üretimi; scripts/flux-isci) ----------
// İşçi FLUX_TOKEN ile gelir: bekleyen işleri alır, ürettiği görseli yükler. Token Supabase Secrets'ta ve işçinin yerel ayarında.
async function fluxIsler(sb: Sb) {
  const { data } = await sb.from("tr_drafts").select("id,title,image").eq("image->flux->>durum", "bekliyor").order("id", { ascending: false }).limit(5);
  return ((data ?? []) as { id: number; title: string; image: { flux?: { istem?: string } } }[]).map((d) => ({ id: d.id, baslik: d.title, istem: d.image?.flux?.istem ?? "" }));
}

async function fluxYukle(sb: Sb, id: number, b64: string, mime: string) {
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) return { hata: "Görsel türü desteklenmiyor" };
  const veri = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (veri.byteLength > 8_000_000) return { hata: "Görsel çok büyük" };
  const yol = `flux/${id}-${Date.now()}.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
  const y = await sb.storage.from("haber-gorsel").upload(yol, veri, { contentType: mime, upsert: true });
  if (y.error) return { hata: "Depolamaya yüklenemedi: " + y.error.message };
  const url = sb.storage.from("haber-gorsel").getPublicUrl(yol).data.publicUrl;
  const { data: t } = await sb.from("tr_drafts").select("image,site_id").eq("id", id).single();
  const img = (t?.image ?? {}) as Record<string, unknown> & { secilen?: GorselAday | null; flux?: Record<string, unknown> };
  const secilen: GorselAday = { kaynak: "Yapay zekâ (Flux)", sayfa: url, buyuk: url, thumb: url, yazar: "Updated (Flux)", lisans: "Yapay zekâ üretimi", aciklama: String(img.flux?.istem ?? ""), w: 1344, h: 768 };
  // Elle seçilmiş/yüklenmiş görsel varsa ona dokunulmaz; Flux görseli sadece görselsiz taslağa konur
  const bos = !img.secilen;
  await sb.from("tr_drafts").update({ image: { ...img, ...(bos ? { secilen, gorsel_neden: "Uygun fotoğraf bulunamadı; Flux ile üretildi (yazısız). Yayından önce kontrol et." } : {}), flux: { ...(img.flux ?? {}), durum: "tamam", url, bitti: new Date().toISOString() } } }).eq("id", id);
  if (bos && t?.site_id) return { ok: true, url, site: await siteKapakEkle(sb, id) };
  return { ok: true, url };
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
  const v = (data?.value ?? {}) as Partial<OtoAyar> & { wordpress?: boolean };
  // Eski kayıtta ayar "wordpress" adıyla duruyor (23 Ekim 2026'ya kadar): yeni ayar yoksa onun değeri geçerli
  return { ...OTO_VARSAYILAN, ...v, site: v.site ?? v.wordpress ?? OTO_VARSAYILAN.site };
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

  // 0) Kalite kontrolü başlatılamamış ya da yarıda kalmış taslaklar (en fazla 2, arka planda)
  const { data: kontrolBekleyen } = await sb.from("tr_drafts").select("id")
    .or(`and(qc_state.eq.bekliyor,qc_at.lt.${new Date(Date.now() - 3 * 60_000).toISOString()}),and(qc_state.eq.calisiyor,qc_at.lt.${new Date(Date.now() - 5 * 60_000).toISOString()})`).limit(2);
  const arkaPlan: Promise<unknown>[] = ((kontrolBekleyen ?? []) as { id: number }[]).map((k) => kontrol(sb, k.id).catch(() => null));

  // 1) Önceki turda süre yetmediği için panele gidemeyen otomatik taslaklar (kontrolü bitmiş olanlar)
  if (ayar.site && siteAyar()) {
    const { data: bekleyen } = await sb.from("tr_drafts").select("id").eq("site_bekliyor", true).is("site_id", null).eq("qc_state", "tamam").limit(3);
    for (const b of bekleyen ?? []) { await sb.from("tr_drafts").update({ site_bekliyor: false }).eq("id", b.id); await siteGonder(sb, b.id, { kategoriSec }); }
  }

  // 1b) Panelde birikme: kimsenin dokunmadığı eski otomatik taslaklar panelden kaldırılır (saatte bir, ilk turda)
  if (ayar.panel_sure_gun > 0 && siteAyar() && new Date().getUTCMinutes() < 10) await siteTemizle(sb, ayar.panel_sure_gun).catch((e) => console.error("siteTemizle", e));

  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  if (arkaPlan.length) EdgeRuntime.waitUntil(Promise.all(arkaPlan));

  // 2) Günlük sınır (İstanbul günü; Türkiye yıl boyu UTC+3)
  const gunBasi = istanbulGun() + "T00:00:00+03:00";
  const { count: bugun } = await sb.from("tr_drafts").select("id", { count: "exact", head: true }).eq("auto", true).gte("created_at", gunBasi);
  if ((bugun ?? 0) >= ayar.gunluk) { await ozet({ durum: `Günlük sınır doldu (${bugun}/${ayar.gunluk})`, bugun }); return { atlandi: "Günlük sınır" }; }

  // 3) Aday: havuzda, kimse almamış, daha önce otomatik denenmemiş, iş sürmüyor, son 24 saatte düşmüş
  const { data: havuz } = await sb.from("tr_items")
    .select("id,brand,topic,product,news_type,kind,source_name,turkey,other_sources,published_at,created_at,title,event,event_key,trend")
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
    const editor = ayar.ata ? editorSec(secim.h, (prof ?? []) as Profil[], musait, yuk) : null; // atama kapalıysa sahipsiz (bildirim gitmez)
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

  // Kalite kontrol aşaması (fonksiyonun kendisi çağırır; sadece "bekliyor" durumundaki taslağa iş yapar, girdisi taslak numarası)
  if (govde?.kontrol) {
    // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
    EdgeRuntime.waitUntil(kontrol(sb, Number(govde.kontrol)).catch((e) => console.error("kontrol", e)));
    return Response.json({ basladi: true }, { status: 202, headers: CORS });
  }

  // Flux işçisi (Fatih'in bilgisayarı): FLUX_TOKEN ile; token tanımlı değilse kapalı
  if (govde?.flux) {
    const tok = Deno.env.get("FLUX_TOKEN");
    if (!tok || govde.token !== tok) return Response.json({ hata: "Yetkisiz" }, { status: 401, headers: CORS });
    if (govde.flux === "isler") return Response.json({ isler: await fluxIsler(sb) }, { headers: CORS });
    if (govde.flux === "yukle") return Response.json(await fluxYukle(sb, Number(govde.id), String(govde.b64 ?? ""), String(govde.mime ?? "image/jpeg")), { headers: CORS });
    if (govde.flux === "hata") {
      const { data: t } = await sb.from("tr_drafts").select("image").eq("id", Number(govde.id)).single();
      const img = (t?.image ?? {}) as Record<string, unknown> & { flux?: Record<string, unknown> };
      await sb.from("tr_drafts").update({ image: { ...img, flux: { ...(img.flux ?? {}), durum: "hata", hata: String(govde.mesaj ?? "").slice(0, 200) } } }).eq("id", Number(govde.id));
      return Response.json({ ok: true }, { headers: CORS });
    }
    return Response.json({ hata: "Bilinmeyen istek" }, { status: 400, headers: CORS });
  }

  const auth = req.headers.get("Authorization") ?? "";
  const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return Response.json({ hata: "Giriş gerekli" }, { status: 401, headers: CORS });
  const { data: p } = await sb.from("profiles").select("id,name,is_admin").eq("id", u.user.id).maybeSingle();
  if (!p) return Response.json({ hata: "Ekip üyesi değil" }, { status: 403, headers: CORS });

  // Panel (yeni site) bağlantısını dene (yönetici)
  if (govde?.site_dene) {
    if (!p.is_admin) return Response.json({ hata: "Sadece yönetici" }, { status: 403, headers: CORS });
    return Response.json(await siteDene(sb), { headers: CORS });
  }
  // Taslağı panele gönder (ekip üyesi)
  if (govde?.site) {
    if (!govde.draft_id) return Response.json({ hata: "draft_id gerekli" }, { status: 400, headers: CORS });
    const r = await siteGonder(sb, Number(govde.draft_id), { zorla: !!govde.zorla, kategoriSec });
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
