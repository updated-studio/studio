import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "./auth";
import { sb } from "./supabase";

// Canlı durum (4 Kasım 2026, kullanıcı: "birisi bir yerdeyse orada olduğu görünsün, herkes görebilsin; kim nerede ne yapıyor, cowork").
// Supabase Realtime presence ("studyo-canli" kanalı): her açık Stüdyo sekmesi kişiyi, bulunduğu bölümü ve açık tuttuğu nesneyi (haber,
// taslak) yayınlar. Veritabanına bir şey yazılmaz; sekme kapanınca kişi listeden düşer.
export type CanliNesne = { tur: "haber" | "taslak"; id: number; baslik: string; eylem: "düzenliyor" | "bakıyor" };
export type CanliKisi = { id: string; ad: string; foto: string | null; email: string; yol: string; nesne: CanliNesne | null; zaman: string };

const BOLUM: [RegExp, string][] = [
  [/^\/bugun/, "Bugün"], [/^\/yaz\//, "Haber yaz"], [/^\/taslaklar/, "Taslaklar"], [/^\/yayinda/, "Yayındakiler"], [/^\/haber-masasi/, "Haber Masası"],
  [/^\/cekim/, "Çekim listesi"], [/^\/takvim/, "Takvim"], [/^\/icerik/, "İçerik"], [/^\/site/, "Site"], [/^\/ekip/, "Ekip"], [/^\/marka/, "Marka Kiti"],
  [/^\/baglantilar/, "Bağlantı anahtarları"], [/^\/sistem/, "Sistem"], [/^\/profil/, "Profil"],
];
export const bolumAdi = (yol: string) => BOLUM.find(([r]) => r.test(yol))?.[1] ?? "Stüdyo";

type Ctx = { kisiler: CanliKisi[]; ben: string | null; nesneAyarla: (n: CanliNesne | null) => void };
const C = createContext<Ctx>({ kisiler: [], ben: null, nesneAyarla: () => {} });

export function CanliSaglayici({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const konum = useLocation();
  const [kisiler, setKisiler] = useState<CanliKisi[]>([]);
  const [nesne, setNesne] = useState<CanliNesne | null>(null);
  const kanal = useRef<RealtimeChannel | null>(null);
  const hazir = useRef(false);

  useEffect(() => {
    if (!profile) return;
    const k = sb.channel("studyo-canli", { config: { presence: { key: profile.id } } });
    k.on("presence", { event: "sync" }, () => {
      const durum = k.presenceState<CanliKisi>();
      // Aynı kişi birden çok sekmede: en son güncellenen sekmesi
      const tek = Object.values(durum).map((l) => [...l].sort((a, b) => b.zaman.localeCompare(a.zaman))[0]).filter(Boolean) as CanliKisi[];
      setKisiler(tek);
    }).subscribe((s) => { if (s === "SUBSCRIBED") { hazir.current = true; kanal.current = k; gonder(); } });
    return () => { hazir.current = false; kanal.current = null; sb.removeChannel(k); };
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const gonder = () => {
    if (!profile || !kanal.current || !hazir.current) return;
    kanal.current.track({ id: profile.id, ad: profile.name, foto: profile.avatar_url ?? null, email: profile.email ?? "", yol: konum.pathname, nesne, zaman: new Date().toISOString() } satisfies CanliKisi).catch(() => {});
  };
  useEffect(gonder, [konum.pathname, nesne]); // eslint-disable-line react-hooks/exhaustive-deps
  // Yol değişince sayfanın nesnesi kendini yeniden bildirir; eski nesne kalmasın
  useEffect(() => { setNesne(null); }, [konum.pathname]);

  const deger = useMemo(() => ({ kisiler, ben: profile?.id ?? null, nesneAyarla: setNesne }), [kisiler, profile?.id]);
  return <C.Provider value={deger}>{children}</C.Provider>;
}

export const useCanli = () => useContext(C);

/** Sayfa açık tuttuğu nesneyi bildirir (haber yazma ekranı, taslak) */
export function useCanliNesne(n: CanliNesne | null) {
  const { nesneAyarla } = useCanli();
  const anahtar = n ? `${n.tur}:${n.id}:${n.eylem}:${n.baslik}` : "";
  useEffect(() => { nesneAyarla(n); return () => nesneAyarla(null); }, [anahtar]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Bu nesneyi şu an açık tutan başka kişiler */
export function useNesnedekiler(tur: CanliNesne["tur"], id: number | null | undefined) {
  const { kisiler, ben } = useCanli();
  return id == null ? [] : kisiler.filter((k) => k.id !== ben && k.nesne?.tur === tur && k.nesne.id === id);
}
