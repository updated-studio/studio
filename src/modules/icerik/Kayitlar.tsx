// Ekipte ortak kayıtlı tasarımlar. Herkes açıp düzenleyebilir; silme sadece oluşturan ya da yönetici.
import { useEffect, useState } from "react";
import { useAuth } from "../../shared/auth";
import { useToast, hataMetni } from "../../shared/toast";
import { useVeri } from "../../shared/veri";
import { FORMATLAR } from "./motor";
import { listele, sil, satirdanProje, type KayitSatiri } from "./kayit";
import { STILLER } from "./stiller";
import type { Proje } from "./motor";

export default function Kayitlar({ ac, acikId }: { ac: (p: Proje, kopya?: boolean) => void; acikId?: string }) {
  const [liste, setListe] = useState<KayitSatiri[] | null>(null);
  const [hata, setHata] = useState("");
  const [ara, setAra] = useState("");
  const { profile } = useAuth();
  const { veri } = useVeri();
  const toast = useToast();
  const ad = (id: string | null) => veri.profiles.find((p) => p.id === id)?.name ?? "—";

  const yukle = () => listele().then(setListe).catch((e) => setHata(e.message));
  useEffect(() => { yukle(); }, []);

  async function silinsin(r: KayitSatiri) {
    if (!confirm(`"${r.ad}" ve görselleri kalıcı olarak silinsin mi? Geri alınamaz.`)) return;
    try { await sil(r.id); toast("Silindi."); yukle(); } catch (e) { toast(hataMetni(e as Error)); }
  }

  if (hata) return <div className="empty">Kayıtlar yüklenemedi: {hata}</div>;
  if (!liste) return <div className="muted">Yükleniyor…</div>;
  const q = ara.trim().toLocaleLowerCase("tr");
  const gorunen = q ? liste.filter((r) => r.ad.toLocaleLowerCase("tr").includes(q)) : liste;

  return (
    <>
      {liste.length > 8 && <input type="text" placeholder="Kayıtlarda ara" value={ara} onChange={(e) => setAra(e.target.value)} style={{ maxWidth: 360 }} />}
      {!gorunen.length && <div className="empty">{liste.length ? "Aramaya uyan kayıt yok." : "Henüz kayıtlı tasarım yok. Editörde \"Buluta kaydet\" dediğin tasarımlar burada ekiple paylaşılır."}</div>}
      <div className="ie-kayitlar">
        {gorunen.map((r) => {
          const F = FORMATLAR[r.veri.format];
          const silebilir = r.olusturan === profile?.id || profile?.is_admin;
          return (
            <div key={r.id} className="kart ie-kayit">
              <button className="ie-kapak" style={{ aspectRatio: `${F.w} / ${F.h}` }} onClick={() => ac(satirdanProje(r))} aria-label={`${r.ad} aç`}>
                {r.kapak ? <img src={r.kapak} alt="" loading="lazy" /> : <span className="muted">Önizleme yok</span>}
              </button>
              <div className="baslik">{r.ad}{r.id === acikId && <span className="pill blue" style={{ marginLeft: 6 }}>açık</span>}</div>
              <div className="muted">{F.ad} · {STILLER[r.veri.stil]?.ad} · {r.veri.slaytlar.length} slayt</div>
              <div className="muted">{ad(r.guncelleyen ?? r.olusturan)} · {new Date(r.updated_at).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              <div className="alt">
                <button className="btn sm" onClick={() => ac(satirdanProje(r))}>Aç</button>
                <button className="btn ghost sm" onClick={() => ac(satirdanProje(r), true)}>Kopyasını aç</button>
                {silebilir && <button className="btn ghost sm" onClick={() => silinsin(r)} aria-label="Sil">Sil</button>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
