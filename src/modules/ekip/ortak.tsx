import type { ReactNode } from "react";
import { Ikon } from "../../shared/Ikon";
import { kalan, kisa } from "../../shared/tarih";
import type { Is, Veri } from "../../shared/veri";

export const KATEGORILER: [string, string][] = [["kamera", "Kamera"], ["lens", "Lens"], ["telefon", "Telefon"], ["bilgisayar", "Bilgisayar"], ["drone", "Drone"], ["kurgu", "Kurgu"]];
export const TURLER = ["Ürün incelemesi", "Haber", "Reels", "Shorts", "YouTube videosu", "Video kurgu", "Story", "Post"];
export const KONUMLAR = ["İstanbul", "Şehir dışı", "Yurt dışı"];

export const adOf = (v: Veri, id: string | null) => v.profiles.find((p) => p.id === id)?.name ?? "Bilinmiyor";

export function bosGunler(v: Veri, uid: string, hafta: Date[], gunAd: string[], iso: (d: Date) => string) {
  return hafta.map((d, i) => (v.avail[uid]?.[iso(d)]?.s === "bos" ? gunAd[i] : null)).filter(Boolean).join(", ");
}

export function IsKarti({ is, children }: { is: Is; children: ReactNode }) {
  return (
    <div className="kart">
      <div className="ust">
        <div className="caticon"><Ikon ad={is.category} /></div>
        <div><div className="bname">{is.brand}</div><div className="muted">{is.type}</div></div>
      </div>
      <div className="baslik">{is.title}</div>
      <div className="row">
        <span className={"due mono " + (kalan(is.due) <= 3 && is.status !== "bitti" ? "soon" : "")}><Ikon ad="saat" />Son gün {kisa(is.due)}</span>
        {is.embargo && <span className="pill blue">Ambargo {kisa(is.embargo)}</span>}
      </div>
      <div className="alt">{children}</div>
    </div>
  );
}
