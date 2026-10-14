import { useEffect, useState } from "react";

// Güncelleme notları: public/yenilikler.json (en yeni üstte). Kullanıcı görmediği notları
// sayfa açılınca bir pencerede bölüm bölüm okur. Kural (CLAUDE.md): ekibin fark edeceği her değişiklikte buraya not eklenir.
export type Yenilik = { id: string; tarih: string; baslik: string; bolumler: { ad: string; maddeler: string[] }[] };

const ANAHTAR = "yenilik-goruldu";

export async function yenilikleriOku(): Promise<Yenilik[]> {
  try {
    const r = await fetch("./yenilikler.json?t=" + Date.now(), { cache: "no-store" });
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}

export default function Yenilikler() {
  const [liste, setListe] = useState<Yenilik[]>([]);
  useEffect(() => {
    yenilikleriOku().then((hepsi) => {
      if (!hepsi.length) return;
      let son: string | null = null;
      try { son = localStorage.getItem(ANAHTAR); } catch { /* yok */ }
      // Daha önce hiç görmediyse sadece en son notu göster; gördüyse ondan sonrakilerin hepsini
      const i = son ? hepsi.findIndex((y) => y.id === son) : 1;
      const gorulmemis = hepsi.slice(0, i === -1 ? hepsi.length : i);
      setListe(gorulmemis);
    });
  }, []);
  if (!liste.length) return null;
  const kapat = () => { try { localStorage.setItem(ANAHTAR, liste[0].id); } catch { /* yok */ } setListe([]); };
  return (
    <div className="perde" onClick={(e) => { if (e.target === e.currentTarget) kapat(); }}>
      <div className="pencere yenilik" role="dialog" aria-label="Neler değişti">
        <h2 style={{ fontSize: 20 }}>Neler değişti</h2>
        {liste.map((y) => (
          <section key={y.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="muted">{y.tarih}</div>
            <b>{y.baslik}</b>
            {y.bolumler.map((b) => (
              <div key={b.ad}>
                <h3 style={{ marginBottom: 4 }}>{b.ad}</h3>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                  {b.maddeler.map((m, k) => <li key={k}>{m}</li>)}
                </ul>
              </div>
            ))}
          </section>
        ))}
        <button className="btn" onClick={kapat} style={{ alignSelf: "flex-end" }}>Tamam</button>
      </div>
    </div>
  );
}
