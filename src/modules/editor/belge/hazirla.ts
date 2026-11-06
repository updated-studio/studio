// Belgeden yaz (6 Kasım 2026): yapay zekânın kararı (supabase/functions/belge-yaz) + belgenin kendisi → panelde taslak.
// "koru" modunda metin belgeden birleştirilir: yapay zekâ yalnız düzelttiği paragrafları döner, gerisi harfi harfine belgedeki gibi kalır.
// Taslak editörün kendi panel yetkisiyle açılır (yazar kilidi panelin kuralı: yönetici değilse imza editörün olur).
import { sb } from "../../../shared/supabase";
import * as api from "../../site/api";
import { docxOku, dosyaB64, kucukKopya, type Belge } from "./docx";

export type YzSonuc = {
  tur: "inceleme" | "rehber" | "haber"; mod: "koru" | "yaz";
  baslik: string; spot: string; kisa: string; seoBaslik: string; seoAciklama: string;
  urun: { marka: string; model: string; tur?: string }; yazar: string; katki: string;
  cikar: number[]; basliklar: number[]; duzeltmeler: { i: number; metin: string }[]; govde: string;
  gorseller: { n: number; alt: string; altyazi: string }[]; kapak: number;
  puanKutusu: { puan: number | null; arti: string[]; eksi: string[]; uygun: string[]; degil: string[]; kullanimGun: number | null; cihazKaynagi: string };
  degisiklikler: string[]; eksikler: string[];
};
export type Hazir = { k: api.Koleksiyon; id: number; sonuc: YzSonuc; urun: { id: number; ad: string; yeni?: boolean } | null; yazar: { id: number; ad: string } | null; fotoSayisi: number; uyarilar: string[]; onizleme: string };
export type Adim = "okunuyor" | "sira" | "yz" | "fotolar" | "taslak";

