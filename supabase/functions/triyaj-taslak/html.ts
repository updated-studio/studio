// Taslak metni (Markdown) → WordPress blok HTML'i. Tek kaynak: hem ekrandaki "HTML kopyala"/önizleme hem WordPress'e gönderim bunu kullanır,
// böylece editörün kopyaladığı ile siteye giden aynı olur. Saf TypeScript (tarayıcı ve sunucu ortak).
// Sitenin yazı biçimi (ARCHITECTURE.md, 17 Ekim 2026): gövde paragrafları ve listeler 16px, ara başlıklar mavi
// (WordPress'in "vivid-cyan-blue" rengi, #0693e3). Çıktı Gutenberg blok yorumlarıyla yazılır; böylece taslak
// WordPress'te "Klasik" blok olarak değil, editörün elle yaptığıyla birebir aynı bloklar olarak açılır.

export const kacis = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Satır içi: **kalın**, *italik*, [bağlantı](https://...) (iç link; sadece http/https adres)
const satirIci = (s: string) => kacis(s)
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)"]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+?)\*/g, "$1<em>$2</em>");

/** Gövde yazı boyutu ve ara başlık rengi (sitedeki yazılarla aynı) */
export const GOVDE_PX = "16px";
const BASLIK_RENK = "vivid-cyan-blue";

const paragraf = (ic: string) =>
  `<!-- wp:paragraph {"style":{"typography":{"fontSize":"${GOVDE_PX}"}}} -->\n<p style="font-size:${GOVDE_PX}">${ic}</p>\n<!-- /wp:paragraph -->`;

const baslik = (seviye: 2 | 3, ic: string) =>
  `<!-- wp:heading${seviye === 3 ? ' {"level":3}' : ""} -->\n<h${seviye} class="wp-block-heading"><mark style="background-color:rgba(0, 0, 0, 0)" class="has-inline-color has-${BASLIK_RENK}-color">${ic}</mark></h${seviye}>\n<!-- /wp:heading -->`;

const listeBlok = (maddeler: string[]) =>
  `<!-- wp:list {"style":{"typography":{"fontSize":"${GOVDE_PX}"}}} -->\n<ul style="font-size:${GOVDE_PX}" class="wp-block-list">` +
  maddeler.map((l) => `<!-- wp:list-item -->\n<li>${satirIci(l)}</li>\n<!-- /wp:list-item -->`).join("\n\n") +
  `</ul>\n<!-- /wp:list -->`;

/** Basit Markdown → WordPress blokları (ara başlık, paragraf, liste, kalın). */
export function mdHtml(md: string): string {
  const out: string[] = [];
  let liste: string[] = [];
  const bitir = () => { if (liste.length) { out.push(listeBlok(liste)); liste = []; } };
  for (const blok of md.replace(/\r/g, "").split(/\n{2,}/)) {
    for (const s of blok.split("\n")) {
      const t = s.trim();
      if (!t) continue;
      if (/^[-*]\s+/.test(t)) { liste.push(t.replace(/^[-*]\s+/, "")); continue; }
      bitir();
      if (/^###\s+/.test(t)) out.push(baslik(3, satirIci(t.slice(4))));
      else if (/^##\s+/.test(t)) out.push(baslik(2, satirIci(t.slice(3))));
      else if (/^#\s+/.test(t)) out.push(baslik(2, satirIci(t.slice(2))));
      else out.push(paragraf(satirIci(t)));
    }
    bitir();
  }
  return out.join("\n\n");
}

/** Yazının gövdesi: kalın spot + metin. Editör notları, sorular, doğrulama listesi buraya girmez. */
export function yaziHtml(spot: string, body: string): string {
  return (spot ? paragraf(`<strong>${kacis(spot)}</strong>`) + "\n\n" : "") + mdHtml(body);
}
