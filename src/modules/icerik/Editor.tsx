// İçerik editörü: önizleme odaklı. Solda (telefonda üstte) büyük önizleme ve slaytlar, sağda düzenleme.
// Önizlemede bir öğeye dokununca sağda o öğenin kendi kartı açılır (yazısı, görseli, boyutu, açısı, yazı boyutu).
// Öğeyi sürüklemeye başlayınca serbest düzen kendiliğinden açılır; fotoğraflı öğeye ikinci dokunuş içindeki fotoğrafı seçer.
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import logoUrl from "../../assets/logo.png";
import { useAuth } from "../../shared/auth";
import { Ikon } from "../../shared/Ikon";
import { hataMetni } from "../../shared/toast";
import { duzenKaydet, duzenler, duzenSil, type Duzen } from "./kayit";
import {
  BOS_AYAR, FORMATLAR, filtreVar, geriCevir, gorselAl, gorselYukle, icinde, ileriCevir, koseler, kutu, logoAyarla, merkez, rectKose,
  yazilariYukle, yeniId, type FormatId, type Gorsel, type GorselKey, type Icerik, type KatmanAyar, type MetinKey, type Nokta, type Proje,
  type Rect, type SablonId, type Serbest, type Slayt, type StilId,
} from "./motor";
import { SABLONLAR, SABLON_SIRA, etkin, katmanSirasi, slaytCiz, type KatmanSonuc } from "./sablonlar";
import { STILLER, STIL_SIRA, type Slot } from "./stiller";

type Props = {
  proje: Proje; degistir: (p: Proje, birlestir?: string) => void;
  geri: () => void; ileri: () => void; geriVar: boolean; ileriVar: boolean;
  kaydet: () => void; kaydediliyor: boolean; kirli: boolean; yeni: () => void;
};

const GORSEL_ANAHTAR: GorselKey[] = ["gorsel", "gorselA", "gorselB"];
// Hangi katman hangi alanları gösterir (öğe kartı). Alt yazı zeminde olduğu için Metin bölümünde kalır.
const ALAN_KATMAN: Record<string, MetinKey[]> = {
  etiket: ["kategori"], baslik: ["baslik", "vurgu"], metin: ["metin"], maddeler: ["maddeler"], bilgiler: ["bilgiler"],
  puan: ["puan", "puanAlti", "altPuanlar"], karar: ["karar"], imza: ["karar"], tablo: ["satirlar"], ikiFoto: ["urunA", "urunB"],
};
const GORSEL_KATMAN: Record<string, GorselKey[]> = { foto: ["gorsel"], ikiFoto: ["gorselA", "gorselB"] };
const YAZILI = new Set(["etiket", "baslik", "metin", "maddeler", "bilgiler", "puan", "karar", "imza", "tablo", "tirnak", "ikiFoto"]);
const GENISLIK = new Set(["baslik", "metin", "maddeler", "bilgiler", "karar", "imza", "tablo", "puan"]);
const ZEMIN = "zemin"; // arka plan fotoğrafı (Dergi / Vizör / Fiş): katman değil, sadece içi düzenlenir

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

// Döndürme tutamacı: üst kenarın ortasından, merkezden dışa doğru biraz yukarıda.
function donmeTutamaci(kk: Nokta[], m: Nokta, uz = 46): Nokta {
  const u = { x: (kk[0].x + kk[1].x) / 2, y: (kk[0].y + kk[1].y) / 2 }, d = Math.hypot(u.x - m.x, u.y - m.y) || 1;
  return { x: u.x + ((u.x - m.x) / d) * uz, y: u.y + ((u.y - m.y) / d) * uz };
}
const ortaNokta = (kk: Nokta[]) => ({ x: (kk[0].x + kk[2].x) / 2, y: (kk[0].y + kk[2].y) / 2 });

