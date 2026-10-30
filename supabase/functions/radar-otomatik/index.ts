// Çıkış radarı otomasyonu (30 Ekim 2026, kullanıcı: "çıkış radarlarını da otomatiğe bağlamak istiyorum", "hem bunlara hem interneti kontrol etmesi lazım",
// "bizim yapımıza uygun ürünler olacak, ileride otomotiv eklenince o da girilir"). Göç 0053.
// 1) Haber masasının son 30 gününden söylenti / sızıntı / çıkış duyurusu haberleri ürün ürün toplanır.
// 2) Yapay zekâ (aramasız) konu dışını eler: yalnız panelin ürün türlerinden birine giren, belirli bir donanım modeli kalır.
// 3) Seçilenler Google aramasıyla doğrulanır: aşama, tahmini çıkış ayı, tek cümle tanım. Resmî duyuru dışında en az iki ayrı site şartı.
// 4) Sonuç public.radar_adaylari'na yazılır; panel 15 dakikada bir işler (site deposu apps/cms/src/lib/radar.ts).
// Günde bir tur, turda en çok ARAMA_MAX arama (Gemini kotası). Zamanlayıcı sunucu içinden çağırır; Stüdyo'dan yönetici elle başlatabilir.
import { createClient } from "npm:@supabase/supabase-js@2";
import { anahtarHatasi, anahtarlar as geminiAnahtarlari, isaretle } from "./anahtar.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const yanit = (j: unknown, status = 200) => Response.json(j, { status, headers: CORS });
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
function jsonOku(s: string) { try { return JSON.parse(s); } catch { const m = s.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } }
type Sb = ReturnType<typeof createClient>;

const GUN = 30;            // haber masasında geriye bakılan gün
const ARAMA_MAX = 8;       // turda en çok doğrulama araması
const TEKRAR_GUN = 3;      // radardaki ürün kaç günde bir yeniden doğrulanır
const DURUMLAR = ["soylenti", "sizinti", "test", "takvim", "duyuruldu", "satista"] as const;
type Durum = typeof DURUMLAR[number];
/** Çıkış haberi sayılacak resmî haber: tanıtım, duyuru, tarih, ön sipariş */
const CIKIS = /tanıt|duyur|çıkış|piyasaya|satışa|ön sipariş|lansman|etkinli|davetiye|launch|announce|release|pre-?order/i;
const sade = (x: string) => x.toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[^a-z0-9]/g, "");
/** Ad markayla başlıyorsa marka çıkarılır: "Samsung Galaxy S27" → "Galaxy S27" */
const markasiz = (marka: string, ad: string) => { const m = marka.trim(), a = ad.trim(); return a.toLocaleLowerCase("tr-TR").startsWith(m.toLocaleLowerCase("tr-TR") + " ") ? a.slice(m.length + 1) : a; };
const anahtarYap = (marka: string, ad: string) => sade(marka) + ":" + sade(markasiz(marka, ad));

async function gemini(sistem: string, istem: string, arama: boolean): Promise<{ v: any; kaynaklar: { baslik: string; url: string }[] }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const anahtarlar = await geminiAnahtarlari();
  if (!anahtarlar.length) throw new Error("GEMINI_API_KEY yok");
  const modeller = arama ? ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"] : ["gemini-3.5-flash-lite", "gemini-3.6-flash"];
  let son = "";
  for (const a of anahtarlar) { let hepsiKota = true; for (const model of modeller) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(90_000), headers: { "Content-Type": "application/json", "x-goog-api-key": a.deger },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sistem }] }, contents: [{ role: "user", parts: [{ text: istem }] }], ...(arama ? { tools: [{ google_search: {} }] } : {}), generationConfig: { temperature: 0.1 } }),
      });
      const g = await r.text();
      if (!r.ok) {
        son = `${a.etiket} · ${model} ${r.status} ${g.slice(0, 120)}`;
        const ah = anahtarHatasi(r.status, g);
        if (ah === "gecersiz") { await isaretle(a, "gecersiz", son); hepsiKota = false; break; }
        if (ah !== "kota_dolu") hepsiKota = false;
        continue;
      }
      hepsiKota = false; await isaretle(a, "calisiyor");
      const c = JSON.parse(g)?.candidates?.[0];
      const metin = (c?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
      const v = jsonOku(metin);
      if (!v) { son = `${model} geçersiz yanıt`; continue; }
      const kaynaklar = (c?.groundingMetadata?.groundingChunks ?? []).map((x: { web?: { uri?: string; title?: string } }) => ({ baslik: x.web?.title ?? "", url: x.web?.uri ?? "" })).filter((x: { url: string }) => x.url).slice(0, 12);
      return { v, kaynaklar };
    } catch { son = `${model} yanıt vermedi`; hepsiKota = false; }
  }
  if (hepsiKota) await isaretle(a, "kota_dolu", son); }
  throw new Error("Yapay zekâ yanıt vermedi (" + son + ")");
}
const kotaDolu = (m: string) => /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(m);

