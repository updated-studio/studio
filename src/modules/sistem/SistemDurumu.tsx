// Sistem Durumu (25 Ekim 2026; ARCHITECTURE yol haritası, Enes'in devri için): "bir şey bozuldu mu?" sorusunun tek ekranı.
// Veri: sunucu 5 dakikada bir özet yazar (site deposu deploy/altyapi/durum/durum.sh), panel /api/studyo/durum yalnız yöneticiye verir.
// Her satır: ne olduğu, durumu (Çalışıyor / Dikkat / Sorun) ve sade Türkçe açıklama. Ne yapılacağı KURTARMA.md'de.
import { useCallback, useEffect, useState } from "react";
import { istekYap } from "../site/api";
import { Ikon } from "../../shared/Ikon";

type Durum = {
  zaman: string;
  site: { hata: boolean; son_satir: string; son_derleme: string; son_yukleme: string; surum: string;
    icerik: { son_yayin: string | null; bugun: number; incelemede: number; uper: number; yorum_onayda: number } | null };
  studyo: { hata: boolean; son_derleme: string };
  panel: { durum: string; guncelleme: string }; caddy: string;
  yedek: { son: string; hosting: boolean; github: boolean };
  sunucu: { disk_yuzde: number; bos_bellek_mb: number; takas_mb: number; yuk: string };
  kapsayicilar: { ad: string; durum: string; saglikli: boolean }[];
  zamanlanmis_isler: { ad: string; plan: string; son_basari: string | null; hata24: number }[];
  haber_masasi: { son_haber: string | null; son24: number; taslak24: number; kaynak_calisan: number; kaynak_sorunlu: number; sorunlu_kaynaklar: string[]; oto: { durum?: string; zaman?: string } | null } | null;
};
type Seviye = "ok" | "dikkat" | "sorun";
type Satir = { ad: string; seviye: Seviye; metin: string; zaman?: string | null };
// Konu grupları ve simgeleri (25 Ekim 2026, kullanıcı: "simgelerle ayıralım")
const GRUP: [string, string, string[]][] = [
  ["Yayın ve içerik", "icerik", ["Site (updated.com.tr)", "Haber yayını", "Haber Masası (haber toplama)"]],
  ["Uygulamalar", "site", ["Panel (yayın sistemi)", "Stüdyo ekranı", "Veritabanı ve giriş servisleri", "Zamanlanmış işler"]],
  ["Sunucu ve yedek", "bilgisayar", ["Sunucu", "Gece yedeği", "Durum özeti"]],
];
const SIMGE: Record<string, string> = { "Site (updated.com.tr)": "site", "Haber yayını": "icerik", "Haber Masası (haber toplama)": "triyaj", "Panel (yayın sistemi)": "yonetim", "Stüdyo ekranı": "marka", "Veritabanı ve giriş servisleri": "ekip", "Zamanlanmış işler": "saat", "Sunucu": "bilgisayar", "Gece yedeği": "check", "Durum özeti": "saat" };

const SEVIYE: Record<Seviye, [string, string]> = { ok: ["Çalışıyor", "ok"], dikkat: ["Dikkat", "wait"], sorun: ["Sorun", "rose"] };
const saat = (s?: string | null) => (s ? (Date.now() - new Date(s).getTime()) / 36e5 : Infinity);
function once(s?: string | null) {
  if (!s) return "hiç";
  const dk = (Date.now() - new Date(s).getTime()) / 6e4;
  if (dk < 1) return "az önce";
  if (dk < 60) return `${Math.round(dk)} dk önce`;
  if (dk < 60 * 48) return `${Math.round(dk / 60)} sa önce`;
  return `${Math.round(dk / 1440)} gün önce`;
}
// Yedek günlüğü yerel saatle yazar ("2026-10-25 00:16:09", sunucu UTC)
const yedekZaman = (s: string) => (s ? new Date(s.replace(" ", "T") + "Z").toISOString() : null);

