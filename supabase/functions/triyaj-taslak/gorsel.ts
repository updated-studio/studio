// Taslağın öne çıkan görseli (ARCHITECTURE.md, 16 Ekim 2026): telifi açık, gerçek fotoğraflardan seçilir.
// Kaynaklar, doğruluk sırasıyla:
//   0) Resmi basın görseli: haberin kaynaklarından biri markanın KENDİ sitesiyse (ör. apple.com/newsroom, news.samsung.com)
//      o sayfanın paylaşım görseli (og:image). Üreticiler bunları basında kullanılsın diye yayınlar.
//   1) Wikimedia Commons: ürünün KENDİSİNİN gerçek fotoğrafı çoğu zaman burada (marka + ürün adıyla aranır).
//      Sadece serbest lisanslar (CC0, kamu malı, CC BY, CC BY-SA); yazar ve lisans altyazıya yazılır.
//   2) Openverse (anahtar gerekmez): Flickr vb. kaynaklardan serbest lisanslı (CC0, kamu malı, CC BY, CC BY-SA) gerçek fotoğraflar;
//      önce ürün adıyla, sonra konu aramasıyla. Ticari kullanıma izin vermeyen (NC) ve değiştirilemez (ND) lisanslar alınmaz.
//   3) Pexels, Pixabay: sadece anahtar tanımlıysa (PEXELS_API_KEY, PIXABAY_API_KEY); şu an yok.
// Unsplash yüklenmez: API kuralları görselin kendi sunucularından gösterilmesini istiyor (sadece öneri olarak kalır).
// Bu dosya Deno'ya özgü bir şey kullanmaz (ekran da tiplerini içe aktarıyor); anahtarlar çağırandan gelir.
// Haber sitelerinin görselleri (2 Kasım 2026): yalnız üreticinin görseli olanlar (künyeden ya da görerek doğrulanır, kaynakGorselleri);
// ajans ve sitenin kendi fotoğrafları alınmaz. Temsili görsel yok: birebir değilse görselsiz.
// Hangi adayın kullanılacağına yapay zekâ karar verir; uygun aday yoksa görsel eklenmez. Yayına basma kararı yine editörde.

export type GorselAday = {
  kaynak: "Resmi basın" | "Üretici görseli" | "Wikimedia Commons" | "Openverse" | "Pexels" | "Pixabay" | "Yapay zekâ (Flux)";
  sayfa: string;      // görselin kendi sayfası (altyazıda bağlantı)
  buyuk: string;      // indirilecek dosya (en fazla ~1600 px)
  thumb: string;      // ekranda küçük önizleme
  yazar: string;
  lisans: string;     // ör. "CC BY-SA 4.0", "Pexels Lisansı"
  aciklama: string;   // yapay zekânın seçerken okuyacağı metin
  w: number; h: number;
  odak?: { x: number; y: number };
  dogrulandi?: boolean; // Üretici görseli: künyesinde marka yazıyor (true) ya da yalnız görerek doğrulanacak (false) // konunun yeri (yüzde, soldan/üstten); yapay zekâ seçerken verir, panelde odak noktası olur (28 Ekim 2026)
};

const UA = "Mozilla/5.0 (compatible; UpdatedStudyo/1.0; +https://www.updated.com.tr; haber gorseli secimi)";
const duz = (s: string) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const SERBEST = /^(cc0|public domain|pd|cc[- ]by(-sa)?[- ]\d)/i;

/** Teşhis: kaynak başına son istek durumu (görsel bulunamazsa taslağın "Görsel" bölümüne yazılır) */
export const kaynakDurumu: Record<string, string> = {};
async function json(url: string, h: Record<string, string> = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 10_000);
  const host = (() => { try { return new URL(url).hostname.replace(/^(www|api)\./, ""); } catch { return "?"; } })();
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, ...h }, signal: c.signal });
    kaynakDurumu[host] = r.ok ? "tamam" : "hata " + r.status;
    return r.ok ? await r.json() : null;
  } catch { kaynakDurumu[host] = "yanıt yok"; return null; } finally { clearTimeout(t); }
}

