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
import { CLAUDE_MODEL, claudeJson, SECIM_SEMA } from "./claude.ts";
import { markaYazimi } from "./html.ts";
import { kullanilabilir, MODEL_AD, modelListesi, uret, type Uretilen, type UretimModeli } from "./uretim.ts";
import { VIDEO_SISTEM, videoAdaylari } from "./video.ts";
import { ARA_SISTEM, araAdaylar, bolumler } from "./ara.ts";
import { KONTROL_SISTEM, USLUP_VARSAYILAN, yapayIzler } from "./uslup.ts";
import { ANA_SAYFA_ESIK, degerlendir } from "./puan.ts";
import { ayniHaber, editorSec, turAdaylari, OTO_VARSAYILAN, type Aday, type OtoAyar, type Profil } from "./secim.ts";
import { siteAyar, siteDene, siteGonder, siteIlgili, siteKapakEkle, siteTemizle, yayinEsitle, yzKutuphane, yzTemizle, type Kategori } from "./site.ts";
import { adayListesi, commons, kaynakGorselleri, fluxIstem, kaynakDurumu, kucukResim, kuralSecim, openverse, resmiGorsel, SECIM_SISTEM, stokFoto, URETIM_DENETIM, type GorselAday } from "./gorsel.ts";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const MODELLER = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]; // 31 Ekim 2026: 3.8-flash ücretsiz katmanda her istekte 429 (sayaç, göç 0055); çıkarıldı // sırayla denenir (eski GEMINI_MODELLER)

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
// Arka plan işleri (EdgeRuntime.waitUntil) istek süresine (150 sn) değil işçi süresine (400 sn, functions/main) bağlı; Claude'a yetecek süre
// verilsin, süre yetmediği için Gemini'ye düşülmesin (4 Kasım 2026, kullanıcı: "optimum ücretlerde işi Gemini'ye bırakmamak").
const ISLE_BUTCE_MS = 240_000, KONTROL_BUTCE_MS = 270_000;

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

/** Önce Claude (rolün modeli; Bağlantı anahtarları "claude"), anahtar yoksa ya da hata verirse Gemini (2 Kasım 2026).
 *  claudeBitis: Claude'a ayrılan son an; hata verirse Gemini'ye kalan süre kalsın diye bitis'ten önce tutulur. */
async function yz(rol: keyof typeof CLAUDE_MODEL, sistem: string, kullanici: string, modeller: string[], bitis: number,
  o: { claudeBitis?: number; resimler?: { mime: string; b64: string; etiket?: string }[]; maxTokens?: number; caba?: "low" | "medium" | "high" } = {}) {
  let claudeHata = "";
  try {
    const c = await claudeJson({ sistem, kullanici, model: CLAUDE_MODEL[rol], ms: (o.claudeBitis ?? bitis) - Date.now(), resimler: o.resimler, maxTokens: o.maxTokens, caba: o.caba });
    if (c) return { ...c, claudeHata };
  } catch (e) { claudeHata = String((e as Error).message ?? e).slice(0, 120); }
  return { ...(await gemini(sistem, kullanici, modeller, bitis, o.resimler ?? [])), claudeHata };
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
  const { veri } = await yz("kucuk",
    'Bir Türkçe teknoloji haberi için verilen kategori listesinden en uygun TEK kategoriyi seç. Listede olmayan ad yazma. Sadece {"kategori":"listedeki ad aynen"} döndür.',
    `Haber başlığı: ${baslik}\nÖnerilen: ${oneri}\nKategoriler: ${liste.map((k) => k.name).join(" | ")}`,
    ["gemini-3.5-flash-lite", "gemini-3.5-flash"], Date.now() + 25_000, { claudeBitis: Date.now() + 12_000 });
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
    // Sıra (2 Kasım 2026): resmi basın sayfası → kaynak haberlerdeki üretici görselleri → ürünün kendisini gösteren serbest fotoğraf.
    // Konu aramalı stok/temsili fotoğraflar kalktı (kullanıcı: "temsili görsel olmaz").
    const [r1, k1, c1, o1] = await Promise.all([
      resmiGorsel({ linkler, marka: it.brand, basin: ((bk ?? []) as { url: string }[]).map((x) => x.url), urun: it.product, baslik: it.title }, iz),
      kaynakGorselleri({ linkler, marka: it.brand, urun }, iz),
      urun ? commons(urun, 4, iz) : Promise.resolve([]), urun ? openverse(urun, 3, iz) : Promise.resolve([]),
    ]);
    void aramalar; void anahtar;
    const goruldu = new Set<string>();
    const adaylar = [...r1, ...k1.filter((a) => a.dogrulandi), ...k1.filter((a) => !a.dogrulandi), ...c1, ...o1].filter((a) => a.buyuk && !goruldu.has(a.buyuk) && goruldu.add(a.buyuk)).slice(0, 10);
    if (!adaylar.length) {
      const durum = Object.entries(kaynakDurumu).map(([k, v]) => `${k}: ${v}`).join(", ");
      return { ...bos, neden: `Görsel bulunamadı (resmi ${r1.length}, kaynak haber ${k1.length} aday; ${iz.join("; ")}${durum ? "; " + durum : ""}).` };
    }
    let veri: Record<string, unknown>;
    try {
      // Küçük modelden başlar; kotası dolmuşsa taslağı yazan büyük modellere geçer
      // Yapay zekâ adayların kendisini de görür (yazılı banner, logo, kolaj elensin; Fatih 18 Ekim). Küçük kopya alınamayan aday sadece açıklamayla değerlendirilir.
      const resimler = await Promise.all(adaylar.map((a) => kucukResim(a.thumb || a.buyuk)));
      const gorunen = resimler.map((g, i) => g ? i : -1).filter((i) => i >= 0);
      const istem = `Haber başlığı: ${baslik}\nÜrün: ${urun || "-"}\nOrijinal başlık: ${it.title}\n\nAdaylar:\n${adayListesi(adaylar)}\n\nResmi gösterilen adaylar: ${gorunen.join(", ") || "yok"} (resimler sırayla "Aday N:" etiketiyle ekte).`;
      const ekler = gorunen.map((i) => ({ ...resimler[i]!, etiket: `Aday ${i}` }));
      // Önce Claude (Bağlantı anahtarları "claude"; 2 Kasım 2026); anahtar yoksa ya da hata verirse Gemini
      let c: Awaited<ReturnType<typeof claudeJson>> = null;
      try { c = await claudeJson({ sistem: SECIM_SISTEM, kullanici: istem, model: CLAUDE_MODEL.gorsel, sema: SECIM_SEMA, resimler: ekler, ms: Math.min(40_000, bitis - Date.now() - 30_000) }); }
      catch (e) { iz.push("Claude: " + String((e as Error).message ?? e).slice(0, 80)); }
      if (c) veri = { ...c.veri, neden: String(c.veri.neden ?? "") + " (Claude)" };
      else ({ veri } = await gemini(SECIM_SISTEM, istem, ["gemini-3.5-flash-lite", ...MODELLER], Math.min(bitis - 30_000, Date.now() + 30_000), ekler));
    } catch {
      const k = kuralSecim(adaylar, urun);
      return { secilen: k, adaylar: adaylar.slice(0, 8), neden: k ? "Yapay zekâ yanıt vermedi; ürün adıyla birebir eşleşen serbest lisanslı fotoğraf seçildi." : "Yapay zekâ yanıt vermedi ve ürün adıyla eşleşen fotoğraf yok; görsel eklenmedi." };
    }
    const i = Number(veri.secim);
    const o = veri.odak as { x?: unknown; y?: unknown } | undefined;
    const yz = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50; };
    const odak = o && typeof o === "object" ? { x: yz(o.x), y: yz(o.y) } : undefined;
    const secilen = Number.isInteger(i) && i >= 0 && i < adaylar.length ? { ...adaylar[i], ...(odak ? { odak } : {}) } : null;
    return { secilen, adaylar: adaylar.slice(0, 8), neden: (secilen ? "" : "Görsel bulunamadı: ") + (String(veri.neden ?? "").slice(0, 200) || (secilen ? "" : "birebir uyan görsel yok.")) + (secilen ? "" : ` (${iz.join("; ")})`) };
  } catch (e) {
    return { ...bos, neden: "Görsel seçilemedi: " + String((e as Error).message ?? e).slice(0, 120) };
  }
}

/** Yapay zekâ listeleri bazen nesne döndürür ({iddia, kaynak}); hepsi düz metne çevrilir */
function metinListe(x: unknown): string[] {
  const duz = (v: unknown): string => typeof v === "string" ? v : v && typeof v === "object" ? Object.values(v as Record<string, unknown>).map(duz).filter(Boolean).join(" — ") : String(v ?? "");
  return (Array.isArray(x) ? x : x ? [x] : []).map(duz).map((s) => s.trim()).filter(Boolean);
}

