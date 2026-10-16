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

async function json(url: string, h: Record<string, string> = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 10_000);
  try { const r = await fetch(url, { headers: { "User-Agent": UA, ...h }, signal: c.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}

/** Wikimedia Commons: marka + ürün adıyla, sadece serbest lisanslı ve yeterince büyük fotoğraflar */
export async function commons(q: string, adet = 6): Promise<GorselAday[]> {
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
  return out;
}

const etiketler = (host: string) => host.toLowerCase().replace(/^www\./, "").split(".");
const markaAnahtar = (m: string) => m.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Resmi basın görseli: kaynak bağlantılarından markanın kendi alan adındakilerin og:image'ı */
export async function resmiGorsel(linkler: string[], marka: string, basinAdresleri: string[]): Promise<GorselAday[]> {
  const m = markaAnahtar(marka);
  const resmiHost = new Set(basinAdresleri.map((u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean));
  const resmi = [...new Set(linkler)].filter((u) => {
    try { const h = new URL(u).hostname.replace(/^www\./, ""); return resmiHost.has(h) || (m.length >= 3 && etiketler(h).includes(m)); } catch { return false; }
  }).slice(0, 2);
  const out: GorselAday[] = [];
  for (const u of resmi) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 10_000);
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: c.signal, redirect: "follow" });
      const h = r.ok ? await r.text() : "";
      const og = h.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1]
        ?? h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
      if (!og) continue;
      const resim = new URL(og.replace(/&amp;/g, "&"), u).href;
      const baslik = h.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
      out.push({ kaynak: "Resmi basın", sayfa: u, buyuk: resim, thumb: resim, yazar: marka, lisans: "Basın görseli", aciklama: `${marka} resmi görseli — ${duz(baslik)}`.slice(0, 220), w: 1200, h: 675 });
    } catch { /* sayfa açılmadı */ } finally { clearTimeout(t); }
  }
  return out;
}

/** Openverse: anahtarsız, serbest lisanslı, yatay ve büyük fotoğraflar */
export async function openverse(q: string, adet = 5): Promise<GorselAday[]> {
  if (!q.trim()) return [];
  const j = await json("https://api.openverse.org/v1/images/?license=cc0,pdm,by,by-sa&category=photograph&aspect_ratio=wide&size=large&mature=false&page_size=12&q=" + encodeURIComponent(q));
  const out: GorselAday[] = [];
  for (const x of ((j?.results ?? []) as any[])) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!x.url || (x.width && x.width < 900) || (x.width && x.height && x.width < x.height)) continue;
    const l = String(x.license ?? "").toLowerCase();
    const lisans = l === "cc0" ? "CC0" : l === "pdm" ? "Kamu malı" : `CC ${l.toUpperCase()} ${x.license_version ?? ""}`.trim();
    // Orijinal dosya indirilir (sıkıştırılmış kopya servisi çok yavaş); 8 MB'tan büyükse yükleme yapılmaz
    out.push({ kaynak: "Openverse", sayfa: x.foreign_landing_url || x.url, buyuk: x.url, thumb: x.thumbnail || x.url, yazar: String(x.creator || "Bilinmiyor").slice(0, 80), lisans,
      aciklama: [x.title, (x.tags ?? []).slice(0, 8).map((t: { name: string }) => t.name).join(", ")].filter(Boolean).join(" — ").slice(0, 220) || q, w: x.width ?? 0, h: x.height ?? 0 });
    if (out.length >= adet) break;
  }
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
