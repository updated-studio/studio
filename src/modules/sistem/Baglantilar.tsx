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
import { Ikon } from "../../shared/Ikon";
import GeminiHavuzu from "./GeminiHavuzu";

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
    ad: "gemini_gorsel", baslik: "Google görsel anahtarı (Nano Banana, görsel kıyası)", ikon: "foto",
    aciklama: "Nano Banana görsel üretimi ücretsiz Gemini kotasında yok; faturalandırması açık AYRI bir Google projesinden anahtar gerekir (yazı işlerinde kullandığımız ücretsiz anahtarlar ücretsiz kalsın diye). Görsel başına yaklaşık 4 sent.",
    adimlar: [
      { metin: "Google AI Studio'da anahtar sayfasını aç → \"Create API key\" → \"Create API key in new project\"", link: "https://aistudio.google.com/apikey" },
      { metin: "Yeni anahtarın satırında \"Set up billing\" (Faturalandırmayı ayarla) → kartını ekle. Google Cloud'da Bütçe ve uyarılar bölümünden aylık sınır koyabilirsin" },
      { metin: "Anahtarı kopyala, aşağıya yapıştır → Kaydet. Ücretsiz Gemini anahtarlarını buraya girme" },
    ],
  },
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
  return "";
}

export default function Baglantilar() {
  const toast = useToast();
  const [durum, setDurum] = useState<Record<string, Durum>>({});
  const [deger, setDeger] = useState<Record<string, string>>({});
  const [mesgul, setMesgul] = useState("");
  const [hata, setHata] = useState("");

  const yukle = useCallback(async () => {
    const { data, error } = await sb.rpc("anahtar_durum");
    if (error) { setHata(error.message); return; }
    setHata(""); setDurum(Object.fromEntries(((data ?? []) as Durum[]).map((d) => [d.ad, d])));
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
    setMesgul("instagram");
    const { data, error } = await sb.functions.invoke("instagram-reels", { body: {} });
    setMesgul("");
    if (error || (data as { hata?: string })?.hata) { toast("Instagram'a bağlanılamadı: " + ((data as { hata?: string })?.hata ?? error?.message)); await yukle(); return; }
    toast(`Instagram bağlandı: ${(data as { reels?: number }).reels ?? 0} Reels alındı. Sitede bir sonraki yayında görünür.`);
    await yukle();
  }

  return (
    <section className="panel">
      <h2>Bağlantı anahtarları</h2>
      <div className="muted">Dış servislerin anahtarları burada girilir ve yalnız sunucuda saklanır. Kaydettikten sonra anahtarın kendisi bir daha görünmez; yalnız son 4 karakteri ve tarihi görünür.</div>
      {hata && <div className="msg err">{hata}</div>}
      <GeminiHavuzu />
      {ANAHTARLAR.map((a) => {
        const d = durum[a.ad];
        return (
          <div key={a.ad} className="panel" style={{ marginTop: 4, gap: 10 }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Ikon ad={a.ikon} /> {a.baslik}</h3>
              <span className={"pill " + (d ? (d.ek?.hata ? "rose" : "ok") : "wait")}>{d ? (d.ek?.hata ? "Sorun var" : "Bağlı") : "Girilmedi"}</span>
            </div>
            <div className="muted">{a.aciklama}</div>
            {d && <div className="muted">Son 4 karakter: <b>…{d.son4}</b> · kaydedildi {tarih(d.updated_at)}
              {d.ek?.hesap ? ` · hesap @${d.ek.hesap}` : ""}{d.ek?.bitis ? ` · geçerli: ${tarih(d.ek.bitis)}` : ""}{d.ek?.son_cekim ? ` · son çekim ${tarih(d.ek.son_cekim)}` : ""}
              {d.ek?.hata ? <div className="msg err" style={{ marginTop: 6 }}>{d.ek.hata}</div> : null}</div>}
            {a.ad === "cloudflare_adres" && d && <CloudflareGuncelle />}
            {a.ad === "claude" && d && <ClaudeDene />}
            {(!d || d.ek?.hata) && <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
              {a.adimlar.map((s) => <li key={s.metin}>{s.metin}{s.link && <> · <a href={s.link} target="_blank" rel="noopener noreferrer">aç</a></>}</li>)}
            </ol>}
            <label>{d ? "Yeni anahtar (eskisinin yerine geçer)" : "Anahtar"}
              <input type="password" autoComplete="off" spellCheck={false} value={deger[a.ad] ?? ""} onChange={(e) => setDeger((x) => ({ ...x, [a.ad]: e.target.value }))} placeholder="Buraya yapıştır" />
            </label>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn sm" disabled={!!mesgul || !(deger[a.ad] ?? "").trim()} onClick={() => kaydet(a.ad)}>{mesgul === a.ad ? "Kaydediliyor…" : "Kaydet"}</button>
              {a.ad === "cloudflare_anahtar" && !d && <button className="btn ghost sm" type="button" onClick={async () => { const s = sifreUret(); setDeger((x) => ({ ...x, [a.ad]: s })); try { await navigator.clipboard.writeText(s); toast("Şifre üretildi ve panoya kopyalandı: Cloudflare'de ANAHTAR değerine yapıştır, burada Kaydet'e bas."); } catch { toast("Şifre üretildi; kutudan kopyalayıp Cloudflare'de ANAHTAR değerine yapıştır, burada Kaydet'e bas."); } }}>Şifre üret</button>}
              {d && a.ad === "instagram" && <button className="btn ghost sm" disabled={!!mesgul} onClick={instagramCek}>Reels'leri şimdi çek</button>}
              {d && <button className="btn ghost sm" disabled={!!mesgul} onClick={() => kaydet(a.ad, true)}>Sil</button>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// Cloudflare görsel programının güncellemesi (3 Kasım 2026): yapay zekâ ile görsel üretimi için yeni kod + "AI" bağlaması gerekir.
// Program zaten bağlı olduğu için kurulum adımları gizli; güncelleme adımları ve "Dene" burada.
function CloudflareGuncelle() {
  const toast = useToast();
  const [sonuc, setSonuc] = useState<{ ok?: boolean; hata?: string; model?: string; sure?: number } | null>(null);
  const [mesgul, setMesgul] = useState(false);
  async function kopyala() {
    try { const k = await (await fetch("/cloudflare/gorsel-worker.js", { cache: "no-store" })).text(); await navigator.clipboard.writeText(k); toast("Program kodu panoya kopyalandı."); }
    catch { toast("Kopyalanamadı; \"Kodu aç\" ile açıp elle kopyala."); }
  }
  async function dene() {
    setMesgul(true); setSonuc(null);
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { uret_dene: true } });
    setMesgul(false);
    setSonuc(error ? { hata: error.message } : (data as typeof sonuc));
  }
  return (
    <div className="msg" style={{ display: "grid", gap: 6 }}>
      <b>Güncelleme: yapay zekâ ile görsel üretimi</b>
      <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
        <li>Cloudflare'de <b>Workers &amp; Pages → updated-gorsel → Edit code</b> · <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer">aç</a></li>
        <li>Soldaki kodun tamamını sil; aşağıdaki "Kodu kopyala" ile yeni kodu kopyalayıp yapıştır → <b>Deploy</b></li>
        <li>Programın sayfasında <b>Settings → Bindings → Add binding → Workers AI</b> → Variable name: <b>AI</b> → Add Binding</li>
        <li>Buradan "Dene"ye bas</li>
      </ol>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn ghost sm" onClick={kopyala}>Kodu kopyala</button>
        <a className="btn ghost sm" href="/cloudflare/gorsel-worker.js" target="_blank" rel="noopener noreferrer">Kodu aç</a>
        <button type="button" className="btn sm" disabled={mesgul} onClick={dene}>{mesgul ? "Görsel üretiliyor…" : "Dene"}</button>
      </div>
      {sonuc && (sonuc.ok ? <div className="msg good">Çalışıyor: {sonuc.model} ile görsel üretildi ({Math.round((sonuc.sure ?? 0) / 1000)} sn).</div> : <div className="msg err">{sonuc.hata}</div>)}
    </div>
  );
}

// Claude anahtarını dene (3 Kasım 2026): en küçük modelle tek kısa istek; kredi, anahtar ya da bağlantı sorununu söyler
function ClaudeDene() {
  const [sonuc, setSonuc] = useState<{ ok?: boolean; hata?: string; model?: string; sure?: number } | null>(null);
  const [mesgul, setMesgul] = useState(false);
  async function dene() {
    setMesgul(true); setSonuc(null);
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { claude_dene: true } });
    setMesgul(false);
    setSonuc(error ? { hata: error.message } : (data as typeof sonuc));
  }
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="btn sm" disabled={mesgul} onClick={dene}>{mesgul ? "Deneniyor…" : "Dene"}</button>
      {sonuc && (sonuc.ok ? <span className="msg good">Çalışıyor: {sonuc.model} yanıt verdi ({Math.round((sonuc.sure ?? 0) / 100) / 10} sn).</span> : <span className="msg err">{sonuc.hata}</span>)}
    </div>
  );
}
