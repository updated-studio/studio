// Panelin alan yapısı (site deposu apps/cms/src/lib/sema.ts → GET /api/studyo/alanlar). Stüdyo formları bundan kurulur.
import { istekYap } from "./api";

export type AlanTuru = "text" | "textarea" | "email" | "number" | "checkbox" | "select" | "radio" | "date" | "relationship" | "upload" | "richText" | "group" | "row" | "collapsible" | "array" | "tabs" | "blocks" | "json" | "code" | "point" | "join";
export type Alan = {
  type: AlanTuru;
  name?: string;
  label?: string;
  required?: boolean;
  hasMany?: boolean;
  unique?: boolean;
  relationTo?: string | string[];
  /** Ters ilişki (join): hangi koleksiyonun hangi alanı bu kayda bağlanıyor */
  collection?: string; on?: string;
  options?: { label: string; value: string }[];
  min?: number; max?: number; minRows?: number; maxRows?: number; maxLength?: number;
  defaultValue?: string | number | boolean;
  admin?: { description?: string; readOnly?: boolean; position?: "sidebar"; kosullu?: boolean; tarih?: string; kapali?: boolean };
  fields?: Alan[];
  tabs?: { name?: string; label: string; fields: Alan[] }[];
};
export type KoleksiyonSema = {
  slug: string; tekil: string; cogul: string; grup: string; baslikAlani: string; sutunlar: string[];
  gorsel: boolean; giris: boolean; apiAnahtari?: boolean; fields: Alan[];
} & SurumOzellik;
/** Panelin sürüm ayarları: taslak, sürüm geçmişi, otomatik kayıt aralığı (ms, 0 = yok), zamanlanmış yayın, düzenleme kilidi */
export type SurumOzellik = { taslak: boolean; surumler?: boolean; otoKayit?: number; zamanlama?: boolean; kilit?: boolean };
export type GenelSema = { slug: string; ad: string; grup: string; fields: Alan[] } & SurumOzellik;
export type PanelSema = { koleksiyonlar: KoleksiyonSema[]; genel: GenelSema[] };

let onbellek: Promise<PanelSema> | null = null;
export const alanlar = () => (onbellek ??= istekYap<PanelSema>("/studyo/alanlar").catch((e) => { onbellek = null; throw e; }));

/** Düzen alanları (row, collapsible) veri tutmaz: içindekiler üst nesnede durur */
export const duzenMi = (a: Alan) => a.type === "row" || a.type === "collapsible";
/** Panelin iç alanları (_status gibi) formda gösterilmez ve geri gönderilmez: yayın durumu yalnız Yayınla / Yayından kaldır ile değişir */
export const icAlanMi = (a: Alan) => !!a.name?.startsWith("_");
/** Veri tutan bütün alanlar (düzen alanları açılmış hâlde) */
export const veriAlanlari = (fs: Alan[]): Alan[] => fs.flatMap((a) => (duzenMi(a) ? veriAlanlari(a.fields ?? []) : a.name && !icAlanMi(a) ? [a] : []));
/** Panelin Stüdyo'da henüz çizemediğimiz türleri: bunlar varsa form o alanı "panelde düzenle" diye gösterir */
export const DESTEKLI = new Set<AlanTuru>(["text", "textarea", "email", "number", "checkbox", "select", "radio", "date", "relationship", "upload", "richText", "group", "row", "collapsible", "array", "join"]);
