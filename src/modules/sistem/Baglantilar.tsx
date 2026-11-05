// Bağlantı anahtarları (27 Ekim 2026, yalnız yöneticiler): dış servis anahtarları burada girilir, sunucuda saklanır.
// Girilen değer bir daha ekrana gelmez (veritabanında okuma izni yok; yalnız sunucu fonksiyonları okur). Göç 0040.
// - Google (Gemini) anahtarları: 30 Ekim 2026'dan beri birden çok anahtarlı havuz (GeminiHavuzu.tsx, göç 0052).
// - Instagram erişim anahtarı: instagram-reels fonksiyonu son Reels'leri çeker, anahtarı 60 günü dolmadan kendisi yeniler.
// - Claude (Anthropic API) anahtarı (göç 0061, 2 Kasım 2026): otomatik taslakta görsel seçimi; yoksa Gemini kullanılır.
// - OpenAI (GPT Image) ve Google görsel (Nano Banana) anahtarları (göç 0062, 3 Kasım 2026): görsel model kıyası.
// - Cloudflare görsel programı (adres + ortak anahtar, göç 0044): künye görsellerinin arka planını siler (public/cloudflare/gorsel-worker.js).
import { useCallback, useEffect, useState } from "react";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import GeminiHavuzu from "./GeminiHavuzu";
import { Logo } from "../../shared/Logolar";
import "./baglantilar.css";