/** Wikimedia Commons: marka + ürün adıyla, sadece serbest lisanslı ve yeterince büyük fotoğraflar */
export async function commons(q: string, adet = 6, iz?: string[]): Promise<GorselAday[]> {
  if (!q.trim()) return [];
  const u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=12"
    + "&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1600&iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|ObjectName"
    + "&gsrsearch=" + encodeURIComponent(q + " filetype:bitmap");
  const j = await json(u);
  const sayfalar = Object.values((j?.query?.pages ?? {}) as Record<string, { title: string; index?: number; imageinfo?: Record<string, any>[] }>) // eslint-disable-line @typescript-eslint/no-explicit-any
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out: GorselAday[] = [];
  for (const p of sayfalar) {
    const i = p.imageinfo?.[0];
    if (!i || !/jpe?g|png|webp/i.test(i.mime ?? "") || (i.width ?? 0) < 900 || (i.width ?? 0) < (i.height ?? 0)) continue; // yatay, büyük, fotoğraf
    const m = i.extmetadata ?? {};
    const lisans = duz(m.LicenseShortName?.value ?? "");
    if (!SERBEST.test(lisans)) continue;
    out.push({
      kaynak: "Wikimedia Commons", sayfa: i.descriptionurl, buyuk: i.thumburl ?? i.url, thumb: (i.thumburl ?? i.url).replace(/\/\d+px-/, "/500px-"), // Wikimedia 2026: yalnız sabit boylar (250, 330, 500, 960…), 400 px 400 hatası verir
      yazar: duz(m.Artist?.value ?? "").slice(0, 80) || "Bilinmiyor", lisans,
      aciklama: (duz(m.ObjectName?.value ?? "") + " — " + duz(m.ImageDescription?.value ?? "")).slice(0, 220) || p.title,
      w: i.width, h: i.height,
    });
    if (out.length >= adet) break;
  }
  iz?.push(`Commons "${q.slice(0, 40)}": ${sayfalar.length} sonuç, ${out.length} uygun`);
  return out;
}

const etiketler = (host: string) => host.toLowerCase().replace(/^www\./, "").split(".");
const markaAnahtar = (m: string) => m.toLowerCase().replace(/[^a-z0-9]/g, "");

const ENGELLI_HOST = /(^|\.)(twitter|x|facebook|instagram|youtube|youtu|reddit|wikipedia|amazon|t|linkedin|tiktok|threads|google|apple\.news|bsky\.app|news\.ycombinator|flipboard|pinterest)\.(com|be|co|org|net|app)$/i;
const hostAl = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

export async function html(u: string, ms = 8_000): Promise<string> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: c.signal, redirect: "follow" }); return r.ok ? (await r.text()).slice(0, 1_500_000) : ""; }
  catch { return ""; } finally { clearTimeout(t); }
}
const meta = (h: string, ad: string) => h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${ad}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1]
  ?? h.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${ad}["']`, "i"))?.[1];
/** Sayfadaki bağlantılar: [adres, bağlantı metni] */
export function baglantilar(h: string, taban: string): [string, string][] {
  const out: [string, string][] = [];
  for (const m of h.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    try { out.push([new URL(m[1].replace(/&amp;/g, "&"), taban).href, duz(m[2])]); } catch { /* geçersiz */ }
  }
  return out;
}
const anlamli = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4);

/** Resmi basın görseli (16 Ekim (6)): markanın KENDİ sayfasının paylaşım görseli (og:image). Resmi sayfa üç yoldan bulunur:
 *  1) haberin kaynaklarından biri zaten markanın sitesiyse,
 *  2) kaynak haberin içinde markanın kendi duyurusuna/bloguna verilen bağlantıdan (ör. TechCrunch → bsky.social/about/blog/...),
 *  3) markanın basın sayfasında (tr_press) haberin ürün/başlık kelimelerini taşıyan duyurudan. */
