import { useState } from "react";

const RENKLER = [
  { ad: "Updated Mavi", hex: "#2563EB", not: "Ana renk" },
  { ad: "Updated Turuncu", hex: "#FF6B1A", not: "Vurgu rengi; genelde maviden ayrı kullanılır" },
];
const YAZILAR = [
  { ad: "Bricolage Grotesque", rol: "Başlıklar", stil: "var(--display)" },
  { ad: "Instrument Sans", rol: "Metin", stil: "var(--body)" },
  { ad: "JetBrains Mono", rol: "Tarih, sayı, kod", stil: "var(--mono)" },
];

export default function MarkaKiti() {
  const [kopyalandi, setK] = useState("");
  async function kopyala(t: string) {
    try { await navigator.clipboard.writeText(t); setK(t); setTimeout(() => setK(""), 1500); } catch { /* eski tarayıcı */ }
  }
  return (
    <>
      <h2>Marka Kiti</h2>
      <h3>Renkler</h3>
      <div className="row" style={{ alignItems: "stretch" }}>
        {RENKLER.map((r) => (
          <button key={r.hex} className="panel" style={{ flex: "1 1 220px", textAlign: "left" }} onClick={() => kopyala(r.hex)}>
            <div style={{ height: 72, borderRadius: 10, background: r.hex }} />
            <strong>{r.ad}</strong>
            <span className="mono">{kopyalandi === r.hex ? "Kopyalandı" : r.hex}</span>
            <span className="muted">{r.not}</span>
          </button>
        ))}
      </div>
      <h3>Yazı tipleri</h3>
      <div className="panel">
        {YAZILAR.map((y) => (
          <div key={y.ad} className="row" style={{ justifyContent: "space-between" }}>
            <span style={{ fontFamily: y.stil, fontSize: 20 }}>{y.ad}</span>
            <span className="muted">{y.rol}</span>
          </div>
        ))}
      </div>
      <h3>Logolar</h3>
      <div className="empty">Logo dosyaları bir sonraki adımda eklenecek (UPDATED ve UP işaretleri, beyaz/siyah/mavi).</div>
    </>
  );
}
