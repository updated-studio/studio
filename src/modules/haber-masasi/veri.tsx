import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { sb } from "../../shared/supabase";
import type { GorselAday } from "../../../supabase/functions/triyaj-taslak/gorsel.ts";

// Haber Masası'nın kendi canlı verisi. Sadece bu modül açıkken yüklenir.
export type Durum = "aday" | "belirsiz" | "elendi" | "alindi" | "pas" | "yayinda" | "rehber";
export type Haber = {
  id: number; created_at: string; published_at: string | null; source_name: string; link: string; title: string;
  event: string; brand: string; product: string; kind: string; topic: string; priority: number; news_type: string; ai_note: string; model: string;
  status: Durum; reason: string; wrong_by: string | null; other_sources: { name: string; link: string }[];
  suggested_editor: string | null; taken_by: string | null; taken_at: string | null; transfer_from: string | null;
  transfer_seen: boolean; last_dropped_by: string | null; translation: string; work_state: "" | "ceviri" | "taslak" | "hata";
  work_error: string; touched: boolean; updated_at: string; updated_by: string | null;
  origin: string; turkey: string; event_key: string; draft_url: string; transfer_note: string; last_action: string;
  auto_draft_at: string | null; // otomatik taslak için seçildiği an
};
export type Oy = { id: number; item_id: number | null; user_id: string; value: number; note: string; created_at: string; brand: string; topic: string; event: string; link: string };
export type Etkinlik = { id: number; created_at: string; kind: string; actor: string | null; target: string | null; actor_name: string; target_name: string; item_id: number | null; title: string; link: string; note: string; read_by: string[] };
export type Stok = { kaynak: string; url: string; thumb: string; yazar: string; w: number; h: number };
export type Taslak = {
  id: number; item_id: number | null; author: string | null; title: string; spot: string; body: string;
  seo: { focus?: string; title_tag?: string; slug?: string; meta?: string; kategori?: string; etiketler?: string[] };
  sources: string; image_note: string; editor_note: string; status: "taslak" | "hazir" | "gonderildi"; model: string;
  questions: string[]; checks: string[]; notes: string[];
  image: {
    oneri?: string; alt_text?: string; aramalar?: string[]; ai_istem?: string; basin?: { url: string; kesin: boolean } | null; stok?: Stok[]; stok_anahtar?: boolean;
    secilen?: GorselAday | null; gorsel_adaylar?: GorselAday[]; gorsel_neden?: string; wp_media_id?: number | null; yukleme_hata?: string; // öne çıkan görsel (gorsel.ts)
  };
  created_at: string; updated_at: string;
  auto: boolean; wp_post_id: number | null; wp_link: string; wp_error: string; wp_sent_at: string | null; wp_pending: boolean; // otomatik mi, WordPress karşılığı
};
export type Mesaj = { id: number; user_id: string; body: string; item_id: number | null; created_at: string };
export type Kaynak = { id: number; category: string; name: string; url: string; active: boolean; last_check: string | null; item_count: number | null; last_item_at: string | null; status: string; error: string };
export type Marka = { name: string; grp: string; note: string };
export type Basin = { id: number; brand: string; url: string; note: string };

type Veri = { haberler: Haber[]; oylar: Oy[]; taslaklar: Taslak[]; mesajlar: Mesaj[]; kaynaklar: Kaynak[]; markalar: Marka[]; basin: Basin[]; ayarlar: Record<string, unknown>; etkinlik: Etkinlik[] };
const BOS: Veri = { haberler: [], oylar: [], taslaklar: [], mesajlar: [], kaynaklar: [], markalar: [], basin: [], ayarlar: {}, etkinlik: [] };
type Baglam = { v: Veri; yukleniyor: boolean; hata: string; yenile: () => Promise<void>; guncelle: (f: (v: Veri) => Veri) => void };
const Ctx = createContext<Baglam>({ v: BOS, yukleniyor: true, hata: "", yenile: async () => {}, guncelle: () => {} });
export const useMasa = () => useContext(Ctx);

const OTUZ_GUN = () => new Date(Date.now() - 30 * 86_400_000).toISOString();

export function MasaProvider({ children }: { children: ReactNode }) {
  const [v, setV] = useState<Veri>(BOS);
  const [yukleniyor, setY] = useState(true);
  const [hata, setHata] = useState("");
  const zaman = useRef<number | undefined>(undefined);

  const yenile = useCallback(async () => {
    const q = await Promise.all([
      // Havuz, belirsiz ve elenenlerin tamamı (saklama kuralı zaten 3 günde temizliyor) + son 30 günün alınan/pas/yayında haberleri
      sb.from("tr_items").select("*").in("status", ["aday", "belirsiz", "elendi", "rehber"]).order("published_at", { ascending: false }).limit(2000),
      sb.from("tr_items").select("*").in("status", ["alindi", "pas", "yayinda"]).gte("updated_at", OTUZ_GUN()).order("updated_at", { ascending: false }).limit(1000),
      sb.from("tr_votes").select("id,item_id,user_id,value,note,created_at,brand,topic,event,link"),
      sb.from("tr_drafts").select("*").order("updated_at", { ascending: false }).limit(300),
      sb.from("tr_chat").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("tr_sources").select("*").order("category").order("name"),
      sb.from("tr_brands").select("*").order("name"),
      sb.from("tr_press").select("*").order("brand"),
      sb.from("tr_settings").select("key,value"),
      sb.from("tr_activity").select("*").order("created_at", { ascending: false }).limit(60),
    ]);
    const bozuk = q.find((x) => x.error);
    if (bozuk) { setHata(bozuk.error!.message); setY(false); return; }
    const d = q.map((x) => x.data ?? []) as unknown[][];
    setV({
      haberler: [...(d[0] as Haber[]), ...(d[1] as Haber[])],
      oylar: d[2] as Oy[], taslaklar: d[3] as Taslak[], mesajlar: (d[4] as Mesaj[]).reverse(),
      kaynaklar: d[5] as Kaynak[], markalar: d[6] as Marka[], basin: d[7] as Basin[],
      ayarlar: Object.fromEntries((d[8] as { key: string; value: unknown }[]).map((r) => [r.key, r.value])),
      etkinlik: d[9] as Etkinlik[],
    });
    setHata(""); setY(false);
  }, []);

  useEffect(() => {
    yenile();
    const kanal = sb.channel("haber-masasi");
    for (const t of ["tr_items", "tr_votes", "tr_drafts", "tr_chat", "tr_sources", "tr_settings", "tr_brands", "tr_press", "tr_activity"]) {
      kanal.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        window.clearTimeout(zaman.current);
        zaman.current = window.setTimeout(yenile, 500);
      });
    }
    kanal.subscribe();
    return () => { window.clearTimeout(zaman.current); sb.removeChannel(kanal); };
  }, [yenile]);

  return <Ctx.Provider value={{ v, yukleniyor, hata, yenile, guncelle: setV }}>{children}</Ctx.Provider>;
}

/** Ekranda hemen göster, sunucu hata verirse geri al. */
export function useIyimser() {
  const { v, guncelle, yenile } = useMasa();
  return async (yerel: (v: Veri) => Veri, sunucu: () => PromiseLike<{ error: { message: string } | null }>, hataGoster: (m: string) => void) => {
    const yedek = v;
    guncelle(yerel);
    const r = await sunucu();
    if (r.error) { guncelle(() => yedek); hataGoster(r.error.message); yenile(); return false; }
    return true;
  };
}
