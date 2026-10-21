// Şeffaf zemin şablonunun SVG çıktısı (21 Ekim 2026, Enes: "PNG, SVG, alfa kanallı alabilmeli").
// Logo marka kitinin kendi SVG'sinden, kategori yazısı yola (path) çevrilmiş olarak gelir: dosyayı açan
// programda (Illustrator, Figma, After Effects, Premiere) yazı tipi yüklü olmasa da birebir aynı görünür.
import opentype from "opentype.js";
import latinUrl from "@fontsource/big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff?url";
import extUrl from "@fontsource/big-shoulders-display/files/big-shoulders-display-latin-ext-900-normal.woff?url";
import { klasik } from "./motor.js";

type Ayar = Record<string, number>;
type Durum = { cat?: string; _adj: Record<string, Ayar>; _order: string[]; _logo: string };

let fontlar: Promise<opentype.Font[]> | null = null;
const fontAl = () => (fontlar ??= Promise.all([latinUrl, extUrl].map(async (u) => opentype.parse(await (await fetch(u)).arrayBuffer()))));

// Her harf, onu içeren yazı tipinden çizilir (Türkçe İ, Ş, Ğ ikinci dosyada)
function yaziYolu(fs: opentype.Font[], metin: string, x: number, taban: number, px: number) {
  let d = "", gx = x, onceki: { f: opentype.Font; g: opentype.Glyph } | null = null;
  for (const ch of metin) {
    const f = fs.find((ff) => ff.charToGlyph(ch).index > 0) ?? fs[0], g = f.charToGlyph(ch), k = px / f.unitsPerEm;
    if (onceki && onceki.f === f) gx += f.getKerningValue(onceki.g, g) * k;
    d += g.getPath(gx, taban, px).toPathData(2);
    gx += (g.advanceWidth ?? 0) * k; onceki = { f, g };
  }
  return { d, w: gx - x };
}
const donustur = (a: Ayar, cx: number, cy: number) => `translate(${cx + (a.x || 0)} ${cy + (a.y || 0)}) rotate(${a.r || 0}) scale(${a.s ?? 1}) translate(${-cx} ${-cy})`;

export async function seffafSvg(): Promise<string> {
  const s = klasik.state.seffaf as Durum, ad = (k: string) => s._adj[k] || { s: 1, x: 0, y: 0, r: 0 };
  const L = klasik.SEFFAF.logo as [number, number, number], E = klasik.SEFFAF.etiket as { x: number; y: number; size: number; px: number; py: number };
  const katmanlar = klasik.T.seffaf.layers(s, {}, ad) as { k: string; a: [number, number] }[];
  const capa = Object.fromEntries(katmanlar.map((l) => [l.k, l.a]));
  const parca: Record<string, string> = {};

  // Logo
  const anahtar = s._logo || klasik.defLogo("seffaf");
  const h = (L[2] * 288) / 212;
  const m = /^kit-(up|yatay)-(\w+)$/.exec(anahtar);
  if (m) {
    const kaynak = await (await fetch(`marka/logo/svg/updated-${m[1]}-${m[2]}.svg`)).text();
    const vb = (/viewBox="([^"]+)"/.exec(kaynak)?.[1] ?? "0 0 100 100").split(/[\s,]+/).map(Number);
    const ic = kaynak.replace(/<\?xml[^>]*>/, "").replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<title>[\s\S]*?<\/title>/, "");
    const nw = h * (vb[2] / vb[3]);
    parca.logo = `<svg x="${L[0] + (L[2] - nw) / 2}" y="${L[1]}" width="${nw}" height="${h}" viewBox="${vb.join(" ")}">${ic}</svg>`;
  } else {
    // Eski logolar yalnızca resim olarak var: SVG'nin içine gömülür (vektör değil)
    const img = klasik.IMG["lg-" + anahtar] as HTMLImageElement | undefined;
    if (img) { const nw = h * (img.width / img.height); parca.logo = `<image x="${L[0] + (L[2] - nw) / 2}" y="${L[1]}" width="${nw}" height="${h}" href="${img.src}"/>`; }
  }

  // Kategori etiketi
  if (s.cat) {
    const fs = await fontAl(), metin = s.cat.toLocaleUpperCase("tr-TR"), [zemin, yazi] = klasik.kitEtiketRenk(s.cat) as [string, string];
    const h2 = E.size + E.py * 2, taban = E.y + h2 / 2 + E.size * 0.4, y = yaziYolu(fs, metin, E.x + E.px, taban, E.size), w = Math.ceil(y.w) + E.px * 2;
    const cerceve = zemin === "#F2F2F2" || zemin === "#FFFFFF" ? ` stroke="#000" stroke-width="2"` : "";
    parca.cat = `<rect x="${E.x + (cerceve ? 1 : 0)}" y="${E.y + (cerceve ? 1 : 0)}" width="${w - (cerceve ? 2 : 0)}" height="${h2 - (cerceve ? 2 : 0)}" fill="${zemin}"${cerceve}/><path d="${y.d}" fill="${yazi}"/>`;
  }

  const govde = s._order.filter((k) => parca[k]).map((k) => `<g transform="${donustur(ad(k), capa[k][0], capa[k][1])}">${parca[k]}</g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${klasik.W}" height="${klasik.H}" viewBox="0 0 ${klasik.W} ${klasik.H}"><title>UPDATED ${s.cat ?? ""}</title>${govde}</svg>`;
}
