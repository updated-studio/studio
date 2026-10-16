// Taslak metni (Markdown) → HTML. Tek kaynak: hem ekrandaki "HTML kopyala"/önizleme hem WordPress'e gönderim bunu kullanır,
// böylece editörün kopyaladığı ile siteye giden aynı olur. Saf TypeScript (tarayıcı ve sunucu ortak).

export const kacis = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const satirIci = (s: string) => kacis(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");

/** Basit Markdown → HTML (ara başlık, paragraf, liste, kalın). */
export function mdHtml(md: string): string {
  const out: string[] = [];
  let liste: string[] = [];
  const bitir = () => { if (liste.length) { out.push("<ul>" + liste.map((l) => `<li>${satirIci(l)}</li>`).join("") + "</ul>"); liste = []; } };
  for (const blok of md.replace(/\r/g, "").split(/\n{2,}/)) {
    for (const s of blok.split("\n")) {
      const t = s.trim();
      if (!t) continue;
      if (/^[-*]\s+/.test(t)) { liste.push(t.replace(/^[-*]\s+/, "")); continue; }
      bitir();
      if (/^###\s+/.test(t)) out.push(`<h3>${satirIci(t.slice(4))}</h3>`);
      else if (/^##\s+/.test(t)) out.push(`<h2>${satirIci(t.slice(3))}</h2>`);
      else if (/^#\s+/.test(t)) out.push(`<h2>${satirIci(t.slice(2))}</h2>`);
      else out.push(`<p>${satirIci(t)}</p>`);
    }
    bitir();
  }
  return out.join("\n");
}

/** Yazının gövdesi: kalın spot + metin. Editör notları, sorular, doğrulama listesi buraya girmez. */
export function yaziHtml(spot: string, body: string): string {
  return (spot ? `<p><strong>${kacis(spot)}</strong></p>\n` : "") + mdHtml(body);
}
