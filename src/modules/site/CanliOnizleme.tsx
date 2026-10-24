import { useEffect, useRef, useState } from "react";
import { SITE } from "./api";

// Canlı önizleme (panelin "Live Preview"i): sitenin taslak önizleme sayfası düzenleme ekranının yanında açılır.
// Her kayıttan (otomatik kayıt dahil) sonra sayfaya "yeniden çiz" sinyali gider; sayfa yeniden yüklenmeden taslağı okur
// (site deposu apps/web/src/scripts/preview.ts; sayfa yalnız Stüdyo'nun içinde açılabilir, postbuild.mjs).
const GENISLIK = { masaustu: "100%", telefon: "390px" } as const;

/** Kişi açık bıraktıysa sonraki düzenlemede de açık gelir (yalnız bu tarayıcıda) */
export function useCanliAcik() {
  const [acik, setAcik] = useState(() => { try { return localStorage.getItem("site-canli") === "1"; } catch { return false; } });
  const degis = (x: boolean) => { setAcik(x); try { localStorage.setItem("site-canli", x ? "1" : "0"); } catch { /* özel pencere */ } };
  return [acik, degis] as const;
}

export default function CanliOnizleme({ adres, surum, kapat }: {
  /** Önizleme adresi (null: alınıyor) */
  adres: string | null;
  /** Kaydedilmiş hâlin işareti (updatedAt): değişince sayfa yeniden çizilir */
  surum: string | undefined;
  kapat: () => void;
}) {
  const cerceve = useRef<HTMLIFrameElement>(null);
  const [boy, setBoy] = useState<keyof typeof GENISLIK>(() => { try { return localStorage.getItem("site-canli-boy") === "telefon" ? "telefon" : "masaustu"; } catch { return "masaustu"; } });
  const boyYap = (x: keyof typeof GENISLIK) => { setBoy(x); try { localStorage.setItem("site-canli-boy", x); } catch { /* özel pencere */ } };
  const ilk = useRef(true);
  useEffect(() => {
    if (ilk.current) { ilk.current = false; return; } // ilk yüklemede sayfa zaten son hâli okur
    cerceve.current?.contentWindow?.postMessage({ updated: "yenile" }, SITE);
  }, [surum]);

  return (
    <aside className="site-canli" aria-label="Canlı önizleme">
      <div className="row site-canli-ust">
        <b>Canlı önizleme</b>
        <span className="muted">Her kayıtta yenilenir</span>
        <span style={{ flex: 1 }} />
        <div className="segment" role="group" aria-label="Ekran">
          <button aria-pressed={boy === "masaustu"} onClick={() => boyYap("masaustu")}>Masaüstü</button>
          <button aria-pressed={boy === "telefon"} onClick={() => boyYap("telefon")}>Telefon</button>
        </div>
        {adres && <a className="btn ghost sm" href={adres} target="_blank" rel="noreferrer">Yeni sekmede ↗</a>}
        <button className="btn ghost sm" aria-label="Önizlemeyi kapat" onClick={kapat}>×</button>
      </div>
      <div className="site-canli-sahne">
        {adres
          ? <iframe ref={cerceve} src={adres} title="Canlı önizleme" style={{ width: GENISLIK[boy] }} />
          : <div className="muted">Önizleme hazırlanıyor…</div>}
      </div>
    </aside>
  );
}
