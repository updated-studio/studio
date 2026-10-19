// Ekip sohbeti: üst bölümde zilin yanında. Haber Masası'ndaki sohbetle aynı kanal (tr_chat), her sayfadan açılır.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "./auth";
import { Avatar } from "./Avatar";
import { Ikon } from "./Ikon";
import { sb } from "./supabase";
import { useToast } from "./toast";
import { useVeri } from "./veri";

type Mesaj = { id: number; user_id: string; body: string; created_at: string };
const SON = "sohbet-son-goruldu";
const zaman = (t: string) => {
  const dk = Math.round((Date.now() - Date.parse(t)) / 60000);
  if (dk < 1) return "şimdi"; if (dk < 60) return dk + " dk"; if (dk < 1440) return Math.round(dk / 60) + " sa";
  return new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
};

export default function SohbetDugme() {
  const { profile } = useAuth();
  const { veri } = useVeri();
  const toast = useToast();
  const [acik, setAcik] = useState(false);
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([]);
  const [metin, setMetin] = useState("");
  const [son, setSon] = useState(() => { try { return localStorage.getItem(SON) || ""; } catch { return ""; } });
  const alt = useRef<HTMLDivElement>(null);
  const kutu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sb.from("tr_chat").select("id,user_id,body,created_at").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => data && setMesajlar((data as Mesaj[]).reverse()));
    const kanal = sb.channel("sohbet-ust").on("postgres_changes", { event: "*", schema: "public", table: "tr_chat" }, (p) => {
      if (p.eventType === "INSERT") { const m = p.new as Mesaj; setMesajlar((x) => [...x.filter((y) => y.id > 0 || y.body !== m.body), m].filter((y, i, a) => a.findIndex((z) => z.id === y.id) === i)); }
      if (p.eventType === "DELETE") setMesajlar((x) => x.filter((y) => y.id !== (p.old as Mesaj).id));
    }).subscribe();
    return () => { sb.removeChannel(kanal); };
  }, []);

  const okunmamis = mesajlar.filter((m) => m.id > 0 && m.user_id !== profile?.id && m.created_at > son).length;
  const gorundu = () => { const t = new Date().toISOString(); setSon(t); try { localStorage.setItem(SON, t); } catch { /* yok */ } };
  useEffect(() => { if (acik) { gorundu(); alt.current?.scrollIntoView({ block: "end" }); } }, [acik, mesajlar.length]);
  useEffect(() => {
    if (!acik) return;
    const disari = (e: PointerEvent) => { if (kutu.current && !kutu.current.contains(e.target as Node)) setAcik(false); };
    document.addEventListener("pointerdown", disari);
    return () => document.removeEventListener("pointerdown", disari);
  }, [acik]);

  async function gonder(e: FormEvent) {
    e.preventDefault();
    const body = metin.trim(); if (!body) return;
    setMetin("");
    const gecici: Mesaj = { id: -Date.now(), user_id: profile!.id, body, created_at: new Date().toISOString() };
    setMesajlar((x) => [...x, gecici]);
    const r = await sb.from("tr_chat").insert({ body, user_id: profile!.id });
    if (r.error) { setMesajlar((x) => x.filter((m) => m.id !== gecici.id)); setMetin(body); toast("Gönderilemedi: " + r.error.message); }
  }
  const kisi = (id: string) => veri.profiles.find((p) => p.id === id);

  return (
    <div style={{ position: "relative" }} ref={kutu}>
      <button className="btn ghost sm zil" aria-label="Ekip sohbeti" aria-expanded={acik} onClick={() => setAcik(!acik)}>
        <Ikon ad="sohbet" />{okunmamis > 0 && <em>{okunmamis}</em>}
      </button>
      {acik && (
        <div className="panel bildirimler sohbet-panel">
          <h3>Ekip sohbeti</h3>
          <div className="sohbet">
            {!mesajlar.length && <div className="muted">Henüz mesaj yok.</div>}
            {mesajlar.map((m) => {
              const k = kisi(m.user_id); const benim = m.user_id === profile?.id;
              return (
                <div key={m.id} className={"msj" + (benim ? " ben" : "")}>
                  {k && <Avatar kisi={k} boyut={28} />}
                  <div>
                    <div className="muted" style={{ textAlign: benim ? "right" : "left" }}>{k?.name ?? "?"} · {m.id < 0 ? "gönderiliyor" : zaman(m.created_at)}</div>
                    <div className="govde">{m.body}</div>
                  </div>
                </div>
              );
            })}
            <div ref={alt} />
          </div>
          <form className="row" onSubmit={gonder}>
            <input type="text" value={metin} onChange={(e) => setMetin(e.target.value)} placeholder="Ekibe yaz…" maxLength={500} style={{ flex: "1 1 160px", width: "auto" }} aria-label="Mesaj" autoFocus />
            <button className="btn sm" disabled={!metin.trim()}>Gönder</button>
          </form>
        </div>
      )}
    </div>
  );
}
