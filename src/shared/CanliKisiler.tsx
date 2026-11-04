import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "./Avatar";
import { bolumAdi, useCanli } from "./canli";

// Üst çubukta şu an Stüdyo'da olanlar (4 Kasım 2026, canlı durum). Basınca kim nerede, hangi haberi açık tutuyor listesi açılır;
// bir satıra basınca o kişinin olduğu yere gidilir.
export default function CanliKisiler() {
  const { kisiler, ben } = useCanli();
  const [acik, setAcik] = useState(false);
  const kok = useRef<HTMLDivElement>(null);
  const git = useNavigate();
  useEffect(() => {
    if (!acik) return;
    const kapat = (e: MouseEvent) => { if (!kok.current?.contains(e.target as Node)) setAcik(false); };
    document.addEventListener("mousedown", kapat);
    return () => document.removeEventListener("mousedown", kapat);
  }, [acik]);
  const digerleri = kisiler.filter((k) => k.id !== ben);
  if (!kisiler.length) return null;
  return (
    <div className="canli" ref={kok}>
      <button type="button" className="canli-dugme" aria-expanded={acik} aria-label={`Şu an Stüdyo'da ${kisiler.length} kişi`} onClick={() => setAcik((x) => !x)}>
        {digerleri.slice(0, 3).map((k) => <span key={k.id} className="canli-yuz"><Avatar kisi={{ name: k.ad, email: k.email, avatar_url: k.foto, emoji: null }} boyut={28} /></span>)}
        <span className="canli-sayi"><i aria-hidden="true" />{digerleri.length ? `${digerleri.length} kişi` : "Yalnız sen"}</span>
      </button>
      {acik && (
        <div className="canli-liste" role="dialog" aria-label="Şu an Stüdyo'da">
          <b>Şu an Stüdyo'da</b>
          {kisiler.map((k) => (
            <button key={k.id} type="button" className="canli-satir" onClick={() => { setAcik(false); git(k.yol); }}>
              <Avatar kisi={{ name: k.ad, email: k.email, avatar_url: k.foto, emoji: null }} boyut={32} />
              <span><b>{k.ad}{k.id === ben ? " (sen)" : ""}</b>
                <span className="muted">{k.nesne ? `${k.nesne.eylem}: ${k.nesne.baslik || "başlıksız"}` : bolumAdi(k.yol)}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bir satırın yanında: bu haberi/taslağı şu an açık tutanlar */
export function AcikTutan({ kisiler }: { kisiler: { id: string; ad: string; nesne: { eylem: string } | null }[] }) {
  if (!kisiler.length) return null;
  return <span className="canli-rozet" title={kisiler.map((k) => `${k.ad} ${k.nesne?.eylem ?? "açık"}`).join(", ")}><i aria-hidden="true" />{kisiler[0].ad.split(" ")[0]}{kisiler.length > 1 ? ` +${kisiler.length - 1}` : ""} {kisiler[0].nesne?.eylem ?? "açık"}</span>;
}
