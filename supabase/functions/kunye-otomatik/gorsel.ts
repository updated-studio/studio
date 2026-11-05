// Künye ürün görseli (5 Kasım 2026, kullanıcı: "versus.com'daki gibi olacak görseller, hedef o"; "doğrudan üreticiden, arka planı kesilmiş,
// en doğru görsel"). Yalnız üreticinin kendi sitesindeki ürün görselleri aday olur (sayfanın JSON-LD ürün görselleri, galeri görselleri,
// paylaşım görseli; az çıkarsa Brave görsel araması yalnız markanın alan adından). Wikimedia ve başka siteler kullanılmaz.
// Adaylar indirilip boyutuna bakılır, yapay zekâ görerek seçer (bu model mi, tek ürün, tamamı kadrajda, önden ya da 3/4, sade zemin);
// arka plan Cloudflare'de silinir (index.ts gorselIsle), kesilmiş hâli yeniden görerek denetlenir, geçmezse sıradaki aday denenir.
// Uygun görsel yoksa hiç konmaz.
// 6 Kasım 2026 (kullanıcı: "ana görsel yine tek ürün, karşıdan; albümünde yaşam tarzı vs. kaliteli, öncelik kaynaktan görseller yer alabilir";
// "direkt kaynağından alsa dekupe PNG, Cloudflare ile uğraşmaya gerek kalmaz"): seçim tek çağrıda hem ana görseli (şeffaf zeminli resmî PNG
// her zaman önce) hem künye albümünü (yalnız üreticinin kendi görselleri) verir. Arama ajanı kalktı; bayi adayları aynı seçimde yarışır.
import { createClient } from "npm:@supabase/supabase-js@2";
import { claudeJson, CLAUDE_MODEL } from "../triyaj-taslak/claude.ts";
import { anahtarlar as geminiAnahtarlari } from "./anahtar.ts";

type Sb = ReturnType<typeof createClient>;
export type Resim = { mime: string; b64?: string; url?: string }; // url: Claude görseli kendisi indirir
export type UrunGorseli = { url: string; sayfa: string; kaynak: string; yazar: string; lisans: string; neden?: string; w?: number; h?: number; alfa?: boolean; yedekler?: { url: string; sayfa: string; alfa?: boolean }[];
  /** Künye albümü adayları (üreticinin kendi görselleri; kesilmez). url boşsa ana görsel bulunamamış, yalnız albüm vardır. */
  albumAday?: { url: string; sayfa: string }[] };

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
    // .png çoğu zaman üreticinin dekupe (şeffaf zeminli) ürün görselidir; indirme sırasında öne geçer
    out.push({ url, sayfa, alt: alt.slice(0, 120), puan: puan + es * 2 + (es === parcalar.length && es > 1 ? 2 : 0) - (GERI.test(url) ? 4 : 0) + (/\.png(?:$|\?)/i.test(url) ? 1 : 0) });
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
// cvp.com çıkarıldı (6 Kasım 2026): görsellerinde "CVP" filigranı var, kesim denetiminden hiç geçmiyor
const BAYI = /bhphotovideo\.com|bhphoto\.com|adorama\.com|media-amazon\.com|amazon\.(?:com|com\.tr|de|co\.uk|fr|it|es)\/|gsmarena\.com|dpreview\.com|wex\.co\.uk|thomann\.de|calumetphoto|hepsiburada\.com|trendyol\.com|teknosa\.com|mediamarkt\.|vatanbilgisayar\.com|fotografium\.com|notebookcheck\.net|phonearena\.com/i;

