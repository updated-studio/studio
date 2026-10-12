import type { ComponentType } from "react";
import Ekip from "./ekip/Ekip";
import YonetimSayfa from "./ekip/Yonetim";
import Profil from "./hesap/Profil";
import MarkaKiti from "./marka-kiti/MarkaKiti";
import Takvim from "./takvim/Takvim";

// Stüdyo'nun modül listesi. Yeni araç = buraya bir satır + src/modules/<ad>/ klasörü.
// (ARCHITECTURE.md, kural 1: ayrı araç açılmaz, modül eklenir.)
export type Modul = {
  id: string;          // adres: #/<id>
  ad: string;          // menüde görünen ad
  ikon: string;        // shared/Ikon.tsx içindeki ad
  bilesen: ComponentType;
  sadeceYonetici?: boolean;
  yer?: "dock" | "profil"; // nerede görünür: alttaki dock (varsayılan) veya sağ üstteki profil menüsü
  renk?: string;           // dock simgesinin rengi (index.css değişkeni adı, ör. "blue")
};

export const MODULLER: Modul[] = [
  { id: "ekip", ad: "Ekip", ikon: "ekip", bilesen: Ekip, renk: "blue" },
  { id: "takvim", ad: "Takvim", ikon: "takvim", bilesen: Takvim, renk: "orange" },
  { id: "marka-kiti", ad: "Marka Kiti", ikon: "marka", bilesen: MarkaKiti, renk: "purple" },
  { id: "profil", ad: "Profilim", ikon: "profil", bilesen: Profil, yer: "profil" },
  { id: "yonetim", ad: "Yönetim", ikon: "yonetim", bilesen: YonetimSayfa, yer: "profil", sadeceYonetici: true },
];
