import { lazy, type ComponentType } from "react";

// Modüller açıldıklarında yüklenir (25 Ekim 2026: ilk açılış 966 KB → 491 KB + o anki modül).
// Yeni sürüm yayınlanınca eski parça dosyaları kalkar; açık sekme eski parçayı isterse sayfa bir kez yenilenir.
const yukle = <T,>(f: () => Promise<T>) => () => f().catch((e) => {
  try { if (!sessionStorage.getItem("parca-yenilendi")) { sessionStorage.setItem("parca-yenilendi", "1"); location.reload(); } } catch { /* depolama kapalı */ }
  throw e;
});
const Ekip = lazy(yukle(() => import("./ekip/Ekip")));
const HaberMasasi = lazy(yukle(() => import("./haber-masasi/HaberMasasi")));
const Icerik = lazy(yukle(() => import("./icerik/Icerik")));
const Site = lazy(yukle(() => import("./site/Site")));
const PanelGiris = lazy(yukle(() => import("./site/PanelGiris")));
const YonetimSayfa = lazy(yukle(() => import("./ekip/Yonetim")));
const Profil = lazy(yukle(() => import("./hesap/Profil")));
const MarkaKiti = lazy(yukle(() => import("./marka-kiti/MarkaKiti")));
const Takvim = lazy(yukle(() => import("./takvim/Takvim")));
const SistemDurumu = lazy(yukle(() => import("./sistem/SistemDurumu")));
const Baglantilar = lazy(yukle(() => import("./sistem/Baglantilar")));
const Hareketler = lazy(yukle(() => import("./sistem/Hareketler")));

// Stüdyo'nun modül listesi. Yeni araç = buraya bir satır + src/modules/<ad>/ klasörü.
// (ARCHITECTURE.md, kural 1: ayrı araç açılmaz, modül eklenir.)
export type Modul = {
  id: string;          // adres: #/<id>
  ad: string;          // menüde görünen ad
  ikon: string;        // shared/Ikon.tsx içindeki ad
  bilesen: ComponentType;
  sadeceYonetici?: boolean;
  yer?: "dock" | "profil" | "gizli"; // nerede görünür: alttaki dock (varsayılan), sağ üstteki profil menüsü ya da hiçbir menüde (yalnız adresle)
  renk?: string;           // dock simgesinin rengi (index.css değişkeni adı, ör. "blue")
};

export const MODULLER: Modul[] = [
  { id: "ekip", ad: "Ekip", ikon: "ekip", bilesen: Ekip, renk: "blue" },
  { id: "haber-masasi", ad: "Haber Masası", ikon: "triyaj", bilesen: HaberMasasi, renk: "rose" },
  { id: "icerik", ad: "İçerik", ikon: "icerik", bilesen: Icerik, renk: "ok" },
  { id: "site", ad: "Site", ikon: "site", bilesen: Site, renk: "blue" },
  { id: "takvim", ad: "Takvim", ikon: "takvim", bilesen: Takvim, renk: "orange" },
  { id: "marka-kiti", ad: "Marka Kiti", ikon: "marka", bilesen: MarkaKiti, renk: "purple" },
  { id: "profil", ad: "Profilim", ikon: "profil", bilesen: Profil, yer: "profil" },
  { id: "panel-giris", ad: "Site paneli (yedek)", ikon: "site", bilesen: PanelGiris, yer: "gizli" },
  { id: "sistem", ad: "Sistem durumu", ikon: "yonetim", bilesen: SistemDurumu, yer: "profil", sadeceYonetici: true },
  { id: "baglantilar", ad: "Bağlantı anahtarları", ikon: "yonetim", bilesen: Baglantilar, yer: "profil", sadeceYonetici: true },
  { id: "hareketler", ad: "Hareket geçmişi", ikon: "saat", bilesen: Hareketler, yer: "profil", sadeceYonetici: true },
  { id: "yonetim", ad: "Yönetim", ikon: "yonetim", bilesen: YonetimSayfa, yer: "profil", sadeceYonetici: true },
];
