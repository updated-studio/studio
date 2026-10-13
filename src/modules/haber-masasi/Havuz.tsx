import { useMemo, useState } from "react";
import { useAuth } from "../../shared/auth";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { HaberKart, OncelikBilgisi, SimdiTopla, useDegerlendir, useFiltre, useIs, useKisi, useOnerilen } from "./ortak";
import { sirala } from "./oncelik";
import { useIyimser, useMasa, type Durum, type Haber } from "./veri";

// Eski "Elenenler" kategori çipleri (eleme nedeninden)
export function elKat(n: string) {
  n = (n || "").toLocaleLowerCase("tr");
  if (/gürültü/.test(n)) return "Reklam / gürültü";
  if (/türkiye/.test(n)) return "Türkiye ilgisi yok";
  if (/hariç/.test(n)) return "Hariç markalar";
  if (/limit/.test(n)) return "Aday limiti";
  if (/^tür:/.test(n)) return "Rehber / kampanya";
  return "Diğer";
}

// Havuz (eski "Yeni"), Pas, Belirsiz ve Elenenler aynı listeyi farklı eylemlerle kullanır.
export default function Havuz({ durum }: { durum: Extract<Durum, "aday" | "pas" | "belirsiz" | "elendi" | "rehber"> }) {
  const { v } = useMasa();
  const { profile } = useAuth();
  const toast = useToast();
  const iyimser = useIyimser();
  const kisi = useKisi();
  const is_ = useIs();
  const onerilen = useOnerilen();
  const degerle = useDegerlendir();
  const ben = profile!.id;
  const [ara, setAra] = useState("");
  const [gorunum, setGorunum] = useState<"herkes" | "bana">("herkes");
  const [elKategori, setElKategori] = useState("hepsi");
  const [kac, setKac] = useState(60);

  const { liste: sirali, d } = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase("tr");
    const secili = v.haberler.filter((h) => h.status === durum)
      .filter((h) => !q || [h.event, h.title, h.brand, h.product, h.source_name].join(" ").toLocaleLowerCase("tr").includes(q));
    if (durum === "aday") return sirala(secili, v.oylar, v.haberler);
    return { liste: [...secili].sort((a, b) => Date.parse(b.published_at ?? b.created_at) - Date.parse(a.published_at ?? a.created_at)), d: undefined };
  }, [v.haberler, v.oylar, durum, ara]);
  const filtre = useFiltre(sirali, (h) => d?.get(h.id) ?? degerle(h), durum === "aday" ? "onemli" : "hepsi");

  let liste = durum === "elendi" ? sirali : filtre.sonuc;
  // "Bana göre": önerilen editörü ben olanlar üstte; ortak sıra değişmez, sadece benim görünümüm
  if (durum === "aday" && gorunum === "bana") {
    const bana = (h: Haber) => onerilen(h).some((p) => p.id === ben);
    liste = [...liste.filter(bana), ...liste.filter((h) => !bana(h))];
  }
  const kats = new Map<string, number>();
  if (durum === "elendi") {
    sirali.forEach((h) => kats.set(elKat(h.reason), (kats.get(elKat(h.reason)) ?? 0) + 1));
    if (elKategori !== "hepsi") liste = liste.filter((h) => elKat(h.reason) === elKategori);
  }

  const durumYap = (h: Haber, yeni: Durum, ek: Partial<Haber> = {}, mesaj?: string) => iyimser(
    (x) => ({ ...x, haberler: x.haberler.map((y) => (y.id === h.id ? { ...y, status: yeni, touched: true, ...ek } : y)) }),
    () => sb.from("tr_items").update({ status: yeni, ...ek }).eq("id", h.id),
    toast,
  ).then((ok) => { if (ok && mesaj) toast(mesaj); return ok; });

  async function al(h: Haber) {
    const ok = await iyimser(
      (x) => ({ ...x, haberler: x.haberler.map((y) => (y.id === h.id ? { ...y, status: "alindi", taken_by: ben, touched: true, last_dropped_by: null } : y)) }),
      () => sb.rpc("tr_take", { p_item: h.id }),
      toast,
    );
    if (ok) toast('Haber sende. "Benim aldıklarım" bölümünde.');
  }

  async function yanlisElendi(h: Haber) {
    const ok = await durumYap(h, "elendi", { wrong_by: ben });
    if (ok) toast("Not alındı, kuralı buna göre düzelteceğiz.");
  }

  const ilgiVar = !!(profile!.interests ?? "").trim();
  return (
    <>
      <div className="filtre">
        <input type="search" placeholder="Ara: marka, ürün, kaynak…" value={ara} onChange={(e) => setAra(e.target.value)} aria-label="Haberlerde ara" />
        {durum === "aday" && (
          <div className="segment" role="group" aria-label="Görünüm">
            <button aria-pressed={gorunum === "herkes"} onClick={() => setGorunum("herkes")}>Herkes için</button>
            <button aria-pressed={gorunum === "bana"} onClick={() => setGorunum("bana")} title={ilgiVar ? "Sana önerilenler üstte" : "Profilim'de ilgi alanı girersen çalışır"}>Bana göre</button>
          </div>
        )}
        {durum === "aday" && <SimdiTopla />}
      </div>
      {durum !== "elendi" && filtre.ui}
      {durum === "elendi" && (
        <div className="filtre">
          <button className="chip" aria-pressed={elKategori === "hepsi"} onClick={() => setElKategori("hepsi")}>Hepsi · {sirali.length}</button>
          {[...kats.entries()].map(([k, n]) => <button key={k} className="chip" aria-pressed={elKategori === k} onClick={() => setElKategori(k)}>{k} · {n}</button>)}
        </div>
      )}
      {durum === "aday" && <OncelikBilgisi />}
      {durum === "aday" && gorunum === "bana" && !ilgiVar && <div className="msg err">"Bana göre" için Profilim'de ilgi alanlarını yaz (ör. sony, kamera, playstation).</div>}
      <div className="muted">{liste.length} haber</div>
      {durum === "rehber" && <div className="muted">Yabancı kaynakların rehber ve liste içerikleri ("en iyi 10 kulaklık", "nasıl yapılır"). Kendi rehberimizi yazmak için fikir; puanlanmaz.</div>}
      {!liste.length && <div className="empty">{durum === "aday" ? "Havuz boş. Yeni haberler 15 dakikada bir gelir." : "Burada haber yok."}</div>}
      <div className="cards">
        {liste.slice(0, kac).map((h) => {
          const calisiyor = h.work_state === "taslak";
          return (
            <HaberKart key={h.id} h={h} d={d?.get(h.id)} oyGoster={durum === "aday" || durum === "pas"}
              ust={calisiyor ? <div className="msg good">Taslak yazılıyor…</div> : h.work_state === "hata" ? <div className="msg err">Olmadı: {h.work_error}</div> : undefined}>
              {durum === "aday" && <>
                <button className="btn sm" onClick={() => al(h)}>Ben alıyorum</button>
                <button className="btn ghost sm" onClick={() => durumYap(h, "pas", {}, "Pas geçildi.")}>Pas</button>
                <button className="btn ghost sm" disabled={calisiyor} onClick={() => is_(h, "taslak")}>{calisiyor ? "Taslak yazılıyor…" : "Taslak hazırla"}</button>
              </>}
              {durum === "pas" && <>
                <span className="muted">Pas · {kisi(h.updated_by)?.name ?? ""}</span>
                <button className="btn sm" onClick={() => durumYap(h, "aday", {}, "Haber tekrar havuzda.")}>Geri al</button>
              </>}
              {durum === "belirsiz" && <>
                <button className="btn sm" onClick={() => durumYap(h, "aday", {}, "Havuza alındı.")}>Havuza al</button>
                <button className="btn ghost sm" onClick={() => al(h)}>Al</button>
                <button className="btn ghost sm" onClick={() => durumYap(h, "elendi", { reason: "Ekip eledi" })}>Ele</button>
              </>}
              {durum === "rehber" && <>
                <button className="btn sm" onClick={() => al(h)}>Ben yazarım</button>
                <button className="btn ghost sm" onClick={() => durumYap(h, "elendi", { reason: "Ekip eledi (rehber)" })}>İlgilenmiyoruz</button>
              </>}
              {durum === "elendi" && <>
                <a className="btn ghost sm" href={h.link} target="_blank" rel="noreferrer">Habere bak ↗</a>
                <button className="btn sm" onClick={() => durumYap(h, "aday", { wrong_by: h.wrong_by ?? ben }, "Havuza alındı.")}>Havuza al</button>
                {h.wrong_by
                  ? <span className="muted">Yanlış elenmiş · {kisi(h.wrong_by)?.name ?? ""}</span>
                  : <button className="btn ghost sm" onClick={() => yanlisElendi(h)}>Yanlış elenmiş</button>}
              </>}
            </HaberKart>
          );
        })}
      </div>
      {liste.length > kac && <button className="btn ghost" onClick={() => setKac(kac + 60)}>Daha fazla göster ({liste.length - kac})</button>}
    </>
  );
}
