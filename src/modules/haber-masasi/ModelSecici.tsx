import { useEffect, useState } from "react";
import { useAuth } from "../../shared/auth";
import { sb } from "../../shared/supabase";

// Görsel modeli seçici (4 Kasım 2026, kullanıcı: "model seçimi taslağın içinde olsun; gücü, yeniliği, tahmini ücreti; verileri doğrudan
// firmalardan"). Adlar, açıklamalar ve fiyatlar firmaların kendi sayfalarından (sunucu: triyaj-taslak/uretim.ts MODEL_KATALOG); hesabımızın
// erişebildiği modeller firmanın model listesinden doğrulanır. Ücretli modelleri yalnız yöneticiler seçebilir.
// mod "uret": taslakta seçilenlerle üretir; mod "varsayilan": Ayarlar'da otomatik üretimin kullanacağı modeli kaydeder.
export type KatalogModel = { saglayici: "gpt" | "banana"; id: string; ad: string; aciklama: string; fiyat: string; varsayilan?: boolean; kapaniyor?: string; erisim: boolean };
type Secim = { gpt?: string; gpt_kalite?: string; banana?: string };

// Cloudflare Workers AI modelleri (ücretsiz günlük pay içinde); açıklamalar Cloudflare model kataloğundan
// noron: görsel başına yaklaşık Cloudflare birimi (sunucu: uretim.ts CF_NORON); pay dolunca aşan her 1.000 birim 0,011 $
export const CF_MODELLER: { id: string; ad: string; aciklama: string; noron: number }[] = [
  { id: "klein", ad: "FLUX.2 [klein] 9B", aciklama: "Black Forest Labs; hızlı, damıtılmış model", noron: 1450 },
  { id: "dev", ad: "FLUX.2 [dev]", aciklama: "Black Forest Labs; en gerçekçi ve ayrıntılı FLUX", noron: 6000 },
  { id: "lucid", ad: "Lucid Origin", aciklama: "Leonardo AI; canlı renk, güçlü istem uyumu", noron: 3500 },
];
const cfUcret = (noron: number) => "≈ $" + (noron * 0.011 / 1000).toLocaleString("tr", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export type Katalog = { modeller: KatalogModel[]; secim: Secim; hata: string[]; cf?: { kullanilan: number; sinir: number; bitti: boolean } };
export function useModelKatalog(atla = false) {
  const [veri, setVeri] = useState<Katalog | null>(null);
  useEffect(() => {
    if (atla) return;
    sb.functions.invoke("triyaj-taslak", { body: { gorsel_modeller: true } })
      .then(({ data, error }) => { const d = data as Katalog | null; setVeri(error || !d?.modeller ? { modeller: [], secim: {}, hata: [error?.message ?? "Liste alınamadı"] } : { ...d, hata: d.hata ?? [] }); });
  }, [atla]);
  return veri;
}

const KALITE: [string, string][] = [["low", "Düşük"], ["medium", "Orta (önerilen)"], ["high", "Yüksek"]];

export default function ModelSecici({ mod, uret, kaydet, mesgul, katalog, gomulu }: {
  mod: "uret" | "varsayilan";
  uret?: (s: { modeller: string[]; gpt?: string; banana?: string; kalite?: string }) => void;
  kaydet?: (s: Secim) => void; mesgul?: boolean;
  /** Üst bileşen kataloğu zaten aldıysa (Ayarlar özeti) ikinci kez istenmez */
  katalog?: Katalog | null;
  /** Ayarlar satırının içinde: kendi çerçevesi olmaz */
  gomulu?: boolean;
}) {
  const { profile } = useAuth();
  const yonetici = !!profile?.is_admin;
  const kendi = useModelKatalog(katalog !== undefined);
  const veri = katalog !== undefined ? katalog : kendi;
  const [cf, setCf] = useState<string[]>(["klein", "dev", "lucid"]);
  const [gpt, setGpt] = useState<string>("");
  const [banana, setBanana] = useState<string>("");
  const [kalite, setKalite] = useState("medium");
  useEffect(() => { if (veri && mod === "varsayilan") { setGpt(veri.secim.gpt ?? ""); setBanana(veri.secim.banana ?? ""); setKalite(veri.secim.gpt_kalite ?? "medium"); } }, [veri, mod]);
  if (!veri) return <div className="muted">Modeller firmalardan alınıyor…</div>;
  const grup = (sg: "gpt" | "banana") => veri.modeller.filter((m) => m.saglayici === sg);
  const satir = (m: KatalogModel, secili: boolean, sec: () => void, ad: string) => (
    <label key={m.id} className={"ms-satir" + (secili ? " secili" : "") + (!m.erisim ? " kapali" : "")}>
      <input type="radio" name={ad} checked={secili} disabled={!m.erisim || (mod === "uret" && !yonetici)} onChange={sec} />
      <span className="ms-ad"><b>{m.ad}</b>{m.varsayilan && <span className="pill blue">en yeni</span>}{m.kapaniyor && <span className="pill off">{m.kapaniyor}</span>}{!m.erisim && <span className="pill off">hesapta yok</span>}
        <span className="muted">{m.aciklama}</span></span>
      <span className="ms-fiyat">{m.fiyat}</span>
    </label>
  );
  const hic = (ad: string, secili: boolean, sec: () => void, metin: string) => (
    <label className={"ms-satir" + (secili ? " secili" : "")}><input type="radio" name={ad} checked={secili} onChange={sec} disabled={mod === "uret" && !yonetici} /><span className="ms-ad"><b>{metin}</b></span><span /></label>
  );
  return (
    <div className={"ms" + (gomulu ? " gomulu" : "")}>
      {mod === "uret" && <section>
        <h4>Cloudflare <span className="muted">(günde 10.000 birim ücretsiz; dolunca görsel başı ücretli, her gece 03.00'te yenilenir)</span></h4>
        {veri.cf && <div className="ms-pay">
          <span className="ms-pay-cubuk"><i style={{ width: Math.min(100, Math.round((veri.cf.kullanilan / veri.cf.sinir) * 100)) + "%" }} /></span>
          <span className="muted">{veri.cf.bitti ? "Bugünkü ücretsiz pay bitti; Cloudflare görselleri şu an ücretli." : `Bugün ücretsiz payın ~%${Math.round((veri.cf.kullanilan / veri.cf.sinir) * 100)}'i kullanıldı (tahmini, kalan ~${(veri.cf.sinir - veri.cf.kullanilan).toLocaleString("tr")} birim).`}</span>
        </div>}
        {CF_MODELLER.map((m) => {
          const kalan = veri.cf ? veri.cf.sinir - veri.cf.kullanilan : 10_000;
          const bedava = !veri.cf?.bitti && kalan >= m.noron;
          return (
            <label key={m.id} className={"ms-satir" + (cf.includes(m.id) ? " secili" : "")}>
              <input type="checkbox" checked={cf.includes(m.id)} onChange={(e) => setCf((x) => e.target.checked ? [...x, m.id] : x.filter((y) => y !== m.id))} />
              <span className="ms-ad"><b>{m.ad}</b><span className="muted">{m.aciklama} · görsel başı ~{m.noron.toLocaleString("tr")} birim</span></span>
              <span className="ms-fiyat">{bedava ? "ücretsiz (pay içinde)" : cfUcret(m.noron)}</span>
            </label>
          );
        })}
      </section>}
      <section>
        <h4>OpenAI · GPT Image <span className="muted">(fiyat: görsel başına, 1536×1024)</span></h4>
        {hic("ms-gpt", !gpt, () => setGpt(""), mod === "uret" ? "Kullanma" : "Kendiliğinden: en yeni")}
        {grup("gpt").map((m) => satir(m, gpt === m.id, () => setGpt(m.id), "ms-gpt"))}
        <label className="ms-kalite">Kalite<select value={kalite} onChange={(e) => setKalite(e.target.value)} disabled={mod === "uret" && !yonetici}>{KALITE.map(([k, a]) => <option key={k} value={k}>{a}</option>)}</select></label>
      </section>
      <section>
        <h4>Google · Nano Banana <span className="muted">(fiyat: görsel başına, 16:9)</span></h4>
        {hic("ms-banana", !banana, () => setBanana(""), mod === "uret" ? "Kullanma" : "Kendiliğinden: en yeni")}
        {grup("banana").map((m) => satir(m, banana === m.id, () => setBanana(m.id), "ms-banana"))}
      </section>
      {mod === "uret" && !yonetici && <div className="muted">Ücretli modelleri yalnız yöneticiler seçebilir.</div>}
      {veri.hata.length > 0 && <div className="msg err">{veri.hata.join(" · ")}</div>}
      <div className="muted ms-kaynak">Ad, açıklama ve fiyatlar firmaların kendi sayfalarından (OpenAI görsel üretim rehberi, Google AI Studio fiyatları). "Jeton fiyatından": OpenAI bu model için görsel başı fiyat yazmıyor, jeton fiyatından hesaplandı. "Hesapta yok": firma bu modeli hesabımıza açmıyor.</div>
      {mod === "uret"
        ? <button className="btn sm" disabled={mesgul || (!cf.length && !gpt && !banana)} onClick={() => uret?.({ modeller: [...cf, ...(gpt ? ["gpt"] : []), ...(banana ? ["banana"] : [])], gpt: gpt || undefined, banana: banana || undefined, kalite })}>{mesgul ? "Üretiliyor, denetleniyor…" : `Seçilen ${cf.length + (gpt ? 1 : 0) + (banana ? 1 : 0)} modelle üret`}</button>
        : <button className="btn sm" onClick={() => kaydet?.({ ...(gpt ? { gpt } : {}), ...(banana ? { banana } : {}), gpt_kalite: kalite })}>Kaydet</button>}
    </div>
  );
}
