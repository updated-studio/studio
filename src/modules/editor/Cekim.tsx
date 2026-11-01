import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import { Ikon } from "../../shared/Ikon";
import { sb } from "../../shared/supabase";
import { kalan, kisa } from "../../shared/tarih";
import { useToast } from "../../shared/toast";
import { useVeri } from "../../shared/veri";
import { maddeSayisi, turTahmin, TURLER } from "./cekimListesi";

// Çekim kontrol listesi (1 Kasım 2026): telefondan açılır. İş seçilir (Ekip → İşler'de sana atanan çekimler), içerik türü işin türünden
// tahmin edilir, değiştirilebilir. İşaretler public.cekim_kontrol'de (göç 0061) saklanır; göç yoksa yalnız bu cihazda. "Çekim bitti"
// işi Kurgu aşamasına geçirir (job_stage).
type Kayit = { tur: string; isaretli: Record<string, boolean> };
const yerelAnahtar = (id: number) => `cekim:${id}`;

export default function Cekim() {
  const { id } = useParams();
  return id ? <Liste jobId={Number(id)} /> : <IsSec />;
}

function IsSec() {
  const { profile } = useAuth();
  const { veri } = useVeri();
  const git = useNavigate();
  const isler = veri.jobs.filter((j) => j.status !== "bitti" && (j.assignee === profile!.id || (profile!.is_admin && j.status === "atandi"))).sort((a, b) => a.due.localeCompare(b.due));
  return (
    <div className="ed-sayfa">
      <div className="ed-bas"><div><span className="ed-ust">VİDEO</span><h1>Çekim listesi</h1></div></div>
      <p className="muted" style={{ margin: 0 }}>Çekeceğin işi seç; içerik türüne göre adım adım kontrol listesi açılır.</p>
      {!isler.length ? <div className="ed-bos"><Ikon ad="kamera" /><b>Sana atanmış çekim yok</b><span>Ekip → İşler'de sana bir çekim atandığında burada görünür.</span></div> : (
        <div className="ed-liste">
          {isler.map((j) => { const k = kalan(j.due); return (
            <button key={j.id} className="ed-satir" onClick={() => git(`/cekim/${j.id}`)}>
              <span className="ed-satir-m"><b>{j.title}</b><span className="muted">{[j.type, j.brand].filter(Boolean).join(" · ")}</span></span>
              <span className={k <= 0 ? "ed-sayi gec" : "ed-sayi"}>{k < 0 ? `${-k} gün gecikti` : k === 0 ? "Bugün" : k === 1 ? "Yarın" : kisa(j.due)}</span>
              <Ikon ad="ileri" />
            </button>
          ); })}
        </div>
      )}
    </div>
  );
}

function Liste({ jobId }: { jobId: number }) {
  const { veri } = useVeri();
  const toast = useToast(), git = useNavigate();
  const is = veri.jobs.find((j) => j.id === jobId);
  const [k, setK] = useState<Kayit | null>(null);
  const [dbVar, setDbVar] = useState(true);

  useEffect(() => {
    sb.from("cekim_kontrol").select("tur,isaretli").eq("job_id", jobId).maybeSingle().then(({ data, error }) => {
      if (error) { setDbVar(false); try { const y = localStorage.getItem(yerelAnahtar(jobId)); if (y) { setK(JSON.parse(y)); return; } } catch { /* yok */ } }
      setK(data ? (data as Kayit) : null);
    });
  }, [jobId]);
  useEffect(() => { if (is && k === null) setK({ tur: turTahmin(is.type), isaretli: {} }); }, [is, k]);

  const tur = useMemo(() => TURLER.find((t) => t.id === k?.tur) ?? TURLER[0], [k?.tur]);
  if (!is) return <div className="muted">Yükleniyor…</div>;
  if (!k) return <div className="muted">Yükleniyor…</div>;
  const toplam = maddeSayisi(tur), say = tur.gruplar.reduce((s, g) => s + g.maddeler.filter((m) => k.isaretli[`${g.ad}/${m.k}`]).length, 0);

  async function kaydet(y: Kayit) {
    setK(y);
    try { localStorage.setItem(yerelAnahtar(jobId), JSON.stringify(y)); } catch { /* depolama kapalı */ }
    if (!dbVar) return;
    const { error } = await sb.from("cekim_kontrol").upsert({ job_id: jobId, tur: y.tur, isaretli: y.isaretli, guncelleyen: (await sb.auth.getUser()).data.user?.id, updated_at: new Date().toISOString() });
    if (error) toast("Kaydedilemedi: " + error.message);
  }
  async function bitti() {
    const { error } = await sb.rpc("job_stage", { p_job: jobId, p_stage: "kurgu", p_link: null, p_note: `Çekim listesi ${say}/${toplam}` });
    if (error) { toast(error.message); return; }
    toast("Çekim bitti, iş Kurgu aşamasına geçti."); git("/cekim");
  }

  return (
    <div className="ed-sayfa ed-cekim">
      <div className="ed-cekim-bas">
        <button className="ed-geri" aria-label="Çekim listesine dön" onClick={() => git("/cekim")}><Ikon ad="geri" /></button>
        <div><span className="ed-ust turuncu">ÇEKİM · {kalan(is.due) === 0 ? "BUGÜN" : kisa(is.due).toLocaleUpperCase("tr-TR")}</span><b>{is.title}</b></div>
      </div>
      {is.brief && <p className="ed-brif">{is.brief}</p>}
      <div className="ed-turler" role="group" aria-label="İçerik türü">
        {TURLER.map((t) => <button key={t.id} aria-pressed={t.id === tur.id} onClick={() => t.id !== tur.id && kaydet({ tur: t.id, isaretli: {} })}>{t.ad}</button>)}
      </div>
      <div className="ed-ilerleme"><span><b style={{ width: `${Math.round((say / toplam) * 100)}%` }} /></span><b>{say} / {toplam}</b></div>
      {tur.gruplar.map((g, gi) => (
        <section key={g.ad} className="ed-grup">
          <h2 className="ed-baslik"><span className="ed-no">{gi + 1}</span>{g.ad.toLocaleUpperCase("tr-TR")}</h2>
          {g.maddeler.map((m) => { const a = `${g.ad}/${m.k}`, ok = !!k.isaretli[a]; return (
            <button key={a} className={ok ? "ed-madde tamam" : "ed-madde"} aria-pressed={ok} onClick={() => kaydet({ ...k, isaretli: { ...k.isaretli, [a]: !ok } })}>
              <span className="ed-kutu">{ok && <Ikon ad="check" />}</span>
              <span className="ed-madde-m"><b>{m.t}</b><span>{m.n}</span></span>
            </button>
          ); })}
        </section>
      ))}
      <div className="ed-cekim-alt">
        <button className="btn ed-ana" onClick={bitti}><Ikon ad="check" />Çekim bitti · Kurguya geç</button>
        {!dbVar && <span className="muted">İşaretler şimdilik yalnız bu cihazda saklanıyor.</span>}
      </div>
    </div>
  );
}
