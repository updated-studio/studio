import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import { Avatar } from "../../shared/Avatar";
import { GorselSecici, hataGorseliYukle, useGorselSecimi } from "../../shared/HataBildir";
import { Ikon } from "../../shared/Ikon";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { useVeri } from "../../shared/veri";

// Bildirilen hatalar (7 Kasım 2026, göç 0071). Yönetici bütün bildirimleri görür, cevaplar, "Çözüldü" der; bildiren kendi bildirimlerini
// ve cevapları görür, cevap yazar. Atama yok (sahiplik yok kuralı). Açık konuşma adreste: #/hatalar?h=<id>.
type Bildirim = { id: number; bildiren: string; metin: string; sayfa: string | null; ortam: Ortam; gorseller: string[]; durum: "acik" | "cozuldu"; cozen: string | null; cozuldu_at: string | null; created_at: string; updated_at: string };
type Ortam = { surum?: string; tarayici?: string; ekran?: string; dil?: string; son_hatalar?: { t: string; m: string }[] };
type Cevap = { id: number; bildirim_id: number; yazar: string; metin: string; gorseller: string[]; created_at: string };

const zaman = (t: string) => {
  const dk = Math.round((Date.now() - Date.parse(t)) / 60000);
  if (dk < 1) return "şimdi"; if (dk < 60) return dk + " dk önce"; if (dk < 1440) return Math.round(dk / 60) + " sa önce";
  return new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const tarayiciAdi = (ua = "") => {
  const m = ua.match(/(Edg|OPR|Chrome|Firefox|Version)\/(\d+)/); const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "";
  const ad = !m ? "" : m[1] === "Edg" ? "Edge" : m[1] === "OPR" ? "Opera" : m[1] === "Version" ? "Safari" : m[1];
  return [ad && `${ad} ${m![2]}`, os].filter(Boolean).join(" · ") || ua.slice(0, 60);
};

function Gorseller({ yollar }: { yollar: string[] }) {
  const [adres, setAdres] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!yollar.length) return;
    sb.storage.from("hata").createSignedUrls(yollar, 3600).then(({ data }) => {
      if (data) setAdres(Object.fromEntries(data.filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string])));
    });
  }, [yollar.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!yollar.length) return null;
  return (
    <div className="hata-resimler">
      {yollar.map((y, i) => adres[y]
        ? <a key={y} href={adres[y]} target="_blank" rel="noreferrer"><img src={adres[y]} alt={`Ekran görüntüsü ${i + 1}`} loading="lazy" /></a>
        : <span key={y} className="hata-resim-bos" />)}
    </div>
  );
}

