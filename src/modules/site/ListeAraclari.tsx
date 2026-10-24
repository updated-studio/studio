import { useEffect, useState } from "react";
import { Iliski } from "./Form";
import { duzenMi, icAlanMi, type Alan } from "./sema";

// Liste araçları (panelin liste ekranındaki filtre, sıralama ve sütun seçimi): koşullar panelin "where" sorgusuna çevrilir.
// Seçimler kişinin kendi tarayıcısında, bölüm bölüm hatırlanır.
type Kayit = Record<string, unknown>;
export type Kosul = { yol: string; op: string; deger: unknown };
export type AracDurumu = { kosullar: Kosul[]; baglac: "and" | "or"; sirala: string; sutunlar: string[] };
export type AracAlan = { yol: string; ad: string; a: Alan };

const FILTRELI = new Set(["text", "textarea", "email", "number", "checkbox", "select", "radio", "date", "relationship", "upload"]);
const SIRALI = new Set(["text", "email", "number", "checkbox", "select", "radio", "date"]);
const BOS_DOLU: [string, string][] = [["dolu", "dolu"], ["bos", "boş"]];
const DEGERSIZ = new Set(["dolu", "bos", "evet", "hayir"]);

function oplar(a: Alan): [string, string][] {
  switch (a.type) {
    case "checkbox": return [["evet", "işaretli"], ["hayir", "işaretsiz"]];
    case "number": return [["equals", "eşittir"], ["not_equals", "eşit değil"], ["greater_than", "büyüktür"], ["less_than", "küçüktür"], ...BOS_DOLU];
    case "date": return [["greater_than", "sonra"], ["less_than", "önce"], ...BOS_DOLU];
    case "select": case "radio": case "relationship": return [["equals", "şu olan"], ["not_equals", "şu olmayan"], ...BOS_DOLU];
    case "upload": return BOS_DOLU;
    default: return [["like", "içerir"], ["equals", "tam olarak"], ["not_equals", "eşit değil"], ...BOS_DOLU];
  }
}

/** Filtrelenebilir / sütun olabilecek alanlar; grup ve sekme içindekiler "grup.alan" yoluyla */
export function aracAlanlari(fs: Alan[], onek = "", adOnek = ""): AracAlan[] {
  return fs.flatMap((a): AracAlan[] => {
    if (duzenMi(a)) return aracAlanlari(a.fields ?? [], onek, adOnek);
    if (a.type === "tabs") return (a.tabs ?? []).flatMap((t) => (t.name ? aracAlanlari(t.fields, `${onek}${t.name}.`, `${adOnek}${t.label} › `) : aracAlanlari(t.fields, onek, adOnek)));
    if (!a.name || icAlanMi(a)) return [];
    const ad = `${adOnek}${a.label ?? a.name}`;
    if (a.type === "group") return aracAlanlari(a.fields ?? [], `${onek}${a.name}.`, `${ad} › `);
    if (!FILTRELI.has(a.type) || (a.type === "relationship" && typeof a.relationTo !== "string")) return [];
    return [{ yol: onek + a.name, ad, a }];
  });
}

const kimlik = (x: unknown) => (x && typeof x === "object" ? (x as { id: unknown }).id : x);
const tamam = (k: Kosul) => DEGERSIZ.has(k.op) || (k.deger !== null && k.deger !== undefined && k.deger !== "" && !(Array.isArray(k.deger) && !k.deger.length));
export const gecerliSayisi = (d: AracDurumu) => d.kosullar.filter(tamam).length;
/** Sorguyu değiştiren kısım (sütun seçimi listeyi yeniden yüklemesin) */
export const sorguAnahtari = (d: AracDurumu) => JSON.stringify([d.kosullar.filter(tamam), d.baglac, d.sirala]);

