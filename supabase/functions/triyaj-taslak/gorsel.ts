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
// Başka haber sitelerinin görselleri ALINMAZ (16 Ekim'de Fatih "filigransız olanları kullan" dedi; telif riski nedeniyle
// uygulanmadı, ARCHITECTURE.md 16 Ekim (4)): filigran olmaması görselin kullanım izni olduğu anlamına gelmez.
// Hangi adayın kullanılacağına yapay zekâ karar verir; uygun aday yoksa görsel eklenmez. Yayına basma kararı yine editörde.

export type GorselAday = {
  kaynak: "Resmi basın" | "Wikimedia Commons" | "Openverse" | "Pexels" | "Pixabay";
  sayfa: string;      // görselin kendi sayfası (altyazıda bağlantı)
  buyuk: string;      // indirilecek dosya (en fazla ~1600 px)
  thumb: string;      // ekranda küçük önizleme
  yazar: string;
  lisans: string;     // ör. "CC BY-SA 4.0", "Pexels Lisansı"
  aciklama: string;   // yapay zekânın seçerken okuyacağı metin
  w: number; h: number;
};

const UA = "UpdatedStudyo/1.0 (https://www.updated.com.tr; haber gorseli secimi)";
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
      kaynak: "Wikimedia Commons", sayfa: i.descriptionurl, buyuk: i.thumburl ?? i.url, thumb: (i.thumburl ?? i.url).replace(/\/\d+px-/, "/400px-"),
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

async function html(u: string, ms = 8_000): Promise<string> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: c.signal, redirect: "follow" }); return r.ok ? (await r.text()).slice(0, 1_500_000) : ""; }
  catch { return ""; } finally { clearTimeout(t); }
}
const meta = (h: string, ad: string) => h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${ad}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1]
  ?? h.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${ad}["']`, "i"))?.[1];
/** Sayfadaki bağlantılar: [adres, bağlantı metni] */
function baglantilar(h: string, taban: string): [string, string][] {
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
export async function resmiGorsel(o: { linkler: string[]; marka: string; basin: string[]; urun: string; baslik: string }): Promise<GorselAday[]> {
  const m = markaAnahtar(o.marka);
  if (!m) return [];
  const basinHost = new Set(o.basin.map(hostAl).filter(Boolean));
  const kaynakHost = new Set(o.linkler.map(hostAl));
  const resmiMi = (h: string) => basinHost.has(h) || (m.length >= 3 && etiketler(h).includes(m));
  const sayfalar = new Set<string>(o.linkler.filter((u) => resmiMi(hostAl(u))));

  // 2) Kaynak haberlerin içindeki resmi bağlantılar
  if (sayfalar.size < 2) {
    const kaynakHtml = await Promise.all(o.linkler.slice(0, 2).map((u) => html(u)));
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
  }

  const sonuc = await Promise.all([...sayfalar].slice(0, 3).map(async (u): Promise<GorselAday | null> => {
    const h = await html(u);
    const og = meta(h, "og:image(?::secure_url)?") ?? meta(h, "twitter:image");
    if (!og || /logo|favicon|default|placeholder|avatar/i.test(og)) return null;
    let resim = ""; try { resim = new URL(og.replace(/&amp;/g, "&"), u).href; } catch { return null; }
    const site = duz(meta(h, "og:site_name") ?? "") || o.marka;
    return { kaynak: "Resmi basın", sayfa: u, buyuk: resim, thumb: resim, yazar: o.marka, lisans: "Basın görseli",
      aciklama: `${site} (${hostAl(u)}) resmi sayfasının görseli — ${duz(meta(h, "og:title") ?? "")}`.slice(0, 220), w: 1200, h: 675 };
  }));
  return sonuc.filter((x): x is GorselAday => !!x);
}

/** Openverse: anahtarsız, serbest lisanslı, yatay ve büyük fotoğraflar */
export async function openverse(q: string, adet = 5, iz?: string[]): Promise<GorselAday[]> {
  if (!q.trim()) return [];
  // Önce sıkı filtre (büyük, yatay fotoğraf); sonuç çıkmazsa filtreler gevşetilir ve boyut/yön burada denetlenir.
  // Openverse kayıtlarının bir kısmında boyut bilgisi yok; sıkı filtre bunları baştan eler (16-17 Ekim teşhisi: hep 0 aday).
  const filtreler = ["&category=photograph&aspect_ratio=wide&size=large", "&category=photograph", ""];
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

/** WordPress altyazısı. Fatih: haberlerde kaynak belirtmek zorunlu değil. Ama CC BY / CC BY-SA lisansı yazar ve lisans adını
 *  ZORUNLU tutar; bu yüzden sadece onlarda altyazı yazılır. CC0, kamu malı, Pexels, Pixabay: altyazı yok. Resmi basın: "Görsel: Marka". */
export function altyazi(g: GorselAday): string {
  if (g.kaynak === "Resmi basın") return `Görsel: ${g.yazar.replace(/[<>&]/g, "")}`;
  if (!/^cc[- ]by/i.test(g.lisans)) return "";
  const k = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `Fotoğraf: ${k(g.yazar)} / <a href="${k(g.sayfa)}" target="_blank" rel="noopener">${k(g.kaynak)}</a>${/^(cc|kamu)/i.test(g.lisans) ? ` (${k(g.lisans)})` : ""}`;
}

/** Yapay zekâya gösterilecek aday listesi */
export function adayListesi(adaylar: GorselAday[]): string {
  return adaylar.map((a, i) => `${i}. [${a.kaynak}] ${a.aciklama} (${a.w}x${a.h})`).join("\n");
}

export const SECIM_SISTEM = `Bir Türkçe teknoloji haberine öne çıkan görsel seçiyorsun. Sana haber başlığı ve numaralı görsel adayları verilecek.
KURALLAR:
- Haberin konusu olan ürünü/şirketi/olayı en doğru gösteren GERÇEK fotoğrafı seç.
- [Resmi basın] adayı haberin konusu olan ürünün/duyurunun resmi görseliyse onu tercih et (logo ya da genel kurumsal görsel değilse).
- Ürünün kendisinin fotoğrafı (aynı model) varsa onu tercih et. Eski model ya da başka ürünse seçme.
- Ürünün kendisi yoksa konuyu genel olarak temsil eden gerçekçi bir fotoğraf (ör. akıllı telefon haberine telefon fotoğrafı) seçilebilir.
- Logo, ekran görüntüsü, belge, harita, çizim, kişi portresi (haber o kişi hakkında değilse) seçme.
- Hiçbiri uygun değilse -1 döndür. Uydurma yapma.
Sadece şu JSON'u döndür: {"secim": numara, "neden": "kısa gerekçe"}`;

const kelimeler = (s: string) => (s ?? "").toLowerCase().replace(/ı/g, "i").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 2);

/** Yapay zekâ yanıt vermezse yedek kural: açıklamasında marka + ürün adının bütün kelimeleri geçen ilk Commons fotoğrafı.
 *  Stok fotoğraflar kuralla seçilmez (konuyla ilgisi yapay zekâsız doğrulanamaz). */
export function kuralSecim(adaylar: GorselAday[], urun: string): GorselAday | null {
  const aranan = kelimeler(urun);
  if (aranan.length < 2) return null;
  return adaylar.find((a) => (a.kaynak === "Wikimedia Commons" || a.kaynak === "Openverse") && aranan.every((w) => kelimeler(a.aciklama).includes(w))) ?? null;
}
