// İçerik editörü: önizleme odaklı. Solda (telefonda üstte) büyük önizleme ve slaytlar,
// sağda şablon ve stil galerisi (senin içeriğinle canlı küçük önizlemeler), görseller ve metinler.
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as RPointerEvent } from "react";
import logoUrl from "../../assets/logo.png";
import { Ikon } from "../../shared/Ikon";
import { BOS_AYAR, FORMATLAR, filtreVar, geriCevir, gorselAl, gorselYukle, icinde, koseler, kutu, logoAyarla, merkez, yazilariYukle, yeniId, type FormatId, type Gorsel, type GorselKey, type Icerik, type KatmanAyar, type MetinKey, type Nokta, type Proje, type Rect, type SablonId, type Serbest, type Slayt, type StilId } from "./motor";
import { SABLONLAR, SABLON_SIRA, etkin, katmanSirasi, slaytCiz, type KatmanSonuc } from "./sablonlar";
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

function Mini({ format, stil, sablon, icerik, surum, olcek = 0.2, serbest }: { format: FormatId; stil: StilId; sablon: SablonId; icerik: Partial<Icerik>; surum: number; olcek?: number; serbest?: Serbest }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => { if (ref.current) slaytCiz(ref.current, format, stil, sablon, etkin(sablon, icerik), false, olcek, serbest); }, 90);
    return () => window.clearTimeout(t);
  }, [format, stil, sablon, icerik, surum, olcek, serbest]);
  const F = FORMATLAR[format];
  return <canvas ref={ref} className="ie-mini" style={{ aspectRatio: `${F.w} / ${F.h}` }} aria-hidden="true" />;
}