/** Haber içi resmî görseller: bölümler + resmî adaylar → yapay zekâ görerek seçer (ara.ts) */
async function araGorselSec(sb: Sb, it: Record<string, any>, govde: string, kapak: string, bitis: number): Promise<{ secimler: { bolum: string; gorsel: GorselAday; alt: string }[]; neden: string }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const bl = bolumler(govde);
  if (!bl.length) return { secimler: [], neden: "Ara başlıklı bölüm yok" };
  const iz: string[] = [];
  const basin = it.brand ? (((await sb.from("tr_press").select("url").ilike("brand", it.brand).limit(1)).data ?? []) as { url: string }[]).map((x) => x.url) : [];
  const linkler = [it.link, ...((it.other_sources ?? []) as { link: string }[]).map((o) => o.link)].filter((u: string) => u && !turkHaberSitesi(u));
  const adaylar = await araAdaylar(sb, { linkler, marka: it.brand ?? "", urun: it.product ?? "", baslik: it.title, basin, bolumler: bl, kapak }, iz);
  if (!adaylar.length) return { secimler: [], neden: "Resmî görsel adayı yok (" + iz.join("; ") + ")" };
  const resimler = await Promise.all(adaylar.map((a) => kucukResim(a.thumb || a.buyuk)));
  const gorunen = resimler.map((g, i) => (g ? i : -1)).filter((i) => i >= 0);
  const istem = `Haber: ${it.title}\nMarka: ${it.brand || "-"} · Ürün: ${it.product || "-"}\n\nBÖLÜMLER:\n${bl.map((b, i) => `${i}. ${b.h2} — ${b.metin}`).join("\n")}\n\nGÖRSEL ADAYLARI:\n${adayListesi(adaylar)}\n\nResmi gösterilen adaylar: ${gorunen.join(", ") || "yok"}`;
  const { veri } = await yz("gorsel", ARA_SISTEM, istem, ["gemini-3.5-flash", ...MODELLER], Math.min(bitis - 40_000, Date.now() + 60_000),
    { claudeBitis: Math.min(bitis - 50_000, Date.now() + 50_000), resimler: gorunen.map((i) => ({ ...resimler[i]!, etiket: `Aday ${i}` })), maxTokens: 8000 });
  const kullanildi = new Set<number>();
  const secimler = (Array.isArray(veri.secimler) ? veri.secimler : []).map((x: { bolum?: unknown; gorsel?: unknown; alt?: unknown }) => ({ b: Number(x.bolum), g: Number(x.gorsel), alt: String(x.alt ?? "").slice(0, 140) }))
    .filter((x: { b: number; g: number }) => bl[x.b] && adaylar[x.g] && !kullanildi.has(x.g) && kullanildi.add(x.g)).slice(0, 2)
    .map((x: { b: number; g: number; alt: string }) => ({ bolum: bl[x.b].h2, gorsel: adaylar[x.g], alt: x.alt }));
  return { secimler, neden: String(veri.neden ?? "").slice(0, 200) || (secimler.length ? "" : "Uygun resmî görsel yok") };
}

/** Resmî video seçimi (video.ts adaylarından): kanal resmî ve video bu haberin konusuysa; değilse null */
async function videoSec(a: Awaited<ReturnType<typeof videoAdaylari>> | null, o: { baslik: string; marka: string; urun: string; orijinal: string }, bitis: number) {
  if (!a?.videolar.length || bitis - Date.now() < 25_000) return null;
  const istem = `Haber başlığı: ${o.baslik}\nOrijinal başlık: ${o.orijinal}\nMarka: ${o.marka || "-"} · Ürün: ${o.urun || "-"}\n\nVİDEO ADAYLARI:\n${a.videolar.map((v, i) => `${i}. "${v.baslik}" · KANAL: ${v.kanal} (${v.kanalUrl}) · ${v.tur} · bulunduğu yer: ${v.nereden}`).join("\n")}\n\nRESMÎ SAYFA ADAYLARI:\n${a.sayfalar.length ? a.sayfalar.map((p, i) => `${i}. ${p.url} — ${p.metin}`).join("\n") : "yok"}`;
  const { veri } = await yz("gorsel", VIDEO_SISTEM, istem, ["gemini-3.5-flash", ...MODELLER], Math.min(bitis - 10_000, Date.now() + 40_000), { claudeBitis: Math.min(bitis - 15_000, Date.now() + 30_000), maxTokens: 6000 });
  const v = Number.isInteger(Number(veri.video)) ? a.videolar[Number(veri.video)] : undefined;
  const sayfa = a.sayfalar[Number(veri.sayfa)];
  // Emin olunmasa da adaylar editöre gösterilir (4 Kasım 2026, kullanıcı: "emin değilse bile ihtimali olanların önizlemesini göstersin")
  const adaylar = a.videolar.filter((x) => x !== v).slice(0, 4).map((x) => ({ url: x.url, baslik: x.baslik.slice(0, 140), kanal: x.kanal.slice(0, 80), tur: x.tur, id: x.id }));
  return { video: v ? { url: v.url, baslik: v.baslik.slice(0, 140), kanal: v.kanal.slice(0, 80), resmiSayfa: sayfa?.url ?? "", spotAltinda: veri.en_ustte === true } : null, adaylar, resmiSayfa: sayfa?.url ?? "", neden: String(veri.neden ?? "").slice(0, 200) };
}

