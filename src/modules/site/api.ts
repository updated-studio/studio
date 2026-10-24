import { sb, SUPABASE_URL } from "../../shared/supabase";

// Site paneli (Payload) aynı sunucuda: panel.updated.com.tr/api. Stüdyo oturumu "Studyo <anahtar>" başlığıyla gider;
// panel kişiyi e-postasından kendi hesabıyla eşleştirir ve kendi yetki kurallarını uygular (site deposu apps/cms/src/auth/studyo.ts).
export const PANEL = SUPABASE_URL;
export const SITE = "https://updated.com.tr";

export type Koleksiyon = "news" | "reviews" | "comparisons";
export type Durum = "taslak" | "incelemede" | "planlandi" | "yayinda" | "arsiv";
export type PanelKullanici = { id: number; name: string; email: string; role: string };
export type Icerik = {
  id: number;
  title?: string;
  spot?: string;
  slug?: string;
  path?: string;
  _status?: "draft" | "published";
  updatedAt: string;
  publishedAt?: string;
  category?: { id: number; name?: string; title?: string } | number | null;
  author?: { id: number; name?: string } | number | null;
  workflow?: { state?: Durum; [k: string]: unknown };
};
export type Sayfa = { docs: Icerik[]; totalDocs: number; hasNextPage: boolean; page: number };

export const KOLEKSIYONLAR: { id: Koleksiyon; ad: string; onek: string }[] = [
  { id: "news", ad: "Haberler", onek: "" },
  { id: "reviews", ad: "İncelemeler", onek: "/inceleme" },
  { id: "comparisons", ad: "Karşılaştırmalar", onek: "/karsilastirma" },
];

// Kit §12: sabit beş durum (renk + ikon + metin)
export const DURUMLAR: Record<Durum, string> = { taslak: "○ Taslak", incelemede: "◐ İncelemede", planlandi: "◷ Planlandı", yayinda: "● Yayında", arsiv: "■ Arşiv" };

export class PanelHatasi extends Error {
  kod: number;
  constructor(message: string, kod: number) { super(message); this.kod = kod; }
}

async function istek<T>(yol: string, init: RequestInit = {}): Promise<T> {
  const { data } = await sb.auth.getSession();
  const anahtar = data.session?.access_token;
  if (!anahtar) throw new PanelHatasi("Oturum bulunamadı, yeniden giriş yap.", 401);
  const r = await fetch(`${PANEL}/api${yol}`, {
    ...init,
    headers: { ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), Authorization: `Studyo ${anahtar}`, ...init.headers },
  });
  const govde = await r.json().catch(() => ({}));
  if (!r.ok) throw new PanelHatasi(govde?.errors?.[0]?.message || govde?.message || `Panel yanıt vermedi (${r.status})`, r.status);
  return govde as T;
}

export const ben = () => istek<{ user: PanelKullanici | null }>("/users/me").then((x) => x.user);

/** Sekmenin filtresi: Payload "where" sorgusu adres biçiminde */
export function filtre(sekme: string, ara: string): string {
  const p = new URLSearchParams();
  let i = 0;
  const ekle = (alan: string, op: string, deger: string) => { p.set(`where[and][${i}][${alan}][${op}]`, deger); i++; };
  if (sekme === "yayinda") ekle("_status", "equals", "published");
  else if (sekme !== "hepsi") { ekle("workflow.state", "equals", sekme); ekle("_status", "not_equals", "published"); }
  if (ara.trim()) ekle("title", "like", ara.trim());
  return p.toString();
}

export const liste = (k: Koleksiyon, sekme: string, ara: string, sayfa = 1) =>
  istek<Sayfa>(`/${k}?${filtre(sekme, ara)}&draft=true&depth=1&limit=25&page=${sayfa}&sort=-updatedAt`);

export const sayi = (k: Koleksiyon, sekme: string) =>
  istek<Sayfa>(`/${k}?${filtre(sekme, "")}&draft=true&depth=0&limit=1`).then((x) => x.totalDocs);

export const getir = (k: Koleksiyon, id: number) => istek<Icerik>(`/${k}/${id}?draft=true&depth=0`);

/** Yayınla: panelin kuralları geçerli (yalnız yayın yönetmeni/yönetici, kontrol listesi tam, kendi haberini onaylayamaz) */
export const yayinla = (k: Koleksiyon, id: number) => istek<{ doc: Icerik }>(`/${k}/${id}`, { method: "PATCH", body: JSON.stringify({ _status: "published" }) });

/** Yayından kaldır: sitedeki sayfa bir sonraki derlemede kalkar, içerik taslak olarak kalır */
export const yayindanKaldir = async (k: Koleksiyon, id: number) => {
  const d = await getir(k, id);
  return istek(`/${k}/${id}`, { method: "PATCH", body: JSON.stringify({ _status: "draft", workflow: { ...d.workflow, state: "taslak" } }) });
};

