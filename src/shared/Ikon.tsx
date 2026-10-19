// Ortak ikon seti. Yeni ikon gerekirse buraya eklenir, modüller kendi ikonunu çizmez.
const P: Record<string, string> = {
  hafta: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M8 15l2 2 4-4",
  takvim: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  isler: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  kamera: "M3 8h4l2-3h6l2 3h4v11H3zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  ekip: "M8 11a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5M17 11a3 3 0 100-6M16 15c3 0 6 2 6 5",
  yonetim: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  profil: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  foto: "M3 7h4l2-3h6l2 3h4v13H3zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z",
  zil: "M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4",
  marka: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z",
  icerik: "M4 4h16v16H4zM4 15l4-4 4 4 3-3 5 5",
  triyaj: "M4 5h16M7 12h10M10 19h4",
  check: "M5 12l5 5 9-10",
  plus: "M12 5v14M5 12h14",
  lens: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8z",
  telefon: "M7 3h10v18H7zM11 18h2",
  bilgisayar: "M4 5h16v11H4zM2 20h20",
  drone: "M4 6h5M15 6h5M6.5 6v3l3.5 2h4l3.5-2V6M10 13v4h4v-4",
  kurgu: "M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4",
  pin: "M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z",
  saat: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  sil: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13",
  cikis: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  sohbet: "M4 5h16v11H9l-5 4z",
};

export function Ikon({ ad }: { ad: string }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d={P[ad] ?? P.isler} />
    </svg>
  );
}