export default function Hatalar() {
  const { profile } = useAuth();
  const { veri } = useVeri();
  const toast = useToast();
  const yonetici = !!profile?.is_admin;
  const [sp, setSp] = useSearchParams();
  const secili = Number(sp.get("h")) || null;
  const [liste, setListe] = useState<Bildirim[] | null>(null);
  const [sekme, setSekme] = useState<"acik" | "cozuldu">("acik");
  const [cevaplar, setCevaplar] = useState<Cevap[]>([]);
  const [metin, setMetin] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const g = useGorselSecimi();
  const kisi = (id: string | null) => veri.profiles.find((p) => p.id === id);

  const yukle = () => sb.from("hata_bildirimleri").select("*").order("updated_at", { ascending: false }).limit(300)
    .then(({ data, error }) => { if (error) toast("Bildirimler alınamadı: " + error.message); else setListe(data as Bildirim[]); });
  useEffect(() => {
    yukle();
    const k = sb.channel("hatalar").on("postgres_changes", { event: "*", schema: "public", table: "hata_bildirimleri" }, () => yukle()).subscribe();
    return () => { sb.removeChannel(k); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const acik = liste?.find((b) => b.id === secili) ?? null;
  // Adresle açılan bildirim çözülmüşse o sekmeye geç
  useEffect(() => { if (acik) setSekme(acik.durum); }, [acik?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCevaplar([]); setMetin(""); g.temizle();
    if (!secili) return;
    sb.from("hata_cevaplari").select("*").eq("bildirim_id", secili).order("created_at").then(({ data }) => data && setCevaplar(data as Cevap[]));
    const k = sb.channel("hata-cevap-" + secili).on("postgres_changes", { event: "INSERT", schema: "public", table: "hata_cevaplari", filter: `bildirim_id=eq.${secili}` },
      (p) => setCevaplar((x) => x.some((c) => c.id === (p.new as Cevap).id) ? x : [...x, p.new as Cevap])).subscribe();
    return () => { sb.removeChannel(k); };
  }, [secili]); // eslint-disable-line react-hooks/exhaustive-deps

  const gorunen = useMemo(() => (liste ?? []).filter((b) => b.durum === sekme), [liste, sekme]);
  const say = (d: Bildirim["durum"]) => (liste ?? []).filter((b) => b.durum === d).length;

  async function cevapla(e: FormEvent) {
    e.preventDefault();
    const body = metin.trim(); if (!body || !secili || !profile || gonderiliyor) return;
    setGonderiliyor(true);
    try {
      const yollar: string[] = [];
      for (const x of g.gorseller) yollar.push(await hataGorseliYukle(x.dosya, profile.id));
      const r = await sb.from("hata_cevaplari").insert({ bildirim_id: secili, metin: body, gorseller: yollar }).select("*").single();
      if (r.error) throw new Error(r.error.message);
      setCevaplar((x) => x.some((c) => c.id === (r.data as Cevap).id) ? x : [...x, r.data as Cevap]);
      setMetin(""); g.temizle();
    } catch (er) { toast("Gönderilemedi: " + (er as Error).message); }
    finally { setGonderiliyor(false); }
  }

  async function durumDegistir(d: Bildirim["durum"]) {
    if (!acik) return;
    const r = await sb.from("hata_bildirimleri").update({ durum: d }).eq("id", acik.id);
    if (r.error) return toast("Değiştirilemedi: " + r.error.message);
    toast(d === "cozuldu" ? "Çözüldü olarak işaretlendi. Bildirene haber gitti." : "Yeniden açıldı.");
    setSekme(d); yukle();
  }

  const ac = (id: number | null) => setSp(id ? { h: String(id) } : {}, { replace: false });

  return (
    <div className="ed-sayfa hatalar">
      <div className="ed-bas">
        <div><span className="ed-ust">{yonetici ? "YÖNETİM" : "YARDIM"}</span><h1>{yonetici ? "Bildirilen hatalar" : "Bildirdiklerim"}</h1></div>
        <p className="muted hata-acik">{yonetici ? "Ekibin bildirdiği hatalar. Cevabın bildirene bildirim olarak gider." : "Bildirdiğin hatalar ve yöneticilerin cevapları. Yeni bildirim için üst bardaki uyarı düğmesi."}</p>
      </div>

      <div className={"hata-duzen" + (secili ? " secili" : "")}>
        <section className="hata-liste" aria-label="Bildirimler">
          <div className="hata-sekmeler" role="tablist">
            {(["acik", "cozuldu"] as const).map((d) => (
              <button key={d} role="tab" aria-selected={sekme === d} className={sekme === d ? "secili" : ""} onClick={() => setSekme(d)}>
                {d === "acik" ? "Açık" : "Çözüldü"} <span>{liste ? say(d) : "–"}</span>
              </button>
            ))}
          </div>
          {liste === null && <div className="muted hata-bos">Yükleniyor…</div>}
          {liste && !gorunen.length && <div className="muted hata-bos">{sekme === "acik" ? "Açık hata bildirimi yok." : "Çözülmüş bildirim yok."}</div>}
          <ul>
            {gorunen.map((b) => {
              const k = kisi(b.bildiren);
              return (
                <li key={b.id}>
                  <button className={b.id === secili ? "secili" : ""} onClick={() => ac(b.id)} aria-current={b.id === secili}>
                    <span className="hata-satir-ust">{k && <Avatar kisi={k} boyut={22} />}<b>{k?.name ?? "?"}</b><span className="muted">{zaman(b.created_at)}</span></span>
                    <span className="hata-satir-metin">{b.metin}</span>
                    <span className="muted hata-satir-alt">{b.sayfa || "/"}{b.gorseller.length ? ` · ${b.gorseller.length} görsel` : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="hata-konusma" aria-label="Konuşma">
          {!secili && <div className="muted hata-bos">Soldan bir bildirim seç.</div>}
          {secili && !acik && liste && <div className="muted hata-bos">Bu bildirim bulunamadı ya da görme yetkin yok.</div>}
          {acik && (
            <>
              <div className="hata-konusma-bas">
                <button className="btn ghost sm hata-geri" onClick={() => ac(null)}><Ikon ad="geri" />Liste</button>
                <span className="ed-ust">{acik.durum === "acik" ? "AÇIK" : `ÇÖZÜLDÜ${acik.cozuldu_at ? " · " + zaman(acik.cozuldu_at).toLocaleUpperCase("tr") : ""}${kisi(acik.cozen) ? " · " + kisi(acik.cozen)!.name.toLocaleUpperCase("tr") : ""}`}</span>
                {yonetici && (acik.durum === "acik"
                  ? <button className="btn sm" onClick={() => durumDegistir("cozuldu")}><Ikon ad="check" />Çözüldü</button>
                  : <button className="btn ghost sm" onClick={() => durumDegistir("acik")}>Yeniden aç</button>)}
              </div>

              <article className="hata-ilk">
                <div className="hata-satir-ust">{kisi(acik.bildiren) && <Avatar kisi={kisi(acik.bildiren)!} boyut={28} />}<b>{kisi(acik.bildiren)?.name ?? "?"}</b><span className="muted">{zaman(acik.created_at)}</span></div>
                <p className="hata-govde">{acik.metin}</p>
                <Gorseller yollar={acik.gorseller} />
                <dl className="hata-ortam">
                  <dt>Sayfa</dt><dd><Link to={acik.sayfa || "/"}>{acik.sayfa || "/"}</Link></dd>
                  <dt>Tarayıcı</dt><dd>{tarayiciAdi(acik.ortam.tarayici)}{acik.ortam.ekran ? ` · ${acik.ortam.ekran}` : ""}</dd>
                  {acik.ortam.surum && <><dt>Sürüm</dt><dd>{new Date(acik.ortam.surum).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</dd></>}
                </dl>
                {!!acik.ortam.son_hatalar?.length && (
                  <details className="hata-teknik">
                    <summary>Sayfadaki son hata mesajları ({acik.ortam.son_hatalar.length})</summary>
                    <ul>{acik.ortam.son_hatalar.map((h, i) => <li key={i}><span className="muted">{new Date(h.t).toLocaleTimeString("tr-TR")}</span> {h.m}</li>)}</ul>
                  </details>
                )}
              </article>

              <div className="sohbet hata-cevaplar">
                {cevaplar.map((c) => {
                  const k = kisi(c.yazar); const benim = c.yazar === profile?.id;
                  return (
                    <div key={c.id} className={"msj" + (benim ? " ben" : "")}>
                      {k && <Avatar kisi={k} boyut={28} />}
                      <div>
                        <div className="muted" style={{ textAlign: benim ? "right" : "left" }}>{k?.name ?? "?"} · {zaman(c.created_at)}</div>
                        <div className="govde">{c.metin}<Gorseller yollar={c.gorseller} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form className="hata-form hata-cevap" onSubmit={cevapla}>
                <textarea value={metin} onChange={(e) => setMetin(e.target.value)} onPaste={g.yapistir} rows={3} maxLength={4000}
                  placeholder={yonetici && acik.bildiren !== profile?.id ? "Bildirene cevap yaz…" : "Yöneticilere yaz…"} aria-label="Cevap" />
                <GorselSecici s={g} />
                <div className="row hata-alt"><span /><button className="btn sm" disabled={!metin.trim() || gonderiliyor}>{gonderiliyor ? "Gönderiliyor…" : "Gönder"}</button></div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
