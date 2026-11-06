import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Ikon } from "../../shared/Ikon";
import { maddeSayisi, TURLER, type Tur } from "./cekimListesi";

// Çekim kontrol listesi (1 Kasım 2026, kullanıcı: "video içerik çekeceği zaman telefondan açıp içeriğin türüne göre adım adım ne yapacaklarını
// ve nelere dikkat edeceklerini görecekler; orayı açmaları yetecek"). Kişiye ya da işe bağlı değil: tür seçilir, maddeler işaretlenir.
// İşaretler o cihazda saklanır (tür başına); "Yeni çekim" listeyi sıfırlar.
// Üst çubuk aramasından ?tur=<id>&madde=<grup/k> ile açılır: o tür seçilir, madde ekrana kaydırılıp kısa süre vurgulanır (6 Kasım 2026).
const anahtar = (t: string) => `cekim-listesi:${t}`;
const oku = (t: string): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(anahtar(t)) || "{}"); } catch { return {}; } };

export default function Cekim() {
  const [turId, setTurId] = useState(() => { try { return localStorage.getItem("cekim-listesi:tur") || TURLER[0].id; } catch { return TURLER[0].id; } });
  const tur: Tur = TURLER.find((t) => t.id === turId) ?? TURLER[0];
  const [isaret, setIsaret] = useState<Record<string, boolean>>(() => oku(tur.id));
  const sec = (id: string) => { setTurId(id); setIsaret(oku(id)); try { localStorage.setItem("cekim-listesi:tur", id); } catch { /* */ } };
  const yaz = (y: Record<string, boolean>) => { setIsaret(y); try { localStorage.setItem(anahtar(tur.id), JSON.stringify(y)); } catch { /* depolama kapalı */ } };
  const [sp] = useSearchParams();
  const [bulunan, setBulunan] = useState<string | null>(null);
  useEffect(() => {
    const t = sp.get("tur"), m = sp.get("madde");
    if (t && TURLER.some((x) => x.id === t) && t !== turId) sec(t);
    if (!m) return;
    setBulunan(m);
    const z = setTimeout(() => setBulunan(null), 2400);
    return () => clearTimeout(z);
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bulunan) document.querySelector(`[data-madde="${CSS.escape(bulunan)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [bulunan, turId]);
  const toplam = maddeSayisi(tur), say = tur.gruplar.reduce((s, g) => s + g.maddeler.filter((m) => isaret[`${g.ad}/${m.k}`]).length, 0);

  return (
    <div className="ed-sayfa ed-cekim">
      <div className="ed-bas"><div><span className="ed-ust turuncu">ÇEKİM</span><h1>Çekim listesi</h1></div></div>
      <p className="muted" style={{ margin: 0 }}>Çekeceğin içeriğin türünü seç; adımları sırayla işaretle.</p>
      <div className="ed-turler" role="group" aria-label="İçerik türü">
        {TURLER.map((t) => <button key={t.id} aria-pressed={t.id === tur.id} onClick={() => sec(t.id)}>{t.ad}</button>)}
      </div>
      <div className="ed-ilerleme"><span><b style={{ width: `${Math.round((say / toplam) * 100)}%` }} /></span><b>{say} / {toplam}</b></div>
      {tur.gruplar.map((g, gi) => (
        <section key={g.ad} className="ed-grup">
          <h2 className="ed-baslik"><span className="ed-no">{gi + 1}</span>{g.ad.toLocaleUpperCase("tr-TR")}</h2>
          {g.maddeler.map((m) => { const a = `${g.ad}/${m.k}`, ok = !!isaret[a]; return (
            <button key={a} data-madde={a} className={"ed-madde" + (ok ? " tamam" : "") + (a === bulunan ? " bulundu" : "")} aria-pressed={ok} onClick={() => yaz({ ...isaret, [a]: !ok })}>
              <span className="ed-kutu">{ok && <Ikon ad="check" />}</span>
              <span className="ed-madde-m"><b>{m.t}</b><span>{m.n}</span></span>
            </button>
          ); })}
        </section>
      ))}
      <div className="ed-cekim-alt">
        {say === toplam ? <div className="ed-tamam"><Ikon ad="check" />Liste tamam, iyi çekimler.</div> : null}
        <button className="btn ghost" disabled={!say} onClick={() => yaz({})}><Ikon ad="guncel" />Yeni çekim · listeyi sıfırla</button>
      </div>
    </div>
  );
}
