// Ortak ikon seti. Yeni ikon gerekirse buraya eklenir, modüller kendi ikonunu çizmez.
const P: Record<string, string> = {
  hafta: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M8 15l2 2 4-4",
  takvim: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  isler: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  kamera: "M3 8h4l2-3h6l2 3h4v11H3zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  ekip: "M8 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M17 11a3 3 0 100-6M16 15c3 0 6 2 6 5",
  yonetim: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  zil: "M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4",
  marka: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z",
  icerik: "M4 4h16v16H4zM4 15l4-4 4 4 3-3 5 5",
  triyaj: "M4 5h16M7 12h10M10 19h4",
  check: "M5 12l5 5 9-10",
  plus: "M12 5v14M5 12h14",
  cikis: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
};

export function Ikon({ ad }: { ad: string }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d={P[ad] ?? P.isler} />
    </svg>
  );
}
