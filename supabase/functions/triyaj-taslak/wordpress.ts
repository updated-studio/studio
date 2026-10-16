// WordPress'e taslak gönderimi (REST API + Uygulama Şifresi). MCP kullanılmaz: Stüdyo siteyle doğrudan konuşur.
// Gizli bilgi (Supabase Secrets): WP_URL (https://updated.com.tr), WP_USER (WordPress'teki "Stüdyo" kullanıcısı), WP_APP_PASSWORD.
// Kurallar (ARCHITECTURE.md, 15 Ekim 2026): yazı her zaman "draft" gider, yayına editör basar; kategori sadece sitede VAR OLANLARDAN seçilir;
// etiket önce sitede aranır, yoksa açılır; editör notları/sorular/doğrulama listesi gitmez; WordPress'te editörün değiştirdiği taslağın üzerine yazılmaz.
import { yaziHtml } from "./html.ts";

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

/** Etiketler: önce sitede aynı adla var mı bakılır, yoksa açılır. En fazla 7. */
export async function etiketIdleri(a: WpAyar, adlar: string[]): Promise<number[]> {
  const idler: number[] = [];
  const gorulen = new Set<string>();
  for (const ham of adlar.slice(0, 7)) {
    const ad = String(ham ?? "").replace(/^#/, "").trim().slice(0, 60);
    const k = anahtar(ad);
    if (!k || gorulen.has(k)) continue;
    gorulen.add(k);
    const ara = await wp(a, `/wp/v2/tags?per_page=20&search=${encodeURIComponent(ad)}&_fields=id,name,slug`);
    const bulunan = Array.isArray(ara.veri) ? (ara.veri as { id: number; name: string; slug: string }[]).find((t) => anahtar(t.name) === k || anahtar(t.slug) === k) : undefined;
    if (bulunan) { idler.push(bulunan.id); continue; }
    const ac = await wp(a, "/wp/v2/tags", { method: "POST", body: { name: ad } });
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

    const yazi: Record<string, unknown> = {
      status: "draft", title: t.title, content: yaziHtml(t.spot ?? "", t.body ?? ""), excerpt: seo.meta ?? "",
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
