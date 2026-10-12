import { useState } from "react";
import { useAuth } from "../../shared/auth";
import { Ikon } from "../../shared/Ikon";
import { sb } from "../../shared/supabase";
import { hataMetni, useToast } from "../../shared/toast";
import { useVeri, type Is } from "../../shared/veri";
import { adOf, IsKarti } from "./ortak";

type Alt = "havuz" | "talep" | "atanan" | "biten";
const ALTLAR: [Alt, string][] = [["havuz", "Bekleyen"], ["talep", "Taleplerim"], ["atanan", "Atananlar"], ["biten", "Biten"]];

export default function Isler({ duzenle }: { duzenle: (id: number) => void }) {
  const { veri, yenile } = useVeri();
  const { profile } = useAuth();
  const toast = useToast();
  const uid = profile!.id, yonetici = profile!.is_admin;
  const [alt, setAlt] = useState<Alt>("havuz");
  const [mesgul, setMesgul] = useState(false);
  const [devir, setDevir] = useState<Record<number, string>>({});
  const ad = (id: string | null) => adOf(veri, id);

  async function calistir(f: () => PromiseLike<{ error: { message: string } | null }>, basari?: string) {
    setMesgul(true);
    const r = await f();
    setMesgul(false);
    if (r.error) toast(hataMetni(r.error)); else if (basari) toast(basari);
    yenile();
  }

  const duzenleBtn = (j: Is) => yonetici && <button className="btn ghost sm" onClick={() => duzenle(j.id)}>Düzenle</button>;

  let liste: Is[] = [];
  let kartlar: React.ReactNode = null;
  if (alt === "havuz") {
    liste = veri.jobs.filter((j) => j.status === "havuz");
    kartlar = liste.map((j) => (
      <IsKarti key={j.id} is={j}>
        {j.req.includes(uid)
          ? <><span className="pill wait">Onay bekliyor</span><button className="btn ghost sm" disabled={mesgul} onClick={() => calistir(() => sb.from("job_requests").delete().eq("job_id", j.id).eq("user_id", uid))}>Vazgeç</button></>
          : <button className="btn" disabled={mesgul} onClick={() => calistir(() => sb.from("job_requests").insert({ job_id: j.id }), "Talebin iletildi.")}><Ikon ad="check" />Ben alırım</button>}
        {yonetici
          ? j.req.map((r) => <button key={r} className="btn ok sm" disabled={mesgul} onClick={() => calistir(() => sb.rpc("assign_job", { p_job: j.id, p_user: r }), "İş atandı.")}><Ikon ad="check" />{ad(r)}: onayla</button>)
          : j.req.length > 0 && <span className="muted">{j.req.length} talep var</span>}
        {duzenleBtn(j)}
        {yonetici && <button className="btn ghost sm" aria-label="İşi sil" disabled={mesgul} onClick={() => calistir(() => sb.from("jobs").delete().eq("id", j.id), "İş silindi.")}><Ikon ad="sil" /></button>}
      </IsKarti>
    ));
  } else if (alt === "talep") {
    liste = veri.jobs.filter((j) => j.req.includes(uid));
    kartlar = liste.map((j) => (
      <IsKarti key={j.id} is={j}>
        {j.status === "havuz" ? <span className="pill wait">Onay bekliyor</span>
          : j.assignee === uid ? <span className="pill ok">Onaylandı, sende</span>
          : <span className="pill off">{ad(j.assignee)} üstlendi</span>}
      </IsKarti>
    ));
  } else if (alt === "atanan") {
    liste = veri.jobs.filter((j) => j.status === "atandi");
    kartlar = liste.map((j) => {
      const benim = j.assignee === uid, yetkili = benim || yonetici;
      const digerleri = veri.profiles.filter((m) => m.id !== j.assignee);
      return (
        <IsKarti key={j.id} is={j}>
          <span className={"pill " + (benim ? "ok" : "blue")}>{benim ? "Sende" : ad(j.assignee)}</span>
          {j.transfer_to ? (
            j.transfer_to === uid ? <>
              <button className="btn ok sm" disabled={mesgul} onClick={() => calistir(() => sb.rpc("answer_transfer", { p_job: j.id, p_accept: true }), "İş artık sende.")}>Devri kabul et</button>
              <button className="btn ghost sm" disabled={mesgul} onClick={() => calistir(() => sb.rpc("answer_transfer", { p_job: j.id, p_accept: false }))}>Reddet</button>
            </> : <>
              <span className="pill wait">Devir bekliyor: {ad(j.transfer_to)}</span>
              {yetkili && <button className="btn ghost sm" disabled={mesgul} onClick={() => calistir(() => sb.rpc("offer_transfer", { p_job: j.id, p_user: null }))}>Devri iptal et</button>}
            </>
          ) : yetkili && <>
            <button className="btn ok sm" disabled={mesgul} onClick={() => calistir(() => sb.rpc("complete_job", { p_job: j.id }), "İş tamamlandı.")}><Ikon ad="check" />Tamamlandı</button>
            {digerleri.length > 0 && <>
              <select aria-label="Devredilecek kişi" value={devir[j.id] ?? ""} onChange={(e) => setDevir({ ...devir, [j.id]: e.target.value })}>
                <option value="">Devret…</option>
                {digerleri.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button className="btn ghost sm" disabled={mesgul} onClick={() => devir[j.id] ? calistir(() => sb.rpc("offer_transfer", { p_job: j.id, p_user: devir[j.id] }), "Devir teklifi gönderildi.") : toast("Önce kime devredeceğini seç.")}>Devret</button>
            </>}
          </>}
          {duzenleBtn(j)}
        </IsKarti>
      );
    });
  } else {
    liste = veri.jobs.filter((j) => j.status === "bitti");
    kartlar = liste.map((j) => <IsKarti key={j.id} is={j}><span className="pill off">Bitti · {ad(j.assignee)}</span></IsKarti>);
  }

  return (
    <>
      <h2>İşler</h2>
      <div className="segment" role="group">{ALTLAR.map(([k, l]) => <button key={k} aria-pressed={alt === k} onClick={() => setAlt(k)}>{l}</button>)}</div>
      {liste.length ? <div className="cards">{kartlar}</div>
        : <div className="empty">{alt === "havuz" ? (yonetici ? "Bekleyen iş yok. Yönetim bölümünden ilk işi aç." : "Bekleyen iş yok.") : "Bu bölümde iş yok."}</div>}
    </>
  );
}