type Durum = { ad: string; son4: string; ek: Record<string, string>; updated_at: string };
const tarih = (s?: string) => (s ? new Date(s).toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

const ANAHTARLAR: { ad: string; baslik: string; ikon: string; aciklama: string; adimlar: { metin: string; link?: string }[] }[] = [
  {
    ad: "instagram", baslik: "Instagram erişim anahtarı (@updated.tr)", ikon: "kamera",
    aciklama: "Sitedeki \"Son videolar\" sütunu bu anahtarla Instagram'daki son Reels'leri çeker. Anahtar yalnız okuma izni taşır, hesaptan paylaşım yapamaz. Süresi 60 gün; sistem dolmadan kendisi yeniler.",
    adimlar: [
      { metin: "Bilgisayardan Meta geliştirici sayfasını aç, UPDATED uygulamasına tıkla", link: "https://developers.facebook.com/apps" },
      { metin: "Sol menüde \"Use cases\" (Kullanım alanları) → \"Instagram API\" satırında \"Customize\" (Özelleştir)" },
      { metin: "\"API setup with Instagram login\" sekmesi. Üstteki App ID ve App Secret kutularına dokunma, onlar gerekmiyor" },
      { metin: "\"1. Generate access tokens\" bölümünde \"Add account\" → @updated.tr kullanıcı adı ve şifresiyle gir, izinleri onayla" },
      { metin: "Listede updated.tr satırının yanındaki \"Generate token\" düğmesine bas, açılan pencerede yeniden gir" },
      { metin: "Çıkan uzun metin IG ile başlar. \"I understand\" kutusunu işaretle → \"Copy\" → aşağıya yapıştır → Kaydet" },
      { metin: "\"Add account\" hata verirse: Instagram'da Ayarlar → Hesap türü ve araçlar → Profesyonel hesaba geç; ya da Meta'da App roles → Roles → \"Instagram Tester\" olarak updated.tr'yi ekle, Instagram'da Ayarlar → Uygulamalar ve web siteleri → Test kullanıcısı davetleri'nden kabul et" },
    ],
  },
  {
    ad: "cloudflare_adres", baslik: "Cloudflare görsel programı: adres", ikon: "foto",
    aciklama: "Künye görsellerinin arka planını Cloudflare siler; ürün hep aynı zeminde, aynı boyda durur. Ücretsiz: ayda 5.000 görsele kadar, aşılırsa ücret çıkmaz. Sunucumuzu yormaz.",
    adimlar: [
      { metin: "Cloudflare'e kendi hesabınla gir", link: "https://dash.cloudflare.com" },
      { metin: "Sol menüde \"Compute (Workers)\" → \"Workers & Pages\" → \"Create\" (Oluştur) → \"Start with Hello World!\" → ad: updated-gorsel → \"Deploy\"" },
      { metin: "Açılan sayfada \"Edit code\" (Kodu düzenle). Soldaki kodun tamamını sil. Aşağıdaki bağlantıdaki kodu aç, tümünü seç (Ctrl+A / Cmd+A), kopyala, oraya yapıştır → sağ üstte \"Deploy\"", link: "/cloudflare/gorsel-worker.js" },
      { metin: "Programın sayfasına dön → \"Settings\" (Ayarlar) → \"Bindings\" → \"Add binding\" → \"Images\" → Variable name: IMAGES → \"Add Binding\"" },
      { metin: "Aynı yerde bir kez daha \"Add binding\" → \"Workers AI\" → Variable name: AI → \"Add Binding\". Görsel bulunamayan haberler için yapay zekâ görseli bununla üretilir (2 Kasım 2026)" },
      { metin: "Yine \"Settings\" → \"Variables and Secrets\" bölümünde \"+ Add\" (ya da \"Add variable\"). Açılan satırda Type (tür) kutusunu \"Secret\" yap (bazı ekranlarda \"Encrypt\" kutusunu işaretle). Variable name: ANAHTAR (büyük harf). Value: en az 32 karakterlik rastgele bir şifre; şifre yöneticin yoksa aşağıdaki \"Şifre üret\" düğmesi üretir. Sonra sağ altta ya da sağ üstte \"Deploy\" (bazı ekranlarda \"Save and deploy\"); basmazsan şifre kaydolmaz" },
      { metin: "\"Settings\" → \"Domains & Routes\" altında \"workers.dev\" satırı var; \"Disabled\" yazıyorsa \"Enable\" de. Yanındaki adres updated-gorsel.XXXX.workers.dev biçimindedir (başında https:// yazmaz, normal). Adresi olduğu gibi kopyala, bu kutuya yapıştır → Kaydet; https:// kısmını biz ekleriz" },
    ],
  },
  {
    ad: "brave_arama", baslik: "Brave arama anahtarı (künye otomasyonu)", ikon: "ara",
    aciklama: "Künye otomasyonu ürünün resmî özellik sayfasını bununla bulur; sayfayı sistem okur, değerleri ücretsiz Gemini çıkarır. Google'ın ücretsiz Gemini'si internette arama yapamadığı için gerekli. Ürün başına bir arama yapılır.",
    adimlar: [
      { metin: "Brave Search API sayfasını aç, Google hesabınla ya da e-postayla kaydol", link: "https://api-dashboard.search.brave.com" },
      { metin: "\"Subscriptions\" (Abonelikler) bölümünde ücretsiz planı seç. Planlar zaman zaman değişiyor: seçmeden önce ayda kaç aramanın ücretsiz olduğunu ve kart istenip istenmediğini sayfada kontrol et" },
      { metin: "\"API Keys\" → \"Add API key\" → ad: updated-kunye → oluştur" },
      { metin: "Çıkan anahtarı kopyala (BSA ile başlar), aşağıya yapıştır → Kaydet" },
    ],
  },
  {
    ad: "claude", baslik: "Claude anahtarı (otomatik taslak)", ikon: "sohbet",
    aciklama: "Otomatik taslağı Claude Sonnet yazar, Claude Opus kaynaklara karşı denetler; görsel seçimi ve üretilen görselin denetimi de Claude'da. Anahtar yoksa ya da kredi biterse sistem kendiliğinden Gemini'ye döner. Ücret Anthropic hesabındaki krediden düşer.",
    adimlar: [
      { metin: "Kredisi olan hesapla Anthropic Console'a gir ve sol menüde \"Billing\" bölümünde kredinin göründüğünü kontrol et", link: "https://console.anthropic.com/settings/billing" },
      { metin: "\"API keys\" → \"Create key\" → ad: updated-studyo → oluştur", link: "https://console.anthropic.com/settings/keys" },
      { metin: "Çıkan anahtarı kopyala (sk-ant- ile başlar), aşağıya yapıştır → Kaydet. Anahtarı sohbete yapıştırma" },
    ],
  },
  {
    ad: "openai", baslik: "OpenAI anahtarı (GPT Image, görsel kıyası)", ikon: "foto",
    aciklama: "Uygun fotoğraf bulunamayan haberlerde görseli GPT Image da üretir; kıyas tablosunda diğer modellerle yan yana değerlendirilir. Görsel başına yaklaşık 4 sent; ücret OpenAI hesabından düşer.",
    adimlar: [
      { metin: "OpenAI geliştirici sayfasına gir; \"Billing\" bölümünde ödeme yöntemi ekle ve küçük bir bakiye yükle (ör. 10 $). İstersen aylık harcama sınırı koy", link: "https://platform.openai.com/settings/organization/billing/overview" },
      { metin: "\"API keys\" → \"Create new secret key\" → ad: updated-studyo → Create", link: "https://platform.openai.com/api-keys" },
      { metin: "Çıkan anahtarı kopyala (sk- ile başlar), aşağıya yapıştır → Kaydet. Anahtarı sohbete yapıştırma" },
    ],
  },
  {
    ad: "bfl", baslik: "Black Forest Labs anahtarı (FLUX 3, görsel kıyası)", ikon: "foto",
    aciklama: "FLUX 3 Image ve FLUX 3 Image Klein yalnız FLUX'u yapan şirketin kendi servisinde var (Cloudflare'de yok). Kıyasta diğer modellerle yan yana görsel üretir. Görsel başı Klein ~1 sent, Image ~5 sent; ücret BFL kredisinden düşer.",
    adimlar: [
      { metin: "BFL hesabı aç ve e-postanı doğrula", link: "https://dashboard.bfl.ai" },
      { metin: "Sol menüde API → Credits → Add Credits → 10 $ yükle (1 kredi = 1 sent)", link: "https://dashboard.bfl.ai" },
      { metin: "API → Keys → Add Key → ad: updated-studyo → anahtar bir kez gösterilir, hemen kopyala" },
      { metin: "Anahtarı aşağıya yapıştır → Kaydet. Anahtarı sohbete yapıştırma" },
    ],
  },
  {
    ad: "gemini_gorsel", baslik: "Google görsel anahtarı (Nano Banana, görsel kıyası)", ikon: "foto",
    aciklama: "Nano Banana görsel üretimi ücretsiz Gemini kotasında yok; faturalandırması açık AYRI bir Google projesinden anahtar gerekir (yazı işlerinde kullandığımız ücretsiz anahtarlar ücretsiz kalsın diye). Görsel başına yaklaşık 4 sent.",
    adimlar: [
      { metin: "Google AI Studio'da anahtar sayfasını aç → \"Create API key\" → \"Create API key in new project\"", link: "https://aistudio.google.com/apikey" },
      { metin: "Yeni anahtarın satırında \"Set up billing\" (Faturalandırmayı ayarla) → kartını ekle. Google Cloud'da Bütçe ve uyarılar bölümünden aylık sınır koyabilirsin" },
      { metin: "Anahtarı kopyala, aşağıya yapıştır → Kaydet. Ücretsiz Gemini anahtarlarını buraya girme" },
    ],
  },
  {
    ad: "amazon_kimlik", baslik: "Amazon: kimlik (Credential ID)", ikon: "site",
    aciklama: "Amazon Ortaklık Programı'nın Creators API kimliği. Ürün sayfasında Amazon Türkiye fiyatı ve ortaklık bağlantısı bununla gelir.",
    adimlar: [
      { metin: "Amazon Ortaklık hesabına (Associates Central, Türkiye mağazası) gir; menüde Creators API bölümünü aç" },
      { metin: "\"Create Application\" (Uygulama oluştur) → ad: updated-site. Amazon belgeleri", link: "https://affiliate-program.amazon.com/creatorsapi/docs/en-us/get-started/using-curl" },
      { metin: "\"Add New Credential\" (Yeni kimlik ekle). Çıkan Credential ID, Credential Secret ve Version değerlerini not al; Secret yalnız bir kez gösterilir" },
      { metin: "Credential ID'yi aşağıya yapıştır → Kaydet. Anahtarı sohbete yapıştırma" },
    ],
  },
  { ad: "amazon_gizli", baslik: "Amazon: gizli anahtar (Credential Secret)", ikon: "yonetim", aciklama: "", adimlar: [{ metin: "Aynı ekrandaki Credential Secret'ı yapıştır → Kaydet" }] },
  { ad: "amazon_surum", baslik: "Amazon: kimlik sürümü (Version)", ikon: "yonetim", aciklama: "", adimlar: [{ metin: "Boş bırakılabilir: kimlik amzn1.application-oa2-client ile başlıyorsa 3.2, değilse 2.2 kullanılır. Amazon başka bir sürüm yazıyorsa onu gir → Kaydet" }] },
  { ad: "amazon_etiket", baslik: "Amazon: ortaklık etiketi (Partner Tag)", ikon: "yonetim", aciklama: "", adimlar: [{ metin: "Ortaklık hesabının sağ üstündeki izleme kimliği (ör. updated-21) → Kaydet" }] },
  {
    ad: "cloudflare_anahtar", baslik: "Cloudflare görsel programı: anahtar", ikon: "yonetim",
    aciklama: "Programa yalnız bizim sistemimizin erişebilmesi için ortak şifre. Cloudflare'de ANAHTAR adıyla girdiğin şifrenin aynısı.",
    adimlar: [{ metin: "Yukarıdaki 5. adımda oluşturduğun şifreyi buraya yapıştır → Kaydet" }],
  },
];

// Sık karışan değerler kaydetmeden yakalanır: Meta'nın "Uygulama gizli anahtarı" (App Secret) 32 karakterlik 0-9/a-f metnidir,
// Uygulama Kimliği yalnız rakamdır; Instagram erişim anahtarı "IG" ile başlar ve çok daha uzundur. Gemini anahtarı çoğunlukla "AIza" ile başlar ama Google yeni biçimler de veriyor (30 Ekim 2026).
function bicimHatasi(ad: string, v: string): string {
  if (ad === "instagram") {
    if (/^[0-9a-f]{32}$/i.test(v)) return "Bu, uygulamanın gizli anahtarı (App Secret) gibi görünüyor; o gerekmiyor. \"Generate token\" ile çıkan, IG ile başlayan uzun anahtarı yapıştır.";
    if (/^\d+$/.test(v)) return "Bu, uygulama ya da hesap kimliği (ID) gibi görünüyor. \"Generate token\" ile çıkan, IG ile başlayan uzun anahtarı yapıştır.";
    if (!/^(IG|EAA)/.test(v) || v.length < 100) return "Bu Instagram erişim anahtarına benzemiyor: anahtar IG ile başlar ve çok uzundur. \"Generate token\" ile çıkanı eksiksiz kopyala.";
  }
  if (ad === "gemini_yedek" && (/^gen-lang-client/i.test(v) || /^https?:/i.test(v) || /\s/.test(v) || !/^[A-Za-z0-9._-]{30,200}$/.test(v))) return "Bu Google (Gemini) anahtarına benzemiyor. AI Studio'da anahtarın satırındaki kopyala simgesine bas; proje adını (gen-lang-client…) değil anahtarı yapıştır.";
  if (ad === "cloudflare_adres" && !/^https:\/\/[A-Za-z0-9.-]+\/?$/.test(v)) return "Programın adresi https:// ile başlamalı (ör. https://updated-gorsel.ad.workers.dev).";
  if (ad === "claude" && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v)) return "Bu Claude anahtarına benzemiyor: anahtar sk-ant- ile başlar. Console'da \"Create key\" sonrası çıkan anahtarın tamamını kopyala.";
  if (ad === "openai" && !/^sk-[A-Za-z0-9_-]{20,}$/.test(v)) return "Bu OpenAI anahtarına benzemiyor: anahtar sk- ile başlar.";
  if (ad === "gemini_gorsel" && !/^[A-Za-z0-9._-]{30,200}$/.test(v)) return "Bu Google anahtarına benzemiyor. AI Studio'da anahtarın satırındaki kopyala simgesine bas.";
  if (ad === "cloudflare_anahtar" && v.length < 24) return "Anahtar en az 24 karakter olmalı.";
  if (ad === "amazon_etiket" && !/^[A-Za-z0-9_-]{3,64}$/.test(v)) return "Ortaklık etiketi yalnız harf, rakam ve tire içerir (ör. updated-21).";
  if (ad === "amazon_surum" && !/^[23]\.[123]$/.test(v)) return "Sürüm 3.1, 3.2, 3.3 ya da 2.1-2.3 olmalı; Türkiye için genelde 3.2.";
  if ((ad === "amazon_kimlik" || ad === "amazon_gizli") && (v.length < 20 || /\s/.test(v))) return "Bu Amazon kimlik bilgisine benzemiyor; Associates Central'daki değeri eksiksiz kopyala.";
  return "";
}

