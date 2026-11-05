// Künye otomasyonu (25 Ekim 2026, kullanıcı: "kaynaklarından çekeceğimiz bir otomasyon"; 29 Ekim: resmî sayfadan sonra B&H Photo): her ürün için yapay zekâ Google aramasıyla
// resmî üretici sayfasını (yoksa güvenilir kaynağı) bulur, ürünün özellik şablonundaki değerleri kaynak bağlantısı ve kanıtıyla önerir.
// Öneriler public.kunye_oneriler'e yazılır (göç 0036); editör Stüdyo → Site → Künye onayı'ndan onaylayınca panele yazılır.
// POST { adet?: 1-3, urun_id?: number } · Giriş: Stüdyo oturumu. Ürünler panelin herkese açık API'sinden okunur.
// Zamanlayıcı (27 Ekim 2026, kullanıcı: "her gün otomatik"): günde 4 kez sunucu içinden 3'er ürün (göç 0042); oturumsuz çağrı yalnız
// sunucu içinden (X-Forwarded-For'suz) kabul edilir, arka planda çalışır. Kota dolunca durur, ürünü "hata" diye işaretlemez (ertesi tur yeniden dener).
// 5 Kasım 2026 (kullanıcı onayı: "künyeler saçma sapan olmuş"; görseller "versus.com'daki gibi"): yalnız çıkmış ürün; kaynak sırası üreticinin Türkiye
// sayfası → küresel sayfası → bir ikinci kaynak (en çok 3 sayfa); biçim kalıpları (BICIM), CE/Türkiye değeri, model ve tutarlılık kuralları; Gemini'nin
// çıkardığını Claude Sonnet "ikinci göz" sayfalara karşı denetler; görsel yalnız üreticiden, yapay zekâ görerek seçer, kesimi denetlenir (gorsel.ts).
// Eski yöntemin bekleyen önerileri yenisi gelince kalkar (YONTEM_SURUMU).
import { createClient } from "npm:@supabase/supabase-js@2";
import { anahtarHatasi, anahtarlar as geminiAnahtarlari, isaretle } from "./anahtar.ts";
import { KIYAS_MODELLERI, kiyasCagir } from "../triyaj-taslak/kiyas.ts";
import { claudeJson } from "../triyaj-taslak/claude.ts";
import { kesimDenetle, ureticiAlani, urunGorseliBul, type UrunGorseli } from "./gorsel.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const yanit = (j: unknown, status = 200) => Response.json(j, { status, headers: CORS });
const PANEL = Deno.env.get("PANEL_URL") || "https://panel.updated.com.tr";
const ADRES = Deno.env.get("PUBLIC_SUPABASE_URL") || "https://panel.updated.com.tr";
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
function jsonOku(s: string) { try { return JSON.parse(s); } catch { const m = s.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } }

type Spec = { key: string; unit?: string | null; value?: string | null };
type Urun = { id: number; name: string; brand: string; type: string; status?: string; specs?: Spec[] };

// Biçim kalıpları (5 Kasım 2026, kullanıcı onayı: künyeler tutarsız, çevrilmemiş, bölge değeri yanlış): her özellik aynı kalıpla yazılır.
// Hem çıkaran istem (SISTEM/OKU_SISTEM) hem ikinci göz (GOZ_SISTEM) bu listeyi kullanır.
const BICIM = `BİÇİM KALIPLARI (değer bu kalıpla yazılır; birim özelliğin birimiyle aynı olmalı):
- Genel: ondalıkta virgül (24,2), binlik ayırıcı nokta (5.000 mAh, 51.200), aralıkta uzun tire (100–51.200), çarpı işareti × (131 × 96 × 80 mm), farklı modlar/parçalar " · " ile (30 fps (elektronik) · 10 fps (mekanik)). Var/yok özelliklerinde "Var" ya da "Yok", gerekirse kısa ek: "Var (5,5 stop)".
- Dil: kısa editoryal Türkçe. Pazarlama adını çevirmeden bırakma, ne olduğunu yaz ("AI Noise Cancelling" değil "Yapay zekâ gürültü engelleme"); parantez içinde İngilizce karşılık ekleme ("Tüm yönlü (Omnidirectional)" değil "Tüm yönlü"). Teknoloji/standart adları aynen kalır (CFexpress, ProRes RAW, S-Log3, Wi-Fi 7, LTPO, OIS).
- Sensör boyutu: "Tam kare (35 mm)", "APS-C", "Micro Four Thirds", "1 inç", "1/1,3 inç". Four Thirds/Micro Four Thirds ASLA "4/3 inç" yazılmaz.
- Sensör: tür ve yapı ("BSI CMOS, yığılmış"). Çözünürlük: "24,2 MP". Ana/Ultra geniş/Telefoto/Ön kamera: "200 MP, f/1,7, OIS" · "50 MP, 5× optik, f/3,4".
- Maks. video: cihazın EN YÜKSEK çözünürlüğü ve o çözünürlükteki en yüksek kare hızı ("8K 30p", "6K 60p"); 4K kare hızı ile çelişmez. 4K kare hızı: "120 fps". Renk derinliği: "10-bit 4:2:2". Log profili: "S-Log3, HLG". RAW video: "ProRes RAW (dahili)" ya da "Yok". Kayıt süresi sınırı: "Sınırsız" ya da "30 dk".
- ISO aralığı: "100–51.200 (genişletilmiş 50–204.800)". Seri çekim: "30 fps (elektronik) · 10 fps (mekanik)". Gövde içi sabitleme: "8 stop (CIPA)". Otomatik odak: "Faz algılamalı hibrit, 759 nokta, konu tanıma".
- Vizör: "OLED, 5,76 milyon nokta, 0,8×". Ekran (fotoğraf makinesi): "3,2 inç, 2,1 milyon nokta, çok açılı, dokunmatik"; ekran (telefon/tablet): "6,9 inç LTPO AMOLED, 3120 × 1440". Yenileme hızı: "1–120 Hz". Parlaklık: "2.600 nit (tepe)".
- Kart yuvası: "2 × CFexpress Tip B" / "1 × SD (UHS-II)". Lens yuvası: "Sony E", "Nikon Z", "Canon RF", "L-Mount", "Fujifilm X". Hava koşullarına dayanıklılık: "Var (toz ve neme karşı)" ya da "Yok". Suya dayanıklılık: "IP68".
- Pil (CIPA): "580 kare (ekranla)". Pil (mAh): "5.000 mAh". Pil süresi: "10 saat" (parçalara göre farklıysa "10 saat (verici) · 11 saat (alıcı)"). Kablolu/Kablosuz şarj: "45 W".
- Ağırlık: "658 g (pil ve kartla)". Boyutlar: genişlik × yükseklik × derinlik ("131 × 96 × 80 mm"); lensse çap × uzunluk ("Ø 81 × 128 mm").
- Bağlantı: "Wi-Fi 6E, Bluetooth 5.3, USB-C 3.2". İşlemci: "Snapdragon 8 Elite Gen 5". RAM: "12 GB". Depolama: "256 GB · 512 GB · 1 TB". İşletim sistemi: "Android 16 (One UI 8)". Güncelleme desteği: "7 yıl".
- Lens: Odak uzaklığı "24–70 mm", Maks. diyafram "f/2,8", Min. diyafram "f/22", Min. odak mesafesi "38 cm", Maks. büyütme "0,24×", Filtre çapı "82 mm", Diyafram bıçağı "11", Optik yapı "15 grupta 20 eleman", Otomatik odak motoru "Lineer motor", Optik sabitleme "Var (5,5 stop)", Sensör kapsama "Tam kare".
- Drone: Uçuş süresi "34 dk", İletim menzili "10 km", Rüzgar direnci "12 m/sn", Gimbal "3 eksen", Engel algılama "Çok yönlü", Sınıf "C0".
- Işık: CRI "96", TLCI "97", Renk sıcaklığı "2.700–6.500 K", Aydınlatma "12.400 lux (1 m)", Güç "300 W". Gimbal: Taşıma kapasitesi "3 kg", Eksen "3".
- Türkiye fiyatı: "64.999 TL" (yalnız resmî Türkiye kaynağında yazıyorsa). Çıkış tarihi: "Eylül 2026". Tür: kısa Türkçe ("Aynasız fotoğraf makinesi", "Kablosuz mikrofon").`;

