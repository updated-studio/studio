import { useState } from "react";
import { useAuth } from "../../shared/auth";
import { Avatar } from "../../shared/Avatar";
import { sb, type Profile } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { useVeri } from "../../shared/veri";
import { HaberKart, useDegerlendir, useFiltre, useIs, useKisi, zamanOnce } from "./ortak";
import { useIyimser, useMasa, type Haber } from "./veri";

export default function Benim({ taslakAc }: { taslakAc: (id: number) => void }) {
  const { v } = useMasa();
  const { profile } = useAuth();
  const { veri } = useVeri();
  const toast = useToast();
  const iyimser = useIyimser();
  const kisi = useKisi();
  const is_ = useIs();
  const degerle = useDegerlendir();
  const ben = profile!.id;
  const [aktarAcik, setAktarAcik] = useState<Haber | null>(null);
  const [kim, setKim] = useState<"ben" | "ekip" | "yayinda">("ben");

  const benim = v.haberler.filter((h) => h.status === "alindi" && h.taken_by === ben);
  const ekip = v.haberler.filter((h) => h.status === "alindi");
  const yayinda = v.haberler.filter((h) => h.status === "yayinda");
  const ham = (kim === "ben" ? benim : kim === "ekip" ? ekip : yayinda)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const filtre = useFiltre(ham, degerle);

  const guncelle = (h: Haber, ek: Partial<Haber>, mesaj?: string) => iyimser(
    (x) => ({ ...x, haberler: x.haberler.map((y) => (y.id === h.id ? { ...y, ...ek } : y)) }),
    () => sb.from("tr_items").update(ek).eq("id", h.id),
    toast,
  ).then((ok) => { if (ok && mesaj) toast(mesaj); });

  async function birak(h: Haber) {
    const ok = await iyimser(
      (x) => ({ ...x, haberler: x.haberler.map((y) => (y.id === h.id ? { ...y, status: "aday", taken_by: null, last_dropped_by: ben, transfer_from: null, transfer_note: "" } : y)) }),
      () => sb.rpc("tr_drop", { p_item: h.id }), toast);
    if (ok) toast("Haber tekrar havuzda.");
  }

  return (
    <>
      <div className="segment" role="group" aria-label="Kimin haberleri">
        <button aria-pressed={kim === "ben"} onClick={() => setKim("ben")}>Benim aldıklarım ({benim.length})</button>
        <button aria-pressed={kim === "ekip"} onClick={() => setKim("ekip")}>Ekip alanlar ({ekip.length})</button>
        <button aria-pressed={kim === "yayinda"} onClick={() => setKim("yayinda")}>Yayında ({yayinda.length})</button>
      </div>
      {filtre.ui}
      {!filtre.sonuc.length && <div className="empty">{kim === "ben" ? "Üzerinde haber yok. Havuzdan bir haber al." : "Bu sekmede haber yok."}</div>}
      <div className="cards">
        {filtre.sonuc.map((h) => {
          const taslaklar = v.taslaklar.filter((t) => t.item_id === h.id);
          const aktaran = kisi(h.transfer_from);
          const calisiyor = h.work_state === "ceviri" || h.work_state === "taslak";
          const bende = h.status === "alindi" && h.taken_by === ben;
          return (
            <HaberKart key={h.id} h={h} ust={
              <>
                {bende && aktaran && !h.transfer_seen && (
                  <div className="msg good row">
                    <Avatar kisi={aktaran} boyut={20} /> {aktaran.name} sana aktardı.{h.transfer_note ? ` “${h.transfer_note}”` : ""}
                    <button className="linkbtn" onClick={() => guncelle(h, { transfer_seen: true })}>Gördüm</button>
                  </div>
                )}
                {h.work_state === "taslak" && <div className="msg good">Taslak yazılıyor…</div>}
                {h.work_state === "hata" && <div className="msg err">Olmadı: {h.work_error}</div>}
              </>
            }>
              {bende && <>
                <button className="btn sm" onClick={() => guncelle(h, { status: "yayinda" }, "Yayında olarak işaretlendi.")}>Yayınladım</button>
                <button className="btn ghost sm" onClick={() => birak(h)}>Bırak</button>
                <button className="btn ghost sm" onClick={() => setAktarAcik(h)}>↪ Aktar</button>
              </>}
              {h.status === "alindi" && !bende && <span className="pill ok">{kisi(h.taken_by)?.name ?? "?"} aldı</span>}
              {h.status === "yayinda" && <>
                <span className="pill ok">Yayında · {kisi(h.taken_by)?.name ?? ""}</span>
                {(h.taken_by === ben || profile!.is_admin) && <button className="btn ghost sm" onClick={() => guncelle(h, { status: "alindi" })}>Geri al</button>}
              </>}
              {h.draft_url && <a className="btn ghost sm" href={h.draft_url} target="_blank" rel="noreferrer">Taslağı aç (eski) ↗</a>}
              {taslaklar.map((t) => <button key={t.id} className="btn ghost sm" onClick={() => taslakAc(t.id)}>Taslağı aç · {zamanOnce(t.updated_at)}</button>)}
              {bende && <button className="btn ghost sm" disabled={calisiyor} onClick={() => is_(h, "taslak")}>{h.work_state === "taslak" ? "Taslak yazılıyor…" : taslaklar.length || h.draft_url ? "Yeni taslak" : "Taslak hazırla"}</button>}
            </HaberKart>
          );
        })}
      </div>
      {aktarAcik && <AktarPenceresi h={aktarAcik} kapat={() => setAktarAcik(null)} kisiler={veri.profiles.filter((p) => p.id !== ben)} />}
    </>
  );
}

