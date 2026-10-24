import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { sb, type Profile } from "./supabase";
import { ekle, iso } from "./tarih";

// Ekip, Takvim ve bildirimlerin paylaştığı canlı veri. Tek yerden yüklenir, tek kanaldan güncellenir.
export type Musaitlik = { s: "bos" | "dolu"; t: string; loc: string; n: string };
export type Is = {
  id: number; brand: string; category: string; type: string; title: string;
  due: string; embargo: string | null; status: "havuz" | "atandi" | "bitti";
  assignee: string | null; transfer_to: string | null; req: string[]; done_at?: string | null;
  // 0020: iş disiplini (eski kayıtlarda boş gelebilir)
  priority?: "acil" | "yuksek" | "normal" | "dusuk"; stage?: "alindi" | "cekim" | "kurgu" | "onay" | "yayinda";
  backup?: string | null; brief?: string; link?: string | null; stage_note?: string | null; stage_at?: string | null; created_at?: string;
};
export type Ekipman = { id: number; name: string; category: string; status: "elimizde" | "yolda"; holder: string | null; day: string | null };
export type Etkinlik = { id: number; title: string; brand: string; start_day: string; end_day: string | null; certainty: "kesin" | "tahmini"; note: string };
export type Davet = { email: string; name: string; org: string; is_admin: boolean; site_rol: string; davet_gonderildi: string | null };
export type Bildirim = { id: number; body: string; read: boolean; created_at: string };

export type Veri = {
  profiles: Profile[];
  avail: Record<string, Record<string, Musaitlik>>;
  jobs: Is[]; gear: Ekipman[]; events: Etkinlik[]; invites: Davet[]; notifs: Bildirim[];
};

const BOS: Veri = { profiles: [], avail: {}, jobs: [], gear: [], events: [], invites: [], notifs: [] };
type Durum = { veri: Veri; yukleniyor: boolean; hata: string; yenile: () => Promise<void>; setVeri: (f: (v: Veri) => Veri) => void };
const Ctx = createContext<Durum>({ veri: BOS, yukleniyor: true, hata: "", yenile: async () => {}, setVeri: () => {} });
export const useVeri = () => useContext(Ctx);

export function VeriProvider({ children }: { children: ReactNode }) {
  const [veri, setVeriState] = useState<Veri>(BOS);
  const [yukleniyor, setY] = useState(true);
  const [hata, setHata] = useState("");
  const zamanlayici = useRef<number | undefined>(undefined);

  const yenile = useCallback(async () => {
    const q = await Promise.all([
      sb.from("profiles").select("*").order("created_at"),
      sb.from("availability").select("*").gte("day", iso(ekle(-70))).lte("day", iso(ekle(400))),
      sb.from("jobs").select("*").order("due"),
      sb.from("job_requests").select("*"),
      sb.from("gear").select("*").order("day"),
      sb.from("events").select("*").order("start_day"),
      sb.from("invites").select("*").order("created_at"),
      sb.from("notifications").select("id,body,read,created_at").order("created_at", { ascending: false }).limit(40),
    ]);
    const bozuk = q.find((x) => x.error);
    if (bozuk) { setHata(bozuk.error!.message); setY(false); return; }
    const [p, a, j, r, g, e, inv, n] = q.map((x) => x.data ?? []) as unknown[][];
    const avail: Veri["avail"] = {};
    for (const x of a as { user_id: string; day: string; status: "bos" | "dolu"; slot: string; loc: string; note: string }[]) {
      (avail[x.user_id] ??= {})[x.day] = { s: x.status, t: x.slot, loc: x.loc, n: x.note };
    }
    const talepler = r as { job_id: number; user_id: string }[];
    setVeriState({
      profiles: p as Profile[],
      avail,
      jobs: (j as Omit<Is, "req">[]).map((x) => ({ ...x, req: talepler.filter((y) => y.job_id === x.id).map((y) => y.user_id) })),
      gear: g as Ekipman[], events: e as Etkinlik[], invites: inv as Davet[], notifs: n as Bildirim[],
    });
    setHata(""); setY(false);
  }, []);

  useEffect(() => {
    yenile();
    const kanal = sb.channel("studyo")
      .on("postgres_changes", { event: "*", schema: "public" }, () => {
        window.clearTimeout(zamanlayici.current);
        zamanlayici.current = window.setTimeout(yenile, 400);
      })
      .subscribe();
    return () => { sb.removeChannel(kanal); };
  }, [yenile]);

  const setVeri = useCallback((f: (v: Veri) => Veri) => setVeriState(f), []);
  return <Ctx.Provider value={{ veri, yukleniyor, hata, yenile, setVeri }}>{children}</Ctx.Provider>;
}
