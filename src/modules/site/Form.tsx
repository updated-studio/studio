import { createContext, useContext, useEffect, useState } from "react";
import * as api from "./api";
import type { Medya } from "./api";
import { DESTEKLI, duzenMi, icAlanMi, type Alan, type PanelSema } from "./sema";
import { bilinmeyenTurler } from "./editor/dugumler";
import MetinEditoru from "./editor/MetinEditoru";
import MedyaSecici from "./MedyaSecici";

// Genel form: panelin alan yapısından (sema.ts) çizilir. Değerler kimlik düzeyinde (depth=0) tutulur ve öyle gönderilir.
type Kayit = Record<string, unknown>;
export const SemaCtx = createContext<PanelSema | null>(null);

const etiket = (a: Alan) => a.label ?? a.name ?? "";
const ALT_SINIR = 125;

function Etiket({ a, children, sayac }: { a: Alan; children?: React.ReactNode; sayac?: string }) {
  return (
    <span className="site-alan-ust">
      {etiket(a)}{a.required && <b className="site-zorunlu"> *</b>}
      {sayac !== undefined && <span className="site-sayac"> {sayac.length}{a.maxLength ? ` / ${a.maxLength}` : ""}</span>}
      {a.admin?.kosullu && <span className="muted"> · yalnız belirli durumlarda kullanılır</span>}
      {children}
    </span>
  );
}
const Aciklama = ({ a }: { a: Alan }) => (a.admin?.description ? <span className="muted">{a.admin.description}</span> : null);

/** İlişki seçenekleri: hedef koleksiyonun başlık alanıyla */
function useSecenekler(rel?: string) {
  const sema = useContext(SemaCtx);
  const [liste, setListe] = useState<{ id: number; ad: string }[] | null>(null);
  useEffect(() => {
    if (!rel) return;
    const baslik = sema?.koleksiyonlar.find((c) => c.slug === rel)?.baslikAlani ?? "id";
    api.istekYap<{ docs: Kayit[] }>(`/${rel}?limit=500&depth=0&sort=${encodeURIComponent(baslik)}`)
      .then((r) => setListe(r.docs.map((d) => ({ id: d.id as number, ad: String(d[baslik] ?? d.name ?? d.title ?? `#${d.id}`) }))))
      .catch(() => setListe([]));
  }, [rel, sema]);
  return liste;
}

export function Iliski({ a, deger, set }: { a: Alan; deger: unknown; set: (v: unknown) => void }) {
  const rel = typeof a.relationTo === "string" ? a.relationTo : undefined;
  const liste = useSecenekler(rel);
  if (!rel) return <span className="muted">Birden çok türe bağlanan alan; panelde düzenlenir.</span>;
  if (!liste) return <span className="muted">Yükleniyor…</span>;
  const kimlik = (x: unknown) => (x && typeof x === "object" ? (x as { id: number }).id : (x as number));
  if (a.hasMany) {
    const secili = new Set(((deger as unknown[]) ?? []).map(kimlik));
    return (
      <div className="site-coklu">
        {liste.map((o) => (
          <label key={o.id} className="site-kutu"><input type="checkbox" disabled={a.admin?.readOnly} checked={secili.has(o.id)}
            onChange={(e) => { const s = new Set(secili); if (e.target.checked) s.add(o.id); else s.delete(o.id); set([...s]); }} /> {o.ad}</label>
        ))}
        {!liste.length && <span className="muted">Seçenek yok.</span>}
      </div>
    );
  }
  return (
    <select value={kimlik(deger) ?? ""} disabled={a.admin?.readOnly} onChange={(e) => set(e.target.value ? Number(e.target.value) : null)}>
      <option value="">Seç…</option>
      {liste.map((o) => <option key={o.id} value={o.id}>{o.ad}</option>)}
    </select>
  );
}