// Döndürme tutamacı: üst kenarın ortasından, katmanın dışına doğru biraz yukarıda.
function donmeTutamaci(kk: Nokta[], k: KatmanSonuc): Nokta {
  const u = { x: (kk[0].x + kk[1].x) / 2, y: (kk[0].y + kk[1].y) / 2 }, m = merkez(k.r), mx = m.x + k.t.x, my = m.y + k.t.y;
  const d = Math.hypot(u.x - mx, u.y - my) || 1, uz = 46;
  return { x: u.x + ((u.x - mx) / d) * uz, y: u.y + ((u.y - my) / d) * uz };
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
  const katmanlar = useRef<KatmanSonuc[]>([]);
  const [katmanListe, setKatmanListe] = useState<KatmanSonuc[]>([]);
  const [secK, setSecK] = useState<string | null>(null);
  const rehber = useRef<{ dikey: number[]; yatay: number[] }>({ dikey: [], yatay: [] });

  const i = Math.min(aktif, proje.slaytlar.length - 1);
  const slayt = proje.slaytlar[i];
  const F = FORMATLAR[proje.format];
  const sablon = SABLONLAR[slayt.sablon];
  const ic = useMemo(() => etkin(slayt.sablon, slayt.icerik), [slayt]);
  const yenile = useCallback(() => setSurum((s) => s + 1), []);
  const serbest = slayt.serbest?.[proje.format];
  const serbestAcik = !!serbest;
  useEffect(() => { setSecK(null); }, [i, proje.format, slayt.sablon]);

  // yazı tipleri, logo ve görseller yüklenince yeniden çiz
  useEffect(() => { yazilariYukle().then(yenile); gorselYukle(logoUrl).then((im) => { logoAyarla(im); yenile(); }).catch(() => {}); }, [yenile]);
  useEffect(() => {
    for (const s of proje.slaytlar) for (const k of GORSEL_ANAHTAR) {
      const g = s.icerik[k]; if (g && !gorselAl(g.src)) gorselYukle(g.src).then(yenile).catch(() => setMesaj("Bir görsel açılamadı."));
    }
  }, [proje.slaytlar, yenile]);

  // ana önizleme + kılavuz + (serbest düzende) seçim kutusu, tutamaçlar ve hizalama çizgileri
  const olc = () => F.w / Math.max(1, ust.current?.clientWidth || F.w); // ekranda 1 piksel = tuvalde kaç piksel
  const ustCiz = useCallback(() => {
    const cv = ust.current; if (!cv) return;
    if (cv.width !== F.w) cv.width = F.w; if (cv.height !== F.h) cv.height = F.h;
    const c = cv.getContext("2d")!; const o = F.w / Math.max(1, cv.clientWidth || F.w);
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
    if (serbestAcik) {
      // hizalama çizgileri (sürüklerken)
      c.save(); c.strokeStyle = "#FF2D87"; c.lineWidth = 2 * o; c.setLineDash([]);
      for (const x of rehber.current.dikey) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, F.h); c.stroke(); }
      for (const y of rehber.current.yatay) { c.beginPath(); c.moveTo(0, y); c.lineTo(F.w, y); c.stroke(); }
      c.restore();
      const k = katmanlar.current.find((x) => x.id === secK && !x.t.gizli);
      if (k) {
        const kk = koseler(k.r, k.t), b = kutu(k.r, k.t), g = F.guvenli;
        // kutuda seçim için 6 px pay var; uyarı gerçek kenara göre, 2 px toleransla
        const disari = !icinde({ x: b.x + 6, y: b.y + 6 }, g, 2) || !icinde({ x: b.x + b.w - 6, y: b.y + b.h - 6 }, g, 2);
        const renk = disari ? "#F97316" : "#2563EB";
        c.save(); c.lineWidth = 2.5 * o; c.strokeStyle = renk; c.beginPath(); kk.forEach((p, n) => (n ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.stroke();
        const dt = donmeTutamaci(kk, k);
        c.beginPath(); c.moveTo((kk[0].x + kk[1].x) / 2, (kk[0].y + kk[1].y) / 2); c.lineTo(dt.x, dt.y); c.stroke();
        c.fillStyle = "#fff";
        for (const p of [...kk, dt]) { c.beginPath(); c.arc(p.x, p.y, 7 * o, 0, Math.PI * 2); c.fill(); c.stroke(); }
        if (disari) {
          c.font = `600 ${13 * o}px system-ui`; c.textAlign = "center"; const yaz = "Güvenli alanın dışında";
          const tw = c.measureText(yaz).width + 16 * o, ty = Math.min(F.h - 30 * o, b.y + b.h + 14 * o);
          c.fillStyle = renk; c.beginPath(); c.roundRect(b.x + b.w / 2 - tw / 2, ty, tw, 24 * o, 12 * o); c.fill();
          c.fillStyle = "#fff"; c.textBaseline = "middle"; c.fillText(yaz, b.x + b.w / 2, ty + 12 * o);
        }
        c.restore();
      }
    } else {
      const s = slotlar.current.find((x) => x.k === secili.current && x.r.w < F.w);
      if (s) { c.save(); c.lineWidth = 6; c.strokeStyle = "#2563EB"; c.strokeRect(s.r.x, s.r.y, s.r.w, s.r.h); c.restore(); }
    }
  }, [F, kilavuz, proje.format, serbestAcik, secK]);

  useEffect(() => {
    if (!ana.current) return;
    const sonuc = slaytCiz(ana.current, proje.format, proje.stil, slayt.sablon, ic, false, 1, serbest);
    slotlar.current = sonuc.slotlar; katmanlar.current = sonuc.katmanlar; setKatmanListe(sonuc.katmanlar);
    ustCiz();
  }, [proje.format, proje.stil, slayt.sablon, ic, serbest, surum, ustCiz]);

  // ---------- değişiklikler ----------
  const slaytDegis = (yeniS: Slayt, birlestir?: string) => degistir({ ...proje, slaytlar: proje.slaytlar.map((s, n) => (n === i ? yeniS : s)) }, birlestir);
  const alanDegis = (k: MetinKey, v: string) => slaytDegis({ ...slayt, icerik: { ...slayt.icerik, [k]: v } }, `metin-${i}-${k}`);
  const alanSifirla = (k: MetinKey) => { const n = { ...slayt.icerik }; delete n[k]; slaytDegis({ ...slayt, icerik: n }); };
  const gorselDegis = (k: GorselKey, g: Gorsel | undefined, birlestir?: string) => {
    const n = { ...slayt.icerik }; if (g) n[k] = g; else delete n[k]; slaytDegis({ ...slayt, icerik: n }, birlestir);
  };

  const serbestDegis = (f: (s: Serbest) => Serbest, birlestir?: string) =>
    slaytDegis({ ...slayt, serbest: { ...slayt.serbest, [proje.format]: f(serbest ?? { katman: {}, sira: [] }) } }, birlestir);
  const ayarDegis = (id: string, d: Partial<KatmanAyar>, birlestir?: string) =>
    serbestDegis((x) => ({ ...x, katman: { ...x.katman, [id]: { ...(x.katman[id] ?? BOS_AYAR), ...d } } }), birlestir);
  const ayarOf = (id: string) => serbest?.katman[id] ?? BOS_AYAR;
  const serbestAc = () => serbestDegis(() => ({ katman: {}, sira: [] }));
  function serbestKapat() {
    if (serbest && Object.keys(serbest.katman).length && !confirm(`${F.ad} için yaptığın serbest düzen ayarları silinsin ve şablonun kendi yerleşimine dönülsün mü?`)) return;
    const n = { ...slayt.serbest }; delete n[proje.format]; slaytDegis({ ...slayt, serbest: Object.keys(n).length ? n : undefined }); setSecK(null);
  }
  function siraTasi(id: string, yon: 1 | -1) {
    const ids = katmanSirasi(katmanlar.current.map((k) => k.id), serbest); const a = ids.indexOf(id), b = a + yon;
    if (b < 0 || b >= ids.length) return; [ids[a], ids[b]] = [ids[b], ids[a]];
    serbestDegis((x) => ({ ...x, sira: ids }));
  }
  function ortala(id: string, eksen: "x" | "y") {
    const k = katmanlar.current.find((x) => x.id === id); if (!k) return; const b = kutu(k.r, k.t);
    if (eksen === "x") ayarDegis(id, { x: k.t.x + F.w / 2 - (b.x + b.w / 2) }); else ayarDegis(id, { y: k.t.y + F.h / 2 - (b.y + b.h / 2) });
  }

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
  // Şablon düzeninde: görseli kaydır / yakınlaştır. Serbest düzende: katmanı seç, taşı, köşeden boyutlandır, üstten döndür.
  const isaret = useRef(new Map<number, Nokta>());
  const surukle = useRef<{ k: GorselKey; ox: number; oy: number; mod: "cover" | "contain"; g: Gorsel; mesafe?: number } | null>(null);
  type KSurukle = { tur: "tasi" | "olcek" | "dondur"; id: string; r: Rect; t0: KatmanAyar; p0: Nokta; iki?: { d0: number; a0: number; t0: KatmanAyar } };
  const ksurukle = useRef<KSurukle | null>(null);
  const tuvalNokta = (e: { clientX: number; clientY: number }) => {
    const r = ust.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * F.w, y: ((e.clientY - r.top) / r.height) * F.h };
  };
  const slotBul = (p: Nokta, sadeceZemin = false) => [...slotlar.current].reverse().find((s) => (!sadeceZemin || !s.katman) && icinde(p, s.r));
  const sinir = (v: number, mod: "cover" | "contain") => Math.max(mod === "cover" ? -1 : -3, Math.min(mod === "cover" ? 1 : 3, v));
  const katmanBul = (p: Nokta) => [...katmanlar.current].reverse().find((k) => !k.t.gizli && icinde(geriCevir(p, k.r, k.t), k.r, 6 * olc() / k.t.s));
  const tutamac = (p: Nokta): "olcek" | "dondur" | null => {
    const k = katmanlar.current.find((x) => x.id === secK && !x.t.gizli); if (!k) return null;
    const kk = koseler(k.r, k.t), pay = 14 * olc();
    if (Math.hypot(p.x - donmeTutamaci(kk, k).x, p.y - donmeTutamaci(kk, k).y) < pay) return "dondur";
    return kk.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < pay) ? "olcek" : null;
  };

  // Taşırken mıknatıs: katmanın kenarı/ortası tuvalin ortasına, güvenli alan kenarlarına ya da diğer katmanlara yakınsa oraya oturur.
  function hizala(k: KSurukle, t: KatmanAyar): KatmanAyar {
    const b = kutu(k.r, t), g = F.guvenli, tol = 8 * olc();
    const digerleri = katmanlar.current.filter((x) => x.id !== k.id && !x.t.gizli).map((x) => kutu(x.r, x.t));
    const hx = [0, F.w / 2, F.w, g.x, g.x + g.w, ...digerleri.flatMap((d) => [d.x, d.x + d.w / 2, d.x + d.w])];
    const hy = [0, F.h / 2, F.h, g.y, g.y + g.h, ...digerleri.flatMap((d) => [d.y, d.y + d.h / 2, d.y + d.h])];
    const en = (kendi: number[], hedef: number[]) => {
      let iyi: { fark: number; cizgi: number } | null = null;
      for (const a of kendi) for (const h of hedef) { const f = h - a; if (Math.abs(f) < tol && (!iyi || Math.abs(f) < Math.abs(iyi.fark))) iyi = { fark: f, cizgi: h }; }
      return iyi;
    };
    const sx = en([b.x, b.x + b.w / 2, b.x + b.w], hx), sy = en([b.y, b.y + b.h / 2, b.y + b.h], hy);
    rehber.current = { dikey: sx ? [sx.cizgi] : [], yatay: sy ? [sy.cizgi] : [] };
    return { ...t, x: t.x + (sx?.fark ?? 0), y: t.y + (sy?.fark ?? 0) };
  }
  const yakinAci = (r: number) => { const n = Math.round(r / 15) * 15; return Math.abs(r - n) < 3 ? n : r; };
  const sinirla = (r: number) => ((((r + 180) % 360) + 360) % 360) - 180;

  function basildi(e: RPointerEvent<HTMLCanvasElement>) {
    const p = tuvalNokta(e); isaret.current.set(e.pointerId, p);
    e.currentTarget.focus({ preventScroll: true });
    if (serbestAcik) {
      const d = ksurukle.current;
      if (isaret.current.size === 2 && d) {
        const [a, b] = [...isaret.current.values()];
        d.iki = { d0: Math.hypot(a.x - b.x, a.y - b.y), a0: Math.atan2(b.y - a.y, b.x - a.x), t0: ayarOf(d.id) }; return;
      }
      const tt = tutamac(p);
      const k = tt ? katmanlar.current.find((x) => x.id === secK)! : katmanBul(p);
      if (k) {
        setSecK(k.id); e.currentTarget.setPointerCapture(e.pointerId);
        ksurukle.current = { tur: tt ?? "tasi", id: k.id, r: k.r, t0: ayarOf(k.id), p0: p }; return;
      }
      setSecK(null);
      const z = slotBul(p, true); // katman dışı: arka plan fotoğrafı (Dergi / Vizör / Fiş)
      if (z) { if (!ic[z.k]) gorselSec(z.k); else { e.currentTarget.setPointerCapture(e.pointerId); surukle.current = { k: z.k, ox: z.ox, oy: z.oy, mod: z.mod, g: ic[z.k]! }; } }
      return;
    }
    if (isaret.current.size === 2 && surukle.current) {
      const [a, b] = [...isaret.current.values()]; surukle.current.mesafe = Math.hypot(a.x - b.x, a.y - b.y); surukle.current.g = ic[surukle.current.k]!; return;
    }
    const s = slotBul(p); if (!s) return;
    const g = ic[s.k];
    if (!g) { gorselSec(s.k); return; }
    secili.current = s.k; e.currentTarget.setPointerCapture(e.pointerId);
    surukle.current = { k: s.k, ox: s.ox, oy: s.oy, mod: s.mod, g }; ustCiz();
  }
  function hareket(e: RPointerEvent<HTMLCanvasElement>) {
    const p = tuvalNokta(e); const kd = ksurukle.current;
    if (serbestAcik && kd) {
      if (!isaret.current.has(e.pointerId)) return;
      isaret.current.set(e.pointerId, p);
      const anahtar = `katman-${i}-${kd.id}`;
      if (isaret.current.size === 2 && kd.iki) {
        const [a, b] = [...isaret.current.values()];
        const s = Math.max(0.2, Math.min(4, kd.iki.t0.s * Math.hypot(a.x - b.x, a.y - b.y) / kd.iki.d0));
        const r = sinirla(yakinAci(kd.iki.t0.r + ((Math.atan2(b.y - a.y, b.x - a.x) - kd.iki.a0) * 180) / Math.PI));
        ayarDegis(kd.id, { s, r }, anahtar); return;
      }
      if (kd.tur === "tasi") {
        ayarDegis(kd.id, hizala(kd, { ...kd.t0, x: kd.t0.x + p.x - kd.p0.x, y: kd.t0.y + p.y - kd.p0.y }), anahtar);
      } else {
        const m = merkez(kd.r), mx = m.x + kd.t0.x, my = m.y + kd.t0.y;
        if (kd.tur === "olcek") {
          let s = kd.t0.s * Math.hypot(p.x - mx, p.y - my) / Math.max(1, Math.hypot(kd.p0.x - mx, kd.p0.y - my));
          s = Math.max(0.2, Math.min(4, Math.abs(s - 1) < 0.03 ? 1 : s));
          ayarDegis(kd.id, { s }, anahtar);
        } else {
          const r = kd.t0.r + ((Math.atan2(p.y - my, p.x - mx) - Math.atan2(kd.p0.y - my, kd.p0.x - mx)) * 180) / Math.PI;
          ayarDegis(kd.id, { r: sinirla(yakinAci(r)) }, anahtar);
        }
      }
      return;
    }
    const d = surukle.current;
    if (!d) {
      if (serbestAcik) { const tt = tutamac(p); e.currentTarget.style.cursor = tt === "olcek" ? "nwse-resize" : tt === "dondur" ? "grab" : katmanBul(p) ? "move" : slotBul(p, true) ? "grab" : "default"; return; }
      const s = slotBul(p); e.currentTarget.style.cursor = s ? (ic[s.k] ? "grab" : "pointer") : "default"; return;
    }
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
    if (ksurukle.current?.iki && isaret.current.size === 1) { const [q] = [...isaret.current.values()]; ksurukle.current = { ...ksurukle.current, iki: undefined, t0: ayarOf(ksurukle.current.id), p0: q }; return; }
    if (isaret.current.size === 0) { surukle.current = null; ksurukle.current = null; if (rehber.current.dikey.length || rehber.current.yatay.length) { rehber.current = { dikey: [], yatay: [] }; ustCiz(); } }
  }
  function tus(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!serbestAcik || !secK) return;
    const adim = e.shiftKey ? 10 : 1, t = ayarOf(secK);
    const yon: Record<string, [number, number]> = { ArrowLeft: [-adim, 0], ArrowRight: [adim, 0], ArrowUp: [0, -adim], ArrowDown: [0, adim] };
    if (yon[e.key]) { e.preventDefault(); ayarDegis(secK, { x: t.x + yon[e.key][0], y: t.y + yon[e.key][1] }, `ok-${i}-${secK}`); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); ayarDegis(secK, { gizli: true }); setSecK(null); }
    else if (e.key === "Escape") setSecK(null);
  }
  useEffect(() => {
    const el = ust.current; if (!el) return;
    const tekerlek = (e: WheelEvent) => {
      if (serbestAcik) {
        const k = secK && katmanBul(tuvalNokta(e))?.id === secK ? secK : null; if (!k) return;
        e.preventDefault(); const t = ayarOf(k); ayarDegis(k, { s: Math.max(0.2, Math.min(4, t.s * Math.exp(-e.deltaY * 0.0015))) }, `katman-${i}-${k}`); return;
      }
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
    slaytCiz(cv, proje.format, proje.stil, s.sablon, etkin(s.sablon, s.icerik), true, 1, s.serbest?.[proje.format]);
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
            <button className="ie-ikon" aria-pressed={serbestAcik} onClick={() => (serbestAcik ? serbestKapat() : serbestAc())} aria-label="Serbest düzen" title="Serbest düzen: öğeleri taşı, boyutlandır, döndür"><svg className="i" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg></button>
            <button className="ie-ikon" aria-pressed={kilavuz} onClick={() => setKilavuz(!kilavuz)} aria-label="Güvenli alan kılavuzu" title="Güvenli alan kılavuzu"><svg className="i" viewBox="0 0 24 24"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /></svg></button>
          </div>
        </div>
        <div className="ie-tuval" style={{ aspectRatio: `${F.w} / ${F.h}`, ["--oran" as string]: F.w / F.h }}>
          <canvas ref={ana} role="img" aria-label="Tasarım önizlemesi" />
          <canvas ref={ust} className="ie-ust" tabIndex={0} aria-label="Düzenleme alanı" onKeyDown={tus} onPointerDown={basildi} onPointerMove={hareket} onPointerUp={birakildi} onPointerCancel={birakildi} onPointerLeave={(e) => { if (!surukle.current && !ksurukle.current) e.currentTarget.style.cursor = "default"; }} />
        </div>
        <p className="ie-ipucu">{mesaj || (serbestAcik
          ? "Öğeye dokun: seç. Sürükle: taşı. Köşe: büyüt/küçült. Üstteki nokta: döndür. İki parmak: boyut ve açı. Ok tuşları: ince ayar."
          : sablon.gorseller.length ? "Görsele dokun: yükle. Sürükle: kaydır. Tekerlek ya da iki parmak: yakınlaştır." : "Yazıları sağdaki Metin bölümünden değiştir.")}</p>
        <div className="ie-slaytlar" role="list" aria-label="Slaytlar">
          {proje.slaytlar.map((s, n) => (
            <button key={s.id} role="listitem" className="ie-slayt" aria-current={n === i} onClick={() => setAktif(n)} aria-label={`Slayt ${n + 1}: ${SABLONLAR[s.sablon].ad}`}>
              <Mini format={proje.format} stil={proje.stil} sablon={s.sablon} icerik={s.icerik} surum={surum} olcek={0.08} serbest={s.serbest?.[proje.format]} />
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
                  <button key={id} className="ie-kart" aria-pressed={slayt.sablon === id} onClick={() => { if (id === slayt.sablon) return; if (slayt.serbest) setMesaj("Serbest düzen yeni şablonda baştan başlar."); slaytDegis({ ...slayt, sablon: id, serbest: undefined }); }}>
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

        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>Katmanlar</h3>
            <label className="ie-anahtar"><input type="checkbox" role="switch" checked={serbestAcik} onChange={() => (serbestAcik ? serbestKapat() : serbestAc())} />Serbest düzen</label>
          </div>
          {!serbestAcik ? (
            <span className="muted">Açınca her öğeyi önizlemede tutup taşıyabilir, köşesinden büyütüp küçültebilir, üstteki noktadan döndürebilir, sırasını değiştirip gizleyebilirsin. Taşırken hizalama çizgileri çıkar, güvenli alanın dışına çıkınca uyarır. Sadece bu format ({F.ad}) için geçerli; logo ve zemin sabit kalır.</span>
          ) : (
            <>
              <div className="ie-katmanlar" role="list">
                {[...katmanListe].reverse().map((k, n, dizi) => (
                  <div key={k.id} role="listitem" className="ie-katman" aria-current={secK === k.id}>
                    <button className="ie-katman-ad" onClick={() => setSecK(k.id)} style={{ opacity: k.t.gizli ? 0.45 : 1 }}>{k.ad}</button>
                    <button className="ie-mini-btn" aria-label={k.t.gizli ? `${k.ad}: göster` : `${k.ad}: gizle`} title={k.t.gizli ? "Göster" : "Gizle"} onClick={() => ayarDegis(k.id, { gizli: !k.t.gizli })}>
                      <svg className="i" viewBox="0 0 24 24">{k.t.gizli ? <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 5 9 7a11 11 0 01-2.2 3M6.6 6.6C4.4 8 3 10.4 3 12c0 2 4 7 9 7a9.6 9.6 0 004.2-1" /> : <path d="M3 12c0-2 4-7 9-7s9 5 9 7-4 7-9 7-9-5-9-7zM12 15a3 3 0 100-6 3 3 0 000 6z" />}</svg>
                    </button>
                    <button className="ie-mini-btn" aria-label={`${k.ad}: öne getir`} title="Öne getir" disabled={n === 0} onClick={() => siraTasi(k.id, 1)}>↑</button>
                    <button className="ie-mini-btn" aria-label={`${k.ad}: arkaya gönder`} title="Arkaya gönder" disabled={n === dizi.length - 1} onClick={() => siraTasi(k.id, -1)}>↓</button>
                  </div>
                ))}
              </div>
              {secK && katmanListe.some((k) => k.id === secK) && (() => {
                const t = ayarOf(secK);
                return (
                  <div className="ie-secili">
                    <div className="ie-kontrol"><span className="muted">Boyut</span>
                      <input type="range" min={20} max={400} step={1} value={Math.round(t.s * 100)} aria-label="Boyut" onChange={(e) => ayarDegis(secK, { s: +e.target.value / 100 }, `katman-${i}-${secK}`)} />
                      <span className="mono">%{Math.round(t.s * 100)}</span></div>
                    <div className="ie-kontrol"><span className="muted">Açı</span>
                      <input type="range" min={-180} max={180} step={1} value={Math.round(t.r)} aria-label="Açı" onChange={(e) => ayarDegis(secK, { r: +e.target.value }, `katman-${i}-${secK}`)} />
                      <span className="mono">{Math.round(t.r)}°</span></div>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn ghost sm" onClick={() => ortala(secK, "x")}>Yatayda ortala</button>
                      <button className="btn ghost sm" onClick={() => ortala(secK, "y")}>Dikeyde ortala</button>
                      <button className="btn ghost sm" onClick={() => ayarDegis(secK, { ...BOS_AYAR })}>Bu öğeyi sıfırla</button>
                    </div>
                  </div>
                );
              })()}
              {!secK && <span className="muted">Bir öğeyi düzenlemek için önizlemede ona dokun ya da listeden seç.</span>}
              <div className="row" style={{ gap: 6 }}>
                <button className="btn ghost sm" onClick={() => { serbestDegis(() => ({ katman: {}, sira: [] })); setSecK(null); }}>Düzeni sıfırla</button>
                <button className="btn ghost sm" onClick={serbestKapat}>Şablon düzenine dön</button>
              </div>
            </>
          )}
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
                    <>
                      <div className="ie-kontrol">
                        <span className="muted">Yakınlık</span>
                        <input type="range" min={0.3} max={5} step={0.01} value={g.z} aria-label={`${a.l} yakınlık`}
                          onChange={(e) => gorselDegis(a.k, { ...g, z: +e.target.value }, `zoom-${i}-${a.k}`)} />
                        <button className="btn ghost sm" onClick={() => gorselDegis(a.k, { ...g, z: 1, x: 0, y: 0 })}>Ortala</button>
                      </div>
                      <details className="ie-ayar">
                        <summary>Konum ve renk ayarları</summary>
                        {([["x", "Yatay", -3, 3, 0.01], ["y", "Dikey", -3, 3, 0.01], ["p", "Parlaklık", -100, 100, 1], ["k", "Kontrast", -100, 100, 1], ["d", "Doygunluk", -100, 100, 1]] as const).map(([key, ad, min, max, adim]) => (
                          (key === "x" || key === "y" || filtreVar) && (
                            <div className="ie-kontrol" key={key}>
                              <span className="muted">{ad}</span>
                              <input type="range" min={min} max={max} step={adim} value={g[key] ?? 0} aria-label={`${a.l} ${ad.toLocaleLowerCase("tr")}`}
                                onChange={(e) => gorselDegis(a.k, { ...g, [key]: +e.target.value }, `ayar-${i}-${a.k}-${key}`)} />
                              <span className="mono">{key === "x" || key === "y" ? "" : Math.round(g[key] ?? 0)}</span>
                            </div>
                          )
                        ))}
                        {!filtreVar && <span className="muted">Bu tarayıcı renk ayarlarını desteklemiyor (Chrome ya da güncel Safari'de açılır).</span>}
                        <button className="btn ghost sm" onClick={() => gorselDegis(a.k, { src: g.src, z: g.z, x: 0, y: 0 })}>Ayarları sıfırla</button>
                      </details>
                    </>
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
