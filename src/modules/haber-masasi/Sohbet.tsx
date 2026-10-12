import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../../shared/auth";
import { Avatar } from "../../shared/Avatar";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { useKisi, zamanOnce } from "./ortak";
import { useMasa } from "./veri";

export default function Sohbet() {
  const { v, guncelle } = useMasa();
  const { profile } = useAuth();
  const kisi = useKisi();
  const toast = useToast();
  const [metin, setMetin] = useState("");
  const alt = useRef<HTMLDivElement>(null);
  useEffect(() => { alt.current?.scrollIntoView({ block: "end" }); }, [v.mesajlar.length]);

  async function gonder(e: FormEvent) {
    e.preventDefault();
    const body = metin.trim();
    if (!body) return;
    setMetin("");
    const gecici = { id: -Date.now(), user_id: profile!.id, body, item_id: null, created_at: new Date().toISOString() };
    guncelle((x) => ({ ...x, mesajlar: [...x.mesajlar, gecici] }));
    const r = await sb.from("tr_chat").insert({ body, user_id: profile!.id });
    if (r.error) {
      guncelle((x) => ({ ...x, mesajlar: x.mesajlar.filter((m) => m.id !== gecici.id) }));
      setMetin(body); toast("Gönderilemedi: " + r.error.message);
    }
  }

  return (
    <div className="panel">
      <div className="sohbet">
        {!v.mesajlar.length && <div className="muted">Henüz mesaj yok.</div>}
        {v.mesajlar.map((m) => {
          const k = kisi(m.user_id);
          const benim = m.user_id === profile!.id;
          return (
            <div key={m.id} className={"msj" + (benim ? " ben" : "")}>
              {k && <Avatar kisi={k} boyut={28} />}
              <div>
                <div className="muted" style={{ textAlign: benim ? "right" : "left" }}>{k?.name ?? "?"} · {m.id < 0 ? "gönderiliyor" : zamanOnce(m.created_at)}</div>
                <div className="govde">{m.body}</div>
              </div>
            </div>
          );
        })}
        <div ref={alt} />
      </div>
      <form className="row" onSubmit={gonder}>
        <input type="text" value={metin} onChange={(e) => setMetin(e.target.value)} placeholder="Ekibe yaz…" maxLength={2000} style={{ flex: "1 1 200px", width: "auto" }} aria-label="Mesaj" />
        <button className="btn" disabled={!metin.trim()}>Gönder</button>
      </form>
    </div>
  );
}