// Ekran (3 Kasım 2026, onaylı taslak claude.ai/artifact/4Y2vWyaML1ksnfQ7b6Psss; kullanıcı: "logo ekle, arayüzü daha anlaşılır yap"):
// üstte durum özeti; servisler işe göre üç grupta; her servis tek satır (logo, ne yaptığı, durum, son 4, tek eylem), tıklayınca açılır:
// solda adımlar ve anahtar kutusu, sağda ne için / ücret / olmazsa.
type Servis = {
  id: string; grup: "yazi" | "gorsel" | "site"; logo: string; ad: string; ne: string; anahtarlar: string[];
  neIcin: string; ucret: string; olmazsa: string; eylem?: "claude" | "cloudflare" | "instagram" | "gemini" | "brave" | "amazon";
};
const GRUPLAR: { id: Servis["grup"]; ad: string; ne: string }[] = [
  { id: "yazi", ad: "Yazı ve denetim", ne: "Taslağı yazar, kaynaklara karşı denetler. Biri yoksa diğeri devralır." },
  { id: "gorsel", ad: "Görsel", ne: "Fotoğraf bulunamayan haberde görsel üretir; modeller kıyaslanır. Künye görsellerinin arka planını siler." },
  { id: "site", ad: "Site ve veri", ne: "Sitedeki Reels, künye otomasyonu ve Amazon fiyatları." },
];
const SERVISLER: Servis[] = [
  { id: "claude", grup: "yazi", logo: "claude", ad: "Claude", ne: "Taslağı yazar (Sonnet), denetler (Opus)", anahtarlar: ["claude"], eylem: "claude",
    neIcin: "Otomatik taslağı yazar ve kaynaklara karşı denetler; öne çıkan görseli seçer, üretilen görseli denetler.", ucret: "Anthropic hesabındaki krediden düşer.", olmazsa: "Sistem kendiliğinden Gemini ile devam eder." },
  { id: "gemini", grup: "yazi", logo: "gemini", ad: "Google Gemini havuzu", ne: "Yedek yazar, haber eleme; ücretsiz", anahtarlar: [], eylem: "gemini",
    neIcin: "Haber toplama ve eleme, künye, radar, sesli özet; Claude yoksa taslak yazımı.", ucret: "Ücretsiz kota; birden çok Google hesabının anahtarı sırayla kullanılır.", olmazsa: "Haber Masası ve künye otomasyonu durur." },
  { id: "cloudflare", grup: "gorsel", logo: "cloudflare", ad: "Cloudflare görsel programı", ne: "Arka plan siler; FLUX.2 ve Lucid ile görsel üretir", anahtarlar: ["cloudflare_adres", "cloudflare_anahtar"], eylem: "cloudflare",
    neIcin: "Künye görsellerinin arka planını siler; fotoğrafı bulunamayan haberde görsel üretir.", ucret: "Ücretsiz: ayda 5.000 arka plan silme, günde yaklaşık 7 görsel üretimi. Aşılırsa ücret çıkmaz, istek reddedilir.", olmazsa: "Künye görseli olduğu gibi kalır; yapay zekâ görseli üretilmez." },
  { id: "openai", grup: "gorsel", logo: "openai", ad: "OpenAI · GPT Image", ne: "Kıyasta görsel üretir", anahtarlar: ["openai"],
    neIcin: "Görsel model kıyası: fotoğrafı bulunamayan haberde GPT Image da görsel üretir.", ucret: "Görsel başına yaklaşık 4 sent, OpenAI bakiyesinden.", olmazsa: "Kıyas diğer modellerle sürer." },
  { id: "banana", grup: "gorsel", logo: "gemini", ad: "Google görsel · Nano Banana", ne: "Kıyasta görsel üretir; ücretli proje", anahtarlar: ["gemini_gorsel"],
    neIcin: "Görsel model kıyası: Nano Banana da görsel üretir.", ucret: "Görsel başına yaklaşık 4 sent, Google faturasından. Yazı işlerindeki ücretsiz anahtarlardan ayrı proje.", olmazsa: "Kıyas diğer modellerle sürer." },
  { id: "bfl", grup: "gorsel", logo: "bfl", ad: "Black Forest Labs · FLUX 3", ne: "Kıyasta görsel üretir (FLUX 3 Image, Klein)", anahtarlar: ["bfl"],
    neIcin: "Görsel model kıyası: FLUX'un en yeni nesli. Cloudflare'de olmadığı için kendi servisinden.", ucret: "Görsel başı Klein ~1 sent, Image ~5 sent; BFL kredisinden.", olmazsa: "Kıyas diğer modellerle sürer." },
  { id: "instagram", grup: "site", logo: "instagram", ad: "Instagram", ne: "Sitedeki Reels sütunu için son videoları çeker", anahtarlar: ["instagram"], eylem: "instagram",
    neIcin: "Sitedeki Reels sütunu. Anahtar yalnız okuma izni taşır, paylaşım yapamaz.", ucret: "Ücretsiz. Süresi 60 gün; sistem dolmadan kendisi yeniler.", olmazsa: "Reels sütunu YouTube kısa videolarını gösterir." },
  { id: "amazon", grup: "site", logo: "amazon", ad: "Amazon ortaklık", ne: "Ürün sayfasında Amazon Türkiye fiyatı ve bağlantısı", anahtarlar: ["amazon_kimlik", "amazon_gizli", "amazon_surum", "amazon_etiket"], eylem: "amazon",
    neIcin: "Günde iki kez çıkmış ürünlerin Amazon Türkiye fiyatını yeniler; eşleşmemiş ürünü arar, yapay zekâ tam modeli seçer. Sitede ürün sayfasında fiyat ve ortaklık bağlantısı.", ucret: "Ücretsiz (Amazon Ortaklık Programı). Eşleştirmede Claude Haiku ürün başına bir kez, kuruşluk.", olmazsa: "Ürün sayfasında Amazon kutusu görünmez." },
  { id: "brave", grup: "site", logo: "brave", ad: "Brave arama", ne: "Künye, resmî video ve haber içi resmî görsel araması", anahtarlar: ["brave_arama"], eylem: "brave",
    neIcin: "Künye otomasyonu ürünün resmî sayfasını bulur; taslakta resmî fragman ve yazı içi resmî görsel aranır.", ucret: "Ücretsiz planla; sistem ayda en çok 700 arama yapar (künye, video, görsel ortak).", olmazsa: "Künye otomasyonu özellikleri bulamaz." },
];
const ADLAR: Record<string, string> = { cloudflare_adres: "Programın adresi", cloudflare_anahtar: "Ortak şifre (ANAHTAR)",
  amazon_kimlik: "Credential ID", amazon_gizli: "Credential Secret", amazon_surum: "Version (boş bırakılabilir)", amazon_etiket: "Partner Tag (ör. updated-21)" };
