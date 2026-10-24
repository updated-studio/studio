// Site modülü metin editörü doğrulaması: verilen haber gövdelerini (JSON satırları) Stüdyo editörünün öğeleriyle açar,
// geri kaydeder ve panelin kaydıyla birebir karşılaştırır. Bir tane bile farklıysa editör yayına alınmaz.
// Kullanım: node --experimental-strip-types scripts/site-metin-dene.ts < govdeler.jsonl
import { createHeadlessEditor } from "@lexical/headless";
import { readFileSync } from "node:fs";
import { DUGUMLER, bilinmeyenTurler } from "../src/modules/site/editor/dugumler.ts";

if (!globalThis.crypto) (globalThis as { crypto?: unknown }).crypto = (await import("node:crypto")).webcrypto;

// Anahtar sırası önemsiz; değerler birebir. Tek istisna: eski kayıtta hiç yazılmamış paragraf textStyle/textFormat'ı Lexical 0.50
// (panelin kendi editörü de) "" / 0 olarak ekler; bu eksik alan aynı sayılır.
const varsayilanEkle = (x: unknown): unknown => Array.isArray(x) ? x.map(varsayilanEkle) : x && typeof x === "object" ? (() => { const o = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, varsayilanEkle(v)])) as Record<string, unknown>; if (o.type === "paragraph") { o.textStyle ??= ""; o.textFormat ??= 0; } return o; })() : x;
const sirala = (x: unknown): unknown => Array.isArray(x) ? x.map(sirala) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sirala((x as Record<string, unknown>)[k])])) : x;
function ilkFark(a: unknown, b: unknown, yol = ""): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const f = ilkFark((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${yol}.${k}`);
      if (f) return f;
    }
  }
  return `${yol}: panel=${JSON.stringify(a)?.slice(0, 120)} stüdyo=${JSON.stringify(b)?.slice(0, 120)}`;
}

let ayni = 0, farkli = 0, atlanan = 0;
for (const satir of readFileSync(0, "utf8").split("\n").filter(Boolean)) {
  const { id, body } = JSON.parse(satir);
  const bilinmeyen = bilinmeyenTurler(body);
  if (bilinmeyen.length) { atlanan++; console.log(`#${id} atlandı (bilinmeyen öğe: ${bilinmeyen.join(", ")}) — panelde düzenlenir`); continue; }
  const ed = createHeadlessEditor({ nodes: DUGUMLER, onError: (e) => { throw e; } });
  ed.setEditorState(ed.parseEditorState(body));
  const cikti = ed.getEditorState().toJSON();
  const f = ilkFark(sirala(varsayilanEkle(body)), sirala(cikti));
  if (f) { farkli++; if (farkli <= 10) console.log(`#${id} FARKLI ${f}`); } else ayni++;
}
console.log(`\naynı: ${ayni} · farklı: ${farkli} · atlanan: ${atlanan}`);
process.exit(farkli ? 1 : 0);
