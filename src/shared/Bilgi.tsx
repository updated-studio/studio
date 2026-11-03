import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// Bilgi balonu (3 Kasım 2026, kullanıcı: "yuvarlak içinde i ikonuyla info baloncuğu"): düğmeye basınca ya da odaklanınca açılır,
// dışarı tıklayınca ya da Esc ile kapanır. Kısa açıklamalar için; uzun metin ekranın kendisine yazılır.
export default function Bilgi({ baslik, children }: { baslik: string; children: ReactNode }) {
  const [acik, setAcik] = useState(false);
  const id = useId(), kok = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!acik) return;
    const kapat = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !kok.current?.contains(e.target as Node)) setAcik(false); };
    document.addEventListener("mousedown", kapat); document.addEventListener("keydown", kapat);
    return () => { document.removeEventListener("mousedown", kapat); document.removeEventListener("keydown", kapat); };
  }, [acik]);
  return (
    <span ref={kok} className="bilgi">
      <button type="button" className="bilgi-dugme" aria-label={baslik} aria-expanded={acik} aria-controls={id} onClick={() => setAcik((x) => !x)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 10.5v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="7.5" r="1.1" fill="currentColor" /></svg>
      </button>
      {acik && <span id={id} role="note" className="bilgi-balon"><b>{baslik}</b>{children}</span>}
    </span>
  );
}
