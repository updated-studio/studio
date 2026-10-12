import { useState } from "react";
import { useAuth } from "../../shared/auth";
import { Ikon } from "../../shared/Ikon";
import { sb } from "../../shared/supabase";
import { BUGUN, GUN, ekle, iso, pazartesi, saatMetni, uzun } from "../../shared/tarih";
import { hataMetni, useToast } from "../../shared/toast";
import { useVeri, type Musaitlik } from "../../shared/veri";
import { KONUMLAR } from "./ortak";

const SAATLER = Array.from({ length: 16 }, (_, i) => String(i + 8).padStart(2, "0") + ":00");

export default function Hafta() {
  const { veri, setVeri, yenile } = useVeri();
  const { profile } = useAuth();
  const toast = useToast();
  const uid = profile!.id;
  const [kayma, setKayma] = useState(0); // 0: bu hafta, 1: gelecek hafta
  const hafta = [0, 1, 2, 3, 4, 5, 6].map((i) => ekle(i + 7 * kayma, pazartesi()));
  const [sec, setSec] = useState(iso(BUGUN));
  const haftaDegistir = (k: number) => { setKayma(k); setSec(k === 0 ? iso(BUGUN) : iso(ekle(7 * k, pazartesi()))); };
  const benim = veri.avail[uid] ?? {};
  const a = benim[sec];

  async function kaydet(gun: string, yeni: Musaitlik | null) {
    setVeri((v) => {
      const m = { ...(v.avail[uid] ?? {}) };
      if (yeni) m[gun] = yeni; else delete m[gun];
      return { ...v, avail: { ...v.avail, [uid]: m } };
    });
    const r = yeni
      ? await sb.from("availability").upsert({ user_id: uid, day: gun, status: yeni.s, slot: yeni.s === "bos" ? yeni.t : "", loc: yeni.loc, note: yeni.n })
      : await sb.from("availability").delete().eq("user_id", uid).eq("day", gun);
    if (r.error) { toast(hataMetni(r.error)); yenile(); }
  }

  function gunTikla(gun: string) {
    const mevcut = benim[gun];
    if (gun === sec && mevcut) return kaydet(gun, { ...mevcut, s: mevcut.s === "bos" ? "dolu" : "bos" });
    setSec(gun);
    if (!mevcut) kaydet(gun, { s: "bos", t: "", loc: "İstanbul", n: "" });
  }
  const guncelle = (p: Partial<Musaitlik>) => a && kaydet(sec, { ...a, ...p });
  const durum = (s: Musaitlik["s"]) => kaydet(sec, a ? { ...a, s } : { s, t: "", loc: "İstanbul", n: "" });

  return (
    <>
      <div className="segment" role="group">
        <button aria-pressed={kayma === 0} onClick={() => haftaDegistir(0)}>Bu hafta</button>
        <button aria-pressed={kayma === 1} onClick={() => haftaDegistir(1)}>Gelecek hafta</button>
      </div>
      <h2>{kayma === 0 ? "Bu hafta" : "Gelecek hafta"} ne zaman boşsun, {profile!.name}?</h2>
      <div className="panel">
        <div className="hafta">
          {hafta.map((d, i) => {
            const k = iso(d), s = benim[k]?.s ?? "";
            return (
              <button key={k} className={["gun", s, k === sec ? "sec" : "", k === iso(BUGUN) ? "bugun" : ""].join(" ")} onClick={() => gunTikla(k)}>
                <small>{GUN[i]}</small><strong>{d.getDate()}</strong><i>{s === "bos" ? "Boş" : s === "dolu" ? "Dolu" : "·"}</i>
              </button>
            );
          })}
        </div>
        <div className="row"><strong>{uzun(sec)}</strong><span className="muted">Seçili güne tekrar dokun: Boş / Dolu değişir.</span></div>
        <div className="row">
          <button className="chip" aria-pressed={a?.s === "bos"} onClick={() => durum("bos")}>Boşum</button>
          <button className="chip" aria-pressed={a?.s === "dolu"} onClick={() => durum("dolu")}>Doluyum</button>
          <button className="chip" aria-pressed={!a} onClick={() => kaydet(sec, null)}>Belirtmedim</button>
        </div>
        {a && <>
          {a.s === "bos" && (
            <div className="row">
              <span className="muted"><Ikon ad="saat" /></span>
              <select aria-label="Saat" style={{ width: "auto" }} value={a.t} onChange={(e) => guncelle({ t: e.target.value })}>
                <option value="">Tüm gün</option>
                {SAATLER.map((x) => <option key={x} value={x}>{x} sonrası</option>)}
                {a.t && !SAATLER.includes(a.t) && <option value={a.t}>{a.t}</option>}
              </select>
              <span className="muted">isteğe bağlı</span>
            </div>
          )}
          <div className="row">
            <span className="muted"><Ikon ad="pin" /></span>
            {KONUMLAR.map((k) => <button key={k} className="chip" aria-pressed={a.loc === k} onClick={() => guncelle({ loc: k })}>{k}</button>)}
          </div>
          <label htmlFor="gun-notu">Bu güne kısa not
            <input id="gun-notu" type="text" maxLength={120} placeholder="Örn: Kadıköy tarafındayım, çekime gelebilirim" defaultValue={a.n} key={sec}
              onBlur={(e) => { const n = e.target.value.trim(); if (n !== a.n) { guncelle({ n }); toast("Not kaydedildi."); } }} />
          </label>
        </>}
      </div>
      <h3>Ekibin {kayma === 0 ? "bu haftası" : "gelecek haftası"}</h3>
      <div className="panel kaydir">
        <table>
          <thead><tr><th>Ekip</th>{hafta.map((d, i) => <th key={i}>{GUN[i]} {d.getDate()}</th>)}</tr></thead>
          <tbody>
            {veri.profiles.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong></td>
                {hafta.map((d) => {
                  const x = veri.avail[m.id]?.[iso(d)];
                  return (
                    <td key={iso(d)}>
                      {x ? <>
                        <span className={"cell " + x.s}>{x.s === "bos" ? saatMetni(x.t) || "Boş" : "Dolu"}</span>
                        {x.loc !== "İstanbul" && <div className="muted" style={{ fontSize: 10 }}>{x.loc}</div>}
                        {x.n && <div className="muted" style={{ fontSize: 10, maxWidth: 120, margin: "auto" }}>{x.n}</div>}
                      </> : <span className="cell none">·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
