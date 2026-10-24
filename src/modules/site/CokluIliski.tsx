import { useContext, useEffect, useState } from "react";
import * as api from "./api";
import { KayitCtx, SemaCtx } from "./baglam";
import type { Alan } from "./sema";

// Panelin iki ilişki türü: birden çok türe bağlanan ilişki (ana sayfa manşetleri: haber / inceleme / karşılaştırma)
// ve ters ilişki (join: "Bu ürünle ilgili haberler"; kaydedilmez, öteki kayıtlardan okunur).
type Kayit = Record<string, unknown>;
type Bag = { relationTo: string; value: number };

const kimlik = (v: unknown) => (v && typeof v === "object" ? (v as { id: number }).id : (v as number));
const bagla = (x: unknown, tekTur?: string): Bag | null => {
  if (tekTur) return x ? { relationTo: tekTur, value: kimlik(x) } : null;
  if (!x || typeof x !== "object") return null;
  const o = x as { relationTo?: string; value?: unknown };
  return o.relationTo && o.value ? { relationTo: o.relationTo, value: kimlik(o.value) } : null;
};

function useBaslik() {
  const sema = useContext(SemaCtx);
  const k = (rel: string) => sema?.koleksiyonlar.find((c) => c.slug === rel);
  return {
    alan: (rel: string) => k(rel)?.baslikAlani ?? "title",
    tur: (rel: string) => k(rel)?.tekil ?? rel,
    taslakli: (rel: string) => !!k(rel)?.taslak,
  };
}
const yaz = (d: Kayit, alan: string) => String(d[alan] ?? d.title ?? d.name ?? `#${d.id}`);

/** Sıralı ilişki seçimi + arayıp ekleme: birden çok türe bağlanan ilişki ({relationTo, value}) ve
 *  tek türlü çoklu ilişki (kimlik listesi; "en çok okunanlar" gibi sırası önemli, seçeneği çok alanlar) */
