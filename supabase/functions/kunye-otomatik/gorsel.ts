// Künye ürün görseli (5 Kasım 2026, kullanıcı: "versus.com'daki gibi olacak görseller, hedef o"; "doğrudan üreticiden, arka planı kesilmiş,
// en doğru görsel"). Yalnız üreticinin kendi sitesindeki ürün görselleri aday olur (sayfanın JSON-LD ürün görselleri, galeri görselleri,
// paylaşım görseli; az çıkarsa Brave görsel araması yalnız markanın alan adından). Wikimedia ve başka siteler kullanılmaz.
// Adaylar indirilip boyutuna bakılır, yapay zekâ görerek seçer (bu model mi, tek ürün, tamamı kadrajda, önden ya da 3/4, sade zemin);
// arka plan Cloudflare'de silinir (index.ts gorselIsle), kesilmiş hâli yeniden görerek denetlenir, geçmezse sıradaki aday denenir.
// Uygun görsel yoksa hiç konmaz.
import { createClient } from "npm:@supabase/supabase-js@2";
import { claudeJson, CLAUDE_MODEL } from "../triyaj-taslak/claude.ts";
import { anahtarlar as geminiAnahtarlari } from "./anahtar.ts";

type Sb = ReturnType<typeof createClient>;
export type Resim = { mime: string; b64: string };
export type UrunGorseli = { url: string; sayfa: string; kaynak: string; yazar: string; lisans: string; neden?: string; yedekler?: { url: string; sayfa: string }[] };

const UA = "Mozilla/5.0 (compatible; UpdatedStudyo/1.0; +https://www.updated.com.tr; kunye gorseli)";
const sade = (x: string) => x.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/g, "");
const hostAl = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
/** Markanın kendi alan adı mı (haber/söylenti siteleri marka adını taşısa da sayılmaz) */
export const ureticiAlani = (u: string, marka: string) => {
  const h = hostAl(u), m = sade(marka).slice(0, 5);
  return !!m && sade(h).includes(m) && !/rumou?rs?|news|review|forum|blog|fans?|wiki/i.test(h);
};
const ELE = /logo|icon|sprite|favicon|badge|flag|avatar|placeholder|loading|spinner|blank|pixel|1x1|award|rating|social|payment|qr[-_]?code|banner|promo|tradein|bazaarvoice|\.svg|\.gif/i;
// Menü, alt bilgi, küçük resim gibi yerlerdeki görseller geride kalır (silinmez; yapay zekâ yine görebilir)
const GERI = /gnb|nav|menu|chapternav|footer|header|thumb|@small|@mini|_small|-small|[-_]kv(?:[-_.]|$)|share-image/i;
// Aynı görselin boy ekleri (@large, _2x, @origin): tek adaya indirilir, en büyüğü kalır
const BOY = /(@(?:origin|ultra|extra|xlarge|large|retina_small|medium|small|mini|thumb)|_large_2x|_large|_2x|@\d+\*\d+)(?=\.\w+(?:\?|$))/i;
const BOY_SIRA = ["origin", "ultra", "extra", "xlarge", "large_2x", "2x", "large", "medium", "retina_small", "small", "mini", "thumb"];
// Cihaza göre kopyalar (Samsung -mo/-tb/-pc, -lowband): tek aday, masaüstü/eksiz olan kalır
const CIHAZ = /[-_](?:mo|tb|pc|lowband|mobile|tablet|desktop)(?=\.\w+(?:\?|$))/i;
const boyPuan = (u: string) => (CIHAZ.test(u) && !/[-_]pc(?=\.)/i.test(u) ? 3 : 0) + (() => { const m = u.match(BOY)?.[1]?.replace(/^[@_]/, "").toLowerCase() ?? ""; const i = BOY_SIRA.indexOf(m); return i < 0 ? (m ? 20 : 5) : i; })();

