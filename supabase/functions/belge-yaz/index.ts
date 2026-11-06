// Belgeden yaz (6 Kasım 2026, kullanıcı: "belgemiz var, yeni yazı olarak girilsin; editörlere böyle veriden otomatik bizim kurallarımızda
// bizim tarzımızda bir haber hazırlasın"). Stüdyo Word belgesini tarayıcıda açar (src/modules/editor/belge/docx.ts) ve buraya paragrafları
// sırasıyla, fotoğrafları küçük kopyalarıyla gönderir; PDF'te belge olduğu gibi gelir. Taslağı panelde Stüdyo editörün kendi yetkisiyle açar.
//
// İki yol (kullanıcı: "metin korunacak, önerin doğru"):
// - İmzalı metin (yazarın kendi yazısı, inceleme ya da deneyim): metin YENİDEN YAZILMAZ. Yapay zekâ yalnız yazım hatası, sayı yazımı ve kalın
//   rakam gibi kural düzeltmelerini paragraf numarasıyla döner, bilgi taşımayan ara başlığı değiştirir, künye tablosu gibi tekrarları çıkarır.
//   Metnin kendisi Stüdyo'da belgeden birleştirilir; böylece düzeltilmeyen paragraf harfi harfine aynı kalır.
// - Ham malzeme (basın bülteni, not, çeviri): sitenin üslubuyla (Ayarlar → Yazım üslubu) baştan yazılır.
// İkisinde de başlık, spot, kısa cevap, SEO, fotoğraf altları ve alt metinleri, incelemede puan kutusu (puan uydurulmaz) hazırlanır.
// Giriş: Stüdyo oturumu. Model: Claude (Bağlantı anahtarları "claude"); denetim modeliyle aynı (CLAUDE_MODEL.kontrol), düşünme orta.
// Sonuç kaybolmasın: zaman aşımında Stüdyo 6 dakika sorar; bırakılan iş dosyası depoda kalır (küçük JSON).
import { createClient } from "npm:@supabase/supabase-js@2";
import { claudeJson, CLAUDE_MODEL } from "../triyaj-taslak/claude.ts";
import { IZ_LISTESI, USLUP_VARSAYILAN } from "../triyaj-taslak/uslup.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const yanit = (j: unknown, status = 200) => Response.json(j, { status, headers: CORS });
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}

// Uzun belgede Claude 2-4 dakika yazar; istek süresi (150 sn) yetmez. İş arka planda (EdgeRuntime.waitUntil, işçi süresi 400 sn) yürür,
// sonuç depoda icerik/belge-yaz/<iş>.json olarak bekler; Stüdyo { durum: iş } ile sorar, sonucu alınca dosya silinir.
const SURE_MS = 330_000;
const YER = (is: string) => `belge-yaz/${is}.json`;

type Blok = { i: number; t: "p" | "img" | "tablo"; s?: string; kalin?: boolean; boy?: number; n?: number };

