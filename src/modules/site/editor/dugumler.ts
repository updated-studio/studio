// Haber metni editörünün öğeleri: site panelinin (Payload, @payloadcms/richtext-lexical 3.91, Lexical 0.50) kaydettiği
// biçimle birebir aynı JSON üretir. Panele özel üç öğe burada: bağlantı (link), metin içi görsel (upload), ayırıcı (horizontalrule).
// Doğrulama: scripts/site-metin-dene.ts bütün haberleri bu öğelerle açıp kaydeder ve panelin kaydıyla karşılaştırır.
import {
  $applyNodeReplacement, DecoratorNode, ElementNode,
  type DOMConversionMap, type EditorConfig, type LexicalNode, type NodeKey, type RangeSelection, type SerializedElementNode, type SerializedLexicalNode, type Spread,
} from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import type { ReactNode } from "react";

/** Panelin rastgele kimliği (24 onaltılık hane, Mongo ObjectId biçimi) */
export const yeniKimlik = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

// ── Bağlantı ────────────────────────────────────────────────────────────────
export type BaglantiAlanlari = { url: string; newTab: boolean; linkType: "custom" | "internal"; doc?: unknown; [k: string]: unknown };
export type SerializedBaglanti = Spread<{ type: "link"; id?: string; fields: BaglantiAlanlari; version: 3 }, SerializedElementNode>;

export class BaglantiDugumu extends ElementNode {
  __alanlar: BaglantiAlanlari;
  __kimlik: string;
  static getType() { return "link"; }
  static clone(n: BaglantiDugumu) { return new BaglantiDugumu(n.__alanlar, n.__kimlik, n.__key); }
  constructor(alanlar: BaglantiAlanlari, kimlik?: string, key?: NodeKey) {
    super(key);
    this.__alanlar = alanlar;
    this.__kimlik = kimlik ?? yeniKimlik();
  }
  static importJSON(j: SerializedBaglanti) {
    return $baglantiOlustur(j.fields, j.id).setFormat(j.format).setIndent(j.indent).setDirection(j.direction);
  }
  exportJSON(): SerializedBaglanti {
    return { ...super.exportJSON(), type: "link", id: this.__kimlik, fields: this.getLatest().__alanlar, version: 3 };
  }
  createDOM(_c: EditorConfig) {
    const a = document.createElement("a");
    a.href = this.__alanlar.url || "#";
    if (this.__alanlar.newTab) a.target = "_blank";
    a.rel = "noreferrer";
    return a;
  }
  updateDOM(onceki: BaglantiDugumu, a: HTMLAnchorElement) {
    if (onceki.__alanlar.url !== this.__alanlar.url) a.href = this.__alanlar.url || "#";
    return false;
  }
  static importDOM(): DOMConversionMap | null { return null; }
  alanlar() { return this.getLatest().__alanlar; }
  alanlariDegistir(a: BaglantiAlanlari) { this.getWritable().__alanlar = a; return this; }
  isInline() { return true; }
  canInsertTextBefore() { return false; }
  canInsertTextAfter() { return false; }
  canBeEmpty() { return false; }
  insertNewAfter(_s: RangeSelection, _r = true) { return null; }
}
export const $baglantiOlustur = (alanlar: BaglantiAlanlari, kimlik?: string) => $applyNodeReplacement(new BaglantiDugumu(alanlar, kimlik));
export const $baglantiMi = (n: LexicalNode | null | undefined): n is BaglantiDugumu => n instanceof BaglantiDugumu;

// ── Metin içi görsel ────────────────────────────────────────────────────────
export type SerializedGorsel = Spread<{ type: "upload"; id?: string; value: number | { id: number }; relationTo: string; fields: Record<string, unknown>; format: string; version: 3 }, SerializedLexicalNode>;
/** Görseli ekranda çizen bileşen editör tarafında atanır (dugumler.ts tarayıcı dışında da çalışsın diye React'e bağlı değil) */
export const gorselCizici: { bilesen: ((p: { id: number; dugum: NodeKey }) => ReactNode) | null } = { bilesen: null };

export class GorselDugumu extends DecoratorNode<ReactNode> {
  __deger: number;
  __iliski: string;
  __alanlar: Record<string, unknown>;
  __bicim: string;
  __kimlik: string;
  static getType() { return "upload"; }
  static clone(n: GorselDugumu) { return new GorselDugumu(n.__deger, n.__iliski, n.__alanlar, n.__bicim, n.__kimlik, n.__key); }
  constructor(deger: number, iliski = "media", alanlar: Record<string, unknown> = {}, bicim = "", kimlik?: string, key?: NodeKey) {
    super(key);
    this.__deger = deger; this.__iliski = iliski; this.__alanlar = alanlar; this.__bicim = bicim; this.__kimlik = kimlik ?? yeniKimlik();
  }
  static importJSON(j: SerializedGorsel) {
    const deger = typeof j.value === "object" && j.value ? j.value.id : (j.value as number);
    return $applyNodeReplacement(new GorselDugumu(deger, j.relationTo, j.fields ?? {}, j.format ?? "", j.id));
  }
  exportJSON(): SerializedGorsel {
    const s = this.getLatest();
    return { id: s.__kimlik, type: "upload", value: s.__deger, fields: s.__alanlar, format: s.__bicim, version: 3, relationTo: s.__iliski };
  }
  createDOM() { const d = document.createElement("div"); d.className = "site-ed-gorsel"; return d; }
  updateDOM() { return false; }
  isInline() { return false; }
  decorate(): ReactNode { return gorselCizici.bilesen ? gorselCizici.bilesen({ id: this.__deger, dugum: this.__key }) : null; }
  medyaId() { return this.getLatest().__deger; }
}
export const $gorselOlustur = (medyaId: number) => $applyNodeReplacement(new GorselDugumu(medyaId));
export const $gorselMi = (n: LexicalNode | null | undefined): n is GorselDugumu => n instanceof GorselDugumu;

// ── Editörün tanıdığı öğeler ───────────────────────────────────────────────
export const DUGUMLER = [HeadingNode, QuoteNode, ListNode, ListItemNode, HorizontalRuleNode, BaglantiDugumu, GorselDugumu];
/** Kayıtta görülebilecek bütün öğe türleri; bunun dışında bir tür varsa metin Stüdyo'da açılmaz (bozulmasın diye) */
export const BILINEN_TURLER = new Set(["root", "paragraph", "text", "linebreak", "tab", "heading", "quote", "list", "listitem", "horizontalrule", "link", "upload"]);

export function bilinmeyenTurler(govde: unknown): string[] {
  const bulunan = new Set<string>();
  const gez = (n: { type?: string; children?: unknown[] } | null | undefined) => {
    if (!n || typeof n !== "object") return;
    if (n.type && !BILINEN_TURLER.has(n.type)) bulunan.add(n.type);
    (n.children ?? []).forEach((c) => gez(c as never));
  };
  gez((govde as { root?: never })?.root);
  return [...bulunan];
}
