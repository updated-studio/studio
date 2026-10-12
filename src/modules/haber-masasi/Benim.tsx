import { useState } from "react";
import { useAuth } from "../../shared/auth";
import { Avatar } from "../../shared/Avatar";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { useVeri } from "../../shared/veri";
import { HaberKart, useKisi, zamanOnce } from "./ortak";
import { useIyimser, useMasa, type Haber } from "./veri";

export default function Benim({ taslakAc }: { taslakAc: (id: number) => void }) {
  const { v } = useMasa();
  const { profile } = useAuth();
  const { veri } = useVeri();
  const toast = useToast();
  const iyimser = useIyimser();
  const kisi = useKisi();
  const ben = profile!.id;
  const [aktarAcik, setAktarAcik] = useState<number | null>(null);
  const [ceviriAcik, setCeviriAcik] = useState<number | null>(null);
  const [kim, setKim] = useState<"ben" | "ekip" | "yayinda">("ben");

  const benim = v.haberler.filter((h) => h.status === "alindi" && h.taken_by === ben);
  const ekip = v.haberler.filter((h) => h.status === "alindi" && h.taken_by && h.taken_by !== ben);
  const yayinda = v.haberler.filter((h) => h.status === "yayinda");
  const liste = kim === "ben" ? benim : kim === "ekip" ? ekip : yayinda;

  async function is_(h: Haber, tur: "ceviri" | "taslak") {
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { item_id: h.id, tur } });
    if (error) {
      let m = error.message;
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.hata) m = j.hata; } catch { /* yok */ }
      return toast("Başlatılamadı: " + m);
    }
    if (data?.basladi) toast(tur === "ceviri" ? "Çeviri hazırlanıyor (yarım dakika kadar)." : "Taslak hazırlanıyor (yarım dakika kadar). Hazır olunca Taslaklar'da.");
  }

  const guncelle = (h: Haber, ek: Partial<Haber>, mesaj?: string) => iyimser(
    (x) => ({ ...x, haberler: x.haberler.map((y) => (y.id === h.id ? { ...y, ...ek } : y)) }),
    () => sb.from("tr_items").update(ek).eq("id", h.id),
    toast,
  ).then((ok) => { if (ok && mesaj) toast(mesaj); });

  async function birak(h: Haber) {
    const ok = await iyimser(
      (x) => ({ ...x, haberler: x.haberler.map((y) => (y.id === h.id ? { ...y, status: "aday", taken_by: null } : y)) }),
      () => sb.rpc("tr_drop", { p_item: h.id }), toast);
    if (ok) toast("Havuza geri bıraktın.");
  }

  async function aktar(h: Haber, kime: string) {
    setAktarAcik(null);
    const ok = await iyimser(
      (x) => ({ ...x, haberler: x.haberler.map((y) => (y.id === h.id ? { ...y, taken_by: kime, transfer_from: ben, transfer_seen: false } : y)) }),
      () => sb.rpc("tr_transfer", { p_item: h.id, p_user: kime }), toast);
    if (ok) toast("Aktarıldı: " + (kisi(kime)?.name ?? ""));
  }

  return (
    <>
      <div className="segment" role="group" aria-label="Kimin haberleri">
        <button aria-pressed={kim === "ben"} onClick={() => setKim("ben")}>Benim ({benim.length})</button>
        <button aria-pressed={kim === "ekip"} onClick={() => setKim("ekip")}>Ekibin ({ekip.length})</button>
        <button aria-pressed={kim === "yayinda"} onClick={() => setKim("yayinda")}>Yayında</button>
      </div>
      {!liste.length && <div className="empty">{kim === "ben" ? "Üzerinde haber yok. Havuzdan bir haber al." : "Burada haber yok."}</div>}
      <div className="cards">
        {liste.map((h) => {
          const taslaklar = v.taslaklar.filter((t) => t.item_id === h.id);
          const aktaran = kisi(h.transfer_from);
          const calisiyor = h.work_state === "ceviri" || h.work_state === "taslak";
          return (
            <HaberKart key={h.id} h={h} oylar={v.oylar} ust={
              <>
                {h.taken_by === ben && aktaran && !h.transfer_seen && (
                  <div className="msg good row">
                    <Avatar kisi={aktaran} boyut={20} /> {aktaran.name} sana aktardı.
                    <button className="linkbtn" onClick={() => guncelle(h, { transfer_seen: true })}>Gördüm</button>
                  </div>
                )}
                {calisiyor && <div className="msg good">{h.work_state === "ceviri" ? "Çeviri" : "Taslak"} hazırlanıyor…</div>}
                {h.work_state === "hata" && <div className="msg err">Olmadı: {h.work_error}</div>}
              </>
            }>
              {kim !== "yayinda" && <>
                <button className="btn sm" disabled={calisiyor} onClick={() => is_(h, "taslak")}>{taslaklar.length ? "Yeni taslak" : "Taslak hazırla"}</button>
                <button className="btn ghost sm" disabled={calisiyor} onClick={() => (h.translation ? setCeviriAcik(ceviriAcik === h.id ? null : h.id) : is_(h, "ceviri"))}>
                  {h.translation ? (ceviriAcik === h.id ? "Çeviriyi kapat" : "Çeviri") : "Çevir"}
                </button>
              </>}
              {taslaklar.map((t) => <button key={t.id} className="btn ghost sm" onClick={() => taslakAc(t.id)}>Taslak · {zamanOnce(t.updated_at)}</button>)}
              {kim === "ben" && <>
                <button className="btn ghost sm" onClick={() => setAktarAcik(aktarAcik === h.id ? null : h.id)}>Aktar</button>
                <button className="btn ghost sm" onClick={() => birak(h)}>Bırak</button>
                <button className="btn ghost sm" onClick={() => guncelle(h, { status: "yayinda" }, "Yayında olarak işaretlendi.")}>Yayında</button>
              </>}
              {kim === "yayinda" && <button className="btn ghost sm" onClick={() => guncelle(h, { status: "alindi" })}>Geri al</button>}
              {aktarAcik === h.id && (
                <div className="row" style={{ width: "100%" }}>
                  {veri.profiles.filter((p) => p.id !== ben).map((p) => (
                    <button key={p.id} className="chip" onClick={() => aktar(h, p.id)}><Avatar kisi={p} boyut={18} />{p.name}</button>
                  ))}
                </div>
              )}
              {ceviriAcik === h.id && h.translation && (
                <div className="onizleme panel" style={{ width: "100%", whiteSpace: "pre-wrap" }}>{h.translation}</div>
              )}
            </HaberKart>
          );
        })}
      </div>
    </>
  );
}