const SISTEM = `Sen bir teknoloji sitesinin ürün veritabanı editörüsün. Görevin bir ürünün teknik özelliklerini İNTERNETTE ARAYARAK bulmak. Okur Türkiye'de.
KURALLAR:
- Kaynak sırası: üreticinin Türkiye sayfası, yoksa üreticinin Avrupa/küresel resmî ürün/teknik özellik sayfası. Orada olmayan değer için İKİNCİ KAYNAK B&H Photo (bhphotovideo.com, "Specs"), GSMArena ya da DPReview. Kaynaklar çelişirse üreticinin değeri geçer.
- Bölgeye göre değişen değerlerde (kablosuz/iletim menzili, frekans, verici gücü, şarj adaptörü, fiyat) Türkiye ya da AB/CE değerini yaz. Yalnız FCC/ABD değeri varsa o özelliği boş bırak.
- Değer TAM OLARAK bu modelin değeri olmalı: kardeş model (FE, Pro, Ultra, Mini, Plus, Lite, önceki nesil) ya da sayfadaki başka sürümün sütunu karıştırılmaz.
- Değerler kendi içinde tutarlı olmalı (Maks. video ile 4K kare hızı, ağırlık ile boyut, ekran ile çözünürlük çelişmez).
- Yalnız kaynakta açıkça yazan bilgiyi ver. Tahmin etme; emin değilsen o özelliği listeye koyma. Söylenti/sızıntı kullanma.
- "value": kısa Türkçe değer, aşağıdaki BİÇİM KALIPLARINA göre, birimiyle.
- "num": karşılaştırma için tek sayı, özelliğin birimi cinsinden (ör. 658), sayısal değilse null.
- "kaynak": değeri aldığın sayfanın TAM adresi (https://…). "kanit": o sayfadan, sayfanın kendi dilinde, AYNEN kısa alıntı (en fazla 120 karakter; çeviri değil).
- "urunSayfasi": üreticinin bu ürüne ait resmî ürün sayfasının TAM adresi (yoksa null).
- "resmiAd": ürünün kaynakta yazan tam ve ayırt edici model adı, markasız (ör. "MacBook Pro 14 inç (M6, 2026)", "Nikkor Z 120-300mm f/2.8 TC VR S"). Verilen ad zaten tam ve doğruysa ya da emin değilsen null.
${BICIM}
Yanıtı YALNIZ şu JSON olarak ver, başka metin yazma:
{"urunSayfasi":"https://...","resmiAd":null,"ozellikler":[{"key":"...","value":"...","num":null,"kaynak":"https://...","kanit":"..."}]}`;

