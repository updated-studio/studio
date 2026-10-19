// İçerik editörü: önizleme odaklı. Solda (telefonda üstte) büyük önizleme ve slaytlar,
// sağda şablon ve stil galerisi (senin içeriğinle canlı küçük önizlemeler), görseller ve metinler.
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as RPointerEvent } from "react";
import logoUrl from "../../assets/logo.png";
import { Ikon } from "../../shared/Ikon";
import { FORMATLAR, gorselAl, gorselYukle, logoAyarla, yazilariYukle, yeniId, type FormatId, type Gorsel, type GorselKey, type Icerik, type MetinKey, type Proje, type SablonId, type Slayt, type StilId } from "./motor";
import { SABLONLAR, SABLON_SIRA, etkin, slaytCiz } from "./sablonlar";
import { STILLER, STIL_SIRA, type Slot } from "./stiller";

type Props = {
  proje: Proje; degistir: (p: Proje, birlestir?: string) => void;
  geri: () => void; ileri: () => void; geriVar: boolean; ileriVar: boolean;
  kaydet: () => void; kaydediliyor: boolean; kirli: boolean; yeni: () => void;
};

const GORSEL_ANAHTAR: GorselKey[] = ["gorsel", "gorselA", "gorselB"];

// Yüklenen dosyayı en fazla 2400 px'e küçültür; saydamlık varsa PNG, yoksa JPEG.
async function dosyaOku(f: File): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    const im = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const s = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(im.naturalWidth * s); cv.height = Math.round(im.naturalHeight * s);
    const c = cv.getContext("2d", { willReadFrequently: true })!; c.drawImage(im, 0, 0, cv.width, cv.height);
    let saydam = false;
    if (f.type === "image/png" || f.type === "image/webp" || f.type === "image/gif") {
      const d = c.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] < 250) { saydam = true; break; }
    }
    return saydam ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.9);
  } finally { URL.revokeObjectURL(url); }
}

function Mini({ format, stil, sablon, icerik, surum, olcek = 0.2 }: { format: FormatId; stil: StilId; sablon: SablonId; icerik: Partial<Icerik>; surum: number; olcek?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => { if (ref.current) slaytCiz(ref.current, format, stil, sablon, etkin(sablon, icerik), false, olcek); }, 90);
    return () => window.clearTimeout(t);
  }, [format, stil, sablon, icerik, surum, olcek]);
  const F = FORMATLAR[format];
  return <canvas ref={ref} className="ie-mini" style={{ aspectRatio: `${F.w} / ${F.h}` }} aria-hidden="true" />;
}