export async function resmiGorsel(o: { linkler: string[]; marka: string; basin: string[]; urun: string; baslik: string }, iz?: string[]): Promise<GorselAday[]> {
  const m = markaAnahtar(o.marka);
  if (!m) { iz?.push("Resmi: marka yok"); return []; }
  const basinHost = new Set(o.basin.map(hostAl).filter(Boolean));
  const kaynakHost = new Set(o.linkler.map(hostAl));
  const resmiMi = (h: string) => basinHost.has(h) || (m.length >= 3 && etiketler(h).includes(m));
  const sayfalar = new Set<string>(o.linkler.filter((u) => resmiMi(hostAl(u))));

  // 2) Kaynak haberlerin içindeki resmi bağlantılar
  if (sayfalar.size < 2) {
    const kaynakHtml = await Promise.all(o.linkler.slice(0, 2).map((u) => html(u)));
    iz?.push("Resmi: kaynak haber " + kaynakHtml.map((h, i) => `${hostAl(o.linkler[i])} ${h ? "açıldı" : "açılmadı"}`).join(", "));
    const adaylar: [number, string][] = [];
    kaynakHtml.forEach((h, i) => {
      for (const [u, metin] of baglantilar(h, o.linkler[i])) {
        const host = hostAl(u);
        if (!host || kaynakHost.has(host) || (ENGELLI_HOST.test(host) && !resmiMi(host))) continue;
        const yol = (() => { try { return new URL(u).pathname; } catch { return ""; } })();
        if (yol.length < 5) continue; // ana sayfa değil, belirli bir duyuru
        let puan = 0;
        if (resmiMi(host)) puan += 3;
        if (new RegExp(`\\b${o.marka.replace(/[^\w ]/g, "")}\\b`, "i").test(metin)) puan += 1;
        if (/blog|news|press|newsroom|announc|introduc/i.test(yol)) puan += 1;
        if (puan >= 2) adaylar.push([puan, u]);
      }
    });
    adaylar.sort((a, b) => b[0] - a[0]).slice(0, 2).forEach(([, u]) => sayfalar.add(u));
  }

  // 3) Basın sayfasında ürün/başlık kelimeleriyle eşleşen duyuru
  if (sayfalar.size < 2 && o.basin[0]) {
    const h = await html(o.basin[0]);
    const aranan = [...new Set([...anlamli(o.urun), ...anlamli(o.baslik)])];
    const en = baglantilar(h, o.basin[0])
      .map(([u, metin]) => ({ u, n: aranan.filter((w) => anlamli(metin + " " + u).includes(w)).length }))
      .filter((x) => x.n >= 2 && hostAl(x.u) === hostAl(o.basin[0]))
      .sort((a, b) => b.n - a.n)[0];
    if (en) sayfalar.add(en.u);
    iz?.push(`Resmi: basın sayfası ${hostAl(o.basin[0])} ${h ? (en ? "eşleşme var" : "eşleşme yok") : "açılmadı"}`);
  }

  const sonuc = await Promise.all([...sayfalar].slice(0, 3).map(async (u): Promise<GorselAday | null> => {
    const h = await html(u);
    // og:image yoksa twitter:image, <link rel="image_src"> ya da sayfadaki yapılandırılmış veri (JSON-LD "image")
    const og = meta(h, "og:image(?::secure_url)?") ?? meta(h, "twitter:image(?::src)?")
      ?? h.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i)?.[1]
      ?? h.match(/"image"\s*:\s*(?:\[\s*)?(?:\{[^}]*?"url"\s*:\s*)?"(https?:[^"]+\.(?:jpe?g|png|webp)[^"]*)"/i)?.[1];
    iz?.push(`Resmi sayfa ${hostAl(u)}: ${!h ? "açılmadı" : !og ? `görsel etiketi yok (${h.length} karakter)` : !og ? "görsel etiketi yok" : /logo|favicon|default|placeholder|avatar/i.test(og) ? "sadece logo" : "görsel var"}`);
    if (!og || /logo|favicon|default|placeholder|avatar/i.test(og)) return null;
    let resim = ""; try { resim = new URL(og.replace(/&amp;/g, "&"), u).href; } catch { return null; }
    const site = duz(meta(h, "og:site_name") ?? "") || o.marka;
    return { kaynak: "Resmi basın", sayfa: u, buyuk: resim, thumb: resim, yazar: o.marka, lisans: "Basın görseli",
      aciklama: `${site} (${hostAl(u)}) resmi sayfasının görseli — ${duz(meta(h, "og:title") ?? "")}`.slice(0, 220), w: 1200, h: 675 };
  }));
  return sonuc.filter((x): x is GorselAday => !!x);
}

/** Kaynak haberin görselleri (2 Kasım 2026, kullanıcı: "doğrudan haberle ilgili görsel; çektiği yerden seç"). Haber siteleri çoğu zaman
 *  üreticinin basın görselini kullanır; künyesinden (figcaption, credit, alt) kimin olduğu okunur:
 *  - künyede marka ya da "press/official/courtesy/handout/render" geçiyorsa: üretici görseli (dogrulandi)
 *  - künyede ajans/fotoğrafçı/haber sitesinin kendisi geçiyorsa: alınmaz (Getty, Reuters, AP, AFP, "Photo by", "Image: Engadget"…)
 *  - künye yoksa: aday olur ama seçimde yapay zekâ görerek resmi materyal mi (stüdyo görseli, render, resmi etkinlik) karar verir. */
