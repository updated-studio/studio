// Takvim aboneliği (25 Ekim 2026, göç 0035 + fonksiyon takvim): kişiye özel bağlantı; telefonun takvimi Stüdyo takvimini saatte bir çeker.
import { useEffect, useState } from "react";
import { sb, SUPABASE_URL } from "../../shared/supabase";
import { useAuth } from "../../shared/auth";
import { hataMetni, useToast } from "../../shared/toast";

export default function Abonelik() {
  const { session } = useAuth();
  const toast = useToast();
  const [anahtar, setAnahtar] = useState<string | null | undefined>(undefined);
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) return;
    sb.from("takvim_anahtarlari").select("anahtar").eq("user_id", uid).maybeSingle().then(({ data }) => setAnahtar(data?.anahtar ?? null));
  }, [uid]);

  async function uret(yenile: boolean) {
    if (yenile && !confirm("Eski bağlantı çalışmayı bırakacak; takvim uygulamasına yenisini eklemen gerekecek. Devam edilsin mi?")) return;
    try {
      if (yenile) await sb.from("takvim_anahtarlari").delete().eq("user_id", uid!);
      const { data, error } = await sb.from("takvim_anahtarlari").insert({ user_id: uid! }).select("anahtar").single();
      if (error) throw error;
      setAnahtar(data.anahtar);
      if (yenile) toast("Yeni bağlantı hazır.");
    } catch (e) { toast(hataMetni(e as { message?: string })); }
  }

  const https = anahtar ? `${SUPABASE_URL}/functions/v1/takvim?k=${anahtar}` : "";
  const webcal = https.replace(/^https:/, "webcal:");
  const kopyala = async () => { try { await navigator.clipboard.writeText(https); toast("Bağlantı kopyalandı."); } catch { toast(https); } };

  return (
    <section className="panel">
      <h2>Telefon takvimine ekle</h2>
      <div className="muted">Lansmanlar, sana atanan işlerin teslim günleri ve ekipman geliş/iade günleri telefonunun takviminde görünür, saatte bir güncellenir. Bağlantı sana özel; kimseyle paylaşma.</div>
      {anahtar === undefined ? <div className="muted">Yükleniyor…</div> : !anahtar ? (
        <div className="row"><button className="btn" onClick={() => uret(false)}>Bağlantımı oluştur</button></div>
      ) : (
        <>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <a className="btn" href={webcal}>iPhone / Mac takvimine ekle</a>
            <a className="btn ghost" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noreferrer">Google Takvim'e ekle</a>
            <button className="btn ghost" onClick={kopyala}>Bağlantıyı kopyala</button>
          </div>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span className="muted" style={{ fontSize: 13 }}>Bağlantı başkasının eline geçtiyse yenile; eskisi çalışmaz olur.</span>
            <button className="btn ghost sm" onClick={() => uret(true)}>Bağlantıyı yenile</button>
          </div>
        </>
      )}
    </section>
  );
}
