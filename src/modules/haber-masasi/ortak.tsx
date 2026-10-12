import type { ReactNode } from "react";
import { Avatar } from "../../shared/Avatar";
import { useVeri } from "../../shared/veri";
import type { Haber, Oy } from "./veri";

export const KONUMLAR_ETIKET: Record<string, string> = { aday: "Havuz", belirsiz: "Belirsiz", elendi: "Elendi", alindi: "Alındı", pas: "Pas", yayinda: "Yayında" };

export function zamanOnce(t: string | null): string {
  if (!t) return "";
  const dk = Math.round((Date.now() - Date.parse(t)) / 60000);
  if (dk < 1) return "şimdi";
  if (dk < 60) return dk + " dk";
  const s = Math.round(dk / 60);
  if (s < 24) return s + " sa";
  return Math.round(s / 24) + " gün";
}

export function useKisi() {
  const { veri } = useVeri();
  return (id: string | null) => veri.profiles.find((p) => p.id === id);
}

export function Oncelik({ p }: { p: number }) {
  const sinif = p >= 5 ? "rose" : p === 4 ? "wait" : p === 3 ? "blue" : "off";
  return <span className={"pill " + sinif} title={"Öncelik " + p}>{p ? "P" + p : "—"}</span>;
}

export function oySkor(oylar: Oy[], id: number) {
  const o = oylar.filter((x) => x.item_id === id);
  return { toplam: o.reduce((t, x) => t + x.value, 0), sayi: o.length };
}

/** Tek haber kartı. Eylemler dışarıdan verilir. */
export function HaberKart({ h, oylar, children, ust }: { h: Haber; oylar: Oy[]; children?: ReactNode; ust?: ReactNode }) {
  const kisi = useKisi();
  const onerilen = kisi(h.suggested_editor);
  const alan = kisi(h.taken_by);
  const skor = oySkor(oylar, h.id);
  return (
    <div className="kart haber">
      <div className="row" style={{ gap: 6 }}>
        <Oncelik p={h.priority} />
        {h.kind && <span className={"pill " + (h.kind === "Sızıntı" || h.kind === "Söylenti" ? "purple" : "off")}>{h.kind}</span>}
        {h.brand && <span className="pill blue">{h.brand}</span>}
        {h.topic && <span className="muted">{h.topic}</span>}
        {skor.sayi > 0 && <span className="muted" title="Ekip oyu">{skor.toplam > 0 ? "▲" : skor.toplam < 0 ? "▼" : "•"} {skor.toplam}</span>}
        <span className="muted" style={{ marginLeft: "auto" }}>{zamanOnce(h.published_at || h.created_at)}</span>
      </div>
      {ust}
      <div className="baslik">{h.event || h.title}</div>
      <a className="muted orj" href={h.link} target="_blank" rel="noreferrer">{h.source_name}: {h.title}</a>
      {h.other_sources.length > 0 && (
        <div className="muted">Diğer kaynaklar: {h.other_sources.map((o, i) => <a key={i} href={o.link} target="_blank" rel="noreferrer">{o.name}</a>).reduce<ReactNode[]>((a, x, i) => (i ? [...a, ", ", x] : [x]), [])}</div>
      )}
      {h.reason && h.status !== "aday" && <div className="muted">Neden: {h.reason}</div>}
      {(onerilen || alan) && (
        <div className="row muted" style={{ gap: 6 }}>
          {alan ? <><Avatar kisi={alan} boyut={20} /> {alan.name} aldı</> : onerilen ? <><Avatar kisi={onerilen} boyut={20} /> Önerilen: {onerilen.name}</> : null}
        </div>
      )}
      {children && <div className="alt">{children}</div>}
    </div>
  );
}