/** Koşulları panel sorgusuna ekler (onek: "where[and][3]" gibi; koşullar o öğenin altında and/or grubu olur) */
export function kosullariEkle(p: URLSearchParams, onek: string, d: AracDurumu) {
  d.kosullar.filter(tamam).forEach((k, j) => {
    const yer = `${onek}[${d.baglac}][${j}][${k.yol}]`;
    if (k.op === "dolu" || k.op === "bos") p.set(`${yer}[exists]`, String(k.op === "dolu"));
    else if (k.op === "evet" || k.op === "hayir") p.set(`${yer}[${k.op === "evet" ? "equals" : "not_equals"}]`, "true");
    else if (Array.isArray(k.deger)) p.set(`${yer}[${k.op === "not_equals" ? "not_in" : "in"}]`, k.deger.map(kimlik).join(","));
    else p.set(`${yer}[${k.op}]`, String(kimlik(k.deger)));
  });
}

/** Listede gösterilecek değer */
export const goster = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "✓" : "—";
  if (Array.isArray(v)) return v.length ? (v.every((x) => typeof x === "object" && x) ? v.map(goster).join(", ") : `${v.length} öğe`) : "—";
  if (typeof v === "object") { const o = v as Kayit; return String(o.name ?? o.title ?? o.alt ?? o.filename ?? `#${o.id}`); }
  if (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v)) return new Date(v).toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return String(v);
};
/** Yoldaki değer; seçenekli alanda seçeneğin adı */
export function hucre(d: Kayit, aa: AracAlan | undefined, yol: string): string {
  const v = yol.split(".").reduce<unknown>((o, x) => (o && typeof o === "object" ? (o as Kayit)[x] : undefined), d);
  const sec = aa?.a.options;
  if (sec && v !== null && v !== undefined) return (Array.isArray(v) ? v : [v]).map((x) => sec.find((o) => o.value === x)?.label ?? String(x)).join(", ");
  return goster(v);
}

/** Bölümün araç durumu (tarayıcıda hatırlanır; artık olmayan alanlar atılır) */
export function useAraclar(slug: string, alanlar: AracAlan[], varsayilan: { sirala: string; sutunlar: string[] }) {
  const anahtar = `site-liste:${slug}`;
  const [d, setD] = useState<AracDurumu>(() => {
    const bos: AracDurumu = { kosullar: [], baglac: "and", ...varsayilan };
    try {
      const x = JSON.parse(localStorage.getItem(anahtar) ?? "null") as AracDurumu | null;
      if (!x) return bos;
      const var_ = new Set(alanlar.map((a) => a.yol));
      return { ...bos, ...x, kosullar: (x.kosullar ?? []).filter((k) => var_.has(k.yol)), sutunlar: (x.sutunlar ?? varsayilan.sutunlar).filter((s) => var_.has(s)) };
    } catch { return bos; }
  });
  useEffect(() => { try { localStorage.setItem(anahtar, JSON.stringify(d)); } catch { /* özel pencere */ } }, [anahtar, d]);
  return [d, setD] as const;
}

function DegerGirdisi({ aa, k, set }: { aa: AracAlan; k: Kosul; set: (v: unknown) => void }) {
  const a = aa.a;
  if (DEGERSIZ.has(k.op)) return null;
  switch (a.type) {
    case "number": return <input type="number" aria-label="Değer" value={k.deger === null || k.deger === undefined ? "" : String(k.deger)} onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))} />;
    case "date": return <input type="date" aria-label="Tarih" value={k.deger ? String(k.deger).slice(0, 10) : ""} onChange={(e) => set(e.target.value || null)} />;
    case "select": case "radio": return <select aria-label="Değer" value={String(k.deger ?? "")} onChange={(e) => set(e.target.value || null)}><option value="">Seç…</option>{a.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    case "relationship": return <Iliski a={{ ...a, hasMany: false, admin: {} }} deger={k.deger} set={set} />;
    default: return <input type="text" aria-label="Değer" value={String(k.deger ?? "")} onChange={(e) => set(e.target.value)} />;
  }
}

