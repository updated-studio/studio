// Kapak önizleme şeridi (28 Ekim 2026, kullanıcı: "görsel ana sayfada ve telefonda kenardan taşıyor; editör görseli girerken görsün").
// Aynı kapak sitede dört yerde farklı kırpılır: manşet 16:10 (masaüstü), manşet 4:3 (telefon), kart 16:9, yan sütun küçük.
// 3 Kasım 2026 (kullanıcı: "yazıyla beraber nasıl göründüğünü de göstermeli"): manşet karelerinde kategori + başlık sitedeki gibi
// yazı bloğunun arkasındaki koyulukla bindirilir; kart ve yan sütunda başlık görselin altında/yanında.
// Şerit gerçek kırpmayı gösterir; odak noktası (panel focalX/focalY) hangi parçanın kalacağını belirler.
// "Odağı ayarla" paneldeki odak/kırpma aracını açar; "Odağı otomatik bul" yapay zekâya konunun yerini sorar (fonksiyon gorsel-odak).
import { useState } from "react";
import * as api from "./api";
import GorselDuzen from "./GorselDuzen";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";

type Cerceve = { ad: string; oran: string; tur: "manset" | "manset-tel" | "kart" | "yan" };
const CERCEVE: Cerceve[] = [
  { ad: "Manşet · masaüstü", oran: "16 / 10", tur: "manset" }, { ad: "Manşet · telefon", oran: "4 / 3", tur: "manset-tel" },
  { ad: "Kart", oran: "16 / 9", tur: "kart" }, { ad: "Yan sütun", oran: "16 / 9", tur: "yan" },
];

export default function KapakOnizleme({ m, degisti, baslik = "", kategori = "" }: { m: api.Medya; degisti: (d: api.Medya) => void; baslik?: string; kategori?: string }) {
  const toast = useToast();
  const [acik, setAcik] = useState(false);
  const [mesgul, setMesgul] = useState(false);
  const src = `${api.medyaAdres(m.sizes?.card?.url || m.url || "")}?v=${encodeURIComponent(String(m.updatedAt ?? ""))}`;
  const fx = Number(m.focalX ?? 50), fy = Number(m.focalY ?? 50);
  const ayarli = m.focalX != null && m.focalY != null && (Math.round(fx) !== 50 || Math.round(fy) !== 50);
  const yol = `/media/${m.id}`;

  async function otomatik() {
    setMesgul(true);
    try {
      const { data, error } = await sb.functions.invoke("gorsel-odak", { body: { url: api.medyaAdres(m.sizes?.card?.url || m.url || "") } });
      const d = data as { x?: number; y?: number; neden?: string; hata?: string } | null;
      if (error || !d || d.hata || typeof d.x !== "number") { toast("Odak bulunamadı: " + (d?.hata ?? error?.message ?? "yanıt yok")); return; }
      const r = await api.istekYap<{ doc: api.Medya }>(`${yol}?depth=0`, { method: "PATCH", body: JSON.stringify({ focalX: Math.round(d.x), focalY: Math.round(d.y!) }) });
      degisti(r.doc);
      toast(`Odak noktası ayarlandı${d.neden ? ` (${d.neden})` : ""}; küçük boyutlar yeniden üretildi.`);
    } catch (e) { toast((e as Error).message); }
    finally { setMesgul(false); }
  }

  if (!m.url) return null;
  return (
    <div className="ko">
      <div className="ko-serit" aria-label="Sitede böyle görünecek">
        {CERCEVE.map((c) => {
          const img = <img src={src} alt="" style={{ aspectRatio: c.oran, objectPosition: `${fx}% ${fy}%` }} />;
          const b = baslik.trim() || "Başlık burada görünecek";
          return (
            <figure key={c.ad} className={`ko-${c.tur}`}>
              {c.tur === "manset" || c.tur === "manset-tel"
                ? <div className="ko-sahne">{img}<div className="ko-yazi">{kategori && <span className="ko-kat">{kategori}</span>}<b>{b}</b></div></div>
                : c.tur === "yan" ? <div className="ko-yan">{img}<b>{b}</b></div>
                : <>{img}<b className="ko-kart-b">{b}</b></>}
              <figcaption>{c.ad}</figcaption>
            </figure>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        Sitede başlığıyla böyle görünecek. Konu ortada ve etrafında pay olsun; kenarlarda yazı/logo varsa kesilir.
        {ayarli ? " Odak noktası ayarlı." : " Odak noktası ayarlanmamış: kırpma ortadan yapılır."}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn ghost sm" disabled={mesgul} onClick={otomatik}>{mesgul ? "Bakılıyor…" : "Odağı otomatik bul"}</button>
        <button type="button" className="btn ghost sm" onClick={() => setAcik((x) => !x)}>{acik ? "Odak aracını kapat" : "Odağı elle ayarla"}</button>
      </div>
      {acik && <div className="ko-duzen"><GorselDuzen yol={yol} m={m as unknown as Record<string, unknown>} degisti={(d) => degisti(d as unknown as api.Medya)} /></div>}
    </div>
  );
}
