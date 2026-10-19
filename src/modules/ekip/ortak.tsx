import type { ReactNode } from "react";
import { Ikon } from "../../shared/Ikon";
import { kalan, kisa } from "../../shared/tarih";
import type { Is, Veri } from "../../shared/veri";

export const KATEGORILER: [string, string][] = [["kamera", "Kamera"], ["lens", "Lens"], ["telefon", "Telefon"], ["bilgisayar", "Bilgisayar"], ["drone", "Drone"], ["kurgu", "Kurgu"]];
export const TURLER = ["Ürün incelemesi", "Haber", "Reels", "Shorts", "YouTube videosu", "Video kurgu", "Story", "Post"];
export const KONUMLAR = ["İstanbul", "Şehir dışı", "Yurt dışı"];

// İş disiplini (migration 0020). Sıralama: gecikenler, sonra öncelik, sonra son gün.
export type Oncelik = NonNullable<Is["priority"]>;
export type Asama = NonNullable<Is["stage"]>;
export const ONCELIKLER: [Oncelik, string, string][] = [["acil", "Acil", "rose"], ["yuksek", "Yüksek", "wait"], ["normal", "Normal", "off"], ["dusuk", "Düşük", "off"]];
export const ASAMALAR: [Asama, string][] = [["alindi", "Alındı"], ["cekim", "Çekim"], ["kurgu", "Kurgu"], ["onay", "Onayda"], ["yayinda", "Yayında"]];
export const oncelikOf = (j: Is): Oncelik => j.priority ?? "normal";
export const asamaOf = (j: Is): Asama => (j.status === "bitti" ? "yayinda" : j.stage ?? "alindi");
export const asamaAd = (a: Asama) => ASAMALAR.find(([k]) => k === a)![1];
const ONCELIK_SIRA: Record<Oncelik, number> = { acil: 0, yuksek: 1, normal: 2, dusuk: 3 };
export const gecikti = (j: Is) => j.status !== "bitti" && kalan(j.due) < 0;
export const isSirala = (a: Is, b: Is) =>
  Number(gecikti(b)) - Number(gecikti(a)) || ONCELIK_SIRA[oncelikOf(a)] - ONCELIK_SIRA[oncelikOf(b)] || a.due.localeCompare(b.due);

export const adOf = (v: Veri, id: string | null) => v.profiles.find((p) => p.id === id)?.name ?? "Bilinmiyor";

export function bosGunler(v: Veri, uid: string, hafta: Date[], gunAd: string[], iso: (d: Date) => string) {
  return hafta.map((d, i) => (v.avail[uid]?.[iso(d)]?.s === "bos" ? gunAd[i] : null)).filter(Boolean).join(", ");
}

function SonGun({ is }: { is: Is }) {
  const k = kalan(is.due);
  if (is.status === "bitti") return <span className="due mono"><Ikon ad="saat" />Son gün {kisa(is.due)}</span>;
  if (k < 0) return <span className="pill is-gec"><Ikon ad="saat" />{-k} gün gecikti</span>;
  return <span className={"due mono " + (k <= 2 ? "soon" : "")}><Ikon ad="saat" />{k === 0 ? "Bugün teslim" : k === 1 ? "Yarın teslim" : `Son gün ${kisa(is.due)} · ${k} gün`}</span>;
}

export function AsamaCubugu({ is }: { is: Is }) {
  const a = asamaOf(is), n = ASAMALAR.findIndex(([k]) => k === a);
  return (
    <div className="is-asama" aria-label={`Aşama: ${asamaAd(a)}`}>
      {ASAMALAR.map(([k, l], i) => <span key={k} className={i < n ? "gecti" : i === n ? "simdi" : ""} title={l}><i />{i === n && <b>{l}</b>}</span>)}
    </div>
  );
}

export function IsKarti({ is, children, kisiler }: { is: Is; children: ReactNode; kisiler?: ReactNode }) {
  const o = oncelikOf(is); const oc = ONCELIKLER.find(([k]) => k === o)!;
  return (
    <div className={"kart is-kart" + (gecikti(is) ? " gec" : "") + (o === "acil" ? " acil" : "")}>
      <div className="ust">
        <div className="caticon"><Ikon ad={is.category} /></div>
        <div style={{ flex: 1, minWidth: 0 }}><div className="bname">{is.brand}</div><div className="muted">{is.type}</div></div>
        {o !== "normal" && <span className={"pill " + oc[2]}>{oc[1]}</span>}
      </div>
      <div className="baslik">{is.title}</div>
      {is.status !== "havuz" && <AsamaCubugu is={is} />}
      <div className="row">
        <SonGun is={is} />
        {is.embargo && <span className="pill blue">Ambargo {kisa(is.embargo)}</span>}
      </div>
      {kisiler}
      {is.stage_note && is.status === "atandi" && <div className="msg err" style={{ padding: "6px 10px" }}>Not: {is.stage_note}</div>}
      {is.brief && (
        <details className="is-brief"><summary>Brief</summary><p>{is.brief}</p></details>
      )}
      {is.link && <a className="linkbtn" href={is.link} target="_blank" rel="noreferrer">Teslim linkini aç ↗</a>}
      <div className="alt">{children}</div>
    </div>
  );
}
