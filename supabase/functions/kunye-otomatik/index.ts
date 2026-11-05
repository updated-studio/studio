// Künye otomasyonu (25 Ekim 2026, kullanıcı: "kaynaklarından çekeceğimiz bir otomasyon"; 29 Ekim: resmî sayfadan sonra B&H Photo): her ürün için yapay zekâ Google aramasıyla
// resmî üretici sayfasını (yoksa güvenilir kaynağı) bulur, ürünün özellik şablonundaki değerleri kaynak bağlantısı ve kanıtıyla önerir.
// Öneriler public.kunye_oneriler'e yazılır (göç 0036); editör Stüdyo → Site → Künye onayı'ndan onaylayınca panele yazılır.
// POST { adet?: 1-3, urun_id?: number } · Giriş: Stüdyo oturumu. Ürünler panelin herkese açık API'sinden okunur.
// Zamanlayıcı (27 Ekim 2026, kullanıcı: "her gün otomatik"): günde 4 kez sunucu içinden 3'er ürün (göç 0042); oturumsuz çağrı yalnız
// sunucu içinden (X-Forwarded-For'suz) kabul edilir, arka planda çalışır. Kota dolunca durur, ürünü "hata" diye işaretlemez (ertesi tur yeniden dener).
// 5 Kasım 2026 (kullanıcı onayı: "künyeler saçma sapan olmuş"; görseller "versus.com'daki gibi"): yalnız çıkmış ürün; kaynak sırası üreticinin Türkiye
// sayfası → küresel sayfası → bir ikinci kaynak (en çok 3 sayfa); biçim kalıpları (BICIM), CE/Türkiye değeri, model ve tutarlılık kuralları; Gemini'nin
// çıkardığını Claude Sonnet "ikinci göz" sayfalara karşı denetler; görsel yalnız üreticiden, yapay zekâ görerek seçer, kesimi denetlenir (gorsel.ts).
// 6 Kasım 2026 (kullanıcı onayı: "künyeyi basitleştir, ucuzlat"): özellikleri tek okumada Claude Sonnet çıkarır (Gemini adımı ve ikinci göz kalktı);
// görselde arama ajanı kalktı, üretici ve bayi adayları tek seçimde yarışır; şeffaf zeminli resmî PNG arka plan silinmeden kullanılır; ana görselin
// yanında künye albümü (üreticinin yaşam tarzı/başka açı görselleri) önerilir; görsel bulunamazsa editör onay ekranında kendi görselini ekler
// (POST { oneri_id, dosya | adres }); reddedilen ürün kendiliğinden yeniden denenmez.
// Eski yöntemin bekleyen önerileri yenisi gelince kalkar (YONTEM_SURUMU).
import { createClient } from "npm:@supabase/supabase-js@2";
import { KIYAS_MODELLERI, kiyasCagir } from "../triyaj-taslak/kiyas.ts";
import { claudeAramali, claudeJson } from "../triyaj-taslak/claude.ts";
import { kesimDenetle, pngSeffaf, ureticiAlani, urunGorseliBul, type UrunGorseli } from "./gorsel.ts";

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
// Çıkaran istemler (SISTEM/OKU_SISTEM) bu listeyi kullanır.
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
// public.yz_kiyas'a yazılır (asıl modelinkiyle birlikte). Nesnel ölçü: modelin verdiği alıntı ("kanit") kaynak sayfanın metninde gerçekten
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
  const satirlar: Record<string, unknown>[] = [{ is_turu: "kunye", nesne: oneriId, model: g.model, sonuc: kunyeSuz(gemV, adlar, g.sayfalar), sure_ms: 0 }];
  await Promise.all(KIYAS_MODELLERI.filter((m) => m.id !== g.model).map(async (m) => {
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
const BRAVE_AY_SINIR = 1000; // ücretsiz 1.000 aramanın tamamı (5 Kasım 2026, kullanıcı: "kotayı 1000e çıkar, dolunca ücretli plana geçeriz")
const ATLA = /youtube\.|amazon\.|reddit\.|facebook\.|instagram\.|tiktok\.|x\.com|twitter\.|pinterest\.|ebay\.|aliexpress\.|hepsiburada\.|trendyol\.|n11\.|teknosa\.|mediamarkt\.|vatanbilgisayar\.|akakce\.|cimri\.|epey\./i;
// İkincil kaynaklar (5 Kasım 2026 genişledi: üretici sitesi sunucumuzu kabul etmediğinde değerler buradan gelir; üreticininki yine önce gelir)
const IKINCIL = /bhphotovideo\.com|gsmarena\.com|dpreview\.com|adorama\.com|notebookcheck\.net|phonearena\.com|cined\.com|newsshooter\.com|imaging-resource\.com|photographyblog\.com|rtings\.com|soundguys\.com/i;
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
/** Okunabilen sayfa azsa (5 Kasım 2026, kullanıcı: "takılınca yedek yerler var, gerekirse Brave aramayı kullansın"; Panasonic, B&H,
 *  DPReview sunucumuzu 403/429 ile geri çeviriyordu) Brave'den üretici dışı, daha önce denenmemiş inceleme/özellik sayfaları istenir.
 *  Siteler engellediyse kılık değiştirip girilmez; okumamıza izin veren başka kaynak aranır. */
async function braveIkincil(sb: ReturnType<typeof createClient>, urun: Urun, denenen: string[]): Promise<string[]> {
  const { data } = await sb.from("baglanti_anahtarlari").select("deger").eq("ad", "brave_arama").maybeSingle();
  const anahtar = (data as { deger?: string } | null)?.deger;
  if (!anahtar || !(await braveHak(sb))) return [];
  const r = await fetch("https://api.search.brave.com/res/v1/web/search?count=20&q=" + encodeURIComponent(`"${urun.name}" ${urun.brand} specs review`), { headers: { Accept: "application/json", "X-Subscription-Token": anahtar }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r?.ok) { SAYFA_TESHIS += ` · Brave ek ${r?.status ?? "yok"}`; await r?.body?.cancel().catch(() => {}); return []; }
  const j = await r.json().catch(() => null);
  const eski = new Set(denenen.map(hostAl));
  return ((j?.web?.results ?? []) as { url: string }[]).map((x) => x.url)
    .filter((u) => /^https?:\/\//.test(u) && !ATLA.test(u) && !ureticiAlani(u, urun.brand) && !eski.has(hostAl(u)));
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

// Künyeyi okuyan model (6 Kasım 2026: tek okuma; önceki "Gemini çıkarır, Claude ikinci göz denetler" düzeni kalktı)
const GOZ_MODEL = "claude-sonnet-5-5";

/** Alıntı gerçekten kaynak sayfada geçiyor mu (editör görür) */
function alintiIsaretle(v: { ozellikler?: unknown }, sayfalar: Sayfa[]) {
  const sayfaMetni = new Map(sayfalar.map((x) => [x.url, kucukHarf(x.metin)]));
  for (const o of (Array.isArray(v.ozellikler) ? v.ozellikler : []) as { kaynak?: string; kanit?: string; alinti?: boolean }[]) { const k = kucukHarf(String(o.kanit ?? "")); o.alinti = k.length >= 3 && !!sayfaMetni.get(String(o.kaynak))?.includes(k); }
}
async function ara(sb: ReturnType<typeof createClient>, urun: Urun, bitis = Date.now() + 300_000) {
  const liste = (urun.specs ?? []).some((s) => s.key === "Boyutlar") ? urun.specs ?? [] : [...(urun.specs ?? []), { key: "Boyutlar", unit: "mm" }];
  const ozellikler = liste.map((s) => `- ${s.key}${s.unit ? " · " + s.unit : ""}`).join("\n");
  const istem = `ÜRÜN: ${urun.brand} ${urun.name}\nDOLDURULACAK ÖZELLİKLER (ad · birim):\n${ozellikler}`;
  let son = "";
  // 1) Asıl yol: sayfayı sunucu kendisi bulur ve okur (kayıtlı adresler + Brave), Claude Sonnet yalnız okunan metinden değer çıkarır.
  //    6 Kasım 2026 (kullanıcı onayı: "künyeyi basitleştir"): ücretsiz Gemini adımı ve ardındaki ikinci göz kalktı; 5 Kasım'da Gemini 136
  //    denemenin 112'sinde hata verdi, iş zaten Claude'a kalıyordu. Tek okuma: aynı kurallar (BICIM, model, bölge, tutarlılık) tek istemde.
  // Kayıtlı adresler: ürünün sourceUrl'leri (onaylanmış değerlerin kaynakları)
  const kayitli = (urun.specs ?? []).map((x) => (x as Spec & { sourceUrl?: string | null }).sourceUrl ?? "").filter(Boolean) as string[];
  SAYFA_TESHIS = "";
  const bulunan = await braveAra(sb, urun).catch((e) => { SAYFA_TESHIS = "Brave hata: " + String(e).slice(0, 80); return [] as string[]; });
  const adaylar = [...kayitli, ...bulunan];
  let sayfalar = adaylar.length ? await sayfaBul(adaylar, urun.brand).catch(() => [] as Sayfa[]) : [];
  if (sayfalar.length < 2) {
    const ek = await braveIkincil(sb, urun, adaylar).catch(() => [] as string[]);
    if (ek.length) sayfalar = [...sayfalar, ...(await sayfaBul(ek, urun.brand).catch(() => [] as Sayfa[]))].slice(0, 3);
  }
  if (sayfalar.length) {
    const metin = sayfalar.map((x, i) => `[${i + 1}] KAYNAK: ${x.url} (${x.resmi ? "ÜRETİCİ" : "İKİNCİ KAYNAK"})\n${x.metin}`).join("\n\n---\n\n");
    const izinli = new Set(sayfalar.map((x) => x.url));
    const sure = Math.min(150_000, bitis - Date.now() - 90_000);
    if (sure >= 30_000) {
      const kullanici = `${istem}\n\nSAYFALAR:\n${metin}`;
      const c = await claudeJson({ sistem: OKU_SISTEM, kullanici, model: GOZ_MODEL, ms: sure, maxTokens: 16_000, caba: "medium", fonk: "kunye-otomatik" })
        .catch((e) => { son += ` | Claude: ${String((e as Error).message ?? e).slice(0, 80)}`; return null; });
      if (c === null && !son) son = "Claude anahtarı yok ya da kredisi bitti";
      const v = c?.veri;
      if (v && Array.isArray(v.ozellikler)) {
        // Kaynak yalnız okunan sayfalardan biri olabilir (model adres uyduramaz)
        v.ozellikler = v.ozellikler.filter((o: { kaynak?: string }) => izinli.has(String(o?.kaynak ?? "")));
        if (v.urunSayfasi && !izinli.has(v.urunSayfasi)) v.urunSayfasi = sayfalar.find((x) => x.resmi)?.url ?? null;
        SAYFA_TESHIS += ` → ${GOZ_MODEL}`;
        alintiIsaretle(v, sayfalar);
        return { v, ham: structuredClone(v), sayfalar, kaynaklar: sayfalar.map((x) => ({ baslik: x.baslik, url: x.url })), girdi: { kullanici, sayfalar, model: GOZ_MODEL } };
      }
    }
  } else son = adaylar.length ? `Sayfalar okunamadı (${SAYFA_TESHIS})` : `Sayfa adayı yok (${SAYFA_TESHIS || "Brave anahtarı girilmemiş"})`;
  // 2) Sayfa okunamadıysa (üretici sitesi sunucumuzu engelliyor; Panasonic 403/429) Claude kendi web aramasıyla dener
  //    (5 Kasım 2026: Groq'un günlük sınırı dolunca bu ürünler her turda takılıyordu). Kaynak yalnız aramada görülen adreslerden olabilir.
  const sureA = Math.min(170_000, bitis - Date.now() - 100_000);
  if (sureA >= 60_000) {
    const c = await claudeAramali({ sistem: SISTEM, kullanici: istem, model: GOZ_MODEL, ms: sureA, maxArama: 5, fonk: "kunye-otomatik" })
      .catch((e) => { son += ` | Claude arama: ${String((e as Error).message ?? e).slice(0, 80)}`; return null; });
    const v = c ? jsonOku(c.metin) : null;
    if (c && v && Array.isArray(v.ozellikler)) {
      const gorulen = new Set(c.adresler);
      v.ozellikler = v.ozellikler.filter((o: { kaynak?: string }) => gorulen.has(String(o?.kaynak ?? "")));
      SAYFA_TESHIS += ` → sayfa okunamadı, ${GOZ_MODEL} web aramasıyla buldu`;
      const kaynaklar = [...new Set(v.ozellikler.map((o: { kaynak: string }) => o.kaynak))].slice(0, 12).map((url) => ({ baslik: "", url: url as string }));
      return { v, kaynaklar };
    }
  }
  // Groq yedeği 5 Kasım 2026'da çıkarıldı (kullanıcı: "bir şeye yaramıyor"; günlük sınırı dolup zinciri takıyordu, ikinci gözsüz ve zayıftı).
  throw new Error("Yapay zekâ yanıt vermedi (" + son + ")");
}

// Zincir (5 Kasım 2026, kullanıcı: "künye neden bu kadar ağır gidiyor"): bir ürün ~1 dk sürüyor ama tur 1-3 ürün işleyip yarım saat
// bekliyordu (yarım saatte bir zamanlayıcı). İş kaldıkça tur biter bitmez sıradakini başlatır; kalite ayarları aynı (her ürün yine kendi
// süresiyle, ikinci göz ve görsel ajanıyla). Durur: iş kalmadıysa, turda hiçbir şey işlenmediyse, kota dolduysa, 80 turda ya da gece (UTC 21-05).
async function turSuruyor(sb: ReturnType<typeof createClient>) {
  const { data } = await sb.from("tr_settings").select("value").eq("key", "son_kunye").maybeSingle();
  const v = data?.value as { bitti?: boolean; zaman?: string } | null;
  return !!v && v.bitti === false && Date.now() - Date.parse(v.zaman ?? "") < 7 * 60_000;
}
async function zincirle(r: { islenen: { durum: string }[] }, sira: number) { // iş bitince sıradaki tur boş döner, zincir orada durur
  const saat = new Date().getUTCHours();
  if (!r.islenen.length || r.islenen.some((x) => x.durum === "kota dolu") || sira >= 80 || saat >= 21 || saat < 5) return;
  await fetch("http://functions:9000/kunye-otomatik", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zincir: sira + 1 }), signal: AbortSignal.timeout(15_000) })
    .catch((e) => console.error("künye zinciri", e));
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
  // Editörün eklediği görsel: yalnız Stüdyo oturumuyla
  if (Number.isInteger(b.oneri_id) && (b.dosya || b.adres)) {
    if (!k?.user) return yanit({ error: "Stüdyo girişi gerekli" }, 401);
    const r = await elleGorsel(sb, b).catch((e) => ({ error: String((e as Error).message ?? e).slice(0, 200) }));
    return yanit(r, "error" in r ? 400 : 200);
  }
  const adet = Math.min(3, Math.max(1, Number(b.adet) || (zamanlayici ? 3 : 2)));
  // Tek seferde bir tur (5 Kasım 2026): önceki tur sürüyorsa yeni tur başlamaz (zincirin sıradaki turu hariç); aynı ürün iki kez işlenmesin
  if (!Number.isInteger(b.urun_id) && !b.zincir && await turSuruyor(sb)) return yanit(zamanlayici ? { atlandi: "önceki tur sürüyor" } : { islenen: [], kalan: 1, suruyor: true });
  if (zamanlayici) { EdgeRuntime.waitUntil(isle(sb, b, adet).then((r) => zincirle(r, Number(b.zincir) || 0), (e) => console.error("künye turu", e))); return yanit({ basladi: true }); }
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
type AlbumGorsel = { gorsel: string; url: string; sayfa: string };
const gorselTuru = (v: Uint8Array) => v[0] === 0x89 && v[1] === 0x50 ? "image/png" : v[0] === 0xff && v[1] === 0xd8 ? "image/jpeg" : String.fromCharCode(...v.slice(8, 12)) === "WEBP" ? "image/webp" : "";
/** Künye albümü (6 Kasım 2026, kullanıcı: "albümünde yaşam tarzı vs. kaliteli, öncelik kaynaktan görseller yer alabilir"): seçimin albüm
 *  adayları (yalnız üreticinin kendi görselleri, en çok 5) indirilip olduğu gibi kovaya konur; editör onayda hangilerinin gireceğini seçer. */
async function albumIsle(sb: ReturnType<typeof createClient>, s: GorselSatir, bitis: number): Promise<AlbumGorsel[]> {
  const out: AlbumGorsel[] = [];
  for (const a of (s.gorsel_aday?.albumAday ?? []).slice(0, 5)) {
    if (bitis - Date.now() < 50_000) break;
    try {
      const g = await fetch(a.url, { headers: { "User-Agent": UA, Accept: "image/*", Referer: a.sayfa }, signal: AbortSignal.timeout(20_000) });
      if (!g.ok) { await g.body?.cancel().catch(() => {}); continue; }
      const veri = new Uint8Array(await g.arrayBuffer());
      const mime = gorselTuru(veri);
      if (!mime || veri.byteLength > 6e6) continue;
      const yol = `${s.urun_id}-${s.id}-a${out.length + 1}.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
      const { error } = await sb.storage.from("kunye").upload(yol, veri, { contentType: mime, upsert: true });
      if (!error) out.push({ gorsel: `${ADRES}/storage/v1/object/public/kunye/${yol}?v=${Date.now()}`, url: a.url, sayfa: a.sayfa });
    } catch { /* sıradaki */ }
  }
  return out;
}

/** Yalnız dış ağdaki https/http adresleri (editörün yapıştırdığı görsel adresi sunucunun iç ağına istek attıramasın) */
function disAdres(u: string): URL | null {
  try {
    const x = new URL(u);
    const h = x.hostname.toLowerCase();
    if (!/^https?:$/.test(x.protocol) || !h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h)) return null;
    return x;
  } catch { return null; }
}
/** Editörün eklediği görsel (6 Kasım 2026, kullanıcı onayı: "görsel bulunamazsa sen ekle"): POST { oneri_id, dosya (base64) | adres }.
 *  Zemini gerçekten şeffaf (dekupe) PNG olduğu gibi kullanılır; değilse Cloudflare arka planı siler. Yapay zekâ denetimi yok (görseli insan
 *  seçti, sonucu ekranda görür). Görsel önerinin ilk seçeneği olur. */
async function elleGorsel(sb: ReturnType<typeof createClient>, b: { oneri_id: number; dosya?: unknown; adres?: unknown }) {
  const { data: s } = await sb.from("kunye_oneriler").select("id,urun_id,urun_adi,gorsel_aday").eq("id", b.oneri_id).maybeSingle();
  if (!s) return { error: "Öneri bulunamadı" };
  let veri: Uint8Array | null = null, kaynak = "";
  if (typeof b.dosya === "string" && b.dosya) {
    try { veri = Uint8Array.from(atob(b.dosya.replace(/^data:[^,]*,/, "")), (c) => c.charCodeAt(0)); } catch { return { error: "Dosya okunamadı" }; }
  } else if (typeof b.adres === "string" && b.adres.trim()) {
    let u = disAdres(b.adres.trim());
    if (!u) return { error: "Bu adres kullanılamıyor; görselin tam adresini (https://…) yapıştır" };
    kaynak = u.href;
    for (let adim = 0; adim < 4 && u && !veri; adim++) {
      const r: Response | null = await fetch(u, { headers: { "User-Agent": UA, Accept: "image/webp,image/png,image/jpeg,image/*;q=0.8" }, redirect: "manual", signal: AbortSignal.timeout(25_000) }).catch(() => null);
      if (r && r.status >= 300 && r.status < 400 && r.headers.get("location")) { await r.body?.cancel().catch(() => {}); u = disAdres(new URL(r.headers.get("location")!, u).href); continue; }
      if (!r?.ok) { await r?.body?.cancel().catch(() => {}); return { error: `Görsel bu adresten indirilemedi (${r?.status ?? "yanıt yok"}). Görseli bilgisayarına indirip buraya sürükle.` }; }
      if (Number(r.headers.get("content-length") ?? 0) > 15e6) { await r.body?.cancel().catch(() => {}); return { error: "Görsel 15 MB'tan büyük" }; }
      veri = new Uint8Array(await r.arrayBuffer());
    }
  }
  if (!veri) return { error: "Görsel dosyası ya da adresi gerekli" };
  if (veri.byteLength > 15e6) return { error: "Görsel 15 MB'tan büyük" };
  const mime = gorselTuru(veri);
  if (!mime) return { error: "Bu bir görsel değil (JPEG, PNG ya da WebP olmalı). Adres bir sayfanın adresiyse görselin kendi adresini yapıştır." };
  // Dekupe PNG olduğu gibi kullanılır (pngSeffaf); değilse arka planı Cloudflare siler
  const seffaf = mime === "image/png" && !!(await pngSeffaf(veri))?.seffaf;
  let webp: Uint8Array | null = seffaf ? veri : null;
  if (!webp) {
    const cf = await cfAyar(sb);
    if (!cf) return { error: "Arka plan silme programı kurulu değil (Bağlantı anahtarları → Cloudflare)" };
    const r = await fetch(cf.adres, { method: "POST", headers: { "x-anahtar": cf.anahtar, "Content-Type": mime }, body: veri, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (!r?.ok) { const h = r ? (await r.text()).slice(0, 120) : "yanıt yok"; return { error: `Arka plan silinemedi (${r?.status ?? ""} ${h})` }; }
    webp = new Uint8Array(await r.arrayBuffer());
  }
  const yol = `${s.urun_id}-${s.id}-e${Date.now().toString(36)}.${seffaf ? "png" : "webp"}`;
  const { error } = await sb.storage.from("kunye").upload(yol, webp, { contentType: seffaf ? "image/png" : "image/webp", upsert: true });
  if (error) return { error: "Yükleme: " + error.message };
  const gorsel = `${ADRES}/storage/v1/object/public/kunye/${yol}`;
  const eski = (s.gorsel_aday ?? {}) as Partial<UrunGorseli> & { secenekler?: { gorsel: string; url: string; sayfa: string; seffaf?: boolean }[] };
  const marka = String(s.urun_adi ?? "").split(" ")[0];
  await sb.from("kunye_oneriler").update({ gorsel, gorsel_durum: "hazir", gorsel_hata: null,
    gorsel_aday: { ...eski, url: kaynak, sayfa: kaynak, kaynak: "Üretici", yazar: eski.yazar || marka, lisans: eski.lisans || "Basın görseli", neden: "Editör ekledi",
      secenekler: [{ gorsel, url: kaynak, sayfa: kaynak, ...(seffaf ? { seffaf: true } : {}) }, ...(eski.secenekler ?? [])].slice(0, 4), secenek_surum: SECENEK_SURUMU } }).eq("id", s.id);
  return { gorsel, seffaf };
}
// Görsel seçenekleri (5 Kasım 2026, kullanıcı: "fotoğraf seçeneklerini bize de sunsun, onaydan geçenlerden bir tane veriyor"):
// seçilen aday ve yedekleri sırayla kesilir, denetimden geçenlerden en çok GORSEL_SECENEK tanesi saklanır (gorsel_aday.secenekler).
// İlk geçen künyenin önerilen görseli olur; editör onay ekranında başkasını seçebilir. Süre azsa ilk geçenle yetinilir.
const GORSEL_SECENEK = 3;
const SECENEK_SURUMU = 2; // 2: aynı çekimin kopyaları ayıklanır; eski sürümle hazırlanmış bekleyen öneriler yeniden kesilir
async function gorselIsle(sb: ReturnType<typeof createClient>, cf: { adres: string; anahtar: string }, s: GorselSatir, bitis = Date.now() + 150_000, mevcut?: string) {
  const yaz = (x: Record<string, unknown>) => sb.from("kunye_oneriler").update(x).eq("id", s.id);
  // Künye albümü (6 Kasım 2026): üreticinin albüm adayları olduğu gibi (kesilmeden) "kunye" kovasına konur; bir kez hazırlanır
  const album = (s.gorsel_aday as (UrunGorseli & { album?: AlbumGorsel[] }) | null)?.album ?? (s.gorsel_aday?.albumAday?.length ? await albumIsle(sb, s, bitis) : undefined);
  const albumEk = album ? { album } : {};
  if (!s.gorsel_aday?.url) { await yaz({ gorsel_durum: "yok", ...(s.gorsel_aday ? { gorsel_aday: { ...s.gorsel_aday, ...albumEk } } : {}) }); return; }
  const sira = [{ url: s.gorsel_aday.url, sayfa: s.gorsel_aday.sayfa, alfa: s.gorsel_aday.alfa }, ...(s.gorsel_aday.yedekler ?? [])];
  const secenekler: { gorsel: string; url: string; sayfa: string; seffaf?: boolean }[] = [];
  const boylar: number[] = [];
  let son = "";
  for (const a of sira) {
    if (secenekler.length >= GORSEL_SECENEK || (secenekler.length && bitis - Date.now() < 40_000)) break;
    try {
      const g = await fetch(a.url, { headers: { "User-Agent": UA, Accept: "image/*", Referer: a.sayfa }, signal: AbortSignal.timeout(30_000) });
      if (!g.ok) throw new Error(`görsel indirilemedi (${g.status})`);
      const veri = new Uint8Array(await g.arrayBuffer());
      if (veri.byteLength > 20e6) throw new Error("görsel 20 MB üstü");
      // Üreticinin dekupe (zemini gerçekten şeffaf) PNG'si hiç işlenmez (6 Kasım 2026, kullanıcı: "direkt kaynağından alsa dekupe PNG,
      // Cloudflare ile uğraşmaya gerek kalmaz"): olduğu gibi kovaya konur, kesim denetimine de girmez (kesilmedi); tuvale oturtmayı onay
      // sırasında tarayıcı yapar. Aynı dosya iki adaydan geldiyse biri kalır.
      const dekupe = a.alfa && gorselTuru(veri) === "image/png" ? await pngSeffaf(veri) : null;
      if (dekupe?.seffaf) {
        if (boylar.includes(veri.byteLength)) continue;
        const yol = secenekler.length ? `${s.urun_id}-${s.id}-${secenekler.length + 1}.png` : `${s.urun_id}-${s.id}.png`;
        const { error } = await sb.storage.from("kunye").upload(yol, veri, { contentType: "image/png", upsert: true });
        if (error) throw new Error("yükleme: " + error.message);
        secenekler.push({ gorsel: `${ADRES}/storage/v1/object/public/kunye/${yol}?v=${Date.now()}`, url: a.url, sayfa: a.sayfa, seffaf: true });
        boylar.push(veri.byteLength);
        continue;
      }
      const r = await fetch(cf.adres, { method: "POST", headers: { "x-anahtar": cf.anahtar, "Content-Type": g.headers.get("content-type") || "image/jpeg" }, body: veri, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) {
        const h = `Cloudflare ${r.status}: ${(await r.text()).slice(0, 140)}`;
        if (r.status === 401 || r.status === 500) { await sb.from("baglanti_anahtarlari").update({ ek: { hata: h } }).eq("ad", "cloudflare_adres"); son = h; break; }
        throw new Error(h);
      }
      const webp = new Uint8Array(await r.arrayBuffer());
      // Aynı fotoğrafın başka boyutu seçenek olmasın (5 Kasım 2026, kullanıcı: "3 seçenek neden birbiriyle aynı"): kesilen görseller aynı
      // tuvale oturduğu için aynı çekimin çıktıları neredeyse aynı büyüklükte olur; %4'ten yakınsa tekrar sayılır, denetime bile gitmez
      if (boylar.some((n) => Math.abs(n - webp.byteLength) / n < 0.04)) continue;
      const d = await kesimDenetle(webp, s.urun_adi ?? "");
      if (!d.gecti) { son = "Kesim denetimden geçmedi: " + d.sorun; continue; }
      const yol = secenekler.length ? `${s.urun_id}-${s.id}-${secenekler.length + 1}.webp` : `${s.urun_id}-${s.id}.webp`;
      const { error } = await sb.storage.from("kunye").upload(yol, webp, { contentType: "image/webp", upsert: true });
      if (error) throw new Error("yükleme: " + error.message);
      secenekler.push({ gorsel: `${ADRES}/storage/v1/object/public/kunye/${yol}?v=${Date.now()}`, url: a.url, sayfa: a.sayfa });
      boylar.push(webp.byteLength);
      await sb.from("baglanti_anahtarlari").update({ ek: { son_islem: new Date().toISOString(), hata: "" } }).eq("ad", "cloudflare_adres");
    } catch (e) { son = String((e as Error).message); }
  }
  // Var olan hazır görsele seçenek eklenirken hiçbiri geçmediyse eldeki görsel korunur
  if (!secenekler.length && mevcut) { await yaz({ gorsel_aday: { ...s.gorsel_aday, ...albumEk, secenekler: [{ gorsel: mevcut, url: s.gorsel_aday.url, sayfa: s.gorsel_aday.sayfa }], secenek_surum: SECENEK_SURUMU } }); return; }
  if (!secenekler.length) { await yaz({ gorsel_durum: "hata", gorsel_hata: son.slice(0, 200), gorsel_aday: { ...s.gorsel_aday, ...albumEk } }); return; }
  const ilk = secenekler[0];
  await yaz({ gorsel: ilk.gorsel, gorsel_durum: "hazir", gorsel_hata: null,
    gorsel_aday: { ...s.gorsel_aday, ...albumEk, url: ilk.url, sayfa: ilk.sayfa, secenekler, secenek_surum: SECENEK_SURUMU,
      ...(ilk.url !== s.gorsel_aday.url ? { neden: "Sıradaki aday (ilk seçimin kesimi denetimden geçmedi)" } : {}) } });
}

// Yalnız yapay zekâ kotası (5 Kasım 2026: üretici sitesinin "429 çok fazla istek" yanıtı da kota sanılıyordu; ürün işaretlenmediği için
// her tur aynı ürüne takılıyor, zincir de duruyordu). Sayfa okuma durumları ("shop.panasonic.com 429") sayılmaz.
// 6 Kasım 2026: künye yalnız Claude ile çalışır; kredisi biterse ya da anahtarı yoksa tur durur, ürün "hata" diye işaretlenmez.
const kotaDolu = (m: string) => /Claude kredisi bitti|Claude anahtarı yok/i.test(m);
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

// Boyut biçimi (5 Kasım 2026): model sırayı karıştırabiliyor (S25 Ultra yükseklik önce, iPhone 17 genişlik önce geldi).
// Telefonda genişlik yükseklikten küçüktür: ilk iki sayı ters geldiyse yer değiştirir. Lenste iki sayı varsa çap işareti eklenir.
function boyutDuzelt(tur: string, deger: string) {
  if (tur === "phone") return deger.replace(/(\d+(?:,\d+)?)\s*×\s*(\d+(?:,\d+)?)(\s*×\s*\d+(?:,\d+)?)/g, (t, a: string, b: string, c: string) =>
    Number(a.replace(",", ".")) > Number(b.replace(",", ".")) ? `${b} × ${a}${c}` : t);
  if (tur === "lens" && !deger.includes("Ø") && /^\d+(?:,\d+)?\s*×\s*\d+(?:,\d+)?\s*mm/.test(deger)) return "Ø " + deger;
  return deger;
}

// Görselsiz kalan yeni öneriler (5 Kasım 2026): görsel kuralları değişince (ör. telefonun önü+arkası artık geçer) bir kez daha aranır.
// Yeni ürünler önce gelir; tur bittikten sonra süre kaldıysa tek öneri. Denenen öneri GORSEL_SURUMU ile işaretlenir, aynı sürümle tekrar denenmez.
const GORSEL_SURUMU = "2026-11-06a"; // 6 Kasım: tek seçim (üretici + bayi birlikte) ve albüm; görselsiz bekleyenler bir kez daha aranır
async function gorselTekrar(sb: ReturnType<typeof createClient>, cf: { adres: string; anahtar: string }, surum: string, t0: number) {
  const bitis = t0 + 370_000;
  if (bitis - Date.now() < 200_000) return null;
  const { data } = await sb.from("kunye_oneriler").select("id,urun_id,urun_adi,resmi_ad,kaynaklar,gorsel_aday").eq("durum", "bekliyor").in("gorsel_durum", ["yok", "hata"]).gte("created_at", surum).order("id").limit(50);
  const s = (data ?? []).find((x) => (x.gorsel_aday as { surum?: string } | null)?.surum !== GORSEL_SURUMU);
  if (!s) {
    // Görseli hazır ama seçenekleri olmayan (5 Kasım 2026 öncesi) bekleyen öneriler: aday ve yedekleri yeniden kesilir, seçenekler eklenir
    const { data: h } = await sb.from("kunye_oneriler").select("id,urun_id,urun_adi,gorsel,gorsel_aday").eq("durum", "bekliyor").eq("gorsel_durum", "hazir").gte("created_at", surum).order("id").limit(50);
    const x = (h ?? []).find((y) => (y.gorsel_aday as { secenek_surum?: number } | null)?.secenek_surum !== SECENEK_SURUMU);
    if (!x) return null;
    await gorselIsle(sb, cf, x as GorselSatir, bitis, String(x.gorsel ?? ""));
    return { urun: String(x.urun_adi ?? ""), durum: "görsel seçenekleri" };
  }
  const r = await fetch(`${PANEL}/api/products/${s.urun_id}?depth=0`, { signal: AbortSignal.timeout(20_000) });
  const u: Urun | null = r.ok ? await r.json() : null;
  if (!u) return null;
  const ad = s.resmi_ad || u.name;
  const sayfalar: { url: string; html: string }[] = [];
  for (const adr of [...new Set(((s.kaynaklar ?? []) as { url?: string }[]).map((k) => k.url).filter((x): x is string => typeof x === "string" && ureticiAlani(x, u.brand)))].slice(0, 2)) {
    const h = await fetch(adr, { headers: { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" }, signal: AbortSignal.timeout(15_000) }).then((x) => (x.ok ? x.text() : "")).catch(() => "");
    if (h) sayfalar.push({ url: adr, html: h.slice(0, 2_000_000) });
  }
  const iz: string[] = [];
  const g = await urunGorseliBul(sb, { marka: u.brand, ad, tur: u.type, sayfalar, braveSinir: BRAVE_AY_SINIR, bitis }, iz).catch((e) => { iz.push("görsel hata: " + String(e).slice(0, 60)); return null; });
  const yaz = (x: Record<string, unknown>) => sb.from("kunye_oneriler").update(x).eq("id", s.id);
  if (!g?.url) {
    await yaz({ gorsel_aday: { ...(g ?? {}), surum: GORSEL_SURUMU }, gorsel_durum: "yok", gorsel_hata: ("2. deneme: " + iz.join(" · ")).slice(0, 200) });
    if (g?.albumAday?.length) await gorselIsle(sb, cf, { id: s.id as number, urun_id: s.urun_id as number, urun_adi: `${u.brand} ${ad}`, gorsel_aday: { ...g, surum: GORSEL_SURUMU } as UrunGorseli }, bitis);
    return { urun: `${u.brand} ${ad}`, durum: "görsel yine yok" };
  }
  const aday = { ...g, surum: GORSEL_SURUMU };
  await yaz({ gorsel_aday: aday, gorsel_durum: "isleniyor", gorsel_hata: null });
  if (bitis - Date.now() > 45_000) await gorselIsle(sb, cf, { id: s.id as number, urun_id: s.urun_id as number, urun_adi: `${u.brand} ${ad}`, gorsel_aday: aday }, bitis);
  return { urun: `${u.brand} ${ad}`, durum: "görsel yeniden arandı" };
}

async function isle(sb: ReturnType<typeof createClient>, b: { urun_id?: unknown }, adet: number) {
  const t0 = Date.now();
  // Önce bekleyen görseller (program sonradan kurulduysa ya da önceki tur yarım kaldıysa)
  const cf = await cfAyar(sb).catch(() => null);
  if (cf) {
    const { data: bekleyen } = await sb.from("kunye_oneriler").select("id,urun_id,urun_adi,gorsel_aday").eq("gorsel_durum", "isleniyor").order("id").limit(3);
    for (const x of bekleyen ?? []) { if (Date.now() - t0 > 90_000) break; await gorselIsle(sb, cf, x as GorselSatir, t0 + 120_000); }
  }
  const surum = await surumZamani(sb);
  // Aday ürünler: tek ürün istendiyse o; yoksa çıkmış, değerlerinin yarısından azı dolu ve bu yöntemle bekleyen önerisi olmayanlar
  let urunler: Urun[] = [];
  if (Number.isInteger(b.urun_id)) {
    const r = await fetch(`${PANEL}/api/products/${b.urun_id}?depth=0`, { signal: AbortSignal.timeout(20_000) }); if (r.ok) urunler = [await r.json()];
    const u = urunler[0];
    if (u && !CIKMIS.has(u.status ?? "satista")) return { islenen: [{ urun: `${u.brand} ${u.name}`, durum: "henüz çıkmadı" }], kalan: 0 };
  } else {
    // Panel takılırsa tur asılı kalmasın (5 Kasım 2026 kesintisi); bir kez daha denenir (zincirin bir turu panel o an yavaş olduğu için düştü)
    const listeAl = () => fetch(`${PANEL}/api/products?limit=500&depth=0&sort=updatedAt&select[name]=true&select[brand]=true&select[type]=true&select[status]=true&select[specs]=true`, { signal: AbortSignal.timeout(30_000) });
    const r = await listeAl().catch(() => listeAl());
    const tum: Urun[] = r.ok ? (await r.json()).docs : [];
    const cikmamis = tum.filter((u) => !CIKMIS.has(u.status ?? "satista")).map((u) => u.id);
    if (cikmamis.length) await sb.from("kunye_oneriler").update({ durum: "hata", hata: "Ürün henüz çıkmadı; çıkınca künye yeniden çıkarılır" }).eq("durum", "bekliyor").in("urun_id", cikmamis);
    const { data: bekleyen } = await sb.from("kunye_oneriler").select("urun_id").eq("durum", "bekliyor").gte("created_at", surum);
    const yedi = new Date(Math.max(Date.now() - 7 * 864e5, Date.parse(surum))).toISOString();
    const { data: denenen } = await sb.from("kunye_oneriler").select("urun_id").gte("created_at", yedi);
    // Editörün reddettiği ürün kendiliğinden yeniden denenmez (6 Kasım 2026, kullanıcı onayı: 7 gün sonra baştan deneyip aynı parayı
    // harcıyordu); yalnız ürün tek tek istenince (urun_id) ya da yöntem sürümü değişince yeniden çıkarılır
    const { data: red } = await sb.from("kunye_oneriler").select("urun_id").eq("durum", "reddedildi").gte("created_at", surum);
    const atla = new Set([...(bekleyen ?? []), ...(denenen ?? []), ...(red ?? [])].map((x) => x.urun_id));
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
        .map((o: { key: string; value: string; num?: unknown; kaynak?: string; kanit?: string; islem?: string; not?: string; alinti?: boolean }) => ({ key: o.key, value: (o.key === "Boyutlar" ? boyutDuzelt(u.type, String(o.value)) : String(o.value)).slice(0, 120), num: typeof o.num === "number" && isFinite(o.num) ? o.num : null, kaynak: /^https?:\/\//.test(String(o.kaynak ?? "")) ? String(o.kaynak).slice(0, 400) : null, kanit: String(o.kanit ?? "").slice(0, 160),
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
      const gorsel = bitis - Date.now() < 100_000 ? (gIz.push("görsel: süre yetmedi"), null) : await urunGorseliBul(sb, { marka: u.brand, ad: resmiAd || u.name, tur: u.type, sayfalar: uSayfa, braveSinir: BRAVE_AY_SINIR, bitis }, gIz).catch((e) => { gIz.push("görsel hata: " + String(e).slice(0, 60)); return null; });
      const kayit = { urun_id: u.id, urun_adi: `${u.brand} ${u.name}`, tur: u.type, ozellikler: oz, kaynaklar: [...kaynaklar, ...(Array.isArray(v?.silinen) && v.silinen.length ? [{ baslik: "İkinci gözün sildikleri", url: "", silinen: v.silinen }] : [])], durum: oz.length || resmiAd ? "bekliyor" : "hata", hata: oz.length || resmiAd ? null : "Kaynaklarda değer bulunamadı" };
      // Görsel sütunları göç 0043 ile geldi; uygulanmamışsa kayıt görselsiz yazılır
      const { data: yeni, error } = await sb.from("kunye_oneriler").insert({ ...kayit, ...(resmiAd ? { resmi_ad: resmiAd } : {}), gorsel_aday: gorsel, gorsel_durum: gorsel?.url ? "isleniyor" : "yok", ...(gorsel?.url ? {} : { gorsel_hata: gIz.join(" · ").slice(0, 200) || null }) }).select("id").single();
      if (error) await sb.from("kunye_oneriler").insert(kayit);
      // Yeni öneri hazırsa aynı ürünün eski yöntemle bekleyen önerisi kalkar
      if (yeni && kayit.durum === "bekliyor") await sb.from("kunye_oneriler").update({ durum: "hata", hata: "Yerine yeni öneri geldi (5 Kasım yöntemi)" }).eq("urun_id", u.id).eq("durum", "bekliyor").lt("created_at", surum);
      // Künye kıyası (göç 0065): arka planda, öneriyi bekletmez; asıl modelin (Claude Sonnet) çıkardığı da aynı ölçüyle yazılır
      if (yeni && girdi && Math.random() * 100 < kiyasOran) {
        // @ts-ignore EdgeRuntime Supabase ortamında tanımlı
        EdgeRuntime.waitUntil(kunyeKiyas(sb, String(yeni.id), girdi, adlar, ham ?? v).catch((e) => console.error("künye kıyası", e)));
      }
      if (gorsel && cf && yeni && bitis - Date.now() > 45_000) await gorselIsle(sb, cf, { id: yeni.id as number, urun_id: u.id, urun_adi: `${u.brand} ${resmiAd || u.name}`, gorsel_aday: gorsel }, bitis);
      sonuc.push({ urun: `${u.brand} ${u.name}`, durum: oz.length ? "öneri hazır" : "bulunamadı", sayi: oz.length, hata: [SAYFA_TESHIS, ...gIz].filter(Boolean).join(" · ") }); await kaydet(false);
    } catch (e) {
      // Kota dolduysa ürün işaretlenmez (yoksa 7 gün atlanırdı); kalanlar bir sonraki turda
      if (kotaDolu(String((e as Error).message))) { sonuc.push({ urun: `${u.brand} ${u.name}`, durum: "kota dolu", hata: String((e as Error).message).slice(0, 600) }); break; }
      await sb.from("kunye_oneriler").insert({ urun_id: u.id, urun_adi: `${u.brand} ${u.name}`, tur: u.type, durum: "hata", hata: String((e as Error).message).slice(0, 300) });
      sonuc.push({ urun: `${u.brand} ${u.name}`, durum: "hata", hata: String((e as Error).message).slice(0, 200) }); await kaydet(false);
    }
  }
  if (!Number.isInteger(b.urun_id) && cf && Date.now() - t0 < ISLE_BUTCE_MS) {
    const t = await gorselTekrar(sb, cf, surum, t0).catch((e) => ({ urun: "görsel tekrarı", durum: "hata", hata: String(e).slice(0, 120) }));
    if (t) sonuc.push(t);
  }
  await kaydet(true);
  return { islenen: sonuc, kalan };
}
