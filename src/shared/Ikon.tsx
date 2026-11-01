// Ortak ikon seti (marka kiti §8 İkon, 1.4): 24 px tuval, çizgi 2 px, düz uç, dolgu yok, tek renk.
// Yeni ikon gerekirse buraya eklenir, modüller kendi ikonunu çizmez. Sitedeki karşılığı apps/web/src/lib/ui.ts (aynı çizimler).
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
  site: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
  okuma: "M3 5h6a3 3 0 013 3v12a2 2 0 00-2-2H3zM21 5h-6a3 3 0 00-3 3v12a2 2 0 012-2h7z",
  guncel: "M20 12a8 8 0 11-2.34-5.66M20 4v5h-5",
  ara: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
  // Editör görünümü (1 Kasım 2026)
  bugun: "M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z",
  yaz: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  taslak: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  masa: "M4 13l3-8h10l3 8v6H4zM4 13h5l1 2h4l1-2h5",
  liste: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  yardim: "M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 113.5 2.3c-.7.4-1 1-1 1.7M12 17h.01",
  gonder: "M4 12l16-8-6 16-2-7z",
  uyari: "M12 4l9 16H3zM12 10v4M12 17h.01",
  ileri: "M9 5l7 7-7 7",
  geri: "M15 5l-7 7 7 7",
};
export const IKONLAR = P;

export function Ikon({ ad }: { ad: string }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d={P[ad] ?? P.isler} />
    </svg>
  );
}
