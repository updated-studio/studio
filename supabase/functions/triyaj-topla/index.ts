// Haber Masası: RSS kaynaklarını okur, gürültüyü kuralla, gerisini Gemini ile eler/sınıflandırır, tr_items'a yazar.
// Tetikleyici: pg_cron 15 dakikada bir (0006, tr_kick) ve Stüdyo'daki "Şimdi topla" düğmesi.
// Gizli bilgi: GEMINI_API_KEY (Supabase > Edge Functions > Secrets). Koda yazılmaz.
// Not: "Verify JWT" kapalı; girdi almaz. Kötüye kullanımı önlemek için 5 dakikada bir defadan sık çalışmaz.
import { createClient } from "npm:@supabase/supabase-js@2";

const UA = "UpdatedHaberMasasi/1.0 (+https://www.updated.com.tr)";
const ESKI_SAAT = 48;          // bundan eski haberler alınmaz
const AI_SINIR = 80;           // bir çalıştırmada yapay zekâya gidecek en fazla haber
const PARCA = 20;              // tek istekte kaç haber

type Kaynak = { id: number; name: string; url: string; category: string };
type Ham = { source: Kaynak; title: string; link: string; date: Date | null; desc: string };

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—" };
function temiz(s: string): string {
  const ent = (x: string) => x.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
  // Önce CDATA ve kodlanmış etiketler çözülür, sonra etiketler silinir.
  return ent(ent(String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}
function etiket(blok: string, ad: string): string {
  const m = blok.match(new RegExp(`<${ad}(?:\\s[^>]*)?>([\\s\\S]*?)</${ad}>`, "i"));
  return m ? m[1] : "";
}
function rssCoz(xml: string, k: Kaynak): Ham[] {
  const out: Ham[] = [];
  const bloklar = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of bloklar) {
    const title = temiz(etiket(b, "title"));
    let link = temiz(etiket(b, "link"));
    if (!link) link = (b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i) ?? b.match(/<link[^>]*href=["']([^"']+)/i) ?? [])[1] ?? "";
    if (!link) link = temiz(etiket(b, "guid"));
    const ds = temiz(etiket(b, "pubDate") || etiket(b, "published") || etiket(b, "updated") || etiket(b, "dc:date"));
    const d = ds ? new Date(ds) : null;
    const desc = temiz(etiket(b, "description") || etiket(b, "summary") || etiket(b, "content")).slice(0, 400);
    if (title && /^https?:\/\//.test(link)) out.push({ source: k, title, link: link.trim(), date: d && !isNaN(+d) ? d : null, desc });
  }
  return out;
}

async function getir(url: string, ms = 12000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" }, signal: c.signal }); }
  finally { clearTimeout(t); }
}

async function gemini(model: string, istem: string): Promise<unknown> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY yok");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: istem }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const metin = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  // Modelin metin içine koyduğu kontrol karakterleri JSON'u bozar; boşluğa çevir.
  try { return JSON.parse(metin); } catch { return JSON.parse(metin.replace(/[\u0000-\u001F]+/g, " ")); }
}

function istemYaz(haberler: Ham[], baglam: { markalar: string; editorler: string; geriBildirim: string; adaylar: string }): string {
  return `Sen Updated (updated.com.tr) adlı Türkçe teknoloji yayınının haber masası editörüsün. Aşağıdaki yeni haberleri tek tek değerlendir.

YAYIN: Türkiye'deki teknoloji meraklıları için telefon, bilgisayar, kamera, video ekipmanı, drone, ses, giyilebilir, akıllı ev, oyun donanımı, yapay zekâ, yazılım/işletim sistemi ve büyük teknoloji şirketleri haberleri. Türkiye'de satılan markalar daha önemlidir.

KARAR:
- "aday": Updated'ın yazabileceği gerçek bir haber.
- "belirsiz": Emin değilsen.
- "elendi": İndirim/kampanya, sponsorlu, podcast, günlük özet, dizi-film-eğlence, siyaset (teknoloji politikası hariç), çok küçük uygulama güncellemesi, tekrar eden rehber, Türkiye'de ilgisi olmayan yerel haber.

ÖNCELİK (1-5): 5 = büyük ürün duyurusu/lansman tarihi/Türkiye fiyatı gibi hemen yazılması gereken; 4 = güçlü sızıntı veya önemli güncelleme; 3 = yazılabilir; 2 = zayıf; 1 = neredeyse ilgisiz.
TÜR: Resmi, Söylenti, Sızıntı, İnceleme, Analiz, Fırsat, Etkinlik.
OLAY: Haberi Türkçe tek cümleyle, kaynağa sadık anlat (uydurma yok, abartı yok).
EDİTÖR: Aşağıdaki editörlerden ilgi alanı en uygun olanın adı; uygun yoksa boş.
AYNI: Haber aşağıdaki "son adaylar" listesindekiyle aynı olaysa o satırın numarası, değilse null.

TÜRKİYE PAZARI MARKALARI (Öncelikli: önceliği 1 artır; Normal: olağan; Hariç: Türkiye'de satılmıyor, önceliği düşür): ${baglam.markalar || "-"}
EDİTÖRLER (ad: ilgi alanları): ${baglam.editorler || "-"}
EKİBİN SON GERİ BİLDİRİMLERİ (+1 iyi seçim, -1 kötü seçim):
${baglam.geriBildirim || "-"}
SON ADAYLAR (no | olay):
${baglam.adaylar || "-"}

YENİ HABERLER:
${haberler.map((h, i) => `${i}. [${h.source.name}] ${h.title}${h.desc ? " — " + h.desc.slice(0, 220) : ""}`).join("\n")}

Yalnızca şu biçimde JSON dizi döndür, her haber için bir öğe:
[{"i":0,"karar":"aday","neden":"","olay":"","marka":"","urun":"","tur":"Resmi","konu":"telefon","oncelik":3,"editor":"","ayni":null}]`;
}

async function topla(sb: ReturnType<typeof createClient>) {
  const bas = Date.now();
  const ayarlar = Object.fromEntries(((await sb.from("tr_settings").select("key,value")).data ?? []).map((r) => [r.key, r.value]));
  const gurultu: string[] = (ayarlar.gurultu_kelimeleri ?? []).map((s: string) => s.toLowerCase());
  const model = String(ayarlar.model_eleme ?? "gemini-3.5-flash-lite");

  const { data: kaynaklar } = await sb.from("tr_sources").select("id,name,url,category").eq("active", true);
  const sinir = Date.now() - ESKI_SAAT * 3600_000;
  const ham: Ham[] = [];

  await Promise.all((kaynaklar ?? []).map(async (k: Kaynak) => {
    try {
      const r = await getir(k.url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const liste = rssCoz(await r.text(), k);
      const son = liste.reduce((m, h) => (h.date && +h.date > m ? +h.date : m), 0);
      const gun = son ? Math.floor((Date.now() - son) / 86_400_000) : null;
      await sb.from("tr_sources").update({
        last_check: new Date().toISOString(), item_count: liste.length,
        last_item_at: son ? new Date(son).toISOString() : null, error: "",
        status: gun === null ? "Tarihsiz" : gun <= 2 ? "Çalışıyor" : gun <= 7 ? "Yavaş" : "Ölü",
      }).eq("id", k.id);
      for (const h of liste) if (!h.date || +h.date >= sinir) ham.push(h);
    } catch (e) {
      await sb.from("tr_sources").update({ last_check: new Date().toISOString(), status: "Hata", error: String(e).slice(0, 200) }).eq("id", k.id);
    }
  }));

  // Daha önce görülen bağlantıları ayıkla
  const tekil = [...new Map(ham.map((h) => [h.link, h])).values()];
  const gorulen = new Set<string>();
  for (let i = 0; i < tekil.length; i += 200) {
    const { data } = await sb.from("tr_items").select("link").in("link", tekil.slice(i, i + 200).map((h) => h.link));
    (data ?? []).forEach((r: { link: string }) => gorulen.add(r.link));
  }
  const yeni = tekil.filter((h) => !gorulen.has(h.link)).sort((a, b) => (+(b.date ?? 0)) - (+(a.date ?? 0)));

  // Toplu yazmada her satır aynı sütunları taşımalı; eksik sütun NULL gider ve tüm parti reddedilir.
  const satir = (h: Ham, ek: Record<string, unknown>) => ({
    link: h.link, title: h.title.slice(0, 500), source_id: h.source.id, source_name: h.source.name,
    published_at: h.date?.toISOString() ?? null,
    status: "belirsiz", reason: "", model: "", event: "", brand: "", product: "", kind: "", topic: "", priority: 0, suggested_editor: null,
    ...ek,
  });

  // 1) Kural: gürültü kelimeleri
  const kural: Record<string, unknown>[] = [];
  const aiye: Ham[] = [];
  for (const h of yeni) {
    const t = (h.title + " ").toLowerCase();
    const k = gurultu.find((g) => g && t.includes(g));
    if (k) kural.push(satir(h, { status: "elendi", reason: "Gürültü kelimesi: " + k, model: "kural" }));
    else aiye.push(h);
  }
  if (kural.length) {
    const { error } = await sb.from("tr_items").upsert(kural, { onConflict: "link", ignoreDuplicates: true });
    if (error) console.error("kural yazma hatası", error.message);
  }

  // 2) Yapay zekâ
  // Anahtar yoksa ya da yapay zekâ yanıt vermezse haberler yazılmaz; bir sonraki çalıştırmada yeniden denenir.
  const anahtarVar = !!Deno.env.get("GEMINI_API_KEY");
  const islenecek = anahtarVar ? aiye.slice(0, AI_SINIR) : [];
  let aiSayi = 0, hata = anahtarVar ? "" : "GEMINI_API_KEY tanımlı değil; haberler yapay zekâ olmadan havuza alınmıyor.";
  if (islenecek.length) {
    const [markalar, editorler, geri, adaylar] = await Promise.all([
      sb.from("tr_brands").select("name,grp"),
      sb.from("profiles").select("id,name,interests"),
      sb.from("tr_votes").select("value,note,tr_items(event,title)").order("created_at", { ascending: false }).limit(30),
      sb.from("tr_items").select("id,event,brand").in("status", ["aday", "alindi", "belirsiz", "yayinda"])
        .gte("created_at", new Date(sinir).toISOString()).order("created_at", { ascending: false }).limit(150),
    ]);
    const edAd = new Map((editorler.data ?? []).map((p: { id: string; name: string }) => [p.name.toLocaleLowerCase("tr"), p.id]));
    const adayListe = (adaylar.data ?? []) as { id: number; event: string; brand: string }[];
    const baglam = {
      markalar: (markalar.data ?? []).map((m: { name: string; grp: string }) => `${m.name} (${m.grp})`).join(", "),
      editorler: (editorler.data ?? []).filter((p: { interests: string }) => p.interests).map((p: { name: string; interests: string }) => `${p.name}: ${p.interests}`).join("; "),
      geriBildirim: (geri.data ?? []).map((v: { value: number; note: string; tr_items: { event: string; title: string } | null }) =>
        `${v.value > 0 ? "+1" : "-1"} ${v.tr_items?.event || v.tr_items?.title || ""}${v.note ? " — not: " + v.note : ""}`).join("\n"),
      adaylar: adayListe.map((a) => `${a.id} | ${a.brand ? a.brand + ": " : ""}${a.event}`).join("\n"),
    };

    const parcalar: Ham[][] = [];
    for (let i = 0; i < islenecek.length; i += PARCA) parcalar.push(islenecek.slice(i, i + PARCA));
    await Promise.all(parcalar.map(async (p) => {
      let sonuc: Record<string, unknown>[] = [];
      try {
        const j = await gemini(model, istemYaz(p, baglam));
        // Model bazen diziyi bir nesnenin içine sarar ({"haberler":[...]}); ikisini de kabul et.
        const dizi = Array.isArray(j) ? j : Object.values((j ?? {}) as Record<string, unknown>).find(Array.isArray) ?? [];
        sonuc = (dizi as Record<string, unknown>[]).map((x, k) => ({ ...x, i: x.i ?? k }));
        if (!sonuc.length) hata = "Yapay zekâ boş yanıt verdi";
      } catch (e) {
        hata = String(e).slice(0, 300);
      }
      const satirlar: Record<string, unknown>[] = [];
      const ekKaynak: { id: number; name: string; link: string }[] = [];
      p.forEach((h, i) => {
        const s = sonuc.find((x) => Number(x.i) === i);
        if (!s) return; // yanıt yoksa bu haber sonraki çalıştırmada yeniden denenir
        const ayni = s.ayni === null || s.ayni === undefined || s.ayni === "" ? null : Number(s.ayni);
        if (ayni && adayListe.some((a) => a.id === ayni)) {
          ekKaynak.push({ id: ayni, name: h.source.name, link: h.link });
          satirlar.push(satir(h, { status: "elendi", reason: `Aynı haber (#${ayni})`, model, event: String(s.olay ?? "").slice(0, 400) }));
          return;
        }
        const karar = ["aday", "belirsiz", "elendi"].includes(String(s.karar)) ? String(s.karar) : "belirsiz";
        satirlar.push(satir(h, {
          status: karar, reason: String(s.neden ?? "").slice(0, 300), model,
          event: String(s.olay ?? "").slice(0, 400), brand: String(s.marka ?? "").slice(0, 60), product: String(s.urun ?? "").slice(0, 80),
          kind: String(s.tur ?? "").slice(0, 30), topic: String(s.konu ?? "").slice(0, 40),
          priority: Math.max(0, Math.min(5, Number(s.oncelik) || 0)),
          suggested_editor: edAd.get(String(s.editor ?? "").toLocaleLowerCase("tr")) ?? null,
        }));
      });
      if (satirlar.length) {
        const { error } = await sb.from("tr_items").upsert(satirlar, { onConflict: "link", ignoreDuplicates: true });
        if (error) hata = "Yazma hatası: " + error.message; else aiSayi += satirlar.length;
      }
      for (const e of ekKaynak) {
        const { data } = await sb.from("tr_items").select("other_sources").eq("id", e.id).single();
        const liste = (data?.other_sources ?? []) as { name: string; link: string }[];
        if (!liste.some((x) => x.link === e.link)) await sb.from("tr_items").update({ other_sources: [...liste, { name: e.name, link: e.link }] }).eq("id", e.id);
      }
    }));
  }

  const ozet = { kaynak: kaynaklar?.length ?? 0, okunan: tekil.length, yeni: yeni.length, kural: kural.length, yapayZeka: aiSayi, bekleyen: Math.max(0, aiye.length - AI_SINIR), hata, sure: Date.now() - bas };
  await sb.from("tr_settings").upsert({ key: "son_toplama", value: { ...ozet, durum: "bitti", zaman: new Date().toISOString() } });
  console.log(JSON.stringify(ozet));
  return ozet;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const govde = await req.json().catch(() => ({}));
  const { data } = await sb.from("tr_settings").select("value").eq("key", "son_toplama").maybeSingle();
  const son = data?.value?.zaman ? Date.parse(data.value.zaman) : 0;
  if (Date.now() - son < 5 * 60_000 && !govde?.zorla) return Response.json({ atlandi: "Son 5 dakikada çalıştı" }, { headers: CORS });
  if (govde?.zorla && Date.now() - son < 60_000) return Response.json({ atlandi: "Az önce çalıştı, 1 dakika bekle" }, { headers: CORS });
  // Aynı anda iki çalıştırmayı önlemek için başlangıç zamanını hemen yaz.
  await sb.from("tr_settings").upsert({ key: "son_toplama", value: { ...(data?.value ?? {}), zaman: new Date().toISOString(), durum: "çalışıyor" } });
  // Hemen yanıt ver, işi arka planda bitir (cron isteği beklemez).
  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  EdgeRuntime.waitUntil(topla(sb).catch((e) => console.error("toplama hatası", e)));
  return Response.json({ basladi: true }, { status: 202, headers: CORS });
});
