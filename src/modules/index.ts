import type { ComponentType } from "react";
import Ekip from "./ekip/Ekip";
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
};

export const MODULLER: Modul[] = [
  { id: "ekip", ad: "Ekip", ikon: "ekip", bilesen: Ekip },
  { id: "takvim", ad: "Takvim", ikon: "takvim", bilesen: Takvim },
  { id: "marka-kiti", ad: "Marka Kiti", ikon: "marka", bilesen: MarkaKiti },
];
