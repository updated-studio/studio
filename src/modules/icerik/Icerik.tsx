// İçerik modülü: Instagram post / story / reels kapağı editörü (Stüdyo'nun kendi kodu).
// Eski post aracı (public/araclar/post/) yenisi ekipte oturana kadar "Eski araç" sekmesinde açık kalır (kural 9).
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import { useToast, hataMetni } from "../../shared/toast";
import Editor from "./Editor";
import Kayitlar from "./Kayitlar";
import { kaydet as bulutaKaydet } from "./kayit";
import { yeniId, type Proje } from "./motor";
import { etkin, slaytCiz } from "./sablonlar";
import "./icerik.css";

type Bolum = "editor" | "kayitlar" | "eski";
const BOLUMLER: [Bolum, string][] = [["editor", "Editör"], ["kayitlar", "Kayıtlar"], ["eski", "Eski araç"]];
const TASLAK = "icerik-taslak-v1";

const bosProje = (): Proje => ({ ad: "", format: "post", stil: "cam", slaytlar: [{ id: yeniId(), sablon: "haber", icerik: {} }] });
function taslakOku(): Proje {
  try { const t = JSON.parse(localStorage.getItem(TASLAK) || "null"); if (t?.slaytlar?.length) return t; } catch { /* bozuk taslak */ }
  return bosProje();
}
// Taslak bu tarayıcıda da tutulur (sayfa yenilenince kaybolmasın). Sığmazsa yüklenmemiş fotoğraflar dışarıda bırakılır.
function taslakYaz(p: Proje) {
  try { localStorage.setItem(TASLAK, JSON.stringify(p)); return; } catch { /* kota */ }
  try {
    const hafif = { ...p, slaytlar: p.slaytlar.map((s) => ({ ...s, icerik: Object.fromEntries(Object.entries(s.icerik).filter(([, v]) => !(typeof v === "object" && v?.src?.startsWith("data:")))) })) };
    localStorage.setItem(TASLAK, JSON.stringify(hafif));
  } catch { /* yapacak bir şey yok */ }
}
const imza = (p: Proje) => JSON.stringify({ a: p.ad, f: p.format, s: p.stil, l: p.slaytlar });