const SISTEM = (uslup: string) => `Sen Updated (updated.com.tr) adlı Türkçe teknoloji ve kamera sitesinin kıdemli editörüsün. Sana bir belge verilecek
(Word belgesinin paragrafları sırasıyla ya da PDF). Belgeden sitede yayınlanacak bir taslak hazırlayacaksın. Önce belgenin ne olduğuna karar ver.

1) TÜR
- "inceleme": bir ürünü yazarın kendisinin kullanıp değerlendirdiği yazı (deneyim, saha testi, artılar/eksiler).
- "rehber": nasıl yapılır, seçim rehberi, karşılaştırmalı öneri listesi.
- "haber": duyuru, basın bülteni, etkinlik, şirket haberi.

2) MOD
- "koru": belge bir yazarın imzalı kendi metni (adı geçiyor, birinci tekil kişiyle deneyim anlatıyor ya da üslubu kişisel). Yazarın metnini
  YENİDEN YAZMA. Cümle yapısına, kelime seçimine, birinci tekil anlatıma, uzunluğa dokunma. Yalnız şunları düzelt:
  * yazım ve noktalama hatası (çift nokta, bitişik yazılmış kelime, yanlış "de/da", büyük-küçük harf),
  * sayı yazımı: "%15" yerine "yüzde 15", binlik ayırıcı nokta ("3.990"), ondalık virgül,
  * uzun tire (—) varsa virgül ya da nokta ile değiştir,
  * en kritik rakamları ve ürün adlarını **kalın** yap (paragraf başına en fazla iki, bütün metinde abartma),
  * bilgi taşımayan ara başlıkları ("Sonuç", "Giriş", "Özet", "Genel Bakış") yazının içeriğinden çıkan somut bir başlıkla değiştir.
  Düzeltmediğin paragrafı listeye koyma. Bir paragrafı düzeltirsen metnin tamamını, yalnız o düzeltmelerle aynen yaz.
- "yaz": belge ham malzeme (basın bülteni, notlar, yabancı dilde metin, madde listesi). Sitenin üslubuyla baştan yaz (aşağıda ÜSLUP).

3) YAPIDAN ÇIKANLAR (iki modda da)
- Belgenin üstündeki tür etiketi ("ÜRÜN İNCELEME" gibi), ürün adı satırı, yazının kendi başlığı ve spotu, imza satırı ("Yazı ve fotoğraflar: ...")
  metinden çıkar: bunlar sitede ayrı alanlar. Fotoğraf altı satırları (fotoğrafın hemen altındaki model adı, kamera, lens, pozlama satırı ya da kısa
  açıklama) metinden çıkar, o fotoğrafın altyazısı olur.
- Belgenin sonundaki teknik özellik/künye tablosu metinden çıkar (sitede ürün künyesi ayrı gösterilir). İncelemede "Beğendiklerim / Artılar" ve
  "Eksiler / Dikkat edilmesi gerekenler" listeleri metinden çıkar, puan kutusuna girer.
- "cikar" listesine metinden çıkan bütün blok numaralarını yaz (fotoğraf altı satırları dahil).

4) ALANLAR (sitenin kuralları)
- baslik: en fazla 70 karakter, iki parçalı ("Ne: en dikkat çeken somut detay"), kelimelerin baş harfi büyük (Title Case; "ve", "ile", "mı" küçük).
  İncelemede "<Ürün> İncelemesi: <yazıdan çıkan sonuç>". Abartı, "şok", "flaş", "inanılmaz" yok.
- spot: en fazla 160 karakter, 1-2 cümle, başlığı tekrar etmez; yazının özünü ve neden önemli olduğunu söyler. Koru modunda bile spot senin
  yazdığın kısa giriştir, ama yazarın belgedeki spotu varsa ondan yola çık ve bilgilerini koru.
- kisa: "Kısa cevap" kutusu; okurun aklındaki asıl soruya (incelemede "almaya değer mi, kimler için?") 2-3 cümlelik net cevap. Belgede olmayan
  bilgi yok.
- seoBaslik en fazla 60 karakter; seoAciklama en fazla 155 karakter.
- urun: yazının konusu olan ürünün markası ve modeli, belgede yazdığı gibi (marka ayrı). Ürün yoksa boş.
- yazar: imza satırındaki yazar adı (yoksa boş). katkı: imzadaki diğer kişiler ("Modeller: Mattaya ve Taylor" gibi), yoksa boş.
- gorseller: belgedeki her fotoğraf için (n numarası belgedeki "FOTOĞRAF n"): alt (görme engelli okur için, en fazla 125 karakter, fotoğrafta
  gerçekten görüneni anlat; sana fotoğrafların küçük kopyaları verildiyse onlara bak) ve altyazi (fotoğraf altı satırındaki bilgi, sitenin
  biçiminde " · " ile ayrılmış: "Mattaya · Sony a7R6 + Sigma 85mm F1.2 DG Art · F1.2, 1/1000 sn, ISO 100"; altında satır yoksa boş).
- kapak: kapak olacak fotoğrafın n numarası (genelde ilk ve en güçlü kare; yatay olan tercih edilir).
- İncelemede puanKutusu: arti ve eksi en fazla 3'er madde, her madde EN FAZLA 6 KELİME, belgedeki listelerden en önemlileri; uygun ve degil
  (kimler için / kimler için değil) 2-3'er kısa madde, yazıdan çıkar. Puanı UYDURMA: belgede /20 puan yazıyorsa onu yaz, yoksa null.
  kullanimGun: belgede kaç gün kullanıldığı açıkça yazıyorsa sayı, yoksa null. cihazKaynagi: belgede cihazın nereden geldiği yazıyorsa kısa
  cümle, yoksa boş.
- degisiklikler: editöre yaptığın değişikliklerin kısa listesi (sade Türkçe, en fazla 8 madde).
- eksikler: editörün tamamlaması gerekenler (puan, kullanım süresi, cihazın kaynağı, doğrulanması gereken bilgi), en fazla 6 madde.

5) MOD "koru" İÇİN ÇIKTI
- duzeltmeler: [{i, metin}] yalnız değişen metin blokları; metin markdown (kalın için **...**). Ara başlık olacak bloklar için de buraya yaz.
- basliklar: ara başlık (H2) olan blok numaraları. Belgede ara başlık olarak yazılmış kısa satırlar (genelde kalın ya da büyük) buraya.
- govde boş string.

6) MOD "yaz" İÇİN ÇIKTI
- govde: markdown metin; ara başlıklar "## ", fotoğrafların yeri tek başına bir satırda [[foto-n]]. duzeltmeler ve basliklar boş liste.

7) BİRİNCİ TEKİL KİŞİ: koru modunda yazarın "denedim", "çektim" anlatımı korunur. Yaz modunda haber dili; "test ettik" deme.

ÜSLUP (yaz modunda tamamen; koru modunda yalnız başlık, spot, kısa cevap ve SEO için):
${uslup}

Şu ifadeleri hiçbir alanda kullanma: ${IZ_LISTESI}.

Yalnız şu JSON'u döndür, başka metin yok.`;