const UA = "Mozilla/5.0 (compatible; UpdatedStudyo/1.0; +https://www.updated.com.tr; kunye gorseli)";
const sade = (x: string) => x.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/g, "");
const hostAl = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const duz = (x: string) => String(x ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

type Sayfa = { url: string; baslik: string; metin: string; resmi: boolean; html?: string };

// ---------- Künye kıyası (4 Kasım 2026, kullanıcı: "künyeye de bir karşılaştırma ekleyelim"; göç 0065) ----------
// Örneklenen ürünlerde aynı sayfa metinleri ve aynı istemle kıyas modelleri (triyaj-taslak/kiyas.ts: Claude, GPT, Gemini 4) de özellik çıkarır; sonuçları kullanılmaz, yalnız
// public.yz_kiyas'a yazılır (Gemini'ninkiyle birlikte). Nesnel ölçü: modelin verdiği alıntı ("kanit") kaynak sayfanın metninde gerçekten
// geçiyor mu (uydurma kontrolü). Oran: tr_settings.yz_kiyas.kunye_oran (yüzde).
type KunyeGirdi = { kullanici: string; sayfalar: Sayfa[]; model: string };
const kucukHarf = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
function kunyeSuz(v: Record<string, any> | null | undefined, adlar: Set<string>, sayfalar: Sayfa[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const metin = new Map(sayfalar.map((x) => [x.url, kucukHarf(x.metin)]));
  const oz = (Array.isArray(v?.ozellikler) ? v!.ozellikler : []).filter((o: { key?: string; value?: string; kaynak?: string }) => o?.key && adlar.has(o.key) && o.value && metin.has(String(o.kaynak ?? "")))
    .map((o: { key: string; value: string; kaynak: string; kanit?: string }) => {
      const k = kucukHarf(String(o.kanit ?? ""));
      return { key: o.key, value: String(o.value).slice(0, 120), kaynak: o.kaynak, kanit: String(o.kanit ?? "").slice(0, 160), dogru: k.length >= 3 && metin.get(o.kaynak)!.includes(k) };
    });
  return { ozellikler: oz, resmiAd: typeof v?.resmiAd === "string" ? v.resmiAd : null, bulunan: oz.length, dogrulanan: oz.filter((x: { dogru: boolean }) => x.dogru).length };
}
async function kunyeKiyas(sb: ReturnType<typeof createClient>, oneriId: string, g: KunyeGirdi, adlar: Set<string>, gemV: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const satirlar: Record<string, unknown>[] = [{ is_turu: "kunye", nesne: oneriId, model: "gemini:" + g.model, sonuc: kunyeSuz(gemV, adlar, g.sayfalar), sure_ms: 0 }];
  await Promise.all(KIYAS_MODELLERI.map(async (m) => {
    const t0 = Date.now();
    try {
      const v = await kiyasCagir(sb, m, OKU_SISTEM, g.kullanici, 150_000, "kunye-otomatik");
      satirlar.push({ is_turu: "kunye", nesne: oneriId, model: m.id, sonuc: v ? kunyeSuz(v, adlar, g.sayfalar) : {}, sure_ms: Date.now() - t0, hata: v ? null : "Anahtar yok" });
    } catch (e) { satirlar.push({ is_turu: "kunye", nesne: oneriId, model: m.id, sonuc: {}, sure_ms: Date.now() - t0, hata: String((e as Error).message ?? e).slice(0, 200) }); }
  }));
  await sb.from("yz_kiyas").insert(satirlar);
}
let SAYFA_TESHIS = "";
/** Ürünün özellik sayfaları: künyede kayıtlı bağlantılar (önceki onaylı değerlerin kaynakları) ve Brave Search API sonuçları okunur; arama motoru
 *  kazınmaz (31 Ekim 2026: robot doğrulaması olan aramalar kullanılmaz). Sayfa kendi adımızla (UA) istenir; engelleyen site atlanır. */
const BRAVE_AY_SINIR = 700; // ücretsiz 1.000 aramanın güvenli altı
const ATLA = /youtube\.|amazon\.|reddit\.|facebook\.|instagram\.|tiktok\.|x\.com|twitter\.|pinterest\.|ebay\.|aliexpress\.|hepsiburada\.|trendyol\.|n11\.|teknosa\.|mediamarkt\.|vatanbilgisayar\.|akakce\.|cimri\.|epey\./i;
const IKINCIL = /bhphotovideo\.com|gsmarena\.com|dpreview\.com/i;
const TR_SAYFA = /\/tr(?:[-_]tr)?(?:\/|$)|\.com\.tr|[?&](?:lang|locale)=tr/i;
/** Aylık Brave sınırı (31 Ekim 2026, kullanıcı: "sınırı aşıp kartımdan çekmesin"): ücretsiz hak ayda 5 $ ≈ 1.000 arama; sistem ayda en çok
 *  BRAVE_AY_SINIR arama yapar, sayaç tr_settings.brave_sayac'ta (künye, radar, haber görselleri ortak; ay başında sıfırlanır). Hak varsa sayar. */
async function braveHak(sb: ReturnType<typeof createClient>) {
  const ay = new Date().toISOString().slice(0, 7);
  const { data: sy } = await sb.from("tr_settings").select("value").eq("key", "brave_sayac").maybeSingle();
  const sayac = (sy?.value as { ay?: string; adet?: number } | null)?.ay === ay ? Number((sy!.value as { adet?: number }).adet ?? 0) : 0;
  if (sayac >= BRAVE_AY_SINIR) { SAYFA_TESHIS = `Brave aylık sınır doldu (${sayac}/${BRAVE_AY_SINIR})`; return false; }
  await sb.from("tr_settings").upsert({ key: "brave_sayac", value: { ay, adet: sayac + 1 } });
  return true;
}
/** Brave Search API (göç 0057, Stüdyo → Bağlantı anahtarları "brave_arama"): ürünün özellik sayfası adayları. Anahtar yoksa boş döner.
 *  5 Kasım 2026: önce Türkçe arama (yalnız üreticinin sayfaları alınır: Türkiye sayfası), sonra İngilizce (üreticinin küresel sayfası + ikinci kaynaklar). */
async function braveAra(sb: ReturnType<typeof createClient>, urun: Urun): Promise<string[]> {
  const { data } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", "brave_arama").maybeSingle();
  const anahtar = (data as { deger?: string } | null)?.deger;
  if (!anahtar) return [];
  const sorgu = async (q: string, tr: boolean) => {
    const r = await fetch(`https://api.search.brave.com/res/v1/web/search?count=10${tr ? "&country=TR&search_lang=tr" : ""}&q=` + encodeURIComponent(q), { headers: { Accept: "application/json", "X-Subscription-Token": anahtar }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) { SAYFA_TESHIS += ` · Brave ${tr ? "TR " : ""}${r.status}`; await r.body?.cancel().catch(() => {}); return [] as string[]; }
    const j = await r.json();
    return ((j?.web?.results ?? []) as { url: string }[]).map((x) => x.url).filter((u) => /^https?:\/\//.test(u) && !ATLA.test(u));
  };
  const cikan: string[] = [];
  if (await braveHak(sb)) cikan.push(...(await sorgu(`${urun.brand} ${urun.name} teknik özellikler`, true)).filter((u) => ureticiAlani(u, urun.brand)));
  if (await braveHak(sb)) cikan.push(...await sorgu(`${urun.brand} ${urun.name} ${urun.type === "lens" ? "lens " : ""}specifications`, false));
  return [...new Set(cikan)];
}
/** Sayfa metni: menü/alt bilgi atılır; uzun sayfada teknik özellik bölümü öne alınır (özellik tablosu çoğu zaman sayfanın sonunda) */
function metinAl(html: string) {
  const t = duz(html.replace(/<(script|style|noscript|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, " "));
  if (t.length <= 18_000) return t;
  const m = [...t.matchAll(/teknik özellikler|technical specifications|tech specs|specifications|specs\b/gi)].find((x) => (x.index ?? 0) > 2_500);
  return m ? t.slice(0, 2_500) + " … " + t.slice(Math.max(0, m.index! - 300), m.index! + 15_500) : t.slice(0, 18_000);
}
/** En çok 3 sayfa: üreticinin 2 sayfası (Türkiye sayfası önce) + 1 ikinci kaynak (B&H, GSMArena, DPReview); başka site yalnız bunlar yoksa */
async function sayfaBul(adresler: string[], marka: string): Promise<Sayfa[]> {
  const sinif = (u: string) => (ureticiAlani(u, marka) ? (TR_SAYFA.test(u) ? 0 : 1) : IKINCIL.test(u) ? 2 : 3);
  const sirali = [...new Set(adresler)].filter((u) => /^https?:\/\//.test(u)).map((u, i) => ({ u, i, s: sinif(u) })).sort((a, b) => a.s - b.s || a.i - b.i);
  SAYFA_TESHIS += `${SAYFA_TESHIS ? " · " : ""}${sirali.length} aday (${sirali.filter((x) => x.s <= 1).length} üretici)`;
  const cikan: Sayfa[] = [];
  let uretici = 0, ikincil = 0, deneme = 0;
  for (const { u: url, s } of sirali) {
    if (cikan.length >= 3 || deneme >= 6) break;
    if ((s <= 1 && uretici >= 2) || (s === 2 && ikincil >= 1) || (s === 3 && cikan.length >= 2)) continue;
    deneme++;
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(12_000) }).catch(() => null);
    if (!r?.ok || !/html/i.test(r.headers.get("content-type") ?? "")) { SAYFA_TESHIS += ` · ${hostAl(url)} ${r?.status ?? "yok"}`; await r?.body?.cancel().catch(() => {}); continue; }
    const html = await r.text();
    const t = metinAl(html);
    if (t.length < 1500) { SAYFA_TESHIS += ` · ${hostAl(url)} kısa`; continue; }
    cikan.push({ url, baslik: hostAl(url), metin: t, resmi: s <= 1, html: s <= 1 ? html.slice(0, 2_000_000) : undefined });
    if (s <= 1) uretici++; else if (s === 2) ikincil++;
  }
  return cikan;
}
const OKU_SISTEM = SISTEM.replace("Görevin bir ürünün teknik özelliklerini İNTERNETTE ARAYARAK bulmak.", "Görevin bir ürünün teknik özelliklerini SANA VERİLEN SAYFA METİNLERİNDEN çıkarmak. İnternette arama yapma; yalnız bu metinlerde açıkça yazanı kullan. Sayfaların hangisinin üreticinin olduğu ÜRETİCİ/İKİNCİ KAYNAK etiketinde yazar.")
  .replace(/"kaynak": [^\n]*/, '"kaynak": değeri aldığın sayfanın KAYNAK satırındaki adres, aynen. "kanit": o sayfadan, sayfanın kendi dilinde, AYNEN kısa alıntı (en fazla 120 karakter; çeviri değil).');

// İkinci göz (5 Kasım 2026, kullanıcı onayı): ücretsiz Gemini'nin çıkardığı değerleri Claude Sonnet aynı sayfalara karşı denetler: kaynakta yazmayanı
// siler, yanlışı (kardeş model, FCC değeri, yanlış birim/biçim, çelişki) düzeltir, sayfalarda açıkça yazıp atlananı ekler. Claude yoksa Gemini'ninki kalır.
const GOZ_MODEL = "claude-sonnet-5-5";
const GOZ_SISTEM = `Sen bir teknoloji sitesinin ürün künyesi denetçisisin. Okur Türkiye'de. Başka bir yapay zekâ verilen sayfa metinlerinden bir ürünün teknik özelliklerini çıkardı; sen her değeri AYNI SAYFALARA karşı denetleyip son listeyi verirsin.
DENETİM:
1. Kanıt: değer kaynak sayfada açıkça yazıyor mu, "kanit" alıntısı değeri destekliyor mu? Desteklemiyorsa sayfada doğrusu varsa düzelt, yoksa sil.
2. Model: değer TAM OLARAK bu modelin mi (kardeş model FE/Pro/Ultra/Mini/Plus/Lite, önceki nesil, sayfadaki başka sürümün sütunu değil)?
3. Bölge: bölgeye göre değişen değerlerde (kablosuz/iletim menzili, frekans, verici gücü, şarj adaptörü, fiyat) Türkiye ya da AB/CE değeri. Yalnız FCC/ABD değeri varsa sil.
4. Kaynak sırası: üretici sayfasındaki değer ikinci kaynağınkinden önce gelir; çelişirse üreticininki.
5. Tutarlılık: değerler birbiriyle çelişmez (Maks. video en yüksek çözünürlük ve 4K kare hızıyla uyumlu; ağırlık/boyut; ekran/çözünürlük).
6. Biçim: aşağıdaki BİÇİM KALIPLARINA uymayanın yalnız yazımını düzelt (anlamı değiştirme). Çevrilmemiş pazarlama dilini kısa Türkçeye çevir.
7. Eksik: istenen özelliklerden sayfalarda AÇIKÇA yazıp listede olmayanları ekle. Tahmin, çıkarım, hesap yok.
"kaynak" yalnız sayfaların KAYNAK satırındaki adreslerden biri olur. "kanit" o sayfadan, sayfanın kendi dilinde AYNEN kısa alıntı (en fazla 120 karakter). "num": özelliğin birimi cinsinden tek sayı ya da null.
"islem": değer aynen kaldıysa "ayni", değiştirdiysen "duzeltildi", yeni eklediysen "eklendi". "not": düzelttiysen ya da eklediysen tek kısa cümleyle neden (ör. "Sayfada FE modelinin değeri vardı"), yoksa boş.
Sildiklerini "silinen" listesine özellik adı ve kısa nedenle yaz.
${BICIM}`;
const GOZ_SEMA = {
  type: "object",
  properties: {
    ozellikler: { type: "array", items: { type: "object", properties: {
      key: { type: "string" }, value: { type: "string" }, num: { anyOf: [{ type: "number" }, { type: "null" }] }, kaynak: { type: "string" }, kanit: { type: "string" },
      islem: { type: "string", enum: ["ayni", "duzeltildi", "eklendi"] }, not: { type: "string" },
    }, required: ["key", "value", "num", "kaynak", "kanit", "islem", "not"], additionalProperties: false } },
    silinen: { type: "array", items: { type: "object", properties: { key: { type: "string" }, neden: { type: "string" } }, required: ["key", "neden"], additionalProperties: false } },
  },
  required: ["ozellikler", "silinen"], additionalProperties: false,
};
async function ikinciGoz(istem: string, metin: string, ozellikler: unknown[], ms: number) {
  const r = await claudeJson({ sistem: GOZ_SISTEM, kullanici: `${istem}\n\nÇIKARILAN DEĞERLER:\n${JSON.stringify(ozellikler)}\n\nSAYFALAR:\n${metin}`, model: GOZ_MODEL, ms, sema: GOZ_SEMA, maxTokens: 16_000, caba: "medium", fonk: "kunye-otomatik" });
  return r ? r.veri as { ozellikler: Record<string, unknown>[]; silinen: { key: string; neden: string }[] } : null;
}

/** bitis: bu ürün için son an (işçi 400 sn'de kesilir; ikinci göz süresi yetmiyorsa atlanır) */
async function ara(sb: ReturnType<typeof createClient>, urun: Urun, bitis = Date.now() + 300_000) {
  const anahtarlar = await geminiAnahtarlari();
  if (!anahtarlar.length) throw new Error("GEMINI_API_KEY yok");
  const liste = (urun.specs ?? []).some((s) => s.key === "Boyutlar") ? urun.specs ?? [] : [...(urun.specs ?? []), { key: "Boyutlar", unit: "mm" }];
  const ozellikler = liste.map((s) => `- ${s.key}${s.unit ? " · " + s.unit : ""}`).join("\n");
  const istem = `ÜRÜN: ${urun.brand} ${urun.name}\nDOLDURULACAK ÖZELLİKLER (ad · birim):\n${ozellikler}`;
  let son = "";
  // 1) Asıl yol (31 Ekim 2026): sayfayı sunucu kendisi bulur ve okur, ücretsiz Gemini (araçsız istek, kota içinde) yalnız okunan metinden
  //    değer çıkarır. Ücretsiz katmanda Gemini'nin Google arama aracı her istekte 429 veriyordu; aramasız istekler geçiyor.
  // Kayıtlı adresler: ürünün sourceUrl'leri (onaylanmış değerlerin kaynakları)
  const kayitli = (urun.specs ?? []).map((x) => (x as Spec & { sourceUrl?: string | null }).sourceUrl ?? "").filter(Boolean) as string[];
  SAYFA_TESHIS = "";
  const bulunan = await braveAra(sb, urun).catch((e) => { SAYFA_TESHIS = "Brave hata: " + String(e).slice(0, 80); return [] as string[]; });
  const adaylar = [...kayitli, ...bulunan];
  const sayfalar = adaylar.length ? await sayfaBul(adaylar, urun.brand).catch(() => [] as Sayfa[]) : [];
  if (sayfalar.length) {
    const metin = sayfalar.map((x, i) => `[${i + 1}] KAYNAK: ${x.url} (${x.resmi ? "ÜRETİCİ" : "İKİNCİ KAYNAK"})\n${x.metin}`).join("\n\n---\n\n");
    const izinli = new Set(sayfalar.map((x) => x.url));
    for (const a of anahtarlar) { let hepsiKota = true; for (const model of ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST", signal: AbortSignal.timeout(90_000), headers: { "Content-Type": "application/json", "x-goog-api-key": a.deger },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: OKU_SISTEM }] }, contents: [{ role: "user", parts: [{ text: `${istem}\n\nSAYFALAR:\n${metin}` }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
        });
        const g = await r.text();
        if (!r.ok) {
          son = `${a.etiket} · ${model} ${r.status} ${g.replace(/\s+/g, " ").slice(0, 300)}`;
          const ah = anahtarHatasi(r.status, g);
          if (ah === "gecersiz") { await isaretle(a, "gecersiz", son); hepsiKota = false; break; }
          if (ah !== "kota_dolu") hepsiKota = false;
          continue;
        }
        hepsiKota = false; await isaretle(a, "calisiyor");
        const c = JSON.parse(g)?.candidates?.[0];
        const v = jsonOku((c?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join(""));
        if (!v) { son = `${model} geçersiz yanıt`; continue; }
        // Kaynak yalnız okunan sayfalardan biri olabilir (model adres uyduramaz)
        if (Array.isArray(v.ozellikler)) v.ozellikler = v.ozellikler.filter((o: { kaynak?: string }) => izinli.has(String(o?.kaynak ?? "")));
        if (v.urunSayfasi && !izinli.has(v.urunSayfasi)) v.urunSayfasi = sayfalar.find((x) => x.resmi)?.url ?? null;
        SAYFA_TESHIS += ` → ${model}`;
        const ham = structuredClone(v);
        const gozSure = Math.min(150_000, bitis - Date.now() - 90_000);
        const goz = gozSure < 30_000 ? (SAYFA_TESHIS += " · ikinci göz: süre yetmedi", undefined) : await ikinciGoz(istem, metin, v.ozellikler ?? [], gozSure).catch((e) => { SAYFA_TESHIS += " · ikinci göz: " + String((e as Error).message ?? e).slice(0, 60); return null; });
        if (goz && Array.isArray(goz.ozellikler)) {
          v.ozellikler = goz.ozellikler.filter((o) => izinli.has(String(o?.kaynak ?? "")));
          v.silinen = Array.isArray(goz.silinen) ? goz.silinen.slice(0, 40) : [];
          const say = (i: string) => v.ozellikler.filter((o: { islem?: string }) => o.islem === i).length;
          SAYFA_TESHIS += ` → ikinci göz: ${say("duzeltildi")} düzeltme, ${say("eklendi")} ek, ${v.silinen.length} silme`;
        } else if (goz === null) SAYFA_TESHIS += " · ikinci göz yok (Claude anahtarı/kredisi)";
        // Alıntı gerçekten kaynak sayfada geçiyor mu (editör görür)
        const sayfaMetni = new Map(sayfalar.map((x) => [x.url, kucukHarf(x.metin)]));
        for (const o of (v.ozellikler ?? []) as { kaynak?: string; kanit?: string; alinti?: boolean }[]) { const k = kucukHarf(String(o.kanit ?? "")); o.alinti = k.length >= 3 && !!sayfaMetni.get(String(o.kaynak))?.includes(k); }
        return { v, ham, sayfalar, kaynaklar: sayfalar.map((x) => ({ baslik: x.baslik, url: x.url })), girdi: { kullanici: `${istem}\n\nSAYFALAR:\n${metin}`, sayfalar, model } };
      } catch { son = `${model} yanıt vermedi`; hepsiKota = false; }
    }
    if (hepsiKota) await isaretle(a, "kota_dolu", son); }
  } else son = adaylar.length ? `Sayfalar okunamadı (${SAYFA_TESHIS})` : `Sayfa adayı yok (${SAYFA_TESHIS || "Brave anahtarı girilmemiş"})`;
  // 2) Yedek: sayfa okunamadıysa ya da Gemini olmadıysa Groq kendi web aramasıyla dener.
  // Groq'ta gpt-oss modelleri yerleşik web aramasıyla (browser_search) aynı istemle denenir; kaynaklar modelin yaptığı aramalardan alınır.
  // ("groq/compound" bu hesapta yok: 404, 31 Ekim 2026)
  const groq = Deno.env.get("GROQ_API_KEY");
  if (groq) for (const model of ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(120_000), headers: { "Content-Type": "application/json", Authorization: "Bearer " + groq },
        body: JSON.stringify({ model, temperature: 0.1, tools: [{ type: "browser_search" }], tool_choice: "required", messages: [{ role: "system", content: SISTEM }, { role: "user", content: istem }] }),
      });
      const g = await r.text();
      if (!r.ok) { son += ` | Groq ${model} ${r.status} ${g.replace(/\s+/g, " ").slice(0, 200)}`; continue; }
      const m = JSON.parse(g)?.choices?.[0]?.message;
      const v = jsonOku(String(m?.content ?? ""));
      if (!v) { son += ` | Groq ${model} geçersiz yanıt`; continue; }
      // deno-lint-ignore no-explicit-any
      const arananlar = (m?.executed_tools ?? []).flatMap((t: any) => t?.search_results?.results ?? []).map((x: { title?: string; url?: string }) => ({ baslik: x.title ?? "", url: x.url ?? "" }));
      const ozKaynak = (Array.isArray(v?.ozellikler) ? v.ozellikler : []).map((o: { kaynak?: string }) => ({ baslik: "", url: String(o?.kaynak ?? "") }));
      const kaynaklar = [...arananlar, ...ozKaynak].filter((x) => /^https?:\/\//.test(x.url)).filter((x, i, l) => l.findIndex((y) => y.url === x.url) === i).slice(0, 12);
      SAYFA_TESHIS += ` → Groq ${model}`;
      return { v, kaynaklar };
    } catch (e) { son += ` | Groq ${model}: ${String(e).slice(0, 120)}`; }
  }
  throw new Error("Yapay zekâ yanıt vermedi (" + son + ")");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return yanit({ error: "POST gerekli" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: k } = jwt ? await sb.auth.getUser(jwt) : { data: null };
  const zamanlayici = !k?.user && !req.headers.get("x-forwarded-for");
  if (!k?.user && !zamanlayici) return yanit({ error: "Stüdyo girişi gerekli" }, 401);
  const b = await req.json().catch(() => ({}));
  const adet = Math.min(3, Math.max(1, Number(b.adet) || (zamanlayici ? 3 : 2)));
  if (zamanlayici) { EdgeRuntime.waitUntil(isle(sb, b, adet)); return yanit({ basladi: true }); }
  return yanit(await isle(sb, b, adet));
});

