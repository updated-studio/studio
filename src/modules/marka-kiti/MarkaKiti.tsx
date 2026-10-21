// Marka Kiti sayfası: kit 1.2 (public/marka/). Değerler marka/makine/tokens.json'dan; burada sadece gösterim.
import { useState } from "react";
import "./marka-kiti.css";

const K = "marka/";
const RENKLER = [
  { ad: "Siyah", hex: "#000000", yazi: "#FFFFFF", not: "Logo, metin, haber zemini" },
  { ad: "Beyaz", hex: "#FFFFFF", yazi: "#000000", not: "Zemin, negatif logo" },
  { ad: "Mavi (ana)", hex: "#2563EB", yazi: "#FFFFFF", not: "Marka, link, ana buton. Üstünde yazı beyaz." },
  { ad: "Turuncu (vurgu)", hex: "#FF6B1A", yazi: "#000000", not: "Son dakika, etiket. Üstünde yazı siyah; yüzeyde tek öğe." },
  { ad: "Açık gri", hex: "#F2F2F2", yazi: "#000000", not: "Yüzey, ayırıcı" },
];
const NOTRLER = [["Metin", "#171717"], ["İkincil metin", "#55585C"], ["Yardımcı", "#6B6F74"], ["Çizgi", "#E2E2E2"]];
const YAZILAR = [
  { rol: "Başlık", ad: "Big Shoulders Display 900", stil: { fontFamily: "var(--display)", fontWeight: 900, textTransform: "uppercase" as const, fontSize: 30, lineHeight: 1.2 }, ornek: "iPhone 18 Pro tanıtıldı", not: "Daima büyük harf; 20 px altında kullanılmaz" },
  { rol: "Metin", ad: "IBM Plex Sans 400 / 600", stil: { fontFamily: "var(--body)", fontSize: 17 }, ornek: "Apple, yeni modelini bugün düzenlediği etkinlikte duyurdu.", not: "Gövde, spot, açıklama" },
  { rol: "Veri", ad: "IBM Plex Mono 400 / 600", stil: { fontFamily: "var(--mono)", fontSize: 17 }, ornek: "49.999 TL · 19.10 · 14.30", not: "Rakam, fiyat, tarih, etiket" },
  { rol: "Vurgu", ad: "Big Shoulders Display 900", stil: { fontFamily: "var(--display)", fontWeight: 900, textTransform: "uppercase" as const, fontSize: 24, lineHeight: 1, background: "#FF6B1A", color: "#000", padding: "4px 10px", alignSelf: "flex-start" }, ornek: "Son dakika", not: "Rozet, şerit; en fazla 3 kelime" },
  { rol: "Alıntı", ad: "Newsreader İtalik", stil: { fontFamily: "var(--quote)", fontStyle: "italic" as const, fontSize: 22 }, ornek: "“Bu yılın en büyük güncellemesi.”", not: "Yalnızca alıntı" },
  { rol: "Arayüz", ad: "IBM Plex Sans 500 / 600", stil: { fontFamily: "var(--body)", fontWeight: 600, fontSize: 15 }, ornek: "Kaydet · Yayınla · Ayarlar", not: "Menü, buton, form, panel" },
];
type Tur = "yatay" | "dikey" | "up";
const TURLER: [Tur, string, string][] = [["yatay", "Yatay", "Geniş, alçak alanlar; web, video, bülten"], ["dikey", "Dikey", "Kare ve dikey alanlar"], ["up", "UP", "Instagram, favicon, uygulama ikonu, küçük alanlar"]];
const LOGO_RENK: { r: string; zemin: string; ad: string }[] = [
  { r: "black", zemin: "#FFFFFF", ad: "Siyah · açık zemin" },
  { r: "white", zemin: "#000000", ad: "Beyaz · koyu ve mavi zemin" },
  { r: "blue", zemin: "#F2F2F2", ad: "Mavi · açık zemin" },
  { r: "orange", zemin: "#000000", ad: "Turuncu · siyah zemin" },
];
const PNG_VAR = new Set(["yatay", "dikey", "up"]); // 2048 px PNG'si olan türler
const ORNEKLER = [
  ["ig-haber-karti", "Instagram haber kartı"], ["ig-carousel-kapak", "Carousel kapak"], ["ig-carousel-ic-sayfa", "Carousel iç sayfa"],
  ["ig-story-haber", "Story haber"], ["ig-story-etkilesim", "Story etkileşim"], ["ig-reels-kapak", "Reels kapak"],
  ["bulten-haftalik", "Haftalık bülten"], ["bulten-son-dakika", "Son dakika e-postası"],
  ["panel-yerlesim", "Panel yerleşim"], ["panel-durum-tablo", "Panel durum ve tablo"], ["panel-koyu-mod", "Panel koyu mod"],
];
const KURALLAR = [
  "Turuncu zeminde yazı ve logo siyah; mavi zeminde beyaz. Turuncu bir yüzeyde tek öğede.",
  "Mavi zemine turuncu etiket konmaz; beyaz etiket kullanılır.",
  "Instagram'da logo yalnızca UP, sol üstte; yatay logo kullanılmaz.",
  "Logo germe, döndürme, gölge, palet dışı renk yok; outline sürüm logo değil, sadece desen.",
  "Başlık satır yüksekliği 1,2 (Türkçe Ü, İ, Ğ, Ç, Ş çakışmasın).",
  "Instagram kapak en fazla 6, story 5, thumbnail 4 kelime. Ünlem, \"şok\", \"flaş\" yok.",
  "Güvenli alan: gönderi 1080×1350 kenar 64, üst/alt 96 · story 1080×1920 üst 250, alt 340.",
];