function satirlar(d: Durum): Satir[] {
  const s: Satir[] = [];
  const ic = d.site.icerik;
  s.push({ ad: "Site (updated.com.tr)", seviye: d.site.hata ? "sorun" : saat(d.site.son_yukleme) > 26 ? "dikkat" : "ok",
    metin: d.site.hata ? `Son derleme başarısız, yayındaki site eski hâliyle duruyor; 10 dakikada bir yeniden deneniyor. Son satır: ${d.site.son_satir}` : `Son yayın ${once(d.site.son_yukleme)} (sürüm ${d.site.surum}). Her gece 04.00'te ve her değişiklikte yeniden yayınlanır.`, zaman: d.site.son_yukleme });
  if (ic) {
    const gun = saat(ic.son_yayin) / 24;
    s.push({ ad: "Haber yayını", seviye: gun > 2 ? "sorun" : gun > 1 ? "dikkat" : "ok",
      metin: `Bugün ${ic.bugun} haber yayınlandı (hedef 5). Son haber ${once(ic.son_yayin)}. ${ic.incelemede} haber incelemede, yayın onayı bekliyor.`, zaman: ic.son_yayin });
  }
  s.push({ ad: "Panel (yayın sistemi)", seviye: d.panel.durum !== "active" ? "sorun" : d.panel.guncelleme === "failed" ? "dikkat" : "ok",
    metin: d.panel.durum !== "active" ? "Panel çalışmıyor: site yönetimi ve yorumlar etkilenir." : d.panel.guncelleme === "failed" ? "Panel çalışıyor ama son kod güncellemesi başarısız oldu; eski sürüm çalışıyor." : "Çalışıyor; kod değişince kendini 2 dakika içinde günceller." });
  s.push({ ad: "Stüdyo ekranı", seviye: d.studyo.hata ? "dikkat" : "ok",
    metin: d.studyo.hata ? "Son derlemede hata var; Stüdyo eski sürümüyle çalışmaya devam ediyor." : `Son derleme ${once(d.studyo.son_derleme)}.`, zaman: d.studyo.son_derleme });
  const yz = yedekZaman(d.yedek.son);
  s.push({ ad: "Gece yedeği", seviye: !d.yedek.hosting || saat(yz) > 26 ? "sorun" : !d.yedek.github ? "dikkat" : "ok",
    metin: `${d.yedek.hosting ? "Natro hostinge şifreli yedek alındı" : "Natro hostinge yedek ALINAMADI"} (${once(yz)}). ${d.yedek.github ? "İkinci kopya da alındı." : "Natro dışındaki ikinci kopya kapalı (ertelenen iş: yedek)."}`, zaman: yz });
  const bozuk = d.kapsayicilar.filter((k) => !k.saglikli);
  s.push({ ad: "Veritabanı ve giriş servisleri", seviye: bozuk.length ? "sorun" : "ok",
    metin: bozuk.length ? `Sorunlu: ${bozuk.map((k) => `${k.ad} (${k.durum})`).join(", ")}` : `${d.kapsayicilar.length} servis sağlıklı (veritabanı, giriş, Uper girişi, dosyalar, fonksiyonlar).` });
  s.push({ ad: "Sunucu", seviye: d.sunucu.disk_yuzde > 85 || d.sunucu.bos_bellek_mb < 200 ? "sorun" : d.sunucu.disk_yuzde > 70 || d.sunucu.bos_bellek_mb < 400 ? "dikkat" : "ok",
    metin: `Disk %${d.sunucu.disk_yuzde} dolu · boşta ${(d.sunucu.bos_bellek_mb / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} GB bellek · yük ${d.sunucu.yuk}.` });
  const hm = d.haber_masasi;
  if (hm) {
    s.push({ ad: "Haber Masası (haber toplama)", seviye: saat(hm.son_haber) > 3 ? "sorun" : hm.kaynak_sorunlu > 0 ? "dikkat" : "ok",
      metin: `Son 24 saatte ${hm.son24} haber toplandı, ${hm.taslak24} otomatik taslak yazıldı. ${hm.kaynak_calisan} kaynak çalışıyor${hm.kaynak_sorunlu ? `; sorunlu: ${hm.sorunlu_kaynaklar.join(", ")}` : ""}. Otomatik taslak: ${hm.oto?.durum ?? "—"}.`, zaman: hm.son_haber });
  }
  const hatali = d.zamanlanmis_isler.filter((i) => i.hata24 > 0);
  s.push({ ad: "Zamanlanmış işler", seviye: hatali.length ? "dikkat" : "ok",
    metin: hatali.length ? `Son 24 saatte hata veren: ${hatali.map((i) => `${i.ad} (${i.hata24})`).join(", ")}` : `${d.zamanlanmis_isler.length} iş sorunsuz çalışıyor (haber toplama, otomatik taslak, hatırlatmalar, temizlik).` });
  return s;
}

export default function SistemDurumu() {
  const [d, setD] = useState<Durum | null>(null);
  const [hata, setHata] = useState("");
  const yukle = useCallback(async () => {
    try { setD(await istekYap<Durum>("/studyo/durum")); setHata(""); } catch (e) { setHata((e as Error).message); }
  }, []);
  useEffect(() => { yukle(); const t = window.setInterval(yukle, 60_000); return () => window.clearInterval(t); }, [yukle]);

  if (hata && !d) return <section className="panel"><h2>Sistem durumu</h2><div className="msg err">Durum alınamadı: {hata}. Panel kapalı olabilir; bu da bir sorun işaretidir.</div></section>;
  if (!d) return <section className="panel"><h2>Sistem durumu</h2><div className="muted">Yükleniyor…</div></section>;
  const l = satirlar(d);
  if (saat(d.zaman) > 0.3) l.unshift({ ad: "Durum özeti", seviye: "dikkat", metin: `Özet ${once(d.zaman)} yazıldı; 5 dakikada bir yenilenmesi gerekiyordu. Sunucudaki updated-durum zamanlayıcısı çalışmıyor olabilir.` });
  const sorun = l.filter((x) => x.seviye === "sorun").length, dikkat = l.filter((x) => x.seviye === "dikkat").length;
  return (
    <section className="panel sistem">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2>Sistem durumu</h2>
        <span className="muted">Güncellendi {once(d.zaman)} · dakikada bir yenilenir</span>
      </div>
      <div className={"msg" + (sorun ? " err" : dikkat ? "" : " good")}>
        {sorun ? `${sorun} konuda sorun var.` : dikkat ? `Her şey çalışıyor; ${dikkat} konu dikkat istiyor.` : "Her şey çalışıyor."}
        {" "}Ne yapılacağı: site deposundaki KURTARMA.md (Claude'a "Sistem durumunda sorun var" demen yeterli).
      </div>
      {GRUP.map(([gad, gikon, adlar]) => {
        const gl = l.filter((x) => adlar.includes(x.ad));
        if (!gl.length) return null;
        return (
          <div key={gad} className="sistem-g">
            <h3 className="sistem-gb"><Ikon ad={gikon} /> {gad}</h3>
            <ul className="sistem-l">
              {gl.map((x) => (
                <li key={x.ad}>
                  <span className="sistem-ik" aria-hidden="true"><Ikon ad={SIMGE[x.ad] ?? "check"} /></span>
                  <div className="ana"><b>{x.ad}</b><div className="muted">{x.metin}</div></div>
                  <span className={"pill " + SEVIYE[x.seviye][1]}>{SEVIYE[x.seviye][0]}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
