import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Ikon } from "../../shared/Ikon";

// İlk giriş rehberi (1 Kasım 2026, kullanıcı: "girişte highlight veya flaş efektiyle nasıl adım adım haber girmeleri gerektiğini ve nelere
// dikkat etmeleri gerektiğini gösterecek"). Ekran kararır, sıradaki alan turuncu çerçeveyle parlar, yanında ne yapılacağı yazar.
// Hedefler data-rehber="…" öznitelikli öğeler; sayfada olmayan adım atlanır. Bir kez bitirilen ya da kapatılan rehber o tarayıcıda
// bir daha kendiliğinden açılmaz; menüdeki "Rehberi yeniden göster" (rehberBaslat) her zaman açar.
export type Adim = { hedef: string; baslik: string; metin: string };

const OLAY = "studyo-rehber";
const gorulduAnahtar = (ad: string) => `rehber-goruldu:${ad}`;
export const rehberBaslat = (ad: string) => window.dispatchEvent(new CustomEvent(OLAY, { detail: ad }));
export const rehberGoruldu = (ad: string) => { try { return localStorage.getItem(gorulduAnahtar(ad)) === "1"; } catch { return true; } };

type Kutu = { top: number; left: number; width: number; height: number };

export default function Rehber({ ad, adimlar, kendiliginden = true }: { ad: string; adimlar: Adim[]; kendiliginden?: boolean }) {
  const [acik, setAcik] = useState(false);
  const [i, setI] = useState(0);
  const [kutu, setKutu] = useState<Kutu | null>(null);
  const var_ = useCallback((a: Adim) => !!document.querySelector(`[data-rehber="${a.hedef}"]`), []);
  const gecerli = adimlar.filter(var_);

  const bitir = useCallback(() => { setAcik(false); try { localStorage.setItem(gorulduAnahtar(ad), "1"); } catch { /* depolama kapalı */ } }, [ad]);

  // İlk açılış: hedefler çizildikten sonra (form yüklenince) başlar
  useEffect(() => {
    if (!kendiliginden || rehberGoruldu(ad)) return;
    let n = 0;
    const t = window.setInterval(() => { n++; if (adimlar.some(var_)) { window.clearInterval(t); setI(0); setAcik(true); } else if (n > 40) window.clearInterval(t); }, 250);
    return () => window.clearInterval(t);
  }, [ad, adimlar, kendiliginden, var_]);
  useEffect(() => {
    const f = (e: Event) => { if ((e as CustomEvent).detail === ad) { setI(0); setAcik(true); } };
    window.addEventListener(OLAY, f); return () => window.removeEventListener(OLAY, f);
  }, [ad]);

  const adim = gecerli[Math.min(i, gecerli.length - 1)];
  const olc = useCallback(() => {
    if (!adim) return;
    const e = document.querySelector<HTMLElement>(`[data-rehber="${adim.hedef}"]`); if (!e) return;
    const r = e.getBoundingClientRect();
    setKutu({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
  }, [adim]);

  useLayoutEffect(() => {
    if (!acik || !adim) return;
    const e = document.querySelector<HTMLElement>(`[data-rehber="${adim.hedef}"]`);
    e?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    olc(); const t = window.setTimeout(olc, 450);
    addEventListener("resize", olc); addEventListener("scroll", olc, true);
    return () => { window.clearTimeout(t); removeEventListener("resize", olc); removeEventListener("scroll", olc, true); };
  }, [acik, adim, olc]);

  useEffect(() => {
    if (!acik) return;
    const tus = (e: KeyboardEvent) => {
      if (e.key === "Escape") bitir();
      else if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, gecerli.length - 1));
      else if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    addEventListener("keydown", tus); return () => removeEventListener("keydown", tus);
  }, [acik, bitir, gecerli.length]);

  if (!acik || !adim || !kutu) return null;
  const son = i >= gecerli.length - 1;
  // Kutu hedefin altına sığmazsa üstüne; telefonda altta sabit
  const dar = innerWidth < 640;
  const altta = kutu.top + kutu.height + 230 < innerHeight;
  const konum: React.CSSProperties = dar ? {} : {
    left: Math.max(16, Math.min(kutu.left, innerWidth - 376)),
    top: altta ? kutu.top + kutu.height + 14 : Math.max(16, kutu.top - 14 - 220),
  };
  return (
    <div className="rehber" role="dialog" aria-modal="true" aria-labelledby="rehber-bas">
      <div className="rehber-isik" style={{ top: kutu.top, left: kutu.left, width: kutu.width, height: kutu.height }} />
      <div className={dar ? "rehber-kutu dar" : "rehber-kutu"} style={konum}>
        <span className="rehber-sira">ADIM {i + 1} / {gecerli.length}</span>
        <h2 id="rehber-bas">{adim.baslik}</h2>
        <p>{adim.metin}</p>
        <div className="rehber-noktalar" aria-hidden="true">{gecerli.map((_, k) => <i key={k} className={k <= i ? "on" : ""} />)}</div>
        <div className="rehber-dugmeler">
          <button type="button" className="btn ghost sm" onClick={bitir}>Rehberi kapat</button>
          <span style={{ flex: 1 }} />
          {i > 0 && <button type="button" className="btn ghost sm" onClick={() => setI(i - 1)}><Ikon ad="geri" />Geri</button>}
          <button type="button" className="btn sm" autoFocus onClick={() => (son ? bitir() : setI(i + 1))}>{son ? "Anladım" : <>Sonraki adım<Ikon ad="ileri" /></>}</button>
        </div>
      </div>
    </div>
  );
}

/** Haber yazma rehberinin adımları (yayın kuralları: site deposu apps/cms/src/lib/triyajKural.ts ve panel kontrol listesi) */
export const HABER_ADIMLARI: Adim[] = [
  { hedef: "baslik", baslik: "Başlığı yaz", metin: "Kim ya da ne, ne oldu, neden önemli. Ürün adı başta olsun; ünlem, \"şok\", \"inanılmaz\" gibi abartılar kullanılmaz. Sızıntı haberiyse başlık \"Sızıntı:\" ile başlar." },
  { hedef: "spot", baslik: "Spot: tek cümle", metin: "Haberi tek cümlede özetle: en önemli rakam ya da ayrıntı burada olsun. Okur yalnız bunu okusa da haberi anlamalı." },
  { hedef: "kapak", baslik: "Kapak görselini seç", metin: "Yatay ve 16:9, en az 1600 piksel genişlikte olmalı. Üreticinin basın görselini kullan ve görselin kaynağını yaz. Yazı ya da logo görselin ortasına gelmesin." },
  { hedef: "kisa", baslik: "Kısa cevap", metin: "2-3 cümle: Google ve yapay zekâ aramalarında görünen özet. \"Ne oldu, ne zaman, ne kadar\" sorularına doğrudan cevap ver." },
  { hedef: "metin", baslik: "Haberin metni", metin: "En az 250 kelime. Ara başlıklarla böl, kaynağı metinde bağlantıyla göster, rakamları kaynağındaki gibi yaz. Görsellerin alt metnini doldur." },
  { hedef: "kategori", baslik: "Kategori ve etiket", metin: "Haberin kategorisini seç. Son dakika etiketi yalnız gerçekten kritik haberde kullanılır: sitenin üstünde akan bant açılır." },
  { hedef: "kontrol", baslik: "Yayın öncesi kontrol", metin: "Bu listedeki her maddeyi gerçekten kontrol edip işaretle: kaynak, başlık, imla, künye, kapak, etiket, alt metin, mobil görünüm. Eksik madde varken yayın yönetmeni haberi geri gönderir." },
  { hedef: "gonder", baslik: "İncelemeye gönder", metin: "Hepsi tamamsa buradan gönder. Yayın yönetmeni bakıp yayınlar ya da düzeltme ister; düzeltme istenirse Bugün ekranında görürsün." },
];
