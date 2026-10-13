import type { ReactNode } from "react";
import { Avatar } from "../../shared/Avatar";
import { useVeri } from "../../shared/veri";
import { degerlendir, HABER_TURLERI, EK, SEVIYELER, OY_ETKISI, OY_SINIRI, ART_ARDA_EN_FAZLA, ONCELIK_SURUMU, type Degerlendirme } from "./oncelik";
import { useMasa, type Haber, type Oy } from "./veri";

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

/** Türkiye'de satılmayan ("Hariç") markalar, küçük harfle */
export function useHaric() {
  const { v } = useMasa();
  return new Set(v.markalar.filter((m) => m.grp === "Hariç").map((m) => m.name.toLocaleLowerCase("tr")));
}

export function Seviye({ d }: { d: Degerlendirme }) {
  return <span className={"pill " + d.seviye.sinif} title={"Öncelik puanı " + d.puan}>{d.seviye.ad}</span>;
}

/** "Öncelik nasıl hesaplanır?" — oncelik.ts'teki kurallardan üretilir, kural değişince kendiliğinden güncellenir. */
export function OncelikBilgisi() {
  return (
    <details className="puanbilgi">
      <summary>Öncelik nasıl hesaplanır?</summary>
      <div className="muted">Puan markadan bağımsızdır: Apple ile Sony aynı türde haberde aynı yerden başlar.</div>
      <div className="liste">
        <div className="satir"><div className="ana"><b>Haber türü</b> (temel puan)<div className="muted">{HABER_TURLERI.map((t) => `${t.ad} ${t.puan}`).join(" · ")}</div></div></div>
        <div className="satir"><div className="ana"><b>Aynı haberi yazan her ek kaynak</b><div className="muted">+{EK.kaynakBasina}, en fazla +{EK.kaynakEnFazla}</div></div></div>
        <div className="satir"><div className="ana"><b>Tazelik</b><div className="muted">{EK.taze.map(([s, p]) => `${s} saatten yeni +${p}`).join(" · ")}</div></div></div>
        <div className="satir"><div className="ana"><b>Yapay zekânın önem görüşü</b><div className="muted">-{2 * EK.yapayZeka} ile +{2 * EK.yapayZeka} arası</div></div></div>
        <div className="satir"><div className="ana"><b>Türkiye'de satılmayan marka</b> (Ayarlar'da "Hariç")<div className="muted">{EK.haricMarka}</div></div></div>
        <div className="satir"><div className="ana"><b>Seviye</b><div className="muted">{SEVIYELER.map((s) => `${s.ad}: ${s.enAz}+`).join(" · ")}</div></div></div>
        <div className="satir"><div className="ana"><b>"Bunun gibi daha çok / az"</b><div className="muted">Sadece aynı markanın kendi haberleri arasında sırayı değiştirir (aynı tür için oy başına ±{OY_ETKISI}, en fazla ±{OY_SINIRI}). Markayı diğer markaların önüne ya da arkasına atmaz.</div></div></div>
        <div className="satir"><div className="ana"><b>Çeşitlilik</b><div className="muted">Havuzda aynı markadan art arda en fazla {ART_ARDA_EN_FAZLA} haber gelir.</div></div></div>
      </div>
      <div className="muted">Kurallar son güncelleme: {ONCELIK_SURUMU}.</div>
    </details>
  );
}

export function oySkor(oylar: Oy[], id: number) {
  const o = oylar.filter((x) => x.item_id === id);
  return { toplam: o.reduce((t, x) => t + x.value, 0), sayi: o.length };
}

/** Tek haber kartı. Eylemler dışarıdan verilir. */
export function HaberKart({ h, oylar, children, ust, d }: { h: Haber; oylar: Oy[]; children?: ReactNode; ust?: ReactNode; d?: Degerlendirme }) {
  const kisi = useKisi();
  const onerilen = kisi(h.suggested_editor);
  const alan = kisi(h.taken_by);
  const skor = oySkor(oylar, h.id);
  const haric = useHaric();
  const deg = d ?? degerlendir(h, haric);
  // Aynı kaynağı iki kez ya da haberin kendi kaynağını "diğer" olarak gösterme
  const digerleri = h.other_sources.filter((o, i, a) => o.name !== h.source_name && a.findIndex((x) => x.name === o.name) === i);
  return (
    <div className="kart haber">
      <div className="row" style={{ gap: 6 }}>
        <Seviye d={deg} />
        {h.kind && <span className={"pill " + (h.kind === "Sızıntı" || h.kind === "Söylenti" ? "purple" : "off")}>{h.kind}</span>}
        {h.brand && <span className="pill blue">{h.brand}</span>}
        {h.topic && <span className="muted">{h.topic}</span>}
        {skor.sayi > 0 && <span className="muted" title="Ekip oyu">{skor.toplam > 0 ? "+" : ""}{skor.toplam} oy</span>}
        <span className="muted" style={{ marginLeft: "auto" }}>{zamanOnce(h.published_at || h.created_at)}</span>
      </div>
      {ust}
      <div className="baslik">{h.event || h.title}</div>
      <div className="gerekce">{deg.gerekce.join(" · ")}</div>
      <a className="muted orj" href={h.link} target="_blank" rel="noreferrer">{h.source_name}: {h.title}</a>
      {digerleri.length > 0 && (
        <div className="muted">Diğer kaynaklar: {digerleri.map((o, i) => <a key={i} href={o.link} target="_blank" rel="noreferrer">{o.name}</a>).reduce<ReactNode[]>((a, x, i) => (i ? [...a, ", ", x] : [x]), [])}</div>
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