/** Eski "Haberi aktar" penceresi: kişi seç, isteğe bağlı not */
function AktarPenceresi({ h, kapat, kisiler }: { h: Haber; kapat: () => void; kisiler: Profile[] }) {
  const toast = useToast();
  const { yenile } = useMasa();
  const [kime, setKime] = useState<string | null>(kisiler.length === 1 ? kisiler[0].id : null);
  const [not, setNot] = useState("");
  const [bitti, setBitti] = useState("");
  const [gonderiyor, setGonderiyor] = useState(false);
  async function aktar() {
    if (!kime) return;
    setGonderiyor(true);
    const r = await sb.rpc("tr_transfer", { p_item: h.id, p_user: kime, p_note: not.trim() });
    setGonderiyor(false);
    if (r.error) { toast(r.error.message); kapat(); return; }
    setBitti(kisiler.find((k) => k.id === kime)?.name ?? "");
    yenile();
    window.setTimeout(kapat, 2500);
  }
  return (
    <div className="perde" onClick={(e) => { if (e.target === e.currentTarget) kapat(); }}>
      <div className="pencere" role="dialog" aria-label="Haberi aktar">
        {bitti ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36 }}>✓</div>
            <h3>{bitti} kişisine aktarıldı</h3>
            <p className="muted">{h.event || h.title}</p>
            <button className="btn" onClick={kapat}>Tamam</button>
          </div>
        ) : (
          <>
            <h3>Haberi aktar</h3>
            <p className="muted">{h.event || h.title}</p>
            <div className="row">
              {kisiler.map((p) => <button key={p.id} className="chip" aria-pressed={kime === p.id} onClick={() => setKime(p.id)}><Avatar kisi={p} boyut={18} />{p.name}</button>)}
            </div>
            <textarea className="alan" rows={2} maxLength={300} value={not} onChange={(e) => setNot(e.target.value)} placeholder="İstersen kısa not ekle (isteğe bağlı)" />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={kapat}>Vazgeç</button>
              <button className="btn" disabled={!kime || gonderiyor} onClick={aktar}>Aktar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