const SEMA = {
  type: "object",
  properties: {
    tur: { type: "string", enum: ["inceleme", "rehber", "haber"] },
    mod: { type: "string", enum: ["koru", "yaz"] },
    baslik: { type: "string" }, spot: { type: "string" }, kisa: { type: "string" },
    seoBaslik: { type: "string" }, seoAciklama: { type: "string" },
    urun: { type: "object", properties: { marka: { type: "string" }, model: { type: "string" } }, required: ["marka", "model"], additionalProperties: false },
    yazar: { type: "string" }, katki: { type: "string" },
    cikar: { type: "array", items: { type: "integer" } },
    basliklar: { type: "array", items: { type: "integer" } },
    duzeltmeler: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, metin: { type: "string" } }, required: ["i", "metin"], additionalProperties: false } },
    govde: { type: "string" },
    gorseller: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, alt: { type: "string" }, altyazi: { type: "string" } }, required: ["n", "alt", "altyazi"], additionalProperties: false } },
    kapak: { type: "integer" },
    puanKutusu: {
      type: "object",
      properties: {
        puan: { anyOf: [{ type: "integer" }, { type: "null" }] },
        arti: { type: "array", items: { type: "string" } }, eksi: { type: "array", items: { type: "string" } },
        uygun: { type: "array", items: { type: "string" } }, degil: { type: "array", items: { type: "string" } },
        kullanimGun: { anyOf: [{ type: "integer" }, { type: "null" }] }, cihazKaynagi: { type: "string" },
      },
      required: ["puan", "arti", "eksi", "uygun", "degil", "kullanimGun", "cihazKaynagi"], additionalProperties: false,
    },
    degisiklikler: { type: "array", items: { type: "string" } },
    eksikler: { type: "array", items: { type: "string" } },
  },
  required: ["tur", "mod", "baslik", "spot", "kisa", "seoBaslik", "seoAciklama", "urun", "yazar", "katki", "cikar", "basliklar", "duzeltmeler", "govde", "gorseller", "kapak", "puanKutusu", "degisiklikler", "eksikler"],
  additionalProperties: false,
};