export default function Icerik() {
  const [sp, setSp] = useSearchParams();
  const ilk = sp.get("b") as Bolum | null;
  const [bolum, setBolum] = useState<Bolum>(ilk && BOLUMLER.some(([k]) => k === ilk) ? ilk : "editor");
  useEffect(() => { if (ilk) setSp({}, { replace: true }); }, [ilk, setSp]);
  const toast = useToast();
  const { profile } = useAuth();

  const [proje, setProje] = useState<Proje>(taslakOku);
  const simdiki = useRef(proje); simdiki.current = proje;
  const kayitli = useRef<string>(proje.id ? imza(proje) : "");
  const gecmis = useRef<Proje[]>([]); const ileriYigin = useRef<Proje[]>([]);
  const son = useRef({ anahtar: "", t: 0 });
  const [, setYig] = useState(0);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => { const t = setTimeout(() => taslakYaz(proje), 400); return () => clearTimeout(t); }, [proje]);

  const degistir = useCallback((p: Proje, birlestir = "") => {
    const t = Date.now();
    if (!(birlestir && birlestir === son.current.anahtar && t - son.current.t < 900)) {
      gecmis.current.push(simdiki.current); if (gecmis.current.length > 80) gecmis.current.shift();
      ileriYigin.current = []; setYig((x) => x + 1);
    }
    son.current = { anahtar: birlestir, t };
    setProje(p);
  }, []);
  const geri = () => { const p = gecmis.current.pop(); if (!p) return; ileriYigin.current.push(simdiki.current); son.current = { anahtar: "", t: 0 }; setProje(p); setYig((x) => x + 1); };
  const ileri = () => { const p = ileriYigin.current.pop(); if (!p) return; gecmis.current.push(simdiki.current); son.current = { anahtar: "", t: 0 }; setProje(p); setYig((x) => x + 1); };

  const kirli = imza(proje) !== kayitli.current;

  function ac(p: Proje, kopya = false) {
    if (kirli && proje.slaytlar.some((s) => Object.keys(s.icerik).length) && !confirm("Açık tasarımdaki kaydedilmemiş değişiklikler kaybolacak. Devam edilsin mi?")) return;
    const yeniP: Proje = kopya ? { ...p, id: undefined, kapak: null, ad: p.ad + " (kopya)" } : p;
    gecmis.current = []; ileriYigin.current = [];
    kayitli.current = kopya ? "" : imza(yeniP);
    setProje(yeniP); setBolum("editor");
  }
  function yeni() {
    if (kirli && proje.slaytlar.some((s) => Object.keys(s.icerik).length) && !confirm("Kaydedilmemiş değişiklikler kaybolacak. Yeni tasarım açılsın mı?")) return;
    gecmis.current = []; ileriYigin.current = []; kayitli.current = "";
    setProje({ ...bosProje(), format: proje.format, stil: proje.stil });
  }

  async function kaydet() {
    let p = simdiki.current;
    if (!p.ad.trim()) {
      const oneri = etkin(p.slaytlar[0].sablon, p.slaytlar[0].icerik).baslik.trim().replace(/\.$/, "");
      const ad = prompt("Tasarımın adı", oneri || "Adsız tasarım"); if (ad === null) return;
      p = { ...p, ad: ad.trim() || "Adsız tasarım" };
    }
    setKaydediliyor(true);
    try {
      const cv = document.createElement("canvas"); const s = p.slaytlar[0];
      slaytCiz(cv, p.format, p.stil, s.sablon, etkin(s.sablon, s.icerik), true, 0.34);
      const kapak = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/jpeg", 0.82));
      const sonuc = await bulutaKaydet(p, kapak);
      // Kaydederken kullanıcı yazmaya devam ettiyse onun son hâli korunur, sadece kimlik ve adresler işlenir.
      const guncel = simdiki.current;
      kayitli.current = imza(sonuc);
      setProje(guncel.slaytlar === p.slaytlar && guncel.format === p.format && guncel.stil === p.stil ? sonuc : { ...guncel, id: sonuc.id, ad: p.ad, kapak: sonuc.kapak });
      toast(proje.id ? "Kaydedildi." : "Buluta kaydedildi. Ekip Kayıtlar'da görebilir.");
    } catch (e) {
      const m = (e as Error).message || "";
      toast(/icerik_projeler|relation|bucket/i.test(m) ? "Kayıt tablosu henüz kurulmamış. Yöneticiye haber ver." : hataMetni(e as Error));
    } finally { setKaydediliyor(false); }
  }

  return (
    <>
      <div className="segment" role="group">
        {BOLUMLER.map(([k, l]) => <button key={k} aria-pressed={bolum === k} onClick={() => setBolum(k)}>{l}</button>)}
      </div>
      {bolum === "editor" && profile && (
        <Editor proje={proje} degistir={degistir} geri={geri} ileri={ileri} geriVar={gecmis.current.length > 0} ileriVar={ileriYigin.current.length > 0}
          kaydet={kaydet} kaydediliyor={kaydediliyor} kirli={kirli} yeni={yeni} />
      )}
      {bolum === "kayitlar" && <Kayitlar ac={ac} acikId={proje.id} />}
      {bolum === "eski" && (
        <>
          <div className="muted">Eski post aracı, yeni editör ekipte oturana kadar burada açık. Eski kayıtların bu tarayıcıda duruyor.</div>
          <iframe src="araclar/post/index.html" title="Eski post aracı" className="arac-cerceve" allow="clipboard-write; web-share" />
        </>
      )}
    </>
  );
}
