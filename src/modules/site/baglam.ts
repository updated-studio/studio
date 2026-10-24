import { createContext } from "react";
import type { PanelSema } from "./sema";

/** Panelin alan yapısı (formlar ilişki başlıklarını buradan bulur) */
export const SemaCtx = createContext<PanelSema | null>(null);
/** Düzenlenen kaydın kimliği (ters ilişki listeleri bununla sorgular; yeni kayıtta null) */
export const KayitCtx = createContext<{ id: number | null }>({ id: null });