const AJANS = /getty|reuters|associated press|\bap photo|\bafp\b|shutterstock|alamy|\bepa\b|bloomberg|imago|anadolu|dpa\b|photo by|photograph by|fotoğraf:|fotograf:|image by|staff|our own|hands-on|hands on/i;
const RESMI = /press (image|photo|release|kit)|official (image|photo|render)|courtesy|handout|render|newsroom|media kit|basın görseli|resmi görsel/i;
// Künyede markanın görselin sahibi olarak geçtiği kalıplar: "Image: Apple", "Credit: Samsung", "Source: Sony", "© Nikon", "via Google"
const sahibi = (k: string, m: string) => new RegExp(`(image|photo|picture|credit|credits|source|görsel|fotoğraf|kaynak|via|by|©|\\(c\\))\\s*[:/\\-–]?\\s*${m.replace(/[^a-z0-9 ]/g, "")}`, "i").test(k);
function kunyeler(h: string): { url: string; kunye: string }[] {
  const out: { url: string; kunye: string }[] = [];
  for (const f of h.matchAll(/<figure\b[\s\S]{0,4000}?<\/figure>/gi)) {
    const g = f[0], src = g.match(/<img[^>]+(?:data-src|src)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i)?.[1];
    if (!src) continue;
    const alt = g.match(/alt=["']([^"']*)["']/i)?.[1] ?? "";
    const cap = duz(g.match(/<figcaption[\s\S]*?<\/figcaption>/i)?.[0] ?? "");
    out.push({ url: src, kunye: `${cap} ${alt}`.trim() });
  }
  return out;
}
export async function kaynakGorselleri(o: { linkler: string[]; marka: string; urun: string }, iz?: string[]): Promise<GorselAday[]> {
  const m = o.marka.trim().toLowerCase();
  const out: GorselAday[] = [];
  for (const u of o.linkler.filter((x) => x && !ENGELLI_HOST.test(hostAl(x))).slice(0, 3)) {
    const h = await html(u);
    if (!h) { iz?.push(`Kaynak ${hostAl(u)}: açılmadı`); continue; }
    const site = hostAl(u).split(".")[0];
    const og = meta(h, "og:image(?::secure_url)?") ?? meta(h, "twitter:image(?::src)?");
    const liste = [...(og ? [{ url: og, kunye: duz(meta(h, "og:image:alt") ?? "") }] : []), ...kunyeler(h)];
    let say = 0;
    for (const x of liste) {
      let resim = ""; try { resim = new URL(x.url.replace(/&amp;/g, "&"), u).href; } catch { continue; }
      if (/logo|favicon|avatar|placeholder|sprite|icon|author|\.svg|\.gif/i.test(resim)) continue;
      const k = x.kunye.toLowerCase();
      if (AJANS.test(k) || (site.length > 3 && k.includes(site))) continue; // ajans ya da haber sitesinin kendi fotoğrafı
      const dogrulandi = (m.length >= 2 && sahibi(k, m)) || RESMI.test(k);
      const yol = resim.split("?")[0].replace(/-\d+x\d+(?=\.\w+$)/, "");
      if (out.some((a) => a.buyuk.split("?")[0].replace(/-\d+x\d+(?=\.\w+$)/, "") === yol)) continue; // aynı görselin farklı boyları
      out.push({ kaynak: "Üretici görseli", sayfa: u, buyuk: resim, thumb: resim, yazar: o.marka, lisans: "Üretici görseli", dogrulandi,
        aciklama: `${hostAl(u)} haberindeki görsel${x.kunye ? ` — künye: ${x.kunye.slice(0, 120)}` : " — künye yok"}${dogrulandi ? " (künyede marka/resmi kaynak var)" : ""}`.slice(0, 220), w: 1200, h: 675 });
      if (++say >= 4) break;
    }
    iz?.push(`Kaynak ${hostAl(u)}: ${say} görsel`);
  }
  return out;
}

/** Openverse: anahtarsız, serbest lisanslı, yatay ve büyük fotoğraflar */
export async function openverse(q: string, adet = 5, iz?: string[]): Promise<GorselAday[]> {
  if (!q.trim()) return [];
  // Önce sıkı filtre (büyük, yatay fotoğraf); sonuç çıkmazsa filtreler gevşetilir ve boyut/yön burada denetlenir.
  // Openverse kayıtlarının bir kısmında boyut bilgisi yok; sıkı filtre bunları baştan eler (16-17 Ekim teşhisi: hep 0 aday).
  // 17 Ekim teşhisi: sıkı filtre hep 0 dönüyor, art arda istekler de Openverse'te zaman aşımına düşüyor.
  // Bu yüzden önce yalnız "fotoğraf" filtresi, sonuç yoksa filtresiz tek deneme.
  const filtreler = ["&category=photograph", ""];
  const out: GorselAday[] = [];
  const sayilar: string[] = [];
  for (const f of filtreler) {
    const j = await json("https://api.openverse.org/v1/images/?license=cc0,pdm,by,by-sa&mature=false&page_size=20" + f + "&q=" + encodeURIComponent(q));
    const sonuc = ((j?.results ?? []) as any[]); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const x of sonuc) {
      if (!x.url || (x.width && x.width < 900) || (x.width && x.height && x.width < x.height)) continue;
      if (/\.(svg|gif)(\?|$)/i.test(x.url)) continue;
      const l = String(x.license ?? "").toLowerCase();
      const lisans = l === "cc0" ? "CC0" : l === "pdm" ? "Kamu malı" : `CC ${l.toUpperCase()} ${x.license_version ?? ""}`.trim();
      // Orijinal dosya indirilir (sıkıştırılmış kopya servisi çok yavaş); 8 MB'tan büyükse yükleme yapılmaz
      out.push({ kaynak: "Openverse", sayfa: x.foreign_landing_url || x.url, buyuk: x.url, thumb: x.thumbnail || x.url, yazar: String(x.creator || "Bilinmiyor").slice(0, 80), lisans,
        aciklama: [x.title, (x.tags ?? []).slice(0, 8).map((t: { name: string }) => t.name).join(", ")].filter(Boolean).join(" — ").slice(0, 220) || q, w: x.width ?? 0, h: x.height ?? 0 });
      if (out.length >= adet) break;
    }
    sayilar.push(j ? `${j.result_count ?? sonuc.length}` : "yanıt yok");
    if (out.length) break;
  }
  iz?.push(`Openverse "${q.slice(0, 40)}": ${sayilar.join("→")} sonuç, ${out.length} uygun`);
  return out;
}

