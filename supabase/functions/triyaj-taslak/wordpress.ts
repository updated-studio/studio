// WordPress'e taslak gönderimi (REST API + Uygulama Şifresi). MCP kullanılmaz: Stüdyo siteyle doğrudan konuşur.
// Gizli bilgi (Supabase Secrets): WP_URL (https://updated.com.tr), WP_USER (WordPress'teki "Stüdyo" kullanıcısı), WP_APP_PASSWORD.
// Kurallar (ARCHITECTURE.md, 15 Ekim 2026): yazı her zaman "draft" gider, yayına editör basar; kategori sadece sitede VAR OLANLARDAN seçilir;
// etiket: en fazla 3, yalnız var olan (≥2 yazılık) ya da izinli listedeki etiketler (yeni etiket yığılmasın); editör notları/sorular/doğrulama listesi gitmez; WordPress'te editörün değiştirdiği taslağın üzerine yazılmaz.
import { yaziHtml } from "./html.ts";
import { altyazi, type GorselAday } from "./gorsel.ts";

// deno-lint-ignore no-explicit-any
type Sb = any;
export type WpAyar = { url: string; user: string; pass: string };
export type Kategori = { id: number; name: string; slug: string; parent: number };
export type Sonuc = { ok: true; post_id: number; link: string; kategori: string; etiket: number } | { ok: false; hata: string; kod?: string };