export default function Editor({ proje, degistir, geri, ileri, geriVar, ileriVar, kaydet, kaydediliyor, kirli, yeni }: Props) {
  const { profile } = useAuth();
  const [aktif, setAktif] = useState(0);
  const [surum, setSurum] = useState(0);
  const [kilavuz, setKilavuz] = useState(true);
  const [mesaj, setMesaj] = useState("");
  const ana = useRef<HTMLCanvasElement>(null);
  const ust = useRef<HTMLCanvasElement>(null);
  const kart = useRef<HTMLElement>(null);
  const slotlar = useRef<Slot[]>([]);
  const katmanlar = useRef<KatmanSonuc[]>([]);
  const [katmanListe, setKatmanListe] = useState<KatmanSonuc[]>([]);
  const [secK, setSecK] = useState<string | null>(null);       // seçili katman (ya da ZEMIN)
  const [icMod, setIcMod] = useState<GorselKey | null>(null);  // çerçevenin içindeki fotoğraf düzenleniyor
  const rehber = useRef<{ dikey: number[]; yatay: number[] }>({ dikey: [], yatay: [] });
  const dosya = useRef<HTMLInputElement>(null);
  const bekleyenAlan = useRef<GorselKey | null>(null);
  const [duzenListe, setDuzenListe] = useState<Duzen[] | null>(null);

  const i = Math.min(aktif, proje.slaytlar.length - 1);
  const slayt = proje.slaytlar[i];
  const F = FORMATLAR[proje.format];
  const sablon = SABLONLAR[slayt.sablon];
  const ic = useMemo(() => etkin(slayt.sablon, slayt.icerik), [slayt]);
  const yenile = useCallback(() => setSurum((s) => s + 1), []);
  const serbest = slayt.serbest?.[proje.format];
  const serbestAcik = !!serbest;
  const sec = (id: string | null, gk: GorselKey | null = null) => { setSecK(id); setIcMod(gk); };
  useEffect(() => { sec(null); }, [i, proje.format, slayt.sablon]);
  useEffect(() => {
    setDuzenListe(null);
    duzenler(slayt.sablon).then(setDuzenListe).catch(() => setDuzenListe([]));
  }, [slayt.sablon]);

  // yazı tipleri, logo ve görseller yüklenince yeniden çiz
  useEffect(() => { yazilariYukle().then(yenile); gorselYukle(logoUrl).then((im) => { logoAyarla(im); yenile(); }).catch(() => {}); }, [yenile]);
  useEffect(() => {
    for (const s of proje.slaytlar) for (const k of GORSEL_ANAHTAR) {
      const g = s.icerik[k]; if (g && !gorselAl(g.src)) gorselYukle(g.src).then(yenile).catch(() => setMesaj("Bir görsel açılamadı."));
    }
  }, [proje.slaytlar, yenile]);

  // ---------- geometri yardımcıları ----------
  const olc = () => F.w / Math.max(1, ust.current?.clientWidth || F.w); // ekranda 1 piksel = tuvalde kaç piksel
  const katmanOf = (id: string | null) => katmanlar.current.find((k) => k.id === id && !k.t.gizli);
  // Fotoğraf çerçevesinin ekrandaki köşeleri (katmanın dönüşümü uygulanmış) ve dönüşüm bilgisi.
  const cerceve = (s: Slot) => {
    const k = s.katman ? katmanlar.current.find((x) => x.id === s.katman) : undefined;
    const t = k?.t ?? BOS_AYAR, m = k ? merkez(k.r) : merkez(s.r);
    return { kk: rectKose(s.r).map((p) => ileriCevir(p, m, t)), t, m };
  };
  const secSlot = () => (icMod ? slotlar.current.find((s) => s.k === icMod && (secK === ZEMIN ? !s.katman : s.katman === secK)) : undefined);

  // ---------- ana önizleme + üst katman (kılavuz, seçim, tutamaçlar, hizalama çizgileri) ----------
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
    c.save(); c.strokeStyle = "#FF2D87"; c.lineWidth = 2 * o;
    for (const x of rehber.current.dikey) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, F.h); c.stroke(); }
    for (const y of rehber.current.yatay) { c.beginPath(); c.moveTo(0, y); c.lineTo(F.w, y); c.stroke(); }
    c.restore();
    const cokgen = (kk: Nokta[], renk: string, kesik = false) => {
      c.save(); c.lineWidth = 2.5 * o; c.strokeStyle = renk; if (kesik) c.setLineDash([10 * o, 7 * o]);
      c.beginPath(); kk.forEach((p, n) => (n ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.stroke(); c.restore();
    };
    const tutamaclar = (kk: Nokta[], m: Nokta, renk: string) => {
      const dt = donmeTutamaci(kk, m, (46 * o) / 2.2);
      c.save(); c.lineWidth = 2.5 * o; c.strokeStyle = renk;
      c.beginPath(); c.moveTo((kk[0].x + kk[1].x) / 2, (kk[0].y + kk[1].y) / 2); c.lineTo(dt.x, dt.y); c.stroke();
      c.fillStyle = "#fff";
      for (const p of [...kk, dt]) { c.beginPath(); c.arc(p.x, p.y, 7 * o, 0, Math.PI * 2); c.fill(); c.stroke(); }
      c.restore();
    };
    const s = secSlot();
    if (s) {
      const { kk } = cerceve(s), om = ortaNokta(kk);
      cokgen(kk, "#FF6B1A", true); tutamaclar(kk, om, "#FF6B1A");
      return;
    }
    const k = katmanOf(secK);
    if (k) {
      const kk = koseler(k.r, k.t), b = kutu(k.r, k.t), g = F.guvenli, m = merkez(k.r);
      // kutuda seçim için 6 px pay var; uyarı gerçek kenara göre, 2 px toleransla
      const disari = !icinde({ x: b.x + 6, y: b.y + 6 }, g, 2) || !icinde({ x: b.x + b.w - 6, y: b.y + b.h - 6 }, g, 2);
      const renk = disari ? "#F97316" : "#2563EB";
      cokgen(kk, renk); tutamaclar(kk, { x: m.x + k.t.x, y: m.y + k.t.y }, renk);
      if (disari) {
        c.save(); c.font = `600 ${13 * o}px system-ui`; c.textAlign = "center"; const yaz = "Güvenli alanın dışında";
        const tw = c.measureText(yaz).width + 16 * o, ty = Math.min(F.h - 30 * o, b.y + b.h + 14 * o);
        c.fillStyle = renk; c.beginPath(); c.roundRect(b.x + b.w / 2 - tw / 2, ty, tw, 24 * o, 12 * o); c.fill();
        c.fillStyle = "#fff"; c.textBaseline = "middle"; c.fillText(yaz, b.x + b.w / 2, ty + 12 * o); c.restore();
      }
    }
  }, [F, kilavuz, proje.format, secK, icMod]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ana.current) return;
    const sonuc = slaytCiz(ana.current, proje.format, proje.stil, slayt.sablon, ic, false, 1, serbest, true);
    slotlar.current = sonuc.slotlar; katmanlar.current = sonuc.katmanlar; setKatmanListe(sonuc.katmanlar);
    ustCiz();
  }, [proje.format, proje.stil, slayt.sablon, ic, serbest, surum, ustCiz]);

  // seçilen öğenin kartı görünsün
  useEffect(() => { if (secK) kart.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [secK]);

  // ---------- değişiklikler ----------
  const slaytDegis = (yeniS: Slayt, birlestir?: string) => degistir({ ...proje, slaytlar: proje.slaytlar.map((s, n) => (n === i ? yeniS : s)) }, birlestir);
  const alanDegis = (k: MetinKey, v: string) => slaytDegis({ ...slayt, icerik: { ...slayt.icerik, [k]: v } }, `metin-${i}-${k}`);
  const alanSifirla = (k: MetinKey) => { const n = { ...slayt.icerik }; delete n[k]; slaytDegis({ ...slayt, icerik: n }); };
  const gorselDegis = (k: GorselKey, g: Gorsel | undefined, birlestir?: string) => {
    const n = { ...slayt.icerik }; if (g) n[k] = g; else delete n[k]; slaytDegis({ ...slayt, icerik: n }, birlestir);
  };
  const serbestDegis = (f: (s: Serbest) => Serbest, birlestir?: string) => {
    if (!serbestAcik) setMesaj("Serbest düzen açıldı: öğeler artık bıraktığın yerde kalır. Katmanlar'dan \"Şablon düzenine dön\" ile geri alınır.");
    slaytDegis({ ...slayt, serbest: { ...slayt.serbest, [proje.format]: f(serbest ?? { katman: {}, sira: [] }) } }, birlestir);
  };
  const ayarDegis = (id: string, d: Partial<KatmanAyar>, birlestir?: string) =>
    serbestDegis((x) => ({ ...x, katman: { ...x.katman, [id]: { ...(x.katman[id] ?? BOS_AYAR), ...d } } }), birlestir);
  const ayarOf = (id: string) => serbest?.katman[id] ?? BOS_AYAR;
  function serbestKapat() {
    if (serbest && Object.keys(serbest.katman).length && !confirm(`${F.ad} için yaptığın düzen ayarları silinsin ve şablonun kendi yerleşimine dönülsün mü?`)) return;
    const n = { ...slayt.serbest }; delete n[proje.format]; slaytDegis({ ...slayt, serbest: Object.keys(n).length ? n : undefined }); sec(null);
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
      gorselDegis(k, { src, z: 1, x: 0, y: 0 });
    } catch { setMesaj("Bu dosya açılamadı. JPG, PNG ya da WebP dene."); }
  }
  const gorselSec = (k: GorselKey) => { bekleyenAlan.current = k; dosya.current?.click(); };

  // ---------- önizlemede dokunma / sürükleme ----------
  type KS = { tur: "tasi" | "olcek" | "dondur"; id: string; r: Rect; t0: KatmanAyar; p0: Nokta; oynadi: boolean; dokunus?: GorselKey; iki?: { d0: number; a0: number; t0: KatmanAyar } };
  type GS = { tur: "kaydir" | "yakin" | "cevir"; s: Slot; g0: Gorsel; p0: Nokta; iki?: { d0: number; a0: number; g0: Gorsel } };
  const isaret = useRef(new Map<number, Nokta>());
  const ks = useRef<KS | null>(null);
  const gs = useRef<GS | null>(null);
  const tuvalNokta = (e: { clientX: number; clientY: number }) => {
    const r = ust.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * F.w, y: ((e.clientY - r.top) / r.height) * F.h };
  };
  const katmanBul = (p: Nokta) => [...katmanlar.current].reverse().find((k) => !k.t.gizli && icinde(geriCevir(p, k.r, k.t), k.r, (6 * olc()) / k.t.s));
  const zeminSlot = (p: Nokta) => [...slotlar.current].reverse().find((s) => !s.katman && icinde(p, s.r));
  const slotIcinde = (s: Slot, p: Nokta) => { const { t, m } = cerceve(s); return icinde(geriCevir(p, s.r, t, m), s.r); };
  const tutamacBul = (kk: Nokta[], m: Nokta, p: Nokta): "olcek" | "dondur" | null => {
    const pay = 14 * olc(), dt = donmeTutamaci(kk, m, (46 * olc()) / 2.2);
    if (Math.hypot(p.x - dt.x, p.y - dt.y) < pay) return "dondur";
    return kk.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < pay) ? "olcek" : null;
  };
  const katmanTutamaci = (p: Nokta) => {
    const k = icMod ? undefined : katmanOf(secK); if (!k) return null;
    const m = merkez(k.r); return tutamacBul(koseler(k.r, k.t), { x: m.x + k.t.x, y: m.y + k.t.y }, p);
  };
  const fotoTutamaci = (p: Nokta) => { const s = secSlot(); if (!s) return null; const { kk } = cerceve(s); return tutamacBul(kk, ortaNokta(kk), p); };

  // Taşırken mıknatıs: katmanın kenarı/ortası tuvalin ortasına, güvenli alan kenarlarına ya da diğer katmanlara yakınsa oraya oturur.
  function hizala(k: KS, t: KatmanAyar): KatmanAyar {
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
  const sinirXY = (v: number, mod: "cover" | "contain") => Math.max(mod === "cover" ? -1.5 : -3, Math.min(mod === "cover" ? 1.5 : 3, v));

  function basildi(e: RPointerEvent<HTMLCanvasElement>) {
    const p = tuvalNokta(e); isaret.current.set(e.pointerId, p);
    e.currentTarget.focus({ preventScroll: true });
    if (isaret.current.size === 2) {
      const [a, b] = [...isaret.current.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y), a0 = Math.atan2(b.y - a.y, b.x - a.x);
      if (gs.current) gs.current.iki = { d0, a0, g0: ic[gs.current.s.k]! };
      else if (ks.current) { ks.current.iki = { d0, a0, t0: ayarOf(ks.current.id) }; ks.current.oynadi = true; }
      return;
    }
    // 1) çerçevedeki fotoğraf düzenleniyorsa: tutamaç ya da fotoğrafın içi
    const s = secSlot();
    if (s && ic[s.k]) {
      const ft = fotoTutamaci(p);
      if (ft || slotIcinde(s, p)) {
        e.currentTarget.setPointerCapture(e.pointerId);
        gs.current = { tur: ft === "olcek" ? "yakin" : ft === "dondur" ? "cevir" : "kaydir", s, g0: ic[s.k]!, p0: p }; return;
      }
    }
    // 2) seçili katmanın tutamaçları
    const kt = katmanTutamaci(p);
    if (kt) {
      const k = katmanOf(secK)!; e.currentTarget.setPointerCapture(e.pointerId);
      ks.current = { tur: kt, id: k.id, r: k.r, t0: ayarOf(k.id), p0: p, oynadi: true }; return;
    }
    // 3) bir katmana dokunuldu: seç; fotoğraflıysa ve zaten seçiliyse, kıpırdamadan bırakınca içindeki fotoğraf seçilir
    const k = katmanBul(p);
    if (k) {
      const ayni = k.id === secK && !icMod;
      const foto = slotlar.current.find((x) => x.katman === k.id && ic[x.k] && slotIcinde(x, p));
      if (k.id !== secK || icMod) sec(k.id);
      e.currentTarget.setPointerCapture(e.pointerId);
      ks.current = { tur: "tasi", id: k.id, r: k.r, t0: ayarOf(k.id), p0: p, oynadi: false, dokunus: ayni ? foto?.k : undefined }; return;
    }
    // 4) arka plan fotoğrafı (zemin): doğrudan içi düzenlenir; yoksa yükleme açılır
    const z = zeminSlot(p);
    if (z) {
      if (!ic[z.k]) { gorselSec(z.k); return; }
      sec(ZEMIN, z.k); e.currentTarget.setPointerCapture(e.pointerId);
      gs.current = { tur: "kaydir", s: z, g0: ic[z.k]!, p0: p }; return;
    }
    sec(null);
  }

  function hareket(e: RPointerEvent<HTMLCanvasElement>) {
    const p = tuvalNokta(e);
    const g = gs.current, k = ks.current;
    if (!g && !k) {
      const el = e.currentTarget; const ft = fotoTutamaci(p), kt = katmanTutamaci(p);
      el.style.cursor = ft === "olcek" || kt === "olcek" ? "nwse-resize" : ft === "dondur" || kt === "dondur" ? "grab" : katmanBul(p) || zeminSlot(p) ? "move" : "default";
      return;
    }
    if (!isaret.current.has(e.pointerId)) return;
    isaret.current.set(e.pointerId, p);
    if (g) {
      const anahtar = `foto-${i}-${g.s.k}`; const { t, m, kk } = cerceve(g.s), om = ortaNokta(kk);
      if (isaret.current.size === 2 && g.iki) {
        const [a, b] = [...isaret.current.values()];
        const z = Math.max(g.s.mod === "cover" ? 1 : 0.3, Math.min(6, g.iki.g0.z * Math.hypot(a.x - b.x, a.y - b.y) / g.iki.d0));
        const r = sinirla(yakinAci((g.iki.g0.r ?? 0) + ((Math.atan2(b.y - a.y, b.x - a.x) - g.iki.a0) * 180) / Math.PI));
        gorselDegis(g.s.k, { ...g.iki.g0, z, r }, anahtar); return;
      }
      if (g.tur === "kaydir") {
        // dokunuşu çerçevenin (ve fotoğrafın kendi açısının) yönüne çevir
        const q0 = geriCevir(g.p0, g.s.r, t, m), q1 = geriCevir(p, g.s.r, t, m);
        const a = (-(g.g0.r ?? 0) * Math.PI) / 180, dx = q1.x - q0.x, dy = q1.y - q0.y;
        const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
        gorselDegis(g.s.k, { ...g.g0, x: sinirXY(g.g0.x + lx / g.s.ox, g.s.mod), y: sinirXY(g.g0.y + ly / g.s.oy, g.s.mod) }, anahtar);
      } else if (g.tur === "yakin") {
        const z = g.g0.z * Math.hypot(p.x - om.x, p.y - om.y) / Math.max(1, Math.hypot(g.p0.x - om.x, g.p0.y - om.y));
        gorselDegis(g.s.k, { ...g.g0, z: Math.max(g.s.mod === "cover" ? 1 : 0.3, Math.min(6, z)) }, anahtar);
      } else {
        const r = (g.g0.r ?? 0) + ((Math.atan2(p.y - om.y, p.x - om.x) - Math.atan2(g.p0.y - om.y, g.p0.x - om.x)) * 180) / Math.PI;
        gorselDegis(g.s.k, { ...g.g0, r: sinirla(yakinAci(r)) }, anahtar);
      }
      return;
    }
    if (!k) return;
    if (!k.oynadi) { if (Math.hypot(p.x - k.p0.x, p.y - k.p0.y) < 5 * olc()) return; k.oynadi = true; }
    const anahtar = `katman-${i}-${k.id}`;
    if (isaret.current.size === 2 && k.iki) {
      const [a, b] = [...isaret.current.values()];
      const s = Math.max(0.2, Math.min(4, k.iki.t0.s * Math.hypot(a.x - b.x, a.y - b.y) / k.iki.d0));
      const r = sinirla(yakinAci(k.iki.t0.r + ((Math.atan2(b.y - a.y, b.x - a.x) - k.iki.a0) * 180) / Math.PI));
      ayarDegis(k.id, { s, r }, anahtar); return;
    }
    if (k.tur === "tasi") {
      ayarDegis(k.id, hizala(k, { ...k.t0, x: k.t0.x + p.x - k.p0.x, y: k.t0.y + p.y - k.p0.y }), anahtar);
    } else {
      const m = merkez(k.r), mx = m.x + k.t0.x, my = m.y + k.t0.y;
      if (k.tur === "olcek") {
        let s = k.t0.s * Math.hypot(p.x - mx, p.y - my) / Math.max(1, Math.hypot(k.p0.x - mx, k.p0.y - my));
        s = Math.max(0.2, Math.min(4, Math.abs(s - 1) < 0.03 ? 1 : s));
        ayarDegis(k.id, { s }, anahtar);
      } else {
        const r = k.t0.r + ((Math.atan2(p.y - my, p.x - mx) - Math.atan2(k.p0.y - my, k.p0.x - mx)) * 180) / Math.PI;
        ayarDegis(k.id, { r: sinirla(yakinAci(r)) }, anahtar);
      }
    }
  }

  function birakildi(e: RPointerEvent<HTMLCanvasElement>) {
    isaret.current.delete(e.pointerId);
    const kalan = [...isaret.current.values()][0];
    if (kalan) { // iki parmaktan biri kalktı: kalan parmakla devam
      if (gs.current) gs.current = { ...gs.current, iki: undefined, tur: "kaydir", g0: ic[gs.current.s.k]!, p0: kalan };
      if (ks.current) ks.current = { ...ks.current, iki: undefined, tur: "tasi", t0: ayarOf(ks.current.id), p0: kalan };
      return;
    }
    const k = ks.current;
    if (k && !k.oynadi && k.dokunus) { setIcMod(k.dokunus); setMesaj(""); }
    ks.current = null; gs.current = null;
    if (rehber.current.dikey.length || rehber.current.yatay.length) { rehber.current = { dikey: [], yatay: [] }; ustCiz(); }
  }

  function tus(e: KeyboardEvent<HTMLCanvasElement>) {
    if (e.key === "Escape") { if (icMod && secK !== ZEMIN) setIcMod(null); else sec(null); return; }
    const adim = e.shiftKey ? 10 : 1;
    const yon: Record<string, [number, number]> = { ArrowLeft: [-adim, 0], ArrowRight: [adim, 0], ArrowUp: [0, -adim], ArrowDown: [0, adim] };
    const s = secSlot();
    if (s && ic[s.k] && yon[e.key]) {
      e.preventDefault(); const g = ic[s.k]!;
      gorselDegis(s.k, { ...g, x: sinirXY(g.x + yon[e.key][0] / s.ox, s.mod), y: sinirXY(g.y + yon[e.key][1] / s.oy, s.mod) }, `ok-${i}-${s.k}`); return;
    }
    if (!secK || secK === ZEMIN) return;
    const t = ayarOf(secK);
    if (yon[e.key]) { e.preventDefault(); ayarDegis(secK, { x: t.x + yon[e.key][0], y: t.y + yon[e.key][1] }, `ok-${i}-${secK}`); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); ayarDegis(secK, { gizli: true }); sec(null); }
  }

  useEffect(() => {
    const el = ust.current; if (!el) return;
    const tekerlek = (e: WheelEvent) => {
      const p = tuvalNokta(e), s = secSlot();
      if (s && ic[s.k] && slotIcinde(s, p)) {
        e.preventDefault(); const g = ic[s.k]!;
        gorselDegis(s.k, { ...g, z: Math.max(s.mod === "cover" ? 1 : 0.3, Math.min(6, g.z * Math.exp(-e.deltaY * 0.0015))) }, `foto-${i}-${s.k}`); return;
      }
      const k = katmanOf(secK);
      if (k && katmanBul(p)?.id === k.id) {
        e.preventDefault(); const t = ayarOf(k.id);
        ayarDegis(k.id, { s: Math.max(0.2, Math.min(4, t.s * Math.exp(-e.deltaY * 0.0015))) }, `katman-${i}-${k.id}`);
      }
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
  useEffect(() => { if (!mesaj) return; const t = setTimeout(() => setMesaj(""), 4500); return () => clearTimeout(t); }, [mesaj]);

  // ---------- hazır düzenler ----------
  async function duzeniKaydet() {
    if (!slayt.serbest || !Object.keys(slayt.serbest).length) { setMesaj("Önce öğeleri yerleştir: kaydedilecek bir düzen yok."); return; }
    const ad = prompt("Düzenin adı (ekip bu adla görecek)", `${sablon.ad} · ${STILLER[proje.stil].ad}`); if (!ad?.trim()) return;
    try { await duzenKaydet(ad.trim().slice(0, 50), slayt.sablon, slayt.serbest); setDuzenListe(await duzenler(slayt.sablon)); setMesaj(`"${ad.trim()}" ekibin hazır düzenlerine eklendi.`); }
    catch (e) { setMesaj(hataMetni(e as Error)); }
  }
  async function duzeniSil(d: Duzen) {
    if (!confirm(`"${d.ad}" hazır düzeni silinsin mi?`)) return;
    try { await duzenSil(d.id); setDuzenListe(await duzenler(slayt.sablon)); } catch (e) { setMesaj(hataMetni(e as Error)); }
  }

  // ---------- parçalar ----------
  // Not: bileşen değil düz fonksiyon; içeride tanımlı bileşen her çizimde yeniden kurulur ve yazarken odak kaybolur.
  function gorselAyar(k: GorselKey, ad: string, yardim?: string) {
    const g = ic[k];
    return (
      <div className="ie-gorsel" key={k}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong style={{ fontSize: 14 }}>{ad}</strong>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => gorselSec(k)}>{g ? "Değiştir" : "Yükle"}</button>
            {g && <button className="btn ghost sm" onClick={() => { gorselDegis(k, undefined); if (icMod === k) sec(secK === ZEMIN ? null : secK); }}>Kaldır</button>}
          </div>
        </div>
        {!g && <span className="muted">{yardim ?? "Görsel yokken düzen görselsiz hâline geçer."}</span>}
        {g && (
          <>
            <div className="ie-kontrol">
              <span className="muted">Yakınlık</span>
              <input type="range" min={0.3} max={6} step={0.01} value={g.z} aria-label={`${ad} yakınlık`} onChange={(e) => gorselDegis(k, { ...g, z: +e.target.value }, `foto-${i}-${k}`)} />
              <button className="btn ghost sm" onClick={() => gorselDegis(k, { ...g, z: 1, x: 0, y: 0, r: 0 })}>Ortala</button>
            </div>
            <details className="ie-ayar">
              <summary>Konum, açı ve renk</summary>
              {([["x", "Yatay", -1.5, 1.5, 0.01], ["y", "Dikey", -1.5, 1.5, 0.01], ["r", "Açı", -180, 180, 1], ["p", "Parlaklık", -100, 100, 1], ["k", "Kontrast", -100, 100, 1], ["d", "Doygunluk", -100, 100, 1]] as const).map(([key, etiket, min, max, adim]) =>
                (key === "x" || key === "y" || key === "r" || filtreVar) && (
                  <div className="ie-kontrol" key={key}>
                    <span className="muted">{etiket}</span>
                    <input type="range" min={min} max={max} step={adim} value={g[key] ?? 0} aria-label={`${ad} ${etiket.toLocaleLowerCase("tr")}`}
                      onChange={(e) => gorselDegis(k, { ...g, [key]: +e.target.value }, `ayar-${i}-${k}-${key}`)} />
                    <span className="mono">{key === "x" || key === "y" ? "" : key === "r" ? `${Math.round(g.r ?? 0)}°` : Math.round(g[key] ?? 0)}</span>
                  </div>
                ))}
              {!filtreVar && <span className="muted">Bu tarayıcı renk ayarlarını desteklemiyor (Chrome ya da güncel Safari'de açılır).</span>}
              <button className="btn ghost sm" onClick={() => gorselDegis(k, { src: g.src, z: g.z, x: 0, y: 0 })}>Ayarları sıfırla</button>
            </details>
          </>
        )}
      </div>
    );
  }
  function alanKutusu(k: MetinKey) {
    const a = sablon.alanlar.find((x) => x.k === k); if (!a) return null;
    const v = ic[k]; const degisti = k in slayt.icerik;
    return (
      <label className="ie-alan" key={k}>
        <span className="row" style={{ justifyContent: "space-between" }}>
          <span>{a.l}</span>
          <span className="row" style={{ gap: 8 }}>
            {a.max && <span className={"mono" + (v.length > a.max ? " ie-asim" : "")}>{v.length}/{a.max}</span>}
            {!degisti && <span className="pill off">örnek</span>}
            {degisti && <button type="button" className="linkbtn" onClick={() => alanSifirla(k)}>örneğe dön</button>}
          </span>
        </span>
        {a.tip === "uzun"
          ? <textarea value={v} rows={k === "metin" || k === "karar" ? 3 : 4} onChange={(e) => alanDegis(k, e.target.value)} />
          : <input type="text" value={v} onChange={(e) => alanDegis(k, e.target.value)} />}
        {a.yardim && <span className="muted">{a.yardim}</span>}
      </label>
    );
  }
  const kaydirici = (etiket: string, deger: number, min: number, max: number, fmt: (v: number) => string, ata: (v: number) => void) => (
    <div className="ie-kontrol"><span className="muted">{etiket}</span>
      <input type="range" min={min} max={max} step={1} value={Math.round(deger)} aria-label={etiket} onChange={(e) => ata(+e.target.value)} />
      <span className="mono">{fmt(deger)}</span></div>
  );

  const secKatman = katmanListe.find((k) => k.id === secK);
  const ipucu = mesaj || (secSlot()
    ? "Fotoğraf: sürükle kaydır, köşeden büyüt, üstteki noktadan döndür. Dışına dokun: çık."
    : secKatman
      ? "Sürükle: taşı. Köşe: büyüt/küçült. Üstteki nokta: döndür. Fotoğraflı öğeye tekrar dokun: içindeki fotoğraf."
      : "Bir öğeye dokun: sağda kendi ayarları açılır. Sürüklersen yerini değiştirirsin.");
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
          <canvas ref={ust} className="ie-ust" tabIndex={0} aria-label="Düzenleme alanı" onKeyDown={tus} onPointerDown={basildi} onPointerMove={hareket} onPointerUp={birakildi} onPointerCancel={birakildi}
            onPointerLeave={(e) => { if (!ks.current && !gs.current) e.currentTarget.style.cursor = "default"; }} />
        </div>
        <p className="ie-ipucu">{ipucu}</p>
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
        {secK && (secK === ZEMIN || secKatman) && (
          <section className="panel ie-oge" ref={kart} aria-label="Seçili öğe">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3>{secK === ZEMIN ? "Arka plan fotoğrafı" : secKatman!.ad}</h3>
              <button className="ie-mini-btn" aria-label="Seçimi kapat" onClick={() => sec(null)}>✕</button>
            </div>
            {secK === ZEMIN && icMod && gorselAyar(icMod, "Fotoğraf")}
            {secKatman && (() => {
              const t = ayarOf(secKatman.id), id = secKatman.id, gks = GORSEL_KATMAN[id] ?? [];
              return (
                <>
                  {(ALAN_KATMAN[id] ?? []).map((k) => alanKutusu(k))}
                  {gks.map((k) => gorselAyar(k, sablon.gorseller.find((x) => x.k === k)?.l ?? "Görsel"))}
                  {gks.some((k) => ic[k]) && (
                    <div className="row" style={{ gap: 6 }}>
                      {gks.filter((k) => ic[k]).map((k) => (
                        <button key={k} className={"btn sm" + (icMod === k ? "" : " ghost")} aria-pressed={icMod === k} onClick={() => setIcMod(icMod === k ? null : k)}>
                          {icMod === k ? "Fotoğraftan çık" : gks.length > 1 ? `${k === "gorselA" ? "A" : "B"} fotoğrafını düzenle` : "Fotoğrafı düzenle"}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="ie-secili">
                    {kaydirici("Boyut", t.s * 100, 20, 400, (v) => `%${Math.round(v)}`, (v) => ayarDegis(id, { s: v / 100 }, `katman-${i}-${id}`))}
                    {kaydirici("Açı", t.r, -180, 180, (v) => `${Math.round(v)}°`, (v) => ayarDegis(id, { r: v }, `katman-${i}-${id}`))}
                    {YAZILI.has(id) && kaydirici("Yazı boyutu", (t.f ?? 1) * 100, 50, 250, (v) => `%${Math.round(v)}`, (v) => ayarDegis(id, { f: v / 100 }, `yazi-${i}-${id}`))}
                    {GENISLIK.has(id) && kaydirici("Genişlik", (t.g ?? 1) * 100, 40, 150, (v) => `%${Math.round(v)}`, (v) => ayarDegis(id, { g: v / 100 }, `gen-${i}-${id}`))}
                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn ghost sm" onClick={() => ortala(id, "x")}>Yatayda ortala</button>
                      <button className="btn ghost sm" onClick={() => ortala(id, "y")}>Dikeyde ortala</button>
                      <button className="btn ghost sm" onClick={() => siraTasi(id, 1)}>Öne getir</button>
                      <button className="btn ghost sm" onClick={() => siraTasi(id, -1)}>Arkaya gönder</button>
                      <button className="btn ghost sm" onClick={() => { ayarDegis(id, { gizli: true }); sec(null); }}>Gizle</button>
                      <button className="btn ghost sm" onClick={() => ayarDegis(id, { ...BOS_AYAR })}>Sıfırla</button>
                    </div>
                  </div>
                </>
              );
            })()}
          </section>
        )}

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
                  <button key={id} className="ie-kart" aria-pressed={slayt.sablon === id}
                    onClick={() => { if (id === slayt.sablon) return; if (slayt.serbest) setMesaj("Serbest düzen yeni şablonda baştan başlar."); slaytDegis({ ...slayt, sablon: id, serbest: undefined }); }}>
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
                <Mini format={proje.format} stil={id} sablon={slayt.sablon} icerik={slayt.icerik} surum={surum} olcek={0.13} serbest={serbest} />
                <span>{STILLER[id].ad}</span>
              </button>
            ))}
          </div>
          <span className="muted">Stil bütün slaytlara uygulanır. Yeni marka kiti gelince stiller yenilenecek.</span>
        </section>

        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>Katmanlar</h3>
            <span className={"pill " + (serbestAcik ? "blue" : "off")}>{serbestAcik ? `Serbest düzen · ${F.ad}` : "Şablon düzeni"}</span>
          </div>
          <div className="ie-katmanlar" role="list">
            {[...katmanListe].reverse().map((k, n, dizi) => (
              <div key={k.id} role="listitem" className="ie-katman" aria-current={secK === k.id}>
                <button className="ie-katman-ad" onClick={() => sec(k.id)} style={{ opacity: k.t.gizli ? 0.45 : 1 }}>{k.ad}</button>
                <button className="ie-mini-btn" aria-label={k.t.gizli ? `${k.ad}: göster` : `${k.ad}: gizle`} title={k.t.gizli ? "Göster" : "Gizle"} onClick={() => ayarDegis(k.id, { gizli: !k.t.gizli })}>
                  <svg className="i" viewBox="0 0 24 24">{k.t.gizli ? <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 5 9 7a11 11 0 01-2.2 3M6.6 6.6C4.4 8 3 10.4 3 12c0 2 4 7 9 7a9.6 9.6 0 004.2-1" /> : <path d="M3 12c0-2 4-7 9-7s9 5 9 7-4 7-9 7-9-5-9-7zM12 15a3 3 0 100-6 3 3 0 000 6z" />}</svg>
                </button>
                <button className="ie-mini-btn" aria-label={`${k.ad}: öne getir`} title="Öne getir" disabled={n === 0} onClick={() => siraTasi(k.id, 1)}>↑</button>
                <button className="ie-mini-btn" aria-label={`${k.ad}: arkaya gönder`} title="Arkaya gönder" disabled={n === dizi.length - 1} onClick={() => siraTasi(k.id, -1)}>↓</button>
              </div>
            ))}
          </div>
          <span className="muted">Logo ve zemin sabit. Düzen ayarları sadece bu format ({F.ad}) için geçerli.</span>
          {serbestAcik && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn ghost sm" onClick={() => { serbestDegis(() => ({ katman: {}, sira: [] })); sec(null); }}>Düzeni sıfırla</button>
              <button className="btn ghost sm" onClick={serbestKapat}>Şablon düzenine dön</button>
            </div>
          )}
          <div className="ie-duzenler">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong style={{ fontSize: 14 }}>Hazır düzenler</strong>
              <button className="btn ghost sm" onClick={duzeniKaydet}>Bu düzeni kaydet</button>
            </div>
            {duzenListe === null ? <span className="muted">Yükleniyor…</span>
              : !duzenListe.length ? <span className="muted">Bu şablon için kayıtlı düzen yok. Öğeleri yerleştirip "Bu düzeni kaydet" de; ekip başka habere sadece düzeni uygular, yazılar korunur.</span>
                : duzenListe.map((d) => (
                  <div key={d.id} className="ie-katman">
                    <span className="ie-katman-ad" style={{ cursor: "default" }}>{d.ad}</span>
                    <button className="btn sm" onClick={() => { slaytDegis({ ...slayt, serbest: d.serbest }); sec(null); setMesaj(`"${d.ad}" düzeni uygulandı; yazılar ve görseller korundu.`); }}>Uygula</button>
                    {(d.olusturan === profile?.id || profile?.is_admin) && <button className="ie-mini-btn" aria-label={`${d.ad} düzenini sil`} onClick={() => duzeniSil(d)}>✕</button>}
                  </div>
                ))}
          </div>
        </section>

        {sablon.gorseller.length > 0 && (
          <section className="panel">
            <h3>Görsel</h3>
            {sablon.gorseller.map((a) => gorselAyar(a.k, a.l, a.yardim))}
          </section>
        )}

        <section className="panel">
          <h3>Metin</h3>
          {sablon.alanlar.map((a) => alanKutusu(a.k))}
        </section>
      </div>
    </div>
  );
}