export default function MarkaKiti() {
  const [kopyalandi, setK] = useState("");
  const [tur, setTur] = useState<Tur>("yatay");
  async function kopyala(t: string) {
    try { await navigator.clipboard.writeText(t); setK(t); setTimeout(() => setK(""), 1500); } catch { /* eski tarayıcı */ }
  }
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
        <h2>Marka Kiti</h2>
        <span className="muted mono">Sürüm 1.2 · 21 Ekim 2026</span>
      </div>

      <h3>Renkler</h3>
      <div className="mk-renkler">
        {RENKLER.map((r) => (
          <button key={r.hex} className="panel mk-renk" onClick={() => kopyala(r.hex)} title="Kodu kopyala">
            <div className="mk-ornek" style={{ background: r.hex, color: r.yazi }}>Aa</div>
            <strong>{r.ad}</strong>
            <span className="mono">{kopyalandi === r.hex ? "Kopyalandı" : r.hex}</span>
            <span className="muted">{r.not}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="muted">Arayüz için (yalnız metin ve çizgi):</span>
        {NOTRLER.map(([ad, hex]) => (
          <button key={hex} className="chip" onClick={() => kopyala(hex)}><span className="mk-nokta" style={{ background: hex }} />{ad} <span className="mono">{kopyalandi === hex ? "Kopyalandı" : hex}</span></button>
        ))}
      </div>

      <h3>Yazı tipleri</h3>
      <div className="panel stack" style={{ gap: 0 }}>
        {YAZILAR.map((y) => (
          <div key={y.rol} className="mk-yazi">
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <span style={{ ...y.stil }}>{y.ornek}</span>
              <span className="muted">{y.not}</span>
            </div>
            <div className="stack" style={{ gap: 2, textAlign: "right" }}>
              <strong>{y.rol}</strong>
              <span className="muted mono">{y.ad}</span>
            </div>
          </div>
        ))}
      </div>

      <h3>Logolar</h3>
      <div className="segment" role="group">
        {TURLER.map(([k, l]) => <button key={k} aria-pressed={tur === k} onClick={() => setTur(k)}>{l}</button>)}
      </div>
      <p className="muted" style={{ margin: 0 }}>{TURLER.find((t) => t[0] === tur)![2]}</p>
      <div className="mk-logolar">
        {LOGO_RENK.map((l) => {
          const ad = `updated-${tur}-${l.r}`;
          return (
            <div key={l.r} className="panel mk-logo">
              <div className="mk-logo-zemin" style={{ background: l.zemin }}><img src={`${K}logo/svg/${ad}.svg`} alt={`UPDATED ${tur} logo, ${l.ad}`} /></div>
              <span className="muted">{l.ad}</span>
              <div className="row" style={{ gap: 6 }}>
                <a className="btn ghost sm" href={`${K}logo/svg/${ad}.svg`} download>SVG</a>
                {PNG_VAR.has(tur) && <a className="btn ghost sm" href={`${K}logo/png/${ad}-2048.png`} download>PNG</a>}
              </div>
            </div>
          );
        })}
      </div>

      <h3>Temel kurallar</h3>
      <ul className="panel mk-kurallar">{KURALLAR.map((k) => <li key={k}>{k}</li>)}</ul>

      <h3>Şablon örnekleri</h3>
      <p className="muted" style={{ margin: 0 }}>Örnektir: içerik değişir; ölçü, güvenli alan, logo yeri ve renk eşleşmesi değişmez.</p>
      <div className="mk-ornekler">
        {ORNEKLER.map(([d, ad]) => (
          <a key={d} className="mk-sablon" href={`${K}sablon-ornekleri/${d}.png`} target="_blank" rel="noreferrer">
            <img src={`${K}sablon-ornekleri/${d}.png`} alt={ad} loading="lazy" />
            <span>{ad}</span>
          </a>
        ))}
      </div>

      <h3>Dosyalar</h3>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <a className="btn ghost" href={`${K}makine/marka-kiti.md`} download>Kuralların tamamı (md)</a>
        <a className="btn ghost" href={`${K}makine/tokens.json`} download>Değerler (tokens.json)</a>
      </div>
    </div>
  );
}