const ELEME = (turler: string[]) => `Bir teknoloji ve ekipman sitesinin "çıkış radarı" editörüsün. Sana haber masasından ürün grupları geliyor: "n | marka | ürün | haber türleri | kaynak sayısı | örnek olay".
Görevin radara girebilecekleri seçmek. Radar: HENÜZ SATIŞA ÇIKMAMIŞ, belirli bir DONANIM MODELİ (adıyla anılan cihaz).
SİTENİN ÜRÜN TÜRLERİ (yalnız bunlar): ${turler.join(", ")}
KURALLAR:
- Yalnız bu türlerden birine giren ürünleri seç; türü listede yoksa (ör. otomobil, film, dizi, oyun, yazılım, uygulama, hizmet, şirket, yatırım, işlemci fiyatı) ALMA.
- Genel ifadeleri alma ("kamera", "yeni iPhone'lar", "katlanabilir telefon"); belirli model adı olmalı ("Galaxy S27 Ultra", "Sony A7 V").
- Haber ürünün satışa çıktığını, indirimini, incelemesini ya da kullanıcı sorununu anlatıyorsa ALMA.
- Aynı ürünü anlatan grupları tek üründe birleştir (n listesine hepsini yaz).
- "marka": üreticinin yaygın adı (Samsung, Apple, DJI, Sony). "ad": markasız model adı. "tur": yukarıdaki türlerden tam biri.
Yanıtı YALNIZ şu JSON olarak ver: {"urunler":[{"n":[0,3],"marka":"Samsung","ad":"Galaxy S27 Ultra","tur":"phone"}]}`;

const DOGRULA = `Bir teknoloji sitesinin "çıkış radarı" editörüsün. Verilen ürünü İNTERNETTE ARA ve bugünkü durumunu bul. Bugünün tarihi: ${new Date().toISOString().slice(0, 10)}.
AŞAMALAR (en ileri olanı seç):
- "soylenti": yalnız iddia, analist ya da tedarik zinciri söylentisi
- "sizinti": görseller, kılıf, teknik özellikler ya da kutu sızdı
- "test": sertifika ya da test kaydı görüldü (FCC, TENAA, Bluetooth SIG, Geekbench vb.)
- "takvim": üretici tanıtım etkinliğinin tarihini açıkladı ama ürün henüz tanıtılmadı
- "duyuruldu": üretici ürünü resmî olarak tanıttı, henüz satışta değil (ön sipariş dahil)
- "satista": ürün herhangi bir ülkede satışa çıktı
KURALLAR:
- Ürün gerçekten konuşulan belirli bir model değilse ya da hakkında güvenilir haber yoksa "gercek": false ver.
- "tahmini_ay": beklenen ya da açıklanan çıkış ayı "YYYY-MM"; kaynaklarda hiç ipucu yoksa null. Uydurma.
- "tarih_notu": kısa Türkçe not, en çok 40 karakter (ör. "Eylül etkinliği", "CES 2027", "Aralık başı"); yoksa "".
- "ozet": ürünü tanıtan tek Türkçe cümle, en çok 140 karakter, iddia ise "iddiaya göre" de.
- "ad": yaygın model adı (markasız). "marka": üretici.
Yanıtı YALNIZ şu JSON olarak ver: {"gercek":true,"marka":"...","ad":"...","durum":"sizinti","tahmini_ay":"2027-02","tarih_notu":"","ozet":"..."}`;

type Haber = { id: number; source_name: string; brand: string; product: string; kind: string; event: string; other_sources: { name?: string }[] | null };
type Grup = { marka: string; ad: string; turler: Set<string>; kaynaklar: Set<string>; haberler: number[]; olay: string };
type Mevcut = { id: number; ad: string; marka: string; tur: string; durum: string; radarda: boolean; radar_oto: boolean; tarih: string | null };
type Satir = { anahtar: string; marka: string; ad: string; tur: string; durum: string; tarih: string | null; tarih_notu: string; kontrol_zamani: string; haberler: number[]; islem: string };