/** Arka plan silme Cloudflare'de (göç 0044, public/cloudflare/gorsel-worker.js): görsel indirilir, programa gönderilir,
 *  dönen 1600×900 şeffaf WebP "kunye" kovasına konur. Program kurulmamışsa satır "isleniyor" bekler; kurulunca sonraki turda işlenir.
 *  5 Kasım 2026: kesilmiş hâl yapay zekâyla denetlenir (ürün eksiksiz, zemin kalıntısı yok); geçmezse seçimdeki sıradaki aday denenir. */
async function cfAyar(sb: ReturnType<typeof createClient>) {
  const { data } = await sb.from("baglanti_anahtarlari").select("ad,deger").in("ad", ["cloudflare_adres", "cloudflare_anahtar"]);
  const m = Object.fromEntries((data ?? []).map((x: { ad: string; deger: string }) => [x.ad, x.deger]));
  return m.cloudflare_adres && m.cloudflare_anahtar ? { adres: String(m.cloudflare_adres).replace(/\/$/, ""), anahtar: String(m.cloudflare_anahtar) } : null;
}
type GorselSatir = { id: number; urun_id: number; urun_adi?: string; gorsel_aday: UrunGorseli | null };
async function gorselIsle(sb: ReturnType<typeof createClient>, cf: { adres: string; anahtar: string }, s: GorselSatir) {
  const yaz = (x: Record<string, unknown>) => sb.from("kunye_oneriler").update(x).eq("id", s.id);
  if (!s.gorsel_aday?.url) { await yaz({ gorsel_durum: "yok" }); return; }
  const sira = [{ url: s.gorsel_aday.url, sayfa: s.gorsel_aday.sayfa }, ...(s.gorsel_aday.yedekler ?? [])];
  let son = "";
  for (const [i, a] of sira.entries()) {
    try {
      const g = await fetch(a.url, { headers: { "User-Agent": UA, Accept: "image/*", Referer: a.sayfa }, signal: AbortSignal.timeout(30_000) });
      if (!g.ok) throw new Error(`görsel indirilemedi (${g.status})`);
      const veri = new Uint8Array(await g.arrayBuffer());
      if (veri.byteLength > 20e6) throw new Error("görsel 20 MB üstü");
      const r = await fetch(cf.adres, { method: "POST", headers: { "x-anahtar": cf.anahtar, "Content-Type": g.headers.get("content-type") || "image/jpeg" }, body: veri, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) {
        const h = `Cloudflare ${r.status}: ${(await r.text()).slice(0, 140)}`;
        if (r.status === 401 || r.status === 500) { await sb.from("baglanti_anahtarlari").update({ ek: { hata: h } }).eq("ad", "cloudflare_adres"); son = h; break; }
        throw new Error(h);
      }
      const webp = new Uint8Array(await r.arrayBuffer());
      const d = await kesimDenetle(webp, s.urun_adi ?? "");
      if (!d.gecti) { son = "Kesim denetimden geçmedi: " + d.sorun; continue; }
      const yol = `${s.urun_id}-${s.id}.webp`;
      const { error } = await sb.storage.from("kunye").upload(yol, webp, { contentType: "image/webp", upsert: true });
      if (error) throw new Error("yükleme: " + error.message);
      await yaz({ gorsel: `${ADRES}/storage/v1/object/public/kunye/${yol}?v=${Date.now()}`, gorsel_durum: "hazir", gorsel_hata: null,
        ...(i ? { gorsel_aday: { ...s.gorsel_aday, url: a.url, sayfa: a.sayfa, neden: "Sıradaki aday (ilk seçimin kesimi denetimden geçmedi)" } } : {}) });
      await sb.from("baglanti_anahtarlari").update({ ek: { son_islem: new Date().toISOString(), hata: "" } }).eq("ad", "cloudflare_adres");
      return;
    } catch (e) { son = String((e as Error).message); }
  }
  await yaz({ gorsel_durum: "hata", gorsel_hata: son.slice(0, 200) });
}

const kotaDolu = (m: string) => /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(m);
// Künye yalnız çıkmış ürüne (5 Kasım 2026, kullanıcı onayı): söylenti, sızıntı, test kaydı, takvimdeki ürün atlanır
const CIKMIS = new Set(["satista", "duyuruldu", "eol"]);
// Yöntem sürümü: değişince eski yöntemin bekleyen önerileri yeniden çıkarılır (yenisi gelince eskisi "hata: yerine yeni öneri geldi" olur).
// Sürümün ilk çalıştığı an tr_settings.kunye_surum'a yazılır; o andan önceki öneriler eski sayılır.
const YONTEM_SURUMU = "2026-11-05";
async function surumZamani(sb: ReturnType<typeof createClient>) {
  const { data } = await sb.from("tr_settings").select("value").eq("key", "kunye_surum").maybeSingle();
  const v = data?.value as { surum?: string; zaman?: string } | null;
  if (v?.surum === YONTEM_SURUMU && v.zaman) return v.zaman;
  const zaman = new Date().toISOString();
  await sb.from("tr_settings").upsert({ key: "kunye_surum", value: { surum: YONTEM_SURUMU, zaman } });
  return zaman;
}
// İşçi 400 sn'de kesilir: bekleyen görseller en çok 90 sn, yeni ürüne 120 sn geçtiyse başlanmaz, her ürünün son anı turun 370. saniyesi
// (kesilen ürün hiç kaydedilmez ve sonraki tur yine onunla başlar; süre yetmezse ikinci göz ya da görsel atlanır, görsel sonraki turda işlenir)
const ISLE_BUTCE_MS = 120_000;

async function isle(sb: ReturnType<typeof createClient>, b: { urun_id?: unknown }, adet: number) {
  const t0 = Date.now();
  // Önce bekleyen görseller (program sonradan kurulduysa ya da önceki tur yarım kaldıysa)
  const cf = await cfAyar(sb).catch(() => null);
  if (cf) {
    const { data: bekleyen } = await sb.from("kunye_oneriler").select("id,urun_id,urun_adi,gorsel_aday").eq("gorsel_durum", "isleniyor").order("id").limit(3);
    for (const x of bekleyen ?? []) { if (Date.now() - t0 > 90_000) break; await gorselIsle(sb, cf, x as GorselSatir); }
  }
  const surum = await surumZamani(sb);
  // Aday ürünler: tek ürün istendiyse o; yoksa çıkmış, değerlerinin yarısından azı dolu ve bu yöntemle bekleyen önerisi olmayanlar
  let urunler: Urun[] = [];
  if (Number.isInteger(b.urun_id)) {
    const r = await fetch(`${PANEL}/api/products/${b.urun_id}?depth=0`); if (r.ok) urunler = [await r.json()];
    const u = urunler[0];
    if (u && !CIKMIS.has(u.status ?? "satista")) return { islenen: [{ urun: `${u.brand} ${u.name}`, durum: "henüz çıkmadı" }], kalan: 0 };
  } else {
    const r = await fetch(`${PANEL}/api/products?limit=500&depth=0&sort=updatedAt&select[name]=true&select[brand]=true&select[type]=true&select[status]=true&select[specs]=true`);
    const tum: Urun[] = r.ok ? (await r.json()).docs : [];
    const cikmamis = tum.filter((u) => !CIKMIS.has(u.status ?? "satista")).map((u) => u.id);
    if (cikmamis.length) await sb.from("kunye_oneriler").update({ durum: "hata", hata: "Ürün henüz çıkmadı; çıkınca künye yeniden çıkarılır" }).eq("durum", "bekliyor").in("urun_id", cikmamis);
    const { data: bekleyen } = await sb.from("kunye_oneriler").select("urun_id").eq("durum", "bekliyor").gte("created_at", surum);
    const yedi = new Date(Math.max(Date.now() - 7 * 864e5, Date.parse(surum))).toISOString();
    const { data: denenen } = await sb.from("kunye_oneriler").select("urun_id").gte("created_at", yedi);
    const atla = new Set([...(bekleyen ?? []), ...(denenen ?? [])].map((x) => x.urun_id));
    urunler = tum.filter((u) => CIKMIS.has(u.status ?? "satista") && !atla.has(u.id) && (u.specs?.length ?? 0) > 0 && (u.specs ?? []).filter((s) => s.value).length < (u.specs ?? []).length / 2);
  }
  const kalan = Math.max(0, urunler.length - adet);
  const { data: ky } = await sb.from("tr_settings").select("value").eq("key", "yz_kiyas").maybeSingle();
  const kyA = (ky?.value ?? {}) as { kunye_oran?: number; bitis?: string };
  const kiyasOran = Date.now() > Date.parse(kyA.bitis ?? "2026-11-18T23:59:00+03:00") ? 0 : Math.max(0, Math.min(100, Number(kyA.kunye_oran ?? 20)));
  const sonuc: { urun: string; durum: string; sayi?: number; hata?: string }[] = [];
  // Son tur Stüdyo'da görünsün (31 Ekim 2026: zamanlayıcı turları 4 gün hiç öneri yazmadı, neden görünmüyordu): her üründen sonra yazılır,
  // işçi süre dolduğu için yarıda kesilse de o ana kadarki sonuç kalır
  const baslangic = new Date().toISOString();
  const kaydet = (bitti: boolean) => sb.from("tr_settings").upsert({ key: "son_kunye", value: { zaman: baslangic, bitti, aday: urunler.length, islenen: sonuc, kalan } }).then(() => {}, () => {});
  await kaydet(false);
  for (const [sira, u] of urunler.slice(0, adet).entries()) {
    if (sira > 0 && Date.now() - t0 > ISLE_BUTCE_MS) break;
    const bitis = Math.min(t0 + 370_000, Date.now() + 300_000);
    try {
      const { v, ham, sayfalar, kaynaklar, girdi } = await ara(sb, u, bitis) as { v: Record<string, any>; ham?: Record<string, any>; sayfalar?: Sayfa[]; kaynaklar: { baslik: string; url: string }[]; girdi?: KunyeGirdi }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const adlar = new Set([...(u.specs ?? []).map((s) => s.key), "Boyutlar"]);
      const oz = (Array.isArray(v?.ozellikler) ? v.ozellikler : []).filter((o: { key?: string; value?: string }) => o?.key && adlar.has(o.key) && o.value)
        .filter((o: { key: string }, i: number, l: { key: string }[]) => l.findIndex((x) => x.key === o.key) === i)
        .map((o: { key: string; value: string; num?: unknown; kaynak?: string; kanit?: string; islem?: string; not?: string; alinti?: boolean }) => ({ key: o.key, value: String(o.value).slice(0, 120), num: typeof o.num === "number" && isFinite(o.num) ? o.num : null, kaynak: /^https?:\/\//.test(String(o.kaynak ?? "")) ? String(o.kaynak).slice(0, 400) : null, kanit: String(o.kanit ?? "").slice(0, 160),
          ...(o.islem && o.islem !== "ayni" ? { islem: o.islem, not: String(o.not ?? "").slice(0, 160) } : {}), ...(o.alinti === false ? { alinti: false } : {}) }));
      // Resmî ad (göç 0060): yalnız gerçekten farklı ve makul uzunluktaysa; markayla başlıyorsa marka çıkarılır
      let resmiAd = typeof v?.resmiAd === "string" ? v.resmiAd.trim().slice(0, 90) : "";
      if (resmiAd.toLocaleLowerCase("tr-TR").startsWith(u.brand.toLocaleLowerCase("tr-TR") + " ")) resmiAd = resmiAd.slice(u.brand.length + 1);
      if (resmiAd.length < 2 || sade(resmiAd) === sade(u.name)) resmiAd = "";
      // Görsel: üreticinin okunan sayfalarından (Groq yolunda sayfa okunmadıysa üretici sayfası görsel için ayrıca okunur)
      const gIz: string[] = [];
      let uSayfa = (sayfalar ?? []).filter((x) => x.html).map((x) => ({ url: x.url, html: x.html! }));
      if (!uSayfa.length) {
        for (const adr of [...new Set([v?.urunSayfasi, ...kaynaklar.map((k) => k.url)].filter((x): x is string => typeof x === "string" && ureticiAlani(x, u.brand)))].slice(0, 2)) {
          const h = await fetch(adr, { headers: { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
          if (h) uSayfa = [...uSayfa, { url: adr, html: h.slice(0, 2_000_000) }];
        }
      }
      const gorsel = bitis - Date.now() < 100_000 ? (gIz.push("görsel: süre yetmedi"), null) : await urunGorseliBul(sb, { marka: u.brand, ad: resmiAd || u.name, tur: u.type, sayfalar: uSayfa, braveSinir: BRAVE_AY_SINIR }, gIz).catch((e) => { gIz.push("görsel hata: " + String(e).slice(0, 60)); return null; });
      const kayit = { urun_id: u.id, urun_adi: `${u.brand} ${u.name}`, tur: u.type, ozellikler: oz, kaynaklar: [...kaynaklar, ...(Array.isArray(v?.silinen) && v.silinen.length ? [{ baslik: "İkinci gözün sildikleri", url: "", silinen: v.silinen }] : [])], durum: oz.length || resmiAd ? "bekliyor" : "hata", hata: oz.length || resmiAd ? null : "Kaynaklarda değer bulunamadı" };
      // Görsel sütunları göç 0043 ile geldi; uygulanmamışsa kayıt görselsiz yazılır
      const { data: yeni, error } = await sb.from("kunye_oneriler").insert({ ...kayit, ...(resmiAd ? { resmi_ad: resmiAd } : {}), gorsel_aday: gorsel, gorsel_durum: gorsel ? "isleniyor" : "yok", ...(gorsel ? {} : { gorsel_hata: gIz.join(" · ").slice(0, 200) || null }) }).select("id").single();
      if (error) await sb.from("kunye_oneriler").insert(kayit);
      // Yeni öneri hazırsa aynı ürünün eski yöntemle bekleyen önerisi kalkar
      if (yeni && kayit.durum === "bekliyor") await sb.from("kunye_oneriler").update({ durum: "hata", hata: "Yerine yeni öneri geldi (5 Kasım yöntemi)" }).eq("urun_id", u.id).eq("durum", "bekliyor").lt("created_at", surum);
      // Künye kıyası (göç 0065): arka planda, öneriyi bekletmez; kıyasta asıl modelin (Gemini) ikinci gözden önceki hâli ölçülür
      if (yeni && girdi && Math.random() * 100 < kiyasOran) {
        // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
        EdgeRuntime.waitUntil(kunyeKiyas(sb, String(yeni.id), girdi, adlar, ham ?? v).catch((e) => console.error("künye kıyası", e)));
      }
      if (gorsel && cf && yeni && bitis - Date.now() > 45_000) await gorselIsle(sb, cf, { id: yeni.id as number, urun_id: u.id, urun_adi: `${u.brand} ${resmiAd || u.name}`, gorsel_aday: gorsel });
      sonuc.push({ urun: `${u.brand} ${u.name}`, durum: oz.length ? "öneri hazır" : "bulunamadı", sayi: oz.length, hata: [SAYFA_TESHIS, ...gIz].filter(Boolean).join(" · ") }); await kaydet(false);
    } catch (e) {
      // Kota dolduysa ürün işaretlenmez (yoksa 7 gün atlanırdı); kalanlar bir sonraki turda
      if (kotaDolu(String((e as Error).message))) { sonuc.push({ urun: `${u.brand} ${u.name}`, durum: "kota dolu", hata: String((e as Error).message).slice(0, 600) }); break; }
      await sb.from("kunye_oneriler").insert({ urun_id: u.id, urun_adi: `${u.brand} ${u.name}`, tur: u.type, durum: "hata", hata: String((e as Error).message).slice(0, 300) });
      sonuc.push({ urun: `${u.brand} ${u.name}`, durum: "hata", hata: String((e as Error).message).slice(0, 200) }); await kaydet(false);
    }
  }
  await kaydet(true);
  return { islenen: sonuc, kalan };
}