function Gorsel({ a, deger, set }: { a: Alan; deger: unknown; set: (v: unknown) => void }) {
  const id = deger && typeof deger === "object" ? (deger as { id: number }).id : (deger as number | null);
  const [m, setM] = useState<Medya | null>(null);
  const [ac, setAc] = useState(false);
  useEffect(() => { if (id) api.medyaGetir(id).then(setM).catch(() => setM(null)); else setM(null); }, [id]);
  return (
    <div className="site-kapak">
      {m ? <img src={api.medyaAdres(api.medyaKucuk(m))} alt={m.alt ?? ""} /> : <span className="muted">Görsel seçilmedi</span>}
      {!a.admin?.readOnly && (
        <div className="row">
          <button type="button" className="btn ghost sm" onClick={() => setAc(true)}>{m ? "Değiştir" : "Görsel seç"}</button>
          {m && <button type="button" className="btn ghost sm" onClick={() => set(null)}>Kaldır</button>}
        </div>
      )}
      {ac && <MedyaSecici altSinir={ALT_SINIR} kapat={() => setAc(false)} sec={(x) => { set(x.id); setM(x); setAc(false); }} />}
    </div>
  );
}

const yerel = (iso: unknown) => { if (!iso) return ""; const d = new Date(String(iso)); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function Dizi({ a, deger, set }: { a: Alan; deger: unknown; set: (v: unknown) => void }) {
  const satirlar = (deger as Kayit[]) ?? [];
  const yaz = (s: Kayit[]) => set(s);
  const tasi = (i: number, y: number) => { const s = [...satirlar]; const [x] = s.splice(i, 1); s.splice(i + y, 0, x); yaz(s); };
  return (
    <div className="site-dizi">
      {satirlar.map((r, i) => (
        <div key={(r.id as string) ?? i} className="site-dizi-satir">
          <div className="row site-dizi-ust">
            <b>{etiket(a)} {i + 1}</b><span style={{ flex: 1 }} />
            {!a.admin?.readOnly && <>
              <button type="button" className="btn ghost sm" disabled={i === 0} onClick={() => tasi(i, -1)} aria-label="Yukarı">↑</button>
              <button type="button" className="btn ghost sm" disabled={i === satirlar.length - 1} onClick={() => tasi(i, 1)} aria-label="Aşağı">↓</button>
              <button type="button" className="btn ghost sm" onClick={() => yaz(satirlar.filter((_, j) => j !== i))}>Sil</button>
            </>}
          </div>
          <Alanlar fs={a.fields ?? []} deger={r} set={(v) => yaz(satirlar.map((x, j) => (j === i ? v : x)))} />
        </div>
      ))}
      {!a.admin?.readOnly && (a.maxRows === undefined || satirlar.length < a.maxRows) &&
        <button type="button" className="btn ghost sm" onClick={() => yaz([...satirlar, {}])}>+ {etiket(a)} ekle</button>}
    </div>
  );
}

export function AlanGirdisi({ a, deger, set }: { a: Alan; deger: unknown; set: (v: unknown) => void }) {
  const ro = a.admin?.readOnly;
  if (!DESTEKLI.has(a.type)) return <div className="site-alan"><Etiket a={a} /><span className="muted">Bu alan türü ({a.type}) şimdilik panelde düzenlenir.</span></div>;
  switch (a.type) {
    case "text": case "email":
      if (a.hasMany) return <label className="site-alan"><Etiket a={a} /><input type="text" disabled={ro} value={((deger as string[]) ?? []).join(", ")} onChange={(e) => set(e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} /><span className="muted">Virgülle ayır.</span><Aciklama a={a} /></label>;
      return <label className="site-alan"><Etiket a={a} sayac={String(deger ?? "")} /><input type={a.type === "email" ? "email" : "text"} disabled={ro} value={String(deger ?? "")} onChange={(e) => set(e.target.value)} /><Aciklama a={a} /></label>;
    case "textarea":
      return <label className="site-alan"><Etiket a={a} sayac={String(deger ?? "")} /><textarea rows={3} disabled={ro} value={String(deger ?? "")} onChange={(e) => set(e.target.value)} /><Aciklama a={a} /></label>;
    case "number":
      return <label className="site-alan"><Etiket a={a} /><input type="number" className="site-sayi" disabled={ro} min={a.min} max={a.max} value={deger === null || deger === undefined ? "" : String(deger)} onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))} /><Aciklama a={a} /></label>;
    case "checkbox":
      return <label className="site-alan site-kutu"><input type="checkbox" disabled={ro} checked={!!deger} onChange={(e) => set(e.target.checked)} /> <span>{etiket(a)}<br /><Aciklama a={a} /></span></label>;
    case "select": case "radio":
      if (a.hasMany) {
        const s = new Set((deger as string[]) ?? []);
        return <div className="site-alan"><Etiket a={a} /><div className="site-coklu">{a.options?.map((o) => <label key={o.value} className="site-kutu"><input type="checkbox" disabled={ro} checked={s.has(o.value)} onChange={(e) => { const y = new Set(s); if (e.target.checked) y.add(o.value); else y.delete(o.value); set([...y]); }} /> {o.label}</label>)}</div><Aciklama a={a} /></div>;
      }
      return <label className="site-alan"><Etiket a={a} /><select disabled={ro} value={String(deger ?? "")} onChange={(e) => set(e.target.value || null)}><option value="">Seç…</option>{a.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select><Aciklama a={a} /></label>;
    case "date":
      return a.admin?.tarih === "dayOnly"
        ? <label className="site-alan"><Etiket a={a} /><input type="date" disabled={ro} value={deger ? String(deger).slice(0, 10) : ""} onChange={(e) => set(e.target.value ? new Date(e.target.value + "T12:00:00").toISOString() : null)} /><Aciklama a={a} /></label>
        : <label className="site-alan"><Etiket a={a} /><input type="datetime-local" disabled={ro} value={yerel(deger)} onChange={(e) => set(e.target.value ? new Date(e.target.value).toISOString() : null)} /><Aciklama a={a} /></label>;
    case "relationship":
      return <div className="site-alan"><Etiket a={a} /><Iliski a={a} deger={deger} set={set} /><Aciklama a={a} /></div>;
    case "upload":
      return <div className="site-alan"><Etiket a={a} /><Gorsel a={a} deger={deger} set={set} /><Aciklama a={a} /></div>;
    case "richText": {
      const bilinmeyen = bilinmeyenTurler(deger);
      return <div className="site-alan"><Etiket a={a} />{bilinmeyen.length
        ? <div className="msg err">Bu metinde Stüdyo editörünün tanımadığı öğe var ({bilinmeyen.join(", ")}); bozulmasın diye panelde düzenlenir.</div>
        : <MetinEditoru baslangic={deger} altSinir={ALT_SINIR} degisti={set} />}<Aciklama a={a} /></div>;
    }
    case "group":
      return <fieldset className="site-grup"><legend>{etiket(a)}</legend><Aciklama a={a} /><Alanlar fs={a.fields ?? []} deger={(deger as Kayit) ?? {}} set={set} /></fieldset>;
    case "array":
      return <div className="site-alan"><Etiket a={a} /><Aciklama a={a} /><Dizi a={a} deger={deger} set={set} /></div>;
    default:
      return null;
  }
}

/** Bir nesnenin alanları: düzen alanları (row, collapsible) üst nesneye yazar */
export function Alanlar({ fs, deger, set, haric }: { fs: Alan[]; deger: Kayit; set: (v: Kayit) => void; haric?: Set<string> }) {
  return (
    <>
      {fs.map((a, i) => {
        if (duzenMi(a)) {
          const ic = <Alanlar fs={a.fields ?? []} deger={deger} set={set} haric={haric} />;
          return a.type === "collapsible" ? <details key={i} className="site-grup" open={!a.admin?.kapali}><summary>{etiket(a)}</summary>{ic}</details> : <div key={i} className="site-satir-duzen">{ic}</div>;
        }
        if (!a.name || icAlanMi(a) || haric?.has(a.name)) return null;
        return <AlanGirdisi key={a.name} a={a} deger={deger[a.name]} set={(v) => set({ ...deger, [a.name!]: v })} />;
      })}
    </>
  );
}
