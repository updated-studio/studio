import { useAuth } from "../../shared/auth";
import { Ikon } from "../../shared/Ikon";
import { sb } from "../../shared/supabase";
import { kalan, kisa } from "../../shared/tarih";
import { hataMetni, useToast } from "../../shared/toast";
import { useVeri } from "../../shared/veri";
import { adOf } from "./ortak";

export default function EkipmanSayfa() {
  const { veri, yenile } = useVeri();
  const { profile } = useAuth();
  const toast = useToast();
  const yonetici = profile!.is_admin;

  async function islem(p: PromiseLike<{ error: { message: string } | null }>) {
    const r = await p; if (r.error) toast(hataMetni(r.error)); yenile();
  }

  const bolum = (durum: "elimizde" | "yolda", baslik: string, etiket: string) => {
    const l = veri.gear.filter((g) => g.status === durum);
    return <>
      <h3>{baslik}</h3>
      <div className="panel"><div className="liste">
        {l.length ? l.map((g) => (
          <div className="satir" key={g.id}>
            <div className="caticon"><Ikon ad={g.category} /></div>
            <div className="ana"><strong>{g.name}</strong>
              <div className="muted">{g.status === "yolda" ? "Yolda" : g.holder ? adOf(veri, g.holder) + " üzerinde" : "Kimde olduğu girilmedi"}</div></div>
            {g.day && <span className={"due mono " + (kalan(g.day) <= 5 ? "soon" : "")}><Ikon ad="saat" />{etiket} {kisa(g.day)}</span>}
            {yonetici && durum === "yolda" && <button className="btn ghost sm" onClick={() => islem(sb.from("gear").update({ status: "elimizde" }).eq("id", g.id))}>Geldi</button>}
            {yonetici && <button className="btn ghost sm" aria-label="Ekipmanı sil" onClick={() => islem(sb.from("gear").delete().eq("id", g.id))}><Ikon ad="sil" /></button>}
          </div>
        )) : <div className="muted">Kayıt yok.</div>}
      </div></div>
    </>;
  };

  return <><h2>Ekipman</h2>{bolum("elimizde", "Envanterde", "İade")}{bolum("yolda", "Yakında gelecek", "Geliş")}</>;
}
