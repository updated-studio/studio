// Künye ürün görseli (5 Kasım 2026, kullanıcı: "versus.com'daki gibi olacak görseller, hedef o"; "doğrudan üreticiden, arka planı kesilmiş,
// en doğru görsel"). Yalnız üreticinin kendi sitesindeki ürün görselleri aday olur (sayfanın JSON-LD ürün görselleri, galeri görselleri,
// paylaşım görseli; az çıkarsa Brave görsel araması yalnız markanın alan adından). Wikimedia ve başka siteler kullanılmaz.
// Adaylar indirilip boyutuna bakılır, yapay zekâ görerek seçer (bu model mi, tek ürün, tamamı kadrajda, önden ya da 3/4, sade zemin);
// arka plan Cloudflare'de silinir (index.ts gorselIsle), kesilmiş hâli yeniden görerek denetlenir, geçmezse sıradaki aday denenir.
// Uygun görsel yoksa hiç konmaz.
import { createClient } from "npm:@supabase/supabase-js@2";
import { claudeAramali, claudeJson, CLAUDE_MODEL } from "../triyaj-taslak/claude.ts";
// Görsel çözme/küçültme (imagescript, MIT): istekte yüklenir; yüklenemezse görsel olduğu gibi kullanılır, fonksiyonun açılışı bozulmaz
type IS = typeof import("npm:imagescript@1.3.0");
let isYuk: Promise<IS | null> | null = null;
const imagescript = () => (isYuk ??= import("npm:imagescript@1.3.0").then((m) => m as IS).catch((e) => { console.error("imagescript", e); return null; }));
import { anahtarlar as geminiAnahtarlari } from "./anahtar.ts";

type Sb = ReturnType<typeof createClient>;
export type Resim = { mime: string; b64?: string; url?: string }; // url: Claude görseli kendisi indirir
export type UrunGorseli = { url: string; sayfa: string; kaynak: string; yazar: string; lisans: string; neden?: string; w?: number; h?: number; alfa?: boolean; yedekler?: { url: string; sayfa: string; alfa?: boolean }[] };

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

type Aday = { url: string; sayfa: string; puan: number; alt: string; bayi?: boolean }; // bayi: üreticinin görseli bayi/inceleme sitesinden
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
  const sonuc = ((j?.results ?? []) as { url?: string; title?: string; properties?: { url?: string } }[]).filter((x) => x.properties?.url && x.url && !ELE.test(x.properties.url.split("?")[0]));
  const uretici = sonuc.filter((x) => ureticiAlani(x.url!, marka) || ureticiAlani(x.properties!.url!, marka));
  // Üreticinin sitesi açılmazsa ya da düz zeminli görsel yoksa (5 Kasım 2026, kullanıcı: "sitesinde yoksa başka kaynak yok mu"): bayi ve inceleme
  // sitelerindeki ürün görselleri (çoğu üreticinin kendi basın görseli) yedek aday olur; yalnız üreticide hiç uygun yoksa yarışır, denetim aynı
  const bayi = sonuc.filter((x) => !uretici.includes(x) && (BAYI.test(x.url!) || BAYI.test(x.properties!.url!)));
  return [...uretici.slice(0, 8).map((x) => ({ url: x.properties!.url!, sayfa: x.url!, puan: 3, alt: (x.title ?? "").slice(0, 120) })),
    ...bayi.slice(0, 8).map((x) => ({ url: x.properties!.url!, sayfa: x.url!, puan: 0, alt: (x.title ?? "").slice(0, 120), bayi: true }))];
}
const BAYI = /bhphotovideo\.com|bhphoto\.com|adorama\.com|media-amazon\.com|amazon\.(?:com|com\.tr|de|co\.uk|fr|it|es)\/|gsmarena\.com|dpreview\.com|wex\.co\.uk|cvp\.com|thomann\.de|calumetphoto|hepsiburada\.com|trendyol\.com|teknosa\.com|mediamarkt\.|vatanbilgisayar\.com|fotografium\.com|notebookcheck\.net|phonearena\.com/i;

