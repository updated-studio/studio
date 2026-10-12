import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const Ctx = createContext<(t: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [metin, setMetin] = useState("");
  const zaman = useRef<number | undefined>(undefined);
  const goster = useCallback((t: string) => {
    setMetin(t);
    window.clearTimeout(zaman.current);
    zaman.current = window.setTimeout(() => setMetin(""), 3200);
  }, []);
  return (
    <Ctx.Provider value={goster}>
      {children}
      {metin && <div className="toast" role="status">{metin}</div>}
    </Ctx.Provider>
  );
}

/** Supabase hatasını kullanıcıya gösterilecek metne çevirir. */
export function hataMetni(e: { message?: string } | null | undefined) {
  return "Olmadı: " + (e?.message || "bilinmeyen hata");
}