// 5 Kasım 2026 (kullanıcı: "görüntü kalitesi düşük"): kısa kenarı 500, uzun kenarı 1000 pikselden küçük görsel aday olmaz.
// Bellek (işçi 150 MB'ta kesilir; ilk sürüm büyük görselleri bellekte tutup turu öldürüyordu): görsel en çok 12 MB, ikişer ikişer indirilir,
// ham veri tutulmaz (yalnız önizleme); yapay zekâya 1,2 MB altı görsel olduğu gibi, üstü 7 megapikselden küçükse 1024 px JPEG'e küçültülüp
// gider (çözme sırayla, aynı anda tek görsel).
// Şeffaflık PNG başlığından okunur (renk türü 4/6 = alfa kanalı), çözmeden.
type Inen = Aday & { mime: string; bayt: number; w: number; h: number; alfa: boolean; onizleme: Resim };
async function indir(a: Aday): Promise<Inen | null> {
  const r = await fetch(a.url, { headers: { "User-Agent": UA, Accept: "image/webp,image/png,image/jpeg,image/*;q=0.8", Referer: a.sayfa }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const bildirilen = (r?.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!r?.ok || !/^image\/(jpeg|png|webp)$/.test(bildirilen) || Number(r.headers.get("content-length") ?? 0) > 12e6) { await r?.body?.cancel().catch(() => {}); return null; }
  let veri: Uint8Array | null = new Uint8Array(await r.arrayBuffer().catch(() => new ArrayBuffer(0)));
  // Tür dosyanın ilk baytlarından (5 Kasım 2026: sunucu "png" deyip JPEG gönderiyordu, Claude 400 verip bütün seçimi düşürüyordu)
  const mime = veri[0] === 0x89 && veri[1] === 0x50 ? "image/png" : veri[0] === 0xff && veri[1] === 0xd8 ? "image/jpeg"
    : String.fromCharCode(...veri.slice(8, 12)) === "WEBP" ? "image/webp" : "";
  if (!mime) return null;
  const bayt = veri.byteLength;
  if (bayt < 20_000 || bayt > 12e6) return null;
  const b = boyut(veri);
  if (!b || Math.min(b.w, b.h) < 500 || Math.max(b.w, b.h) < 1000 || b.w / b.h > 2.6 || b.h / b.w > 2.2) return null;
  const alfa = mime === "image/png" ? veri[25] === 6 || veri[25] === 4 : mime === "image/webp" ? String.fromCharCode(...veri.slice(12, 16)) === "VP8X" && !!(veri[20] & 0x10) : false;
  if (bayt <= 1_200_000) return { ...a, mime, bayt, ...b, alfa, onizleme: { mime, b64: b64(veri) } };
  // 1,2-4,5 MB: sunucuda çözülmez, Claude adresten kendisi indirir (5 Kasım 2026: imagescript çözmesi işçinin işlemci sınırını aşıp turu kesiyordu)
  if (bayt <= 4_500_000) return { ...a, mime, bayt, ...b, alfa, onizleme: { mime, url: a.url } };
  // 4,5 MB üstü görsel aday olmaz (6 Kasım 2026: sunucuda küçültme için kullanılan imagescript bu ortamda hiç yüklenmiyordu, yani bu adaylar
  // zaten düşüyordu; kod sadeleşti)
  return null;
}

/** PNG'nin zemini gerçekten şeffaf mı (6 Kasım 2026, kullanıcı: "direkt kaynağından alsa dekupe PNG, Cloudflare ile uğraşmaya gerek kalmaz").
 *  Üreticinin dekupe görseli hiç işlenmeden kullanılır; tuvale oturtma onay sırasında tarayıcıda yapılır (KunyeOnay tuvaleOturt). Önceki
 *  yol (imagescript ile kırpıp tuvale koyma) bu ortamda hiç çalışmıyordu: kütüphane yüklenemediği için şeffaf PNG de Cloudflare'e gidip
 *  yeniden kesiliyor, bazen bozuluyordu (iPhone 17e).
 *  Dosya çözülmeden satır satır okunur (bellekte iki satır): alfa kanalı olan (renk türü 4/6), 8 ya da 16 bit, geçmesiz PNG'de şeffaf piksel
 *  payı en az %5 ise zemin şeffaftır. Alfa kanalı olup zemini opak olan (beyaz zeminli RGBA) görsel şeffaf sayılmaz. Okunamazsa null. */
export async function pngSeffaf(v: Uint8Array): Promise<{ seffaf: boolean; w: number; h: number; kutu: [number, number, number, number] } | null> {
  if (v.length < 64 || !(v[0] === 0x89 && v[1] === 0x50 && v[2] === 0x4e && v[3] === 0x47)) return null;
  const dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
  const w = dv.getUint32(16), h = dv.getUint32(20), derinlik = v[24], tur = v[25], gecmeli = v[28];
  if (!(tur === 6 || tur === 4) || !(derinlik === 8 || derinlik === 16) || gecmeli !== 0 || !w || !h || w * h > 9e6) return null; // 9 megapiksel üstü okunmaz (işçinin işlemci payı): Cloudflare yoluna düşer
  const bpp = (tur === 6 ? 4 : 2) * (derinlik / 8), satirBoy = w * bpp, alfaKay = bpp - derinlik / 8; // alfa pikselin son örneği; 16 bitte yüksek bayt önce
  const parcalar: Uint8Array[] = [];
  for (let i = 8; i + 12 <= v.length;) {
    const n = dv.getUint32(i), ad = String.fromCharCode(v[i + 4], v[i + 5], v[i + 6], v[i + 7]);
    if (ad === "IDAT") parcalar.push(v.subarray(i + 8, i + 8 + n));
    if (ad === "IEND") break;
    i += 12 + n;
  }
  if (!parcalar.length) return null;
  try {
    const okur = new Blob(parcalar as BlobPart[]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
    let once = new Uint8Array(satirBoy), bu = new Uint8Array(satirBoy);
    let y = 0, konum = -1, suzgec = 0, saydam = 0, x0 = w, y0 = h, x1 = -1, y1 = -1; // konum -1: satırın süzgeç baytı bekleniyor
    for (;;) {
      const { done, value } = await okur.read();
      if (done || y >= h) break;
      let p = 0;
      while (p < value.length && y < h) {
        if (konum < 0) { suzgec = value[p++]; konum = 0; continue; }
        const al = Math.min(satirBoy - konum, value.length - p);
        bu.set(value.subarray(p, p + al), konum); p += al; konum += al;
        if (konum < satirBoy) break;
        // Satır tamam: süzgeci geri al (PNG: 0 yok, 1 sol, 2 üst, 3 ortalama, 4 Paeth)
        if (suzgec === 1) for (let i = bpp; i < satirBoy; i++) bu[i] = (bu[i] + bu[i - bpp]) & 255;
        else if (suzgec === 2) for (let i = 0; i < satirBoy; i++) bu[i] = (bu[i] + once[i]) & 255;
        else if (suzgec === 3) for (let i = 0; i < satirBoy; i++) bu[i] = (bu[i] + (((i >= bpp ? bu[i - bpp] : 0) + once[i]) >> 1)) & 255;
        else if (suzgec === 4) for (let i = 0; i < satirBoy; i++) {
          const a = i >= bpp ? bu[i - bpp] : 0, b = once[i], c = i >= bpp ? once[i - bpp] : 0, pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          bu[i] = (bu[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
        } else if (suzgec !== 0) return null;
        for (let x = 0, i = alfaKay; x < w; x++, i += bpp) {
          if (bu[i] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; } else saydam++;
        }
        const t2 = once; once = bu; bu = t2; y++; konum = -1;
      }
    }
    await okur.cancel().catch(() => {});
    if (y < h || x1 < 0) return null;
    return { seffaf: saydam >= w * h * 0.05, w, h, kutu: [x0, y0, x1, y1] };
  } catch { return null; }
}

const SECIM_SEMA = {
  type: "object",
  properties: { uygun: { type: "array", items: { type: "integer" } }, album: { type: "array", items: { type: "integer" } }, neden: { type: "string" }, elenen: { type: "string" } },
  required: ["uygun", "album", "neden", "elenen"], additionalProperties: false,
};
const SECIM_SISTEM = `Bir teknoloji sitesinin ürün künyesi için ÜRÜN GÖRSELİ seçiyorsun. Hedef versus.com'daki gibi: ürünün kendisi, tek başına; arka planı sonra silinecek ve ürün beyaz/şeffaf zeminde gösterilecek. Adaylar çoğunlukla üreticinin kendi sitesinden, bazen bayi ya da inceleme sitesinden (oradaki ürün görseli çoğu zaman üreticinin basın görselidir; sitenin üretici olmaması tek başına eleme nedeni DEĞİLDİR); numaralı ("Aday N:") geliyor.
KURALLAR (hepsi sağlanmalı):
1. Görsel TAM OLARAK bu modeli göstermeli. Kardeş model (FE, Pro, Ultra, Mini, Plus, Lite, farklı nesil, farklı lens yuvası/odak uzaklığı) SEÇİLMEZ. Emin değilsen seçme.
2. Tek ürün; tamamı kadrajda, kenardan kesilmemiş.
   AÇI (5 Kasım 2026, kullanıcı: "amaç dümdüz açı"): en çok tercih edilen DÜMDÜZ, karşıdan, perspektifsiz görünüştür:
   telefon ve tablet düz önden (ya da resmî düz ön+arka), fotoğraf makinesi ve aksiyon kamerası düz önden, lens düz yandan (gövde yatay, ön camı solda ya da sağda),
   dizüstü düz önden açık, kulaklık ve mikrofon düz önden/yandan, drone ve gimbal düz önden ya da düz yandan. Otomobilde düz yan ya da sol ön çapraz.
   Düz açı yoksa hafif 3/4 açı kabul edilir ama düz açılı aday her zaman önce gelir; üstten, alttan, aşırı perspektifli çekim en sona.
3. Sade zemin (beyaz, gri, tek renk ya da zaten şeffaf). Yaşam tarzı fotoğrafı, elde tutulan, sahnede, kolaj, metinli afiş/banner, karşılaştırma, kutu, aksesuarlarla dolu kare, ekran görüntüsü, logo SEÇİLMEZ.
4. Net ve yeterince büyük; ürün kareyi iyi doldurmalı.
5. Renk seçeneklerinden hangisi olduğu fark etmez; en nötr/ana renk tercih edilir.
   Aynı modelin renklerinin yan yana dizildiği resmî render (renk dizisi) tek ürün sayılmaz ama başka uygun aday yoksa en sona konabilir; tek renkli görsel hep önce gelir.
6. Şeffaf zeminli PNG (üreticinin dekupe görseli; arka planı zaten yok, hiç işlenmeden kullanılır) kurallara uyuyorsa HER ZAMAN en öne alınır; sonra yüksek çözünürlüklü olan.
7. Eşit uygunlukta üreticinin kendi sitesindeki görsel bayi/inceleme sitesindekinden önce gelir.
Uygun olanları iyiden kötüye sırala. Aynı fotoğrafın farklı boyutları ya da birebir kopyaları TEK aday sayılır: listede her farklı çekimden yalnız en büyüğü olsun (editöre farklı seçenekler sunulacak; aynı görselin üç kopyası seçenek değildir). Hiçbiri uygun değilse "uygun": [].
ALBÜM ("album"): künyenin albümü için, ana görsel kurallarına uymasa da TAM OLARAK bu modeli gösteren KALİTELİ görseller: yaşam tarzı/kullanım fotoğrafı, başka açı (arka, yan, üst), detay çekimi, ürünün aksesuarıyla resmî çekimi. Yalnız üreticinin kendi sitesinden gelen adaylar (aday satırında "bayi" yazanlar albüme girmez). Albüme GİRMEZ: başka model ya da emin olunamayan, metinli afiş/banner, kolaj, karşılaştırma tablosu, ekran görüntüsü, logo, bulanık ya da küçük görsel, "uygun" listesindeki bir görselin kopyası ya da aynı çekimin başka boyutu. En iyiden başlayarak en çok 6; birbirine çok benzeyen karelerden biri. Yoksa "album": [].
Yanıt yalnız JSON: {"uygun":[3,1],"album":[5,2],"neden":"seçilenin kısa gerekçesi","elenen":"diğerlerinin kısa nedenleri"}`;

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

/** Adayları indirir (en çok 6 üretici + 4 bayi, uygun boyutlu), yapay zekâya tek seferde gösterir; uygunları iyiden kötüye ve albüm adaylarını döner */
const URETICI_ADAY = 6, BAYI_ADAY = 4, ALBUM_ADAY = 3;
const SAHNE = /[-_/](?:kv|key[-_]?visual|lifestyle|life|scene|gallery|feature|hero|story|usage|inuse|in[-_]use|ambient|mood)(?:[-_/.\d]|$)/i;
async function indirSec(o: { marka: string; ad: string; tur: string }, adaylar: Aday[], iz: string[]) {
  const tekil = adaylar.filter((a, i, l) => l.findIndex((x) => x.url === a.url) === i);
  const inen: Inen[] = [];
  const doldur = async (liste: Aday[], sinir: number) => {
    let n = 0;
    for (let i = 0; i < liste.length && n < sinir; i += 2) {
      const yeni = (await Promise.all(liste.slice(i, i + 2).map((a) => indir(a).catch(() => null)))).filter((x): x is Inen => !!x)
        // Aynı dosya iki adresten geldiyse biri kalır
        .filter((a) => !inen.some((b) => b.bayt === a.bayt && b.w === a.w));
      for (const a of yeni) if (n < sinir) { inen.push(a); n++; }
    }
  };
  const uretici = tekil.filter((a) => !a.bayi);
  await doldur(uretici.slice(0, 14), URETICI_ADAY);
  await doldur(tekil.filter((a) => a.bayi).slice(0, 8), BAYI_ADAY);
  // Albüm için: üreticinin sahne/ana görselleri (adresinde kv, lifestyle, gallery, feature… geçenler) ana görsel sırasında geride kalır
  // (GERI); albüm adayı olarak en çok ALBUM_ADAY tanesi ayrıca indirilir ve aynı seçimde gösterilir
  await doldur(uretici.slice(14).concat(uretici.slice(0, 14)).filter((a) => SAHNE.test(a.url) && !inen.some((b) => b.url === a.url)).slice(0, 8), ALBUM_ADAY);
  if (!inen.length) { iz.push(`görsel: ${tekil.length} aday indirilemedi/küçük`); return { essiz: inen, sira: [] as Inen[], album: [] as Inen[], v: null }; }
  const v = await gorerekSor(SECIM_SISTEM, `ÜRÜN: ${o.marka} ${o.ad} (${o.tur})\nAdaylar:\n${inen.map((a, i) => `Aday ${i + 1}: ${a.w}×${a.h}${a.alfa ? ", şeffaf zeminli PNG" : ""}, ${a.bayi ? "bayi/inceleme sitesi " : "üretici "}${hostAl(a.sayfa)}${a.alt ? `, "${a.alt}"` : ""}`).join("\n")}`,
    inen.map((a, i) => ({ ...a.onizleme, etiket: `Aday ${i + 1}` })), SECIM_SEMA, 90_000).catch(() => null);
  if (!v) { iz.push("görsel: yapay zekâ göremedi"); return { essiz: inen, sira: [] as Inen[], album: [] as Inen[], v: null }; }
  const sec = (l: unknown) => [...new Set((Array.isArray(l) ? l : []).map((n: unknown) => Number(n)))].map((n) => inen[n - 1]).filter(Boolean) as Inen[];
  // Şeffaf zeminli PNG uygunlar arasında öne alınır (model sıralamasa da): arka planı silinmeden kullanılır
  const uygun = sec(v.uygun);
  const sira = [...uygun.filter((a) => a.alfa), ...uygun.filter((a) => !a.alfa)];
  // Albüm yalnız üreticinin kendi görselleri; ana görsel seçeneklerinde olan albüme girmez
  const album = sec(v.album).filter((a) => !a.bayi && !sira.includes(a)).slice(0, 6);
  if (!sira.length) iz.push("görsel: uygun yok (" + String(v.elenen ?? "").slice(0, 80) + ")");
  return { essiz: inen, sira, album, v };
}

/** Ürünün ana görseli (en doğru aday ve sıradaki yedekleri) ile künye albümü adayları; ikisi de yoksa null. Ana görsel yoksa url boş döner.
 *  sayfalar: okunan üretici sayfaları (adres + HTML). Adaylar: üretici sayfalarının görselleri + Brave görsel araması (üretici ve bayi). */
export async function urunGorseliBul(sb: Sb, o: { marka: string; ad: string; tur: string; sayfalar: { url: string; html: string }[]; braveSinir: number; bitis?: number }, iz: string[]): Promise<UrunGorseli | null> {
  const parca = o.ad.toLocaleLowerCase("tr-TR").split(/[^a-z0-9]+/).filter((p) => p.length >= 2 || /\d/.test(p));
  const brave = (await braveGorsel(sb, `${o.marka} ${o.ad}`, o.marka, o.braveSinir).catch(() => [] as Aday[]))
    .map((a) => ({ ...a, puan: a.puan + 2 * parca.filter((p) => a.alt.toLocaleLowerCase("tr-TR").includes(p)).length }));
  const adaylar = [...o.sayfalar.filter((s) => ureticiAlani(s.url, o.marka)).flatMap((s) => sayfaGorselleri(s.html, s.url, o.ad, o.marka)), ...brave].sort((a, b) => b.puan - a.puan);
  if (!adaylar.length) { iz.push("görsel adayı yok"); return null; }
  const { essiz, sira, album, v } = await indirSec(o, adaylar, iz);
  const albumAday = album.map((a) => ({ url: a.url, sayfa: a.sayfa }));
  if (!sira.length) return albumAday.length ? { url: "", sayfa: "", kaynak: "Üretici", yazar: o.marka, lisans: "Basın görseli", albumAday } : null;
  const bayidan = !!sira[0].bayi;
  iz.push(`görsel: ${essiz.length} adaydan seçildi (${sira[0].w}×${sira[0].h}${sira[0].alfa ? ", şeffaf" : ""}${bayidan ? ", bayi sayfasından" : ""})`);
  return { url: sira[0].url, sayfa: sira[0].sayfa, kaynak: bayidan ? `Üretici görseli (${hostAl(sira[0].sayfa)})` : "Üretici", yazar: o.marka, lisans: "Basın görseli", neden: String(v?.neden ?? "").slice(0, 200), w: sira[0].w, h: sira[0].h, alfa: sira[0].alfa,
    yedekler: sira.slice(1, 5).map((a) => ({ url: a.url, sayfa: a.sayfa, alfa: a.alfa })), // seçenekler için (index.ts gorselIsle)
    albumAday };
}

/** Arka planı silinmiş görselin denetimi; yapay zekâ yoksa geçti sayılır (editör yine görür) */
export async function kesimDenetle(webp: Uint8Array, urun: string): Promise<{ gecti: boolean; sorun: string }> {
  const v = await gorerekSor(KESIM_SISTEM, `ÜRÜN: ${urun}`, [{ mime: "image/webp", b64: b64(webp) }], KESIM_SEMA, 60_000).catch(() => null);
  return v ? { gecti: v.gecti !== false, sorun: String(v.sorun ?? "").slice(0, 160) } : { gecti: true, sorun: "" };
}
