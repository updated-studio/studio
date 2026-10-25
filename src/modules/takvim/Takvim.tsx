import { useState } from "react";
import { BUGUN, GUN, D, ekle, iso, kalan, kisaY, saatMetni, uzun } from "../../shared/tarih";
import { useVeri } from "../../shared/veri";
import Abonelik from "./Abonelik";
import { adOf } from "../ekip/ortak";
import "./takvim.css";

type Olay = { k: "d" | "g" | "e"; t: string };
const ETIKET: Record<Olay["k"], [string, string]> = { d: ["wait", "İş"], g: ["blue", "Ekipman"], e: ["purple", "Etkinlik"] };

export default function Takvim() {
  const { veri, yukleniyor } = useVeri();
  const [kayma, setKayma] = useState(0);
  const [sec, setSec] = useState(iso(BUGUN));
  if (yukleniyor) return <div className="muted">Yükleniyor…</div>;

  const ilk = new Date(BUGUN.getFullYear(), BUGUN.getMonth() + kayma, 1);
  const bas = ekle(-((ilk.getDay() + 6) % 7), ilk);
  const ayNo = ilk.getMonth();
  const olaylar: Record<string, Olay[]> = {};
  const ekleOlay = (gun: string | null, o: Olay) => { if (gun) (olaylar[gun] ??= []).push(o); };

  veri.jobs.filter((j) => j.status !== "bitti").forEach((j) =>
    ekleOlay(j.due, { k: "d", t: `Son gün: ${j.brand} ${j.title} · ${j.assignee ? adOf(veri, j.assignee) : "henüz alınmadı"}` }));
  veri.gear.forEach((g) => ekleOlay(g.day, { k: "g", t: (g.status === "yolda" ? "Geliyor: " : "İade: ") + g.name }));
  const etkinlikAdi = (x: (typeof veri.events)[number]) => (x.brand ? x.brand + " · " : "") + x.title + (x.certainty === "tahmini" ? " (tahmini)" : "");
  veri.events.forEach((x) => {
    const s = D(x.start_day);
    const n = x.end_day ? Math.max(0, Math.min(60, Math.round((D(x.end_day).getTime() - s.getTime()) / 864e5))) : 0;
    for (let i = 0; i <= n; i++) ekleOlay(iso(ekle(i, s)), { k: "e", t: etkinlikAdi(x) + (x.note ? " · " + x.note : "") });
  });

  const hucreler = [];
  for (let i = 0; i < 42; i++) {
    const d = ekle(i, bas), k = iso(d);
    if (i >= 35 && d.getMonth() !== ayNo) break;
    const bos = veri.profiles.filter((m) => veri.avail[m.id]?.[k]?.s === "bos").length;
    hucreler.push(
      <button key={k} className={["aygun", d.getMonth() !== ayNo ? "disari" : "", k === iso(BUGUN) ? "bugun" : "", k === sec ? "sec" : ""].join(" ")} onClick={() => setSec(k)}>
        <span className="mono">{d.getDate()}</span>
        <span className="noktalar">
          {Array.from({ length: bos }, (_, j) => <span key={"b" + j} className="nokta" />)}
          {(olaylar[k] ?? []).map((o, j) => <span key={j} className={"nokta " + o.k} />)}
        </span>
      </button>,
    );
  }
  const bosOlanlar = veri.profiles.filter((m) => veri.avail[m.id]?.[sec]?.s === "bos");
  const secOlay = olaylar[sec] ?? [];
  const yaklasan = veri.events.filter((x) => kalan(x.end_day ?? x.start_day) >= 0).slice(0, 10);

  return (
    <>
      <div className="row">
        <button className="btn ghost sm" aria-label="Önceki ay" onClick={() => setKayma(kayma - 1)}>‹</button>
        <h2 style={{ flex: 1, textAlign: "center" }}>{ilk.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</h2>
        {kayma !== 0 && <button className="btn ghost sm" onClick={() => setKayma(0)}>Bugün</button>}
        <button className="btn ghost sm" aria-label="Sonraki ay" onClick={() => setKayma(kayma + 1)}>›</button>
      </div>
      <div className="lejant">
        <span><span className="nokta" />Boş olan kişi</span><span><span className="nokta d" />İş son günü</span>
        <span><span className="nokta g" />Ekipman geliş / iade</span><span><span className="nokta e" />Etkinlik / lansman</span>
      </div>
      <div className="ay">{GUN.map((g) => <div key={g} className="hd">{g}</div>)}{hucreler}</div>
      <div className="panel">
        <strong>{uzun(sec)}</strong>
        <div className="liste">
          {bosOlanlar.map((m) => { const x = veri.avail[m.id][sec]; return (
            <div className="satir" key={m.id}><span className="pill ok">Boş</span>
              <div className="ana">{m.name} <span className="muted">{[saatMetni(x.t), x.loc, x.n].filter(Boolean).join(" · ")}</span></div></div>
          ); })}
          {secOlay.map((o, i) => <div className="satir" key={i}><span className={"pill " + ETIKET[o.k][0]}>{ETIKET[o.k][1]}</span><div className="ana">{o.t}</div></div>)}
          {!bosOlanlar.length && !secOlay.length && <div className="muted">Bu gün için kayıt yok.</div>}
        </div>
      </div>
      <h3>Yaklaşan etkinlikler</h3>
      <div className="panel"><div className="liste">
        {yaklasan.length ? yaklasan.map((x) => (
          <div className="satir" key={x.id}>
            <span className="mono">{kisaY(x.start_day)}{x.end_day && x.end_day !== x.start_day ? " – " + kisaY(x.end_day) : ""}</span>
            <div className="ana"><strong>{(x.brand ? x.brand + " · " : "") + x.title}</strong>{x.note && <div className="muted">{x.note}</div>}</div>
            <span className={"pill " + (x.certainty === "tahmini" ? "off" : "purple")}>{x.certainty === "tahmini" ? "Tahmini" : "Kesin"}</span>
          </div>
        )) : <div className="muted">Etkinlik eklenmedi.</div>}
      </div></div>
      <Abonelik />
    </>
  );
}
