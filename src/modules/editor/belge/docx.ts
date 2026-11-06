// Word (.docx) okuyucu (6 Kasım 2026, Belgeden yaz): ek kütüphane yok. .docx bir zip; tarayıcının kendi açıcısı (DecompressionStream
// "deflate-raw") ile word/document.xml ve fotoğraflar alınır. Çıktı belgenin akışı: paragraflar, tablo satırları ve fotoğraflar sırasıyla.

export type Blok = { i: number; t: "p" | "img" | "tablo"; s?: string; kalin?: boolean; boy?: number; n?: number };
export type Foto = { n: number; ad: string; mime: string; veri: Blob };
export type Belge = { bloklar: Blok[]; fotolar: Foto[] };

/** Zip'in merkez dizininden dosya adı → içerik (yalnız istenen adlar açılır) */
async function zipAc(buf: ArrayBuffer, iste: (ad: string) => boolean): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("Dosya bir Word belgesi değil (zip okunamadı).");
  const adet = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const cik = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let k = 0; k < adet; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const yontem = v.getUint16(p + 10, true), boy = v.getUint32(p + 20, true);
    const adU = v.getUint16(p + 28, true), ekU = v.getUint16(p + 30, true), notU = v.getUint16(p + 32, true);
    const yer = v.getUint32(p + 42, true);
    const ad = dec.decode(u8.subarray(p + 46, p + 46 + adU));
    p += 46 + adU + ekU + notU;
    if (!iste(ad)) continue;
    const bas = yer + 30 + v.getUint16(yer + 26, true) + v.getUint16(yer + 28, true);
    const ham = u8.subarray(bas, bas + boy);
    if (yontem === 0) cik.set(ad, ham.slice());
    else if (yontem === 8) cik.set(ad, new Uint8Array(await new Response(new Blob([ham]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()));
  }
  return cik;
}

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export async function docxOku(dosya: File): Promise<Belge> {
  const z = await zipAc(await dosya.arrayBuffer(), (a) => a === "word/document.xml" || a === "word/_rels/document.xml.rels" || a.startsWith("word/media/"));
  const xml = z.get("word/document.xml");
  if (!xml) throw new Error("Belgenin metni bulunamadı (word/document.xml yok).");
  const dec = new TextDecoder();
  const P = new DOMParser();
  const doc = P.parseFromString(dec.decode(xml), "application/xml");
  const rels = new Map<string, string>();
  const relXml = z.get("word/_rels/document.xml.rels");
  if (relXml) for (const r of Array.from(P.parseFromString(dec.decode(relXml), "application/xml").getElementsByTagName("Relationship")))
    rels.set(r.getAttribute("Id") ?? "", "word/" + (r.getAttribute("Target") ?? "").replace(/^\/?word\//, ""));

  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const bloklar: Blok[] = [], fotolar: Foto[] = [];
  const fotoNo = new Map<string, number>();
  const ekle = (b: Omit<Blok, "i">) => bloklar.push({ i: bloklar.length, ...b });
  const fotoEkle = (rid: string) => {
    const yol = rels.get(rid); const veri = yol ? z.get(yol) : undefined;
    if (!yol || !veri) return;
    const uz = yol.split(".").pop()!.toLowerCase();
    if (!MIME[uz]) return;
    let n = fotoNo.get(yol);
    if (!n) { n = fotolar.length + 1; fotoNo.set(yol, n); fotolar.push({ n, ad: yol.split("/").pop()!, mime: MIME[uz], veri: new Blob([veri as Uint8Array<ArrayBuffer>], { type: MIME[uz] }) }); }
    ekle({ t: "img", n });
  };
  const paragraf = (p: Element, tablo = false) => {
    let s = "", kalinHarf = 0, harf = 0, boy = 0;
    for (const r of Array.from(p.getElementsByTagNameNS(W, "r"))) {
      for (const bl of Array.from(r.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/main", "blip"))) {
        const rid = bl.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed");
        if (rid) { if (s.trim()) { ekle({ t: tablo ? "tablo" : "p", s: s.trim() }); s = ""; } fotoEkle(rid); }
      }
      const rpr = r.getElementsByTagNameNS(W, "rPr")[0];
      const b = rpr?.getElementsByTagNameNS(W, "b")[0];
      const kalin = !!b && b.getAttributeNS(W, "val") !== "0" && b.getAttributeNS(W, "val") !== "false";
      const sz = Number(rpr?.getElementsByTagNameNS(W, "sz")[0]?.getAttributeNS(W, "val") ?? 0) / 2;
      for (const c of Array.from(r.childNodes) as Element[]) {
        const ad = c.localName;
        const parca = ad === "t" ? c.textContent ?? "" : ad === "tab" ? "\t" : ad === "br" ? "\n" : "";
        if (!parca) continue;
        s += parca;
        const n = parca.replace(/\s/g, "").length;
        harf += n; if (kalin) kalinHarf += n; if (sz > boy && n) boy = sz;
      }
    }
    const metin = s.replace(/[ \t]{2,}/g, "   ").trim();
    if (metin) ekle({ t: tablo ? "tablo" : "p", s: metin, ...(harf && kalinHarf / harf > 0.8 ? { kalin: true } : {}), ...(boy ? { boy } : {}) });
  };
  const gez = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.localName === "p") paragraf(c);
      else if (c.localName === "tbl") {
        for (const tr of Array.from(c.getElementsByTagNameNS(W, "tr"))) {
          const hucre = Array.from(tr.getElementsByTagNameNS(W, "tc")).map((tc) => Array.from(tc.getElementsByTagNameNS(W, "t")).map((t) => t.textContent).join("").trim());
          if (hucre.some(Boolean)) ekle({ t: "tablo", s: hucre.join(" | ") });
        }
      } else if (c.localName === "sdt" || c.localName === "sdtContent" || c.localName === "body") gez(c);
    }
  };
  gez(doc.getElementsByTagNameNS(W, "body")[0] ?? doc.documentElement);
  return { bloklar, fotolar };
}

/** Fotoğrafın yapay zekâya gidecek küçük kopyası (uzun kenar 640 px, JPEG), base64 */
export async function kucukKopya(veri: Blob, uzun = 640): Promise<string> {
  const bmp = await createImageBitmap(veri);
  const o = Math.min(1, uzun / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * o); c.height = Math.round(bmp.height * o);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const b = await new Promise<Blob>((ok, red) => c.toBlob((x) => (x ? ok(x) : red(new Error("Küçük kopya üretilemedi"))), "image/jpeg", 0.72));
  return dosyaB64(b);
}

export async function dosyaB64(b: Blob): Promise<string> {
  const u8 = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