/** Yayın akışı durumu (taslak ↔ incelemede); grup alanı bütün olarak gönderilir ki kontrol listesi, sahip vb. silinmesin */
export const durumYap = async (k: Koleksiyon, id: number, durum: Durum) => {
  const d = await getir(k, id);
  return istek(`/${k}/${id}?draft=true`, { method: "PATCH", body: JSON.stringify({ workflow: { ...d.workflow, state: durum } }) });
};

export const panelAdresi = (k: Koleksiyon, id?: number) => `${PANEL}/admin/collections/${k}${id ? `/${id}` : "/create"}`;
export const siteAdresi = (k: Koleksiyon, x: Icerik) => x.path ? SITE + x.path : x.slug ? `${SITE}${KOLEKSIYONLAR.find((c) => c.id === k)!.onek}/${x.slug}` : null;
export const ad = (x: { name?: string; title?: string } | number | null | undefined) => (x && typeof x === "object" ? x.name || x.title : "") || "";

// ── Düzenleme (2. aşama) ────────────────────────────────────────────────────
export type Sema = {
  checklist: [string, string][];
  labels: { label: string; value: string }[];
  limit: { title: number; seoTitle: number; spot: number; alt: number };
  states: { label: string; value: Durum }[];
  yasakKelimeler: string[];
};
export type Medya = { id: number; alt?: string; credit?: string; filename?: string; url?: string; width?: number; height?: number; sizes?: Record<string, { url?: string | null }> };
export type Secenek = { id: number; ad: string };
export type TamIcerik = Icerik & {
  label?: string;
  cover?: number | null;
  author?: number | null;
  category?: number | null;
  shortAnswer?: string;
  body?: unknown;
  seo?: { title?: string; description?: string; [k: string]: unknown };
  workflow?: { state?: Durum; checklist?: Record<string, boolean>; [k: string]: unknown };
};

export const sema = () => istek<Sema>("/studyo/sema");
export const onizlemeAdresi = (k: Koleksiyon, id: number) => istek<{ url: string }>(`/studyo/onizleme/${k}/${id}`).then((x) => x.url);
/** Düzenleme için: ilişkiler kimlik olarak gelir (geri gönderirken grup alanları bozulmasın) */
export const getirTam = (k: Koleksiyon, id: number) => istek<TamIcerik>(`/${k}/${id}?draft=true&depth=0`);

/** Kaydet: taslak olarak (yayındaki sayfa değişmez; değişiklik "Yayınla" ile sitede görünür) */
export const kaydet = (k: Koleksiyon, id: number, veri: Record<string, unknown>) =>
  istek<{ doc: TamIcerik }>(`/${k}/${id}?draft=true&depth=0`, { method: "PATCH", body: JSON.stringify(veri) }).then((x) => x.doc);
/** Değişikliklerle birlikte yayınla (panelin yayın kuralları geçerli) */
export const kaydetVeYayinla = (k: Koleksiyon, id: number, veri: Record<string, unknown>) =>
  istek<{ doc: TamIcerik }>(`/${k}/${id}?depth=0`, { method: "PATCH", body: JSON.stringify({ ...veri, _status: "published" }) }).then((x) => x.doc);

const secenekler = (yol: string) => istek<{ docs: { id: number; name?: string; title?: string }[] }>(yol).then((x) => x.docs.map((d) => ({ id: d.id, ad: d.name || d.title || `#${d.id}` })));
export const kategoriler = () => secenekler("/categories?limit=200&depth=0&sort=name");
export const yazarlar = () => secenekler("/authors?limit=200&depth=0&sort=name");

export const medyaListe = (ara: string, sayfa = 1) => {
  const p = new URLSearchParams({ limit: "24", page: String(sayfa), sort: "-createdAt", depth: "0" });
  if (ara.trim()) { p.set("where[or][0][alt][like]", ara.trim()); p.set("where[or][1][filename][like]", ara.trim()); }
  return istek<{ docs: Medya[]; hasNextPage: boolean }>(`/media?${p}`);
};
export const medyaGetir = (id: number) => istek<Medya>(`/media/${id}?depth=0`);
/** Görsel yükle: alt metin ve künye zorunlu (kit §11, §2) */
export async function medyaYukle(dosya: File, alt: string, credit: string, representative: boolean): Promise<Medya> {
  const f = new FormData();
  f.append("file", dosya);
  f.append("_payload", JSON.stringify({ alt, credit, representative }));
  return istek<{ doc: Medya }>("/media", { method: "POST", body: f }).then((x) => x.doc);
}
export const medyaKucuk = (m?: Medya | null) => (m && (m.sizes?.thumb?.url || m.sizes?.card?.url || m.url)) || "";
export const medyaAdres = (yol: string) => (yol.startsWith("http") ? yol : PANEL + yol);
/** Yeni boş taslak (taslakta zorunlu alanlar aranmaz; yayınlarken panel denetler) */
export const yeniTaslak = (k: Koleksiyon) =>
  istek<{ doc: TamIcerik }>(`/${k}?draft=true&depth=0`, { method: "POST", body: JSON.stringify({ title: "", _status: "draft" }) }).then((x) => x.doc);

/** Eski sistemden gelen künyelerde HTML var (ör. <a href=…>): ekranda düz yazı */
export const duzMetin = (s?: string) => (s ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