async function isle(sb: Sb) {
  const turler = ((await sb.rpc("radar_turler")).data as string[] | null ?? []).filter((t) => t !== "other");
  if (!turler.length) throw new Error("Ürün türleri okunamadı (göç 0053)");
  const mevcut = ((await sb.rpc("radar_urunler")).data as Mevcut[] | null) ?? [];
  const urunHarita = new Map(mevcut.map((u) => [anahtarYap(u.marka, u.ad), u]));
  const { data: satirlar } = await sb.from("radar_adaylari").select("anahtar,marka,ad,tur,durum,tarih,tarih_notu,kontrol_zamani,haberler,islem");
  const kayit = new Map(((satirlar ?? []) as Satir[]).map((s) => [s.anahtar, s]));

  // 1) Haber masası: söylenti, sızıntı ve çıkışla ilgili resmî haberler, ürün ürün
  const { data: haberler } = await sb.from("tr_items").select("id,source_name,brand,product,kind,event,other_sources")
    .gte("created_at", new Date(Date.now() - GUN * 864e5).toISOString()).neq("product", "").in("kind", ["Söylenti", "Sızıntı", "Resmi"]).limit(5000);
  const gruplar = new Map<string, Grup>();
  for (const h of (haberler ?? []) as Haber[]) {
    if (h.kind === "Resmi" && !CIKIS.test(h.event)) continue;
    if (!h.brand || !h.product) continue;
    const k = anahtarYap(h.brand, h.product);
    const g = gruplar.get(k) ?? { marka: h.brand, ad: markasiz(h.brand, h.product), turler: new Set(), kaynaklar: new Set(), haberler: [], olay: h.event };
    g.turler.add(h.kind); g.kaynaklar.add(h.source_name); (h.other_sources ?? []).forEach((o) => o?.name && g.kaynaklar.add(o.name)); g.haberler.push(h.id);
    if (h.kind !== "Resmi") g.olay = h.event;
    gruplar.set(k, g);
  }
  // Zaten satışta olan ve yakın zamanda doğrulanmış ürünler elemeye hiç girmez
  const yakin = (k: string) => { const s = kayit.get(k); return !!s && Date.now() - Date.parse(s.kontrol_zamani) < TEKRAR_GUN * 864e5; };
  const liste = [...gruplar.entries()].filter(([k]) => { const u = urunHarita.get(k); return !yakin(k) && !(u && (u.durum === "satista" || u.durum === "eol")); })
    .sort((a, b) => b[1].kaynaklar.size - a[1].kaynaklar.size || b[1].haberler.length - a[1].haberler.length).slice(0, 150);

  // 2) Eleme (aramasız, ucuz model)
  type Secilen = { marka: string; ad: string; tur: string; haberler: number[]; kaynak: number };
  const secilen: Secilen[] = [];
  if (liste.length) {
    const istem = liste.map(([, g], n) => `${n} | ${g.marka} | ${g.ad} | ${[...g.turler].join("/")} | ${g.kaynaklar.size} | ${g.olay.slice(0, 140)}`).join("\n");
    const { v } = await gemini(ELEME(turler), istem, false);
    for (const u of Array.isArray(v?.urunler) ? v.urunler : []) {
      const nler = (Array.isArray(u?.n) ? u.n : []).filter((n: unknown) => Number.isInteger(n) && liste[n as number]) as number[];
      if (!nler.length || !u.marka || !u.ad || !turler.includes(u.tur)) continue;
      const gs = nler.map((n) => liste[n][1]);
      secilen.push({ marka: String(u.marka).slice(0, 60), ad: markasiz(String(u.marka), String(u.ad)).slice(0, 80), tur: u.tur, haberler: [...new Set(gs.flatMap((g) => g.haberler))].slice(0, 30), kaynak: new Set(gs.flatMap((g) => [...g.kaynaklar])).size });
    }
  }

  // 3) Doğrulanacaklar: yeni adaylar (çok kaynaklı önce), sonra radardaki ürünlerin yeniden kontrolü (en eski kontrol önce)
  type Is = { marka: string; ad: string; tur: string; haberler: number[] };
  const isler: Is[] = [], alinan = new Set<string>();
  const ekle = (x: Is) => { const k = anahtarYap(x.marka, x.ad); if (alinan.has(k) || yakin(k)) return; const u = urunHarita.get(k);
    if (u && u.radar_oto && !u.radarda && u.durum !== "satista") return; // editör radardan çıkarmış: dokunma
    alinan.add(k); isler.push(x); };
  secilen.sort((a, b) => b.kaynak - a.kaynak).forEach((s) => ekle(s));
  const yeniSinir = Math.max(ARAMA_MAX - 3, 1); // her turda en az 3 yer yeniden kontrole kalır
  const yeniler = isler.splice(0, yeniSinir); isler.length = 0; yeniler.forEach((x) => isler.push(x));
  const radardakiler = mevcut.filter((u) => u.radarda && u.durum !== "satista").map((u) => ({ u, s: kayit.get(anahtarYap(u.marka, u.ad)) }))
    .sort((a, b) => Date.parse(a.s?.kontrol_zamani ?? "1970") - Date.parse(b.s?.kontrol_zamani ?? "1970"));
  for (const { u } of radardakiler) if (isler.length < ARAMA_MAX) ekle({ marka: u.marka, ad: u.ad, tur: u.tur, haberler: kayit.get(anahtarYap(u.marka, u.ad))?.haberler ?? [] });
  for (const s of secilen) if (isler.length < ARAMA_MAX) ekle(s);

  // 4) İnternetten doğrulama ve yazma
  const sonuc: { urun: string; sonuc: string }[] = [];
  for (const x of isler) {
    const ad = `${x.marka} ${x.ad}`;
    try {
      const { v, kaynaklar } = await gemini(DOGRULA, `ÜRÜN: ${ad}\nTÜR: ${x.tur}`, true);
      const durum = DURUMLAR.includes(v?.durum) ? v.durum as Durum : null;
      const siteler = new Set(kaynaklar.map((k) => sade(k.baslik)).filter(Boolean));
      const k = anahtarYap(x.marka, x.ad), eski = kayit.get(k), u = urunHarita.get(k);
      const simdi = new Date().toISOString();
      if (!v?.gercek || !durum) { if (eski) await sb.from("radar_adaylari").update({ kontrol_zamani: simdi }).eq("anahtar", k); sonuc.push({ urun: ad, sonuc: "doğrulanamadı" }); continue; }
      // Tek bir sitenin iddiasıyla radara girilmez; resmî duyuru ya da satış bilgisi tek kaynakla da yeter
      if (siteler.size < 2 && !["duyuruldu", "satista"].includes(durum) && !u) { sonuc.push({ urun: ad, sonuc: "tek kaynak" }); continue; }
      if (durum === "satista" && !u) { sonuc.push({ urun: ad, sonuc: "zaten satışta, künyesi yok" }); continue; }
      const ay = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v.tahmini_ay ?? "")) ? `${v.tahmini_ay}-01` : null;
      const tarihNotu = String(v.tarih_notu ?? "").slice(0, 40);
      const degisti = !eski || eski.durum !== durum || (eski.tarih ?? null) !== ay || eski.tarih_notu !== tarihNotu;
      const satir = {
        anahtar: k, marka: x.marka, ad: x.ad, tur: x.tur, durum, tarih: ay, tarih_notu: tarihNotu, ozet: String(v.ozet ?? "").slice(0, 160),
        kaynaklar, haberler: [...new Set([...(eski?.haberler ?? []), ...x.haberler])].slice(-40), kontrol_zamani: simdi, updated_at: simdi,
        ...(degisti || eski?.islem === "hata" ? { islem: "bekliyor", islem_notu: "" } : {}),
      };
      const { error } = await sb.from("radar_adaylari").upsert(satir, { onConflict: "anahtar" });
      if (error) throw new Error(error.message);
      sonuc.push({ urun: ad, sonuc: degisti ? `${durum}${ay ? " · " + ay.slice(0, 7) : ""}` : "değişiklik yok" });
    } catch (e) {
      if (kotaDolu(String((e as Error).message))) { sonuc.push({ urun: ad, sonuc: "kota dolu" }); break; }
      sonuc.push({ urun: ad, sonuc: "hata: " + String((e as Error).message).slice(0, 120) });
    }
  }
  const ozet = { zaman: new Date().toISOString(), haber_grubu: gruplar.size, elemeye_giren: liste.length, secilen: secilen.length, dogrulanan: sonuc };
  await sb.from("tr_settings").upsert({ key: "son_radar", value: ozet });
  return ozet;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return yanit({ error: "POST gerekli" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: k } = jwt ? await sb.auth.getUser(jwt) : { data: null };
  const zamanlayici = !k?.user && !req.headers.get("x-forwarded-for");
  if (!zamanlayici) {
    if (!k?.user) return yanit({ error: "Stüdyo girişi gerekli" }, 401);
    const { data: p } = await sb.from("profiles").select("is_admin").eq("id", k.user.id).maybeSingle();
    if (!p?.is_admin) return yanit({ error: "Yalnız yöneticiler" }, 403);
  }
  const is = isle(sb).catch(async (e) => { const v = { zaman: new Date().toISOString(), hata: String((e as Error).message).slice(0, 300) }; await sb.from("tr_settings").upsert({ key: "son_radar", value: v }); return v; });
  if (zamanlayici) { EdgeRuntime.waitUntil(is); return yanit({ basladi: true }); }
  return yanit(await is);
});