/** Pexels + Pixabay: konuyu temsil eden gerçek fotoğraflar (yatay, illüstrasyon değil) */
export async function stokFoto(q: string, adet: number, anahtar: { pexels?: string; pixabay?: string }): Promise<GorselAday[]> {
  const pk = anahtar.pexels, bk = anahtar.pixabay;
  const [p, b] = await Promise.all([
    pk ? json(`https://api.pexels.com/v1/search?per_page=${adet}&orientation=landscape&query=` + encodeURIComponent(q), { Authorization: pk }) : null,
    bk ? json(`https://pixabay.com/api/?key=${encodeURIComponent(bk)}&per_page=${Math.max(3, adet)}&orientation=horizontal&image_type=photo&safesearch=true&q=` + encodeURIComponent(q)) : null,
  ]);
  const out: GorselAday[] = [];
  for (const x of (p?.photos ?? []) as any[]) out.push({ kaynak: "Pexels", sayfa: x.url, buyuk: x.src.large2x ?? x.src.large, thumb: x.src.medium, yazar: x.photographer, lisans: "Pexels Lisansı", aciklama: x.alt || q, w: x.width, h: x.height }); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const x of ((b?.hits ?? []) as any[]).slice(0, adet)) out.push({ kaynak: "Pixabay", sayfa: x.pageURL, buyuk: x.largeImageURL, thumb: x.webformatURL, yazar: x.user, lisans: "Pixabay İçerik Lisansı", aciklama: (x.tags || q) as string, w: x.imageWidth, h: x.imageHeight }); // eslint-disable-line @typescript-eslint/no-explicit-any
  return out;
}

/** Görsel künyesi (panelde kapak künyesi; eskiden WordPress altyazısı). Fatih: haberlerde kaynak belirtmek zorunlu değil. Ama CC BY / CC BY-SA lisansı yazar ve lisans adını
 *  ZORUNLU tutar; bu yüzden sadece onlarda altyazı yazılır. CC0, kamu malı, Pexels, Pixabay: altyazı yok. Resmi basın: "Görsel: Marka". */
export function altyazi(g: GorselAday): string {
  if (g.kaynak === "Resmi basın" || g.kaynak === "Üretici görseli") return `Görsel: ${g.yazar.replace(/[<>&]/g, "")}`;
  // Marka kiti §8: "Temsili görsel · Yapay zekâ ile üretildi"
  if (g.kaynak === "Yapay zekâ (Flux)") return "Temsili görsel · Yapay zekâ ile üretildi";
  if (!/^cc[- ]by/i.test(g.lisans)) return "";
  const k = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `Fotoğraf: ${k(g.yazar)} / <a href="${k(g.sayfa)}" target="_blank" rel="noopener">${k(g.kaynak)}</a>${/^(cc|kamu)/i.test(g.lisans) ? ` (${k(g.lisans)})` : ""}`;
}

/** Seçimde yapay zekâya resmin kendisini göstermek için küçük kopya (base64). Büyük ya da yavaşsa atlanır. */
export async function kucukResim(url: string, ms = 6_000): Promise<{ mime: string; b64: string } | null> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: c.signal });
    const mime = (r.headers.get("content-type") ?? "").split(";")[0];
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(mime)) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    if (b.byteLength > 1_500_000) return null;
    let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return { mime, b64: btoa(s) };
  } catch { return null; } finally { clearTimeout(t); }
}

/** Flux (Fatih'in bilgisayarında, çevrimdışı) için görsel istemi: gerçekçi fotoğraf, yazısız, logosuz */
export function fluxIstem(konu: string): string {
  const k = konu.replace(/\s+/g, " ").trim().slice(0, 400);
  return `${k}. Photorealistic editorial technology news photo, natural lighting, shallow depth of field, clean composition, subject centered, 16:9. Generic unbranded design: do not imitate any specific manufacturer design signature (no emblems, no signature grilles, no recognizable silhouette of a specific brand product). No real human faces. No text, no letters, no words, no captions, no logos, no watermark, no brand names, no UI overlays.`;
}

/** Görsel yönetmeni (4 Kasım 2026, kullanıcı: "haberin içeriğinden konuyu anlayıp yapay zekâya ona göre istem yazdıracak bir ara katman;
 *  kapak fotoğrafı gibi, ürüne odaklı; dikkat çekici ama clickbait değil; ortalanmış ve kırpılabilir; yazı doğruysa olabilir; model başına istem").
 *  Haberi okur, kapağın neyi anlatacağına karar verir ve her model ailesi için ayrı İngilizce istem yazar. Denetim bu tarife göre puanlar. */