const kes = (s: string, n: number) => { const t = (s ?? "").trim(); return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…"; };
const sade = (s: string) => s.toLocaleLowerCase("tr").replace(/[^a-z0-9ğüşöçı.]/g, "");

// ---- Lexical (panelin zengin metni) ----
const metinDugum = (text: string, format = 0) => ({ type: "text", text, format, detail: 0, mode: "normal", style: "", version: 1 });
/** "**kalın**" işaretli satırı metin düğümlerine böler */
function satirIci(s: string) {
  const out: ReturnType<typeof metinDugum>[] = [];
  s.split(/(\*\*[^*]+\*\*)/g).forEach((p) => { if (!p) return; const m = p.match(/^\*\*([^*]+)\*\*$/); out.push(m ? metinDugum(m[1], 1) : metinDugum(p)); });
  return out;
}
const kap = { direction: "ltr", format: "", indent: 0, version: 1 };
const paragrafD = (s: string) => ({ type: "paragraph", ...kap, textFormat: 0, textStyle: "", children: satirIci(s) });
const baslikD = (s: string) => ({ type: "heading", tag: "h2", ...kap, children: satirIci(s.replace(/\*\*/g, "")) });
const gorselD = (id: number) => ({ type: "upload", version: 3, format: "", id: crypto.randomUUID().replace(/-/g, "").slice(0, 24), fields: null, relationTo: "media", value: id });
const listeD = (maddeler: string[]) => ({ type: "list", listType: "bullet", tag: "ul", start: 1, ...kap,
  children: maddeler.map((m, i) => ({ type: "listitem", value: i + 1, ...kap, children: satirIci(m) })) });
const kok = (children: unknown[]) => ({ root: { type: "root", ...kap, children } });

/** Belgeden (koru) ya da yapay zekânın markdown'ından (yaz) gövde; fotoğraf n → panel medya numarası */
function govdeKur(b: Belge, s: YzSonuc, medya: Map<number, number>, kapakN: number) {
  const dugum: unknown[] = [];
  if (s.mod === "koru" && b.bloklar.length) {
    const cikar = new Set(s.cikar), baslik = new Set(s.basliklar);
    const duz = new Map(s.duzeltmeler.map((d) => [d.i, d.metin]));
    let ilkFoto = true;
    for (const x of b.bloklar) {
      if (x.t === "img") {
        const id = medya.get(x.n!);
        // Kapak sayfanın üstünde zaten görünüyor: yazının başındaki aynı kare metne ikinci kez girmez
        if (id && !(ilkFoto && x.n === kapakN)) dugum.push(gorselD(id));
        ilkFoto = false;
        continue;
      }
      if (cikar.has(x.i)) continue;
      const m = duz.get(x.i) ?? x.s ?? "";
      if (!m.trim()) continue;
      dugum.push(baslik.has(x.i) ? baslikD(m) : paragrafD(m));
    }
  } else {
    let liste: string[] = [];
    const bosalt = () => { if (liste.length) dugum.push(listeD(liste)); liste = []; };
    for (const p of s.govde.split(/\n{2,}|\n(?=## |\[\[foto-|- )/)) {
      const t = p.trim();
      if (!t) continue;
      const f = t.match(/^\[\[foto-(\d+)\]\]$/);
      if (/^[-*] /.test(t)) { liste.push(...t.split("\n").map((l) => l.replace(/^[-*]\s+/, "").trim()).filter(Boolean)); continue; }
      bosalt();
      if (f) { const id = medya.get(Number(f[1])); if (id && Number(f[1]) !== kapakN) dugum.push(gorselD(id)); }
      else if (t.startsWith("## ")) dugum.push(baslikD(t.slice(3)));
      else dugum.push(paragrafD(t.replace(/\n/g, " ")));
    }
    bosalt();
  }
  return kok(dugum);
}

// ---- Panel ----
async function urunBul(u: YzSonuc["urun"]): Promise<{ id: number; ad: string } | null> {
  if (!u?.model?.trim()) return null;
  const hedef = sade(`${u.model}`);
  const p = new URLSearchParams({ limit: "300", depth: "0", "select[name]": "true", "select[brand]": "true" });
  if (u.marka?.trim()) p.set("where[brand][like]", u.marka.trim());
  else p.set("where[name][like]", u.model.trim().split(/\s+/)[0]);
  const r = await api.istekYap<{ docs: { id: number; name: string; brand: string }[] }>(`/products?${p}`).catch(() => ({ docs: [] }));
  // Model adı en çok örtüşen künye: noktalama ve "|" gibi işaretler yok sayılır (belgede "DG | Art", künyede "DG Art")
  let en: { id: number; ad: string } | null = null, enPuan = 0;
  for (const d of r.docs) {
    const a = sade(d.name);
    const puan = a === hedef ? 100 : hedef.includes(a) || a.includes(hedef) ? 80 - Math.abs(a.length - hedef.length) : 0;
    if (puan > enPuan) { enPuan = puan; en = { id: d.id, ad: `${d.brand} ${d.name}` }; }
  }
  return enPuan >= 60 ? en : null;
}

async function yazarBul(ad: string): Promise<{ id: number; ad: string } | null> {
  if (!ad.trim()) return null;
  const p = new URLSearchParams({ limit: "5", depth: "0", "where[name][like]": ad.trim() });
  const r = await api.istekYap<{ docs: { id: number; name: string }[] }>(`/authors?${p}`).catch(() => ({ docs: [] }));
  const tam = r.docs.find((d) => sade(d.name) === sade(ad)) ?? r.docs[0];
  return tam ? { id: tam.id, ad: tam.name } : null;
}

/** Fotoğrafı panele yükler; çok büyükse uzun kenarı 2560 px'e indirilir */
async function fotoYukle(f: Belge["fotolar"][number], alt: string, credit: string, adi: string) {
  let veri: Blob = f.veri, mime = f.mime;
  if (veri.size > 5_000_000) {
    const bmp = await createImageBitmap(veri); const o = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * o); c.height = Math.round(bmp.height * o);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    veri = await new Promise<Blob>((ok) => c.toBlob((x) => ok(x!), "image/jpeg", 0.9)); mime = "image/jpeg";
  }
  const uz = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return api.medyaYukle(new File([veri], `${adi}-${f.n}.${uz}`, { type: mime }), alt, credit, false);
}

const dosyaAdi = (s: string) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "belge";

export async function belgedenHazirla(dosya: File, adim: (a: Adim, ek?: string) => void): Promise<Hazir> {
  const pdf = /\.pdf$/i.test(dosya.name) || dosya.type === "application/pdf";
  if (!pdf && !/\.docx$/i.test(dosya.name)) throw new Error("Yalnız Word (.docx) ve PDF belgeleri okunabiliyor. Eski .doc dosyasını Word'de .docx olarak kaydet.");
  if (dosya.size > 40_000_000) throw new Error("Belge 40 MB'tan büyük.");
  adim("okunuyor");
  const belge: Belge = pdf ? { bloklar: [], fotolar: [] } : await docxOku(dosya);
  if (!pdf && !belge.bloklar.some((b) => b.t !== "img")) throw new Error("Belgede metin bulunamadı.");
  if (pdf && dosya.size > 10_000_000) throw new Error("PDF 10 MB'tan büyük. Word belgesi varsa onu yükle; fotoğraflar da ondan alınır.");
  const kucukler = await Promise.all(belge.fotolar.slice(0, 30).map(async (f) => ({ n: f.n, b64: await kucukKopya(f.veri).catch(() => "") })));

  const cagir = async (body: Record<string, unknown>): Promise<{ is?: string; durum?: string; ok?: boolean; hata?: string; sonuc?: YzSonuc; sira?: boolean; onunde?: number }> => {
    const { data, error } = await sb.functions.invoke("belge-yaz", { body });
    if (!error) return data;
    const j = await (error as { context?: Response }).context?.json?.().catch(() => null) as { hata?: string } | null;
    throw new Error(j?.hata || error.message || "Yapay zekâ yanıt vermedi.");
  };
  // İş arka planda yürür (uzun belgede 2-4 dakika); sonuç 5 saniyede bir sorulur, en çok 7 dakika
  // Aynı anda en çok 2 belge işlenir (sunucu küçük); doluysa 10 saniyede bir yeniden denenir, en çok 15 dakika
  const govde = { dosyaAdi: dosya.name, bloklar: belge.bloklar, kucukler: kucukler.filter((k) => k.b64), ...(pdf ? { pdf: await dosyaB64(dosya) } : {}) };
  let bas = await cagir(govde);
  for (const son = Date.now() + 15 * 60_000; (bas as { sira?: boolean }).sira; bas = await cagir(govde)) {
    if (Date.now() > son) throw new Error("Sırada çok uzun beklendi. Biraz sonra yeniden dene.");
    adim("sira", `önünde ${(bas as { onunde?: number }).onunde ?? 1} belge var`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  if (!bas.is) throw new Error(bas.hata || "İş başlatılamadı.");
  adim("yz", `${belge.bloklar.filter((b) => b.t !== "img").length} paragraf, ${belge.fotolar.length} fotoğraf`);
  const birak = () => cagir({ birak: bas.is }).catch(() => null);
  try { return await bitir(bas.is); } finally { await birak(); }
  async function bitir(is: string): Promise<Hazir> {
  let data: Awaited<ReturnType<typeof cagir>> = { durum: "suruyor" };
  for (const son = Date.now() + 7 * 60_000; data.durum !== "bitti"; ) {
    if (Date.now() > son) throw new Error("Yapay zekâ 7 dakikada bitiremedi. Biraz sonra yeniden dene.");
    await new Promise((r) => setTimeout(r, 5_000));
    data = await cagir({ durum: is }).catch((e) => ((e as Error).message.includes("başkasının") ? Promise.reject(e) : { durum: "suruyor" }));
  }
  if (!data.ok || !data.sonuc) throw new Error(data.hata || "Yapay zekâ yanıt vermedi.");
  const s = data.sonuc as YzSonuc;
  const uyarilar: string[] = [];

  const [bulunan, yazar] = await Promise.all([s.tur === "inceleme" || s.urun?.model ? urunBul(s.urun) : null, yazarBul(s.yazar)]);
  let urun: Hazir["urun"] = bulunan;
  // Künye yoksa açılır (6 Kasım 2026, kullanıcı onayı): ad, marka ve tür belgeden; teknik özellikleri künye otomasyonu üreticinin resmî
  // sayfasından doldurur, öneriler Künye onayı'na düşer. Otomasyon çağrısı beklenmez; yarıda kalırsa günlük künye turu ürünü yine alır.
  if (!urun && s.tur === "inceleme" && s.urun?.model?.trim() && s.urun?.marka?.trim()) {
    try {
      const y = await api.istekYap<{ doc: { id: number; name: string; brand: string } }>("/products?depth=0", { method: "POST",
        body: JSON.stringify({ name: s.urun.model.trim(), brand: s.urun.marka.trim(), type: s.urun.tur || "other", status: "satista" }) });
      urun = { id: y.doc.id, ad: `${y.doc.brand} ${y.doc.name}`, yeni: true };
      sb.functions.invoke("kunye-otomatik", { body: { urun_id: y.doc.id } }).catch(() => null);
      uyarilar.push(`"${urun.ad}" künyesi yeni açıldı. Teknik özellikler otomasyonla dolacak, Künye onayı ekranından onayla.`);
    } catch (e) { uyarilar.push(`Künye açılamadı: ${(e as Error).message}`); }
  }
  if (s.tur === "inceleme" && !urun) uyarilar.push(`"${[s.urun?.marka, s.urun?.model].filter(Boolean).join(" ")}" künyesi bulunamadı ve açılamadı. Taslakta künyeyi seç.`);
  if (s.yazar && !yazar) uyarilar.push(`"${s.yazar}" adlı yazar sitede yok. Yönetici yazar profilini açınca imzayı değiştirebilir.`);

  // Fotoğraflar: alt metin ve altyazı yapay zekâdan; sitede fotoğrafın altında künye alanı görünür (altyazı + fotoğrafçı)
  adim("fotolar", `0/${belge.fotolar.length}`);
  const bilgi = new Map(s.gorseller.map((g) => [g.n, g]));
  const fotografci = s.yazar ? `Fotoğraf: ${s.yazar}` : "Fotoğraf: Updated";
  const medya = new Map<number, number>();
  const adi = dosyaAdi(s.baslik.split(":")[0]);
  let yuklenen = 0;
  for (const f of belge.fotolar) {
    const g = bilgi.get(f.n);
    const alt = kes(g?.alt || s.baslik, 125);
    const credit = [g?.altyazi?.trim(), fotografci].filter(Boolean).join(" · ");
    try { const m = await fotoYukle(f, alt, credit, adi); medya.set(f.n, m.id); }
    catch (e) { uyarilar.push(`Fotoğraf ${f.n} yüklenemedi: ${(e as Error).message}`); }
    adim("fotolar", `${++yuklenen}/${belge.fotolar.length}`);
  }
  const kapakN = medya.has(s.kapak) ? s.kapak : belge.fotolar[0]?.n ?? 0;
  if (pdf) uyarilar.push("PDF'ten fotoğraf alınmadı. Fotoğraflar için Word belgesini yükle ya da taslağa elle ekle.");

  adim("taslak");
  const k: api.Koleksiyon = s.tur === "inceleme" && urun ? "reviews" : "news";
  if (s.tur === "inceleme" && k === "news") uyarilar.push("Künye olmadığı için yazı haber taslağı olarak açıldı.");
  const pk = s.puanKutusu;
  const veri: Record<string, unknown> = {
    title: kes(s.baslik, 70), spot: kes(s.spot, 160), shortAnswer: s.kisa,
    body: govdeKur(belge, s, medya, kapakN),
    ...(medya.get(kapakN) ? { cover: medya.get(kapakN) } : {}),
    ...(yazar ? { author: yazar.id } : {}),
    seo: { title: kes(s.seoBaslik, 60), description: kes(s.seoAciklama, 160) },
    _status: "draft",
    ...(k === "reviews" ? {
      product: urun!.id,
      scoreBox: {
        ...(pk.puan != null && pk.puan >= 0 && pk.puan <= 20 ? { score: Math.round(pk.puan) } : {}),
        pros: pk.arti.slice(0, 3).map((x) => x.split(/\s+/).slice(0, 6).join(" ")),
        cons: pk.eksi.slice(0, 3).map((x) => x.split(/\s+/).slice(0, 6).join(" ")),
        ...(pk.kullanimGun ? { usageDays: pk.kullanimGun } : {}),
        ...(pk.cihazKaynagi?.trim() ? { deviceSource: pk.cihazKaynagi.trim() } : {}),
        who: { for: pk.uygun.slice(0, 4), notFor: pk.degil.slice(0, 4) },
      },
    } : urun ? { products: [urun.id] } : {}),
  };
  const r = await api.istekYap<{ doc: { id: number; author?: number | { id: number } } }>(`/${k}?draft=true&depth=0`, { method: "POST", body: JSON.stringify(veri) });
  const yazili = typeof r.doc.author === "object" ? r.doc.author?.id : r.doc.author;
  if (yazar && yazili && yazili !== yazar.id) uyarilar.push(`İmza panelin kuralıyla senin adına açıldı. "${yazar.ad}" imzasını yalnız yönetici verebilir.`);
  const onizleme = await api.onizlemeAdresi(k, r.doc.id).catch(() => "");
  return { k, id: r.doc.id, sonuc: s, urun, yazar: yazar && yazili === yazar.id ? yazar : null, fotoSayisi: medya.size, uyarilar, onizleme };
  }
}