export function wpAyar(): WpAyar | null {
  const url = (Deno.env.get("WP_URL") ?? "").trim().replace(/\/+$/, "");
  const user = (Deno.env.get("WP_USER") ?? "").trim();
  const pass = (Deno.env.get("WP_APP_PASSWORD") ?? "").replace(/\s+/g, "");
  return url && user && pass ? { url, user, pass } : null;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#039": "'", "#8217": "’", "#8211": "–" };
const coz = (s: string) => String(s ?? "").replace(/&(#?\w+);/g, (m, n) => ENT[n] ?? m);

/** Türkçe karakter ve büyük/küçük harf farkını yok sayarak karşılaştırma anahtarı */
export function anahtar(s: string): string {
  return coz(s).toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}

/** İsteğin anlaşılır Türkçe hata karşılığı (ekip için; teknik ayrıntı sonda kısa) */
function hataMetni(status: number, govde: string): string {
  let kod = "";
  try { kod = JSON.parse(govde)?.code ?? ""; } catch { /* düz metin */ }
  if (status === 401) return "WordPress girişi reddetti: kullanıcı adı ya da uygulama şifresi yanlış, ya da sunucu kimlik bilgisini iletmiyor (Natro/güvenlik eklentisi). (" + (kod || "401") + ")";
  if (status === 403) return "WordPress'teki Stüdyo kullanıcısının yetkisi yetmiyor (rolü Editör olmalı) ya da bir güvenlik eklentisi engelliyor. (" + (kod || "403") + ")";
  if (status === 404) return "WordPress REST API bulunamadı: adres yanlış ya da REST API kapalı. (" + (kod || "404") + ")";
  if (status === 0) return "WordPress sitesine ulaşılamadı (zaman aşımı ya da bağlantı hatası).";
  return `WordPress hata verdi (${status}${kod ? ", " + kod : ""}).`;
}

async function wp(a: WpAyar, yol: string, init: { method?: string; body?: unknown } = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 20_000);
  try {
    const r = await fetch(a.url + "/wp-json" + yol, {
      method: init.method ?? "GET", signal: c.signal,
      headers: { Authorization: "Basic " + btoa(a.user + ":" + a.pass), "Content-Type": "application/json", Accept: "application/json", "User-Agent": "UpdatedStudyo/1.0" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const metin = await r.text();
    let veri: unknown = null;
    try { veri = JSON.parse(metin); } catch { /* HTML hata sayfası */ }
    return { ok: r.ok, status: r.status, veri, metin };
  } catch {
    return { ok: false, status: 0, veri: null, metin: "" };
  } finally { clearTimeout(t); }
}

/** Sitenin kategorileri (12 saat tr_settings.wp_kategoriler'de saklanır; yapay zekâ bu listeden seçer). */
export async function wpKategoriler(sb: Sb, a: WpAyar, zorla = false): Promise<Kategori[]> {
  const { data } = await sb.from("tr_settings").select("value").eq("key", "wp_kategoriler").maybeSingle();
  const onbellek = data?.value as { zaman?: string; liste?: Kategori[] } | null;
  if (!zorla && onbellek?.liste?.length && Date.now() - Date.parse(onbellek.zaman ?? "") < 12 * 3_600_000) return onbellek.liste;
  const liste: Kategori[] = [];
  for (let sayfa = 1; sayfa <= 5; sayfa++) {
    const r = await wp(a, `/wp/v2/categories?per_page=100&page=${sayfa}&_fields=id,name,slug,parent`);
    if (!r.ok || !Array.isArray(r.veri)) { if (sayfa === 1) throw new Error(hataMetni(r.status, r.metin)); break; }
    for (const k of r.veri as Kategori[]) liste.push({ id: k.id, name: coz(k.name), slug: k.slug, parent: k.parent });
    if ((r.veri as unknown[]).length < 100) break;
  }
  await sb.from("tr_settings").upsert({ key: "wp_kategoriler", value: { zaman: new Date().toISOString(), liste } });
  return liste;
}

/** Yapay zekânın yazdığı kategori adını sitedeki bir kategoriyle eşle (ad ya da kısa ad). "Genel/Uncategorized" seçilmez. */
export function kategoriEsle(ad: string, liste: Kategori[]): Kategori | undefined {
  const k = anahtar(ad);
  if (!k) return undefined;
  const uygun = liste.filter((x) => x.slug !== "uncategorized" && anahtar(x.name) !== "genel");
  return uygun.find((x) => anahtar(x.name) === k || anahtar(x.slug) === k)
    ?? uygun.find((x) => anahtar(x.name).length >= 4 && (k.includes(anahtar(x.name)) || anahtar(x.name).includes(k)));
}

/**
 * Etiketler (Fatih, 23 Ekim): eskiden bulunamayan her etiket açılıyordu; WordPress'te 1.725 etiketin 1.513'ü hiçbir yazıda kullanılmıyordu.
 * Kural: en fazla 3 etiket. Sitede aynı adla VAR ve en az 2 yazıda kullanılmış etiket eklenir; yeni etiket yalnız ETIKET_IZINLI
 * listesindeki adlar için açılır (marka ve ana konular). Listede olmayan, yeni ya da tek yazılık etiketler eklenmez.
 */
export const ETIKET_IZINLI = [
  "Apple", "iPhone", "iPad", "Mac", "Apple Watch", "AirPods", "Samsung", "Galaxy", "Google", "Pixel", "Android", "Sony", "PlayStation", "Xbox", "Nintendo",
  "Microsoft", "Windows", "Xiaomi", "Huawei", "Honor", "Oppo", "OnePlus", "Vivo", "Asus", "Lenovo", "HP", "Dell", "Acer", "MSI", "Nvidia", "AMD", "Intel", "Qualcomm",
  "Meta", "OpenAI", "ChatGPT", "Gemini", "Yapay Zeka", "DJI", "Insta360", "GoPro", "Canon", "Nikon", "Fujifilm", "Panasonic", "Leica", "Sigma", "Tamron", "Hasselblad",
  "Tesla", "Togg", "Elektrikli Araç", "Steam", "Oyun", "Akıllı Saat", "Kulaklık", "Dron", "Aksiyon Kamerası", "Vlog", "Mikrofon", "Katlanabilir Telefon", "VR",
];
const IZINLI = new Set(ETIKET_IZINLI.map((x) => anahtar(x)));
export async function etiketIdleri(a: WpAyar, adlar: string[]): Promise<number[]> {
  const idler: number[] = [];
  const gorulen = new Set<string>();
  for (const ham of adlar.slice(0, 8)) {
    if (idler.length >= 3) break;
    const ad = String(ham ?? "").replace(/^#/, "").trim().slice(0, 60);
    const k = anahtar(ad);
    if (!k || gorulen.has(k)) continue;
    gorulen.add(k);
    const ara = await wp(a, `/wp/v2/tags?per_page=20&search=${encodeURIComponent(ad)}&_fields=id,name,slug,count`);
    const bulunan = Array.isArray(ara.veri) ? (ara.veri as { id: number; name: string; slug: string; count: number }[]).find((t) => anahtar(t.name) === k || anahtar(t.slug) === k) : undefined;
    if (bulunan && ((bulunan.count ?? 0) >= 2 || IZINLI.has(k))) { idler.push(bulunan.id); continue; }
    if (bulunan || !IZINLI.has(k)) continue; // tek yazılık / listede olmayan etiket eklenmez, açılmaz
    const duzgun = ETIKET_IZINLI.find((x) => anahtar(x) === k) ?? ad;
    const ac = await wp(a, "/wp/v2/tags", { method: "POST", body: { name: duzgun } });
    const v = ac.veri as { id?: number; code?: string; data?: { term_id?: number } } | null;
    if (ac.ok && v?.id) idler.push(v.id);
    else if (v?.code === "term_exists" && v.data?.term_id) idler.push(v.data.term_id);
  }
  return idler;
}

/** Taslağın sahibinin WordPress kullanıcısı (e-postası eşleşirse). Stüdyo kullanıcısı kullanıcıları listeleyemiyorsa (Editör rolü) sessizce atlanır. */
async function yazarBul(a: WpAyar, eposta: string): Promise<number | undefined> {
  if (!eposta) return undefined;
  const r = await wp(a, "/wp/v2/users?context=edit&per_page=100&_fields=id,email");
  if (!r.ok || !Array.isArray(r.veri)) return undefined;
  return (r.veri as { id: number; email?: string }[]).find((u) => (u.email ?? "").toLowerCase() === eposta.toLowerCase())?.id;
}

/** Bağlantı denemesi (Ayarlar → "Bağlantıyı dene"): kim olarak girildi, rolü, kategori sayısı. */
export async function wpDene(sb: Sb) {
  const a = wpAyar();
  if (!a) return { ok: false, hata: "WordPress bilgileri girilmemiş (Supabase Secrets: WP_URL, WP_USER, WP_APP_PASSWORD)." };
  const ben = await wp(a, "/wp/v2/users/me?context=edit&_fields=id,name,roles");
  if (!ben.ok) return { ok: false, hata: hataMetni(ben.status, ben.metin) };
  const v = ben.veri as { name: string; roles: string[] };
  const kategoriler = await wpKategoriler(sb, a, true);
  const uyari = (v.roles ?? []).some((r) => r === "editor" || r === "administrator") ? "" : "Kullanıcının rolü Editör değil; kategori/etiket işlemleri reddedilebilir.";
  return { ok: true, kullanici: v.name, roller: v.roles ?? [], kategori: kategoriler.length, site: a.url, uyari };
}


/** Seçilen görseli WordPress ortam kütüphanesine yükler (alt metin + yazar/lisans altyazısı). Hata olursa yazıyı engellemez. */
async function gorselYukle(a: WpAyar, g: GorselAday, alt: string, ad: string): Promise<{ id?: number; hata?: string }> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 25_000);
  try {
    const r = await fetch(g.buyuk, { headers: { "User-Agent": "UpdatedStudyo/1.0 (https://www.updated.com.tr)" }, signal: c.signal });
    if (!r.ok) return { hata: "Görsel indirilemedi (" + r.status + ")" };
    const tur = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    if (!/^image\/(jpeg|png|webp)$/.test(tur)) return { hata: "Görsel türü desteklenmiyor: " + tur };
    const veri = new Uint8Array(await r.arrayBuffer());
    if (veri.byteLength > 8_000_000) return { hata: "Görsel çok büyük" };
    const uzanti = tur === "image/png" ? "png" : tur === "image/webp" ? "webp" : "jpg";
    const dosya = (ad || "haber-gorseli").replace(/[^a-z0-9-]/gi, "-").slice(0, 60) + "." + uzanti;
    const y = await fetch(a.url + "/wp-json/wp/v2/media", {
      method: "POST", signal: c.signal,
      headers: { Authorization: "Basic " + btoa(a.user + ":" + a.pass), "Content-Type": tur, "Content-Disposition": `attachment; filename="${dosya}"`, "User-Agent": "UpdatedStudyo/1.0" },
      body: veri,
    });
    const m = await y.json().catch(() => null) as { id?: number } | null;
    if (!y.ok || !m?.id) return { hata: hataMetni(y.status, JSON.stringify(m ?? {})) };
    await wp(a, `/wp/v2/media/${m.id}`, { method: "POST", body: { alt_text: alt.slice(0, 200), ...(altyazi(g) ? { caption: altyazi(g) } : {}), title: alt.slice(0, 120) || dosya } });
    return { id: m.id };
  } catch (e) {
    return { hata: "Görsel yüklenemedi: " + String((e as Error).message ?? e).slice(0, 120) };
  } finally { clearTimeout(t); }
}

/** Sitemizin arşivinden ilgili yazılar (iç link adayı). Sadece yayındaki yazılar; aramalar sırayla, en fazla 6 sonuç. */
export async function wpIlgili(aramalar: string[]): Promise<{ baslik: string; link: string }[]> {
  const a = wpAyar();
  if (!a) return [];
  const out: { baslik: string; link: string }[] = [];
  for (const q of aramalar.map((x) => x.trim()).filter((x) => x.length >= 3).slice(0, 3)) {
    const r = await wp(a, `/wp/v2/posts?status=publish&per_page=4&search=${encodeURIComponent(q)}&_fields=title,link`);
    if (!Array.isArray(r.veri)) continue;
    for (const p of r.veri as { title: { rendered: string }; link: string }[]) {
      if (p.link && !out.some((o) => o.link === p.link)) out.push({ baslik: coz(p.title?.rendered ?? "").replace(/<[^>]+>/g, ""), link: p.link });
    }
    if (out.length >= 6) break;
  }
  return out.slice(0, 6);
}

/** Sonradan gelen görseli (Flux) WordPress'teki taslağın öne çıkan görseli yapar: yazı hâlâ taslaksa ve öne çıkan görseli yoksa. */
export async function wpOneCikanEkle(sb: Sb, taslakId: number): Promise<{ ok: boolean; hata?: string }> {
  const a = wpAyar();
  if (!a) return { ok: false, hata: "WordPress bağlantısı yok" };
  const { data: t } = await sb.from("tr_drafts").select("id,title,seo,image,wp_post_id,wp_modified").eq("id", taslakId).single();
  const img = (t?.image ?? {}) as { secilen?: GorselAday | null; wp_media_id?: number; alt_text?: string };
  if (!t?.wp_post_id || !img.secilen?.buyuk) return { ok: false, hata: "Yazı ya da görsel yok" };
  const m = await wp(a, `/wp/v2/posts/${t.wp_post_id}?context=edit&_fields=id,status,featured_media,modified_gmt`);
  const v = m.veri as { status?: string; featured_media?: number; modified_gmt?: string } | null;
  if (!m.ok || !v) return { ok: false, hata: hataMetni(m.status, m.metin) };
  if (!["draft", "pending"].includes(v.status ?? "") || (v.featured_media ?? 0) > 0) return { ok: false, hata: "Yazının zaten öne çıkan görseli var ya da yayında; dokunulmadı." };
  let medya = img.wp_media_id;
  if (!medya) {
    const y = await gorselYukle(a, img.secilen, img.alt_text || t.title, ((t.seo ?? {}) as { slug?: string }).slug || "");
    medya = y.id;
    await sb.from("tr_drafts").update({ image: { ...img, wp_media_id: y.id ?? null, yukleme_hata: y.hata ?? "" } }).eq("id", taslakId);
    if (!medya) return { ok: false, hata: y.hata };
  }
  const g = await wp(a, `/wp/v2/posts/${t.wp_post_id}`, { method: "POST", body: { featured_media: medya } });
  // Editör WordPress'te değiştirmediyse "son gördüğümüz" zamanı ilerlet (değiştirdiyse koruma sürsün)
  if (g.ok && t.wp_modified === v.modified_gmt) await sb.from("tr_drafts").update({ wp_modified: (g.veri as { modified_gmt?: string })?.modified_gmt ?? "" }).eq("id", taslakId);
  return g.ok ? { ok: true } : { ok: false, hata: hataMetni(g.status, g.metin) };
}

type Secenek = { zorla?: boolean; kategoriSec?: (baslik: string, oneri: string, liste: Kategori[]) => Promise<string> };

/** Taslağı WordPress'e taslak olarak gönderir ya da daha önce gönderilmişse günceller. Sonucu tr_drafts'a yazar. */
export async function wpGonder(sb: Sb, taslakId: number, s: Secenek = {}): Promise<Sonuc> {
  const a = wpAyar();
  if (!a) return { ok: false, kod: "ayar_yok", hata: "WordPress bağlantısı henüz kurulmadı (Supabase Secrets: WP_URL, WP_USER, WP_APP_PASSWORD)." };
  const { data: t } = await sb.from("tr_drafts").select("*").eq("id", taslakId).single();
  if (!t) return { ok: false, hata: "Taslak bulunamadı." };
  const kaydetHata = async (hata: string, kod?: string): Promise<Sonuc> => {
    await sb.from("tr_drafts").update({ wp_error: hata.slice(0, 300) }).eq("id", taslakId);
    return { ok: false, hata, kod };
  };
  try {
    // Daha önce gönderildiyse: WordPress'te yayınlanmış ya da editör tarafından değiştirilmişse üzerine yazma
    let postId: number | null = t.wp_post_id ?? null;
    if (postId) {
      const m = await wp(a, `/wp/v2/posts/${postId}?context=edit&_fields=id,status,modified_gmt`);
      if (m.status === 404 || m.status === 410) postId = null; // WordPress'te silinmiş → yeniden açılır
      else if (!m.ok) return kaydetHata(hataMetni(m.status, m.metin));
      else {
        const v = m.veri as { status: string; modified_gmt: string };
        if (!["draft", "pending", "auto-draft"].includes(v.status)) return kaydetHata("Bu yazı WordPress'te yayınlanmış ya da zamanlanmış; Stüdyo üzerine yazmaz.", "yayinda");
        if (!s.zorla && t.wp_modified && v.modified_gmt !== t.wp_modified) return kaydetHata("Bu taslak WordPress'te düzenlenmiş; üzerine yazmadım. Yine de göndermek için \"Üzerine yaz\"a bas.", "duzenlendi");
      }
    }

    // Kategori: sitedeki listeden. Önce yapay zekânın yazdığı adla eşleştir, olmazsa listeden seçtir, o da olmazsa varsayılan.
    const seo = (t.seo ?? {}) as { kategori?: string; etiketler?: string[]; slug?: string; meta?: string; title_tag?: string; focus?: string };
    const liste = await wpKategoriler(sb, a);
    let kat = kategoriEsle(seo.kategori ?? "", liste);
    if (!kat && s.kategoriSec && liste.length) {
      try { kat = kategoriEsle(await s.kategoriSec(t.title, seo.kategori ?? "", liste), liste); } catch { /* varsayılana düş */ }
    }
    if (!kat) {
      const { data: vk } = await sb.from("tr_settings").select("value").eq("key", "wp_varsayilan_kategori").maybeSingle();
      kat = liste.find((x) => x.id === Number(vk?.value));
    }
    const etiketler = await etiketIdleri(a, seo.etiketler ?? []);

    let yazar: number | undefined;
    if (t.author) {
      const { data: p } = await sb.from("profiles").select("email").eq("id", t.author).maybeSingle();
      yazar = await yazarBul(a, p?.email ?? "");
    }

    // Öne çıkan görsel: seçildiyse ve daha önce yüklenmediyse ortam kütüphanesine yükle (bir kez)
    const img = (t.image ?? {}) as { secilen?: GorselAday | null; wp_media_id?: number; alt_text?: string; yukleme_hata?: string };
    let medya = img.wp_media_id;
    if (!medya && img.secilen?.buyuk) {
      const y = await gorselYukle(a, img.secilen, img.alt_text || t.title, seo.slug || "");
      medya = y.id;
      await sb.from("tr_drafts").update({ image: { ...img, wp_media_id: y.id ?? null, yukleme_hata: y.hata ?? "" } }).eq("id", taslakId);
    }

    const yazi: Record<string, unknown> = {
      status: "draft", ...(medya ? { featured_media: medya } : {}), title: t.title, content: yaziHtml(t.spot ?? "", t.body ?? ""), excerpt: seo.meta ?? "",
      ...(seo.slug ? { slug: seo.slug } : {}), ...(kat ? { categories: [kat.id] } : {}), ...(etiketler.length ? { tags: etiketler } : {}),
      ...(yazar ? { author: yazar } : {}),
      // SEO eklentisi alanları: eklenti bunları REST'e açmışsa dolar, açmamışsa WordPress sessizce yok sayar.
      meta: { rank_math_title: seo.title_tag ?? "", rank_math_description: seo.meta ?? "", rank_math_focus_keyword: seo.focus ?? "",
        _yoast_wpseo_title: seo.title_tag ?? "", _yoast_wpseo_metadesc: seo.meta ?? "", _yoast_wpseo_focuskw: seo.focus ?? "" },
    };
    let r = await wp(a, postId ? `/wp/v2/posts/${postId}` : "/wp/v2/posts", { method: "POST", body: yazi });
    // Bazı siteler bilinmeyen meta alanını reddeder: meta olmadan bir kez daha dene
    if (!r.ok && r.status === 400 && /meta/i.test(r.metin)) { delete yazi.meta; r = await wp(a, postId ? `/wp/v2/posts/${postId}` : "/wp/v2/posts", { method: "POST", body: yazi }); }
    if (!r.ok) return kaydetHata(hataMetni(r.status, r.metin));
    const v = r.veri as { id: number; modified_gmt: string };
    const link = `${a.url}/wp-admin/post.php?post=${v.id}&action=edit`;
    await sb.from("tr_drafts").update({
      wp_post_id: v.id, wp_link: link, wp_modified: v.modified_gmt, wp_sent_at: new Date().toISOString(), wp_error: "", status: "gonderildi",
    }).eq("id", taslakId);
    return { ok: true, post_id: v.id, link, kategori: kat?.name ?? "", etiket: etiketler.length };
  } catch (e) {
    return kaydetHata(String((e as Error).message ?? e));
  }
}
