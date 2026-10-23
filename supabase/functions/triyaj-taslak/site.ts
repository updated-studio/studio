// Taslağı yeni sitenin paneline (Payload, panel.updated.com.tr) gönderir. WordPress'e gönderimin (wordpress.ts) yerini aldı (Fatih, 23 Ekim 2026).
// Uç: site deposu apps/cms/src/endpoints/triyajImport.ts — /api/triyaj/import, /api/triyaj/durum, /api/triyaj/kapak.
// Gizli bilgi (Supabase Secrets): STUDIO_IMPORT_KEY (panel sunucusundaki değerle aynı; site deposundaki panel iş akışı otomatik eşitler),
// isteğe bağlı PANEL_URL (varsayılan https://panel.updated.com.tr), SITE_URL (varsayılan https://updated.com.tr).
// Kurallar (ARCHITECTURE.md, 15 ve 23 Ekim 2026): haber panelde "incelemede" taslak olarak açılır, yayına panelde yayın yönetmeni basar;
// kategori yalnız paneldeki listeden; etiket en fazla 3-4 (panelde sayfa açmaz, yalnız varlık); editör notları/sorular/doğrulama gitmez;
// panelde yayınlanmış ya da editörün değiştirdiği taslağın üzerine yazılmaz ("Üzerine yaz" hariç).
import { altyazi, type GorselAday } from "./gorsel.ts";

// deno-lint-ignore no-explicit-any
type Sb = any;
export type SiteAyar = { panel: string; site: string; anahtar: string };
export type Kategori = { id: number | string; name: string; slug: string; parent?: number };
export type Sonuc = { ok: true; id: number | string; admin: string; onizleme: string; kategori: string; guncellendi: boolean } | { ok: false; hata: string; kod?: string };

export function siteAyar(): SiteAyar | null {
  const panel = (Deno.env.get("PANEL_URL") ?? "https://panel.updated.com.tr").trim().replace(/\/+$/, "");
  const site = (Deno.env.get("SITE_URL") ?? "https://updated.com.tr").trim().replace(/\/+$/, "");
  const anahtar = (Deno.env.get("STUDIO_IMPORT_KEY") ?? "").trim();
  return anahtar ? { panel, site, anahtar } : null;
}

/** Türkçe karakter ve büyük/küçük harf farkını yok sayarak karşılaştırma anahtarı */
export function anahtar(s: string): string {
  return String(s ?? "").toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}

function hataMetni(status: number, veri: unknown): string {
  const v = (veri ?? {}) as { error?: string; code?: string };
  if (status === 401) return "Panel anahtarı reddetti: Supabase Secrets'taki STUDIO_IMPORT_KEY paneldekiyle aynı değil.";
  if (status === 404) return "Panelde Stüdyo ucu bulunamadı (panel güncel değil ya da PANEL_URL yanlış).";
  if (status === 0) return "Panele ulaşılamadı (zaman aşımı ya da bağlantı hatası).";
  return v.error ? `${v.error}` : `Panel hata verdi (${status}${v.code ? ", " + v.code : ""}).`;
}

