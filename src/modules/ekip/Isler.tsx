import { useState } from "react";
import { useAuth } from "../../shared/auth";
import { Ikon } from "../../shared/Ikon";
import { sb } from "../../shared/supabase";
import { hataMetni, useToast } from "../../shared/toast";
import { useVeri, type Is } from "../../shared/veri";
import IsFormu from "./IsFormu";
import { ASAMALAR, adOf, asamaAd, asamaOf, gecikti, isSirala, IsKarti, type Asama } from "./ortak";

type Alt = "havuz" | "devam" | "benim" | "biten";
type Acik = { id: number; tur: "onay" | "duzelt"; link: string; not: string } | null;

export default function Isler() {
  const { veri, yenile } = useVeri();
  const { profile } = useAuth();
  const toast = useToast();
  const uid = profile!.id, yonetici = profile!.is_admin;
  const [alt, setAlt] = useState<Alt>("havuz");
  const [mesgul, setMesgul] = useState(false);
  const [devir, setDevir] = useState<Record<number, string>>({});
  const [form, setForm] = useState<Is | "yeni" | null>(null);
  const [acik, setAcik] = useState<Acik>(null);
  const ad = (id: string | null) => adOf(veri, id);

  async function calistir(f: () => PromiseLike<{ error: { message: string } | null }>, basari?: string) {
    setMesgul(true);
    const r = await f();
    setMesgul(false);
    if (r.error) toast(/job_stage|function/i.test(r.error.message) ? "Aşama özelliği için veritabanı güncellemesi henüz yapılmadı." : hataMetni(r.error)); else if (basari) toast(basari);
    setAcik(null); yenile();
  }
  const asama = (j: Is, s: Asama, link = "", not = "", basari?: string) =>
    calistir(() => sb.rpc("job_stage", { p_job: j.id, p_stage: s, p_link: link || null, p_note: not || null }), basari);

  const benimMi = (j: Is) => j.assignee === uid || j.backup === uid || j.transfer_to === uid || (j.status === "havuz" && j.req.includes(uid));
  const listeler: Record<Alt, Is[]> = {
    havuz: veri.jobs.filter((j) => j.status === "havuz"),
    devam: veri.jobs.filter((j) => j.status === "atandi"),
    benim: veri.jobs.filter((j) => j.status !== "bitti" && benimMi(j)),
    biten: veri.jobs.filter((j) => j.status === "bitti").sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")),
  };
  const ALTLAR: [Alt, string][] = [["havuz", "Bekleyen"], ["devam", "Devam eden"], ["benim", "Benim"], ["biten", "Biten"]];
  const geciken = veri.jobs.filter(gecikti).length;
  const onayda = veri.jobs.filter((j) => j.status === "atandi" && asamaOf(j) === "onay").length;

  function kisiler(j: Is) {
    if (j.status === "havuz") return j.req.length > 0 ? <div className="muted">{j.req.length} talep: {j.req.map(ad).join(", ")}</div> : null;
    return <div className="muted">Sorumlu: <strong>{j.assignee === uid ? "Sen" : ad(j.assignee)}</strong>{j.backup && <> · Yedek: {j.backup === uid ? "Sen" : ad(j.backup)}</>}</div>;
  }

  function havuzEylem(j: Is) {
    return <>
      {j.req.includes(uid)
        ? <><span className="pill wait">Onay bekliyor</span><button className="btn ghost sm" disabled={mesgul} onClick={() => calistir(() => sb.from("job_requests").delete().eq("job_id", j.id).eq("user_id", uid))}>Vazgeç</button></>
        : <button className="btn" disabled={mesgul} onClick={() => calistir(() => sb.from("job_requests").insert({ job_id: j.id }), "Talebin iletildi.")}><Ikon ad="check" />Ben alırım</button>}
      {yonetici && j.req.map((r) => <button key={r} className="btn ok sm" disabled={mesgul} onClick={() => calistir(() => sb.rpc("assign_job", { p_job: j.id, p_user: r }), "İş atandı.")}><Ikon ad="check" />{ad(r)}: onayla</button>)}
      {yonetici && <button className="btn ghost sm" onClick={() => setForm(j)}>Düzenle</button>}
      {yonetici && <button className="btn ghost sm" aria-label="İşi sil" disabled={mesgul} onClick={() => confirm(`"${j.brand} ${j.title}" silinsin mi?`) && calistir(() => sb.from("jobs").delete().eq("id", j.id), "İş silindi.")}><Ikon ad="sil" /></button>}
    </>;
  }

  function devamEylem(j: Is) {
    const yetkili = j.assignee === uid || j.backup === uid || yonetici;
    const a = asamaOf(j); const n = ASAMALAR.findIndex(([k]) => k === a);
    if (j.transfer_to) {
      return j.transfer_to === uid ? <>
        <button className="btn ok sm" disabled={mesgul} onClick={() => calistir(() => sb.rpc("answer_transfer", { p_job: j.id, p_accept: true }), "İş artık sende.")}>Devri kabul et</button>
        <button className="btn ghost sm" disabled={mesgul} onClick={() => calistir(() => sb.rpc("answer_transfer", { p_job: j.id, p_accept: false }))}>Reddet</button>
      </> : <>
        <span className="pill wait">Devir bekliyor: {ad(j.transfer_to)}</span>
        {(j.assignee === uid || yonetici) && <button className="btn ghost sm" disabled={mesgul} onClick={() => calistir(() => sb.rpc("offer_transfer", { p_job: j.id, p_user: null }))}>Devri iptal et</button>}
      </>;
    }
    if (acik?.id === j.id) {
      const onay = acik.tur === "onay";
      return (
        <div className="is-ic-form">
          {onay && <label>Teslim linki<input type="url" value={acik.link} placeholder="Drive / WeTransfer bağlantısı" onChange={(e) => setAcik({ ...acik, link: e.target.value })} /></label>}
          <label>{onay ? "Not (isteğe bağlı)" : "Ne düzeltilsin?"}<input type="text" value={acik.not} onChange={(e) => setAcik({ ...acik, not: e.target.value })} /></label>
          <div className="row">
            <button className="btn sm" disabled={mesgul || (!onay && !acik.not.trim())}
              onClick={() => onay ? asama(j, "onay", acik.link, acik.not, "Onaya gönderildi.") : asama(j, "kurgu", "", acik.not, "Düzeltme istendi.")}>{onay ? "Onaya gönder" : "Düzeltme iste"}</button>
            <button className="btn ghost sm" onClick={() => setAcik(null)}>Vazgeç</button>
          </div>
        </div>
      );
    }
    const digerleri = veri.profiles.filter((m) => m.id !== j.assignee);
    return <>
      {yetkili && a !== "onay" && n < 2 && <button className="btn sm" disabled={mesgul} onClick={() => asama(j, ASAMALAR[n + 1][0])}>→ {asamaAd(ASAMALAR[n + 1][0])}</button>}
      {yetkili && a !== "onay" && <button className={"btn sm" + (n >= 2 ? "" : " ghost")} disabled={mesgul} onClick={() => setAcik({ id: j.id, tur: "onay", link: j.link ?? "", not: "" })}>Onaya gönder</button>}
      {a === "onay" && (yonetici ? <>
        <button className="btn ok sm" disabled={mesgul} onClick={() => calistir(() => sb.rpc("complete_job", { p_job: j.id }), "İş yayında olarak kapandı.")}><Ikon ad="check" />Onayla, bitir</button>
        <button className="btn ghost sm" disabled={mesgul} onClick={() => setAcik({ id: j.id, tur: "duzelt", link: "", not: "" })}>Düzeltme iste</button>
      </> : <span className="pill wait">Yönetici onayı bekliyor</span>)}
      {yonetici && a !== "onay" && j.assignee === uid && <button className="btn ghost sm" disabled={mesgul} onClick={() => calistir(() => sb.rpc("complete_job", { p_job: j.id }), "İş tamamlandı.")}>Doğrudan bitir</button>}
      {(j.assignee === uid || yonetici) && digerleri.length > 0 && <>
        <select aria-label="Devredilecek kişi" value={devir[j.id] ?? ""} onChange={(e) => setDevir({ ...devir, [j.id]: e.target.value })}>
          <option value="">Devret…</option>
          {digerleri.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {devir[j.id] && <button className="btn ghost sm" disabled={mesgul} onClick={() => calistir(() => sb.rpc("offer_transfer", { p_job: j.id, p_user: devir[j.id] }), "Devir teklifi gönderildi.")}>Devret</button>}
      </>}
      {yonetici && <button className="btn ghost sm" onClick={() => setForm(j)}>Düzenle</button>}
    </>;
  }

  const liste = alt === "biten" ? listeler.biten : [...listeler[alt]].sort(isSirala);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>İşler</h2>
        {yonetici && !form && <button className="btn" onClick={() => setForm("yeni")}><Ikon ad="plus" />Yeni iş</button>}
      </div>
      {form && <IsFormu is={form === "yeni" ? undefined : form} kapat={() => setForm(null)} />}
      {(geciken > 0 || onayda > 0) && (
        <div className="row">
          {geciken > 0 && <span className="pill is-gec">{geciken} iş gecikti</span>}
          {onayda > 0 && <button className="pill wait" style={{ border: 0 }} onClick={() => setAlt("devam")}>{onayda} iş onay bekliyor</button>}
        </div>
      )}
      <div className="segment" role="group">
        {ALTLAR.map(([k, l]) => <button key={k} aria-pressed={alt === k} onClick={() => setAlt(k)}>{l}{k !== "biten" && listeler[k].length > 0 && <span className="is-sayi">{listeler[k].length}</span>}</button>)}
      </div>
      {liste.length ? (
        <div className="cards">
          {liste.map((j) => (
            <IsKarti key={j.id} is={j} kisiler={kisiler(j)}>
              {j.status === "havuz" ? havuzEylem(j) : j.status === "atandi" ? devamEylem(j) : <span className="pill off">Bitti · {ad(j.assignee)}</span>}
            </IsKarti>
          ))}
        </div>
      ) : <div className="empty">{alt === "havuz" ? (yonetici ? "Bekleyen iş yok. \"Yeni iş\" ile aç." : "Bekleyen iş yok.") : alt === "benim" ? "Üzerinde iş yok." : "Bu bölümde iş yok."}</div>}
    </>
  );
}