const ACIK_DEGER = new Set(["amazon_surum", "amazon_etiket"]); // gizli olmayan kısa değerler
const ISTEGE_BAGLI = new Set(["amazon_surum"]); // girilmese de servis bağlı sayılır (sürüm kimlikten anlaşılır)
const kisaTarih = (s?: string) => (s ? new Date(s).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "");

export default function Baglantilar() {
  const toast = useToast();
  const [durum, setDurum] = useState<Record<string, Durum>>({});
  const [deger, setDeger] = useState<Record<string, string>>({});
  const [mesgul, setMesgul] = useState("");
  const [hata, setHata] = useState("");
  const [acik, setAcik] = useState("");
  const [sonuc, setSonuc] = useState<Record<string, { ok: boolean; uyari?: boolean; metin: string }>>({});
  const [gemini, setGemini] = useState<{ durum: string }[] | null>(null);

  const yukle = useCallback(async () => {
    const { data, error } = await sb.rpc("anahtar_durum");
    if (error) { setHata(error.message); return; }
    setHata(""); setDurum(Object.fromEntries(((data ?? []) as Durum[]).map((d) => [d.ad, d])));
    const { data: g } = await sb.rpc("gemini_liste");
    setGemini((g ?? []) as { durum: string }[]);
  }, []);
  useEffect(() => { yukle(); }, [yukle]);

  // Cloudflare adresi https://'siz ya da sonunda / ile yapıştırılırsa düzeltilir (28 Ekim 2026: 6. adımda takılındı)
  const duzelt = (ad: string, v: string) => { v = v.trim(); if (ad !== "cloudflare_adres") return v; const h = v.replace(/^https?:\/\//i, "").split("/")[0].trim(); return h ? "https://" + h : ""; };
  const sifreUret = () => { const a = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = new Uint32Array(40); crypto.getRandomValues(b); return Array.from(b, (x) => a[x % a.length]).join(""); };
  async function kaydet(ad: string, sil = false) {
    if (sil && !confirm("Anahtar silinsin mi? Bu bağlantıyı kullanan iş çalışmaz olur.")) return;
    if (!sil) setDeger((d) => ({ ...d, [ad]: duzelt(ad, d[ad] ?? "") }));
    const yanlis = !sil && bicimHatasi(ad, duzelt(ad, deger[ad] ?? ""));
    if (yanlis) { toast(yanlis); return; }
    setMesgul(ad);
    const { error } = await sb.rpc("anahtar_kaydet", { p_ad: ad, p_deger: sil ? "" : duzelt(ad, deger[ad] ?? "") });
    setMesgul("");
    if (error) { toast(error.message); return; }
    setDeger((d) => ({ ...d, [ad]: "" }));
    toast(sil ? "Anahtar silindi." : "Anahtar kaydedildi.");
    await yukle();
    if (!sil && ad === "instagram") await instagramCek();
  }
  async function instagramCek() {
    setMesgul("instagram-cek");
    const { data, error } = await sb.functions.invoke("instagram-reels", { body: {} });
    setMesgul("");
    if (error || (data as { hata?: string })?.hata) { setSonuc((s) => ({ ...s, instagram: { ok: false, metin: "Instagram'a bağlanılamadı: " + ((data as { hata?: string })?.hata ?? error?.message) } })); await yukle(); return; }
    setSonuc((s) => ({ ...s, instagram: { ok: true, metin: `${(data as { reels?: number }).reels ?? 0} Reels alındı; sitede bir sonraki yayında görünür.` } }));
    await yukle();
  }
  async function dene(s: Servis) {
    if (s.eylem === "instagram") return instagramCek();
    if (s.eylem === "gemini") { setAcik(acik === s.id ? "" : s.id); return; }
    if (s.eylem === "amazon") {
      setMesgul(s.id + "-dene");
      const { data, error } = await sb.functions.invoke("amazon-fiyat", { body: { dene: true } });
      setMesgul("");
      const a = (error ? { ok: false, mesaj: error.message } : data) as { ok?: boolean; mesaj?: string };
      setSonuc((x) => ({ ...x, amazon: { ok: !!a.ok, metin: a.mesaj ?? "Yanıt yok" } }));
      await yukle(); return;
    }
    setMesgul(s.id + "-dene");
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: s.eylem === "claude" ? { claude_dene: true } : s.eylem === "brave" ? { brave_dene: true } : { uret_dene: true } });
    setMesgul("");
    if (s.eylem === "brave") {
      const b = (error ? { hata: error.message } : data) as { ok?: boolean; hata?: string; web?: string; gorsel?: string; kullanim?: number; sinir?: number };
      setSonuc((x) => ({ ...x, brave: b.hata ? { ok: false, metin: b.hata } : { ok: !!b.ok, metin: `Web araması: ${b.web} · Görsel araması: ${b.gorsel} · Bu ay ${b.kullanim}/${b.sinir} arama` } }));
      return;
    }
    const r = (error ? { ok: false, hata: error.message } : data) as { ok?: boolean; pay?: boolean; hata?: string; model?: string; sure?: number };
    setSonuc((x) => ({ ...x, [s.id]: r.ok ? { ok: true, metin: `Çalışıyor: ${r.model} ${s.eylem === "claude" ? "yanıt verdi" : "ile görsel üretildi"} (${Math.round((r.sure ?? 0) / 100) / 10} sn).` } : { ok: false, uyari: !!r.pay, metin: r.hata ?? "Yanıt yok" } }));
  }

  // Durum: bütün anahtarları girilmişse bağlı; biri hata kaydı taşıyorsa sorunlu. Gemini havuzu: en az bir anahtar.
  const durumu = (s: Servis): "ok" | "yok" | "sorun" => {
    if (s.id === "gemini") return !gemini ? "yok" : !gemini.length ? "yok" : gemini.every((g) => g.durum === "gecersiz") ? "sorun" : "ok";
    if (s.anahtarlar.some((a) => durum[a]?.ek?.hata)) return "sorun";
    return s.anahtarlar.every((a) => durum[a] || ISTEGE_BAGLI.has(a)) ? "ok" : "yok";
  };
  const metaYaz = (s: Servis) => {
    if (s.id === "gemini") return gemini ? `${gemini.length} anahtar${gemini.filter((g) => g.durum === "kota_dolu").length ? ` · ${gemini.filter((g) => g.durum === "kota_dolu").length}'i kotada` : ""}` : "";
    const d = durum[s.anahtarlar[s.anahtarlar.length - 1]];
    if (!d) return "";
    if (s.id === "instagram") return [d.ek?.hesap && "@" + d.ek.hesap, d.ek?.bitis && kisaTarih(d.ek.bitis) + "'e kadar"].filter(Boolean).join(" · ");
    return `…${d.son4} · ${kisaTarih(d.updated_at)}`;
  };
  const bagli = SERVISLER.filter((s) => durumu(s) === "ok");
  const eksik = SERVISLER.filter((s) => durumu(s) !== "ok");
  const ETIKET = { ok: ["Bağlı", "ok"], yok: ["Girilmedi", "off"], sorun: ["Sorun var", "rose"] } as const;

  return (
    <section className="bg">
      <div>
        <h1 className="bg-h1">Bağlantı anahtarları</h1>
        <p className="bg-ozet"><b>{SERVISLER.length} servisten {bagli.length}'{bagli.length === 1 ? "i" : "ı"} bağlı.</b>{eksik.length ? ` Eksik ya da sorunlu: ${eksik.map((s) => s.ad).join(", ")}.` : " Hepsi bağlı."} Anahtarlar yalnız sunucuda saklanır, yalnız son 4 karakteri görünür.</p>
      </div>
      {hata && <div className="msg err">{hata}</div>}
      {GRUPLAR.map((g) => (
        <section key={g.id} className="bg-grup" aria-labelledby={"bg-" + g.id}>
          <div className="bg-grup-sol"><h2 id={"bg-" + g.id}>{g.ad}</h2><p>{g.ne}</p></div>
          <div className="bg-liste">
            {SERVISLER.filter((s) => s.grup === g.id).map((s) => {
              const dr = durumu(s), [etiket, renk] = ETIKET[dr], ac = acik === s.id, r = sonuc[s.id];
              const eylemAd = dr !== "ok" ? "Bağla" : s.eylem === "instagram" ? "Şimdi çek" : s.eylem === "gemini" ? "Yönet" : s.eylem ? "Dene" : "";
              return (
                <div key={s.id} className={"bg-srv" + (ac ? " acik" : "")}>
                  <div className="bg-bas">
                    <button type="button" className="bg-ac" aria-expanded={ac} onClick={() => setAcik(ac ? "" : s.id)}>
                      <Logo ad={s.logo} />
                      <span className="bg-ad"><b>{s.ad}</b><span>{s.ne}</span></span>
                      <span className="bg-durum"><span className={"pill " + renk}>{etiket}</span><span className="bg-meta">{metaYaz(s)}</span></span>
                    </button>
                    {eylemAd && <button type="button" className={"btn sm" + (dr === "ok" ? " ghost" : "")} disabled={mesgul.startsWith(s.id)} onClick={() => (dr === "ok" ? dene(s) : setAcik(s.id))}>{mesgul.startsWith(s.id) ? "Bekle…" : eylemAd}</button>}
                    <button type="button" className="bg-ok" aria-label={ac ? "Kapat" : "Aç"} onClick={() => setAcik(ac ? "" : s.id)}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg></button>
                  </div>
                  {r && <div className={"msg " + (r.ok ? "good" : r.uyari ? "" : "err") + " bg-sonuc"}>{r.metin}</div>}
                  {ac && (
                    <div className="bg-ic">
                      <div className="bg-sol">
                        {s.id === "gemini" ? <GeminiHavuzu gomulu /> : <>
                          {s.id === "cloudflare" && dr === "ok" && <CloudflareGuncelle />}
                          {s.anahtarlar.map((ad) => {
                            const d = durum[ad], adim = ANAHTARLAR.find((a) => a.ad === ad)?.adimlar ?? [];
                            return (
                              <div key={ad} className="bg-anahtar">
                                {adim.length > 0 && (d ? <details><summary>Kurulum adımları</summary><Adimlar adim={adim} /></details> : <Adimlar adim={adim} />)}
                                {d && <div className="muted bg-kayit">Kayıtlı: …{d.son4} · {tarih(d.updated_at)}{d.ek?.son_cekim ? ` · son çekim ${tarih(d.ek.son_cekim)}` : ""}</div>}
                                {d?.ek?.hata && <div className="msg err">{d.ek.hata}</div>}
                                <label>{ADLAR[ad] ?? (d ? "Yeni anahtar (eskisinin yerine geçer)" : "Anahtar")}
                                  <span className="bg-birlesik">
                                    <input type={ACIK_DEGER.has(ad) ? "text" : "password"} autoComplete="off" spellCheck={false} value={deger[ad] ?? ""} onChange={(e) => setDeger((x) => ({ ...x, [ad]: e.target.value }))} placeholder="Buraya yapıştır" />
                                    <button className="btn" disabled={!!mesgul || !(deger[ad] ?? "").trim()} onClick={() => kaydet(ad)}>{mesgul === ad ? "Kaydediliyor…" : "Kaydet"}</button>
                                  </span>
                                </label>
                                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                                  {ad === "cloudflare_anahtar" && !d && <button className="btn ghost sm" type="button" onClick={async () => { const v = sifreUret(); setDeger((x) => ({ ...x, [ad]: v })); try { await navigator.clipboard.writeText(v); toast("Şifre üretildi ve panoya kopyalandı: Cloudflare'de ANAHTAR değerine yapıştır, burada Kaydet'e bas."); } catch { toast("Şifre üretildi; kutudan kopyalayıp Cloudflare'de ANAHTAR değerine yapıştır, burada Kaydet'e bas."); } }}>Şifre üret</button>}
                                  {d && <button className="btn ghost sm" disabled={!!mesgul} onClick={() => kaydet(ad, true)}>Sil</button>}
                                </div>
                              </div>
                            );
                          })}
                          <p className="muted bg-not">Anahtar yalnız sunucuda saklanır; kaydedince bir daha gösterilmez. Sohbete yapıştırma.</p>
                        </>}
                      </div>
                      <dl className="bg-bilgi">
                        <div><dt>Ne için</dt><dd>{s.neIcin}</dd></div>
                        <div><dt>Ücret</dt><dd>{s.ucret}</dd></div>
                        <div><dt>Olmazsa</dt><dd>{s.olmazsa}</dd></div>
                      </dl>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}

function Adimlar({ adim }: { adim: { metin: string; link?: string }[] }) {
  return <ol className="bg-adim">{adim.map((s) => <li key={s.metin}>{s.metin}{s.link && <a href={s.link} target="_blank" rel="noopener noreferrer">aç ↗</a>}</li>)}</ol>;
}

// Cloudflare görsel programının güncellemesi (3 Kasım 2026): yapay zekâ ile görsel üretimi için yeni kod + "AI" bağlaması gerekir.
// Program zaten bağlı olduğu için kurulum adımları gizli; güncelleme adımları ve "Dene" burada.
function CloudflareGuncelle() {
  const toast = useToast();
  async function kopyala() {
    try { const k = await (await fetch("/cloudflare/gorsel-worker.js", { cache: "no-store" })).text(); await navigator.clipboard.writeText(k); toast("Program kodu panoya kopyalandı."); }
    catch { toast("Kopyalanamadı; \"Kodu aç\" ile açıp elle kopyala."); }
  }
  return (
    <div className="msg" style={{ display: "grid", gap: 6 }}>
      <b>Güncelleme: yapay zekâ ile görsel üretimi</b><span className="muted">Satırdaki "Dene" çalışıyorsa güncelleme yapılmış demektir.</span>
      <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
        <li>Cloudflare'de <b>Workers &amp; Pages → updated-gorsel → Edit code</b> · <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer">aç</a></li>
        <li>Soldaki kodun tamamını sil; aşağıdaki "Kodu kopyala" ile yeni kodu kopyalayıp yapıştır → <b>Deploy</b></li>
        <li>Programın sayfasında <b>Settings → Bindings → Add binding → Workers AI</b> → Variable name: <b>AI</b> → Add Binding</li>
        <li>Satırdaki "Dene"ye bas</li>
      </ol>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn ghost sm" onClick={kopyala}>Kodu kopyala</button>
        <a className="btn ghost sm" href="/cloudflare/gorsel-worker.js" target="_blank" rel="noopener noreferrer">Kodu aç</a>
      </div>
    </div>
  );
}