export type GorselTarif = { konu: string; ana_mesaj: string; sahne: string; yazilar: string[]; marka_ogeleri: string; kacin: string[]; istemler: { flux: string; gpt: string; banana: string } };
export const GORSEL_YONETMEN = `UPDATED adlı Türkçe teknoloji haber sitesinin görsel yönetmenisin. Haberin kapak görselini yapay zekâya ürettireceğiz: sen haberi okuyup sanat yönetimini yapar, her model için üretim istemini yazarsın.
ÖNCE HABERİ ANLA: Başlık, spot ve metinden haberin ASIL konusunu ve okurun kapağa bakınca ilk anda anlaması gereken TEK şeyi çıkar. Genel konuyu değil, haberi farklı kılan ayrıntıyı resmet ve haberin dikkat çeken somut öğesini (sürüm adı, yeni özellik, ürünün ayırt edici parçası) görünür kıl.
Örnek: "macOS 27.3 betası: Canlı Etkinlikler menü çubuğunda; çentikli eski Mac'lerde de" → çentikli bir MacBook'un ekranında, menü çubuğunda yanan küçük bir canlı etkinlik göstergesi (ör. zamanlayıcı), ekranda küçük ama net "macOS 27.3 beta" yazısı; stüdyo ışığında, ekrana odaklı.
KAPAK İLKELERİ
- Dikkat çekici ama dürüst: profesyonel editoryal kapak (stüdyo ürün çekimi ya da temiz, sade bir sahne; iyi ışık; konuya odaklı). YouTube küçük resmi değil: abartılı ifade, ok/daire işareti, şok, öfke uyandırma, clickbait yok.
- Kompozisyon: ana konu kadrajın ORTASINDA, dört kenarda geniş nefes payı (her kenarda ~%15-20). Aynı görsel sitede 16:10, 4:3, 16:9; sosyal medyada 1:1, 4:5 ve 9:16 (Reels, Story, Shorts kapağı) kırpılacak ve yakınlaştırılabilecek. Konunun önemli kısmı alttaki üçte bire düşmesin (manşette başlık biner).
- Yazı: Yalnız haberin özünü taşıyan, BİREBİR DOĞRU kısa yazılar (en çok 2; her biri en çok 4 kelime; ör. "macOS 27.3 beta"). Yalnız özel ad, ürün ya da sürüm adı yazdır; "iddia", "sızıntı", "yeni" gibi ifade ve slogan yazdırma. Gerçek ürünün üzerinde gerçekte bulunan logo ya da yazı doğru haliyle görünebilir (MSI dizüstünün kapağındaki MSI logosu gibi).
- Logo (4 Kasım 2026, kullanıcı: "mümkünse logoyu kullan, düzgün olduğundan emin ol"): Haberin markası belli ve ürün gerçekse logoyu MÜMKÜNSE kullan: ürünün üzerinde gerçekte durduğu yerde (dizüstü kapağı, telefonun arkası, kutu) ya da sahnede doğal bir yüzeyde. İstemde logonun biçimini ve yazımını tam tarif et (ör. "Apple logosu: yazısız, ısırılmış elma silüeti"; "SAMSUNG kelime logosu, büyük harf, sade yazı tipi"; "MSI ejderha kalkanı ve MSI yazısı"). Logoyu küçük ve net tut; büyük, eğik ya da süslü yüzeye koyma (bozulma riski). Markası doğrulanmamış söylenti/sızıntı ürününde, birden fazla markanın konu olduğu haberde ya da logo karmaşıksa logo KULLANMA.
- Logo ile yazı kuralı çakışırsa logo kazanır: logonun kendi yazısı (SAMSUNG, MSI, ASUS gibi kelime logoları) "yazı" sayılmaz; yukarıdaki yazı sınırına (en çok 2 yazı, 4 kelime) girmez ve "yazılar" listesine yazılmaz. İstemlerde yazı yasağını "logo hariç" diye kur (ör. "no text other than the brand logo"); "no text, no logos" gibi logoyu da silen bir yasak yazma. Klavye gibi ayrıntılı yüzey gerekiyorsa gerçek düzenine sadık iste (ör. Apple Mac klavye düzeni); doğru çıkması zor ayrıntıyı (uzun arayüz metni, menü listesi, küçük paragraflar) isteme: kadrajı oradan uzaklaştır ya da sığ alan derinliğiyle flu bırak.
- Sayısal özellikler (ekran oranı, boyut, inç, kalınlık): Görsel modelleri nesne oranını sayıyla anlamaz; görselin kendi en-boy oranıyla (16:9) da karıştırır. Sayıyı istemde oran olarak yazma; GÖRÜNÜR bir karşılaştırmaya çevir: "dik tutulduğunda yüksekliği genişliğinin yalnız ~1,6 katı; normal bir telefon ~2,2 katıdır; belirgin biçimde kısa ve geniş, pasaport gibi kareye yakın bir dikdörtgen". Gerekirse yanına bilinen bir nesne koy (normal bir telefon ya da kredi kartı) ki fark görülsün. Oranın okunması için kamerayı önden ve dik (ya da tam tepeden) seç; yan açı ve perspektif oranı gizler.
- Gerçek kişi yüzü yok. Henüz tanıtılmamış ürünün (söylenti, sızıntı) tasarımını kesin gerçekmiş gibi uydurma: cihazı bilinçli olarak belirsiz göster (karanlıkta arkadan ışıklı silüet, sığ alan derinliğinde flu, örtü altında ya da prototip havasında) ve haberin anahtar farkını (ör. geniş ekran oranı) şekil ve oranla anlat; bilinen başka bir ürünün tasarım imzasını (çentik, kamera adası) kopyalama. Haberdeki markadan başka markanın ürünü ya da logosu yok.
MODEL BAŞINA İSTEM (İngilizce yaz; hepsinde photorealistic, 16:9 landscape, subject centered with generous empty margins on all four sides for cropping):
- "flux" (FLUX.2 klein/dev, Lucid Origin): tek paragraf, fotoğrafçı diliyle akan doğal anlatım: konu, ortam, ışık, lens ve açı, renk; 60-110 kelime; yazı varsa çift tırnak içinde birebir ve nerede durduğu.
- "gpt" (GPT Image): satır satır yapılandırılmış talimat: "Scene:", "Subject:", "Composition:", "Lighting:", "Exact text:" (yoksa "none"), "Constraints:" (açık do-not maddeleri).
- "banana" (Nano Banana / Gemini): amaç cümlesiyle başlayan anlatı ("Create a professional editorial cover photo for a tech news article about …"), sonra sahne, kompozisyon, ışık, birebir yazı ve kaçınılacaklar.
Sadece şu JSON'u döndür: {"konu":"Türkçe tek cümle","ana_mesaj":"okurun ilk bakışta anlaması gereken şey, Türkçe","sahne":"Türkçe 2-3 cümle","yazilar":["görselde birebir görünecek yazı"],"marka_ogeleri":"görünecek logo: marka, biçim, yazım ve yer (ör. Apple logosu, yazısız ısırılmış elma, MacBook kapağının ortasında); yoksa yok","kacin":["Türkçe kısa madde"],"istemler":{"flux":"...","gpt":"...","banana":"..."}}`;