// 5 Kasım 2026 (kullanıcı: "görüntü kalitesi düşük"): kısa kenarı 500, uzun kenarı 1000 pikselden küçük görsel aday olmaz.
// Bellek (işçi 150 MB'ta kesilir; ilk sürüm büyük görselleri bellekte tutup turu öldürüyordu): görsel en çok 12 MB, ikişer ikişer indirilir,
// ham veri tutulmaz (yalnız önizleme); yapay zekâya 1,2 MB altı görsel olduğu gibi, üstü 7 megapikselden küçükse 1024 px JPEG'e küçültülüp
// gider (çözme sırayla, aynı anda tek görsel).
// Şeffaflık PNG başlığından okunur (renk türü 4/6 = alfa kanalı), çözmeden.
type Inen = Aday & { mime: string; bayt: number; w: number; h: number; alfa: boolean; onizleme: Resim };
const KUCULT_MP = 7e6;
async function indir(a: Aday): Promise<Inen | null> {
  const r = await fetch(a.url, { headers: { "User-Agent": UA, Accept: "image/webp,image/png,image/jpeg,image/*;q=0.8", Referer: a.sayfa }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const mime = (r?.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!r?.ok || !/^image\/(jpeg|png|webp)$/.test(mime) || Number(r.headers.get("content-length") ?? 0) > 12e6) { await r?.body?.cancel().catch(() => {}); return null; }
  let veri: Uint8Array | null = new Uint8Array(await r.arrayBuffer().catch(() => new ArrayBuffer(0)));
  const bayt = veri.byteLength;
  if (bayt < 20_000 || bayt > 12e6) return null;
  const b = boyut(veri);
  if (!b || Math.min(b.w, b.h) < 500 || Math.max(b.w, b.h) < 1000 || b.w / b.h > 2.6 || b.h / b.w > 2.2) return null;
  const alfa = mime === "image/png" ? veri[25] === 6 || veri[25] === 4 : mime === "image/webp" ? String.fromCharCode(...veri.slice(12, 16)) === "VP8X" && !!(veri[20] & 0x10) : false;
  if (bayt <= 1_200_000) return { ...a, mime, bayt, ...b, alfa, onizleme: { mime, b64: b64(veri) } };
  // 1,2-4,5 MB: sunucuda çözülmez, Claude adresten kendisi indirir (5 Kasım 2026: imagescript çözmesi işçinin işlemci sınırını aşıp turu kesiyordu)
  if (bayt <= 4_500_000) return { ...a, mime, bayt, ...b, alfa, onizleme: { mime, url: a.url } };
  if (mime === "image/webp" || b.w * b.h > KUCULT_MP) return null;
  const birak = await sira();
  try {
    const is = await imagescript(); if (!is) return null;
    const { Image } = is;
    let im: InstanceType<IS["Image"]> | null = await is.decode(veri) as InstanceType<IS["Image"]>;
    veri = null;
    const k = im.width >= im.height ? im.resize(1024, Image.RESIZE_AUTO) : im.resize(Image.RESIZE_AUTO, 1024);
    im = null;
    const zemin = new Image(k.width, k.height).fill(0xffffffff); zemin.composite(k, 0, 0);
    return { ...a, mime, bayt, ...b, alfa, onizleme: { mime: "image/jpeg", b64: b64(await zemin.encodeJPEG(85)) } };
  } catch { return null; } finally { birak(); }
}
/** Görsel çözme sırası: aynı anda tek görsel çözülür (bellek) */
let kuyruk: Promise<void> = Promise.resolve();
function sira(): Promise<() => void> {
  let birak!: () => void;
  const once = kuyruk;
  kuyruk = new Promise<void>((ok) => { birak = ok; });
  return once.then(() => birak);
}

/** Şeffaf zeminli resmî PNG (çoğu üreticinin mağaza görseli): arka plan silinmeden, ürün sınırından kırpılıp 1600×900 şeffaf tuvale
 *  ortalanır (ürün 1360×720 alana sığar; Cloudflare işçisiyle aynı ölçü). Silme yazılımının kenar bozmasını önler. Çözülemezse null. */
export async function seffafTuval(veri: Uint8Array): Promise<Uint8Array | null> {
  const b = boyut(veri);
  if (!b || b.w * b.h > KUCULT_MP) return null; // büyükse Cloudflare keser (bellek)
  const birak = await sira();
  try {
    const is = await imagescript(); if (!is) return null;
    const { Image } = is;
    const im = await is.decode(veri) as InstanceType<IS["Image"]>;
    const { width: W, height: H, bitmap: p } = im;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const k = im.crop(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    const o = Math.min(1360 / k.width, 720 / k.height);
    k.resize(Math.max(1, Math.round(k.width * o)), Math.max(1, Math.round(k.height * o)));
    const t = new Image(1600, 900); t.composite(k, Math.round((1600 - k.width) / 2), Math.round((900 - k.height) / 2));
    return await t.encodeWEBP(90);
  } catch { return null; } finally { birak(); }
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
   Aynı modelin renklerinin yan yana dizildiği resmî render (renk dizisi) tek ürün sayılmaz ama başka uygun aday yoksa en sona konabilir; tek renkli görsel hep önce gelir.
6. Uygunlar arasında yüksek çözünürlüklü olan ve şeffaf zeminli PNG (arka planı zaten yok, kesimi en temiz) öne alınır.
Uygun olanları iyiden kötüye sırala. Hiçbiri uygun değilse "uygun": [].
Yanıt yalnız JSON: {"uygun":[3,1],"neden":"seçilenin kısa gerekçesi","elenen":"diğerlerinin kısa nedenleri"}`;

const KESIM_SEMA = {
  type: "object",
  properties: { gecti: { type: "boolean" }, sorun: { type: "string" } },
  required: ["gecti", "sorun"], additionalProperties: false,
};
const KESIM_SISTEM = `Arka planı yazılımla silinmiş bir ürün görselini denetliyorsun (zemin şeffaf; sana koyu ya da açık zeminde görünebilir). Görsel bir teknoloji sitesinin ürün künyesinde, versus.com'daki gibi tek başına gösterilecek.
GEÇER: ürün eksiksiz (kesilmiş, oyulmuş, eksik parça yok), zeminden kalıntı yok (gölge, masa, el, duvar, yazı, başka nesne), verilen ürünle uyumlu.
AYNI ÜRÜNÜN birden çok görünümü GEÇER: üreticinin resmî render'ında telefonun/tabletin önü ve arkası yan yana ya da aynı modelin renkleri dizili (bunlar "birden çok ürün" sayılmaz). Kameraya takılı lens, gimbale takılı kamera da tek ürün görünümüdür.
GEÇMEZ: ürünün bir kısmı silinmiş, yarım ya da soluk/yarı saydam kalmış; zemin parçaları ya da kenarda kesimden kalan çizgi/hale var; FARKLI ürünler ya da aksesuar yığını; ürün değil.
Yanıt yalnız JSON: {"gecti":true,"sorun":""} ya da {"gecti":false,"sorun":"kısa neden"}`;

/** Görerek karar: önce Claude (görsel rolü), anahtarı/kredisi yoksa ya da hata verirse ücretsiz Gemini */
export async function gorerekSor(sistem: string, kullanici: string, resimler: (Resim & { etiket?: string })[], sema: Record<string, unknown>, ms: number): Promise<Record<string, any> | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const bitis = Date.now() + ms;
  try {
    const c = await claudeJson({ sistem, kullanici, model: CLAUDE_MODEL.gorsel, ms, sema, resimler, maxTokens: 6000, caba: "medium", fonk: "kunye-otomatik" });
    if (c) return c.veri;
  } catch (e) {
    console.error("künye görsel Claude", e);
    // Adresle gönderilen bir görseli Claude indiremediyse (site engelledi) yalnız sunucudan gönderilenlerle bir kez daha
    const acilmayan = resimler.filter((r) => r.url).map((r) => r.etiket).filter(Boolean);
    if (acilmayan.length && resimler.some((r) => r.b64) && bitis - Date.now() > 20_000) {
      const c = await claudeJson({ sistem, kullanici: `${kullanici}\n(Görseli açılamayan adaylar: ${acilmayan.join(", ")}; bunları seçme.)`, model: CLAUDE_MODEL.gorsel, ms: bitis - Date.now(), sema, resimler: resimler.filter((r) => r.b64), maxTokens: 6000, caba: "medium", fonk: "kunye-otomatik" }).catch(() => null);
      if (c) return c.veri;
    }
  }
  for (const a of await geminiAnahtarlari().catch(() => [])) {
    const parts: Record<string, unknown>[] = [];
    for (const r of resimler) { if (!r.b64) continue; if (r.etiket) parts.push({ text: r.etiket + ":" }); parts.push({ inline_data: { mime_type: r.mime, data: r.b64 } }); }
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
// Sayfa ajanı (5 Kasım 2026, kullanıcı: "üreticilerin yüksek kalite PNG'lerini bulmak bu kadar zor olmamalı; gerekirse yapay zekâyı zekileştirelim"):
// sayfalarda ve Brave'de iyi görsel çıkmazsa Claude web aramasıyla üreticinin mağaza, basın/medya kiti ve ürün sayfalarını bulur; sayfaları
// biz okuyup görselleri çıkarırız (yalnız markanın alan adı). Ürün başına en çok 4 arama (≈0,04 $ + jeton).
const AJAN_SISTEM = `Bir teknoloji sitesinin ürün künyesi için üreticinin YÜKSEK ÇÖZÜNÜRLÜKLÜ, düz zeminli ya da şeffaf (PNG) ÜRÜN GÖRSELLERİNİN bulunduğu RESMÎ sayfaları buluyorsun.
Öncelik: 1) üreticinin resmî mağaza/satın alma sayfası (ürün galerisi; ör. store.dji.com, apple.com/tr/shop, samsung.com/tr/.../buy), 2) üreticinin basın/medya merkezi (press kit, media assets, newsroom; yüksek çözünürlüklü indirme), 3) ürünün resmî sayfası (Türkiye ya da küresel).
Yalnız üreticinin kendi alan adları ve alt alan adları. Bayi, pazar yeri, haber, inceleme, forum, Amazon, Wikipedia OLMAZ. Sayfa TAM OLARAK bu modelin olmalı (kardeş model değil).
Gerekirse birkaç arama yap. Sayfada doğrudan görsel adresi (.png/.jpg) görürsen onu da ekleyebilirsin.
Yanıtın sonunda YALNIZ şu JSON: {"sayfalar":["https://..."],"gorseller":["https://...png"]} (en çok 6 sayfa, 6 görsel).`;
async function ajanAdaylari(o: { marka: string; ad: string; tur: string }, iz: string[], ms: number): Promise<Aday[]> {
  const c = await claudeAramali({ sistem: AJAN_SISTEM, kullanici: `ÜRÜN: ${o.marka} ${o.ad} (${o.tur})`, model: CLAUDE_MODEL.gorsel, ms, maxArama: 4, fonk: "kunye-otomatik" })
    .catch((e) => { iz.push("ajan: " + String((e as Error).message ?? e).slice(0, 60)); return null; });
  if (!c) return [];
  let j: { sayfalar?: unknown; gorseller?: unknown } = {};
  try { const m = c.metin.match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : {}; } catch { /* boş */ }
  const sayfalar = [...new Set(([] as unknown[]).concat(j.sayfalar ?? []).map(String))].filter((u) => /^https?:\/\//.test(u) && ureticiAlani(u, o.marka)).slice(0, 6);
  const out: Aday[] = ([] as unknown[]).concat(j.gorseller ?? []).map(String).filter((u) => /^https?:\/\//.test(u) && ureticiAlani(u, o.marka) && !ELE.test(u.split("?")[0]))
    .slice(0, 6).map((u) => ({ url: u, sayfa: sayfalar[0] ?? u, puan: 6, alt: "" }));
  const htmller = await Promise.all(sayfalar.map((u) => fetch(u, { headers: { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(12_000) })
    .then((r) => (r.ok && /html/i.test(r.headers.get("content-type") ?? "") ? r.text() : "")).catch(() => "")));
  sayfalar.forEach((u, i) => { if (htmller[i]) out.push(...sayfaGorselleri(htmller[i], u, o.ad, o.marka).map((a) => ({ ...a, puan: a.puan + 2 }))); });
  iz.push(`ajan: ${sayfalar.length} sayfa, ${out.length} aday`);
  return out;
}

/** Adayları indirir (en çok 8 uygun boyutlu), yapay zekâya gösterir; uygunları iyiden kötüye döner */
async function indirSec(o: { marka: string; ad: string; tur: string }, adaylar: Aday[], onceki: Inen[], iz: string[]) {
  const tekil = adaylar.filter((a, i, l) => l.findIndex((x) => x.url === a.url) === i && !onceki.some((x) => x.url === a.url)).slice(0, 16);
  const inen: Inen[] = [...onceki];
  for (let i = 0; i < tekil.length && inen.length < 8; i += 2) inen.push(...(await Promise.all(tekil.slice(i, i + 2).map((a) => indir(a).catch(() => null)))).filter((x): x is Inen => !!x));
  // Aynı dosya iki adresten geldiyse biri kalır
  const essiz = inen.filter((a, i, l) => !l.some((b, j) => j < i && b.bayt === a.bayt && b.w === a.w)).slice(0, 8);
  if (!essiz.length) { iz.push(`görsel: ${tekil.length} aday indirilemedi/küçük`); return { essiz, sira: [] as Inen[], v: null }; }
  const v = await gorerekSor(SECIM_SISTEM, `ÜRÜN: ${o.marka} ${o.ad} (${o.tur})\nAdaylar:\n${essiz.map((a, i) => `Aday ${i + 1}: ${a.w}×${a.h}${a.alfa ? ", şeffaf zeminli PNG" : ""}, ${hostAl(a.sayfa)}${a.alt ? `, "${a.alt}"` : ""}`).join("\n")}`,
    essiz.map((a, i) => ({ ...a.onizleme, etiket: `Aday ${i + 1}` })), SECIM_SEMA, 90_000).catch(() => null);
  if (!v) { iz.push("görsel: yapay zekâ göremedi"); return { essiz, sira: [] as Inen[], v: null }; }
  const sira = (Array.isArray(v.uygun) ? v.uygun : []).map((n: unknown) => essiz[Number(n) - 1]).filter(Boolean) as Inen[];
  if (!sira.length) iz.push("görsel: uygun yok (" + String(v.elenen ?? "").slice(0, 80) + ")");
  return { essiz, sira, v };
}

/** Ürünün en doğru üretici görseli ve sıradaki yedekleri; uygun yoksa null. sayfalar: okunan üretici sayfaları (adres + HTML). */
export async function urunGorseliBul(sb: Sb, o: { marka: string; ad: string; tur: string; sayfalar: { url: string; html: string }[]; braveSinir: number; bitis?: number }, iz: string[]): Promise<UrunGorseli | null> {
  // Üretici sayfaları + markanın alan adında görsel araması (mağaza sayfalarındaki düz zeminli ürün çekimleri çoğunlukla buradan gelir)
  const parca = o.ad.toLocaleLowerCase("tr-TR").split(/[^a-z0-9]+/).filter((p) => p.length >= 2 || /\d/.test(p));
  const brave = (await braveGorsel(sb, `${o.marka} ${o.ad}`, o.marka, o.braveSinir).catch(() => [] as Aday[]))
    .map((a) => ({ ...a, puan: a.puan + 2 * parca.filter((p) => a.alt.toLocaleLowerCase("tr-TR").includes(p)).length }));
  const bayiAday = brave.filter((a) => a.bayi);
  const adaylar = [...o.sayfalar.filter((s) => ureticiAlani(s.url, o.marka)).flatMap((s) => sayfaGorselleri(s.html, s.url, o.ad, o.marka)), ...brave.filter((a) => !a.bayi)].sort((a, b) => b.puan - a.puan);
  let { essiz, sira, v } = adaylar.length ? await indirSec(o, adaylar, [], iz) : { essiz: [] as Inen[], sira: [] as Inen[], v: null };
  // Uygun yoksa ya da en iyisi düşük çözünürlüklüyse (uzun kenar 1400 px altı, şeffaf değil) ajan üreticinin mağaza/basın sayfalarını arar
  const zayif = !sira.length || (Math.max(sira[0].w, sira[0].h) < 1400 && !sira[0].alfa);
  const kalan = (o.bitis ?? Date.now() + 300_000) - Date.now();
  if (zayif && kalan > 190_000) {
    const ek = (await ajanAdaylari(o, iz, 100_000)).sort((a, b) => b.puan - a.puan);
    if (ek.length) {
      // Önceki uygunlar (en çok 3) yeni adaylarla yeniden yarışır
      const r2 = await indirSec(o, ek, sira.slice(0, 3), iz);
      if (r2.sira.length) ({ essiz, sira, v } = r2);
    }
  }
  // Üreticide uygun yoksa bayi/inceleme sitelerindeki görseller (aynı seçim ve kesim denetimi)
  let bayidan = false;
  if (!sira.length && bayiAday.length && (o.bitis ?? Date.now() + 300_000) - Date.now() > 70_000) {
    const r3 = await indirSec(o, bayiAday.sort((a, b) => b.puan - a.puan), [], iz);
    if (r3.sira.length) { ({ essiz, sira, v } = r3); bayidan = true; iz.push("görsel: üreticide uygun yoktu, bayi sayfasından"); }
  }
  if (!sira.length) { if (!adaylar.length && !essiz.length && !bayiAday.length) iz.push("görsel adayı yok"); return null; }
  iz.push(`görsel: ${essiz.length} adaydan seçildi (${sira[0].w}×${sira[0].h}${sira[0].alfa ? ", şeffaf" : ""})`);
  return { url: sira[0].url, sayfa: sira[0].sayfa, kaynak: bayidan ? `Üretici görseli (${hostAl(sira[0].sayfa)})` : "Üretici", yazar: o.marka, lisans: "Basın görseli", neden: String(v?.neden ?? "").slice(0, 200), w: sira[0].w, h: sira[0].h, alfa: sira[0].alfa,
    yedekler: sira.slice(1, 3).map((a) => ({ url: a.url, sayfa: a.sayfa, alfa: a.alfa })) };
}

/** Arka planı silinmiş görselin denetimi; yapay zekâ yoksa geçti sayılır (editör yine görür) */
export async function kesimDenetle(webp: Uint8Array, urun: string): Promise<{ gecti: boolean; sorun: string }> {
  const v = await gorerekSor(KESIM_SISTEM, `ÜRÜN: ${urun}`, [{ mime: "image/webp", b64: b64(webp) }], KESIM_SEMA, 60_000).catch(() => null);
  return v ? { gecti: v.gecti !== false, sorun: String(v.sorun ?? "").slice(0, 160) } : { gecti: true, sorun: "" };
}