async function panel(a: SiteAyar, yol: string, init: { method?: string; body?: unknown; ms?: number } = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), init.ms ?? 25_000);
  try {
    const r = await fetch(a.panel + "/api" + yol, {
      method: init.method ?? "GET", signal: c.signal,
      headers: { "x-studio-key": a.anahtar, "Content-Type": "application/json", Accept: "application/json", "User-Agent": "UpdatedStudyo/1.0" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const metin = await r.text();
    let veri: unknown = null;
    try { veri = JSON.parse(metin); } catch { /* HTML hata sayfası */ }
    return { ok: r.ok, status: r.status, veri };
  } catch {
    return { ok: false, status: 0, veri: null };
  } finally { clearTimeout(t); }
}

/** Paneldeki kategoriler (12 saat tr_settings.site_kategoriler'de saklanır; yapay zekâ bu listeden seçer). */
export async function siteKategoriler(sb: Sb, a: SiteAyar, zorla = false): Promise<Kategori[]> {
  const { data } = await sb.from("tr_settings").select("value").eq("key", "site_kategoriler").maybeSingle();
  const onbellek = data?.value as { zaman?: string; liste?: Kategori[] } | null;
  if (!zorla && onbellek?.liste?.length && Date.now() - Date.parse(onbellek.zaman ?? "") < 12 * 3_600_000) return onbellek.liste;
  const r = await panel(a, "/triyaj/durum");
  const liste = (r.veri as { kategoriler?: Kategori[] } | null)?.kategoriler;
  if (!r.ok || !Array.isArray(liste)) {
    if (onbellek?.liste?.length) return onbellek.liste; // panel geçici olarak yoksa eski liste
    throw new Error(hataMetni(r.status, r.veri));
  }
  await sb.from("tr_settings").upsert({ key: "site_kategoriler", value: { zaman: new Date().toISOString(), liste } });
  return liste;
}

/** Yapay zekânın yazdığı kategori adını paneldeki bir kategoriyle eşle (ad ya da kısa ad). "Genel" seçilmez. */
export function kategoriEsle(ad: string, liste: Kategori[]): Kategori | undefined {
  const k = anahtar(ad);
  if (!k) return undefined;
  const uygun = liste.filter((x) => x.slug !== "uncategorized" && anahtar(x.name) !== "genel");
  return uygun.find((x) => anahtar(x.name) === k || anahtar(x.slug) === k)
    ?? uygun.find((x) => anahtar(x.name).length >= 4 && (k.includes(anahtar(x.name)) || anahtar(x.name).includes(k)));
}

/** Bağlantı denemesi (Ayarlar → "Bağlantıyı dene"): panel adresi, kategori ve yazar sayısı. */
export async function siteDene(sb: Sb) {
  const a = siteAyar();
  if (!a) return { ok: false, hata: "Panel anahtarı girilmemiş (Supabase Secrets: STUDIO_IMPORT_KEY)." };
  const r = await panel(a, "/triyaj/durum");
  if (!r.ok) return { ok: false, hata: hataMetni(r.status, r.veri) };
  const v = r.veri as { kategoriler: Kategori[]; yazar: number };
  await sb.from("tr_settings").upsert({ key: "site_kategoriler", value: { zaman: new Date().toISOString(), liste: v.kategoriler } });
  return { ok: true, panel: a.panel, kategori: v.kategoriler.length, yazar: v.yazar, uyari: v.yazar ? "" : "Panelde yazar yok; haber açılamaz." };
}

/** Sitemizin arşivinden ilgili yazılar (iç link adayı). Panelin herkese açık okuma ucu: yalnız yayındaki haberler, en fazla 6 sonuç. */
export async function siteIlgili(aramalar: string[]): Promise<{ baslik: string; link: string }[]> {
  const a = siteAyar();
  if (!a) return [];
  const out: { baslik: string; link: string }[] = [];
  for (const q of aramalar.map((x) => x.trim()).filter((x) => x.length >= 3).slice(0, 3)) {
    const yol = `/news?limit=4&depth=0&sort=-publishedAt&where[title][like]=${encodeURIComponent(q)}&select[title]=true&select[path]=true`;
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 10_000);
    try {
      const r = await fetch(a.panel + "/api" + yol, { signal: c.signal, headers: { Accept: "application/json", "User-Agent": "UpdatedStudyo/1.0" } });
      const v = await r.json().catch(() => null) as { docs?: { title: string; path?: string }[] } | null;
      for (const d of v?.docs ?? []) {
        const link = d.path ? a.site + d.path : "";
        if (link && !out.some((o) => o.link === link)) out.push({ baslik: d.title, link });
      }
    } catch { /* arama olmadan devam */ } finally { clearTimeout(t); }
    if (out.length >= 6) break;
  }
  return out.slice(0, 6);
}

/** Stüdyo'daki "Ad — bağlantı" satırlarını panelin kaynak listesine çevirir; ilk satır birincil. */
function kaynakListesi(metin: string) {
  const out: { name: string; url: string; primary: boolean }[] = [];
  for (const ham of String(metin ?? "").split("\n")) {
    const satir = ham.replace(/^Asıl kaynak:\s*/i, "").trim();
    if (!satir) continue;
    const m = satir.match(/^(.*?)\s+[—-]\s+(https?:\/\/\S+)$/);
    const kaynak = m ? { name: m[1].trim(), url: m[2] } : /^https?:\/\//.test(satir) ? { name: new URL(satir).hostname.replace(/^www\./, ""), url: satir } : { name: satir, url: "" };
    if (!kaynak.name || out.some((o) => (kaynak.url && o.url === kaynak.url) || o.name === kaynak.name)) continue;
    out.push({ ...kaynak, primary: out.length === 0 });
  }
  return out.slice(0, 8);
}

/** Haberin türünden panelin içerik etiketi (sızıntı/söylenti → "sizinti"; panel başlıkta "sızıntı/iddia" ister). */
function etiketTuru(tur: string): string {
  const k = anahtar(tur);
  return k === "sizinti" || k === "soylenti" ? "sizinti" : "yok";
}

const gorselGovde = (g: GorselAday, alt: string) => ({
  url: g.buyuk, alt, ai: /flux|yapay/i.test(g.kaynak ?? ""),
  credit: altyazi(g) || (g.kaynak ? `Görsel: ${g.kaynak}` : "Görsel: kaynak"),
});

/** Sonradan gelen görseli (Flux) paneldeki taslağın kapağı yapar: haber hâlâ taslaksa ve kapağı yoksa. */
export async function siteKapakEkle(sb: Sb, taslakId: number): Promise<{ ok: boolean; hata?: string }> {
  const a = siteAyar();
  if (!a) return { ok: false, hata: "Panel bağlantısı yok" };
  const { data: t } = await sb.from("tr_drafts").select("id,title,image,site_id").eq("id", taslakId).single();
  const img = (t?.image ?? {}) as { secilen?: GorselAday | null; alt_text?: string };
  if (!t?.site_id || !img.secilen?.buyuk) return { ok: false, hata: "Haber ya da görsel yok" };
  const r = await panel(a, "/triyaj/kapak", { method: "POST", body: { studioId: String(taslakId), image: gorselGovde(img.secilen, img.alt_text || t.title) }, ms: 45_000 });
  const v = r.veri as { updatedAt?: string; error?: string } | null;
  if (r.ok && v?.updatedAt) await sb.from("tr_drafts").update({ site_guncel: v.updatedAt }).eq("id", taslakId);
  return r.ok ? { ok: true } : { ok: false, hata: hataMetni(r.status, r.veri) };
}

type Secenek = { zorla?: boolean; kategoriSec?: (baslik: string, oneri: string, liste: Kategori[]) => Promise<string> };

/** Taslağı panele taslak haber olarak gönderir ya da daha önce gönderilmişse günceller. Sonucu tr_drafts'a yazar. */
export async function siteGonder(sb: Sb, taslakId: number, s: Secenek = {}): Promise<Sonuc> {
  const a = siteAyar();
  if (!a) return { ok: false, kod: "ayar_yok", hata: "Panel bağlantısı henüz kurulmadı (Supabase Secrets: STUDIO_IMPORT_KEY)." };
  const { data: t } = await sb.from("tr_drafts").select("*").eq("id", taslakId).single();
  if (!t) return { ok: false, hata: "Taslak bulunamadı." };
  const kaydetHata = async (hata: string, kod?: string): Promise<Sonuc> => {
    await sb.from("tr_drafts").update({ site_hata: hata.slice(0, 300) }).eq("id", taslakId);
    return { ok: false, hata, kod };
  };
  try {
    // Kategori: paneldeki listeden. Önce yapay zekânın yazdığı adla eşleştir, olmazsa listeden seçtir, o da olmazsa varsayılan.
    const seo = (t.seo ?? {}) as { kategori?: string; etiketler?: string[]; slug?: string; meta?: string; title_tag?: string };
    const liste = await siteKategoriler(sb, a);
    let kat = kategoriEsle(seo.kategori ?? "", liste);
    if (!kat && s.kategoriSec && liste.length) {
      try { kat = kategoriEsle(await s.kategoriSec(t.title, seo.kategori ?? "", liste), liste); } catch { /* varsayılana düş */ }
    }
    if (!kat) {
      const { data: vk } = await sb.from("tr_settings").select("value").eq("key", "site_varsayilan_kategori").maybeSingle();
      kat = liste.find((x) => x.slug === String(vk?.value ?? ""));
    }
    if (!kat) return kaydetHata("Kategori panelde bulunamadı. Taslakta kategoriyi düzelt ya da Ayarlar'dan varsayılan kategori seç.", "kategori");

    let eposta = "";
    if (t.author) {
      const { data: p } = await sb.from("profiles").select("email").eq("id", t.author).maybeSingle();
      eposta = p?.email ?? "";
    }
    let tur = "", kume = "";
    if (t.item_id) {
      const { data: it } = await sb.from("tr_items").select("kind,event_key").eq("id", t.item_id).maybeSingle();
      tur = it?.kind ?? ""; kume = it?.event_key ?? "";
    }
    const img = (t.image ?? {}) as { secilen?: GorselAday | null; alt_text?: string };
    const qc = (t.qc ?? {}) as { onem?: number | null };

    const govde = {
      studioId: String(t.id), title: t.title, spot: t.spot ?? "", markdown: t.body ?? "",
      category: kat.slug, label: etiketTuru(tur),
      sources: kaynakListesi(t.sources ?? ""),
      ...(img.secilen?.buyuk ? { image: gorselGovde(img.secilen, img.alt_text || t.title) } : {}),
      seo: { title: seo.title_tag ?? "", description: seo.meta ?? "", slug: seo.slug ?? "" },
      tags: (seo.etiketler ?? []).slice(0, 4),
      priority: qc.onem ?? undefined, cluster: kume || undefined, editorEmail: eposta || undefined,
      lastSeen: t.site_guncel || undefined, force: !!s.zorla,
    };
    const r = await panel(a, "/triyaj/import", { method: "POST", body: govde, ms: 60_000 });
    const v = (r.veri ?? {}) as { id?: number; admin?: string; preview?: string; updatedAt?: string; updated?: boolean; kategori?: string; code?: string; gorselHata?: string };
    if (!r.ok || !v.id) {
      if (v.code === "duzenlendi") return kaydetHata("Bu taslak panelde düzenlenmiş; üzerine yazmadım. Yine de göndermek için \"Üzerine yaz\"a bas.", "duzenlendi");
      if (v.code === "yayinda") return kaydetHata("Bu haber panelde yayınlanmış ya da planlanmış; Stüdyo üzerine yazmaz.", "yayinda");
      return kaydetHata(hataMetni(r.status, r.veri), v.code);
    }
    await sb.from("tr_drafts").update({
      site_id: v.id, site_admin: v.admin ?? "", site_onizleme: v.preview ?? "", site_guncel: v.updatedAt ?? "",
      site_gonderim: new Date().toISOString(), site_hata: v.gorselHata ? "Haber gitti ama görsel yüklenemedi: " + v.gorselHata : "", site_bekliyor: false, status: "gonderildi",
    }).eq("id", taslakId);
    return { ok: true, id: v.id, admin: v.admin ?? "", onizleme: v.preview ?? "", kategori: v.kategori ?? kat.name, guncellendi: !!v.updated };
  } catch (e) {
    return kaydetHata(String((e as Error).message ?? e));
  }
}
