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
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), Authorization: `Studyo ${anahtar}`, ...init.headers },
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
