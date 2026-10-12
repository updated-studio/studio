import { useMemo, useState } from "react";
import { useAuth } from "../../shared/auth";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { HaberKart } from "./ortak";
import { useIyimser, useMasa, type Durum, type Haber } from "./veri";

// Havuz, Belirsiz ve Elenenler aynı listeyi farklı eylemlerle kullanır.
export default function Havuz({ durum }: { durum: Extract<Durum, "aday" | "belirsiz" | "elendi"> }) {
  const { v } = useMasa();
  const { profile } = useAuth();
  const toast = useToast();
  const iyimser = useIyimser();
  const ben = profile!.id;
  const [ara, setAra] = useState("");
  const [konu, setKonu] = useState("");
  const [enAz, setEnAz] = useState(durum === "aday" ? 0 : 0);
  const [notAcik, setNotAcik] = useState<number | null>(null);
  const [kac, setKac] = useState(60);

  const liste = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase("tr");
    return v.haberler.filter((h) => h.status === durum)
      .filter((h) => !konu || h.topic === konu)
      .filter((h) => h.priority >= enAz)
      .filter((h) => !q || [h.event, h.title, h.brand, h.product, h.source_name].join(" ").toLocaleLowerCase("tr").includes(q))
      .sort((a, b) => durum === "aday"
        ? b.priority - a.priority || Date.parse(b.published_at ?? b.created_at) - Date.parse(a.published_at ?? a.created_at)
        : Date.parse(b.published_at ?? b.created_at) - Date.parse(a.published_at ?? a.created_at));
  }, [v.haberler, durum, konu, enAz, ara]);

  const konular = useMemo(() => {
    const say = new Map<string, number>();
    v.haberler.filter((h) => h.status === durum && h.topic).forEach((h) => say.set(h.topic, (say.get(h.topic) ?? 0) + 1));
    return [...say.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [v.haberler, durum]);

  const durumYap = (h: Haber, yeni: Durum, ek: Partial<Haber> = {}) => iyimser(
    (x) => ({ ...x, haberler: x.haberler.map((y) => (y.id === h.id ? { ...y, status: yeni, touched: true, ...ek } : y)) }),
    () => sb.from("tr_items").update({ status: yeni, ...ek }).eq("id", h.id),
    toast,
  );

  async function al(h: Haber) {
    const ok = await iyimser(
      (x) => ({ ...x, haberler: x.haberler.map((y) => (y.id === h.id ? { ...y, status: "alindi", taken_by: ben, touched: true } : y)) }),
      () => sb.rpc("tr_take", { p_item: h.id }),
      toast,
    );
    if (ok) toast("Aldın. Benim aldıklarım bölümünde.");
  }

  async function oyla(h: Haber, deger: 1 | -1) {
    const mevcut = v.oylar.find((o) => o.item_id === h.id && o.user_id === ben);
    if (mevcut?.value === deger) {
      await iyimser((x) => ({ ...x, oylar: x.oylar.filter((o) => !(o.item_id === h.id && o.user_id === ben)) }),
        () => sb.from("tr_votes").delete().eq("item_id", h.id).eq("user_id", ben), toast);
      return;
    }
    const ok = await iyimser(
      (x) => ({ ...x, oylar: [...x.oylar.filter((o) => !(o.item_id === h.id && o.user_id === ben)), { item_id: h.id, user_id: ben, value: deger, note: mevcut?.note ?? "" }] }),
      () => sb.from("tr_votes").upsert({ item_id: h.id, user_id: ben, value: deger, note: mevcut?.note ?? "" }),
      toast,
    );
    if (ok) setNotAcik(h.id);
  }

  async function notKaydet(h: Haber, note: string) {
    setNotAcik(null);
    if (!note.trim()) return;
    const r = await sb.from("tr_votes").update({ note: note.trim().slice(0, 300) }).eq("item_id", h.id).eq("user_id", ben);
    if (r.error) toast(r.error.message); else toast("Not kaydedildi; yapay zekâ bundan sonra dikkate alır.");
  }

  async function yanlisElendi(h: Haber) {
    const ok = await durumYap(h, "aday", { wrong_by: ben, reason: "" });
    if (ok) {
      await sb.from("tr_votes").upsert({ item_id: h.id, user_id: ben, value: 1, note: "Yanlış elenmiş: " + (h.reason || "") });
      toast("Havuza alındı. Yapay zekâ bu tür haberleri bundan sonra elememeye çalışır.");
    }
  }

  const benimOy = (id: number) => v.oylar.find((o) => o.item_id === id && o.user_id === ben)?.value ?? 0;

  return (
    <>
      <div className="filtre">
        <input type="search" placeholder="Ara: marka, ürün, kaynak…" value={ara} onChange={(e) => setAra(e.target.value)} aria-label="Haberlerde ara" />
        {durum === "aday" && (
          <select value={enAz} onChange={(e) => setEnAz(Number(e.target.value))} style={{ width: "auto" }} aria-label="En az öncelik">
            <option value={0}>Tüm öncelikler</option><option value={3}>P3 ve üstü</option><option value={4}>P4 ve üstü</option><option value={5}>Sadece P5</option>
          </select>
        )}
      </div>
      {konular.length > 1 && (
        <div className="filtre">
          <button className="chip" aria-pressed={!konu} onClick={() => setKonu("")}>Tümü</button>
          {konular.map(([k, n]) => <button key={k} className="chip" aria-pressed={konu === k} onClick={() => setKonu(konu === k ? "" : k)}>{k} <span className="mono">{n}</span></button>)}
        </div>
      )}
      <div className="muted">{liste.length} haber</div>
      {!liste.length && <div className="empty">{durum === "aday" ? "Havuz boş. Yeni haberler 15 dakikada bir gelir." : "Burada haber yok."}</div>}
      <div className="cards">
        {liste.slice(0, kac).map((h) => (
          <HaberKart key={h.id} h={h} oylar={v.oylar}>
            {durum === "aday" && <>
              <button className="btn sm" onClick={() => al(h)}>Al</button>
              <button className="btn ghost sm" onClick={() => durumYap(h, "pas")}>Pas</button>
              <button className="btn ghost sm oybtn" aria-pressed={benimOy(h.id) === 1} aria-label="İyi seçim" onClick={() => oyla(h, 1)}>▲</button>
              <button className="btn ghost sm oybtn" aria-pressed={benimOy(h.id) === -1} aria-label="Kötü seçim" onClick={() => oyla(h, -1)}>▼</button>
            </>}
            {durum === "belirsiz" && <>
              <button className="btn sm" onClick={() => durumYap(h, "aday")}>Havuza al</button>
              <button className="btn ghost sm" onClick={() => al(h)}>Al</button>
              <button className="btn ghost sm" onClick={() => durumYap(h, "elendi", { reason: "Ekip eledi" })}>Ele</button>
            </>}
            {durum === "elendi" && (h.wrong_by
              ? <span className="muted">Yanlış elendi olarak işaretlendi</span>
              : <button className="btn ghost sm" onClick={() => yanlisElendi(h)}>Yanlış elendi</button>)}
            {notAcik === h.id && (
              <form className="row" style={{ width: "100%" }} onSubmit={(e) => { e.preventDefault(); notKaydet(h, String(new FormData(e.currentTarget).get("n"))); }}>
                <input name="n" type="text" placeholder="Neden? (isteğe bağlı, yapay zekâ öğrenir)" autoFocus style={{ flex: "1 1 180px", width: "auto" }} />
                <button className="btn ghost sm">Kaydet</button>
              </form>
            )}
          </HaberKart>
        ))}
      </div>
      {liste.length > kac && <button className="btn ghost" onClick={() => setKac(kac + 60)}>Daha fazla göster ({liste.length - kac})</button>}
    </>
  );
}