/** Tarifteki istemi modele göre seçer; tarif yoksa eski genel istem */
export function modelIstemi(t: GorselTarif | null, model: string, yedek: string): string {
  if (!t) return yedek;
  const i = model === "gpt" ? t.istemler.gpt : model === "banana" ? t.istemler.banana : t.istemler.flux;
  return (i || t.istemler.flux || yedek).slice(0, 2400);
}

/** Üretilen görselin denetimi: yedi katman + puan (3 Kasım 2026, kullanıcı: "kolaya kaçmışsın, eleme usulümüzde katmanlar vardı").
 *  Fotoğraf seçimindeki kurallar (SECIM_SISTEM) üretim için uyarlandı; ilk beş katman eleyici, puan adaylar arasında sıralar. */
export const URETIM_DENETIM = `Bir Türkçe teknoloji haberi için yapay zekâyla üretilmiş kapak görselini denetliyorsun. Sana haber başlığı, spot, marka, ürün ve görsel yönetmeninin tarifi (konu, okurun ilk anlaması gereken ana mesaj, görselde olması gereken birebir yazılar) verilecek; ekte görsel var.
Görsel sitede manşet 16:10 ve 4:3, kart 16:9; sosyal medyada 1:1, 4:5 ve 9:16 kırpılır. Manşette alttaki yaklaşık %40'ın üstüne başlık yazısı biner.
Her katmanı ayrı değerlendir:
1. konu: Görsel haberin başlığı ve içeriğiyle uyuşuyor mu? Ana mesaj insan bakınca ilk anda anlaşılıyor mu? Genel "teknoloji" süsü, konuyla ilgisiz ya da anahtar ayrıntıyı (yeni özellik, sürüm, ürün) iletemeyen sahne sorun.
2. yazi: Görünen her yazı birebir doğru ve tutarlı mı? Tarifteki yazı görselde harf harf aynı okunuyorsa sorun DEĞİL; şüpheye dayanarak reddetme, açık hata ara. Logonun kendi yazısı (kelime logoları) bu katmanda değerlendirilmez, 3. katmanda (logo) bakılır. Bozuk, uydurma, harfe benzeyen anlamsız yazı; harfleri tutarsız klavye; okunmaz arayüz metni sorun. Ürünün üzerindeki gerçek ve doğru logo sorun değil; uzakta, flu, dikkat çekmeyen doku sorun değil.
3. marka: Haberdeki markadan BAŞKA markayı çağrıştıran logo, amblem ya da belirgin tasarım imzası; haberdeki ürün türüyle uyumsuz nesne (telefon haberinde tablet). LOGO: tarifte logo varsa ya da görselde logo görünüyorsa, logo gerçeğiyle birebir aynı mı (biçim, oran, harfler, yazım, yer)? Bozuk, eğri, eksik/fazla harfli, uydurma ya da yanlış markanın logosu sorundur (eleyici). Logo tarifte istenmiş ama görselde yoksa sorun değil. Düzgün ve doğru logo kapak çekiciliğini artırır.
4. bozukluk: Fazla/eksik parmak, eriyen ya da birbirine geçen nesneler, eğri düz çizgiler, fiziksel olmayan yansıma ve gölge, anlamsız parçalar.
5. etik: Tanınabilir gerçek kişi yüzü; söylenti/sızıntı haberinde henüz tanıtılmamış ürünü kesin gerçekmiş gibi gösterme; şiddet, uygunsuz içerik.
6. kirpma: Konu ortada mı, kenarlarda kırpma payı var mı; 16:10, 4:3, 16:9 ve 1:1, 4:5, 9:16 kırpmalarında konu kalıyor mu; önemli kısım alttaki başlık alanında mı?
7. kalite: Editoryal fotoğraf kalitesi: doğal ışık ve doku; plastik, aşırı parlak, aşırı doygun "yapay zekâ işi" görünüm puanı düşürür.
8. cekicilik: Kapak olarak göz alıcı ve profesyonel mi (stüdyo çekimi kalitesi, net odak)? Abartı, clickbait, YouTube küçük resmi havası puanı düşürür.
"gecti": 1-5. katmanların hepsi sorunsuzsa true; biri bile sorunluysa false. Emin değilsen false.
"puan": 0-10 genel (1. katman ve 6-8 ağırlıklı; 1-5'ten biri sorunluysa en fazla 3).
"odak": konunun merkezi, {"x": soldan yüzde, "y": üstten yüzde}.
Sadece şu JSON'u döndür: {"katmanlar":{"konu":"tamam ya da kısa sorun","yazi":"","marka":"logo dahil","bozukluk":"","etik":"","kirpma":"","kalite":"","cekicilik":""},"gecti":true,"puan":0,"odak":{"x":50,"y":50},"neden":"tek cümle özet"}`;