/** Modelin JSON yanıtından başlık, spot ve Markdown gövde (ara başlıklar + paragraflar; marka yazımı düzeltilmiş) */
function metinYap(t: Record<string, any>, ilgili: { link: string }[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const parcalar: string[] = [];
  for (const b of t.govde ?? []) {
    if (b?.h2) parcalar.push("## " + b.h2);
    for (const p of b?.paragraflar ?? []) if (p) parcalar.push(String(p));
  }
  return { baslik: markaYazimi(String(t.baslik ?? "")), spot: markaYazimi(spotKisalt(String(t.spot ?? ""))), govdeMd: markaYazimi(linkTemizle(parcalar.join("\n\n"), ilgili.map((x) => x.link))) };
}

/** Uzun yapay zekâ çağrısı sürerken nabız düzenli gitsin (2 dk nabızsız iş yarıda kalmış sayılıyor) */
async function isle(sb: Sb, itemId: number, tur: "ceviri" | "taslak", kullanici: string | null, ad: string, sec: IsSecenek = {}) {
  const nb = setInterval(() => { sb.from("tr_items").update({ work_state: tur }).eq("id", itemId).eq("work_state", tur).then(() => {}, () => {}); }, 45_000);
  try { return await isleIc(sb, itemId, tur, kullanici, ad, sec); } finally { clearInterval(nb); }
}

async function isleIc(sb: Sb, itemId: number, tur: "ceviri" | "taslak", kullanici: string | null, ad: string, sec: IsSecenek = {}) {
  const bitis = Date.now() + ISLE_BUTCE_MS;
  // Nabız: iş sürdükçe updated_at tazelenir; 2 dk nabız gelmezse zamanlanmış görev işi "hata"ya çeker (0013)
  const nabiz = () => sb.from("tr_items").update({ work_state: tur }).eq("id", itemId).eq("work_state", tur);
  const { data: it } = await sb.from("tr_items").select("*").eq("id", itemId).single();
  if (!it) return;
  try {
    if (tur === "ceviri") {
      const metin = await makaleCek(it.link, 10000);
      if (metin.length < 300) throw new Error("Kaynak sitenin metni otomatik alınamadı. Linke tıklayıp tarayıcının çeviri özelliğini kullan.");
      await nabiz();
      const { veri } = await yz("kucuk", CEVIRI_SISTEM, metin, ["gemini-3.5-flash-lite", "gemini-3.5-flash"], bitis, { claudeBitis: bitis - 25_000, maxTokens: 16_000 });
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
    // Resmî video adayları yazımla aynı anda toplanır (video.ts); seçimi aşağıda yapay zekâ yapar
    const basinUrl = it.brand ? (((await sb.from("tr_press").select("url").ilike("brand", it.brand).limit(1)).data ?? []) as { url: string }[]).map((x) => x.url) : [];
    const videoSoz = tur === "taslak" ? videoAdaylari(sb, { linkler: [it.link, ...diger.map((o) => o.link)], marka: it.brand ?? "", urun: it.product ?? "", baslik: it.title, konu: `${it.topic ?? ""} ${it.kind ?? ""} ${it.news_type ?? ""}`, basin: basinUrl }).catch(() => null) : Promise.resolve(null);
    // Kör karşılaştırma (4 Kasım 2026, kullanıcı: "hazırlananların hepsi karşılaştırmalı olsun, ana metin Claude'un"): Claude ile aynı anda
    // Gemini de yazar; Claude'unki taslak olur, Gemini'ninki qc.ab'de durur ve ayrıca denetlenir. Editör Haber Masası'nda A/B olarak görüp seçer.
    const geminiSoz = tur === "taslak" ? gemini(taslakSistem(uslup), istem, MODELLER, bitis - 30_000).catch(() => null) : Promise.resolve(null);
    const { veri: t, model, claudeHata } = await yz("taslak", taslakSistem(uslup), istem, MODELLER, bitis, { claudeBitis: bitis - 20_000, maxTokens: 12_000, caba: "medium" });
    const gAlt = /claude/.test(model) ? await geminiSoz : null;
    await nabiz();
    const notlar: string[] = metinListe(t.editor_notlari);
    if (claudeHata) notlar.push("Claude taslağı yazamadı (" + claudeHata + "); taslağı Gemini yazdı.");
    if (ana.metin.length < 300) notlar.push("Kaynak sitenin tam metni otomatik alınamadı; taslak kısıtlı bilgiyle yazıldı. Kaynağı mutlaka oku.");
    const okunan = 1 + ekler.filter((e) => e.metin.length >= 300).length;
    if (diger.length) notlar.push(`${okunan}/${diger.length + 1} kaynak okunarak yazıldı.`);

    // Gövde: ara başlıklar (editör yorumu yeri 2 Kasım 2026'da kaldırıldı: editör isterse kendisi ekler); metinYap
    // "Dikkat edilmesi gerekenler" sitedeki yazılarda yok: editör notlarına gider, metne girmez
    const dikkat = metinListe(t.dikkat_edilmesi_gerekenler);
    if (dikkat.length) notlar.unshift(...dikkat.map((x: string) => "Dikkat: " + x));
    const { baslik, spot, govdeMd } = metinYap(t, ilgili);
    const vs = await videoSec(await videoSoz, { baslik, marka: it.brand ?? "", urun: it.product ?? "", orijinal: it.title }, bitis).catch(() => null);
    const video = vs?.video ?? null;
    if (video) notlar.push(`Resmî video eklendi: ${video.baslik} (${video.kanal}). İstemezsen panelde "Gömülü video"yu boşalt.`);
    else if (vs?.adaylar.length) notlar.push(`Resmî olduğundan emin olunamayan ${vs.adaylar.length} video bulundu; taslakta "Video adayları"na bak.`);
    const ab = gAlt ? { gemini: { ...(({ baslik: b, spot: sp, govdeMd: g }) => ({ baslik: b, spot: sp, govde: g }))(metinYap(gAlt.veri, ilgili)), model: gAlt.model }, durum: "bekliyor" } : undefined;

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
      item_id: itemId, author: kullanici, model, auto: !!sec.oto, deneme: !!it.deneme,
      title: baslik, spot, body: govdeMd,
      seo: { focus: t.focus_keyword ?? "", title_tag: t.title_tag ?? "", slug: t.slug ?? "", meta: t.meta_description ?? "", kategori: t.kategori ?? "", etiketler: etiketSuz(metinListe(t.etiketler), [it.source_name, ...diger.map((o) => o.name)]),
        kisa_cevap: String(t.kisa_cevap ?? "").trim(),
        ...(video ? { video } : {}),
        ...(vs?.adaylar.length ? { video_adaylar: vs.adaylar, video_resmi_sayfa: vs.resmiSayfa } : {}),
        sizinti: { bilinenler: metinListe(t.sizinti?.bilinenler), bilinmeyenler: metinListe(t.sizinti?.bilinmeyenler), kesinlik: String(t.sizinti?.kesinlik ?? "").replace(/\D/g, "").slice(0, 1) } },
      sources: kaynaklar.join("\n"), image_note: String(g.oneri ?? ""), editor_note: notlar.join("\n"),
      questions: metinListe(t.editor_sorulari), checks: metinListe(t.dogrulama), notes: notlar,
      image: { oneri: g.oneri ?? "", alt_text: g.alt_text ?? "", aramalar, ai_istem: g.ai_istem ?? "", basin, stok: [] },
      // Son kalite kontrolü ayrı çağrıda (süre sınırı): kaynak metinleri ve iç link adayları onun için saklanır
      qc_state: "bekliyor", qc_at: new Date().toISOString(),
      qc: { kaynak: metinler.join("\n\n---\n\n").slice(0, 30000), ilgili, tam_metin: ana.metin.length >= 300, ilk_govde: govdeMd, ...(ab ? { ab } : {}) },
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
// 1) kaynaklara karşı doğrulama + düzeltme + insanlaştırma (uslup.ts KONTROL_SISTEM), 2) öne çıkan görsel (yoksa yapay zekâ üretimi),
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

/** Kör karşılaştırma kaydı (qc.ab): Gemini'nin aynı habere yazdığı metin ve editörün seçimi */
type AbKayit = { gemini: { baslik: string; spot: string; govde: string; model: string; kontrol?: string; duzeltme?: number; degisen?: number }; durum: string; secim?: "claude" | "gemini"; secen?: string; zaman?: string };
/** Kalite kontrolünün yaptığı düzeltme (Stüdyo'da "hangi kontrolde ne düzeldi" diye gösterilir; kullanıcı 2 Kasım 2026) */
type Duzeltme = { kontrol: number; tur: string; once: string; sonra: string; neden: string };
/** Nesnel ölçü: yeni metinde eskisinde birebir bulunmayan paragraf sayısı (modelin kendi beyanına ek) */
const degisenParagraf = (eski: string, yeni: string) => { const e = new Set(eski.split(/\n{2,}/).map((x) => x.trim())); return yeni.split(/\n{2,}/).map((x) => x.trim()).filter((x) => x && !e.has(x)).length; };

async function kontrol(sb: Sb, id: number) {
  const bitis = Date.now() + KONTROL_BUTCE_MS;
  // Kilit: sadece bekleyen ya da 4 dakikadır asılı kalmış kontrol alınır
  const asili = new Date(Date.now() - 6 * 60_000).toISOString();
  const { data: kilit } = await sb.from("tr_drafts").update({ qc_state: "calisiyor", qc_at: new Date().toISOString() })
    .eq("id", id).or(`qc_state.eq.bekliyor,and(qc_state.eq.calisiyor,qc_at.lt.${asili})`).select("*");
  const t = kilit?.[0];
  if (!t) return { atlandi: "Kontrol beklemiyor" };
  const qc = (t.qc ?? {}) as { kaynak?: string; ilgili?: { baslik: string; link: string }[]; tam_metin?: boolean; ilk_govde?: string; tur?: number; onceki_sorunlar?: string[]; duzeltmeler?: Duzeltme[]; degisen?: Record<string, number>; ab?: AbKayit };
  const { data: it } = await sb.from("tr_items").select("*").eq("id", t.item_id ?? 0).maybeSingle();
  const notlar: string[] = [];
  let durum = "", guven = "";
  const tur = qc.tur === 2 ? 2 : 1;
  let duzeltmeler: Duzeltme[] = [], degisen = 0;
  // Karşılaştırmadaki Gemini metni de (ilk turda bir kez) Gemini ile denetlenir; adil kıyas: her model kendi metnini kendi denetler
  const abSoz: Promise<AbKayit | undefined> = (async () => {
    const ab = qc.ab;
    if (!ab?.gemini || ab.gemini.kontrol || !qc.kaynak) return ab;
    try {
      const uslup = await uslupAl(sb);
      const { veri: k } = await gemini(KONTROL_SISTEM(uslup), `KAYNAK METİNLER:\n${qc.kaynak}\n\n===\n\nTASLAK:\n${JSON.stringify({ baslik: ab.gemini.baslik, spot: ab.gemini.spot, govde: ab.gemini.govde })}`, MODELLER, Math.min(bitis - 60_000, Date.now() + 120_000));
      const yeni = linkTemizle(String(k.govde ?? ""), (qc.ilgili ?? []).map((x) => x.link));
      const ara = (x: string) => (x.match(/^## /gm) ?? []).length;
      const uygun = ara(yeni) >= 2 && ara(yeni) <= 4 && yeni.length > ab.gemini.govde.length * 0.75;
      return { ...ab, gemini: { ...ab.gemini, ...(uygun ? { baslik: markaYazimi(String(k.baslik ?? "") || ab.gemini.baslik), spot: markaYazimi(spotKisalt(String(k.spot ?? "") || ab.gemini.spot)), govde: markaYazimi(yeni) } : {}), kontrol: uygun ? "kontrol edildi" : "kontrol uygulanmadı", duzeltme: Array.isArray(k.duzeltmeler) ? k.duzeltmeler.length : 0, degisen: uygun ? degisenParagraf(ab.gemini.govde, yeni) : 0 } };
    } catch { return { ...ab, gemini: { ...ab.gemini, kontrol: "kontrol çalışmadı" } }; }
  })();
  try {
    // 1) Doğrulama + düzeltme + insanlaştırma
    let { title: baslik, spot, body: govde } = t as { title: string; spot: string; body: string };
    let sorunlar: string[] = [];
    if (qc.kaynak && bitis - Date.now() > 60_000) {
      try {
        const uslup = await uslupAl(sb);
        // Denetleyen yazandan bir üst model (Claude Opus; kullanıcı 2 Kasım: "sonnet yazarsa opus denetler"); yoksa Gemini.
        // Amaç insanı aradan çıkarmak (kullanıcı 2 Kasım: "not düşmesi güzel ama düzeltsin"): güven yüksek değilse düzeltilmiş metin
        // önceki sorunlarla birlikte bir sonraki çağrıda ikinci kez denetlenir (aşağıda "ikinci tur"); görsel ve panel o turda yapılır.
        const onceki = tur === 2 && qc.onceki_sorunlar?.length ? `\n\n===\n\nÖNCEKİ DENETİMİN BULDUĞU SORUNLAR (hepsini metinde çöz; çözülemeyen bilgiyi metinden çıkar):\n- ${qc.onceki_sorunlar.join("\n- ")}` : "";
        const { veri: k, claudeHata } = await yz("kontrol", KONTROL_SISTEM(uslup),
          `KAYNAK METİNLER:\n${qc.kaynak}\n\n===\n\nTASLAK:\n${JSON.stringify({ baslik, spot, govde })}${onceki}`,
          // Denetim orta seviyede düşünür (4 Kasım 2026, kullanıcı: "yüksek harcamasın, orta"); görsel ayrı çağrıda, süre buna ayrılır
          MODELLER, bitis - 8_000, { claudeBitis: bitis - 30_000, maxTokens: 16_000, caba: "medium" });
        if (claudeHata) notlar.push("Claude denetimi çalışmadı (" + claudeHata + "); kontrolü Gemini yaptı.");
        sorunlar = metinListe(k.sorunlar);
        guven = String(k.guven ?? "");
        const yeniGovde = linkTemizle(String(k.govde ?? ""), (qc.ilgili ?? []).map((x) => x.link));
        const araBaslik = (x: string) => (x.match(/^## /gm) ?? []).length;
        // Güvenlik: ara başlık sayısı 2-4, metin özetlenmemiş
        if (araBaslik(yeniGovde) >= 2 && araBaslik(yeniGovde) <= 4 && yeniGovde.length > govde.length * 0.75) {
          degisen = degisenParagraf(govde, yeniGovde);
          duzeltmeler = (Array.isArray(k.duzeltmeler) ? k.duzeltmeler : []).slice(0, 15).map((x: Record<string, unknown>) => ({ kontrol: tur, tur: String(x?.tur ?? ""), once: String(x?.once ?? "").slice(0, 300), sonra: String(x?.sonra ?? "").slice(0, 300), neden: String(x?.neden ?? "").slice(0, 200) })).filter((x: Duzeltme) => x.once || x.sonra);
          govde = markaYazimi(yeniGovde); baslik = markaYazimi(String(k.baslik ?? "") || baslik); spot = markaYazimi(spotKisalt(String(k.spot ?? "") || spot));
          durum = "kontrol edildi";
        } else { notlar.push("Kalite kontrolünün önerdiği metin güvenlik denetiminden geçmedi (yapı bozuldu ya da kısaldı); " + (tur === 2 ? "ilk denetimin metni korundu." : "ilk taslak korundu.")); durum = tur === 2 ? "kontrol edildi" : "kontrol uygulanmadı"; }
        if (guven === "dusuk") notlar.push("Kalite kontrolü: güven DÜŞÜK, kaynakları mutlaka oku.");
      } catch (e) { notlar.push("Kalite kontrolü çalışmadı (" + String((e as Error).message ?? e).slice(0, 100) + "); metni kaynaklarla sen karşılaştır."); durum = "kontrol çalışmadı"; }
    }
    // İkinci tur: güven yüksek değilse ve sorun bulunduysa düzeltilmiş metin bir kez daha denetlensin (kaynak metinler saklı kalır)
    if (tur === 1 && durum === "kontrol edildi" && guven !== "yuksek" && sorunlar.length) {
      const { data: sim } = await sb.from("tr_drafts").select("body,notes").eq("id", id).single();
      await sb.from("tr_drafts").update({
        ...(sim?.body === t.body ? { title: baslik, spot, body: govde } : {}),
        notes: [...((sim?.notes ?? []) as string[]), ...notlar],
        qc: { ...qc, ab: await abSoz, tur: 2, onceki_sorunlar: sorunlar, ilk_guven: guven, duzeltmeler, degisen: { "1": degisen } }, qc_state: "bekliyor", qc_at: new Date().toISOString(),
      }).eq("id", id);
      if (sim?.body === t.body) { await kontrolBaslat(id); return { ikinci_tur: true, sorunlar }; }
      await sb.from("tr_drafts").update({ qc_state: "tamam", qc: { ...qc, kaynak: undefined, sorunlar, durum: "kontrol edildi", bitti: new Date().toISOString() } }).eq("id", id);
      return { atlandi: "Editör metni değiştirmiş, ikinci tur yapılmadı" };
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
      qc: { ...qc, ab: await abSoz, kaynak: undefined, onceki_sorunlar: undefined, sorunlar, durum, guven, duzeltmeler: [...(tur === 2 ? qc.duzeltmeler ?? [] : []), ...(degismedi ? duzeltmeler : [])], degisen: { ...(tur === 2 ? qc.degisen ?? {} : {}), ...(degismedi && durum === "kontrol edildi" ? { [String(tur)]: degisen } : {}) }, onem: d?.onem ?? null, ana_sayfa: !!d && d.puan >= ANA_SAYFA_ESIK, bitti: new Date().toISOString() },
    }).eq("id", id);

    // 2) Öne çıkan görsel (yoksa yapay zekâ üretimi)
    const img = (t.image ?? {}) as Record<string, unknown> & { aramalar?: string[]; ai_istem?: string; secilen?: GorselAday | null };
    if (it && !img.secilen) {
      const oneCikan = await gorselSec(sb, it, baslik || it.title, img.aramalar ?? [], bitis);
      // Uygun fotoğraf yoksa yapay zekâ ile üretim ayrı çağrıda başlar (uretimBaslat); panele görselsiz gider, görsel gelince kapak eklenir
      const bekle = !oneCikan.secilen;
      await sb.from("tr_drafts").update({ image: { ...img, secilen: oneCikan.secilen, gorsel_adaylar: oneCikan.adaylar, gorsel_neden: bekle ? oneCikan.neden + " Yapay zekâ ile görsel üretiliyor." : oneCikan.neden, ...(bekle ? { yz_bekliyor: true } : {}) } }).eq("id", id);
      if (bekle) await uretimBaslat(id);
    }

    // 2b) Haber içi resmî görseller (4 Kasım 2026): en fazla 2, ara başlıkların altına; süre yetmezse atlanır
    if (it && bitis - Date.now() > 90_000) {
      try {
        const { data: sim } = await sb.from("tr_drafts").select("image,body").eq("id", id).single();
        const im = (sim?.image ?? {}) as Record<string, unknown> & { secilen?: GorselAday | null; ara?: unknown };
        if (!im.ara) {
          const ara = await araGorselSec(sb, it, String(sim?.body ?? govde), im.secilen?.buyuk ?? "", bitis);
          await sb.from("tr_drafts").update({ image: { ...im, ara: ara.secimler, ara_neden: ara.neden } }).eq("id", id);
        }
      } catch (e) { console.error("ara görsel", e); }
    }

    // 3) Panele taslak haber olarak: otomatik ve elle hazırlanan bütün taslaklar (Fatih, 23 Ekim 2026: "hazırlayınca panelde görünsün").
    //    Bağlantı kuruluysa, ayar açıksa, kaynağın tam metni okunduysa. Sonradan Stüdyo'da düzeltilirse "Paneldeki taslağı güncelle".
    let siteDurum = "Sadece Stüdyo'da";
    const ayar = await otoAyar(sb);
    if (t.deneme) siteDurum = "deneme taslağı, panele gitmez";
    else if (ayar.site && siteAyar()) {
      if (!qc.tam_metin) { await sb.from("tr_drafts").update({ site_hata: "Kaynağın tam metni alınamadığı için panele otomatik gönderilmedi. Kontrol edip elle gönder." }).eq("id", id); siteDurum = "tam metin yok, gönderilmedi"; }
      else if (bitis - Date.now() < 35_000) { await sb.from("tr_drafts").update({ site_bekliyor: true }).eq("id", id); siteDurum = "panele sonraki turda gidecek"; }
      else { const r = await siteGonder(sb, id, { kategoriSec }); siteDurum = r.ok ? "panele taslak olarak gitti" : "Panel hatası: " + r.hata; }
    }
    if (t.auto) {
      const { data: son } = await sb.from("tr_drafts").select("image,site_id").eq("id", id).maybeSingle();
      const im = (son?.image ?? {}) as { secilen?: unknown; flux?: unknown };
      const gDurum = im.secilen ? (son?.site_id ? "görsel kapak oldu" : "görsel seçildi") : "görselsiz";
      await otoOzet(sb, { durum: `Taslak hazır · ${durum || "kontrolsüz"} · ${siteDurum} · ${gDurum}`, haber: baslik });
    }
    await sb.from("tr_drafts").update({ qc_state: "tamam" }).eq("id", id);
    return { ok: true, durum };
  } catch (e) {
    await sb.from("tr_drafts").update({ qc_state: "hata", editor_note: [String(t.editor_note ?? ""), "Kalite kontrolü hata verdi: " + String((e as Error).message ?? e).slice(0, 200)].filter(Boolean).join("\n") }).eq("id", id);
    return { hata: String(e) };
  }
}

// ---------- Yapay zekâ ile görsel üretimi (2 Kasım 2026, kullanıcı: "sadece bulunamayan aşamada devreye girer, editöre bilgisini verir") ----------
// Uygun fotoğraf yoksa ayrı bir çağrıda (kendi süre bütçesiyle) görsel üretilir. Kıyas açıksa (Haber Masası → Ayarlar, günlük sınırlı) bütün
// kullanılabilir modeller aynı anda üretir (uretim.ts), her görsel yedi katmanlı denetimden geçer (gorsel.ts URETIM_DENETIM; Claude, yoksa Gemini),
// geçenlerden en yüksek puanlı kapak olur; adaylar Stüdyo'da yan yana görünür, editör başkasını seçebilir. Seçimler model kıyası tablosunda sayılır.
// Kıyas kapalıysa ya da günlük sınır dolduysa tek model (FLUX.2 klein, olmazsa schnell) iki deneme yapar.
type YzAday = { model: string; surum?: string; url?: string; gecti: boolean; puan: number; katmanlar?: Record<string, string>; neden: string; odak?: { x: number; y: number }; hata?: string; sure: number };
const KIYAS_VARSAYILAN = { acik: true, gunluk: 3 };

async function kiyasAyar(sb: Sb) {
  const { data } = await sb.from("tr_settings").select("value").eq("key", "gorsel_kiyas").maybeSingle();
  return { ...KIYAS_VARSAYILAN, ...((data?.value ?? {}) as Partial<typeof KIYAS_VARSAYILAN>) };
}

async function denetle(o: { baslik: string; marka: string; urun: string }, g: Uretilen, bitis: number): Promise<Pick<YzAday, "gecti" | "puan" | "katmanlar" | "neden" | "odak">> {
  const { veri } = await yz("gorsel", URETIM_DENETIM, `Haber başlığı: ${o.baslik}\nMarka: ${o.marka || "-"}\nÜrün: ${o.urun || "-"}`, ["gemini-3.5-flash", ...MODELLER],
    Math.min(bitis - 5_000, Date.now() + 35_000), { claudeBitis: Math.min(bitis - 15_000, Date.now() + 25_000), resimler: [{ mime: g.mime, b64: g.b64, etiket: "Üretilen görsel" }] });
  const puan = Math.max(0, Math.min(10, Number(veri.puan) || 0));
  const k = veri.katmanlar && typeof veri.katmanlar === "object" ? Object.fromEntries(Object.entries(veri.katmanlar as Record<string, unknown>).map(([a, b]) => [a, String(b ?? "").slice(0, 140)])) : undefined;
  const od = veri.odak as { x?: unknown; y?: unknown } | undefined;
  const yz2 = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50; };
  return { gecti: veri.gecti === true && puan >= 6, puan, katmanlar: k, neden: String(veri.neden ?? "").slice(0, 200), odak: od && typeof od === "object" ? { x: yz2(od.x), y: yz2(od.y) } : undefined };
}

async function yukle(sb: Sb, id: number, g: Uretilen): Promise<string> {
  const uz = g.mime === "image/png" ? "png" : g.mime === "image/jpeg" ? "jpg" : "webp";
  const yol = `uretim/${id}-${g.model}-${Date.now()}.${uz}`;
  const y = await sb.storage.from("haber-gorsel").upload(yol, Uint8Array.from(atob(g.b64), (c) => c.charCodeAt(0)), { contentType: g.mime, upsert: true });
  if (y.error) throw new Error("depolama: " + y.error.message);
  return sb.storage.from("haber-gorsel").getPublicUrl(yol).data.publicUrl;
}

const adayGorsel = (a: YzAday, istem: string): GorselAday => ({ kaynak: "Yapay zekâ (Flux)", sayfa: a.url!, buyuk: a.url!, thumb: a.url!, yazar: `Updated (yapay zekâ, ${MODEL_AD[a.model] ?? a.model})`, lisans: "Yapay zekâ üretimi", aciklama: istem, w: 1600, h: 900, ...(a.odak ? { odak: a.odak } : {}) });

async function yzGorselUret(sb: Sb, id: number, o: { baslik: string; marka: string; urun: string; istem: string }, bitis: number, kiyasla: boolean, izinli?: string[], surumler?: { gpt?: string; banana?: string; kalite?: string }): Promise<{ secilen: GorselAday | null; neden: string; adaylar: YzAday[]; model?: string; kiyas?: boolean }> {
  const modeller = (await kullanilabilir(sb)).filter((m) => !izinli || izinli.includes(m));
  if (!modeller.length) return { secilen: null, neden: "Görsel üretecek servis bağlı değil (Bağlantı anahtarları → Cloudflare).", adaylar: [] };
  const istem = fluxIstem(o.istem);
  const tek = async (model: UretimModeli | "", ist: string): Promise<YzAday> => {
    const t0 = Date.now();
    try {
      const m = (model || "klein") as UretimModeli;
      const g = await uret(sb, m, ist, Math.max(10_000, Math.min(60_000, bitis - Date.now() - 40_000)), m === "gpt" ? surumler?.gpt : m === "banana" ? surumler?.banana : undefined, surumler?.kalite);
      const d = await denetle(o, g, bitis);
      return { model: g.model, surum: g.surum, ...d, url: d.gecti ? await yukle(sb, id, g) : undefined, sure: Date.now() - t0 };
    } catch (e) { return { model: model || "klein", gecti: false, puan: 0, neden: "", hata: String((e as Error).message ?? e).slice(0, 160), sure: Date.now() - t0 }; }
  };
  let adaylar: YzAday[];
  const kiyas = kiyasla && modeller.length > 1;
  if (kiyas) adaylar = await Promise.all(modeller.map((m) => tek(m, istem)));
  else {
    // Tek model sırası (4 Kasım 2026): önce ücretsiz Cloudflare; günlük payı biterse ya da reddedilirse sırayla Nano Banana (ucuz), GPT Image.
    // Eskiden yalnız klein iki kez deneniyordu: Cloudflare payı bittiği günlerde hiç görsel çıkmıyordu, ücretli modeller hiç denenmiyordu.
    const sira = (["klein", "banana", "gpt"] as UretimModeli[]).filter((m) => modeller.includes(m));
    const notr = " Show the subject as a neutral concept or a close-up detail, not a full branded product.";
    adaylar = [];
    for (const m of sira.length ? sira : [modeller[0] as UretimModeli]) {
      if (adaylar.length && bitis - Date.now() < 50_000) break;
      // Bir önceki model görseli üretip denetimden geçemediyse sonraki model daha nötr istemle dener
      const a = await tek(m, adaylar.some((x) => !x.hata) ? istem + notr : istem);
      adaylar.push(a);
      if (a.gecti) break;
    }
  }
  // Denetimden geçenler Updated AI kütüphanesine (deneme taslağınınkiler girmez); kütüphane hatası üretimi etkilemez
  const gecenler = adaylar.filter((a) => a.gecti && a.url);
  if (gecenler.length && bitis - Date.now() > 20_000) {
    const { data: dt } = await sb.from("tr_drafts").select("deneme").eq("id", id).maybeSingle();
    if (!dt?.deneme) await Promise.all(gecenler.map((a) => yzKutuphane({ url: a.url!, alt: `${o.baslik} (temsili görsel)`.slice(0, 125), ad: [o.marka, o.urun, o.baslik].filter(Boolean).join(" "), model: a.model, odak: a.odak }).catch(() => null)));
  }
  const iyi = adaylar.filter((a) => a.gecti && a.url).sort((a, b) => b.puan - a.puan)[0];
  const ozet = adaylar.map((a) => `${MODEL_AD[a.model] ?? a.model}: ${a.hata ? "üretilemedi (" + a.hata + ")" : a.gecti ? a.puan + "/10" : "reddedildi (" + a.neden + ")"}`).join("; ");
  if (!iyi) return { secilen: null, neden: "Yapay zekâ görseli de uygun bulunmadı: " + ozet, adaylar, kiyas };
  return {
    secilen: adayGorsel(iyi, istem), adaylar, model: iyi.model, kiyas,
    neden: `Uygun fotoğraf bulunamadı; görsel yapay zekâ destekli üretildi (${MODEL_AD[iyi.model] ?? iyi.model}, denetim ${iyi.puan}/10: ${iyi.neden}). Daha iyi bir görsel bulursan değiştir.${adaylar.length > 1 ? (kiyas ? " Kıyas: " : " Denenenler: ") + ozet : ""}`,
  };
}

/** Görsel üretimi ayrı çağrıda (kontrol çağrısının süresi görsele yetmez). Bayrak (image.yz_bekliyor) yoksa iş yapılmaz. */
async function uretimBaslat(id: number) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 4_000);
  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/triyaj-taslak`, { method: "POST", signal: c.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gorsel_uretim: id }) });
  } catch { /* otomatik tur devralır */ } finally { clearTimeout(t); }
}

/** Görselsiz taslağa üretim (otomatik: yz_bekliyor bayrağıyla; elle: Stüdyo düğmesi). Elle seçilmiş görsele dokunmaz. */
// Ücretli görsel modelleri (yeniden üretmede yalnız yöneticiler; 4 Kasım 2026, kullanıcı: "ücretli olanları yöneticiler yeniden çizdirebilsin")
const UCRETLI_MODEL = ["gpt", "banana"];
const UCRETSIZ_MODEL = ["klein", "dev", "lucid"];

/** Editör görseli beğenmedi: yeniden üret (görseli olan taslakta da). Adaylar eklenir/yenilenir; seçili görsel değişmez, editör seçer. */
async function yenidenUret(sb: Sb, id: number, ucretli: boolean, istenen?: { modeller?: string[]; gpt?: string; banana?: string; kalite?: string }) {
  const bitis = Date.now() + BUTCE_MS;
  const { data: t } = await sb.from("tr_drafts").select("id,title,item_id,image").eq("id", id).single();
  if (!t) return { hata: "Taslak bulunamadı" };
  const img = (t.image ?? {}) as Record<string, unknown> & { ai_istem?: string; secilen?: GorselAday | null; yz_adaylar?: YzAday[] };
  const { data: it } = await sb.from("tr_items").select("brand,product,title").eq("id", t.item_id ?? 0).maybeSingle();
  // Taslaktaki seçiciden gelen modeller (4 Kasım 2026); ücretliler yalnız yöneticide (çağıran yer denetler)
  const sinir = ucretli ? [...UCRETSIZ_MODEL, ...UCRETLI_MODEL] : UCRETSIZ_MODEL;
  const izinli = istenen?.modeller?.length ? istenen.modeller.filter((m) => sinir.includes(m)) : sinir;
  if (!izinli.length) return { hata: "Model seçilmedi" };
  const u = await yzGorselUret(sb, id, { baslik: t.title || it?.title || "", marka: it?.brand ?? "", urun: it?.product ?? "", istem: String(img.ai_istem || t.title) }, bitis, izinli.length > 1, izinli, { gpt: istenen?.gpt, banana: istenen?.banana, kalite: istenen?.kalite });
  if (!u.adaylar.length) return { hata: u.neden };
  const { data: son } = await sb.from("tr_drafts").select("image").eq("id", id).single();
  const simdi = (son?.image ?? {}) as Record<string, unknown> & { secilen?: GorselAday | null; yz_adaylar?: YzAday[] };
  const yeniModeller = new Set(u.adaylar.map((a) => a.model));
  const adaylar = [...u.adaylar, ...(simdi.yz_adaylar ?? []).filter((a) => !yeniModeller.has(a.model))];
  await sb.from("tr_drafts").update({ image: { ...simdi, yz_adaylar: adaylar, yz_kiyas: true, ...(!simdi.secilen && u.secilen ? { secilen: u.secilen, yz_uretim: true, yz_secen: "otomatik", yz_model: u.model, gorsel_neden: u.neden } : {}) } }).eq("id", id);
  return { ok: true, gecen: u.adaylar.filter((a) => a.gecti).length, toplam: u.adaylar.length };
}

/** Fotoğrafları yeniden tara: resmî basın, kaynak haberlerdeki üretici görselleri, serbest lisanslı arşivler. Adaylar listelenir; görseli
 *  olmayan taslakta en uygunu kapak olur, olanda editör seçer. */
async function fotoTara(sb: Sb, id: number) {
  const { data: t } = await sb.from("tr_drafts").select("id,title,item_id,image,site_id").eq("id", id).single();
  if (!t) return { hata: "Taslak bulunamadı" };
  const { data: it } = await sb.from("tr_items").select("brand,product,title,link,other_sources").eq("id", t.item_id ?? 0).maybeSingle();
  if (!it) return { hata: "Haber bulunamadı" };
  const img = (t.image ?? {}) as Record<string, unknown> & { aramalar?: string[]; secilen?: GorselAday | null };
  const r = await gorselSec(sb, it as Parameters<typeof gorselSec>[1], t.title || it.title, img.aramalar ?? [], Date.now() + BUTCE_MS);
  const ekle = !img.secilen && r.secilen;
  await sb.from("tr_drafts").update({ image: { ...img, gorsel_adaylar: r.adaylar, gorsel_neden: r.neden, ...(ekle ? { secilen: r.secilen, yz_uretim: false } : {}) } }).eq("id", id);
  if (ekle && t.site_id) await siteKapakEkle(sb, id);
  return { ok: true, aday: r.adaylar.length, neden: r.neden };
}

/** Editör fotoğraf adaylarından birini kapak yapar */
async function fotoSec(sb: Sb, id: number, sira: number) {
  const { data: t } = await sb.from("tr_drafts").select("image,site_id").eq("id", id).single();
  const img = (t?.image ?? {}) as Record<string, unknown> & { gorsel_adaylar?: GorselAday[] };
  const a = img.gorsel_adaylar?.[sira];
  if (!a) return { hata: "Aday bulunamadı" };
  await sb.from("tr_drafts").update({ image: { ...img, secilen: a, yz_uretim: false, yz_model: null, yz_secen: "editor" } }).eq("id", id);
  if (t?.site_id) return { ok: true, site: await siteKapakEkle(sb, id, { degistir: true }) };
  return { ok: true };
}

async function elleUret(sb: Sb, id: number, otomatik = false) {
  const bitis = Date.now() + BUTCE_MS;
  const { data: t } = await sb.from("tr_drafts").select("id,title,item_id,image,site_id,notes").eq("id", id).single();
  if (!t) return { hata: "Taslak bulunamadı" };
  const img = (t.image ?? {}) as Record<string, unknown> & { ai_istem?: string; secilen?: GorselAday | null; yz_bekliyor?: boolean };
  if (otomatik && !img.yz_bekliyor) return { atlandi: "Üretim beklemiyor" };
  if (img.secilen) { if (otomatik) await sb.from("tr_drafts").update({ image: { ...img, yz_bekliyor: false } }).eq("id", id); return { hata: "Taslağın zaten görseli var" }; }
  await sb.from("tr_drafts").update({ image: { ...img, yz_bekliyor: false } }).eq("id", id);
  const { data: it } = await sb.from("tr_items").select("brand,product,title").eq("id", t.item_id ?? 0).maybeSingle();
  // Kıyas: günlük sınır içinde (bugün kıyaslanan taslak sayısı)
  const ayar = await kiyasAyar(sb);
  let kiyasla = false;
  if (ayar.acik) {
    const { count } = await sb.from("tr_drafts").select("id", { count: "exact", head: true }).eq("image->>yz_kiyas_oto", "true").eq("deneme", false).gte("created_at", new Date(Date.now() - 864e5).toISOString());
    kiyasla = (count ?? 0) < ayar.gunluk;
  }
  const u = await yzGorselUret(sb, id, { baslik: t.title || it?.title || "", marka: it?.brand ?? "", urun: it?.product ?? "", istem: String(img.ai_istem || t.title) }, bitis, kiyasla);
  const { data: son } = await sb.from("tr_drafts").select("image,notes").eq("id", id).single();
  const simdi = (son?.image ?? {}) as Record<string, unknown> & { secilen?: GorselAday | null };
  if (simdi.secilen) return { hata: "Bu arada elle görsel seçildi; üretilen adaylar kaydedildi.", adaylar: u.adaylar.length };
  await sb.from("tr_drafts").update({
    image: { ...simdi, secilen: u.secilen, gorsel_neden: u.neden, yz_adaylar: u.adaylar, ...(u.kiyas ? { yz_kiyas: true, yz_kiyas_oto: true } : {}), ...(u.secilen ? { yz_uretim: true, yz_secen: "otomatik", yz_model: u.model } : {}) },
    ...(u.secilen ? { notes: [...((son?.notes ?? []) as string[]), "Görsel: uygun fotoğraf bulunamadı, öne çıkan görsel yapay zekâ destekli üretildi. Bulabilirsen daha iyi bir görsel kullan."] } : {}),
  }).eq("id", id);
  if (u.secilen && t.site_id) return { ok: true, neden: u.neden, site: await siteKapakEkle(sb, id) };
  return u.secilen ? { ok: true, neden: u.neden } : { hata: u.neden };
}

/** Editör kıyas adaylarından başkasını seçer: Stüdyo'daki kapak değişir; panelde yayında olmayan taslağın kapağı da değişir. */
async function adaySec(sb: Sb, id: number, model: string, kisi: string) {
  const { data: t } = await sb.from("tr_drafts").select("image,site_id").eq("id", id).single();
  const img = (t?.image ?? {}) as Record<string, unknown> & { yz_adaylar?: YzAday[]; secilen?: GorselAday | null; ai_istem?: string };
  const a = (img.yz_adaylar ?? []).find((x) => x.model === model && x.url);
  if (!a) return { hata: "Bu modelin görseli yok" };
  await sb.from("tr_drafts").update({ image: { ...img, secilen: adayGorsel(a, String(img.secilen?.aciklama ?? img.ai_istem ?? "")), yz_uretim: true, yz_secen: "editor", yz_editor_secimi: model, yz_model: model, yz_secen_kisi: kisi } }).eq("id", id);
  if (t?.site_id) return { ok: true, site: await siteKapakEkle(sb, id, { degistir: true }) };
  return { ok: true };
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
  // Yayına giren haberler: Haber Masası'nda kendiliğinden "Yayında" (elle "Yayınladım" gerekmez); otomatik taslak kapalıyken de çalışır
  await yayinEsitle(sb).catch((e) => console.error("yayinEsitle", e));
  // Eski yapay zekâ görselleri (120 gün, kullanılmayan; kullanıcı 4 Kasım 2026): günde bir kez
  await yzTemizle(sb).catch((e) => console.error("yzTemizle", e));
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
    .or(`and(qc_state.eq.bekliyor,qc_at.lt.${new Date(Date.now() - 3 * 60_000).toISOString()}),and(qc_state.eq.calisiyor,qc_at.lt.${new Date(Date.now() - 7 * 60_000).toISOString()})`).limit(2);
  const arkaPlan: Promise<unknown>[] = ((kontrolBekleyen ?? []) as { id: number }[]).map((k) => kontrol(sb, k.id).catch(() => null));

  // 1) Önceki turda süre yetmediği için panele gidemeyen otomatik taslaklar (kontrolü bitmiş olanlar)
  if (ayar.site && siteAyar()) {
    const { data: bekleyen } = await sb.from("tr_drafts").select("id").eq("site_bekliyor", true).is("site_id", null).eq("qc_state", "tamam").limit(3);
    for (const b of bekleyen ?? []) { await sb.from("tr_drafts").update({ site_bekliyor: false }).eq("id", b.id); await siteGonder(sb, b.id, { kategoriSec }); }
  }

  // 1a) Yapay zekâ görseli bekleyip başlatılamamış taslaklar (kendi çağrısı ulaşmadıysa): en çok 2 tanesi
  {
    const { data: yzb } = await sb.from("tr_drafts").select("id").eq("image->>yz_bekliyor", "true").lt("updated_at", new Date(Date.now() - 5 * 60_000).toISOString()).limit(2);
    for (const b of yzb ?? []) await uretimBaslat(b.id);
  }

  // 1b) Panelde birikme: kimsenin dokunmadığı eski otomatik taslaklar panelden kaldırılır (saatte bir, ilk turda)
  if (ayar.panel_sure_gun > 0 && siteAyar() && new Date().getUTCMinutes() < 10) await siteTemizle(sb, ayar.panel_sure_gun).catch((e) => console.error("siteTemizle", e));

  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  if (arkaPlan.length) EdgeRuntime.waitUntil(Promise.all(arkaPlan));

  // 2) Günlük sınır (İstanbul günü; Türkiye yıl boyu UTC+3)
  const gunBasi = istanbulGun() + "T00:00:00+03:00";
  const { count: bugun } = await sb.from("tr_drafts").select("id", { count: "exact", head: true }).eq("auto", true).eq("deneme", false).gte("created_at", gunBasi);
  if ((bugun ?? 0) >= ayar.gunluk) { await ozet({ durum: `Günlük sınır doldu (${bugun}/${ayar.gunluk})`, bugun }); return { atlandi: "Günlük sınır" }; }

  // 3) Aday: havuzda, kimse almamış, daha önce otomatik denenmemiş, iş sürmüyor, son 24 saatte düşmüş
  const { data: havuz } = await sb.from("tr_items")
    .select("id,brand,topic,product,news_type,kind,source_name,turkey,other_sources,published_at,created_at,title,event,event_key,trend")
    .eq("status", "aday").eq("deneme", false).is("taken_by", null).is("auto_draft_at", null).eq("work_state", "")
    .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString()).limit(1000);
  const liste = (havuz ?? []) as Aday[];
  if (!liste.length) { await ozet({ durum: "Uygun haber yok", bugun }); return { bos: true }; }
  const { data: taslakli } = await sb.from("tr_drafts").select("item_id").in("item_id", liste.map((h) => h.id));
  // Aynı olay farklı kartlara bölünmüş olabilir: son 3 günde taslağı yazılmış ya da bir editörün aldığı haberlerle aynı olanlar atlanır
  const ucGun = new Date(Date.now() - 72 * 3_600_000).toISOString();
  const [{ data: sonTaslak }, { data: alinan }] = await Promise.all([
    sb.from("tr_drafts").select("item_id").eq("deneme", false).gte("created_at", ucGun).not("item_id", "is", null).limit(500),
    // alınmış/yayında olanlar + şu an otomatik taslağı yazılmakta olanlar (son 30 dk; yarıda kalan aynı olayı 3 gün kilitlemesin)
    sb.from("tr_items").select("id,brand,product,event_key").eq("deneme", false).or(`status.in.(alindi,yayinda),auto_draft_at.gte.${new Date(Date.now() - 30 * 60_000).toISOString()}`).gte("updated_at", ucGun).limit(1000),
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
    sb.from("tr_items").select("taken_by").eq("status", "alindi").eq("deneme", false).gte("taken_at", new Date(Date.now() - 48 * 3_600_000).toISOString()),
    sb.from("tr_drafts").select("author").eq("auto", true).eq("deneme", false).gte("created_at", gunBasi),
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
    }, 255_000));
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

  // Yapay zekâ görsel üretimi (fonksiyonun kendisi çağırır; yalnız image.yz_bekliyor bayrağı olan taslağa iş yapar)
  if (govde?.gorsel_uretim) {
    // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
    EdgeRuntime.waitUntil(elleUret(sb, Number(govde.gorsel_uretim), true).catch((e) => console.error("gorsel_uretim", e)));
    return Response.json({ basladi: true }, { status: 202, headers: CORS });
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
  // Görselsiz taslağa yapay zekâ ile görsel (ekip üyesi)
  if (govde?.gorsel_uret) {
    if (govde.yeniden) {
      const ist = (govde.secim ?? undefined) as { modeller?: string[]; gpt?: string; banana?: string; kalite?: string } | undefined;
      const ucretliVar = !!govde.ucretli || !!ist?.modeller?.some((m) => UCRETLI_MODEL.includes(m));
      if (ucretliVar && !p.is_admin) return Response.json({ hata: "Ücretli modellerle üretimi yalnız yöneticiler başlatabilir." }, { status: 403, headers: CORS });
      const r = await yenidenUret(sb, Number(govde.gorsel_uret), ucretliVar, ist);
      return Response.json(r, { status: "hata" in r ? 422 : 200, headers: CORS });
    }
    const r = await elleUret(sb, Number(govde.gorsel_uret));
    return Response.json(r, { status: "hata" in r ? 422 : 200, headers: CORS });
  }
  // Fotoğrafları yeniden tara / adaylardan kapak seç (ekip üyesi)
  if (govde?.gorsel_tara) { const r = await fotoTara(sb, Number(govde.gorsel_tara)); return Response.json(r, { status: "hata" in r ? 422 : 200, headers: CORS }); }
  if (govde?.foto_sec) { const r = await fotoSec(sb, Number(govde.foto_sec), Number(govde.sira)); return Response.json(r, { status: "hata" in r ? 422 : 200, headers: CORS }); }
  // Kör karşılaştırma: editör metni seçer (ekip üyesi). Gemini seçilirse taslağın metni onunkiyle değişir; panele gitmişse güncellenir.
  if (govde?.ab_sec) {
    const id = Number(govde.ab_sec), secim = govde.secim === "gemini" ? "gemini" : "claude";
    const { data: t } = await sb.from("tr_drafts").select("qc,site_id,title,spot,body").eq("id", id).single();
    const ab = (t?.qc as { ab?: AbKayit } | null)?.ab;
    if (!ab) return Response.json({ hata: "Bu taslakta karşılaştırma yok" }, { status: 422, headers: CORS });
    const yeniAb: AbKayit = { ...ab, durum: "secildi", secim, secen: p.name, zaman: new Date().toISOString(), ...(secim === "gemini" && !ab.secim ? { claude: { baslik: t!.title, spot: t!.spot, govde: t!.body } } : {}) } as AbKayit;
    // Claude'un metni ilk geçişte qc.ab.claude'a saklanır; Claude'a geri dönülürse oradan geri gelir
    const eskiClaude = (ab as { claude?: { baslik: string; spot: string; govde: string } }).claude;
    const metin = secim === "gemini" ? { title: ab.gemini.baslik, spot: ab.gemini.spot, body: ab.gemini.govde }
      : eskiClaude && ab.secim === "gemini" ? { title: eskiClaude.baslik, spot: eskiClaude.spot, body: eskiClaude.govde } : null;
    await sb.from("tr_drafts").update({ ...(metin ?? {}), qc: { ...(t!.qc as object), ab: yeniAb } }).eq("id", id);
    const site = metin && t?.site_id ? await siteGonder(sb, id, { zorla: true, kategoriSec }) : null;
    return Response.json({ ok: true, site }, { headers: CORS });
  }
  // Kıyas adaylarından başkasını kapak yap (ekip üyesi)
  if (govde?.gorsel_sec) {
    const r = await adaySec(sb, Number(govde.gorsel_sec), String(govde.model ?? ""), p.name ?? "");
    return Response.json(r, { status: "hata" in r ? 422 : 200, headers: CORS });
  }
  // Görsel modelleri listesi (yönetici): seçim ekranı için
  if (govde?.gorsel_modeller) {
    return Response.json(await modelListesi(sb), { headers: CORS });
  }
  // Deneme masası (yönetici; 4 Kasım 2026, kullanıcı: "taslak bozulmasın diye yöneticiye özel deneme sayfası; gerçek haberlerle").
  // Gerçek haberin kopyası (tr_items.deneme) üzerinde taslak akışının tamamı çalışır (yazım, kör karşılaştırma, denetim, video, görseller).
  // Kopya ve taslağı Haber Masası listelerine, otomatik taslağa, kümelemeye, panele, ölçümlere ve katkı puanına girmez (göç 0063).
  if (govde?.deneme) {
    if (!p.is_admin) return Response.json({ hata: "Sadece yönetici" }, { status: 403, headers: CORS });
    const d = govde.deneme as { kopyala?: number; sil?: number; temizle?: boolean };
    if (d.kopyala) {
      const { data: asil } = await sb.from("tr_items").select("*").eq("id", Number(d.kopyala)).eq("deneme", false).maybeSingle();
      if (!asil) return Response.json({ hata: "Haber bulunamadı" }, { status: 404, headers: CORS });
      const { id: _id, created_at: _c, updated_at: _u, ...alanlar } = asil as Record<string, unknown>;
      // Bağlantı tekil olmalı: sona #deneme eklenir (sayfa okunurken tarayıcı gibi # sonrası gönderilmez); olay anahtarı boş, kümelemeye girmez
      const { data: kopya, error } = await sb.from("tr_items").insert({
        ...alanlar, deneme: true, link: `${asil.link}#deneme-${Date.now()}`, event_key: "", status: "alindi", taken_by: u.user.id, taken_at: new Date().toISOString(),
        work_state: "taslak", work_error: "", touched: true, auto_draft_at: null, transfer_from: null, transfer_seen: true, translation: "", last_action: `${istanbulZaman()} · ${p.name} · deneme`,
      }).select("id").single();
      if (error || !kopya) return Response.json({ hata: error?.message ?? "Kopya oluşturulamadı" }, { status: 500, headers: CORS });
      const kid = Number(kopya.id);
      const sure = new Promise<void>((r) => setTimeout(async () => {
        await sb.from("tr_items").update({ work_state: "hata", work_error: "Zaman aşımı: kaynak site ya da yapay zekâ çok yavaş yanıt verdi." }).eq("id", kid).eq("work_state", "taslak");
        r();
      }, 135_000));
      // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
      EdgeRuntime.waitUntil(Promise.race([isle(sb, kid, "taslak", u.user.id, p.name ?? ""), sure]));
      return Response.json({ ok: true, item_id: kid }, { status: 202, headers: CORS });
    }
    if (d.sil) {
      const { data: t } = await sb.from("tr_drafts").select("item_id").eq("id", Number(d.sil)).eq("deneme", true).maybeSingle();
      if (!t) return Response.json({ hata: "Deneme taslağı bulunamadı" }, { status: 404, headers: CORS });
      await sb.from("tr_drafts").delete().eq("id", Number(d.sil)).eq("deneme", true);
      if (t.item_id) await sb.from("tr_items").delete().eq("id", t.item_id).eq("deneme", true);
      return Response.json({ ok: true }, { headers: CORS });
    }
    if (d.temizle) {
      const { data: silinen } = await sb.from("tr_drafts").delete().eq("deneme", true).select("id");
      await sb.from("tr_items").delete().eq("deneme", true);
      return Response.json({ ok: true, silinen: (silinen ?? []).length }, { headers: CORS });
    }
    return Response.json({ hata: "Geçersiz istek" }, { status: 400, headers: CORS });
  }
  // Onaya gönderildi: yöneticilere ve yayın yönetmenine Stüdyo bildirimi (4 Kasım 2026). Yalnız editörün elle gönderdiği; otomatik taslak değil.
  if (govde?.onay_bildir) {
    const o = govde.onay_bildir as { koleksiyon?: string; id?: number; baslik?: string };
    const { data: yon } = await sb.from("profiles").select("id").in("site_rol", ["admin", "yayin-yonetmeni"]).neq("id", u.user.id);
    const tur = o.koleksiyon === "reviews" ? "İnceleme" : o.koleksiyon === "comparisons" ? "Kıyas" : "Haber";
    const satirlar = ((yon ?? []) as { id: string }[]).map((x) => ({ user_id: x.id, body: `Onay bekliyor · ${tur}: ${String(o.baslik || "başlıksız").slice(0, 120)} — ${p.name} gönderdi (Stüdyo → Onay bekleyenler)` }));
    if (satirlar.length) await sb.from("notifications").insert(satirlar);
    return Response.json({ ok: true, bildirilen: satirlar.length }, { headers: CORS });
  }
  // Brave'i dene (yönetici): web ve görsel araması açık mı, bu ayki kullanım (4 Kasım 2026)
  if (govde?.brave_dene) {
    if (!p.is_admin) return Response.json({ hata: "Sadece yönetici" }, { status: 403, headers: CORS });
    const { data: k } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", "brave_arama").maybeSingle();
    const anahtar = (k as { deger?: string } | null)?.deger;
    if (!anahtar) return Response.json({ ok: false, hata: "Brave anahtarı kayıtlı değil." }, { headers: CORS });
    const dene = async (uc: string) => { try { const r = await fetch(`https://api.search.brave.com/res/v1/${uc}/search?count=3&q=sony%20camera`, { headers: { Accept: "application/json", "X-Subscription-Token": anahtar }, signal: AbortSignal.timeout(12_000) }); const t = await r.text(); return r.ok ? "açık" : r.status === 401 || r.status === 403 || r.status === 422 ? "planda kapalı (" + r.status + ")" : "hata " + r.status + ": " + t.slice(0, 80); } catch (e) { return "ulaşılamadı: " + String((e as Error).message).slice(0, 60); } };
    const [web, gorsel] = await Promise.all([dene("web"), dene("images")]);
    const ay = new Date().toISOString().slice(0, 7);
    const { data: sy } = await sb.from("tr_settings").select("value").eq("key", "brave_sayac").maybeSingle();
    const sayac = (sy?.value as { ay?: string; adet?: number } | null)?.ay === ay ? Number((sy!.value as { adet?: number }).adet ?? 0) : 0;
    await sb.from("tr_settings").upsert({ key: "brave_sayac", value: { ay, adet: sayac + 2 } });
    return Response.json({ ok: web === "açık", web, gorsel, kullanim: sayac + 2, sinir: 700 }, { headers: CORS });
  }
  // Claude anahtarını dene (yönetici): en küçük modelle tek kısa istek
  if (govde?.claude_dene) {
    if (!p.is_admin) return Response.json({ hata: "Sadece yönetici" }, { status: 403, headers: CORS });
    const t0 = Date.now();
    try {
      const c = await claudeJson({ sistem: 'Sadece {"tamam": true} döndür.', kullanici: "Bağlantı denemesi.", model: CLAUDE_MODEL.kucuk, ms: 30_000, maxTokens: 400, caba: "low" });
      return Response.json(c ? { ok: true, model: c.model, sure: Date.now() - t0 } : { ok: false, hata: "Claude anahtarı kayıtlı değil." }, { headers: CORS });
    } catch (e) { return Response.json({ ok: false, hata: String((e as Error).message ?? e).slice(0, 200) }, { headers: CORS }); }
  }
  // Cloudflare görsel programını dene (yönetici): yeni kod ve yapay zekâ bağlaması yerinde mi
  if (govde?.uret_dene) {
    if (!p.is_admin) return Response.json({ hata: "Sadece yönetici" }, { status: 403, headers: CORS });
    const t0 = Date.now();
    try { const g = await uret(sb, "klein", fluxIstem("a modern camera on a wooden desk"), 60_000); return Response.json({ ok: true, model: g.model, sure: Date.now() - t0, boyut: Math.round(g.b64.length * 0.75 / 1024) }, { headers: CORS }); }
    catch (e) {
      const m = String((e as Error).message ?? e);
      // Günlük ücretsiz pay bitti (4006): bağlantı sağlam, hata değil (4 Kasım 2026)
      if (/4006|daily free allocation/i.test(m)) return Response.json({ ok: false, pay: true, hata: "Bağlantı çalışıyor, ama Cloudflare'in bugünkü ücretsiz payı bitti (günde 10.000 birim). Pay her gece 03.00'te yenilenir; o zamana kadar görseller Nano Banana ve GPT Image ile üretilir." }, { headers: CORS });
      const aciklama = /AI bağlaması eksik/.test(m) ? "Kod güncel ama Workers AI bağlaması yok: Settings → Bindings → Workers AI → AI." : /işlenemedi|IMAGES/.test(m) ? "Cloudflare'deki kod eski: yeni kodu yapıştırıp Deploy et." : m;
      return Response.json({ ok: false, hata: aciklama }, { headers: CORS });
    }
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

  // İşçi süre sınırına (400 sn) takılmadan önce işi kesip hatayı yaz; "yazılıyor"da asılı kalmasın
  const sure = new Promise<void>((r) => setTimeout(async () => {
    await sb.from("tr_items").update({ work_state: "hata", work_error: "Zaman aşımı: kaynak site ya da yapay zekâ çok yavaş yanıt verdi. Tekrar dene." })
      .eq("id", Number(item_id)).eq("work_state", tur);
    r();
  }, 135_000));
  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  EdgeRuntime.waitUntil(Promise.race([isle(sb, Number(item_id), tur, u.user.id, p.name), sure]));
  return Response.json({ basladi: true }, { status: 202, headers: CORS });
});