export default function Editor({ proje, degistir, geri, ileri, geriVar, ileriVar, kaydet, kaydediliyor, kirli, yeni }: Props) {
  const [aktif, setAktif] = useState(0);
  const [surum, setSurum] = useState(0);
  const [kilavuz, setKilavuz] = useState(true);
  const [mesaj, setMesaj] = useState("");
  const ana = useRef<HTMLCanvasElement>(null);
  const ust = useRef<HTMLCanvasElement>(null);
  const slotlar = useRef<Slot[]>([]);
  const secili = useRef<GorselKey | null>(null);
  const dosya = useRef<HTMLInputElement>(null);
  const bekleyenAlan = useRef<GorselKey | null>(null);

  const i = Math.min(aktif, proje.slaytlar.length - 1);
  const slayt = proje.slaytlar[i];
  const F = FORMATLAR[proje.format];
  const sablon = SABLONLAR[slayt.sablon];
  const ic = useMemo(() => etkin(slayt.sablon, slayt.icerik), [slayt]);
  const yenile = useCallback(() => setSurum((s) => s + 1), []);

  // yazı tipleri, logo ve görseller yüklenince yeniden çiz
  useEffect(() => { yazilariYukle().then(yenile); gorselYukle(logoUrl).then((im) => { logoAyarla(im); yenile(); }).catch(() => {}); }, [yenile]);
  useEffect(() => {
    for (const s of proje.slaytlar) for (const k of GORSEL_ANAHTAR) {
      const g = s.icerik[k]; if (g && !gorselAl(g.src)) gorselYukle(g.src).then(yenile).catch(() => setMesaj("Bir görsel açılamadı."));
    }
  }, [proje.slaytlar, yenile]);

  // ana önizleme + kılavuz
  const kilavuzCiz = useCallback(() => {
    const cv = ust.current; if (!cv) return;
    cv.width = F.w; cv.height = F.h; const c = cv.getContext("2d")!;
    c.clearRect(0, 0, F.w, F.h);
    if (kilavuz) {
      c.save();
      if (F.izgara) {
        c.fillStyle = "rgba(0,0,0,.42)"; c.fillRect(0, 0, F.w, F.izgara.y); c.fillRect(0, F.izgara.y + F.izgara.h, F.w, F.h - F.izgara.y - F.izgara.h);
        c.font = "600 30px system-ui"; c.fillStyle = "rgba(255,255,255,.9)"; c.textAlign = "center";
        c.fillText("Profil ızgarasında bu bölge kesilir", F.w / 2, F.izgara.y - 24);
      } else if (proje.format === "story") {
        c.fillStyle = "rgba(0,0,0,.32)"; c.fillRect(0, 0, F.w, 200); c.fillRect(0, F.h - 300, F.w, 300);
        c.font = "600 30px system-ui"; c.fillStyle = "rgba(255,255,255,.9)"; c.textAlign = "center";
        c.fillText("Profil çubuğu", F.w / 2, 120); c.fillText("Yanıt alanı", F.w / 2, F.h - 140);
      }
      const g = F.guvenli; c.setLineDash([16, 12]); c.lineWidth = 3;
      c.strokeStyle = "rgba(0,0,0,.35)"; c.strokeRect(g.x + 1.5, g.y + 1.5, g.w, g.h);
      c.strokeStyle = "rgba(255,255,255,.75)"; c.strokeRect(g.x, g.y, g.w, g.h);
      c.restore();
    }
    const s = slotlar.current.find((x) => x.k === secili.current && x.r.w < F.w);
    if (s) { c.save(); c.lineWidth = 6; c.strokeStyle = "#2563EB"; c.strokeRect(s.r.x, s.r.y, s.r.w, s.r.h); c.restore(); }
  }, [F, kilavuz, proje.format]);

  useEffect(() => {
    if (!ana.current) return;
    slotlar.current = slaytCiz(ana.current, proje.format, proje.stil, slayt.sablon, ic);
    kilavuzCiz();
  }, [proje.format, proje.stil, slayt.sablon, ic, surum, kilavuzCiz]);

  // ---------- değişiklikler ----------
  const slaytDegis = (yeniS: Slayt, birlestir?: string) => degistir({ ...proje, slaytlar: proje.slaytlar.map((s, n) => (n === i ? yeniS : s)) }, birlestir);
  const alanDegis = (k: MetinKey, v: string) => slaytDegis({ ...slayt, icerik: { ...slayt.icerik, [k]: v } }, `metin-${i}-${k}`);
  const alanSifirla = (k: MetinKey) => { const n = { ...slayt.icerik }; delete n[k]; slaytDegis({ ...slayt, icerik: n }); };
  const gorselDegis = (k: GorselKey, g: Gorsel | undefined, birlestir?: string) => {
    const n = { ...slayt.icerik }; if (g) n[k] = g; else delete n[k]; slaytDegis({ ...slayt, icerik: n }, birlestir);
  };

  async function dosyaSecildi(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; const k = bekleyenAlan.current; e.target.value = "";
    if (!f || !k) return;
    try {
      const src = await dosyaOku(f); await gorselYukle(src);
      gorselDegis(k, { src, z: 1, x: 0, y: 0 }); secili.current = k;
    } catch { setMesaj("Bu dosya açılamadı. JPG, PNG ya da WebP dene."); }
  }
  const gorselSec = (k: GorselKey) => { bekleyenAlan.current = k; dosya.current?.click(); };

  // ---------- önizlemede sürükle / yakınlaştır ----------
  const isaret = useRef(new Map<number, { x: number; y: number }>());
  const surukle = useRef<{ k: GorselKey; ox: number; oy: number; mod: "cover" | "contain"; g: Gorsel; mesafe?: number } | null>(null);
  const tuvalNokta = (e: { clientX: number; clientY: number }) => {
    const r = ust.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * F.w, y: ((e.clientY - r.top) / r.height) * F.h };
  };
  const slotBul = (p: { x: number; y: number }) => [...slotlar.current].reverse().find((s) => p.x >= s.r.x && p.x <= s.r.x + s.r.w && p.y >= s.r.y && p.y <= s.r.y + s.r.h);
  const sinir = (v: number, mod: "cover" | "contain") => Math.max(mod === "cover" ? -1 : -3, Math.min(mod === "cover" ? 1 : 3, v));

  function basildi(e: RPointerEvent<HTMLCanvasElement>) {
    const p = tuvalNokta(e); isaret.current.set(e.pointerId, p);
    if (isaret.current.size === 2 && surukle.current) {
      const [a, b] = [...isaret.current.values()]; surukle.current.mesafe = Math.hypot(a.x - b.x, a.y - b.y); surukle.current.g = ic[surukle.current.k]!; return;
    }
    const s = slotBul(p); if (!s) return;
    const g = ic[s.k];
    if (!g) { gorselSec(s.k); return; }
    secili.current = s.k; e.currentTarget.setPointerCapture(e.pointerId);
    surukle.current = { k: s.k, ox: s.ox, oy: s.oy, mod: s.mod, g }; kilavuzCiz();
  }
  function hareket(e: RPointerEvent<HTMLCanvasElement>) {
    const d = surukle.current; const p = tuvalNokta(e);
    if (!d) { const s = slotBul(p); e.currentTarget.style.cursor = s ? (ic[s.k] ? "grab" : "pointer") : "default"; return; }
    const once = isaret.current.get(e.pointerId); if (!once) return;
    isaret.current.set(e.pointerId, p);
    if (isaret.current.size === 2 && d.mesafe) {
      const [a, b] = [...isaret.current.values()]; const m = Math.hypot(a.x - b.x, a.y - b.y);
      gorselDegis(d.k, { ...d.g, z: Math.max(d.mod === "cover" ? 1 : 0.3, Math.min(5, d.g.z * (m / d.mesafe))) }, `zoom-${i}-${d.k}`); return;
    }
    const g = ic[d.k]!; const gx = sinir(g.x + (p.x - once.x) / d.ox, d.mod), gy = sinir(g.y + (p.y - once.y) / d.oy, d.mod);
    gorselDegis(d.k, { ...g, x: gx, y: gy }, `surukle-${i}-${d.k}`);
  }
  function birakildi(e: RPointerEvent<HTMLCanvasElement>) {
    isaret.current.delete(e.pointerId);
    if (isaret.current.size === 0) surukle.current = null;
  }
  useEffect(() => {
    const el = ust.current; if (!el) return;
    const tekerlek = (e: WheelEvent) => {
      const s = slotBul(tuvalNokta(e)); if (!s) return; const g = ic[s.k]; if (!g) return;
      e.preventDefault(); secili.current = s.k;
      gorselDegis(s.k, { ...g, z: Math.max(s.mod === "cover" ? 1 : 0.3, Math.min(5, g.z * Math.exp(-e.deltaY * 0.0015))) }, `zoom-${i}-${s.k}`);
    };
    el.addEventListener("wheel", tekerlek, { passive: false });
    return () => el.removeEventListener("wheel", tekerlek);
  });

  // ---------- slaytlar ----------
  const slaytEkle = () => {
    const yeniS: Slayt = { id: yeniId(), sablon: slayt.sablon === "haber" ? "madde" : slayt.sablon, icerik: { kategori: slayt.icerik.kategori, alt: slayt.icerik.alt } };
    const s = [...proje.slaytlar]; s.splice(i + 1, 0, yeniS); degistir({ ...proje, slaytlar: s }); setAktif(i + 1);
  };
  const slaytKopyala = () => { const s = [...proje.slaytlar]; s.splice(i + 1, 0, { ...slayt, id: yeniId() }); degistir({ ...proje, slaytlar: s }); setAktif(i + 1); };
  const slaytSil = () => { if (proje.slaytlar.length < 2) return; degistir({ ...proje, slaytlar: proje.slaytlar.filter((_, n) => n !== i) }); setAktif(Math.max(0, i - 1)); };
  const slaytTasi = (yon: -1 | 1) => {
    const j = i + yon; if (j < 0 || j >= proje.slaytlar.length) return;
    const s = [...proje.slaytlar]; [s[i], s[j]] = [s[j], s[i]]; degistir({ ...proje, slaytlar: s }); setAktif(j);
  };

  // ---------- dışa aktarma ----------
  async function png(n: number): Promise<File> {
    const s = proje.slaytlar[n]; const cv = document.createElement("canvas");
    slaytCiz(cv, proje.format, proje.stil, s.sablon, etkin(s.sablon, s.icerik), true);
    const b = await new Promise<Blob>((ok) => cv.toBlob((x) => ok(x!), "image/png"));
    const ad = `updated-${proje.format}-${proje.slaytlar.length > 1 ? String(n + 1).padStart(2, "0") + "-" : ""}${s.sablon}.png`;
    return new File([b], ad, { type: "image/png" });
  }
  function indir(f: File) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function disaAktar(hepsi: boolean) {
    const dosyalar = hepsi ? await Promise.all(proje.slaytlar.map((_, n) => png(n))) : [await png(i)];
    // Telefonda paylaşım menüsü (Fotoğraflara kaydet / Instagram); yoksa indir.
    const dokunmatik = matchMedia("(pointer: coarse)").matches;
    if (dokunmatik && navigator.canShare?.({ files: dosyalar })) {
      try { await navigator.share({ files: dosyalar }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    for (const [n, f] of dosyalar.entries()) setTimeout(() => indir(f), n * 350);
    setMesaj(dosyalar.length > 1 ? `${dosyalar.length} görsel indiriliyor.` : "Görsel indirildi.");
  }
  useEffect(() => { if (!mesaj) return; const t = setTimeout(() => setMesaj(""), 3500); return () => clearTimeout(t); }, [mesaj]);

  const gruplar = ["Kapak", "Tek post", "Kaydırmalı"] as const;

  return (
    <div className="ie">
      <input ref={dosya} type="file" accept="image/*" hidden onChange={dosyaSecildi} />
      <section className="ie-sahne" aria-label="Önizleme">
        <div className="ie-arac">
          <div className="segment" role="group" aria-label="Format">
            {(Object.keys(FORMATLAR) as FormatId[]).map((f) => (
              <button key={f} aria-pressed={proje.format === f} onClick={() => degistir({ ...proje, format: f })} title={FORMATLAR[f].aciklama}>{FORMATLAR[f].ad}</button>
            ))}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="ie-ikon" onClick={geri} disabled={!geriVar} aria-label="Geri al" title="Geri al"><svg className="i" viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" /></svg></button>
            <button className="ie-ikon" onClick={ileri} disabled={!ileriVar} aria-label="İleri al" title="İleri al"><svg className="i" viewBox="0 0 24 24"><path d="M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3" /></svg></button>
            <button className="ie-ikon" aria-pressed={kilavuz} onClick={() => setKilavuz(!kilavuz)} aria-label="Güvenli alan kılavuzu" title="Güvenli alan kılavuzu"><svg className="i" viewBox="0 0 24 24"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /></svg></button>
          </div>
        </div>
        <div className="ie-tuval" style={{ aspectRatio: `${F.w} / ${F.h}`, ["--oran" as string]: F.w / F.h }}>
          <canvas ref={ana} role="img" aria-label="Tasarım önizlemesi" />
          <canvas ref={ust} className="ie-ust" onPointerDown={basildi} onPointerMove={hareket} onPointerUp={birakildi} onPointerCancel={birakildi} onPointerLeave={(e) => { if (!surukle.current) e.currentTarget.style.cursor = "default"; }} />
        </div>
        <p className="ie-ipucu">{mesaj || (sablon.gorseller.length ? "Görsele dokun: yükle. Sürükle: kaydır. Tekerlek ya da iki parmak: yakınlaştır." : "Yazıları sağdaki Metin bölümünden değiştir.")}</p>
        <div className="ie-slaytlar" role="list" aria-label="Slaytlar">
          {proje.slaytlar.map((s, n) => (
            <button key={s.id} role="listitem" className="ie-slayt" aria-current={n === i} onClick={() => setAktif(n)} aria-label={`Slayt ${n + 1}: ${SABLONLAR[s.sablon].ad}`}>
              <Mini format={proje.format} stil={proje.stil} sablon={s.sablon} icerik={s.icerik} surum={surum} olcek={0.08} />
              <span>{n + 1}</span>
            </button>
          ))}
          <button className="ie-slayt ie-ekle" onClick={slaytEkle} aria-label="Slayt ekle" title="Kaydırmalı post için slayt ekle"><Ikon ad="plus" /></button>
        </div>
        {proje.slaytlar.length > 1 && (
          <div className="row ie-slayt-arac">
            <span className="muted">Slayt {i + 1}/{proje.slaytlar.length}</span>
            <button className="btn ghost sm" onClick={() => slaytTasi(-1)} disabled={i === 0}>← Taşı</button>
            <button className="btn ghost sm" onClick={() => slaytTasi(1)} disabled={i === proje.slaytlar.length - 1}>Taşı →</button>
            <button className="btn ghost sm" onClick={slaytKopyala}>Çoğalt</button>
            <button className="btn ghost sm" onClick={slaytSil}>Sil</button>
          </div>
        )}
        <div className="row ie-eylem">
          <button className="btn" onClick={() => disaAktar(false)}>PNG indir</button>
          {proje.slaytlar.length > 1 && <button className="btn ghost" onClick={() => disaAktar(true)}>Tümünü indir ({proje.slaytlar.length})</button>}
          <button className="btn ghost" onClick={kaydet} disabled={kaydediliyor}>{kaydediliyor ? "Kaydediliyor…" : proje.id ? "Kaydet" : "Buluta kaydet"}</button>
          {kirli && proje.id && <span className="pill wait">Kaydedilmemiş değişiklik</span>}
        </div>
      </section>

      <div className="ie-yan">
        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>Tasarım</h3>
            <button className="linkbtn" onClick={yeni}>Yeni tasarım</button>
          </div>
          <label>Ad<input type="text" value={proje.ad} placeholder="Örnek: iPhone 18 fiyat haberi" maxLength={60} onChange={(e) => degistir({ ...proje, ad: e.target.value }, "ad")} /></label>
        </section>

        <section className="panel">
          <h3>Şablon</h3>
          {gruplar.map((g) => (
            <div key={g} className="ie-grup">
              <span className="muted">{g}</span>
              <div className="ie-galeri">
                {SABLON_SIRA.filter((id) => SABLONLAR[id].grup === g).map((id) => (
                  <button key={id} className="ie-kart" aria-pressed={slayt.sablon === id} onClick={() => slaytDegis({ ...slayt, sablon: id })}>
                    <Mini format={proje.format} stil={proje.stil} sablon={id} icerik={slayt.icerik} surum={surum} olcek={0.16} />
                    <span>{SABLONLAR[id].ad}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="panel">
          <h3>Stil</h3>
          <div className="ie-galeri ie-stiller">
            {STIL_SIRA.map((id) => (
              <button key={id} className="ie-kart" aria-pressed={proje.stil === id} onClick={() => degistir({ ...proje, stil: id })} title={STILLER[id].aciklama}>
                <Mini format={proje.format} stil={id} sablon={slayt.sablon} icerik={slayt.icerik} surum={surum} olcek={0.13} />
                <span>{STILLER[id].ad}</span>
              </button>
            ))}
          </div>
          <span className="muted">Stil bütün slaytlara uygulanır. Yeni marka kiti gelince stiller yenilenecek.</span>
        </section>

        {sablon.gorseller.length > 0 && (
          <section className="panel">
            <h3>Görsel</h3>
            {sablon.gorseller.map((a) => {
              const g = ic[a.k];
              return (
                <div key={a.k} className="ie-gorsel">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong style={{ fontSize: 14 }}>{a.l}</strong>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn sm" onClick={() => gorselSec(a.k)}>{g ? "Değiştir" : "Yükle"}</button>
                      {g && <button className="btn ghost sm" onClick={() => gorselDegis(a.k, undefined)}>Kaldır</button>}
                    </div>
                  </div>
                  {a.yardim && !g && <span className="muted">{a.yardim}</span>}
                  {g && (
                    <div className="ie-kontrol">
                      <span className="muted">Yakınlık</span>
                      <input type="range" min={0.3} max={5} step={0.01} value={g.z} aria-label={`${a.l} yakınlık`}
                        onChange={(e) => gorselDegis(a.k, { ...g, z: +e.target.value }, `zoom-${i}-${a.k}`)} />
                      <button className="btn ghost sm" onClick={() => gorselDegis(a.k, { ...g, z: 1, x: 0, y: 0 })}>Ortala</button>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <section className="panel">
          <h3>Metin</h3>
          {sablon.alanlar.map((a) => {
            const v = ic[a.k]; const degisti = a.k in slayt.icerik;
            return (
              <label key={a.k} className="ie-alan">
                <span className="row" style={{ justifyContent: "space-between" }}>
                  <span>{a.l}</span>
                  <span className="row" style={{ gap: 8 }}>
                    {a.max && <span className={"mono" + (v.length > a.max ? " ie-asim" : "")}>{v.length}/{a.max}</span>}
                    {!degisti && <span className="pill off">örnek</span>}
                    {degisti && <button type="button" className="linkbtn" onClick={() => alanSifirla(a.k)}>örneğe dön</button>}
                  </span>
                </span>
                {a.tip === "uzun"
                  ? <textarea value={v} rows={a.k === "metin" || a.k === "karar" ? 3 : 4} onChange={(e) => alanDegis(a.k, e.target.value)} />
                  : <input type="text" value={v} onChange={(e) => alanDegis(a.k, e.target.value)} />}
                {a.yardim && <span className="muted">{a.yardim}</span>}
              </label>
            );
          })}
        </section>
      </div>
    </div>
  );
}