/** Belgenin paragrafları modele numaralı satırlar olarak gider: "[12] (kalın, 14 pt) metin", fotoğraf "[13] FOTOĞRAF 4" */
function satirlar(bloklar: Blok[]) {
  return bloklar.map((b) => b.t === "img" ? `[${b.i}] FOTOĞRAF ${b.n}`
    : `[${b.i}]${b.t === "tablo" ? " (tablo satırı)" : ""}${b.kalin ? " (kalın)" : ""}${b.boy ? ` (${b.boy} pt)` : ""} ${b.s ?? ""}`).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return yanit({ hata: "POST gerekli" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const { data: k } = await sb.auth.getUser((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!k?.user) return yanit({ hata: "Stüdyo girişi gerekli" }, 401);
  const { data: p } = await sb.from("profiles").select("id").eq("id", k.user.id).maybeSingle();
  if (!p) return yanit({ hata: "Ekip üyesi değil" }, 403);

  const b = await req.json().catch(() => ({}));
  if (typeof b.durum === "string") {
    if (!/^[0-9a-f-]{36}$/.test(b.durum)) return yanit({ hata: "Geçersiz iş" }, 400);
    const { data: f } = await sb.storage.from("icerik").download(YER(b.durum));
    if (!f) return yanit({ durum: "suruyor" });
    const j = JSON.parse(await f.text());
    if (j.kim !== k.user.id) return yanit({ hata: "Bu iş başkasının" }, 403);
    await sb.storage.from("icerik").remove([YER(b.durum)]);
    delete j.kim;
    return yanit({ durum: "bitti", ...j });
  }
  const bloklar: Blok[] = (Array.isArray(b.bloklar) ? b.bloklar : []).slice(0, 1500);
  const pdf = typeof b.pdf === "string" && b.pdf.length < 14_000_000 ? b.pdf : "";
  const kucukler = (Array.isArray(b.kucukler) ? b.kucukler : []).slice(0, 40)
    .filter((x: { n?: number; b64?: string }) => Number.isInteger(x?.n) && typeof x?.b64 === "string" && x.b64.length < 400_000);
  if (!bloklar.length && !pdf) return yanit({ hata: "Belgede metin bulunamadı" }, 400);
  if (satirlar(bloklar).length > 120_000) return yanit({ hata: "Belge çok uzun (en fazla yaklaşık 120 bin karakter)" }, 413);

  const { data: us } = await sb.from("tr_settings").select("value").eq("key", "yazim_uslubu").maybeSingle();
  const uslup = typeof us?.value === "string" && us.value.trim().length > 50 ? us.value : USLUP_VARSAYILAN;
  const kullanici = pdf
    ? `Belge PDF olarak ekte (dosya: ${String(b.dosyaAdi ?? "").slice(0, 120)}). PDF'te blok numarası yok: "koru" modunu seçsen bile metni govde alanına markdown olarak, yalnız izin verilen düzeltmelerle aynen yaz; fotoğraflar PDF'ten alınmadı, gorseller boş liste, kapak 0.`
    : `Dosya: ${String(b.dosyaAdi ?? "").slice(0, 120)}\n${kucukler.length ? "Fotoğrafların küçük kopyaları yukarıda, \"FOTOĞRAF n\" etiketiyle.\n" : ""}\nBELGE:\n${satirlar(bloklar)}`;
  const is = crypto.randomUUID();
  const yaz = (j: unknown) => sb.storage.from("icerik").upload(YER(is), new Blob([JSON.stringify({ kim: k.user!.id, ...j as object })], { type: "application/json" }), { upsert: true });
  const calis = async () => {
    try {
      const r = await claudeJson({
        sistem: SISTEM(uslup), kullanici, model: CLAUDE_MODEL.kontrol, ms: SURE_MS, sema: SEMA, maxTokens: 20000, caba: "medium", fonk: "belge-yaz",
        resimler: kucukler.map((x: { n: number; b64: string }) => ({ mime: "image/jpeg", b64: x.b64, etiket: `FOTOĞRAF ${x.n}` })),
        ...(pdf ? { belgeler: [{ b64: pdf }] } : {}),
      });
      await yaz(r ? { ok: true, sonuc: r.veri, model: r.model } : { hata: "Claude anahtarı yok. Yönetici Stüdyo'da Bağlantı anahtarları ekranından eklemeli." });
    } catch (e) {
      await yaz({ hata: "Yapay zekâ yanıt vermedi: " + String((e as Error).message ?? e).slice(0, 200) });
    }
  };
  // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
  EdgeRuntime.waitUntil(calis());
  return yanit({ is }, 202);
});