/** Filtre / sıralama / sütun çubuğu */
export default function ListeAraclari({ alanlar, d, setD, sutunlu = true, sabitSirala = [] }: {
  alanlar: AracAlan[]; d: AracDurumu; setD: (d: AracDurumu) => void; sutunlu?: boolean;
  /** Alan dışı sıralama seçenekleri (güncellenme, oluşturulma) */
  sabitSirala?: [string, string][];
}) {
  const [acik, setAcik] = useState<"" | "filtre" | "sutun">("");
  const n = gecerliSayisi(d);
  const bul = (yol: string) => alanlar.find((a) => a.yol === yol);
  const kosulYap = (i: number, y: Partial<Kosul>) => setD({ ...d, kosullar: d.kosullar.map((k, j) => (j === i ? { ...k, ...y } : k)) });
  const ekle = () => { const a = alanlar[0]; if (a) setD({ ...d, kosullar: [...d.kosullar, { yol: a.yol, op: oplar(a.a)[0][0], deger: null }] }); setAcik("filtre"); };
  const siraAlani = d.sirala.replace(/^-/, "");
  const azalan = d.sirala.startsWith("-");
  const siralar: [string, string][] = [...sabitSirala, ...alanlar.filter((a) => SIRALI.has(a.a.type) && !a.a.hasMany).map((a) => [a.yol, a.ad] as [string, string])];

  return (
    <div className="site-araclar">
      <div className="row">
        <button className={`btn ${n ? "" : "ghost"} sm`} aria-expanded={acik === "filtre"} onClick={() => (d.kosullar.length ? setAcik(acik === "filtre" ? "" : "filtre") : ekle())}>Filtre{n ? ` (${n})` : ""}</button>
        {n > 0 && <button className="btn ghost sm" onClick={() => setD({ ...d, kosullar: [] })}>Filtreyi temizle</button>}
        <span style={{ flex: 1 }} />
        <label className="site-sirala">Sırala
          <select value={siraAlani} onChange={(e) => setD({ ...d, sirala: (azalan ? "-" : "") + e.target.value })}>
            {siralar.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <button className="btn ghost sm" title={azalan ? "Büyükten küçüğe / yeniden eskiye" : "Küçükten büyüğe / eskiden yeniye"} onClick={() => setD({ ...d, sirala: (azalan ? "" : "-") + siraAlani })}>{azalan ? "↓ Azalan" : "↑ Artan"}</button>
        {sutunlu && <button className="btn ghost sm" aria-expanded={acik === "sutun"} onClick={() => setAcik(acik === "sutun" ? "" : "sutun")}>Sütunlar{d.sutunlar.length ? ` (${d.sutunlar.length})` : ""}</button>}
      </div>
      {acik === "filtre" && (
        <div className="site-filtre-kutu">
          {d.kosullar.length > 1 && (
            <label className="site-sirala">Koşullar
              <select value={d.baglac} onChange={(e) => setD({ ...d, baglac: e.target.value as "and" | "or" })}>
                <option value="and">hepsi uysun</option>
                <option value="or">herhangi biri uysun</option>
              </select>
            </label>
          )}
          {d.kosullar.map((k, i) => {
            const aa = bul(k.yol) ?? alanlar[0];
            return (
              <div key={i} className="site-kosul">
                <select aria-label="Alan" value={k.yol} onChange={(e) => { const y = bul(e.target.value)!; kosulYap(i, { yol: y.yol, op: oplar(y.a)[0][0], deger: null }); }}>
                  {alanlar.map((a) => <option key={a.yol} value={a.yol}>{a.ad}</option>)}
                </select>
                <select aria-label="Koşul" value={k.op} onChange={(e) => kosulYap(i, { op: e.target.value })}>
                  {oplar(aa.a).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <DegerGirdisi aa={aa} k={k} set={(v) => kosulYap(i, { deger: v })} />
                <button className="btn ghost sm" aria-label="Koşulu sil" onClick={() => setD({ ...d, kosullar: d.kosullar.filter((_, j) => j !== i) })}>×</button>
              </div>
            );
          })}
          <div className="row"><button className="btn ghost sm" onClick={ekle}>+ Koşul ekle</button></div>
        </div>
      )}
      {acik === "sutun" && sutunlu && (
        <div className="site-filtre-kutu site-sutunlar">
          {alanlar.filter((a) => a.a.type !== "textarea").map((a) => (
            <label key={a.yol} className="site-kutu"><input type="checkbox" checked={d.sutunlar.includes(a.yol)}
              onChange={(e) => setD({ ...d, sutunlar: e.target.checked ? [...d.sutunlar, a.yol] : d.sutunlar.filter((s) => s !== a.yol) })} /> {a.ad}</label>
          ))}
        </div>
      )}
    </div>
  );
}
