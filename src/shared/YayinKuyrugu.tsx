// Yayın kuyruğu (25 Ekim 2026, Fatih: "yayına Nehir, Fatih, Enes basar"): yönetici ve yayın yönetmeni her ekranın üstünde
// bugün kaç haber yayınlandığını (hedef 5) ve incelemede bekleyenleri görür; "Kuyruğu aç" Site → Haberler → İncelemede'ye götürür.
// Sayılar panelden (Stüdyo girişiyle, panel kuralları geçerli); 5 dakikada bir ve sekmeye dönünce yenilenir. Hatırlatma bildirimi: göç 0033.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./auth";
import { istekYap, sayi, type Koleksiyon } from "../modules/site/api";

export const GUNLUK_HEDEF = 5;
const YAYINCI = ["admin", "yayin-yonetmeni"];
const TURLER: Koleksiyon[] = ["news", "reviews", "comparisons"];

/** İstanbul saatiyle bugünün başlangıcı (ISO) */
function bugunBasi() {
  const g = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  return new Date(`${g}T00:00:00+03:00`).toISOString();
}

export default function YayinKuyrugu() {
  const { profile } = useAuth();
  const yayinci = !!profile && YAYINCI.includes(profile.site_rol);
  const [d, setD] = useState<{ bugun: number; bekleyen: number; taslak: number } | null>(null);

  const yukle = useCallback(async () => {
    if (!yayinci || document.hidden) return;
    try {
      const bas = encodeURIComponent(bugunBasi());
      const yayinlanan = await Promise.all(TURLER.map((k) =>
        istekYap<{ totalDocs: number }>(`/${k}?where[and][0][_status][equals]=published&where[and][1][publishedAt][greater_than_equal]=${bas}&depth=0&limit=1`).then((x) => x.totalDocs)));
      const bekleyen = await Promise.all(TURLER.map((k) => sayi(k, "incelemede")));
      const taslak = await sayi("news", "taslak");
      setD({ bugun: yayinlanan.reduce((a, b) => a + b, 0), bekleyen: bekleyen.reduce((a, b) => a + b, 0), taslak });
    } catch { setD(null); } // panel kapalıysa şerit görünmez
  }, [yayinci]);

  useEffect(() => {
    yukle();
    const t = window.setInterval(yukle, 5 * 60_000);
    const g = () => { if (!document.hidden) yukle(); };
    document.addEventListener("visibilitychange", g);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", g); };
  }, [yukle]);

  if (!yayinci || !d) return null;
  const tamam = d.bugun >= GUNLUK_HEDEF;
  return (
    <section className="panel yayin-kuyrugu" aria-label="Yayın kuyruğu">
      <div className="yk-sayac" title={`Günlük hedef ${GUNLUK_HEDEF} haber`}>
        <b className={tamam ? "ok" : undefined}>{d.bugun}/{GUNLUK_HEDEF}</b>
        <span className="muted">bugün yayınlanan</span>
      </div>
      <div className="yk-cubuk" aria-hidden="true"><i style={{ width: `${Math.min(100, (d.bugun / GUNLUK_HEDEF) * 100)}%` }} /></div>
      <div className="yk-metin">
        {d.bekleyen > 0
          ? <><b>{d.bekleyen}</b> içerik incelemede, yayın onayı bekliyor</>
          : d.taslak > 0 ? <>İncelemede bekleyen yok · <b>{d.taslak}</b> taslak var</> : <>Kuyruk boş</>}
      </div>
      <Link className={"btn sm" + (d.bekleyen > 0 ? "" : " ghost")} to={`/site?bolum=news&sekme=${d.bekleyen > 0 ? "incelemede" : "taslak"}`}>Kuyruğu aç</Link>
    </section>
  );
}