/** Görselin piksel boyutu (JPEG, PNG, WebP başlığından) */
export function boyut(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 30) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: v.getUint32(16), h: v.getUint32(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if ((m >= 0xd0 && m <= 0xd9) || m === 0x01) { i += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return null;
  }
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    const t = String.fromCharCode(...b.slice(12, 16));
    if (t === "VP8 ") return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    if (t === "VP8L") { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    if (t === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  return null;
}

const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const nitelik = (etiket: string, ad: string) => etiket.match(new RegExp(`\\s${ad}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? "";

type Aday = { url: string; sayfa: string; puan: number; alt: string };
/** Üretici sayfasının HTML'indeki ürün görseli adayları: JSON-LD ürün görselleri, img/source (srcset'in en büyüğü), paylaşım görseli ve
 *  sayfa içi verideki görsel adresleri (DJI, Apple, Samsung görselleri sayfaya gömülü veride, img etiketinde değil; yalnız markanın ya da
 *  sayfanın kendi sunucusundakiler). Puan: kaynak türü + adresinde/alt metninde ürün adının parçaları. */
export function sayfaGorselleri(html: string, sayfa: string, urunAd: string, marka: string): Aday[] {
  const out: Aday[] = [];
  const parcalar = urunAd.toLocaleLowerCase("tr-TR").split(/[^a-z0-9]+/).filter((p) => p.length >= 2 || /\d/.test(p));
  const site = sade(hostAl(sayfa).split(".").slice(-2, -1)[0] ?? "");
  const ekle = (ham: string, puan: number, alt = "") => {
    let url = ""; try { url = new URL(ham.replace(/&amp;/g, "&").replace(/\\u002F/gi, "/").trim(), sayfa).href; } catch { return; }
    if (!/^https?:\/\//.test(url) || ELE.test(url.split("?")[0])) return;
    const yol = (new URL(url).pathname + " " + alt).toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]+/g, " ");
    const es = parcalar.filter((p) => new RegExp(`(^| )${p}( |$)`).test(yol) || yol.replace(/ /g, "").includes(p) && p.length >= 4).length;
    out.push({ url, sayfa, alt: alt.slice(0, 120), puan: puan + es * 2 + (es === parcalar.length && es > 1 ? 2 : 0) - (GERI.test(url) ? 4 : 0) });
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j: unknown; try { j = JSON.parse(m[1].trim()); } catch { continue; }
    const yigin: unknown[] = [j];
    while (yigin.length) {
      const o = yigin.pop();
      if (!o || typeof o !== "object") continue;
      if (Array.isArray(o)) { yigin.push(...o); continue; }
      const r = o as Record<string, unknown>;
      if (/Product/i.test(([] as unknown[]).concat(r["@type"] ?? []).join(" "))) {
        for (const im of ([] as unknown[]).concat(r.image ?? [])) ekle(typeof im === "string" ? im : String((im as Record<string, unknown>)?.url ?? (im as Record<string, unknown>)?.contentUrl ?? ""), 6);
      }
      for (const v of Object.values(r)) if (v && typeof v === "object") yigin.push(v);
    }
  }
  for (const m of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const e = m[0], alt = nitelik(e, "alt");
    const set = nitelik(e, "data-srcset") || nitelik(e, "srcset");
    let u = "";
    if (set) {
      const secenek = set.split(/,\s+(?=\S)/).map((p) => { const [a, w] = p.trim().split(/\s+/); return { a, w: parseFloat(w ?? "1") || 1 }; }).sort((x, y) => y.w - x.w);
      u = secenek[0]?.a ?? "";
    }
    u = u || nitelik(e, "data-zoom-image") || nitelik(e, "data-large") || nitelik(e, "data-src") || nitelik(e, "src");
    if (u) ekle(u, 1, alt);
  }
  const og = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i)?.[1];
  if (og) ekle(og, 2);
  const icVeri = html.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
  let n = 0;
  for (const m of icVeri.matchAll(/["'(\s,]((?:https?:)?\/\/[^"'\s<>()]+?\.(?:png|jpe?g|webp)|\/[^"'\s<>()]+?\.(?:png|jpe?g|webp))(?:\?[^"'\s<>()]*)?/gi)) {
    if (++n > 600) break;
    const u = m[1].startsWith("//") ? "https:" + m[1] : m[1];
    const h = u.startsWith("/") ? hostAl(sayfa) : hostAl(u);
    if (!ureticiAlani("https://" + h, marka) && !(site && sade(h).includes(site))) continue;
    ekle(u, 0);
  }
  // Aynı görselin boy ekli kopyaları tek aday (en büyük boy), aynı adres tek aday (en yüksek puan)
  const goruldu = new Map<string, Aday>();
  for (const a of out) {
    const k = a.url.split("?")[0].replace(BOY, "").replace(CIHAZ, "");
    const o = goruldu.get(k);
    if (!o) { goruldu.set(k, a); continue; }
    const puan = Math.max(o.puan, a.puan);
    goruldu.set(k, { ...(boyPuan(a.url) < boyPuan(o.url) ? a : o), puan });
  }
  return [...goruldu.values()].sort((a, b) => b.puan - a.puan);
}

/** Markanın alan adındaki görseller (Brave görsel araması; künye ile ortak aylık sayaç). Az aday çıkınca kullanılır. */
async function braveGorsel(sb: Sb, q: string, marka: string, sinir: number): Promise<Aday[]> {
  const { data } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", "brave_arama").maybeSingle();
  const anahtar = (data as { deger?: string } | null)?.deger;
  if (!anahtar) return [];
  const ay = new Date().toISOString().slice(0, 7);
  const { data: sy } = await sb.from("tr_settings").select("value").eq("key", "brave_sayac").maybeSingle();
  const sayac = (sy?.value as { ay?: string; adet?: number } | null)?.ay === ay ? Number((sy!.value as { adet?: number }).adet ?? 0) : 0;
  if (sayac >= sinir) return [];
  await sb.from("tr_settings").upsert({ key: "brave_sayac", value: { ay, adet: sayac + 1 } });
  const r = await fetch("https://api.search.brave.com/res/v1/images/search?count=40&safesearch=strict&q=" + encodeURIComponent(q), { headers: { Accept: "application/json", "X-Subscription-Token": anahtar }, signal: AbortSignal.timeout(12_000) }).catch(() => null);
  if (!r?.ok) { await r?.body?.cancel().catch(() => {}); return []; }
  const j = await r.json().catch(() => null);
  return ((j?.results ?? []) as { url?: string; title?: string; properties?: { url?: string } }[])
    .filter((x) => x.properties?.url && x.url && (ureticiAlani(x.url, marka) || ureticiAlani(x.properties.url, marka)) && !ELE.test(x.properties.url.split("?")[0]))
    .slice(0, 8).map((x) => ({ url: x.properties!.url!, sayfa: x.url!, puan: 3, alt: (x.title ?? "").slice(0, 120) }));
}

type Inen = Aday & { mime: string; veri: Uint8Array; w: number; h: number };
async function indir(a: Aday): Promise<Inen | null> {
  const r = await fetch(a.url, { headers: { "User-Agent": UA, Accept: "image/webp,image/png,image/jpeg,image/*;q=0.8", Referer: a.sayfa }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  const mime = (r?.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!r?.ok || !/^image\/(jpeg|png|webp)$/.test(mime)) { await r?.body?.cancel().catch(() => {}); return null; }
  const veri = new Uint8Array(await r.arrayBuffer().catch(() => new ArrayBuffer(0)));
  // Claude'a giden görsel 5 MB altında olmalı (base64 büyütür); 20 KB altı küçük resim/simge
  if (veri.byteLength < 20_000 || veri.byteLength > 3_700_000) return null;
  const b = boyut(veri);
  if (!b || Math.min(b.w, b.h) < 500 || b.w / b.h > 2.6 || b.h / b.w > 2.2) return null;
  return { ...a, mime, veri, w: b.w, h: b.h };
}

const SECIM_SEMA = {
  type: "object",
  properties: { uygun: { type: "array", items: { type: "integer" } }, neden: { type: "string" }, elenen: { type: "string" } },
  required: ["uygun", "neden", "elenen"], additionalProperties: false,
};
const SECIM_SISTEM = `Bir teknoloji sitesinin ürün künyesi için ÜRÜN GÖRSELİ seçiyorsun. Hedef versus.com'daki gibi: ürünün kendisi, tek başına; arka planı sonra silinecek ve ürün beyaz/şeffaf zeminde gösterilecek. Adaylar üreticinin kendi sitesinden; numaralı ("Aday N:") geliyor.
KURALLAR (hepsi sağlanmalı):
1. Görsel TAM OLARAK bu modeli göstermeli. Kardeş model (FE, Pro, Ultra, Mini, Plus, Lite, farklı nesil, farklı lens yuvası/odak uzaklığı) SEÇİLMEZ. Emin değilsen seçme.
2. Tek ürün; tamamı kadrajda, kenardan kesilmemiş; önden ya da 3/4 açı. Telefonda resmî ön yüz ya da ön+arka birlikte render olur. Lenste yandan ya da 3/4 görünüm olur.
3. Sade zemin (beyaz, gri, tek renk ya da zaten şeffaf). Yaşam tarzı fotoğrafı, elde tutulan, sahnede, kolaj, metinli afiş/banner, karşılaştırma, kutu, aksesuarlarla dolu kare, ekran görüntüsü, logo SEÇİLMEZ.
4. Net ve yeterince büyük; ürün kareyi iyi doldurmalı.
5. Renk seçeneklerinden hangisi olduğu fark etmez; en nötr/ana renk tercih edilir.
Uygun olanları iyiden kötüye sırala. Hiçbiri uygun değilse "uygun": [].
Yanıt yalnız JSON: {"uygun":[3,1],"neden":"seçilenin kısa gerekçesi","elenen":"diğerlerinin kısa nedenleri"}`;

const KESIM_SEMA = {
  type: "object",
  properties: { gecti: { type: "boolean" }, sorun: { type: "string" } },
  required: ["gecti", "sorun"], additionalProperties: false,
};
const KESIM_SISTEM = `Arka planı yazılımla silinmiş bir ürün görselini denetliyorsun (zemin şeffaf; sana koyu ya da açık zeminde görünebilir). Görsel bir teknoloji sitesinin ürün künyesinde, versus.com'daki gibi tek başına gösterilecek.
GEÇER: ürün eksiksiz (kesilmiş, oyulmuş, eksik parça yok), zeminden kalıntı yok (gölge, masa, el, duvar, yazı, başka nesne), tek ürün, verilen ürünle uyumlu.
GEÇMEZ: ürünün bir kısmı silinmiş ya da yarım; zemin parçaları kalmış; birden çok ürün/nesne; ürün değil.
Yanıt yalnız JSON: {"gecti":true,"sorun":""} ya da {"gecti":false,"sorun":"kısa neden"}`;

/** Görerek karar: önce Claude (görsel rolü), anahtarı/kredisi yoksa ya da hata verirse ücretsiz Gemini */
export async function gorerekSor(sistem: string, kullanici: string, resimler: (Resim & { etiket?: string })[], sema: Record<string, unknown>, ms: number): Promise<Record<string, any> | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    const c = await claudeJson({ sistem, kullanici, model: CLAUDE_MODEL.gorsel, ms, sema, resimler, maxTokens: 6000, caba: "medium", fonk: "kunye-otomatik" });
    if (c) return c.veri;
  } catch (e) { console.error("künye görsel Claude", e); }
  for (const a of await geminiAnahtarlari().catch(() => [])) {
    const parts: Record<string, unknown>[] = [];
    for (const r of resimler) { if (r.etiket) parts.push({ text: r.etiket + ":" }); parts.push({ inline_data: { mime_type: r.mime, data: r.b64 } }); }
    parts.push({ text: kullanici });
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent", {
      method: "POST", signal: AbortSignal.timeout(Math.min(ms, 90_000)), headers: { "Content-Type": "application/json", "x-goog-api-key": a.deger },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sistem }] }, contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
    }).catch(() => null);
    if (!r?.ok) { await r?.body?.cancel().catch(() => {}); continue; }
    const j = await r.json().catch(() => null);
    const t = (j?.candidates?.[0]?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
    try { return JSON.parse(t); } catch { const m = t.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } }
  }
  return null;
}

/** Ürünün en doğru üretici görseli ve sıradaki yedekleri; uygun yoksa null. sayfalar: okunan üretici sayfaları (adres + HTML). */
export async function urunGorseliBul(sb: Sb, o: { marka: string; ad: string; tur: string; sayfalar: { url: string; html: string }[]; braveSinir: number }, iz: string[]): Promise<UrunGorseli | null> {
  // Üretici sayfaları + markanın alan adında görsel araması (mağaza sayfalarındaki düz zeminli ürün çekimleri çoğunlukla buradan gelir)
  const parca = o.ad.toLocaleLowerCase("tr-TR").split(/[^a-z0-9]+/).filter((p) => p.length >= 2 || /\d/.test(p));
  const brave = (await braveGorsel(sb, `${o.marka} ${o.ad}`, o.marka, o.braveSinir).catch(() => [] as Aday[]))
    .map((a) => ({ ...a, puan: a.puan + 2 * parca.filter((p) => a.alt.toLocaleLowerCase("tr-TR").includes(p)).length }));
  const adaylar = [...o.sayfalar.filter((s) => ureticiAlani(s.url, o.marka)).flatMap((s) => sayfaGorselleri(s.html, s.url, o.ad, o.marka)), ...brave].sort((a, b) => b.puan - a.puan);
  const tekil = adaylar.filter((a, i, l) => l.findIndex((x) => x.url === a.url) === i).slice(0, 16);
  if (!tekil.length) { iz.push("görsel adayı yok"); return null; }
  const inen: Inen[] = [];
  for (let i = 0; i < tekil.length && inen.length < 8; i += 4) inen.push(...(await Promise.all(tekil.slice(i, i + 4).map((a) => indir(a).catch(() => null)))).filter((x): x is Inen => !!x));
  // Aynı dosya iki adresten geldiyse biri kalır
  const essiz = inen.filter((a, i, l) => !l.some((b, j) => j !== i && b.veri.byteLength === a.veri.byteLength && j < i)).slice(0, 8);
  if (!essiz.length) { iz.push(`görsel: ${tekil.length} aday indirilemedi/küçük`); return null; }
  const v = await gorerekSor(SECIM_SISTEM, `ÜRÜN: ${o.marka} ${o.ad} (${o.tur})\nAdaylar:\n${essiz.map((a, i) => `Aday ${i + 1}: ${a.w}×${a.h}, ${hostAl(a.sayfa)}${a.alt ? `, "${a.alt}"` : ""}`).join("\n")}`,
    essiz.map((a, i) => ({ mime: a.mime, b64: b64(a.veri), etiket: `Aday ${i + 1}` })), SECIM_SEMA, 90_000).catch(() => null);
  if (!v) { iz.push("görsel: yapay zekâ göremedi"); return null; }
  const sira = (Array.isArray(v.uygun) ? v.uygun : []).map((n: unknown) => essiz[Number(n) - 1]).filter(Boolean) as Inen[];
  if (!sira.length) { iz.push("görsel: uygun yok (" + String(v.elenen ?? "").slice(0, 80) + ")"); return null; }
  iz.push(`görsel: ${essiz.length} adaydan seçildi`);
  return { url: sira[0].url, sayfa: sira[0].sayfa, kaynak: "Üretici", yazar: o.marka, lisans: "Basın görseli", neden: String(v.neden ?? "").slice(0, 200), yedekler: sira.slice(1, 3).map((a) => ({ url: a.url, sayfa: a.sayfa })) };
}

/** Arka planı silinmiş görselin denetimi; yapay zekâ yoksa geçti sayılır (editör yine görür) */
export async function kesimDenetle(webp: Uint8Array, urun: string): Promise<{ gecti: boolean; sorun: string }> {
  const v = await gorerekSor(KESIM_SISTEM, `ÜRÜN: ${urun}`, [{ mime: "image/webp", b64: b64(webp) }], KESIM_SEMA, 60_000).catch(() => null);
  return v ? { gecti: v.gecti !== false, sorun: String(v.sorun ?? "").slice(0, 160) } : { gecti: true, sorun: "" };
}