/** Yapay zekâya gösterilecek aday listesi */
export function adayListesi(adaylar: GorselAday[]): string {
  return adaylar.map((a, i) => `${i}. [${a.kaynak}] ${a.aciklama} (${a.w}x${a.h})`).join("\n");
}

export const SECIM_SISTEM = `Bir Türkçe teknoloji haberine öne çıkan görsel seçiyorsun. Sana haber başlığı ve numaralı görsel adayları verilecek.
KURAL 1 (2 Kasım 2026, Fatih: "temsili görsel olmaz, birebir haberle ilgili"): Görsel haberin konusu olan ÜRÜNÜN/ŞİRKETİN/OLAYIN KENDİSİNİ göstermeli. Başka model, eski nesil, benzer ürün, genel "temsili" fotoğraf SEÇİLMEZ. Emin değilsen -1 döndür; yanlış görsel koymaktansa görselsiz bırakmak doğru.
ADAY TÜRLERİ:
- [Resmi basın]: markanın kendi sitesindeki görsel. Konu ürünse öncelikli.
- [Üretici görseli]: haberi yapan sitedeki görsel. Künyesinde marka/resmi kaynak varsa üreticinindir. Künyesi yoksa resme BAKARAK karar ver: üreticinin basın/tanıtım görseli (stüdyo çekimi, render, düz/temiz arka plan, resmi tanıtım etkinliği, oyunun resmi ekran görüntüsü ya da tanıtım görseli) ise seçilebilir; haber sitesinin kendi çektiği fotoğraf (elde tutma, masa üstü inceleme, fuar standı kalabalığı, muhabir fotoğrafı) ise SEÇİLMEZ.
- [Wikimedia Commons]/[Openverse]: yalnız aynı ürünü (aynı model) gösteriyorsa.
DİĞER KURALLAR:
- ÜZERİNDE BÜYÜK YAZI OLAN GÖRSEL SEÇME: başlık/slogan/fiyat yazılı banner, afiş, kolaj, filigranlı görsel, infografik. Ürünün üzerindeki kendi küçük logosu sorun değil.
- Logo tek başına, belge, harita, haberle ilgisiz kişi portresi seçilmez.
- DİKEY (portre) görsel seçme; kapak yatay 16:9 kullanılır.
- KONU ORTADA OLSUN: konusu kenarda/köşede kalan görseli seçme; görsel kart, manşet ve telefonda kenarlardan kırpılır.
Seçtiğin görselde konunun MERKEZİNİ ver: "odak" = {"x": soldan yüzde 0-100, "y": üstten yüzde 0-100}; emin değilsen 50/50.
Sadece şu JSON'u döndür: {"secim": numara ya da -1, "neden": "kısa gerekçe", "odak": {"x": 50, "y": 50}}`;

const kelimeler = (s: string) => (s ?? "").toLowerCase().replace(/ı/g, "i").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 2);

/** Yapay zekâ yanıt vermezse yedek kural: açıklamasında marka + ürün adının bütün kelimeleri geçen ilk Commons fotoğrafı.
 *  Stok fotoğraflar kuralla seçilmez (konuyla ilgisi yapay zekâsız doğrulanamaz). */
export function kuralSecim(adaylar: GorselAday[], urun: string): GorselAday | null {
  const aranan = kelimeler(urun);
  if (aranan.length < 2) return null;
  // Yapay zekâsız yalnız künyesi doğrulanmış üretici görseli ya da ürün adı birebir geçen serbest fotoğraf
  return adaylar.find((a) => a.kaynak === "Üretici görseli" && a.dogrulandi)
    ?? adaylar.find((a) => (a.kaynak === "Wikimedia Commons" || a.kaynak === "Openverse") && aranan.every((w) => kelimeler(a.aciklama).includes(w))) ?? null;
}