export function CokTurluIliski({ a, deger, set }: { a: Alan; deger: unknown; set: (v: unknown) => void }) {
  const tekTur = typeof a.relationTo === "string" ? a.relationTo : undefined;
  const turler = tekTur ? [tekTur] : ((a.relationTo as string[]) ?? []);
  const b = useBaslik();
  const secili: Bag[] = (a.hasMany ? ((deger as unknown[]) ?? []) : deger ? [deger] : []).map((x) => bagla(x, tekTur)).filter((x): x is Bag => !!x);
  const [adlar, setAdlar] = useState<Record<string, string>>({});
  const [tur, setTur] = useState(turler[0] ?? "");
  const [ara, setAra] = useState("");
  const [sonuc, setSonuc] = useState<Kayit[] | null>(null);
  const ro = a.admin?.readOnly;
  const dolu = a.hasMany ? a.maxRows !== undefined && secili.length >= a.maxRows : secili.length >= 1;
  const anahtar = (x: Bag) => `${x.relationTo}:${x.value}`;

  // Seçili kayıtların başlıkları (form kimlik düzeyinde tutar)
  const eksik = secili.filter((x) => !(anahtar(x) in adlar));
  const eksikAnahtar = eksik.map(anahtar).join(",");
  useEffect(() => {
    if (!eksik.length) return;
    const gruplar = new Map<string, number[]>();
    for (const x of eksik) gruplar.set(x.relationTo, [...(gruplar.get(x.relationTo) ?? []), x.value]);
    Promise.all([...gruplar].map(([rel, idler]) =>
      api.istekYap<{ docs: Kayit[] }>(`/${rel}?where[id][in]=${idler.join(",")}&depth=0&limit=${idler.length}${b.taslakli(rel) ? "&draft=true" : ""}`)
        .then((r) => [rel, idler, r.docs] as const).catch(() => [rel, idler, [] as Kayit[]] as const)))
      .then((sonuclar) => setAdlar((o) => {
        const y = { ...o };
        for (const [rel, idler, docs] of sonuclar) for (const id of idler) { const d = docs.find((x) => x.id === id); y[`${rel}:${id}`] = d ? yaz(d, b.alan(rel)) : `#${id} (silinmiş)`; }
        return y;
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eksikAnahtar]);

  useEffect(() => {
    if (ro || dolu || !tur) { setSonuc(null); return; }
    const t = setTimeout(() => {
      const p = new URLSearchParams({ limit: "8", depth: "0", sort: "-updatedAt" });
      if (b.taslakli(tur)) p.set("draft", "true");
      if (ara.trim()) p.set(`where[${b.alan(tur)}][like]`, ara.trim());
      api.istekYap<{ docs: Kayit[] }>(`/${tur}?${p}`).then((r) => setSonuc(r.docs)).catch(() => setSonuc([]));
    }, ara ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tur, ara, ro, dolu]);

  const yazDeger = (s: Bag[]) => { const v = tekTur ? s.map((x) => x.value) : s; set(a.hasMany ? v : v[0] ?? null); };
  const tasi = (i: number, y: number) => { const s = [...secili]; const [x] = s.splice(i, 1); s.splice(i + y, 0, x); yazDeger(s); };
  const ekle = (d: Kayit) => {
    const x = { relationTo: tur, value: d.id as number };
    setAdlar((o) => ({ ...o, [anahtar(x)]: yaz(d, b.alan(tur)) }));
    yazDeger(a.hasMany ? [...secili, x] : [x]);
  };

  return (
    <div className="site-coklu-iliski">
      {secili.length > 0 ? (
        <ol className="site-secili-liste">
          {secili.map((x, i) => (
            <li key={anahtar(x)}>
              {!tekTur && <span className="site-durum">{b.tur(x.relationTo)}</span>}
              <span className="ana">{adlar[anahtar(x)] ?? "…"}</span>
              {!ro && <>
                {a.hasMany && <button type="button" className="btn ghost sm" disabled={i === 0} onClick={() => tasi(i, -1)} aria-label="Yukarı">↑</button>}
                {a.hasMany && <button type="button" className="btn ghost sm" disabled={i === secili.length - 1} onClick={() => tasi(i, 1)} aria-label="Aşağı">↓</button>}
                <button type="button" className="btn ghost sm" onClick={() => yazDeger(secili.filter((_, j) => j !== i))} aria-label="Çıkar">×</button>
              </>}
            </li>
          ))}
        </ol>
      ) : <span className="muted">Seçilmedi.</span>}
      {!ro && !dolu && (
        <div className="site-iliski-ekle">
          <div className="row">
            {!tekTur && <select aria-label="Tür" value={tur} onChange={(e) => { setTur(e.target.value); setAra(""); }}>
              {turler.map((t) => <option key={t} value={t}>{b.tur(t)}</option>)}
            </select>}
            <input type="text" aria-label="Ara" placeholder="Başlıkta ara…" value={ara} onChange={(e) => setAra(e.target.value)} />
          </div>
          {sonuc && (
            <div className="site-iliski-sonuc">
              {sonuc.filter((d) => !secili.some((x) => x.relationTo === tur && x.value === d.id)).map((d) => (
                <button type="button" key={d.id as number} className="linkbtn" onClick={() => ekle(d)}>+ {yaz(d, b.alan(tur))}</button>
              ))}
              {!sonuc.length && <span className="muted">Sonuç yok.</span>}
            </div>
          )}
        </div>
      )}
      {a.hasMany && a.maxRows !== undefined && <span className="muted">{secili.length} / {a.maxRows}</span>}
    </div>
  );
}

/** Ters ilişki: bu kayda bağlanan öteki kayıtlar (salt okunur) */
export function TersIliski({ a }: { a: Alan }) {
  const { id } = useContext(KayitCtx);
  const b = useBaslik();
  const [r, setR] = useState<{ docs: Kayit[]; totalDocs: number } | null>(null);
  const rel = a.collection ?? "";
  useEffect(() => {
    if (!id || !rel || !a.on) return;
    api.istekYap<{ docs: Kayit[]; totalDocs: number }>(`/${rel}?where[${a.on}][equals]=${id}&depth=0&limit=10&sort=-updatedAt${b.taslakli(rel) ? "&draft=true" : ""}`)
      .then(setR).catch(() => setR({ docs: [], totalDocs: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, rel, a.on]);
  if (!id) return <span className="muted">Kayıt oluşturulunca burada görünür.</span>;
  if (!r) return <span className="muted">Yükleniyor…</span>;
  if (!r.docs.length) return <span className="muted">Henüz yok. ({b.tur(rel)} düzenlenirken bu kayıt seçilince burada görünür.)</span>;
  return (
    <div className="site-ters-iliski">
      <ul className="site-secili-liste">
        {r.docs.map((d) => (
          <li key={d.id as number}>
            <span className="ana">{yaz(d, b.alan(rel))}</span>
            {b.taslakli(rel) && <span className={`site-durum site-durum--${d._status === "published" ? "yayinda" : "taslak"}`}>{d._status === "published" ? api.DURUMLAR.yayinda : api.DURUMLAR.taslak}</span>}
          </li>
        ))}
      </ul>
      {r.totalDocs > r.docs.length && <span className="muted">… ve {r.totalDocs - r.docs.length} tane daha (toplam {r.totalDocs}).</span>}
    </div>
  );
}
